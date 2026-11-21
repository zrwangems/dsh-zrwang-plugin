#!/usr/bin/env node
/**
 * 路由层回归：不启 DSH，用假 webServer + 假 ctx（含 workspaceRegistry 桩）直接驱动
 * host/routes.mjs 的 HTTP 处理器，覆盖选择态 v3 的完整用户路径：
 *   GET /catalog → POST /session → 同工作区共享 → 跨工作区隔离
 *   POST /presets create-from（命名模式/默认拒绝）→ rename 升级项目级 → delete。
 *
 * 运行时会临时改 STATE_DIR / DSH_HOME 到 AgentsDo 下的测试目录，不污染真实配置。
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const WORK = resolve(import.meta.dirname, '..', '..', 'AgentsDo', 'skill-management-20261027', 'tmp', 'routes')
rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })
process.env.ZRWANG_PLUGIN_STATE_DIR = join(WORK, 'state')
process.env.DSH_HOME = join(WORK, 'home')

const { registerRoutes } = await import('../host/routes.mjs')

let failures = 0
function check(name, ok, detail) {
  if (ok) {
    process.stdout.write(`ok   ${name}\n`)
    return
  }
  failures += 1
  process.stderr.write(`FAIL ${name}${detail === undefined ? '' : `：${detail}`}\n`)
}

// ---- 假项目 / 假工作区 ----
const projectRoot = join(WORK, 'proj')
mkdirSync(join(projectRoot, '.git'), { recursive: true })
const dirA = join(projectRoot, 'workspace-a')
const dirB = join(projectRoot, 'workspace-b')
mkdirSync(dirA, { recursive: true })
mkdirSync(dirB, { recursive: true })
const registry = {
  list() {
    return [
      { id: 'ws-a', path: dirA, title: '工作区甲', sessionIds: ['session-a', 'session-b'] },
      { id: 'ws-b', path: dirB, title: '工作区乙', sessionIds: ['session-c'] },
    ]
  },
  async resolveByPath(path) {
    return this.list().find(workspace => workspace.path === path)
  },
}

// ---- 假宿主 ----
let handler
const webServer = {
  register(route) {
    handler = route.handler
    return () => {}
  },
}
const ctx = {
  get(name) {
    if (name === 'workspaceRegistry') return registry
    if (name === 'agents') return { get: () => undefined }
    return undefined
  },
  logger: { info() {}, warn() {} },
  emit() {},
}
const scope = { webServer, get: name => (name === 'webServer' ? webServer : undefined) }
registerRoutes(scope, ctx, {})

async function call(method, path, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const req = {
    method,
    url: path,
    headers: { host: '127.0.0.1:60335', 'sec-fetch-site': 'same-origin' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
  let finish
  const finished = new Promise(resolvePromise => { finish = resolvePromise })
  const res = {
    status: 0,
    body: null,
    writeHead(status) { this.status = status },
    end(text) { this.body = text; finish() },
  }
  handler(req, res)
  await finished
  return { status: res.status, data: res.body === null ? null : JSON.parse(res.body) }
}

function presetsOf(data) {
  return data.presets ?? data.presets
}

// ---- 1. 初始：只有默认 ----
const initial = await call('GET', `/dsh-zrwang-plugin/catalog?sessionId=session-a&cwd=${encodeURIComponent(dirA)}`)
check('GET /catalog 返回成功', initial.status === 200 && initial.data.ok === true, JSON.stringify(initial.data?.error ?? initial.status))
check('默认模式只有一个且注入 0', presetsOf(initial.data).items.length === 1 && presetsOf(initial.data).items[0].name === '默认' && presetsOf(initial.data).items[0].count === 0)
check('会话带回工作区信息', initial.data.session.workspace?.title === '工作区甲' && initial.data.session.workspace?.key === 'w:ws-a')

// ---- 2. 在默认上开门禁 → 自动建立以工作区命名的模式 ----
const toggled = await call('POST', '/dsh-zrwang-plugin/session', { sessionId: 'session-a', cwd: dirA, gates: { engineering: true } })
check('POST /session 成功', toggled.status === 200 && toggled.data.ok === true, JSON.stringify(toggled.data?.error ?? toggled.status))
const auto = presetsOf(toggled.data).items.find(item => item.workspace === true)
check('自动模式以工作区名命名并成为活跃模式', presetsOf(toggled.data).active === '工作区甲' && auto !== undefined && auto.name === '工作区甲' && auto.count > 0,
  JSON.stringify(presetsOf(toggled.data)))

// ---- 2.1 MCP 组件行：MathWorks 随工程组自动、Windows MCP 手动 ----
const initialComponents = initial.data.components ?? []
check('组件行含 MathWorks 与 Windows MCP',
  initialComponents.map(item => item.id).join(',') === 'mathworks,windows-mcp',
  initialComponents.map(item => item.id).join(','))
check('工程组未开时 MathWorks 组件关闭', initialComponents.find(item => item.id === 'mathworks')?.enabled === false)
const mathworksOn = (toggled.data.components ?? []).find(item => item.id === 'mathworks')
check('工程技能组打开后 MathWorks 组件自动开启', mathworksOn?.enabled === true, JSON.stringify(mathworksOn))
check('无 mcpManager 时组件标记不可用', mathworksOn?.server?.state === 'unavailable', JSON.stringify(mathworksOn?.server))
const winToggled = await call('POST', '/dsh-zrwang-plugin/session', { sessionId: 'session-a', cwd: dirA, gates: { 'windows-mcp': true } })
check('勾选 Windows MCP 组件后门禁生效',
  (winToggled.data.components ?? []).find(item => item.id === 'windows-mcp')?.enabled === true)
await call('POST', '/dsh-zrwang-plugin/session', { sessionId: 'session-a', cwd: dirA, gates: { 'windows-mcp': false } })
const health = await call('GET', '/dsh-zrwang-plugin/health')
check('health 报告 MCP 状态', health.data?.mcp?.available === false && health.data?.ok === true)

// ---- 3. 同工作区第二个会话共享 ----
const shared = await call('GET', `/dsh-zrwang-plugin/catalog?sessionId=session-b&cwd=${encodeURIComponent(dirA)}`)
check('同工作区会话共享同一模式与计数', presetsOf(shared.data).active === '工作区甲'
  && presetsOf(shared.data).items.find(item => item.name === '工作区甲')?.count === auto.count,
  JSON.stringify(presetsOf(shared.data)))

// ---- 3.1 /resync 只读：不改写选择态文件 ----
const selectionFile = join(WORK, 'state', 'selection.json')
const selectionBefore = readFileSync(selectionFile, 'utf8')
const resynced = await call('POST', '/dsh-zrwang-plugin/resync', { sessionId: 'session-a', cwd: dirA })
check('resync 成功且不改写 selection.json', resynced.status === 200 && resynced.data.ok === true
  && readFileSync(selectionFile, 'utf8') === selectionBefore,
  JSON.stringify(resynced.data?.error ?? resynced.status))

// ---- 3.2 一级目录“全选”同时打开本组门禁，注入数不再为 0 ----
const bulk = await call('POST', '/dsh-zrwang-plugin/children', { sessionId: 'session-a', cwd: dirA, nodeId: 'engineering', value: true })
const engStats = (bulk.data.groups ?? {}).engineering ?? {}
check('工程组全选后本组门禁打开且有注入', bulk.status === 200 && engStats.enabled === true && engStats.injected > 0,
  JSON.stringify(engStats))

// ---- 3.3 搜索过滤下全选只改可见技能及其所在目录 ----
await call('POST', '/dsh-zrwang-plugin/children', { sessionId: 'session-a', cwd: dirA, nodeId: 'engineering', value: false })
const filtered = await call('POST', '/dsh-zrwang-plugin/children', { sessionId: 'session-a', cwd: dirA, nodeId: 'engineering', value: true, only: ['matlab-create-live-script'] })
const gatesFile = JSON.parse(readFileSync(join(WORK, 'state', 'gates.json'), 'utf8')).gates
const selectionAfterFilter = JSON.parse(readFileSync(selectionFile, 'utf8')).skills
check('过滤后全选只打开可见技能所在目录',
  filtered.status === 200
  && gatesFile.engineering === true
  && gatesFile.matlab === true
  && gatesFile.simulink !== true
  && selectionAfterFilter['matlab-create-live-script'] === true
  && selectionAfterFilter['matlab-validate-function-arguments'] !== true,
  JSON.stringify({ engineering: gatesFile.engineering, matlab: gatesFile.matlab, simulink: gatesFile.simulink, picked: selectionAfterFilter['matlab-create-live-script'] }))
await call('POST', '/dsh-zrwang-plugin/children', { sessionId: 'session-a', cwd: dirA, nodeId: 'engineering', value: false })

// ---- 4. 另一工作区隔离 ----
const isolated = await call('GET', `/dsh-zrwang-plugin/catalog?sessionId=session-c&cwd=${encodeURIComponent(dirB)}`)
check('另一工作区看不到甲的自动模式', presetsOf(isolated.data).active === '默认'
  && !presetsOf(isolated.data).items.some(item => item.workspace === true),
  JSON.stringify(presetsOf(isolated.data)))

// ---- 5. 基于默认新建 → 落到当前工作区自动模式（内容为基础态）----
const fromDefault = await call('POST', '/dsh-zrwang-plugin/presets', { sessionId: 'session-a', cwd: dirA, action: 'create-from', name: '默认' })
const defaultAuto = presetsOf(fromDefault.data).items.find(item => item.workspace === true)
check('create-from 默认生成工作区自动模式', fromDefault.status === 200
  && presetsOf(fromDefault.data).active === '工作区甲'
  && defaultAuto !== undefined && defaultAuto.count === 0,
  JSON.stringify(presetsOf(fromDefault.data)))

// ---- 6. 乙工作区建自动模式并改名升级为项目级 ----
await call('POST', '/dsh-zrwang-plugin/session', { sessionId: 'session-c', cwd: dirB, gates: { office: true } })
const promoted = await call('POST', '/dsh-zrwang-plugin/presets', { sessionId: 'session-c', cwd: dirB, action: 'rename', name: '工作区乙', newName: '乙方案' })
check('工作区模式改名后成为项目级模式', promoted.status === 200 && presetsOf(promoted.data).active === '乙方案'
  && presetsOf(promoted.data).items.some(item => item.name === '乙方案' && item.workspace === false),
  JSON.stringify(presetsOf(promoted.data)))

const crossWorkspace = await call('GET', `/dsh-zrwang-plugin/catalog?sessionId=session-a&cwd=${encodeURIComponent(dirA)}`)
check('项目级模式对另一工作区可见', presetsOf(crossWorkspace.data).items.some(item => item.name === '乙方案'),
  JSON.stringify(presetsOf(crossWorkspace.data)))

// ---- 7. 基于命名模式新建 → 覆盖当前工作区自动模式 ----
const cloned = await call('POST', '/dsh-zrwang-plugin/presets', { sessionId: 'session-a', cwd: dirA, action: 'create-from', name: '乙方案' })
const clonedAuto = presetsOf(cloned.data).items.find(item => item.workspace === true)
check('基于命名模式新建切到工作区模式', cloned.status === 200 && presetsOf(cloned.data).active === '工作区甲' && clonedAuto !== undefined,
  JSON.stringify(presetsOf(cloned.data)))
check('新建后内容与源模式一致', clonedAuto?.count === presetsOf(cloned.data).items.find(item => item.name === '乙方案')?.count,
  JSON.stringify(presetsOf(cloned.data).items))

// ---- 7.1 基于工作区模式新建 → 生成项目级副本，原自动模式保留 ----
const fromAuto = await call('POST', '/dsh-zrwang-plugin/presets', { sessionId: 'session-a', cwd: dirA, action: 'create-from', name: '工作区甲' })
const copyItem = presetsOf(fromAuto.data).items.find(item => item.workspace === false && item.name !== '默认' && item.name !== '乙方案')
check('基于工作区模式新建生成项目级副本', fromAuto.status === 200
  && copyItem !== undefined
  && presetsOf(fromAuto.data).active === copyItem.name
  && presetsOf(fromAuto.data).items.some(item => item.name === '工作区甲' && item.workspace === true),
  JSON.stringify({ status: fromAuto.status, copyItem, items: presetsOf(fromAuto.data).items }))
await call('POST', '/dsh-zrwang-plugin/presets', { sessionId: 'session-a', cwd: dirA, action: 'delete', name: copyItem.name })

// ---- 8. 删除工作区模式回到默认 ----
const removed = await call('POST', '/dsh-zrwang-plugin/presets', { sessionId: 'session-a', cwd: dirA, action: 'delete', name: '工作区甲' })
check('删除工作区模式后回到默认', removed.status === 200 && presetsOf(removed.data).active === '默认'
  && !presetsOf(removed.data).items.some(item => item.workspace === true),
  JSON.stringify(presetsOf(removed.data)))

// ---- 8.1 不存在的模式返回错误（供事件日志的失败记录）----
const missing = await call('POST', '/dsh-zrwang-plugin/presets', { sessionId: 'session-a', cwd: dirA, action: 'create-from', name: '不存在的模式' })
check('不存在的模式返回明确错误', missing.status === 400 && String(missing.data?.error ?? '').includes('没有这个模式'),
  JSON.stringify(missing.data))

// ---- 9. 事件日志留下排障记录 ----
const events = readFileSync(join(WORK, 'state', 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const presetEvents = events.filter(event => event.kind === 'presets-action')
check('presets-action 事件有成功与失败记录', presetEvents.some(event => event.detail.ok === true) && presetEvents.some(event => event.detail.ok === false),
  String(presetEvents.length))

// ---- 清理 ----
rmSync(WORK, { recursive: true, force: true })
void existsSync

process.stdout.write(failures === 0 ? '\nroutes smoke: 全部通过\n' : `\nroutes smoke: ${failures} 项失败\n`)
process.exit(failures === 0 ? 0 : 1)
