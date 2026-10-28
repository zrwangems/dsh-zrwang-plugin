/**
 * My DSH 设置的“参数层”：所有可编辑参数都来自固定配置目录的 settings.json，
 * 设置界面读写的就是它（见 plugin-params.mjs）。
 *
 * 技能运行时需要的 .env / config.toml / config.yaml 由这些参数生成并镜像到技能目录；
 * <configDir> 只放文件类内容：目录树 catalog.json、默认启用 defaults.json、
 * nature-downloader 的学校信息与凭据。
 */
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { PKG_DIR, SKILLS_DIR } from './config.mjs'
import { indexedSkills } from './catalog.mjs'
import { backupFile } from './state.mjs'
import { configDirOfParams, readParams, writeParams } from './plugin-params.mjs'
import { checkArsDeps, readDepsResult, resolvePython, writeArsRuntimeNotes } from './ars.mjs'

/** 图片服务供应商：预置地址/模型与获取 Key 的链接。 */
export const PROVIDERS = [
  {
    id: 'qwen', label: '通义千问 Qwen',
    baseUrl: '',
    model: 'qwen-image-2.0-pro',
    getKeyUrl: 'https://bailian.console.aliyun.com/',
  },
  {
    id: 'openai', label: 'OpenAI',
    baseUrl: '',
    model: 'gpt-image-2',
    getKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini', label: 'Google Gemini',
    baseUrl: '', model: 'gemini-nano-banana-2.1',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'zhipu', label: '智谱 GLM',
    baseUrl: '',
    model: 'glm-image',
    getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'volcengine', label: '火山引擎',
    baseUrl: '',
    model: 'doubao-seedream-4-5-251128',
    getKeyUrl: 'https://console.volcengine.com/ark',
  },
  {
    id: 'minimax', label: 'MiniMax',
    baseUrl: '',
    model: 'image-01',
    getKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  },
  {
    id: 'tencent', label: '腾讯云 TokenHub',
    baseUrl: '',
    model: 'hy-image-v3',
    getKeyUrl: 'https://console.cloud.tencent.com/',
  },
]

const PROVIDER_ENV = {
  qwen: { key: 'QWEN_API_KEY', model: 'QWEN_MODEL', url: 'QWEN_BASE_URL' },
  openai: { key: 'OPENAI_API_KEY', model: 'OPENAI_MODEL', url: 'OPENAI_BASE_URL' },
  gemini: { key: 'GEMINI_API_KEY', model: 'GEMINI_MODEL', url: 'GEMINI_BASE_URL' },
  zhipu: { key: 'ZHIPU_API_KEY', model: 'ZHIPU_MODEL', url: 'ZHIPU_BASE_URL' },
  volcengine: { key: 'LAS_API_KEY', model: 'VOLCENGINE_MODEL', url: 'VOLCENGINE_BASE_URL' },
  minimax: { key: 'MINIMAX_API_KEY', model: 'MINIMAX_MODEL', url: 'MINIMAX_BASE_URL' },
  tencent: { key: 'TENCENT_API_KEY', model: 'TENCENT_MODEL', url: 'TENCENT_BASE_URL' },
}

const ACADEMIC_FIELDS = [
  { id: 'pubmed.email', label: 'PubMed 联系邮箱', keys: ['pubmed', 'email'], help: 'NCBI 要求填写邮箱，可提高访问配额' },
  { id: 'pubmed.apiKey', label: 'PubMed API Key', keys: ['pubmed', 'apiKey'], secret: true, help: '可选，能提高请求频率' },
  { id: 'pubmed.cacheTtl', label: '缓存有效期（秒）', keys: ['pubmed', 'cacheTtl'] },
  { id: 'crossref.mailto', label: 'Crossref 联系邮箱', keys: ['crossref', 'mailto'], help: '可选，用于礼貌访问' },
  { id: 'crossref.timeout', label: 'Crossref 超时（秒）', keys: ['crossref', 'timeout'] },
  { id: 'arxiv.timeout', label: 'arXiv 超时（秒）', keys: ['arxiv', 'timeout'] },
  { id: 'general.defaultRows', label: '默认返回条数', keys: ['general', 'defaultRows'] },
  { id: 'general.maxRows', label: '最大返回条数', keys: ['general', 'maxRows'] },
]

const IMAGE2PPT_FIELDS = [
  { id: 'paddleOcrToken', label: '百度 OCR Token', secret: true, required: true, getKeyUrl: 'https://aistudio.baidu.com/account/accessToken' },
]

/**
 * 2026-10 新增仓库里需要密钥/账号的技能参数。
 * 这些上游技能都从环境变量读配置，保存后由 applySkillEnv 写进宿主进程环境，
 * 模型执行 shell 命令时子进程会继承。
 */
const NEW_SKILL_FIELDS = [
  { id: 'qinyanApiKey', label: '沁言学术 API Key', secret: true, env: 'QINYAN_API_KEY', help: '沁言自研的 10 个技能（检索、选题、论文分析、润色等）需要', required: true },
  { id: 'qinyanBaseUrl', label: '沁言学术接口地址', env: 'QINYAN_BASE_URL', help: '可选，留空用官方地址' },
  { id: 'parallelApiKey', label: 'Parallel API Key', secret: true, env: 'PARALLEL_API_KEY', help: 'parallel-web 检索技能用，可选', getKeyUrl: 'https://parallel.ai/' },
  { id: 'openrouterApiKey', label: 'OpenRouter API Key', secret: true, env: 'OPENROUTER_API_KEY', help: '生图、幻灯片、示意图、信息图等新增技能用', getKeyUrl: 'https://openrouter.ai/keys' },
  { id: 'zoteroApiKey', label: 'Zotero API Key', secret: true, env: 'ZOTERO_API_KEY', help: 'pyzotero 技能读写文献库需要', getKeyUrl: 'https://www.zotero.org/settings/keys' },
  { id: 'zoteroLibraryId', label: 'Zotero Library ID', env: 'ZOTERO_LIBRARY_ID', help: 'Zotero 设置页里的数字用户 ID' },
  { id: 'zoteroLibraryType', label: 'Zotero 库类型', env: 'ZOTERO_LIBRARY_TYPE', help: 'user 或 group，默认 user' },
]

/** 这些技能离开密钥就跑不起来，未配置时在侧栏置灰。 */
const QINYAN_REQUIRED_SKILLS = [
  'qinyan-citation', 'qinyan-nature-figures', 'qinyan-nature-polishing', 'qinyan-nature-review',
  'qinyan-nature-statistics', 'qinyan-nature-writing', 'qinyan-paper-analysis', 'qinyan-paper-polish',
  'qinyan-paper-search', 'qinyan-topic-analysis',
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
  const text = value === undefined || value === null ? '' : String(value)
  const hasValue = text.length > 0
  const base = {
    id: field.id,
    label: field.label,
    help: field.help,
    required: field.required === true,
    control: field.control,
    options: field.options,
    getKeyUrl: field.getKeyUrl,
  }
  if (field.secret === true) {
    return { ...base, secret: true, value: '', hasValue, placeholder: hasValue ? '留空使用已保存凭据' : '未设置' }
  }
  return { ...base, value: text }
}

/** 从参数里取出某个供应商的完整配置（缺项用默认补）。 */
function providerEntry(params, providerId) {
  const provider = PROVIDERS.find(item => item.id === providerId)
  const stored = params?.pptMaster?.providers?.[providerId] ?? {}
  return {
    provider,
    baseUrl: typeof stored.baseUrl === 'string' && stored.baseUrl.length > 0 ? stored.baseUrl : provider.baseUrl,
    model: typeof stored.model === 'string' && stored.model.length > 0 ? stored.model : provider.model,
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : '',
  }
}

function paramsDefaults() {
  const providers = {}
  for (const provider of PROVIDERS) providers[provider.id] = { baseUrl: provider.baseUrl, model: provider.model, apiKey: '' }
  return {
    pptMaster: { backend: 'qwen', providers },
    natureAcademic: { pubmed: { email: '', apiKey: '', cacheDir: '~/.cache/academic-search', cacheTtl: '86400' }, crossref: { mailto: '', timeout: '15' }, arxiv: { timeout: '30' }, general: { defaultRows: '5', maxRows: '50' } },
    natureImage2ppt: { paddleOcrToken: '' },
    ars: { python: '' },
    newSkills: {
      qinyanApiKey: '', qinyanBaseUrl: '', parallelApiKey: '', openrouterApiKey: '',
      zoteroApiKey: '', zoteroLibraryId: '', zoteroLibraryType: 'user',
    },
  }
}

/** 取当前参数（补默认值）。 */
export function currentParams(pluginConfig) {
  const defaults = paramsDefaults()
  const stored = readParams(pluginConfig)
  const merged = { ...defaults, ...stored }
  delete merged.configDir
  merged.pptMaster = { ...defaults.pptMaster, ...(stored.pptMaster ?? {}) }
  merged.pptMaster.providers = { ...defaults.pptMaster.providers, ...(stored.pptMaster?.providers ?? {}) }
  merged.natureAcademic = {
    pubmed: { ...defaults.natureAcademic.pubmed, ...(stored.natureAcademic?.pubmed ?? {}) },
    crossref: { ...defaults.natureAcademic.crossref, ...(stored.natureAcademic?.crossref ?? {}) },
    arxiv: { ...defaults.natureAcademic.arxiv, ...(stored.natureAcademic?.arxiv ?? {}) },
    general: { ...defaults.natureAcademic.general, ...(stored.natureAcademic?.general ?? {}) },
  }
  merged.natureImage2ppt = { ...defaults.natureImage2ppt, ...(stored.natureImage2ppt ?? {}) }
  merged.ars = { ...defaults.ars, ...(stored.ars ?? {}) }
  merged.newSkills = { ...defaults.newSkills, ...(stored.newSkills ?? {}) }
  return merged
}

// ---------------- 生成技能运行时文件 ----------------

function tomlValue(value) {
  const text = String(value)
  return /^-?\d+(?:\.\d+)?$/.test(text) ? text : JSON.stringify(text)
}

function academicToml(params) {
  const a = params.natureAcademic
  return [
    '[pubmed]',
    `email = ${tomlValue(a.pubmed.email)}`,
    `api_key = ${tomlValue(a.pubmed.apiKey)}`,
    `cache_dir = ${tomlValue(a.pubmed.cacheDir)}`,
    `cache_ttl = ${tomlValue(a.pubmed.cacheTtl)}`,
    '',
    '[crossref]',
    `mailto = ${tomlValue(a.crossref.mailto)}`,
    `timeout = ${tomlValue(a.crossref.timeout)}`,
    '',
    '[arxiv]',
    `timeout = ${tomlValue(a.arxiv.timeout)}`,
    '',
    '[general]',
    `default_rows = ${tomlValue(a.general.defaultRows)}`,
    `max_rows = ${tomlValue(a.general.maxRows)}`,
    '',
  ].join('\n')
}

function image2pptYaml(params) {
  const i = params.natureImage2ppt
  const entry = providerEntry(params, params.pptMaster.backend)
  return [
    '# 由 dsh-zrwang-plugin 生成；生图模型与当前供应商一致',
    `PADDLE_OCR_TOKEN: ${JSON.stringify(i.paddleOcrToken)}`,
    'IMAGE2PPT_IMAGE_BACKEND: "openai-compatible-api"',
    `OPENAI_BASE_URL: ${JSON.stringify(entry.baseUrl)}`,
    `IMAGE2PPT_IMAGE_MODEL: ${JSON.stringify(entry.model)}`,
    `OPENAI_API_KEY: ${JSON.stringify(entry.apiKey)}`,
    '',
  ].join('\n')
}

function pptEnv(params) {
  const backend = params.pptMaster.backend
  const entry = providerEntry(params, backend)
  const env = PROVIDER_ENV[backend] ?? PROVIDER_ENV.qwen
  const lines = [
    '# 由 dsh-zrwang-plugin 生成；参数在 zrwang-plugin-config/settings.json',
    `IMAGE_BACKEND=${backend}`,
  ]
  if (entry.apiKey.length > 0) lines.push(`${env.key}=${entry.apiKey}`)
  if (entry.model.length > 0) lines.push(`${env.model}=${entry.model}`)
  if (entry.baseUrl.length > 0) lines.push(`${env.url}=${entry.baseUrl}`)
  return `${lines.join('\n')}\n`
}

async function mirrorSkillFiles(catalog, params) {
  const backups = []
  const pptSkill = expansion(catalog, 'ppt-master')
  // ppt-master 官方用户配置位 ~/.ppt-master/.env：不把密钥写进插件仓库
  const pptEnvFile = join(homedir(), '.ppt-master', '.env')
  await mkdir(join(homedir(), '.ppt-master'), { recursive: true })
  const legacyEnv = join(pptSkill, '.env')
  if (existsSync(legacyEnv)) {
    const old = await readFile(legacyEnv, 'utf8')
    if (old.includes('由 dsh-zrwang-plugin 生成')) await unlink(legacyEnv)
  }
  const pptBackup = await backupFile(pptEnvFile, 'ppt-master-env')
  if (pptBackup !== undefined) backups.push(pptBackup)
  await writeFile(pptEnvFile, pptEnv(params), 'utf8')

  const academicSkill = expansion(catalog, 'nature-academic-search')
  const academicFile = join(academicSkill, 'mcp-server', 'config.toml')
  const academicBackup = await backupFile(academicFile, 'nature-academic-config')
  if (academicBackup !== undefined) backups.push(academicBackup)
  await writeFile(academicFile, academicToml(params), 'utf8')

  const imageSkill = expansion(catalog, 'nature-image2ppt')
  const imageFile = join(imageSkill, 'config.yaml')
  const imageBackup = await backupFile(imageFile, 'nature-image2ppt-config')
  if (imageBackup !== undefined) backups.push(imageBackup)
  await writeFile(imageFile, image2pptYaml(params), 'utf8')
  // ARS：把当前 Python 解释器写进每个技能的 _shared/dsh-runtime.md
  await writeArsRuntimeNotes(params)
  return backups
}

// ---------------- nature-downloader（文件类） ----------------

async function downloaderDir(params) {
  const dir = join(configDirOfParams(params), 'nature-downloader')
  await mkdir(dir, { recursive: true })
  const legacy = join(homedir(), '.config', 'lit-dl')
  if (existsSync(legacy)) {
    for (const name of ['school.json', 'credentials.json', 'settings.json']) {
      if (!existsSync(join(dir, name)) && existsSync(join(legacy, name))) {
        await cp(join(legacy, name), join(dir, name))
      }
    }
  }
  return dir
}

/** 内置学校访问配置：首次运行自动写入，用户无需手工配置。 */
const DEFAULT_SCHOOL_CONFIG = {
  version: 1,
  school: { name: '北京航空航天大学', code: 'buaa', configured_at: '', source: 'plugin-default' },
  auth: {
    type: 'sso',
    sso_domain: 'sso.buaa.edu.cn',
    carsi_entry: 'https://idp.buaa.edu.cn/idp/shibboleth',
    carsi_sp_entity_id: null,
  },
  proxy: { type: null, ezproxy_url: null },
  libraries: ['Web of Science', 'ScienceDirect', 'Springer', 'IEEE Xplore', '知网', 'ACS'],
  discovery: {
    resource_entry_url: 'https://lib.buaa.edu.cn/',
    resource_portal_url: 'https://lib.buaa.edu.cn/',
    carsi_idp: 'https://idp.buaa.edu.cn/idp/shibboleth',
    cnki_url: 'https://kns.cnki.net/',
  },
  notes: '北京航空航天大学：统一认证 sso.buaa.edu.cn；CARSI IdP idp.buaa.edu.cn；图书馆 lib.buaa.edu.cn',
}

export async function ensureBuaaSchoolConfig(params) {
  const dir = await downloaderDir(params)
  const file = join(dir, 'school.json')
  if (!existsSync(file)) {
    let config = DEFAULT_SCHOOL_CONFIG
    try {
      config = JSON.parse(await readFile(join(PKG_DIR, 'config', 'nature-downloader', 'school.json'), 'utf8'))
    } catch {
      config = DEFAULT_SCHOOL_CONFIG
    }
    config = { ...config, school: { ...config.school, configured_at: new Date().toISOString() } }
    await writeFile(file, `${JSON.stringify(config, null, 2)}
`, 'utf8')
  }
  return dir
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

let blockedCache = { signature: '', at: 0, value: {} }

/** 返回不可注入的技能 → 原因。结果短暂缓存，避免每次点击都跑 where.exe。 */
export async function blockedSkills(catalog, params) {
  void catalog
  const backend = params?.pptMaster?.backend ?? 'qwen'
  const entry = providerEntry(params, backend)
  const signature = [
    backend,
    entry.apiKey.length > 0 ? 1 : 0,
    (params?.natureImage2ppt?.paddleOcrToken ?? '').length > 0 ? 1 : 0,
    (params?.newSkills?.qinyanApiKey ?? '').length > 0 ? 1 : 0,
    (params?.newSkills?.zoteroApiKey ?? '').length > 0 && (params?.newSkills?.zoteroLibraryId ?? '').length > 0 ? 1 : 0,
    configDirOfParams(params),
  ].join('|')
  if (blockedCache.signature === signature && Date.now() - blockedCache.at < 3_000) return blockedCache.value
  const blocked = {}
  if (entry.apiKey.length === 0) blocked['ppt-master'] = '未配置图片服务 API Key'
  if ((params?.natureImage2ppt?.paddleOcrToken ?? '').length === 0) blocked['nature-image2ppt'] = '未配置百度 OCR Token'
  const newSkills = params?.newSkills ?? {}
  if ((newSkills.qinyanApiKey ?? '').length === 0) {
    for (const name of QINYAN_REQUIRED_SKILLS) blocked[name] = '未配置沁言学术 API Key'
  }
  if ((newSkills.zoteroApiKey ?? '').length === 0 || (newSkills.zoteroLibraryId ?? '').length === 0) {
    blocked['pyzotero'] = '未配置 Zotero API Key / Library ID'
  }
  const dir = await ensureBuaaSchoolConfig(params)
  if (!existsSync(join(dir, 'school.json'))) blocked['nature-downloader'] = '未配置学校访问信息'
  if (!cliExists('officecli')) blocked['officecli'] = '本机未找到 officecli 命令'
  for (const name of ['officecli-academic-paper', 'officecli-data-dashboard', 'officecli-docx', 'officecli-financial-model', 'officecli-pitch-deck', 'officecli-pptx', 'officecli-word-form', 'officecli-xlsx']) {
    if (blocked.officecli !== undefined) blocked[name] = blocked.officecli
  }
  if (!cliExists('zotero-cli')) blocked['zotero-cli'] = '本机未找到 zotero-cli 命令'
  blockedCache = { signature, at: Date.now(), value: blocked }
  return blocked
}

/** 设置页要展示的卡片。 */
export async function settingsCards(catalog, params) {
  void catalog
  const configDir = configDirOfParams(params)
  const providerFields = {}
  for (const provider of PROVIDERS) {
    const entry = providerEntry(params, provider.id)
    providerFields[provider.id] = [
      maskField({ id: 'baseUrl', label: '接口地址（URL）', help: '留空用默认地址' }, entry.baseUrl),
      maskField({ id: 'model', label: '模型', help: '留空用默认模型' }, entry.model),
      maskField({ id: 'apiKey', label: 'API Key', secret: true, getKeyUrl: provider.getKeyUrl }, entry.apiKey),
    ]
  }
  const downloader = await ensureBuaaSchoolConfig(params)
  const schoolExists = existsSync(join(downloader, 'school.json'))
  const python = resolvePython(params)
  const deps = readDepsResult()
  const arsCards = [
    {
      id: 'ars',
      title: 'ARS 运行环境',
      page: 'ars',
      kind: 'fields',
      fields: [
        maskField({
          id: 'python',
          label: 'Python 解释器',
          help: python.path.length > 0
            ? `当前使用：${python.path}（来源：${python.source}）；留空则自动探测`
            : '未找到可用 Python，请填写 python.exe 的完整路径',
        }, params.ars.python),
      ],
    },
    {
      id: 'ars-deps',
      title: 'Python 依赖',
      page: 'ars',
      kind: 'info',
      status: deps === undefined
        ? '尚未检查。ARS 的校验脚本需要 PyYAML、jsonschema、pypdf 等依赖，点下面的按钮检查。'
        : [
          deps.ok === true ? '✓ 依赖齐全' : `✗ ${deps.detail}`,
          deps.python === undefined || deps.python.length === 0 ? '解释器未找到' : `解释器 ${deps.python}`,
          deps.checkedAtLocal ?? '',
          deps.hint === undefined || deps.hint.length === 0 ? '' : `安装：${deps.hint}`,
        ].filter(item => item.length > 0).join(' · '),
      actions: [{ id: 'ars-check-deps', label: '检查依赖' }],
    },
  ]
  return {
    configDir,
    cards: [
      ...arsCards,
      {
        id: 'ppt-master',
        title: '生图模型',
        page: 'models',
        kind: 'provider',
        backend: params.pptMaster.backend,
        backendOptions: PROVIDERS.map(provider => ({ id: provider.id, label: provider.label })),
        providerFields,
      },
      {
        id: 'nature-academic-search',
        title: 'Nature 学术检索',
        page: 'nature',
        kind: 'fields',
        fields: ACADEMIC_FIELDS.map(field => maskField(field, getNested(params.natureAcademic, field.keys))),
      },
      {
        id: 'nature-image2ppt',
        title: 'OCR模型',
        page: 'models',
        kind: 'fields',
        fields: IMAGE2PPT_FIELDS.map(field => maskField(field, params.natureImage2ppt[field.id] ?? (field.id === 'imageBackend' ? 'auto' : ''))),
      },
      {
        id: 'openrouter',
        title: 'OpenRouter（生图 / 幻灯片）',
        page: 'models',
        kind: 'fields',
        fields: NEW_SKILL_FIELDS.filter(field => field.id === 'openrouterApiKey').map(field => maskField(field, params.newSkills[field.id])),
      },
      {
        id: 'qinyan',
        title: '沁言学术',
        page: 'researchinfo',
        kind: 'fields',
        fields: ['qinyanApiKey', 'qinyanBaseUrl', 'parallelApiKey'].map(id => NEW_SKILL_FIELDS.find(field => field.id === id)).map(field => maskField(field, params.newSkills[field.id])),
      },
      {
        id: 'zotero',
        title: 'Zotero 文献库',
        page: 'researchinfo',
        kind: 'fields',
        fields: ['zoteroApiKey', 'zoteroLibraryId', 'zoteroLibraryType'].map(id => NEW_SKILL_FIELDS.find(field => field.id === id)).map(field => maskField(field, params.newSkills[field.id])),
      },
      {
        id: 'researchinfo-pubmed',
        title: 'PubMed / NCBI',
        page: 'researchinfo',
        kind: 'info',
        status: 'PubMed 邮箱与 NCBI API Key 复用「Nature-skill设置」里的配置；保存后会自动注入 NCBI_EMAIL / NCBI_API_KEY 给新增技能使用。',
      },
    ],
  }
}

/** 把新增技能需要的密钥写进宿主进程环境；子进程（bash/python）会继承。 */
export function applySkillEnv(params) {
  const values = params?.newSkills ?? {}
  for (const field of NEW_SKILL_FIELDS) {
    const name = field.env
    const value = typeof values[field.id] === 'string' ? values[field.id].trim() : ''
    if (value.length > 0) process.env[name] = value
    else delete process.env[name]
  }
  // PubMed / NCBI 复用 Nature-skill 设置，新增技能里也有用 NCBI 环境变量的
  const pubmed = params?.natureAcademic?.pubmed ?? {}
  const envPairs = [['NCBI_EMAIL', pubmed.email], ['NCBI_API_KEY', pubmed.apiKey]]
  for (const [name, raw] of envPairs) {
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (value.length > 0) process.env[name] = value
    else delete process.env[name]
  }
}

/** 设置页「检查依赖」按钮：跑一次探测并把结果挂回设置负载。 */
export async function checkArsDependencies(pluginConfig) {
  const params = currentParams(pluginConfig)
  const result = checkArsDeps(params)
  return result
}

/** 保存一张卡片：更新参数、写回 patch，再生成技能运行时文件。 */
export async function saveSettingsCard(catalog, pluginConfig, body) {
  const params = currentParams(pluginConfig)
  const values = body.values ?? {}
  if (body.cardId === 'ppt-master') {
    const backend = typeof body.backend === 'string' ? body.backend : params.pptMaster.backend
    if (!PROVIDERS.some(provider => provider.id === backend)) throw new Error(`未知的图片服务：${backend}`)
    params.pptMaster.backend = backend
    const entry = providerEntry(params, backend)
    const stored = { ...(params.pptMaster.providers[backend] ?? {}), baseUrl: entry.baseUrl, model: entry.model, apiKey: entry.apiKey }
    if (typeof values.baseUrl === 'string') stored.baseUrl = values.baseUrl.trim()
    if (typeof values.model === 'string') stored.model = values.model.trim()
    if (typeof values.apiKey === 'string' && values.apiKey.trim().length > 0) stored.apiKey = values.apiKey.trim()
    params.pptMaster.providers[backend] = stored
  } else if (body.cardId === 'nature-academic-search') {
    for (const field of ACADEMIC_FIELDS) {
      const incoming = values[field.id]
      if (incoming === undefined) continue
      if (field.secret === true && incoming === '') continue
      setNested(params.natureAcademic, field.keys, String(incoming))
    }
  } else if (body.cardId === 'nature-image2ppt') {
    for (const field of IMAGE2PPT_FIELDS) {
      const incoming = values[field.id]
      if (incoming === undefined) continue
      if (field.secret === true && incoming === '') continue
      params.natureImage2ppt[field.id] = String(incoming)
    }
  } else if (['openrouter', 'qinyan', 'zotero'].includes(body.cardId)) {
    const allowed = {
      openrouter: ['openrouterApiKey'],
      qinyan: ['qinyanApiKey', 'qinyanBaseUrl', 'parallelApiKey'],
      zotero: ['zoteroApiKey', 'zoteroLibraryId', 'zoteroLibraryType'],
    }[body.cardId]
    for (const id of allowed) {
      const incoming = values[id]
      if (incoming === undefined) continue
      const field = NEW_SKILL_FIELDS.find(item => item.id === id)
      if (field?.secret === true && incoming === '') continue
      params.newSkills[id] = String(incoming).trim()
    }
  } else if (body.cardId === 'ars') {
    // 只存用户填的解释器路径；留空表示继续自动探测。
    if (typeof values.python === 'string') params.ars.python = values.python.trim()
  } else {
    throw new Error(`未知的设置卡片：${body.cardId}`)
  }
  const { configDir: ignoredConfigDir, ...persisted } = params
  void ignoredConfigDir
  writeParams(persisted)
  return mirrorSkillFiles(catalog, params)
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
