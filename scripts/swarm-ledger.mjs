#!/usr/bin/env node

import path from 'node:path'
import { parseStrictArgs } from './lib/swarm-cli.mjs'
import fs from 'node:fs'
import { appendEvent, readJournal, validateRun } from './lib/swarm-ledger-store.mjs'
import { acquireLedgerLock, releaseLedgerLock } from './lib/swarm-ledger-lock.mjs'

const [command, ...argv] = process.argv.slice(2)
if (!['list', 'show', 'status', 'recover', 'migrate'].includes(command)) {
  throw new Error('Usage: npm run swarm:ledger -- <list|show|status|recover|migrate> [options]')
}
const values = parseStrictArgs(argv, { 'run-id': {}, source: {} })
if (command === 'show' && !values['run-id']) throw new Error('show requires --run-id')
if (command !== 'show' && values['run-id']) throw new Error(`--run-id is invalid for ${command}`)
if (command !== 'migrate' && values.source) throw new Error(`--source is invalid for ${command}`)
const journalPath = path.join(process.cwd(), '.appraisejs', 'swarm-events.jsonl')
const lockPath = `${journalPath}.lock`
fs.mkdirSync(path.dirname(journalPath), { recursive: true, mode: 0o700 })
const lockToken = acquireLedgerLock(lockPath)
try {
  const journal = readJournal(journalPath, { recoverTail: command === 'recover' })
  const runs = [...journal.runs.values()]
  if (command === 'migrate') {
    const source = path.resolve(values.source ?? path.join(process.cwd(), '.appraisejs', 'swarm-runs.jsonl'))
    const imported = []
    const skipped = []
    let previousHash = journal.lastHash
    const sourceLines = fs.existsSync(source) ? fs.readFileSync(source, 'utf8').split('\n').filter(Boolean) : []
    for (const [index, line] of sourceLines.entries()) {
      try {
        const legacy = JSON.parse(line)
        validateRun(legacy, `legacy line ${index + 1}`)
        if (journal.runs.has(legacy.runId) || imported.includes(legacy.runId)) {
          throw new Error(`duplicate runId ${legacy.runId}`)
        }
        const event = appendEvent(journalPath, { kind: 'run.recorded', run: legacy }, previousHash)
        previousHash = event.hash
        imported.push(legacy.runId)
      } catch (error) {
        skipped.push({ line: index + 1, reason: error.message })
      }
    }
    console.log(JSON.stringify({ source, imported, skipped }))
  } else if (command === 'list') {
    console.log(
      JSON.stringify(
        runs.map(run => ({
          runId: run.runId,
          recordedAt: run.recordedAt,
          taskClass: run.taskClass,
          score: run.score,
          phase: run.evolution.phase,
        })),
      ),
    )
  } else if (command === 'show') {
    const run = journal.runs.get(values['run-id'])
    if (!run) throw new Error(`Unknown swarm run: ${values['run-id']}`)
    console.log(JSON.stringify(run))
  } else {
    console.log(
      JSON.stringify({
        runCount: runs.length,
        eventCount: journal.events.length,
        pending: runs.filter(run => run.evolution.notificationRequired && run.evolution.phase !== 'verified').length,
        recovered: command === 'recover',
      }),
    )
  }
} finally {
  releaseLedgerLock(lockPath, lockToken)
}
