#!/usr/bin/env node
/**
 * 设置与插件运行时回归（不调用真实生图/OCR 接口）。
 *
 * 在隔离 DSH_HOME 下写入合成设置，验证：
 *   - 生图配置进入进程环境，ppt-master 桥接后 --list-backends 识别为 openai；
 *   - 能检测系统 Python 并自动选定一个，依赖校验可用；
 *   - python/python3/bash shim 与 BASH_ENV 已生成；
 *   - 生成配置写到插件配置目录，image2ppt 能读到。
 *
 * 用法：node scripts/verify-skill-config.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const WORK = join(ROOT, 'AgentsDo', 'upstream-adaptation-record', '.tmp', 'verify-skill-config')
rmSync(WORK, { recursive: true, force: true })
const HOME = join(WORK, 'home')
const STATE = join(WORK, 'state')
mkdirSync(join(HOME, 'zrwang-plugin-config'), { recursive: true })
writeFileSync(join(HOME, 'zrwang-plugin-config', 'settings.json'), `${JSON.stringify({
  image: { baseUrl: 'https://gateway.example/v1', model: 'verify-image-1', apiKey: 'sk-verify' },
  natureAcademic: {
    pubmed: { email: 'verify@example.org', apiKey: '' },
    unpaywall: { email: 'verify@example.org' },
    crossref: { mailto: 'verify@example.org' },
  },
  natureDownloader: {
    elsevier: { apiKey: 'verify-elsevier', instToken: 'verify-inst' },
    springer: { fulltextApiKey: 'verify-springer' },
    ieee: { apiKey: 'verify-ieee', fulltextEndpoint: 'https://example.org/fulltext/{doi}' },
  },
  natureImage2ppt: { paddleOcrToken: 'verify-ocr' },
  optional: { firecrawlApiKey: 'verify-firecrawl' },
}, null, 2)}\n`, 'utf8')
process.env.DSH_HOME = HOME
process.env.ZRWANG_PLUGIN_STATE_DIR = STATE

const failures = []
let passed = 0
function check(name, ok, detail) {
  if (ok) {
    passed += 1
    process.stdout.write(`ok   ${name}\n`)
    return
  }
  failures.push(`${name}${detail === undefined ? '' : `：${detail}`}`)
  process.stderr.write(`FAIL ${name}${detail === undefined ? '' : `：${detail}`}\n`)
}

const settings = await import('../host/skill-settings.mjs')
const ars = await import('../host/ars.mjs')
const detect = await import('../host/python-detect.mjs')
const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog', 'catalog.json'), 'utf8'))

const params = settings.currentParams({})
await settings.mirrorSkillFiles(params)
check('v2 设置读取', params.image.model === 'verify-image-1')
const detected = detect.detectPythons({ force: true })
check('检测到系统 Python', detected.candidates.length > 0, `${detected.candidates.length} 个`)
const runtime = ars.resolvePython(params)
check('自动选择可用的系统 Python', runtime.path.length > 0, runtime.source)
settings.applySkillEnv(params)
check('生图变量进入进程环境', process.env.ZRWANG_IMAGE_MODEL === 'verify-image-1' && process.env.ZRWANG_IMAGE_BASE_URL === 'https://gateway.example/v1')
check('科研环境变量进入进程环境',
  process.env.UNPAYWALL_EMAIL === 'verify@example.org' &&
  process.env.CROSSREF_MAILTO === 'verify@example.org' &&
  process.env.OPENROUTER_API_KEY === 'sk-verify' &&
  process.env.OPENROUTER_IMAGE_MODEL === 'verify-image-1' &&
  process.env.SCHEMATIC_IMAGE_API_URL === 'https://gateway.example/v1/images/generations' &&
  process.env.FIRECRAWL_API_KEY === 'verify-firecrawl' &&
  process.env.LIT_DL_SCHOOL_FILE === join(ROOT, 'skills', 'research', 'nature-skills', 'nature-downloader', 'config', 'school.json'))
check('不污染全局 OPENAI_API_KEY', process.env.OPENAI_API_KEY === undefined)
check('python 指向所选系统 Python', process.env.ZRWANG_SKILL_PYTHON === runtime.path, process.env.ZRWANG_SKILL_PYTHON)
check('BASH_ENV 指向 state/bin', typeof process.env.BASH_ENV === 'string' && process.env.BASH_ENV.replace(/\\/g, '/').endsWith('state/bin/bash-env.sh'))
for (const name of ['python.cmd', 'python3.cmd', 'bash.cmd', 'sh.cmd', 'bash-env.sh']) {
  check(`shim 存在 ${name}`, existsSync(join(ars.SHIM_DIR, name)))
}

const image = await settings.checkImageConfig(catalog, {})
check('ppt-master 生图配置生效', image.ok === true, image.detail)
const py = await settings.checkPythonConfig({})
check('所选 Python 依赖检查', py.ok === true, py.detail)
const i2p = await settings.checkImage2pptConfig(catalog, {})
check('image2ppt 读插件配置目录', i2p.ok === true, i2p.detail)
const dlDir = join(HOME, 'zrwang-plugin-config', 'nature-downloader')
const credentials = JSON.parse(readFileSync(join(dlDir, 'credentials.json'), 'utf8'))
check('下载凭据写入 credentials.json',
  credentials.elsevier?.api_key === 'verify-elsevier' &&
  credentials.elsevier?.insttoken === 'verify-inst' &&
  credentials.springer_nature?.fulltext_api_key === 'verify-springer' &&
  credentials.ieee?.fulltext_endpoint === 'https://example.org/fulltext/{doi}')
const schoolFile = join(ROOT, 'skills', 'research', 'nature-skills', 'nature-downloader', 'config', 'school.json')
const school = JSON.parse(readFileSync(schoolFile, 'utf8'))
check('学校配置为技能目录内固定北航配置', school.school?.name === '北京航空航天大学' && school.auth?.sso_domain === 'sso.buaa.edu.cn' && school.discovery?.resource_entry_url === 'https://lib.buaa.edu.cn/')
check('学校配置不复制到插件配置目录', !existsSync(join(dlDir, 'school.json')))
const dlSettings = JSON.parse(readFileSync(join(dlDir, 'settings.json'), 'utf8'))
check('Unpaywall 邮箱写入 settings.json', dlSettings.open_access?.contact_email === 'verify@example.org')
const comp = settings.checkComponentsConfig()
process.stdout.write(`info 组件：${comp.detail}\n`)

process.stdout.write(`\nverify-skill-config: ${passed} 项通过\n`)
if (failures.length > 0) {
  process.stderr.write(`失败 ${failures.length} 项\n`)
  process.exit(1)
}
