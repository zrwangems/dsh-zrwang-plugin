/**
 * Firecrawl CLI shim：DSH 的 shell 子进程会按变量名清洗 FIRECRAWL_API_KEY，
 * 这里从插件 settings.json 读取 optional.firecrawlApiKey，再以子进程环境传给真正的 CLI。
 *
 * 参数：<settings.json> <firecrawl-cli launcher.js> [...CLI 参数]
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const [settingsFile, launcher, ...args] = process.argv.slice(2)
if (!launcher) {
  console.error('firecrawl shim: missing launcher path')
  process.exit(1)
}

const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
try {
  const settings = JSON.parse(readFileSync(settingsFile, 'utf8'))
  const key = typeof settings?.optional?.firecrawlApiKey === 'string' ? settings.optional.firecrawlApiKey.trim() : ''
  if (key.length > 0) env.FIRECRAWL_API_KEY = key
} catch {
  // 设置文件缺失/损坏时保持原环境，让 CLI 自己报错
}

const result = spawnSync(process.execPath, [launcher, ...args], { stdio: 'inherit', env, windowsHide: true })
if (result.error) {
  console.error(`firecrawl shim: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status === null ? 1 : result.status)
