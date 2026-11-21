/**
 * MCP 组件的会话隔离。
 *
 * DSH 的 mcpManager 把服务器注册在宿主级，工具一旦连上，所有会话都能看到。
 * 这里在 agent 作用域挂一个 tools/pre-execute 守卫：本会话没启用的组件，
 * 对应工具直接拒绝，别的会话仍可使用，互不影响。
 */
import { loadCatalog } from './catalog.mjs'
import { loadGates } from './gates.mjs'
import { wantOf, SERVER_NAMES } from './mcp.mjs'
import { desiredSkills, loadSelection } from './selection.mjs'
import { readSessionSelection } from './session-selection.mjs'

const TOOL_PREFIX = {
  [SERVER_NAMES.mathworks]: `mcp__${SERVER_NAMES.mathworks}__`,
  [SERVER_NAMES.windows]: `mcp__${SERVER_NAMES.windows}__`,
}

async function componentWant(sessionId) {
  const catalog = await loadCatalog()
  const snapshot = await readSessionSelection(sessionId)
  const selection = snapshot === undefined ? await loadSelection(catalog) : { ...(await loadSelection(catalog)), skills: snapshot.skills }
  const gates = snapshot === undefined ? await loadGates() : snapshot.gates
  const desired = desiredSkills(catalog, selection, gates)
  const engineeringInjected = [...desired.keys()].filter(name => String(catalog.skills?.[name]?.dir ?? '').startsWith('engineering/')).length
  return wantOf({ engineeringInjected, gates })
}

/**
 * @param {object} agentCtx - agent 自己的 ctx
 * @param {string} sessionId
 */
export function installComponentGuard(agentCtx, sessionId) {
  if (typeof agentCtx?.on !== 'function') return
  agentCtx.on('tools/pre-execute', async (exec, next) => {
    const name = typeof exec?.name === 'string' ? exec.name : ''
    for (const [server, prefix] of Object.entries(TOOL_PREFIX)) {
      if (!name.startsWith(prefix)) continue
      const want = await componentWant(sessionId)
      const enabled = server === SERVER_NAMES.mathworks ? want.mathworks : want.windows
      if (enabled === true) return next()
      return {
        kind: 'deny',
        reason: `${server} 在本会话没有启用。到右侧栏「组件」里打开后，这个工具才可用。`,
      }
    }
    return next()
  })
}
