/**
 * 系统 Python 选择与 ARS 支持。
 *
 * 插件不自带 Python、不安装任何 Python 或依赖：只用 host/python-detect.mjs 检测本机
 * Python，用户在设置页选择一个（或不选、自动用第一个可用的），插件把它写进
 * state/bin 的 python/python3 shim 并注入 PATH。
 *
 * 本模块负责：
 *   1. 按设置/检测结果选定解释器；
 *   2. 在 state/bin 生成 python/python3/bash shim 并注入 PATH；
 *   3. 写 ARS 各技能的 _shared/dsh-runtime.md；
 *   4. 检查 ARS 依赖（只读 import 检查，不安装）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { PKG_DIR, SKILLS_DIR, STATE_DIR } from './config.mjs'
import { DEPENDENCIES, probePython, selectPython } from './python-detect.mjs'

/** ARS 功能区块的元数据（由 vendor 生成，见 scripts/vendor-skills.mjs）。 */
export const ARS_MANIFEST_FILE = join(PKG_DIR, 'catalog', 'ars.json')

/** ARS 的五个技能目录名（与上游一致，kebab-case）。 */
export const ARS_SKILL_NAMES = [
  'deep-research',
  'academic-paper',
  'academic-paper-reviewer',
  'academic-pipeline',
  'sr-screener',
]

/** ARS 在插件里的相对位置（包根下的 ars/，不在 skills/ 里）。 */
export const ARS_DIR = join(PKG_DIR, 'ars')

let manifestCache

/** 读 catalog/ars.json：技能目录、命令清单、用法文档位置。 */
export function loadArsManifest() {
  if (manifestCache !== undefined) return manifestCache
  try {
    manifestCache = JSON.parse(readFileSync(ARS_MANIFEST_FILE, 'utf8'))
  } catch {
    manifestCache = undefined
  }
  return manifestCache
}

/**
 * 选定要用的系统 Python：设置里显式指定优先，否则用检测结果里第一个可用的。
 * 返回 { path, version, source, ok, missing }；没找到时 path 为空。
 */
export function resolvePython(params) {
  return selectPython(params)
}

/** 运行时 shim 目录：<state>/bin，仅由本插件管理。 */
export const SHIM_DIR = join(STATE_DIR, 'bin')

function pathKeyOf(env) {
  return Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
}

function pathParts(env) {
  const key = pathKeyOf(env)
  return String(env[key] ?? '').split(delimiter).filter(part => part.length > 0)
}

function setPathParts(env, parts) {
  env[pathKeyOf(env)] = parts.join(delimiter)
}

function removeShimFromPath(env) {
  setPathParts(env, pathParts(env).filter(part => part !== SHIM_DIR))
}

function prependShimToPath(env) {
  const parts = pathParts(env).filter(part => part !== SHIM_DIR)
  setPathParts(env, [SHIM_DIR, ...parts])
}

function writeShim(name, target) {
  const file = join(SHIM_DIR, name)
  const content = process.platform === 'win32'
    ? `@echo off\r\n"${target}" %*\r\n`
    : `#!/bin/sh\nexec "${target}" "$@"\n`
  writeFileSync(file, content, { encoding: 'utf8', mode: 0o755 })
}

/** 找 Git Bash（Windows）；没有就返回 undefined。 */
export function resolveGitBash() {
  const explicit = (process.env.ZRWANG_BASH ?? '').trim()
  if (explicit.length > 0 && existsSync(explicit)) return explicit
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const candidates = process.platform === 'win32'
    ? [join(programFiles, 'Git', 'bin', 'bash.exe'), join(programFiles, 'Git', 'usr', 'bin', 'bash.exe')]
    : ['/bin/bash', '/usr/bin/bash']
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * 生成/更新 python、python3、bash、sh 的 shim，并把 shim 目录放到 PATH 最前。
 * 指向用户选定（或自动选定）的系统 Python；没有可用解释器时不动 PATH。
 */
export function applyRuntimeEnv(params, options = {}) {
  const settingsFile = typeof options.settingsFile === 'string' ? options.settingsFile : ''
  const python = resolvePython(params)
  const bashEnvFile = join(SHIM_DIR, 'bash-env.sh')
  try {
    if (python.path.length > 0) {
      mkdirSync(SHIM_DIR, { recursive: true })
      writeShim('python.cmd', python.path)
      writeShim('python3.cmd', python.path)
      writeShim('python', python.path)
      writeShim('python3', python.path)
      // Git Bash 里 .cmd 不会被执行，用 BASH_ENV 注入 python/python3 函数。
      writeFileSync(
        bashEnvFile,
        `python() { "${python.path.replace(/\\/g, '/')}" "$@"; }\npython3() { "${python.path.replace(/\\/g, '/')}" "$@"; }\n`,
        'utf8',
      )
      prependShimToPath(process.env)
      process.env.BASH_ENV = bashEnvFile.replace(/\\/g, '/')
      process.env.ZRWANG_SKILL_PYTHON = python.path
      process.env.PYTHONUTF8 = '1'
      process.env.PYTHONIOENCODING = 'utf-8'
    } else {
      removeShimFromPath(process.env)
      delete process.env.ZRWANG_SKILL_PYTHON
    }
  } catch {
    // 状态目录不可写时不让插件启动失败；技能会因找不到插件 Python 报错。
    removeShimFromPath(process.env)
    delete process.env.ZRWANG_SKILL_PYTHON
  }
  const bash = resolveGitBash()
  try {
    if (bash !== undefined) {
      mkdirSync(SHIM_DIR, { recursive: true })
      writeShim('bash.cmd', bash)
      writeShim('sh.cmd', bash)
      writeShim('bash', bash)
      writeShim('sh', bash)
      prependShimToPath(process.env)
      process.env.ZRWANG_GIT_BASH = bash
    } else {
      for (const name of ['bash.cmd', 'sh.cmd', 'bash', 'sh']) {
        try {
          rmSync(join(SHIM_DIR, name), { force: true })
        } catch {
          // 文件不存在或被子进程占用时忽略
        }
      }
      delete process.env.ZRWANG_GIT_BASH
    }
  } catch {
    // 忽略 shim 写入失败
  }
  try {
    applyFirecrawlShim(settingsFile)
  } catch {
    // Firecrawl 未安装或 shim 生成失败时忽略
  }
  return { python, bash, shimDir: SHIM_DIR }
}

/**
 * Firecrawl CLI shim：DSH shell 会清洗 FIRECRAWL_API_KEY，这里生成一个同名 shim，
 * 由 scripts/firecrawl-shim.mjs 从插件 settings.json 读取 Key 后再调用真实 CLI。
 * 真实 CLI 来自 npm 全局安装（firecrawl-cli）；未安装时移除旧 shim。
 */
export function applyFirecrawlShim(settingsFile) {
  const shimCmd = join(SHIM_DIR, 'firecrawl.cmd')
  const shimSh = join(SHIM_DIR, 'firecrawl')
  const removeShims = () => {
    for (const file of [shimCmd, shimSh]) {
      try {
        rmSync(file, { force: true })
      } catch {
        // 忽略
      }
    }
  }
  if (typeof settingsFile !== 'string' || settingsFile.length === 0) {
    removeShims()
    return
  }
  let real
  try {
    const probe = process.platform === 'win32' ? 'where.exe' : 'which'
    const output = execFileSync(probe, ['firecrawl'], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    real = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(path => path.length > 0 && !path.toLowerCase().startsWith(SHIM_DIR.toLowerCase()))[0]
  } catch {
    real = undefined
  }
  if (real === undefined) {
    removeShims()
    return
  }
  const candidates = [
    join(dirname(real), 'node_modules', 'firecrawl-cli', 'dist', 'launcher.js'),
    join(dirname(real), '..', 'node_modules', 'firecrawl-cli', 'dist', 'launcher.js'),
  ]
  const launcher = candidates.find(existsSync)
  if (launcher === undefined) {
    removeShims()
    return
  }
  const shimScript = join(PKG_DIR, 'scripts', 'firecrawl-shim.mjs')
  if (!existsSync(shimScript)) {
    removeShims()
    return
  }
  mkdirSync(SHIM_DIR, { recursive: true })
  const toPosix = value => value.replace(/\\/g, '/')
  writeFileSync(
    shimCmd,
    `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${process.execPath}" "${shimScript}" "${settingsFile}" "${launcher}" %*\r\n`,
    { encoding: 'utf8', mode: 0o755 },
  )
  writeFileSync(
    shimSh,
    `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec "${toPosix(process.execPath)}" "${toPosix(shimScript)}" "${toPosix(settingsFile)}" "${toPosix(launcher)}" "$@"\n`,
    { encoding: 'utf8', mode: 0o755 },
  )
  prependShimToPath(process.env)
}

/** 生成写进每个技能的运行时说明（内容对五个技能一致）。 */
export function arsRuntimeNote(params) {
  const python = resolvePython(params)
  const bash = resolveGitBash()
  // 包内路径用相对形式写，避免把安装者机器的绝对路径固化进技能文件
  const display = python.path.startsWith(PKG_DIR)
    ? python.path.slice(PKG_DIR.length + 1).split('\\').join('/')
    : python.path
  const missing = Array.isArray(python.missing) ? python.missing : []
  const lines = [
    '# DSH 下的 ARS 运行说明（由 dsh-zrwang-plugin 生成，不要手改）',
    '',
    `- Python 解释器：${python.path.length > 0 ? `系统 Python（\`${display || python.path}\`，来源：${python.source}）` : '未选择可用的系统 Python（设置 → 运行环境 → Python 解释器）'}。插件不自带 Python，也不安装任何依赖。`,
    missing.length > 0
      ? `- 该环境缺少模块：${missing.join(', ')}；插件不会安装，请在该 Python 环境里自行补齐后重试。`
      : '- 依赖检查通过；插件已把 python / python3 指向上面的解释器，不要另建 venv。',
    `- bash：${bash === undefined ? '未找到 Git Bash' : `已指向 \`${bash}\``}；bash 代码块可以直接执行，不要依赖没有发行版的 WSL。`,
    '- 本环境没有 Claude Code 的 hooks：上游的写作用域硬护栏不生效，请把上游的 `PreToolUse` 约束当作正文规则遵守。',
    '- 多角色流程（评审团、十阶段流水线、角色扮演）必须用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）；当前会话没有这些工具时，先提示用户开启 Agent Team，不要退化成单会话顺序扮演。',
    '- 子代理角色默认在同一会话内顺序扮演；确实需要并行时用 DSH 的 `subagent` 或 Agent Team。',
    '- 路径约定：`references/`、`agents/`、`templates/` 相对本技能目录；`_shared/` 是上游仓库根的 `shared/`；`scripts/` 是上游 `scripts/` 用到的那部分（已并入本技能自带的脚本目录）。',
    '- 跨技能引用写成 `../<技能名>/...`：右侧栏里 ARS 的五个技能要一起勾选才能互相读到；只勾一个时，缺文件的引用按提示降级。',
    '- `shared/` 与 `scripts/` 里的上游脚本可能假设仓库根布局，缺文件时按提示降级，不要因此中断流程。',
    '',
  ]
  return lines.join('\n')
}

/** 把运行时说明写进每个已收录的 ARS 技能；root 缺省是包内 skills/ 下的 ARS 根。 */
export async function writeArsRuntimeNotes(params, root = ARS_DIR) {
  const note = arsRuntimeNote(params)
  let written = 0
  for (const name of ARS_SKILL_NAMES) {
    const dir = join(root, 'skills', name)
    if (!existsSync(dir)) continue
    const shared = join(dir, '_shared')
    mkdirSync(shared, { recursive: true })
    writeFileSync(join(shared, 'dsh-runtime.md'), note, 'utf8')
    written += 1
  }
  return { written, python: resolvePython(params) }
}

function depsCacheFile() {
  return join(STATE_DIR, 'ars-deps.json')
}

/** 读上一次依赖检查结果（设置页展示用）。 */
export function readDepsResult() {
  try {
    return JSON.parse(readFileSync(depsCacheFile(), 'utf8'))
  } catch {
    return undefined
  }
}

/** 检查 Python 依赖。缺项给出安装建议；Python 本身缺失时直接返回失败。 */
export function checkArsDeps(params) {
  const python = resolvePython(params)
  const base = {
    checkedAt: new Date().toISOString(),
    checkedAtLocal: localStamp(),
    python: python.path,
    pythonSource: python.source,
  }
  if (python.path.length === 0) {
    const result = { ...base, ok: false, missing: DEPENDENCIES.map(item => item.package), detail: '未选择可用的系统 Python（设置 → 运行环境 → Python 解释器）' }
    persist(result)
    return result
  }
  const probe = probePython(python.path)
  if (probe.ok !== true) {
    const result = { ...base, ok: false, missing: [], detail: `检查失败：${probe.error ?? '无法运行该解释器'}` }
    persist(result)
    return result
  }
  const missing = DEPENDENCIES.filter(item => probe.missing.includes(item.module))
  const result = {
    ...base,
    ok: missing.length === 0,
    missing: missing.map(item => item.package),
    detail: missing.length === 0 ? `依赖齐全（Python ${probe.version}）` : `缺 ${missing.length} 项（Python ${probe.version}）`,
    hint: missing.length === 0 ? '' : '插件不会安装依赖；请在你选择的 Python 环境里自行补齐这些包',
  }
  persist(result)
  return result
}

function persist(result) {
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    writeFileSync(depsCacheFile(), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  } catch {
    // 状态目录不可写时忽略，只是少一次展示
  }
}

/** 本地时间戳，给设置页显示用（不用 toISOString，避免显示 UTC）。 */
export function localStamp(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 把 ARS 的五个技能并进目标注入集合；enabled 必须显式为 true 才注入（默认关闭）。 */
export function mergeArsSkills(desired, enabled = false) {
  if (enabled !== true) return desired
  const ars = loadArsManifest()
  if (ars === undefined) return desired
  for (const skill of ars.skills ?? []) {
    if (!desired.has(skill.name)) desired.set(skill.name, skill)
  }
  return desired
}

/** 当前运行时参数（供 vendor 写 ARS 说明使用）。 */
export function arsParams(pluginConfig) {
  void pluginConfig
  return { python: resolvePython(undefined).path }
}
