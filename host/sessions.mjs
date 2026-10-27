/**
 * 每个会话的“目录开关”状态（每一级目录都是一个注入闸门）。
 *
 * 规则：点目录只开关这一级的注入，不改下一级的技能勾选；技能叶子仍然是全局持久选择。
 * 新会话：一级目录默认关；二级及以下默认开（一级打开后按原有勾选注入）。
 */
import { stateFile, readJson, writeJson } from './state.mjs'
import { GROUP_IDS } from './config.mjs'

const FILE = stateFile('sessions.json')
const MAX_SESSIONS = 300

let cache

async function save() {
  const db = await loadSessions()
  const entries = Object.entries(db.sessions)
  if (entries.length > MAX_SESSIONS) {
    entries.sort((a, b) => String(b[1].updatedAt ?? '').localeCompare(String(a[1].updatedAt ?? '')))
    db.sessions = Object.fromEntries(entries.slice(0, MAX_SESSIONS))
  }
  await writeJson(FILE, db)
}

export async function loadSessions() {
  if (cache === undefined) {
    const raw = await readJson(FILE, { version: 1, sessions: {} })
    cache = { version: 1, sessions: raw.sessions ?? {} }
  }
  return cache
}

export async function ensureSession(sessionId, projectRoot) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('缺少 sessionId')
  const db = await loadSessions()
  let record = db.sessions[sessionId]
  const now = new Date().toISOString()
  if (record === undefined) {
    record = { projectRoot, gates: Object.fromEntries(GROUP_IDS.map(id => [id, false])), createdAt: now, updatedAt: now }
    db.sessions[sessionId] = record
    await save()
    return record
  }
  let dirty = false
  if (record.projectRoot !== projectRoot) {
    record.projectRoot = projectRoot
    dirty = true
  }
  // 旧版本只有 categories（一级）；迁移成 gates，深层目录默认开
  if (record.gates === undefined) {
    record.gates = {}
    if (record.categories !== undefined) {
      for (const id of GROUP_IDS) record.gates[id] = record.categories[id] === true
      delete record.categories
    }
    dirty = true
  }
  for (const id of GROUP_IDS) {
    if (typeof record.gates[id] !== 'boolean') {
      record.gates[id] = false
      dirty = true
    }
  }
  if (dirty) {
    record.updatedAt = now
    await save()
  }
  return record
}

export async function setGates(sessionId, patch) {
  const db = await loadSessions()
  const record = db.sessions[sessionId]
  if (record === undefined) throw new Error(`会话未初始化：${sessionId}`)
  record.gates ??= {}
  let dirty = false
  for (const [id, value] of Object.entries(patch ?? {})) {
    if (typeof value !== 'boolean' || id.length === 0) continue
    if (record.gates[id] === value) continue
    record.gates[id] = value
    dirty = true
  }
  if (dirty) {
    record.updatedAt = new Date().toISOString()
    await save()
  }
  return record
}
