/**
 * 目录树读取与查询。
 *
 * 运行时真正读的是 <configDir>/catalog.json 与 <configDir>/defaults.json（文件类内容）；
 * 本包 catalog/ 下的同名文件只是首次安装的种子，缺失时复制过去。
 */
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CATALOG_FILE } from './config.mjs'
import { configDirOfParams, readParams } from './plugin-params.mjs'

let cache
let cacheMtime = 0
let runtimeFiles

async function runtimeCatalogFiles() {
  if (runtimeFiles !== undefined) return runtimeFiles
  const params = readParams({})
  const configDir = configDirOfParams(params)
  await mkdir(configDir, { recursive: true })
  const catalogFile = join(configDir, 'catalog.json')
  const defaultsFile = join(configDir, 'defaults.json')
  const seedDefaults = join(CATALOG_FILE, '..', 'defaults.json')
  if (!existsSync(catalogFile)) await copyFile(CATALOG_FILE, catalogFile)
  if (!existsSync(defaultsFile) && existsSync(seedDefaults)) await copyFile(seedDefaults, defaultsFile)
  runtimeFiles = { configDir, catalogFile, defaultsFile }
  return runtimeFiles
}

export async function loadCatalog() {
  const files = await runtimeCatalogFiles()
  const info = await stat(files.catalogFile)
  if (cache !== undefined && info.mtimeMs === cacheMtime) return cache
  const catalog = JSON.parse(await readFile(files.catalogFile, 'utf8'))
  try {
    const defaults = JSON.parse(await readFile(files.defaultsFile, 'utf8'))
    if (Array.isArray(defaults.skills)) catalog.defaults = defaults.skills
  } catch {
    // defaults 缺失时沿用 catalog 里自带的一份
  }
  cache = catalog
  cacheMtime = info.mtimeMs
  return cache
}

/** 上游仓库 → GitHub 页面；local 与非法值不生成链接。 */
function repoUrl(repo) {
  if (typeof repo !== 'string' || repo === 'local') return undefined
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? `https://github.com/${repo}` : undefined
}

/**
 * 每个“项目根”对应的 GitHub 页面：
 * - 项目根 = 该节点下所有技能同属一个仓库，且其父节点不属于同一个仓库；
 * - 只有项目根显示 GitHub 按钮，项目内部的子目录/技能不再重复显示；
 * - 本地收录（repo = local）不生成链接。
 */
export function catalogSources(catalog) {
  const bySkill = {}
  const byNode = {}
  const uniqueRepo = node => {
    const repos = new Set()
    const walk = item => {
      if (item.kind === 'skill') {
        const url = repoUrl(catalog.skills?.[item.name]?.repo)
        if (url !== undefined) repos.add(url)
        return
      }
      for (const child of item.children ?? []) walk(child)
    }
    walk(node)
    return repos.size === 1 ? [...repos][0] : undefined
  }
  const walk = (node, parentRepo) => {
    const own = uniqueRepo(node)
    const isProjectRoot = own !== undefined && own !== parentRepo
    if (isProjectRoot) {
      byNode[node.id] = own
      if (node.kind === 'skill') bySkill[node.name] = own
    }
    if (node.kind === 'skill') return
    const childParent = own === undefined ? undefined : own
    for (const child of node.children ?? []) walk(child, childParent)
  }
  for (const group of catalog.groups ?? []) walk(group, undefined)
  return { bySkill, byNode }
}

/** 给前端的目录树视图（技能叶子已带中文说明，不需要额外映射表）。 */
export function catalogView(catalog) {
  return {
    version: catalog.version,
    generatedAt: catalog.generatedAt,
    stats: catalog.stats,
    defaults: catalog.defaults,
    repos: catalog.repos,
    groups: catalog.groups,
    sources: catalogSources(catalog),
  }
}

/** 深度优先遍历，返回技能节点（带 group 路径）。 */
export function eachSkill(catalog, visit) {
  const walk = (node, trail) => {
    if (node.kind === 'skill') visit(node, trail)
    for (const child of node.children ?? []) walk(child, [...trail, node.id])
  }
  for (const group of catalog.groups) walk(group, [])
}

/** 某个一级目录下的全部技能。 */
export function skillsInGroup(catalog, groupId) {
  const group = catalog.groups.find(item => item.id === groupId)
  if (group === undefined) return []
  const out = []
  const walk = node => {
    if (node.kind === 'skill') out.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(group)
  return out
}

/** 全部技能节点，按名字索引。 */
export function skillIndex(catalog) {
  const map = new Map()
  eachSkill(catalog, node => map.set(node.name, node))
  return map
}

/** 技能名 → 插件内的绝对目录（相对 skills/ 的部分由调用方拼接）。 */
const skillIndexCache = new WeakMap()
export function indexedSkills(catalog) {
  let map = skillIndexCache.get(catalog)
  if (map === undefined) {
    map = skillIndex(catalog)
    skillIndexCache.set(catalog, map)
  }
  return map
}
