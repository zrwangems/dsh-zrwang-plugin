/**
 * 插件参数：非密钥只进 profile 补丁里本插件条目的 `config`，密钥只进 DSH 凭据库。
 *
 * 用户 2026-11-21 的原则：
 *   - 所有需要填的配置都在插件设置栏里，保存即生效；
 *   - 密钥不写进任何配置文件，也不写进持久化目录；
 *   - 上游技能/组件不再有自己的配置文件，全部读这里注入的字段。
 *
 * 本模块是唯一的读写入口：设置页、启动装配、技能环境注入都从这里取参数。
 */
import { existsSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { getPath, setPath } from './object.mjs'
import { PKG_DIR, defaultPatentRoot } from './paths.mjs'

/**
 * 密钥字段 → DSH 凭据引用名。
 * 引用名只给 `ctx.credentials` 用，不会作为环境变量名出现。
 */
export const SECRET_REFS = {
  'image.apiKey': 'ZRWANG_IMAGE_API_KEY',
  'natureImage2ppt.paddleOcrToken': 'ZRWANG_OCR_TOKEN',
  'optional.firecrawlApiKey': 'ZRWANG_FIRECRAWL_API_KEY',
  'optional.pexelsApiKey': 'ZRWANG_PEXELS_API_KEY',
  'optional.pixabayApiKey': 'ZRWANG_PIXABAY_API_KEY',
  'optional.openAlexApiKey': 'ZRWANG_OPENALEX_API_KEY',
  'natureAcademic.pubmed.apiKey': 'NCBI_API_KEY',
  'natureDownloader.elsevier.apiKey': 'ZRWANG_ELSEVIER_API_KEY',
  'natureDownloader.elsevier.instToken': 'ZRWANG_ELSEVIER_INST_TOKEN',
  'natureDownloader.elsevier.authToken': 'ZRWANG_ELSEVIER_AUTH_TOKEN',
  'natureDownloader.springer.fulltextApiKey': 'ZRWANG_SPRINGER_FULLTEXT_API_KEY',
  'natureDownloader.springer.openaccessApiKey': 'ZRWANG_SPRINGER_OA_API_KEY',
  'natureDownloader.springer.metadataApiKey': 'ZRWANG_SPRINGER_METADATA_API_KEY',
  'natureDownloader.ieee.apiKey': 'ZRWANG_IEEE_API_KEY',
  'patent.embedding.apiKey': 'ZRWANG_PATENT_EMBEDDING_API_KEY',
}

/**
 * 凭据引用名 → 注入给技能子进程的环境变量名。
 *
 * DSH 的子进程会把名字里带 KEY / TOKEN / SECRET / PASSWORD 的变量清掉
 * （`@deepseek-ai/dsh-subprocess` 的 `SENSITIVE_ENV_PATTERN`），所以这里统一用
 * `*_CRED`：名字能活到 shell，再由 Python 启动钩子映射回上游认的标准名。
 */
export const SECRET_ENV = {
  ZRWANG_IMAGE_API_KEY: 'ZRWANG_IMAGE_CRED',
  ZRWANG_OCR_TOKEN: 'ZRWANG_OCR_CRED',
  ZRWANG_FIRECRAWL_API_KEY: 'ZRWANG_FIRECRAWL_CRED',
  ZRWANG_PEXELS_API_KEY: 'ZRWANG_PEXELS_CRED',
  ZRWANG_PIXABAY_API_KEY: 'ZRWANG_PIXABAY_CRED',
  ZRWANG_OPENALEX_API_KEY: 'ZRWANG_OPENALEX_CRED',
  NCBI_API_KEY: 'ZRWANG_NCBI_CRED',
  ZRWANG_ELSEVIER_API_KEY: 'ZRWANG_ELSEVIER_CRED',
  ZRWANG_ELSEVIER_INST_TOKEN: 'ZRWANG_ELSEVIER_INST_CRED',
  ZRWANG_ELSEVIER_AUTH_TOKEN: 'ZRWANG_ELSEVIER_AUTH_CRED',
  ZRWANG_SPRINGER_FULLTEXT_API_KEY: 'ZRWANG_SPRINGER_FULLTEXT_CRED',
  ZRWANG_SPRINGER_OA_API_KEY: 'ZRWANG_SPRINGER_OA_CRED',
  ZRWANG_SPRINGER_METADATA_API_KEY: 'ZRWANG_SPRINGER_METADATA_CRED',
  ZRWANG_IEEE_API_KEY: 'ZRWANG_IEEE_CRED',
  ZRWANG_PATENT_EMBEDDING_API_KEY: 'ZRWANG_PATENT_EMBEDDING_CRED',
}

/** 非密钥字段的完整形状；未列出的字段一律视为无效。 */
export function defaultParams() {
  return {
    image: { baseUrl: '', model: '' },
    natureAcademic: {
      pubmed: { email: '' },
      unpaywall: { email: '' },
      crossref: { mailto: '' },
    },
    natureDownloader: {
      elsevier: { instToken: '', authToken: '' },
      springer: {},
      ieee: { fulltextEndpoint: '' },
    },
    natureImage2ppt: {},
    natureFigure: { backend: 'python' },
    patent: {
      root: defaultPatentRoot(),
      embedding: { provider: 'zhipu', model: '', baseUrl: '', dimensions: '' },
    },
    optional: {},
    python: { path: '' },
    mcp: { autoRecover: 'on' },
  }
}

const TABLE = {
  'image.baseUrl': 'string',
  'image.model': 'string',
  'natureAcademic.pubmed.email': 'string',
  'natureAcademic.unpaywall.email': 'string',
  'natureAcademic.crossref.mailto': 'string',
  'natureDownloader.elsevier.instToken': 'secret',
  'natureDownloader.elsevier.authToken': 'secret',
  'natureDownloader.ieee.fulltextEndpoint': 'string',
  'natureFigure.backend': 'string',
  'patent.root': 'string',
  'patent.embedding.provider': 'string',
  'patent.embedding.model': 'string',
  'patent.embedding.baseUrl': 'string',
  'patent.embedding.dimensions': 'string',
  'patent.embedding.apiKey': 'secret',
  'python.path': 'string',
  'mcp.autoRecover': 'string',
  'natureAcademic.pubmed.apiKey': 'secret',
  'image.apiKey': 'secret',
  'natureImage2ppt.paddleOcrToken': 'secret',
  'optional.firecrawlApiKey': 'secret',
  'optional.pexelsApiKey': 'secret',
  'optional.pixabayApiKey': 'secret',
  'optional.openAlexApiKey': 'secret',
  'natureDownloader.elsevier.apiKey': 'secret',
  'natureDownloader.springer.fulltextApiKey': 'secret',
  'natureDownloader.springer.openaccessApiKey': 'secret',
  'natureDownloader.springer.metadataApiKey': 'secret',
  'natureDownloader.ieee.apiKey': 'secret',
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 校验并归一化 profile 补丁里的 config。
 *
 * 返回的 `legacySecrets` 是旧版本误写进 config 的密钥路径 → 值；调用方负责把它们
 * 写进凭据库并从 config 里删掉，这样升级后不会继续把密钥留在 YAML 里。
 */
export function normalizeConfig(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  const params = defaultParams()
  const warnings = []
  const legacySecrets = {}
  const known = new Set(Object.keys(TABLE).map(path => path.split('.')[0]))

  for (const key of Object.keys(input)) {
    if (!known.has(key)) warnings.push(`忽略未知配置项：${key}`)
  }

  for (const [path, kind] of Object.entries(TABLE)) {
    const value = getPath(input, path.split('.'))
    if (value === undefined || value === null) continue
    if (typeof value !== 'string') {
      warnings.push(`${path} 应该是字符串，已忽略`)
      continue
    }
    if (kind === 'secret') {
      const trimmed = value.trim()
      if (trimmed.length > 0) legacySecrets[path] = trimmed
      continue
    }
    setPath(params, path.split('.'), value.trim())
  }

  if (!['python', 'r'].includes(params.natureFigure.backend)) {
    warnings.push('natureFigure.backend 只能是 python 或 r，已回退为 python')
    params.natureFigure.backend = 'python'
  }
  if (params.image.baseUrl.length > 0 && !isHttpUrl(params.image.baseUrl)) {
    warnings.push('image.baseUrl 必须是 http(s) 地址，已忽略')
    params.image.baseUrl = ''
  }
  if (params.python.path.length > 0 && !isAbsoluteLike(params.python.path)) {
    warnings.push('python.path 必须是绝对路径，已忽略')
    params.python.path = ''
  }
  if (!['on', 'off'].includes(params.mcp.autoRecover)) {
    warnings.push('mcp.autoRecover 只能是 on 或 off，已回退为 on')
    params.mcp.autoRecover = 'on'
  }
  // 专利数据目录：必须是绝对路径、不能指向插件安装目录、不能是已有文件。
  // 清空或非法时保持空，用到它的专利技能会在设置页置灰并不注入。
  if (params.patent.root.length > 0) {
    if (!isAbsoluteLike(params.patent.root)) {
      warnings.push('patent.root 必须是绝对路径，已忽略')
      params.patent.root = ''
    } else {
      const root = resolve(params.patent.root)
      if (root === PKG_DIR || root.startsWith(`${PKG_DIR}${sep}`)) {
        warnings.push('patent.root 不能放在插件安装目录里，已忽略')
        params.patent.root = ''
      } else if (existsSync(root) && !statSync(root).isDirectory()) {
        warnings.push('patent.root 指向的是文件而不是目录，已忽略')
        params.patent.root = ''
      } else {
        params.patent.root = root
      }
    }
  }
  if (getPath(input, ['patent', 'vault']) !== undefined) {
    warnings.push('patent.vault 已改为 patent.root（专利数据目录），Obsidian 库改为它下面的 vault/，请重新设置')
  }
  return { params, legacySecrets, warnings }
}

function isAbsoluteLike(value) {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\\\')
}

/** 从参数里摘出密钥值（只用于写入凭据库，不落盘）。 */
export function secretsOf(params) {
  const values = {}
  for (const path of Object.keys(SECRET_REFS)) {
    const value = text(getPath(params, path.split('.')))
    if (value.length > 0) values[path] = value
  }
  return values
}

/** 非密钥部分：去掉空值后写进 profile 补丁；密钥字段永远不出现。 */
export function configOfParams(params) {
  const out = {}
  for (const [path, kind] of Object.entries(TABLE)) {
    if (kind === 'secret') continue
    const value = text(getPath(params, path.split('.')))
    // patent.root 空值也要写：清空它表示“专利技能不启用”，不能被默认值盖回去。
    if (value.length > 0 || path === 'patent.root') setPath(out, path.split('.'), value)
  }
  return out
}

/** 读取凭据库里的本插件密钥；读不到按未配置处理。 */
export async function readSecrets(ctx) {
  const credentials = ctx?.get?.('credentials')
  const values = {}
  const present = {}
  if (credentials === undefined || typeof credentials.resolve !== 'function') return { values, present }
  for (const [path, ref] of Object.entries(SECRET_REFS)) {
    try {
      const hit = await credentials.resolve(ref)
      if (typeof hit?.value === 'string' && hit.value.length > 0) {
        values[path] = hit.value
        present[path] = true
      }
    } catch {
      // 凭据服务不可用时按未配置处理；设置页会显示“未设置”
    }
  }
  return { values, present }
}

/** 把密钥补进参数（只在内存里，供注入与校验使用）。 */
export function withSecrets(params, values) {
  const merged = JSON.parse(JSON.stringify(params ?? {}))
  for (const [path, value] of Object.entries(values ?? {})) {
    if (text(value).length > 0) setPath(merged, path.split('.'), text(value))
  }
  return merged
}

function credentialsOf(ctx) {
  const credentials = ctx?.get?.('credentials')
  return credentials !== undefined && typeof credentials.set === 'function' ? credentials : undefined
}

function editorOf(ctx) {
  const editor = ctx?.get?.('configEditor')
  return editor !== undefined && typeof editor.edit === 'function' ? editor : undefined
}

/** 本插件在 profile 补丁里的 loader 条目；`entries()` 是 config-editor 的公开接口。 */
function editorEntry(editor, ctx) {
  if (editor !== undefined && typeof editor.entries === 'function') {
    try {
      const rows = editor.entries() ?? []
      const own = rows.find(row => row?.options?.id === 'dsh-zrwang-plugin')
      if (own !== undefined) return own
    } catch {
      // 回退到 fiber 自带 entry
    }
  }
  return ctx?.fiber?.entry
}

/**
 * 保存设置。
 * @returns {{saved:boolean, configUpdated:boolean, secretsUpdated:number, credentialsAvailable:boolean, warnings:string[], error?:string}}
 */
export async function persistParams(ctx, params) {
  const normalized = normalizeConfig(configOfParams(params))
  const config = normalized.params
  const warnings = [...normalized.warnings]
  const credentials = credentialsOf(ctx)
  let secretsUpdated = 0
  const secretErrors = []

  if (credentials !== undefined) {
    for (const [path, ref] of Object.entries(SECRET_REFS)) {
      const value = text(getPath(params, path.split('.')))
      try {
        if (value.length > 0) {
          await credentials.set(ref, value)
          secretsUpdated += 1
        } else {
          // 空值表示“清掉这个密钥”；没存过的 unset 是幂等的。
          await credentials.unset(ref)
        }
      } catch (error) {
        secretErrors.push(`${ref}：${String(error?.message ?? error)}`)
      }
    }
  } else if (Object.keys(secretsOf(params)).length > 0) {
    secretErrors.push('当前 profile 没有凭据服务，密钥未保存')
  }

  const editor = editorOf(ctx)
  const entry = editorEntry(editor, ctx)
  if (editor === undefined || entry === undefined) {
    return {
      saved: false,
      configUpdated: false,
      secretsUpdated,
      credentialsAvailable: credentials !== undefined,
      warnings: [...warnings, ...secretErrors],
      error: '当前 profile 不支持写入插件配置（缺少 configEditor）',
    }
  }
  try {
    await editor.edit(entry, () => config)
  } catch (error) {
    return {
      saved: false,
      configUpdated: false,
      secretsUpdated,
      credentialsAvailable: credentials !== undefined,
      warnings: [...warnings, ...secretErrors],
      error: String(error?.message ?? error),
    }
  }
  return {
    saved: true,
    configUpdated: true,
    secretsUpdated,
    credentialsAvailable: credentials !== undefined,
    warnings: [...warnings, ...secretErrors],
  }
}

/** 启动时把旧版写进 config 的密钥搬进凭据库，并从 config 里删掉。 */
export async function migrateLegacySecrets(ctx, rawConfig) {
  const { params, legacySecrets, warnings } = normalizeConfig(rawConfig)
  if (Object.keys(legacySecrets).length === 0) return { migrated: 0, params, warnings }
  const credentials = credentialsOf(ctx)
  if (credentials === undefined) return { migrated: 0, params, warnings: [...warnings, '旧密钥仍在 config 里，但当前 profile 没有凭据服务'] }
  let migrated = 0
  for (const [path, value] of Object.entries(legacySecrets)) {
    try {
      await credentials.set(SECRET_REFS[path], value)
      migrated += 1
    } catch (error) {
      warnings.push(`迁移 ${path} 失败：${String(error?.message ?? error)}`)
    }
  }
  if (migrated > 0) {
    const editor = editorOf(ctx)
    if (editor !== undefined && ctx?.fiber?.entry !== undefined) {
      try {
        await editor.edit(ctx.fiber.entry, () => configOfParams(params))
      } catch (error) {
        warnings.push(`清理 config 里的旧密钥失败：${String(error?.message ?? error)}`)
      }
    }
  }
  return { migrated, params, warnings }
}
