#!/usr/bin/env node
/**
 * 全量自检：包清单、补丁、目录树、技能实体、上游锁、默认集合、客户端产物、语法、密钥。
 * 任一项失败退出码 1。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { frontValue } from '../host/skill-md.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const problems = []
const passed = []

function check(name, ok, detail) {
  if (ok) {
    passed.push(name)
    return true
  }
  problems.push(`${name}${detail === undefined ? '' : `：${detail}`}`)
  return false
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

// ---- 1 包清单 ----
const pkg = readJson(join(ROOT, 'package.json'))
check('package.name', pkg.name === 'dsh-zrwang-plugin')
check('package.version=0.1.0', pkg.version === '0.1.0', pkg.version)
check('package.main 存在', typeof pkg.main === 'string' && existsSync(join(ROOT, pkg.main)))
check('exports["./client"]', pkg.exports?.['./client'] === './lib/client.js')
check('dsh.bundle.patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
check('dsh.client.platform=web', pkg.dsh?.client?.platform === 'web')
check('dsh.client.inject 含 better-sidebar', (pkg.dsh?.client?.inject ?? []).includes('dsh-better-sidebar'))
check('icon.svg 存在', existsSync(join(ROOT, 'icon.svg')))
check('locale/en.json 存在', existsSync(join(ROOT, 'locale', 'en.json')))
check('locale/zh-CN.json 存在', existsSync(join(ROOT, 'locale', 'zh-CN.json')))

// ---- 2 补丁与设置 ----
const packagePatch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
check('包补丁插入本插件行', packagePatch.includes('id: dsh-zrwang-plugin') && packagePatch.includes("name: 'dsh-zrwang-plugin'"))
check('包补丁不引用预设/customSkillDirs', !packagePatch.includes('dsh-agent-preset') && !packagePatch.includes('customSkillDirs:'))
check('包补丁不带任何设置', !packagePatch.includes('"configDir"') && !packagePatch.includes('apiKey') && !packagePatch.includes('pptMaster'))
const profileDir = process.env.DSH_PROFILE_DIR ?? join(process.env.USERPROFILE ?? '', '.dsh', 'profiles', 'desktop')
const profilePatchFile = join(profileDir, 'cordis.patch.yml')
const profilePatch = existsSync(profilePatchFile) ? readFileSync(profilePatchFile, 'utf8') : ''
check('profile 补丁不写插件设置', !profilePatch.includes('dsh-zrwang-plugin params') && !profilePatch.includes('id: dsh-zrwang-plugin'))
const runtimeConfigDir = join(process.env.USERPROFILE ?? '', '.dsh', 'zrwang-plugin-config')
const settingsFile = join(runtimeConfigDir, 'settings.json')
check('设置文件在配置目录', existsSync(settingsFile))
let patchConfig
try { patchConfig = JSON.parse(readFileSync(settingsFile, 'utf8')) } catch { patchConfig = undefined }
check('设置是合法 JSON', patchConfig !== undefined)
check('配置目录不作为参数', patchConfig?.configDir === undefined)
check('设置含 pptMaster', patchConfig?.pptMaster?.providers !== undefined)
check('设置含 natureAcademic', patchConfig?.natureAcademic?.pubmed !== undefined)
check('设置含 natureImage2ppt', patchConfig?.natureImage2ppt !== undefined)
if (existsSync(runtimeConfigDir)) {
  const allowed = new Set(['catalog.json', 'defaults.json', 'settings.json', 'nature-downloader'])
  const unexpected = readdirSync(runtimeConfigDir).filter(name => !allowed.has(name))
  check('配置目录只放文件与设置', unexpected.length === 0, unexpected.join(', '))
}
check('skill-settings 模块存在', existsSync(join(ROOT, 'host', 'skill-settings.mjs')))

// ---- 3 目录树 ----
const catalog = readJson(join(ROOT, 'catalog', 'catalog.json'))
const nodeProblems = []
const skillNodes = []
const walkNode = node => {
  if (typeof node.title !== 'string' || node.title.length === 0) nodeProblems.push(`缺 title：${node.id}`)
  if (node.kind === 'skill') {
    if (typeof node.zh !== 'string' || node.zh.length === 0) nodeProblems.push(`技能缺中文：${node.name}`)
    if (typeof node.dir !== 'string' || node.dir.length === 0) nodeProblems.push(`技能缺目录：${node.name}`)
    skillNodes.push(node)
    return
  }
  if (typeof node.desc !== 'string' || node.desc.length === 0) nodeProblems.push(`目录缺描述：${node.id}`)
  for (const child of node.children ?? []) walkNode(child)
}
for (const group of catalog.groups ?? []) walkNode(group)
check('目录树节点完整', nodeProblems.length === 0, nodeProblems.slice(0, 6).join('；'))
check('一级目录=3', (catalog.groups ?? []).length === 3)
check('目录树 481 个技能', skillNodes.length === 481, String(skillNodes.length))
const defaultsSeed = readJson(join(ROOT, 'catalog', 'defaults.json'))
check('默认启用种子文件', Array.isArray(defaultsSeed.skills) && defaultsSeed.skills.length === 91, String(defaultsSeed.skills?.length))
const groupCounts = catalog.stats?.byGroup ?? {}
check('工程 223', groupCounts.engineering === 223, String(groupCounts.engineering))
check('科研 239', groupCounts.research === 239, String(groupCounts.research))
check('办公 19', groupCounts.office === 19, String(groupCounts.office))
const singletonProblems = []
const walkSingleton = node => {
  if (node.kind === 'skill') return
  const children = node.children ?? []
  if (node.kind !== 'group' && children.length === 1 && children[0].kind === 'skill') singletonProblems.push(node.id)
  for (const child of children) walkSingleton(child)
}
for (const group of catalog.groups ?? []) walkSingleton(group)
check('没有只含单个技能的目录', singletonProblems.length === 0, singletonProblems.join(', '))
const officeGroup = (catalog.groups ?? []).find(group => group.id === 'office')
const researchGroup = (catalog.groups ?? []).find(group => group.id === 'research')
check('ppt-master 为独立技能', officeGroup?.children?.some(child => child.kind === 'skill' && child.name === 'ppt-master'))
check('html-ppt 为独立技能', officeGroup?.children?.some(child => child.kind === 'skill' && child.name === 'html-ppt'))
check('zotero-cli 为独立技能', researchGroup?.children?.some(child => child.kind === 'skill' && child.name === 'zotero-cli'))
// 2026-10 新增的 10 个仓库：目录形态与数量
const leavesUnder = node => node === undefined ? [] : (node.kind === 'skill' ? [node.name] : (node.children ?? []).flatMap(child => leavesUnder(child)))
const nodeById = (group, id) => (group?.children ?? []).find(child => child.id === id)
const qinyanNode = nodeById(researchGroup, 'qinyan')
const supervisorNode = nodeById(researchGroup, 'supervisor')
const nsfcNode = nodeById(researchGroup, 'nsfc')
check('qinyan 18 类 187 技能', (qinyanNode?.children ?? []).length === 18 && leavesUnder(qinyanNode).length === 187,
  `${(qinyanNode?.children ?? []).length}/${leavesUnder(qinyanNode).length}`)
check('supervisor 12 技能且已改名', leavesUnder(supervisorNode).length === 12 && leavesUnder(supervisorNode).includes('supervisor-deep-research'),
  `${leavesUnder(supervisorNode).length}`)
check('nsfc 4 技能', leavesUnder(nsfcNode).length === 4, String(leavesUnder(nsfcNode).length))
const patentNode = nodeById(researchGroup, 'patent')
check('patent 9 技能', leavesUnder(patentNode).length === 9, String(leavesUnder(patentNode).length))
const newSingleSkills = ['academic-humanizer', 'lieflat-less-ai-tone', 'lieflat-charts', 'writing-dna-skill', 'lieflat-gongwen', 'guizang-ppt-skill', 'frontend-slides']
check('新增单技能都在组下一层', newSingleSkills.every(name => {
  const group = name.startsWith('lieflat-charts') || name === 'writing-dna-skill' || name === 'lieflat-gongwen' || name === 'guizang-ppt-skill' || name === 'frontend-slides' ? officeGroup : researchGroup
  return (group?.children ?? []).some(child => child.kind === 'skill' && child.name === name)
}))

// ---- 4 技能实体 ----
const seen = new Map()
for (const node of skillNodes) {
  if (seen.has(node.name)) problems.push(`技能重名：${node.name}（${seen.get(node.name)} 与 ${node.dir}）`)
  seen.set(node.name, node.dir)
  const dir = join(ROOT, 'skills', ...String(node.dir).split('/'))
  const file = join(dir, 'SKILL.md')
  if (!existsSync(file)) {
    problems.push(`技能目录缺 SKILL.md：${node.dir}`)
    continue
  }
  const text = readFileSync(file, 'utf8')
  const name = frontValue(text, 'name')
  if (name !== node.name) problems.push(`SKILL.md name 不一致：${node.dir}（${name}）`)
  if (frontValue(text, 'description').length === 0) problems.push(`SKILL.md 缺 description：${node.dir}`)
  if (dir.length > 250) problems.push(`路径过长（${dir.length}）：${dir}`)
}
check('技能实体齐全', problems.every(item => !item.startsWith('技能目录缺') && !item.startsWith('SKILL.md')))
check('技能名唯一', seen.size === skillNodes.length)
const repoProblems = Object.entries(catalog.skills ?? {}).filter(([name, info]) => typeof info.repo !== 'string' || info.repo.length === 0).map(([name]) => name)
check('每个技能都有来源仓库标记', repoProblems.length === 0, repoProblems.slice(0, 5).join(', '))

// ---- 5 上游锁与 ARS 功能区块 ----
const lock = readJson(join(ROOT, 'vendor', 'upstreams.lock.json'))
const arsManifest = readJson(join(ROOT, 'catalog', 'ars.json'))
const arsSkillNames = new Set((arsManifest.skills ?? []).map(skill => skill.name))
const arsCommandNames = new Set((arsManifest.commands ?? []).map(command => command.name))
check('ARS 清单 5 技能 / 16 命令', (arsManifest.skills ?? []).length === 5 && (arsManifest.commands ?? []).length === 16,
  `${(arsManifest.skills ?? []).length}/${(arsManifest.commands ?? []).length}`)
check('ARS 不在技能树里', skillNodes.every(node => !arsSkillNames.has(node.name)))
const lockSkillCount = (lock.repos ?? []).reduce((sum, repo) => sum + (repo.count ?? 0), 0)
const lockAliasCount = (lock.repos ?? []).reduce((sum, repo) => sum + (repo.aliases ?? 0), 0)
check('lock 上游技能数 = 目录 + ARS', lockSkillCount === skillNodes.length + arsSkillNames.size, `${lockSkillCount} vs ${skillNodes.length + arsSkillNames.size}`)
check('lock 别名命令数 = ARS 命令', lockAliasCount === arsCommandNames.size, `${lockAliasCount} vs ${arsCommandNames.size}`)
check('lock 记录 SHA', (lock.repos ?? []).every(repo => repo.sha === 'local' || (typeof repo.sha === 'string' && repo.sha.length >= 7)))
const upstreamConfig = readJson(join(ROOT, 'vendor', 'upstreams.json'))
const lockIds = new Set((lock.repos ?? []).map(repo => repo.id))
const configIds = (upstreamConfig.repos ?? []).map(repo => repo.id)
check('上游仓库覆盖配置', configIds.every(id => lockIds.has(id)),
  `缺 ${configIds.filter(id => !lockIds.has(id)).join(', ') || '无'}（lock ${lockIds.size} / 配置 ${configIds.length}）`)
const lockNames = new Set((lock.repos ?? []).flatMap(repo => (repo.skills ?? []).map(skill => skill.name)))
check('lock 覆盖目录技能', skillNodes.every(node => lockNames.has(node.name)))
check('lock 覆盖 ARS 技能', [...arsSkillNames].every(name => lockNames.has(name)))
const arsLicense = join(ROOT, 'vendor', 'licenses', 'ars', 'LICENSE')
check('ARS 许可文件存在', existsSync(arsLicense))
check('ARS 许可是 CC-BY-NC', existsSync(arsLicense) && /NonCommercial|CC BY-NC|Attribution-NonCommercial/i.test(readFileSync(arsLicense, 'utf8')))
const arsProblems = []
for (const skill of arsManifest.skills ?? []) {
  const base = join(ROOT, ...String(skill.dir).split('/'))
  if (!existsSync(join(base, 'SKILL.md'))) arsProblems.push(`${skill.name}: 缺 SKILL.md`)
  if (!existsSync(join(base, '_shared', 'MODE_REGISTRY.md'))) arsProblems.push(`${skill.name}: 缺 _shared/MODE_REGISTRY.md`)
  if (!existsSync(join(base, '_shared', 'dsh-runtime.md'))) arsProblems.push(`${skill.name}: 缺 _shared/dsh-runtime.md`)
}
check('ARS 技能目录自足', arsProblems.length === 0, arsProblems.slice(0, 4).join('；'))
check('ARS 实体在包根 ars/ 下', !existsSync(join(ROOT, 'skills', 'research', 'ars')) && existsSync(join(ROOT, 'ars', 'skills')))
const arsCommandProblems = (arsManifest.commands ?? [])
  .filter(command => !existsSync(join(ROOT, ...String(command.source).split('/'))))
  .map(command => command.name)
check('ARS 命令源存在', arsCommandProblems.length === 0, arsCommandProblems.slice(0, 4).join(', '))
check('ARS 用法文档存在', existsSync(join(ROOT, ...String(arsManifest.doc ?? 'docs/ars-usage.md').split('/'))))
const schoolSeed = readJson(join(ROOT, 'config', 'nature-downloader', 'school.json'))
check('内置北航学校配置', schoolSeed?.school?.code === 'buaa' && schoolSeed?.auth?.sso_domain === 'sso.buaa.edu.cn' && schoolSeed?.discovery?.resource_entry_url === 'https://lib.buaa.edu.cn/')
check('内置学校配置无私人字段', !/password|passwd|token|api[_-]?key|email|cookie/i.test(JSON.stringify(schoolSeed)))
const details = readJson(join(ROOT, 'catalog', 'skill-details.zh.json'))
const detailNames = Object.keys(details)
check('静态中文详情覆盖全部技能', detailNames.length === skillNodes.length && skillNodes.every(node => typeof details[node.name] === 'string' && details[node.name].trim().length > 0))

// ---- 6 默认集合 ----
const legacy = readJson(join(ROOT, 'catalog', 'legacy', 'legacy-enabled.json'))
const pathOf = Object.fromEntries(skillNodes.map(node => [node.name, node.dir]))
const expected = (legacy.enabled ?? [])
  .filter(name => pathOf[name] !== undefined)
  .sort()
const actual = [...(catalog.defaults ?? [])].sort()
check('默认集合=旧启用集合映射', JSON.stringify(expected) === JSON.stringify(actual), `${actual.length} vs ${expected.length}`)
check('默认集合全部存在于目录树', (catalog.defaults ?? []).every(name => pathOf[name] !== undefined))
check('默认不启用 officecli', (catalog.defaults ?? []).every(name => !pathOf[name]?.includes('/officecli')))
// 2026-10 新增的 210 个技能默认全部关闭，且不与 ARS 五个技能重名
const newSkillNames = [
  ...leavesUnder(qinyanNode), ...leavesUnder(supervisorNode), ...leavesUnder(nsfcNode), ...newSingleSkills,
]
check('新增技能默认全部关闭', newSkillNames.every(name => !(catalog.defaults ?? []).includes(name)), String(newSkillNames.length))
check('新增技能不与 ARS 重名', newSkillNames.every(name => !arsSkillNames.has(name)))
const newRepoIds = ['academic-humanizer', 'lieflat-less-ai-tone', 'qinyan', 'nsfc', 'supervisor', 'lieflat-charts', 'writing-dna', 'lieflat-gongwen', 'guizang-ppt', 'frontend-slides', 'patent']
const licenseProblems = newRepoIds.filter(id => {
  const dir = join(ROOT, 'vendor', 'licenses', id)
  return !existsSync(dir) || readdirSync(dir).length === 0
})
check('新增仓库许可/说明齐全', licenseProblems.length === 0, licenseProblems.join(', '))

// ---- 7 客户端产物 ----
const clientFile = join(ROOT, 'lib', 'client.js')
if (check('lib/client.js 存在', existsSync(clientFile))) {
  const client = readFileSync(clientFile, 'utf8')
  check('client 包 id', client.includes("id: 'dsh-zrwang-plugin'"))
  check('client 含 registerTab', client.includes('registerTab'))
  check('client 含 ZrPanel', client.includes('function ZrPanel'))
  check('client 无 import/export', !/^\s*(import|export)\s/m.test(client))
  let clientSyntax = ''
  try {
    execFileSync(process.execPath, ['--check', clientFile], { stdio: 'pipe' })
  } catch (error) {
    clientSyntax = String(error.stderr ?? error.message).slice(0, 300)
  }
  check('client 语法可解析', clientSyntax.length === 0, clientSyntax)
}

// ---- 8 语法 ----
const syntaxFiles = [
  ...readdirSync(join(ROOT, 'host')).filter(f => f.endsWith('.mjs')).map(f => join(ROOT, 'host', f)),
  ...readdirSync(join(ROOT, 'scripts')).filter(f => f.endsWith('.mjs')).map(f => join(ROOT, 'scripts', f)),
]
const syntaxErrors = []
for (const file of syntaxFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (error) {
    syntaxErrors.push(`${file}：${String(error.stderr ?? error.message).slice(0, 200)}`)
  }
}
check('宿主/脚本语法', syntaxErrors.length === 0, syntaxErrors.join('；'))

// ---- 9 忽略与密钥 ----
const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8')
check('.gitignore 忽略 .env/state/projects', gitignore.includes('**/.env') && gitignore.includes('state/') && gitignore.includes('**/projects/'))
const envFiles = []
const scanEnv = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'projects' || entry.name === 'node_modules') continue
      scanEnv(full)
    } else if (entry.name === '.env') envFiles.push(full)
  }
}
if (existsSync(join(ROOT, 'skills'))) scanEnv(join(ROOT, 'skills'))
for (const file of envFiles) {
  const text = readFileSync(file, 'utf8')
  if (/sk-[A-Za-z0-9_-]{16,}/.test(text)) problems.push(`.env 里出现疑似密钥（确认不要提交）：${file}`)
}
check('只有 ppt-master 有 .env 例外', envFiles.length <= 3, String(envFiles.length))

// ---- 输出 ----
process.stdout.write(`通过 ${passed.length} 项\n`)
if (problems.length === 0) {
  process.stdout.write('verify: 全部通过\n')
  process.exit(0)
}
process.stderr.write(`失败 ${problems.length} 项：\n`)
for (const problem of problems) process.stderr.write(`  - ${problem}\n`)
process.exit(1)
