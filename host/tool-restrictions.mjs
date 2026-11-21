/**
 * MCP 工具的会话可见性。
 *
 * MCP 服务器由 mcpManager 注册在宿主级，工具表也是全局的。DSH 的
 * `ctx.tools.restrict({ deny })` 可以在 agent 作用域把指定全局工具从
 * 该会话的提示词、工具列表和执行里一起拿掉。这里按会话选择计算要 deny
 * 的 mcp__* 工具，工具表或选择变化时重算。
 */
import { SERVER_NAMES } from './mcp.mjs'
import { componentWant } from './session-components.mjs'

const PREFIX = {
  [SERVER_NAMES.mathworks]: `mcp__${SERVER_NAMES.mathworks}__`,
  [SERVER_NAMES.windows]: `mcp__${SERVER_NAMES.windows}__`,
}

let store

const toolsOf = ctx => {
  try {
    return ctx.get?.('tools')
  } catch {
    return undefined
  }
}

const mcpNames = ctx => {
  const tools = toolsOf(ctx)
  if (typeof tools?.definitions !== 'function') return []
  try {
    return tools.definitions()
      .map(definition => definition?.name)
      .filter(name => typeof name === 'string' && (name.startsWith(PREFIX[SERVER_NAMES.mathworks]) || name.startsWith(PREFIX[SERVER_NAMES.windows])))
  } catch {
    return []
  }
}

export function createToolRestrictions(ctx) {
  const sessions = new Map()

  const sync = async sessionId => {
    const record = sessions.get(sessionId)
    if (record === undefined) return
    const want = await componentWant(sessionId)
    const deny = mcpNames(ctx).filter(name => {
      for (const [server, prefix] of Object.entries(PREFIX)) {
        if (!name.startsWith(prefix)) continue
        return server === SERVER_NAMES.mathworks ? want.mathworks !== true : want.windows !== true
      }
      return false
    }).sort()
    const signature = deny.join('\n')
    if (record.signature === signature) return
    record.signature = signature
    try { record.dispose?.() } catch { /* 旧限制已失效 */ }
    record.dispose = undefined
    if (deny.length === 0) return
    try {
      const tools = toolsOf(record.agent.ctx)
      if (typeof tools?.restrict !== 'function') return
      record.dispose = tools.restrict({ deny })
    } catch {
      // 工具表刚好在重连中换名：下一次 tools/change 会重来。
    }
  }

  const refresh = sessionId => {
    if (sessionId === undefined) return Promise.all([...sessions.keys()].map(sync))
    return sync(sessionId)
  }

  store = { refresh, syncAll: () => refresh() }

  ctx.on?.('tools/change', () => { void refresh() })

  return {
    attach(agent) {
      const sessionId = agent?.session?.id
      if (typeof sessionId !== 'string' || sessionId.length === 0) return
      sessions.set(sessionId, { agent, dispose: undefined, signature: undefined })
      void sync(sessionId)
    },
    detach(sessionId) {
      const record = sessions.get(sessionId)
      if (record === undefined) return
      try { record.dispose?.() } catch { /* agent 卸载时已释放 */ }
      sessions.delete(sessionId)
    },
    refresh,
    disposeAll() {
      for (const [sessionId, record] of sessions) {
        try { record.dispose?.() } catch { /* ignore */ }
        sessions.delete(sessionId)
      }
    },
  }
}

/** 侧栏选择变化后由 routes 调用；没有初始化时是空操作。 */
export function refreshToolRestrictions(sessionId) {
  return store?.refresh(sessionId)
}
