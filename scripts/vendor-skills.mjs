#!/usr/bin/env node
/**
 * 从上游 GitHub 仓库收拢技能实体到本包 skills/ 下。
 *
 * 用法：
 *   node scripts/vendor-skills.mjs                # 全量下载/更新
 *   node scripts/vendor-skills.mjs --no-network   # 仍走缓存 tarball（离线重试）
 *   node scripts/vendor-skills.mjs --only=nature  # 只处理一个上游
 *
 * 规则：
 *   - 只拷贝技能目录，不带 .git / node_modules / __pycache__；
 *   - 同名技能（frontmatter name 或目录名）出现冲突立即失败；
 *   - 旧树里的用户配置（.env、config.yaml 等）在重建前收集、重建后回填；
 *   - 旧 skills/ 不永久删除，移到 AgentsDo 的过程目录 trash/ 下。
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { arsParams, writeArsRuntimeNotes } from '../host/ars.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const WORK = resolve(ROOT, '..', 'AgentsDo', 'skill-management-20261027')
const CACHE = join(WORK, 'tmp', 'tarballs')
const EXTRACT = join(WORK, 'tmp', 'extract')
const STAGE = join(WORK, 'tmp', 'skills-stage')
const TRASH = join(WORK, 'trash')
const SKILLS = join(ROOT, 'skills')
const LOCK = join(ROOT, 'vendor', 'upstreams.lock.json')

/** 需要跨重建保留的用户配置文件（相对技能根）。 */
const PRESERVE_NAMES = new Set([
  '.env', '.env.local', 'config.yaml', 'config.toml', 'credentials.json', 'settings.json', 'school.json',
])

/** 拷贝时排除的非技能内容。 */
const EXCLUDE = new Set(['.git', '.github', 'node_modules', '__pycache__', '.venv', '.pytest_cache', '.DS_Store'])

const args = process.argv.slice(2)
const noNetwork = args.includes('--no-network')
const onlyArg = args.find(a => a.startsWith('--only='))
const only = onlyArg === undefined
  ? undefined
  : new Set(onlyArg.slice('--only='.length).split(',').map(item => item.trim()).filter(Boolean))
const skipArg = args.find(a => a.startsWith('--skip='))
const skip = new Set(skipArg === undefined ? [] : skipArg.slice('--skip='.length).split(',').filter(Boolean))

function log(message) {
  process.stdout.write(`${message}\n`)
}

function fail(message) {
  process.stderr.write(`错误：${message}\n`)
  process.exit(1)
}

function parseFrontmatterName(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (match === null) return undefined
  const line = /^name:\s*(.+)$/m.exec(match[1])
  if (line === null) return undefined
  return line[1].trim().replace(/^['"]|['"]$/g, '')
}

function parseFrontmatterDescription(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (match === null) return undefined
  const block = match[1]
  const plain = /^description:\s*(.+)$/m.exec(block)
  if (plain !== null) return plain[1].trim().replace(/^['"]|['"]$/g, '')
  const folded = /^description:\s*[>|]-?\s*\r?\n((?:[ \t]+.*(?:\r?\n|$))+)/m.exec(block)
  if (folded === null) return undefined
  return folded[1].split(/\r?\n/).map(l => l.trim()).filter(Boolean).join(' ')
}

function walkFiles(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, base, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

/** 收集旧树里的用户配置，键为相对 skills/ 的路径。 */
function collectPreserved() {
  const preserved = new Map()
  if (!existsSync(SKILLS)) return preserved
  for (const file of walkFiles(SKILLS)) {
    if (!PRESERVE_NAMES.has(file.split(sep).pop())) continue
    const rel = relative(SKILLS, file).split(sep).join('/')
    preserved.set(rel, readFileSync(file))
  }
  return preserved
}

function applySkillPatches(root) {
  const file = join(ROOT, 'vendor', 'skill-patches.json')
  if (!existsSync(file)) return
  const document = JSON.parse(readFileSync(file, 'utf8'))
  for (const patch of document.patches ?? []) {
    for (const entry of patch.files ?? []) {
      const target = join(root, ...entry.path.split('/'))
      if (!existsSync(target)) fail(`补丁目标不存在：${entry.path}`)
      let text = readFileSync(target, 'utf8')
      for (const change of entry.replace ?? []) {
        // 幂等：已经改写过的文件不再重复替换（局部更新会重复跑补丁）。
        if (!text.includes(change.find)) {
          if (text.includes(change.to)) continue
          fail(`补丁不适用（上游结构变了）：${entry.path}`)
        }
        text = text.split(change.find).join(change.to)
      }
      writeFileSync(target, text, 'utf8')
    }
  }
  log(`已应用技能补丁 ${document.patches?.length ?? 0} 组`)
}

function restorePreserved(stage, preserved) {
  let restored = 0
  for (const [rel, bytes] of preserved) {
    const target = join(stage, ...rel.split('/'))
    if (!existsSync(resolve(target, '..'))) continue
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, bytes)
    restored += 1
  }
  return restored
}

function run(command, argv, options = {}) {
  return execFileSync(command, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
}

function resolveSha(repo, ref) {
  const out = run('git', ['ls-remote', `https://github.com/${repo}.git`, `refs/heads/${ref}`])
  const sha = out.split(/\s+/)[0]
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) fail(`无法解析 ${repo} ${ref} 的 SHA：${out.slice(0, 200)}`)
  return sha
}

async function download(repo, sha) {
  mkdirSync(CACHE, { recursive: true })
  const file = join(CACHE, `${repo.replace('/', '__')}__${sha}.tar.gz`)
  if (existsSync(file) && statSync(file).size > 0) return file
  if (noNetwork) throw new Error(`缓存缺失：${file}`)
  const url = `https://codeload.github.com/${repo}/tar.gz/${sha}`
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      log(`  下载 ${url}`)
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length < 1024) throw new Error(`文件过小（${bytes.length} 字节）`)
      writeFileSync(file, bytes)
      log(`  完成 ${(bytes.length / 1024 / 1024).toFixed(1)} MB`)
      return file
    } catch (error) {
      if (attempt === 3) throw new Error(`下载失败 ${repo}: ${String(error?.message ?? error)}`)
      await new Promise(r => setTimeout(r, 1500 * attempt))
    }
  }
  return file
}

function extractTarball(file, name) {
  const dir = join(EXTRACT, name)
  const root = join(dir, 'root')
  mkdirSync(root, { recursive: true })
  // GNU tar（Git for Windows）会把 `D:\...` 里的冒号当成远程主机名，也会转义反斜杠；
  // 用 cwd + 正斜杠相对路径最稳。
  const rel = relative(root, file).split(sep).join('/')
  run('tar', ['-xzf', rel], { cwd: root })
  const tops = readdirSync(root).filter(n => statSync(join(root, n)).isDirectory())
  if (tops.length !== 1) fail(`tarball 结构异常：${file} -> ${tops.join(', ')}`)
  return join(root, tops[0])
}

/** 克隆一个仓库（codeload 卡住时的兜底）。 */
function cloneRepo(cfg) {
  const cloneDir = join(EXTRACT, cfg.id, 'clone')
  if (existsSync(join(cloneDir, '.git'))) {
    log(`  复用已有 clone：${cfg.id}`)
    return cloneDir
  }
  rmSync(cloneDir, { recursive: true, force: true })
  mkdirSync(join(EXTRACT, cfg.id), { recursive: true })
  log(`  git clone --depth 1 ${cfg.repo}`)
  run('git', ['clone', '--depth', '1', '--single-branch', '--branch', cfg.ref ?? 'main', `https://github.com/${cfg.repo}.git`, cloneDir])
  return cloneDir
}

function copySkill(srcDir, destDir) {
  if (destDir.length > 250) fail(`目标路径过长（${destDir.length}）：${destDir}`)
  if (destDir.length > 230) log(`  警告：路径较长（${destDir.length}）`)
  mkdirSync(destDir, { recursive: true })
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue
    const src = join(srcDir, entry.name)
    const dest = join(destDir, entry.name)
    cpSync(src, dest, {
      recursive: true,
      filter: path => !EXCLUDE.has(path.split(sep).pop()),
    })
  }
}

function readSkillMeta(dir) {
  const file = join(dir, 'SKILL.md')
  if (!existsSync(file)) return undefined
  const text = readFileSync(file, 'utf8')
  if (text.startsWith('version https://git-lfs')) fail(`SKILL.md 是 LFS 指针：${file}`)
  const name = parseFrontmatterName(text)
  const description = parseFrontmatterDescription(text)
  if (name === undefined || description === undefined) fail(`SKILL.md frontmatter 缺少 name/description：${file}`)
  return { name, description }
}

/** 按 layout 枚举出一个仓库里的技能：{srcDir, category, dirName}。 */
function enumerateSkills(cfg, repoRoot) {
  const found = []
  if (cfg.layout === 'local' || cfg.layout === 'dir') {
    const src = cfg.layout === 'local' ? resolve(cfg.source) : join(repoRoot, ...cfg.source.split('/'))
    found.push({ srcDir: src, category: undefined, dirName: src.split(sep).pop() })
    return found
  }
  if (cfg.layout === 'skill-dirs') {
    // 按显式名单枚举仓库根下的技能目录（ARS 用），不猜、不误收 docs/agents/hooks。
    for (const name of cfg.names ?? []) {
      const src = join(repoRoot, name)
      if (!existsSync(join(src, 'SKILL.md'))) fail(`${cfg.id}: 找不到技能目录 ${name}`)
      found.push({ srcDir: src, category: undefined, dirName: name })
    }
    return found
  }
  if (cfg.layout === 'root') {
    found.push({ srcDir: repoRoot, category: undefined, dirName: cfg.target.split('/').pop() })
    return found
  }
  const sourceRoot = join(repoRoot, ...(cfg.source ?? 'skills').split('/'))
  if (!existsSync(sourceRoot)) fail(`${cfg.id}: 找不到 ${sourceRoot}`)
  if (cfg.layout === 'skills') {
    for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || EXCLUDE.has(entry.name)) continue
      if (existsSync(join(sourceRoot, entry.name, 'SKILL.md'))) found.push({ srcDir: join(sourceRoot, entry.name), category: undefined, dirName: entry.name })
    }
    return found
  }
  if (cfg.layout === 'catalog-flat') {
    for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || EXCLUDE.has(entry.name)) continue
      const dir = join(sourceRoot, entry.name)
      if (existsSync(join(dir, 'SKILL.md'))) {
        found.push({ srcDir: dir, category: undefined, dirName: entry.name })
        continue
      }
      for (const child of readdirSync(dir, { withFileTypes: true })) {
        if (!child.isDirectory()) continue
        if (existsSync(join(dir, child.name, 'SKILL.md'))) found.push({ srcDir: join(dir, child.name), category: undefined, dirName: child.name })
      }
    }
    return found
  }
  // catalog：skills-catalog/<category>/<skill>/SKILL.md
  const known = new Set(cfg.order ?? [])
  const categories = readdirSync(sourceRoot, { withFileTypes: true })
    .filter(e => e.isDirectory() && !EXCLUDE.has(e.name))
    .map(e => e.name)
    .filter(name => existsSync(join(sourceRoot, name, 'SKILL.md')) === false)
  const ordered = [
    ...(cfg.order ?? []).filter(name => categories.includes(name)),
    ...categories.filter(name => !known.has(name)).sort(),
  ]
  for (const category of ordered) {
    const catDir = join(sourceRoot, category)
    for (const entry of readdirSync(catDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (existsSync(join(catDir, entry.name, 'SKILL.md'))) found.push({ srcDir: join(catDir, entry.name), category, dirName: entry.name })
    }
  }
  if (known.size > 0) {
    const unknown = categories.filter(name => !known.has(name))
    if (unknown.length > 0) log(`  注意：${cfg.id} 出现未登记类别：${unknown.join(', ')}`)
    const missing = [...known].filter(name => !categories.includes(name))
    if (missing.length > 0) log(`  注意：${cfg.id} 少了类别：${missing.join(', ')}`)
  }
  return found
}

/** 按 cfg.renames 改落盘目录名（上游技能名与已有技能重名时用），frontmatter 由 skill-patches 改名。 */
function applyRenames(cfg, found) {
  if (cfg.renames === undefined) return
  const seen = new Set()
  for (const item of found) {
    const mapped = cfg.renames[item.dirName]
    if (mapped !== undefined) item.dirName = mapped
    if (seen.has(item.dirName)) fail(`${cfg.id}: 改名后目录重复 ${item.dirName}`)
    seen.add(item.dirName)
  }
}

function copyLicenses(cfg, repoRoot) {
  if (cfg.layout === 'local') return
  const dir = join(ROOT, 'vendor', 'licenses', cfg.id)
  for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (!/^(LICENSE|NOTICE|THIRD[- ]PARTY)/i.test(entry.name)) continue
    mkdirSync(dir, { recursive: true })
    cpSync(join(repoRoot, entry.name), join(dir, entry.name))
  }
}

/** 字面改写：对技能目录下所有 .md 生效；任何一条规则零命中即失败。 */
function applyRewrites(dir, rules) {
  if (rules === undefined || rules.length === 0) return
  const hits = new Map(rules.map(rule => [rule.find, 0]))
  for (const file of walkFiles(dir)) {
    if (!/\.(md|markdown)$/i.test(file)) continue
    let text = readFileSync(file, 'utf8')
    let changed = false
    for (const rule of rules) {
      if (!text.includes(rule.find)) continue
      hits.set(rule.find, hits.get(rule.find) + 1)
      text = text.split(rule.find).join(rule.to)
      changed = true
    }
    if (changed) writeFileSync(file, text, 'utf8')
  }
  for (const [find, count] of hits) {
    if (count > 0) continue
    const rule = rules.find(item => item.find === find)
    if (rule?.optional === true) continue
    fail(`改写规则零命中（上游结构可能变了）：${find}`)
  }
}

/** 在指定 md 文件顶部（frontmatter 之后）插入一段固定说明，例如输出语言约束。 */
function applyHeaderNote(dir, spec) {
  if (spec === undefined) return
  const pattern = new RegExp(spec.files)
  let touched = 0
  for (const file of walkFiles(dir)) {
    if (!/\.md$/i.test(file)) continue
    const rel = relative(dir, file).split(sep).join('/')
    if (!pattern.test(rel)) continue
    const text = readFileSync(file, 'utf8')
    if (text.includes(spec.text.trim())) continue
    const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)
    const head = match === null ? '' : match[0].endsWith('\n') ? match[0] : `${match[0]}\n`
    // 旧版本注入的同一段说明要先摘掉，避免多次 vendor 后叠加。
    const body = (match === null ? text : text.slice(match[0].length))
      .split(/\r?\n/)
      .filter(line => !/^>\s*输出语言（本 DSH 集成强制）/.test(line))
      .join('\n')
    writeFileSync(file, `${head}${spec.text}\n${body}`, 'utf8')
    touched += 1
  }
  log(`  顶部说明写入 ${touched} 个文件`)
}

/** 仓库级附加目录 → 技能内目录（如 shared/ → _shared/）。 */
function copyExtraDirs(cfg, repoRoot, skillDir) {
  for (const extra of cfg.extraDirs ?? []) {
    const from = join(repoRoot, ...String(extra.from).split('/'))
    if (!existsSync(from)) fail(`缺少附加目录：${extra.from}`)
    const to = join(skillDir, ...String(extra.to).split('/'))
    rmSync(to, { recursive: true, force: true })
    cpSync(from, to, { recursive: true, filter: path => !EXCLUDE.has(path.split(sep).pop()) })
  }
}

/** 仓库根的单文件 → 技能内（如 MODE_REGISTRY.md → _shared/MODE_REGISTRY.md）。 */
function copySharedFiles(cfg, repoRoot, skillDir) {
  for (const item of cfg.sharedFiles ?? []) {
    const from = join(repoRoot, ...String(item.from).split('/'))
    if (!existsSync(from)) fail(`缺少共享文件：${item.from}`)
    const to = join(skillDir, ...String(item.to).split('/'))
    mkdirSync(resolve(to, '..'), { recursive: true })
    copyFileSync(from, to)
  }
}

/** 从技能正文里收集它引用的上游脚本（相对 scripts/ 的路径）。 */
function collectScriptRefs(skillDir) {
  const refs = new Set()
  for (const file of walkFiles(skillDir)) {
    if (!/\.(md|markdown)$/i.test(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/scripts\/([A-Za-z0-9_./-]+\.py)/g)) refs.add(match[1])
  }
  return refs
}

/** 按引用闭包把需要的脚本并进技能自己的 scripts/：被引脚本 + 它 import 的本地模块。
 *
 * 上游技能可能本来就有 scripts/（如 sr-screener），所以是"合并"而不是另建目录：
 * 同名文件内容一致就跳过，不一致直接失败，避免静默覆盖。
 */
function copyScriptClosure(cfg, repoRoot, skillDir) {
  const spec = cfg.scriptClosure
  if (spec === undefined) return { files: 0, bytes: 0 }
  const srcRoot = join(repoRoot, ...String(spec.from).split('/'))
  const outRoot = join(skillDir, ...String(spec.into ?? 'scripts').split('/'))
  const limit = spec.maxBytes ?? 20_000_000
  const queue = [...collectScriptRefs(skillDir)].map(item => item.split('/').join(sep))
  // 命令正文里引用的脚本（如 ars_cache_invalidate.py、ars_mark_read.py）也要一并带上，
  // 否则 /ars-* 命令让模型去跑脚本时会扑空。
  const commandDir = join(repoRoot, ...String(cfg.aliases?.from ?? 'commands').split('/'))
  if (existsSync(commandDir)) {
    for (const entry of readdirSync(commandDir)) {
      if (!/\.md$/i.test(entry)) continue
      const text = readFileSync(join(commandDir, entry), 'utf8')
      for (const match of text.matchAll(/scripts\/([A-Za-z0-9_./-]+\.py)/g)) {
        queue.push(match[1].split('/').join(sep))
      }
    }
  }
  const done = new Set()
  let bytes = 0
  while (queue.length > 0) {
    const rel = queue.shift()
    if (done.has(rel)) continue
    done.add(rel)
    const src = join(srcRoot, rel)
    if (!existsSync(src)) {
      log(`  警告：正文引用的脚本不在上游：${rel.split(sep).join('/')}`)
      continue
    }
    const body = readFileSync(src)
    bytes += body.length
    if (bytes > limit) fail(`${cfg.id}: 脚本闭包超过上限 ${limit} 字节`)
    const dest = join(outRoot, rel)
    if (existsSync(dest)) {
      if (!readFileSync(dest).equals(body)) fail(`脚本同名但内容不同，拒绝覆盖：${rel.split(sep).join('/')}`)
      continue
    }
    mkdirSync(resolve(dest, '..'), { recursive: true })
    writeFileSync(dest, body)
    if (!/\.py$/.test(rel)) continue
    const text = body.toString('utf8')
    for (const match of text.matchAll(/^[ \t]*(?:from|import)\s+([A-Za-z_][\w.]*)/gm)) {
      const mod = match[1].split('.')[0]
      for (const candidate of [`${mod}.py`, join(mod, '__init__.py')]) {
        if (existsSync(join(srcRoot, candidate))) queue.push(candidate)
      }
    }
  }
  return { files: done.size, bytes }
}

/** 去掉 frontmatter 里的 description（含折叠块），其余键保留。 */
function stripDescriptionBlock(block) {
  const out = []
  let skippingFolded = false
  for (const line of block.split(/\r?\n/)) {
    if (/^description\s*:/.test(line)) {
      skippingFolded = /:\s*[>|][-+\d]*\s*$/.test(line)
      continue
    }
    if (skippingFolded) {
      if (/^\s+\S/.test(line) || line.trim().length === 0) continue
      skippingFolded = false
    }
    out.push(line)
  }
  return out.join('\n').trimEnd()
}

/** 用登记过的双语摘要替换 frontmatter description，原文留档到 _shared/。 */
function applyDescription(cfg, skillDir, meta) {
  if (cfg.descriptions === undefined) return meta
  const table = JSON.parse(readFileSync(join(ROOT, ...String(cfg.descriptions).split('/')), 'utf8'))
  const next = table.skills?.[meta.name] ?? table[meta.name]
  if (typeof next !== 'string' || next.trim().length === 0) return meta
  if (next.length > 480) fail(`description 超过 480 字：${meta.name}`)
  const file = join(skillDir, 'SKILL.md')
  const text = readFileSync(file, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (match === null) fail(`缺少 frontmatter：${file}`)
  const rest = stripDescriptionBlock(match[1])
  const body = text.slice(match[0].length)
  writeFileSync(file, `---\n${rest}\ndescription: ${JSON.stringify(next)}\n---${body}`, 'utf8')
  const shared = join(skillDir, '_shared')
  mkdirSync(shared, { recursive: true })
  writeFileSync(join(shared, 'description-original.md'), `# 上游 description 原文（${meta.name}）\n\n${meta.description}\n`, 'utf8')
  return { ...meta, description: next }
}

/** 把上游 commands/*.md 变成用户可调用的别名技能（模型目录不可见）。 */
function generateAliasSkills(cfg, repoRoot, stageRoot) {
  const spec = cfg.aliases
  if (spec === undefined) return 0
  const from = join(repoRoot, ...String(spec.from).split('/'))
  if (!existsSync(from)) fail(`缺少别名来源目录：${spec.from}`)
  const target = join(stageRoot, ...String(spec.target).split('/'))
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  let count = 0
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue
    const text = readFileSync(join(from, entry.name), 'utf8')
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
    if (match === null) continue
    const nameLine = /^name:\s*(.+)$/m.exec(match[1])
    if (nameLine === null) continue
    const name = nameLine[1].trim().replace(/^['"]|['"]$/g, '')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) fail(`别名不是 kebab-case：${name}`)
    const descLine = /^description:\s*(.+)$/m.exec(match[1])
    const description = descLine === null ? `ARS 命令 ${name}` : descLine[1].trim().replace(/^['"]|['"]$/g, '')
    let body = match[2].trim()
    for (const change of spec.rewrite ?? []) body = body.split(change.find).join(change.to)
    // 保留上游命令正文（含具体脚本与步骤），只把 Claude 插件根路径改写成 DSH 里说得通的写法。
    body = body
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/MODE_REGISTRY\.md/g, '对应技能目录下的 `_shared/MODE_REGISTRY.md`')
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/([a-z0-9-]+)\/SKILL\.md/g, '`$1` 技能')
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/?/g, '')
      .replace(/python3\s+scripts\/([A-Za-z0-9_./-]+)/g, 'python `scripts/$1`（用 ARS 技能目录里的副本，解释器见「设置 → ARS 设置」）')
      .replace(/\$ARGUMENTS/g, '用户本次输入')
    const head = [
      '---',
      `name: ${name}`,
      `description: ${JSON.stringify(`${description}（ARS 命令入口）`)}`,
      'disable-model-invocation: true',
      '---',
      '',
    ]
    const dir = join(target, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), `${head.join('\n')}${body}\n`, 'utf8')
    count += 1
  }
  return count
}

/**
 * 写 catalog/ars.json：ARS 作为"功能区块"（不进技能树、默认注入）的元数据。
 * 技能目录与命令文本都由这里描述，宿主半侧只读它。
 * 实体放在包根 ars/ 下（root: 'package'），不混进 skills/。
 */
function writeArsManifest(cfg, records, aliasCount, stageRoot) {
  const descriptions = cfg.descriptions === undefined
    ? {}
    : JSON.parse(readFileSync(join(ROOT, ...String(cfg.descriptions).split('/')), 'utf8'))
  const commandZh = descriptions.commands ?? {}
  const aliasRoot = join(stageRoot, ...String(cfg.aliases.target).split('/'))
  const commands = []
  if (existsSync(aliasRoot)) {
    for (const entry of readdirSync(aliasRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue
      const file = join(aliasRoot, entry.name, 'SKILL.md')
      if (!existsSync(file)) continue
      const meta = commandZh[entry.name]
      const description = typeof meta === 'string' ? meta : meta?.description
      if (typeof description !== 'string' || description.length === 0) {
        fail(`缺少命令中文说明：${entry.name}（vendor/ars/descriptions.json 的 commands）`)
      }
      const hint = typeof meta === 'object' && meta !== null && typeof meta.hint === 'string' ? meta.hint : '<需求或题目>'
      commands.push({
        name: entry.name,
        description,
        hint,
        source: `${cfg.aliases.target}/${entry.name}/SKILL.md`,
      })
    }
  }
  if (commands.length !== aliasCount) fail(`命令清单与别名数不一致：${commands.length} vs ${aliasCount}`)
  const manifest = {
    version: 1,
    label: '学术研究（ARS）',
    upstream: cfg.repo,
    license: 'CC-BY-NC-4.0',
    root: 'ars',
    doc: 'docs/ars-usage.md',
    skills: records.map(record => ({ name: record.name, dir: record.path, root: 'package' })),
    commands,
  }
  const target = join(ROOT, 'catalog', 'ars.json')
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  log(`  ARS 清单写入 ${relative(ROOT, target)}（${manifest.skills.length} 技能 / ${commands.length} 命令）`)
}

async function main() {
  const config = JSON.parse(readFileSync(join(ROOT, 'vendor', 'upstreams.json'), 'utf8'))
  const repos = config.repos.filter(cfg => (only === undefined || only.has(cfg.id)) && !skip.has(cfg.id))
  if (repos.length === 0) fail(`没有匹配的上游：${only === undefined ? '(全部)' : [...only].join(',')}${skip.size > 0 ? `（跳过 ${[...skip].join(',')}）` : ''}`)

  for (const dir of [CACHE, EXTRACT, TRASH]) mkdirSync(dir, { recursive: true })

  const preserved = collectPreserved()
  log(`保留用户配置 ${preserved.size} 个文件`)

  // 全量重建前把旧 skills/ 移入 trash；局部更新时保留现有树
  if (only === undefined && existsSync(SKILLS)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const trash = join(TRASH, `skills-${stamp}`)
    mkdirSync(TRASH, { recursive: true })
    renameSync(SKILLS, trash)
    log(`旧 skills/ 已移到 ${trash}`)
  }
  mkdirSync(STAGE, { recursive: true })
  // staging 必须干净：局部更新复用同一目录时，旧文件（如上一版生成的 _scripts/）会残留。
  for (const entry of readdirSync(STAGE)) rmSync(join(STAGE, entry), { recursive: true, force: true })

  const lock = { version: 1, generatedAt: new Date().toISOString(), repos: [], totals: { skills: 0 } }
  const seen = new Map()

  for (const cfg of repos) {
    log(`\n[${cfg.id}] ${cfg.repo} (${cfg.layout})`)
    let sha
    let repoRoot
    if (cfg.layout === 'local') {
      sha = 'local'
      repoRoot = resolve(cfg.source)
      if (!existsSync(repoRoot)) fail(`本地来源不存在：${repoRoot}`)
    } else {
      sha = resolveSha(cfg.repo, cfg.ref ?? 'main')
      log(`  SHA ${sha}`)
      if (cfg.download === 'git') {
        repoRoot = cloneRepo(cfg)
      } else {
        try {
          const file = await download(cfg.repo, sha)
          repoRoot = extractTarball(file, cfg.id)
        } catch (error) {
          log(`  tarball 失败，改用 git clone：${String(error?.message ?? error)}`)
          repoRoot = cloneRepo(cfg)
        }
      }
      copyLicenses(cfg, repoRoot)
    }

    const skills = enumerateSkills(cfg, repoRoot)
    if (skills.length === 0) fail(`${cfg.id}: 未发现任何技能`)
    applyRenames(cfg, skills)
    const targetRoot = join(STAGE, ...cfg.target.split('/'))
    mkdirSync(targetRoot, { recursive: true })
    // dir/root/local 三种 layout 的 target 已经写到了技能目录本身，不能再拼一层 dirName
    const singleLayout = cfg.layout === 'dir' || cfg.layout === 'root' || cfg.layout === 'local'
    const records = []
    for (const item of skills) {
      if (!existsSync(join(item.srcDir, 'SKILL.md'))) fail(`缺少 SKILL.md：${item.srcDir}`)
      let meta = readSkillMeta(item.srcDir)
      // 改名的技能：先用新名字参与重名检查与 lock，frontmatter 由 skill-patches 在合并后统一改。
      if (cfg.renames !== undefined && cfg.renames[meta.name] === item.dirName && meta.name !== item.dirName) {
        meta = { ...meta, name: item.dirName }
        log(`  ${meta.name}: 按 renames 改名（上游 ${Object.keys(cfg.renames).find(key => cfg.renames[key] === item.dirName)}）`)
      }
      const category = item.category
      const dest = singleLayout
        ? targetRoot
        : (category === undefined ? join(targetRoot, item.dirName) : join(targetRoot, category, item.dirName))
      copySkill(item.srcDir, dest)
      // 上游附加内容与受控改写：先补目录/脚本，再改写引用，最后换描述（描述不参与改写）。
      copyExtraDirs(cfg, repoRoot, dest)
      copySharedFiles(cfg, repoRoot, dest)
      applyRewrites(dest, cfg.rewrite)
      applyHeaderNote(dest, cfg.headerNote)
      meta = applyDescription(cfg, dest, meta)
      const closure = copyScriptClosure(cfg, repoRoot, dest)
      if (closure.files > 0) log(`  ${item.dirName}: 脚本闭包 ${closure.files} 个 / ${(closure.bytes / 1024).toFixed(0)} KB`)
      if (seen.has(meta.name)) fail(`技能重名：${meta.name}（${seen.get(meta.name)} 与 ${cfg.id}）`)
      seen.set(meta.name, cfg.id)
      const relPath = singleLayout
        ? cfg.target
        : `${cfg.target}/${category === undefined ? item.dirName : `${category}/${item.dirName}`}`
      records.push({
        dir: item.dirName,
        name: meta.name,
        category: category ?? null,
        path: relPath,
        description: meta.description,
      })
    }
    records.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.dir.localeCompare(b.dir))
    const aliasCount = generateAliasSkills(cfg, repoRoot, STAGE)
    if (aliasCount > 0) log(`  命令别名 ${aliasCount} 个`)
    if (cfg.runtimeRoot !== undefined) {
      const written = await writeArsRuntimeNotes(arsParams(), join(STAGE, ...cfg.runtimeRoot.split('/')))
      log(`  运行时说明写入 ${written.written} 个技能（Python：${written.python.path || '未找到'}）`)
      writeArsManifest(cfg, records, aliasCount, STAGE)
    }
    lock.repos.push({ id: cfg.id, repo: cfg.repo, ref: cfg.ref ?? 'main', sha, label: cfg.label, target: cfg.target, count: records.length, aliases: aliasCount, outsideCatalog: cfg.outsideCatalog === true, skills: records })
    log(`  收录 ${records.length} 个技能`)
  }

  if (only !== undefined) {
    // 局部更新：把 staging 里的目标并回现有 skills/
    if (!existsSync(SKILLS)) mkdirSync(SKILLS, { recursive: true })
    for (const cfg of repos) {
      const targets = [cfg.target, ...(cfg.aliases === undefined ? [] : [cfg.aliases.target])]
      // 技能树外的功能区块（ARS）实体放包根，其余放 skills/。
      const base = cfg.outsideCatalog === true ? ROOT : SKILLS
      for (const target of targets) {
        const src = join(STAGE, ...target.split('/'))
        const dest = join(base, ...target.split('/'))
        if (!existsSync(src)) continue
        mkdirSync(resolve(dest, '..'), { recursive: true })
        let replaced = false
        if (existsSync(dest)) {
          const trash = join(TRASH, `partial-${cfg.id}-${basename(target)}-${Date.now()}`)
          try {
            renameSync(dest, trash)
            replaced = true
          } catch (error) {
            // Windows 下 DSH 的文件监视器可能正持有技能目录句柄，rename 会 EPERM；
            // 退化为覆盖合并（旧的多余文件会留下，但不影响技能可用）。
            log(`  注意：${target} 无法整体换入（${String(error?.code ?? error)}），改为覆盖合并`)
          }
        }
        if (replaced || !existsSync(dest)) cpSync(src, dest, { recursive: true })
        else cpSync(src, dest, { recursive: true, force: true })
      }
    }
    const restored = restorePreserved(SKILLS, preserved)
    if (restored > 0) log(`回填用户配置 ${restored} 个文件`)
    applySkillPatches(SKILLS)
    const existing = existsSync(LOCK)
      ? JSON.parse(readFileSync(LOCK, 'utf8'))
      : { version: 1, repos: [], totals: { skills: 0 } }
    for (const record of lock.repos) {
      const index = existing.repos.findIndex(item => item.id === record.id)
      if (index >= 0) existing.repos[index] = record
      else existing.repos.push(record)
    }
    existing.generatedAt = new Date().toISOString()
    existing.totals.skills = existing.repos.reduce((sum, repo) => sum + repo.count, 0)
    writeFileSync(LOCK, `${JSON.stringify(existing, null, 2)}\n`, 'utf8')
    log(`局部更新完成：lock 记录 ${existing.totals.skills} 个技能`)
  } else {
    const restored = restorePreserved(STAGE, preserved)
    if (restored > 0) log(`回填用户配置 ${restored} 个文件`)
    applySkillPatches(STAGE)
    renameSync(STAGE, SKILLS)
    lock.totals.skills = seen.size
    writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')
    log(`\n完成：${lock.totals.skills} 个技能，lock 写入 ${relative(ROOT, LOCK)}`)
    for (const repo of lock.repos) log(`  ${repo.id.padEnd(14)} ${String(repo.count).padStart(3)}  ${repo.sha.slice(0, 12)}`)
  }
}

await main()
