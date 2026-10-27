/**
 * 宿主 HTTP 接口，全部挂在 /dsh-zrwang-plugin 前缀下。
 *
 * 每个请求先过同源栅栏；返回统一 JSON：成功 {ok:true,...}，失败 {ok:false,error}。
 */
import { join } from 'node:path'
import { ROUTE_PREFIX, SKILLS_DIR, STATE_DIR, VERSION } from './config.mjs'
import { catalogView, loadCatalog } from './catalog.mjs'
import { reconcile, readLinks } from './farm.mjs'
import { resolveProjectRoot } from './project.mjs'
import { desiredSkills, groupCounts, loadSelection, resetGroup, setSelection } from './selection.mjs'
import { ensureSession } from './sessions.mjs'
import { loadGates, setGates } from './gates.mjs'
import { blockedSkills, currentParams, openConfigTarget, saveSettingsCard, settingsCards } from './skill-settings.mjs'
import { configDirOfParams } from './plugin-params.mjs'
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

  async function syncState(sessionId, cwd, includeCatalog = true) {
    const catalog = await loadCatalog()
    const selection = await loadSelection(catalog)
    const resolved = resolveCwd(ctx, sessionId, cwd)
    if (resolved === undefined) throw new Error('无法解析会话工作目录，请从已打开的会话里使用')
    const projectRoot = resolveProjectRoot(resolved)
    const session = await ensureSession(sessionId, projectRoot)
    const params = currentParams(pluginConfig)
    const blocked = await blockedSkills(catalog, params)
    const gates = await loadGates()
    const desired = desiredSkills(catalog, selection, gates, blocked)
    const status = await reconcile({ projectRoot, desired })
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
      groups: groupStats(catalog, selection, desired, gates, blocked),
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
      await loadSelection(catalog)
      const resolved = resolveCwd(ctx, body.sessionId, body.cwd)
      if (resolved === undefined) throw new Error('无法解析会话工作目录')
      const projectRoot = resolveProjectRoot(resolved)
      await ensureSession(body.sessionId, projectRoot)
      const patch = body.gates ?? Object.fromEntries(Object.entries(body.categories ?? {}))
      await setGates(patch)
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
    'POST /selection': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const catalog = await loadCatalog()
      await loadSelection(catalog)
      const names = new Set(Object.keys(catalog.skills))
      const changes = {}
      for (const [name, value] of Object.entries(body.changes ?? {})) {
        if (names.has(name) && typeof value === 'boolean') changes[name] = value
      }
      if (Object.keys(changes).length === 0) throw new Error('没有可应用的选择变更')
      await setSelection(changes)
      return syncState(body.sessionId, body.cwd, false)
    },
    'POST /reset': async body => {
      if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) throw new Error('缺少 sessionId')
      const catalog = await loadCatalog()
      await loadSelection(catalog)
      const group = catalog.groups.find(item => item.id === body.group)
      if (group === undefined) throw new Error(`未知一级目录：${body.group}`)
      await resetGroup(catalog, group.id)
      return syncState(body.sessionId, body.cwd, false)
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
      const backups = await saveSettingsCard(catalog, pluginConfig, body)
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
