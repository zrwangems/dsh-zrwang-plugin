/**
 * 固定路径与常量。所有路径都从包根推出来，运行期目录统一走 paths.mjs。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PKG_DIR } from './paths.mjs'

export { PKG_DIR, storageRoot, stateRoot, defaultPatentRoot } from './paths.mjs'

/** 技能实体根：由插件自己的 ctx.skills 提供方按需读取。 */
export const SKILLS_DIR = join(PKG_DIR, 'skills')

/** ARS 功能区块根（不在 skills/ 里）。 */
export const ARS_DIR = join(PKG_DIR, 'ars')

/** 生成好的目录树。 */
export const CATALOG_FILE = join(PKG_DIR, 'catalog', 'catalog.json')

/** MathWorks 组件目录：MATLAB MCP exe + Simulink Agentic Toolkit。 */
export const MATHWORKS_DIR = join(PKG_DIR, 'mathworks')

/** HTTP 路由前缀。 */
export const ROUTE_PREFIX = '/dsh-zrwang-plugin'

/** 会话里三类的固定顺序。 */
export const GROUP_IDS = ['engineering', 'research', 'office']

const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'))

/** 版本号只认 package.json，避免两处漂移。 */
export const VERSION = pkg.version
