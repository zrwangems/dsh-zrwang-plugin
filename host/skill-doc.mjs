/**
 * 技能主文档：给前端“详情”按钮和“打开 SKILL.md”用。
 *
 * 中文详情来自插件目录里的静态翻译表 catalog/skill-details.zh.json，
 * 运行时不联网、不调用翻译工具；原文始终来自技能自己的 SKILL.md，不改动技能文件。
 * 没有静态译文的技能退回目录树里的中文短说明。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PKG_DIR, SKILLS_DIR } from './config.mjs'
import { indexedSkills } from './catalog.mjs'

const DETAILS_FILE = join(PKG_DIR, 'catalog', 'skill-details.zh.json')
let detailsCache
let detailsMtime = 0

function loadDetails() {
  try {
    const info = statSync(DETAILS_FILE)
    if (detailsCache !== undefined && info.mtimeMs === detailsMtime) return detailsCache
    detailsCache = JSON.parse(readFileSync(DETAILS_FILE, 'utf8'))
    detailsMtime = info.mtimeMs
    return detailsCache
  } catch {
    return {}
  }
}

/** 返回技能的文档信息、绝对路径与静态中文详情。 */
export async function skillDoc(ctx, catalog, name) {
  void ctx
  const node = indexedSkills(catalog).get(name)
  if (node === undefined) throw new Error(`目录树里没有技能：${name}`)
  const file = join(SKILLS_DIR, ...String(node.dir).split('/'), 'SKILL.md')
  if (!existsSync(file)) throw new Error(`技能缺少 SKILL.md：${name}`)
  const details = loadDetails()
  const detailZh = typeof details[name] === 'string' && details[name].trim().length > 0 ? details[name].trim() : node.zh
  return {
    ok: true,
    name,
    title: node.title ?? name,
    path: file,
    zh: node.zh,
    detailZh,
    translated: typeof details[name] === 'string',
  }
}
