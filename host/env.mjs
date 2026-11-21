/**
 * 把配置注入给技能子进程，并挂上静态 shim/启动钩子。
 *
 * 关键约束（DSH 0.2.2）：模型执行的 shell 会丢掉名字里带
 * KEY / TOKEN / SECRET / PASSWORD 的环境变量
 * （`@deepseek-ai/dsh-subprocess` 的 SENSITIVE_ENV_PATTERN）。所以密钥统一用
 * `ZRWANG_*_CRED` 注入，再由 `host/pysite/sitecustomize.py` 映射回上游标准名；
 * python/bash/firecrawl 的转发脚本是 `host/shim/` 下的静态文件，随包分发。
 *
 * 运行期不生成任何脚本或钩子，只改当前进程的环境变量。
 */
import { existsSync } from 'node:fs'
import { delimiter, dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PKG_DIR, SKILLS_DIR } from './config.mjs'
import { cacheRoot } from './paths.mjs'
import { which } from './platform.mjs'
import { resolvePython } from './python.mjs'
import { SECRET_ENV, SECRET_REFS } from './params.mjs'
import { getPath, text } from './object.mjs'

const MANAGED_KEYS = new Set([
  'ZRWANG_SKILL_PYTHON',
  'ZRWANG_GIT_BASH',
  'ZRWANG_NODE',
  'ZRWANG_FIRECRAWL_SCRIPT',
  'ZRWANG_FIRECRAWL_LAUNCHER',
  'PYTHONUTF8',
  'PYTHONIOENCODING',
])

/** 随包分发的静态 shim 与 Python 启动钩子目录。 */
const SHIM_ROOT = join(PKG_DIR, 'host', 'shim')
const SHIM_DIRS = {
  python: join(SHIM_ROOT, 'python'),
  bash: join(SHIM_ROOT, 'bash'),
  firecrawl: join(SHIM_ROOT, 'firecrawl'),
}
const PY_BRIDGE_DIR = join(PKG_DIR, 'host', 'pysite')

let previous = null
let appliedSignature = ''

function setEnv(name, value) {
  const next = text(value)
  if (next.length > 0) process.env[name] = next
  else delete process.env[name]
}

function pathKey(env) {
  return Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
}

function pathParts() {
  const key = pathKey(process.env)
  return String(process.env[key] ?? '').split(delimiter).filter(Boolean)
}

function setPathParts(parts) {
  process.env[pathKey(process.env)] = parts.join(delimiter)
}

function isShimPath(part) {
  return part === SHIM_ROOT || part.startsWith(`${SHIM_ROOT}${sep}`)
}

/** 只保留本次需要的 shim 目录，重复调用不会叠加。 */
function applyShimPath(dirs) {
  setPathParts([...dirs, ...pathParts().filter(part => !isShimPath(part))])
}

function clearShimPath() {
  setPathParts(pathParts().filter(part => !isShimPath(part)))
}

/** 生图接口地址 → nature-figure 用的完整 endpoint。 */
export function imageEndpoint(baseUrl) {
  const clean = text(baseUrl).replace(/\/+$/, '')
  if (clean.length === 0) return 'https://api.openai.com/v1/images/generations'
  if (/openrouter\.ai/i.test(clean)) return `${clean}/images`
  if (/\/images(?:\/generations)?$/i.test(clean)) return clean
  return `${clean}/images/generations`
}

/** 只看地址判断后端：通义系走原生接口，其余按 OpenAI 兼容。 */
export function imageBackend(baseUrl) {
  return /dashscope|aliyuncs|qianwenai|multimodal-generation/i.test(text(baseUrl)) ? 'qwen' : 'openai'
}

/** 所有需要暴露给技能的配置项（不含 PATH/PYTHONPATH 等宿主事实）。 */
const CONFIG_ENV_KEYS = [
  'ZRWANG_PLUGIN_CACHE',
  'LIT_DL_SCHOOL_FILE',
  'ARCHIFY_UPDATE_CHECK_DISABLED',
  'ZRWANG_IMAGE_BASE_URL',
  'ZRWANG_IMAGE_MODEL',
  'ZRWANG_IMAGE_BACKEND',
  'IMAGE2PPT_IMAGE_MODEL',
  'IMAGE2PPT_IMAGE_BASE_URL',
  'IMAGE2PPT_IMAGE_BACKEND',
  'OPENROUTER_IMAGE_MODEL',
  'SCHEMATIC_IMAGE_API_URL',
  'NATURE_FIGURE_BACKEND',
  'NCBI_EMAIL',
  'UNPAYWALL_EMAIL',
  'CROSSREF_MAILTO',
  'ZRWANG_IEEE_FULLTEXT_ENDPOINT',
  'PATENT_OA_HOME',
  'PATENT_MAP_HOME',
  'PATENT_EMBEDDING_PROVIDER',
  'PATENT_EMBEDDING_MODEL',
  'PATENT_EMBEDDING_BASE_URL',
  'PATENT_EMBEDDING_DIMENSIONS',
  'PATENT_EMBEDDING_API_KEY_ENV',
  'PATENT_READER_OBSIDIAN_VAULT',
  ...Object.values(SECRET_ENV),
]

/** 官方 shellEnv 的变量声明（`DSH_*` 命名空间）。 */
export function shellEnvVariables() {
  return Object.fromEntries(CONFIG_ENV_KEYS.map(name => [
    `DSH_${name}`,
    { description: `dsh-zrwang-plugin: ${name}` },
  ]))
}


const PATENT_PRESETS = {
  zhipu: {
    provider: 'openai_compatible',
    model: 'embedding-3',
    dimensions: '1024',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyEnv: 'ZHIPUAI_API_KEY',
  },
  dashscope: {
    provider: 'openai_compatible',
    model: 'text-embedding-v3',
    dimensions: '1024',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
  },
  openai: {
    provider: 'openai_compatible',
    model: 'text-embedding-3-small',
    dimensions: '1536',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  local: {
    provider: 'local',
    model: 'BAAI/bge-small-zh-v1.5',
    dimensions: '512',
    baseUrl: '',
    apiKeyEnv: '',
  },
}

/**
 * 由插件配置算出技能要的环境变量（旧名字）。
 * shellEnvValues() 会加 `DSH_` 前缀后交给 DSH 的 shellEnv；静态
 * `sitecustomize.py` 再在 Python 进程里映射回这些旧名字。
 */
export function configEnv(params) {
  const out = {}
  const put = (name, value) => {
    const next = text(value)
    if (next.length > 0) out[name] = next
  }

  put('ZRWANG_PLUGIN_CACHE', cacheRoot())
  put('LIT_DL_SCHOOL_FILE', join(SKILLS_DIR, 'research', 'nature-skills', 'nature-downloader', 'config', 'school.json'))
  put('ARCHIFY_UPDATE_CHECK_DISABLED', '1')

  const image = params?.image ?? {}
  const baseUrl = text(image.baseUrl)
  const model = text(image.model)
  put('ZRWANG_IMAGE_BASE_URL', baseUrl)
  put('ZRWANG_IMAGE_MODEL', model)
  put('ZRWANG_IMAGE_BACKEND', imageBackend(baseUrl))
  put('IMAGE2PPT_IMAGE_MODEL', model)
  put('IMAGE2PPT_IMAGE_BASE_URL', baseUrl)
  put('IMAGE2PPT_IMAGE_BACKEND', 'openai-compatible-api')
  put('OPENROUTER_IMAGE_MODEL', model)
  put('SCHEMATIC_IMAGE_API_URL', imageEndpoint(baseUrl))
  put('NATURE_FIGURE_BACKEND', params?.natureFigure?.backend === 'r' ? 'r' : 'python')

  const academic = params?.natureAcademic ?? {}
  const pubmed = academic.pubmed ?? {}
  const contact = text(academic.unpaywall?.email) || text(pubmed.email)
  put('NCBI_EMAIL', pubmed.email)
  put('UNPAYWALL_EMAIL', contact)
  put('CROSSREF_MAILTO', text(academic.crossref?.mailto) || text(pubmed.email) || contact)
  put('ZRWANG_IEEE_FULLTEXT_ENDPOINT', text(params?.natureDownloader?.ieee?.fulltextEndpoint))

  const patent = params?.patent ?? {}
  const embedding = patent.embedding ?? {}
  const providerName = text(embedding.provider)
  const preset = providerName === '' ? undefined : PATENT_PRESETS[providerName] ?? PATENT_PRESETS.zhipu
  put('PATENT_EMBEDDING_PROVIDER', preset === undefined ? '' : preset.provider)
  put('PATENT_EMBEDDING_MODEL', text(embedding.model) || preset?.model)
  put('PATENT_EMBEDDING_BASE_URL', text(embedding.baseUrl) || preset?.baseUrl)
  put('PATENT_EMBEDDING_DIMENSIONS', text(embedding.dimensions) || preset?.dimensions)
  put('PATENT_EMBEDDING_API_KEY_ENV', preset?.apiKeyEnv)
  put('PATENT_READER_OBSIDIAN_VAULT', text(patent.vault))

  for (const [path, ref] of Object.entries(SECRET_REFS)) {
    const envName = SECRET_ENV[ref]
    if (envName !== undefined) put(envName, getPath(params, path.split('.')))
  }
  out.PATENT_OA_HOME = join(cacheRoot(), 'patent', 'oa')
  out.PATENT_MAP_HOME = join(cacheRoot(), 'patent', 'patent-map')
  return out
}

/** 交给 DSH 官方 shellEnv 的一次执行快照。 */
export function shellEnvValues(params) {
  return Object.fromEntries(Object.entries(configEnv(params)).map(([name, value]) => [`DSH_${name}`, value]))
}

/** 把静态启动钩子目录放到 PYTHONPATH 最前面；旧版的生成文件不再使用。 */
function applyPythonBridge() {
  const parts = String(process.env.PYTHONPATH ?? '').split(delimiter).filter(part => part.length > 0 && part !== PY_BRIDGE_DIR)
  process.env.PYTHONPATH = [PY_BRIDGE_DIR, ...parts].join(delimiter)
  delete process.env.BASH_ENV
}

/** 找 Git Bash（Windows）或系统 bash；没有就返回 undefined。 */
export function resolveBash() {
  const explicit = text(process.env.ZRWANG_BASH)
  if (explicit.length > 0 && existsSync(explicit)) return explicit
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
    const localAppData = process.env.LOCALAPPDATA ?? ''
    for (const candidate of [
      join(programFiles, 'Git', 'bin', 'bash.exe'),
      join(programFiles, 'Git', 'usr', 'bin', 'bash.exe'),
      ...(localAppData.length > 0 ? [join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe')] : []),
    ]) {
      if (existsSync(candidate)) return candidate
    }
    return undefined
  }
  return which('bash')
}

function applyPythonAndBash(params, extraDirs = []) {
  const dirs = [...extraDirs]
  const python = resolvePython(params)
  if (python.path.length > 0) {
    process.env.ZRWANG_SKILL_PYTHON = python.path
    dirs.push(SHIM_DIRS.python)
  } else {
    delete process.env.ZRWANG_SKILL_PYTHON
  }
  const bash = resolveBash()
  if (bash !== undefined) {
    process.env.ZRWANG_GIT_BASH = bash
    dirs.push(SHIM_DIRS.bash)
  } else {
    delete process.env.ZRWANG_GIT_BASH
  }
  applyShimPath(dirs)
  return python
}

/** Firecrawl CLI 的静态 shim：把 `_CRED` 映射成 FIRECRAWL_API_KEY 后调用真实 CLI。 */
function applyFirecrawlShim() {
  const real = which('firecrawl')
  const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'firecrawl-shim.mjs')
  const launcherCandidates = real === undefined
    ? []
    : [join(dirname(real), 'node_modules', 'firecrawl-cli', 'dist', 'launcher.js'), join(dirname(real), '..', 'node_modules', 'firecrawl-cli', 'dist', 'launcher.js')]
  const launcher = launcherCandidates.find(existsSync)
  if (launcher === undefined || !existsSync(script)) {
    delete process.env.ZRWANG_NODE
    delete process.env.ZRWANG_FIRECRAWL_SCRIPT
    delete process.env.ZRWANG_FIRECRAWL_LAUNCHER
    return false
  }
  process.env.ZRWANG_NODE = process.execPath
  process.env.ZRWANG_FIRECRAWL_SCRIPT = script
  process.env.ZRWANG_FIRECRAWL_LAUNCHER = launcher
  return true
}

/**
 * 把参数落进进程环境。
 *
 * @param {object} params - 已经合并密钥的参数（params.mjs 的 withSecrets 结果）。
 * @returns {{python: object, bash: string|undefined}}
 */
export function applySkillEnv(params) {
  if (previous === null) {
    previous = {
      PATH: process.env[pathKey(process.env)],
      BASH_ENV: process.env.BASH_ENV,
      PYTHONPATH: process.env.PYTHONPATH,
      PYTHONUTF8: process.env.PYTHONUTF8,
      PYTHONIOENCODING: process.env.PYTHONIOENCODING,
    }
  }
  clearShimPath()
  setEnv('PYTHONUTF8', '1')
  setEnv('PYTHONIOENCODING', 'utf-8')
  applyPythonBridge()
  const firecrawl = applyFirecrawlShim()
  const python = applyPythonAndBash(params, firecrawl ? [SHIM_DIRS.firecrawl] : [])
  appliedSignature = JSON.stringify(params ?? {})
  return { python, bash: process.env.ZRWANG_GIT_BASH }
}

/** 当前注入参数的签名（用于判断是否需要重新注入）。 */
export function envSignature() {
  return appliedSignature
}

/** 卸载/禁用时把进程环境恢复成注入前的样子。 */
export function restoreSkillEnv() {
  if (previous === null) return
  if (previous.PATH === undefined) delete process.env[pathKey(process.env)]
  else process.env[pathKey(process.env)] = previous.PATH
  for (const [name, value] of [
    ['BASH_ENV', previous.BASH_ENV],
    ['PYTHONPATH', previous.PYTHONPATH],
    ['PYTHONUTF8', previous.PYTHONUTF8],
    ['PYTHONIOENCODING', previous.PYTHONIOENCODING],
  ]) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  for (const key of MANAGED_KEYS) delete process.env[key]
  previous = null
  appliedSignature = ''
}
