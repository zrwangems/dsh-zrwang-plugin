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

/** 按 defaults 重置某个一级目录下的选择；返回发生变化的技能名。 */
export async function resetGroup(catalog, groupId) {
  const defaults = new Set(catalog.defaults)
  const changes = {}
  for (const node of skillsInGroup(catalog, groupId)) changes[node.name] = defaults.has(node.name)
  await setSelection(changes)
  return Object.keys(changes)
}

/** 找到目录树里的节点（含一级目录本身）。 */
export function findTreeNode(catalog, nodeId) {
  const walk = node => {
    if (node.id === nodeId) return node
    for (const child of node.children ?? []) {
      const hit = walk(child)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  for (const group of catalog.groups ?? []) {
    const hit = walk(group)
    if (hit !== undefined) return hit
  }
  return undefined
}

/**
 * “全选 / 全关”只作用直接子节点（只往下一层）：
 * 子技能 → 勾选变更；子目录 → 该目录的门禁；不会递归到孙节点。
 */
export function childBatch(catalog, nodeId, value) {
  const node = findTreeNode(catalog, nodeId)
  if (node === undefined) throw new Error(`目录树里没有节点：${nodeId}`)
  if (node.kind === 'skill') throw new Error('技能节点不能做批量选择')
  const skillChanges = {}
  const gates = {}
  for (const child of node.children ?? []) {
    if (child.kind === 'skill') skillChanges[child.name] = value === true
    else gates[child.id] = value === true
  }
  return { skillChanges, gates }
}

/** 某个一级目录内的勾选统计。 */
export function groupCounts(catalog, selection, groupId) {
  const nodes = skillsInGroup(catalog, groupId)
  return { total: nodes.length, selected: nodes.filter(node => selection.skills[node.name] === true).length }
}

/** 这个目录（含更深层）里是否有被勾选的技能。 */
export function hasSelectedDescendant(node, selection) {
  for (const child of node.children ?? []) {
    if (child.kind === 'skill') {
      if (selection.skills[child.name] === true) return true
    } else if (hasSelectedDescendant(child, selection)) {
      return true
    }
  }
  return false
}

/**
 * 目录门禁的“有效值”。
 * - 一级目录（工程/科研/办公，kind='group'）：显式门禁，默认关；
 * - 其余目录：由勾选自下而上推导——子树里有勾选的技能才视为打开，显式 false 可临时关掉。
 * 这样界面上不会出现“子技能全没勾、父目录却勾着”的情况；对注入结果无影响（没有勾选本来就注入 0）。
 */
export function effectiveGateOpen(node, gates, selection) {
  if (node.kind === 'group') return gates[node.id] === true
  return hasSelectedDescendant(node, selection) && gates[node.id] !== false
}

/** 把整棵树的目录门禁算成显式布尔值，供客户端直接显示。 */
export function buildEffectiveGates(catalog, gates = {}, selection) {
  const out = {}
  for (const [id, value] of Object.entries(gates ?? {})) {
    if (typeof value === 'boolean') out[id] = value
  }
  const walk = node => {
    if (node.kind !== 'skill') out[node.id] = effectiveGateOpen(node, gates, selection)
    for (const child of node.children ?? []) walk(child)
  }
  for (const group of catalog.groups ?? []) walk(group)
  return out
}

/** 技能叶子到根之间的目录节点 id（不含一级分组，分组门禁不受勾选影响）。 */
export function ancestorDirIdsOfSkill(catalog, skillName) {
  const path = []
  const walk = node => {
    if (node.kind === 'skill') return node.name === skillName ? [...path] : undefined
    path.push(node)
    for (const child of node.children ?? []) {
      const hit = walk(child)
      if (hit !== undefined) return hit
    }
    path.pop()
    return undefined
  }
  for (const group of catalog.groups ?? []) {
    path.length = 0
    const hit = walk(group)
    if (hit !== undefined) return hit.filter(node => node.kind !== 'group').map(node => node.id)
  }
  return []
}

/**
 * 目标注入集合：一级目录必须显式打开；其余目录按“子树里有勾选”推导（显式 false 可关），
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
      : parentInjected === true && effectiveGateOpen(node, gates, selection)
    for (const child of node.children ?? []) walk(child, enabled)
  }
  for (const group of catalog.groups) walk(group, undefined)
  return desired
}
