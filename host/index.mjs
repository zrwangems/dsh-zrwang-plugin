/**
 * dsh-zrwang-plugin 宿主半侧。
 *
 * 职责：
 *   1. 装配运行期参数（profile 补丁 config + DSH 凭据库），注入技能环境；
 *   2. 在 Web/Desktop 里注册 `/dsh-zrwang-plugin/*` 接口，供侧栏与设置页读写；
 *   3. MCP 组件、技能文件护栏、ARS 命令；
 *   4. 卸载时恢复进程环境、注销 MCP 与命令。
 *
 * 技能只在侧栏勾选后，才由 DSH 官方的 ctx.skills 提供方按会话列出；
 * 运行期文件全部在 `<插件目录>/cache/`。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { SKILLS_DIR, VERSION } from './config.mjs'
import { cacheRoot } from './paths.mjs'
import { shellEnvValues, shellEnvVariables } from './env.mjs'
import { createRuntime } from './runtime.mjs'
import { registerRoutes } from './routes.mjs'
import { appendEvent, ensureStateDirSync } from './state.mjs'
import { attachArsCommands, detachArsCommands, syncArsCommands } from './ars-commands.mjs'
import { createSkillGuard } from './skill-guard.mjs'
import { registerSkillProvider } from './skill-provider.mjs'
import { installComponentGuard } from './session-components.mjs'
import { createToolRestrictions } from './tool-restrictions.mjs'
import { ensureSessionSelection } from './session-selection.mjs'
import { loadCatalog } from './catalog.mjs'
import { loadSelection } from './selection.mjs'
import { loadGates } from './gates.mjs'
import { createMcpController } from './mcp.mjs'

export const name = 'dsh-zrwang-plugin'

/** ctx.effect 在测试桩里可能不存在；统一薄封装。 */
function effect(ctx, factory, label) {
  if (typeof ctx.effect === 'function') return ctx.effect(factory, label)
  const dispose = factory()
  return typeof dispose === 'function' ? dispose : () => {}
}

export function apply(ctx, config) {
  ensureStateDirSync()
  const runtime = createRuntime(ctx, config ?? {})
  effect(ctx, () => () => runtime.dispose(), 'dsh-zrwang-plugin: runtime env')

  void runtime.load()
    .then(async params => {
      // 学校配置随包分发；缺失说明仓库不完整，只记录不生成。
      const school = join(SKILLS_DIR, 'research', 'nature-skills', 'nature-downloader', 'config', 'school.json')
      if (!existsSync(school)) await appendEvent('school-config-missing', { file: school })
      await appendEvent('host-applied', {
        version: VERSION,
        cacheDir: cacheRoot(),
        warnings: runtime.warnings(),
        imageModel: params?.image?.model ?? '',
      })
    })
    .catch(async error => {
      await appendEvent('host-apply-failed', { error: String(error?.message ?? error) })
    })

  // 自愈守护：订阅 mcp-manager/status，重连预算用完后自动重建实例；
  // 开关来自设置页（profile 补丁里的 config.mcp.autoRecover）。
  const mcpController = createMcpController(ctx, {
    autoRecover: () => runtime.effective()?.mcp?.autoRecover !== 'off',
    onEvent: (kind, detail) => { void appendEvent(kind, detail) },
  })
  effect(ctx, () => () => mcpController.disposeAll(), 'dsh-zrwang-plugin: mcp registrations')
  const toolRestrictions = createToolRestrictions(ctx)
  effect(ctx, () => () => toolRestrictions.disposeAll(), 'dsh-zrwang-plugin: mcp tool restrictions')

  // 官方扩展点：把本插件的配置作为每次 shell 调用的 DSH_* 事实注入。
  ctx.inject?.(['shellEnv'], scope => {
    const dispose = scope.shellEnv.register({
      name: 'zrwang-plugin-config',
      variables: shellEnvVariables(),
      resolve: () => shellEnvValues(runtime.effective()),
    })
    effect(scope, () => dispose, 'dsh-zrwang-plugin: shell env')
  })

  // 原生技能注入：每个会话在自己的 agent ctx 里注册提供方，选择互不影响。
  ctx.on?.('agent/created', async ({ agent }) => {
    const sessionId = agent.session?.id
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      const catalog = await loadCatalog()
      await ensureSessionSelection(sessionId, await loadSelection(catalog), await loadGates())
    }
    registerSkillProvider(agent.ctx, runtime, sessionId)
    installComponentGuard(agent.ctx, sessionId)
    toolRestrictions.attach(agent)
  })

  ctx.on?.('agent/disposed', ({ agent }) => {
    toolRestrictions.detach(agent?.session?.id)
  })

  // 技能文件护栏：禁止模型用 write/edit 改插件里的 skills/ 与 ars/。
  ctx.inject?.(['tools'], scope => {
    const guard = createSkillGuard(scope)
    effect(scope, () => scope.tools.guard(guard), 'dsh-zrwang-plugin: skill guard')
    void appendEvent('skill-guard-applied', { roots: ['skills', 'ars'] })
  })

  // ARS 的 /ars-* 命令：按侧栏开关动态注册/注销。
  ctx.inject?.(['commands'], scope => {
    attachArsCommands(scope)
    effect(scope, () => () => detachArsCommands(), 'dsh-zrwang-plugin: ars commands')
    void loadGates()
      .then(gates => syncArsCommands(gates.ars === true))
      .catch(() => {})
  })

  // Web/Desktop：侧栏与设置页的 HTTP 接口。
  ctx.inject?.(['webServer'], scope => {
    effect(scope, () => registerRoutes(scope, ctx, runtime, mcpController), 'dsh-zrwang-plugin: http routes')
    ctx.logger?.info?.(`dsh-zrwang-plugin ${VERSION}: HTTP 接口已挂到 /dsh-zrwang-plugin`)
  })
}
