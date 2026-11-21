/**
 * 插件运行期状态：当前参数、凭据存在性、环境注入。
 *
 * profile 补丁里的 config 是唯一来源；保存时先写 config/凭据，再用**新参数**重算，
 * 不依赖 DSH 重新加载插件，也不把旧闭包留在路由里。
 */
import { appendEvent } from './state.mjs'
import { migrateLegacyConfig } from './migrate.mjs'
import { configOfParams, migrateLegacySecrets, normalizeConfig, persistParams, readSecrets, withSecrets } from './params.mjs'
import { applySkillEnv, restoreSkillEnv } from './env.mjs'

/**
 * @param {object} ctx
 * @param {object} config - profile 补丁里的 config
 */
export function createRuntime(ctx, config) {
  let currentConfig = config
  let params = {}
  let secrets = {}
  let present = {}
  let warnings = []
  let ready = false

  async function load() {
    const legacy = await migrateLegacyConfig(ctx, currentConfig)
    currentConfig = legacy.config
    const migration = await migrateLegacySecrets(ctx, currentConfig)
    warnings = [...legacy.warnings, ...migration.warnings]
    params = migration.params
    await refreshSecrets()
    ready = true
    return params
  }

  async function refreshSecrets() {
    const result = await readSecrets(ctx)
    secrets = result.values
    present = result.present
    applySkillEnv(effective())
    return effective()
  }

  /** 合并密钥后的参数：只用于环境注入和检查，不写盘。 */
  function effective() {
    return withSecrets(params, secrets)
  }

  /** 保存设置：密钥进凭据库，其余进 profile 补丁；随后立即用新值重算。 */
  async function save(nextParams) {
    const result = await persistParams(ctx, nextParams)
    if (result.saved) {
      params = configOfParams(normalizeConfig(nextParams).params)
      await refreshSecrets()
    }
    await appendEvent('settings-saved', {
      saved: result.saved,
      secretsUpdated: result.secretsUpdated,
      warnings: result.warnings,
      error: result.error ?? null,
    })
    return { result, params: effective(), present }
  }

  /** DSH 因为配置变更重新加载插件时，调用方用新 config 重建 runtime。 */
  function reconfigure(nextConfig) {
    currentConfig = nextConfig
    const normalized = normalizeConfig(nextConfig)
    params = normalized.params
    warnings = [...warnings, ...normalized.warnings]
    applySkillEnv(effective())
  }

  function dispose() {
    restoreSkillEnv()
  }

  return {
    load,
    save,
    reconfigure,
    dispose,
    effective,
    /** 未合并密钥的非密钥参数（写回 config 用）。 */
    configParams: () => params,
    presence: () => present,
    warnings: () => warnings,
    isReady: () => ready,
  }
}
