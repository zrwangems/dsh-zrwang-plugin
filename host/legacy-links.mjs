/**
 * 旧版本用 <项目根>/.agents/skills 下的目录联接注入技能。
 * 现在改用 ctx.skills 提供方；第一次按项目列出技能时，顺手摘掉这些旧联接。
 * 只删除 realpath 指回插件 skills/ 或 ars/ 的链接，不碰用户自己的目录。
 */
import { existsSync, lstatSync, readdirSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { ARS_DIR, SKILLS_DIR } from './config.mjs'

const cleaned = new Set()

function isPluginPath(target) {
  for (const root of [SKILLS_DIR, ARS_DIR]) {
    const rel = relative(resolve(root), resolve(target))
    if (rel === '' || (!rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\'))) return true
  }
  return false
}

function removeLink(path) {
  try {
    if (lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink()) return false
    unlinkSync(path)
    return true
  } catch {
    try {
      rmdirSync(path)
      return true
    } catch {
      return false
    }
  }
}

/** 清理一个项目里的旧联接；每个项目每个进程只扫一次。 */
export function cleanupLegacyLinks(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0 || cleaned.has(projectRoot)) return 0
  cleaned.add(projectRoot)
  const dir = join(projectRoot, '.agents', 'skills')
  if (!existsSync(dir)) return 0
  let removed = 0
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      let target
      try {
        target = realpathSync.native(full)
      } catch {
        continue
      }
      if (isPluginPath(target) && removeLink(full)) removed += 1
    }
    for (const path of [dir, join(projectRoot, '.agents')]) {
      try {
        if (readdirSync(path).length === 0) rmdirSync(path)
      } catch {
        // 目录非空或已被删除
      }
    }
  } catch {
    // 权限不足时保留旧链接，不影响本次技能列表
  }
  return removed
}
