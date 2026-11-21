/**
 * 技能文件护栏：禁止模型用写入工具修改插件内置技能。
 *
 * 背景：插件里的 skills/（329 个上游技能）与 ars/（ARS 1500 多个文件）都是
 * vendor 脚本按上游 + 改写规则生成的产物。模型一旦在跑任务时顺手改了它们，
 * 会在下次 vendor 时被覆盖，或者把规则改坏而没人发现。所以统一在这层硬拦。
 *
 * 覆盖范围：
 *   - skills/ 与 ars/ 两个目录（含通过符号链接/realpath 指回插件目录的路径）；
 *   - 拦 DSH 的写入工具：write / edit / apply_patch / str_replace_editor；
 *     read/glob/grep 等只读工具不受影响；
 *   - 不改轮询 shell（bash/pwsh）——命令串无法在每次执行前可靠判断读写，
 *     误拦只读命令的代价更大，这一点写进文档说明。
 *
 * 开发时需要改技能文件：改 vendor/ 规则后跑 node scripts/vendor-skills.mjs，
 * 或者临时移除本护栏（见 AGENTS.md）。
 */
import { isAbsolute, resolve } from 'node:path'
import { ARS_DIR, PKG_DIR, SKILLS_DIR } from './config.mjs'
import { canonicalPath, isInsidePath } from './path-utils.mjs'
import { writeTargets } from './write-targets.mjs'

/** 受保护的根目录：插件内的所有技能实体。 */
export const PROTECTED_ROOTS = [SKILLS_DIR, ARS_DIR]

/**
 * 判断一次写入是否命中护栏。纯函数，方便单测。
 * @returns {string|undefined} 拒绝理由；undefined 表示放行。
 */
export function guardReason(rawPath, cwd) {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) return undefined
  const target = isAbsolute(rawPath) ? rawPath : resolve(cwd ?? process.cwd(), rawPath)
  const real = canonicalPath(target)
  for (const root of PROTECTED_ROOTS) {
    if (isInsidePath(canonicalPath(root), real)) {
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
    const { paths } = writeTargets(name, execution?.arguments ?? {})
    for (const path of paths) {
      const reason = guardReason(path, sessionCwd(execution))
      if (reason !== undefined) return reason
    }
    void ctx
    return undefined
  }
}

/** 插件内受保护目录的人话说明（文档与错误提示共用）。 */
export function protectedRootsForDisplay() {
  return PROTECTED_ROOTS.map(path => (isInsidePath(PKG_DIR, path) ? path.slice(PKG_DIR.length + 1).replace(/\\/g, '/') : path))
}
