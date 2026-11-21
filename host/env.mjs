/**
 * 把配置注入给技能子进程，并生成运行时需要的 shim。
 *
 * 关键约束（DSH 0.2.2）：模型执行的 shell 会丢掉名字里带
 * KEY / TOKEN / SECRET / PASSWORD 的环境变量
 * （`@deepseek-ai/dsh-subprocess` 的 SENSITIVE_ENV_PATTERN）。所以密钥统一用
 * `ZRWANG_*_CRED` 注入，再由 Python 启动钩子映射回上游认的标准名；
 * bash 里需要的 python/bash 由 `cache/artifacts/bin` 的 shim 提供。
 *
 * 本模块不写任何配置文件，也不把密钥落盘。
 */
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SKILLS_DIR } from './config.mjs'
import { cacheRoot, pythonRoot, shimRoot } from './paths.mjs'
import { shimContent, which } from './platform.mjs'
import { resolvePython } from './python.mjs'
import { SECRET_ENV, SECRET_REFS } from './params.mjs'
import { getPath, text } from './object.mjs'

const SECRET_ENV_NAMES = Object.values(SECRET_ENV)
const MANAGED_KEYS = new Set([
  'ZRWANG_PLUGIN_CACHE',
  'ZRWANG_IMAGE_BASE_URL',
  'ZRWANG_IMAGE_MODEL',
  'ZRWANG_IMAGE_BACKEND',
  'ZRWANG_SKILL_PYTHON',
  'ZRWANG_GIT_BASH',
  'LIT_DL_SCHOOL_FILE',
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
  'ARCHIFY_UPDATE_CHECK_DISABLED',
  'PYTHONUTF8',
  'PYTHONIOENCODING',
  ...SECRET_ENV_NAMES,
])

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

function prependShim() {
  setPathParts([shimRoot(), ...pathParts().filter(part => part !== shimRoot())])
}

function removeShim() {
  setPathParts(pathParts().filter(part => part !== shimRoot()))
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

function applyImageEnv(params) {
  const image = params?.image ?? {}
  const baseUrl = text(image.baseUrl)
  const model = text(image.model)
  const backend = imageBackend(baseUrl)
  setEnv('ZRWANG_IMAGE_BASE_URL', baseUrl)
  setEnv('ZRWANG_IMAGE_MODEL', model)
  setEnv('ZRWANG_IMAGE_BACKEND', backend)
  setEnv('IMAGE2PPT_IMAGE_MODEL', model)
  setEnv('IMAGE2PPT_IMAGE_BASE_URL', baseUrl)
  setEnv('IMAGE2PPT_IMAGE_BACKEND', 'openai-compatible-api')
  setEnv('OPENROUTER_IMAGE_MODEL', model)
  setEnv('SCHEMATIC_IMAGE_API_URL', imageEndpoint(baseUrl))
  setEnv('NATURE_FIGURE_BACKEND', params?.natureFigure?.backend === 'r' ? 'r' : 'python')
}

function applyResearchEnv(params) {
  const academic = params?.natureAcademic ?? {}
  const pubmed = academic.pubmed ?? {}
  const contact = text(academic.unpaywall?.email) || text(pubmed.email)
  setEnv('NCBI_EMAIL', pubmed.email)
  setEnv('UNPAYWALL_EMAIL', contact)
  setEnv('CROSSREF_MAILTO', text(academic.crossref?.mailto) || text(pubmed.email) || contact)
  setEnv('ZRWANG_IEEE_FULLTEXT_ENDPOINT', text(params?.natureDownloader?.ieee?.fulltextEndpoint))
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

/** 专利检索向量模型：只注入环境变量，技能不写 embedding.config.yaml。 */
function applyPatentEnv(params) {
  const patent = params?.patent ?? {}
  const embedding = patent.embedding ?? {}
  const provider = text(embedding.provider)
  const preset = provider === '' ? undefined : PATENT_PRESETS[provider] ?? PATENT_PRESETS.zhipu
  setEnv('PATENT_EMBEDDING_PROVIDER', preset === undefined ? '' : preset.provider)
  setEnv('PATENT_EMBEDDING_MODEL', text(embedding.model) || preset?.model)
  setEnv('PATENT_EMBEDDING_BASE_URL', text(embedding.baseUrl) || preset?.baseUrl)
  setEnv('PATENT_EMBEDDING_DIMENSIONS', text(embedding.dimensions) || preset?.dimensions)
  setEnv('PATENT_EMBEDDING_API_KEY_ENV', preset?.apiKeyEnv)
  setEnv('PATENT_READER_OBSIDIAN_VAULT', text(patent.vault))
}

/** 密钥：引用名 → `_CRED` 环境变量。 */
function applySecretEnv(params) {
  for (const [path, ref] of Object.entries(SECRET_REFS)) {
    const envName = SECRET_ENV[ref]
    if (envName === undefined) continue
    setEnv(envName, getPath(params, path.split('.')))
  }
}

/** Python 启动钩子：把 `_CRED` 映射回上游标准名，并补上生图后端。 */
function writePythonBridge() {
  const file = join(pythonRoot, 'sitecustomize.py')
  const source = [
    '# 由 dsh-zrwang-plugin 生成：把插件注入的 _CRED 变量映射回上游脚本认的名字。',
    'import os as _os',
    '',
    '_MAP = {',
    "    'ZRWANG_IMAGE_CRED': ('OPENAI_API_KEY', 'OPENROUTER_API_KEY'),",
    "    'ZRWANG_OCR_CRED': ('PADDLE_OCR_TOKEN',),",
    "    'ZRWANG_NCBI_CRED': ('NCBI_API_KEY',),",
    "    'ZRWANG_FIRECRAWL_CRED': ('FIRECRAWL_API_KEY',),",
    "    'ZRWANG_PEXELS_CRED': ('PEXELS_API_KEY',),",
    "    'ZRWANG_PIXABAY_CRED': ('PIXABAY_API_KEY',),",
    "    'ZRWANG_OPENALEX_CRED': ('OPENALEX_API_KEY',),",
    "    'ZRWANG_ELSEVIER_CRED': ('ELSEVIER_API_KEY',),",
    "    'ZRWANG_ELSEVIER_INST_CRED': ('ELSEVIER_INSTTOKEN',),",
    "    'ZRWANG_ELSEVIER_AUTH_CRED': ('ELSEVIER_AUTHTOKEN',),",
    "    'ZRWANG_SPRINGER_FULLTEXT_CRED': ('SPRINGER_FULLTEXT_API_KEY',),",
    "    'ZRWANG_SPRINGER_OA_CRED': ('SPRINGER_OA_API_KEY',),",
    "    'ZRWANG_SPRINGER_METADATA_CRED': ('SPRINGER_METADATA_API_KEY',),",
    "    'ZRWANG_IEEE_CRED': ('IEEE_API_KEY',),",
    "    'ZRWANG_PATENT_EMBEDDING_CRED': ('ZHIPUAI_API_KEY', 'DASHSCOPE_API_KEY', 'OPENAI_API_KEY'),",
    '}',
    '',
    '',
    'def _apply_plugin_credentials():',
    "    qwen = _os.environ.get('ZRWANG_IMAGE_BACKEND') == 'qwen'",
    '    for source, targets in _MAP.items():',
    '        value = _os.environ.get(source)',
    "        if not (isinstance(value, str) and value.strip()):",
    '            continue',
    "        if qwen and source == 'ZRWANG_IMAGE_CRED':",
    "            targets = tuple(t for t in targets if not (t.startswith('OPENAI') or t.startswith('OPENROUTER'))) + ('QWEN_API_KEY',)",
    '        for name in targets:',
    '            if not _os.environ.get(name):',
    '                _os.environ[name] = value.strip()',
    "    if qwen and _os.environ.get('QWEN_API_KEY'):",
    "        _os.environ.setdefault('IMAGE_BACKEND', 'qwen')",
    "    elif _os.environ.get('OPENAI_API_KEY'):",
    "        _os.environ.setdefault('IMAGE_BACKEND', 'openai')",
    "        _os.environ.setdefault('OPENAI_QUALITY', 'omit')",
    '',
    '',
    '_apply_plugin_credentials()',
    '',
  ].join('\n')
  mkdirSync(pythonRoot, { recursive: true, mode: 0o700 })
  writeFileSync(file, source, { encoding: 'utf8', mode: 0o600 })
  const parts = String(process.env.PYTHONPATH ?? '').split(delimiter).filter(part => part.length > 0 && part !== pythonRoot)
  process.env.PYTHONPATH = [pythonRoot, ...parts].join(delimiter)
}

function writeShim(name, target, { executable = false } = {}) {
  const dir = shimRoot()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  // Windows 同时写 .cmd（PowerShell/cmd）与无扩展名 sh 脚本（Git Bash）；
  // 只写 .cmd 时，bash 里的 `python` 找不到转发脚本。
  const files = process.platform === 'win32' ? [`${name}.cmd`, name] : [name]
  for (const file of files) {
    const full = join(dir, file)
    const content = file.endsWith('.cmd')
      ? shimContent('cmd', target, 'win32')
      : shimContent('sh', target, process.platform === 'win32' ? 'linux' : process.platform)
    writeFileSync(full, content, { encoding: 'utf8', mode: executable ? 0o755 : 0o644 })
    if (executable && process.platform !== 'win32') chmodSync(full, 0o755)
  }
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

function applyPythonAndBash(params) {
  const python = resolvePython(params)
  if (python.path.length > 0) {
    for (const name of ['python', 'python3']) writeShim(name, python.path, { executable: true })
    const bashEnv = join(shimRoot(), 'bash-env.sh')
    writeFileSync(
      bashEnv,
      `python() { "${python.path.replace(/\\/g, '/')}" "$@"; }\npython3() { "${python.path.replace(/\\/g, '/')}" "$@"; }\n`,
      'utf8',
    )
    process.env.BASH_ENV = bashEnv.replace(/\\/g, '/')
    process.env.ZRWANG_SKILL_PYTHON = python.path
  } else {
    for (const name of ['python', 'python3', 'python.cmd', 'python3.cmd']) {
      rmSync(join(shimRoot(), name), { force: true })
    }
    delete process.env.BASH_ENV
    delete process.env.ZRWANG_SKILL_PYTHON
  }
  const bash = resolveBash()
  if (bash !== undefined) {
    for (const name of ['bash', 'sh']) writeShim(name, bash, { executable: true })
    process.env.ZRWANG_GIT_BASH = bash
  } else {
    for (const name of ['bash', 'sh', 'bash.cmd', 'sh.cmd']) rmSync(join(shimRoot(), name), { force: true })
    delete process.env.ZRWANG_GIT_BASH
  }
  prependShim()
  return python
}

/** Firecrawl CLI 的 shim：把 `_CRED` 映射成 FIRECRAWL_API_KEY 后调用真实 CLI。 */
function applyFirecrawlShim() {
  const real = which('firecrawl')
  const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'firecrawl-shim.mjs')
  const launcherCandidates = real === undefined
    ? []
    : [join(dirname(real), 'node_modules', 'firecrawl-cli', 'dist', 'launcher.js'), join(dirname(real), '..', 'node_modules', 'firecrawl-cli', 'dist', 'launcher.js')]
  const launcher = launcherCandidates.find(existsSync)
  const shimCmd = join(shimRoot(), 'firecrawl.cmd')
  const shimSh = join(shimRoot(), 'firecrawl')
  if (launcher === undefined || !existsSync(script)) {
    rmSync(shimCmd, { force: true })
    rmSync(shimSh, { force: true })
    return
  }
  const node = process.execPath
  writeFileSync(shimCmd, `@echo off\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${node}" "${script}" "${launcher}" %*\r\n`, 'utf8')
  writeFileSync(shimSh, `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec "${node.replace(/\\/g, '/')}" "${script.replace(/\\/g, '/')}" "${launcher.replace(/\\/g, '/')}" "$@"\n`, 'utf8')
  chmodSync(shimSh, 0o755)
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
    }
  }
  mkdirSync(cacheRoot(), { recursive: true, mode: 0o700 })
  setEnv('ZRWANG_PLUGIN_CACHE', cacheRoot())
  setEnv('LIT_DL_SCHOOL_FILE', join(SKILLS_DIR, 'research', 'nature-skills', 'nature-downloader', 'config', 'school.json'))
  setEnv('ARCHIFY_UPDATE_CHECK_DISABLED', '1')
  setEnv('PYTHONUTF8', '1')
  setEnv('PYTHONIOENCODING', 'utf-8')
  setEnv('PATENT_OA_HOME', join(cacheRoot(), 'artifacts', 'patent', 'oa'))
  setEnv('PATENT_MAP_HOME', join(cacheRoot(), 'artifacts', 'patent', 'patent-map'))
  applyImageEnv(params)
  applyResearchEnv(params)
  applyPatentEnv(params)
  applySecretEnv(params)
  writePythonBridge()
  const python = applyPythonAndBash(params)
  applyFirecrawlShim()
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
  removeShim()
  if (previous.PATH === undefined) delete process.env[pathKey(process.env)]
  else process.env[pathKey(process.env)] = previous.PATH
  for (const [name, value] of [['BASH_ENV', previous.BASH_ENV], ['PYTHONPATH', previous.PYTHONPATH]]) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  for (const key of MANAGED_KEYS) delete process.env[key]
  previous = null
  appliedSignature = ''
}
