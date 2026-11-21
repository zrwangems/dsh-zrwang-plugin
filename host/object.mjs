/** 小工具：按点分路径读写对象，避免每处重复实现。 */

export function getPath(source, keys) {
  let node = source
  for (const key of keys) {
    if (node === null || typeof node !== 'object') return undefined
    node = node[key]
  }
  return node
}

export function setPath(target, keys, value) {
  let node = target
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index]
    if (node[key] === null || typeof node[key] !== 'object') node[key] = {}
    node = node[key]
  }
  node[keys[keys.length - 1]] = value
  return target
}

export function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** 深拷贝纯 JSON 数据。 */
export function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}
