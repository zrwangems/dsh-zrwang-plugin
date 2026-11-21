/**
 * 把当前会话映射到 DSH 的「工作区」条目。
 *
 * DSH Web/Desktop 侧栏里的工作区是 workspaceRegistry 里的持久记录：
 *   { id, path, title, sessionIds }
 * 选择态 v3 以工作区为单位保存，所以必须先拿到它。
 *
 * 解析顺序（越靠前越准）：
 *   1. workspaceRegistry.list() 中 sessionIds 含当前会话的记录；
 *   2. workspaceRegistry.resolveByPath(cwd)（新建会话尚未 attach 时兜底）；
 *   3. 回退成一个“按项目根”的伪工作区（headless 等没有工作区服务的组合）。
 */
import { basename as posixBasename } from 'node:path'

/** 预设名上限（与历史 rename 限制一致）。 */
export const PRESET_NAME_LIMIT = 20

/** 把项目根规范成稳定的键。Windows 不区分分隔符和大小写，POSIX 路径必须保留 `/`。 */
export function projectKeyOf(projectRoot) {
  const raw = String(projectRoot ?? '')
  const normalized = process.platform === 'win32'
    ? raw.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
    : raw.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized || (raw.length > 0 && process.platform !== 'win32' ? '/' : '(未知项目)')
}

function pathBasename(path) {
  const text = String(path ?? '')
  const parts = text.split(/[\\/]+/).filter(part => part.length > 0)
  return parts.length > 0 ? parts[parts.length - 1] : posixBasename(text)
}

/** 工作区标题 → 合法的模式名（去控制字符、折叠空白、截断到上限）。 */
export function presetNameFromTitle(title) {
  const cleaned = String(title ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = [...cleaned]
  const text = chars.length > PRESET_NAME_LIMIT ? chars.slice(0, PRESET_NAME_LIMIT).join('') : cleaned
  return text.length > 0 ? text : '工作区'
}

/** 在已占用名字集合里取一个不冲突的名字：标题过长/重名时追加「 (2)」。 */
export function uniquePresetName(base, taken) {
  const name = presetNameFromTitle(base)
  if (!taken.has(name)) return name
  const chars = [...name]
  for (let index = 2; index < 100; index += 1) {
    const suffix = ` (${index})`
    const room = Math.max(1, PRESET_NAME_LIMIT - suffix.length)
    const candidate = `${chars.slice(0, room).join('')}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return `${chars.slice(0, PRESET_NAME_LIMIT - 5).join('')} (!)`
}

function fromEntity(entity) {
  const path = String(entity?.path ?? '')
  const title = String(entity?.title ?? '').trim() || pathBasename(path) || '工作区'
  return {
    key: `w:${String(entity?.id ?? path)}`,
    id: entity?.id === undefined ? undefined : String(entity.id),
    title,
    path,
    source: 'workspace',
  }
}

function fromProject(projectRoot) {
  const path = String(projectRoot ?? '')
  return {
    key: `p:${projectKeyOf(path)}`,
    id: undefined,
    title: pathBasename(path) || '工作区',
    path,
    source: 'project',
  }
}

/**
 * 解析会话所属工作区；永不抛错（工作区服务异常时回退到项目根）。
 * @param {object} ctx 宿主上下文
 * @param {string} sessionId 会话 id
 * @param {string|undefined} cwd 已解析出的会话工作目录
 * @param {string} projectRoot 项目根
 */
export async function resolveWorkspaceByPath(ctx, cwd, projectRoot) {
  const registry = (() => {
    try {
      return ctx?.get?.('workspaceRegistry')
    } catch {
      return undefined
    }
  })()
  if (registry === undefined) return fromProject(projectRoot)
  try {
    if (typeof registry.resolveByPath === 'function' && typeof cwd === 'string' && cwd.length > 0) {
      const entity = await registry.resolveByPath(cwd)
      if (entity !== undefined && entity !== null) return fromEntity(entity)
    }
  } catch {
    // 工作区服务不可用时按项目根回退，选择态仍然能用
  }
  return fromProject(projectRoot)
}

/** 解析会话所属工作区；永不抛错（工作区服务异常时回退到项目根）。 */
export async function resolveWorkspace(ctx, sessionId, cwd, projectRoot) {
  const registry = (() => {
    try {
      return ctx?.get?.('workspaceRegistry')
    } catch {
      return undefined
    }
  })()
  if (registry !== undefined && typeof registry.list === 'function') {
    try {
      for (const entity of registry.list()) {
        const ids = Array.isArray(entity?.sessionIds) ? entity.sessionIds : []
        if (ids.includes(sessionId)) return fromEntity(entity)
      }
    } catch {
      // 继续按路径/项目根回退
    }
  }
  return resolveWorkspaceByPath(ctx, cwd, projectRoot)
}

/** 给客户端展示用的工作区摘要。 */
export function workspaceView(workspace) {
  return {
    key: workspace.key,
    title: workspace.title,
    path: workspace.path,
    source: workspace.source,
  }
}
