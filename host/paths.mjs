/**
 * 插件的持久化路径。
 *
 * 运行期数据放在 DSH 自己的持久化根下，插件包内不再产生 `cache/`：
 *
 *   <DSH_HOME>/storages/dsh-zrwang-plugin/
 *   ├── state/    选择态、会话快照、门禁、模式、界面、事件
 *   └── patent/   默认专利数据根（可在设置页改成别的绝对路径）
 *       ├── vault/        Obsidian 库（打开这个目录作为 vault）
 *       ├── patent-map/   专利地图的索引 SQLite 与向量模型
 *       ├── oa/           审查答复向量库与工作数据
 *       └── outputs/      解读/检索/案卷的产物
 *
 * `$DSH_HOME/storages` 是 DSH 自带 storage-json 后端的 root（见 dsh-base 的
 * `storage-json` 行），所以插件升级不会把这里删掉；`.dsh` 下也不再新增
 * `zrwang-plugin-config/` 这类旁目录。安装目录只保留插件本体。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

/** 插件安装目录（本文件在 host/ 下）。 */
export const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 插件 id，同时是 storages 下的目录名、日志与凭据作用域名。 */
export const PLUGIN_ID = 'dsh-zrwang-plugin'

let storageOverride = ''

/** 只给测试用：把持久化根换到临时目录，避免污染真实的 .dsh。 */
export function setStorageRootForTests(dir) {
  storageOverride = typeof dir === 'string' && dir.length > 0 ? resolve(dir) : ''
}

function homedirPath() {
  return process.env.HOME ?? process.env.USERPROFILE ?? homedir()
}

/** DSH 家目录：DSH_HOME 优先，否则 ~/.dsh。 */
export function dshHome() {
  const value = process.env.DSH_HOME
  return typeof value === 'string' && value.trim().length > 0 ? resolve(value.trim()) : join(homedirPath(), '.dsh')
}

/** 插件持久化根：DSH storages 下自己那一份。 */
export function storageRoot() {
  return storageOverride.length > 0 ? storageOverride : join(dshHome(), 'storages', PLUGIN_ID)
}

export function stateRoot() {
  return join(storageRoot(), 'state')
}

/** 专利数据默认根：设置页没填时的位置。 */
export function defaultPatentRoot() {
  return join(storageRoot(), 'patent')
}

/**
 * 专利数据根的派生路径。设置页填的是“专利数据目录”，Obsidian 库是它下面的
 * `vault/`，向量索引和模型在 `patent-map/`，审查答复在 `oa/`，产物在 `outputs/`。
 * @param {object} params - 插件参数（patent.root）
 * @returns {{root: string, vault: string, map: string, oa: string, outputs: object}|undefined}
 */
export function patentPathsOf(params) {
  const configured = typeof params?.patent?.root === 'string' ? params.patent.root.trim() : ''
  if (configured.length === 0) return undefined
  const root = resolve(configured)
  const outputs = join(root, 'outputs')
  return {
    root,
    vault: join(root, 'vault'),
    map: join(root, 'patent-map'),
    oa: join(root, 'oa'),
    outputs,
    readerOutput: join(outputs, 'patent-reader'),
    searchOutput: join(outputs, 'patent-search'),
    docketOutput: join(outputs, 'patent-docket'),
  }
}

/** 旧位置：插件包内 cache/（升级时一次性迁移，之后不再创建）。 */
export function legacyCacheRoot() {
  return join(PKG_DIR, 'cache')
}

/** 旧版本配置目录：只在启动时迁移一次并删除，运行期不再读写。 */
export function legacyConfigRoot() {
  return join(dshHome(), 'zrwang-plugin-config')
}

export function ensureDirSync(dir, mode = 0o700) {
  mkdirSync(dir, { recursive: true, mode })
  return dir
}

/**
 * 把旧版插件包里的 cache/ 搬到 storages 下，然后删掉旧目录。
 * 目标已有同名文件时不覆盖，失败就保持原样，避免丢数据。
 * @returns {boolean} 是否发生了迁移
 */
export function migrateLegacyCacheSync() {
  const legacy = resolve(legacyCacheRoot())
  const target = resolve(storageRoot())
  if (legacy === target || !existsSync(legacy)) return false
  try {
    mkdirSync(target, { recursive: true, mode: 0o700 })
    cpSync(legacy, target, { recursive: true, force: false, errorOnExist: false })
    rmSync(legacy, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

/** 装配早期需要的目录。 */
export function ensureStorageSync() {
  migrateLegacyCacheSync()
  for (const dir of [storageRoot(), stateRoot()]) {
    ensureDirSync(dir)
  }
  return storageRoot()
}
