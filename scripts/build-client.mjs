#!/usr/bin/env node
/**
 * 把 client/*.mjs 拼成 lib/client.js。
 *
 * DSH 客户端模块系统要求的是懒 CJS 信封：脚本本身只登记工厂，
 * 工厂里 `require('react')`，返回 { inject, apply }。片段共享同一个工厂作用域，
 * 因此片段里不能写 import/export。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE_NAME = 'dsh-zrwang-plugin'
const FRAGMENTS = ['style.mjs', 'api.mjs', 'markdown.mjs', 'tree.mjs', 'settings.mjs', 'page.mjs', 'entry.mjs']

const header = `/**
 * dsh-zrwang-plugin —— 浏览器半侧。
 * 生成文件，不要手改：源码在 client/ 下，由 node scripts/build-client.mjs 拼装。
 */
window.__ModuleLoader__.load({
  id: '${PACKAGE_NAME}',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var h = React.createElement
`

const footer = `    exports.inject = zrPlugin.inject
    exports.apply = zrPlugin.apply
    return module.exports
  },
})
`

const body = FRAGMENTS.map(name => {
  const text = readFileSync(join(root, 'client', name), 'utf8')
  if (/^\s*(import|export)\s/m.test(text)) {
    throw new Error(`client/${name} 含 import/export：片段必须共享同一作用域`)
  }
  return `    // ---- client/${name} ----\n${text.trimEnd()}\n`
}).join('\n')

mkdirSync(join(root, 'lib'), { recursive: true })
const target = join(root, 'lib', 'client.js')
const output = `${header}${body}${footer}`
writeFileSync(target, output, 'utf8')
process.stdout.write(`built ${target} (${FRAGMENTS.length} fragments, ${Buffer.byteLength(output)} bytes)\n`)
