#!/usr/bin/env node
/**
 * 用 Google 翻译重新生成技能中文详情（catalog/skill-details.zh.json）。
 *
 * 背景：早期版本的详情是 LLM 批量翻译的，部分条目在生成时被截断（结尾停在半句），
 * 详情面板会出现"话没说完"。这里改成机器翻译：
 *   - 只翻译每个技能 SKILL.md frontmatter 里的 description（本身是完整的一句话/段），
 *     不碰正文与代码，避免代码块被翻译坏；
 *   - 单条超长时按句子切块分别翻译再拼接；
 *   - 走 translate.googleapis.com 的免费接口，需要代理时用 --proxy 指定（默认读
 *     DSH_GT_PROXY，为空则直连）；
 *   - 结果逐条缓存到 AgentsDo/gt-cache/，中断后重跑只补缺失的。
 *
 * 用法：
 *   node scripts/gen-skill-details.mjs --proxy=http://127.0.0.1:7897
 *   node scripts/gen-skill-details.mjs --only=ppt-master,matlab-fit-curve
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { frontValue } from '../host/skill-md.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS = join(ROOT, 'skills')
const CATALOG = join(ROOT, 'catalog', 'catalog.json')
const DETAILS = join(ROOT, 'catalog', 'skill-details.zh.json')
const CACHE = resolve(ROOT, '..', 'AgentsDo', 'gt-cache')

const args = process.argv.slice(2)
const proxyArg = args.find(arg => arg.startsWith('--proxy='))
const proxy = proxyArg === undefined ? (process.env.DSH_GT_PROXY ?? '') : proxyArg.slice('--proxy='.length)
const onlyArg = args.find(arg => arg.startsWith('--only='))
const only = onlyArg === undefined ? undefined : new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean))
/** 只重翻"看起来有问题"的条目：带 Markdown 残留、或被截断。 */
const repair = args.includes('--repair')
/** 只补 catalog/skills.zh.extra.txt 里缺的中文短说明（vendor 落盘后、gen-catalog 之前跑）。 */
const scanExtras = args.includes('--scan-extras')
const EXTRA_FILE = join(ROOT, 'catalog', 'skills.zh.extra.txt')
const LEGACY_ZH = join(ROOT, 'catalog', 'legacy', 'skills.zh.txt')

function log(text) {
  process.stdout.write(`${text}\n`)
}

function fail(text) {
  process.stderr.write(`错误：${text}\n`)
  process.exit(1)
}

/** 读 SKILL.md 的 frontmatter description（复用宿主同一套解析，支持折叠块）。 */
function readDescription(text) {
  return frontValue(text, 'description')
}

/** 清理成适合机器翻译的纯文本：去代码块/行内代码/链接/多余空白。 */
function prepare(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 按句子边界切块，避免单次请求过长。 */
function chunk(text, size = 1600) {
  const sentences = text.split(/(?<=[.!?。！？])\s+/)
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    if (current.length + sentence.length + 1 <= size) {
      current = current.length === 0 ? sentence : `${current} ${sentence}`
      continue
    }
    if (current.length > 0) chunks.push(current)
    current = sentence.slice(0, size)
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/** 调一次 Google 翻译（gettext 免费接口）。 */
function translateOnce(text) {
  const url = new URL('https://translate.googleapis.com/translate_a/single')
  url.searchParams.set('client', 'gtx')
  url.searchParams.set('sl', 'en')
  url.searchParams.set('tl', 'zh-CN')
  url.searchParams.set('dt', 't')
  url.searchParams.set('q', text)
  const argv = ['-s', '--max-time', '30', '--url', url.toString()]
  if (proxy.length > 0) argv.push('-x', proxy)
  let attempt = 0
  for (;;) {
    attempt += 1
    try {
      const out = execFileSync('curl', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      const data = JSON.parse(out)
      const parts = Array.isArray(data?.[0]) ? data[0] : []
      const translated = parts.map(item => (Array.isArray(item) ? item[0] : '')).filter(Boolean).join('')
      if (translated.trim().length === 0) throw new Error('翻译结果为空')
      return translated.trim()
    } catch (error) {
      if (attempt >= 3) throw new Error(`翻译失败：${String(error?.message ?? error).slice(0, 200)}`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800 * attempt)
    }
  }
}

function translate(text) {
  return chunk(text).map(part => translateOnce(part)).join('')
}

/** 详情是否"看起来有问题"：带 Markdown 标题/代码块残留，或结尾停在半句。 */
function looksBad(text) {  const value = typeof text === 'string' ? text.trim() : ''
  if (value.length === 0) return true
  if (/(^|\n)\s*#{1,6}\s|```|\*\*/.test(value)) return true
  if (/[。！？!?…」』）)\]】"”’]$/.test(value)) return false
  return /[（(，,、：:；;]$/.test(value)
    || /[\u4e00-\u9fff](的|和|与|在|或|可以|需要|时|为|是|用|从|对|把|被|得|地|能|会|要|让|请|若|当)$/.test(value)
}

/** 正文兜底：去掉 Markdown 标题/列表符号/代码块，取到句号结尾的一段。 */
function bodyExcerpt(text) {
  const body = text.replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  const cut = body.search(/[。.!?]\s/)
  return cut >= 0 ? body.slice(0, cut + 1) : body.slice(0, 600)
}

function cacheFile(name) {
  return join(CACHE, `${name}.json`)
}

function readCache(name) {
  try {
    const value = JSON.parse(readFileSync(cacheFile(name), 'utf8'))
    return typeof value.zh === 'string' && value.zh.length > 0 ? value.zh : undefined
  } catch {
    return undefined
  }
}

function writeCache(name, zh) {
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(cacheFile(name), `${JSON.stringify({ name, zh })}\n`, 'utf8')
}

/** 文本是否已经以中文为主：是就不再送翻译（避免中文被当英文翻坏）。 */
function mostlyChinese(text) {
  const value = String(text ?? '')
  const cjk = (value.match(/[\u4e00-\u9fff]/g) ?? []).length
  return value.length > 0 && cjk / value.length >= 0.15
}

/** 生成一行中文短说明：取第一句，压到 42 字以内。 */
function shortSummary(text) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (value.length === 0) return ''
  const first = value.split(/(?<=[。！？；;.!?])\s*/)[0] ?? value
  const plain = first.replace(/[`*#>]/g, '').replace(/[|]/g, ' ').trim()
  return plain.length > 42 ? `${plain.slice(0, 42)}…` : plain
}

/** 递归列出所有技能目录：命中含 SKILL.md 的目录后不再往里钻（内嵌副本不算独立技能）。 */
function listSkillDirsOnDisk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const child = join(dir, entry.name)
    if (existsSync(join(child, 'SKILL.md'))) {
      out.push(child)
      continue
    }
    listSkillDirsOnDisk(child, out)
  }
  return out
}

/** 读旧中文表 + extra 表里已登记的技能名。 */
function readKnownZhNames() {
  const names = new Set()
  for (const file of [LEGACY_ZH, EXTRA_FILE]) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (line.startsWith('#') || line.trim().length === 0) continue
      const name = line.split('\t')[0].trim()
      if (name.length > 0) names.add(name)
    }
  }
  return names
}

/** vendor 落盘后、gen-catalog 之前：给缺中文短说明的新技能补行。 */
function runScanExtras() {
  const known = readKnownZhNames()
  const added = []
  for (const dir of listSkillDirsOnDisk(SKILLS)) {
    const text = readFileSync(join(dir, 'SKILL.md'), 'utf8')
    const name = frontValue(text, 'name')
    if (!name || known.has(name)) continue
    const source = prepare(frontValue(text, 'description')) || prepare(bodyExcerpt(text))
    if (source.length === 0) fail(`没有可翻译的描述：${name}`)
    const zh = mostlyChinese(source) ? source : (() => {
      const hit = readCache(name)
      if (hit !== undefined) return hit
      const value = translate(source)
      writeCache(name, value)
      return value
    })()
    const summary = shortSummary(zh)
    if (summary.length === 0) fail(`生成的短说明为空：${name}`)
    added.push(`${name}\t${summary}`)
    known.add(name)
    if (added.length % 20 === 0) log(`  已补 ${added.length} 条短说明`)
  }
  if (added.length === 0) {
    log('短说明没有缺失')
    return
  }
  const body = readFileSync(EXTRA_FILE, 'utf8').trimEnd()
  writeFileSync(EXTRA_FILE, `${body}\n\n# ---- 2026-10 新增仓库（Google 翻译自动生成）----\n${added.join('\n')}\n`, 'utf8')
  log(`已追加 ${added.length} 条中文短说明到 ${EXTRA_FILE}`)
}

function main() {
  if (scanExtras) {
    runScanExtras()
    return
  }
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'))
  const previous = existsSync(DETAILS) ? JSON.parse(readFileSync(DETAILS, 'utf8')) : {}
  const names = Object.keys(catalog.skills ?? {}).sort()
  if (names.length === 0) fail('catalog.json 里没有技能')
  const results = {}
  let translated = 0
  let cached = 0
  let fallback = 0
  const failures = []
  for (const name of names) {
    if (only !== undefined && !only.has(name)) {
      if (typeof previous[name] === 'string') results[name] = previous[name]
      continue
    }
    const hit = readCache(name)
    if (hit !== undefined && (repair !== true || !looksBad(hit))) {
      results[name] = hit
      cached += 1
      continue
    }
    const dir = join(SKILLS, ...String(catalog.skills[name].dir ?? '').split('/').filter(Boolean))
    const file = join(dir, 'SKILL.md')
    if (!existsSync(file)) {
      failures.push(`${name}: 缺 SKILL.md（${dir}）`)
      if (typeof previous[name] === 'string') results[name] = previous[name]
      continue
    }
    const text = readFileSync(file, 'utf8')
    const description = prepare(readDescription(text))
    const source = description.length >= 40 ? description : prepare(bodyExcerpt(text))
    if (source.length === 0) {
      failures.push(`${name}: 没有可翻译的描述`)
      if (typeof previous[name] === 'string') results[name] = previous[name]
      continue
    }
    try {
      const zh = mostlyChinese(source) ? source : translate(source)
      results[name] = zh
      writeCache(name, zh)
      translated += 1
      if (translated % 10 === 0) log(`  已翻译 ${translated} 条（${name}）`)
      // 免费接口限流较严，逐条之间留一点间隔
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150)
    } catch (error) {
      failures.push(`${name}: ${String(error?.message ?? error).slice(0, 120)}`)
      if (typeof previous[name] === 'string') {
        results[name] = previous[name]
        fallback += 1
      }
    }
  }
  const missing = names.filter(name => only === undefined || only.has(name)).filter(name => typeof results[name] !== 'string')
  if (missing.length > 0) fail(`以下技能没有中文详情，未写入：${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`)
  const ordered = {}
  for (const name of names) ordered[name] = results[name]
  writeFileSync(DETAILS, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8')
  log(`完成：共 ${names.length} 条；本次翻译 ${translated} 条，缓存命中 ${cached} 条，沿用旧值 ${fallback} 条`)
  if (failures.length > 0) log(`失败 ${failures.length} 条：${failures.slice(0, 5).join('；')}`)
  log(`写入 ${DETAILS}`)
}

main()
