#!/usr/bin/env node

import { replayRecordedSelection } from './lib/harness-selection.mjs'
import { parseStrictArgs } from './lib/swarm-cli.mjs'

const argv = process.argv.slice(2)
if (argv.includes('--help')) {
  console.log('Usage: npm run harness:replay-selection -- --recorded-selection <json> [--host-support <json>]')
  process.exit(0)
}

const values = parseStrictArgs(argv, {
  'recorded-selection': { required: true },
  'host-support': {},
})
const recorded = parseJson(values['recorded-selection'], '--recorded-selection')
const host = values['host-support'] ? parseJson(values['host-support'], '--host-support') : undefined
const selection = replayRecordedSelection(recorded, { host })
console.log(JSON.stringify({ selection, reproduced: true }))

function parseJson(value, flag) {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('must be an object')
    return parsed
  } catch (error) {
    throw new Error(`Invalid JSON for ${flag}: ${error.message}`)
  }
}
