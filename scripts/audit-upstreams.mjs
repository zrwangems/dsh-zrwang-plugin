#!/usr/bin/env node
/**
 * 上游完整性核对：按 vendor/upstreams.lock.json 记录的 SHA 重新下载上游包，
 * 逐个技能对比「上游文件清单」与「本地落盘文件清单」。
 *
 * - 少文件 = 不完整（必须修）；
 * - 多文件 = 允许（_shared、脚本闭包、运行时说明、补丁产物等插件增量）；
 * - 上游有 SKILL.md 但本地没有 = 漏收技能。
 *
 * 用法：node scripts/audit-upstreams.mjs --proxy=http://127.0.0.1:7897
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS = join(ROOT, 'skills')
const args = process.argv.slice(2)
const proxyArg = args.find(item => item.startsWith('--proxy='))
const onlyArg = args.find(item => item.startsWith('--only='))
const only = onlyArg === undefined ? undefined : new Set(onlyArg.slice('--only='.length).split(','))
const proxy = proxyArg === undefined ? (process.env.DSH_GT_PROXY ?? '') : proxyArg.slice('--proxy='.length)

const IGNORED = ['.github/', '.git/', 'node_modules/', '__pycache__/', '.venv/', '.pytest_cache/']
const NL = String.fromCharCode(10)

function isIgnored(path) {
  return IGNORED.some(prefix => path.startsWith(prefix)) || path === '.DS_Store'
}

function download(repo, sha) {
  const argv = ['-sL', '--max-time', '300', '--url', `https://codeload.github.com/${repo}/tar.gz/${sha}`]
  if (proxy.length > 0) argv.push('-x', proxy)
  return gunzipSync(execFileSync('curl', argv, { maxBuffer: 1024 * 1024 * 1024 }))
}

/** 解析（已 gunzip 的）tar：relPath -> size，支持 PAX 长路径与 GNU longname。 */
function readTar(buffer) {
  const files = new Map()
  let offset = 0
  let pendingPath
  let pendingSize
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8) || 0
    const type = String.fromCharCode(header[156])
    const full = prefix.length > 0 ? `${prefix}/${name}` : name
    offset += 512
    const body = buffer.subarray(offset, offset + size)
    offset += Math.ceil(size / 512) * 512
    if (type === 'x' || type === 'g') {
      const text = body.toString('utf8')
      const pathLine = text.split(NL).find(line => line.startsWith('path='))
      const sizeLine = text.split(NL).find(line => line.startsWith('size='))
      if (pathLine !== undefined) pendingPath = pathLine.slice('path='.length)
      if (sizeLine !== undefined) pendingSize = Number.parseInt(sizeLine.slice('size='.length), 10)
      continue
    }
    if (type === 'L') {
      pendingPath = body.toString('utf8').replace(/\0.*$/, '')
      continue
    }
    if (type !== '0' && type !== '\0' && type !== '7') continue
    const finalPath = pendingPath === undefined ? full : pendingPath
    const finalSize = pendingSize === undefined ? size : pendingSize
    pendingPath = undefined
    pendingSize = undefined
    const rel = finalPath.split('/').slice(1).join('/')
    if (rel.length === 0 || isIgnored(rel)) continue
    files.set(rel, finalSize)
  }
  return files
}

function walkFiles(base, dir = base, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(base, full, out)
    else if (entry.isFile()) out.push(relative(base, full).split(sep).join('/'))
  }
  return out
}

function upstreamPrefix(cfg, record, tar) {
  // 改名的技能：用改名前（上游）目录名
  let dirName = record.dir
  for (const [from, to] of Object.entries(cfg.renames ?? {})) {
    if (to === dirName) { dirName = from; break }
  }
  const source = String(cfg.source ?? 'skills')
  const candidates = []
  if (cfg.layout === 'root') candidates.push('')
  else if (cfg.layout === 'dir') candidates.push(source)
  else if (cfg.layout === 'skill-dirs') candidates.push(dirName)
  else if (cfg.layout === 'catalog') candidates.push([source, record.category, dirName].filter(Boolean).join('/'))
  else if (cfg.layout === 'catalog-flat') candidates.push(`${source}/${dirName}`)
  else candidates.push(source === '.' || source.length === 0 ? dirName : `${source}/${dirName}`)
  for (const candidate of candidates) {
    const marker = candidate.length === 0 ? 'SKILL.md' : `${candidate}/SKILL.md`
    if (tar.has(marker)) return candidate
  }
  // 兜底：按目录名在 tar 里找唯一一个 xxx/.../<dirName>/SKILL.md
  const suffix = `${dirName}/SKILL.md`
  const matches = [...tar.keys()].filter(path => path === suffix || path.endsWith(`/${suffix}`))
  if (matches.length === 1) return matches[0].slice(0, -'/SKILL.md'.length)
  return candidates[0]
}

function vendoredDir(cfg, record) {
  const base = cfg.outsideCatalog === true ? ROOT : SKILLS
  return join(base, ...String(record.path).split('/'))
}

function main() {
  const config = JSON.parse(readFileSync(join(ROOT, 'vendor', 'upstreams.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(ROOT, 'vendor', 'upstreams.lock.json'), 'utf8'))
  const byId = new Map((lock.repos ?? []).map(item => [item.id, item]))
  const rows = []
  let failures = 0
  for (const cfg of config.repos ?? []) {
    if (cfg.layout === 'local') continue
    if (only !== undefined && !only.has(cfg.id)) continue
    const record = byId.get(cfg.id)
    if (record === undefined) {
      rows.push({ repo: cfg.repo, id: cfg.id, status: '锁文件缺记录', details: [] })
      failures += 1
      continue
    }
    let tar
    try {
      tar = readTar(download(cfg.repo, record.sha))
    } catch (error) {
      rows.push({ repo: cfg.repo, id: cfg.id, status: `下载失败：${String(error?.message ?? error).slice(0, 60)}`, details: [] })
      failures += 1
      continue
    }
    let checked = 0
    let missingSkills = 0
    let missingFiles = 0
    let extraFiles = 0
    const details = []
    for (const skill of record.skills ?? []) {
      const prefix = upstreamPrefix(cfg, skill, tar)
      const expected = new Map()
      for (const [path, size] of tar) {
        if (prefix.length === 0) expected.set(path, size)
        else if (path.startsWith(`${prefix}/`)) expected.set(path.slice(prefix.length + 1), size)
        else if (path === prefix) expected.set('', size)
      }
      if (!expected.has('SKILL.md')) {
        details.push(`${skill.name}: 上游找不到 SKILL.md`)
        missingSkills += 1
        continue
      }
      checked += 1
      const dir = vendoredDir(cfg, skill)
      if (!existsSync(join(dir, 'SKILL.md'))) {
        details.push(`${skill.name}: 本地缺 SKILL.md`)
        missingSkills += 1
        continue
      }
      const actual = new Set(walkFiles(dir))
      for (const path of expected.keys()) {
        if (path.length === 0) continue
        if (!actual.has(path)) {
          missingFiles += 1
          if (details.length < 12) details.push(`${skill.name}: 缺 ${path}`)
        }
      }
      for (const path of actual) {
        if (!expected.has(path)) extraFiles += 1
      }
    }
    const status = missingSkills === 0 && missingFiles === 0 ? 'ok' : '不完整'
    if (status !== 'ok') failures += 1
    rows.push({ repo: cfg.repo, id: cfg.id, skills: `${checked}/${record.count ?? '?'}`, missingSkills, missingFiles, extraFiles, status, details })
  }
  console.log('仓库'.padEnd(42), '技能'.padEnd(9), '缺技能'.padEnd(7), '缺文件'.padEnd(7), '插件增量', '状态')
  for (const row of rows) {
    console.log(
      row.repo.padEnd(42),
      String(row.skills ?? '-').padEnd(9),
      String(row.missingSkills ?? '-').padEnd(7),
      String(row.missingFiles ?? '-').padEnd(7),
      String(row.extraFiles ?? '-').padEnd(8),
      row.status,
    )
    for (const line of row.details ?? []) console.log('   ', line)
  }
  console.log(failures === 0 ? '\n上游完整性：全部通过' : `\n上游完整性：${failures} 个仓库有问题`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
