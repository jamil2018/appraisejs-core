#!/usr/bin/env node

import path from 'node:path'
import { parseStrictArgs } from './lib/swarm-cli.mjs'
import { appendEvent, readJournal, validateRun } from './lib/swarm-ledger-store.mjs'
import { acquireLedgerLock, releaseLedgerLock } from './lib/swarm-ledger-lock.mjs'
import { isEffectiveIndependentJudgeContext } from './lib/swarm-routing-contract.mjs'

const argv = process.argv.slice(2)
if (argv.includes('--help')) {
  console.log(
    'Usage: npm run swarm:evolve -- --run-id <id> --action <notify|guide|ready|complete> [action fields]. Notification/guidance provenance records host evidence but never replaces the host conversation as authority.',
  )
  process.exit(0)
}
const values = parseStrictArgs(argv, {
  'run-id': { required: true },
  action: { required: true },
  'delivery-receipt': {},
  guidance: {},
  'authority-source': {},
  'thread-id': {},
  'message-id': {},
  update: {},
  verification: {},
  'reevaluation-run-id': {},
})
if (!['notify', 'guide', 'ready', 'complete'].includes(values.action)) {
  throw new Error(`Invalid evolution action: ${values.action}`)
}
const requiredByAction = {
  notify: ['delivery-receipt'],
  guide: ['guidance', 'authority-source', 'thread-id', 'message-id'],
  ready: ['update', 'verification'],
  complete: ['reevaluation-run-id'],
}
for (const field of requiredByAction[values.action]) {
  if (!values[field]) throw new Error(`Missing required argument for ${values.action}: --${field}`)
}
const allowedByAction = {
  notify: new Set(['run-id', 'action', 'delivery-receipt']),
  guide: new Set(['run-id', 'action', 'guidance', 'authority-source', 'thread-id', 'message-id']),
  ready: new Set(['run-id', 'action', 'update', 'verification']),
  complete: new Set(['run-id', 'action', 'reevaluation-run-id']),
}
for (const field of Object.keys(values)) {
  if (!allowedByAction[values.action].has(field)) throw new Error(`Argument --${field} is invalid for ${values.action}`)
}
if (values.action === 'guide' && values['authority-source'] !== 'host-conversation') {
  throw new Error('Guidance authority source must be host-conversation')
}

const journalPath = path.join(process.cwd(), '.appraisejs', 'swarm-events.jsonl')
const lockPath = `${journalPath}.lock`
const lockToken = acquireLedgerLock(lockPath)
let result
try {
  const journal = readJournal(journalPath)
  const run = journal.runs.get(values['run-id'])
  if (!run) throw new Error(`Unknown swarm run: ${values['run-id']}`)
  validateRun(run)
  if (!run.evolution.notificationRequired) throw new Error(`Run ${run.runId} does not require evolution`)
  const now = new Date().toISOString()
  let patch
  if (values.action === 'notify') {
    if (run.evolution.phase !== 'notification_required') {
      throw new Error(`Cannot notify from ${run.evolution.phase}`)
    }
    patch = {
      phase: 'awaiting_user_guidance',
      notifiedAt: now,
      notificationReceipt: values['delivery-receipt'],
    }
  } else if (values.action === 'guide') {
    if (run.evolution.phase !== 'awaiting_user_guidance') {
      throw new Error(`Cannot record guidance from ${run.evolution.phase}`)
    }
    patch = {
      phase: 'guidance_received',
      userGuidance: values.guidance,
      guidanceProvenance: {
        authoritySource: values['authority-source'],
        threadId: values['thread-id'],
        messageId: values['message-id'],
      },
      guidanceRecordedAt: now,
    }
  } else if (values.action === 'ready') {
    if (run.evolution.phase !== 'guidance_received') {
      throw new Error(`Cannot mark update ready from ${run.evolution.phase}`)
    }
    if (
      !run.evolution.notificationReceipt ||
      !run.evolution.guidanceProvenance ||
      run.evolution.guidanceProvenance.authoritySource !== 'host-conversation'
    ) {
      throw new Error('Notification and host guidance provenance are required before update')
    }
    patch = {
      phase: 'awaiting_reevaluation',
      updateSummary: values.update,
      verification: values.verification,
      verificationRecordedAt: now,
    }
  } else {
    if (run.evolution.phase !== 'awaiting_reevaluation') {
      throw new Error(`Cannot complete evolution from ${run.evolution.phase}`)
    }
    const reevaluation = journal.runs.get(values['reevaluation-run-id'])
    if (!reevaluation) throw new Error(`Unknown reevaluation run: ${values['reevaluation-run-id']}`)
    validateRun(reevaluation)
    const alreadyLinked = [...journal.runs.values()].some(
      item => item.runId !== run.runId && item.evolution.reevaluationRunId === reevaluation.runId,
    )
    const clean =
      !alreadyLinked &&
      reevaluation.taskClass === run.taskClass &&
      Date.parse(reevaluation.recordedAt) > Date.parse(run.evolution.verificationRecordedAt) &&
      reevaluation.score === 10 &&
      reevaluation.status === 'healthy' &&
      !reevaluation.criticalOverride &&
      reevaluation.triggers.length === 0 &&
      reevaluation.evolution.observations.length === 0 &&
      isEffectiveIndependentJudgeContext(reevaluation.judgeContext, reevaluation.judgeContextEvidence)
    if (!clean) throw new Error('Completion requires a clean, later, independent, unique 10/10 re-evaluation')
    patch = {
      phase: 'verified',
      reevaluationRunId: reevaluation.runId,
      updatedAt: now,
    }
  }
  const transitioned = structuredClone(run)
  Object.assign(transitioned.evolution, patch)
  validateRun(transitioned)
  appendEvent(journalPath, { kind: 'run.transition', runId: run.runId, action: values.action, patch }, journal.lastHash)
  result = { runId: run.runId, evolution: transitioned.evolution }
} finally {
  releaseLedgerLock(lockPath, lockToken)
}
console.log(JSON.stringify(result))
