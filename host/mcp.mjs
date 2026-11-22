/**
 * MathWorks / Windows MCP 组件：把侧栏组件开关对账成 mcp-manager 的服务器注册。
 *
 * - MathWorks 组件：工程技能组开启且确有工程技能注入时，注册 `matlab-mcp`
 *   （插件自带 exe + simulink-tools.json 扩展文件，5 个 MATLAB 工具 + 9 个 Simulink 工具）。
 * - Windows MCP 组件：手动勾选时注册 `windows-mcp`。
 * - 没有 mcpManager 的 profile（headless/sdk）自动降级为“不可用”，不抛错。
 *
 * 注册条目字段按 DSH 官方 @deepseek-ai/dsh-mcp-manager 的条目 schema：
 * transport / command / args / env / cwd / toolCallTimeoutMs / startupTimeoutMs /
 * closeTimeoutMs / reconnect / failOnStartupError。连接参数固定，设置页只暴露一个
 * 「断线自动恢复」开关。
 *
 * 稳定性分两层，都用 DSH 官方面：
 *   - mcp-client 自己的重连退避（注册条目的 reconnect 预算）；
 *   - 本控制器的自愈守护：订阅 `mcp-manager/status`，预算耗尽（failed: gave-up）
 *     且仍有用组件时，按退避序列调用 `mcpManager.restart()` 重建实例，连上即停。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { MATHWORKS_DIR } from './config.mjs'
import { isWindows } from './platform.mjs'

export { MATHWORKS_DIR }
export const MATLAB_MCP_EXE = join(MATHWORKS_DIR, 'matlab-mcp-server-windows-x64.exe')
/** Simulink Agentic Toolkit 运行时目录（MATLAB 侧 addpath 的目标）。 */
export const SIMULINK_TOOLKIT_DIR = join(MATHWORKS_DIR, 'simulink-agentic-toolkit')
/** Simulink 工具扩展文件（--extension-file 指向它）。 */
export const SIMULINK_TOOLS_FILE = join(SIMULINK_TOOLKIT_DIR, 'tools', 'tools.json')

/** 两个组件注册的服务器名（同时决定工具前缀 mcp__<name>__*）。 */
export const SERVER_NAMES = { mathworks: 'matlab-mcp', windows: 'windows-mcp' }

/** mcp-client 的关闭预算；官方默认 5000。 */
const CLOSE_TIMEOUT_MS = 5000

/** 自愈守护的退避序列（毫秒）：重连预算用完后按这个节奏重建实例，连上即停。 */
export const RECOVER_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000]

/** 只有这两种终止原因能靠重建实例恢复；cleanup/load 重建也没用。 */
const RECOVERABLE_REASONS = new Set(['gave-up', 'reconnect-disabled'])

/** mcp-client 的重连预算；30 次 × 最长 10s ≈ 4.4 分钟，够 MATLAB 重启一轮。 */
export const RECONNECT_POLICY = { enabled: true, initialDelayMs: 500, maxDelayMs: 10_000, maxAttempts: 30 }

/**
 * 组装 MATLAB MCP 的注册条目（stdio）。参数固定：existing 会话 + 插件自带扩展文件。
 */
export function resolveMatlabEntry() {
  return {
    transport: 'stdio',
    command: MATLAB_MCP_EXE,
    args: ['--matlab-session-mode=existing', `--extension-file=${SIMULINK_TOOLS_FILE}`, '--disable-telemetry=true'],
    env: isWindows ? { WINDIR: process.env.SystemRoot ?? 'C:\\Windows' } : {},
    cwd: '',
    toolCallTimeoutMs: 120000,
    startupTimeoutMs: 30000,
    closeTimeoutMs: CLOSE_TIMEOUT_MS,
    // MATLAB 关掉/共享会话失效时 mcp-client 会按这个预算自动重连；30 次比默认
    // 的 10 次更耐抖，最长间隔 10s，避免 30s 一次等太久。
    reconnect: { ...RECONNECT_POLICY },
    // MATLAB 没开时启动失败只是状态，不让它把插件装配一起拖垮。
    failOnStartupError: false,
  }
}

/**
 * 组装 Windows MCP 的注册条目（stdio）。参数固定：系统 PATH 里的 windows-mcp + serve。
 */
export function resolveWindowsEntry() {
  return {
    transport: 'stdio',
    command: 'windows-mcp',
    args: ['serve'],
    env: { ANONYMIZED_TELEMETRY: 'false', WINDOWS_MCP_SCREENSHOT_SCALE: '0.5' },
    cwd: '',
    toolCallTimeoutMs: 120000,
    startupTimeoutMs: 30000,
    closeTimeoutMs: CLOSE_TIMEOUT_MS,
    reconnect: { ...RECONNECT_POLICY },
    failOnStartupError: false,
  }
}

/** 组件当前希望注册的条目；未开启时返回 undefined。 */
export function entryOf(want) {
  if (want.mathworks === true) return { name: SERVER_NAMES.mathworks, entry: resolveMatlabEntry() }
  if (want.windows === true) return { name: SERVER_NAMES.windows, entry: resolveWindowsEntry() }
  return undefined
}

/**
 * 单例控制器：维护本插件注册的服务器集合，串行执行对账，并负责断线自愈。
 *
 * `mcp-client` 自己会在断线后按 `reconnect` 预算重连；预算用完时
 * （状态 `failed: gave-up`）由这里的守护按 `RECOVER_DELAYS_MS` 调
 * `mcpManager.restart()` 重建实例，MATLAB 重开、共享会话恢复后自动接上，
 * 不需要用户点「重启」。状态变化来自官方 `mcp-manager/status` 事件。
 *
 * @param {object} ctx - 插件上下文（用于 ctx.get('mcpManager') 与卸载清理）
 * @param {object} [options]
 * @param {() => boolean} [options.autoRecover] - 设置页开关：false 时只保留手动重启
 * @param {(kind: string, detail: object) => void} [options.onEvent] - 诊断事件出口
 * @param {{setTimeout: Function, clearTimeout: Function}} [options.timers] - 测试注入
 */
export function createMcpController(ctx, options = {}) {
  /** @type {Map<string, () => void>} 已注册服务器 → 释放函数 */
  const disposers = new Map()
  /** @type {Map<string, string>} 注册失败原因 */
  const failures = new Map()
  /** @type {Map<string, object>} 最近一次 mcp-manager/status 状态 */
  const statuses = new Map()
  /**
   * 自愈记录：重建次数、退避位置、下一次尝试时间。
   * @type {Map<string, {attempts: number, count: number, timer?: object, pendingAt?: number, error?: string}>}
   */
  const recovery = new Map()
  /**
   * 每个会话各自想要的组件状态。组件注册是宿主全局的，取并集：
   * 只要还有一个会话（工作区模式）需要，就保持注册，避免切会话把别人的工具注销。
   * @type {Map<string, {mathworks: boolean, windows: boolean, at: number}>}
   */
  const wants = new Map()
  const WANT_LIMIT = 50
  /**
   * 宿主级保持位：组件一旦随 DSH 启动/被勾选过，就保持到进程结束。
   * 侧栏开关只决定“本会话工具表里有没有”，不再注销服务器；服务器状态由插件守护。
   */
  const held = { mathworks: false, windows: false }
  let queue = Promise.resolve()
  const timers = options.timers ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
  }

  const autoRecover = () => {
    try {
      return typeof options.autoRecover === 'function' ? options.autoRecover() !== false : true
    } catch {
      return true
    }
  }

  const emit = (kind, detail) => {
    try {
      options.onEvent?.(kind, detail)
    } catch {
      // 诊断事件失败不影响连接。
    }
  }

  const unionWant = () => {
    const merged = { mathworks: held.mathworks, windows: held.windows }
    for (const want of wants.values()) {
      if (want.mathworks === true) merged.mathworks = true
      if (want.windows === true) merged.windows = true
    }
    return merged
  }

  /**
   * 控制健康检查：MCP 连接还在，但 windows-mcp 内部的桌面控制后端可能已经挂了。
   * 用只读的 ControlStatus 探一下，把 ready / user / unavailable 显示到侧栏。
   */
  const CONTROL_TTL_MS = 15000
  const controlChecks = new Map()
  const controlToolName = `mcp__${SERVER_NAMES.windows}__ControlStatus`
  const probeControl = async () => {
    const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined
    const definition = typeof tools?.executable === 'function' ? tools.executable(controlToolName) : undefined
    if (definition === undefined || typeof definition.execute !== 'function') {
      return { state: 'unknown', error: '未找到 ControlStatus 工具', at: Date.now() }
    }
    const controller = new AbortController()
    const timer = timers.setTimeout(() => controller.abort(), 5000)
    try {
      const raw = await definition.execute({}, { signal: controller.signal })
      const structured = raw?.structuredContent
      const text = Array.isArray(raw?.content)
        ? raw.content.filter(item => item?.type === 'text').map(item => item.text).join('\n').trim()
        : ''
      let parsed = structured
      if (parsed === undefined) {
        try { parsed = JSON.parse(text) } catch { parsed = undefined }
      }
      const state = typeof parsed?.state === 'string' ? parsed.state : 'unknown'
      const view = { state, at: Date.now() }
      if (parsed?.generation !== undefined) view.generation = parsed.generation
      if (parsed?.wait_seconds !== undefined) view.waitSeconds = parsed.wait_seconds
      return view
    } catch (error) {
      const aborted = controller.signal.aborted
      return {
        state: aborted ? 'timeout' : 'unavailable',
        error: aborted ? 'ControlStatus 超时' : String(error?.message ?? error),
        at: Date.now(),
      }
    } finally {
      timers.clearTimeout(timer)
    }
  }
  const controlOf = () => {
    const cache = controlChecks.get(SERVER_NAMES.windows)
    const now = Date.now()
    if (cache?.value !== undefined && now - cache.at < CONTROL_TTL_MS) return cache.value
    if (cache?.pending === undefined) {
      const entry = cache ?? {}
      entry.pending = probeControl()
        .then(value => {
          const previous = entry.value
          entry.value = value
          entry.at = Date.now()
          if (previous?.state !== value.state) emit('mcp-control', { state: value.state, generation: value.generation })
          return value
        })
        .catch(error => {
          // 探测本身失败（工具表还没挂上/执行抛错）时降级为不可用，不能让健康检查拖垮 /health。
          entry.value = { state: 'unavailable', error: String(error?.message ?? error), at: Date.now() }
          entry.at = Date.now()
          emit('mcp-control', { state: 'unavailable' })
          return entry.value
        })
        .finally(() => { entry.pending = undefined })
      controlChecks.set(SERVER_NAMES.windows, entry)
    }
    return cache?.value ?? { state: 'checking', at: now }
  }

  const pruneWants = () => {
    if (wants.size <= WANT_LIMIT) return
    const ordered = [...wants.entries()].sort((a, b) => a[1].at - b[1].at)
    for (const [key] of ordered.slice(0, wants.size - WANT_LIMIT)) wants.delete(key)
  }

  const manager = () => {
    try {
      return typeof ctx.get === 'function' ? ctx.get('mcpManager') : undefined
    } catch {
      return undefined
    }
  }

  /** 服务器名 → 组件键（mathworks / windows）。 */
  const componentKeyOf = name => Object.keys(SERVER_NAMES).find(key => SERVER_NAMES[key] === name)
  const isWanted = name => {
    const key = componentKeyOf(name)
    return key !== undefined && unionWant()[key] === true
  }

  const clearRecoverTimer = name => {
    const record = recovery.get(name)
    if (record === undefined) return
    if (record.timer !== undefined) timers.clearTimeout(record.timer)
    record.timer = undefined
    record.pendingAt = undefined
  }

  const resetRecover = name => {
    const record = recovery.get(name)
    if (record === undefined) return
    clearRecoverTimer(name)
    record.attempts = 0
  }

  const forgetRecover = name => {
    clearRecoverTimer(name)
    recovery.delete(name)
  }

  function scheduleRecover(name) {
    if (!autoRecover() || !disposers.has(name) || !isWanted(name)) return
    const record = recovery.get(name) ?? { attempts: 0, count: 0 }
    if (record.timer !== undefined) return
    const delay = RECOVER_DELAYS_MS[Math.min(record.attempts, RECOVER_DELAYS_MS.length - 1)]
    record.pendingAt = Date.now() + delay
    record.timer = timers.setTimeout(() => {
      record.timer = undefined
      record.pendingAt = undefined
      void attemptRecover(name)
    }, delay)
    record.timer?.unref?.()
    recovery.set(name, record)
    emit('mcp-recover-scheduled', { server: name, delayMs: delay, nextAttempt: record.count + 1 })
  }

  async function attemptRecover(name) {
    if (!autoRecover() || !disposers.has(name) || !isWanted(name)) return
    const mcp = manager()
    if (mcp === undefined || mcp === null || typeof mcp.restart !== 'function') return
    const record = recovery.get(name) ?? { attempts: 0, count: 0 }
    record.attempts += 1
    record.count += 1
    record.error = undefined
    recovery.set(name, record)
    try {
      await mcp.restart(name)
      emit('mcp-auto-recover', { server: name, attempt: record.count, ok: true })
    } catch (error) {
      const message = String(error?.message ?? error)
      record.error = message
      emit('mcp-auto-recover', { server: name, attempt: record.count, ok: false, error: message })
      // 未确认关闭/清理失败会挡住重建，继续重试也没用。
      if (/cleanup|unconfirmed|restart the Host/i.test(message)) return
      scheduleRecover(name)
    }
  }

  const onStatus = (name, status) => {
    if (componentKeyOf(name) === undefined) return
    statuses.set(name, status)
    if (status?.state === 'connected') {
      resetRecover(name)
      return
    }
    if (status?.state === 'failed') {
      if (RECOVERABLE_REASONS.has(status.reason) && disposers.has(name)) scheduleRecover(name)
      else clearRecoverTimer(name)
    }
  }

  // 官方事件：每次状态变化都会推一条；插件卸载时 ctx.on 的返回值负责解绑。
  let offStatus
  try {
    offStatus = ctx.on?.('mcp-manager/status', (name, status) => { onStatus(name, status) })
  } catch {
    offStatus = undefined
  }

  const release = name => {
    forgetRecover(name)
    statuses.delete(name)
    const dispose = disposers.get(name)
    if (dispose === undefined) return
    disposers.delete(name)
    try {
      dispose()
    } catch (error) {
      failures.set(name, `注销失败：${String(error?.message ?? error)}`)
    }
  }

  const register = (name, entry) => {
    const mcp = manager()
    if (mcp === undefined || mcp === null) return
    try {
      disposers.set(name, mcp.register(name, entry))
      failures.delete(name)
    } catch (error) {
      failures.set(name, String(error?.message ?? error))
    }
  }

  const run = async () => {
    const mcp = manager()
    if (mcp === undefined || mcp === null) {
      for (const name of [...disposers.keys()]) release(name)
      failures.clear()
      return
    }
    const targets = [
      { key: 'mathworks', name: SERVER_NAMES.mathworks, entry: () => resolveMatlabEntry(), requires: MATLAB_MCP_EXE },
      { key: 'windows', name: SERVER_NAMES.windows, entry: () => resolveWindowsEntry() },
    ]
    const wanted = unionWant()
    for (const target of targets) {
      const enabled = wanted[target.key] === true
      if (!enabled) {
        release(target.name)
        continue
      }
      if (disposers.has(target.name)) continue
      // 文件都不在时反复启动只会刷重连预算，直接给明确原因。
      if (target.requires !== undefined && !existsSync(target.requires)) {
        failures.set(target.name, `缺少可执行文件：${target.requires}`)
        continue
      }
      register(target.name, target.entry())
    }
  }

  /** 自愈状态（给状态面和界面用）。 */
  const recoverViewOf = name => {
    const record = recovery.get(name)
    const view = { enabled: autoRecover(), count: record?.count ?? 0, attempts: record?.attempts ?? 0 }
    if (record?.pendingAt !== undefined) {
      view.pendingAt = record.pendingAt
      view.retryInMs = Math.max(0, record.pendingAt - Date.now())
    }
    if (record?.error !== undefined) view.error = record.error
    return view
  }

  const statusViewOf = (name, status) => {
    const failure = failures.get(name)
    return {
      name,
      state: status.state ?? 'unknown',
      attempt: status.attempt ?? 0,
      ...(status.maxAttempts === undefined ? {} : { maxAttempts: status.maxAttempts }),
      ...(status.toolCount === undefined ? {} : { toolCount: status.toolCount }),
      ...(status.lastError === undefined ? {} : { lastError: status.lastError }),
      ...(status.reason === undefined ? {} : { reason: status.reason }),
      ...(status.nextRetryAtMs === undefined ? {} : { nextRetryAtMs: status.nextRetryAtMs }),
      ...(status.connectedAt === undefined ? {} : { connectedAt: status.connectedAt }),
      ...(failure === undefined ? {} : { error: failure }),
      recover: recoverViewOf(name),
    }
  }

  return {
    /**
     * 对账某个会话的组件状态（多个会话取并集）。
     * @param {{mathworks?: boolean, windows?: boolean}} next - 该会话的目标组件状态
     * @param {{force?: boolean, sessionId?: string}} [options] - force 先注销重建；sessionId 用于按会话记状态
     */
    reconcile(next, options = {}) {
      const key = typeof options.sessionId === 'string' && options.sessionId.length > 0 ? options.sessionId : '(全局)'
      // 一旦需要过就保持到进程结束：这样“关掉本会话”只隐藏工具，不会把别的会话
      // 正在用的服务器（或 DSH 起来时已经拉起的服务器）注销掉。
      if (next?.mathworks === true) held.mathworks = true
      if (next?.windows === true) held.windows = true
      wants.set(key, {
        mathworks: next?.mathworks === true,
        windows: next?.windows === true,
        at: Date.now(),
      })
      pruneWants()
      if (options.force === true) {
        for (const name of [...disposers.keys()]) release(name)
        failures.clear()
      }
      queue = queue.then(run, run)
      return queue
    },
    /** 当前受管服务器的状态（来自 mcpManager.list()，并合并自愈进度）。 */
    status() {
      const mcp = manager()
      const available = mcp !== undefined && mcp !== null
      if (!available) {
        return {
          available: false,
          servers: [SERVER_NAMES.mathworks, SERVER_NAMES.windows].map(name => statusViewOf(name, { state: 'unavailable', attempt: 0 })),
        }
      }
      let views = []
      try {
        views = typeof mcp.list === 'function' ? mcp.list() : []
      } catch (error) {
        return { available: true, servers: [], error: String(error?.message ?? error) }
      }
      const withControl = server => (server.name === SERVER_NAMES.windows && server.state === 'connected'
        ? { ...server, control: controlOf() }
        : server)
      const servers = views
        .filter(view => componentKeyOf(view.name) !== undefined)
        .map(view => withControl(statusViewOf(view.name, view.status ?? {})))
      for (const name of [...disposers.keys()]) {
        if (!servers.some(server => server.name === name)) {
          servers.push(withControl(statusViewOf(name, statuses.get(name) ?? { state: 'unknown', attempt: 0 })))
        }
      }
      return { available: true, servers }
    },
    /** 重启一个已注册的服务器（手动重启重置重连预算和自愈计数）。 */
    async restart(serverName) {
      const mcp = manager()
      if (mcp === undefined || mcp === null) return { ok: false, detail: '当前 profile 没有 MCP 管理器（仅 Web/桌面端支持）' }
      if (!disposers.has(serverName)) return { ok: false, detail: '该组件未开启，先勾选开启后再重启' }
      forgetRecover(serverName)
      try {
        await mcp.restart(serverName)
        return { ok: true, detail: `已重启 ${serverName}` }
      } catch (error) {
        return { ok: false, detail: `重启失败：${String(error?.message ?? error)}` }
      }
    },
    /** 探测一个已注册的服务器：单独连一次、列工具、再关闭，不扰动正在运行的实例。 */
    async probe(serverName) {
      const mcp = manager()
      if (mcp === undefined || mcp === null) return { ok: false, detail: '当前 profile 没有 MCP 管理器（仅 Web/桌面端支持）' }
      if (!disposers.has(serverName)) return { ok: false, detail: '该组件未开启，先勾选开启后再测试连接' }
      try {
        const result = await mcp.probe(serverName)
        if (result.ok === true) {
          const identity = result.serverInfo === undefined ? '' : ` ${result.serverInfo.name} ${result.serverInfo.version}`
          return {
            ok: true,
            detail: `连接成功${identity}：${result.toolNames.length} 个工具${result.truncated ? '（已截断）' : ''}，用时 ${result.durationMs}ms`,
          }
        }
        const stage = result.stage === 'connect' ? '连接' : '读取工具列表'
        return { ok: false, detail: `${stage}失败：${result.message}` }
      } catch (error) {
        return { ok: false, detail: `探测失败：${String(error?.message ?? error)}` }
      }
    },
    /** 设置页切换「断线自动恢复」后调用：关掉时撤掉已排队的重建。 */
    refreshPolicy() {
      if (autoRecover()) {
        // 打开时如果已经有服务器卡在 gave-up，立刻排一次恢复，不用等下一次状态变化。
        for (const [name, status] of statuses) {
          if (status?.state === 'failed' && RECOVERABLE_REASONS.has(status.reason)) scheduleRecover(name)
        }
        return
      }
      // 关掉时连退避一起清空；再打开时从 15s 重新开始。
      for (const name of [...recovery.keys()]) resetRecover(name)
    },
    /** 插件卸载时注销全部服务器并停掉自愈计时器。 */
    disposeAll() {
      for (const name of [...recovery.keys()]) forgetRecover(name)
      for (const name of [...disposers.keys()]) release(name)
      try {
        offStatus?.()
      } catch {
        // ctx 已经拆掉时解绑会失败，忽略。
      }
      statuses.clear()
      failures.clear()
    },
  }
}

/**
 * 由侧栏门禁与工程注入数推导两个组件的期望状态。
 * MathWorks：工程技能组打开且确有工程技能注入；Windows MCP：手动门禁。
 */
export function wantOf({ engineeringInjected, gates }) {
  return {
    mathworks: isWindows && gates?.engineering === true && Number(engineeringInjected) > 0,
    windows: isWindows && gates?.['windows-mcp'] === true,
  }
}

const STATE_LABELS = {
  connected: '已连接',
  ready: '已连接',
  connecting: '连接中',
  reconnecting: '重连中',
  disconnected: '已断开',
  closed: '已关闭',
  disabled: '未运行',
  failed: '连接失败',
  error: '连接失败',
  'waiting-credentials': '等待凭据',
  unavailable: '当前 profile 不支持',
  unknown: '状态未知',
}

/** 由连接状态推导组件阶段：running=启动成功，starting=启动中，failed=启动失败，idle=未启动。 */
function phaseOf(state) {
  if (state === 'connected') return 'running'
  if (state === 'connecting' || state === 'reconnecting') return 'starting'
  if (state === 'failed') return 'failed'
  if (state === 'unavailable') return 'unavailable'
  return 'idle'
}

/** 距离下一次自动重连/自动恢复还有几秒。 */
function retrySecondsOf(server) {
  const at = server?.recover?.pendingAt ?? server?.nextRetryAtMs
  if (at === undefined) return undefined
  return Math.max(1, Math.ceil((at - Date.now()) / 1000))
}

/** 组件行显示的启动结果文案（成功时带工具数，重连/自愈时带剩余秒数）。 */
function statusLabelOf(server) {
  const phase = phaseOf(server.state)
  const seconds = retrySecondsOf(server)
  const wait = seconds === undefined ? '' : `，约 ${seconds} 秒后重试`
  if (phase === 'running') return server.toolCount === undefined ? '已启动' : `已启动（${server.toolCount} 个工具）`
  if (phase === 'starting') {
    if (server.state === 'reconnecting') {
      const budget = server.maxAttempts === undefined ? '' : `/${server.maxAttempts}`
      return `重连中（第 ${server.attempt + 1}${budget} 次${wait}）`
    }
    return server.attempt > 0 ? `启动中（第 ${server.attempt + 1} 次尝试）` : '启动中…'
  }
  if (phase === 'failed') {
    if (server.recover?.pendingAt !== undefined) {
      const attempt = server.recover.count + 1
      return `连接失败，${seconds === undefined ? '稍后' : `约 ${seconds} 秒后`}自动恢复（第 ${attempt} 次）`
    }
    if (server.reason === 'cleanup') return '上次连接未确认关闭，需要重启 DSH'
    if (server.reason === 'load') return '启动失败（组件加载出错）'
    return '启动失败'
  }
  if (phase === 'unavailable') return '当前 profile 不支持'
  return '未启动'
}

/**
 * 侧栏两个组件行的视图数据。
 * @param {{engineeringInjected: number, gates: object, status: object}} input
 */
export function componentViews({ engineeringInjected, gates, status, want: wantOverride }) {
  // 侧栏展示也用会话自己的 want（与工具掩码同源），避免一个会话的开关影响另一个会话的显示。
  const want = wantOverride ?? wantOf({ engineeringInjected, gates })
  const servers = status?.servers ?? []
  const viewOf = (name, enabled) => {
    const server = servers.find(item => item.name === name)
    return {
      name,
      enabled,
      state: server?.state ?? (status?.available === true ? (enabled ? 'connecting' : 'disabled') : 'unavailable'),
      attempt: server?.attempt ?? 0,
      ...(server?.toolCount === undefined ? {} : { toolCount: server.toolCount }),
      ...(server?.maxAttempts === undefined ? {} : { maxAttempts: server.maxAttempts }),
      ...(server?.error === undefined ? {} : { error: server.error }),
      ...(server?.lastError === undefined ? {} : { lastError: server.lastError }),
      ...(server?.reason === undefined ? {} : { reason: server.reason }),
      ...(server?.nextRetryAtMs === undefined ? {} : { nextRetryAtMs: server.nextRetryAtMs }),
      ...(server?.connectedAt === undefined ? {} : { connectedAt: server.connectedAt }),
      ...(server?.recover === undefined ? {} : { recover: server.recover }),
      ...(server?.control === undefined ? {} : { control: server.control }),
    }
  }
  const componentOf = (id, label, kind, enabled, desc, hint, serverName) => {
    const server = viewOf(serverName, enabled)
    const phase = phaseOf(server.state)
    // 只在真的排了自动恢复时算“自愈中”；cleanup/关闭开关时不能一直挂着轮询。
    const recovering = phase === 'failed' && server.recover?.pendingAt !== undefined
    return {
      id,
      label,
      kind,
      enabled,
      desc,
      hint,
      phase,
      recovering,
      ...(server.recover?.retryInMs === undefined ? {} : { retryInMs: server.recover.retryInMs }),
      // 本会话没开、但别的会话还在用：界面上要能看出来，别让人以为工具没了。
      globallyActive: enabled !== true && (server.state === 'connected' || server.state === 'connecting' || server.state === 'reconnecting'),
      statusLabel: statusLabelOf(server),
      stateLabel: STATE_LABELS[server.state] ?? '状态未知',
      ...(server.control === undefined ? {} : { control: server.control }),
      restartable: enabled && phase !== 'unavailable' && phase !== 'idle',
      server,
    }
  }
  return {
    available: status?.available === true,
    mathworksInjected: Number(engineeringInjected) || 0,
    components: [
      componentOf(
        'mathworks',
        'MathWorks组件',
        'auto',
        want.mathworks,
        'MATLAB MCP + Simulink 工具（14 个工具）',
        isWindows ? '随工程技能组自动开关；需要 MATLAB 正在运行并已执行 shareMATLABSession()' : '仅 Windows 可用（MATLAB MCP 服务器是 Windows 可执行文件）',
        SERVER_NAMES.mathworks,
      ),
      componentOf(
        'windows-mcp',
        'Windows MCP组件',
        'manual',
        want.windows,
        '桌面截图、快照、点击、窗口操作',
        isWindows ? '勾选后注册 windows-mcp；会占用桌面控制权' : '仅 Windows 可用',
        SERVER_NAMES.windows,
      ),
    ],
  }
}

/**
 * MATLAB 侧初始化命令（用户需要在 MATLAB 里执行一次，之后同一会话即可连上）。
 * 插件自带完整 Simulink Agentic Toolkit，所以路径指向插件目录而不是 ~/.matlab。
 */
export function matlabInitCommand() {
  const dir = SIMULINK_TOOLKIT_DIR.split('\\').join('/')
  const exe = MATLAB_MCP_EXE.split('\\').join('/')
  return `addpath('${dir}'); satk_initialize(MCPServerPath='${exe}')`
}

/** 设置页“组件状态”检查：校验文件/命令并汇总当前连接状态。 */
export function checkMcp(controller) {
  const problems = []
  const parts = []
  const targets = [
    { label: 'MATLAB MCP', entry: resolveMatlabEntry(), extension: true },
    { label: 'Windows MCP', entry: resolveWindowsEntry(), extension: false },
  ]
  for (const target of targets) {
    const command = target.entry.command
    if (existsSync(command)) {
      parts.push(`${target.label}：可执行文件存在`)
    } else if (command.includes('\\') || command.includes('/')) {
      problems.push(`${target.label}：可执行文件不存在（${command}）`)
    } else {
      parts.push(`${target.label}：命令交给 PATH 解析（${command}）`)
    }
    if (target.extension) {
      const extensionFile = (target.entry.args ?? []).find(arg => String(arg).startsWith('--extension-file='))
      const file = extensionFile === undefined ? SIMULINK_TOOLS_FILE : extensionFile.slice('--extension-file='.length)
      if (!existsSync(file)) problems.push(`MATLAB MCP：Simulink 工具扩展文件不存在（${file}）`)
    }
  }
  for (const [label, file] of [
    ['SATK 初始化脚本', join(SIMULINK_TOOLKIT_DIR, 'satk_initialize.p')],
    ['SATK 库清单', join(SIMULINK_TOOLKIT_DIR, 'satk-libraries.json')],
    ['SATK 工具箱知识库', join(SIMULINK_TOOLKIT_DIR, 'toolbox-kb')],
  ]) {
    if (!existsSync(file)) problems.push(`${label}缺失（${file}）`)
  }
  parts.push('Windows MCP 由系统 PATH 里的 windows-mcp 提供')
  const status = controller.status()
  if (status.available !== true) {
    parts.push('当前 profile 没有 MCP 管理器（仅 Web/桌面端支持动态注册）')
  } else if (status.servers.length === 0) {
    parts.push('服务器未开启（勾选对应组件后才会注册）')
  } else {
    for (const server of status.servers) {
      const error = server.error ?? server.lastError
      parts.push(`${server.name}：${statusLabelOf(server)}${error === undefined ? '' : `（${error}）`}`)
    }
    const autoRecover = status.servers.some(server => server.recover?.enabled === true)
    parts.push(autoRecover ? '断线自动恢复：开启' : '断线自动恢复：关闭')
  }
  return {
    ok: problems.length === 0,
    detail: [...problems, ...parts].join(' · '),
    matlabInit: matlabInitCommand(),
    toolkitDir: SIMULINK_TOOLKIT_DIR,
  }
}
