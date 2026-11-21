/**
 * 系统 Python 检测与校验（插件不安装任何 Python 或依赖）。
 *
 * 只做三件事：
 *   1. 扫描本机可用的 Python 解释器（PATH、py 启动器、conda 环境、常见安装目录）；
 *   2. 逐个校验版本与技能所需第三方模块（只读检查，绝不调用 pip / uv 安装）；
 *   3. 结果缓存到 state/python-candidates.json，供设置页展示和用户选择。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { isMac, isWindows, which } from './platform.mjs'
import { PKG_DIR, stateRoot } from './paths.mjs'

const STATE_DIR = stateRoot()
const SHIM_ROOT = join(PKG_DIR, 'host', 'shim')

/** ARS / 技能脚本需要的第三方模块（找不到只提示，不安装）。 */
export const DEPENDENCIES = [
  { module: 'yaml', name: 'PyYAML', package: 'pyyaml' },
  { module: 'jsonschema', name: 'jsonschema', package: 'jsonschema' },
  { module: 'ruamel.yaml', name: 'ruamel.yaml', package: 'ruamel.yaml' },
  { module: 'pypdf', name: 'pypdf', package: 'pypdf' },
  { module: 'defusedxml', name: 'defusedxml', package: 'defusedxml' },
  { module: 'openpyxl', name: 'openpyxl', package: 'openpyxl' },
  { module: 'requests', name: 'requests', package: 'requests' },
  { module: 'PIL', name: 'Pillow', package: 'pillow' },
  { module: 'pptx', name: 'python-pptx', package: 'python-pptx' },
  { module: 'docx', name: 'python-docx', package: 'python-docx' },
  { module: 'fitz', name: 'PyMuPDF', package: 'pymupdf' },
  { module: 'openai', name: 'openai', package: 'openai' },
  { module: 'playwright', name: 'playwright', package: 'playwright' },
]

const CACHE_FILE = join(STATE_DIR, 'python-candidates.json')
const CACHE_TTL_MS = 5 * 60 * 1000
const PROBE_TIMEOUT_MS = 8000
const MAX_PROBES = 12

let memoryCache

function run(command, args, timeout = 6000) {
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

function findCommands(names) {
  const found = []
  for (const name of names) {
    const candidate = which(name)
    if (candidate !== undefined) found.push({ path: candidate, source: `PATH: ${name}` })
  }
  return found
}

function pyLauncherEntries() {
  if (process.platform !== 'win32') return []
  const output = run('py', ['-0p'])
  const entries = []
  for (const line of output.split(/\r?\n/)) {
    const match = /([A-Za-z]:\\.*?python\.exe)\s*$/i.exec(line.trim())
    if (match !== null && existsSync(match[1])) entries.push({ path: match[1], source: 'py 启动器' })
  }
  return entries
}

function condaEntries() {
  const entries = []
  const json = run('conda', ['env', 'list', '--json'], 10000)
  if (json.length > 0) {
    try {
      const parsed = JSON.parse(json)
      for (const dir of parsed.envs ?? []) {
        const python = process.platform === 'win32' ? join(dir, 'python.exe') : join(dir, 'bin', 'python3')
        if (existsSync(python)) entries.push({ path: python, source: `conda: ${dir}` })
      }
    } catch {
      // conda 输出损坏时忽略，继续扫描常见目录
    }
  }
  const condaPrefix = process.env.CONDA_PREFIX
  if (condaPrefix !== undefined && condaPrefix.length > 0) {
    const python = process.platform === 'win32' ? join(condaPrefix, 'python.exe') : join(condaPrefix, 'bin', 'python3')
    if (existsSync(python)) entries.push({ path: python, source: 'CONDA_PREFIX' })
  }
  return entries
}

function scanSubdirs(parent, pattern, suffix) {
  const entries = []
  if (parent === undefined || parent.length === 0 || !existsSync(parent)) return entries
  let children = []
  try {
    children = readdirSync(parent, { withFileTypes: true })
  } catch {
    return entries
  }
  for (const child of children) {
    if (!child.isDirectory() || !pattern.test(child.name)) continue
    const candidate = join(parent, child.name, suffix)
    if (existsSync(candidate)) entries.push({ path: candidate, source: `目录: ${parent}` })
  }
  return entries
}

function knownDirEntries() {
  const entries = []
  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA ?? ''
    const programFiles = process.env.ProgramFiles ?? ''
    entries.push(...scanSubdirs(join(localAppData, 'Programs', 'Python'), /^Python\d/i, 'python.exe'))
    entries.push(...scanSubdirs(programFiles, /^Python\d/i, 'python.exe'))
    for (const dir of ['anaconda3', 'miniconda3', 'AppData/Local/anaconda3', 'AppData/Local/miniconda3']) {
      const candidate = join(process.env.USERPROFILE ?? '', ...dir.split('/'), 'python.exe')
      if (existsSync(candidate)) entries.push({ path: candidate, source: `目录: ${dir}` })
    }
  } else {
    for (const candidate of ['/usr/bin/python3', '/usr/local/bin/python3', '/opt/homebrew/bin/python3']) {
      if (existsSync(candidate)) entries.push({ path: candidate, source: '系统目录' })
    }
    for (const dir of ['.pyenv/shims', '.local/bin']) {
      const candidate = join(process.env.HOME ?? '', ...dir.split('/'), 'python3')
      if (existsSync(candidate)) entries.push({ path: candidate, source: `目录: ${dir}` })
    }
  }
  if (isMac) {
    for (const candidate of ['/opt/homebrew/bin/python3', '/usr/local/bin/python3']) {
      if (existsSync(candidate)) entries.push({ path: candidate, source: 'Homebrew' })
    }
  }
  const stateDir = String(STATE_DIR).toLowerCase()
  for (const part of pathDirsFiltered(stateDir)) {
    if (!/python|anaconda|miniconda|conda/i.test(part)) continue
    const candidate = join(part, isWindows ? 'python.exe' : 'python3')
    if (existsSync(candidate)) entries.push({ path: candidate, source: 'PATH 目录' })
  }
  return entries
}

function pathDirsFiltered(stateDir) {
  return String(process.env.PATH ?? '').split(delimiter).filter(part => part.length > 0 && !part.toLowerCase().startsWith(stateDir))
}

function collectCandidates() {
  const collected = [
    ...findCommands(['python', 'python3']),
    ...pyLauncherEntries(),
    ...condaEntries(),
    ...knownDirEntries(),
  ]
  const stateDir = String(STATE_DIR).toLowerCase()
  const seen = new Set()
  const unique = []
  for (const item of collected) {
    const key = item.path.toLowerCase()
    if (key.startsWith(stateDir)) continue
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }
  return unique
}

/** 校验一个解释器：版本 + 依赖模块（只 import，不安装）。 */
export function probePython(path) {
  const code = [
    'import importlib, json, sys',
    'mods = json.loads(sys.argv[1])',
    'missing = []',
    'for item in mods:',
    '    try:',
    '        importlib.import_module(item)',
    '    except Exception:',
    '        missing.append(item)',
    'print(json.dumps({"version": sys.version.split()[0], "executable": sys.executable, "missing": missing}))',
  ].join('\n')
  const output = run(path, ['-c', code, JSON.stringify(DEPENDENCIES.map(item => item.module))], PROBE_TIMEOUT_MS)
  const lines = output.split(/\r?\n/).filter(line => line.trim().length > 0)
  const last = lines.length > 0 ? lines[lines.length - 1] : ''
  try {
    const parsed = JSON.parse(last)
    return {
      path,
      ok: true,
      version: String(parsed.version ?? ''),
      executable: String(parsed.executable ?? path),
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
    }
  } catch {
    return { path, ok: false, version: '', executable: path, missing: [], error: '无法运行该解释器' }
  }
}

function versionParts(version) {
  return String(version).split('.').map(part => Number.parseInt(part, 10) || 0)
}

function compareVersion(left, right) {
  const a = versionParts(left.version)
  const b = versionParts(right.version)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (b[i] ?? 0) - (a[i] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

/** 扫描并校验系统 Python；结果写缓存。 */
export function detectPythons(options = {}) {
  const force = options.force === true
  if (!force && memoryCache !== undefined && Date.now() - memoryCache.at < CACHE_TTL_MS) return memoryCache.value
  if (!force) {
    const cached = readPythonCandidates()
    if (cached !== undefined && Date.now() - new Date(cached.detectedAt).getTime() < CACHE_TTL_MS) {
      memoryCache = { at: Date.now(), value: cached }
      return cached
    }
  }
  const candidates = []
  for (const item of collectCandidates().slice(0, MAX_PROBES)) {
    if (isPluginShim(item.path)) continue
    const probe = probePython(item.path)
    candidates.push({ ...item, ...probe })
  }
  candidates.sort((left, right) => {
    if (left.ok !== right.ok) return left.ok ? -1 : 1
    const leftReady = left.ok && left.missing.length === 0
    const rightReady = right.ok && right.missing.length === 0
    if (leftReady !== rightReady) return leftReady ? -1 : 1
    return compareVersion(left, right)
  })
  const value = { detectedAt: new Date().toISOString(), candidates }
  memoryCache = { at: Date.now(), value }
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(CACHE_FILE, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  } catch {
    // 状态目录不可写时仍返回本次结果
  }
  return value
}

/** 读上一次检测结果（不做扫描）。 */
export function readPythonCandidates() {
  try {
    const parsed = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    if (Array.isArray(parsed.candidates)) {
      parsed.candidates = parsed.candidates.filter(item => !isPluginShim(item.path))
      return parsed
    }
  } catch {
    // 未检测或缓存损坏
  }
  return undefined
}

function isPluginShim(path) {
  return typeof path === 'string' && (path === SHIM_ROOT || path.startsWith(`${SHIM_ROOT}${process.platform === 'win32' ? '\\' : '/'}`))
}

function autoCandidate() {
  const cached = readPythonCandidates()
  if (cached !== undefined) {
    const usable = cached.candidates.filter(item => item.ok === true && !isPluginShim(item.path))
    const ready = usable.find(item => item.missing.length === 0)
    const chosen = ready ?? usable[0]
    if (chosen !== undefined) return { ...chosen, source: `自动（${chosen.source}）` }
  }
  const probe = findCommands(['python', 'python3']).find(item => !isPluginShim(item.path))
  if (probe !== undefined) return { path: probe.path, ok: false, version: '', missing: [], source: `自动（${probe.source}，尚未校验）` }
  return undefined
}

/**
 * 选定要用的解释器：设置里显式指定优先，否则用检测结果里第一个可用的。
 * 返回 { path, version, source, ok, missing }；没有可用解释器时 path 为空。
 */
export function selectPython(params) {
  const explicit = typeof params?.python?.path === 'string' ? params.python.path.trim() : ''
  if (explicit.length > 0) {
    if (isPluginShim(explicit)) return { path: '', version: '', missing: [], ok: false, source: '不能选择插件自己的转发脚本' }
    if (!existsSync(explicit)) return { path: '', version: '', missing: [], ok: false, source: `设置指定的 Python 不存在：${explicit}` }
    const cached = readPythonCandidates()?.candidates?.find(item => item.path.toLowerCase() === explicit.toLowerCase())
    return cached === undefined
      ? { path: explicit, version: '', missing: [], ok: true, source: '设置指定（尚未校验）' }
      : { ...cached, source: '设置指定' }
  }
  const auto = autoCandidate()
  return auto ?? { path: '', version: '', missing: [], ok: false, source: '未找到可用的系统 Python（请在设置页检测并选择）' }
}

/** 兼容命名：业务模块统一叫 resolvePython。 */
export const resolvePython = selectPython
