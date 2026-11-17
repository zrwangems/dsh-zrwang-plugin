/**
 * 运行态读写：JSON 原子写、配置备份、事件日志。
 * 所有状态都在 state/ 下，不写 DSH profile，也不写用户主目录。
 */
import { appendFile, copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PKG_DIR, STATE_DIR } from './config.mjs'

const BACKUP_DIR = join(STATE_DIR, 'backups')
const EVENTS_FILE = join(STATE_DIR, 'events.jsonl')
const EVENT_LIMIT = 512 * 1024
/** 旧版把 state 放在包目录；首次启动时复制到配置目录，旧目录保留不删。 */
const LEGACY_STATE_DIR = join(PKG_DIR, 'state')
const MIGRATED_MARK = join(STATE_DIR, '.migrated-from-package')
const writeQueues = new Map()
let migrationDone = false

/** 一次性迁移旧版包内 state 到配置目录（用户显式指定 ZRWANG_PLUGIN_STATE_DIR 时跳过）。 */
function migrateLegacyState() {
  if (migrationDone) return
  migrationDone = true
  if (typeof process.env.ZRWANG_PLUGIN_STATE_DIR === 'string' && process.env.ZRWANG_PLUGIN_STATE_DIR.length > 0) return
  if (resolve(LEGACY_STATE_DIR) === resolve(STATE_DIR)) return
  if (existsSync(MIGRATED_MARK)) return
  if (!existsSync(LEGACY_STATE_DIR)) return
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    cpSync(LEGACY_STATE_DIR, STATE_DIR, { recursive: true, force: false, errorOnExist: false })
    writeFileSync(MIGRATED_MARK, `${new Date().toISOString()}\n`, 'utf8')
  } catch {
    // 迁移失败不影响启动：继续用空状态，旧目录原样保留
  }
}

/** 同步确保状态目录存在（插件装配早期、写 Python 启动钩子前调用）。 */
export function ensureStateDirSync() {
  migrateLegacyState()
  mkdirSync(STATE_DIR, { recursive: true })
}

export async function ensureStateDir() {
  ensureStateDirSync()
  await mkdir(STATE_DIR, { recursive: true })
}

export async function readJson(file, fallback) {
  try {
    const text = await readFile(file, 'utf8')
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

export function writeJson(file, value) {
  // 同一进程内按目标文件排队，临时文件再按调用区分：既避免互相 rename 掉对方的
  // 临时文件，也保证调用顺序就是落盘顺序。失败不能堵死后续写入。
  const previous = writeQueues.get(file) ?? Promise.resolve()
  const run = async () => {
    await ensureStateDir()
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.${randomUUID()}.tmp`
    try {
      await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
      await rename(temp, file)
    } finally {
      // 写入或 rename 失败时清理自己的临时文件；已成功 rename 后不存在，忽略即可。
      await unlink(temp).catch(() => {})
    }
  }
  const next = previous.then(run, run)
  writeQueues.set(file, next)
  void next.then(() => {
    if (writeQueues.get(file) === next) writeQueues.delete(file)
  }, () => {
    if (writeQueues.get(file) === next) writeQueues.delete(file)
  })
  return next
}

/** 覆盖写之前备份原文件；返回备份路径，文件不存在时返回 undefined。 */
export async function backupFile(file, label) {
  try {
    await stat(file)
  } catch {
    return undefined
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(BACKUP_DIR, stamp)
  await mkdir(dir, { recursive: true })
  const target = join(dir, `${label}-${file.split(/[\\/]/).pop()}`)
  await copyFile(file, target)
  return target
}

/** 追加事件日志；超过上限时截断为最后 200 行，避免无限增长。 */
export async function appendEvent(kind, detail) {
  try {
    await ensureStateDir()
    const line = `${JSON.stringify({ at: new Date().toISOString(), kind, detail })}\n`
    await appendFile(EVENTS_FILE, line, 'utf8')
    const info = await stat(EVENTS_FILE)
    if (info.size > EVENT_LIMIT) {
      const text = await readFile(EVENTS_FILE, 'utf8')
      const tail = text.split('\n').slice(-200).join('\n')
      await writeFile(EVENTS_FILE, tail, 'utf8')
    }
    return true
  } catch {
    return false
  }
}

export async function readEvents(limit = 40) {
  try {
    const text = await readFile(EVENTS_FILE, 'utf8')
    return text.split('\n').filter(Boolean).slice(-limit).map(line => {
      try {
        return JSON.parse(line)
      } catch {
        return { raw: line }
      }
    })
  } catch {
    return []
  }
}

export function stateFile(name) {
  return join(STATE_DIR, name)
}
