/**
 * 插件自己的运行期路径。
 *
 * 原则（用户 2026-11-21 确认）：
 *   - `.dsh/` 里只允许有插件本体，不再出现 `zrwang-plugin-config/` 之类的旁目录；
 *   - 运行期产物跟着插件安装目录走：`<插件目录>/cache/`，卸载插件即随之删除；
 *   - 插件包里的技能、ARS、学校配置运行期只读，不在 `cache/` 之外写任何文件。
 *
 * 布局：
 *   <插件目录>/cache/
 *     state/       选择态、门禁、模式、界面展开、事件、链接台账
 *     artifacts/   Python 启动钩子、shim
 *     backups/     覆盖写之前的备份
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

/** 插件安装目录（本文件在 host/ 下）。 */
export const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 插件 id，同时是日志与凭据作用域名。 */
export const PLUGIN_ID = 'dsh-zrwang-plugin'

let cacheOverride = ''

/** 只给测试用：把运行期目录换到临时目录，避免污染仓库。 */
export function setCacheRootForTests(dir) {
  cacheOverride = typeof dir === 'string' && dir.length > 0 ? resolve(dir) : ''
}

/** 运行期根目录：默认在插件安装目录下，卸载插件时一起消失。 */
export function cacheRoot() {
  return cacheOverride.length > 0 ? cacheOverride : join(PKG_DIR, 'cache')
}

export function stateRoot() {
  return join(cacheRoot(), 'state')
}

/** 运行期产物目录（Python 钩子、shim）。 */
export function artifactRoot() {
  return join(cacheRoot(), 'artifacts')
}


export function pythonRoot() {
  return join(artifactRoot(), 'python')
}

export function shimRoot() {
  return join(artifactRoot(), 'bin')
}

export function backupRoot() {
  return join(cacheRoot(), 'backups')
}

/** 旧版本目录：只在启动时迁移一次并删除，运行期不再读写。 */
export function legacyConfigRoot() {
  const home = process.env.DSH_HOME
  const base = typeof home === 'string' && home.trim().length > 0 ? resolve(home.trim()) : join(homedirPath(), '.dsh')
  return join(base, 'zrwang-plugin-config')
}

function homedirPath() {
  return process.env.HOME ?? process.env.USERPROFILE ?? homedir()
}

export function ensureDirSync(dir, mode = 0o700) {
  mkdirSync(dir, { recursive: true, mode })
  return dir
}

/** 装配早期需要的目录（写状态、生成 shim 之前）。 */
export function ensureCacheSync() {
  for (const dir of [cacheRoot(), stateRoot(), artifactRoot(), pythonRoot(), shimRoot(), backupRoot()]) {
    ensureDirSync(dir)
  }
  return cacheRoot()
}
