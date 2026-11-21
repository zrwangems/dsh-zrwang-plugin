#!/usr/bin/env node
/**
 * 宿主半侧冒烟：不装 DSH，用桩上下文验证目录树、勾选门禁、联接增删、
 * 技能护栏、缓存路径、参数读写与设置卡片。
 *
 * 全程在系统临时目录里跑，不写仓库、不碰真实 ~/.dsh。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

const WORK = mkdtempSync(join(tmpdir(), 'dsh-zrwang-smoke-'))
process.env.DSH_HOME = join(WORK, 'home')
process.env.ZRWANG_BASH = ''
const CACHE = join(WORK, 'cache')

const { setCacheRootForTests, cacheRoot, stateRoot, artifactRoot, legacyConfigRoot } = await import('../host/paths.mjs')
setCacheRootForTests(CACHE)
mkdirSync(CACHE, { recursive: true })

const { loadCatalog, skillsInGroup } = await import('../host/catalog.mjs')
const { loadSelection, desiredSkills, setSelection, childBatch } = await import('../host/selection.mjs')
const { buildEffectiveGates } = await import('../host/selection.mjs')
const { resolveProjectRoot } = await import('../host/project.mjs')
const { reconcile } = await import('../host/farm.mjs')
const { SKILLS_DIR } = await import('../host/config.mjs')
const { guardReason } = await import('../host/skill-guard.mjs')
const { symlinkType, shimContent } = await import('../host/platform.mjs')
const { defaultParams, normalizeConfig, configOfParams, withSecrets, persistParams } = await import('../host/params.mjs')
const { settingsCards, saveSettingsCard } = await import('../host/settings.mjs')
const { stateFile, writeJson } = await import('../host/state.mjs')

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

function isInside(parent, child) {
  const a = realpathSync.native(parent).toLowerCase()
  const b = realpathSync.native(child).toLowerCase()
  const prefix = a.endsWith(sep) ? a : a + sep
  return b === a || b.startsWith(prefix)
}

// ---- 缓存路径 ----
check('缓存根指向测试目录', cacheRoot() === CACHE)
check('状态目录在缓存下', stateRoot() === join(CACHE, 'state'))
check('运行时产物在缓存下', artifactRoot() === join(CACHE, 'artifacts'))
check('旧配置目录只用于迁移', legacyConfigRoot() === join(process.env.DSH_HOME, 'zrwang-plugin-config'))

// ---- 目录树 ----
const catalog = await loadCatalog()
const seed = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'catalog', 'catalog.json'), 'utf8'))
check('目录树直接读包内文件', catalog.stats.total === seed.stats.total && catalog.generatedAt === seed.generatedAt)
check('目录树每个 dir 都是 posix 路径', Object.values(catalog.skills).every(info => !String(info.dir).includes('\\')))
const engineering = skillsInGroup(catalog, 'engineering')
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

// ---- 联接增删 ----
const skillsDir = join(proj, '.agents', 'skills')
const pick = engineering.find(node => node.name === 'matlab-create-live-script') ?? engineering[0]
const r1 = await reconcile({ projectRoot: proj, desired: new Map([[pick.name, pick]]) })
const link = join(skillsDir, pick.name)
check('建立联接', r1.added === 1 && existsSync(link), JSON.stringify(r1))
check('联接指向插件技能目录', realpathSync(link) === realpathSync(join(SKILLS_DIR, ...String(pick.dir).split('/'))))
const r2 = await reconcile({ projectRoot: proj, desired: new Map() })
check('取消后摘除联接且实体仍在', r2.removed === 1 && !existsSync(link) && existsSync(join(SKILLS_DIR, ...pick.dir.split('/'))))
const second = engineering.find(node => node.name !== pick.name)
const realDir = join(skillsDir, second.name)
mkdirSync(realDir, { recursive: true })
const r3 = await reconcile({ projectRoot: proj, desired: new Map([[second.name, second]]) })
check('同名真实目录报冲突且不覆盖', r3.conflicts.some(item => item.name === second.name) && existsSync(realDir))
const r4 = await reconcile({ projectRoot: proj, desired: new Map() })
check('冲突目录不被删除', existsSync(realDir))
rmSync(realDir, { recursive: true, force: true })

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
check('Windows 目录链接用 junction', symlinkType('win32') === 'junction' && symlinkType('linux') === 'dir')
const winShim = shimContent('python', 'C:\\Python311\\python.exe', 'win32')
check('Windows shim 是 .cmd 内容', winShim.startsWith('@echo off') && winShim.includes('C:\\Python311\\python.exe') && winShim.includes('%*'))
const posixShim = shimContent('python', '/usr/bin/python3', 'linux')
check('POSIX shim 是 sh 脚本', posixShim.startsWith('#!/bin/sh') && posixShim.includes('exec "/usr/bin/python3"'))

// ---- 参数：只进配置与凭据库 ----
const normalized = normalizeConfig({
  image: { baseUrl: 'https://api.example.com/v1', model: 'gpt-image-1' },
  natureAcademic: { pubmed: { email: 'a@example.org' } },
  patent: { embedding: { provider: 'zhipu' } },
  imageApiKey: 'should-be-ignored',
})
check('参数归一化只保留白名单字段', normalized.params.image.model === 'gpt-image-1' && normalized.warnings.some(item => item.includes('imageApiKey')))
check('非法 URL 被忽略', normalizeConfig({ image: { baseUrl: 'not a url' } }).params.image.baseUrl === '')
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
check('设置卡片齐全', ['image', 'nature-image2ppt', 'optional-search', 'nature-figure', 'nature-academic-search', 'nature-downloader', 'patent', 'runtime'].every(id => byId[id] !== undefined), Object.keys(byId).join(','))
check('密钥只回显是否已设置', JSON.stringify(cards).includes('secret-value') === false && byId.image.fields.some(field => field.secret === true && field.hasValue === true))
const savedImage = saveSettingsCard(normalized.params, { cardId: 'image', values: { baseUrl: 'https://api.example.com/v1', model: 'gpt-image-1', apiKey: 'new-secret' } })
check('保存生图卡片', savedImage.image.apiKey === 'new-secret' && savedImage.image.model === 'gpt-image-1')
const savedPatent = saveSettingsCard(normalized.params, { cardId: 'patent', values: { provider: 'dashscope', vault: '/tmp/vault', apiKey: 'x' } })
check('保存专利卡片', savedPatent.patent.embedding.provider === 'dashscope' && savedPatent.patent.vault === '/tmp/vault' && savedPatent.patent.embedding.apiKey === 'x')

// ---- 状态文件 ----
const concurrentFile = stateFile('concurrent-writes.json')
const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => writeJson(concurrentFile, { index })))
check('并发原子写不互相踩', results.every(result => result.status === 'fulfilled'))
check('并发写后 JSON 完整', JSON.parse(readFileSync(concurrentFile, 'utf8')).index === 19)
check('状态文件在缓存目录', isInside(stateRoot(), concurrentFile))

// ---- 卸载清理 ----
rmSync(WORK, { recursive: true, force: true })
check('临时目录已清理', !existsSync(WORK))

process.stdout.write(`\n通过 ${total - failures} 项，失败 ${failures} 项\n`)
process.exit(failures === 0 ? 0 : 1)
