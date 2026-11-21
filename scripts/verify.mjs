#!/usr/bin/env node
/**
 * 全量自检：包清单、目录树、技能实体、上游锁、ARS、宿主语法、客户端产物、配置单一来源。
 *
 * 只读：不改仓库里的任何文件，也不要求本机已经装过插件。
 * 任一项失败退出码 1。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { frontValue } from '../host/skill-md.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const passed = []
const problems = []

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

function walkFiles(dir, filter, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'cache' || entry.name === 'projects') continue
      walkFiles(full, filter, out)
    } else if (filter(full)) {
      out.push(full)
    }
  }
  return out
}

// ---- 1 包清单 ----
const pkg = readJson(join(ROOT, 'package.json'))
check('package.name', pkg.name === 'dsh-zrwang-plugin')
check('package.version 为合法 semver', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version), pkg.version)
check('package.main 存在', typeof pkg.main === 'string' && existsSync(join(ROOT, pkg.main)))
check('exports["./client"]', pkg.exports?.['./client'] === './lib/client.js')
check('dsh.bundle.patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
check('dsh.client.platform=web', pkg.dsh?.client?.platform === 'web')
check('dsh.client.inject 含 better-sidebar', (pkg.dsh?.client?.inject ?? []).includes('dsh-better-sidebar'))
check('better-sidebar 依赖为 0.30.x', /^\^0\.30\./.test(pkg.dependencies?.['dsh-better-sidebar'] ?? ''), pkg.dependencies?.['dsh-better-sidebar'])
check('dsh.engines.dsh 已声明', typeof pkg.dsh?.engines?.dsh === 'string' && pkg.dsh.engines.dsh.includes('0.2.2'))
check('打包技能/目录树/ARS/宿主/脚本', ['skills', 'catalog', 'ars', 'host', 'scripts', 'locale', 'docs', 'icon.svg', 'cordis.patch.yml'].every(item => (pkg.files ?? []).includes(item)))
check('MathWorks 组件随包', (pkg.files ?? []).includes('mathworks')
  && existsSync(join(ROOT, 'mathworks', 'matlab-mcp-server-windows-x64.exe'))
  && existsSync(join(ROOT, 'mathworks', 'simulink-agentic-toolkit', 'tools', 'tools.json')))
check('插件不提供 Python 安装功能', !existsSync(join(ROOT, 'scripts', 'install-python-runtime.mjs')) && !existsSync(join(ROOT, 'runtime')))
check('旧宿主模块已删除', ['skill-settings.mjs', 'plugin-params.mjs', 'python-detect.mjs', 'farm.mjs'].every(name => !existsSync(join(ROOT, 'host', name))))

// 可分发性：运行期源码里不能出现作者本机路径
const sourceFiles = [
  ...walkFiles(join(ROOT, 'host'), file => file.endsWith('.mjs')),
  ...walkFiles(join(ROOT, 'client'), file => file.endsWith('.mjs')),
  ...walkFiles(join(ROOT, 'scripts'), file => file.endsWith('.mjs') && !file.endsWith('verify.mjs')),
]
const localPathHits = sourceFiles.filter(file => /AgentRelated|[A-Za-z]:\\\\Users\\\\[^\\\\/'"\s]+|\.local\\\\bin/i.test(readFileSync(file, 'utf8')))
check('运行期代码不含作者本机路径', localPathHits.length === 0, localPathHits.map(file => file.slice(ROOT.length + 1)).join(', '))

// ---- 2 补丁（包补丁不带设置）----
const packagePatch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
check('包补丁插入本插件行', packagePatch.includes('id: dsh-zrwang-plugin') && packagePatch.includes("name: 'dsh-zrwang-plugin'"))
check('包补丁不带设置与密钥', !/apiKey|api_key|secret|token/i.test(packagePatch) && !packagePatch.includes('configDir'))
check('包补丁不引用预设/customSkillDirs', !packagePatch.includes('dsh-agent-preset') && !packagePatch.includes('customSkillDirs:'))

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
check('一级目录=3', (catalog.groups ?? []).length === 3, String((catalog.groups ?? []).length))
check('目录树非空', skillNodes.length > 200, String(skillNodes.length))
const backslashDirs = skillNodes.filter(node => String(node.dir).includes('\\')).map(node => node.name)
check('技能目录统一 posix 分隔符', backslashDirs.length === 0, `${backslashDirs.slice(0, 5).join(', ')}（${backslashDirs.length} 个）`)
const badDirs = skillNodes.filter(node => String(node.dir).startsWith('/') || String(node.dir).includes('..')).map(node => node.name)
check('技能目录为相对路径', badDirs.length === 0, badDirs.slice(0, 5).join(', '))
const groupCounts = catalog.stats?.byGroup ?? {}
const sumGroups = Object.values(groupCounts).reduce((sum, value) => sum + value, 0)
check('分组统计与技能数一致', sumGroups === skillNodes.length, `${sumGroups} vs ${skillNodes.length}`)

// ---- 4 技能实体 ----
const seen = new Map()
const skillProblems = []
for (const node of skillNodes) {
  if (seen.has(node.name)) skillProblems.push(`技能重名：${node.name}（${seen.get(node.name)} 与 ${node.dir}）`)
  seen.set(node.name, node.dir)
  const dir = join(ROOT, 'skills', ...String(node.dir).split('/').filter(Boolean))
  const file = join(dir, 'SKILL.md')
  if (!existsSync(file)) {
    skillProblems.push(`缺 SKILL.md：${node.dir}`)
    continue
  }
  const text = readFileSync(file, 'utf8')
  const name = frontValue(text, 'name')
  if (name !== node.name) skillProblems.push(`name 不一致：${node.dir}（${name}）`)
  if (frontValue(text, 'description').length === 0) skillProblems.push(`缺 description：${node.dir}`)
  if (dir.length > 250) skillProblems.push(`路径过长（${dir.length}）：${node.dir}`)
}
check('技能实体齐全', skillProblems.length === 0, skillProblems.slice(0, 6).join('；'))
check('技能名唯一', seen.size === skillNodes.length)
const repoProblems = Object.entries(catalog.skills ?? {}).filter(([, info]) => typeof info.repo !== 'string' || info.repo.length === 0).map(([name]) => name)
check('每个技能都有来源仓库标记', repoProblems.length === 0, repoProblems.slice(0, 5).join(', '))

// ---- 5 默认集合 ----
const defaults = catalog.defaults ?? []
check('默认集合非空', defaults.length > 0, String(defaults.length))
check('默认集合都在目录树里', defaults.every(name => seen.has(name)))
check('默认集合不含 officecli', defaults.every(name => !String(seen.get(name)).includes('/officecli')))
const defaultsSeed = readJson(join(ROOT, 'catalog', 'defaults.json'))
check('默认种子与目录树一致', JSON.stringify([...(defaultsSeed.skills ?? [])].sort()) === JSON.stringify([...defaults].sort()))

// ---- 6 上游锁与 ARS ----
const lock = readJson(join(ROOT, 'vendor', 'upstreams.lock.json'))
const arsManifest = readJson(join(ROOT, 'catalog', 'ars.json'))
const arsSkillNames = new Set((arsManifest.skills ?? []).map(skill => skill.name))
check('ARS 清单 5 技能', (arsManifest.skills ?? []).length === 5, String((arsManifest.skills ?? []).length))
check('ARS 不在技能树里', skillNodes.every(node => !arsSkillNames.has(node.name)))
const lockSkillCount = (lock.repos ?? []).reduce((sum, repo) => sum + (repo.count ?? 0), 0)
check('lock 上游技能数 = 目录 + ARS', lockSkillCount === skillNodes.length + arsSkillNames.size, `${lockSkillCount} vs ${skillNodes.length + arsSkillNames.size}`)
check('lock 记录 SHA', (lock.repos ?? []).every(repo => repo.sha === 'local' || (typeof repo.sha === 'string' && repo.sha.length >= 7)))
const lockNames = new Set((lock.repos ?? []).flatMap(repo => (repo.skills ?? []).map(skill => skill.name)))
check('lock 覆盖目录技能', skillNodes.every(node => lockNames.has(node.name)))
check('lock 覆盖 ARS 技能', [...arsSkillNames].every(name => lockNames.has(name)))
const arsProblems = []
for (const skill of arsManifest.skills ?? []) {
  const base = join(ROOT, ...String(skill.dir).split('/').filter(Boolean))
  if (!existsSync(join(base, 'SKILL.md'))) arsProblems.push(`${skill.name}: 缺 SKILL.md`)
  if (!existsSync(join(base, '_shared', 'MODE_REGISTRY.md'))) arsProblems.push(`${skill.name}: 缺 _shared/MODE_REGISTRY.md`)
  if (!existsSync(join(base, '_shared', 'dsh-runtime.md'))) arsProblems.push(`${skill.name}: 缺 _shared/dsh-runtime.md`)
}
check('ARS 技能目录自足', arsProblems.length === 0, arsProblems.slice(0, 4).join('；'))
check('ARS 许可是 CC-BY-NC', existsSync(join(ROOT, 'vendor', 'licenses', 'ars', 'LICENSE'))
  && /NonCommercial|CC BY-NC|Attribution-NonCommercial/i.test(readFileSync(join(ROOT, 'vendor', 'licenses', 'ars', 'LICENSE'), 'utf8')))

// ---- 7 宿主模块 ----
const requiredHost = [
  'index.mjs', 'routes.mjs', 'runtime.mjs', 'config.mjs', 'paths.mjs', 'platform.mjs',
  'params.mjs', 'object.mjs', 'state.mjs', 'python.mjs', 'env.mjs', 'settings.mjs',
  'mcp.mjs', 'ars.mjs', 'skill-provider.mjs', 'legacy-links.mjs', 'migrate.mjs', 'skill-guard.mjs', 'catalog.mjs', 'presets.mjs',
]
const missingHost = requiredHost.filter(name => !existsSync(join(ROOT, 'host', name)))
check('宿主模块齐全', missingHost.length === 0, missingHost.join(', '))
const syntaxFiles = [...walkFiles(join(ROOT, 'host'), file => file.endsWith('.mjs')), ...walkFiles(join(ROOT, 'scripts'), file => file.endsWith('.mjs'))]
const syntaxErrors = []
for (const file of syntaxFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (error) {
    syntaxErrors.push(`${file.slice(ROOT.length + 1)}：${String(error.stderr ?? error.message).slice(0, 200)}`)
  }
}
check('宿主/脚本语法', syntaxErrors.length === 0, syntaxErrors.join('；'))

const allHost = sourceFiles.filter(file => file.includes(`${join(ROOT, 'host')}`)).map(file => readFileSync(file, 'utf8')).join('\n')
check('宿主不再引用旧状态目录', !allHost.includes('ZRWANG_PLUGIN_STATE_DIR'))
check('运行时目录只在插件缓存', allHost.includes('dsh-zrwang-plugin') && allHost.includes('cache'))
check('不再生成 artifacts/backups', !allHost.includes("'artifacts'") && !allHost.includes("'backups'"))
check('静态 shim 与 Python 钩子随包', ['host/shim/python/python', 'host/shim/python/python.cmd', 'host/shim/bash/bash', 'host/pysite/sitecustomize.py'].every(name => existsSync(join(ROOT, name))))
check('不再用项目联接注入技能', !allHost.includes('reconcile({') && !allHost.includes('symlink('))
check('不写 credentials.json/settings.json', !/writeFileSync\([^)]*credentials\.json/.test(allHost) && !/writeFileSync\([^)]*settings\.json/.test(allHost))
const hostIndexSource = readFileSync(join(ROOT, 'host', 'index.mjs'), 'utf8')
check('凭据走 DSH 凭据库 + configEditor', readFileSync(join(ROOT, 'host', 'runtime.mjs'), 'utf8').includes('persistParams') && readFileSync(join(ROOT, 'host', 'params.mjs'), 'utf8').includes('credentials'))

// ---- 7.1 适配覆盖与仓库一致 ----
const overridesRoot = join(ROOT, 'vendor', 'overrides')
if (existsSync(overridesRoot)) {
  const drift = []
  for (const file of walkFiles(overridesRoot, () => true)) {
    const rel = file.slice(overridesRoot.length + 1)
    const target = join(ROOT, rel)
    if (!existsSync(target) || readFileSync(file, 'utf8') !== readFileSync(target, 'utf8')) drift.push(rel)
  }
  check('vendor/overrides 与仓库技能内容一致', drift.length === 0, drift.slice(0, 5).join(', '))
}
if (existsSync(join(ROOT, 'vendor', 'removals.json'))) {
  const removals = readJson(join(ROOT, 'vendor', 'removals.json')).remove ?? []
  const stillThere = removals.filter(rel => existsSync(join(ROOT, ...String(rel).split('/'))))
  check('vendor/removals.json 里的文件已删除', stillThere.length === 0, stillThere.slice(0, 5).join(', '))
}

// ---- 8 技能不再自带配置 ----
const configFileNames = new Set(['.env', '.env.example', 'config.yaml', 'config.example.yaml', 'settings.json', 'credentials.json', 'schools.yaml', 'school.schema.json'])
const strayConfig = walkFiles(join(ROOT, 'skills'), file => configFileNames.has(file.split(/[\\/]/).pop()))
const allowlist = new Set([
  join(ROOT, 'skills', 'research', 'nature-skills', 'nature-downloader', 'config', 'school.json'),
])
const unexpectedConfig = strayConfig.filter(file => !allowlist.has(file))
check('技能目录没有自带配置/凭据文件', unexpectedConfig.length === 0, unexpectedConfig.map(file => file.slice(ROOT.length + 1)).slice(0, 6).join(', '))
const schoolFile = join(ROOT, 'skills', 'research', 'nature-skills', 'nature-downloader', 'config', 'school.json')
const school = existsSync(schoolFile) ? readJson(schoolFile) : {}
check('北航学校配置随技能分发', school?.school?.code === 'buaa' && school?.auth?.sso_domain === 'sso.buaa.edu.cn')
check('学校配置无密钥字段', !JSON.stringify(school).match(/api[_-]?key|token|password/i))
const skillSourceText = walkFiles(join(ROOT, 'skills'), file => /\.(py|mjs|js|sh|ps1|cmd)$/.test(file)).map(file => readFileSync(file, 'utf8')).join('\n')
check('技能不再读 ~/.config/lit-dl 或 ~/.ppt-master', !skillSourceText.includes('.config/lit-dl') && !skillSourceText.includes('.ppt-master/.env'))
check('技能不再写 zrwang-plugin-config', !skillSourceText.includes('zrwang-plugin-config'))

// ---- 9 客户端产物 ----
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

// ---- 10 忽略与密钥 ----
const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8')
check('.gitignore 忽略 .env/state/projects/cache', ['**/.env', 'state/', '**/projects/', 'cache/'].every(item => gitignore.includes(item)))
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean)
const secretHits = []
for (const name of tracked) {
  if (!/\.(md|json|mjs|js|py|ya?ml|toml|txt|sh|ps1|cmd)$/.test(name)) continue
  const full = join(ROOT, name)
  if (!existsSync(full) || statSync(full).size > 2 * 1024 * 1024) continue
  const text = readFileSync(full, 'utf8')
  if (/(?<![A-Za-z0-9])sk-[A-Za-z0-9]{20,}/.test(text) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) secretHits.push(name)
}
check('版本库内没有疑似密钥', secretHits.length === 0, secretHits.slice(0, 5).join(', '))
const absoluteHits = tracked.filter(name => /\.(mjs|js|py)$/.test(name) && existsSync(join(ROOT, name)) && /[A-Za-z]:\\\\Users\\\\[^\\\\/'"\s]+/.test(readFileSync(join(ROOT, name), 'utf8')))
check('版本库源码不含本机绝对路径', absoluteHits.length === 0, absoluteHits.slice(0, 5).join(', '))

// ---- 11 文档与适配记录 ----
check('README 存在', existsSync(join(ROOT, 'README.md')))
check('SKILL-ADAPTATIONS.md 存在', existsSync(join(ROOT, 'SKILL-ADAPTATIONS.md')))
const readme = existsSync(join(ROOT, 'README.md')) ? readFileSync(join(ROOT, 'README.md'), 'utf8') : ''
check('README 不再提旧状态目录', !readme.includes('zrwang-plugin-config') && !readme.includes('ZRWANG_PLUGIN_STATE_DIR'))
check('README 说明设置写在 profile 补丁与凭据库', readme.includes('cordis.patch.yml') && readme.includes('凭据'))

// ---- 12 技能配置审计（只读）----
if (existsSync(join(ROOT, 'scripts', 'audit-skill-config.mjs'))) {
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'audit-skill-config.mjs'), '--check'], { cwd: ROOT, stdio: 'pipe' })
    check('技能配置审计通过', true)
  } catch (error) {
    const message = String(error?.message ?? error)
    const stdout = String(error?.stdout ?? '')
    check('技能配置审计通过', false, `${message.slice(0, 200)} | stdout 末尾：${stdout.slice(-200)}`)
  }
}

// ---- 输出 ----
process.stdout.write(`通过 ${passed.length} 项\n`)
if (problems.length > 0) {
  process.stdout.write(`失败 ${problems.length} 项\n`)
  for (const item of problems) process.stdout.write(`- ${item}\n`)
  process.exit(1)
}
