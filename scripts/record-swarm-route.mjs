#!/usr/bin/env node

import { parseStrictArgs } from './lib/swarm-cli.mjs'
import { withLockedSwarmJournal } from './lib/swarm-ledger-access.mjs'
import { appendEvent } from './lib/swarm-ledger-store.mjs'
import { createRoutingDecision } from './lib/swarm-router.mjs'

const argv = process.argv.slice(2)
if (argv.includes('--help')) {
  console.log(
    'Usage: npm run swarm:route -- --task-class <class> --route-input <json> --rationale <text> [--material <true|false>] [property-specific runtime proof] [metrics]',
  )
  process.exit(0)
}

const values = parseStrictArgs(argv, {
  'task-class': { required: true },
  'route-input': { required: true },
  rationale: { required: true },
  material: {},
  'runtime-role-proof': {},
  'runtime-role-receipt': {},
  'runtime-model-proof': {},
  'runtime-model-receipt': {},
  'runtime-reasoning-proof': {},
  'runtime-reasoning-receipt': {},
  'runtime-context-proof': {},
  'runtime-context-receipt': {},
  'runtime-sandbox-proof': {},
  'runtime-sandbox-receipt': {},
  'classification-latency-ms': {},
  'escalation-count': {},
  'retry-count': {},
  'reroute-count': {},
})

function nonNegativeInteger(name, fallback = 0) {
  if (!(name in values)) return fallback
  const value = Number(values[name])
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid metric: --${name}`)
  return value
}

function booleanValue(name, fallback) {
  if (!(name in values)) return fallback
  if (!['true', 'false'].includes(values[name])) throw new Error(`Invalid boolean: --${name}`)
  return values[name] === 'true'
}

let routeInput
try {
  routeInput = JSON.parse(values['route-input'])
} catch {
  throw new Error('Invalid JSON: --route-input')
}

function runtimeClaim(property) {
  const status = values[`runtime-${property}-proof`] ?? 'unverified'
  const receipt = values[`runtime-${property}-receipt`] ?? null
  if (!['verified', 'unverified'].includes(status)) throw new Error(`Invalid runtime ${property} proof status`)
  if (status === 'verified' && !receipt) throw new Error(`Verified runtime ${property} proof requires a receipt`)
  return { status, receipt }
}

const runtimeClaims = Object.fromEntries(
  ['role', 'model', 'reasoning', 'context', 'sandbox'].map(property => [property, runtimeClaim(property)]),
)
const verifiedClaimCount = Object.values(runtimeClaims).filter(claim => claim.status === 'verified').length
const runtimeStatus = verifiedClaimCount === 5 ? 'verified' : verifiedClaimCount > 0 ? 'partial' : 'unverified'
const recommendationInput = {
  ...routeInput,
  taskClass: values['task-class'],
  material: booleanValue('material', undefined),
  runtimeProof: {
    status: runtimeStatus,
    receipt: null,
    claims: runtimeClaims,
  },
  classificationLatencyMs: nonNegativeInteger('classification-latency-ms'),
  escalationCount: nonNegativeInteger('escalation-count'),
  retryCount: nonNegativeInteger('retry-count'),
  rerouteCount: nonNegativeInteger('reroute-count'),
}
const decision = createRoutingDecision(recommendationInput)
decision.rationale = values.rationale

const journalPath = withLockedSwarmJournal((journal, lockedJournalPath) => {
  appendEvent(lockedJournalPath, { kind: 'route.recorded', decision }, journal.lastHash)
  return lockedJournalPath
})

console.log(JSON.stringify({ decision, journalPath }))
