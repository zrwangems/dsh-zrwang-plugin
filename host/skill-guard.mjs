/**
 * 技能文件护栏：禁止模型用 write/edit 修改插件内置技能。
 *
 * 背景：插件里的 skills/（262 个上游技能）与 ars/（ARS 500 多个文件）都是
 * vendor 脚本按上游 + 改写规则生成的产物。模型一旦在跑任务时顺手改了它们，
 * 会在下次 vendor 时被覆盖，或者把规则改坏而没人发现。所以统一在这层硬拦。
 *
 * 覆盖范围：
 *   - skills/ 与 ars/ 两个目录（含通过项目 .agents/skills/ 联接进来的路径，
 *     联接会 realpath 回插件目录，同样命中）；
 *   - 只拦 DSH 的 write / edit 工具；read/glob/grep 等只读工具不受影响；
 *   - 不改轮询 shell（bash/pwsh）——命令串无法在每次执行前可靠判断读写，
 *     误拦只读命令的代价更大，这一点写进文档说明。
 *
 * 开发时需要改技能文件：改 vendor/ 规则后跑 node scripts/vendor-skills.mjs，
 * 或者临时移除本护栏（见 AGENTS.md）。
 */
import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { ARS_DIR, PKG_DIR, SKILLS_DIR } from './config.mjs'

/** 受保护的根目录：插件内的所有技能实体。 */
export const PROTECTED_ROOTS = [SKILLS_DIR, ARS_DIR]

/** 尽量取真实路径；目标不存在时沿父目录回溯，避免联接绕过。 */
function canonical(target) {
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
function normalize(path) {
  const text = String(path).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? text.toLowerCase() : text
}

function isInside(parent, child) {
  const a = normalize(parent)
  const b = normalize(child)
  if (b === a) return true
  const sep = process.platform === 'win32' ? /[\\/]/ : /\//
  return b.startsWith(a) && sep.test(b.charAt(a.length))
}

/**
 * 判断一次写入是否命中护栏。纯函数，方便单测。
 * @returns {string|undefined} 拒绝理由；undefined 表示放行。
 */
export function guardReason(rawPath, cwd) {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) return undefined
  const target = isAbsolute(rawPath) ? rawPath : resolve(cwd ?? process.cwd(), rawPath)
  const real = canonical(target)
  for (const root of PROTECTED_ROOTS) {
    if (isInside(canonical(root), real)) {
      return `拒绝写入：${rawPath} 属于插件内置技能（skills/ 与 ars/ 由 vendor 按上游生成，手改会在下次更新时被覆盖）。要调整技能内容，请改 vendor/upstreams.json 的规则后运行 node scripts/vendor-skills.mjs；要临时开发调试，请让用户先移除这条护栏。`
    }
  }
  return undefined
}

/** 取会话工作目录：护栏是同步的，只能尽力而为，取不到就用进程 cwd。 */
function sessionCwd(execution) {
  const agent = execution?.agent
  return agent?.session?.header?.cwd ?? agent?.session?.cwd ?? agent?.cwd ?? process.cwd()
}

/** 注册到 ctx.tools.guard 的处理器。 */
export function createSkillGuard(ctx) {
  return execution => {
    const name = execution?.name
    if (name !== 'write' && name !== 'edit') return undefined
    const args = execution?.arguments ?? {}
    if (typeof args.file_path !== 'string') return undefined
    void ctx
    return guardReason(args.file_path, sessionCwd(execution))
  }
}

/** 插件内受保护目录的人话说明（文档与错误提示共用）。 */
export function protectedRootsForDisplay() {
  return PROTECTED_ROOTS.map(path => (isInside(PKG_DIR, path) ? path.slice(PKG_DIR.length + 1).replace(/\\/g, '/') : path))
}
