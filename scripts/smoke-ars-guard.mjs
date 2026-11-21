#!/usr/bin/env node
/**
 * ARS 写作用域护栏冒烟：直接用上游 phase-scope 清单验证判定逻辑与
 * `tools/pre-execute` 接线，不启动 DSH，也不写仓库。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const {
  loadPhaseScope, roleFromPrompt, matchesAny, evaluateArsDecision,
  installArsWriteScopeGuard, PHASE_SCOPE_FILE,
} = await import('../host/ars-write-scope.mjs')
const { ARS_SKILL_NAMES } = await import('../host/ars.mjs')
const { ARS_DIR } = await import('../host/config.mjs')

const WORK = mkdtempSync(join(tmpdir(), 'ars-write-scope-'))
const WS = join(WORK, 'workspace')
mkdirSync(join(WS, 'phase3_a'), { recursive: true })
mkdirSync(join(WS, 'phase2_a'), { recursive: true })
mkdirSync(join(WS, 'phase4_a'), { recursive: true })

let total = 0
let failures = 0
function check(name, ok, detail) {
  total += 1
  if (!ok) {
    failures += 1
    process.stdout.write(`✗ ${name}${detail === undefined ? '' : `：${detail}`}\n`)
  }
}

const manifest = loadPhaseScope()
check('阶段清单可读', manifest?.agents !== undefined && Object.keys(manifest.agents).length === 23,
  manifest === undefined ? '未读到清单' : String(Object.keys(manifest.agents ?? {}).length))
const manifestFiles = ARS_SKILL_NAMES.map(name => join(ARS_DIR, 'skills', name, ...PHASE_SCOPE_FILE.split('/')))
check('五个技能都带同一份清单', manifestFiles.every(existsSync)
  && new Set(manifestFiles.map(file => readFileSync(file, 'utf8'))).size === 1)

check('ARS-ROLE 标记识别角色', roleFromPrompt('ARS-ROLE: synthesis_agent\n任务正文', manifest) === 'synthesis-agent')
check('角色文件 frontmatter 识别角色', roleFromPrompt('---\nname: synthesis-agent\ntools: Read\n---\n正文', manifest) === 'synthesis-agent')
check('You are the ... 角色声明识别角色', roleFromPrompt('You are the Research Architect. 请设计方法。', manifest) === 'research-architect-agent')

check('phase3 路径命中本阶段 glob', matchesAny('phase3_a/notes.md', ['phase3_*/**']))
check('裸文件名不会被当成 phase 目录', !matchesAny('phase3_a.md', ['phase3_*/**']))

const decide = (toolName, args, agentType = 'synthesis-agent') => evaluateArsDecision({
  toolName, args, cwd: WS, workspaceRoot: WS, agentType, manifest,
})

check('Bucket A 写本阶段目录放行', decide('write', { file_path: 'phase3_a/notes.md' }).kind === 'allow')
check('Bucket A 写其他阶段被拒', decide('write', { file_path: 'phase2_a/notes.md' }).kind === 'deny')
check('Bucket A 用 bash 被拒', decide('bash', { command: 'echo hi' }).kind === 'deny')
check('Bucket A 用 terminal_send 被拒', decide('terminal_send', { sessionId: 't', text: 'echo hi' }).kind === 'deny')
check('Bucket A 用 pwsh 被拒', decide('pwsh', { command: 'dir' }).kind === 'deny')
check('多文件补丁任一越界即拒绝', decide('apply_patch', {
  input: '*** Begin Patch\n*** Add File: phase3_a/a.md\n*** Update File: phase2_a/b.md\n*** End Patch',
}).kind === 'deny')
check('只改本阶段的多文件补丁放行', decide('apply_patch', {
  input: '*** Begin Patch\n*** Add File: phase3_a/a.md\n*** Update File: phase3_a/b.md\n*** End Patch',
}).kind === 'allow')
check('str_replace_editor 的 view 不拦', decide('str_replace_editor', { command: 'view', path: 'phase2_a/notes.md' }).kind === 'allow')
check('写入参数缺路径时拒绝', decide('write', {}).kind === 'deny')
check('逃出工作目录被拒', decide('write', { file_path: '../outside.md' }).kind === 'deny')
check('非 Bucket A 角色不受阶段限制', decide('write', { file_path: 'phase2_a/notes.md' }, 'report_compiler_agent').kind === 'allow')
check('主会话不受阶段限制', evaluateArsDecision({
  toolName: 'write', args: { file_path: 'phase2_a/notes.md' }, cwd: WS, workspaceRoot: WS, agentType: undefined, manifest,
}).kind === 'allow')
check('插件自身的护栏文件不能被改', evaluateArsDecision({
  toolName: 'write',
  args: { file_path: join(ARS_DIR, 'skills', 'deep-research', 'scripts', 'ars_phase_scope_manifest.json') },
  cwd: WS,
  workspaceRoot: WS,
  agentType: 'synthesis-agent',
  manifest,
}).kind === 'deny')

const fakeSession = (task, origin = 'subagent', id = 'sub-1') => ({
  id,
  header: { origin, cwd: WS },
  deriveMessages: () => [{ role: 'user', content: [{ type: 'text', text: task }] }],
})
const run = async (session, name, args) => {
  const handlers = {}
  installArsWriteScopeGuard({ on: (event, fn) => { handlers[event] = fn } })
  return handlers['tools/pre-execute']({ name, arguments: args, agent: { session } }, async () => ({ kind: 'allow' }))
}

const denied = await run(fakeSession('ARS-ROLE: synthesis-agent\n写阶段产物'), 'write', { file_path: 'phase2_a/notes.md' })
check('pre-execute 对越界写入返回 deny', denied.kind === 'deny')
const allowed = await run(fakeSession('ARS-ROLE: synthesis-agent\n写阶段产物', 'subagent', 'sub-2'), 'write', { file_path: 'phase3_a/notes.md' })
check('pre-execute 对本阶段写入放行', allowed.kind === 'allow')
const noMarker = await run(fakeSession('普通子任务，没有 ARS 角色标记', 'subagent', 'sub-3'), 'write', { file_path: 'phase2_a/notes.md' })
check('没有角色标记的子代理不被误拦', noMarker.kind === 'allow')
const main = await run(fakeSession('ARS-ROLE: synthesis-agent\n主会话里运行', 'main', 'main-1'), 'write', { file_path: 'phase2_a/notes.md' })
check('主会话即使带标记也不被拦', main.kind === 'allow')
const infraByOther = await run(fakeSession('普通子任务，没有 ARS 角色标记', 'subagent', 'sub-4'), 'write', {
  file_path: join(ARS_DIR, 'skills', 'deep-research', 'scripts', 'ars_phase_scope_manifest.json'),
})
check('没有角色标记的子代理也不能改插件护栏文件', infraByOther.kind === 'deny')

rmSync(WORK, { recursive: true, force: true })
process.stdout.write(`\nARS 写作用域护栏：通过 ${total - failures} 项，失败 ${failures} 项\n`)
process.exit(failures === 0 ? 0 : 1)
