#!/usr/bin/env node
/**
 * 生成 catalog/catalog.json：把 skills/ 下的技能实体与中文文案合成前端可用的目录树。
 *
 * 数据来源：
 *   - catalog/nodes.zh.json     一级/二级/三级节点的中文标题与描述
 *   - catalog/legacy/skills.zh.txt  旧插件的 237 条中文说明
 *   - catalog/skills.zh.extra.txt   新增 29 个技能的中文说明
 *   - catalog/legacy/legacy-enabled.json  旧插件的默认启用集合
 *   - vendor/upstreams.lock.json  每个技能的仓库与提交，用于溯源
 *
 * 任何缺中文、重名、目录对不上都会直接失败，保证界面不会出现空描述。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { readNameSync } from '../host/skill-md.mjs'
import { frontValue } from '../host/skill-md.mjs'
import { configDirOfParams, readParams } from '../host/plugin-params.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const SKILLS = join(ROOT, 'skills')
const NODES_FILE = join(ROOT, 'catalog', 'nodes.zh.json')
const OUT = join(ROOT, 'catalog', 'catalog.json')
const LOCK_FILE = join(ROOT, 'vendor', 'upstreams.lock.json')

/** 每组技能实体在 skills/ 下的位置。categories=true 表示下一层是官方类别目录。 */
const SOURCES = [
  { nodeId: 'matlab', dir: 'engineering/matlab', categories: true, excludeCategories: ['polyspace', 'playground'] },
  { nodeId: 'simulink', dir: 'engineering/simulink', categories: true },
  { nodeId: 'polyspace', dir: 'engineering/polyspace' },
  { nodeId: 'playground', dir: 'engineering/playground' },
  { nodeId: 'archify', dir: 'office/archify', direct: true },
  { nodeId: 'nature-skill', dir: 'research/nature-skills' },
  { nodeId: 'zotero-cli', dir: 'research/zotero-cli', direct: true },
  { nodeId: 'officecli', dir: 'office/officecli' },
  // PPT Master / HTML PPT 是独立技能，直接作为办公下的技能叶子，不再套一层目录
  { nodeId: 'ppt-master', dir: 'office/ppt-master', direct: true },
  { nodeId: 'html-ppt', dir: 'office/html-ppt', direct: true },
  // 2026-10 新增：科研 5 个仓库、办公 5 个仓库，默认全部关闭
  { nodeId: 'academic-humanizer', dir: 'research/academic-humanizer', direct: true },
  { nodeId: 'lieflat-less-ai-tone', dir: 'research/lieflat-less-ai-tone', direct: true },
  { nodeId: 'qinyan', dir: 'research/qinyan', categories: true },
  { nodeId: 'nsfc', dir: 'research/nsfc' },
  { nodeId: 'supervisor', dir: 'research/supervisor-skills' },
  { nodeId: 'lieflat-charts', dir: 'office/lieflat-charts', direct: true },
  { nodeId: 'writing-dna-skill', dir: 'office/writing-dna-skill', direct: true },
  { nodeId: 'lieflat-gongwen', dir: 'office/lieflat-gongwen', direct: true },
  { nodeId: 'guizang-ppt-skill', dir: 'office/guizang-ppt-skill', direct: true },
  { nodeId: 'frontend-slides', dir: 'office/frontend-slides', direct: true },
  { nodeId: 'patent', dir: 'research/patent' },
  // ARS 不进技能树：它是固定功能区块，由 catalog/ars.json 描述、默认全量注入。
]

function fail(message) {
  process.stderr.write(`错误：${message}\n`)
  process.exit(1)
}

function parseZhTable(file) {
  const table = new Map()
  if (!existsSync(file)) fail(`缺少中文说明表：${file}`)
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim().length === 0 || line.trim().startsWith('#')) continue
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const name = line.slice(0, tab).trim()
    const zh = line.slice(tab + 1).trim()
    if (name.length === 0 || zh.length === 0) continue
    if (table.has(name) && table.get(name) !== zh) fail(`中文说明重复且不一致：${name}`)
    table.set(name, zh)
  }
  return table
}

function listSkillDirs(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md')))
    .map(e => e.name)
}

function listCategoryDirs(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !existsSync(join(dir, e.name, 'SKILL.md')))
    .map(e => e.name)
}

/** 上游归到某组、但按使用习惯应挂在另一组节点下的技能。 */
const NODE_OVERRIDE = {}

function main() {
  const nodes = JSON.parse(readFileSync(NODES_FILE, 'utf8'))
  const zhTable = new Map([...parseZhTable(join(ROOT, 'catalog', 'legacy', 'skills.zh.txt')), ...parseZhTable(join(ROOT, 'catalog', 'skills.zh.extra.txt'))])
  const legacy = JSON.parse(readFileSync(join(ROOT, 'catalog', 'legacy', 'legacy-enabled.json'), 'utf8'))
  const legacyEnabled = new Set(legacy.enabled ?? [])
  const lock = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : { repos: [] }
  const origin = new Map()
  for (const repo of lock.repos ?? []) {
    for (const skill of repo.skills ?? []) origin.set(skill.name, { repo: repo.repo, sha: repo.sha, path: skill.path })
  }

  const groups = structuredClone(nodes.groups)
  const byId = new Map()
  const skills = {}
  const used = new Set()

  const walk = (node, parent) => {
    byId.set(node.id, node)
    if (node.kind === undefined) node.kind = parent === undefined ? 'group' : 'node'
    for (const child of node.children ?? []) walk(child, node)
  }
  for (const group of groups) walk(group, undefined)

  const attachSkill = (parentNode, name, dirName) => {
    if (used.has(name)) fail(`技能重复挂载：${name}`)
    used.add(name)
    const zh = zhTable.get(name)
    if (zh === undefined) fail(`缺少中文说明：${name}`)
    const dir = join(SKILLS, dirName)
    const en = frontValue(readFileSync(join(dir, 'SKILL.md'), 'utf8'), 'description')
    const info = origin.get(name) ?? { repo: 'local', sha: 'local', path: dirName }
    skills[name] = {
      name,
      dir: dirName,
      zh,
      en: en.slice(0, 400),
      group: ancestors(parentNode).map(n => n.id).join('/'),
      path: dirName.split('\\').join('/'),
      repo: info.repo,
      sha: info.sha,
    }
    const node = {
      id: `skill:${name}`,
      kind: 'skill',
      title: name,
      zh,
      name,
      dir: dirName.split('\\').join('/'),
    }
    parentNode.children ??= []
    parentNode.children.push(node)
  }

  const ancestors = node => {
    const chain = []
    let cur = node
    while (cur !== undefined) {
      chain.unshift(cur)
      cur = cur._parent
    }
    return chain
  }

  const findNode = (root, id) => {
    if (root.id === id) return root
    for (const child of root.children ?? []) {
      const hit = findNode(child, id)
      if (hit !== undefined) return hit
    }
    return undefined
  }

  // 先建立父子链，便于统计
  const linkParents = (node, parent) => {
    node._parent = parent
    for (const child of node.children ?? []) linkParents(child, node)
  }
  for (const group of groups) linkParents(group, undefined)

  for (const source of SOURCES) {
    const rootNode = groups.flatMap(g => [g, ...(g.children ?? [])]).find(n => n.id === source.nodeId)
    if (rootNode === undefined) fail(`nodes.zh.json 缺少节点：${source.nodeId}`)
    const dir = join(SKILLS, ...source.dir.split('/'))
    if (!existsSync(dir)) fail(`技能目录不存在：${dir}`)
    if (source.direct === true) {
      // 单技能目录不再套同名子目录：SKILL.md 直接放在 source.dir 下
      const hasRootSkill = existsSync(join(dir, 'SKILL.md'))
      let skillRoot = dir
      let subDir = ''
      if (!hasRootSkill) {
        const skillDirs = listSkillDirs(dir)
        if (skillDirs.length !== 1) fail(`${source.nodeId} 应只有一个技能目录，实际 ${skillDirs.length}`)
        subDir = skillDirs[0]
        skillRoot = join(dir, subDir)
      }
      const name = readNameSync(skillRoot)
      if (used.has(name)) fail(`技能重复挂载：${name}`)
      const zh = zhTable.get(name)
      if (zh === undefined) fail(`缺少中文说明：${name}`)
      used.add(name)
      const relDir = subDir.length > 0 ? join(source.dir, subDir).split(sep).join('/') : source.dir
      const info = origin.get(name) ?? { repo: 'local', sha: 'local', path: relDir }
      rootNode.kind = 'skill'
      rootNode.id = `skill:${name}`
      rootNode.name = name
      rootNode.title = name
      rootNode.zh = zh
      rootNode.dir = relDir
      skills[name] = {
        name,
        dir: relDir,
        zh,
        en: frontValue(readFileSync(join(skillRoot, 'SKILL.md'), 'utf8'), 'description').slice(0, 400),
        group: ancestors(rootNode).map(n => n.id).join('/'),
        path: relDir,
        repo: info.repo,
        sha: info.sha,
      }
      continue
    }
    if (source.categories === true) {
      const declared = new Set((rootNode.children ?? []).map(n => n.id))
      const excluded = new Set(source.excludeCategories ?? [])
      for (const category of listCategoryDirs(dir)) {
        if (excluded.has(category)) continue
        if (!declared.has(category)) fail(`${source.nodeId} 出现未登记类别：${category}`)
        const categoryNode = findNode(rootNode, category)
        for (const skillDir of listSkillDirs(join(dir, category))) {
          attachSkill(categoryNode, readNameSync(join(dir, category, skillDir)), join(source.dir, category, skillDir))
        }
      }
    } else {
      const findGroupNode = id => groups.flatMap(g => [g, ...(g.children ?? [])]).find(n => n.id === id)
      for (const skillDir of listSkillDirs(dir)) {
        const name = readNameSync(join(dir, skillDir))
        const override = NODE_OVERRIDE[name]
        const parent = override === undefined ? rootNode : (findGroupNode(override) ?? rootNode)
        attachSkill(parent, name, join(source.dir, skillDir))
      }
    }
  }

  // 只有一个技能的目录直接去掉，把技能提升到上一级（只保留最下面这层 skill）
  const flattenNode = node => {
    if (node.kind === 'skill') return node
    node.children = (node.children ?? []).map(flattenNode)
    if (node.children.length === 1 && node.children[0].kind === 'skill') return node.children[0]
    return node
  }
  for (const group of groups) {
    group.children = (group.children ?? []).map(flattenNode)
  }

  // 校验技能数与 lock 一致：只统计进技能树的上游（ARS 是独立功能区块，不在树里）。
  const total = Object.keys(skills).length
  const expected = (lock.repos ?? [])
    .filter(repo => repo.outsideCatalog !== true)
    .reduce((sum, repo) => sum + (repo.count ?? 0) + (repo.aliases ?? 0), 0)
  if (lock.totals?.skills !== undefined && expected > 0 && total !== expected) {
    fail(`技能数不一致：目录 ${total}，lock ${expected}`)
  }

  // 排序：只有全是技能叶子的节点按技能名排；类别节点保持 nodes.zh.json 里的官方顺序
  const sortNodes = node => {
    if (node.children === undefined) return
    if (node.children.length > 0 && node.children.every(child => child.kind === 'skill')) {
      node.children.sort((a, b) => a.name.localeCompare(b.name))
    }
    for (const child of node.children) sortNodes(child)
  }
  for (const group of groups) sortNodes(group)

  // 清理内部字段并计算统计
  const stats = { total, defaults: 0, byGroup: {} }
  const defaults = []
  const strip = (node, groupId) => {
    delete node._parent
    if (node.kind === 'skill') {
      if (legacyEnabled.has(node.name)) {
        defaults.push(node.name)
      }
      stats.byGroup[groupId] = (stats.byGroup[groupId] ?? 0) + 1
    }
    for (const child of node.children ?? []) strip(child, groupId)
  }
  for (const group of groups) strip(group, group.id)
  stats.defaults = defaults.length
  defaults.sort()

  const catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    repos: (lock.repos ?? []).map(repo => ({ id: repo.id, repo: repo.repo, sha: repo.sha, label: repo.label })),
    stats,
    defaults,
    groups,
    skills,
  }
  writeFileSync(OUT, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  const defaultsFile = join(ROOT, 'catalog', 'defaults.json')
  const defaultsDocument = { version: 1, generatedAt: catalog.generatedAt, skills: defaults }
  writeFileSync(defaultsFile, `${JSON.stringify(defaultsDocument, null, 2)}\n`, 'utf8')

  // 目录树和默认启用属于“文件类”配置，同时写到 DSH 家目录的配置根
  try {
    const configDir = configDirOfParams(readParams({}))
    mkdirSync(configDir, { recursive: true })
    writeFileSync(join(configDir, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
    writeFileSync(join(configDir, 'defaults.json'), `${JSON.stringify(defaultsDocument, null, 2)}\n`, 'utf8')
    process.stdout.write(`运行时目录树已写入 ${configDir}\n`)
  } catch (error) {
    process.stdout.write(`运行时目录树未写入：${String(error?.message ?? error)}\n`)
  }
  process.stdout.write(`ok：${total} 个技能，默认勾选 ${defaults.length} 个，写入 ${OUT}\n`)
  for (const [group, count] of Object.entries(stats.byGroup)) process.stdout.write(`  ${group.padEnd(12)} ${count}\n`)
}

main()
