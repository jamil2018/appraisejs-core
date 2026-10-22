import assert from 'node:assert/strict'
import path from 'node:path'
import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import {
  answerQualityJourneyAnalysisQuestion,
  publishQualityJourneyAnalysis,
  submitExternalQualityJourneyAnalysisSuccessor,
} from '@/services/coordinator/quality-journey-analysis-service'
import { ensureQualityJourneyAnalysisFollowupInTransaction } from '@/services/coordinator/quality-journey-service'
import type { AnalysisFollowupSchedulerInput } from '@/services/coordinator/quality-journey-analysis-scheduler'
import {
  acknowledgeQualityJourneyWake,
  claimQualityJourneyWake,
  listQualityJourneyWakeWork,
} from '@/services/coordinator/quality-journey-wake-service'
import {
  allocateRetainedAnalysisFixture,
  advanceRetainedAnalysis,
  createRetainedAnalysisDelivery,
  type RetainedAnalysisFixture as Fixture,
  type RetainedAnalysisScenarioContext,
} from './m06-analysis-retained-fixture'
import { projectRetainedAnalysisSubmissionBinding } from './m06-analysis-retained-composition'
import { assertRetainedFields } from './m06-analysis-retained-lifetime'
import { prepareQualityJourneyProviderRun } from '@/services/coordinator/quality-journey-provider-run-service'
const fixturePath = path.resolve('scripts/tests/fixtures/m06-analysis-child.mjs')
function seedCharter(f: Fixture) {
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    charterId: 'seed-charter',
    analysisRevisionId: 'seed-A',
    ...f.scope,
    cycleId: f.created.journey.activeCycleId,
    requirementRevisionId: f.created.journey.activeRevisionIds.journey,
    objectives: ['Clarify bounded scope.'],
    scope: { included: ['Checkout'], excluded: [] },
    actors: ['User'],
    requirements: [
      {
        requirementId: 'REQ-SEED',
        statement: 'The bounded requirement is fulfilled.',
        sourceRefs: ['requirement:objective'],
      },
    ],
    obligations: [
      {
        obligationId: 'OBL-SEED',
        requirementId: 'REQ-SEED',
        statement: 'Scope has evidence.',
        acceptanceSignals: ['Recorded clarification'],
      },
    ],
    constraints: [],
    assumptions: [],
    risks: [],
    acceptanceSignals: ['Recorded clarification'],
    retiredRequirementIds: [],
    questions: [
      { questionId: 'payment', prompt: 'Payment?', required: true, rationale: 'Scope.' },
      { questionId: 'shipping', prompt: 'Shipping?', required: true, rationale: 'Scope.' },
    ],
    resolvedQuestionAnswerIds: [],
  }
}
async function canonicalPredecessor(f: Fixture) {
  return f.owner.track('original:submitExternalQualityJourneyAnalysisSuccessor', () =>
    submitExternalQualityJourneyAnalysisSuccessor(
      {
        ...projectRetainedAnalysisSubmissionBinding(f.binding),
        idempotencyKey: 'seed-A-submit',
        charter: seedCharter(f),
      },
      f.principal,
      f.client,
      f.credentials,
    ),
  )
}
const answerRequest = (f: Fixture, analysisRevisionId: string, questionId: string) => ({
  idempotencyKey: `answer:${analysisRevisionId}:${questionId}`,
  answer: {
    schemaVersion: 'appraise.quality-journey/v1',
    ...f.scope,
    analysisRevisionId,
    questionId,
    answerId: `answer:${analysisRevisionId}:${questionId}`,
    answer: 'Exact human scope.',
    actor: 'USER',
  },
})
async function answer(f: Fixture, revisionId: string, questionId: string) {
  return f.owner.track('original:answerQualityJourneyAnalysisQuestion', () =>
    answerQualityJourneyAnalysisQuestion(
      answerRequest(f, revisionId, questionId),
      f.client,
      trustedHumanCoordinatorSession,
    ),
  )
}
async function ready(f: Fixture, revisionId: string) {
  await answer(f, revisionId, 'payment')
  await answer(f, revisionId, 'shipping')
  const result = await f.owner.track('original:f.client.$transaction', () =>
    f.client.$transaction(tx =>
      f.owner.track('original:ensureQualityJourneyAnalysisFollowupInTransaction', () =>
        ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, tx),
      ),
    ),
  )
  if (!result.expected) throw new Error(`Expected issuance, received ${result.status}`)
  return {
    ...f.credentials,
    expected: result.expected,
    principal: f.principal,
    assignmentSecret: 'original-owned-followup-secret-0123456789',
    fixture: { fixturePath, requestTimeoutMs: 5_000 },
  } satisfies AnalysisFollowupSchedulerInput
}
async function counts(f: Fixture) {
  const [attempts, authorizations, runs, intents, turns] = await Promise.all([
    f.owner.track('original:f.client.qualityJourneyWorkAttempt.count', () =>
      f.client.qualityJourneyWorkAttempt.count({ where: { workItemId: f.binding.workItemId } }),
    ),
    f.owner.track('original:f.client.qualityJourneyWorkAuthorization.count', () =>
      f.client.qualityJourneyWorkAuthorization.count({ where: { workItemId: f.binding.workItemId } }),
    ),
    f.owner.track('original:f.client.qualityJourneyProviderRun.count', () =>
      f.client.qualityJourneyProviderRun.count({ where: { journeyId: f.scope.journeyId } }),
    ),
    f.owner.track('original:f.client.qualityJourneyProviderDispatchIntent.count', () =>
      f.client.qualityJourneyProviderDispatchIntent.count({ where: { run: { journeyId: f.scope.journeyId } } }),
    ),
    f.owner.track('original:f.client.qualityJourneyProviderRun.aggregate', () =>
      f.client.qualityJourneyProviderRun.aggregate({
        where: { journeyId: f.scope.journeyId },
        _sum: { turnsReserved: true },
      }),
    ),
  ])
  return { attempts, authorizations, runs, intents, turnsReserved: turns._sum.turnsReserved ?? 0 }
}

async function retainedAnalysisScenario1(context: RetainedAnalysisScenarioContext) {
  const f = await allocateRetainedAnalysisFixture(context)
  const a = await canonicalPredecessor(f)
  const input = await ready(f, a.analysisRevision.id)
  assert.deepEqual(await counts(f), { attempts: 1, authorizations: 2, runs: 0, intents: 0, turnsReserved: 0 })
  const scan = await context.owner.track('original:listQualityJourneyWakeWork', () =>
    listQualityJourneyWakeWork(f.credentials, f.client),
  )
  assert.equal(scan.analysisFollowups.length, 1)
  for (const wake of scan.pending) {
    const claim = await context.owner.track('original:claimQualityJourneyWake', () =>
      claimQualityJourneyWake({ ...f.credentials, wakeId: wake.id, claimOwner: 'offline-test' }, f.client),
    )
    await context.owner.track('original:acknowledgeQualityJourneyWake', () =>
      acknowledgeQualityJourneyWake(
        { ...f.credentials, wakeId: wake.id, claimOwner: 'offline-test', claimEpoch: claim.claimEpoch },
        f.client,
      ),
    )
  }
  assert.deepEqual(
    (
      await context.owner.track('original:listQualityJourneyWakeWork', () =>
        listQualityJourneyWakeWork(f.credentials, f.connect()),
      )
    ).analysisFollowups[0]!.expected,
    input.expected,
  )
  const claimed = await advanceRetainedAnalysis(context, input, f.client)
  assert.equal(claimed.phase, 'CLAIMED')
  const afterClaim = await counts(f)
  assertRetainedFields(
    await advanceRetainedAnalysis(
      context,
      { ...input, assignmentSecret: 'wrong-original-secret-01234567890123456789' },
      f.connect(),
    ),
    { phase: 'RECOVERY_REQUIRED' },
  )
  assert.deepEqual(await counts(f), afterClaim)
  const admitted = await advanceRetainedAnalysis(context, input, f.connect())
  assert.equal(admitted.phase, 'ADMITTED')
  assertRetainedFields(
    (
      await context.owner.track('original:listQualityJourneyWakeWork', () =>
        listQualityJourneyWakeWork(f.credentials, f.connect()),
      )
    ).analysisFollowups[0],
    {
      expected: input.expected,
      phase: 'ADMITTED',
    },
  )
  const results = await Promise.allSettled([
    advanceRetainedAnalysis(context, input, f.client),
    advanceRetainedAnalysis(context, input, f.connect()),
  ])
  const delivered = results.filter(result => result.status === 'fulfilled' && result.value.phase === 'DELIVERY')
  assert.equal(delivered.length, 1)
  const b = await context.owner.track('original:f.client.qualityJourneyAnalysisRevision.findFirstOrThrow', () =>
    f.client.qualityJourneyAnalysisRevision.findFirstOrThrow({
      where: { predecessorRevisionId: a.analysisRevision.id },
      include: { artifact: true },
    }),
  )
  assert.deepEqual(
    JSON.parse(b.artifact.artifactJson).resolvedQuestionAnswerIds.sort(),
    [`answer:${a.analysisRevision.id}:payment`, `answer:${a.analysisRevision.id}:shipping`].sort(),
  )
  assert.deepEqual(await counts(f), { attempts: 2, authorizations: 2, runs: 1, intents: 1, turnsReserved: 1 })
  assertRetainedFields(await advanceRetainedAnalysis(context, input, f.connect()), {
    phase: 'OBSERVED',
    reason: 'CANONICAL_ACCEPTANCE_REPLAY',
  })
  assert.deepEqual(await counts(f), { attempts: 2, authorizations: 2, runs: 1, intents: 1, turnsReserved: 1 })
  assert.equal(
    await context.owner.track('original:f.client.qualityJourneyAnalysisDecision.count', () =>
      f.client.qualityJourneyAnalysisDecision.count({ where: { journeyId: f.scope.journeyId } }),
    ),
    0,
  )
  const state = await context.owner.track('original:f.client.qualityJourney.findUniqueOrThrow', () =>
    f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } }),
  )
  await context.owner.track('original:publishQualityJourneyAnalysis', () =>
    publishQualityJourneyAnalysis(
      {
        schemaVersion: 'appraise.quality-journey/v1',
        ...f.scope,
        commandId: 'publish-B',
        actor: 'RUNNER',
        command: 'PUBLISH_ANALYSIS',
        expectedStateHash: state.stateHash,
        idempotencyKey: 'publish-B',
        inputArtifactRefs: [
          {
            kind: 'ANALYSIS_CHARTER_REVISION',
            artifactId: b.artifactId,
            revisionId: b.artifactRevisionId,
            contentHash: b.contentHash,
          },
        ],
        payload: { artifactRevisionId: b.artifactRevisionId, artifactHash: b.contentHash },
      },
      f.client,
      f.credentials,
    ),
  )
  assert.equal(
    await context.owner.track('original:f.client.qualityJourneyAnalysisPublication.count', () =>
      f.client.qualityJourneyAnalysisPublication.count({ where: { journeyId: f.scope.journeyId } }),
    ),
    1,
  )
  assert.equal(
    await context.owner.track('original:f.client.qualityJourneyAnalysisDecision.count', () =>
      f.client.qualityJourneyAnalysisDecision.count({ where: { journeyId: f.scope.journeyId } }),
    ),
    0,
  )
  // The actual B child still has physical UNKNOWN. This is one positive
  // repository successor delivery, never a native TERMINAL or three-child proof.
  assert.notEqual(
    (
      await context.owner.track('original:f.client.qualityJourneyProviderSlot.findUniqueOrThrow', () =>
        f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } }),
      )
    ).intentId,
    null,
  )
}
async function retainedAnalysisScenario2(context: RetainedAnalysisScenarioContext) {
  const f = await allocateRetainedAnalysisFixture(context)
  const delivery = await createRetainedAnalysisDelivery(
    context,
    f.prepareInput,
    { fixturePath, submissionIdempotencyKey: 'unknown-A-submit' },
    f.client,
  )
  assertRetainedFields(await context.owner.track('original:delivery.start', () => delivery.start()), {
    status: 'ACCEPTED',
  })
  const a = await context.owner.track('original:f.client.qualityJourneyAnalysisRevision.findFirstOrThrow', () =>
    f.client.qualityJourneyAnalysisRevision.findFirstOrThrow({
      where: { journeyId: f.scope.journeyId },
    }),
  )
  const slotBefore = await context.owner.track('original:f.client.qualityJourneyProviderSlot.findUniqueOrThrow', () =>
    f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } }),
  )
  await answer(f, a.id, 'm06-required-question')
  const issued = await context.owner.track('original:f.client.$transaction', () =>
    f.client.$transaction(tx =>
      context.owner.track('original:ensureQualityJourneyAnalysisFollowupInTransaction', () =>
        ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, tx),
      ),
    ),
  )
  if (!issued.expected) throw new Error('Logical successor was not issued.')
  const input: AnalysisFollowupSchedulerInput = {
    ...f.credentials,
    expected: issued.expected,
    principal: f.principal,
    assignmentSecret: 'original-unknown-followup-secret-0123456789',
    fixture: { fixturePath },
  }
  const wakeScan = await context.owner.track('original:listQualityJourneyWakeWork', () =>
    listQualityJourneyWakeWork(f.credentials, f.client),
  )
  for (const wake of wakeScan.pending) {
    const claimedWake = await context.owner.track('original:claimQualityJourneyWake', () =>
      claimQualityJourneyWake({ ...f.credentials, wakeId: wake.id, claimOwner: 'negative-offline-test' }, f.client),
    )
    await context.owner.track('original:acknowledgeQualityJourneyWake', () =>
      acknowledgeQualityJourneyWake(
        { ...f.credentials, wakeId: wake.id, claimOwner: 'negative-offline-test', claimEpoch: claimedWake.claimEpoch },
        f.client,
      ),
    )
  }
  const results = await Promise.all([
    advanceRetainedAnalysis(context, input, f.client),
    advanceRetainedAnalysis(context, input, f.connect()),
  ])
  assert.equal(
    results.every(result => result.phase === 'WAITING' && result.reason === 'PHYSICAL_RECONCILIATION_REQUIRED'),
    true,
  )
  assert.deepEqual(await counts(f), { attempts: 1, authorizations: 2, runs: 1, intents: 1, turnsReserved: 1 })
  assert.deepEqual(
    await context.owner.track('original:f.client.qualityJourneyProviderSlot.findUniqueOrThrow', () =>
      f.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } }),
    ),
    slotBefore,
  )
  assertRetainedFields(delivery.snapshot(), { providerTerminationProven: false, slotReleased: false })
  assert.equal(
    (
      await context.owner.track('original:f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow', () =>
        f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: slotBefore.intentId! } }),
      )
    ).reconciledAt,
    null,
  )
}
async function retainedAnalysisScenario3(context: RetainedAnalysisScenarioContext) {
  const f = await allocateRetainedAnalysisFixture(context)
  const a = await canonicalPredecessor(f)
  const input = await ready(f, a.analysisRevision.id)
  assert.equal((await advanceRetainedAnalysis(context, input, f.client)).phase, 'CLAIMED')
  assert.equal((await advanceRetainedAnalysis(context, input, f.connect())).phase, 'ADMITTED')
  const keys = (
    await import('@/services/coordinator/quality-journey-analysis-scheduler')
  ).analysisFollowupOperationKeys(input)
  const receipt = await context.owner.track(
    'original:f.client.qualityJourneyExternalWorkClaimReceipt.findUniqueOrThrow',
    () =>
      f.client.qualityJourneyExternalWorkClaimReceipt.findUniqueOrThrow({
        where: {
          journeyId_targetProjectId_principalId_protocol_idempotencyKey: {
            journeyId: f.scope.journeyId,
            targetProjectId: f.scope.targetProjectId,
            principalId: f.principal.principalId,
            protocol: 'EXTERNAL_V1',
            idempotencyKey: keys.claim,
          },
        },
      }),
  )
  const attempt = await context.owner.track('original:f.client.qualityJourneyWorkAttempt.findUniqueOrThrow', () =>
    f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: receipt.attemptId } }),
  )
  const binding = {
    ...f.credentials,
    role: 'REQUIREMENT_ANALYZER' as const,
    principal: f.principal,
    assignmentSecret: input.assignmentSecret,
    workItemId: f.binding.workItemId,
    attemptId: attempt.id,
    assignmentId: attempt.assignmentId!,
    assignmentGeneration: attempt.assignmentGeneration,
    leaseId: attempt.leaseId,
    idempotencyKey: keys.prepare,
    providerNamespace: keys.providerNamespace,
    configurationDigest: 'sha256:' + '0'.repeat(64),
    envelopeDigest: 'sha256:' + '0'.repeat(64),
  }
  const delivery = await createRetainedAnalysisDelivery(
    context,
    binding,
    { fixturePath, submissionIdempotencyKey: keys.submit },
    f.client,
  )
  const sentinel = new Error('CONTROLLED_LOCAL_POST_COMMIT_REPLY_FAULT')
  let prepared: Awaited<ReturnType<typeof prepareQualityJourneyProviderRun>> | undefined
  try {
    prepared = await context.owner.track('original-prepare', () =>
      prepareQualityJourneyProviderRun({ ...binding, ...delivery.preparationIdentity }, f.client),
    )
    throw sentinel
  } catch (error) {
    assert.equal(error, sentinel)
  }
  assert.ok(prepared)
  assert.equal(prepared.intent.armedAt, null)
  assert.equal(prepared.intent.sendBoundaryId, null)
  const originalRun = prepared.run
  assert.deepEqual(await counts(f), { attempts: 2, authorizations: 2, runs: 1, intents: 1, turnsReserved: 0 })
  assert.equal((await advanceRetainedAnalysis(context, input, f.connect())).phase, 'DELIVERY')
  assert.equal(
    (
      await context.owner.track('original:f.client.qualityJourneyProviderRun.findFirstOrThrow', () =>
        f.client.qualityJourneyProviderRun.findFirstOrThrow({ where: { journeyId: f.scope.journeyId } }),
      )
    ).id,
    originalRun.id,
  )
  assert.deepEqual(await counts(f), { attempts: 2, authorizations: 2, runs: 1, intents: 1, turnsReserved: 1 })
}
async function retainedAnalysisScenario4(context: RetainedAnalysisScenarioContext) {
  const f = await allocateRetainedAnalysisFixture(context)
  const a = await canonicalPredecessor(f)
  await answer(f, a.analysisRevision.id, 'payment')
  const before = {
    counts: await counts(f),
    answers: await context.owner.track('original:f.client.qualityJourneyAnalysisAnswer.count', () =>
      f.client.qualityJourneyAnalysisAnswer.count(),
    ),
    events: await context.owner.track('original:f.client.qualityJourneyEvent.count', () =>
      f.client.qualityJourneyEvent.count(),
    ),
    wakes: await context.owner.track('original:f.client.qualityJourneyWakeIntent.count', () =>
      f.client.qualityJourneyWakeIntent.count(),
    ),
    journey: await context.owner.track('original:f.client.qualityJourney.findUniqueOrThrow', () =>
      f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } }),
    ),
  }
  await context.owner.track('original:f.client.$executeRawUnsafe', () =>
    f.client.$executeRawUnsafe(
      `CREATE TRIGGER m06_test_refuse_issuance BEFORE INSERT ON QualityJourneyEvent WHEN NEW.eventType = 'ANALYSIS_FOLLOWUP_ISSUED' BEGIN SELECT RAISE(ABORT, 'm06 exact issuance fault'); END`,
    ),
  )
  await assert.rejects(answer(f, a.analysisRevision.id, 'shipping'))
  assert.deepEqual(await counts(f), before.counts)
  assert.equal(
    await context.owner.track('original:f.client.qualityJourneyAnalysisAnswer.count', () =>
      f.client.qualityJourneyAnalysisAnswer.count(),
    ),
    before.answers,
  )
  assert.equal(
    await context.owner.track('original:f.client.qualityJourneyEvent.count', () =>
      f.client.qualityJourneyEvent.count(),
    ),
    before.events,
  )
  assert.equal(
    await context.owner.track('original:f.client.qualityJourneyWakeIntent.count', () =>
      f.client.qualityJourneyWakeIntent.count(),
    ),
    before.wakes,
  )
  assert.deepEqual(
    await context.owner.track('original:f.client.qualityJourney.findUniqueOrThrow', () =>
      f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } }),
    ),
    before.journey,
  )
}
async function retainedAnalysisScenario5(context: RetainedAnalysisScenarioContext) {
  const f = await allocateRetainedAnalysisFixture(context)
  const a = await canonicalPredecessor(f)
  const requests = ['payment', 'shipping'].map(question => answerRequest(f, a.analysisRevision.id, question))
  const results = await Promise.allSettled(
    requests.map(request =>
      context.owner.track('original:answerQualityJourneyAnalysisQuestion', () =>
        answerQualityJourneyAnalysisQuestion(request, f.client, trustedHumanCoordinatorSession),
      ),
    ),
  )
  for (let index = 0; index < results.length; index++)
    if (results[index]!.status === 'rejected')
      await context.owner.track('original:answerQualityJourneyAnalysisQuestion', () =>
        answerQualityJourneyAnalysisQuestion(requests[index], f.client, trustedHumanCoordinatorSession),
      )
  for (const request of requests)
    assertRetainedFields(
      await context.owner.track('original:answerQualityJourneyAnalysisQuestion', () =>
        answerQualityJourneyAnalysisQuestion(request, f.client, trustedHumanCoordinatorSession),
      ),
      { replayed: true },
    )
  assert.equal(
    await context.owner.track('original:f.client.qualityJourneyAnalysisAnswer.count', () =>
      f.client.qualityJourneyAnalysisAnswer.count({ where: { journeyId: f.scope.journeyId } }),
    ),
    2,
  )
  assert.equal(
    await context.owner.track('original:f.client.qualityJourneyEvent.count', () =>
      f.client.qualityJourneyEvent.count({
        where: { journeyId: f.scope.journeyId, eventType: 'ANALYSIS_FOLLOWUP_ISSUED' },
      }),
    ),
    1,
  )
  assert.deepEqual(await counts(f), { attempts: 1, authorizations: 2, runs: 0, intents: 0, turnsReserved: 0 })
}
async function retainedAnalysisScenario6(context: RetainedAnalysisScenarioContext) {
  const f = await allocateRetainedAnalysisFixture(context)
  const a = await canonicalPredecessor(f)
  const input = await ready(f, a.analysisRevision.id)
  const before = await counts(f)
  assertRetainedFields(await advanceRetainedAnalysis(context, { ...input, assignmentSecret: '' }, f.client), {
    phase: 'RECOVERY_REQUIRED',
  })
  assertRetainedFields(
    await advanceRetainedAnalysis(
      context,
      { ...input, expected: { ...input.expected, version: input.expected.version + 1 } },
      f.client,
    ),
    { phase: 'RECOVERY_REQUIRED' },
  )
  await context.owner.track('original:f.client.qualityJourneyWorkAuthorization.update', () =>
    f.client.qualityJourneyWorkAuthorization.update({
      where: { id: input.expected.authorizationId },
      data: { revokedAt: new Date(), revokedBy: 'owned-test', revocationReason: 'Exact refusal test.' },
    }),
  )
  assertRetainedFields(await advanceRetainedAnalysis(context, input, f.connect()), {
    phase: 'WAITING',
    reason: 'AUTHORITY_BLOCKED',
  })
  assert.deepEqual(await counts(f), before)
}
export const retainedAnalysisScenarios = {
  'recovers claim/admission/ACK gaps and sends one actual owned-child successor from an effect-free canonical predecessor':
    retainedAnalysisScenario1,
  'retains actual acknowledged M05 UNKNOWN across answer, wake ACK, reconnect and competing scheduler ticks':
    retainedAnalysisScenario2,
  'recovers the prepare-before-claim gap with the same immutable run and no reconstructed armed permit':
    retainedAnalysisScenario3,
  'rolls back answer, review event, issuance, authorization and wake when issuance persistence fails':
    retainedAnalysisScenario4,
  'serializes concurrent required answers and exact retries into one logical round without a provider turn':
    retainedAnalysisScenario5,
  'refuses lost credentials, stale identity and revoked authority without new effects': retainedAnalysisScenario6,
}
