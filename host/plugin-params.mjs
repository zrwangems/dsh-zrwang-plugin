/**
 * 插件设置：全部存在 DSH 家目录下的 `zrwang-plugin-config/settings.json`。
 *
 * DSH 家目录解析顺序：`$DSH_HOME`（DSH 官方约定，测试/隔离实例用）→ `~/.dsh`。
 * 这样 dsh web 用临时 DSH_HOME 起测试实例时，插件设置也一起隔离，不会写用户真实配置。
 * 这里负责读写这个 JSON（供应商、URL/模型/API Key、检索与图片转 PPT 参数）；
 * 配置目录不作为可编辑参数，也不写 profile 的 cordis.patch.yml。
 * 技能运行时需要的 .env / config.toml / config.yaml 由这些参数生成。
 * 目录树、默认启用、下载器文件也放同一个配置目录；插件源码里不含任何设置。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** 当前生效的 DSH 家目录（与 @deepseek-ai/dsh-home-paths 的规则一致）。 */
export function dshHome() {
  const override = process.env.DSH_HOME
  if (typeof override === 'string' && override.trim().length > 0) return resolve(override.trim())
  return join(homedir(), '.dsh')
}

const CONFIG_DIR = join(dshHome(), 'zrwang-plugin-config')
const SETTINGS_FILE = join(CONFIG_DIR, 'settings.json')

let cache

export function patchFile() {
  return SETTINGS_FILE
}

/** 读当前参数；文件变化时重新解析。 */
export function readParams(fallback) {
  try {
    const info = statSync(SETTINGS_FILE)
    if (cache !== undefined && cache.mtime === info.mtimeMs) return cache.value
    const value = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'))
    const merged = { ...(fallback ?? {}), ...value }
    cache = { mtime: info.mtimeMs, value: merged }
    return merged
  } catch {
    return fallback ?? {}
  }
}

/** 整体写回 settings.json；父目录不存在时创建。 */
export function writeParams(params) {
  const file = SETTINGS_FILE
  const dir = dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, `${JSON.stringify(params, null, 2)}\n`, 'utf8')
  renameSync(temp, file)
  cache = undefined
  return params
}

/** 配置目录固定为 DSH 家目录下的 zrwang-plugin-config，不作为可编辑参数。 */
export function configDirOfParams() {
  return CONFIG_DIR
}
