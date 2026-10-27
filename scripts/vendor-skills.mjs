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
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

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
const only = onlyArg === undefined ? undefined : onlyArg.slice('--only='.length)
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
        if (!text.includes(change.find)) fail(`补丁不适用（上游结构变了）：${entry.path}`)
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

async function main() {
  const config = JSON.parse(readFileSync(join(ROOT, 'vendor', 'upstreams.json'), 'utf8'))
  const repos = config.repos.filter(cfg => (only === undefined || cfg.id === only) && !skip.has(cfg.id))
  if (repos.length === 0) fail(`没有匹配的上游：${only ?? '(全部)'}${skip.size > 0 ? `（跳过 ${[...skip].join(',')}）` : ''}`)

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
    const targetRoot = join(STAGE, ...cfg.target.split('/'))
    mkdirSync(targetRoot, { recursive: true })
    // dir/root/local 三种 layout 的 target 已经写到了技能目录本身，不能再拼一层 dirName
    const singleLayout = cfg.layout === 'dir' || cfg.layout === 'root' || cfg.layout === 'local'
    const records = []
    for (const item of skills) {
      if (!existsSync(join(item.srcDir, 'SKILL.md'))) fail(`缺少 SKILL.md：${item.srcDir}`)
      const meta = readSkillMeta(item.srcDir)
      const category = item.category
      const dest = singleLayout
        ? targetRoot
        : (category === undefined ? join(targetRoot, item.dirName) : join(targetRoot, category, item.dirName))
      copySkill(item.srcDir, dest)
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
    lock.repos.push({ id: cfg.id, repo: cfg.repo, ref: cfg.ref ?? 'main', sha, label: cfg.label, target: cfg.target, count: records.length, skills: records })
    log(`  收录 ${records.length} 个技能`)
  }

  if (only !== undefined) {
    // 局部更新：把 staging 里的目标并回现有 skills/
    if (!existsSync(SKILLS)) mkdirSync(SKILLS, { recursive: true })
    for (const cfg of repos) {
      const src = join(STAGE, ...cfg.target.split('/'))
      const dest = join(SKILLS, ...cfg.target.split('/'))
      mkdirSync(resolve(dest, '..'), { recursive: true })
      if (existsSync(dest)) {
        const trash = join(TRASH, `partial-${cfg.id}-${Date.now()}`)
        renameSync(dest, trash)
      }
      cpSync(src, dest, { recursive: true })
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
