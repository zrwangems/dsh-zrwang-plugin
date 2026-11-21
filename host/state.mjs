/**
 * 运行态读写：JSON 原子写、事件日志。
 *
 * 全部落在 DSH 持久化根下的 `<DSH_HOME>/storages/dsh-zrwang-plugin/state/`，
 * 插件升级不丢；不写 DSH profile，也不碰插件包目录。
 */
import { appendFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ensureStorageSync, stateRoot } from './paths.mjs'

/** 事件日志路径随持久化根变化，不能在建模块时固定。 */
function eventsFile() {
  return join(stateRoot(), 'events.jsonl')
}
const EVENT_LIMIT = 512 * 1024
const writeQueues = new Map()

/** 同步确保运行期目录存在（插件装配早期调用）。 */
export function ensureStateDirSync() {
  ensureStorageSync()
  mkdirSync(stateRoot(), { recursive: true })
  return stateRoot()
}

export async function ensureStateDir() {
  ensureStateDirSync()
  await mkdir(stateRoot(), { recursive: true })
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

/**
 * Windows 上杀毒/索引服务会瞬时锁住目标文件，rename 可能返回 EPERM/EBUSY；
 * 这类失败通常几毫秒后自愈，重试几次比让整次保存失败更合理。
 */
async function renameWithRetry(from, to, attempts = 4) {
  let delay = 10
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const retryable = error?.code === 'EPERM' || error?.code === 'EACCES' || error?.code === 'EBUSY'
      if (!retryable || attempt >= attempts) throw error
      await new Promise(resolve => setTimeout(resolve, delay))
      delay *= 2
    }
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
      await renameWithRetry(temp, file)
    } finally {
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

/** 追加事件日志；超过上限时截断为最后 200 行，避免无限增长。 */
export async function appendEvent(kind, detail) {
  try {
    await ensureStateDir()
    const line = `${JSON.stringify({ at: new Date().toISOString(), kind, detail })}\n`
    const file = eventsFile()
    await appendFile(file, line, 'utf8')
    const info = await stat(file)
    if (info.size > EVENT_LIMIT) {
      const text = await readFile(file, 'utf8')
      const tail = text.split('\n').slice(-200).join('\n')
      await writeFile(file, tail, 'utf8')
    }
    return true
  } catch {
    return false
  }
}

export async function readEvents(limit = 40) {
  try {
    const text = await readFile(eventsFile(), 'utf8')
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
  return join(stateRoot(), name)
}
