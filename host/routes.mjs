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
import { ancestorDirIdsOfSkill, buildEffectiveGates, childBatch, desiredSkills, groupCounts, loadSelection, resetGroup, setSelection } from './selection.mjs'
import { presetsPayload, loadPresets, applyMode, applyModeContent, cloneMode, deleteMode, ensureEditableMode, renameMode, saveActiveMode, saveMode, activeModeContent } from './presets.mjs'
import { clearGates, loadGates, normalizeGates, setGates } from './gates.mjs'
import { blockedSkills, applySkillEnv, checkArsDependencies, currentParams, openConfigTarget, runSettingCheck, saveSettingsCard, settingsCards } from './skill-settings.mjs'
import { cacheRoot, persistParams } from './plugin-params.mjs'
import { loadArsManifest, mergeArsSkills } from './ars.mjs'
import { componentViews, SERVER_NAMES, wantOf } from './mcp.mjs'
import { arsUsageDoc, arsCommandCount, syncArsCommands } from './ars-commands.mjs'
import { appendEvent, readEvents } from './state.mjs'
import { loadUi, saveExpanded } from './ui-state.mjs'
import { skillDoc } from './skill-doc.mjs'
import { resolveWorkspace, workspaceView } from './workspaces.mjs'

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

export function registerRoutes(scope, ctx, pluginConfig, mcpController, refreshParams) {
  /** 设置页展示 MCP 组件状态用；headless/sdk 没有 mcpManager 时给不可用。 */
  const mcpStatusOf = () => (mcpController === undefined ? { available: false, servers: [] } : mcpController.status())
  const webServer = scope.webServer ?? scope.get?.('webServer')
  /**
   * 设置页冷启动要做组件检测（Python、officecli、zotero-cli、draw.io、MATLAB 等），
   * 首次可能超过十秒。这里按参数快照缓存一小段时间，避免同一次打开重复付这份成本。
   */
  let settingsCache
  const SETTINGS_CACHE_MS = 10_000

  /**
   * 读取当前工作区的活跃模式。
   * persist=true 时把模式内容写回全局 selection / gates（用户改动前的对齐）；
   * persist=false（/catalog、/resync 等只读请求）时只在内存里算出同样的视图，
   * 不覆盖全局状态，避免后台轮询把刚落下的勾选写回旧值。
   */
  async function modeState(catalog, projectRoot, workspace, persist) {
    const selection = await loadSelection(catalog)
    const gates = await loadGates()
    await loadPresets(catalog, selection, gates, projectRoot)
    const active = await activeModeContent(catalog, selection, gates, projectRoot, workspace, workspace.sessionId)
    if (active.content === undefined) return { selection, gates, active }
    if (persist === true) {
      await applyModeContent(catalog, active.content)
      return { selection: await loadSelection(catalog), gates: await loadGates(), active }
    }
    const skills = {}
    for (const name of Object.keys(catalog.skills)) {
      skills[name] = active.content.selection?.[name] === true
    }
    return { selection: { ...selection, skills }, gates: normalizeGates(active.content.gates), active }
  }

  async function activateMode(catalog, projectRoot, workspace) {
    return modeState(catalog, projectRoot, workspace, true)
  }

  /** 会话 → 项目根 → DSH 工作区，统一入口。 */
  async function contextOf(sessionId, cwd) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('缺少 sessionId')
    const resolved = resolveCwd(ctx, sessionId, cwd)
    if (resolved === undefined) throw new Error('无法解析会话工作目录，请从已打开的会话里使用')
    const projectRoot = resolveProjectRoot(resolved)
    const workspace = await resolveWorkspace(ctx, sessionId, resolved, projectRoot)
    return { sessionId, cwd: resolved, projectRoot, workspace: { ...workspace, sessionId } }
  }

  /** 勾选变化后，把受影响的目录显式门禁清掉，让它们回到“按勾选推导”。 */
  async function resetDerivedGatesForSkills(catalog, names) {
    if (names.length === 0) return
    const ids = new Set()
    for (const name of names) {
      for (const id of ancestorDirIdsOfSkill(catalog, name)) ids.add(id)
    }
    if (ids.size > 0) await clearGates([...ids])
  }

  async function syncState(sessionId, cwd, includeCatalog = true, persist = true) {
    const catalog = await loadCatalog()
    const scope = await contextOf(sessionId, cwd)
    const { projectRoot, workspace } = scope
    const { selection, gates } = await modeState(catalog, projectRoot, workspace, persist)
    // ARS 是固定功能区块：作为技能树里的第四行，由模式里的 gates.ars 控制
    syncArsCommands(gates.ars === true)
    const params = currentParams(pluginConfig)
    const blocked = await blockedSkills(catalog, params)
    const desired = desiredSkills(catalog, selection, gates, blocked)
    // MCP 组件：MathWorks 随「工程技能组开启 + 确有工程技能注入」自动开关；Windows MCP 手动。
    const engineeringInjected = [...desired.keys()].filter(name => groupHasSkill(catalog, 'engineering', name)).length
    if (mcpController !== undefined) await mcpController.reconcile(wantOf({ engineeringInjected, gates }), { sessionId })
    const mcpStatus = mcpController === undefined ? { available: false, servers: [] } : mcpController.status()
    const components = componentViews({ engineeringInjected, gates, status: mcpStatus })
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
      session: { sessionId, projectRoot, gates: buildEffectiveGates(catalog, gates, selection), workspace: workspaceView(workspace) },
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
      components: components.components,
      mcp: { available: mcpStatus.available === true, servers: mcpStatus.servers ?? [] },
      presets: presetsPayload(catalog, blocked, projectRoot, workspace),
      ui: await loadUi(),
    }
    if (includeCatalog) payload.catalog = catalogView(catalog)
    return payload
  }

  const handlers = {
    'GET /catalog': async query => {
      const sessionId = query.get('sessionId')
      if (sessionId === null || sessionId.length === 0) throw new Error('缺少 sessionId')
      return syncState(sessionId, query.get('cwd') ?? undefined, true, false)
    },
    'POST /session': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const scope = await contextOf(body.sessionId, body.cwd)
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const live = await activateMode(catalog, scope.projectRoot, scope.workspace)
      // 在「默认」上改任何门禁 → 先为当前工作区建立（或复用）以工作区命名的模式
      await ensureEditableMode(catalog, live.selection, live.gates, scope.projectRoot, scope.workspace)
      const patch = body.gates ?? Object.fromEntries(Object.entries(body.categories ?? {}))
      const nextGates = await setGates(patch)
      await saveActiveMode(catalog, await loadSelection(catalog), nextGates, scope.projectRoot, scope.workspace)
      // ARS 开/关同时决定 16 个 /ars-* 命令是否出现在斜杠菜单里。
      syncArsCommands(nextGates.ars === true)
      return syncState(scope.sessionId, body.cwd, false)
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
      const scope = await contextOf(body.sessionId, body.cwd)
      const live = await activateMode(catalog, scope.projectRoot, scope.workspace)
      await ensureEditableMode(catalog, live.selection, live.gates, scope.projectRoot, scope.workspace)
      await setSelection(changes)
      await resetDerivedGatesForSkills(catalog, Object.keys(changes))
      await saveActiveMode(catalog, await loadSelection(catalog), await loadGates(), scope.projectRoot, scope.workspace)
      return syncState(scope.sessionId, body.cwd, false)
    },
    'POST /children': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const nodeId = typeof body.nodeId === 'string' ? body.nodeId : ''
      const value = body.value === true
      // 搜索过滤时客户端只传可见子节点，避免“全选”把没显示出来的子项也改掉。
      const only = Array.isArray(body.only) ? body.only.filter(item => typeof item === 'string') : undefined
      const { skillChanges, gates } = childBatch(catalog, nodeId, value, { only })
      const scope = await contextOf(body.sessionId, body.cwd)
      const live = await activateMode(catalog, scope.projectRoot, scope.workspace)
      await ensureEditableMode(catalog, live.selection, live.gates, scope.projectRoot, scope.workspace)
      const params = currentParams(pluginConfig)
      const blocked = await blockedSkills(catalog, params)
      const changes = Object.fromEntries(Object.entries(skillChanges).filter(([name]) => blocked[name] === undefined))
      if (Object.keys(changes).length > 0) await setSelection(changes)
      await resetDerivedGatesForSkills(catalog, Object.keys(changes))
      const nextGates = Object.keys(gates).length > 0 ? await setGates(gates) : await loadGates()
      await saveActiveMode(catalog, await loadSelection(catalog), nextGates, scope.projectRoot, scope.workspace)
      syncArsCommands(nextGates.ars === true)
      return syncState(scope.sessionId, body.cwd, false)
    },
    'POST /reset': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const group = catalog.groups.find(item => item.id === body.group)
      if (group === undefined) throw new Error(`未知一级目录：${body.group}`)
      const scope = await contextOf(body.sessionId, body.cwd)
      const live = await activateMode(catalog, scope.projectRoot, scope.workspace)
      await ensureEditableMode(catalog, live.selection, live.gates, scope.projectRoot, scope.workspace)
      const changedNames = await resetGroup(catalog, group.id)
      await resetDerivedGatesForSkills(catalog, changedNames)
      await saveActiveMode(catalog, await loadSelection(catalog), await loadGates(), scope.projectRoot, scope.workspace)
      return syncState(scope.sessionId, body.cwd, false)
    },
    'POST /presets': async body => {
      const scope = await contextOf(body.sessionId, body.cwd)
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const live = await activateMode(catalog, scope.projectRoot, scope.workspace)
      const gates = live.gates
      const action = typeof body.action === 'string' ? body.action : ''
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      try {
        if (action === 'apply') await applyMode(catalog, selection, gates, scope.projectRoot, scope.workspace, name)
        else if (action === 'create-from') await cloneMode(catalog, selection, gates, scope.projectRoot, scope.workspace, name)
        else if (action === 'save') await saveMode(catalog, selection, gates, scope.projectRoot, scope.workspace, name, body.newName)
        else if (action === 'rename') await renameMode(catalog, selection, gates, scope.projectRoot, scope.workspace, name, body.newName)
        else if (action === 'delete') await deleteMode(catalog, selection, gates, scope.projectRoot, scope.workspace, name)
        else throw new Error(`未知的选择态操作：${action}`)
      } catch (error) {
        await appendEvent('presets-action', {
          action,
          name,
          newName: body.newName ?? null,
          workspace: scope.workspace.key,
          title: scope.workspace.title,
          ok: false,
          error: String(error?.message ?? error),
        })
        throw error
      }
      await appendEvent('presets-action', {
        action,
        name,
        newName: body.newName ?? null,
        workspace: scope.workspace.key,
        title: scope.workspace.title,
        ok: true,
      })
      const gatesAfter = await loadGates()
      syncArsCommands(gatesAfter.ars === true)
      return syncState(scope.sessionId, body.cwd, false)
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
      // 只读刷新：只重算视图与注入联接，不改写选择态文件（避免与用户的写操作抢状态）。
      return syncState(body.sessionId, body.cwd, false, false)
    },
    'GET /settings': async () => {
      const catalog = await loadCatalog()
      const params = currentParams(pluginConfig)
      const signature = JSON.stringify(params)
      if (settingsCache !== undefined && settingsCache.signature === signature
        && Date.now() - settingsCache.at < SETTINGS_CACHE_MS) {
        return { ok: true, ...settingsCache.value }
      }
      const payload = await settingsCards(catalog, params, mcpStatusOf())
      settingsCache = { signature, at: Date.now(), value: payload }
      return { ok: true, ...payload }
    },
    'POST /settings': async body => {
      const catalog = await loadCatalog()
      if (body.action === 'open-dir') {
        const target = typeof body.target === 'string' ? body.target : undefined
        const result = openConfigTarget(cacheRoot(), target)
        await appendEvent('open-config-dir', { target: result.path })
        return { ok: true, ...result }
      }
      const checkActions = new Set(['ars-check-deps', 'image-check', 'image2ppt-check', 'runtime-check'])
      if (typeof body.action === 'string' && checkActions.has(body.action)) {
        if (body.action === 'ars-check-deps') {
          const result = await checkArsDependencies(pluginConfig)
          await appendEvent('ars-check-deps', { ok: result.ok, missing: result.missing })
          return { ok: true, check: result, settings: await settingsCards(catalog, currentParams(pluginConfig), mcpStatusOf()) }
        }
        const check = await runSettingCheck(catalog, pluginConfig, body.action, mcpController)
        await appendEvent('settings-check', { action: body.action, ok: check.ok })
        return { ok: true, check, settings: await settingsCards(catalog, currentParams(pluginConfig), mcpStatusOf()) }
      }
      const { params: savedParams, backups } = await saveSettingsCard(catalog, pluginConfig, body)
      // 非密钥字段写 profile 补丁、密钥写 DSH 凭据库；随后按新值重新注入环境变量。
      const persisted = await persistParams(ctx, savedParams)
      if (typeof refreshParams === 'function') await refreshParams()
      applySkillEnv(currentParams(pluginConfig))
      settingsCache = undefined
      await appendEvent('settings-saved', {
        cardId: body.cardId,
        saved: persisted.saved,
        configUpdated: persisted.configUpdated,
        credentialsAvailable: persisted.credentialsAvailable,
        secretsUpdated: persisted.secretsUpdated,
        secretErrors: persisted.secretErrors,
        error: persisted.error,
      })
      if (persisted.saved === false && persisted.error !== undefined) throw new Error(persisted.error)
      // 保存会触发插件重启，这里用刚存下的参数回填响应，避免返回重启前的旧值。
      return { ok: true, backups, settings: await settingsCards(catalog, savedParams, mcpStatusOf()) }
    },
    'POST /mcp': async body => {
      const action = typeof body.action === 'string' ? body.action : ''
      const component = typeof body.component === 'string' ? body.component : ''
      const serverName = SERVER_NAMES[component]
      if (serverName === undefined) throw new Error(`未知 MCP 组件：${component}`)
      if (mcpController === undefined) return { ok: false, detail: '当前 profile 没有 MCP 管理器（仅 Web/桌面端支持）' }
      if (action === 'restart') {
        const result = await mcpController.restart(serverName)
        await appendEvent('mcp-restart', { component, ok: result.ok })
        return { ok: result.ok, action, component, detail: result.detail, mcp: mcpController.status() }
      }
      if (action === 'probe') {
        const result = await mcpController.probe(serverName)
        await appendEvent('mcp-probe', { component, ok: result.ok })
        return { ok: result.ok, action, component, detail: result.detail }
      }
      throw new Error(`未知 MCP 操作：${action}`)
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
        configDir: cacheRoot(),
        catalog: { total: catalog.stats.total, defaults: catalog.stats.defaults, generatedAt: catalog.generatedAt },
        arsCommands: arsCommandCount(),
        mcp: mcpController === undefined ? { available: false, servers: [] } : mcpController.status(),
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
