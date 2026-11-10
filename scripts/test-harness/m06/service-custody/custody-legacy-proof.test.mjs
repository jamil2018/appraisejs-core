// The actual complete fixture proof with inert original-operation fakes, never historical product imports.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createFixtureAdmission } from './custody-fixture-admission.ts'
import { provePreparedLegacyCase } from './custody-legacy-proof.mjs'
class FixtureServiceError extends Error {
  constructor(message) {
    super(message)
    this.code = 'CONFLICT'
  }
}
class FixtureSourceError extends Error {
  constructor(reason) {
    super(reason)
    this.reason = reason
  }
}
function fixture(name) {
  const calls = [],
    retained = [],
    admission = createFixtureAdmission(
      retained,
      () => true,
      () => {},
    ),
    receipt = { physical: { version: 1 } },
    physicalEvidence = {},
    context = {},
    unavailable = {},
    trusted = {},
    input = { intentId: 'intent', observationKey: 'original-legacy-nonstart' },
    requestHash = 'sha256:original-A'
  let disposed = false,
    observationCount = 0
  const transaction = function () {
    calls.push('transaction')
    return Promise.resolve()
  }
  const client = {
    $transaction: transaction,
    qualityJourneyProviderSourceState: {
      count: async () => {
        calls.push('source-count')
        return 0
      },
    },
    qualityJourneyProviderSourceLedgerRecord: {
      count: async () => {
        calls.push('ledger-count')
        return 0
      },
    },
    qualityJourneyProviderRun: {
      findUniqueOrThrow: async () => {
        calls.push('run-read')
        return { turnsReserved: 1 }
      },
    },
    qualityJourneyProviderObservation: {
      count: async () => {
        calls.push('observation-count')
        return observationCount
      },
    },
  }
  const source = {
      context,
      dispose() {
        calls.push('dispose')
        disposed = true
      },
    },
    physicalSource = {
      inspect(actual) {
        assert.equal(actual, physicalEvidence)
        if (disposed) throw new FixtureSourceError('key_loss_or_disposed')
        return receipt.physical
      },
    }
  const committed = name === 'legacy-committed-clean-replay',
    original = { replayed: false, receipt, observation: { id: 'original-observation' } }
  const scope = {
    name,
    nonce: 'inert',
    client,
    retained,
    event: async (type, detail) => {
      calls.push(['event', type, detail])
    },
    writeExpectation: row => calls.push(['expectation', row]),
    assertActive: admission.assertActive,
    admission,
    phase: async (label, start) => admission.afterActual(label, await admission.admitActual(label, start)),
    admit: admission.admitActual,
    source,
    physicalSource,
    physicalEvidence,
    input,
    receipt,
    requestHash,
    armed: { run: { id: 'run' } },
    isCommittedLegacyCase: () => committed,
    isMissingLegacyCommit: error =>
      error instanceof FixtureServiceError &&
      error.message === 'No exact committed legacy provider reconciliation exists.',
    originalRefusal: (error, reason) => error instanceof FixtureSourceError && error.reason === reason,
    prepareFreshSourceRefusal(actual) {
      assert.equal(actual, physicalSource)
      calls.push('prepare-fresh')
    },
    originalReconcile(actual, actualContext, authority, actualClient) {
      assert.equal(actual, input)
      assert.equal(actualContext, context)
      assert.equal(authority, trusted)
      assert.equal(actualClient, client)
      calls.push('original-commit')
      observationCount = 1
      return Promise.resolve(original)
    },
    reconcile(actual, actualContext, authority, actualClient) {
      assert.equal(authority, trusted)
      assert.equal(actualClient, client)
      calls.push(['reconcile', actual, actualContext])
      if (committed) {
        assert.equal(actualContext, unavailable)
        if (
          actual.intentId === input.intentId &&
          actual.observationKey === input.observationKey &&
          actual.replayRequestHash === requestHash
        )
          return Promise.resolve({ ...original, replayed: true })
        return Promise.reject(
          new FixtureServiceError('No exact committed provider reconciliation exists in the clean replay resolver.'),
        )
      }
      assert.equal(actual, input)
      assert.equal(actualContext, context)
      if (name === 'legacy-fs-valid-fresh-refusal')
        return Promise.reject(new FixtureServiceError('No exact committed legacy provider reconciliation exists.'))
      return Promise.reject(
        new FixtureSourceError(
          name === 'legacy-fs-disposed-fresh-refusal' ? 'key_loss_or_disposed' : 'journal_unavailable',
        ),
      )
    },
    trustedProviderReconciliation: trusted,
    unavailableNativeProviderReconciliation: unavailable,
    ServiceError: FixtureServiceError,
  }
  return { calls, retained, admission, scope, client, transaction, original }
}
test('complete actual committed legacy proof preserves old commit then disposed-source replay plus three exact negatives', async () => {
  const x = fixture('legacy-committed-clean-replay')
  await provePreparedLegacyCase(x.scope)
  assert.equal(x.client.$transaction, x.transaction)
  assert.ok(x.retained.includes(x.original))
  assert.equal(x.calls[0], 'original-commit')
  const replays = x.calls.filter(row => Array.isArray(row) && row[0] === 'reconcile')
  assert.equal(replays.length, 5)
  assert.deepEqual(replays[0][1], {
    intentId: 'intent',
    observationKey: 'original-legacy-nonstart',
    replayRequestHash: 'sha256:original-A',
  })
  assert.deepEqual(
    replays.slice(2).map(row => row[1]),
    [
      { ...replays[0][1], observationKey: 'wrong-original-key' },
      { ...replays[0][1], replayRequestHash: `sha256:${'f'.repeat(64)}` },
      { ...replays[0][1], intentId: 'wrong-inert' },
    ],
  )
  assert.deepEqual(x.calls.slice(-4), ['source-count', 'ledger-count', 'run-read', 'observation-count'])
  assert.equal(x.calls.includes('transaction'), false)
})
for (const name of [
  'legacy-fs-valid-fresh-refusal',
  'legacy-fs-disposed-fresh-refusal',
  'legacy-fs-sealed-corrupt-fresh-refusal',
]) {
  test(`complete actual ${name} proof retains original refusal and never enters canonical transaction`, async () => {
    const x = fixture(name)
    await provePreparedLegacyCase(x.scope)
    assert.equal(x.client.$transaction, x.transaction)
    assert.equal(x.calls[0], 'prepare-fresh')
    assert.equal(x.calls.filter(row => Array.isArray(row) && row[0] === 'reconcile').length, 1)
    assert.equal(x.calls.includes('original-commit'), false)
    assert.equal(x.calls.includes('transaction'), false)
    assert.ok(x.calls.includes('dispose'))
    assert.deepEqual(x.calls.slice(-4), ['source-count', 'ledger-count', 'run-read', 'observation-count'])
  })
}
test('first failure during genuine old commit retains fulfillment and blocks dispose/replay/final canonical reads', async () => {
  const x = fixture('legacy-committed-clean-replay'),
    cause = new Error('STOP')
  let done
  x.scope.originalReconcile = () =>
    new Promise(resolve => {
      done = resolve
    })
  const pending = provePreparedLegacyCase(x.scope)
  x.admission.fail(cause, 'original-disconnect')
  done(x.original)
  await assert.rejects(pending, error => error === cause)
  assert.ok(x.retained.includes(x.original))
  assert.deepEqual(x.calls, [])
})
test('complete actual proof rejects unexpected canonical entry and wrong refusal without manufacturing success', async () => {
  const x = fixture('legacy-fs-valid-fresh-refusal')
  x.scope.reconcile = async () => {
    await x.client.$transaction()
    throw new FixtureServiceError('No exact committed legacy provider reconciliation exists.')
  }
  await assert.rejects(provePreparedLegacyCase(x.scope))
  assert.equal(x.client.$transaction, x.transaction)
  const y = fixture('legacy-fs-disposed-fresh-refusal')
  y.scope.reconcile = () => Promise.reject(new FixtureSourceError('wrong'))
  await assert.rejects(provePreparedLegacyCase(y.scope))
  assert.equal(y.client.$transaction, y.transaction)
})
