#!/usr/bin/env node
/**
 * 技能配置接入审计。
 *
 * 以 catalog/catalog.json 的 329 个技能为准，逐技能扫描：
 *   - C 盘/用户目录/技能目录配置文件；
 *   - 环境变量与 API Key/Token；
 *   - 外部 CLI、宿主专用工具名、Windows 不兼容命令；
 *   - 上游仓库根相对路径。
 *
 * 按 vendor/skill-config-rules.json 的 profile 与逐技能处置判定状态：
 *   no-config / configured / optional / unavailable / needs-fix
 *
 * 默认只打印汇总；`--markdown`/`--json` 把逐技能矩阵打到 stdout，不落盘。
 * --check 时若有 needs-fix 或未处置的命中，返回非零。
 *
 * 用法：
 *   node scripts/audit-skill-config.mjs
 *   node scripts/audit-skill-config.mjs --check
 *   node scripts/audit-skill-config.mjs --markdown
 *   node scripts/audit-skill-config.mjs --json
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')
const MARKDOWN_OUT = process.argv.includes('--markdown')
const JSON_OUT = process.argv.includes('--json')
const NL = String.fromCharCode(10)

const SCAN_EXTS = new Set([
  '.md', '.markdown', '.py', '.js', '.mjs', '.cjs', '.sh', '.ps1', '.cmd', '.bat',
  '.json', '.yaml', '.yml', '.toml', '.txt', '.m',
])
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', '.pytest_cache', '.github', 'ci', '.vscode',
  'templates', 'assets', 'icons', 'sounds', 'images', 'examples', 'svg_output', 'projects',
  'style_previews', 'reference', 'reference-images', 'charts', 'decks', 'layouts', 'styles',
  'brands', 'schemas', 'scaffolds', 'renderers', 'recipes', 'brand-marks', 'locales', 'migrations',
])
const MAX_FILE = 1_500_000

const PATTERNS = {
  home: /(Path\.home\(\s*\)|os\.homedir\(\s*\)|expanduser\(|USERPROFILE|LOCALAPPDATA|APPDATA|PROGRAMFILES|~\/\.|~\\\\\.|\\\\Users\\\\|\.claude\/|\.claude\\\\|\.codex\/|CODEX_AUTH_FILE|\.patent-disclosure-skill|\.ppt-master|\.image2ppt|\.config\/nature|Documents\/patent-disclosure-skill)/,
  configFile: /(\.env\b|config\.toml|config\.yaml|credentials\.json|settings\.json|auth\.json|\.secrets\.yaml|config\.example)/,
  env: /(os\.environ|getenv\(|process\.env|\$env:|export\s+[A-Z][A-Z0-9_]+\s*=)/,
  apiKey: /([A-Z][A-Z0-9_]{2,}_(API_KEY|TOKEN|BASE_URL|APIKEY|SECRET)|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|OPENROUTER_API_KEY|MINIMAX_API_KEY|PADDLE_OCR_TOKEN|NCBI_API_KEY)/,
  cli: /(officecli|zotero-cli|drawio|magick|convert\.exe|jq\b|npx\s|npm\s|playwright|polyspace|matlab|simulink)/i,
  hostTool: /(AskUserQuestion|WebSearch|WebFetch|TodoWrite|Task tool|Skill tool|PLAN tool|CLAUDE\.md|claude code|codex-cli|\.codex|CODEX_)/i,
  winPath: /(C:\\\\|D:\\\\|WindowsApps)/,
  python3: /\bpython3\b/,
  bash: /(```bash|\bbash\b|\brm -rf\b|\bchmod\b)/,
  repoPath: /(skills\/ppt-master\/|skills\/<|\.\.\/shared\/|shared\/[A-Za-z_-]+\.(md|py|json))/,
}

export const STATUS_LABELS = {
  'no-config': '无需配置',
  configured: '已接入设置',
  optional: '可选配置',
  unavailable: '不可用',
  'needs-fix': '需修复',
  unreviewed: '待处置',
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function normalizeDir(value) {
  return String(value).split(sep).join('/')
}

function profileOf(skill) {
  const dir = normalizeDir(skill.dir)
  if (dir.startsWith('engineering/matlab/') || dir.startsWith('engineering/simulink/') || dir.startsWith('engineering/playground/')) return 'matlab'
  if (dir.startsWith('engineering/polyspace/')) return 'polyspace'
  if (dir.startsWith('office/officecli/')) return 'officecli'
  if (dir === 'office/ppt-master') return 'ppt-master'
  if (dir.startsWith('research/nature-skills/')) return 'nature'
  if (dir.startsWith('research/patent/')) return 'patent'
  if (dir === 'research/zotero-cli') return 'zotero'
  if (dir === 'research/supervisor-skills/drawio-reconstruction') return 'drawio'
  if (dir.startsWith('research/supervisor-skills/')) return 'supervisor'
  if (dir.startsWith('research/nsfc/')) return 'nsfc'
  if (dir.startsWith('office/lark/')) return 'lark'
  if (dir.startsWith('office/')) return 'office-other'
  if (dir.startsWith('research/')) return 'research-other'
  return 'engineering-other'
}

function walkFiles(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walkFiles(full, out)
      continue
    }
    if (!SCAN_EXTS.has(extname(entry.name).toLowerCase())) continue
    try {
      if (statSync(full).size > MAX_FILE) continue
    } catch {
      continue
    }
    out.push(full)
  }
  return out
}

function scanSkill(dir) {
  const hits = {}
  const files = walkFiles(dir)
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const rel = relative(dir, file).split(sep).join('/')
    for (const [key, pattern] of Object.entries(PATTERNS)) {
      if (!pattern.test(text)) continue
      hits[key] ??= []
      if (hits[key].length < 6) hits[key].push(rel)
    }
  }
  return { files: files.length, hits }
}

function unexpectedHits(hits, ignored) {
  const result = {}
  for (const [key, files] of Object.entries(hits)) {
    if (ignored.includes(key)) continue
    result[key] = files
  }
  return result
}

function main() {
  const rules = readJson(join(ROOT, 'vendor', 'skill-config-rules.json'))
  const catalog = readJson(join(ROOT, 'catalog', 'catalog.json'))
  const names = Object.keys(catalog.skills).sort()
  const rows = []
  const unresolved = []

  for (const name of names) {
    const skill = catalog.skills[name]
    const profileId = skill.profile ?? profileOf(skill)
    const profile = rules.profiles[profileId]
    if (profile === undefined) throw new Error(`规则缺 profile：${profileId}`)
    const override = rules.skillOverrides?.[name] ?? {}
    const dir = join(ROOT, 'skills', ...normalizeDir(skill.dir).split('/'))
    const scan = existsSync(dir) ? scanSkill(dir) : { files: 0, hits: {} }
    const ignored = [...(profile.ignore ?? []), ...(override.ignore ?? [])]
    const unexpected = unexpectedHits(scan.hits, ignored)
    const disposition = rules.dispositions?.[name] ?? {}
    const status = disposition.status ?? override.status ?? (Object.keys(unexpected).length > 0 ? 'unreviewed' : profile.status)
    const modules = disposition.modules ?? override.modules ?? profile.modules ?? []
    const note = disposition.note ?? override.note ?? profile.note ?? ''
    const check = disposition.check ?? override.check ?? profile.check ?? ''
    if (status === 'needs-fix' || status === 'unreviewed') unresolved.push(name)
    rows.push({
      name,
      dir: normalizeDir(skill.dir),
      group: skill.group ?? '',
      profile: profileId,
      status,
      modules,
      hits: Object.fromEntries(Object.entries(scan.hits).map(([key, files]) => [key, files.length])),
      unexpected,
      note,
      check,
      files: scan.files,
    })
  }

  const components = (rules.components ?? []).map(item => ({ ...item }))
  const summary = {}
  for (const row of rows) summary[row.status] = (summary[row.status] ?? 0) + 1
  for (const item of components) summary[item.status] = (summary[item.status] ?? 0) + 1

  const json = {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalSkills: rows.length,
    totalComponents: components.length,
    summary,
    rows,
    components,
  }

  const md = []
  md.push('# 技能与组件配置覆盖矩阵')
  md.push('')
  md.push(`生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}；技能 ${rows.length} 个，组件 ${components.length} 个。`)
  md.push('')
  md.push('状态：`无需配置` / `已接入设置` / `可选配置` / `不可用` / `需修复` / `待处置`。')
  md.push('')
  md.push('## 汇总')
  md.push('')
  md.push('| 状态 | 数量 |')
  md.push('| --- | --- |')
  for (const [status, count] of Object.entries(summary).sort((a, b) => a[0].localeCompare(b[0]))) {
    md.push(`| ${STATUS_LABELS[status] ?? status} | ${count} |`)
  }
  md.push('')
  md.push('## 组件')
  md.push('')
  md.push('| 组件 | 状态 | 配置/依赖 | 处置与验证 |')
  md.push('| --- | --- | --- | --- |')
  for (const item of components) {
    md.push(`| ${item.name} | ${STATUS_LABELS[item.status] ?? item.status} | ${(item.modules ?? []).join('、') || '-'} | ${item.note ?? ''} ${item.check ?? ''} |`)
  }
  md.push('')
  md.push('## 技能')
  md.push('')
  md.push('| 技能 | 目录 | 模块 | 状态 | 命中 | 处置/依据 | 验证 |')
  md.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const row of rows) {
    const hitText = Object.entries(row.hits).map(([key, count]) => `${key}:${count}`).join(' ') || '-'
    const bad = Object.entries(row.unexpected).map(([key, files]) => `${key}(${files.slice(0, 2).join(',')})`).join('；')
    const note = [row.note, bad.length > 0 && row.status !== 'unreviewed' ? `额外命中：${bad}` : ''].filter(Boolean).join('；')
    md.push(`| ${row.name} | \`${row.dir}\` | ${row.modules.join('、') || '-'} | ${STATUS_LABELS[row.status] ?? row.status} | ${hitText} | ${note.replaceAll('|', '/')} | ${row.check.replaceAll('|', '/')} |`)
  }
  md.push('')
  const skillSummary = {}
  for (const row of rows) skillSummary[row.status] = (skillSummary[row.status] ?? 0) + 1
  const componentSummary = {}
  for (const item of components) componentSummary[item.status] = (componentSummary[item.status] ?? 0) + 1

  console.log(`技能 ${rows.length} 个：${Object.entries(skillSummary).map(([status, count]) => `${STATUS_LABELS[status] ?? status}=${count}`).join('  ')}`)
  console.log(`组件 ${components.length} 个：${Object.entries(componentSummary).map(([status, count]) => `${STATUS_LABELS[status] ?? status}=${count}`).join('  ')}`)
  if (unresolved.length > 0) {
    console.log(`\n待处置/需修复 ${unresolved.length} 个：`)
    for (const name of unresolved) {
      const row = rows.find(item => item.name === name)
      const keys = Object.keys(row.unexpected).join(',')
      console.log(`  - ${name} [${row.profile}] ${keys}`)
    }
  }
  if (MARKDOWN_OUT) console.log(`${NL}${md.join(NL)}`)
  if (JSON_OUT) console.log(JSON.stringify(json, null, 2))
  if (CHECK && unresolved.length > 0) process.exit(1)
}

main()
