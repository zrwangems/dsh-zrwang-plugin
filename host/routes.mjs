/**
 * 宿主 HTTP 接口，全部挂在 /dsh-zrwang-plugin 前缀下。
 *
 * 每个请求先过同源栅栏；返回统一 JSON：成功 {ok:true,...}，失败 {ok:false,error}。
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { ROUTE_PREFIX, SKILLS_DIR, STATE_DIR, VERSION } from './config.mjs'
import { catalogView, loadCatalog } from './catalog.mjs'
import { reconcile, readLinks } from './farm.mjs'
import { resolveProjectRoot } from './project.mjs'
import { childBatch, desiredSkills, groupCounts, loadSelection, resetGroup, setSelection } from './selection.mjs'
import { applyMode, applyModeContent, cloneMode, deleteMode, ensureEditableMode, loadPresets, presetsPayload, renameMode, saveActiveMode, activeModeContent } from './presets.mjs'
import { ensureSession } from './sessions.mjs'
import { loadGates, setGates } from './gates.mjs'
import { blockedSkills, applySkillEnv, checkArsDependencies, currentParams, openConfigTarget, saveSettingsCard, settingsCards } from './skill-settings.mjs'
import { configDirOfParams } from './plugin-params.mjs'
import { loadArsManifest, mergeArsSkills } from './ars.mjs'
import { arsUsageDoc, arsCommandCount, syncArsCommands } from './ars-commands.mjs'
import { appendEvent, readEvents } from './state.mjs'
import { loadUi, saveExpanded } from './ui-state.mjs'
import { skillDoc } from './skill-doc.mjs'

const BODY_LIMIT = 1024 * 1024

function refusalOf(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection === 'function') return connection.requestRejection(req)
  const host = req.headers.host
  if (host !== undefined) {
    if (!URL.canParse(`http://${host}`)) return 403
    const name = new URL(`http://${host}`).hostname
    if (name !== 'localhost' && name !== '[::1]' && !/^127\.\d+\.\d+\.\d+$/.test(name)) return 403
  }
  const site = req.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return 403
  const origin = req.headers.origin
  if (origin === undefined) return undefined
  if (!URL.canParse(origin)) return 403
  return new URL(origin).hostname === (host === undefined ? '' : new URL(`http://${host}`).hostname) ? undefined : 403
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > BODY_LIMIT) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function resolveCwd(ctx, sessionId, provided) {
  if (typeof provided === 'string' && provided.length > 0) return provided
  try {
    const agents = ctx.get('agents')
    const agent = typeof agents?.get === 'function' ? agents.get(sessionId) : undefined
    if (agent !== undefined) {
      const wd = ctx.get('workingDirectory')
      const dir = typeof wd?.get === 'function' ? wd.get(agent.session) : undefined
      if (typeof dir === 'string' && dir.length > 0) return dir
      const headerCwd = agent.session?.header?.cwd ?? agent.session?.header?.workingDirectory
      if (typeof headerCwd === 'string' && headerCwd.length > 0) return headerCwd
    }
  } catch {
    // 服务缺失时退回客户端 cwd
  }
  return undefined
}

function groupHasSkill(catalog, groupId, name) {
  const group = catalog.groups.find(item => item.id === groupId)
  if (group === undefined) return false
  const walk = node => {
    if (node.kind === 'skill') return node.name === name
    return (node.children ?? []).some(walk)
  }
  return walk(group)
}

function groupStats(catalog, selection, desired, gates, blocked) {
  return Object.fromEntries(catalog.groups.map(group => {
    const counts = groupCounts(catalog, selection, group.id)
    const injected = [...desired.keys()].filter(name => groupHasSkill(catalog, group.id, name)).length
    const blockedCount = Object.keys(blocked).filter(name => groupHasSkill(catalog, group.id, name)).length
    return [group.id, { ...counts, injected, enabled: gates[group.id] === true, blocked: blockedCount }]
  }))
}

export function registerRoutes(scope, ctx, pluginConfig) {
  const webServer = scope.webServer ?? scope.get?.('webServer')

  /**
   * 把某个对话的活跃模式内容同步到全局 selection / gates。
   * 侧栏的分组门禁、勾选都读全局状态，所以每次读写都先按当前对话的模式对齐，
   * 避免 A 对话的模式影响 B 对话的显示。
   */
  async function activateMode(catalog, projectRoot, sessionId) {
    const selection = await loadSelection(catalog)
    const gates = await loadGates()
    await loadPresets(catalog, selection, gates, projectRoot)
    const active = await activeModeContent(catalog, selection, gates, projectRoot, sessionId)
    if (active.content !== undefined) await applyModeContent(catalog, active.content)
    return { selection: await loadSelection(catalog), gates: await loadGates(), active }
  }

  async function syncState(sessionId, cwd, includeCatalog = true) {
    const catalog = await loadCatalog()
    const resolved = resolveCwd(ctx, sessionId, cwd)
    if (resolved === undefined) throw new Error('无法解析会话工作目录，请从已打开的会话里使用')
    const projectRoot = resolveProjectRoot(resolved)
    const session = await ensureSession(sessionId, projectRoot)
    const { selection, gates } = await activateMode(catalog, projectRoot, sessionId)
    // ARS 是固定功能区块：作为技能树里的第四行，由模式里的 gates.ars 控制
    syncArsCommands(gates.ars === true)
    const params = currentParams(pluginConfig)
    const blocked = await blockedSkills(catalog, params)
    const desired = desiredSkills(catalog, selection, gates, blocked)
    // ARS 是固定功能区块：作为技能树里的第四行，由会话/目录门禁 gates.ars 控制，默认开。
    const ars = loadArsManifest()
    const arsEnabled = gates.ars === true
    mergeArsSkills(desired, arsEnabled)
    const status = await reconcile({ projectRoot, desired })
    // 注入集合变化后通知客户端：DSH 的技能目录（`/` 菜单）按会话缓存，
    // 只在这类变更事件后才会重新拉取，否则新勾选的技能不会出现在斜杠菜单里。
    if (status.added > 0 || status.removed > 0 || status.retargeted > 0) {
      try {
        ctx.emit('plugin-manager/changed', { reason: 'plugin' })
      } catch {
        // 没有远程事件通道时忽略，客户端下次刷新页面仍会更新
      }
    }
    const payload = {
      ok: true,
      version: VERSION,
      selection: selection.skills,
      blocked,
      session: { sessionId, projectRoot, gates },
      project: {
        root: projectRoot,
        skillsRoot: status.skillsDir,
        pptProjects: status.pptProjects,
      },
      links: {
        count: status.linked.length,
        names: status.linked,
        added: status.added,
        removed: status.removed,
        retargeted: status.retargeted,
        kept: status.kept,
        conflicts: status.conflicts,
      },
      ars: ars === undefined ? undefined : {
        label: ars.label,
        license: ars.license,
        enabled: arsEnabled,
        skillCount: (ars.skills ?? []).length,
        commandCount: (ars.commands ?? []).length,
        injected: (ars.skills ?? []).filter(skill => status.linked.includes(skill.name)).length,
        repo: ars.upstream,
      },
      groups: groupStats(catalog, selection, desired, gates, blocked),
      presets: presetsPayload(catalog, blocked, projectRoot, sessionId),
      ui: await loadUi(),
    }
    if (includeCatalog) payload.catalog = catalogView(catalog)
    return payload
  }

  const handlers = {
    'GET /catalog': async query => {
      const sessionId = query.get('sessionId')
      if (sessionId === null || sessionId.length === 0) throw new Error('缺少 sessionId')
      return syncState(sessionId, query.get('cwd') ?? undefined)
    },
    'POST /session': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const resolved = resolveCwd(ctx, body.sessionId, body.cwd)
      if (resolved === undefined) throw new Error('无法解析会话工作目录')
      const projectRoot = resolveProjectRoot(resolved)
      await ensureSession(body.sessionId, projectRoot)
      const live = await activateMode(catalog, projectRoot, body.sessionId)
      // 在「默认」上改任何门禁 → 先为当前对话派生「未命名」，改动落到未命名里
      await ensureEditableMode(catalog, live.selection, live.gates, projectRoot, body.sessionId)
      const patch = body.gates ?? Object.fromEntries(Object.entries(body.categories ?? {}))
      const nextGates = await setGates(patch)
      await saveActiveMode(catalog, await loadSelection(catalog), nextGates, projectRoot, body.sessionId)
      // ARS 开/关同时决定 16 个 /ars-* 命令是否出现在斜杠菜单里。
      syncArsCommands(nextGates.ars === true)
      return syncState(body.sessionId, body.cwd, false)
    },
    'POST /ui': async body => {
      const expanded = body.expanded ?? {}
      const ui = await saveExpanded(expanded)
      return { ok: true, ui }
    },
    'GET /doc': async query => {
      const name = query.get('name')
      if (name === null || name.length === 0) throw new Error('缺少 name')
      const catalog = await loadCatalog()
      return skillDoc(ctx, catalog, name)
    },
    'GET /ars/doc': async () => {
      const text = arsUsageDoc()
      if (text === undefined) throw new Error('ARS 用法文档缺失')
      const ars = loadArsManifest()
      return { ok: true, title: ars?.label ?? '学术研究（ARS）', text }
    },
    'POST /selection': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const names = new Set(Object.keys(catalog.skills))
      const changes = {}
      for (const [name, value] of Object.entries(body.changes ?? {})) {
        if (names.has(name) && typeof value === 'boolean') changes[name] = value
      }
      if (Object.keys(changes).length === 0) throw new Error('没有可应用的选择变更')
      const resolved = resolveCwd(ctx, body.sessionId, body.cwd)
      if (resolved === undefined) throw new Error('无法解析会话工作目录')
      const projectRoot = resolveProjectRoot(resolved)
      const live = await activateMode(catalog, projectRoot, body.sessionId)
      await ensureEditableMode(catalog, live.selection, live.gates, projectRoot, body.sessionId)
      await setSelection(changes)
      await saveActiveMode(catalog, await loadSelection(catalog), live.gates, projectRoot, body.sessionId)
      return syncState(body.sessionId, body.cwd, false)
    },
    'POST /children': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const nodeId = typeof body.nodeId === 'string' ? body.nodeId : ''
      const value = body.value === true
      const { skillChanges, gates } = childBatch(catalog, nodeId, value)
      const resolved = resolveCwd(ctx, body.sessionId, body.cwd)
      if (resolved === undefined) throw new Error('无法解析会话工作目录')
      const projectRoot = resolveProjectRoot(resolved)
      const live = await activateMode(catalog, projectRoot, body.sessionId)
      await ensureEditableMode(catalog, live.selection, live.gates, projectRoot, body.sessionId)
      const params = currentParams(pluginConfig)
      const blocked = await blockedSkills(catalog, params)
      const changes = Object.fromEntries(Object.entries(skillChanges).filter(([name]) => blocked[name] === undefined))
      if (Object.keys(changes).length > 0) await setSelection(changes)
      const nextGates = Object.keys(gates).length > 0 ? await setGates(gates) : live.gates
      await saveActiveMode(catalog, await loadSelection(catalog), nextGates, projectRoot, body.sessionId)
      syncArsCommands(nextGates.ars === true)
      return syncState(body.sessionId, body.cwd, false)
    },
    'POST /reset': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const group = catalog.groups.find(item => item.id === body.group)
      if (group === undefined) throw new Error(`未知一级目录：${body.group}`)
      const resolved = resolveCwd(ctx, body.sessionId, body.cwd)
      if (resolved === undefined) throw new Error('无法解析会话工作目录')
      const projectRoot = resolveProjectRoot(resolved)
      const live = await activateMode(catalog, projectRoot, body.sessionId)
      await ensureEditableMode(catalog, live.selection, live.gates, projectRoot, body.sessionId)
      await resetGroup(catalog, group.id)
      await saveActiveMode(catalog, await loadSelection(catalog), live.gates, projectRoot, body.sessionId)
      return syncState(body.sessionId, body.cwd, false)
    },
    'POST /presets': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const resolved = resolveCwd(ctx, body.sessionId, body.cwd)
      if (resolved === undefined) throw new Error('无法解析会话工作目录')
      const projectRoot = resolveProjectRoot(resolved)
      const live = await activateMode(catalog, projectRoot, body.sessionId)
      const gates = live.gates
      const action = typeof body.action === 'string' ? body.action : ''
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (action === 'apply') await applyMode(catalog, selection, gates, projectRoot, body.sessionId, name)
      else if (action === 'create-from') await cloneMode(catalog, selection, gates, projectRoot, body.sessionId, name)
      else if (action === 'rename') await renameMode(catalog, selection, gates, projectRoot, body.sessionId, name, body.newName)
      else if (action === 'delete') await deleteMode(catalog, selection, gates, projectRoot, body.sessionId, name)
      else throw new Error(`未知的选择态操作：${action}`)
      const gatesAfter = await loadGates()
      syncArsCommands(gatesAfter.ars === true)
      return syncState(body.sessionId, body.cwd, false)
    },
    'POST /open-url': async body => {
      const url = typeof body.url === 'string' ? body.url.trim() : ''
      if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url)) throw new Error('只允许打开 GitHub 仓库页面')
      const child = process.platform === 'win32'
        ? spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
        : spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
      child.unref()
      await appendEvent('open-repo', { url })
      return { ok: true, url }
    },
    'POST /resync': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      return syncState(body.sessionId, body.cwd, false)
    },
    'GET /settings': async () => {
      const catalog = await loadCatalog()
      const params = currentParams(pluginConfig)
      const payload = await settingsCards(catalog, params)
      return { ok: true, ...payload }
    },
    'POST /settings': async body => {
      const catalog = await loadCatalog()
      if (body.action === 'open-dir') {
        const target = typeof body.target === 'string' ? body.target : undefined
        const result = openConfigTarget(configDirOfParams(currentParams(pluginConfig)), target)
        await appendEvent('open-config-dir', { target: result.path })
        return { ok: true, ...result }
      }
      if (body.action === 'ars-check-deps') {
        const result = await checkArsDependencies(pluginConfig)
        await appendEvent('ars-check-deps', { ok: result.ok, missing: result.missing })
        return { ok: true, check: result, settings: await settingsCards(catalog, currentParams(pluginConfig)) }
      }
      const backups = await saveSettingsCard(catalog, pluginConfig, body)
      applySkillEnv(currentParams(pluginConfig))
      await appendEvent('settings-saved', { cardId: body.cardId })
      return { ok: true, backups, settings: await settingsCards(catalog, currentParams(pluginConfig)) }
    },
    'POST /event': async body => {
      const kind = typeof body.kind === 'string' ? body.kind : 'unknown'
      await appendEvent(kind, { sessionId: body.sessionId ?? null, detail: body.detail ?? null })
      return { ok: true }
    },
    'GET /health': async () => {
      const catalog = await loadCatalog()
      const links = await readLinks()
      return {
        ok: true,
        version: VERSION,
        packageDir: join(SKILLS_DIR, '..'),
        stateDir: STATE_DIR,
        configDir: configDirOfParams(currentParams(pluginConfig)),
        catalog: { total: catalog.stats.total, defaults: catalog.stats.defaults, generatedAt: catalog.generatedAt },
        arsCommands: arsCommandCount(),
        projects: Object.keys(links.projects ?? {}).length,
        events: await readEvents(10),
      }
    },
  }

  const disposer = webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: (req, res) => {
      void (async () => {
        const refused = refusalOf(ctx, req)
        if (refused !== undefined) {
          sendJson(res, refused, { ok: false, error: refused === 401 ? 'unauthorized' : 'forbidden' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://x')
        const path = url.pathname.slice(ROUTE_PREFIX.length)
        const key = `${req.method} ${path}`
        const handler = handlers[key]
        if (handler === undefined) {
          sendJson(res, 404, { ok: false, error: `未知接口：${key}` })
          return
        }
        try {
          const result = req.method === 'POST' ? await handler(await readBody(req)) : await handler(url.searchParams)
          sendJson(res, 200, result)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
        }
      })()
    },
  })
  return disposer
}
