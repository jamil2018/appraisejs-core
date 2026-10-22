import { compositionServiceCase } from './custody-service-composition-selection'
export { compositionServiceCase }
import assert from 'node:assert/strict'
import { composeRetainedAnalysisAfterOriginalNonstart } from '@/test/m06-analysis-retained-composition'
import type { AnalysisFollowupDelivery } from '@/services/coordinator/quality-journey-analysis-scheduler'
import {
  providerSourceDatabaseClient,
  providerSourceDatabaseSnapshot,
} from '@/lib/quality-journey/provider-source-database'
import { originalSourceResources, type OriginalSourceResourceDiagnostics } from './custody-source-resource-diagnostics'
import type { OriginalFixture } from './custody-service-owner'
import type { createFixtureAdmission } from './custody-fixture-admission'

type SuccessfulNonstart = Parameters<typeof composeRetainedAnalysisAfterOriginalNonstart>[2]
type Admission = ReturnType<typeof createFixtureAdmission>

/** Compare settled delivery authority while checking the original start's passive timing separately. */
function assertSettledCompositionSnapshot(
  actual: ReturnType<AnalysisFollowupDelivery['snapshot']>,
  delivered: ReturnType<AnalysisFollowupDelivery['snapshot']>,
) {
  const { originalStartState: actualStartState, ...actualAuthority } = actual
  const { originalStartState: deliveredStartState, ...deliveredAuthority } = delivered
  assert.equal(actualStartState, 'FULFILLED')
  assert.ok(deliveredStartState === 'PENDING' || deliveredStartState === 'FULFILLED')
  assert.equal(actual.childLaunchEntered, true)
  assert.equal(delivered.childLaunchEntered, true)
  assert.deepEqual(actualAuthority, deliveredAuthority)
}

/** Original owner only. The product helper receives data, the same client and a preowned observer. */
export async function composeServiceOriginalNonstart(
  fixture: OriginalFixture,
  successfulNonstart: SuccessfulNonstart,
  sourceBaseline: OriginalSourceResourceDiagnostics,
  admission: Admission,
  fixturePath: string,
) {
  const { client, database, source, f, clientDestructionBaseline } = fixture
  const { assertActive, admitActual, afterActual, keepActual } = admission
  const cell: { actual: AnalysisFollowupDelivery | undefined } = { actual: undefined }
  const operation: {
    state: 'PENDING' | 'FULFILLED' | 'REJECTED'
    error?: unknown
    deliveries: number
    actual: ReturnType<typeof composeRetainedAnalysisAfterOriginalNonstart> | undefined
  } = { state: 'PENDING', actual: undefined, deliveries: 0 }
  keepActual('16z:preowned-delivery-cell', cell)
  keepActual('16z:preowned-helper-operation', operation)
  function assertOriginalAvailable() {
    assertActive('16z:original-available')
    assert.equal(client, providerSourceDatabaseClient(database))
    const actualSource = source.snapshot()
    for (const key of ['disposed', 'disposeRequested', 'held', 'retired'] as const)
      assert.equal(actualSource[key], false, key)
    const resources = originalSourceResources(actualSource)
    for (const key of [
      'keyZeroCalls',
      'receiptReleaseCalls',
      'liveProofMapReplaceCalls',
      'issuedClearCalls',
      'journalDisposeCalls',
    ] as const)
      assert.equal(resources.source[key], sourceBaseline.source[key], key)
    for (const key of ['allocationClearCalls', 'frameClearCalls'] as const)
      assert.equal(resources.custody[key], sourceBaseline.custody[key], key)
    const actualDatabase = providerSourceDatabaseSnapshot(database)
    for (const key of ['held', 'cleanupPending', 'retired', 'finalCloseRequested', 'lookupPending'] as const)
      assert.equal(actualDatabase[key], false, key)
    for (const lane of ['canonical', 'resolver'] as const) {
      assert.equal(actualDatabase[lane].holds, 0)
      assert.equal(actualDatabase[lane].closeRequested, false)
      assert.equal(actualDatabase[lane].cleanupAdmitted, false)
      for (const key of ['closed', 'engineClosed', 'nativeClosed', 'stopCalls', 'nativeCalls'] as const)
        assert.equal(actualDatabase[lane][key], clientDestructionBaseline[lane][key], `${lane}:${key}`)
    }
    return { source: actualSource, database: actualDatabase }
  }
  const before = admitActual('16z:before-helper', assertOriginalAvailable)
  const controller = keepActual('16z:original-controller', {
    retainDelivery(actual: AnalysisFollowupDelivery) {
      cell.actual = actual // First operation: preserve the real factory return before any assertion or start.
      keepActual('16z:actual-B-delivery', actual)
      operation.deliveries++
      assert.equal(operation.deliveries, 1)
      assertActive('16z:delivery-observed-before-start')
      assert.equal(actual.snapshot().providerRunId, undefined)
      assert.equal(actual.snapshot().state, 'startup')
    },
  })
  operation.actual = admitActual('16z:compose-original-nonstart', () =>
    composeRetainedAnalysisAfterOriginalNonstart(client, f.binding, successfulNonstart, {
      fixture: { fixturePath },
      followupAssignmentSecret: `synthetic-16z-followup-${'s'.repeat(32)}`,
      controller,
    }),
  )
  keepActual('16z:original-helper-promise', operation.actual)
  keepActual(
    '16z:helper-settlement-observer',
    operation.actual.then(
      () => {
        operation.state = 'FULFILLED'
      },
      error => {
        operation.state = 'REJECTED'
        operation.error = error
      },
    ),
  )
  const result = afterActual('16z:helper-fulfilled', await operation.actual)
  assert.equal(operation.state, 'FULFILLED')
  assert.ok(cell.actual)
  assert.equal(result.delivery.phase, 'DELIVERY')
  assert.ok('result' in result.delivery && result.delivery.result.status === 'ACCEPTED')
  // The fulfilled helper joins the original scheduler -> delivery.start -> supervisor.cancel/stop chain.
  // That stop joins the retained heartbeat flight. Never invoke a second start/cancel here.
  const delivered = keepActual('16z:actual-fulfilled-delivery-result', result.delivery.result)
  const actualSnapshot = keepActual('16z:actual-settled-B-snapshot', cell.actual.snapshot())
  assert.equal(actualSnapshot.cleanup?.status, 'stopped')
  assert.equal(actualSnapshot.cleanup?.groupExitObserved, true)
  assertSettledCompositionSnapshot(actualSnapshot, delivered.supervisor)
  assert.equal(actualSnapshot.providerRunId, result.successorRun.id)
  assert.equal(result.successorRun.status, 'ACKNOWLEDGED')
  assert.equal(result.successorRun.terminalReconciledAt, null)
  assert.equal(result.successorRun.turnsReserved, 1)
  assert.equal(result.intentTopology.baseline.length, 2)
  assert.equal(result.intentTopology.current.length, 3)
  const physicalB = afterActual(
    '16z:physical-B-intent',
    await admitActual('16z:physical-B-intent', () =>
      client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: result.intentTopology.added } }),
    ),
  )
  const slotB = afterActual(
    '16z:actual-B-slot',
    await admitActual('16z:actual-B-slot', () =>
      client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } }),
    ),
  )
  assert.equal(physicalB.status, 'ACKNOWLEDGED')
  assert.equal(physicalB.reconciledAt, null)
  assert.ok(physicalB.acknowledgedAt)
  assert.equal(physicalB.turnOrdinal, 1)
  assert.equal(physicalB.providerRunId, result.successorRun.id)
  assert.equal(slotB.intentId, physicalB.id)
  assert.equal(slotB.providerRunId, result.successorRun.id)
  assert.equal(slotB.sendBoundaryId, physicalB.sendBoundaryId)
  const attempts = afterActual(
    '16z:actual-attempt-ordinals',
    await admitActual('16z:actual-attempt-ordinals', () =>
      client.qualityJourneyWorkAttempt.findMany({
        where: { workItemId: f.binding.workItemId },
        orderBy: { attempt: 'asc' },
        select: { id: true, attempt: true, authorizationId: true },
      }),
    ),
  )
  assert.equal(attempts.length, 2)
  assert.deepEqual(
    attempts.map(attempt => attempt.attempt),
    [1, 2],
  )
  assert.equal(attempts[0]!.id, f.binding.attemptId)
  assert.equal(attempts[1]!.id, result.successorRun.attemptId)
  assert.equal(new Set(attempts.map(attempt => attempt.authorizationId)).size, 2)
  const finalJourney = afterActual(
    '16z:final-journey',
    await admitActual('16z:final-journey', () =>
      client.qualityJourney.findUniqueOrThrow({ where: { id: f.binding.journeyId } }),
    ),
  )
  const after = admitActual('16z:after-settlement-before-owner-cleanup', assertOriginalAvailable)
  return keepActual('16z:composition-known-settled-evidence', {
    version: 1,
    kind: 'ORIGINAL_NONSTART_AUTHORED_A_HUMAN_ANSWER_ACTUAL_B',
    authoredA: result.a.id,
    acceptedB: result.b.id,
    successorRun: result.successorRun,
    actualBIntent: physicalB,
    actualBSlot: slotB,
    attempts,
    originalNonstart: result.originalNonstart,
    intentTopology: result.intentTopology,
    followup: result.followup,
    originalHelperState: operation.state,
    finalOwnershipVersion: finalJourney.ownershipVersion,
    actualSnapshot,
    before,
    after,
    physicalB: 'UNKNOWN',
    canonicalBStatus: result.successorRun.status,
    runtimeQualified: false,
    providerQualified: false,
  })
}
