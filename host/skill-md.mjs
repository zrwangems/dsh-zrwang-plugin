/**
 * SKILL.md 的 frontmatter 解析：只为拿 name 与 description。
 *
 * 不用「一行正则扫全文」那套：frontmatter 里的 description 既可能是单行，也可能是
 * `>` / `|` 折叠块（MathWorks 与 ppt-master 都是折叠块，且文件常常是 CRLF），
 * 而 `(?=\s*$)` 这类收尾断言在 CRLF 下会命中 `\r` 与 `\n` 之间，把折叠块截成空串。
 * 这里按行切：先定位 `---` 边界，再找键，再按缩进收续行。
 */
import { readFile, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 把 SKILL.md 文本切成 frontmatter 行；没有 frontmatter 时返回全文行。 */
function frontLines(text) {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return lines
  const end = lines.indexOf('---', 1)
  return lines.slice(1, end < 0 ? lines.length : end)
}

/** 读一个键的文本值；折叠块会拼成一行。 */
export function frontValue(text, key) {
  const lines = frontLines(text)
  const head = new RegExp(`^${key}\\s*:`)
  const at = lines.findIndex(line => head.test(line))
  if (at < 0) return ''
  const first = lines[at].replace(new RegExp(`^${key}\\s*:\\s*`), '')
  if (/^[>|][-+\d]*\s*$/.test(first.trim())) {
    const parts = []
    for (let index = at + 1; index < lines.length; index += 1) {
      const line = lines[index]
      if (line.trim().length === 0) continue
      if (!/^\s/.test(line)) break
      parts.push(line.trim())
    }
    return parts.join(' ')
  }
  return first.trim().replace(/^['"]|['"]$/g, '')
}

const LIMIT = 600

/** 从技能目录读英文描述（异步，宿主侧用）。 */
export async function readDescription(dir) {
  try {
    return frontValue(await readFile(join(dir, 'SKILL.md'), 'utf8'), 'description').slice(0, LIMIT)
  } catch {
    return ''
  }
}

/** 从技能目录读英文描述（同步，脚本侧用）。 */
export function readDescriptionSync(dir) {
  try {
    return frontValue(readFileSync(join(dir, 'SKILL.md'), 'utf8'), 'description').slice(0, LIMIT)
  } catch {
    return ''
  }
}

/** 从技能目录读 name（同步，脚本侧用）。 */
export function readNameSync(dir) {
  try {
    return frontValue(readFileSync(join(dir, 'SKILL.md'), 'utf8'), 'name')
  } catch {
    return ''
  }
}
