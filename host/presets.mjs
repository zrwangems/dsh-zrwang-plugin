/**
 * 技能选择态 v3：按「项目 + DSH 工作区」保存的注入模式。
 *
 * 规则（2026-11 用户确认）：
 * - 每个项目初始只有「默认」模式：项目基础注入态（所有层级门禁全关），注入数 0；不可重命名/删除；
 * - 「默认」只读：在它上面做任何勾选/门禁改动时，为**当前 DSH 工作区**自动创建（或复用）一个模式；
 * - 自动模式用工作区名命名（重名加「 (2)」），一个工作区只有一个，**同工作区的所有对话共享**；
 * - 自动模式改动即自动保存；它只在本工作区可见，别的对话/工作区看不到；
 * - 从「默认」继续编辑时会复用这个自动模式；如果它原有内容和工作区当时的基础态不同，
 *   先把旧内容归档成项目级副本「<名字> (旧)」，避免之前的勾选被静默覆盖；
 * - 自动模式被重命名后升级为项目级命名模式：同项目所有工作区可见，修改即自动保存、所有对话共享；
 * - 项目级命名模式在所有工作区都可见；「基于此新建」把源模式复制进当前工作区的自动模式；
 * - 一个模式记录每一层级的注入态（所有节点 gates + 技能勾选），计数 = 真正注入的技能数。
 *
 * 文件：state/presets.json
 * {
 *   version: 3,
 *   projects: {
 *     "<项目根>": {
 *       baselineStamp: "<catalog.generatedAt>",
 *       modes: [{ name, builtin, gates, selection, createdAt, updatedAt }],
 *       auto: { "<工作区键>": { name, title, path, gates, selection, createdAt, updatedAt } },
 *       active: { "<工作区键>": "<模式名>" },
 *       legacy: { auto: { "<sessionId>": { gates, selection, updatedAt } }, active: { "<sessionId>": "<模式名>" } }
 *     }
 *   }
 * }
 */
import { backupFile, readJson, stateFile, writeJson } from './state.mjs'
import { replaceGates } from './gates.mjs'
import { effectiveGateOpen, setSelection } from './selection.mjs'
import { presetNameFromTitle, projectKeyOf, uniquePresetName } from './workspaces.mjs'

const FILE = stateFile('presets.json')
export const DEFAULT_PRESET = '默认'
/** v2 的临时模式名：只在迁移旧数据时出现，不再作为新模式名。 */
export const LEGACY_UNNAMED = '未命名'
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

/** 「默认」模式的基础勾选 = catalog.defaults（生成目录树时决定，当前只含工程组技能）。 */
function defaultsMap(catalog) {
  const out = {}
  for (const name of catalog.defaults ?? []) {
    if (catalog.skills?.[name] !== undefined) out[name] = true
  }
  return out
}

async function persist() {
  cache.updatedAt = now()
  await writeJson(FILE, cache)
}

function projectKey(projectRoot) {
  return projectKeyOf(projectRoot)
}

/** 兼容早期版本在 Linux/macOS 上误存的反斜杠项目键，读取时归一而不是新建空项目。 */
function normalizeProjectKeys(projects) {
  const out = {}
  for (const [key, entry] of Object.entries(projects ?? {})) {
    const normalized = projectKey(key)
    const previous = out[normalized]
    if (previous === undefined) {
      out[normalized] = entry
      continue
    }
    // 出错版本可能已经同时写过两种键。保留内容更多的一份，不让后来补出的空默认项目
    // 覆盖原来的命名模式；正常状态一个项目只有一种键，不会进入这里。
    const score = value => (value?.modes?.length ?? 0) + Object.keys(value?.auto ?? {}).length
      + Object.keys(value?.active ?? {}).length + Object.keys(value?.legacy?.auto ?? {}).length
    if (score(entry) > score(previous)) out[normalized] = entry
  }
  return out
}

function newMode(name, gates, selection, builtin = false) {
  const stamp = now()
  return { name, builtin, gates, selection, createdAt: stamp, updatedAt: stamp }
}

function newAutoMode(name, workspace, gates, selection) {
  const stamp = now()
  return {
    name,
    title: workspace.title,
    path: workspace.path ?? '',
    gates,
    selection,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

/** 已被占用的模式名：默认 + 项目级命名模式 + 所有工作区的自动模式。 */
function takenNames(entry) {
  const taken = new Set([DEFAULT_PRESET])
  for (const mode of entry.modes) taken.add(mode.name)
  for (const auto of Object.values(entry.auto)) taken.add(auto.name)
  return taken
}

function autoOf(entry, workspace) {
  return entry.auto[workspace.key]
}

function namedMode(entry, name) {
  return entry.modes.find(mode => mode.name === name)
}

function modeExists(entry, workspace, name) {
  if (name === DEFAULT_PRESET) return true
  if (namedMode(entry, name) !== undefined) return true
  const auto = autoOf(entry, workspace)
  return auto !== undefined && auto.name === name
}

function activeNameOf(entry, workspace) {
  const name = entry.active[workspace.key]
  if (typeof name === 'string' && modeExists(entry, workspace, name)) return name
  return DEFAULT_PRESET
}

function modeContent(entry, workspace, name) {
  if (name === DEFAULT_PRESET) {
    const mode = namedMode(entry, DEFAULT_PRESET)
    if (mode === undefined) return undefined
    return { gates: mode.gates ?? {}, selection: mode.selection ?? {}, builtin: true, workspace: false }
  }
  const mode = namedMode(entry, name)
  if (mode !== undefined) {
    return { gates: mode.gates ?? {}, selection: mode.selection ?? {}, builtin: false, workspace: false }
  }
  const auto = autoOf(entry, workspace)
  if (auto !== undefined && auto.name === name) {
    return { gates: auto.gates ?? {}, selection: auto.selection ?? {}, builtin: false, workspace: true }
  }
  return undefined
}

/** v2 → v3：unnamed/active 先搬到 legacy，等对应会话下次访问时按工作区落位。 */
function migrateV2(projects) {
  const out = {}
  for (const [key, entry] of Object.entries(projects ?? {})) {
    if (entry === null || typeof entry !== 'object') continue
    const unnamed = entry.unnamed !== null && typeof entry.unnamed === 'object' ? entry.unnamed : {}
    const active = entry.active !== null && typeof entry.active === 'object' && typeof entry.active !== 'string' ? entry.active : {}
    const hasLegacy = Object.keys(unnamed).length > 0 || Object.keys(active).length > 0
    out[projectKey(key)] = {
      baselineStamp: entry.baselineStamp ?? '',
      modes: Array.isArray(entry.modes) ? entry.modes : [],
      auto:
        entry.auto !== null && typeof entry.auto === 'object'
          ? entry.auto
          : {},
      active:
        entry.active !== null && typeof entry.active === 'object' && typeof entry.active !== 'string'
          ? entry.active
          : {},
      ...(hasLegacy ? { legacy: { auto: unnamed, active } } : {}),
    }
  }
  return out
}

function ensureEntry(catalog, selection, gates, projectRoot) {
  const key = projectKey(projectRoot)
  const stamp = catalog.generatedAt ?? ''
  let entry = cache.projects[key]
  if (entry === undefined) {
    entry = {
      baselineStamp: stamp,
      modes: [newMode(DEFAULT_PRESET, {}, defaultsMap(catalog), true)],
      auto: {},
      active: {},
    }
    cache.projects[key] = entry
    return { entry, key, dirty: true }
  }
  let dirty = false
  if (entry.auto === null || typeof entry.auto !== 'object') {
    entry.auto = {}
    dirty = true
  }
  if (entry.active === null || typeof entry.active !== 'object' || typeof entry.active === 'string') {
    entry.active = {}
    dirty = true
  }
  if (entry.legacy !== undefined && (entry.legacy === null || typeof entry.legacy !== 'object')) {
    delete entry.legacy
    dirty = true
  }
  // 项目本身变化（目录树重新生成）时刷新默认模式的基础选择；已有自定义模式不动。
  if (stamp.length > 0 && entry.baselineStamp !== stamp) {
    const base = entry.modes.find(mode => mode.builtin === true)
    if (base !== undefined) base.selection = defaultsMap(catalog)
    entry.baselineStamp = stamp
    dirty = true
  }
  const knownSkills = new Set(Object.keys(catalog.skills))
  const prune = record => {
    if (record?.selection === undefined || record.selection === null) return
    for (const name of Object.keys(record.selection)) {
      if (!knownSkills.has(name)) { delete record.selection[name]; dirty = true }
    }
  }
  for (const mode of entry.modes) prune(mode)
  for (const auto of Object.values(entry.auto)) prune(auto)
  if (!entry.modes.some(mode => mode.builtin === true)) {
    entry.modes.unshift(newMode(DEFAULT_PRESET, {}, defaultsMap(catalog), true))
    dirty = true
  }
  // 自动模式与别的模式重名（迁移或手工编辑留下的脏数据）时重新取名。
  const names = new Set([DEFAULT_PRESET])
  for (const mode of entry.modes) names.add(mode.name)
  for (const auto of Object.values(entry.auto)) {
    if (names.has(auto.name)) {
      const next = uniquePresetName(auto.title || auto.name, names)
      for (const [wsKey, active] of Object.entries(entry.active)) {
        if (active === auto.name && entry.auto[wsKey] === auto) entry.active[wsKey] = next
      }
      auto.name = next
      dirty = true
    }
    names.add(auto.name)
  }
  void gates
  return { entry, key, dirty }
}

/** 工作区改名后让自动模式名跟随（自动模式名永远是生成的，重命名会升级为项目级模式）。 */
function syncWorkspaceTitle(entry, workspace) {
  const auto = autoOf(entry, workspace)
  if (auto === undefined) return false
  let dirty = false
  if (auto.path !== (workspace.path ?? '')) {
    auto.path = workspace.path ?? ''
    dirty = true
  }
  if (auto.title !== workspace.title) {
    const names = takenNames(entry)
    names.delete(auto.name)
    const next = uniquePresetName(workspace.title, names)
    if (next !== auto.name) {
      if (entry.active[workspace.key] === auto.name) entry.active[workspace.key] = next
      auto.name = next
    }
    auto.title = workspace.title
    dirty = true
  }
  return dirty
}

/** 把 v2 里某个会话的「未命名」搬到当前工作区的自动模式（只搬一次）。 */
function migrateLegacySession(entry, workspace, sessionId) {
  const legacy = entry.legacy
  if (legacy === undefined || legacy === null) return false
  const id = String(sessionId)
  const record = legacy.auto?.[id]
  const wasActive = legacy.active?.[id]
  if (record === undefined) return false
  delete legacy.auto[id]
  if (wasActive !== undefined) delete legacy.active[id]
  if (autoOf(entry, workspace) === undefined) {
    const name = uniquePresetName(workspace.title, takenNames(entry))
    const auto = newAutoMode(name, workspace, gateMap(record.gates), { ...(record.selection ?? {}) })
    if (typeof record.updatedAt === 'string') auto.createdAt = record.updatedAt
    entry.auto[workspace.key] = auto
    if (wasActive === LEGACY_UNNAMED || entry.active[workspace.key] === undefined) entry.active[workspace.key] = name
  }
  if (Object.keys(legacy.auto ?? {}).length === 0 && Object.keys(legacy.active ?? {}).length === 0) delete entry.legacy
  return true
}

/** 读选择态（按项目 + 工作区）。 */
export async function loadPresets(catalog, selection, gates, projectRoot) {
  let migrated = false
  if (cache === undefined) {
    const raw = await readJson(FILE, null)
    if (raw !== null && raw.version === 3 && raw.projects !== null && typeof raw.projects === 'object') {
      cache = { version: 3, projects: normalizeProjectKeys(raw.projects), updatedAt: raw.updatedAt }
    } else if (raw !== null && raw.version === 2 && raw.projects !== null && typeof raw.projects === 'object') {
      // 迁移前备份，迁移失败也不丢旧文件。
      await backupFile(FILE, 'presets-v2')
      cache = { version: 3, projects: migrateV2(raw.projects), updatedAt: now() }
      migrated = true
    } else {
      cache = { version: 3, projects: {}, updatedAt: now() }
    }
  }
  const { entry, key, dirty } = ensureEntry(catalog, selection, gates, projectRoot)
  if (dirty || migrated) {
    // 新项目 / 结构迁移后：让默认模式成为当前注入态（门禁全关 → 注入 0）。
    if (migrated) {
      const base = entry.modes.find(mode => mode.builtin === true)
      if (base !== undefined) await applyModeContent(catalog, { gates: base.gates ?? {}, selection: base.selection ?? {} })
    }
    await persist()
  }
  return { key, entry }
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
    const open = parentOpen === true && effectiveGateOpen(node, gates, selection)
    for (const child of node.children ?? []) walk(child, open)
  }
  for (const group of catalog.groups ?? []) walk(group, true)
  return count
}

/** 给客户端的模式摘要：默认 + 项目级命名模式 + 当前工作区的自动模式。 */
export function presetsPayload(catalog, blocked, projectRoot, workspace) {
  const key = projectKey(projectRoot)
  const entry = cache?.projects?.[key]
  const workspaceView = { key: workspace.key, title: workspace.title, path: workspace.path ?? '' }
  if (entry === undefined) {
    return {
      active: DEFAULT_PRESET,
      items: [{ name: DEFAULT_PRESET, count: 0, builtin: true, workspace: false }],
      workspace: workspaceView,
    }
  }
  const active = activeNameOf(entry, workspace)
  const items = entry.modes.map(mode => ({
    name: mode.name,
    count: modeInjectedCount(catalog, { gates: mode.gates, selection: mode.selection }, blocked ?? {}),
    builtin: mode.builtin === true,
    workspace: false,
  }))
  const auto = autoOf(entry, workspace)
  if (auto !== undefined) {
    items.push({
      name: auto.name,
      count: modeInjectedCount(catalog, { gates: auto.gates, selection: auto.selection }, blocked ?? {}),
      builtin: false,
      workspace: true,
    })
  }
  return { active, items, workspace: workspaceView }
}

/** 取当前工作区的模式内容（供 syncState 判断注入态），并按需迁移 v2 数据/跟随工作区改名。 */
export async function activeModeContent(catalog, selection, gates, projectRoot, workspace, sessionId) {
  const { key, entry } = ensureEntry(catalog, selection, gates, projectRoot)
  const titleDirty = syncWorkspaceTitle(entry, workspace)
  const legacyDirty = migrateLegacySession(entry, workspace, sessionId)
  if (titleDirty || legacyDirty) await persist()
  const name = activeNameOf(entry, workspace)
  return { key, entry, name, content: modeContent(entry, workspace, name) }
}

/** 把模式内容同步到全局 selection / gates（注入链路读这两个）。 */
export async function applyModeContent(catalog, content) {
  const changes = {}
  for (const name of Object.keys(catalog.skills)) changes[name] = content.selection?.[name] === true
  await setSelection(changes)
  await replaceGates(content.gates ?? {})
}

/** 两个模式内容是否一致：都只存「勾上的技能」和布尔门禁。 */
function sameContent(left, right) {
  const selected = map => Object.keys(map ?? {}).filter(key => map[key] === true).sort().join('|')
  const gated = map => Object.keys(map ?? {}).filter(key => map[key] === true).sort().join('|')
  return selected(left?.selection) === selected(right?.selection) && gated(left?.gates) === gated(right?.gates)
}

/** 归档名：原名加「 (旧)」，总长不超过模式名上限，重名再加序号。 */
function archiveName(base, taken) {
  const suffix = ' (旧)'
  const room = Math.max(1, 20 - [...suffix].length)
  return uniquePresetName(`${[...String(base ?? '工作区')].slice(0, room).join('')}${suffix}`, taken)
}

/**
 * 从「默认」继续编辑前，把工作区自动模式里原有的内容留一份项目级副本。
 *
 * 场景：用户先有工作区模式（比如注入了 64 个技能），点回「默认」后再勾选；
 * 旧实现直接用「默认」的内容覆盖自动模式，之前那 64 个勾选就静默没了。
 */
function archiveAutoBeforeOverwrite(entry, auto, gates, selection, catalog) {
  const previous = { gates: auto.gates ?? {}, selection: auto.selection ?? {} }
  const next = { gates: gateMap(gates), selection: selectedMap(catalog, selection) }
  if (sameContent(previous, next)) return undefined
  if (Object.keys(previous.selection).length === 0 && Object.keys(previous.gates).length === 0) return undefined
  const name = archiveName(auto.name, takenNames(entry))
  const stamp = now()
  entry.modes.push({
    name,
    builtin: false,
    gates: gateMap(previous.gates),
    selection: { ...previous.selection },
    createdAt: stamp,
    updatedAt: stamp,
  })
  return name
}

/** 用户改动前调用：当前是「默认」→ 为这个工作区创建/复用自动模式并切过去。 */
export async function ensureEditableMode(catalog, selection, gates, projectRoot, workspace) {
  const { entry, key } = ensureEntry(catalog, selection, gates, projectRoot)
  syncWorkspaceTitle(entry, workspace)
  const name = activeNameOf(entry, workspace)
  if (name !== DEFAULT_PRESET) return { created: false, name, entry, key }
  let auto = autoOf(entry, workspace)
  if (auto === undefined) {
    auto = newAutoMode(uniquePresetName(workspace.title, takenNames(entry)), workspace, {}, {})
    entry.auto[workspace.key] = auto
  } else {
    archiveAutoBeforeOverwrite(entry, auto, gates, selection, catalog)
  }
  auto.gates = gateMap(gates)
  auto.selection = selectedMap(catalog, selection)
  auto.updatedAt = now()
  entry.active[workspace.key] = auto.name
  await persist()
  return { created: true, name: auto.name, entry, key }
}

/** 把当前全局 selection/gates 写回当前工作区的活跃模式（自动保存）。 */
export async function saveActiveMode(catalog, selection, gates, projectRoot, workspace) {
  const { entry } = ensureEntry(catalog, selection, gates, projectRoot)
  const name = activeNameOf(entry, workspace)
  if (name === DEFAULT_PRESET) return
  const auto = autoOf(entry, workspace)
  if (auto !== undefined && auto.name === name) {
    auto.gates = gateMap(gates)
    auto.selection = selectedMap(catalog, selection)
    auto.updatedAt = now()
    await persist()
    return
  }
  const mode = namedMode(entry, name)
  if (mode === undefined) return
  mode.gates = gateMap(gates)
  mode.selection = selectedMap(catalog, selection)
  mode.updatedAt = now()
  await persist()
}

/** 切换到某个模式（只影响当前工作区的活跃选择；项目级模式内容共享）。 */
export async function applyMode(catalog, selection, gates, projectRoot, workspace, name) {
  const { entry } = ensureEntry(catalog, selection, gates, projectRoot)
  const content = modeContent(entry, workspace, name)
  if (content === undefined) throw new Error(`没有这个模式：${name}`)
  await applyModeContent(catalog, content)
  entry.active[workspace.key] = name
  await persist()
  return content
}

/**
 * 基于某个模式新建：
 * - 源是「默认」或项目级命名模式 → 复制进当前工作区的自动模式并切过去（自动模式已有内容会被覆盖）；
 * - 源就是当前工作区的自动模式 → 复制成一个项目级命名模式（「源名 (2)」），因为复制到自己没有意义。
 */
export async function cloneMode(catalog, selection, gates, projectRoot, workspace, sourceName) {
  const { entry } = ensureEntry(catalog, selection, gates, projectRoot)
  const source = modeContent(entry, workspace, sourceName)
  if (source === undefined) throw new Error(`没有这个模式：${sourceName}`)
  syncWorkspaceTitle(entry, workspace)

  const currentAuto = autoOf(entry, workspace)
  // 复制当前工作区自动模式：生成项目级副本，保留原自动模式
  if (currentAuto !== undefined && currentAuto.name === sourceName) {
    const names = takenNames(entry)
    const copyName = uniquePresetName(sourceName, names)
    const stamp = now()
    entry.modes.push({
      name: copyName,
      builtin: false,
      gates: gateMap(source.gates),
      selection: { ...source.selection },
      createdAt: stamp,
      updatedAt: stamp,
    })
    entry.active[workspace.key] = copyName
    await applyModeContent(catalog, { gates: source.gates, selection: source.selection })
    await persist()
    return { name: copyName, createdFrom: sourceName, promoted: true }
  }

  // 其它来源（默认 / 项目级模式）：复制进当前工作区的自动模式
  let auto = currentAuto
  if (auto === undefined) {
    auto = newAutoMode(uniquePresetName(workspace.title, takenNames(entry)), workspace, {}, {})
    entry.auto[workspace.key] = auto
  }
  auto.gates = gateMap(source.gates)
  auto.selection = { ...source.selection }
  auto.updatedAt = now()
  entry.active[workspace.key] = auto.name
  await applyModeContent(catalog, { gates: auto.gates, selection: auto.selection })
  await persist()
  return { name: auto.name, createdFrom: sourceName }
}

/** 重命名：自动模式 → 升级为项目级命名模式；命名模式 → 直接改名；默认不可改。 */
export async function renameMode(catalog, selection, gates, projectRoot, workspace, name, nextName) {
  const { entry } = ensureEntry(catalog, selection, gates, projectRoot)
  const trimmed = String(nextName ?? '').trim()
  if (trimmed.length === 0) throw new Error('模式名称不能为空')
  if (trimmed.length > 20) throw new Error('模式名称最多 20 个字')
  if (trimmed === DEFAULT_PRESET) throw new Error(`不能命名为「${trimmed}」`)
  if (name === DEFAULT_PRESET) throw new Error('「默认」不能重命名')
  if (trimmed === name) return { name: trimmed, promoted: false }
  if (namedMode(entry, trimmed) !== undefined) throw new Error(`模式已存在：${trimmed}`)
  const auto = autoOf(entry, workspace)
  if (auto !== undefined && auto.name === name) {
    const stamp = now()
    entry.modes.push({
      name: trimmed,
      builtin: false,
      gates: gateMap(auto.gates),
      selection: { ...auto.selection },
      createdAt: stamp,
      updatedAt: stamp,
    })
    delete entry.auto[workspace.key]
    if (entry.active[workspace.key] === name) entry.active[workspace.key] = trimmed
    await persist()
    return { name: trimmed, promoted: true }
  }
  const mode = namedMode(entry, name)
  if (mode === undefined) throw new Error(`没有这个模式：${name}`)
  mode.name = trimmed
  mode.updatedAt = now()
  for (const [wsKey, active] of Object.entries(entry.active)) {
    if (active === name) entry.active[wsKey] = trimmed
  }
  await persist()
  return { name: trimmed, promoted: false }
}

/** 删除：默认不可删；删项目级命名模式或当前工作区的自动模式。 */
export async function deleteMode(catalog, selection, gates, projectRoot, workspace, name) {
  const { entry } = ensureEntry(catalog, selection, gates, projectRoot)
  if (name === DEFAULT_PRESET) throw new Error('「默认」不能删除')
  const auto = autoOf(entry, workspace)
  if (auto !== undefined && auto.name === name) {
    delete entry.auto[workspace.key]
    if (entry.active[workspace.key] === name) {
      entry.active[workspace.key] = DEFAULT_PRESET
      const base = namedMode(entry, DEFAULT_PRESET)
      if (base !== undefined) await applyModeContent(catalog, base)
    }
    await persist()
    return { deleted: 'workspace' }
  }
  const index = entry.modes.findIndex(mode => mode.name === name)
  if (index < 0) throw new Error(`没有这个模式：${name}`)
  const wasActiveHere = entry.active[workspace.key] === name
  entry.modes.splice(index, 1)
  for (const [wsKey, active] of Object.entries(entry.active)) {
    if (active === name) entry.active[wsKey] = DEFAULT_PRESET
  }
  if (wasActiveHere) {
    const base = namedMode(entry, DEFAULT_PRESET)
    if (base !== undefined) await applyModeContent(catalog, base)
  }
  await persist()
  return { deleted: 'project' }
}
