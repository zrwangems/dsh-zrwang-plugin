/**
 * 固定路径与常量。所有路径都从包根推出来，不依赖 DSH_PROFILE_DIR。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { artifactRoot, stateRoot } from './plugin-params.mjs'

/** 包根目录（本文件在 host/ 下）。 */
export const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 技能实体根。DSH 不扫描这里，只有建立联接后才可见。 */
export const SKILLS_DIR = join(PKG_DIR, 'skills')

/** 生成好的目录树。 */
export const CATALOG_FILE = join(PKG_DIR, 'catalog', 'catalog.json')

/** 运行态目录（侧边栏选项组合等 JSON，默认 `~/.dsh/zrwang-plugin-config/state`；可用 ZRWANG_PLUGIN_STATE_DIR 覆盖）。 */
export const STATE_DIR = (() => {
  const override = process.env.ZRWANG_PLUGIN_STATE_DIR
  return typeof override === 'string' && override.length > 0 ? resolve(override) : stateRoot()
})()

/** 运行期产物目录（MCP 暂存 exe、python/bash shim、sitecustomize）：DSH 家目录的 cache 下，不进配置目录。 */
export const ARTIFACT_DIR = artifactRoot()

/** HTTP 路由前缀。 */
export const ROUTE_PREFIX = '/dsh-zrwang-plugin'

/** 会话里三类的固定顺序。 */
export const GROUP_IDS = ['engineering', 'research', 'office']

/** ppt-master 项目目录在项目内的相对位置。 */
export const PPT_PROJECTS_REL = ['.agents', 'ppt-master', 'projects']

/** 技能链接所在的相对位置。 */
export const SKILLS_REL = ['.agents', 'skills']

/**
 * 技能自己的运行期配置直接写在技能目录里（随插件分发，不进 DSH 家目录）。
 * 这些文件由设置页生成、可能含用户参数，`.gitignore` 已排除，避免密钥入库。
 */
const NATURE_ROOT = join(PKG_DIR, 'skills', 'research', 'nature-skills')
export const NATURE_ACADEMIC_CONFIG_FILE = join(NATURE_ROOT, 'nature-academic-search', 'mcp-server', 'config.toml')
export const NATURE_IMAGE2PPT_DIR = join(NATURE_ROOT, 'nature-image2ppt')
export const NATURE_DOWNLOADER_CONFIG_DIR = join(NATURE_ROOT, 'nature-downloader', 'config')
export const NATURE_FIGURE_CONFIG_FILE = join(NATURE_ROOT, 'nature-figure', 'config', 'nature-figure.json')

const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'))

/** 版本号只认 package.json，避免两处漂移。 */
export const VERSION = pkg.version
