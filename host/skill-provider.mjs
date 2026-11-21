/**
 * DSH 原生技能提供方：把侧栏选择结果直接注册进 ctx.skills，
 * 不再通过 <项目根>/.agents/skills 的目录联接注入。
 *
 * 每次 list({cwd}) 按当前工作区读取选择态/门禁，返回选中的技能；
 * get() 按需读取插件包内的 SKILL.md。插件包和项目目录都只读。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PKG_DIR, SKILLS_DIR } from './config.mjs'
import { loadCatalog } from './catalog.mjs'
import { desiredSkills, loadSelection } from './selection.mjs'
import { loadGates } from './gates.mjs'
import { activeModeContent, loadPresets } from './presets.mjs'
import { resolveProjectRoot } from './project.mjs'
import { resolveWorkspaceByPath } from './workspaces.mjs'
import { cleanupLegacyLinks } from './legacy-links.mjs'
import { loadArsManifest, mergeArsSkills } from './ars.mjs'
import { blockedSkills } from './settings.mjs'
import { readSessionSelection } from './session-selection.mjs'

export const PROVIDER_NAME = 'zrwang-plugin'
export const PROVIDER_RANK = 300

const invalidators = new Set()

/** 选择态变化后让 DSH 重新发现技能目录。 */
export function invalidateSkillProvider() {
  for (const invalidate of invalidators) invalidate()
}

function candidateOf(name, dir, description, extra = {}) {
  const base = dir.endsWith('.md') ? dir : join(dir, 'SKILL.md')
  return {
    name,
    description: description || name,
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'custom',
    provider: PROVIDER_NAME,
    rank: PROVIDER_RANK,
    path: existsSync(base) ? base : undefined,
    resourceBase: { kind: 'directory', path: dir },
    locator: { dir, file: base },
    ...extra,
  }
}

async function activeSelection(cwd, sessionId) {
  const catalog = await loadCatalog()
  const selection = await loadSelection(catalog)
  const gates = await loadGates()
  const projectRoot = resolveProjectRoot(cwd)
  cleanupLegacyLinks(projectRoot)
  const workspace = await resolveWorkspaceByPath(null, cwd, projectRoot)
  await loadPresets(catalog, selection, gates, projectRoot)
  const active = await activeModeContent(catalog, selection, gates, projectRoot, workspace, undefined)
  const content = active.content
  const snapshot = await readSessionSelection(sessionId)
  const chosen = snapshot === undefined
    ? (content === undefined
      ? { selection: selection.skills, gates }
      : { selection: content.selection ?? selection.skills, gates: content.gates ?? gates })
    : { selection: snapshot.skills, gates: snapshot.gates }
  const desired = desiredSkills(catalog, { ...selection, skills: chosen.selection }, chosen.gates)
  mergeArsSkills(desired, chosen.gates.ars === true)
  return { catalog, desired }
}

/**
 * @param {object} ctx
 * @param {object} runtime - createRuntime() 返回值
 */
export function registerSkillProvider(ctx, runtime, sessionId) {
  const skills = ctx.get?.('skills')
  if (skills === undefined || typeof skills.registerProvider !== 'function') return () => {}
  let invalidate
  const dispose = skills.registerProvider(control => {
    invalidate = () => control.invalidate()
    invalidators.add(invalidate)
    return {
      name: PROVIDER_NAME,
      async list(options = {}) {
        const cwd = typeof options.cwd === 'string' && options.cwd.length > 0 ? options.cwd : process.cwd()
        if (!existsSync(cwd)) return []
        const { catalog, desired } = await activeSelection(cwd, sessionId)
        const blocked = await blockedSkills(runtime.effective(), catalog)
        const ars = loadArsManifest()
        const arsByName = new Map((ars?.skills ?? []).map(item => [item.name, item]))
        const candidates = []
        for (const name of desired.keys()) {
          if (blocked[name] !== undefined) continue
          const node = catalog.skills?.[name]
          if (node !== undefined) {
            candidates.push(candidateOf(name, join(SKILLS_DIR, ...String(node.dir).split('/')), node.zh))
            continue
          }
          const arsSkill = arsByName.get(name)
          if (arsSkill !== undefined) {
            candidates.push(candidateOf(name, join(PKG_DIR, ...String(arsSkill.dir).split('/')), arsSkill.description ?? arsSkill.name))
          }
        }
        return candidates
      },
      async get(candidate) {
        const file = candidate?.locator?.file
        if (typeof file !== 'string' || !existsSync(file)) return undefined
        return {
          ...candidate,
          content: readFileSync(file, 'utf8'),
        }
      },
    }
  })
  return () => {
    if (invalidate !== undefined) invalidators.delete(invalidate)
    dispose?.()
  }
}
