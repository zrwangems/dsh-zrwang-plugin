/**
 * 技能联接农场：把勾选的技能以目录联接（junction）挂到 <项目根>/.agents/skills/，
 * 取消时只摘链接，技能实体永远留在插件仓库里。
 *
 * 只接管「指向本包 skills/ 的链接」，项目里原本就有的真实目录/外部链接一律不碰，
 * 并把冲突报给界面。
 */
import { existsSync } from 'node:fs'
import { lstat, mkdir, readdir, realpath, rmdir, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { SKILLS_DIR } from './config.mjs'
import { isInside, pptProjectsRootOf, samePath, skillsRootOf } from './project.mjs'
import { readJson, stateFile, writeJson } from './state.mjs'

const LINKS_FILE = stateFile('links.json')
let queue = Promise.resolve()

/** 串行化所有农场写操作，避免两个会话同时改同一目录。 */
export function withFarmLock(fn) {
  const next = queue.then(fn, fn)
  queue = next.then(() => undefined, () => undefined)
  return next
}

function projectKey(projectRoot) {
  return process.platform === 'win32' ? projectRoot.toLowerCase() : projectRoot
}

async function pathInfo(path) {
  try {
    return await lstat(path)
  } catch {
    return undefined
  }
}

async function removeLink(path) {
  try {
    await rmdir(path)
    return true
  } catch {
    try {
      await unlink(path)
      return true
    } catch {
      return false
    }
  }
}

async function createLink(target, link) {
  const st = await pathInfo(link)
  if (st !== undefined) {
    if (!st.isSymbolicLink()) throw new Error(`同名真实目录已存在：${link}`)
    await removeLink(link)
  }
  await symlink(target, link, 'junction')
}

/** 并发上限的 map，避免 100+ 目录联接串行等待。 */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      try {
        results[index] = { ok: true, value: await fn(items[index], index) }
      } catch (error) {
        results[index] = { ok: false, error }
      }
    }
  })
  await Promise.all(workers)
  return results
}

async function loadLinks() {
  const raw = await readJson(LINKS_FILE, { version: 1, projects: {} })
  raw.version = 1
  raw.projects ??= {}
  return raw
}

export async function readLinks() {
  return loadLinks()
}

/** 读出某个项目目录里由本插件建立的链接。 */
export async function scanLinks(projectRoot) {
  const dir = skillsRootOf(projectRoot)
  if (!existsSync(dir)) return { dir, links: new Map(), conflicts: [] }
  const links = new Map()
  const conflicts = []
  const entries = await readdir(dir, { withFileTypes: true })
  const results = await mapLimit(entries, 48, async entry => {
    const full = join(dir, entry.name)
    const st = await pathInfo(full)
    if (st === undefined) return undefined
    if (!st.isSymbolicLink()) return { conflict: { name: entry.name, reason: '同名真实目录/文件' } }
    let target
    try {
      target = await realpath(full)
    } catch {
      return undefined
    }
    if (isInside(SKILLS_DIR, target)) return { name: entry.name, target }
    return { conflict: { name: entry.name, reason: '同名外部链接' } }
  })
  for (const result of results) {
    if (!result.ok || result.value === undefined) continue
    const value = result.value
    if (value.conflict !== undefined) conflicts.push(value.conflict)
    else links.set(value.name, value.target)
  }
  return { dir, links, conflicts }
}

/**
 * 把项目目录同步成目标集合。
 * @param {{projectRoot: string, desired: Map<string, {name: string, dir: string}>}} input
 */
export async function reconcile({ projectRoot, desired, pptTarget }) {
  return withFarmLock(async () => {
    const skillsDir = skillsRootOf(projectRoot)
    await mkdir(skillsDir, { recursive: true })
    const db = await loadLinks()
    const key = projectKey(projectRoot)
    const managed = db.projects[key]?.skills ?? {}
    const scan = await scanLinks(projectRoot)
    // 项目里原本就有的真实目录/外部链接是正常的，只在与本次目标或已托管名单同名时才算冲突
    const conflicts = scan.conflicts.filter(item => desired.has(item.name) || Object.prototype.hasOwnProperty.call(managed, item.name))
    let added = 0
    let removed = 0
    let retargeted = 0
    let kept = 0

    const created = []
    for (const [name, node] of desired) {
      const target = join(SKILLS_DIR, ...String(node.dir).split('/'))
      const link = join(skillsDir, name)
      const existing = scan.links.get(name)
      const conflict = conflicts.find(item => item.name === name)
      if (conflict !== undefined) {
        delete managed[name]
        continue
      }
      if (existing !== undefined && samePath(existing, target)) {
        managed[name] = target
        kept += 1
        continue
      }
      created.push({ name, target, link, retarget: existing !== undefined })
    }
    const createdResults = await mapLimit(created, 48, job => createLink(job.target, job.link))
    createdResults.forEach((result, index) => {
      const job = created[index]
      if (!result.ok) {
        conflicts.push({ name: job.name, reason: String(result.error?.message ?? result.error) })
        return
      }
      managed[job.name] = job.target
      if (job.retarget) retargeted += 1
      else added += 1
    })

    const removals = Object.keys(managed).filter(name => !desired.has(name) && scan.links.has(name))
    const removalResults = await mapLimit(removals, 48, name => removeLink(join(skillsDir, name)))
    removalResults.forEach((result, index) => {
      if (result.ok && result.value === true) removed += 1
      delete managed[removals[index]]
    })
    for (const name of Object.keys(managed)) {
      if (!desired.has(name)) delete managed[name]
    }

    // ppt-master 的项目目录：只有该技能被注入时才把 projects 指向当前项目。
    const pptLink = join(SKILLS_DIR, 'office', 'ppt-master', 'projects')
    const pptTargetPath = pptTarget ?? pptProjectsRootOf(projectRoot)
    let ppt = db.projects[key]?.ppt
    if (desired.has('ppt-master')) {
      await mkdir(pptTargetPath, { recursive: true })
      const st = await pathInfo(pptLink)
      if (st === undefined) {
        await createLink(pptTargetPath, pptLink)
      } else if (st.isSymbolicLink()) {
        let current
        try {
          current = await realpath(pptLink)
        } catch {
          current = undefined
        }
        if (current === undefined || !samePath(current, pptTargetPath)) await createLink(pptTargetPath, pptLink)
      } else {
        conflicts.push({ name: 'ppt-master/projects', reason: '插件目录里已存在真实 projects' })
      }
      ppt = { link: pptLink, target: pptTargetPath }
    } else if (ppt !== undefined) {
      if (existsSync(pptLink)) await removeLink(pptLink)
      ppt = undefined
    }

    db.projects[key] = { projectRoot, skills: managed, ppt }
    // 清掉已经不存在的项目记录
    for (const [entryKey, entry] of Object.entries(db.projects)) {
      if (!existsSync(entry.projectRoot)) delete db.projects[entryKey]
    }
    await writeJson(LINKS_FILE, db)
    return {
      projectRoot,
      skillsDir,
      pptProjects: desired.has('ppt-master') ? pptTargetPath : undefined,
      added,
      removed,
      retargeted,
      kept,
      linked: Object.keys(managed),
      conflicts,
    }
  })
}

/** 只读计算某个项目当前由本插件建立的链接数量。 */
export async function linkSummary(projectRoot) {
  const scan = await scanLinks(projectRoot)
  return { skillsDir: scan.dir, linked: [...scan.links.keys()], conflicts: scan.conflicts }
}
