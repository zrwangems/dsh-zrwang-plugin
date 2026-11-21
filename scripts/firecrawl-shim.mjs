/**
 * Firecrawl CLI shim：DSH 的 shell 子进程会按变量名清洗 FIRECRAWL_API_KEY，
 * 插件改用不带 KEY/TOKEN/SECRET 字样的 `DSH_ZRWANG_FIRECRAWL_CRED` 注入，
 * 这里把它映射回标准名再调用真正的 CLI。
 *
 * 参数：<firecrawl-cli launcher.js> [...CLI 参数]
 */
import { spawnSync } from 'node:child_process'

const [launcher, ...args] = process.argv.slice(2)
if (!launcher) {
  console.error('firecrawl shim: missing launcher path')
  process.exit(1)
}

const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
const secret = typeof env.DSH_ZRWANG_FIRECRAWL_CRED === 'string' ? env.DSH_ZRWANG_FIRECRAWL_CRED.trim() : ''
if (secret.length > 0) env.FIRECRAWL_API_KEY = secret

const result = spawnSync(process.execPath, [launcher, ...args], { stdio: 'inherit', env, windowsHide: true })
if (result.error) {
  console.error(`firecrawl shim: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status === null ? 1 : result.status)
