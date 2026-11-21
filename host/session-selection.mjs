/**
 * 按会话保存技能/门禁选择：每个对话独立，切回旧对话时恢复它自己的选择。
 * 文件在 DSH storages 下的 dsh-zrwang-plugin/state/，不写项目目录。
 */
import { stateFile, readJson, writeJson } from './state.mjs'

const FILE = stateFile('session-selection.json')
const VERSION = 1
let cache

async function load() {
  if (cache !== undefined) return cache
  const raw = await readJson(FILE, null)
  cache = raw !== null && raw.version === VERSION && raw.sessions !== null && typeof raw.sessions === 'object'
    ? { version: VERSION, sessions: raw.sessions }
    : { version: VERSION, sessions: {} }
  return cache
}

function snapshotOf(selection, gates) {
  const skills = {}
  for (const [name, value] of Object.entries(selection?.skills ?? {})) {
    if (value === true) skills[name] = true
  }
  const nextGates = {}
  for (const [id, value] of Object.entries(gates ?? {})) {
    if (typeof value === 'boolean') nextGates[id] = value
  }
  return { skills, gates: nextGates, updatedAt: new Date().toISOString() }
}

export async function readSessionSelection(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
  const store = await load()
  return store.sessions[sessionId]
}

export async function saveSessionSelection(sessionId, selection, gates) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
  const store = await load()
  store.sessions[sessionId] = snapshotOf(selection, gates)
  await writeJson(FILE, store)
  return store.sessions[sessionId]
}

/** 会话首次出现时用当前选择初始化；已有快照则不动。 */
export async function ensureSessionSelection(sessionId, selection, gates) {
  const existing = await readSessionSelection(sessionId)
  if (existing !== undefined) return existing
  return saveSessionSelection(sessionId, selection, gates)
}
