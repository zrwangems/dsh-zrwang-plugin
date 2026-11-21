#!/usr/bin/env node
/**
 * ARS 组件与上游的对齐审计。
 *
 * 默认只读包内文件，检查 pin、目录完整性、命令正文、脚本引用；
 * 给出 `--upstream=<ARS 仓库检出>`（或环境变量 ARS_UPSTREAM）时，再逐个文件
 * 对照上游：列出缺失文件，并把“内容不同”分成可解释的 DSH 适配和真正的内容漂移。
 *
 * 用法：
 *   node scripts/audit-ars-alignment.mjs
 *   node scripts/audit-ars-alignment.mjs --upstream=../academic-research-skills --strict
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const ARS = join(ROOT, 'ars')
const args = process.argv.slice(2)
const upstreamArg = args.find(item => item.startsWith('--upstream='))
const upstreamInput = upstreamArg === undefined ? (process.env.ARS_UPSTREAM ?? '') : upstreamArg.slice('--upstream='.length)
const UPSTREAM = upstreamInput === '' ? '' : resolve(upstreamInput)
const strict = args.includes('--strict')

const problems = []
const notes = []
const fail = message => problems.push(message)

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const manifest = readJson(join(ROOT, 'catalog', 'ars.json'))
const lock = readJson(join(ROOT, 'vendor', 'upstreams.lock.json')).repos.find(repo => repo.id === 'ars')

// ---- 1 pin 与元数据 ----
if (lock === undefined) fail('lock 里没有 ars 记录')
else {
  if (manifest.upstream !== lock.repo) fail(`上游仓库不一致：${manifest.upstream} vs ${lock.repo}`)
  if (manifest.upstreamSha !== lock.sha) fail(`上游 SHA 不一致：${manifest.upstreamSha} vs ${lock.sha}`)
  if (!/^[0-9a-f]{40}$/.test(String(lock.sha))) fail(`lock SHA 不是 40 位：${lock.sha}`)
  if (manifest.upstreamVersion !== '3.24.4') notes.push(`上游版本：${manifest.upstreamVersion}（${manifest.upstreamSha.slice(0, 12)}）`)
}

// ---- 2 五个技能目录 ----
const skills = (manifest.skills ?? []).map(item => item.name)
if (skills.length !== 5) fail(`技能数不是 5：${skills.length}`)
const SHARED_REQUIRED = ['MODE_REGISTRY.md', 'ARCHITECTURE.md', 'dsh-runtime.md']
const PHASE_SCOPE = 'scripts/ars_phase_scope_manifest.json'
const phaseScopeCopies = []
for (const name of skills) {
  const dir = join(ARS, 'skills', name)
  if (!existsSync(join(dir, 'SKILL.md'))) {
    fail(`${name}: 缺 SKILL.md`)
    continue
  }
  for (const file of SHARED_REQUIRED) {
    if (!existsSync(join(dir, '_shared', file))) fail(`${name}: 缺 _shared/${file}`)
  }
  for (const sub of ['agents', 'references', 'templates']) {
    if (!existsSync(join(dir, sub))) fail(`${name}: 缺 ${sub}/`)
  }
  const phaseScope = join(dir, ...PHASE_SCOPE.split('/'))
  if (!existsSync(phaseScope)) fail(`${name}: 缺 ${PHASE_SCOPE}`)
  else phaseScopeCopies.push(readFileSync(phaseScope, 'utf8'))
  if (existsSync(join(dir, '_scripts'))) fail(`${name}: 残留 _scripts/`)
  const skillText = readFileSync(join(dir, 'SKILL.md'), 'utf8')
  if (!/^---\r?\n[\s\S]*?name:\s*[a-z0-9-]+/m.test(skillText)) fail(`${name}: SKILL.md frontmatter 缺少 name`)
}
if (new Set(phaseScopeCopies).size > 1) fail('五个技能里的 phase-scope 清单内容不一致')

// ---- 3 16 个命令与正文 ----
const commands = manifest.commands ?? []
if (commands.length !== 16) fail(`命令数不是 16：${commands.length}`)
for (const command of commands) {
  const file = join(ROOT, ...String(command.source).split('/'))
  if (!existsSync(file)) {
    fail(`/${command.name}: 源文件不存在（${command.source}）`)
    continue
  }
  const text = readFileSync(file, 'utf8')
  if (text.includes('${CLAUDE_PLUGIN_ROOT}')) fail(`/${command.name}: 残留 Claude 插件根占位符`)
  if (text.includes('Skill tool') || text.includes('skill 工具')) fail(`/${command.name}: 残留 Claude Skill 工具调用`)
  const prose = text.replace(/```[\s\S]*?```/g, '')
  if (prose.includes('``')) fail(`/${command.name}: 有连续反引号，行内代码坏了`)
  if (text.includes('python3 ')) fail(`/${command.name}: 仍写 python3`)
  if (!text.includes(`/${command.name}`) && !text.includes(command.name)) fail(`/${command.name}: 正文没有命令名`)
  if (!/Mode reference|模式/.test(text)) fail(`/${command.name}: 正文没有模式说明`)
  // 三个纯脚本工具命令在上游也没有模式页，不强制 MODE_REGISTRY。
  if (!['ars-cache-invalidate', 'ars-mark-read', 'ars-unmark-read'].includes(command.name) && !text.includes('_shared/MODE_REGISTRY.md')) {
    fail(`/${command.name}: 没有指向 MODE_REGISTRY`)
  }
}

// ---- 4 正文引用的脚本都在技能内 ----
const SCRIPT_REF = /scripts\/([A-Za-z0-9_./-]+\.py)/g
const ALLOW_MISSING = new Set(['plot_fig3.py'])
for (const name of skills) {
  const dir = join(ARS, 'skills', name)
  const missing = new Set()
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(md|json)$/.test(entry.name)) continue
      const text = readFileSync(full, 'utf8')
      for (const match of text.matchAll(SCRIPT_REF)) {
        const rel = match[1]
        // 测试/fixture 只在合同登记表里被点名，不属于运行时脚本。
        if (ALLOW_MISSING.has(rel) || /(^|\/)(tests?|fixtures)\//.test(rel) || /(^|\/)test_[^/]*\.py$/.test(rel)) continue
        if (!existsSync(join(dir, 'scripts', rel))) missing.add(rel)
      }
    }
  }
  walk(dir)
  if (missing.size > 0) fail(`${name}: 正文引用但技能内缺脚本 ${[...missing].slice(0, 5).join(', ')}${missing.size > 5 ? ` 等 ${missing.size} 个` : ''}`)
}

// ---- 5 对照上游（可选）----
function walkFiles(base) {
  const out = new Map()
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (['.git', '__pycache__', '.pytest_cache'].includes(entry.name)) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.set(relative(base, full).split('\\').join('/'), readFileSync(full, 'utf8'))
    }
  }
  walk(base)
  return out
}

const HEADER = /^> 输出语言（本 DSH 集成强制）.*\n(?:^>\n)?^> 多角色执行.*\n?/m
const bodyOf = text => {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)
  return (match === null ? text : text.slice(match[0].length)).replace(/^\n+/, '')
}
function normalize(text) {
  let value = text.replace(HEADER, '')
  value = value.replace(/_shared\//g, 'shared/')
  for (const name of skills) value = value.replaceAll(`../${name}/`, `${name}/`)
  value = value.replaceAll('python3 ', 'python ')
  // 跨技能链接在上游按仓库根写，插件按技能根改写后会多出若干 ../；比较时统一去掉。
  value = value.replace(new RegExp(`(?:\\.\\./)+(?=${skills.join('|')}/)`, 'g'), '')
  const swaps = [
    ['ask_user_question', 'AskUserQuestion'], ['web_search', 'WebSearch'], ['web_fetch', 'WebFetch'],
    ['skill 工具', 'Skill tool'], ['subagent 工具', 'Task tool'],
    ['Simplified Chinese', 'Traditional Chinese'], ['简体中文', '繁體中文'], ['Chinese-only', 'zh-TW-only'],
    ['EN / Chinese / bilingual', 'EN / zh-TW / bilingual'], ['default Chinese + EN', 'default zh-TW + EN'],
    ['Chinese Abstract (中文)', 'Chinese Abstract (zh-TW)'],
  ]
  for (const [from, to] of swaps) value = value.replaceAll(from, to)
  return value.replace(/^\n+/, '')
}

let compared = 0
let identical = 0
let adapted = 0
// 只有确实像一个 ARS 仓库检出时才逐文件对照，避免把当前目录误当上游。
const hasUpstream = UPSTREAM !== '' && skills.every(name => existsSync(join(UPSTREAM, name, 'SKILL.md')))
if (hasUpstream) {
  for (const name of skills) {
    const upstreamSkill = join(UPSTREAM, name)
    const upstreamShared = join(UPSTREAM, 'shared')
    const expected = new Map()
    for (const [rel, text] of walkFiles(upstreamSkill)) expected.set(rel, text)
    if (existsSync(upstreamShared)) {
      for (const [rel, text] of walkFiles(upstreamShared)) expected.set(`_shared/${rel}`, text)
    }
    const vendored = walkFiles(join(ARS, 'skills', name))
    const missing = [...expected.keys()].filter(rel => !vendored.has(rel))
    if (missing.length > 0) fail(`${name}: 上游有但插件缺 ${missing.length} 个文件（${missing.slice(0, 5).join(', ')}）`)
    const drift = []
    for (const [rel, text] of expected) {
      if (!vendored.has(rel)) continue
      compared += 1
      if (text === vendored.get(rel)) {
        identical += 1
        continue
      }
      if (normalize(bodyOf(text)) === normalize(bodyOf(vendored.get(rel)))) {
        adapted += 1
        continue
      }
      drift.push(rel)
    }
    if (drift.length > 0) {
      const message = `${name}: ${drift.length} 个文件与上游不同且不是已知适配（${drift.slice(0, 5).join(', ')}）`
      if (strict) fail(message)
      else notes.push(message)
    }
  }
  const upstreamPhaseScope = join(UPSTREAM, 'scripts', 'ars_phase_scope_manifest.json')
  if (!existsSync(upstreamPhaseScope)) fail('上游检出里没有 scripts/ars_phase_scope_manifest.json')
  else if (phaseScopeCopies.length > 0 && readFileSync(upstreamPhaseScope, 'utf8') !== phaseScopeCopies[0]) {
    fail('phase-scope 清单与上游不同（这个文件应当原样复制）')
  }
  notes.push(`上游对照：${compared} 个文件，原样 ${identical}，已知适配 ${adapted}`)
} else {
  notes.push('未提供上游检出（--upstream=... 或 ARS_UPSTREAM），跳过逐文件对照')
}

// ---- 输出 ----
for (const note of notes) process.stdout.write(`· ${note}\n`)
if (problems.length > 0) {
  process.stdout.write(`\nARS 对齐审计失败 ${problems.length} 项：\n`)
  for (const item of problems) process.stdout.write(`- ${item}\n`)
  process.exit(1)
}
process.stdout.write('\nARS 对齐审计通过\n')
