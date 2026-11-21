/**
 * ARS 写作用域护栏（DSH 版）。
 *
 * 上游用 Claude Code 的 PreToolUse hook 实现：单阶段（Bucket A）角色被作为独立
 * 子代理派发时，只能写自己阶段目录（phaseN_* 下的文件），并且不能用 Bash。
 * DSH 没有 PreToolUse hook，但有官方的 `tools/pre-execute` waterfall；这里在
 * 每个 agent 自己的 ctx 上挂一个监听器，把上游 `scripts/ars_write_scope_guard.py`
 * 的判定逻辑逐条搬过来。
 *
 * 与上游一致的部分：
 *   - 只约束“作为子代理运行的 Bucket A 角色”，主会话和 Bucket B/C/D 角色不拦；
 *   - 结构化写入按工作目录解析、realpath 归一化，先查插件自身的护栏文件，再查
 *     是否逃出工作目录，最后按清单里的 allowed_write_globs 判断；
 *   - Bucket A 角色的 bash / pwsh / terminal_send 一律拒绝（无法从命令串可靠判断
 *     读写，全拒绝是唯一不会 fail-open 的策略）；
 *   - 参数形状不符（没有 file_path / 补丁里没有路径）时拒绝，避免静默放行。
 *
 * 与上游不同的部分：
 *   - 角色来源：DSH 的 subagent 没有 `agent_type` 字段，改用子代理任务 prompt 里的
 *     `ARS-ROLE: <角色名>` 标记（推荐），并兼容 prompt 开头的角色文件 frontmatter
 *     `name:` 与 `You are the ... Agent.` 角色声明；
 *   - 多文件补丁：`apply_patch` 会对补丁里的每个目标逐一检查，任一越界即整单拒绝。
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { ARS_DIR, PKG_DIR } from './config.mjs'
import { ARS_SKILL_NAMES } from './ars.mjs'
import { canonicalPath } from './path-utils.mjs'
import { isShellTool, isWriteTool, writeTargets } from './write-targets.mjs'

/** 每个技能 scripts/ 下都带一份上游清单；任取第一份可读的。 */
export const PHASE_SCOPE_FILE = 'scripts/ars_phase_scope_manifest.json'

/** 上游清单里 Bucket A 角色名到当前名字的旧称映射（与上游 guard 一致）。 */
const LEGACY_AGENT_NAMES = {
  synthesis_agent: 'synthesis-agent',
  research_architect_agent: 'research-architect-agent',
  report_compiler_agent: 'report-compiler-agent',
  screening_reviewer_agent: 'screening-reviewer-agent',
}

/** 插件自己的护栏文件：任何角色都不能通过写工具改。 */
const INFRA_PROTECTED_GLOBS = [
  'host/index.mjs',
  'host/ars-write-scope.mjs',
  'host/write-targets.mjs',
  'host/path-utils.mjs',
  'host/skill-guard.mjs',
  '**/ars_phase_scope_manifest.json',
  'ars_phase_scope_manifest.json',
  '**/ars_write_scope_guard.py',
  'ars_write_scope_guard.py',
]

const INSPECTED_TOOLS = new Set(['write', 'edit', 'apply_patch', 'str_replace_editor', 'bash', 'pwsh', 'terminal_send'])

let manifestCache

/** 读上游的 phase-scope 清单；找不到时返回 undefined（护栏放行，不阻断会话）。 */
export function loadPhaseScope() {
  if (manifestCache !== undefined) return manifestCache
  for (const name of ARS_SKILL_NAMES) {
    const file = join(ARS_DIR, 'skills', name, ...PHASE_SCOPE_FILE.split('/'))
    if (!existsSync(file)) continue
    try {
      manifestCache = JSON.parse(readFileSync(file, 'utf8'))
      return manifestCache
    } catch {
      // 坏文件继续找下一份
    }
  }
  manifestCache = undefined
  return manifestCache
}

/** 只读测试用：清掉模块级缓存。 */
export function resetPhaseScopeCache() {
  manifestCache = undefined
}

/** 是否是需要检查的工具。 */
export function isInspectedTool(name) {
  return INSPECTED_TOOLS.has(name)
}

/** 这个会话是不是 subagent（主会话不受 Slice 1 约束）。 */
export function isSubagentSession(session) {
  const header = session?.header
  if (header === undefined || header === null) return false
  return header.origin === 'subagent' || (Number(header.delegationDepth) || 0) > 0
}

function contentText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(block => (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
}

/** 子代理的第一条 user 消息就是派发任务；角色声明/标记通常在它的开头。 */
export function initialTaskPrompt(session) {
  if (typeof session?.deriveMessages !== 'function') return ''
  try {
    for (const message of session.deriveMessages()) {
      if (message?.role === 'user') return contentText(message.content)
    }
  } catch {
    // 会话日志还没准备好时不要影响工具调用
  }
  return ''
}

function canonicalAgentName(value) {
  return String(value).trim().replace(/^academic-research-skills:/, '').replace(/_/g, '-').toLowerCase()
}

/** 把标记/frontmatter/角色标题得到的名字对到清单里的实际 key。 */
function manifestKeyFor(candidate, agents) {
  if (typeof candidate !== 'string' || candidate.length === 0) return undefined
  const legacy = LEGACY_AGENT_NAMES[candidate] ?? candidate
  if (agents[legacy] !== undefined) return legacy
  const wanted = canonicalAgentName(legacy)
  for (const key of Object.keys(agents)) {
    if (canonicalAgentName(key) === wanted) return key
  }
  // “Research Architect”这类角色标题会少一个 -agent 后缀。
  for (const key of Object.keys(agents)) {
    if (canonicalAgentName(key) === `${wanted}-agent`) return key
  }
  return undefined
}

const ROLE_MARKER = /(?:^|\n)\s*(?:>\s*|\[)?ARS-ROLE\s*(?:[:=]\s*)?[*_`]*<?\s*([A-Za-z0-9_.:-]+)/i
const FRONTMATTER_NAME = /^---\r?\n[\s\S]{0,4000}?^name:\s*([A-Za-z0-9_.-]+)/m
const ROLE_SENTENCE = /You are the ([A-Za-z][A-Za-z0-9 &'’_-]{1,80}?)(?:\.|\n)/

/** 从一段任务 prompt 里认出 Bucket A 角色；认不出返回 undefined。 */
export function roleFromPrompt(text, manifest = loadPhaseScope()) {
  const agents = manifest?.agents ?? {}
  if (typeof text !== 'string' || text.length === 0 || Object.keys(agents).length === 0) return undefined
  const marker = ROLE_MARKER.exec(text)
  if (marker !== null) {
    const key = manifestKeyFor(marker[1], agents)
    if (key !== undefined) return key
  }
  const front = FRONTMATTER_NAME.exec(text)
  if (front !== null) {
    const key = manifestKeyFor(front[1], agents)
    if (key !== undefined) return key
  }
  const sentence = ROLE_SENTENCE.exec(text)
  if (sentence !== null) {
    const title = sentence[1].trim().replace(/[’']/g, '').replace(/&/g, 'and')
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const key = manifestKeyFor(slug, agents)
    if (key !== undefined) return key
  }
  return undefined
}

function fnmatchSegment(segment, pattern) {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
  const flags = process.platform === 'win32' ? 'i' : ''
  return new RegExp(`^${source}$`, flags).test(segment)
}

/** 与上游 `_match_segments` 相同的迭代匹配：`**` 至少吃一段，不会匹配到目录本身。 */
function matchSegments(pathSegments, patternSegments) {
  const n = pathSegments.length
  const m = patternSegments.length
  const stack = [[0, 0]]
  const seen = new Set()
  while (stack.length > 0) {
    const [i, j] = stack.pop()
    const state = `${i}:${j}`
    if (seen.has(state)) continue
    seen.add(state)
    if (j === m) {
      if (i === n) return true
      continue
    }
    const head = patternSegments[j]
    if (head === '**') {
      if (i < n) {
        stack.push([i + 1, j + 1])
        stack.push([i + 1, j])
      }
      continue
    }
    if (i < n && fnmatchSegment(pathSegments[i], head)) stack.push([i + 1, j + 1])
  }
  return false
}

function splitPath(value) {
  return String(value).split('/').filter(item => item !== '' && item !== '.')
}

/** 工作目录相对路径是否命中任一 glob。 */
export function matchesAny(relPath, globs) {
  let normalized = String(relPath).replace(/^\.\//, '')
  if (sep === '\\') normalized = normalized.replace(/\\/g, '/')
  const segments = splitPath(normalized)
  return (globs ?? []).some(glob => matchSegments(segments, splitPath(glob)))
}

/** 目标是不是插件自身的护栏文件（锚定插件根，而不是用户工作目录）。 */
export function isInfraTarget(rawPath, cwd, pluginRoot = PKG_DIR) {
  if (typeof rawPath !== 'string' || rawPath.length === 0 || !pluginRoot) return false
  const target = canonicalPath(isAbsolute(rawPath) ? rawPath : resolve(cwd ?? process.cwd(), rawPath))
  const root = canonicalPath(pluginRoot)
  const rel = relative(root, target)
  if (rel === '' || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) return false
  return matchesAny(rel.split(sep).join('/'), INFRA_PROTECTED_GLOBS)
}

/** 相对工作目录归一化；逃出工作目录时 escaped=true（Windows 跨盘也算逃出）。 */
export function normalizeTarget(rawPath, cwd, workspaceRoot) {
  const target = canonicalPath(isAbsolute(rawPath) ? rawPath : resolve(cwd ?? workspaceRoot, rawPath))
  const root = canonicalPath(workspaceRoot)
  const rel = relative(root, target)
  const escaped = isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)
  return { rel: rel.split(sep).join('/') || '.', escaped }
}

const BASH_REASON = role => `ARS 写作用域护栏：${role} 是单阶段代理，不能使用 bash / pwsh / terminal_send。请用 read / grep / glob 检索，用 write / edit / apply_patch 写文件，写入会被限制在本阶段目录。Bash 被整体拒绝，因为无法从命令串可靠判断它是否写文件（上游 spec §3.2/§3.3/§7）。`

/**
 * 纯判定函数：给定一次工具调用，返回 allow / deny。
 * @returns {{kind: 'allow'} | {kind: 'deny', reason: string}}
 */
export function evaluateArsDecision(input) {
  const {
    toolName,
    args,
    cwd,
    workspaceRoot,
    agentType,
    pluginRoot = PKG_DIR,
    manifest = loadPhaseScope(),
  } = input ?? {}
  const name = typeof toolName === 'string' ? toolName : ''
  if (!isInspectedTool(name)) return { kind: 'allow' }
  const agents = manifest?.agents ?? {}
  const isBucketA = typeof agentType === 'string' && agentType.length > 0 && agents[agentType] !== undefined

  if (isShellTool(name)) {
    return isBucketA ? { kind: 'deny', reason: BASH_REASON(agentType) } : { kind: 'allow' }
  }

  const extracted = writeTargets(name, args)
  if (extracted.schemaDrift) {
    return {
      kind: 'deny',
      reason: `ARS 写作用域护栏：${name} 的参数里没有可识别的写入路径（file_path 或补丁目标），为避免静默放行而拒绝。请检查工具参数。`,
    }
  }
  if (!isWriteTool(name) || extracted.paths.length === 0) return { kind: 'allow' }

  const root = workspaceRoot ?? cwd ?? process.cwd()
  for (const raw of extracted.paths) {
    if (isInfraTarget(raw, cwd ?? root, pluginRoot)) {
      return {
        kind: 'deny',
        reason: `ARS 写作用域护栏：${raw} 是插件的护栏文件（写作用域清单或 guard 本身），ARS 子代理不能修改。`,
      }
    }
  }

  const relativeTargets = []
  for (const raw of extracted.paths) {
    const { rel, escaped } = normalizeTarget(raw, cwd ?? root, root)
    if (escaped) {
      if (isBucketA) {
        return {
          kind: 'deny',
          reason: `ARS 写作用域护栏：${agentType} 的写入目标 ${raw} 逃出了会话工作目录（路径穿越），已拒绝。`,
        }
      }
      continue
    }
    relativeTargets.push(rel)
  }

  if (!isBucketA) return { kind: 'allow' }

  const allowed = agents[agentType]?.allowed_write_globs ?? []
  for (const rel of relativeTargets) {
    if (!matchesAny(rel, allowed)) {
      return {
        kind: 'deny',
        reason: `ARS 写作用域护栏：${agentType} 不能写 ${rel}（不在本阶段允许的路径 ${allowed.join(', ')} 内）。请把本阶段产物写进对应的 phase 目录，其余工作交回派发方。`,
      }
    }
  }
  return { kind: 'allow' }
}

/** 从一次 pre-execute 的 exec 对象解析角色并判定。 */
export function evaluateExecution(exec, options = {}) {
  const name = typeof exec?.name === 'string' ? exec.name : ''
  if (!isInspectedTool(name)) return { kind: 'allow' }
  const session = exec?.agent?.session ?? options.session
  if (!isSubagentSession(session)) return { kind: 'allow' }
  const prompt = options.prompt ?? initialTaskPrompt(session)
  const manifest = options.manifest ?? loadPhaseScope()
  const agentType = roleFromPrompt(prompt, manifest)
  const cwd = session?.header?.cwd ?? exec?.agent?.cwd ?? process.cwd()
  return evaluateArsDecision({
    toolName: name,
    args: exec?.arguments,
    cwd,
    workspaceRoot: cwd,
    agentType,
    pluginRoot: options.pluginRoot ?? PKG_DIR,
    manifest,
  })
}

/**
 * 挂到 agent 自己的 ctx 上。只对本 agent 的工具调用生效，主会话没有子代理身份时直接放行。
 */
export function installArsWriteScopeGuard(agentCtx, options = {}) {
  if (typeof agentCtx?.on !== 'function') return () => {}
  const roles = new Map()
  const listener = async (exec, next) => {
    const name = typeof exec?.name === 'string' ? exec.name : ''
    if (!isInspectedTool(name)) return next()
    const session = exec?.agent?.session ?? options.session
    if (!isSubagentSession(session)) return next()
    const sessionId = session?.id ?? options.sessionId
    let agentType = sessionId === undefined ? undefined : roles.get(sessionId)
    if (agentType === undefined) {
      agentType = roleFromPrompt(initialTaskPrompt(session), options.manifest ?? loadPhaseScope())
      if (agentType !== undefined && sessionId !== undefined) roles.set(sessionId, agentType)
    }
    const cwd = session?.header?.cwd ?? exec?.agent?.cwd ?? process.cwd()
    const decision = evaluateArsDecision({
      toolName: name,
      args: exec?.arguments,
      cwd,
      workspaceRoot: cwd,
      agentType,
      pluginRoot: options.pluginRoot ?? PKG_DIR,
      manifest: options.manifest ?? loadPhaseScope(),
    })
    return decision.kind === 'deny' ? decision : next()
  }
  const dispose = agentCtx.on('tools/pre-execute', listener)
  return typeof dispose === 'function' ? dispose : () => {}
}
