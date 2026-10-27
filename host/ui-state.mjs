/** 界面状态（目录展开/收起）：存插件 state/ui.json，重开侧栏仍保持。 */
import { readJson, stateFile, writeJson } from './state.mjs'

const FILE = stateFile('ui.json')
let cache

export async function loadUi() {
  if (cache === undefined) {
    const raw = await readJson(FILE, { version: 1, expanded: {} })
    cache = { version: 1, expanded: raw.expanded ?? {} }
  }
  return { expanded: { ...cache.expanded } }
}

export async function saveExpanded(patch) {
  const raw = await readJson(FILE, { version: 1, expanded: {} })
  const expanded = { ...(raw.expanded ?? {}) }
  for (const [id, value] of Object.entries(patch ?? {})) {
    if (typeof value !== 'boolean' || id.length === 0) continue
    expanded[id] = value
  }
  await writeJson(FILE, { version: 1, expanded })
  cache = { version: 1, expanded }
  return { expanded: { ...expanded } }
}
