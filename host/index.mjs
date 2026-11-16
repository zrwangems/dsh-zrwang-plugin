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
import { mkdirSync, watch } from 'node:fs'
import { join } from 'node:path'
import { PKG_DIR, VERSION } from './config.mjs'
import { loadCatalog } from './catalog.mjs'
import { registerRoutes } from './routes.mjs'
import { readLinks } from './farm.mjs'
import { applySkillEnv, currentParams, ensureBuaaSchoolConfig, mirrorSkillFiles } from './skill-settings.mjs'
import { configDirOfParams, ensureSettingsHardened } from './plugin-params.mjs'
import { attachArsCommands, detachArsCommands, syncArsCommands } from './ars-commands.mjs'
import { createSkillGuard } from './skill-guard.mjs'
import { loadGates } from './gates.mjs'
import { createMcpController } from './mcp.mjs'
import { appendEvent, ensureStateDirSync } from './state.mjs'

export const name = 'dsh-zrwang-plugin'

export function apply(ctx, config) {
  const pluginConfig = config ?? {}
  // 运行态目录在插件配置目录下；首次启动从旧版包内 state/ 复制一次（旧目录保留）。
  ensureStateDirSync()
  // settings.json 存有 API Key：启动时把文件权限收紧到当前账户（失败不影响启动）。
  ensureSettingsHardened()
  const initialConfigDir = configDirOfParams(currentParams(pluginConfig))
  // MCP 组件控制器：MathWorks / Windows MCP 服务器随侧栏组件注册与注销。
  const mcpController = createMcpController(ctx)
  ctx.effect(() => () => mcpController.disposeAll(), 'dsh-zrwang-plugin: mcp registrations')
  void appendEvent('host-applied', { version: VERSION, configDir: initialConfigDir })
  // 技能需要的环境变量（内置 Python、生图、专利目录、LIT_DL_CONFIG_DIR 等）写进宿主环境，模型跑的 shell 子进程会继承。
  applySkillEnv(currentParams(pluginConfig))
  // 生成集中配置（nature 学术检索 / image2ppt / 学校信息 / ARS 运行时说明）到插件配置目录。
  void mirrorSkillFiles(currentParams(pluginConfig)).catch(() => {})
  // 设置热加载：Web 与 Desktop 是两个独立 DSH 进程，各自的 process.env 不会互相推送。
  // 每个运行中的插件实例都监听共享的 settings.json，其他实例保存后本进程也重新注入环境变量、
  // 同步技能配置文件；已经启动的长驻子进程仍保留旧环境，新的工具调用会继承新值。
  const settingsDir = initialConfigDir
  let settingsTimer
  const reloadSettings = () => {
    const fresh = currentParams(pluginConfig)
    applySkillEnv(fresh)
    void mirrorSkillFiles(fresh).catch(() => {})
    void appendEvent('settings-reloaded', { configDir: configDirOfParams(fresh) })
  }
  try {
    mkdirSync(settingsDir, { recursive: true })
    const settingsWatcher = watch(settingsDir, { persistent: false }, (event, filename) => {
      if (filename !== 'settings.json') return
      if (settingsTimer !== undefined) clearTimeout(settingsTimer)
      settingsTimer = setTimeout(() => {
        settingsTimer = undefined
        reloadSettings()
      }, 300)
    })
    settingsWatcher.on('error', () => {})
    ctx.effect(() => () => {
      if (settingsTimer !== undefined) clearTimeout(settingsTimer)
      settingsWatcher.close()
    }, 'dsh-zrwang-plugin: settings hot reload')
  } catch {
    // 文件监视不可用时退回启动/保存时注入，不影响主流程
  }
  // 学校访问配置随包固定分发，这里只保证包内文件存在，不再往 ~/.dsh 复制。
  void ensureBuaaSchoolConfig().catch(() => {})
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
      () => registerRoutes(scope, ctx, pluginConfig, mcpController),
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
