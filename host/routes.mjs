/**
 * 宿主 HTTP 接口，全部挂在 /dsh-zrwang-plugin 前缀下（仅 Web/Desktop）。
 *
 * 每个请求先过同源栅栏；返回统一 JSON：成功 {ok:true,...}，失败 {ok:false,error}。
 */
import { join } from 'node:path'
import { ROUTE_PREFIX, SKILLS_DIR, VERSION } from './config.mjs'
import { patentPathsOf, stateRoot, storageRoot } from './paths.mjs'
import { openPath } from './platform.mjs'
import { catalogView, loadCatalog } from './catalog.mjs'
import { resolveProjectRoot } from './project.mjs'
import { ancestorDirIdsOfSkill, buildEffectiveGates, childBatch, desiredSkills, groupCounts, loadSelection, resetGroup, setSelection } from './selection.mjs'
import { presetsPayload, loadPresets, applyMode, applyModeContent, cloneMode, deleteMode, ensureEditableMode, renameMode, saveActiveMode, saveMode, activeModeContent } from './presets.mjs'
import { clearGates, loadGates, normalizeGates, replaceGates, setGates } from './gates.mjs'
import { blockedSkills, openConfigTarget, presenceOf, runSettingCheck, saveSettingsCard, settingsCards } from './settings.mjs'
import { checkArsDeps, loadArsManifest, mergeArsSkills } from './ars.mjs'
import { componentViews, SERVER_NAMES } from './mcp.mjs'
import { componentWant } from './session-components.mjs'
import { arsUsageDoc, arsCommandCount, syncArsCommands } from './ars-commands.mjs'
import { invalidateSkillProvider } from './skill-provider.mjs'
import { ensureSessionSelection, readSessionSelection, saveSessionSelection } from './session-selection.mjs'
import { refreshToolRestrictions } from './tool-restrictions.mjs'
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
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
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
  const walk = node => (node.kind === 'skill' ? node.name === name : (node.children ?? []).some(walk))
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

export function registerRoutes(scope, ctx, runtime, mcpController) {
  const mcpStatusOf = () => (mcpController === undefined ? { available: false, servers: [] } : mcpController.status())
  const webServer = scope.webServer ?? scope.get?.('webServer')

  async function modeState(catalog, projectRoot, workspace, persist, sessionId, restoreSnapshot = persist !== true) {
    const selection = await loadSelection(catalog)
    const gates = await loadGates()
    await loadPresets(catalog, selection, gates, projectRoot)
    const active = await activeModeContent(catalog, selection, gates, projectRoot, workspace, workspace.sessionId)
    const snapshot = await readSessionSelection(sessionId)
    if (snapshot !== undefined && restoreSnapshot === true) {
      const changes = {}
      for (const name of Object.keys(catalog.skills)) changes[name] = snapshot.skills?.[name] === true
      await setSelection(changes)
      await replaceGates(snapshot.gates ?? {})
      invalidateSkillProvider()
      return { selection: await loadSelection(catalog), gates: await loadGates(), active }
    }
    if (active.content === undefined) return { selection, gates, active }
    if (persist === true) {
      await applyModeContent(catalog, active.content)
      return { selection: await loadSelection(catalog), gates: await loadGates(), active }
    }
    const skills = {}
    for (const name of Object.keys(catalog.skills)) skills[name] = active.content.selection?.[name] === true
    return { selection: { ...selection, skills }, gates: normalizeGates(active.content.gates), active }
  }

  async function activateMode(catalog, projectRoot, workspace, sessionId) {
    return modeState(catalog, projectRoot, workspace, true, sessionId, true)
  }

  async function contextOf(sessionId, cwd) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('缺少 sessionId')
    const resolved = resolveCwd(ctx, sessionId, cwd)
    if (resolved === undefined) throw new Error('无法解析会话工作目录，请从已打开的会话里使用')
    const projectRoot = resolveProjectRoot(resolved)
    const workspace = await resolveWorkspace(ctx, sessionId, resolved, projectRoot)
    return { sessionId, cwd: resolved, projectRoot, workspace: { ...workspace, sessionId } }
  }

  async function resetDerivedGatesForSkills(catalog, names) {
    if (names.length === 0) return
    const ids = new Set()
    for (const name of names) for (const id of ancestorDirIdsOfSkill(catalog, name)) ids.add(id)
    if (ids.size > 0) await clearGates([...ids])
  }

  async function syncState(sessionId, cwd, includeCatalog = true, persist = true) {
    const catalog = await loadCatalog()
    const scopeInfo = await contextOf(sessionId, cwd)
    const { projectRoot, workspace } = scopeInfo
    const { selection, gates } = await modeState(catalog, projectRoot, workspace, persist, sessionId, persist !== true)
    if (persist === true) await saveSessionSelection(sessionId, selection, gates)
    else await ensureSessionSelection(sessionId, selection, gates)
    await refreshToolRestrictions(sessionId)
    syncArsCommands(gates.ars === true)
    const params = runtime.effective()
    const blocked = await blockedSkills(params, catalog)
    const desired = desiredSkills(catalog, selection, gates, blocked)
    const engineeringInjected = [...desired.keys()].filter(name => groupHasSkill(catalog, 'engineering', name)).length
    // MCP 服务器注册按会话取并集，而“要不要”必须和工具掩码看同一份会话快照，
    // 不能用全局 gates：否则一个会话关掉会把另一个会话还开着的服务器注销。
    const sessionWant = await componentWant(sessionId)
    if (mcpController !== undefined) await mcpController.reconcile(sessionWant, { sessionId })
    const mcpStatus = mcpStatusOf()
    const components = componentViews({ engineeringInjected, gates, status: mcpStatus, want: sessionWant })
    const ars = loadArsManifest()
    const arsEnabled = gates.ars === true
    mergeArsSkills(desired, arsEnabled)
    invalidateSkillProvider()
    const payload = {
      ok: true,
      version: VERSION,
      selection: selection.skills,
      blocked,
      session: { sessionId, projectRoot, gates: buildEffectiveGates(catalog, gates, selection), workspace: workspaceView(workspace) },
      project: { root: projectRoot, skillsRoot: '' },
      links: { count: 0, names: [], added: 0, removed: 0, retargeted: 0, kept: 0, conflicts: [] },
      ars: ars === undefined ? undefined : {
        label: ars.label,
        license: ars.license,
        enabled: arsEnabled,
        skillCount: (ars.skills ?? []).length,
        commandCount: (ars.commands ?? []).length,
        injected: arsEnabled ? (ars.skills ?? []).length : 0,
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

  async function settingsPayload() {
    const params = runtime.effective()
    const payload = settingsCards(params, presenceOf(runtime.presence()), mcpStatusOf())
    return { ok: true, ...payload }
  }

  const handlers = {
    'GET /catalog': async query => {
      const sessionId = query.get('sessionId')
      if (sessionId === null || sessionId.length === 0) throw new Error('缺少 sessionId')
      return syncState(sessionId, query.get('cwd') ?? undefined, true, false)
    },
    'POST /session': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const scopeInfo = await contextOf(body.sessionId, body.cwd)
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const live = await activateMode(catalog, scopeInfo.projectRoot, scopeInfo.workspace, scopeInfo.sessionId)
      await ensureEditableMode(catalog, live.selection, live.gates, scopeInfo.projectRoot, scopeInfo.workspace)
      const patch = body.gates ?? Object.fromEntries(Object.entries(body.categories ?? {}))
      const nextGates = await setGates(patch)
      await saveActiveMode(catalog, await loadSelection(catalog), nextGates, scopeInfo.projectRoot, scopeInfo.workspace)
      syncArsCommands(nextGates.ars === true)
      return syncState(scopeInfo.sessionId, body.cwd, false)
    },
    'POST /ui': async body => {
      const ui = await saveExpanded(body.expanded ?? {})
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
      const scopeInfo = await contextOf(body.sessionId, body.cwd)
      const live = await activateMode(catalog, scopeInfo.projectRoot, scopeInfo.workspace, scopeInfo.sessionId)
      await ensureEditableMode(catalog, live.selection, live.gates, scopeInfo.projectRoot, scopeInfo.workspace)
      await setSelection(changes)
      await resetDerivedGatesForSkills(catalog, Object.keys(changes))
      await saveActiveMode(catalog, await loadSelection(catalog), await loadGates(), scopeInfo.projectRoot, scopeInfo.workspace)
      return syncState(scopeInfo.sessionId, body.cwd, false)
    },
    'POST /children': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const nodeId = typeof body.nodeId === 'string' ? body.nodeId : ''
      const value = body.value === true
      const only = Array.isArray(body.only) ? body.only.filter(item => typeof item === 'string') : undefined
      const { skillChanges, gates } = childBatch(catalog, nodeId, value, { only })
      const scopeInfo = await contextOf(body.sessionId, body.cwd)
      const live = await activateMode(catalog, scopeInfo.projectRoot, scopeInfo.workspace, scopeInfo.sessionId)
      await ensureEditableMode(catalog, live.selection, live.gates, scopeInfo.projectRoot, scopeInfo.workspace)
      const blocked = await blockedSkills(runtime.effective(), catalog)
      const changes = Object.fromEntries(Object.entries(skillChanges).filter(([name]) => blocked[name] === undefined))
      if (Object.keys(changes).length > 0) await setSelection(changes)
      await resetDerivedGatesForSkills(catalog, Object.keys(changes))
      const nextGates = Object.keys(gates).length > 0 ? await setGates(gates) : await loadGates()
      await saveActiveMode(catalog, await loadSelection(catalog), nextGates, scopeInfo.projectRoot, scopeInfo.workspace)
      syncArsCommands(nextGates.ars === true)
      return syncState(scopeInfo.sessionId, body.cwd, false)
    },
    'POST /reset': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const catalog = await loadCatalog()
      const group = catalog.groups.find(item => item.id === body.group)
      if (group === undefined) throw new Error(`未知一级目录：${body.group}`)
      const scopeInfo = await contextOf(body.sessionId, body.cwd)
      const live = await activateMode(catalog, scopeInfo.projectRoot, scopeInfo.workspace, scopeInfo.sessionId)
      await ensureEditableMode(catalog, live.selection, live.gates, scopeInfo.projectRoot, scopeInfo.workspace)
      const changedNames = await resetGroup(catalog, group.id)
      await resetDerivedGatesForSkills(catalog, changedNames)
      await saveActiveMode(catalog, await loadSelection(catalog), await loadGates(), scopeInfo.projectRoot, scopeInfo.workspace)
      return syncState(scopeInfo.sessionId, body.cwd, false)
    },
    'POST /presets': async body => {
      const scopeInfo = await contextOf(body.sessionId, body.cwd)
      const catalog = await loadCatalog()
      const selection = await loadSelection(catalog)
      const live = await activateMode(catalog, scopeInfo.projectRoot, scopeInfo.workspace, scopeInfo.sessionId)
      const gates = live.gates
      const action = typeof body.action === 'string' ? body.action : ''
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      try {
        if (action === 'apply') await applyMode(catalog, selection, gates, scopeInfo.projectRoot, scopeInfo.workspace, name)
        else if (action === 'create-from') await cloneMode(catalog, selection, gates, scopeInfo.projectRoot, scopeInfo.workspace, name)
        else if (action === 'save') await saveMode(catalog, selection, gates, scopeInfo.projectRoot, scopeInfo.workspace, name, body.newName)
        else if (action === 'rename') await renameMode(catalog, selection, gates, scopeInfo.projectRoot, scopeInfo.workspace, name, body.newName)
        else if (action === 'delete') await deleteMode(catalog, selection, gates, scopeInfo.projectRoot, scopeInfo.workspace, name)
        else throw new Error(`未知的选择态操作：${action}`)
      } catch (error) {
        await appendEvent('presets-action', { action, name, newName: body.newName ?? null, workspace: scopeInfo.workspace.key, title: scopeInfo.workspace.title, ok: false, error: String(error?.message ?? error) })
        throw error
      }
      await appendEvent('presets-action', { action, name, newName: body.newName ?? null, workspace: scopeInfo.workspace.key, title: scopeInfo.workspace.title, ok: true })
      syncArsCommands((await loadGates()).ars === true)
      return syncState(scopeInfo.sessionId, body.cwd, false)
    },
    'POST /open-url': async body => {
      const url = typeof body.url === 'string' ? body.url.trim() : ''
      if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(url)) throw new Error('只允许打开 GitHub 仓库页面')
      if (!openPath(url)) throw new Error('无法调用系统浏览器')
      await appendEvent('open-repo', { url })
      return { ok: true, url }
    },
    'POST /resync': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      return syncState(body.sessionId, body.cwd, false, false)
    },
    'GET /settings': async () => settingsPayload(),
    'POST /settings': async body => {
      if (body.action === 'open-dir') {
        const target = typeof body.target === 'string' ? body.target : undefined
        const result = openConfigTarget(target)
        await appendEvent('open-config-dir', { target: result.path })
        return { ok: true, ...result }
      }
      const checkActions = new Set(['ars-check-deps', 'image-check', 'image2ppt-check', 'runtime-check'])
      if (typeof body.action === 'string' && checkActions.has(body.action)) {
        if (body.action === 'ars-check-deps') {
          const result = checkArsDeps(runtime.effective())
          await appendEvent('ars-check-deps', { ok: result.ok, missing: result.missing })
          return { ok: true, check: result, settings: await settingsPayload() }
        }
        const check = await runSettingCheck(body.action, runtime.effective(), mcpController)
        await appendEvent('settings-check', { action: body.action, ok: check.ok })
        return { ok: true, check, settings: await settingsPayload() }
      }
      const next = saveSettingsCard(runtime.effective(), body)
      const saved = await runtime.save(next)
      if (!saved.result.saved && saved.result.error !== undefined) throw new Error(saved.result.error)
      // 关掉「断线自动恢复」时撤掉已排队的重建。
      mcpController?.refreshPolicy()
      return { ok: true, warnings: saved.result.warnings, settings: await settingsPayload() }
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
      return {
        ok: true,
        version: VERSION,
        packageDir: join(SKILLS_DIR, '..'),
        storageDir: storageRoot(),
        stateDir: stateRoot(),
        patentRoot: patentPathsOf(runtime.effective())?.root ?? '',
        catalog: { total: catalog.stats.total, defaults: catalog.stats.defaults, generatedAt: catalog.generatedAt },
        arsCommands: arsCommandCount(),
        mcp: mcpStatusOf(),
        projects: 0,
        warnings: runtime.warnings(),
        events: await readEvents(10),
      }
    },
  }

  const webServerRef = webServer
  const disposer = webServerRef.register({
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
