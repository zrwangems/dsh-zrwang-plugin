#!/usr/bin/env node
/** 生成每个 ARS 技能下的 _shared/dsh-runtime.md（构建时运行，结果入库）。 */
import { ARS_DIR } from '../host/config.mjs'
import { writeArsRuntimeNotes } from '../host/ars.mjs'

const written = writeArsRuntimeNotes(ARS_DIR)
process.stdout.write(`ARS 运行时说明：${written} 个技能\n`)
