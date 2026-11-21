#!/usr/bin/env node
/**
 * 宿主半侧冒烟：不装 DSH，用桩上下文验证目录树、勾选门禁、原生技能提供方、
 * 技能护栏、缓存路径、参数读写与设置卡片。
 *
 * 全程在系统临时目录里跑，不写仓库、不碰真实 ~/.dsh。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

const WORK = mkdtempSync(join(tmpdir(), 'dsh-zrwang-smoke-'))
process.env.DSH_HOME = join(WORK, 'home')
process.env.ZRWANG_BASH = ''
const STORAGE = join(WORK, 'storages', 'dsh-zrwang-plugin')

const { setStorageRootForTests, storageRoot, stateRoot, defaultPatentRoot, patentPathsOf, legacyConfigRoot, legacyCacheRoot } = await import('../host/paths.mjs')
setStorageRootForTests(STORAGE)
mkdirSync(STORAGE, { recursive: true })

const { loadCatalog, skillsInGroup } = await import('../host/catalog.mjs')
const { loadSelection, desiredSkills, setSelection, childBatch } = await import('../host/selection.mjs')
const { buildEffectiveGates } = await import('../host/selection.mjs')
const { resolveProjectRoot } = await import('../host/project.mjs')
const { SKILLS_DIR } = await import('../host/config.mjs')
const { guardReason } = await import('../host/skill-guard.mjs')
const { defaultParams, normalizeConfig, configOfParams, withSecrets, persistParams } = await import('../host/params.mjs')
const { settingsCards, saveSettingsCard, blockedSkills, patentRootProblem } = await import('../host/settings.mjs')
const { stateFile, writeJson } = await import('../host/state.mjs')
const { applySkillEnv, restoreSkillEnv, configEnv } = await import('../host/env.mjs')
const { registerSkillProvider } = await import('../host/skill-provider.mjs')
const { loadPresets, ensureEditableMode } = await import('../host/presets.mjs')
const { resolveWorkspaceByPath } = await import('../host/workspaces.mjs')
const { saveSessionSelection, listSessionSelections, pruneSessionSelections } = await import('../host/session-selection.mjs')
const { runArsCommand } = await import('../host/ars-commands.mjs')
const { installComponentGuard } = await import('../host/session-components.mjs')
const { createToolRestrictions } = await import('../host/tool-restrictions.mjs')
const { createMcpController, RECOVER_DELAYS_MS, RECONNECT_POLICY, componentViews, resolveMatlabEntry } = await import('../host/mcp.mjs')
const { loadGates, setGates, clearGates } = await import('../host/gates.mjs')

let failures = 0
let total = 0
function check(name, ok, detail) {
  total += 1
  if (ok) {
    process.stdout.write(`ok   ${name}\n`)
    return
  }
  failures += 1
  process.stderr.write(`FAIL ${name}${detail === undefined ? '' : `：${detail}`}\n`)
}

// ---- 缓存路径 ----
check('持久化根在 DSH storages 下', storageRoot() === STORAGE)
check('状态目录在持久化根下', stateRoot() === join(STORAGE, 'state'))
check('默认专利目录也在持久化根下', defaultPatentRoot() === join(STORAGE, 'patent'))
check('持久化根里不再有 artifacts/backups', !existsSync(join(STORAGE, 'artifacts')) && !existsSync(join(STORAGE, 'backups')))
check('插件包内不再创建 cache', legacyCacheRoot() === join(SKILLS_DIR, '..', 'cache') && !existsSync(legacyCacheRoot()))
check('旧配置目录只用于迁移', legacyConfigRoot() === join(process.env.DSH_HOME, 'zrwang-plugin-config'))
const samplePatentRoot = join(WORK, 'patent-data')
const samplePatent = patentPathsOf({ patent: { root: samplePatentRoot } })
check('Obsidian 库是专利数据目录的子路径',
  samplePatent.vault === join(samplePatentRoot, 'vault')
  && samplePatent.map === join(samplePatentRoot, 'patent-map')
  && samplePatent.oa === join(samplePatentRoot, 'oa')
  && samplePatent.readerOutput === join(samplePatentRoot, 'outputs', 'patent-reader'))
check('专利目录没配置时没有派生路径', patentPathsOf({ patent: { root: '' } }) === undefined)

// ---- 目录树 ----
const catalog = await loadCatalog()
const seed = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'catalog', 'catalog.json'), 'utf8'))
check('目录树直接读包内文件', catalog.stats.total === seed.stats.total && catalog.generatedAt === seed.generatedAt)
check('目录树每个 dir 都是 posix 路径', Object.values(catalog.skills).every(info => !String(info.dir).includes('\\')))
const engineering = skillsInGroup(catalog, 'engineering')
const sampleSkill = engineering.find(node => node.name === 'matlab-create-live-script') ?? engineering[0]
check('工程组非空', engineering.length > 10, String(engineering.length))

const selection = await loadSelection(catalog)
const effectiveDefault = buildEffectiveGates(catalog, {}, selection)
const researchDirs = (catalog.groups.find(group => group.id === 'research').children ?? []).filter(node => node.kind !== 'skill')
const firstEmptyDir = researchDirs.find(node => !(catalog.defaults ?? []).some(name => {
  const walk = item => item.kind === 'skill' ? item.name === name : (item.children ?? []).some(walk)
  return walk(node)
}))
check('未勾选子树显示为未勾选', firstEmptyDir !== undefined && effectiveDefault[firstEmptyDir.id] === false)
const matlabDir = catalog.groups.find(group => group.id === 'engineering').children.find(node => node.id === 'matlab')
check('有勾选子树显示为已勾选', effectiveDefault[matlabDir.id] === true)
check('一级目录默认不勾', ['engineering', 'research', 'office'].every(id => effectiveDefault[id] === false))
check('显式关闭覆盖推导', buildEffectiveGates(catalog, { [matlabDir.id]: false }, selection)[matlabDir.id] === false)

// ---- 项目根 ----
const proj = join(WORK, 'proj-with-git')
mkdirSync(join(proj, '.git'), { recursive: true })
const nested = join(proj, 'deep', 'nested')
mkdirSync(nested, { recursive: true })
check('项目根取最近 .git 祖先', resolveProjectRoot(nested) === proj)
const noGit = join(WORK, 'no-git')
mkdirSync(noGit, { recursive: true })
check('无 .git 时用 cwd', resolveProjectRoot(noGit) === noGit)

// ---- 门禁 ----
const off = desiredSkills(catalog, selection, { engineering: false, research: false, office: false })
check('三类全关时目标集合为空', off.size === 0, String(off.size))
const on = desiredSkills(catalog, selection, { engineering: true, research: false, office: false })
const expectedEngineering = engineering.filter(node => selection.skills[node.name] === true).length
check('只开工程时只含工程已勾选', on.size === expectedEngineering, `${on.size} vs ${expectedEngineering}`)
const engBatch = childBatch(catalog, 'engineering', true)
const engSkills = new Set()
const collect = node => node.kind === 'skill' ? engSkills.add(node.name) : (node.children ?? []).forEach(collect)
catalog.groups.find(group => group.id === 'engineering').children.forEach(collect)
check('全选一组覆盖整棵子树', Object.keys(engBatch.skillChanges).length === engSkills.size && engBatch.gates.engineering === true)

// ---- 技能护栏 ----
const guardCases = [
  ['拦技能写入', join(SKILLS_DIR, 'engineering', 'matlab', 'matlab-core', 'SKILL.md'), true],
  ['拦 ARS 写入', join(SKILLS_DIR, '..', 'ars', 'skills', 'deep-research', 'SKILL.md'), true],
  ['放行插件代码', join(SKILLS_DIR, '..', 'host', 'index.mjs'), false],
  ['放行普通文档', join(SKILLS_DIR, '..', 'README.md'), false],
]
for (const [label, target, expectDenied] of guardCases) {
  check(label, (guardReason(target, WORK) !== undefined) === expectDenied)
}

// ---- 平台分支 ----
check('静态 shim 与启动钩子随包', [
  'python/python', 'python/python.cmd', 'bash/bash', 'bash/bash.cmd', 'firecrawl/firecrawl',
].every(name => existsSync(join(SKILLS_DIR, '..', 'host', 'shim', name))) && existsSync(join(SKILLS_DIR, '..', 'host', 'pysite', 'sitecustomize.py')))

// ---- 参数：只进配置与凭据库 ----
const normalized = normalizeConfig({
  image: { baseUrl: 'https://api.example.com/v1', model: 'gpt-image-1' },
  natureAcademic: { pubmed: { email: 'a@example.org' } },
  patent: { embedding: { model: 'text-embedding-3-small' } },
  imageApiKey: 'should-be-ignored',
})
check('参数归一化只保留白名单字段', normalized.params.image.model === 'gpt-image-1' && normalized.warnings.some(item => item.includes('imageApiKey')))
check('非法 URL 被忽略', normalizeConfig({ image: { baseUrl: 'not a url' } }).params.image.baseUrl === '')
check('专利数据目录没有默认值', defaultParams().patent.root === '' && patentPathsOf(defaultParams()) === undefined)
check('相对专利目录被拒绝', normalizeConfig({ patent: { root: 'relative/patent' } }).params.patent.root === '')
check('插件安装目录不能当专利目录', normalizeConfig({ patent: { root: join(SKILLS_DIR, '..') } }).params.patent.root === '')
check('绝对专利目录被保留', normalizeConfig({ patent: { root: samplePatentRoot } }).params.patent.root === samplePatentRoot)
check('专利向量 URL 与维度会被校验',
  normalizeConfig({ patent: { embedding: { baseUrl: 'not-a-url', dimensions: 'abc' } } }).params.patent.embedding.baseUrl === ''
  && normalizeConfig({ patent: { embedding: { baseUrl: 'not-a-url', dimensions: 'abc' } } }).params.patent.embedding.dimensions === ''
  && normalizeConfig({ patent: { embedding: { baseUrl: 'https://api.example.com/v1', dimensions: '1536' } } }).params.patent.embedding.dimensions === '1536')
check('MCP 自动恢复默认开启且只认 on/off',
  normalizeConfig({}).params.mcp.autoRecover === 'on'
  && normalizeConfig({ mcp: { autoRecover: 'off' } }).params.mcp.autoRecover === 'off'
  && normalizeConfig({ mcp: { autoRecover: 'yes' } }).params.mcp.autoRecover === 'on')
const config = configOfParams(withSecrets(normalized.params, { 'image.apiKey': 'secret-value' }))
check('配置里没有密钥字段', JSON.stringify(config).includes('secret-value') === false && JSON.stringify(config).includes('apiKey') === false)
check('非密钥写进配置', config.image.model === 'gpt-image-1')

const credentialStore = new Map()
const edited = []
const ctx = {
  get: name => {
    if (name === 'credentials') {
      return {
        resolve: async ref => credentialStore.has(ref) ? { value: credentialStore.get(ref) } : undefined,
        set: async (ref, value) => { credentialStore.set(ref, value) },
        unset: async ref => { credentialStore.delete(ref) },
      }
    }
    if (name === 'configEditor') {
      return { edit: async (entry, build) => { edited.push({ entry, config: build() }) } }
    }
    return undefined
  },
  fiber: { entry: { id: 'dsh-zrwang-plugin' } },
}
const save = await persistParams(ctx, withSecrets(normalized.params, { 'image.apiKey': 'secret-value' }))
check('保存走 configEditor 与凭据库', save.saved && edited.length === 1 && credentialStore.get('ZRWANG_IMAGE_API_KEY') === 'secret-value', JSON.stringify(save))
check('写入的配置不含密钥', JSON.stringify(edited[0].config).includes('secret-value') === false)
const cleared = await persistParams(ctx, normalized.params)
check('空密钥会从凭据库删除', cleared.saved && !credentialStore.has('ZRWANG_IMAGE_API_KEY'))

// ---- 设置卡片 ----
const cards = settingsCards(normalized.params, { 'image.apiKey': true }).cards
const byId = Object.fromEntries(cards.map(card => [card.id, card]))
check('设置卡片齐全', ['image', 'nature-image2ppt', 'optional-search', 'nature-figure', 'nature-academic-search', 'nature-downloader', 'patent', 'mcp-stability', 'runtime'].every(id => byId[id] !== undefined), Object.keys(byId).join(','))
check('MCP 稳定性卡片是开关', byId['mcp-stability'].fields.some(field => field.id === 'autoRecover' && field.control === 'select' && field.value === 'on'))
check('专利卡片初始为空并提示未设置',
  byId.patent.fields.some(field => field.id === 'root' && field.value === '')
  && byId.patent.fields.some(field => field.id === 'patent-resolved' && String(field.value).includes('未设置')))
check('清空专利目录会写进配置', configOfParams(defaultParams()).patent.root === '')
check('密钥只回显是否已设置', JSON.stringify(cards).includes('secret-value') === false && byId.image.fields.some(field => field.secret === true && field.hasValue === true))
const savedImage = saveSettingsCard(normalized.params, { cardId: 'image', values: { baseUrl: 'https://api.example.com/v1', model: 'gpt-image-1', apiKey: 'new-secret' } })
check('保存生图卡片', savedImage.image.apiKey === 'new-secret' && savedImage.image.model === 'gpt-image-1')
const savedPatent = saveSettingsCard(normalized.params, { cardId: 'patent', values: { root: samplePatentRoot, baseUrl: 'https://api.example.com/v1', model: 'text-embedding-3-small', dimensions: '1536', apiKey: 'x' } })
check('保存专利卡片', savedPatent.patent.root === samplePatentRoot && savedPatent.patent.embedding.baseUrl === 'https://api.example.com/v1' && savedPatent.patent.embedding.model === 'text-embedding-3-small' && savedPatent.patent.embedding.dimensions === '1536' && savedPatent.patent.embedding.apiKey === 'x')
check('专利向量没有 provider 字段', savedPatent.patent.embedding.provider === undefined)
const savedMcp = saveSettingsCard(normalized.params, { cardId: 'mcp-stability', values: { autoRecover: 'off' } })
check('保存断线自动恢复开关', savedMcp.mcp.autoRecover === 'off')

// ---- 专利目录：默认路径、置灰与注入 ----
{
  const patentSkill = Object.values(catalog.skills ?? {}).find(node => String(node.dir ?? '').startsWith('research/patent/'))
  const withoutRoot = await blockedSkills(defaultParams(), catalog)
  check('默认没设置专利目录时专利技能置灰', patentSkill !== undefined && withoutRoot[patentSkill.name]?.includes('专利数据目录'), withoutRoot[patentSkill?.name])
  const withRoot = await blockedSkills({ ...defaultParams(), patent: { ...defaultParams().patent, root: samplePatentRoot } }, catalog)
  check('设置好专利目录后不再因路径置灰', patentSkill !== undefined && withRoot[patentSkill.name] === undefined, withRoot[patentSkill?.name])
  check('专利目录指向文件时置灰', patentRootProblem({ patent: { root: process.execPath } }) !== undefined)
  const env = configEnv({ ...defaultParams(), patent: { root: samplePatentRoot, embedding: { baseUrl: 'https://api.example.com/v1', model: 'text-embedding-3-small', dimensions: '1536' } } })
  check('专利向量固定走 OpenAI 兼容接口', env.PATENT_EMBEDDING_PROVIDER === 'openai_compatible' && env.PATENT_EMBEDDING_BASE_URL === 'https://api.example.com/v1' && env.PATENT_EMBEDDING_MODEL === 'text-embedding-3-small' && env.PATENT_EMBEDDING_DIMENSIONS === '1536' && env.PATENT_EMBEDDING_API_KEY_ENV === 'ZRWANG_PATENT_EMBEDDING_CRED')
  check('ARS 引用校验缓存写进插件 state', env.ARS_VERIFICATION_CACHE_PATH === join(STORAGE, 'state', 'ars', 'verification.db'))
  check('环境注入把向量库和 vault 放在同一目录',
    env.PATENT_MAP_HOME === join(samplePatentRoot, 'patent-map')
    && env.PATENT_OA_HOME === join(samplePatentRoot, 'oa')
    && env.PATENT_READER_OBSIDIAN_VAULT === join(samplePatentRoot, 'vault')
    && env.PATENT_READER_OUTPUT_DIR === join(samplePatentRoot, 'outputs', 'patent-reader'))
}

// ---- 环境注入：静态 shim，不生成 artifacts ----
{
  const beforePath = process.env.PATH
  const params = { ...defaultParams(), python: { path: process.execPath } }
  const applied = applySkillEnv(params)
  check('环境注入使用所选解释器', applied.python.path === process.execPath && process.env.ZRWANG_SKILL_PYTHON === process.execPath)
  check('PATH 指向静态 shim 目录', process.env.PATH.split(delimiter).includes(resolve(SKILLS_DIR, '..', 'host', 'shim', 'python')), JSON.stringify(process.env.PATH.split(delimiter).slice(0, 4)))
  check('PYTHONPATH 指向静态启动钩子', process.env.PYTHONPATH.split(delimiter).includes(resolve(SKILLS_DIR, '..', 'host', 'pysite')), process.env.PYTHONPATH)
  check('环境注入不生成 artifacts/backups', !existsSync(join(STORAGE, 'artifacts')) && !existsSync(join(STORAGE, 'backups')))
  restoreSkillEnv()
  check('卸载后恢复 PATH 并清掉注入变量', process.env.PATH === beforePath && process.env.ZRWANG_SKILL_PYTHON === undefined)
}

// ---- 原生技能提供方 ----
{
  await setSelection({ [sampleSkill.name]: true })
  await setGates({ engineering: true })
  const liveSelection = await loadSelection(catalog)
  const liveGates = await loadGates()
  await loadPresets(catalog, liveSelection, liveGates, proj)
  const liveWorkspace = await resolveWorkspaceByPath({ get: () => undefined }, proj, proj)
  await ensureEditableMode(catalog, liveSelection, liveGates, proj, liveWorkspace)
  let provider
  const fakeSkills = {
    registerProvider(factory) {
      provider = factory({ invalidate() {} })
      return () => {}
    },
  }
  const dispose = registerSkillProvider({ get: name => (name === 'skills' ? fakeSkills : undefined) }, { effective: () => ({}) })
  const listed = await provider.list({ cwd: proj })
  const candidate = listed.find(item => item.name === sampleSkill.name)
  check('原生提供方按选择列出技能', candidate !== undefined && candidate.provider === 'zrwang-plugin', JSON.stringify({ count: listed.length, names: listed.slice(0, 3).map(item => item.name), want: sampleSkill.name }))
  const loaded = candidate === undefined ? undefined : await provider.get(candidate, { cwd: proj })
  check('原生提供方按需读取 SKILL.md', typeof loaded?.content === 'string' && loaded.content.startsWith('---') && loaded.resourceBase?.kind === 'directory')
  check('原生提供方不写项目目录', !existsSync(join(proj, '.agents', 'skills')))
  dispose()
  await setSelection({ [sampleSkill.name]: false })
  await clearGates(['engineering'])
}

// ---- 按会话隔离 ----
{
  await saveSessionSelection('session-a', { skills: { [sampleSkill.name]: true } }, { engineering: true })
  await saveSessionSelection('session-b', { skills: {} }, { engineering: false })
  const listFor = async sessionId => {
    let provider
    const fake = {
      registerProvider(factory) {
        provider = factory({ invalidate() {} })
        return () => {}
      },
    }
    const dispose = registerSkillProvider({ get: name => (name === 'skills' ? fake : undefined) }, { effective: () => ({}) }, sessionId)
    const items = await provider.list({ cwd: proj })
    dispose()
    return items.map(item => item.name)
  }
  const a = await listFor('session-a')
  const b = await listFor('session-b')
  check('不同会话的选择互不影响', a.includes(sampleSkill.name) && !b.includes(sampleSkill.name), JSON.stringify({ a: a.slice(0, 2), b: b.slice(0, 2) }))

  const handlers = {}
  installComponentGuard({ on: (name, fn) => { handlers[name] = fn } }, 'session-b')
  const deny = await handlers['tools/pre-execute']({ name: 'mcp__windows-mcp__snapshot' }, async () => ({ kind: 'allow' }))
  const pass = await handlers['tools/pre-execute']({ name: 'read_file' }, async () => ({ kind: 'allow' }))
  check('会话没启用的 MCP 工具会被拒绝', deny.kind === 'deny' && pass.kind === 'allow', JSON.stringify({ deny, pass }))

  const calls = []
  const restrictions = createToolRestrictions({
    get: name => (name === 'tools' ? { definitions: () => [{ name: 'mcp__matlab-mcp__eval' }, { name: 'mcp__windows-mcp__click' }, { name: 'read_file' }] } : undefined),
    on() {},
  })
  const agent = {
    session: { id: 'session-a' },
    ctx: { get: () => ({ restrict: filter => { calls.push(filter); return () => {} } }) },
  }
  restrictions.attach(agent)
  await restrictions.refresh('session-a')
  // session-a 开了工程组并勾了一个工程技能：MathWorks 组件随之打开，只该 deny Windows MCP。
  check('本会话启用的组件工具保留、未启用的被移除', calls[0]?.deny?.includes('mcp__windows-mcp__click') === true
    && calls[0]?.deny?.includes('mcp__matlab-mcp__eval') !== true
    && calls[0]?.deny?.includes('read_file') !== true,
    JSON.stringify(calls[0]))

  const callsB = []
  const agentB = {
    session: { id: 'session-b' },
    ctx: { get: () => ({ restrict: filter => { callsB.push(filter); return () => {} } }) },
  }
  restrictions.attach(agentB)
  await restrictions.refresh('session-b')
  // session-b 两个组件都没开：两个 MCP 工具都要从工具表移除。
  check('两个组件都未启用时 MCP 工具全部移除', callsB[0]?.deny?.includes('mcp__matlab-mcp__eval') === true
    && callsB[0]?.deny?.includes('mcp__windows-mcp__click') === true
    && callsB[0]?.deny?.includes('read_file') !== true,
    JSON.stringify(callsB[0]))
  restrictions.disposeAll()

  // 并发触发（attach 的首次 sync + 路由刷新）只能注册一次掩码；否则后一次会覆盖
  // 前一次的 disposer，掩码永远解不掉。
  const raceCalls = []
  const raceRestrictions = createToolRestrictions({
    get: name => (name === 'tools' ? { definitions: () => [{ name: 'mcp__matlab-mcp__eval' }, { name: 'mcp__windows-mcp__click' }, { name: 'read_file' }] } : undefined),
    on() {},
  })
  await saveSessionSelection('session-race', { skills: {} }, { engineering: false, 'windows-mcp': false })
  const raceAgent = {
    session: { id: 'session-race' },
    ctx: { get: () => ({ restrict: filter => { raceCalls.push(filter); return () => {} } }) },
  }
  raceRestrictions.attach(raceAgent)
  await Promise.all([raceRestrictions.refresh('session-race'), raceRestrictions.refresh('session-race')])
  await raceRestrictions.refresh('session-race')
  check('并发刷新只注册一次工具掩码', raceCalls.length === 1, JSON.stringify(raceCalls.map(filter => filter.deny?.length)))
  raceRestrictions.disposeAll()
}

// ---- MCP 稳定性：重连预算与自动恢复 ----
{
  const matlab = resolveMatlabEntry()
  check('MATLAB MCP 使用加长的重连预算', JSON.stringify(matlab.reconnect) === JSON.stringify(RECONNECT_POLICY), JSON.stringify(matlab.reconnect))
  check('MCP 启动失败不拖垮插件装配', matlab.failOnStartupError === false)

  const scheduled = []
  const timers = {
    setTimeout(fn, ms) {
      const id = { fn, ms, unref() {} }
      scheduled.push(id)
      return id
    },
    clearTimeout(id) {
      const index = scheduled.indexOf(id)
      if (index >= 0) scheduled.splice(index, 1)
    },
  }
  let statusHandler
  const registered = []
  const released = []
  const restarted = []
  const events = []
  const manager = {
    register(name) { registered.push(name); return () => { released.push(name) } },
    async restart(name) { restarted.push(name) },
    list() { return [] },
  }
  let enabled = true
  const controller = createMcpController({
    get: name => (name === 'mcpManager' ? manager : undefined),
    on: (event, handler) => { if (event === 'mcp-manager/status') statusHandler = handler; return () => {} },
  }, {
    autoRecover: () => enabled,
    timers,
    onEvent: (kind, detail) => events.push({ kind, detail }),
  })

  await controller.reconcile({ mathworks: true }, { sessionId: 'mcp-a' })
  check('勾选后注册 MATLAB MCP', registered.includes('matlab-mcp'), JSON.stringify(registered))
  await controller.reconcile({ mathworks: false }, { sessionId: 'mcp-a' })
  await new Promise(resolve => setTimeout(resolve, 20))
  check('会话关掉后服务器保持（宿主级）', !released.includes('matlab-mcp'))

  statusHandler('matlab-mcp', { state: 'failed', reason: 'gave-up', attempt: 30, lastError: 'matlab gone' })
  check('预算耗尽后排队自动恢复', scheduled.length === 1 && scheduled[0].ms === RECOVER_DELAYS_MS[0], JSON.stringify(scheduled.map(item => item.ms)))
  check('自动恢复期间状态里带倒计时', controller.status().servers[0].recover.pendingAt !== undefined, JSON.stringify(controller.status().servers[0].recover))

  scheduled.shift().fn()
  await new Promise(resolve => setTimeout(resolve, 20))
  check('到点后重建 MCP 实例', restarted.includes('matlab-mcp'), JSON.stringify(restarted))
  check('自动恢复次数进状态面', controller.status().servers[0].recover.count === 1, JSON.stringify(controller.status().servers[0].recover))

  statusHandler('matlab-mcp', { state: 'connected', toolCount: 14 })
  check('连上后重置退避', controller.status().servers[0].recover.attempts === 0)

  statusHandler('matlab-mcp', { state: 'failed', reason: 'cleanup', result: { closeConfirmed: false } })
  check('未确认关闭不自动重建', scheduled.length === 0)

  statusHandler('matlab-mcp', { state: 'failed', reason: 'gave-up', attempt: 30 })
  enabled = false
  controller.refreshPolicy()
  check('关掉自动恢复后撤掉排队', scheduled.length === 0)
  enabled = true
  controller.refreshPolicy()
  check('重新打开自动恢复会立刻排队', scheduled.length === 1, JSON.stringify(scheduled.map(item => item.ms)))
  controller.disposeAll()
  check('卸载时清掉自愈计时器', scheduled.length === 0)

  const view = componentViews({
    engineeringInjected: 3,
    gates: { engineering: true },
    status: {
      available: true,
      servers: [{
        name: 'matlab-mcp',
        state: 'failed',
        reason: 'gave-up',
        attempt: 30,
        maxAttempts: 30,
        recover: { enabled: true, count: 2, attempts: 2, pendingAt: Date.now() + 15000, retryInMs: 15000 },
      }],
    },
  }).components[0]
  check('失败但自愈中的组件行显示自动恢复', view.recovering === true && view.statusLabel.includes('自动恢复'), view.statusLabel)
}

// ---- ARS 命令按会话开关 ----
{
  await saveSessionSelection('ars-off-session', {}, { ars: false })
  const denied = await runArsCommand({ name: 'ars-plan' }, { session: { id: 'ars-off-session' } }, '')
  check('ARS 命令在未开启的会话被拒绝', denied.kind === 'error' && denied.text.includes('本会话'), denied.text)
}

// ---- 会话快照上限 ----
{
  await saveSessionSelection('prune-a', {}, {})
  await saveSessionSelection('prune-b', {}, {})
  await saveSessionSelection('prune-c', {}, {})
  const removed = await pruneSessionSelections(2)
  const remaining = await listSessionSelections()
  check('会话快照按上限清理', removed.length >= 1 && remaining.length === 2, `removed=${removed.length} remaining=${remaining.length}`)
}

// ---- 状态文件 ----
const concurrentFile = stateFile('concurrent-writes.json')
const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => writeJson(concurrentFile, { index })))
check('并发原子写不互相踩', results.every(result => result.status === 'fulfilled'))
check('并发写后 JSON 完整', JSON.parse(readFileSync(concurrentFile, 'utf8')).index === 19)
check('状态文件在持久化目录', concurrentFile.startsWith(stateRoot()))

// ---- 卸载清理 ----
check('整个冒烟过程没有在插件包里建 cache', !existsSync(legacyCacheRoot()))
rmSync(WORK, { recursive: true, force: true })
check('临时目录已清理', !existsSync(WORK))

process.stdout.write(`\n通过 ${total - failures} 项，失败 ${failures} 项\n`)
process.exit(failures === 0 ? 0 : 1)
