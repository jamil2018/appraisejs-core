import type { RetainedAnalysisLifetime } from './m06-analysis-retained-lifetime'
import assert from 'node:assert/strict'
import type { PrismaClient } from '@prisma/client'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import {
  answerQualityJourneyAnalysisQuestion,
  submitExternalQualityJourneyAnalysisSuccessor,
} from '@/services/coordinator/quality-journey-analysis-service'
import {
  ensureQualityJourneyAnalysisFollowupInTransaction,
  type ExternalQualityJourneySubmissionBinding,
} from '@/services/coordinator/quality-journey-service'
import {
  advanceQualityJourneyAnalysisFollowup,
  type AnalysisFollowupController,
  type AnalysisFollowupSchedulerInput,
} from '@/services/coordinator/quality-journey-analysis-scheduler'
import type { reconcileConsumedQualityJourneyProviderIntent } from '@/services/coordinator/quality-journey-provider-run-service'

type SuccessfulReconciliation = Extract<
  Awaited<ReturnType<typeof reconcileConsumedQualityJourneyProviderIntent>>,
  { conflicted: false }
>
export type RetainedAnalysisCompositionSettings = {
  fixture: AnalysisFollowupSchedulerInput['fixture']
  followupAssignmentSecret: string
  controller: AnalysisFollowupController
}

/** Only request fields enter the strict Analysis ingress; principal/session credentials stay separate. */
export function projectRetainedAnalysisSubmissionBinding(binding: ExternalQualityJourneySubmissionBinding) {
  return {
    journeyId: binding.journeyId,
    targetProjectId: binding.targetProjectId,
    workItemId: binding.workItemId,
    attemptId: binding.attemptId,
    assignmentId: binding.assignmentId,
    assignmentGeneration: binding.assignmentGeneration,
    leaseId: binding.leaseId,
    assignmentSecret: binding.assignmentSecret,
  }
}

/** Owner-local canonical composition only. No source, permit or disposal capability enters this helper. */
export async function composeRetainedAnalysisAfterOriginalNonstart(
  client: PrismaClient,
  admitted: ExternalQualityJourneySubmissionBinding,
  successfulNonstart: SuccessfulReconciliation,
  settings: RetainedAnalysisCompositionSettings,
) {
  assert.equal(successfulNonstart.conflicted, false)
  assert.equal(successfulNonstart.quarantined, false)
  assert.equal(successfulNonstart.receipt.physical.outcome, 'NONSTART')
  const identity = successfulNonstart.receipt.identity
  const originalIntent = await client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
    where: { id: identity.intentId },
  })
  const originalRun = await client.qualityJourneyProviderRun.findUniqueOrThrow({
    where: { id: originalIntent.providerRunId },
  })
  assert.equal(originalRun.attemptId, admitted.attemptId)
  assert.equal(originalRun.workItemId, admitted.workItemId)
  assert.equal(originalRun.status, 'NONSTART_RECONCILED')
  assert.equal(originalIntent.status, 'NONSTART_RECONCILED')
  assert.equal(originalRun.turnsReserved, 1)
  const priorIntents = await client.qualityJourneyProviderDispatchIntent.findMany({
    where: { run: { workItemId: admitted.workItemId } },
    orderBy: { id: 'asc' },
  })
  assert.ok(priorIntents.some(intent => intent.id === originalIntent.id))
  assert.equal(
    await client.qualityJourneyProviderDispatchIntent.count({ where: { run: { workItemId: admitted.workItemId } } }),
    priorIntents.length,
  )
  const priorControls = priorIntents.filter(intent => intent.id !== originalIntent.id)
  assert.equal(priorControls.length, 1)
  const controlIntent = priorControls[0]!
  assert.match(controlIntent.id, /^control-.+$/)
  assert.equal(controlIntent.operationKey, controlIntent.id)
  assert.equal(controlIntent.providerNamespace, `synthetic:control:${controlIntent.id.slice('control-'.length)}`)
  assert.equal(controlIntent.providerRunId, originalRun.id)
  assert.notEqual(controlIntent.turnOrdinal, originalIntent.turnOrdinal)
  assert.ok(controlIntent.turnOrdinal >= 1 && controlIntent.turnOrdinal <= 3)
  assert.equal(controlIntent.status, 'PENDING')
  assert.equal(controlIntent.armedAt, null)
  assert.equal(controlIntent.invalidatedAt, null)
  assert.equal(controlIntent.reconciledAt, null)
  assert.equal(controlIntent.sendBoundaryId, null)
  assert.equal(controlIntent.claimEpoch, 0)
  assert.equal(controlIntent.claimOwner, null)
  assert.equal(controlIntent.claimExpiresAt, null)
  assert.equal(controlIntent.acknowledgedAt, null)
  assert.equal(controlIntent.threadId, null)
  assert.equal(controlIntent.turnId, null)
  const oldPhysical = {
    run: originalRun,
    intent: originalIntent,
    observation: await client.qualityJourneyProviderObservation.findUniqueOrThrow({
      where: { id: successfulNonstart.observation.id },
    }),
  }
  assert.equal((await client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })).intentId, null)
  const journey = await client.qualityJourney.findUniqueOrThrow({ where: { id: admitted.journeyId } })
  const requirementRevisionId = (JSON.parse(journey.activeRevisionIdsJson) as Record<string, string>).journey!
  const suffix = hashCanonical({ attemptId: admitted.attemptId, requestHash: successfulNonstart.requestHash }).slice(
    7,
    31,
  )
  const charter = {
    schemaVersion: 'appraise.quality-journey/v1',
    charterId: `authored-nonstart-charter-${suffix}`,
    analysisRevisionId: `authored-nonstart-A-${suffix}`,
    journeyId: admitted.journeyId,
    targetProjectId: admitted.targetProjectId,
    cycleId: journey.activeCycleId,
    requirementRevisionId,
    objectives: ['Bound canonical Analysis after exact original synthetic nonstart.'],
    scope: { included: ['Authored fixture scope'], excluded: [] },
    actors: ['User'],
    requirements: [
      {
        requirementId: 'REQ-NONSTART-1',
        statement: 'Exact human scope is carried forward.',
        sourceRefs: ['requirement:objective'],
      },
    ],
    obligations: [
      {
        obligationId: 'OBL-NONSTART-1',
        requirementId: 'REQ-NONSTART-1',
        statement: 'Record scope evidence.',
        acceptanceSignals: ['Current human answer'],
      },
    ],
    constraints: [],
    assumptions: [],
    risks: [],
    acceptanceSignals: ['Current human answer'],
    retiredRequirementIds: [],
    questions: [
      {
        questionId: 'nonstart-human-scope',
        prompt: 'Which scope is in force?',
        required: true,
        rationale: 'Bound the authored successor.',
      },
    ],
    resolvedQuestionAnswerIds: [],
  }
  const scope = { journeyId: admitted.journeyId, targetProjectId: admitted.targetProjectId }
  const a = await submitExternalQualityJourneyAnalysisSuccessor(
    { ...projectRetainedAnalysisSubmissionBinding(admitted), idempotencyKey: `nonstart-A:${suffix}`, charter },
    admitted.principal,
    client,
    admitted,
  )
  const answerId = `nonstart-answer:${suffix}`
  await answerQualityJourneyAnalysisQuestion(
    {
      idempotencyKey: answerId,
      answer: {
        schemaVersion: 'appraise.quality-journey/v1',
        ...scope,
        analysisRevisionId: a.analysisRevision.id,
        questionId: 'nonstart-human-scope',
        answerId,
        answer: 'The exact authored fixture scope.',
        actor: 'USER',
      },
    },
    client,
    trustedHumanCoordinatorSession,
  )
  const issued = await client.$transaction(tx => ensureQualityJourneyAnalysisFollowupInTransaction(scope, tx))
  assert.ok(issued.expected)
  // A new claim carries coordinator authority, never the predecessor attempt scope.
  const input: AnalysisFollowupSchedulerInput = {
    journeyId: admitted.journeyId,
    targetProjectId: admitted.targetProjectId,
    coordinatorSessionId: admitted.coordinatorSessionId,
    coordinatorHandoffId: admitted.coordinatorHandoffId,
    coordinatorGeneration: admitted.coordinatorGeneration,
    coordinatorPrincipalId: admitted.coordinatorPrincipalId,
    principal: admitted.principal,
    expected: issued.expected,
    assignmentSecret: settings.followupAssignmentSecret,
    fixture: settings.fixture,
  }
  const claimStep = await advanceQualityJourneyAnalysisFollowup(input, client, settings.controller)
  assert.equal(
    claimStep.phase,
    'CLAIMED',
    JSON.stringify({
      phase: claimStep.phase,
      reason: 'reason' in claimStep ? claimStep.reason.slice(0, 512) : null,
      conflictClass: 'fixtureConflictClass' in claimStep ? claimStep.fixtureConflictClass : null,
    }),
  )
  assert.equal((await advanceQualityJourneyAnalysisFollowup(input, client, settings.controller)).phase, 'ADMITTED')
  const delivery = await advanceQualityJourneyAnalysisFollowup(input, client, settings.controller)
  assert.equal(delivery.phase, 'DELIVERY')
  assert.ok('result' in delivery && delivery.result.status === 'ACCEPTED')
  const b = await client.qualityJourneyAnalysisRevision.findFirstOrThrow({
    where: { predecessorRevisionId: a.analysisRevision.id },
  })
  assert.equal(b.submittedWorkItemId, admitted.workItemId)
  assert.equal(
    (await client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: admitted.workItemId } })).currentAttempt,
    2,
  )
  assert.equal(await client.qualityJourneyWorkAttempt.count({ where: { workItemId: admitted.workItemId } }), 2)
  assert.equal(await client.qualityJourneyWorkAuthorization.count({ where: { workItemId: admitted.workItemId } }), 2)
  assert.equal(await client.qualityJourneyProviderRun.count({ where: { workItemId: admitted.workItemId } }), 2)
  assert.deepEqual(
    {
      run: await client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: originalRun.id } }),
      intent: await client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: originalIntent.id } }),
      observation: await client.qualityJourneyProviderObservation.findUniqueOrThrow({
        where: { id: successfulNonstart.observation.id },
      }),
    },
    oldPhysical,
  )
  const slot = await client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })
  assert.ok(slot.intentId && slot.intentId !== originalIntent.id)
  const currentIntents = await client.qualityJourneyProviderDispatchIntent.findMany({
    where: { run: { workItemId: admitted.workItemId } },
    orderBy: { id: 'asc' },
  })
  assert.equal(currentIntents.length, priorIntents.length + 1)
  assert.equal(
    await client.qualityJourneyProviderDispatchIntent.count({ where: { run: { workItemId: admitted.workItemId } } }),
    currentIntents.length,
  )
  const priorIds = new Set(priorIntents.map(intent => intent.id))
  // Completing A retires the original attempt and invalidates its exact unarmed control.
  // The armed original history and every other control field must remain deeply equal.
  const retiredControl = currentIntents.find(intent => intent.id === controlIntent.id)
  assert.ok(retiredControl)
  assert.equal(retiredControl.status, 'INVALIDATED')
  const invalidatedAt = retiredControl.invalidatedAt
  assert.ok(
    invalidatedAt instanceof Date && Number.isSafeInteger(invalidatedAt.getTime()) && invalidatedAt.getTime() >= 0,
  )
  assert.deepEqual(
    currentIntents.filter(intent => priorIds.has(intent.id)),
    priorIntents.map(intent =>
      intent.id === controlIntent.id ? { ...intent, status: 'INVALIDATED', invalidatedAt } : intent,
    ),
  )
  const addedIntents = currentIntents.filter(intent => !priorIds.has(intent.id))
  assert.equal(addedIntents.length, 1)
  assert.equal(addedIntents[0]!.id, slot.intentId)
  assert.equal(addedIntents[0]!.providerRunId, delivery.result.supervisor.providerRunId)
  assert.equal(addedIntents[0]!.turnOrdinal, 1)
  const successorRun = await client.qualityJourneyProviderRun.findUniqueOrThrow({
    where: { id: addedIntents[0]!.providerRunId },
  })
  assert.equal(successorRun.id, slot.providerRunId)
  assert.equal(successorRun.attemptId, b.submittedAttemptId)
  assert.equal(successorRun.turnsReserved, 1)
  return {
    a: a.analysisRevision,
    b,
    successorRun,
    originalNonstart: {
      runId: originalRun.id,
      intentId: originalIntent.id,
      requestHash: successfulNonstart.requestHash,
    },
    intentTopology: {
      baseline: priorIntents.map(intent => intent.id),
      current: currentIntents.map(intent => intent.id),
      added: addedIntents[0]!.id,
    },
    followup: issued.expected,
    delivery,
    runtimeQualified: false as const,
  }
}

/** Preserve both original transaction and compiler promises for repeated canonical human rounds. */
export function compileRetainedAnalysisFollowup(
  owner: RetainedAnalysisLifetime,
  client: PrismaClient,
  scope: { journeyId: string; targetProjectId: string },
) {
  return owner.track('original:client.$transaction', () =>
    client.$transaction(tx =>
      owner.track('original:ensureQualityJourneyAnalysisFollowupInTransaction', () =>
        ensureQualityJourneyAnalysisFollowupInTransaction(scope, tx),
      ),
    ),
  )
}
