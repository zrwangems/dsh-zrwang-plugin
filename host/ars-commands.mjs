/**
 * ARS 斜杠命令：把上游 `commands/ars-*.md` 的 16 个入口注册成 DSH 原生 `/ars-*` 命令。
 *
 * DSH 的命令默认"不产生模型消息"，但命令处理器可以调用 `agent.followup(message)`
 * 投递一条用户消息；这就是 Claude Code 里"命令展开成提示词"的等价实现。
 * 命令正文直接取 vendor 生成的别名技能 SKILL.md（与技能同一份源，不二次维护）。
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PKG_DIR } from './config.mjs'
import { loadArsManifest } from './ars.mjs'
import { loadGates } from './gates.mjs'

const cache = new Map()
let registered = 0

/** 已注册的命令数（/health 里展示，便于确认命令面是否挂上）。 */
export function arsCommandCount() {
  return registered
}

/** 读某条命令的指令正文：别名技能的 SKILL.md 去掉 frontmatter。 */
export function commandInstruction(command) {
  const hit = cache.get(command.name)
  if (hit !== undefined) return hit
  const file = join(PKG_DIR, ...String(command.source).split('/'))
  let body = ''
  try {
    const text = readFileSync(file, 'utf8')
    const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)
    body = match === null ? text : text.slice(match[0].length)
  } catch {
    body = `执行 ARS 命令 /${command.name}。`
  }
  const value = body.trim()
  cache.set(command.name, value)
  return value
}

/** 拼出投递给模型的用户消息：命令说明 + 用户本次输入 + 语言约束。 */
export function buildCommandPrompt(command, rawInput) {
  const input = typeof rawInput === 'string' ? rawInput.trim() : ''
  return [
    `执行 ARS 命令 /${command.name}（用户在输入框显式调用）。`,
    '',
    commandInstruction(command),
    '',
    input.length > 0 ? `用户本次输入：${input}` : '用户本次没有附输入，按技能要求向用户追问缺什么。',
    '',
    '输出语言：一律使用简体中文（英文术语与引文除外）；不要使用繁体中文。用户明确要求其他语言时以用户为准。',
    '',
    '多角色执行（评审团、流水线、角色扮演）必须用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）拉起；当前会话没有这些工具时，先提示用户在模型菜单里开启「智能体团队协作」，不要退化成单会话顺序扮演。',
    '',
    '授权声明：本次多角色流程由用户在输入框显式调用 /' + command.name + ' 发起，用户已授权为此拉起 Agent Team / 子代理，团队协作开关也已由插件打开。',
    '不要再询问「是否允许开启 subagent / Agent Team」这类问题，那条"先问再开"的规则针对的是你自发派生的子任务，不适用于用户点名的命令；直接 spawn_teammate 并按技能要求推进，最后汇总结果。',
  ].join('\n')
}

/** DSH 的 UserMessage 结构（等价于 @deepseek-ai/dsh-llm 的 createUserMessage）。 */
function userMessage(text) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }
}

let commandScope
let quits = []

/**
 * 需要 Agent Team 的命令：这些模式会拉起多个角色（评审团、流水线、翻译/评审并行），
 * 没有团队工具就不允许执行。纯单角色入口（/ars-plan 的苏格拉底对话、缓存清理、
 * 阅读标记）不在此列。
 */
const TEAM_REQUIRED = new Set([
  'ars-full', 'ars-lit-review', 'ars-reviewer', 'ars-revision', 'ars-revision-coach',
  'ars-outline', 'ars-abstract', 'ars-citation-check', 'ars-format-convert', 'ars-disclosure',
  'ars-rebuttal-audit', 'ars-3w',
])

/**
 * 当前会话是否挂上了 Agent Team（多角色流程的硬依赖）。
 *
 * 先问 `agentTeams` 服务：DSH 的 Team 工具是按 `when: ({ agent }) => isEnabled(agent)` 条件注册的，
 * 而 `tools.get(name, scope)` 在没有「本步已准入工具集」时看不到条件注册的工具，所以直接查工具表
 * 会一直返回 undefined（2026-11-18 实测：界面已开「智能体团队协作」，门禁仍报没开）。
 * 拿不到服务（旧版本）时退回工具表检查。
 */
export function teamToolsAvailable(agent) {
  const teams = commandScope?.get?.('agentTeams')
  if (teams !== undefined && typeof teams.isEnabled === 'function') {
    try {
      return teams.isEnabled(agent) === true
    } catch {
      return false
    }
  }
  const tools = commandScope?.get?.('tools')
  if (tools === undefined || typeof tools.get !== 'function') return false
  return tools.get('spawn_teammate', agent) !== undefined
}

/** 命令是否需要 Agent Team（给自检与文档用）。 */
export function commandNeedsTeam(name) {
  return TEAM_REQUIRED.has(name)
}

/**
 * 多角色命令执行前打开团队协作：`agentTeams.setEnabled(agent, true)`。
 * 用户显式调用 /ars-* 就表示要用多角色流程，这里替他点一下开关，不用再去模型菜单手动开。
 * 只有根会话能改（DSH 规定 TEAM_LEAD_REQUIRED）；子会话里调用会失败，退回提示。
 */
export async function enableTeamFor(agent) {
  const teams = commandScope?.get?.('agentTeams')
  if (teams === undefined || typeof teams.setEnabled !== 'function') return false
  try {
    await teams.setEnabled(agent, true)
  } catch {
    return false
  }
  return teamToolsAvailable(agent) === true
}

/**
 * 记住带 commands 服务的上下文，并按当前开关同步命令面。
 * 关掉 ARS 时命令会从斜杠菜单里消失，而不是"留着但执行时报错"。
 */
export function attachArsCommands(scope) {
  commandScope = scope
}

/** 注册命令时用的 input 描述：没有输入提示的命令直接执行，不进输入态。 */
export function commandInput(command) {
  const hint = typeof command.hint === 'string' ? command.hint.trim() : ''
  return hint.length > 0 ? { hint } : undefined
}

/** 执行一条 ARS 命令：开关检查 + Agent Team 检查 + 把指令投递给模型。可单测。 */
export async function runArsCommand(command, agent, rawInput) {
  try {
    const gates = await loadGates()
    if (gates.ars !== true) {
      return { kind: 'error', text: 'ARS 已在右侧栏关闭，先勾选「学术研究（ARS）」再执行命令。' }
    }
    let teamReady = true
    let teamToggled = false
    if (TEAM_REQUIRED.has(command.name)) {
      teamReady = teamToolsAvailable(agent)
      // 开关关着就替用户打开（显式调用 /ars-* 已经是"要用多角色"的表达）。
      if (!teamReady) {
        teamToggled = await enableTeamFor(agent)
        teamReady = teamToggled
      }
      if (!teamReady) {
        return {
          kind: 'error',
          text: 'ARS 的多角色流程依赖 DSH 的 Agent Team，但没能自动打开团队协作。请在输入框上方的模型菜单里打开「启用智能体团队协作」，再执行命令。',
        }
      }
    }
    agent.followup(userMessage(buildCommandPrompt(command, rawInput)))
    return { kind: 'success', text: teamToggled ? `已开启智能体团队协作，并提交 /${command.name}` : `已提交 /${command.name}` }
  } catch (error) {
    return { kind: 'error', text: `执行 /${command.name} 失败：${String(error?.message ?? error)}` }
  }
}

/** 按开关注册/注销全部 ARS 命令；幂等，可反复调用。 */
export function syncArsCommands(enabled) {
  const manifest = loadArsManifest()
  if (commandScope === undefined || manifest === undefined) return registered
  const commands = commandScope.commands ?? commandScope.get?.('commands')
  if (commands === undefined || typeof commands.register !== 'function') return registered
  const wanted = enabled === true ? (manifest.commands ?? []) : []
  if (registered === wanted.length) return registered
  for (const quit of quits) {
    try {
      quit()
    } catch {
      // 注销失败不影响后续同步
    }
  }
  quits = []
  registered = 0
  for (const command of wanted) {
    const dispose = commands.register({
      name: command.name,
      description: command.description,
      ...(commandInput(command) === undefined ? {} : { input: commandInput(command) }),
      handler: invocation => runArsCommand(command, invocation.agent, invocation.rawInput),
    })
    quits.push(typeof dispose === 'function' ? dispose : () => {})
    registered += 1
  }
  return registered
}

/** 插件卸载时收尾：注销全部命令。 */
export function detachArsCommands() {
  for (const quit of quits) {
    try {
      quit()
    } catch {
      // 忽略卸载期异常
    }
  }
  quits = []
  registered = 0
  commandScope = undefined
}

/** 用法文档（详情按钮）内容。 */
export function arsUsageDoc() {
  const manifest = loadArsManifest()
  const file = join(PKG_DIR, ...String(manifest?.doc ?? 'docs/ars-usage.md').split('/'))
  if (!existsSync(file)) return undefined
  return readFileSync(file, 'utf8')
}
