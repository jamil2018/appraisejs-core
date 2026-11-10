import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createFixtureAdmission } from './custody-fixture-admission.ts'
import { captureServiceComplementCanonical, assertComplementCanonicalSnapshot } from './custody-complement-canonical.ts'
function fixture() {
  const receipt = { version: 1 },
    canonical = value => JSON.stringify(value),
    identity = { intentId: 'intent', sourceId: 'source', runId: 'run', sendBoundaryId: 'send', providerNamespace: 'ns' }
  const fixture = {
    sourceId: identity.sourceId,
    armed: { run: { id: identity.runId } },
    permit: { sendBoundaryId: identity.sendBoundaryId, claimEpoch: 1 },
    f: { prepareInput: { providerNamespace: identity.providerNamespace } },
  }
  const sealed = {
    input: { intentId: identity.intentId, observationKey: 'original-A' },
    requestHash: 'hash-A',
    receipt,
  }
  const temporal = {
    run: { earliestIntentAt: 7, unresolvedRetentionAt: 9 },
    intent: { claimExpiresAt: 11, armedAt: 13, acknowledgementDueAt: 15, turnDueAt: 17 },
  }
  const run = { id: 'run', status: 'UNKNOWN', turnsReserved: 1, ...temporal.run }
  const intent = {
    id: 'intent',
    status: 'NONSTART_RECONCILED',
    sendBoundaryId: 'send',
    claimEpoch: 1,
    providerRunId: 'run',
    providerNamespace: 'ns',
    acknowledgedAt: null,
    reconciledAt: 19,
    threadId: null,
    turnId: null,
    ...temporal.intent,
  }
  const observation = {
    id: 'observation',
    observationKey: 'original-A',
    requestHash: 'hash-A',
    kind: 'NONSTART',
    intentId: 'intent',
    sendBoundaryId: 'send',
    providerNamespace: 'ns',
    threadId: null,
    turnId: null,
    evidenceDigest: `sha256:${createHash('sha256').update(canonical(receipt)).digest('hex')}`,
    reconciliationJson: JSON.stringify(receipt),
  }
  const state = {
    sourceId: 'source',
    lifecycle: 'COMMITTED',
    committedRequestHash: 'hash-A',
    commitFenceVersion: 2,
    committedObservationId: 'observation',
  }
  const snapshot = {
    hub: { id: 'HUB', providerRunId: null, intentId: null, sendBoundaryId: null, reservedAt: null, version: 2 },
    run,
    intent,
    state,
    observations: [observation],
  }
  const expected = {
    frozenTurnCap: 3,
    originalRun: { id: 'run', turnsReserved: 1, ...temporal.run },
    originalIntent: {
      id: 'intent',
      sendBoundaryId: 'send',
      claimEpoch: 1,
      providerRunId: 'run',
      providerNamespace: 'ns',
      acknowledgedAt: null,
      ...temporal.intent,
    },
    originalTemporal: temporal,
    occupiedSource: {
      sourceId: 'source',
      lifecycle: 'OCCUPIED',
      commitFenceVersion: 1,
      committedRequestHash: null,
      committedObservationId: null,
    },
  }
  const reads = [],
    retained = [],
    admission = createFixtureAdmission(
      retained,
      () => true,
      () => {},
    )
  const read = (name, row) => ({
    findUniqueOrThrow: async args => {
      reads.push({ name, args })
      return row
    },
  })
  const tx = {
    qualityJourneyProviderSlot: read('hub', snapshot.hub),
    qualityJourneyProviderRun: read('run', run),
    qualityJourneyProviderDispatchIntent: read('intent', intent),
    qualityJourneyProviderSourceState: read('state', state),
    qualityJourneyProviderObservation: {
      findMany: async args => {
        reads.push({ name: 'observations', args })
        return snapshot.observations
      },
    },
  }
  return { fixture, sealed, canonical, snapshot, expected, reads, retained, admission, tx }
}
test('actual canonical capture preserves sequential read order, original query arguments and all exact returned rows', async () => {
  const x = fixture()
  const result = await captureServiceComplementCanonical(
    x.fixture,
    x.sealed,
    x.tx,
    x.admission,
    x.expected,
    x.canonical,
  )
  assert.deepEqual(
    x.reads.map(row => row.name),
    ['hub', 'run', 'intent', 'state', 'observations'],
  )
  assert.deepEqual(
    x.reads.map(row => row.args),
    [
      { where: { id: 'HUB' } },
      { where: { id: 'run' } },
      { where: { id: 'intent' } },
      { where: { sourceId: 'source' } },
      { take: 2 },
    ],
  )
  for (const key of ['hub', 'run', 'intent', 'state', 'observations']) assert.equal(result[key], x.snapshot[key])
  assert.equal(result.temporal.reservedAt, null)
})
test('complete canonical proof rejects mutated request pins, slot/turn/state/observation and temporal evidence', () => {
  const mutations = [
    s => {
      s.hub.version = 1
    },
    s => {
      s.run.turnsReserved = 0
    },
    s => {
      s.intent.status = 'UNKNOWN'
    },
    s => {
      s.intent.sendBoundaryId = 'other'
    },
    s => {
      s.intent.claimEpoch = 2
    },
    s => {
      s.intent.acknowledgedAt = 1
    },
    s => {
      s.intent.reconciledAt = null
    },
    s => {
      s.intent.turnId = 'other'
    },
    s => {
      s.intent.armedAt++
    },
    s => {
      s.state.lifecycle = 'OCCUPIED'
    },
    s => {
      s.state.committedRequestHash = 'B'
    },
    s => {
      s.state.commitFenceVersion++
    },
    s => {
      s.state.sourceId = 'foreign'
    },
    s => {
      s.observations = []
    },
    s => {
      s.observations[0].observationKey = 'B'
    },
    s => {
      s.observations[0].requestHash = 'B'
    },
    s => {
      s.observations[0].evidenceDigest = 'foreign'
    },
    s => {
      s.observations[0].reconciliationJson = '{}'
    },
  ]
  for (const mutate of mutations) {
    const x = fixture()
    mutate(x.snapshot)
    assert.throws(() => assertComplementCanonicalSnapshot(x.fixture, x.sealed, x.snapshot, x.expected, x.canonical))
  }
})
test('first failure at a genuine pending canonical read retains its actual fulfillment and admits no later read', async () => {
  const x = fixture(),
    first = new Error('STOP')
  let finish
  x.tx.qualityJourneyProviderSlot.findUniqueOrThrow = () =>
    new Promise(resolve => {
      finish = resolve
    })
  const pending = captureServiceComplementCanonical(x.fixture, x.sealed, x.tx, x.admission, x.expected, x.canonical)
  x.admission.fail(first, 'original-IPC')
  finish(x.snapshot.hub)
  await assert.rejects(pending, error => error === first)
  assert.ok(x.retained.includes(x.snapshot.hub))
  assert.deepEqual(x.reads, [])
})
