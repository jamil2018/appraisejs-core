import type { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { assignmentManifestSchema } from '@/lib/quality-journey'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'
import { appManagedAnalysisCredential } from './app-managed-analysis-credential'
import { appManagedScenarioAutomationDefinitions } from './app-managed-scenario-automation-contract'
import { appManagedPreparationProjection } from './app-managed-scenario-automation-projection'
import {
  assertCoordinatorAttemptSession,
  assertCoordinatorRecoverySession,
  assertCurrentCoordinatorSession,
  readScopedQualityJourney,
} from './quality-journey-coordinator-session'
import {
  assertJourneyBusinessGroupSupportsNoInvalidationInTransaction,
  withJourneyBusinessWriteJoinInTransaction,
} from './quality-journey-business-write-join'
import {
  getAppManagedAutomatorManualRecovery,
  manualAutomationRecoveryEventType as eventType,
  observePendingManualAutomationRecovery,
  readFailedManualAutomationAttempt,
  readManualAutomationFailure,
} from './app-managed-automation-manual-recovery-observation'
export {
  getAppManagedAutomatorManualRecovery,
  observePendingManualAutomationRecovery,
} from './app-managed-automation-manual-recovery-observation'
import { readInternalAutomatorAssignment } from './quality-journey-automation-service'
import { createManagedQualityJourneyRoleDelivery } from './quality-journey-managed-role-delivery'
import {
  admitExternalQualityJourneyWork,
  claimExternalQualityJourneyWork,
  type ExternalQualityJourneySubmissionBinding,
} from './quality-journey-service'

type Scope = { journeyId: string; targetProjectId: string }
function conflict(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}

async function localOwner(input: Scope, client: PrismaClient | Prisma.TransactionClient) {
  const journey = await readScopedQualityJourney(input, client)
  const session = journey.currentCoordinatorSessionId
    ? await client.qualityJourneyCoordinatorSession.findUnique({ where: { id: journey.currentCoordinatorSessionId } })
    : null
  const coordinatorPrincipalId = `appraise-local:${input.targetProjectId}`
  if (!session || !session.generation || session.ownerPrincipalId !== coordinatorPrincipalId)
    conflict('Manual preparation recovery requires the current local coordinator.')
  const owner = {
    journeyId: input.journeyId,
    targetProjectId: input.targetProjectId,
    coordinatorSessionId: session.id,
    coordinatorGeneration: session.generation,
    coordinatorPrincipalId,
  }
  await assertCurrentCoordinatorSession(owner, client)
  return { journey, owner }
}

/** Human draft assistance only. Reading choices never claims, admits or renews an assignment. */
export async function getAppManagedManualAutomationDraftContext(input: Scope, client: PrismaClient = prisma) {
  const { journey } = await localOwner(input, client)
  const pending = await observePendingManualAutomationRecovery(input, client)
  const original = pending ? null : await getAppManagedAutomatorManualRecovery(input, client)
  if (!pending && !original) return null
  return client.$transaction(async tx => {
    const item = await tx.qualityJourneyWorkItem.findFirst({
      where: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        cycleId: journey.activeCycleId,
        role: 'AUTOMATOR',
        id: pending?.workItemId ?? { in: JSON.parse(journey.activeWorkItemIdsJson) as string[] },
      },
    })
    if (!item) conflict('The current manual preparation assignment is unavailable.')
    const context = await readInternalAutomatorAssignment(journey, item, tx)
    return { context, choices: appManagedPreparationProjection('AUTOMATOR', context).choices }
  })
}

/** Logical fencing only: never clear native dispatch markers, failure bytes, or UNKNOWN. */
export async function requestAppManagedAutomatorManualRecovery(
  input: Scope & { expectedStateHash: string; attemptId: string; expectedFailureHash: string },
  client: PrismaClient = prisma,
) {
  const { owner } = await localOwner(input, client)
  return client.$transaction(tx =>
    withJourneyBusinessWriteJoinInTransaction(tx, owner, input, async beforeWrite => {
      await assertCoordinatorRecoverySession(owner, input, tx)
      const { journey, attempt, failure, failureHash } = await readFailedManualAutomationAttempt(input, tx)
      if (journey.stateHash !== input.expectedStateHash || failureHash !== input.expectedFailureHash)
        conflict('The Journey or original failure changed before manual recovery.')
      await assertCoordinatorAttemptSession({ ...owner, attemptId: attempt.id }, tx)
      await readInternalAutomatorAssignment(journey, attempt.workItem, tx)
      await assertJourneyBusinessGroupSupportsNoInvalidationInTransaction(tx, input)
      await beforeWrite(tx, input)
      const eventId = `qje_manual_automator_${hashCanonical({ attemptId: attempt.id, failureHash }).slice(7, 31)}`
      const now = new Date()
      const changed = await tx.qualityJourneyWorkAttempt.updateMany({
        where: {
          id: attempt.id,
          status: 'IN_PROGRESS',
          failureJson: attempt.failureJson,
          leaseExpiresAt: { lte: now },
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: owner.coordinatorPrincipalId,
          cancellationReason:
            'Local operator fenced expired authority for distinct manual preparation; native outcome remains UNKNOWN.',
          completedAt: now,
        },
      })
      if (changed.count !== 1) conflict('The original Automator changed concurrently.')
      const itemChanged = await tx.qualityJourneyWorkItem.updateMany({
        where: {
          id: attempt.workItemId,
          currentAttempt: attempt.attempt,
          version: attempt.workItem.version,
          status: 'IN_PROGRESS',
        },
        data: { status: 'REPLACEMENT_REQUESTED', version: { increment: 1 } },
      })
      if (itemChanged.count !== 1) conflict('The active Automator assignment changed concurrently.')
      await tx.qualityJourneyEvent.create({
        data: {
          id: eventId,
          journeyId: journey.id,
          targetProjectId: journey.targetProjectId,
          sequence: (await tx.qualityJourneyEvent.count({ where: { journeyId: journey.id } })) + 1,
          eventType,
          predecessorStateHash: journey.stateHash,
          successorStateHash: journey.stateHash,
          payloadJson: canonicalContractJson({
            schemaVersion: 'appraise.automator-manual-recovery/v1',
            cycleId: journey.activeCycleId,
            workItemId: attempt.workItemId,
            predecessorAttemptId: attempt.id,
            predecessorAssignmentId: attempt.assignmentId,
            authorizationId: attempt.authorizationId,
            successorAttempt: attempt.attempt + 1,
            failureJson: attempt.failureJson,
            failureHash,
            dispatchReservedAt: attempt.dispatchReservedAt!.toISOString(),
            dispatchStartedAt: attempt.dispatchStartedAt!.toISOString(),
            nativeOutcome: 'UNKNOWN',
            senderCleanupVerified: failure.senderCleanupVerified,
            canonicalSubmissionStarted: false,
            acceptedSubmissionCount: 0,
            nativeSend: false,
          }),
        },
      })
      return {
        eventId,
        predecessorAttemptId: attempt.id,
        successorAttempt: attempt.attempt + 1,
        workItemId: attempt.workItemId,
        nativeSend: false as const,
      }
    }),
  )
}

/** A canonical-only successor. This module has no sender dependency and never reserves the native hub. */
export async function prepareAppManagedManualAutomationTask(
  input: Scope & { recoveryEventId: string },
  client: PrismaClient = prisma,
) {
  const { journey, owner } = await localOwner(input, client)
  if (
    journey.status !== 'ACTIVE' ||
    journey.stage !== 'AUTOMATION' ||
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    JSON.parse(journey.blockerIdsJson).length ||
    JSON.parse(journey.unresolvedQuestionIdsJson).length
  )
    conflict('Manual preparation requires the active unblocked Automation stage.')
  const event = await client.qualityJourneyEvent.findFirst({
    where: {
      id: input.recoveryEventId,
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      eventType,
    },
  })
  if (!event) conflict('Manual preparation has no exact issued recovery.')
  const payload = JSON.parse(event.payloadJson)
  const prior = await client.qualityJourneyWorkAttempt.findUnique({
    where: { id: payload.predecessorAttemptId },
    include: { workItem: true },
  })
  const failure = readManualAutomationFailure(prior?.failureJson ?? null)
  if (
    !prior ||
    !failure ||
    prior.status !== 'CANCELLED' ||
    prior.workItem.role !== 'AUTOMATOR' ||
    prior.workItem.journeyId !== journey.id ||
    prior.workItem.targetProjectId !== journey.targetProjectId ||
    prior.workItem.cycleId !== journey.activeCycleId ||
    !JSON.parse(journey.activeWorkItemIdsJson).includes(prior.workItemId) ||
    payload.cycleId !== journey.activeCycleId ||
    payload.schemaVersion !== 'appraise.automator-manual-recovery/v1' ||
    payload.workItemId !== prior.workItemId ||
    payload.authorizationId !== prior.authorizationId ||
    payload.predecessorAssignmentId !== prior.assignmentId ||
    payload.successorAttempt !== prior.attempt + 1 ||
    payload.failureJson !== prior.failureJson ||
    payload.failureHash !== hashCanonical(JSON.parse(prior.failureJson!)) ||
    payload.dispatchReservedAt !== prior.dispatchReservedAt?.toISOString() ||
    payload.dispatchStartedAt !== prior.dispatchStartedAt?.toISOString() ||
    payload.nativeOutcome !== 'UNKNOWN' ||
    payload.senderCleanupVerified !== failure.senderCleanupVerified ||
    payload.canonicalSubmissionStarted !== false ||
    payload.acceptedSubmissionCount !== 0 ||
    payload.nativeSend !== false ||
    (prior.workItem.currentAttempt !== prior.attempt && prior.workItem.currentAttempt !== payload.successorAttempt)
  )
    conflict('Manual recovery no longer binds the exact fenced predecessor.')
  const key = `app-manual-automation:${event.id}`
  const request = {
    ...owner,
    role: 'AUTOMATOR' as const,
    principal: { principalId: owner.coordinatorPrincipalId, assurance: 'PROJECT_CREDENTIAL_ONLY' as const },
    assignmentSecret: await appManagedAnalysisCredential(owner, client),
  }
  const claim = await claimExternalQualityJourneyWork(
    { ...request, idempotencyKey: `${key}:claim`, leaseSeconds: 900 },
    client,
  )
  const assignment = assignmentManifestSchema.parse(claim.assignment)
  if (
    claim.attempt.replacesAttemptId !== prior.id ||
    claim.attempt.attempt !== payload.successorAttempt ||
    claim.workItem.id !== prior.workItemId ||
    claim.attempt.authorizationId !== prior.authorizationId ||
    hashCanonical(assignment) !== claim.attempt.assignmentHash ||
    claim.attempt.dispatchAdapterId ||
    claim.attempt.dispatchReservedAt ||
    claim.attempt.dispatchStartedAt
  )
    conflict('Manual preparation changed its issued successor assignment.')
  const binding: ExternalQualityJourneySubmissionBinding = {
    ...request,
    workItemId: claim.workItem.id,
    attemptId: claim.attempt.id,
    assignmentId: assignment.assignmentId,
    assignmentGeneration: claim.assignmentGeneration,
    leaseId: claim.attempt.leaseId,
  }
  await admitExternalQualityJourneyWork({ ...binding, idempotencyKey: `${key}:admit` }, client)
  const delivery = await createManagedQualityJourneyRoleDelivery({
    binding,
    canonicalDefinitions: appManagedScenarioAutomationDefinitions,
    client,
  })
  try {
    const context = await delivery.invoke({
      toolName: 'quality_journey_automation_context_get',
      arguments: {},
      callId: `${key}:read`,
    })
    const projection = appManagedPreparationProjection('AUTOMATOR', context.result)
    const submissionIdempotencyKey = `${key}:submit`
    return {
      binding,
      recoveryEventId: event.id,
      context: context.result,
      choices: projection.choices,
      submissionIdempotencyKey,
      compile: (call: Parameters<typeof projection.compile>[0]) => projection.compile(call, submissionIdempotencyKey),
      delivery: {
        ...delivery,
        async invoke(...args: Parameters<typeof delivery.invoke>) {
          if (
            args[0].toolName !== 'quality_journey_automation_materialize' ||
            args[0].arguments.idempotencyKey !== submissionIdempotencyKey
          )
            conflict('Manual preparation must retain its exact canonical submission identity.')
          return delivery.invoke(...args)
        },
      },
      nativeSend: false as const,
    }
  } catch (error) {
    delivery.fence()
    throw error
  }
}
