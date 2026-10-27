/**
 * 运行态读写：JSON 原子写、配置备份、事件日志。
 * 所有状态都在 state/ 下，不写 DSH profile，也不写用户主目录。
 */
import { appendFile, copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { STATE_DIR } from './config.mjs'

const BACKUP_DIR = join(STATE_DIR, 'backups')
const EVENTS_FILE = join(STATE_DIR, 'events.jsonl')
const EVENT_LIMIT = 512 * 1024

export async function ensureStateDir() {
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

export async function writeJson(file, value) {
  await ensureStateDir()
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temp, file)
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
