#!/usr/bin/env node

import { adaptSelectionForCodex, resolveModelSelection } from './lib/harness-selection.mjs'
import { parseStrictArgs } from './lib/swarm-cli.mjs'

const argv = process.argv.slice(2)
if (argv.includes('--help')) {
  console.log(
    'Usage: npm run harness:select -- --profile <profile> [--selection-input <json>] [--host-support <json>] [--override-model <model> --override-effort <effort>]',
  )
  process.exit(0)
}

const values = parseStrictArgs(argv, {
  profile: { required: true },
  'selection-input': {},
  'host-support': {},
  'override-model': {},
  'override-effort': {},
})

const selectionInput = parseJson(values['selection-input'] ?? '{}', '--selection-input')
const host = values['host-support'] ? parseJson(values['host-support'], '--host-support') : undefined
const hasOverrideModel = values['override-model'] !== undefined
const hasOverrideEffort = values['override-effort'] !== undefined
if (hasOverrideModel !== hasOverrideEffort) {
  throw new Error('--override-model and --override-effort must be provided together')
}

const selection = resolveModelSelection({
  ...selectionInput,
  profile: values.profile,
  host,
  ...(hasOverrideModel ? { override: { model: values['override-model'], effort: values['override-effort'] } } : {}),
})
const adapter = adaptSelectionForCodex(selection, undefined, host)
console.log(JSON.stringify({ selection, adapter }))
if (!adapter.canSpawn) process.exitCode = 2

function parseJson(value, flag) {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('must be an object')
    return parsed
  } catch (error) {
    throw new Error(`Invalid JSON for ${flag}: ${error.message}`)
  }
}
