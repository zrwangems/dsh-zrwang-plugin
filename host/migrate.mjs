/**
 * 旧版布局的一次性迁移。
 *
 * 旧版把配置和状态放在 `<DSH_HOME>/zrwang-plugin-config/`，违反“`.dsh/` 里只有插件本体”。
 * 这里在新版本第一次启动时做三件事，然后删除旧目录：
 *   1. 把旧 settings.json 里的非密钥写进 profile 补丁的 config；
 *   2. 把密钥写进 DSH 凭据库；
 *   3. 把选择态/模式/界面状态复制到插件自己的 `cache/state/`。
 *
 * 任何一步失败都不删旧目录，并写进日志，避免静默丢数据。
 */
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { legacyConfigRoot, stateRoot } from './paths.mjs'
import { normalizeConfig, persistParams, SECRET_REFS, configOfParams } from './params.mjs'
import { setPath } from './object.mjs'
import { appendEvent } from './state.mjs'

const STATE_FILES = ['selection.json', 'gates.json', 'presets.json', 'ui.json', 'links.json']

function mergeDeep(base, extra) {
  if (extra === null || typeof extra !== 'object' || Array.isArray(extra)) return extra
  const out = base !== null && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {}
  for (const [key, value] of Object.entries(extra)) {
    out[key] = value !== null && typeof value === 'object' && !Array.isArray(value) ? mergeDeep(out[key], value) : value
  }
  return out
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * 迁移旧配置目录。
 * @returns {Promise<{config: object, migrated: boolean, warnings: string[]}>}
 */
export async function migrateLegacyConfig(ctx, rawConfig) {
  const root = legacyConfigRoot()
  const warnings = []
  if (!existsSync(root)) return { config: rawConfig, migrated: false, warnings }

  const settings = readJson(join(root, 'settings.json'))
  const base = JSON.parse(JSON.stringify(rawConfig ?? {}))
  if (settings !== undefined && settings !== null && typeof settings === 'object') {
    const { legacySecrets } = normalizeConfig(settings)
    // 旧值只补空缺，不覆盖用户已经写进 profile 补丁的新值。
    const merged = mergeDeep(normalizeConfig(settings).params, base)
    for (const [key, value] of Object.entries(merged)) base[key] = value
    for (const [path, value] of Object.entries(legacySecrets)) {
      setPath(base, path.split('.'), value)
    }
    if (Object.keys(legacySecrets).length > 0) {
      const credentials = ctx?.get?.('credentials')
      if (credentials !== undefined && typeof credentials.set === 'function') {
        for (const [path, value] of Object.entries(legacySecrets)) {
          try {
            await credentials.set(SECRET_REFS[path], value)
          } catch (error) {
            warnings.push(`迁移密钥 ${path} 失败：${String(error?.message ?? error)}`)
          }
        }
      } else {
        warnings.push('旧版 settings.json 里有密钥，但当前 profile 没有凭据服务')
      }
    }
    const persist = await persistParams(ctx, normalizeConfig(base).params)
    if (!persist.saved) warnings.push(`迁移配置失败：${persist.error ?? '未知原因'}`)
  }

  for (const name of STATE_FILES) {
    const source = join(root, 'state', name)
    if (!existsSync(source)) continue
    try {
      cpSync(source, join(stateRoot(), name))
    } catch (error) {
      warnings.push(`迁移 ${name} 失败：${String(error?.message ?? error)}`)
    }
  }

  // 迁移失败时保留旧目录，避免丢数据；其余情况整个删掉。
  const persistFailed = warnings.some(item => item.includes('迁移配置失败'))
  const secretsBlocked = persistFailed || warnings.some(item => item.includes('密钥'))
  if (!secretsBlocked) {
    try {
      rmSync(root, { recursive: true, force: true })
      await appendEvent('legacy-config-migrated', { root, warnings })
    } catch (error) {
      warnings.push(`删除旧配置目录失败：${String(error?.message ?? error)}`)
    }
  }
  return { config: configOfParams(normalizeConfig(base).params), migrated: true, warnings }
}
