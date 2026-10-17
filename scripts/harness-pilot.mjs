#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { evaluatePilot } from './lib/harness-pilot.mjs'

if (process.argv.length !== 4 || process.argv[2] !== '--results') {
  throw new Error('Usage: node scripts/harness-pilot.mjs --results <aggregate-results.json>')
}
const manifest = JSON.parse(fs.readFileSync(path.resolve('config/development-harness/native-pilot.json'), 'utf8'))
const results = JSON.parse(fs.readFileSync(path.resolve(process.argv[3]), 'utf8'))
console.log(JSON.stringify(evaluatePilot(manifest, results), null, 2))
