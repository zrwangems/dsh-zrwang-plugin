/**
 * ARS 功能区块：清单、注入集合、依赖检查。
 *
 * 运行说明（`_shared/dsh-runtime.md`）由 `scripts/gen-ars-notes.mjs` 在 vendor/构建时
 * 生成并随包提交；运行期不再往包目录写文件。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ARS_DIR, PKG_DIR } from './config.mjs'
import { stateRoot } from './paths.mjs'
import { DEPENDENCIES, probePython, resolvePython } from './python.mjs'

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

/** 写进每个 ARS 技能的运行说明；内容与机器无关，构建时生成。 */
export function arsRuntimeNote() {
  return [
    '# DSH 下的 ARS 运行说明（由 dsh-zrwang-plugin 生成，不要手改）',
    '',
    '- Python：直接用 `python` / `python3`。DSH 插件已把它们指向用户在「设置 → 运行环境 → Python 解释器」里选定的系统解释器；插件不自带 Python，也不安装依赖。',
    '- 依赖缺失时按报错提示在所选 Python 环境里自行补齐，不要另建 venv，也不要改本技能目录里的文件。',
    '- bash：直接用 `bash` 代码块；插件已把 `bash` 指向系统的 Git Bash（Windows）或 `/bin/bash`（macOS/Linux）。',
    '- 本环境没有 Claude Code 的 hooks：上游的写作用域硬护栏不生效，请把上游的 `PreToolUse` 约束当作正文规则遵守。',
    '- 多角色流程（评审团、十阶段流水线、角色扮演）必须用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）；当前会话没有这些工具时，先提示用户开启 Agent Team，不要退化成单会话顺序扮演。',
    '- 路径约定：`references/`、`agents/`、`templates/` 相对本技能目录；`_shared/` 是上游仓库根的 `shared/`；`scripts/` 是上游 `scripts/` 用到的那部分（已并入本技能自带的脚本目录）。',
    '- 跨技能引用写成 `../<技能名>/...`：侧栏里 ARS 的五个技能要一起勾选才能互相读到；只勾一个时，缺文件的引用按提示降级。',
    '- `shared/` 与 `scripts/` 里的上游脚本可能假设仓库根布局，缺文件时按提示降级，不要因此中断流程。',
    '',
  ].join('\n')
}

/** 构建时把说明写进五个 ARS 技能；返回写入数量。 */
export function writeArsRuntimeNotes(root = ARS_DIR) {
  const note = arsRuntimeNote()
  let written = 0
  for (const name of ARS_SKILL_NAMES) {
    const dir = join(root, 'skills', name)
    if (!existsSync(dir)) continue
    const shared = join(dir, '_shared')
    mkdirSync(shared, { recursive: true })
    writeFileSync(join(shared, 'dsh-runtime.md'), note, 'utf8')
    written += 1
  }
  return written
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

function depsCacheFile() {
  return join(stateRoot(), 'ars-deps.json')
}

export function readDepsResult() {
  try {
    return JSON.parse(readFileSync(depsCacheFile(), 'utf8'))
  } catch {
    return undefined
  }
}

function persist(result) {
  try {
    mkdirSync(stateRoot(), { recursive: true })
    writeFileSync(depsCacheFile(), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  } catch {
    // 缓存写不了只影响展示
  }
}

/** 检查 Python 依赖；缺项只提示，不安装。 */
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

/** 本地时间戳，给设置页显示用。 */
export function localStamp(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
