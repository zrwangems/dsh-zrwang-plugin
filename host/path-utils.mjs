/**
 * 路径判断的共用实现：尽量还原真实路径，并按平台处理大小写与分隔符。
 *
 * 技能护栏（skill-guard）和 ARS 写作用域护栏（ars-write-scope）都要判断
 * “目标是不是在某个根目录里面”，所以抽到这里，避免两份实现慢慢走偏。
 */
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** 尽量取真实路径；目标不存在时沿父目录回溯，避免符号链接绕过。 */
export function canonicalPath(target) {
  let current = resolve(target)
  const tail = []
  for (;;) {
    try {
      if (existsSync(current)) {
        return join(realpathSync.native(current), ...tail.reverse())
      }
    } catch {
      // 权限不足等情况下按原路径判断
      return resolve(target)
    }
    const parent = dirname(current)
    if (parent === current) return resolve(target)
    tail.push(current.slice(parent.length).replace(/^[\\/]/, ''))
    current = parent
  }
}

/** Windows 下路径大小写不敏感；两种分隔符都接受。 */
export function normalizePath(path) {
  const text = String(path).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? text.toLowerCase() : text
}

/** child 是否等于 parent 或位于 parent 之内。 */
export function isInsidePath(parent, child) {
  const a = normalizePath(parent)
  const b = normalizePath(child)
  if (b === a) return true
  const sep = process.platform === 'win32' ? /[\\/]/ : /\//
  return b.startsWith(a) && sep.test(b.charAt(a.length))
}
