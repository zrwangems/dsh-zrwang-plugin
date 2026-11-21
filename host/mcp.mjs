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
 * closeTimeoutMs。参数固定，设置页不暴露 MCP 配置。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ARTIFACT_DIR, PKG_DIR } from './config.mjs'

/** MathWorks 组件目录：MATLAB MCP exe + 完整的 Simulink Agentic Toolkit 运行时。 */
export const MATHWORKS_DIR = join(PKG_DIR, 'mathworks')
export const MATLAB_MCP_EXE = join(MATHWORKS_DIR, 'matlab-mcp-server-windows-x64.exe')
/** Simulink Agentic Toolkit 运行时目录（MATLAB 侧 addpath 的目标）。 */
export const SIMULINK_TOOLKIT_DIR = join(MATHWORKS_DIR, 'simulink-agentic-toolkit')
/** Simulink 工具扩展文件（--extension-file 指向它）。 */
export const SIMULINK_TOOLS_FILE = join(SIMULINK_TOOLKIT_DIR, 'tools', 'tools.json')

/** 两个组件注册的服务器名（同时决定工具前缀 mcp__<name>__*）。 */
export const SERVER_NAMES = { mathworks: 'matlab-mcp', windows: 'windows-mcp' }

/** MATLAB MCP 的运行副本目录（在配置目录下，永远在工作区之外）。 */
export const MCP_RUNTIME_DIR = join(ARTIFACT_DIR, 'mcp')

/** mcp-client 的关闭预算；官方默认 5000。 */
const CLOSE_TIMEOUT_MS = 5000

/**
 * 取 MATLAB MCP 的可执行文件路径：优先用配置目录下的运行副本。
 *
 * 实测（2026-11-17）：exe 放在工作区目录树里（例如从仓库 junction 安装时的
 * `<工作区>/node_modules/dsh-zrwang-plugin/mathworks/...`）时，它无法在 `%TEMP%`
 * 下建日志目录，MCP 启动直接报 `Failed to create subdirectory` / 连接被关闭；
 * 同一个 exe 复制到工作区外（配置目录）就正常。所以这里把 exe 暂存到配置目录，
 * 按源文件大小 + 修改时间判断是否需要刷新；复制失败时退回原路径，不影响其他功能。
 */
export function stagedMatlabExe() {
  const target = join(MCP_RUNTIME_DIR, 'matlab-mcp-server-windows-x64.exe')
  const stampFile = `${target}.stamp`
  try {
    if (!existsSync(MATLAB_MCP_EXE)) return MATLAB_MCP_EXE
    const source = statSync(MATLAB_MCP_EXE)
    const signature = `${source.size}:${Math.round(source.mtimeMs)}`
    const previous = existsSync(target) && existsSync(stampFile) ? readFileSync(stampFile, 'utf8').trim() : ''
    if (previous === signature) return target
    mkdirSync(MCP_RUNTIME_DIR, { recursive: true })
    const temp = `${target}.${process.pid}.tmp`
    try {
      copyFileSync(MATLAB_MCP_EXE, temp)
      if (existsSync(target)) unlinkSync(target)
      renameSync(temp, target)
    } finally {
      if (existsSync(temp)) {
        try { unlinkSync(temp) } catch { /* 清理失败不影响运行副本 */ }
      }
    }
    writeFileSync(stampFile, `${signature}\n`, 'utf8')
    return target
  } catch {
    // 复制不了（权限/占用）时继续用包内路径；行为与修复前一致。
    return MATLAB_MCP_EXE
  }
}

/**
 * 组装 MATLAB MCP 的注册条目（stdio）。参数固定：existing 会话 + 插件自带扩展文件。
 */
export function resolveMatlabEntry() {
  return {
    transport: 'stdio',
    command: stagedMatlabExe(),
    args: ['--matlab-session-mode=existing', `--extension-file=${SIMULINK_TOOLS_FILE}`, '--disable-telemetry=true'],
    env: { WINDIR: 'C:\\Windows' },
    cwd: '',
    toolCallTimeoutMs: 120000,
    startupTimeoutMs: 30000,
    closeTimeoutMs: CLOSE_TIMEOUT_MS,
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
  }
}

/** 组件当前希望注册的条目；未开启时返回 undefined。 */
export function entryOf(want) {
  if (want.mathworks === true) return { name: SERVER_NAMES.mathworks, entry: resolveMatlabEntry() }
  if (want.windows === true) return { name: SERVER_NAMES.windows, entry: resolveWindowsEntry() }
  return undefined
}

/**
 * 单例控制器：维护本插件注册的服务器集合，串行执行对账。
 * @param {object} ctx - 插件上下文（用于 ctx.get('mcpManager') 与卸载清理）
 */
export function createMcpController(ctx) {
  /** @type {Map<string, () => void>} 已注册服务器 → 释放函数 */
  const disposers = new Map()
  /** @type {Map<string, string>} 注册失败原因 */
  const failures = new Map()
  /**
   * 每个会话各自想要的组件状态。组件注册是宿主全局的，取并集：
   * 只要还有一个会话（工作区模式）需要，就保持注册，避免切会话把别人的工具注销。
   * @type {Map<string, {mathworks: boolean, windows: boolean, at: number}>}
   */
  const wants = new Map()
  const WANT_LIMIT = 50
  let queue = Promise.resolve()

  const unionWant = () => {
    const merged = { mathworks: false, windows: false }
    for (const want of wants.values()) {
      if (want.mathworks === true) merged.mathworks = true
      if (want.windows === true) merged.windows = true
    }
    return merged
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

  const release = name => {
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
      { key: 'mathworks', name: SERVER_NAMES.mathworks, entry: () => resolveMatlabEntry() },
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
      register(target.name, target.entry())
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
    /** 当前受管服务器的状态（来自 mcpManager.list()）。 */
    status() {
      const mcp = manager()
      const available = mcp !== undefined && mcp !== null
      if (!available) {
        return {
          available: false,
          servers: [
            { name: SERVER_NAMES.mathworks, state: 'unavailable', attempt: 0, error: failures.get(SERVER_NAMES.mathworks) },
            { name: SERVER_NAMES.windows, state: 'unavailable', attempt: 0, error: failures.get(SERVER_NAMES.windows) },
          ].map(server => (server.error === undefined ? { name: server.name, state: server.state, attempt: server.attempt } : server)),
        }
      }
      let views = []
      try {
        views = typeof mcp.list === 'function' ? mcp.list() : []
      } catch (error) {
        return { available: true, servers: [], error: String(error?.message ?? error) }
      }
      const servers = views
        .filter(view => view.name === SERVER_NAMES.mathworks || view.name === SERVER_NAMES.windows)
        .map(view => {
          const status = view.status ?? {}
          const failure = failures.get(view.name)
          return {
            name: view.name,
            state: status.state ?? 'unknown',
            attempt: status.attempt ?? 0,
            ...(status.maxAttempts === undefined ? {} : { maxAttempts: status.maxAttempts }),
            ...(status.toolCount === undefined ? {} : { toolCount: status.toolCount }),
            ...(status.lastError === undefined ? {} : { lastError: status.lastError }),
            ...(status.reason === undefined ? {} : { reason: status.reason }),
            ...(failure === undefined ? {} : { error: failure }),
          }
        })
      for (const name of [...disposers.keys()]) {
        if (!servers.some(server => server.name === name)) servers.push({ name, state: 'unknown', attempt: 0 })
      }
      return { available: true, servers }
    },
    /** 重启一个已注册的服务器（重置重连预算，MATLAB 重开会话后也用它）。 */
    async restart(serverName) {
      const mcp = manager()
      if (mcp === undefined || mcp === null) return { ok: false, detail: '当前 profile 没有 MCP 管理器（仅 Web/桌面端支持）' }
      if (!disposers.has(serverName)) return { ok: false, detail: '该组件未开启，先勾选开启后再重启' }
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
    /** 插件卸载时注销全部服务器。 */
    disposeAll() {
      for (const name of [...disposers.keys()]) release(name)
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
    mathworks: gates?.engineering === true && Number(engineeringInjected) > 0,
    windows: gates?.['windows-mcp'] === true,
  }
}

const STATE_LABELS = {
  connected: '已连接',
  ready: '已连接',
  connecting: '连接中',
  reconnecting: '重连中',
  disconnected: '已断开',
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

/** 组件行显示的启动结果文案（成功时带工具数）。 */
function statusLabelOf(server) {
  const phase = phaseOf(server.state)
  if (phase === 'running') return server.toolCount === undefined ? '已启动' : `已启动（${server.toolCount} 个工具）`
  if (phase === 'starting') return server.attempt > 0 ? `启动中（第 ${server.attempt + 1} 次尝试）` : '启动中…'
  if (phase === 'failed') return '启动失败'
  if (phase === 'unavailable') return '当前 profile 不支持'
  return '未启动'
}

/**
 * 侧栏两个组件行的视图数据。
 * @param {{engineeringInjected: number, gates: object, status: object}} input
 */
export function componentViews({ engineeringInjected, gates, status }) {
  const want = wantOf({ engineeringInjected, gates })
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
    }
  }
  const componentOf = (id, label, kind, enabled, desc, hint, serverName) => {
    const server = viewOf(serverName, enabled)
    const phase = phaseOf(server.state)
    return {
      id,
      label,
      kind,
      enabled,
      desc,
      hint,
      phase,
      // 本会话没开、但别的会话还在用：界面上要能看出来，别让人以为工具没了。
      globallyActive: enabled !== true && (server.state === 'connected' || server.state === 'connecting' || server.state === 'reconnecting'),
      statusLabel: statusLabelOf(server),
      stateLabel: STATE_LABELS[server.state] ?? '状态未知',
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
        '随工程技能组自动开关；需要 MATLAB 正在运行并已执行 shareMATLABSession()',
        SERVER_NAMES.mathworks,
      ),
      componentOf(
        'windows-mcp',
        'Windows MCP组件',
        'manual',
        want.windows,
        '桌面截图、快照、点击、窗口操作',
        '勾选后注册 windows-mcp；会占用桌面控制权',
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
  const exe = stagedMatlabExe().split('\\').join('/')
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
      const error = server.error === undefined ? '' : `，${server.error}`
      parts.push(`${server.name}：${server.state}（第 ${server.attempt} 次尝试${error}）`)
    }
  }
  return {
    ok: problems.length === 0,
    detail: [...problems, ...parts].join(' · '),
    matlabInit: matlabInitCommand(),
    toolkitDir: SIMULINK_TOOLKIT_DIR,
  }
}
