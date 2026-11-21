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
import { appendEvent } from './state.mjs'

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
  /** sessionId → Map<agent 对象, { agent, dispose, signature }>：同一会话可能有多个 agent。 */
  const sessions = new Map()
  const trace = (kind, sessionId, detail) => { void appendEvent('mcp-tools-mask', { kind, sessionId, ...detail }) }

  const disposeRecord = (record, sessionId) => {
    if (record.dispose === undefined) return
    try {
      record.dispose()
    } catch (error) {
      trace('dispose-error', sessionId, { error: String(error?.message ?? error) })
    }
    record.dispose = undefined
  }

  const syncRecord = (record, sessionId, deny, want) => {
    const signature = deny.join('\n')
    if (record.signature === signature) return
    const previous = record.signature ?? ''
    record.signature = signature
    const detail = { want: want === undefined ? '-' : JSON.stringify(want), count: deny.length }
    if (record.dispose !== undefined) {
      disposeRecord(record, sessionId)
    }
    if (deny.length === 0) {
      trace('clear', sessionId, { ...detail, previous: previous.split('\n').filter(Boolean).length })
      return
    }
    try {
      const tools = toolsOf(record.agent.ctx)
      if (typeof tools?.restrict !== 'function') {
        trace('unavailable', sessionId, detail)
        return
      }
      record.dispose = tools.restrict({ deny })
      trace('apply', sessionId, detail)
    } catch (error) {
      // 工具表刚好在重连中换名：下一次 tools/change 会重来。
      record.signature = undefined
      trace('apply-error', sessionId, { ...detail, error: String(error?.message ?? error) })
    }
  }

  const syncNow = async sessionId => {
    const records = sessions.get(sessionId)
    if (records === undefined || records.size === 0) return
    const want = await componentWant(sessionId)
    const names = mcpNames(ctx)
    const deny = names.filter(name => {
      for (const [server, prefix] of Object.entries(PREFIX)) {
        if (!name.startsWith(prefix)) continue
        return server === SERVER_NAMES.mathworks ? want.mathworks !== true : want.windows !== true
      }
      return false
    }).sort()
    // 工具表在重连/重注册的瞬间可能是空的；这时不能把 deny 当成“全开”而去清掉
    // 已有掩码，否则会把刚关掉的组件又放出来。等下一次 tools/change 再算。
    const anyDisabled = want.mathworks !== true || want.windows !== true
    if (names.length === 0 && anyDisabled) return
    for (const record of records.values()) syncRecord(record, sessionId, deny, want)
  }

  // 同一会话的 sync 排队执行：attach 与路由刷新可能同时触发，并发时两边都会读到
  // 旧 signature 并各调一次 restrict，后一次会覆盖前一次的 disposer，掩码就再也
  // 解不掉了。
  const queues = new Map()
  const sync = sessionId => {
    const previous = queues.get(sessionId) ?? Promise.resolve()
    const next = previous.then(() => syncNow(sessionId), () => syncNow(sessionId))
    queues.set(sessionId, next.catch(() => {}))
    return next
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
      let records = sessions.get(sessionId)
      if (records === undefined) {
        records = new Map()
        sessions.set(sessionId, records)
      }
      if (records.has(agent)) return
      records.set(agent, { agent, dispose: undefined, signature: undefined })
      void sync(sessionId)
    },
    detach(sessionId) {
      const records = sessions.get(sessionId)
      if (records === undefined) return
      for (const record of records.values()) disposeRecord(record, sessionId)
      sessions.delete(sessionId)
      queues.delete(sessionId)
    },
    refresh,
    disposeAll() {
      for (const [sessionId, records] of sessions) {
        for (const record of records.values()) disposeRecord(record, sessionId)
        sessions.delete(sessionId)
      }
      queues.clear()
    },
  }
}

/** 侧栏选择变化后由 routes 调用；没有初始化时是空操作。 */
export function refreshToolRestrictions(sessionId) {
  return store?.refresh(sessionId)
}
