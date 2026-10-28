/**
 * 技能选择态 v2：按「项目 + 对话」保存的命名注入模式。
 *
 * 规则（2026-10 用户确认）：
 * - 每个项目初始只有「默认」模式：项目基础注入态（所有层级门禁全关），注入数 0；不可重命名/删除；
 * - 「默认」只读：侧栏里任何勾选/门禁改动都会为当前对话自动派生一个「未命名」模式并切过去；
 * - 每个对话最多一个「未命名」；它只属于这个对话，**没改名之前别的对话/项目都看不到**；
 * - 「未命名」在右键菜单里改名后，升级为项目级命名模式，同项目其他对话可见；
 * - 项目级命名模式（含改名后的）在所有对话里都可见，修改即自动保存、所有对话共享；
 * - 一个模式记录每一层级的注入态（所有节点 gates + 技能勾选），计数 = 真正注入的技能数。
 *
 * 文件：state/presets.json
 * {
 *   version: 2,
 *   projects: {
 *     "<项目根>": {
 *       baselineStamp: "<catalog.generatedAt>",
 *       modes: [{ name, builtin, gates, selection, createdAt, updatedAt }],   // 默认 + 已命名（项目级）
 *       unnamed: { "<sessionId>": { gates, selection, updatedAt } },          // 每个对话的未命名
 *       active: { "<sessionId>": "<模式名>" }
 *     }
 *   }
 * }
 */
import { readJson, stateFile, writeJson } from './state.mjs'
import { replaceGates } from './gates.mjs'
import { setSelection } from './selection.mjs'

const FILE = stateFile('presets.json')
export const DEFAULT_PRESET = '默认'
const UNNAMED = '未命名'
let cache

function now() {
  return new Date().toISOString()
}

function selectedMap(catalog, selection) {
  const out = {}
  for (const name of Object.keys(catalog.skills)) {
    if (selection.skills[name] === true) out[name] = true
  }
  return out
}

function gateMap(gates) {
  const out = {}
  for (const [id, value] of Object.entries(gates ?? {})) {
    if (typeof value === 'boolean') out[id] = value
  }
  return out
}

async function persist() {
  cache.updatedAt = now()
  await writeJson(FILE, cache)
}

function projectKey(projectRoot) {
  return String(projectRoot ?? '').replace(/\//g, '\\').replace(/\\+$/, '') || '(未知项目)'
}

function newMode(name, gates, selection, builtin = false) {
  const stamp = now()
  return { name, builtin, gates, selection, createdAt: stamp, updatedAt: stamp }
}

function ensureEntry(catalog, selection, gates, projectRoot) {
  const key = projectKey(projectRoot)
  const stamp = catalog.generatedAt ?? ''
  let entry = cache.projects[key]
  if (entry === undefined) {
    entry = {
      baselineStamp: stamp,
      modes: [newMode(DEFAULT_PRESET, {}, selectedMap(catalog, selection), true)],
      unnamed: {},
      active: {},
    }
    cache.projects[key] = entry
    return { entry, key, dirty: true }
  }
  let dirty = false
  // 兼容旧结构：active 曾是一个字符串
  if (typeof entry.active === 'string') {
    entry.active = {}
    dirty = true
  }
  if (entry.active === null || typeof entry.active !== 'object') {
    entry.active = {}
    dirty = true
  }
  if (entry.unnamed === null || typeof entry.unnamed !== 'object') {
    entry.unnamed = {}
    dirty = true
  }
  // 项目本身变化（目录树重新生成）时刷新默认模式的基础选择；已有自定义模式不动。
  if (stamp.length > 0 && entry.baselineStamp !== stamp) {
    const base = entry.modes.find(mode => mode.builtin === true)
    if (base !== undefined) base.selection = selectedMap(catalog, selection)
    entry.baselineStamp = stamp
    dirty = true
  }
  const knownSkills = new Set(Object.keys(catalog.skills))
  for (const mode of entry.modes) {
    for (const name of Object.keys(mode.selection)) {
      if (!knownSkills.has(name)) { delete mode.selection[name]; dirty = true }
    }
  }
  if (!entry.modes.some(mode => mode.builtin === true)) {
    entry.modes.unshift(newMode(DEFAULT_PRESET, {}, selectedMap(catalog, selection), true))
    dirty = true
  }
  void gates
  return { entry, key, dirty }
}

/** 读选择态（按项目 + 对话）。 */
export async function loadPresets(catalog, selection, gates, projectRoot) {
  if (cache === undefined) {
    const raw = await readJson(FILE, null)
    cache = raw !== null && raw.version === 2 && raw.projects !== null && typeof raw.projects === 'object'
      ? { version: 2, projects: raw.projects, updatedAt: raw.updatedAt }
      : { version: 2, projects: {}, updatedAt: now() }
  }
  const { entry, key, dirty } = ensureEntry(catalog, selection, gates, projectRoot)
  if (dirty) {
    // 新项目 / 结构迁移后：让默认模式成为当前注入态（门禁全关 → 注入 0）。
    const base = entry.modes.find(mode => mode.builtin === true)
    if (base !== undefined) await applyModeContent(catalog, { gates: base.gates ?? {}, selection: base.selection ?? {} })
    await persist()
  }
  return { key, entry }
}

function unnamedOf(entry, sessionId) {
  return entry.unnamed[String(sessionId)]
}

/** 当前对话活跃模式名：默认 / 命名模式 / 未命名。 */
function activeNameOf(entry, sessionId) {
  const name = entry.active[String(sessionId)]
  if (name === UNNAMED && unnamedOf(entry, sessionId) !== undefined) return UNNAMED
  if (entry.modes.some(mode => mode.name === name)) return name
  return DEFAULT_PRESET
}

function modeContent(entry, sessionId, name) {
  if (name === UNNAMED) {
    const unnamed = unnamedOf(entry, sessionId)
    if (unnamed === undefined) return undefined
    return { gates: unnamed.gates ?? {}, selection: unnamed.selection ?? {}, builtin: false, unnamed: true }
  }
  const mode = entry.modes.find(item => item.name === name)
  if (mode === undefined) return undefined
  return { gates: mode.gates ?? {}, selection: mode.selection ?? {}, builtin: mode.builtin === true, unnamed: false }
}

/** 模式真正注入的技能数（门禁逐级打开、已勾选、未被禁选）。 */
export function modeInjectedCount(catalog, content, blocked) {
  const selection = { skills: content.selection ?? {} }
  const gates = content.gates ?? {}
  let count = 0
  const walk = (node, parentOpen) => {
    if (node.kind === 'skill') {
      if (parentOpen === true && selection.skills[node.name] === true && blocked?.[node.name] === undefined) count += 1
      return
    }
    const isGroup = node.kind === 'group'
    const selfOpen = isGroup ? gates[node.id] === true : gates[node.id] !== false
    const open = parentOpen === true && selfOpen
    for (const child of node.children ?? []) walk(child, open)
  }
  for (const group of catalog.groups ?? []) walk(group, true)
  return count
}

/** 给客户端的模式摘要：默认 + 项目级命名模式 + 当前对话的未命名。 */
export function presetsPayload(catalog, blocked, projectRoot, sessionId) {
  const key = projectKey(projectRoot)
  const entry = cache?.projects?.[key]
  if (entry === undefined) return { active: DEFAULT_PRESET, items: [{ name: DEFAULT_PRESET, count: 0, builtin: true }] }
  const active = activeNameOf(entry, sessionId)
  const items = entry.modes.map(mode => ({
    name: mode.name,
    count: modeInjectedCount(catalog, { gates: mode.gates, selection: mode.selection }, blocked ?? {}),
    builtin: mode.builtin === true,
    unnamed: false,
  }))
  const unnamed = unnamedOf(entry, sessionId)
  if (unnamed !== undefined) {
    items.push({
      name: UNNAMED,
      count: modeInjectedCount(catalog, { gates: unnamed.gates, selection: unnamed.selection }, blocked ?? {}),
      builtin: false,
      unnamed: true,
    })
  }
  return { active, items }
}

/** 取当前对话的模式内容（供 syncState 判断注入态）。 */
export async function activeModeContent(catalog, selection, gates, projectRoot, sessionId) {
  const { key, entry } = ensureEntry(catalog, selection, gates, projectRoot)
  const name = activeNameOf(entry, sessionId)
  return { key, entry, name, content: modeContent(entry, sessionId, name) }
}

/** 把模式内容同步到全局 selection / gates（注入链路读这两个）。 */
export async function applyModeContent(catalog, content) {
  const changes = {}
  for (const name of Object.keys(catalog.skills)) changes[name] = content.selection?.[name] === true
  await setSelection(changes)
  await replaceGates(content.gates ?? {})
}

/** 用户改动前调用：当前是「默认」→ 为这个对话派生「未命名」；已有未命名则沿用。 */
export async function ensureEditableMode(catalog, selection, gates, projectRoot, sessionId) {
  const { entry, key } = ensureEntry(catalog, selection, gates, projectRoot)
  const name = activeNameOf(entry, sessionId)
  if (name === DEFAULT_PRESET) {
    entry.unnamed[String(sessionId)] = { gates: gateMap(gates), selection: selectedMap(catalog, selection), updatedAt: now() }
    entry.active[String(sessionId)] = UNNAMED
    await persist()
    return { created: true, name: UNNAMED, entry, key }
  }
  return { created: false, name, entry, key }
}

/** 把当前全局 selection/gates 写回当前对话的活跃模式。 */
export async function saveActiveMode(catalog, selection, gates, projectRoot, sessionId) {
  const { entry, key } = ensureEntry(catalog, selection, gates, projectRoot)
  const name = activeNameOf(entry, sessionId)
  if (name === DEFAULT_PRESET) return
  if (name === UNNAMED) {
    const unnamed = unnamedOf(entry, sessionId)
    if (unnamed === undefined) return
    unnamed.gates = gateMap(gates)
    unnamed.selection = selectedMap(catalog, selection)
    unnamed.updatedAt = now()
    await persist()
    return
  }
  const mode = entry.modes.find(item => item.name === name)
  if (mode === undefined) return
  mode.gates = gateMap(gates)
  mode.selection = selectedMap(catalog, selection)
  mode.updatedAt = now()
  await persist()
  void key
}

/** 切换到某个模式（只影响当前对话的活跃选择；项目级模式内容共享）。 */
export async function applyMode(catalog, selection, gates, projectRoot, sessionId, name) {
  const { entry } = ensureEntry(catalog, selection, gates, projectRoot)
  const content = modeContent(entry, sessionId, name)
  if (content === undefined) throw new Error(`没有这个模式：${name}`)
  await applyModeContent(catalog, content)
  entry.active[String(sessionId)] = name
  await persist()
  return content
}

/** 基于某个模式新建：复制其注入态到当前对话的「未命名」并切过去。 */
export async function cloneMode(catalog, selection, gates, projectRoot, sessionId, sourceName) {
  const { entry } = ensureEntry(catalog, selection, gates, projectRoot)
  const source = modeContent(entry, sessionId, sourceName)
  if (source === undefined) throw new Error(`没有这个模式：${sourceName}`)
  entry.unnamed[String(sessionId)] = {
    gates: gateMap(source.gates),
    selection: { ...source.selection },
    updatedAt: now(),
  }
  entry.active[String(sessionId)] = UNNAMED
  const content = modeContent(entry, sessionId, UNNAMED)
  await applyModeContent(catalog, content)
  await persist()
  return content
}

/** 重命名：未命名 → 升级为项目级命名模式；命名模式 → 直接改名；默认不可改。 */
export async function renameMode(catalog, selection, gates, projectRoot, sessionId, name, nextName) {
  const { entry } = ensureEntry(catalog, selection, gates, projectRoot)
  const trimmed = String(nextName ?? '').trim()
  if (trimmed.length === 0) throw new Error('模式名称不能为空')
  if (trimmed.length > 20) throw new Error('模式名称最多 20 个字')
  if (trimmed === DEFAULT_PRESET || trimmed === UNNAMED) throw new Error(`不能命名为「${trimmed}」`)
  if (name === DEFAULT_PRESET) throw new Error('「默认」不能重命名')
  if (entry.modes.some(mode => mode.name === trimmed)) throw new Error(`模式已存在：${trimmed}`)
  if (name === UNNAMED) {
    const unnamed = unnamedOf(entry, sessionId)
    if (unnamed === undefined) throw new Error('当前对话没有「未命名」')
    const wasActive = entry.active[String(sessionId)] === UNNAMED
    const stamp = now()
    entry.modes.push({
      name: trimmed,
      builtin: false,
      gates: gateMap(unnamed.gates),
      selection: { ...unnamed.selection },
      createdAt: stamp,
      updatedAt: stamp,
    })
    delete entry.unnamed[String(sessionId)]
    if (wasActive) entry.active[String(sessionId)] = trimmed
    await persist()
    return entry.modes[entry.modes.length - 1]
  }
  const mode = entry.modes.find(item => item.name === name)
  if (mode === undefined) throw new Error(`没有这个模式：${name}`)
  mode.name = trimmed
  mode.updatedAt = now()
  for (const [session, active] of Object.entries(entry.active)) {
    if (active === name) entry.active[session] = trimmed
  }
  await persist()
  return mode
}

/** 删除：默认不可删；删命名模式或当前对话的未命名。 */
export async function deleteMode(catalog, selection, gates, projectRoot, sessionId, name) {
  const { entry } = ensureEntry(catalog, selection, gates, projectRoot)
  if (name === DEFAULT_PRESET) throw new Error('「默认」不能删除')
  if (name === UNNAMED) {
    delete entry.unnamed[String(sessionId)]
    if (activeNameOf(entry, sessionId) === UNNAMED || entry.active[String(sessionId)] === UNNAMED) {
      entry.active[String(sessionId)] = DEFAULT_PRESET
      const base = entry.modes.find(mode => mode.builtin === true)
      if (base !== undefined) await applyModeContent(catalog, base)
    }
    await persist()
    return entry
  }
  const index = entry.modes.findIndex(mode => mode.name === name)
  if (index < 0) throw new Error(`没有这个模式：${name}`)
  entry.modes.splice(index, 1)
  for (const [session, active] of Object.entries(entry.active)) {
    if (active === name) {
      entry.active[session] = DEFAULT_PRESET
      if (session === String(sessionId)) {
        const base = entry.modes.find(mode => mode.builtin === true)
        if (base !== undefined) await applyModeContent(catalog, base)
      }
    }
  }
  await persist()
  return entry
}
