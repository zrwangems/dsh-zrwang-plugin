/**
 * dsh-zrwang-plugin 宿主半侧。
 *
 * 职责：
 *   1. 提供 zrwangPlugin 服务（只读诊断，便于 Inspect 与日志）；
 *   2. 注册 /dsh-zrwang-plugin/* HTTP 接口，供右侧栏页签与插件设置页读写；
 *   3. 不注册技能、不改任何预设或 profile 补丁——技能只有在页签里勾选后，
 *      才由 farm 以目录联接挂到 <项目根>/.agents/skills/。
 *
 * 插件级设置放在 cordis.patch.yml 本行的 config 里（configDir）；技能密钥等统一放
 * <configDir> 下，不写 profile 补丁以外的 DSH 配置。
 */
import { PKG_DIR, VERSION } from './config.mjs'
import { loadCatalog } from './catalog.mjs'
import { registerRoutes } from './routes.mjs'
import { readLinks } from './farm.mjs'
import { currentParams, ensureBuaaSchoolConfig } from './skill-settings.mjs'
import { configDirOfParams } from './plugin-params.mjs'
import { appendEvent } from './state.mjs'

export const name = 'dsh-zrwang-plugin'

export function apply(ctx, config) {
  const pluginConfig = config ?? {}
  const initialConfigDir = configDirOfParams(currentParams(pluginConfig))
  void appendEvent('host-applied', { version: VERSION, configDir: initialConfigDir })
  void ensureBuaaSchoolConfig(currentParams(pluginConfig)).catch(() => {})
  ctx.provide('zrwangPlugin', {
    version: VERSION,
    packageDir: PKG_DIR,
    configDir: initialConfigDir,
    async status() {
      const catalog = await loadCatalog()
      const links = await readLinks()
      return {
        version: VERSION,
        packageDir: PKG_DIR,
        configDir: configDirOfParams(currentParams(pluginConfig)),
        catalog: { version: catalog.version, total: catalog.stats.total, defaults: catalog.stats.defaults },
        projects: Object.keys(links.projects ?? {}),
      }
    },
  })

  ctx.inject(['webServer'], scope => {
    scope.effect(
      () => registerRoutes(scope, ctx, pluginConfig),
      'dsh-zrwang-plugin: http routes',
    )
    ctx.logger?.info?.(`dsh-zrwang-plugin ${VERSION}: HTTP 接口已挂到 /dsh-zrwang-plugin`)
  })
}
