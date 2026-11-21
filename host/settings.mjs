/**
 * 设置页的数据与保存逻辑。
 *
 * 所有可填项都在这里定义：卡片字段是唯一来源，设置页按它渲染；
 * 密钥字段只回显“已设置/未设置”，值只从 DSH 凭据库读。
 */
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { SKILLS_DIR } from './config.mjs'
import { cacheRoot } from './paths.mjs'
import { isMac, isWindows, openPath, processIds, listeningPid, which, registryDisplayIcon } from './platform.mjs'
import { getPath, setPath, text } from './object.mjs'
import { applySkillEnv } from './env.mjs'
import { SECRET_REFS } from './params.mjs'
import { DEPENDENCIES, detectPythons, probePython, readPythonCandidates, resolvePython } from './python.mjs'
import { checkMcp, MATLAB_MCP_EXE, SIMULINK_TOOLKIT_DIR, SIMULINK_TOOLS_FILE } from './mcp.mjs'

const execFileAsync = promisify(execFile)
const cliCache = new Map()

export const ACADEMIC_FIELDS = [
  { id: 'pubmed.email', label: 'PubMed 联系邮箱', keys: ['pubmed', 'email'], help: 'NCBI 要求填写邮箱，可提高访问配额', getKeyUrl: 'https://account.ncbi.nlm.nih.gov/settings/', linkLabel: 'NCBI 账户' },
  { id: 'pubmed.apiKey', label: 'PubMed API Key', keys: ['pubmed', 'apiKey'], secret: true, help: '可选，能提高请求频率', getKeyUrl: 'https://account.ncbi.nlm.nih.gov/settings/', linkLabel: '申请 API Key' },
  { id: 'unpaywall.email', label: 'Unpaywall 联系邮箱', keys: ['unpaywall', 'email'], help: '文献下载查询开放获取用；留空则复用 PubMed 邮箱', getKeyUrl: 'https://unpaywall.org/products/api', linkLabel: 'Unpaywall 说明' },
  { id: 'crossref.mailto', label: 'Crossref 联系邮箱', keys: ['crossref', 'mailto'], help: '可选，用于礼貌访问', getKeyUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/', linkLabel: 'Crossref 说明' },
]

export const IMAGE2PPT_FIELDS = [
  { id: 'paddleOcrToken', label: '百度 OCR Token', secret: true, path: 'natureImage2ppt.paddleOcrToken', help: '可选；image2ppt 重建版面时用，不填只能量出文字位置和字号', getKeyUrl: 'https://aistudio.baidu.com/account/accessToken', linkLabel: '获取 Token' },
]

export const OPTIONAL_FIELDS = [
  { id: 'pexelsApiKey', label: 'Pexels API Key', secret: true, path: 'optional.pexelsApiKey', help: '可选；PPT Master 素材检索用', getKeyUrl: 'https://www.pexels.com/api/new/', linkLabel: '申请 Key' },
  { id: 'pixabayApiKey', label: 'Pixabay API Key', secret: true, path: 'optional.pixabayApiKey', help: '可选；PPT Master 素材检索用', getKeyUrl: 'https://pixabay.com/api/docs/', linkLabel: '查看 API Key' },
  { id: 'openAlexApiKey', label: 'OpenAlex API Key', secret: true, path: 'optional.openAlexApiKey', help: '可选；Nature 学术检索 / OpenAlex 用', getKeyUrl: 'https://openalex.org/settings/api', linkLabel: '申请 Key' },
  { id: 'firecrawlApiKey', label: 'Firecrawl API Key', secret: true, path: 'optional.firecrawlApiKey', help: '可选；读取需 JS 的出版社页面时用', getKeyUrl: 'https://www.firecrawl.dev/app/api-keys', linkLabel: '申请 Key' },
]

export const DOWNLOADER_FIELDS = [
  { id: 'elsevier.apiKey', label: 'Elsevier API Key', keys: ['elsevier', 'apiKey'], secret: true, path: 'natureDownloader.elsevier.apiKey', getKeyUrl: 'https://dev.elsevier.com/', linkLabel: '申请 Key' },
  { id: 'elsevier.instToken', label: 'Elsevier InstToken', keys: ['elsevier', 'instToken'], secret: true, path: 'natureDownloader.elsevier.instToken', help: '机构订阅才需要，可选' },
  { id: 'elsevier.authToken', label: 'Elsevier AuthToken', keys: ['elsevier', 'authToken'], secret: true, path: 'natureDownloader.elsevier.authToken', help: '部分机构网关需要，可选' },
  { id: 'springer.fulltextApiKey', label: 'Springer Nature Full Text Key', keys: ['springer', 'fulltextApiKey'], secret: true, path: 'natureDownloader.springer.fulltextApiKey' },
  { id: 'springer.openaccessApiKey', label: 'Springer Nature OA Key', keys: ['springer', 'openaccessApiKey'], secret: true, path: 'natureDownloader.springer.openaccessApiKey', help: 'Open Access API，可选' },
  { id: 'springer.metadataApiKey', label: 'Springer Nature Metadata Key', keys: ['springer', 'metadataApiKey'], secret: true, path: 'natureDownloader.springer.metadataApiKey', help: 'Meta API，可选' },
  { id: 'ieee.apiKey', label: 'IEEE Xplore API Key', keys: ['ieee', 'apiKey'], secret: true, path: 'natureDownloader.ieee.apiKey', getKeyUrl: 'https://developer.ieee.org/member/register', linkLabel: '申请 Key' },
  { id: 'ieee.fulltextEndpoint', label: 'IEEE Full Text Endpoint', keys: ['ieee', 'fulltextEndpoint'], help: '通常包含 {doi}；只填 Metadata Key 不能下载全文' },
]

function maskField(field, value, present) {
  const hasValue = present === true || text(value).length > 0
  const base = {
    id: field.id,
    label: field.label,
    help: field.help,
    getKeyUrl: field.getKeyUrl,
    linkLabel: field.linkLabel,
  }
  if (field.secret === true) {
    return { ...base, secret: true, value: '', hasValue, placeholder: hasValue ? '留空使用已保存凭据' : '未设置' }
  }
  return { ...base, value: text(value) }
}

export function imageConfigured(params) {
  return text(params?.image?.apiKey).length > 0 && text(params?.image?.model).length > 0
}

/** 技能置灰原因；与设置页里的字段一一对应。 */
export async function blockedSkills(params, catalog) {
  const blocked = {}
  if (!imageConfigured(params)) blocked['ppt-master'] = '未配置生图模型（设置 → 模型服务 → 生图模型：URL、模型、API Key）'
  if (!cliExists('officecli')) {
    blocked.officecli = '本机未找到 officecli 命令'
    for (const name of ['officecli-academic-paper', 'officecli-data-dashboard', 'officecli-docx', 'officecli-financial-model', 'officecli-pitch-deck', 'officecli-pptx', 'officecli-word-form', 'officecli-xlsx', 'morph-ppt', 'morph-ppt-3d']) {
      blocked[name] = blocked.officecli
    }
  }
  if (!cliExists('zotero-cli')) blocked['zotero-cli'] = '本机未找到 zotero-cli 命令'
  if (!cliExists('lark-cli')) {
    for (const [name, node] of Object.entries(catalog.skills ?? {})) {
      if (String(node.dir ?? '').split(/[\\/]/).join('/').startsWith('office/lark/')) {
        blocked[name] = '本机未找到 lark-cli 命令（npm i -g @larksuite/cli 并 lark-cli auth login）'
      }
    }
  }
  if (resolveDrawio() === undefined) blocked['drawio-reconstruction'] = '本机未找到 draw.io 桌面版；安装后可设 DRAWIO_PATH'
  if (resolvePolyspace() === undefined) {
    for (const [name, node] of Object.entries(catalog.skills ?? {})) {
      if (String(node.group ?? '').split('/').includes('polyspace')) blocked[name] = '本机未安装 Polyspace / 未注册 Polyspace MCP 服务器'
    }
  }
  return blocked
}

function cliExists(name) {
  const hit = cliCache.get(name)
  if (hit !== undefined && Date.now() - hit.at < 300_000) return hit.value
  const value = which(name) !== undefined
  cliCache.set(name, { at: Date.now(), value })
  return value
}

function firstExisting(paths) {
  for (const path of paths) {
    if (typeof path === 'string' && path.length > 0 && existsSync(path)) return path
  }
  return undefined
}

/** draw.io 桌面版：Windows 注册表/LocalAppData，macOS 应用目录，Linux PATH。 */
export function resolveDrawio() {
  const explicit = text(process.env.DRAWIO_PATH)
  if (explicit.length > 0 && existsSync(explicit)) return explicit
  if (isWindows) {
    const local = process.env.LOCALAPPDATA ?? ''
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
    return firstExisting([
      local.length > 0 ? join(local, 'Programs', 'draw.io', 'draw.io.exe') : '',
      local.length > 0 ? join(local, 'draw.io', 'draw.io.exe') : '',
      join(programFiles, 'draw.io', 'draw.io.exe'),
      registryDisplayIcon('draw.io'),
    ])
  }
  if (isMac) return firstExisting(['/Applications/draw.io.app/Contents/MacOS/draw.io'])
  return firstExisting([which('drawio'), '/opt/drawio/drawio', '/usr/bin/drawio'])
}

/** Polyspace：环境变量优先，其它平台只认 PATH。 */
export function resolvePolyspace() {
  const root = text(process.env.POLYSPACE_ROOT)
  if (root.length > 0 && existsSync(root)) return root
  const server = text(process.env.POLYSPACE_MCP_SERVER)
  if (server.length > 0 && existsSync(server)) return server
  if (isWindows) {
    const local = process.env.LOCALAPPDATA ?? ''
    return firstExisting([local.length > 0 ? join(local, 'polyspace', 'polyspace-mcp-server.exe') : ''])
  }
  return which('polyspace-mcp-server')
}

function matlabSessionDetails() {
  if (!isWindows) return undefined
  const appData = process.env.APPDATA
  if (appData === undefined || appData.length === 0) return undefined
  try {
    return JSON.parse(readFileSync(join(appData, 'MathWorks', 'MATLAB MCP Server', 'v1', 'sessionDetails.json'), 'utf8'))
  } catch {
    return undefined
  }
}

function matlabMcpField() {
  const label = 'MathWorks MCP'
  if (!isWindows) return statusField('mcp-mathworks', label, '仅 Windows 可用', 'idle', '非 Windows 平台没有 MATLAB MCP 服务器')
  if (!existsSync(MATLAB_MCP_EXE)) return statusField('mcp-mathworks', label, '不可用：缺少 matlab-mcp 可执行文件', 'bad')
  const pids = processIds('MATLAB.exe')
  if (pids.length === 0) return statusField('mcp-mathworks', label, '不可用：MATLAB 未运行', 'bad')
  const details = matlabSessionDetails()
  if (details === undefined) return statusField('mcp-mathworks', label, '不可用：MATLAB 已运行，但未共享会话', 'warn', '在 MATLAB 里执行 shareMATLABSession() 后再检查')
  const port = Number(details.port)
  const pid = Number(details.pid)
  if (!Number.isSafeInteger(pid) || !pids.includes(pid)) {
    return statusField('mcp-mathworks', label, '不可用：共享会话已失效', 'warn', '重新执行 shareMATLABSession()')
  }
  if (listeningPid(port) === undefined) {
    return statusField('mcp-mathworks', label, '不可用：共享会话未监听', 'warn', '重新执行 shareMATLABSession()')
  }
  return statusField('mcp-mathworks', label, '可用：MATLAB 已共享会话', 'ok', `共享会话端口 ${port}`)
}

function windowsMcpField() {
  if (!isWindows) return statusField('mcp-windows', 'Windows MCP', '仅 Windows 可用', 'idle')
  const found = which('windows-mcp')
  return found === undefined
    ? statusField('mcp-windows', 'Windows MCP', '不可用：未安装', 'bad', 'PATH 里没有 windows-mcp，安装后重新检查')
    : statusField('mcp-windows', 'Windows MCP', '可用：已安装', 'ok', found)
}

function statusField(id, label, value, level, help) {
  return { id, label, value, level, help, control: 'status' }
}

function cliStatusField(id, label, command, args) {
  const found = which(command)
  if (found === undefined) return statusField(id, label, '未找到', 'bad')
  try {
    const output = execFileSync(found, args, { encoding: 'utf8', timeout: 15_000, windowsHide: true, shell: false }).trim()
    return statusField(id, label, output.split(/\r?\n/)[0] || '已安装', 'ok')
  } catch {
    return statusField(id, label, '已安装（版本未知）', 'ok')
  }
}

function zoteroField() {
  const found = which('zotero-cli')
  if (found === undefined) return statusField('zotero-cli', 'zotero-cli', '未找到', 'bad')
  try {
    const output = execFileSync(found, ['config'], { encoding: 'utf8', timeout: 15_000, windowsHide: true }).trim()
    return /ZOTERO_LOCAL=true/.test(output)
      ? statusField('zotero-cli', 'zotero-cli', '本地 API', 'ok')
      : statusField('zotero-cli', 'zotero-cli', '配置异常（需要 ZOTERO_LOCAL=true）', 'bad')
  } catch {
    return statusField('zotero-cli', 'zotero-cli', '配置异常', 'bad')
  }
}

function environmentRows(params) {
  const drawio = resolveDrawio()
  const polyspace = resolvePolyspace()
  const matlab = isWindows ? (processIds('MATLAB.exe').length > 0 ? '已运行' : '未运行') : '仅 Windows 可用'
  return [
    cliStatusField('officecli', 'officecli', 'officecli', ['--version']),
    zoteroField(),
    cliStatusField('lark-cli', 'lark-cli', 'lark-cli', ['--version']),
    statusField('drawio', 'draw.io', drawio === undefined ? '未安装（drawio-reconstruction 置灰）' : drawio, drawio === undefined ? 'bad' : 'ok'),
    statusField('polyspace', 'Polyspace', polyspace === undefined ? '未安装（Polyspace 技能置灰）' : polyspace, polyspace === undefined ? 'bad' : 'ok'),
    statusField('matlab', 'MATLAB', matlab, matlab === '已运行' ? 'ok' : isWindows ? 'bad' : 'idle'),
    matlabMcpField(),
    windowsMcpField(),
  ]
}

function pythonOptions(params) {
  const selected = text(params?.python?.path)
  const cached = readPythonCandidates()
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

/** 设置页要展示的卡片；`present` 是密钥是否存在（来自凭据库）。 */
export function settingsCards(params, present = {}, mcpStatus = { available: false, servers: [] }) {
  return {
    configDir: cacheRoot(),
    cards: [
      {
        id: 'image',
        title: '生图模型',
        page: 'models',
        kind: 'fields',
        fields: [
          maskField({ id: 'baseUrl', label: '接口地址（URL）', help: 'OpenAI 兼容端点填到 /v1；填 https://dashscope.aliyuncs.com 时自动走通义原生接口' }, params.image?.baseUrl),
          maskField({ id: 'model', label: '模型', help: '原样传给服务端，填什么用什么' }, params.image?.model),
          maskField({ id: 'apiKey', label: 'API Key', secret: true, help: '只存进 DSH 凭据库，不写任何配置文件' }, '', present['image.apiKey']),
        ],
        actions: [{ id: 'image-check', label: '检查配置' }],
      },
      {
        id: 'nature-image2ppt',
        title: 'OCR 模型',
        page: 'models',
        kind: 'fields',
        fields: IMAGE2PPT_FIELDS.map(field => maskField(field, '', present[field.path])),
        actions: [{ id: 'image2ppt-check', label: '检查 OCR 与生图' }],
      },
      {
        id: 'optional-search',
        title: '可选检索服务',
        page: 'research',
        kind: 'fields',
        autoSave: true,
        fields: OPTIONAL_FIELDS.map(field => maskField(field, '', present[field.path])),
      },
      {
        id: 'nature-figure',
        title: 'Nature 绘图',
        page: 'research',
        kind: 'fields',
        autoSave: true,
        fields: [{
          id: 'backend',
          label: '绘图后端',
          control: 'select',
          options: [{ value: 'python', label: 'Python' }, { value: 'r', label: 'R' }],
          value: params.natureFigure?.backend === 'r' ? 'r' : 'python',
          help: '技能按这个后端生成图；单次请求里明确要求其它语言时以请求为准',
        }],
      },
      {
        id: 'nature-academic-search',
        title: 'Nature 学术检索',
        page: 'research',
        kind: 'fields',
        autoSave: true,
        fields: ACADEMIC_FIELDS.map(field => maskField(field, getPath(params.natureAcademic, field.keys), field.path === undefined ? undefined : present[field.path])),
      },
      {
        id: 'nature-downloader',
        title: 'Nature 文献下载凭据',
        page: 'research',
        kind: 'fields',
        autoSave: true,
        fields: DOWNLOADER_FIELDS.map(field => maskField(field, getPath(params.natureDownloader, field.keys), field.path === undefined ? undefined : present[field.path])),
      },
      {
        id: 'patent',
        title: '专利检索向量模型',
        page: 'research',
        kind: 'fields',
        autoSave: true,
        fields: [
          maskField({ id: 'vault', label: 'Obsidian 专利库路径', help: '可选；技能把案例索引写进这个库，留空只用插件缓存目录' }, params.patent?.vault),
          {
            id: 'provider',
            label: '向量服务',
            control: 'select',
            options: [
              { value: '', label: '不启用（只用标签/字段检索）' },
              { value: 'zhipu', label: '智谱 embedding-3' },
              { value: 'dashscope', label: '通义 text-embedding-v3' },
              { value: 'openai', label: 'OpenAI text-embedding-3-small' },
              { value: 'local', label: '本地 sentence-transformers（bge-small-zh）' },
            ],
            value: text(params.patent?.embedding?.provider),
            help: '可选；启用后重建索引才能做语义检索',
          },
          maskField({ id: 'model', label: '模型', help: '留空用所选服务的默认模型' }, params.patent?.embedding?.model),
          maskField({ id: 'baseUrl', label: '接口地址（URL）', help: '留空用所选服务的默认地址' }, params.patent?.embedding?.baseUrl),
          maskField({ id: 'dimensions', label: '向量维度', help: '留空用所选服务的默认维度' }, params.patent?.embedding?.dimensions),
          maskField({ id: 'apiKey', label: 'API Key', secret: true, help: '只存进 DSH 凭据库；本地模型不需要' }, '', present['patent.embedding.apiKey']),
        ],
      },
      {
        id: 'runtime',
        title: '',
        page: 'runtime',
        kind: 'fields',
        autoSave: true,
        actionsPosition: 'top',
        fields: [
          {
            id: 'python',
            label: 'Python 解释器',
            control: 'inline-select',
            options: pythonOptions(params),
            value: text(params.python?.path),
          },
          ...environmentRows(params),
        ],
        actions: [{ id: 'runtime-check', label: '检查运行环境' }],
      },
    ],
    mcp: mcpStatus,
  }
}

/** 保存一张卡片：把表单值合并进参数，返回新参数；密钥空值表示保持原值。 */
export function saveSettingsCard(params, body) {
  const values = body?.values ?? {}
  const next = JSON.parse(JSON.stringify(params ?? {}))
  const secret = value => typeof value === 'string' && value.trim().length > 0

  if (body?.cardId === 'patent') {
    if (typeof values.vault === 'string') next.patent.vault = values.vault.trim()
    const provider = text(values.provider)
    if (!['', 'zhipu', 'dashscope', 'openai', 'local'].includes(provider)) throw new Error(`未知的向量服务：${provider}`)
    next.patent.embedding.provider = provider
    for (const key of ['model', 'baseUrl', 'dimensions']) {
      if (typeof values[key] === 'string') next.patent.embedding[key] = values[key].trim()
    }
    if (secret(values.apiKey)) next.patent.embedding.apiKey = values.apiKey.trim()
    return next
  }
  if (body?.cardId === 'runtime') {
    const chosen = text(values.python)
    if (chosen.length > 0 && !existsSync(chosen)) throw new Error(`Python 不存在：${chosen}`)
    next.python = { path: chosen }
    return next
  }
  if (body?.cardId === 'image') {
    if (typeof values.baseUrl === 'string') next.image.baseUrl = values.baseUrl.trim()
    if (typeof values.model === 'string') next.image.model = values.model.trim()
    if (secret(values.apiKey)) next.image.apiKey = values.apiKey.trim()
    return next
  }
  if (body?.cardId === 'nature-image2ppt') {
    if (secret(values.paddleOcrToken)) next.natureImage2ppt.paddleOcrToken = values.paddleOcrToken.trim()
    return next
  }
  if (body?.cardId === 'optional-search') {
    for (const field of OPTIONAL_FIELDS) {
      if (secret(values[field.id])) setPath(next, field.path.split('.'), values[field.id].trim())
    }
    return next
  }
  if (body?.cardId === 'nature-figure') {
    const backend = text(values.backend)
    if (!['python', 'r'].includes(backend)) throw new Error('绘图后端只能是 python 或 r')
    next.natureFigure.backend = backend
    return next
  }
  if (body?.cardId === 'nature-academic-search') {
    for (const field of ACADEMIC_FIELDS) {
      const value = values[field.id]
      if (field.secret === true && !secret(value)) continue
      if (typeof value === 'string') setPath(next, field.keys, value.trim())
    }
    return next
  }
  if (body?.cardId === 'nature-downloader') {
    for (const field of DOWNLOADER_FIELDS) {
      const value = values[field.id]
      if (field.secret === true && !secret(value)) continue
      if (typeof value === 'string') setPath(next, field.keys, value.trim())
    }
    return next
  }
  throw new Error(`未知的设置卡片：${body?.cardId}`)
}

/** 把密钥是否存在换算成 settingsCards 需要的 `present`。 */
export function presenceOf(present = {}) {
  const out = { ...present }
  for (const path of Object.keys(SECRET_REFS)) {
    if (out[path] === undefined) out[path] = false
  }
  return out
}

// ---------------- 检查动作 ----------------

function childEnv(params) {
  applySkillEnv(params)
  const env = { ...process.env }
  return env
}

async function runPython(params, args, cwd, timeout = 60_000) {
  const python = resolvePython(params)
  if (python.path.length === 0) throw new Error('未选择可用的系统 Python（设置 → 运行环境 → Python 解释器）')
  const result = await execFileAsync(python.path, args, {
    cwd,
    env: childEnv(params),
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  })
  return { python: python.path, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function excerpt(value, limit = 1200) {
  const valueText = String(value ?? '')
  return valueText.length > limit ? `${valueText.slice(0, limit)}\n…` : valueText
}

function skillDir(name) {
  // 设置页检查只针对内置技能：目录树里的 dir 是相对 skills/ 的 posix 路径。
  const catalog = JSON.parse(readFileSync(join(SKILLS_DIR, '..', 'catalog', 'catalog.json'), 'utf8'))
  const node = Object.values(catalog.skills ?? {}).find(item => item.name === name)
  if (node === undefined) throw new Error(`目录树里没有技能：${name}`)
  return join(SKILLS_DIR, ...String(node.dir).split(/[\\/]/).filter(Boolean))
}

export async function checkImageConfig(params) {
  const image = params?.image ?? {}
  const expected = /dashscope|aliyuncs|qianwenai|multimodal-generation/i.test(text(image.baseUrl)) ? 'qwen' : 'openai'
  const dir = skillDir('ppt-master')
  const script = join(dir, 'scripts', 'image_gen.py')
  if (!existsSync(script)) return { ok: false, detail: `找不到 ${script}` }
  try {
    const run = await runPython(params, [script, '--list-backends'], dir)
    const resolved = /Resolved backend:\s*(.+)/.exec(run.stdout)?.[1]?.trim() ?? ''
    return { ok: resolved === expected, detail: `后端：${resolved || '未配置'}（期望 ${expected}）`, output: excerpt(run.stdout) }
  } catch (error) {
    return { ok: false, detail: `检查失败：${String(error?.stderr ?? error?.message ?? error).slice(0, 600)}` }
  }
}

export async function checkImage2pptConfig(params) {
  const dir = skillDir('nature-image2ppt')
  const script = join(dir, 'cli', 'image2ppt', 'cli.py')
  try {
    const run = await runPython(params, [script, 'doctor'], dir, 120_000)
    const lines = run.stdout.split(/\r?\n/).filter(Boolean)
    const ok = /next:\s*no action needed/i.test(run.stdout) && !/config:.*missing/i.test(run.stdout)
    return { ok, detail: lines.slice(-4).join(' · ') || 'doctor 无输出', output: excerpt(run.stdout, 2000) }
  } catch (error) {
    return { ok: false, detail: `检查失败：${String(error?.stderr ?? error?.message ?? error).slice(0, 600)}` }
  }
}

export function checkPythonConfig(params) {
  const python = resolvePython(params)
  if (python.path.length === 0) return { ok: false, detail: `未选择可用的系统 Python：${python.source}` }
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

export function checkComponentsConfig(params, mcpController) {
  const parts = []
  let ok = true
  const python = resolvePython(params ?? {})
  if (python.path.length > 0) parts.push(`✓ 系统 Python ${python.version ?? ''} ${python.path}`)
  else { ok = false; parts.push(`✗ 未选择系统 Python（${python.source}）`) }
  for (const [label, found, required] of [
    ['officecli', which('officecli'), false],
    ['zotero-cli', which('zotero-cli'), false],
    ['lark-cli', which('lark-cli'), false],
    ['draw.io', resolveDrawio(), false],
    ['Polyspace', resolvePolyspace(), false],
  ]) {
    if (found === undefined) parts.push(`✗ ${label} 未找到`)
    else parts.push(`✓ ${label} ${found}`)
  }
  for (const field of [matlabMcpField(), windowsMcpField()]) {
    if (field.level === 'bad') ok = false
    parts.push(`${field.level === 'ok' ? '✓' : field.level === 'warn' ? '!' : '·'} ${field.label} ${field.value}`)
  }
  if (mcpController !== undefined) {
    for (const server of mcpController.status().servers ?? []) {
      parts.push(`· 已注册 ${server.name}：${server.state}${server.toolCount === undefined ? '' : `（${server.toolCount} 个工具）`}`)
    }
  }
  return { ok, detail: parts.join(' · ') }
}

export async function runSettingCheck(action, params, mcpController) {
  if (action === 'image-check') return checkImageConfig(params)
  if (action === 'image2ppt-check') return checkImage2pptConfig(params)
  if (action === 'runtime-check') {
    const detected = detectPythons({ force: true })
    const usable = detected.candidates.filter(item => item.ok === true)
    const ready = usable.filter(item => item.missing.length === 0).length
    const python = checkPythonConfig(params)
    const components = checkComponentsConfig(params, mcpController)
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

/** 打开运行期目录（只允许 cacheRoot 之内）。 */
export function openConfigTarget(target) {
  const base = resolve(cacheRoot())
  const dir = resolve(base, target === undefined || target === 'configDir' ? '' : String(target))
  if (dir !== base && !dir.startsWith(`${base}${sep}`)) throw new Error('只能打开插件缓存目录')
  if (!existsSync(dir)) throw new Error(`目录不存在：${dir}`)
  if (!openPath(dir)) throw new Error(`无法打开目录：${dir}`)
  return { opened: true, path: dir }
}
