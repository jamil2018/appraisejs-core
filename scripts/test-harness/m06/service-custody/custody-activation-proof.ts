// Full retained activation proof; inert at import, with exact wire datetime normalization.
import assert from 'node:assert/strict'
import { fixtureDateTime } from './custody-fixture-datetime.ts'
import { originalSourceResources } from './custody-source-resource-diagnostics.ts'
type Message = Record<string, unknown>

export function assertActivationRetainedOutcome(value: Message, expected: Message) {
  assert.equal(value.type, 'case-retained')
  assert.equal(value.classification, 'UNKNOWN_ACTUAL_OWNER_RETAINED')
  const activation = value.activation as Message
  assert.ok(activation && typeof activation === 'object')
  assert.ok(Buffer.byteLength(JSON.stringify(activation)) <= 16384)
  assert.equal(activation.version, 1)
  for (const field of ['case', 'pid', 'nonce'] as const) assert.equal(activation[field], expected[field])
  assert.equal(activation.case, 'activation-unknown')
  assert.deepEqual(activation.identity, expected.identity)
  assert.equal(activation.activationReason, 'source_observation_admission_closed')
  assert.equal(activation.closeReason, 'journal_unavailable')
  assertActivationSourceTransition(activation)
  assertActivationDatabaseHold(value, activation)
  assertActivationCanonicalUnknown(activation, expected)
}

export function assertActivationSourceTransition(activation: Message): void {
  const baseline = activation.baseline as Message
  const resources = originalSourceResources(baseline)
  assert.equal(resources.custody.mayHaveActivated, true)
  assert.equal(resources.source.keyByteLength, 32)
  assert.ok(resources.source.keyNonzeroBytes > 0 && resources.source.keyNonzeroBytes <= 32)
  assert.equal(resources.source.receiptEncodedBytes, 0)
  assert.equal(resources.source.journalOpen, true)
  for (const field of [
    'issuedProofPresent',
    'issuedExclusionPresent',
    'liveProofContainsIssued',
    'issuedProofMatchesOriginal',
    'issuedExclusionMatchesOriginal',
    'replayTombstoneContainsOriginal',
  ] as const)
    assert.equal(resources.source[field], false)
  for (const [field, held, requested] of [
    ['baseline', false, false],
    ['afterClose', true, false],
    ['afterDispose', true, true],
  ] as const) {
    const snapshot = activation[field] as Message
    assert.equal(snapshot.state, 'UNKNOWN')
    assert.equal(snapshot.held, held)
    assert.equal(snapshot.retired, held)
    assert.equal(snapshot.disposeRequested, requested)
    assert.equal(snapshot.disposed, false)
    assert.deepEqual(originalSourceResources(snapshot), resources)
  }
}

export function assertActivationDatabaseHold(value: Message, activation: Message): void {
  const databaseBaseline = activation.databaseBaseline as Message
  for (const [field, held] of [
    ['databaseBaseline', false],
    ['databaseAfterClose', true],
    ['databaseAfterDispose', true],
  ] as const) {
    const database = activation[field] as Message
    assert.equal(database.held, held)
    assert.equal(database.retired, held)
    assert.equal(database.cleanupPending, false)
    assert.equal(database.finalCloseRequested, false)
    assert.equal(database.lookupPending, false)
    assert.deepEqual(database.library, databaseBaseline.library)
    for (const owner of ['canonical', 'resolver'] as const) {
      const mint = database[owner] as Message
      const original = databaseBaseline[owner] as Message
      for (const flag of ['closed', 'engineClosed', 'nativeClosed', 'closeRequested', 'cleanupAdmitted'])
        assert.equal(mint[flag], false)
      assert.ok(Number.isSafeInteger(mint.holds) && Number(mint.holds) >= 0)
      assert.equal(Number(mint.holds) > 0, held)
      assert.deepEqual(mint.layers, { client: 'UNREQUESTED', engine: 'UNREQUESTED', native: 'UNREQUESTED' })
      for (const counter of ['stopCalls', 'nativeCalls']) {
        assert.ok(Number.isSafeInteger(mint[counter]) && Number(mint[counter]) >= 0)
        assert.equal(mint[counter], original[counter])
      }
    }
  }
  assert.deepEqual(activation.databaseAfterDispose, activation.databaseAfterClose)
  assert.deepEqual(value.snapshot, activation.afterDispose)
  assert.deepEqual(value.resources, activation.databaseAfterDispose)
}

export function assertActivationCanonicalUnknown(activation: Message, expected: Message): void {
  const identity = expected.identity as Message
  const canonical = activation.canonical as Message
  const run = canonical.run as Message
  const intent = canonical.intent as Message
  const slot = canonical.slot as Message
  for (const [field, key] of [
    ['id', 'runId'],
    ['journeyId', 'journeyId'],
    ['targetProjectId', 'targetProjectId'],
    ['providerNamespace', 'providerNamespace'],
    ['configurationDigest', 'configurationDigest'],
  ] as const)
    assert.equal(run[field], identity[key])
  assert.equal(run.status, 'UNKNOWN')
  assert.equal(run.turnsReserved, 1)
  for (const [field, key] of [
    ['id', 'intentId'],
    ['providerRunId', 'runId'],
    ['providerNamespace', 'providerNamespace'],
    ['sendBoundaryId', 'sendBoundaryId'],
    ['claimEpoch', 'claimEpoch'],
  ] as const)
    assert.equal(intent[field], identity[key])
  assert.equal(intent.status, 'UNKNOWN')
  assert.equal(slot.id, 'HUB')
  assert.equal(slot.version, 1)
  assert.equal(slot.providerRunId, identity.runId)
  assert.equal(slot.intentId, identity.intentId)
  assert.equal(slot.sendBoundaryId, identity.sendBoundaryId)
  assert.equal(fixtureDateTime(slot.reservedAt), (expected.originalTemporal as Message).reservedAt)
  assert.notEqual(slot.reservedAt, null)
  assert.equal(canonical.observations, 0)
}
