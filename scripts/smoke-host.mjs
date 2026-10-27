#!/usr/bin/env node
/**
 * 宿主半侧冒烟：不装 DSH，用桩上下文验证项目根、勾选门禁、目录联接增删、
 * 同名冲突与 ppt-master 项目目录链接。
 *
 * 运行时会临时改 STATE_DIR 到 AgentsDo 下的测试目录，结束后清理，不污染 state/。
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const WORK = resolve(import.meta.dirname, '..', '..', 'AgentsDo', 'skill-management-20261027', 'tmp', 'smoke')
rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })
process.env.ZRWANG_PLUGIN_STATE_DIR = join(WORK, 'state')

const { loadCatalog, skillsInGroup } = await import('../host/catalog.mjs')
const { loadSelection, desiredSkills, setSelection } = await import('../host/selection.mjs')
const { ensureSession, setGates } = await import('../host/sessions.mjs')
const { resolveProjectRoot } = await import('../host/project.mjs')
const { reconcile } = await import('../host/farm.mjs')
const { SKILLS_DIR } = await import('../host/config.mjs')

let failures = 0
function check(name, ok, detail) {
  if (ok) {
    process.stdout.write(`ok   ${name}\n`)
    return
  }
  failures += 1
  process.stderr.write(`FAIL ${name}${detail === undefined ? '' : `：${detail}`}\n`)
}

function isInside(parent, child) {
  const a = realpathSync.native(parent).toLowerCase()
  const b = realpathSync.native(child).toLowerCase()
  return b === a || b.startsWith(a + '\\')
}

const catalog = await loadCatalog()
const selection = await loadSelection(catalog)

// ---- 项目根 ----
const proj = join(WORK, 'proj-with-git')
mkdirSync(join(proj, '.git'), { recursive: true })
const nested = join(proj, 'deep', 'nested')
mkdirSync(nested, { recursive: true })
check('项目根取最近 .git 祖先', resolveProjectRoot(nested) === proj)
const noGit = join(WORK, 'no-git')
mkdirSync(noGit, { recursive: true })
check('无 .git 时用 cwd', resolveProjectRoot(noGit) === noGit)

// ---- 一级门禁 ----
const engineering = skillsInGroup(catalog, 'engineering')
const research = skillsInGroup(catalog, 'research')
const off = desiredSkills(catalog, selection, { engineering: false, research: false, office: false })
check('三类全关时目标集合为空', off.size === 0, String(off.size))
const on = desiredSkills(catalog, selection, { engineering: true, research: false, office: false })
const expectedEngineering = engineering.filter(node => selection.skills[node.name] === true).length
check('只开工程时目标只含工程已勾选', on.size === expectedEngineering, `${on.size} vs ${expectedEngineering}`)
check('工程目标不含科研技能', research.every(node => !on.has(node.name)))
const leafNames = node => node.kind === 'skill' ? [node.name] : (node.children ?? []).flatMap(leafNames)
const matlabNode = catalog.groups.find(group => group.id === 'engineering').children.find(node => node.id === 'matlab')
const gated = desiredSkills(catalog, selection, { engineering: true, matlab: false }, {})
check('关闭 MATLAB 目录只影响该子树', gated.size < on.size && leafNames(matlabNode).every(name => !gated.has(name)))

// ---- 联接增删 ----
const skillsDir = join(proj, '.agents', 'skills')
const pick = engineering.find(node => node.name === 'matlab-create-live-script') ?? engineering[0]
const first = new Map([[pick.name, pick]])
const r1 = await reconcile({ projectRoot: proj, desired: first })
check('建立联接', r1.added === 1 && existsSync(join(skillsDir, pick.name)), JSON.stringify(r1))
check('联接指向插件技能目录', realpathSync(join(skillsDir, pick.name)) === realpathSync(join(SKILLS_DIR, ...String(pick.dir).split('/'))))
const r2 = await reconcile({ projectRoot: proj, desired: new Map() })
check('取消后摘除联接且实体仍在', r2.removed === 1 && !existsSync(join(skillsDir, pick.name)) && existsSync(join(SKILLS_DIR, ...String(pick.dir).split('/'))))

// ---- 同名冲突 ----
const second = engineering.find(node => node.name !== pick.name)
const realDir = join(skillsDir, second.name)
mkdirSync(realDir, { recursive: true })
const r3 = await reconcile({ projectRoot: proj, desired: new Map([[second.name, second]]) })
check('同名真实目录报冲突且不覆盖', r3.conflicts.some(item => item.name === second.name) && existsSync(realDir))
const r4 = await reconcile({ projectRoot: proj, desired: new Map() })
check('冲突目录不被删除', existsSync(realDir))
rmSync(realDir, { recursive: true, force: true })

// ---- ppt-master 项目目录 ----
const pptNode = catalog.groups
  .flatMap(group => skillsInGroup(catalog, group.id))
  .find(node => node.name === 'ppt-master')
check('目录树里有 ppt-master', pptNode !== undefined)
const pptLink = join(SKILLS_DIR, 'office', 'ppt-master', 'projects')
const r5 = await reconcile({ projectRoot: proj, desired: new Map([[pptNode.name, pptNode]]) })
const pptTarget = join(proj, '.agents', 'ppt-master', 'projects')
check('ppt 项目目录被创建', existsSync(pptTarget), JSON.stringify(r5))
check('projects 链接指向当前项目', existsSync(pptLink) && realpathSync(pptLink) === realpathSync(pptTarget))
const r6 = await reconcile({ projectRoot: proj, desired: new Map() })
check('取消 ppt-master 后移除 projects 链接', !existsSync(pptLink), JSON.stringify(r6))

// ---- 会话与持久化 ----
const session = await ensureSession('smoke-session', proj)
check('新会话三类全 false', ['engineering', 'research', 'office'].every(id => session.gates[id] === false))
await setGates('smoke-session', { engineering: true, matlab: false })
const session2 = await ensureSession('smoke-session', proj)
check('目录闸门按会话保存', session2.gates.engineering === true && session2.gates.matlab === false && session2.gates.simulink === undefined)
await setSelection({ [pick.name]: false })
const reloaded = await loadSelection(catalog)
check('二级以下勾选持久化', reloaded.skills[pick.name] === false)
await setSelection({ [pick.name]: true })

// ---- 清理 ----
rmSync(WORK, { recursive: true, force: true })
if (existsSync(pptLink)) rmSync(pptLink, { force: true })

process.stdout.write(failures === 0 ? '\nsmoke: 全部通过\n' : `\nsmoke: ${failures} 项失败\n`)
process.exit(failures === 0 ? 0 : 1)
