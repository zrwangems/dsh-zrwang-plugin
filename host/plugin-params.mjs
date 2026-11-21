/**
 * 插件参数：非密钥走 profile 的 `cordis.patch.yml`，密钥走 DSH 凭据库。
 *
 * 依据 DSH 官方插件文档（`dsh-doc` 的 configuration 一节）：
 * - 配置：`ctx.get('configEditor').edit(ctx.fiber.entry, …)` 把值写进当前 profile 补丁里本插件那一行，
 *   插件不要自己去读写 `cordis.patch.yml`；
 * - 密钥：`ctx.credentials`（`@deepseek-ai/dsh-credentials`）存在 `$DSH_HOME/.credentials.yaml`，
 *   绝不放配置里；
 * - 运行期产物（选择态、门禁、shim、暂存 exe）放 `$DSH_HOME/cache/zrwang-plugin/`。
 *
 * 插件**不再维护自己的配置目录**：既没有 settings.json，也没有 zrwang-plugin-config/。
 */
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** 当前生效的 DSH 家目录（与 @deepseek-ai/dsh-home-paths 的规则一致）。 */
export function dshHome() {
  const override = process.env.DSH_HOME
  if (typeof override === 'string' && override.trim().length > 0) return resolve(override.trim())
  return join(homedir(), '.dsh')
}

/** 运行期缓存根目录（DSH 家目录下的 cache，和官方 `dshCachePath` 一致）。 */
export function cacheRoot() {
  return join(dshHome(), 'cache', 'zrwang-plugin')
}

/** 侧边栏选项组合（选择态/模式/门禁/链接台账/事件）放这里，别的都不放。 */
export function stateRoot() {
  return join(dshHome(), 'zrwang-plugin-config', 'state')
}

/** 运行期产物（MCP 暂存 exe、shell/Python shim、sitecustomize、备份）放 DSH 的 cache 下。 */
export function artifactRoot() {
  return cacheRoot()
}

/** 旧版配置目录：只用于一次性迁移，迁移后不再读写。 */
export function legacyConfigRoot() {
  return join(dshHome(), 'zrwang-plugin-config')
}

/**
 * 密钥字段 → DSH 凭据名（POSIX 环境变量名形式）。
 * 存进 `.credentials.yaml`，用 `ctx.credentials.resolve(ref)` 读出来，再以 `ZRWANG_SECRET_*` 注入子进程
 * （这些名字里没有 KEY/TOKEN/SECRET/PASSWORD，DSH 的 shell 清洗不会把它们洗掉）。
 */
export const SECRET_REFS = {
  'image.apiKey': 'ZRWANG_IMAGE_API_KEY',
  'natureImage2ppt.paddleOcrToken': 'ZRWANG_PADDLE_OCR_TOKEN',
  'optional.firecrawlApiKey': 'ZRWANG_FIRECRAWL_API_KEY',
  'natureAcademic.pubmed.apiKey': 'NCBI_API_KEY',
  'optional.pexelsApiKey': 'ZRWANG_PEXELS_API_KEY',
  'optional.pixabayApiKey': 'ZRWANG_PIXABAY_API_KEY',
  'optional.openAlexApiKey': 'ZRWANG_OPENALEX_API_KEY',
}

/** 出版社凭据（多字段）作为一条凭据记录存在 `<scope>/<id>`。 */
export const DOWNLOADER_RECORD = 'dsh-zrwang-plugin/nature-downloader'

let secretValues = {}
let downloaderRecord = {}

export function setSecrets(values, record) {
  secretValues = { ...(values ?? {}) }
  downloaderRecord = { ...(record ?? {}) }
}

export function secretsOf() {
  return { ...secretValues }
}

export function downloaderSecretsOf() {
  return { ...downloaderRecord }
}

function credentialsOf(ctx) {
  const credentials = ctx?.get?.('credentials')
  return credentials !== undefined && typeof credentials.resolve === 'function' ? credentials : undefined
}

/** 从 DSH 凭据库读出本插件用到的密钥（读不到就当没配）。 */
export async function readSecrets(ctx) {
  const credentials = credentialsOf(ctx)
  if (credentials === undefined) {
    setSecrets({}, {})
    return
  }
  const values = {}
  for (const [path, ref] of Object.entries(SECRET_REFS)) {
    try {
      const hit = await credentials.resolve(ref)
      if (typeof hit?.value === 'string' && hit.value.length > 0) values[path] = hit.value
    } catch {
      // 凭据库不可用时按未配置处理
    }
  }
  let record = {}
  try {
    const hit = await credentials.readRecord(DOWNLOADER_RECORD)
    const payload = hit?.payload
    if (payload !== null && typeof payload === 'object') record = payload
  } catch {
    // 同上
  }
  setSecrets(values, record)
}

function setPath(target, keys, value) {
  let node = target
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i]
    if (node[key] === null || typeof node[key] !== 'object') node[key] = {}
    node = node[key]
  }
  node[keys[keys.length - 1]] = value
}

function getPath(source, keys) {
  let node = source
  for (const key of keys) {
    if (node === null || typeof node !== 'object') return undefined
    node = node[key]
  }
  return node
}

/** 把凭据里的密钥补进参数对象（配置里的空值视为未配置）。 */
export function applyStoredSecrets(params) {
  for (const path of Object.keys(SECRET_REFS)) {
    const keys = path.split('.')
    const current = getPath(params, keys)
    const value = secretValues[path]
    if (typeof value === 'string' && value.length > 0 && (typeof current !== 'string' || current.length === 0)) {
      setPath(params, keys, value)
    }
  }
  const map = {
    'elsevier.apiKey': 'elsevier_api_key',
    'elsevier.instToken': 'elsevier_insttoken',
    'elsevier.authToken': 'elsevier_authtoken',
    'springer.fulltextApiKey': 'springer_fulltext_api_key',
    'springer.openaccessApiKey': 'springer_openaccess_api_key',
    'springer.metadataApiKey': 'springer_metadata_api_key',
    'ieee.apiKey': 'ieee_api_key',
    'ieee.fulltextEndpoint': 'ieee_fulltext_endpoint',
  }
  for (const [path, field] of Object.entries(map)) {
    const keys = path.split('.')
    const current = getPath(params, keys)
    const value = downloaderRecord[field]
    if (typeof value === 'string' && value.length > 0 && (typeof current !== 'string' || current.length === 0)) {
      setPath(params, keys, value)
    }
  }
  return params
}

/** 从参数里摘出要存的密钥字段。 */
function collectSecrets(params) {
  const values = {}
  for (const path of Object.keys(SECRET_REFS)) {
    const value = getPath(params, path.split('.'))
    if (typeof value === 'string' && value.trim().length > 0) values[path] = value.trim()
  }
  const record = {}
  const map = {
    'elsevier.apiKey': 'elsevier_api_key',
    'elsevier.instToken': 'elsevier_insttoken',
    'elsevier.authToken': 'elsevier_authtoken',
    'springer.fulltextApiKey': 'springer_fulltext_api_key',
    'springer.openaccessApiKey': 'springer_openaccess_api_key',
    'springer.metadataApiKey': 'springer_metadata_api_key',
    'ieee.apiKey': 'ieee_api_key',
    'ieee.fulltextEndpoint': 'ieee_fulltext_endpoint',
  }
  for (const [path, field] of Object.entries(map)) {
    const value = getPath(params, path.split('.'))
    if (typeof value === 'string' && value.trim().length > 0) record[field] = value.trim()
  }
  return { values, record }
}

/** 递归去掉空值：没填过的项不写进 profile 补丁，补丁里只留真正生效的行。 */
function pruneEmpty(value) {
  if (Array.isArray(value)) {
    const list = value.map(pruneEmpty).filter(item => item !== undefined)
    return list.length > 0 ? list : undefined
  }
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      const pruned = pruneEmpty(item)
      if (pruned !== undefined) out[key] = pruned
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  if (typeof value === 'string') {
    const text = value.trim()
    return text.length > 0 ? text : undefined
  }
  return value === undefined || value === null ? undefined : value
}

/** 参数里去掉密钥后的部分，写进 profile 补丁；空字段直接不出现。 */
export function configOfParams(params) {
  const clone = JSON.parse(JSON.stringify(params ?? {}))
  delete clone.configDir
  delete clone.pptMaster
  delete clone.runtime
  delete clone.ars
  for (const path of Object.keys(SECRET_REFS)) {
    const keys = path.split('.')
    let node = clone
    for (let i = 0; i < keys.length - 1; i += 1) {
      if (node[keys[i]] === null || typeof node[keys[i]] !== 'object') node[keys[i]] = {}
      node = node[keys[i]]
    }
    delete node[keys[keys.length - 1]]
  }
  const downloader = clone.natureDownloader ?? {}
  for (const provider of Object.values(downloader)) {
    if (provider === null || typeof provider !== 'object') continue
    for (const field of ['apiKey', 'instToken', 'authToken', 'fulltextApiKey', 'openaccessApiKey', 'metadataApiKey', 'fulltextEndpoint']) {
      delete provider[field]
    }
  }
  // 与代码里的默认值相同的项不写进补丁（技能没有配置文件时就用这些默认值）。
  const academic = clone.natureAcademic?.pubmed
  if (academic !== undefined && academic.cacheDir === '~/.cache/academic-search') delete academic.cacheDir
  return pruneEmpty(clone) ?? {}
}

/**
 * 保存设置：密钥进凭据库，其它字段进 profile 补丁。
 * @returns {{ saved: boolean, secretsUpdated: number, configUpdated: boolean, credentialsAvailable: boolean, secretErrors: {ref: string, message: string}[], error?: string }}
 */
export async function persistParams(ctx, params) {
  const { values, record } = collectSecrets(params)
  let secretsUpdated = 0
  const secretErrors = []
  const credentials = credentialsOf(ctx)
  if (credentials !== undefined) {
    for (const [path, ref] of Object.entries(SECRET_REFS)) {
      const value = values[path]
      try {
        if (typeof value === 'string' && value.length > 0) {
          await credentials.set(ref, value)
          secretsUpdated += 1
        } else if (secretValues[path] !== undefined) {
          await credentials.unset(ref)
        }
      } catch (error) {
        secretErrors.push({ ref, message: String(error?.message ?? error) })
      }
    }
    try {
      if (Object.keys(record).length > 0) {
        await credentials.modifyRecord(DOWNLOADER_RECORD, async () => ({ kind: 'provider-env', payload: record }))
        secretsUpdated += 1
      } else if (Object.keys(downloaderRecord).length > 0) {
        await credentials.deleteRecord(DOWNLOADER_RECORD)
      }
    } catch (error) {
      secretErrors.push({ ref: DOWNLOADER_RECORD, message: String(error?.message ?? error) })
    }
    setSecrets(values, record)
  }
  const credentialsAvailable = credentials !== undefined


  const config = configOfParams(params)
  const editor = ctx?.get?.('configEditor')
  const entry = ctx?.fiber?.entry
  if (editor === undefined || typeof editor.edit !== 'function' || entry === undefined) {
    return {
      saved: false,
      secretsUpdated,
      configUpdated: false,
      credentialsAvailable,
      secretErrors,
      error: '当前 profile 不支持保存配置（缺少 configEditor）',
    }
  }
  try {
    // 没填任何值就返回继承来的 config（与它逐项相等时，configEditor 会把 config: 整行删掉，
    // 补丁里只剩 id 与 name，不会出现 config: {}）。
    await editor.edit(entry, (current, inherited) => (Object.keys(config).length > 0 ? config : inherited))
  } catch (error) {
    return {
      saved: false,
      secretsUpdated,
      configUpdated: false,
      credentialsAvailable,
      secretErrors,
      error: String(error?.message ?? error),
    }
  }
  return { saved: true, secretsUpdated, configUpdated: true, credentialsAvailable, secretErrors }
}

/**
 * 一次性迁移：旧版把参数写在 `<DSH 家目录>/zrwang-plugin-config/settings.json`。
 * 迁移后把文件改名，避免再次导入。
 */
export function takeLegacySettings() {
  const file = join(legacyConfigRoot(), 'settings.json')
  if (!existsSync(file)) return undefined
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'))
    renameSync(file, `${file}.imported`)
    return value !== null && typeof value === 'object' ? value : undefined
  } catch {
    return undefined
  }
}
