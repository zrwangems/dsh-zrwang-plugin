/**
 * 固定路径与常量。所有路径都从包根推出来，不依赖 DSH_PROFILE_DIR。
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 包根目录（本文件在 host/ 下）。 */
export const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 技能实体根。DSH 不扫描这里，只有建立联接后才可见。 */
export const SKILLS_DIR = join(PKG_DIR, 'skills')

/** 生成好的目录树。 */
export const CATALOG_FILE = join(PKG_DIR, 'catalog', 'catalog.json')

/** 运行态目录（gitignore）。测试可用 ZRWANG_PLUGIN_STATE_DIR 改到临时目录。 */
export const STATE_DIR = (() => {
  const override = process.env.ZRWANG_PLUGIN_STATE_DIR
  return typeof override === 'string' && override.length > 0 ? resolve(override) : join(PKG_DIR, 'state')
})()

/** HTTP 路由前缀。 */
export const ROUTE_PREFIX = '/dsh-zrwang-plugin'

/** 会话里三类的固定顺序。 */
export const GROUP_IDS = ['engineering', 'research', 'office']

/** ppt-master 项目目录在项目内的相对位置。 */
export const PPT_PROJECTS_REL = ['.agents', 'ppt-master', 'projects']

/** 技能链接所在的相对位置。 */
export const SKILLS_REL = ['.agents', 'skills']

export const VERSION = '0.0.3'
