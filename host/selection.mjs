/**
 * 全局技能勾选状态（二级/三级/技能叶子都落在这里）。
 *
 * 初值 = catalog.defaults（旧插件的启用集合）；新技能缺省不勾。
 * 修改立即持久化，所以「改一次以后都按这个来」。
 */
import { readJson, stateFile, writeJson } from './state.mjs'
import { skillsInGroup } from './catalog.mjs'

const FILE = stateFile('selection.json')
let cache

async function save() {
  cache.updatedAt = new Date().toISOString()
  await writeJson(FILE, cache)
}

/** 读选择状态，补齐新技能、去掉已不存在的技能。 */
export async function loadSelection(catalog) {
  const defaults = new Set(catalog.defaults)
  if (cache === undefined) {
    const raw = await readJson(FILE, { version: 1, skills: {} })
    cache = { version: 1, skills: raw.skills ?? {}, updatedAt: raw.updatedAt }
  }
  let dirty = false
  for (const name of Object.keys(catalog.skills)) {
    if (typeof cache.skills[name] !== 'boolean') {
      cache.skills[name] = defaults.has(name)
      dirty = true
    }
  }
  for (const name of Object.keys(cache.skills)) {
    if (catalog.skills[name] === undefined) {
      delete cache.skills[name]
      dirty = true
    }
  }
  if (dirty) await save()
  return cache
}

export async function setSelection(changes) {
  if (cache === undefined) throw new Error('选择状态尚未初始化')
  let dirty = false
  for (const [name, value] of Object.entries(changes)) {
    if (typeof value !== 'boolean') continue
    if (cache.skills[name] === value) continue
    cache.skills[name] = value
    dirty = true
  }
  if (dirty) await save()
  return cache
}

/** 按 defaults 重置某个一级目录下的选择。 */
export async function resetGroup(catalog, groupId) {
  const defaults = new Set(catalog.defaults)
  const changes = {}
  for (const node of skillsInGroup(catalog, groupId)) changes[node.name] = defaults.has(node.name)
  return setSelection(changes)
}

/** 某个一级目录内的勾选统计。 */
export function groupCounts(catalog, selection, groupId) {
  const nodes = skillsInGroup(catalog, groupId)
  return { total: nodes.length, selected: nodes.filter(node => selection.skills[node.name] === true).length }
}

/**
 * 目标注入集合：每一级目录都是闸门（root 必须显式打开，深层默认打开），
 * 技能叶子按持久勾选且配置就绪才注入。
 */
export function desiredSkills(catalog, selection, gates = {}, blocked = {}) {
  const desired = new Map()
  const walk = (node, parentInjected) => {
    if (node.kind === 'skill') {
      if (parentInjected === true && selection.skills[node.name] === true && blocked[node.name] === undefined) {
        desired.set(node.name, node)
      }
      return
    }
    const enabled = parentInjected === undefined
      ? gates[node.id] === true
      : parentInjected === true && gates[node.id] !== false
    for (const child of node.children ?? []) walk(child, enabled)
  }
  for (const group of catalog.groups) walk(group, undefined)
  return desired
}
