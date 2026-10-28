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
import { applySkillEnv, currentParams, ensureBuaaSchoolConfig } from './skill-settings.mjs'
import { configDirOfParams } from './plugin-params.mjs'
import { attachArsCommands, detachArsCommands, syncArsCommands } from './ars-commands.mjs'
import { createSkillGuard } from './skill-guard.mjs'
import { loadGates } from './gates.mjs'
import { appendEvent } from './state.mjs'

export const name = 'dsh-zrwang-plugin'

export function apply(ctx, config) {
  const pluginConfig = config ?? {}
  const initialConfigDir = configDirOfParams(currentParams(pluginConfig))
  void appendEvent('host-applied', { version: VERSION, configDir: initialConfigDir })
  // 新增技能（沁言/OpenRouter/Zotero 等）需要的密钥写进宿主环境，模型跑的 shell 子进程会继承。
  applySkillEnv(currentParams(pluginConfig))
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

  // 技能文件护栏：禁止模型用 write/edit 改插件里的 skills/ 与 ars/。
  ctx.inject(['tools'], scope => {
    const guard = createSkillGuard(ctx)
    scope.effect(() => scope.tools.guard(guard), 'dsh-zrwang-plugin: skill guard')
    void appendEvent('skill-guard-applied', { roots: ['skills', 'ars'] })
  })

  // ARS 的 /ars-* 命令：按侧栏开关动态注册/注销，关掉 ARS 时命令从斜杠菜单消失。
  ctx.inject(['commands'], scope => {
    attachArsCommands(scope)
    scope.effect(() => () => detachArsCommands(), 'dsh-zrwang-plugin: ars commands')
    void loadGates()
      .then(gates => syncArsCommands(gates.ars === true))
      .catch(() => {})
  })
}
