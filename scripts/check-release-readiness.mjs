#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

import { evaluateReleaseLedger, runVerifiedFindingCommands, validateReleaseLedger } from './lib/release-readiness.mjs'

const repoRoot = process.cwd()
const ledgerPath = path.resolve(repoRoot, process.env.APPRAISE_RELEASE_LEDGER ?? 'config/release-readiness.json')
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
const schemaErrors = validateReleaseLedger(ledger)

if (schemaErrors.length > 0) {
  console.error('Release readiness ledger is invalid:')
  for (const error of schemaErrors) console.error(`- ${error}`)
  process.exit(1)
}

const commandResults = runVerifiedFindingCommands(ledger, { cwd: repoRoot })
const result = evaluateReleaseLedger(ledger, commandResults)

console.log('Release readiness findings:')
for (const finding of ledger.findings) {
  console.log(`- ${finding.id} [${finding.severity}] ${finding.status}: ${finding.title} (${finding.owner})`)
}

for (const commandResult of commandResults) {
  const label = commandResult.status === 0 ? 'passed' : `failed (${commandResult.status})`
  console.log(`- command ${label}: ${commandResult.command}`)
  if (commandResult.status !== 0) {
    if (commandResult.stdout.trim()) console.error(commandResult.stdout.trim())
    if (commandResult.stderr.trim()) console.error(commandResult.stderr.trim())
  }
}

if (!result.ok) {
  if (result.blockingFindings.length > 0) {
    console.error(`Release blocked by: ${result.blockingFindings.map(finding => finding.id).join(', ')}`)
  }
  if (result.failedCommands.length > 0) {
    console.error(`Release checks failed: ${result.failedCommands.map(item => item.command).join(', ')}`)
  }
  process.exit(1)
}

console.log('Release readiness check passed.')
