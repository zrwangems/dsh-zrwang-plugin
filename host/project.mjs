/**
 * 会话工作目录 → 项目根 → .agents 下的两个目标目录。
 *
 * 项目根判定与 DSH 的 skill-filesystem 保持一致：最近的含 .git 的祖先；没有就用 cwd。
 */
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'

/** 拒绝盘符根、Windows 目录等明显不该写的位置。 */
export function validateCwd(cwd) {
  if (typeof cwd !== 'string' || cwd.trim().length === 0) throw new Error('缺少会话工作目录 cwd')
  if (!isAbsolute(cwd)) throw new Error(`cwd 不是绝对路径：${cwd}`)
  const absolute = resolve(cwd)
  if (!existsSync(absolute)) throw new Error(`工作目录不存在：${absolute}`)
  const root = parse(absolute).root
  if (absolute === root) throw new Error(`拒绝在盘符根上操作：${absolute}`)
  if (/^[a-z]:\\windows(\\|$)/i.test(absolute)) throw new Error(`拒绝在系统目录上操作：${absolute}`)
  return absolute
}

/** 最近含 .git 的祖先；没有则返回起点（与 DSH 的 findProjectRoot 一致）。 */
export function resolveProjectRoot(cwd) {
  const start = validateCwd(cwd)
  let dir = start
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}
