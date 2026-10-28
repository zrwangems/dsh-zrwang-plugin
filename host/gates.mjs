/**
 * 每一级目录的注入闸门状态。
 *
 * 打开/关闭某一级只影响“这一级下面是否注入”，不改变下一级技能的勾选；
 * 状态存在插件自己的 <插件目录>/state/gates.json，重开侧栏、换会话都保持，不会恢复成默认全开。
 *
 * 默认值：一级目录（工程/科研/办公）关闭；其余目录视为开启。
 */
import { GROUP_IDS } from './config.mjs'
import { readJson, stateFile, writeJson } from './state.mjs'

// 放在插件自己的 state/ 里，尽量减少 DSH 家目录下的内容
function gatesFile() {
  return stateFile('gates.json')
}

let cache
let cacheFile

async function loadDocument() {
  const file = gatesFile()
  if (cache !== undefined && cacheFile === file) return cache
  const raw = await readJson(file, { version: 1, gates: {} })
  cache = { version: 1, gates: raw.gates ?? {} }
  cacheFile = file
  return cache
}

export async function loadGates() {
  const document = await loadDocument()
  const gates = {}
  for (const id of GROUP_IDS) gates[id] = document.gates[id] === true
  for (const [id, value] of Object.entries(document.gates)) {
    if (typeof value === 'boolean') gates[id] = value
  }
  // ARS 是第四行固定区块：默认关闭，用户勾选后才注入。
  gates.ars = document.gates.ars === true
  return gates
}

export async function setGates(patch) {
  const document = await loadDocument()
  let dirty = false
  for (const [id, value] of Object.entries(patch ?? {})) {
    if (typeof value !== 'boolean' || id.length === 0) continue
    if (document.gates[id] === value) continue
    document.gates[id] = value
    dirty = true
  }
  if (dirty) await writeJson(gatesFile(), document)
  return loadGates()
}

/** 整体替换门禁（切换选择态用）：未列出的全部置 false。 */
export async function replaceGates(values) {
  const document = await loadDocument()
  const next = {}
  for (const [id, value] of Object.entries(values ?? {})) {
    if (typeof value === 'boolean' && id.length > 0) next[id] = value
  }
  document.gates = next
  await writeJson(gatesFile(), document)
  return loadGates()
}

/** 顶层目录必须显式打开；更深层目录默认开，显式 false 才关。 */
export function gateOpen(gates, id, depth) {
  return depth === 0 ? gates[id] === true : gates[id] !== false
}
