#!/usr/bin/env node
/**
 * 宿主半侧冒烟：不装 DSH，用桩上下文验证项目根、勾选门禁、目录联接增删、
 * 同名冲突与 ppt-master 项目目录链接。
 *
 * 运行时会临时改 STATE_DIR 到 AgentsDo 下的测试目录，结束后清理，不污染 state/。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const WORK = resolve(import.meta.dirname, '..', '..', 'AgentsDo', 'skill-management-20261027', 'tmp', 'smoke')
rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })
process.env.ZRWANG_PLUGIN_STATE_DIR = join(WORK, 'state')
// 运行时目录树读 DSH 家目录下的配置目录；测试必须隔离，不能碰用户真实 ~/.dsh。
process.env.DSH_HOME = join(WORK, 'home')
const runtimeConfigDir = join(WORK, 'home', 'zrwang-plugin-config')
mkdirSync(runtimeConfigDir, { recursive: true })
writeFileSync(join(runtimeConfigDir, 'catalog.json'), `${JSON.stringify({ version: 1, generatedAt: '2000-01-01T00:00:00.000Z', stats: { total: 0 }, defaults: [], groups: [], skills: {} })}\n`, 'utf8')
writeFileSync(join(runtimeConfigDir, 'defaults.json'), `${JSON.stringify({ version: 1, generatedAt: '2000-01-01T00:00:00.000Z', skills: [] })}\n`, 'utf8')

const { loadCatalog, skillsInGroup } = await import('../host/catalog.mjs')
const { loadSelection, desiredSkills, setSelection } = await import('../host/selection.mjs')
const { buildEffectiveGates } = await import('../host/selection.mjs')
const { resolveProjectRoot } = await import('../host/project.mjs')
const { reconcile } = await import('../host/farm.mjs')
const { SKILLS_DIR } = await import('../host/config.mjs')

let failures = 0
function check(name, ok, detail) {
  if (ok) {
    process.stdout.write(`ok   ${name}\n`)
    return
  }
  failures += 1
  process.stderr.write(`FAIL ${name}${detail === undefined ? '' : `：${detail}`}\n`)
}

function isInside(parent, child) {
  const a = realpathSync.native(parent).toLowerCase()
  const b = realpathSync.native(child).toLowerCase()
  return b === a || b.startsWith(a + '\\')
}

const catalog = await loadCatalog()
// 上面预置了 2000 年的旧运行时目录树，loadCatalog 应该已经用包内种子刷新它。
const seedCatalog = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'catalog', 'catalog.json'), 'utf8'))
const refreshedRuntimeCatalog = JSON.parse(readFileSync(join(runtimeConfigDir, 'catalog.json'), 'utf8'))
check(
  '旧运行时目录树被包内种子自动刷新',
  catalog.stats.total === seedCatalog.stats.total && refreshedRuntimeCatalog.generatedAt === seedCatalog.generatedAt,
  `runtime=${catalog.stats.total}/${refreshedRuntimeCatalog.generatedAt} seed=${seedCatalog.stats.total}/${seedCatalog.generatedAt}`,
)
const selection = await loadSelection(catalog)
// 目录复选框显示：按“子树里有没有勾选技能”自下而上推导；一级目录保持显式门禁
const effectiveDefault = buildEffectiveGates(catalog, {}, selection)
const engineeringChildren = catalog.groups.find(group => group.id === 'engineering').children ?? []
// 工程组三类下都含默认勾选技能（MathWorks其他 的 playground 有一个默认技能），
// 用科研组里没有默认勾选的子树验证“未勾选子树显示为未勾选”。
const outerDirs = (catalog.groups.find(group => group.id === 'research').children ?? []).filter(node => node.kind !== 'skill')
const firstEmptyDir = outerDirs.find(node => !(catalog.defaults ?? []).some(name => {
  const walk = item => item.kind === 'skill' ? item.name === name : (item.children ?? []).some(walk)
  return walk(node)
}))
const matlabDir = engineeringChildren.find(node => node.id === 'matlab')
check('未勾选子树的多级目录显示为未勾选', firstEmptyDir !== undefined && effectiveDefault[firstEmptyDir.id] === false, JSON.stringify({ id: firstEmptyDir?.id, value: firstEmptyDir === undefined ? null : effectiveDefault[firstEmptyDir.id] }))
check('有勾选子树的多级目录显示为已勾选', effectiveDefault[matlabDir.id] === true)
check('一级目录仍按显式门禁且默认全不勾',
  ['engineering', 'research', 'office'].every(id => effectiveDefault[id] === false) && effectiveDefault.ars !== true)
check('显式关闭可以覆盖推导结果', buildEffectiveGates(catalog, { [matlabDir.id]: false }, selection)[matlabDir.id] === false)

const arsDocs = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'catalog', 'ars.json'), 'utf8'))
const catalogNames = new Set(Object.keys(catalog.skills))
check('目录树与 ARS 技能不重名', (arsDocs.skills ?? []).every(skill => !catalogNames.has(skill.name)))
check('新增技能默认全部关闭', ['bgpt-paper-search', 'supervisor-deep-research', 'nsfc-write', 'lieflat-charts', 'frontend-slides']
  .every(name => !(catalog.defaults ?? []).includes(name)))

// ---- 项目根 ----
const proj = join(WORK, 'proj-with-git')
mkdirSync(join(proj, '.git'), { recursive: true })
const nested = join(proj, 'deep', 'nested')
mkdirSync(nested, { recursive: true })
check('项目根取最近 .git 祖先', resolveProjectRoot(nested) === proj)
const noGit = join(WORK, 'no-git')
mkdirSync(noGit, { recursive: true })
check('无 .git 时用 cwd', resolveProjectRoot(noGit) === noGit)

// ---- 一级门禁 ----
const engineering = skillsInGroup(catalog, 'engineering')
const research = skillsInGroup(catalog, 'research')
const off = desiredSkills(catalog, selection, { engineering: false, research: false, office: false })
check('三类全关时目标集合为空', off.size === 0, String(off.size))
// ARS 是第四行固定区块：三类全关也默认注入它的五个技能，关掉 gates.ars 才不注入
const { mergeArsSkills } = await import('../host/ars.mjs')
mergeArsSkills(off, true)
check('显式开启后注入 ARS 五个技能', off.size === 5 && ['deep-research', 'academic-paper', 'academic-paper-reviewer', 'academic-pipeline', 'sr-screener'].every(name => off.has(name)), String(off.size))
check('ARS 默认关闭不注入', mergeArsSkills(new Map()).size === 0)
// 16 条命令正文都能生成给模型的指令（要求保留上游细节，不是空壳）
const { loadArsManifest } = await import('../host/ars.mjs')
const { buildCommandPrompt } = await import('../host/ars-commands.mjs')
const arsManifest = loadArsManifest()
const arsPrompts = (arsManifest?.commands ?? []).map(command => buildCommandPrompt(command, '示例输入'))
check('ARS 命令正文可生成', arsPrompts.length === 16 && arsPrompts.every(text => text.includes('执行 ARS 命令 /') && text.length > 300), String(arsPrompts.length))
check('命令提示声明用户已授权拉起 Agent Team',
  arsPrompts.every(text => text.includes('授权声明') && text.includes('不要再询问')), String(arsPrompts.length))
check('ARS 命令都声明输入提示', (arsManifest?.commands ?? []).every(command => typeof command.hint === 'string' && command.hint.length > 0), String((arsManifest?.commands ?? []).length))
// 技能文件护栏：只拦插件内 skills/ 与 ars/ 的写操作
const { guardReason } = await import('../host/skill-guard.mjs')
const { join: joinPath } = await import('node:path')
const guardCases = [
  ['拦 AGENTS 技能写入', joinPath(SKILLS_DIR, 'engineering', 'matlab', 'matlab-core', 'SKILL.md'), true],
  ['拦 ARS 技能写入', joinPath(SKILLS_DIR, '..', 'ars', 'skills', 'deep-research', 'SKILL.md'), true],
  ['放行插件代码', joinPath(SKILLS_DIR, '..', 'host', 'index.mjs'), false],
  ['放行普通文档', joinPath(SKILLS_DIR, '..', 'README.md'), false],
]
for (const [label, target, expectDenied] of guardCases) {
  const denied = guardReason(target, WORK) !== undefined
  check(label, denied === expectDenied, `denied=${denied}`)
}
// 多角色命令必须依赖 Agent Team；单角色命令（plan/缓存/阅读标记）不依赖
const { commandNeedsTeam, attachArsCommands, teamToolsAvailable } = await import('../host/ars-commands.mjs')
check('多角色命令需要 Agent Team',
  commandNeedsTeam('ars-reviewer') && commandNeedsTeam('ars-full') && commandNeedsTeam('ars-lit-review')
  && !commandNeedsTeam('ars-plan') && !commandNeedsTeam('ars-cache-invalidate'),
  String(commandNeedsTeam('ars-reviewer')))
// 团队协作开关从 agentTeams 服务读：DSH 的 Team 工具是条件注册的，查工具表看不到
const fakeAgent = { id: 'agent-team-probe' }
attachArsCommands({
  get: name => {
    if (name === 'agentTeams') return { isEnabled: agent => agent === fakeAgent }
    if (name === 'tools') return { get: () => undefined }
    return undefined
  },
})
check('团队协作开启时放行多角色命令', teamToolsAvailable(fakeAgent) === true)
check('团队协作关闭时拦截多角色命令', teamToolsAvailable({ id: 'other-agent' }) === false)
// 旧版本没有 agentTeams 服务时，退回工具表检查
attachArsCommands({
  get: name => {
    if (name === 'tools') return { get: toolName => (toolName === 'spawn_teammate' ? {} : undefined) }
    return undefined
  },
})
check('没有 agentTeams 服务时退回工具表检查', teamToolsAvailable(fakeAgent) === true)
attachArsCommands({ get: () => undefined })
check('两种来源都拿不到时不放行', teamToolsAvailable(fakeAgent) === false)
// 显式调用多角色命令时自动打开团队协作
{
  let teamOn = false
  const followed = []
  const fakeAgent = { id: 'auto-team-probe', followup: message => followed.push(message) }
  attachArsCommands({
    get: name => {
      if (name === 'agentTeams') {
        return {
          isEnabled: agent => teamOn && agent === fakeAgent,
          setEnabled: async (agent, enabled) => {
            if (agent !== fakeAgent) throw new Error('TEAM_LEAD_REQUIRED')
            teamOn = enabled === true
          },
        }
      }
      return undefined
    },
  })
  const { runArsCommand } = await import('../host/ars-commands.mjs')
  const arsGates = await import('../host/gates.mjs')
  await arsGates.setGates({ ars: true })
  const autoRun = await runArsCommand({ name: 'ars-reviewer', source: 'ars/skills/academic-paper-reviewer/SKILL.md' }, fakeAgent, '示例')
  check('多角色命令自动打开团队协作', autoRun.kind === 'success' && teamOn === true && followed.length === 1, JSON.stringify(autoRun))
  // 子会话里改不了团队开关：仍应给出明确错误而不是静默失败
  teamOn = false
  const subRun = await runArsCommand({ name: 'ars-reviewer', source: 'ars/skills/academic-paper-reviewer/SKILL.md' }, { id: 'sub-agent', followup: () => {} }, '示例')
  check('改不了团队开关时报出可操作错误', subRun.kind === 'error' && subRun.text.includes('启用智能体团队协作'), JSON.stringify(subRun))
  await arsGates.setGates({ ars: false })
}
// 复原：别把桩作用域留给后续检查
const { detachArsCommands } = await import('../host/ars-commands.mjs')
detachArsCommands()
// 通过项目里的联接写技能，也必须被识别（realpath 回插件目录）
const junctionProject = joinPath(WORK, 'guard-proj')
const junctionSkills = joinPath(junctionProject, '.agents', 'skills')
mkdirSync(junctionSkills, { recursive: true })
const junctionPick = joinPath(SKILLS_DIR, 'engineering', 'matlab', 'matlab-core')
const junctionLink = joinPath(junctionSkills, 'matlab-core')
try {
  const { symlink: makeLink } = await import('node:fs/promises')
  await makeLink(junctionPick, junctionLink, 'junction')
  check('拦通过联接写入技能', guardReason(joinPath(junctionLink, 'references', 'x.md')) !== undefined)
} catch (error) {
  check('拦通过联接写入技能', false, String(error?.message ?? error))
}
const on = desiredSkills(catalog, selection, { engineering: true, research: false, office: false })
const expectedEngineering = engineering.filter(node => selection.skills[node.name] === true).length
check('只开工程时目标只含工程已勾选', on.size === expectedEngineering, `${on.size} vs ${expectedEngineering}`)
check('工程目标不含科研技能', research.every(node => !on.has(node.name)))
const leafNames = node => node.kind === 'skill' ? [node.name] : (node.children ?? []).flatMap(leafNames)
const matlabNode = catalog.groups.find(group => group.id === 'engineering').children.find(node => node.id === 'matlab')
const gated = desiredSkills(catalog, selection, { engineering: true, matlab: false }, {})
check('关闭 MATLAB 目录只影响该子树', gated.size < on.size && leafNames(matlabNode).every(name => !gated.has(name)))

// ---- 联接增删 ----
const skillsDir = join(proj, '.agents', 'skills')
const pick = engineering.find(node => node.name === 'matlab-create-live-script') ?? engineering[0]
const first = new Map([[pick.name, pick]])
const r1 = await reconcile({ projectRoot: proj, desired: first })
check('建立联接', r1.added === 1 && existsSync(join(skillsDir, pick.name)), JSON.stringify(r1))
check('联接指向插件技能目录', realpathSync(join(skillsDir, pick.name)) === realpathSync(join(SKILLS_DIR, ...String(pick.dir).split('/'))))
const r2 = await reconcile({ projectRoot: proj, desired: new Map() })
check('取消后摘除联接且实体仍在', r2.removed === 1 && !existsSync(join(skillsDir, pick.name)) && existsSync(join(SKILLS_DIR, ...String(pick.dir).split('/'))))

// ---- 同名冲突 ----
const second = engineering.find(node => node.name !== pick.name)
const realDir = join(skillsDir, second.name)
mkdirSync(realDir, { recursive: true })
const r3 = await reconcile({ projectRoot: proj, desired: new Map([[second.name, second]]) })
check('同名真实目录报冲突且不覆盖', r3.conflicts.some(item => item.name === second.name) && existsSync(realDir))
const r4 = await reconcile({ projectRoot: proj, desired: new Map() })
check('冲突目录不被删除', existsSync(realDir))
rmSync(realDir, { recursive: true, force: true })

// ---- ppt-master 项目目录 ----
const pptNode = catalog.groups
  .flatMap(group => skillsInGroup(catalog, group.id))
  .find(node => node.name === 'ppt-master')
check('目录树里有 ppt-master', pptNode !== undefined)
const pptLink = join(SKILLS_DIR, 'office', 'ppt-master', 'projects')
const r5 = await reconcile({ projectRoot: proj, desired: new Map([[pptNode.name, pptNode]]) })
const pptTarget = join(proj, '.agents', 'ppt-master', 'projects')
check('ppt 项目目录被创建', existsSync(pptTarget), JSON.stringify(r5))
check('projects 链接指向当前项目', existsSync(pptLink) && realpathSync(pptLink) === realpathSync(pptTarget))
const otherPptProject = join(WORK, 'other-ppt-project')
mkdirSync(otherPptProject, { recursive: true })
await reconcile({ projectRoot: otherPptProject, desired: new Map([[pptNode.name, pptNode]]) })
const otherPptTarget = join(otherPptProject, '.agents', 'ppt-master', 'projects')
check('第二个项目接管共享 projects 链接', realpathSync(pptLink) === realpathSync(otherPptTarget))
await reconcile({ projectRoot: proj, desired: new Map() })
check('旧项目关闭 ppt-master 不摘另一个项目的链接', existsSync(pptLink) && realpathSync(pptLink) === realpathSync(otherPptTarget))
const r6 = await reconcile({ projectRoot: otherPptProject, desired: new Map() })
check('当前项目取消 ppt-master 后移除 projects 链接', !existsSync(pptLink), JSON.stringify(r6))

// ---- 持久化 ----
await setSelection({ [pick.name]: false })
const reloaded = await loadSelection(catalog)
check('二级以下勾选持久化', reloaded.skills[pick.name] === false)
await setSelection({ [pick.name]: true })
const { writeJson, stateFile } = await import('../host/state.mjs')
const concurrentFile = stateFile('concurrent-writes.json')
const concurrentWrites = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => writeJson(concurrentFile, { index })))
check('同一状态文件并发原子写不撞临时文件', concurrentWrites.every(result => result.status === 'fulfilled'),
  concurrentWrites.filter(result => result.status === 'rejected').map(result => String(result.reason)).join('\n'))
const concurrentResult = JSON.parse(readFileSync(concurrentFile, 'utf8'))
check('并发写后 JSON 完整且最后一次调用落盘', concurrentResult.index === 19, JSON.stringify(concurrentResult))

// ---- 全选/全关：只对直接子节点生效，一级目录同时打开本组门禁 ----
const { childBatch } = await import('../host/selection.mjs')
const engBatch = childBatch(catalog, 'engineering', true)
const engChildIds = (catalog.groups.find(group => group.id === 'engineering').children ?? []).map(child => child.id).sort()
check('全选一级组作用直接子目录并打开本组门禁',
  Object.keys(engBatch.gates).sort().join(',') === [...engChildIds, 'engineering'].sort().join(',')
  && engBatch.gates.engineering === true
  && Object.keys(engBatch.skillChanges).length === 0,
  JSON.stringify(engBatch.gates))
const nsfcBatch = childBatch(catalog, 'nsfc', true)
check('全选项目节点只作用直接子技能', Object.keys(nsfcBatch.skillChanges).length === 4 && Object.keys(nsfcBatch.gates).length === 0,
  String(Object.keys(nsfcBatch.skillChanges).length))
const engVisible = ['matlab', 'simulink']
const engFiltered = childBatch(catalog, 'engineering', true, { only: engVisible })
check('搜索过滤时全选只处理可见子节点',
  Object.keys(engFiltered.gates).filter(id => id !== 'engineering').sort().join(',') === engVisible.sort().join(',')
  && engFiltered.gates.engineering === true,
  JSON.stringify(engFiltered.gates))
const matlabGroupNode = (catalog.groups.find(group => group.id === 'engineering').children ?? []).find(node => node.id === 'matlab')
const matlabBatch = childBatch(catalog, 'matlab', false)
const matlabChildDirs = (matlabGroupNode.children ?? []).filter(child => child.kind !== 'skill')
const matlabChildSkills = (matlabGroupNode.children ?? []).filter(child => child.kind === 'skill')
check(
  '全关多级目录只关直接子节点不下钻',
  Object.keys(matlabBatch.gates).length === matlabChildDirs.length
    && Object.values(matlabBatch.gates).every(value => value === false)
    && Object.keys(matlabBatch.skillChanges).length === matlabChildSkills.length,
  `gates=${Object.keys(matlabBatch.gates).length}/${matlabChildDirs.length} skills=${Object.keys(matlabBatch.skillChanges).length}/${matlabChildSkills.length}`,
)

// ---- 技能选择态 v3（项目 + DSH 工作区；默认只读、改动建立以工作区命名的模式）----
const presets = await import('../host/presets.mjs')
const gatesModule = await import('../host/gates.mjs')
const stateDir = join(WORK, 'state')

// v2 迁移：旧「未命名」在对应会话首次访问时搬到工作区自动模式
const projMigrate = join(WORK, 'preset-migrate')
mkdirSync(projMigrate, { recursive: true })
const migrateSkill = engineering[0]
writeFileSync(join(stateDir, 'presets.json'), `${JSON.stringify({
  version: 2,
  projects: {
    [projMigrate]: {
      baselineStamp: catalog.generatedAt,
      modes: [{ name: '默认', builtin: true, gates: {}, selection: { [migrateSkill.name]: true }, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' }],
      unnamed: {
        'legacy-session': { gates: { engineering: true, research: false, office: false }, selection: { [migrateSkill.name]: true }, updatedAt: '2026-11-02T00:00:00.000Z' },
      },
      active: { 'legacy-session': '未命名' },
    },
  },
}, null, 2)}\n`, 'utf8')
const wsMigrate = { key: 'w:migrate', title: '迁移工作区', path: projMigrate, source: 'workspace' }
await presets.loadPresets(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projMigrate)
const migrated = await presets.activeModeContent(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projMigrate, wsMigrate, 'legacy-session')
const migratedPayload = presets.presetsPayload(catalog, {}, projMigrate, wsMigrate)
check(
  'v2 未命名迁移为工作区自动模式',
  migratedPayload.active === '迁移工作区'
    && migratedPayload.items.some(item => item.name === '迁移工作区' && item.workspace === true && item.count === 1)
    && migrated.content?.gates?.engineering === true,
  JSON.stringify({ active: migratedPayload.active, items: migratedPayload.items }),
)

const projRoot = join(WORK, 'preset-project')
mkdirSync(projRoot, { recursive: true })
const wsA = { key: 'w:A', title: '项目甲工作区', path: join(WORK, 'wa'), source: 'workspace' }
const wsB = { key: 'w:B', title: '项目乙工作区', path: join(WORK, 'wb'), source: 'workspace' }
await presets.loadPresets(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot)
const baseLine = presets.presetsPayload(catalog, {}, projRoot, wsA)
check(
  '默认模式存在、注入数为 0、带工作区标题',
  baseLine.items.length === 1 && baseLine.items[0].name === '默认' && baseLine.items[0].count === 0
    && baseLine.active === '默认' && baseLine.workspace.title === wsA.title,
  JSON.stringify(baseLine),
)
const pickSkill = engineering[0]
await setSelection({ [pickSkill.name]: true })
await presets.ensureEditableMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsA)
await presets.saveActiveMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsA)
const afterEdit = presets.presetsPayload(catalog, {}, projRoot, wsA)
check(
  '改动默认后建立以工作区命名的模式',
  afterEdit.active === wsA.title && afterEdit.items.some(item => item.name === wsA.title && item.workspace === true),
  JSON.stringify(afterEdit),
)
check('同一工作区所有对话共享同一模式', presets.presetsPayload(catalog, {}, projRoot, wsA).active === afterEdit.active)
check('另一个工作区看不到它的自动模式', !presets.presetsPayload(catalog, {}, projRoot, wsB).items.some(item => item.workspace === true))

// 工作区改名：自动模式名跟着变（自动模式名永远是生成的）
const wsRenamed = { ...wsA, title: '项目甲改名后' }
await presets.activeModeContent(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsRenamed, 'session-b')
const renamedTitlePayload = presets.presetsPayload(catalog, {}, projRoot, wsRenamed)
check(
  '工作区改名后自动模式名跟随',
  renamedTitlePayload.items.some(item => item.workspace === true && item.name === '项目甲改名后'),
  JSON.stringify(renamedTitlePayload.items),
)

await presets.renameMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsRenamed, '项目甲改名后', '测试模式')
const renamed = presets.presetsPayload(catalog, {}, projRoot, wsRenamed)
check(
  '自动模式改名后升级为项目级模式',
  renamed.active === '测试模式'
    && renamed.items.some(item => item.name === '测试模式' && item.workspace === false)
    && presets.presetsPayload(catalog, {}, projRoot, wsB).items.some(item => item.name === '测试模式'),
  JSON.stringify(renamed),
)
await presets.applyMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsRenamed, '默认')
check('切回默认恢复项目基础态', presets.presetsPayload(catalog, {}, projRoot, wsRenamed).active === '默认')
await presets.applyMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsB, '测试模式')
await presets.cloneMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsB, '测试模式')
const cloned = presets.presetsPayload(catalog, {}, projRoot, wsB)
check(
  '基于此新建复制到当前工作区自动模式',
  cloned.active === wsB.title && cloned.items.some(item => item.name === wsB.title && item.workspace === true),
  JSON.stringify(cloned),
)
// 基于「默认」新建：同样落到当前工作区的自动模式（内容就是基础态）
await presets.cloneMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsB, '默认')
const clonedDefault = presets.presetsPayload(catalog, {}, projRoot, wsB)
check(
  '基于默认新建生成工作区自动模式',
  clonedDefault.active === wsB.title && clonedDefault.items.some(item => item.name === wsB.title && item.workspace === true),
  JSON.stringify(clonedDefault),
)

// 基于当前工作区自动模式新建：生成项目级副本，原自动模式保留
const autoClone = await presets.cloneMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsB, wsB.title)
const clonedAuto = presets.presetsPayload(catalog, {}, projRoot, wsB)
check(
  '基于工作区模式新建生成项目级副本',
  autoClone.promoted === true
    && clonedAuto.active === autoClone.name
    && clonedAuto.items.some(item => item.name === autoClone.name && item.workspace === false)
    && clonedAuto.items.some(item => item.name === wsB.title && item.workspace === true),
  JSON.stringify({ autoClone, items: clonedAuto.items }),
)
await presets.deleteMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsB, autoClone.name)
await presets.deleteMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsB, wsB.title)
await presets.deleteMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsRenamed, '测试模式')
const cleaned = presets.presetsPayload(catalog, {}, projRoot, wsRenamed)
check('删除模式后只剩默认', cleaned.items.length === 1 && cleaned.items[0].name === '默认' && cleaned.active === '默认', JSON.stringify(cleaned))

// 切回「默认」后再编辑：旧工作区模式内容要归档成项目级副本，不能静默覆盖
await presets.applyMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsB, '默认')
await presets.ensureEditableMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsB)
await setSelection({ [pick.name]: true })
await gatesModule.setGates({ engineering: true })
await presets.saveActiveMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsB)
const beforeArchive = presets.presetsPayload(catalog, {}, projRoot, wsB)
await presets.applyMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsB, '默认')
await setSelection({ [pick.name]: false })
await presets.ensureEditableMode(catalog, await loadSelection(catalog), await gatesModule.loadGates(), projRoot, wsB)
const afterArchive = presets.presetsPayload(catalog, {}, projRoot, wsB)
const autoBefore = beforeArchive.items.find(item => item.workspace === true)
const autoAfter = afterArchive.items.find(item => item.workspace === true)
check(
  '切回默认后编辑不丢旧工作区模式',
  autoBefore !== undefined && autoAfter !== undefined && autoBefore.count > autoAfter.count
    && afterArchive.items.some(item => item.workspace === false && item.name.endsWith('(旧)') && item.count === autoBefore.count),
  JSON.stringify({ before: autoBefore, after: autoAfter, items: afterArchive.items }),
)

// ---- 新增技能密钥写入宿主环境 ----
const { applySkillEnv } = await import('../host/skill-settings.mjs')
applySkillEnv({
  image: { baseUrl: 'https://example.com/v1', model: 'demo-image-1', apiKey: 'test-image-key' },
  natureAcademic: { pubmed: { email: 'smoke@example.com', apiKey: 'test-key' } },
})
check('生图配置写入插件专用环境变量', process.env.ZRWANG_IMAGE_BASE_URL === 'https://example.com/v1'
  && process.env.ZRWANG_IMAGE_MODEL === 'demo-image-1'
  && process.env.ZRWANG_IMAGE_API_KEY === 'test-image-key')
check('发热图配置不污染全局 OPENAI_API_KEY', process.env.OPENAI_API_KEY === undefined)
check('Nature 绘图偏好指向配置目录', typeof process.env.NATURE_FIGURE_CONFIG === 'string'
  && process.env.NATURE_FIGURE_CONFIG.includes('nature-figure.json'))
check('archify 关闭自动更新', process.env.ARCHIFY_UPDATE_CHECK_DISABLED === '1')
check('PubMed 配置写入环境变量', process.env.NCBI_EMAIL === 'smoke@example.com' && process.env.NCBI_API_KEY === 'test-key')
check('学校配置指向插件配置目录', process.env.LIT_DL_CONFIG_DIR === join(runtimeConfigDir, 'nature-downloader'),
  process.env.LIT_DL_CONFIG_DIR)
applySkillEnv({ natureAcademic: { pubmed: { email: '', apiKey: '' } } })
check('清空后移除环境变量', process.env.NCBI_EMAIL === undefined && process.env.NCBI_API_KEY === undefined)
check('清空后移除生图变量', process.env.ZRWANG_IMAGE_BASE_URL === undefined
  && process.env.ZRWANG_IMAGE_MODEL === undefined
  && process.env.ZRWANG_IMAGE_API_KEY === undefined)

// ---- MCP 组件：MathWorks 自动、Windows MCP 手动 ----
const mcpModule = await import('../host/mcp.mjs')
const { currentParams } = await import('../host/skill-settings.mjs')
const registered = new Map()
const fakeManager = {
  register(name, entry) {
    registered.set(name, entry)
    return () => { registered.delete(name) }
  },
  list() {
    return [...registered.keys()].map(name => ({ name, configured: false, status: { state: 'connecting', attempt: 1 } }))
  },
}
const controller = mcpModule.createMcpController({ get: key => key === 'mcpManager' ? fakeManager : undefined })
await controller.reconcile(mcpModule.wantOf({ engineeringInjected: 0, gates: { engineering: true } }))
check('工程组没注入技能时不注册 MathWorks MCP', registered.size === 0, JSON.stringify([...registered.keys()]))
await controller.reconcile(mcpModule.wantOf({ engineeringInjected: 12, gates: { engineering: true } }))
const matlabEntry = registered.get('matlab-mcp')
// exe 先暂存到配置目录（工作区之外）再启动：工作区内的 exe 建不了 %TEMP% 日志目录。
const stagedExe = mcpModule.stagedMatlabExe()
check('MathWorks MCP 注册为 matlab-mcp', matlabEntry !== undefined && matlabEntry.command === stagedExe, matlabEntry?.command)
check('MathWorks MCP 用工作区外的 exe 副本', stagedExe !== mcpModule.MATLAB_MCP_EXE
  && isInside(mcpModule.MCP_RUNTIME_DIR, stagedExe) && existsSync(stagedExe), stagedExe)
check('exe 副本与包内文件大小一致', statSync(stagedExe).size === statSync(mcpModule.MATLAB_MCP_EXE).size)
const stagedAgain = mcpModule.stagedMatlabExe()
check('exe 副本已存在时不重复复制', stagedAgain === stagedExe && statSync(stagedAgain).mtimeMs === statSync(stagedExe).mtimeMs)
check('MATLAB 初始化命令指向 exe 副本', mcpModule.matlabInitCommand().includes(stagedExe.split('\\').join('/')))
check('MathWorks MCP 带 Simulink 工具扩展', (matlabEntry?.args ?? []).includes(`--extension-file=${mcpModule.SIMULINK_TOOLS_FILE}`)
  && (matlabEntry?.args ?? []).includes('--matlab-session-mode=existing'))
check('MathWorks MCP 走官方 stdio 条目字段', matlabEntry?.transport === 'stdio'
  && matlabEntry?.toolCallTimeoutMs === 120000 && matlabEntry?.startupTimeoutMs === 30000
  && typeof matlabEntry?.closeTimeoutMs === 'number')
await controller.reconcile(mcpModule.wantOf({ engineeringInjected: 12, gates: { engineering: true, 'windows-mcp': true } }))
check('勾选 Windows MCP 组件后注册 windows-mcp', registered.has('windows-mcp'))
check('Windows MCP 默认参数 serve', JSON.stringify(registered.get('windows-mcp')?.args) === JSON.stringify(['serve']))
await controller.reconcile(mcpModule.wantOf({ engineeringInjected: 0, gates: { engineering: false, 'windows-mcp': true } }))
check('工程技能关掉后注销 MathWorks MCP', !registered.has('matlab-mcp') && registered.has('windows-mcp'))
await controller.reconcile(mcpModule.wantOf({ engineeringInjected: 0, gates: {} }))
check('取消 Windows MCP 后全部注销', registered.size === 0)
// 多会话并集：任一活跃会话需要就保持注册，最后一个会话关掉才注销
await controller.reconcile(mcpModule.wantOf({ engineeringInjected: 5, gates: { engineering: true } }), { sessionId: 'session-1' })
check('会话 1 打开工程组后注册 MathWorks MCP', registered.has('matlab-mcp'))
await controller.reconcile(mcpModule.wantOf({ engineeringInjected: 0, gates: {} }), { sessionId: 'session-2' })
check('另一会话不需要时仍保持注册（并集）', registered.has('matlab-mcp'))
await controller.reconcile(mcpModule.wantOf({ engineeringInjected: 0, gates: {} }), { sessionId: 'session-1' })
check('最后一个需要它的会话关掉后才注销', !registered.has('matlab-mcp'))
const views = mcpModule.componentViews({
  engineeringInjected: 3,
  gates: { engineering: true },
  status: { available: true, servers: [{ name: 'matlab-mcp', state: 'ready', attempt: 0 }] },
})
check('组件行：MathWorks 自动开启且状态 ready',
  views.components[0].id === 'mathworks' && views.components[0].enabled === true && views.components[0].stateLabel === '已连接',
  JSON.stringify(views.components[0]))
const sharedViews = mcpModule.componentViews({
  engineeringInjected: 0,
  gates: {},
  status: { available: true, servers: [{ name: 'matlab-mcp', state: 'connected', toolCount: 3 }] },
})
check('本会话未开但全局在跑时标为全局已启动', sharedViews.components[0].enabled === false && sharedViews.components[0].globallyActive === true,
  JSON.stringify(sharedViews.components[0]))
const noManagerController = mcpModule.createMcpController({ get: () => undefined })
await noManagerController.reconcile({ mathworks: true, windows: true })
const noManagerStatus = noManagerController.status()
check('无 mcpManager 时降级为不可用', noManagerStatus.available === false
  && noManagerStatus.servers.every(server => server.state === 'unavailable'))
check('无 mcpManager 时组件行标为不支持', mcpModule.componentViews({ engineeringInjected: 5, gates: { engineering: true }, status: noManagerStatus })
  .available === false)
await gatesModule.setGates({ 'windows-mcp': true })
const mcpGates = await gatesModule.loadGates()
check('Windows MCP 门禁可持久化', mcpGates['windows-mcp'] === true)
await gatesModule.setGates({ 'windows-mcp': false })
check('Windows MCP 门禁可关闭', (await gatesModule.loadGates())['windows-mcp'] === false)

// ---- MCP 稳定性：重启 / 探测 / 固定参数 / 启动成功标识 ----
const stableRegistered = new Map()
const stableCalls = []
const stableManager = {
  register(name, entry) {
    stableRegistered.set(name, entry)
    return () => { stableRegistered.delete(name) }
  },
  list() {
    return [...stableRegistered.keys()].map(name => ({ name, configured: false, status: { state: 'connected', toolCount: 14, connectedAt: Date.now() } }))
  },
  async restart(name) { stableCalls.push(['restart', name]) },
  async probe(name) {
    stableCalls.push(['probe', name])
    return { ok: true, serverInfo: { name: 'matlab-mcp', version: '0.16.0' }, toolNames: ['a', 'b'], truncated: false, durationMs: 12, closeConfirmed: true }
  },
}
const stableController = mcpModule.createMcpController({ get: key => key === 'mcpManager' ? stableManager : undefined })
await stableController.reconcile({ mathworks: true, windows: false })
const restartResult = await stableController.restart('matlab-mcp')
check('已开启的服务器可以重启', restartResult.ok === true && stableCalls.some(call => call[0] === 'restart' && call[1] === 'matlab-mcp'))
const probeResult = await stableController.probe('matlab-mcp')
check('测试连接返回工具数与用时', probeResult.ok === true && probeResult.detail.includes('2 个工具') && probeResult.detail.includes('12ms'), probeResult.detail)
const restartOff = await stableController.restart('windows-mcp')
check('未开启的组件重启给出提示', restartOff.ok === false && restartOff.detail.includes('未开启'))
const connectedViews = mcpModule.componentViews({
  engineeringInjected: 5,
  gates: { engineering: true },
  status: stableController.status(),
})
check('启动成功有明确标识并带工具数',
  connectedViews.components[0].phase === 'running' && connectedViews.components[0].statusLabel === '已启动（14 个工具）',
  JSON.stringify(connectedViews.components[0]))
const connectingViews = mcpModule.componentViews({
  engineeringInjected: 5,
  gates: { engineering: true },
  status: { available: true, servers: [{ name: 'matlab-mcp', state: 'connecting', attempt: 0 }] },
})
check('启动中显示启动中标识', connectingViews.components[0].phase === 'starting' && connectingViews.components[0].statusLabel.includes('启动中'))
const failedViews = mcpModule.componentViews({
  engineeringInjected: 5,
  gates: { engineering: true },
  status: { available: true, servers: [{ name: 'matlab-mcp', state: 'failed', reason: 'gave-up', attempt: 10 }] },
})
check('启动失败显示启动失败标识', failedViews.components[0].phase === 'failed' && failedViews.components[0].statusLabel === '启动失败')
check('MATLAB MCP 参数固定',
  JSON.stringify(mcpModule.resolveMatlabEntry().args) === JSON.stringify([
    '--matlab-session-mode=existing',
    '--extension-file=' + mcpModule.SIMULINK_TOOLS_FILE,
    '--disable-telemetry=true',
  ]) && mcpModule.resolveMatlabEntry().env.WINDIR === 'C:\\Windows'
  && mcpModule.resolveMatlabEntry().reconnect === undefined)
check('Windows MCP 参数固定',
  mcpModule.resolveWindowsEntry().command === 'windows-mcp'
  && JSON.stringify(mcpModule.resolveWindowsEntry().args) === JSON.stringify(['serve'])
  && mcpModule.resolveWindowsEntry().env.ANONYMIZED_TELEMETRY === 'false'
  && mcpModule.resolveWindowsEntry().reconnect === undefined)

// ---- 清理 ----
rmSync(WORK, { recursive: true, force: true })
if (existsSync(pptLink)) rmSync(pptLink, { force: true })

process.stdout.write(failures === 0 ? '\nsmoke: 全部通过\n' : `\nsmoke: ${failures} 项失败\n`)
process.exit(failures === 0 ? 0 : 1)
