/**
 * 平台差异集中在这里，业务代码不再直接出现 explorer.exe / tasklist / netstat。
 *
 * 全部函数都不抛错：探测失败按“没找到/不知道”返回，由调用方决定展示文案。
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const isWindows = process.platform === 'win32'
export const isMac = process.platform === 'darwin'

function read(command, args, timeout = 10_000) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      timeout,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

/** Windows 上可直接被 CreateProcess 执行的后缀（按 PATHEXT）。 */
const EXECUTABLE_EXT = /\.(?:exe|cmd|bat|com)$/i

/**
 * PATH 里是否有一个可执行命令；返回第一个绝对路径。
 *
 * Windows 的 npm 全局目录同时有 `lark-cli`（给 bash 的 sh 脚本）、
 * `lark-cli.cmd` 和 `lark-cli.ps1`，而 where.exe 会把无后缀的那个排在最前。
 * 直接返回它会让 execFileSync 失败（不是 .exe），所以优先挑 PATHEXT 里的后缀。
 */
export function which(name) {
  if (typeof name !== 'string' || name.trim().length === 0) return undefined
  const command = isWindows ? 'where.exe' : 'which'
  const output = read(command, [name])
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0)
  const first = isWindows
    ? (lines.find(line => EXECUTABLE_EXT.test(line)) ?? lines[0])
    : lines[0]
  return first !== undefined && existsSync(first) ? first : undefined
}

function quoteCmdArgument(value) {
  const text = String(value)
  return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * 带 UTF-8 输出的同步命令调用。
 *
 * Windows 上 `.cmd` / `.bat` 不能交给 CreateProcess 直接执行（npm 全局装的 CLI
 * 常常只有 .cmd），必须经 `cmd.exe /c` 转一层；`.exe` 与 POSIX 命令照常直调。
 */
export function execFileText(command, args = [], options = {}) {
  const base = { encoding: 'utf8', windowsHide: true, ...options }
  if (isWindows && /\.(?:cmd|bat)$/i.test(command)) {
    const comspec = process.env.ComSpec ?? 'cmd.exe'
    const line = [quoteCmdArgument(command), ...args.map(quoteCmdArgument)].join(' ')
    // cmd /s /c 的惯例：整条命令再包一层引号（`cmd /c ""C:\a b\x.cmd" arg"`）。
    return execFileSync(comspec, ['/d', '/s', '/c', `"${line}"`], { ...base, windowsVerbatimArguments: true })
  }
  return execFileSync(command, args, base)
}

/** 用系统默认程序打开一个路径；返回是否成功发起。 */
export function openPath(path) {
  try {
    if (isWindows) {
      const child = spawnDetached('explorer.exe', [path])
      return child
    }
    const command = isMac ? 'open' : 'xdg-open'
    return spawnDetached(command, [path])
  } catch {
    return false
  }
}

function spawnDetached(command, args) {
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
    return true
  } catch {
    return false
  }
}

/** 运行中的进程 id（Windows 用 tasklist，POSIX 用 pgrep）。 */
export function processIds(name) {
  if (typeof name !== 'string' || name.length === 0) return []
  if (isWindows) {
    const output = read('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/FO', 'CSV', '/NH'])
    const pattern = new RegExp(`"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}","(\\d+)"`, 'gi')
    return [...output.matchAll(pattern)].map(match => Number(match[1]))
  }
  const output = read('pgrep', ['-x', name])
  return output.split(/\r?\n/).map(Number).filter(Number.isSafeInteger)
}

/** 监听某个端口的进程 id；查不到返回 undefined。 */
export function listeningPid(port) {
  if (!Number.isSafeInteger(port) || port <= 0) return undefined
  if (isWindows) {
    const output = read('netstat', ['-ano', '-p', 'TCP'])
    for (const line of output.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 5 || !/^TCP/i.test(parts[0])) continue
      if (!/:(\d+)$/.test(parts[1]) || Number(/(\d+)$/.exec(parts[1])[1]) !== port) continue
      if (!/LISTEN/i.test(parts[3])) continue
      const pid = Number(parts[4])
      return Number.isSafeInteger(pid) ? pid : undefined
    }
    return undefined
  }
  const output = read('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
  const pid = Number(output.split(/\r?\n/)[0])
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
}


/** 读 Windows 卸载注册表里某个程序的名字；非 Windows 返回 undefined。 */
export function registryDisplayIcon(match, platform = process.platform) {
  if (platform !== 'win32') return undefined
  const reg = process.env.SystemRoot === undefined
    ? 'reg.exe'
    : join(process.env.SystemRoot, 'System32', 'reg.exe')
  const hives = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]
  for (const hive of hives) {
    const output = read(reg, ['query', hive, '/s', '/f', match, '/t', 'REG_SZ'], 15_000)
    for (const line of output.split(/\r?\n/)) {
      const found = /([A-Za-z]:[\\/][^\r\n"]*\.exe)(?:,\s*0)?/i.exec(line)
      if (found !== null && existsSync(found[1].trim())) return found[1].trim()
    }
  }
  return undefined
}
