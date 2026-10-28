/**
 * ARS（academic-research-skills）运行环境支持。
 *
 * 只做两件事：
 *   1. 找出本机可用的 Python 解释器，写进各技能目录的 `_shared/dsh-runtime.md`；
 *   2. 按需检查 ARS 脚本所需的 Python 依赖。
 *
 * 不注册钩子、不改提示词、不拦截工具调用——注入许可完全由侧边栏勾选决定。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PKG_DIR, SKILLS_DIR, STATE_DIR } from './config.mjs'
import { readParams } from './plugin-params.mjs'

/** ARS 功能区块的元数据（由 vendor 生成，见 scripts/vendor-skills.mjs）。 */
export const ARS_MANIFEST_FILE = join(PKG_DIR, 'catalog', 'ars.json')

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

/** ARS 脚本用到的第三方依赖检查表。 */
const DEPENDENCIES = [
  { module: 'yaml', name: 'PyYAML', package: 'pyyaml' },
  { module: 'jsonschema', name: 'jsonschema', package: 'jsonschema' },
  { module: 'ruamel.yaml', name: 'ruamel.yaml', package: 'ruamel.yaml' },
  { module: 'pypdf', name: 'pypdf', package: 'pypdf' },
  { module: 'defusedxml', name: 'defusedxml', package: 'defusedxml' },
  { module: 'openpyxl', name: 'openpyxl', package: 'openpyxl' },
]

/** 试跑一个解释器，返回可执行路径或 undefined。 */
function probe(candidate) {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) return undefined
  try {
    execFileSync(candidate, ['-c', 'import sys'], { stdio: 'ignore', timeout: 8000 })
    return candidate
  } catch {
    return undefined
  }
}

/** 常见 conda 环境里的解释器路径候选。 */
function condaCandidates() {
  const home = homedir()
  return [
    join(home, 'anaconda3', 'envs', 'Agentpy', 'python.exe'),
    join(home, 'miniconda3', 'envs', 'Agentpy', 'python.exe'),
    join('D:', 'anaconda3', 'envs', 'Agentpy', 'python.exe'),
    join('C:', 'anaconda3', 'envs', 'Agentpy', 'python.exe'),
    join(home, 'anaconda3', 'python.exe'),
    join('D:', 'anaconda3', 'python.exe'),
  ]
}

/**
 * 解析要用的 Python：设置里的优先，其次 PATH 上的 python/python3，最后常见 conda 路径。
 * 返回 { path, source }；都找不到时 path 为空字符串。
 */
export function resolvePython(params) {
  const configured = params?.ars?.python ?? params?.python
  const hit = probe(configured)
  if (hit !== undefined) return { path: hit, source: '设置' }
  for (const name of ['python', 'python3', 'py']) {
    const found = probe(name)
    if (found !== undefined) return { path: found, source: 'PATH' }
  }
  for (const candidate of condaCandidates()) {
    const found = probe(candidate)
    if (found !== undefined) return { path: found, source: '常见 conda 路径' }
  }
  return { path: '', source: '未找到' }
}

/** 生成写进每个技能的运行时说明（内容对五个技能一致）。 */
export function arsRuntimeNote(params) {
  const python = resolvePython(params)
  const lines = [
    '# DSH 下的 ARS 运行说明（由 dsh-zrwang-plugin 生成，不要手改）',
    '',
    `- Python 解释器：${python.path.length > 0 ? `\`${python.path}\`（来源：${python.source}）` : '未找到，请在「设置 → ARS 设置」里填写'}`,
    '- 运行本技能 `scripts/` 下的脚本时用上面的解释器；不要用系统里可能存在的 Microsoft Store 空壳 `python3`。',
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

/**
 * 检查 Python 依赖。缺项给出安装建议；Python 本身缺失时直接返回失败。
 * 结果写进 state/ars-deps.json 供设置页显示。
 */
export function checkArsDeps(params) {
  const python = resolvePython(params)
  const base = {
    checkedAt: new Date().toISOString(),
    checkedAtLocal: localStamp(),
    python: python.path,
    pythonSource: python.source,
  }
  if (python.path.length === 0) {
    const result = { ...base, ok: false, missing: DEPENDENCIES.map(item => item.package), detail: '未找到可用的 Python 解释器' }
    persist(result)
    return result
  }
  const code = [
    'import importlib, json, sys',
    'mods = json.loads(sys.argv[1])',
    'missing = []',
    'for item in mods:',
    '    try:',
    '        importlib.import_module(item)',
    '    except Exception:',
    '        missing.append(item)',
    'print(json.dumps(missing))',
  ].join('\n')
  try {
    const out = execFileSync(python.path, ['-c', code, JSON.stringify(DEPENDENCIES.map(item => item.module))], {
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const missingModules = JSON.parse(out.trim() || '[]')
    const missing = DEPENDENCIES.filter(item => missingModules.includes(item.module))
    const result = {
      ...base,
      ok: missing.length === 0,
      missing: missing.map(item => item.package),
      detail: missing.length === 0 ? '依赖齐全' : `缺 ${missing.length} 项`,
      hint: missing.length === 0 ? '' : `"${python.path}" -m pip install ${missing.map(item => item.package).join(' ')}`,
    }
    persist(result)
    return result
  } catch (error) {
    const result = { ...base, ok: false, missing: [], detail: `检查失败：${String(error?.message ?? error).slice(0, 200)}` }
    persist(result)
    return result
  }
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

/** 当前 ARS 参数（缺默认值）。 */
export function arsParams(pluginConfig) {
  const stored = readParams(pluginConfig ?? {})
  const ars = stored?.ars ?? {}
  return { python: typeof ars.python === 'string' ? ars.python : '' }
}
