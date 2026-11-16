/**
 * My DSH 设置的“参数层”。
 *
 * 设计原则（v3）：
 *   - 模型服务只有生图模型（URL / 模型 / API Key）与 OCR；
 *   - 科研服务放可选检索与 Nature 学术检索；
 *   - 运行环境只展示组件状态；
 *   - 不再兼容上游 .env / 旧配置文件；所有生成配置集中到 DSH 家目录的
 *     zrwang-plugin-config，技能通过环境变量读取；
 *   - Python 不自带、不安装：只检测本机解释器，用户在设置页选择并只读校验依赖。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { execFile, execFileSync, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { PKG_DIR, SKILLS_DIR, STATE_DIR } from './config.mjs'
import { indexedSkills } from './catalog.mjs'
import { backupFile } from './state.mjs'
import { configDirOfParams, readParams, writeParams } from './plugin-params.mjs'
import { checkMcp, MATLAB_MCP_EXE } from './mcp.mjs'
import { applyRuntimeEnv, checkArsDeps, readDepsResult, resolvePython, writeArsRuntimeNotes } from './ars.mjs'
import { DEPENDENCIES, detectPythons, probePython, readPythonCandidates } from './python-detect.mjs'

const execFileAsync = promisify(execFile)
const IMAGE_DEFAULTS = { baseUrl: '', model: '', apiKey: '' }

const ACADEMIC_FIELDS = [
  { id: 'pubmed.email', label: 'PubMed 联系邮箱', keys: ['pubmed', 'email'], help: 'NCBI 要求填写邮箱，可提高访问配额', getKeyUrl: 'https://account.ncbi.nlm.nih.gov/settings/', linkLabel: 'NCBI 账户' },
  { id: 'pubmed.apiKey', label: 'PubMed API Key', keys: ['pubmed', 'apiKey'], secret: true, help: '可选，能提高请求频率', getKeyUrl: 'https://account.ncbi.nlm.nih.gov/settings/', linkLabel: '申请 API Key' },
  { id: 'unpaywall.email', label: 'Unpaywall 联系邮箱', keys: ['unpaywall', 'email'], help: 'Nature 文献下载查询开放获取用；留空则复用 PubMed 邮箱', getKeyUrl: 'https://unpaywall.org/products/api', linkLabel: 'Unpaywall 说明' },
  { id: 'crossref.mailto', label: 'Crossref 联系邮箱', keys: ['crossref', 'mailto'], help: '可选，用于礼貌访问', getKeyUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/', linkLabel: 'Crossref 说明' },
]

const IMAGE2PPT_FIELDS = [
  { id: 'paddleOcrToken', label: '百度 OCR Token', secret: true, required: true, getKeyUrl: 'https://aistudio.baidu.com/account/accessToken', linkLabel: '获取 Token' },
]

const OPTIONAL_FIELDS = [
  { id: 'pexelsApiKey', label: 'Pexels API Key', secret: true, help: '可选；PPT Master 素材检索用，不填也能用 Wikimedia/Openverse', getKeyUrl: 'https://www.pexels.com/api/new/', linkLabel: '申请 Key' },
  { id: 'pixabayApiKey', label: 'Pixabay API Key', secret: true, help: '可选；PPT Master 素材检索用', getKeyUrl: 'https://pixabay.com/api/docs/', linkLabel: '查看 API Key' },
  { id: 'openAlexApiKey', label: 'OpenAlex API Key', secret: true, help: '可选；Nature 学术检索 / OpenAlex 用', getKeyUrl: 'https://openalex.org/settings/api', linkLabel: '申请 Key' },
  { id: 'firecrawlApiKey', label: 'Firecrawl API Key', secret: true, help: '可选；nature-citation 读取需 JS 的出版社页面时用', getKeyUrl: 'https://www.firecrawl.dev/app/api-keys', linkLabel: '申请 Key' },
]

/** Nature 文献下载的出版社凭据（写入 credentials.json）。 */
const DOWNLOADER_FIELDS = [
  { id: 'elsevier.apiKey', label: 'Elsevier API Key', keys: ['elsevier', 'apiKey'], secret: true, getKeyUrl: 'https://dev.elsevier.com/', linkLabel: '申请 Key' },
  { id: 'elsevier.instToken', label: 'Elsevier InstToken', keys: ['elsevier', 'instToken'], secret: true, help: '机构订阅才需要，可选', getKeyUrl: 'https://dev.elsevier.com/', linkLabel: 'Elsevier 说明' },
  { id: 'elsevier.authToken', label: 'Elsevier AuthToken', keys: ['elsevier', 'authToken'], secret: true, help: '部分机构网关需要，可选', getKeyUrl: 'https://dev.elsevier.com/', linkLabel: 'Elsevier 说明' },
  { id: 'springer.fulltextApiKey', label: 'Springer Nature Full Text Key', keys: ['springer', 'fulltextApiKey'], secret: true, getKeyUrl: 'https://dev.springernature.com/docs/quick-start/api-access/', linkLabel: '申请 Key' },
  { id: 'springer.openaccessApiKey', label: 'Springer Nature OA Key', keys: ['springer', 'openaccessApiKey'], secret: true, help: 'Open Access API，可选', getKeyUrl: 'https://dev.springernature.com/docs/quick-start/api-access/', linkLabel: '申请 Key' },
  { id: 'springer.metadataApiKey', label: 'Springer Nature Metadata Key', keys: ['springer', 'metadataApiKey'], secret: true, help: 'Meta API，可选', getKeyUrl: 'https://dev.springernature.com/docs/quick-start/api-access/', linkLabel: '申请 Key' },
  { id: 'ieee.apiKey', label: 'IEEE Xplore API Key', keys: ['ieee', 'apiKey'], secret: true, getKeyUrl: 'https://developer.ieee.org/member/register', linkLabel: '申请 Key' },
  { id: 'ieee.fulltextEndpoint', label: 'IEEE Full Text Endpoint', keys: ['ieee', 'fulltextEndpoint'], help: 'IEEE 全文接口模板，通常包含 {doi}；只填 Metadata Key 不能下载全文', getKeyUrl: 'https://developer.ieee.org/docs/', linkLabel: 'IEEE 文档' },
]

function expansion(catalog, skillName) {
  const node = indexedSkills(catalog).get(skillName)
  if (node === undefined) throw new Error(`目录树里没有技能：${skillName}`)
  return join(SKILLS_DIR, ...String(node.dir).split('/'))
}

function getNested(object, keys) {
  let current = object
  for (const key of keys) {
    if (current === undefined || current === null) return ''
    current = current[key]
  }
  return current === undefined || current === null ? '' : String(current)
}

function setNested(object, keys, value) {
  let current = object
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index]
    if (typeof current[key] !== 'object' || current[key] === null) current[key] = {}
    current = current[key]
  }
  current[keys[keys.length - 1]] = value
}

function maskField(field, value) {
  const textValue = value === undefined || value === null ? '' : String(value)
  const hasValue = textValue.length > 0
  const base = {
    id: field.id,
    label: field.label,
    help: field.help,
    required: field.required === true,
    control: field.control,
    options: field.options,
    getKeyUrl: field.getKeyUrl,
    linkLabel: field.linkLabel,
  }
  if (field.secret === true) {
    return { ...base, secret: true, value: '', hasValue, placeholder: hasValue ? '留空使用已保存凭据' : '未设置' }
  }
  return { ...base, value: textValue }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function imageValues(params) {
  const image = params?.image ?? {}
  return {
    baseUrl: text(image.baseUrl),
    model: text(image.model),
    apiKey: text(image.apiKey),
  }
}

function imageConfigured(params) {
  const image = imageValues(params)
  return image.apiKey.length > 0 && image.model.length > 0
}

function paramsDefaults() {
  return {
    image: { ...IMAGE_DEFAULTS },
    natureAcademic: {
      pubmed: { email: '', apiKey: '', cacheDir: '~/.cache/academic-search' },
      unpaywall: { email: '' },
      crossref: { mailto: '' },
    },
    natureDownloader: {
      elsevier: { apiKey: '', instToken: '', authToken: '' },
      springer: { fulltextApiKey: '', openaccessApiKey: '', metadataApiKey: '' },
      ieee: { apiKey: '', fulltextEndpoint: '' },
    },
    natureImage2ppt: { paddleOcrToken: '' },
    optional: { pexelsApiKey: '', pixabayApiKey: '', openAlexApiKey: '', firecrawlApiKey: '' },
    // 系统 Python：留空=自动用检测到的第一个可用解释器；填完整路径=强制使用它。
    python: { path: '' },
  }
}

function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

/** 把技能自己写的 credentials/settings 文件同步进设置视图，避免设置页把它们覆盖成空。 */
function syncDownloaderFiles(downloader, configDir) {
  const dir = join(configDir, 'nature-downloader')
  const credentials = readJsonFile(join(dir, 'credentials.json'))
  const elsevier = credentials.elsevier ?? {}
  const springer = credentials.springer_nature ?? {}
  const ieee = credentials.ieee ?? {}
  if (!text(downloader.elsevier?.apiKey)) downloader.elsevier.apiKey = text(elsevier.api_key)
  if (!text(downloader.elsevier?.instToken)) downloader.elsevier.instToken = text(elsevier.insttoken)
  if (!text(downloader.elsevier?.authToken)) downloader.elsevier.authToken = text(elsevier.authtoken)
  if (!text(downloader.springer?.fulltextApiKey)) downloader.springer.fulltextApiKey = text(springer.fulltext_api_key || springer.api_key)
  if (!text(downloader.springer?.openaccessApiKey)) downloader.springer.openaccessApiKey = text(springer.openaccess_api_key)
  if (!text(downloader.springer?.metadataApiKey)) downloader.springer.metadataApiKey = text(springer.metadata_api_key)
  if (!text(downloader.ieee?.apiKey)) downloader.ieee.apiKey = text(ieee.api_key)
  if (!text(downloader.ieee?.fulltextEndpoint)) downloader.ieee.fulltextEndpoint = text(ieee.fulltext_endpoint)

  const settings = readJsonFile(join(dir, 'settings.json'))
  return text(settings?.open_access?.contact_email)
}

/** 旧 v1 设置迁移：pptMaster.providers → image；没有 providers 时保持空，不填任何厂商默认模型。 */
function migrateImage(stored, defaults) {
  const image = { ...defaults.image, ...(typeof stored?.image === 'object' && stored.image !== null ? stored.image : {}) }
  if (typeof stored?.image !== 'object' || stored.image === null) {
    const legacy = stored?.pptMaster ?? {}
    const providers = legacy.providers
    if (providers !== undefined && providers !== null) {
      const backend = typeof legacy.backend === 'string' ? legacy.backend : 'openai'
      const entry = providers[backend] ?? {}
      image.baseUrl = text(entry.baseUrl)
      image.model = text(entry.model)
      image.apiKey = text(entry.apiKey)
    }
  }
  return image
}

export function currentParams(pluginConfig) {
  const defaults = paramsDefaults()
  const stored = readParams(pluginConfig)
  const merged = { ...defaults, ...stored }
  delete merged.configDir
  delete merged.pptMaster
  delete merged.runtime
  delete merged.ars
  merged.image = migrateImage(stored, defaults)
  merged.natureAcademic = {
    pubmed: {
      ...defaults.natureAcademic.pubmed,
      ...(stored.natureAcademic?.pubmed ?? {}),
    },
    unpaywall: { ...defaults.natureAcademic.unpaywall, ...(stored.natureAcademic?.unpaywall ?? {}) },
    crossref: { ...defaults.natureAcademic.crossref, ...(stored.natureAcademic?.crossref ?? {}) },
  }
  merged.natureDownloader = {
    elsevier: { ...defaults.natureDownloader.elsevier, ...(stored.natureDownloader?.elsevier ?? {}) },
    springer: { ...defaults.natureDownloader.springer, ...(stored.natureDownloader?.springer ?? {}) },
    ieee: { ...defaults.natureDownloader.ieee, ...(stored.natureDownloader?.ieee ?? {}) },
  }
  merged.natureImage2ppt = { ...defaults.natureImage2ppt, ...(stored.natureImage2ppt ?? {}) }
  merged.optional = { ...defaults.optional, ...(stored.optional ?? {}) }
  merged.python = { ...defaults.python, ...(stored.python ?? {}) }
  const contactEmail = syncDownloaderFiles(merged.natureDownloader, configDirOfParams(pluginConfig))
  if (!text(merged.natureAcademic.unpaywall.email) && contactEmail.length > 0) merged.natureAcademic.unpaywall.email = contactEmail
  return merged
}

// ---------------- 生成技能运行时文件 ----------------

function tomlValue(value) {
  const valueText = String(value)
  return /^-?\d+(?:\.\d+)?$/.test(valueText) ? valueText : JSON.stringify(valueText)
}

function academicToml(params) {
  const a = params.natureAcademic
  return [
    '[pubmed]',
    `email = ${tomlValue(a.pubmed.email)}`,
    `api_key = ${tomlValue(a.pubmed.apiKey)}`,
    `cache_dir = ${tomlValue(a.pubmed.cacheDir)}`,
    'cache_ttl = 86400',
    '',
    '[crossref]',
    `mailto = ${tomlValue(a.crossref.mailto)}`,
    'timeout = 15',
    '',
    '[arxiv]',
    'timeout = 30',
    '',
    '[general]',
    'default_rows = 5',
    'max_rows = 50',
    '',
  ].join('\n')
}

function image2pptYaml(params) {
  const i = params.natureImage2ppt
  const image = imageValues(params)
  const lines = [
    '# 由 dsh-zrwang-plugin 生成；参数在 zrwang-plugin-config/settings.json',
    'IMAGE2PPT_IMAGE_BACKEND: "openai-compatible-api"',
    `PADDLE_OCR_TOKEN: ${JSON.stringify(i.paddleOcrToken)}`,
  ]
  if (image.baseUrl.length > 0) lines.push(`OPENAI_BASE_URL: ${JSON.stringify(image.baseUrl)}`)
  if (image.model.length > 0) lines.push(`IMAGE2PPT_IMAGE_MODEL: ${JSON.stringify(image.model)}`)
  if (image.apiKey.length > 0) lines.push(`OPENAI_API_KEY: ${JSON.stringify(image.apiKey)}`)
  lines.push('')
  return lines.join('\n')
}

/** 本插件所有生成配置的目录（DSH 家目录下）。 */
export function skillConfigRoot(params) {
  return configDirOfParams(params)
}

export function natureAcademicConfigFile(params) {
  return join(skillConfigRoot(params), 'nature-academic-search', 'config.toml')
}

export function natureImage2pptConfigDir(params) {
  return join(skillConfigRoot(params), 'nature-image2ppt')
}

export function natureDownloaderConfigDir(params) {
  return join(skillConfigRoot(params), 'nature-downloader')
}

/** 固定北航 school.json：直接随技能目录分发，不复制到插件配置目录。 */
export function natureDownloaderSchoolFile() {
  return join(PKG_DIR, 'skills', 'research', 'nature-skills', 'nature-downloader', 'config', 'school.json')
}

export function natureFigureConfigFile(params) {
  return join(skillConfigRoot(params), 'nature-figure.json')
}

async function writeGenerated(file, content, label, backups) {
  const backup = await backupFile(file, label)
  if (backup !== undefined) backups.push(backup)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, content, 'utf8')
}

export async function mirrorSkillFiles(params) {
  const backups = []

  await writeGenerated(natureAcademicConfigFile(params), academicToml(params), 'nature-academic-config', backups)
  await writeGenerated(join(natureImage2pptConfigDir(params), 'config.yaml'), image2pptYaml(params), 'nature-image2ppt-config', backups)

  const downloaderDir = natureDownloaderConfigDir(params)
  const credentials = credentialsFromParams(params)
  if (Object.keys(credentials).length > 0) {
    await writeGenerated(join(downloaderDir, 'credentials.json'), `${JSON.stringify(credentials, null, 2)}\n`, 'nature-downloader-credentials', backups)
  }
  const downloaderSettings = downloaderSettingsFromParams(params)
  if (downloaderSettings.open_access?.contact_email) {
    await writeGenerated(join(downloaderDir, 'settings.json'), `${JSON.stringify(downloaderSettings, null, 2)}\n`, 'nature-downloader-settings', backups)
  }

  const figureConfig = natureFigureConfigFile(params)
  if (!existsSync(figureConfig)) {
    await mkdir(join(figureConfig, '..'), { recursive: true })
    await writeFile(figureConfig, `${JSON.stringify({ backend: 'python' }, null, 2)}\n`, 'utf8')
  }

  await ensureBuaaSchoolConfig()
  await writeArsRuntimeNotes(params)
  return backups
}

// ---------------- 学校访问配置（固定北航，随包分发） ----------------

/** 随技能目录分发的北航配置；不在设置页暴露。 */
function packagedSchoolConfig() {
  const value = readJsonFile(natureDownloaderSchoolFile())
  if (Object.keys(value).length > 0) return value
  return {
    version: 1,
    school: { name: '北京航空航天大学', code: 'buaa', configured_at: new Date().toISOString(), source: 'preset' },
    auth: { type: 'sso', sso_domain: 'sso.buaa.edu.cn', carsi_entry: 'https://idp.buaa.edu.cn/idp/shibboleth', carsi_sp_entity_id: 'https://idp.buaa.edu.cn/idp/shibboleth' },
    proxy: { type: null, ezproxy_url: null },
    libraries: ['ScienceDirect', 'Springer', 'IEEE Xplore'],
    discovery: {
      resource_entry_url: 'https://lib.buaa.edu.cn/',
      resource_portal_url: 'https://lib.buaa.edu.cn/',
      carsi_idp: 'https://idp.buaa.edu.cn/idp/shibboleth',
    },
    notes: '北京航空航天大学：统一认证 sso.buaa.edu.cn；CARSI IdP idp.buaa.edu.cn；图书馆 lib.buaa.edu.cn',
  }
}

/** 学校配置所在目录就是技能自带的 config/ 目录。 */
export function schoolConfigDir() {
  return join(PKG_DIR, 'skills', 'research', 'nature-skills', 'nature-downloader', 'config')
}

export async function ensureBuaaSchoolConfig() {
  const file = natureDownloaderSchoolFile()
  if (!existsSync(file)) {
    mkdirSync(join(file, '..'), { recursive: true })
    await writeFile(file, `${JSON.stringify(packagedSchoolConfig(), null, 2)}\n`, 'utf8')
  }
  return join(file, '..')
}

/** 下载器的 credentials.json：把设置字段映射成上游字段，保留技能写入的其它字段。 */
export function credentialsFromParams(params) {
  const downloader = params?.natureDownloader ?? {}
  const dir = natureDownloaderConfigDir(params)
  const existing = readJsonFile(join(dir, 'credentials.json'))
  const out = { ...existing }
  const elsevier = { ...(out.elsevier ?? {}) }
  if (text(downloader.elsevier?.apiKey)) elsevier.api_key = text(downloader.elsevier.apiKey)
  if (text(downloader.elsevier?.instToken)) elsevier.insttoken = text(downloader.elsevier.instToken)
  if (text(downloader.elsevier?.authToken)) elsevier.authtoken = text(downloader.elsevier.authToken)
  if (Object.keys(elsevier).length > 0) out.elsevier = elsevier
  const springer = { ...(out.springer_nature ?? {}) }
  if (text(downloader.springer?.fulltextApiKey)) springer.fulltext_api_key = text(downloader.springer.fulltextApiKey)
  if (text(downloader.springer?.openaccessApiKey)) springer.openaccess_api_key = text(downloader.springer.openaccessApiKey)
  if (text(downloader.springer?.metadataApiKey)) springer.metadata_api_key = text(downloader.springer.metadataApiKey)
  if (Object.keys(springer).length > 0) out.springer_nature = springer
  const ieee = { ...(out.ieee ?? {}) }
  if (text(downloader.ieee?.apiKey)) ieee.api_key = text(downloader.ieee.apiKey)
  if (text(downloader.ieee?.fulltextEndpoint)) ieee.fulltext_endpoint = text(downloader.ieee.fulltextEndpoint)
  if (Object.keys(ieee).length > 0) out.ieee = ieee
  return out
}

/** 下载器的 settings.json：保存 Unpaywall / Crossref 联系邮箱。 */
export function downloaderSettingsFromParams(params) {
  const dir = natureDownloaderConfigDir(params)
  const existing = readJsonFile(join(dir, 'settings.json'))
  const contact = text(params?.natureAcademic?.unpaywall?.email) || text(params?.natureAcademic?.pubmed?.email)
  const openAccess = { ...(existing.open_access ?? {}) }
  if (contact.length > 0) openAccess.contact_email = contact
  return { ...existing, open_access: openAccess }
}

// ---------------- 状态与卡片 ----------------

const cliCache = new Map()
function cliExists(name) {
  const hit = cliCache.get(name)
  if (hit !== undefined && Date.now() - hit.at < 300_000) return hit.value
  let value
  try {
    execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { stdio: 'ignore' })
    value = true
  } catch {
    value = false
  }
  cliCache.set(name, { at: Date.now(), value })
  return value
}

function firstExisting(paths) {
  for (const path of paths) {
    if (typeof path === 'string' && path.length > 0 && existsSync(path)) return path
  }
  return undefined
}

let drawioRegistryCache

/**
 * 从 Windows 卸载注册表里找 draw.io 的 DisplayIcon。
 * 安装到非 C 盘（例如 D:\Program Files\draw.io）时，固定目录候选会漏掉。
 */
function drawioFromRegistry() {
  if (process.platform !== 'win32') return undefined
  if (drawioRegistryCache !== undefined && Date.now() - drawioRegistryCache.at < 300_000) {
    return drawioRegistryCache.value
  }
  const reg = process.env.SystemRoot === undefined
    ? 'reg.exe'
    : join(process.env.SystemRoot, 'System32', 'reg.exe')
  const hives = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]
  let found
  for (const hive of hives) {
    try {
      const output = execFileSync(reg, ['query', hive, '/s', '/f', 'draw.io', '/t', 'REG_SZ'], {
        encoding: 'utf8',
        timeout: 15_000,
        windowsHide: true,
      })
      for (const line of output.split(/\r?\n/)) {
        const match = /([A-Za-z]:[\\/][^\r\n"]*[\\/]draw\.io\.exe)(?:,\s*0)?/i.exec(line)
        if (match === null) continue
        const candidate = match[1].trim()
        if (existsSync(candidate)) {
          found = candidate
          break
        }
      }
    } catch {
      // 没有该注册表分支时继续
    }
    if (found !== undefined) break
  }
  drawioRegistryCache = { at: Date.now(), value: found }
  return found
}

export function resolveDrawio() {
  const explicit = text(process.env.DRAWIO_PATH)
  if (explicit.length > 0 && existsSync(explicit)) return explicit
  const local = process.env.LOCALAPPDATA ?? ''
  const programFiles = process.env.PROGRAMFILES ?? 'C:\\Program Files'
  return firstExisting([
    local.length > 0 ? join(local, 'Programs', 'draw.io', 'draw.io.exe') : '',
    local.length > 0 ? join(local, 'draw.io', 'draw.io.exe') : '',
    join(programFiles, 'draw.io', 'draw.io.exe'),
    drawioFromRegistry(),
  ])
}

export function resolvePolyspace() {
  const root = text(process.env.POLYSPACE_ROOT)
  if (root.length > 0 && existsSync(root)) return root
  const local = process.env.LOCALAPPDATA ?? ''
  return firstExisting([
    text(process.env.POLYSPACE_MCP_SERVER),
    local.length > 0 ? join(local, 'polyspace', 'polyspace-mcp-server.exe') : '',
  ])
}

function matlabStatus() {
  if (process.platform !== 'win32') return 'MATLAB 状态未知'
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq MATLAB.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 10_000 })
    return /MATLAB\.exe/i.test(out)
      ? '✓ MATLAB 已运行'
      : '✗ MATLAB 未运行'
  } catch {
    return 'MATLAB 状态未知'
  }
}

function statusField(id, label, value, level, help) {
  return { id, label, value, level, help, control: 'status' }
}

/** MATLAB MCP 工具箱写入的共享会话信息（%APPDATA%/MathWorks/MATLAB MCP Server/v1/sessionDetails.json）。 */
function matlabSessionDetails() {
  const appData = process.env.APPDATA
  if (appData === undefined || appData.length === 0) return undefined
  const file = join(appData, 'MathWorks', 'MATLAB MCP Server', 'v1', 'sessionDetails.json')
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

function matlabProcessIds() {
  if (process.platform !== 'win32') return []
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq MATLAB.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 10_000 })
    return [...out.matchAll(/"MATLAB\.exe","(\d+)"/gi)].map(match => Number(match[1]))
  } catch {
    return []
  }
}

function tcpListenerPid(port) {
  if (!Number.isSafeInteger(port) || port <= 0) return undefined
  try {
    const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', timeout: 10_000 })
    for (const line of out.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 5 || !/^TCP/i.test(parts[0])) continue
      const match = /:(\d+)$/.exec(parts[1])
      if (match === null || Number(match[1]) !== port) continue
      if (!/LISTEN/i.test(parts[3])) continue
      const pid = Number(parts[4])
      return Number.isSafeInteger(pid) ? pid : undefined
    }
  } catch {
    // netstat 不可用时按未监听处理
  }
  return undefined
}

/** MathWorks MCP 可用性：包内 exe + MATLAB 运行 + shareMATLABSession 写出的共享会话。 */
function matlabMcpField() {
  const label = 'MathWorks MCP'
  if (!existsSync(MATLAB_MCP_EXE)) return statusField('mcp-mathworks', label, '不可用：缺少 matlab-mcp 可执行文件', 'bad')
  const pids = matlabProcessIds()
  if (pids.length === 0) return statusField('mcp-mathworks', label, '不可用：MATLAB 未运行', 'bad')
  const details = matlabSessionDetails()
  if (details === undefined) return statusField('mcp-mathworks', label, '不可用：MATLAB 已运行，但未共享会话', 'warn', '在 MATLAB 里执行 shareMATLABSession() 后再检查')
  const port = Number(details.port)
  const pid = Number(details.pid)
  if (!Number.isSafeInteger(pid) || !pids.includes(pid)) {
    return statusField('mcp-mathworks', label, '不可用：共享会话已失效', 'warn', '重新执行 shareMATLABSession()')
  }
  if (tcpListenerPid(port) === undefined) {
    return statusField('mcp-mathworks', label, '不可用：共享会话未监听', 'warn', '重新执行 shareMATLABSession()')
  }
  return statusField('mcp-mathworks', label, '可用：MATLAB 已共享会话', 'ok', `共享会话端口 ${port}`)
}

/** Windows MCP 可用性：只看本机是否装了 windows-mcp 命令。 */
function windowsMcpField() {
  const label = 'Windows MCP'
  const probe = process.platform === 'win32' ? 'where.exe' : 'which'
  try {
    const out = execFileSync(probe, ['windows-mcp'], { encoding: 'utf8', timeout: 10_000, windowsHide: true }).trim()
    const first = out.split(/\r?\n/).map(line => line.trim()).filter(Boolean)[0]
    return statusField('mcp-windows', label, '可用：已安装', 'ok', first)
  } catch {
    return statusField('mcp-windows', label, '不可用：未安装', 'bad', 'PATH 里没有 windows-mcp，安装后重新检查')
  }
}

function cliStatusField(id, label, command, args) {
  const read = (file, argv) => execFileSync(file, argv, { encoding: 'utf8', timeout: 15_000, windowsHide: true, shell: false }).trim()
  let output = ''
  try {
    output = read(command, args)
  } catch {
    // npm 全局命令在 Windows 上常是 .cmd/.ps1，execFile 直接跑不到，回退到 cmd /c（固定命令名，无注入）
    if (process.platform !== 'win32') return statusField(id, label, '未找到', 'bad')
    try {
      output = read(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `${command} ${args.join(' ')}`])
    } catch {
      return statusField(id, label, '未找到', 'bad')
    }
  }
  return statusField(id, label, output.split(/\r?\n/)[0] || '已安装', 'ok')
}

function environmentRows(params, mcpStatus) {
  const drawio = resolveDrawio()
  const polyspace = resolvePolyspace()
  const matlab = matlabStatus()
  const matlabLevel = matlab.startsWith('✓') ? 'ok' : matlab.startsWith('✗') ? 'bad' : 'idle'
  return [
    cliStatusField('officecli', 'officecli', 'officecli', ['--version']),
    (() => {
      try {
        const output = execFileSync('zotero-cli', ['config'], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
        return /ZOTERO_LOCAL=true/.test(output)
          ? statusField('zotero-cli', 'zotero-cli', '本地 API', 'ok')
          : statusField('zotero-cli', 'zotero-cli', '配置异常（需要 ZOTERO_LOCAL=true）', 'bad')
      } catch {
        return statusField('zotero-cli', 'zotero-cli', '未找到', 'bad')
      }
    })(),
    cliStatusField('lark-cli', 'lark-cli', 'lark-cli', ['--version']),
    statusField('drawio', 'draw.io', drawio === undefined ? '未安装（drawio-reconstruction 置灰）' : String(drawio), drawio === undefined ? 'bad' : 'ok'),
    statusField('polyspace', 'Polyspace', polyspace === undefined ? '未安装（19 个技能置灰）' : String(polyspace), polyspace === undefined ? 'bad' : 'ok'),
    statusField('matlab', 'MATLAB', matlab.replace(/^[✓✗]\s*/, ''), matlabLevel),
    matlabMcpField(),
    windowsMcpField(),
  ]
}

let blockedCache = { signature: '', at: 0, value: {} }

/** 返回不可注入的技能 → 原因。 */
export async function blockedSkills(catalog, params) {
  const image = imageValues(params)
  const ocr = text(params?.natureImage2ppt?.paddleOcrToken)
  const drawio = resolveDrawio()
  const polyspace = resolvePolyspace()
  const signature = [
    image.apiKey.length > 0 ? 1 : 0,
    image.model.length > 0 ? 1 : 0,
    ocr.length > 0 ? 1 : 0,
    drawio === undefined ? 0 : 1,
    polyspace === undefined ? 0 : 1,
    configDirOfParams(params),
  ].join('|')
  if (blockedCache.signature === signature && Date.now() - blockedCache.at < 3_000) return blockedCache.value
  const blocked = {}
  if (!imageConfigured(params)) blocked['ppt-master'] = '未配置生图模型（设置 → 模型服务 → 生图模型：URL、模型、API Key）'
  if (!imageConfigured(params) || ocr.length === 0) blocked['nature-image2ppt'] = '未配置生图模型或百度 OCR Token'
  await ensureBuaaSchoolConfig()
  if (!cliExists('officecli')) blocked['officecli'] = '本机未找到 officecli 命令'
  for (const name of ['officecli-academic-paper', 'officecli-data-dashboard', 'officecli-docx', 'officecli-financial-model', 'officecli-pitch-deck', 'officecli-pptx', 'officecli-word-form', 'officecli-xlsx', 'morph-ppt', 'morph-ppt-3d']) {
    if (blocked.officecli !== undefined) blocked[name] = blocked.officecli
  }
  if (!cliExists('zotero-cli')) blocked['zotero-cli'] = '本机未找到 zotero-cli 命令'
  if (!cliExists('lark-cli')) {
    for (const [name, node] of Object.entries(catalog.skills ?? {})) {
      if (String(node.dir ?? '').startsWith('office/lark/')) {
        blocked[name] = '本机未找到 lark-cli 命令（npm i -g @larksuite/cli 并 lark-cli auth login）'
      }
    }
  }
  if (drawio === undefined) blocked['drawio-reconstruction'] = '本机未找到 draw.io 桌面版；安装后可设 DRAWIO_PATH'
  if (polyspace === undefined) {
    for (const [name, node] of Object.entries(catalog.skills ?? {})) {
      if (String(node.group ?? '').split('/').includes('polyspace')) blocked[name] = '本机未安装 Polyspace / 未注册 Polyspace MCP 服务器'
    }
  }
  blockedCache = { signature, at: Date.now(), value: blocked }
  return blocked
}

/** 已检测 Python 的下拉选项；未检测时只有“自动”。 */
function pythonOptions(params) {
  const selected = text(params?.python?.path)
  let cached = readPythonCandidates()
  if (cached === undefined) {
    try {
      cached = detectPythons()
    } catch {
      cached = undefined
    }
  }
  const options = [{ value: '', label: '自动选择（第一个可用）' }]
  for (const item of cached?.candidates ?? []) {
    const deps = item.ok === false ? '无法运行' : item.missing.length === 0 ? '依赖齐全' : `缺 ${item.missing.length} 个模块`
    options.push({ value: item.path, label: `${item.version || '?'} · ${deps} · ${item.path}` })
  }
  if (selected.length > 0 && !options.some(option => option.value === selected)) {
    options.push({ value: selected, label: `当前设置（未检测）：${selected}` })
  }
  return options
}

/** 设置页要展示的卡片。 */
export async function settingsCards(catalog, params, mcpStatus) {
  void catalog
  const configDir = configDirOfParams(params)
  const image = imageValues(params)
  const optional = params.optional ?? {}
  return {
    configDir,
    cards: [
      {
        id: 'image',
        title: '生图模型',
        page: 'models',
        kind: 'fields',
        fields: [
          maskField({ id: 'baseUrl', label: '接口地址（URL）', help: '填到 /v1 为止，例如 https://api.openai.com/v1；任意 OpenAI Images 兼容端点均可' }, image.baseUrl),
          maskField({ id: 'model', label: '模型', help: '原样传给服务端，例如 gpt-image-2 / flux-1.1-pro / 你的网关模型名' }, image.model),
          maskField({ id: 'apiKey', label: 'API Key', secret: true, help: '由插件注入进程环境，不写任何上游 .env' }, image.apiKey),
        ],
        actions: [{ id: 'image-check', label: '检查配置' }],
      },
      {
        id: 'nature-image2ppt',
        title: 'OCR 模型',
        page: 'models',
        kind: 'fields',
        fields: IMAGE2PPT_FIELDS.map(field => maskField(field, params.natureImage2ppt[field.id] ?? '')),
        actions: [{ id: 'image2ppt-check', label: '检查 OCR 与生图' }],
      },
      {
        id: 'optional-search',
        title: '可选检索服务',
        page: 'research',
        kind: 'fields',
        autoSave: true,
        fields: OPTIONAL_FIELDS.map(field => maskField(field, optional[field.id] ?? '')),
      },
      {
        id: 'nature-academic-search',
        title: 'Nature 学术检索',
        page: 'research',
        kind: 'fields',
        autoSave: true,
        fields: ACADEMIC_FIELDS.map(field => maskField(field, getNested(params.natureAcademic, field.keys))),
      },
      {
        id: 'nature-downloader',
        title: 'Nature 文献下载凭据',
        page: 'research',
        kind: 'fields',
        autoSave: true,
        fields: DOWNLOADER_FIELDS.map(field => maskField(field, getNested(params.natureDownloader, field.keys))),
      },
      {
        id: 'runtime',
        title: '',
        page: 'runtime',
        kind: 'fields',
        actionsPosition: 'top',
        fields: [
          {
            id: 'python',
            label: 'Python 解释器',
            control: 'inline-select',
            options: pythonOptions(params),
            value: text(params.python?.path),
          },
          ...environmentRows(params, mcpStatus),
        ],
        actions: [{ id: 'runtime-check', label: '检查运行环境' }],
      },
    ],
  }
}

/** 需要写进子进程环境的配置。 */
function applyValue(env, name, value) {
  const textValue = typeof value === 'string' ? value.trim() : ''
  if (textValue.length > 0) env[name] = textValue
  else delete env[name]
}

/** Nature 生图 endpoint：统一复用模型服务的生图 URL，不单独设配置。 */
function natureFigureEndpoint(baseUrl) {
  const clean = text(baseUrl).replace(/\/+$/, '')
  if (clean.length === 0) return 'https://api.openai.com/v1/images/generations'
  if (/openrouter\.ai/i.test(clean)) return `${clean}/images`
  if (/\/images(?:\/generations)?$/i.test(clean)) return clean
  return `${clean}/images/generations`
}

/** 科研服务相关环境变量（学术检索、下载、Nature 生图复用模型服务）。 */
function applyResearchEnv(env, params, image) {
  const academic = params?.natureAcademic ?? {}
  const optional = params?.optional ?? {}
  const pubmed = academic.pubmed ?? {}
  const contact = text(academic.unpaywall?.email) || text(pubmed.email)
  applyValue(env, 'PEXELS_API_KEY', optional.pexelsApiKey)
  applyValue(env, 'PIXABAY_API_KEY', optional.pixabayApiKey)
  applyValue(env, 'OPENALEX_API_KEY', optional.openAlexApiKey)
  applyValue(env, 'FIRECRAWL_API_KEY', optional.firecrawlApiKey)
  applyValue(env, 'NCBI_EMAIL', pubmed.email)
  applyValue(env, 'NCBI_API_KEY', pubmed.apiKey)
  applyValue(env, 'UNPAYWALL_EMAIL', contact)
  applyValue(env, 'CROSSREF_MAILTO', text(academic.crossref?.mailto) || text(pubmed.email) || contact)
  applyValue(env, 'OPENROUTER_API_KEY', image.apiKey)
  applyValue(env, 'OPENROUTER_IMAGE_MODEL', image.model)
  applyValue(env, 'SCHEMATIC_IMAGE_API_URL', natureFigureEndpoint(image.baseUrl))
}

/** 把配置写进 process.env（模型执行 shell 时子进程继承）。 */
export function applySkillEnv(params) {
  const root = configDirOfParams(params)
  const image = imageValues(params)
  process.env.ZRWANG_PLUGIN_CONFIG_DIR = root
  process.env.LIT_DL_CONFIG_DIR = natureDownloaderConfigDir(params)
  process.env.LIT_DL_SCHOOL_FILE = natureDownloaderSchoolFile()
  process.env.IMAGE2PPT_CONFIG_HOME = natureImage2pptConfigDir(params)
  process.env.ZRWANG_NATURE_ACADEMIC_CONFIG = natureAcademicConfigFile(params)
  process.env.NATURE_FIGURE_CONFIG = natureFigureConfigFile(params)
  process.env.ARCHIFY_UPDATE_CHECK_DISABLED = '1'
  applyValue(process.env, 'ZRWANG_IMAGE_BASE_URL', image.baseUrl)
  applyValue(process.env, 'ZRWANG_IMAGE_MODEL', image.model)
  applyValue(process.env, 'ZRWANG_IMAGE_API_KEY', image.apiKey)
  applyResearchEnv(process.env, params, image)
  const patentRoot = join(root, 'patent')
  if (!process.env.PATENT_OA_HOME) process.env.PATENT_OA_HOME = join(patentRoot, 'oa')
  if (!process.env.PATENT_MAP_HOME) process.env.PATENT_MAP_HOME = join(patentRoot, 'patent-map')
  applyRuntimeEnv(params, { settingsFile: join(root, 'settings.json') })
  applyPythonSecretBridge(params)
}

/**
 * DSH 的 shell 子进程会按变量名清洗 KEY、TOKEN、SECRET、PASSWORD 类变量，
 * 插件注入的密钥到不了模型执行的 shell。这里生成一个 sitecustomize.py，
 * 让技能用的 Python 进程在启动时从插件 settings.json 把密钥补回 os.environ；
 * 密钥不经过 shell 环境，也不需要给每个上游脚本单独打补丁。
 */
function applyPythonSecretBridge(params) {
  const siteDir = join(STATE_DIR, 'python')
  const settingsFile = join(configDirOfParams(params), 'settings.json')
  const python = [
    '# 由 dsh-zrwang-plugin 生成；DSH shell 会清洗 *KEY* 等变量名，这里从插件配置补回。',
    'import json as _json',
    'import os as _os',
    '',
    `_CONFIG = ${JSON.stringify(settingsFile)}`,
    '',
    '',
    'def _apply_plugin_secrets():',
    '    try:',
    "        with open(_CONFIG, 'r', encoding='utf-8') as _fh:",
    '            _data = _json.load(_fh) or {}',
    '    except Exception:',
    '        return',
    "    _image = _data.get('image') or {}",
    "    _optional = _data.get('optional') or {}",
    "    _academic = _data.get('natureAcademic') or {}",
    "    _pubmed = _academic.get('pubmed') or {}",
    '    _values = {',
    "        'ZRWANG_IMAGE_BASE_URL': _image.get('baseUrl'),",
    "        'ZRWANG_IMAGE_MODEL': _image.get('model'),",
    "        'ZRWANG_IMAGE_API_KEY': _image.get('apiKey'),",
    "        'OPENAI_API_KEY': _image.get('apiKey'),",
    "        'OPENROUTER_API_KEY': _image.get('apiKey'),",
    "        'OPENROUTER_IMAGE_MODEL': _image.get('model'),",
    "        'PEXELS_API_KEY': _optional.get('pexelsApiKey'),",
    "        'PIXABAY_API_KEY': _optional.get('pixabayApiKey'),",
    "        'OPENALEX_API_KEY': _optional.get('openAlexApiKey'),",
    "        'FIRECRAWL_API_KEY': _optional.get('firecrawlApiKey'),",
    "        'NCBI_API_KEY': _pubmed.get('apiKey'),",
    '    }',
    '    for _name, _value in _values.items():',
    '        if isinstance(_value, str) and _value.strip() and not _os.environ.get(_name):',
    '            _os.environ[_name] = _value.strip()',
    "    if _image.get('baseUrl') and not _os.environ.get('OPENAI_BASE_URL'):",
    "        _os.environ['OPENAI_BASE_URL'] = str(_image.get('baseUrl')).strip()",
    "    if _image.get('model') and not _os.environ.get('OPENAI_MODEL'):",
    "        _os.environ['OPENAI_MODEL'] = str(_image.get('model')).strip()",
    "    if _os.environ.get('OPENAI_API_KEY') or _os.environ.get('ZRWANG_IMAGE_API_KEY'):",
    "        _os.environ.setdefault('IMAGE_BACKEND', 'openai')",
    "        _os.environ.setdefault('OPENAI_QUALITY', 'omit')",
    '',
    '',
    '_apply_plugin_secrets()',
    '',
  ].join('\n')
  try {
    mkdirSync(siteDir, { recursive: true })
    writeFileSync(join(siteDir, 'sitecustomize.py'), python, { encoding: 'utf8', mode: 0o600 })
    prependPythonPath(process.env, siteDir)
  } catch {
    // 状态目录不可写时忽略；PPT 生图等脚本仍有各自的文件兜底
  }
}

function prependPythonPath(env, siteDir) {
  const parts = String(env.PYTHONPATH ?? '').split(delimiter).filter(part => part.length > 0 && part !== siteDir)
  env.PYTHONPATH = [siteDir, ...parts].join(delimiter)
}

/** 设置页「检查依赖」按钮：跑一次探测并把结果挂回设置负载。 */
export async function checkArsDependencies(pluginConfig) {
  const params = currentParams(pluginConfig)
  return checkArsDeps(params)
}

// ---------------- 设置页检查动作 ----------------

function pythonEnv(params) {
  const env = { ...process.env }
  try {
    prependPythonPath(env, join(STATE_DIR, 'python'))
  } catch {
    // 忽略
  }
  const image = imageValues(params)
  applyValue(env, 'ZRWANG_IMAGE_BASE_URL', image.baseUrl)
  applyValue(env, 'ZRWANG_IMAGE_MODEL', image.model)
  applyValue(env, 'ZRWANG_IMAGE_API_KEY', image.apiKey)
  applyResearchEnv(env, params, image)
  env.ZRWANG_PLUGIN_CONFIG_DIR = configDirOfParams(params)
  env.IMAGE2PPT_CONFIG_HOME = natureImage2pptConfigDir(params)
  env.ZRWANG_NATURE_ACADEMIC_CONFIG = natureAcademicConfigFile(params)
  env.LIT_DL_CONFIG_DIR = natureDownloaderConfigDir(params)
  env.LIT_DL_SCHOOL_FILE = natureDownloaderSchoolFile()
  env.NATURE_FIGURE_CONFIG = natureFigureConfigFile(params)
  return env
}

async function runPython(params, args, cwd, timeout = 60_000) {
  const python = resolvePython(params)
  if (python.path.length === 0) throw new Error('未选择可用的系统 Python（设置 → 运行环境 → Python 解释器）')
  const result = await execFileAsync(python.path, args, {
    cwd,
    env: pythonEnv(params),
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  })
  return { python: python.path, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function excerpt(value, limit = 1200) {
  const textValue = String(value ?? '')
  return textValue.length > limit ? `${textValue.slice(0, limit)}\n…` : textValue
}

export async function checkImageConfig(catalog, pluginConfig) {
  const params = currentParams(pluginConfig)
  const skill = expansion(catalog, 'ppt-master')
  const script = join(skill, 'scripts', 'image_gen.py')
  if (!existsSync(script)) return { ok: false, detail: `找不到 ${script}` }
  try {
    const run = await runPython(params, [script, '--list-backends'], skill)
    const stdout = run.stdout
    const resolved = /Resolved backend:\s*(.+)/.exec(stdout)?.[1]?.trim() ?? ''
    const source = /Configuration source:\s*(.+)/.exec(stdout)?.[1]?.trim() ?? ''
    const ok = resolved === 'openai'
    return {
      ok,
      detail: `${ok ? '✓' : '✗'} 后端：${resolved || '未配置'}；来源：${source || '未知'}${ok ? '' : '；期望后端 openai（是否已重建 ppt-master 技能？）'}`,
      output: excerpt(stdout),
    }
  } catch (error) {
    return { ok: false, detail: `检查失败：${String(error?.stderr ?? error?.message ?? error).slice(0, 600)}` }
  }
}

export async function checkPythonConfig(pluginConfig) {
  const params = currentParams(pluginConfig)
  const python = resolvePython(params)
  if (python.path.length === 0) {
    return { ok: false, detail: `未选择可用的系统 Python（设置 → 运行环境 → Python 解释器）：${python.source}` }
  }
  const probe = probePython(python.path)
  if (probe.ok !== true) return { ok: false, detail: `✗ ${python.path}：${probe.error ?? '无法运行'}` }
  const missing = DEPENDENCIES.filter(item => probe.missing.includes(item.module)).map(item => item.package)
  return {
    ok: missing.length === 0,
    detail: missing.length === 0
      ? `✓ ${probe.executable}（Python ${probe.version}）；依赖齐全`
      : `✗ ${probe.executable}（Python ${probe.version}）；缺 ${missing.join(', ')}（插件不会安装，请自行补齐）`,
  }
}

export async function checkImage2pptConfig(catalog, pluginConfig) {
  const params = currentParams(pluginConfig)
  const skill = expansion(catalog, 'nature-image2ppt')
  const script = join(skill, 'cli', 'image2ppt', 'cli.py')
  try {
    const run = await runPython(params, [script, 'doctor'], skill, 120_000)
    const lines = run.stdout.split(/\r?\n/).filter(Boolean)
    const ok = /next:\s*no action needed/i.test(run.stdout) && !/config:.*missing/i.test(run.stdout)
    const pick = lines.filter(line => /^(config|OCR|image CLI fallback|next):/i.test(line)).join(' · ')
    return { ok, detail: `${ok ? '✓' : '✗'} ${pick || lines.slice(-4).join(' · ')}`, output: excerpt(run.stdout, 2000) }
  } catch (error) {
    return { ok: false, detail: `检查失败：${String(error?.stderr ?? error?.message ?? error).slice(0, 600)}` }
  }
}

export function checkComponentsConfig(mcpStatus, params) {
  const parts = []
  let ok = true
  const python = resolvePython(params ?? {})
  if (python.path.length > 0) {
    parts.push(`✓ 系统 Python ${python.version === undefined || python.version.length === 0 ? '' : python.version + ' '}${python.path}`)
  } else {
    ok = false
    parts.push(`✗ 未选择系统 Python（${python.source}）`)
  }
  try {
    const version = execFileSync('officecli', ['--version'], { encoding: 'utf8', timeout: 20_000 }).trim()
    parts.push(`✓ officecli ${version.split(/\r?\n/)[0]}`)
  } catch {
    ok = false
    parts.push('✗ officecli 未找到')
  }
  try {
    const config = execFileSync('zotero-cli', ['config'], { encoding: 'utf8', timeout: 20_000 }).trim()
    const local = /ZOTERO_LOCAL=true/.test(config)
    parts.push(`${local ? '✓' : '✗'} zotero-cli ${local ? '本地 API' : '配置异常'}`)
    if (!local) ok = false
  } catch {
    ok = false
    parts.push('✗ zotero-cli 未找到')
  }
  const drawio = resolveDrawio()
  parts.push(drawio === undefined ? '✗ draw.io 未安装（drawio-reconstruction 置灰）' : `✓ draw.io ${drawio}`)
  const polyspace = resolvePolyspace()
  parts.push(polyspace === undefined ? '✗ Polyspace 未安装（19 个技能置灰）' : `✓ Polyspace ${polyspace}`)
  const matlab = matlabStatus()
  parts.push(matlab)
  for (const field of [matlabMcpField(), windowsMcpField()]) {
    if (field.level === 'bad') ok = false
    parts.push(`${field.level === 'ok' ? '✓' : field.level === 'warn' ? '!' : '✗'} ${field.label} ${field.value}`)
  }
  if (mcpStatus !== undefined && (mcpStatus.servers ?? []).length > 0) {
    for (const server of mcpStatus.servers) {
      parts.push(`· 已注册 ${server.name}：${server.state}${server.toolCount === undefined ? '' : `（${server.toolCount} 个工具）`}`)
    }
  }
  return { ok, detail: parts.join(' · ') }
}

export async function runSettingCheck(catalog, pluginConfig, action, mcpController) {
  if (action === 'image-check') return checkImageConfig(catalog, pluginConfig)
  if (action === 'image2ppt-check') return checkImage2pptConfig(catalog, pluginConfig)
  if (action === 'runtime-check') {
    const params = currentParams(pluginConfig)
    const detected = detectPythons({ force: true })
    const usable = detected.candidates.filter(item => item.ok === true)
    const ready = usable.filter(item => item.missing.length === 0).length
    const python = await checkPythonConfig(pluginConfig)
    const mcpStatus = mcpController === undefined ? { available: false, servers: [] } : mcpController.status()
    const components = checkComponentsConfig(mcpStatus, params)
    const mcp = mcpController === undefined ? undefined : checkMcp(mcpController)
    return {
      ok: python.ok && components.ok,
      detail: [
        `Python：检测到 ${detected.candidates.length} 个，可运行 ${usable.length} 个，依赖齐全 ${ready} 个。${python.detail}`,
        `组件：${components.detail}`,
        ...(mcp === undefined ? [] : [`MCP：${mcp.detail}`]),
      ].join('\n'),
    }
  }
  throw new Error(`未知检查动作：${action}`)
}

/** 保存一张卡片：更新参数、写回 settings，再生成技能运行时文件。 */
function saveFieldGroup(target, fields, values) {
  for (const field of fields) {
    const incoming = values[field.id]
    if (incoming === undefined) continue
    if (field.secret === true && String(incoming).trim() === '') continue
    setNested(target, field.keys ?? [field.id], String(incoming).trim())
  }
}

export async function saveSettingsCard(catalog, pluginConfig, body) {
  const params = currentParams(pluginConfig)
  const values = body.values ?? {}
  if (body.cardId === 'runtime') {
    const chosen = text(values.python)
    if (chosen.length > 0 && !existsSync(chosen)) throw new Error(`Python 不存在：${chosen}`)
    params.python = { path: chosen }
  } else if (body.cardId === 'image') {
    const next = imageValues(params)
    if (typeof values.baseUrl === 'string') next.baseUrl = values.baseUrl.trim()
    if (typeof values.model === 'string') next.model = values.model.trim()
    if (typeof values.apiKey === 'string' && values.apiKey.trim().length > 0) next.apiKey = values.apiKey.trim()
    params.image = next
  } else if (body.cardId === 'optional-search') {
    saveFieldGroup(params.optional, OPTIONAL_FIELDS, values)
  } else if (body.cardId === 'nature-academic-search') {
    saveFieldGroup(params.natureAcademic, ACADEMIC_FIELDS, values)
  } else if (body.cardId === 'nature-downloader') {
    saveFieldGroup(params.natureDownloader, DOWNLOADER_FIELDS, values)
  } else if (body.cardId === 'nature-image2ppt') {
    saveFieldGroup(params.natureImage2ppt, IMAGE2PPT_FIELDS.map(field => ({ ...field, keys: [field.id] })), values)
  } else {
    throw new Error(`未知的设置卡片：${body.cardId}`)
  }
  const { configDir: ignoredConfigDir, ...persisted } = params
  void ignoredConfigDir
  writeParams(persisted)
  return mirrorSkillFiles(params)
}

/** 打开配置目录（只允许中心配置目录及其子目录）。 */
export function openConfigTarget(configDir, target) {
  const base = configDir
  const dir = target === undefined || target === 'configDir' ? base : join(base, target)
  const resolvedBase = base.toLowerCase()
  const resolvedDir = dir.toLowerCase()
  if (resolvedDir !== resolvedBase && !resolvedDir.startsWith(`${resolvedBase}\\`)) throw new Error('拒绝打开配置目录之外的路径')
  if (!existsSync(dir)) throw new Error(`目录不存在：${dir}`)
  const child = spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' })
  child.unref()
  return { opened: true, path: dir }
}
