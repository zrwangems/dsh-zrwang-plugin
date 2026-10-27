/**
 * 会话工作目录 → 项目根 → .agents 下的两个目标目录。
 *
 * 项目根判定与 DSH 的 skill-filesystem 保持一致：最近的含 .git 的祖先；没有就用 cwd。
 */
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path'
import { PPT_PROJECTS_REL, SKILLS_REL } from './config.mjs'

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

export function skillsRootOf(projectRoot) {
  return join(projectRoot, ...SKILLS_REL)
}

export function pptProjectsRootOf(projectRoot) {
  return join(projectRoot, ...PPT_PROJECTS_REL)
}

/** child 是否在 parent 之内（Windows 大小写不敏感）。 */
export function isInside(parent, child) {
  const rel = relative(resolve(parent), resolve(child))
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
}

/** 两个绝对路径是否同一个位置。 */
export function samePath(a, b) {
  return relative(resolve(a), resolve(b)) === ''
}
