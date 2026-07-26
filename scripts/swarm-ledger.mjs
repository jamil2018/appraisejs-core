#!/usr/bin/env node

import path from 'node:path'
import { parseStrictArgs } from './lib/swarm-cli.mjs'
import fs from 'node:fs'
import { appendEvent, readJournal, validateRun } from './lib/swarm-ledger-store.mjs'
import { acquireLedgerLock, releaseLedgerLock } from './lib/swarm-ledger-lock.mjs'
import { normalizeTaskClass } from './lib/swarm-routing-contract.mjs'

const [command, ...argv] = process.argv.slice(2)
if (!['list', 'show', 'routes', 'metrics', 'status', 'recover', 'migrate'].includes(command)) {
  throw new Error('Usage: npm run swarm:ledger -- <list|show|routes|metrics|status|recover|migrate> [options]')
}
const values = parseStrictArgs(argv, { 'run-id': {}, source: {}, 'task-class': {} })
if (command === 'show' && !values['run-id']) throw new Error('show requires --run-id')
if (command !== 'show' && values['run-id']) throw new Error(`--run-id is invalid for ${command}`)
if (command !== 'migrate' && values.source) throw new Error(`--source is invalid for ${command}`)
if (command !== 'metrics' && values['task-class']) throw new Error(`--task-class is invalid for ${command}`)
if (command === 'metrics' && !values['task-class']) throw new Error('metrics requires --task-class')
const taskClass = command === 'metrics' ? normalizeTaskClass(values['task-class']) : null
const journalPath = path.join(process.cwd(), '.appraisejs', 'swarm-events.jsonl')
const lockPath = `${journalPath}.lock`
fs.mkdirSync(path.dirname(journalPath), { recursive: true, mode: 0o700 })
const lockToken = acquireLedgerLock(lockPath)
try {
  const journal = readJournal(journalPath, { recoverTail: command === 'recover' })
  const runs = [...journal.runs.values()]
  const routes = [...journal.routes.values()]
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
  } else if (command === 'routes') {
    console.log(JSON.stringify(routes))
  } else if (command === 'metrics') {
    const metricRoutes = routes.filter(route => route.taskClass === taskClass).slice(-5)
    const linkedDecisionIds = new Set(runs.map(run => run.routingDecisionId).filter(Boolean))
    const profileUse = Object.fromEntries(
      Object.entries(
        metricRoutes.reduce((counts, route) => {
          counts[route.profile] = (counts[route.profile] ?? 0) + 1
          return counts
        }, {}),
      ).sort(),
    )
    const delegated = metricRoutes.filter(route => route.delegationCount > 0)
    const coordinatorOnly = metricRoutes.filter(route => route.route === 'coordinator-only')
    const underRouting = metricRoutes.filter(isUnderRouted)
    const oversizedSol = metricRoutes.filter(
      route =>
        ['solver', 'judge'].includes(route.profile) &&
        route.verificationStrength === 'strong' &&
        route.consequence === 'low' &&
        !route.signals.highJudgment,
    )
    const observations = []
    if (underRouting.length >= 2) {
      observations.push({
        code: 'repeated-under-routing',
        count: underRouting.length,
        requiresUserGuidance: true,
      })
    }
    if (oversizedSol.length >= 2) {
      observations.push({
        code: 'oversized-sol',
        count: oversizedSol.length,
        requiresUserGuidance: true,
      })
    }
    const duplicateDelegationCount = metricRoutes.filter(route => route.signals.duplicateDelegation).length
    if (duplicateDelegationCount >= 2) {
      observations.push({
        code: 'duplicate-delegation',
        count: duplicateDelegationCount,
        requiresUserGuidance: true,
      })
    }
    const avoidableRerouteCount = metricRoutes.filter(route => route.rerouteCount > 0).length
    if (avoidableRerouteCount >= 2) {
      observations.push({
        code: 'avoidable-reroute',
        count: avoidableRerouteCount,
        requiresUserGuidance: true,
      })
    }
    console.log(
      JSON.stringify({
        taskClass,
        windowSize: metricRoutes.length,
        receiptCount: metricRoutes.length,
        delegatedCount: delegated.length,
        zeroAgentCount: coordinatorOnly.length,
        zeroAgentRate: metricRoutes.length ? coordinatorOnly.length / metricRoutes.length : 0,
        averageClassificationLatencyMs: metricRoutes.length
          ? metricRoutes.reduce((sum, route) => sum + route.classificationLatencyMs, 0) / metricRoutes.length
          : 0,
        escalationCount: metricRoutes.reduce((sum, route) => sum + route.escalationCount, 0),
        retryCount: metricRoutes.reduce((sum, route) => sum + route.retryCount, 0),
        rerouteCount: metricRoutes.reduce((sum, route) => sum + route.rerouteCount, 0),
        duplicateDelegationCount,
        unverifiedRuntimeClaims: metricRoutes.reduce(
          (count, route) =>
            count + Object.values(route.runtimeProof.claims).filter(claim => claim.status === 'unverified').length,
          0,
        ),
        linkedDelegatedCount: delegated.filter(route => linkedDecisionIds.has(route.decisionId)).length,
        underRoutingCount: underRouting.length,
        oversizedSolCount: oversizedSol.length,
        profileUse,
        observations,
        automaticHarnessChangeAuthorized: false,
      }),
    )
  } else if (command === 'show') {
    const run = journal.runs.get(values['run-id'])
    if (!run) throw new Error(`Unknown swarm run: ${values['run-id']}`)
    console.log(JSON.stringify(run))
  } else {
    console.log(
      JSON.stringify({
        runCount: runs.length,
        routeCount: routes.length,
        eventCount: journal.events.length,
        pending: runs.filter(run => run.evolution.notificationRequired && run.evolution.phase !== 'verified').length,
        recovered: command === 'recover',
      }),
    )
  }
} finally {
  releaseLedgerLock(lockPath, lockToken)
}

function isUnderRouted(route) {
  return route.route === 'coordinator-only' && (route.consequence === 'high' || hasEscalationSignal(route.signals))
}

function hasEscalationSignal(signals) {
  return [
    'missingEvidence',
    'highJudgment',
    'securityRisk',
    'persistenceRisk',
    'migrationRisk',
    'publicContractRisk',
  ].some(field => signals[field])
}
