/**
 * 从 DSH 工具参数里提取“这次调用可能写哪些文件”。
 *
 * 只认官方工具的参数形状：
 *   - write / edit           -> file_path
 *   - apply_patch            -> 补丁里的 Add / Update / Delete / Move to 路径
 *   - str_replace_editor     -> path（view 是只读）
 *   - bash / pwsh / terminal_send -> 无法在执行前可靠判断读写，单独标记为 shell
 *
 * 其他工具返回空路径，调用方按“不涉及写入”处理。
 */

const SINGLE_PATH_TOOLS = new Set(['write', 'edit'])
const SHELL_TOOLS = new Set(['bash', 'pwsh', 'terminal_send'])
const PATCH_TOOLS = new Set(['apply_patch'])

/** 这个工具是不是一次 shell 调用（可能通过命令写文件）。 */
export function isShellTool(name) {
  return SHELL_TOOLS.has(name)
}

/** 这个工具是不是需要检查写入目标的工具。 */
export function isWriteTool(name) {
  return SINGLE_PATH_TOOLS.has(name) || PATCH_TOOLS.has(name) || name === 'str_replace_editor'
}

function patchTargets(input) {
  if (typeof input !== 'string' || input.trim().length === 0) return []
  const paths = []
  for (const line of input.split(/\r?\n/)) {
    const match = /^\*\*\* (?:Add File|Update File|Delete File|Move to):\s*(.+?)\s*$/.exec(line)
    if (match !== null) paths.push(match[1].replace(/^['"]|['"]$/g, ''))
  }
  return paths
}

/**
 * @returns {{paths: string[], schemaDrift: boolean}} 去重后的路径；参数形状不符时 schemaDrift=true。
 */
export function writeTargets(name, args) {
  const input = args !== null && typeof args === 'object' ? args : {}
  if (SINGLE_PATH_TOOLS.has(name)) {
    const path = input.file_path
    if (typeof path !== 'string' || path.length === 0) return { paths: [], schemaDrift: true }
    return { paths: [path], schemaDrift: false }
  }
  if (PATCH_TOOLS.has(name)) {
    const paths = patchTargets(input.input)
    return { paths: [...new Set(paths)], schemaDrift: paths.length === 0 }
  }
  if (name === 'str_replace_editor') {
    if (input.command === 'view') return { paths: [], schemaDrift: false }
    const path = input.path
    if (typeof path !== 'string' || path.length === 0) return { paths: [], schemaDrift: true }
    return { paths: [path], schemaDrift: false }
  }
  return { paths: [], schemaDrift: false }
}
