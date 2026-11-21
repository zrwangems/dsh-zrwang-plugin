/**
 * dsh-zrwang-plugin 宿主半侧。
 *
 * 职责：
 *   1. 提供 zrwangPlugin 服务（只读诊断，便于 Inspect 与日志）；
 *   2. 注册 /dsh-zrwang-plugin/* HTTP 接口，供右侧栏页签与插件设置页读写；
 *   3. 不注册技能、不改任何预设——技能只有在页签里勾选后，
 *      才由 farm 以目录联接挂到 <项目根>/.agents/skills/。
 *
 * 配置与密钥都交给 DSH 自己管：
 *   - 非密钥设置 → profile 的 `cordis.patch.yml` 本插件那一行（`configEditor`）；
 *   - 密钥 → DSH 凭据库 `$DSH_HOME/.credentials.yaml`（`ctx.credentials`）；
 *   - 只有侧边栏选项组合（选择态/模式/门禁/链接台账）落在 `~/.dsh/zrwang-plugin-config/state/`。
 */
import { PKG_DIR, VERSION } from './config.mjs'
import { loadCatalog } from './catalog.mjs'
import { registerRoutes } from './routes.mjs'
import { readLinks } from './farm.mjs'
import { applySkillEnv, currentParams, ensureBuaaSchoolConfig, mirrorSkillFiles } from './skill-settings.mjs'
import { cacheRoot, readSecrets, stateRoot, takeLegacySettings, persistParams } from './plugin-params.mjs'
import { attachArsCommands, detachArsCommands, syncArsCommands } from './ars-commands.mjs'
import { createSkillGuard } from './skill-guard.mjs'
import { loadGates } from './gates.mjs'
import { createMcpController } from './mcp.mjs'
import { appendEvent, ensureStateDirSync } from './state.mjs'

export const name = 'dsh-zrwang-plugin'

export function apply(ctx, config) {
  const pluginConfig = config ?? {}
  // 运行态目录只放侧边栏选项组合；首次启动从旧版包内 state/ 复制一次（旧目录保留）。
  ensureStateDirSync()
  /** 生效参数 = profile 补丁里的 config + DSH 凭据库里的密钥。 */
  let params = currentParams(pluginConfig)
  /** 密钥是异步读的：先按无密钥启动，读完再补一次环境变量。 */
  const refresh = async () => {
    await readSecrets(ctx)
    params = currentParams(pluginConfig)
    applySkillEnv(params)
    await mirrorSkillFiles(params).catch(() => {})
    return params
  }
  void appendEvent('host-applied', { version: VERSION, stateDir: stateRoot(), artifactDir: cacheRoot() })
  applySkillEnv(params)
  void mirrorSkillFiles(params).catch(() => {})
  void (async () => {
    // 旧版参数写在 zrwang-plugin-config/settings.json，迁移到 profile 补丁 + 凭据库一次。
    const legacy = takeLegacySettings()
    if (legacy !== undefined) {
      const merged = currentParams({ ...pluginConfig, ...legacy })
      await persistParams(ctx, merged).catch(() => {})
      await appendEvent('legacy-settings-migrated', { keys: Object.keys(legacy).length })
    }
    await refresh()
  })()
  // 学校访问配置随包固定分发，这里只保证包内文件存在，不再往 ~/.dsh 复制。
  void ensureBuaaSchoolConfig().catch(() => {})
  ctx.provide('zrwangPlugin', {
    version: VERSION,
    packageDir: PKG_DIR,
    stateDir: stateRoot(),
    artifactDir: cacheRoot(),
    async status() {
      const catalog = await loadCatalog()
      const links = await readLinks()
      return {
        version: VERSION,
        packageDir: PKG_DIR,
        stateDir: stateRoot(),
        artifactDir: cacheRoot(),
        catalog: { version: catalog.version, total: catalog.stats.total, defaults: catalog.stats.defaults },
        projects: Object.keys(links.projects ?? {}),
      }
    },
  })

  ctx.inject(['webServer'], scope => {
    scope.effect(
      () => registerRoutes(scope, ctx, pluginConfig, mcpController, refresh),
      'dsh-zrwang-plugin: http routes',
    )
    ctx.logger?.info?.(`dsh-zrwang-plugin ${VERSION}: HTTP 接口已挂到 /dsh-zrwang-plugin`)
  })

  // MCP 组件控制器：MathWorks / Windows MCP 服务器随侧栏组件注册与注销。
  const mcpController = createMcpController(ctx)
  ctx.effect(() => () => mcpController.disposeAll(), 'dsh-zrwang-plugin: mcp registrations')

  // 技能文件护栏：禁止模型用 write/edit 改插件里的 skills/ 与 ars/。
  ctx.inject(['tools'], scope => {
    const guard = createSkillGuard(ctx)
    scope.effect(() => scope.tools.guard(guard), 'dsh-zrwang-plugin: skill guard')
    void appendEvent('skill-guard-applied', { roots: ['skills', 'ars'] })
  })

  // ARS 的 /ars-* 命令：按侧栏开关动态注册/注销，关掉 ARS 时命令从斜杠菜单消失。
  // 多角色命令在执行时用 scope.get('agentTeams') 判断团队协作是否开启（懒取，服务缺失也不阻塞本段）。
  ctx.inject(['commands'], scope => {
    attachArsCommands(scope)
    scope.effect(() => () => detachArsCommands(), 'dsh-zrwang-plugin: ars commands')
    void loadGates()
      .then(gates => syncArsCommands(gates.ars === true))
      .catch(() => {})
  })
}
