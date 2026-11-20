import type { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/config/db-config'
import { canonicalContractJson as json } from '@/lib/catalog-contracts'
import { assignmentManifestSchema } from '@/lib/quality-journey'
import { hashCanonical as hash } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'
import { appManagedAnalysisOutputSchema } from './app-managed-analysis-contract'
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
import { assertHistoricalHubQuiescent, isProvenHistoricalNonstart } from './quality-journey-provider-recovery'
import {
  readQualityJourneyAnalysisFollowupInTransaction,
  createQualityJourneyAnalysisCorrectionWorkInTransaction,
  setQualityJourneyActiveWorkItemsWithBusinessJoinInTransaction,
} from './quality-journey-service'

type Scope = { journeyId: string; targetProjectId: string }
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
import { appManagedAnalysisCorrectionIssuanceSchema as issuanceSchema } from './app-managed-analysis-correction-contract'
function deny(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}

function postReturnFailure(value: unknown, expired: boolean) {
  const marker = z.record(z.unknown()).parse(value)
  const interrupted =
    marker.stage === undefined &&
    marker.handoffPhase === 'CANONICAL_SUBMISSION' &&
    marker.senderCleanupVerified === true &&
    marker.nativeSendStarted === true &&
    marker.recoveryEligible === false &&
    expired
  const source = interrupted
    ? { ...marker, stage: 'CANONICAL_SUBMISSION', reason: 'CANONICAL_SUBMISSION_DID_NOT_COMPLETE' }
    : marker
  const failure = z
    .object({
      stage: z.enum(['OUTPUT_VALIDATION', 'CANONICAL_SUBMISSION']),
      reason: z.string(),
      state: z.literal('UNKNOWN'),
      senderCleanupVerified: z.boolean().optional(),
      nativeSendStarted: z.boolean().optional(),
      candidate: z.unknown().optional(),
      candidateHash: digest.optional(),
      canonicalRecoveryUsed: z.boolean().optional(),
      canonicalRecoveryOutcome: z.string().optional(),
      canonicalRecoveryRejection: z.object({ kind: z.string(), code: z.string().optional() }).passthrough().optional(),
      detail: z.string().optional(),
      rejection: z.object({ kind: z.string(), code: z.string().optional() }).passthrough().optional(),
    })
    .passthrough()
    .parse(source)
  const rejectedRecovery =
    failure.canonicalRecoveryUsed === true &&
    failure.canonicalRecoveryOutcome === 'REJECTED_OR_UNKNOWN' &&
    failure.stage === 'CANONICAL_SUBMISSION' &&
    failure.candidate !== undefined &&
    failure.senderCleanupVerified === true &&
    failure.nativeSendStarted === true &&
    failure.canonicalRecoveryRejection?.kind === 'CANONICAL' &&
    ['CONFLICT', 'VALIDATION'].includes(failure.canonicalRecoveryRejection.code ?? '')
  if (failure.reason !== `${failure.stage}_DID_NOT_COMPLETE` || (failure.canonicalRecoveryUsed && !rejectedRecovery))
    deny('Analysis correction requires the exact unrecovered post-return failure.')
  const explicit = failure.senderCleanupVerified === true && failure.nativeSendStarted === true
  // Legacy owning source advances these exact stages only after runManagedAnalysis returned with owned-child cleanup.
  // This proof never applies to PAGE_EVIDENCE/NATIVE_SEND, provider rows, or caller-supplied cleanup assertions.
  const legacy =
    failure.senderCleanupVerified === undefined &&
    failure.nativeSendStarted === undefined &&
    (failure.stage === 'OUTPUT_VALIDATION'
      ? failure.detail === 'Model output did not satisfy the exact Analysis submission contract.'
      : failure.detail === 'Canonical handoff did not complete.' ||
        /^Canonical service (CONFLICT|VALIDATION)\.$/.test(failure.detail ?? ''))
  if (!explicit && !legacy) deny('Analysis sender cleanup has not been proven by the owning post-return marker.')
  if (failure.candidate !== undefined) {
    const rejection = rejectedRecovery ? failure.canonicalRecoveryRejection : failure.rejection
    if (
      failure.stage !== 'CANONICAL_SUBMISSION' ||
      !explicit ||
      (!interrupted &&
        (rejection?.kind !== 'CANONICAL' || !['CONFLICT', 'VALIDATION'].includes(rejection.code ?? ''))) ||
      !appManagedAnalysisOutputSchema.safeParse(failure.candidate).success ||
      hash(failure.candidate) !== failure.candidateHash
    )
      deny('A retained candidate requires an exact deterministic canonical rejection.')
  }
  return failure
}

async function localOwner(scope: Scope, tx: Prisma.TransactionClient) {
  if (process.env.APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED !== 'true')
    deny('Local Analysis has not been enabled by the server owner.')
  const journey = await readScopedQualityJourney(scope, tx)
  if (
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.status !== 'ACTIVE' ||
    journey.stage !== 'ANALYSIS' ||
    JSON.parse(journey.blockerIdsJson).length ||
    JSON.parse(journey.unresolvedQuestionIdsJson).length
  )
    deny('Analysis correction requires the current active Analysis stage without unresolved gates.')
  const session = journey.currentCoordinatorSessionId
    ? await tx.qualityJourneyCoordinatorSession.findUnique({ where: { id: journey.currentCoordinatorSessionId } })
    : null
  const principalId = `appraise-local:${scope.targetProjectId}`
  if (!session || session.ownerPrincipalId !== principalId || !session.generation)
    deny('Analysis correction requires the current local owner.')
  const owner = {
    ...scope,
    coordinatorSessionId: session.id,
    coordinatorGeneration: session.generation,
    coordinatorPrincipalId: principalId,
  }
  await assertCurrentCoordinatorSession(owner, tx)
  return { journey, owner }
}

async function correctionCandidate(scope: Scope, tx: Prisma.TransactionClient) {
  const { journey, owner } = await localOwner(scope, tx)
  const activeIds = JSON.parse(journey.activeWorkItemIdsJson) as string[]
  const items = await tx.qualityJourneyWorkItem.findMany({
    where: {
      id: { in: activeIds },
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      cycleId: journey.activeCycleId,
      role: 'REQUIREMENT_ANALYZER',
    },
  })
  if (items.length !== 1) deny('Analysis correction requires one exact active work item.')
  const item = items[0]!
  const attempt = await tx.qualityJourneyWorkAttempt.findFirst({
    where: { workItemId: item.id, attempt: item.currentAttempt },
  })
  if (
    !attempt ||
    item.status !== 'IN_PROGRESS' ||
    attempt.status !== 'IN_PROGRESS' ||
    attempt.executionMode !== 'EXTERNAL_V1' ||
    attempt.externalPrincipalId !== owner.coordinatorPrincipalId ||
    attempt.externalPrincipalAssurance !== 'PROJECT_CREDENTIAL_ONLY' ||
    attempt.dispatchAdapterId !== 'APP_SERVER_LOCAL_V1_ANALYSIS' ||
    !attempt.dispatchReservedAt ||
    !attempt.dispatchStartedAt ||
    !attempt.failureJson ||
    !attempt.assignmentJson ||
    !attempt.assignmentHash ||
    !attempt.authorizationId ||
    attempt.resultJson ||
    attempt.resultHash ||
    attempt.spawnRequestJson ||
    attempt.dispatchKey ||
    attempt.spawnReceiptJson
  )
    deny('The current Analysis attempt is not a stranded local post-return assignment.')
  await assertCoordinatorAttemptSession({ ...owner, attemptId: attempt.id }, tx)
  const failure = postReturnFailure(JSON.parse(attempt.failureJson), attempt.leaseExpiresAt <= new Date())
  const manifest = assignmentManifestSchema.parse(JSON.parse(attempt.assignmentJson))
  if (
    hash(manifest) !== attempt.assignmentHash ||
    manifest.assignmentId !== attempt.assignmentId ||
    manifest.inputHash !== item.inputHash ||
    json(manifest.inputArtifacts) !== json(JSON.parse(item.inputArtifactRefsJson))
  )
    deny('The failed Analysis assignment inputs changed.')
  const latestAuthorization = await tx.qualityJourneyWorkAuthorization.findFirst({
    where: { workItemId: item.id, successorAuthorization: { is: null } },
  })
  if (
    !latestAuthorization ||
    latestAuthorization.id !== attempt.authorizationId ||
    latestAuthorization.revokedAt ||
    latestAuthorization.cancelledAt
  )
    deny('The failed Analysis authorization is no longer current.')
  if (
    (await tx.qualityJourneyWorkAttempt.count({ where: { workItemId: item.id, attempt: { gt: attempt.attempt } } })) ||
    (await tx.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: attempt.id } })) ||
    (await tx.qualityJourneyAnalysisRevision.count({
      where: { submittedAttempt: { workItemId: item.id, attempt: { gte: attempt.attempt } } },
    })) ||
    (await tx.qualityJourneyProviderRun.count({ where: { attemptId: attempt.id } }))
  )
    deny('Analysis correction cannot replace accepted, newer or provider-owned work.')
  const slot = await tx.qualityJourneyProviderSlot.findUnique({ where: { id: 'HUB' } })
  if (slot?.intentId || slot?.providerRunId)
    deny('The provider hub requires reconciliation before Analysis correction.')
  const otherDispatches = await tx.qualityJourneyWorkAttempt.findMany({
    where: {
      id: { not: attempt.id },
      providerRun: null,
      OR: [
        { dispatchReservedAt: { not: null } },
        { dispatchStartedAt: { not: null } },
        { status: 'DISPATCH_UNRESOLVED' },
      ],
    },
    select: {
      id: true,
      workItemId: true,
      assignmentId: true,
      status: true,
      spawnRequestJson: true,
      spawnRequestHash: true,
      spawnReceiptJson: true,
      spawnReceiptHash: true,
    },
  })
  if (
    otherDispatches.some(other => !isProvenHistoricalNonstart(other)) ||
    (await tx.qualityJourneyProviderRun.count({ where: { status: 'CONFLICT' } }))
  )
    deny('Other historical provider effects require reconciliation before correction.')
  const priorCorrections = await tx.qualityJourneyEvent.findMany({
    where: { ...inputScope(scope), eventType: 'ANALYSIS_CORRECTION_ISSUED' },
  })
  if (
    priorCorrections.some(event => {
      const payload = issuanceSchema.parse(JSON.parse(event.payloadJson))
      return payload.inputHash === item.inputHash
    })
  )
    deny('This exact Analysis input already consumed its single correction assignment.')
  const followup = await readQualityJourneyAnalysisFollowupInTransaction(scope, tx)
  if (
    followup &&
    (!followup.ready ||
      followup.inputHash !== item.inputHash ||
      json(followup.inputArtifacts) !== item.inputArtifactRefsJson)
  )
    deny('The current Analysis answers or review inputs changed after the failed assignment.')
  return { journey, owner, item, attempt, failure, followup }
}

export async function getAppManagedAnalysisCorrection(scope: Scope, client: PrismaClient = prisma) {
  try {
    return await client.$transaction(async tx => {
      const { attempt } = await correctionCandidate(scope, tx)
      return { attemptId: attempt.id, failureHash: hash(JSON.parse(attempt.failureJson!)) }
    })
  } catch (error) {
    if ((error instanceof ServiceError && error.code === 'CONFLICT') || error instanceof z.ZodError) return null
    throw error
  }
}

/** Issue one distinct, input-bound successor. This never invokes or retries a native sender. */
export async function issueAppManagedAnalysisCorrection(
  input: Scope & { expectedStateHash: string; attemptId: string; failureHash: string },
  client: PrismaClient = prisma,
) {
  return client.$transaction(tx =>
    withJourneyBusinessWriteJoinInTransaction(tx, input, undefined, async beforeWrite => {
      const current = await correctionCandidate(input, tx)
      const { journey, owner, item, attempt, failure } = current
      if (
        journey.stateHash !== input.expectedStateHash ||
        attempt.id !== input.attemptId ||
        hash(JSON.parse(attempt.failureJson!)) !== input.failureHash
      )
        deny('Analysis correction does not bind the exact current failed attempt and state.')
      await assertCoordinatorRecoverySession(owner, { ...input, attemptId: attempt.id }, tx)
      await assertJourneyBusinessGroupSupportsNoInvalidationInTransaction(tx, input)
      await beforeWrite(tx, input)
      const retired = await tx.qualityJourneyWorkAttempt.updateMany({
        where: { id: attempt.id, status: 'IN_PROGRESS', failureJson: attempt.failureJson },
        data: { status: 'FAILED', completedAt: new Date(), dispatchReservedAt: null, dispatchStartedAt: null },
      })
      if (retired.count !== 1) deny('The failed Analysis attempt changed concurrently.')
      const retiredItem = await tx.qualityJourneyWorkItem.updateMany({
        where: {
          id: item.id,
          version: item.version,
          status: 'IN_PROGRESS',
          currentAttempt: attempt.attempt,
          inputHash: item.inputHash,
        },
        data: { status: 'SUPERSEDED', version: { increment: 1 } },
      })
      if (retiredItem.count !== 1) deny('Analysis correction work changed concurrently.')
      await assertHistoricalHubQuiescent(tx)
      const { work, authorization } = await createQualityJourneyAnalysisCorrectionWorkInTransaction(
        {
          journeyId: journey.id,
          targetProjectId: journey.targetProjectId,
          predecessorWorkItemId: item.id,
          predecessorAttemptId: attempt.id,
          inputHash: item.inputHash,
        },
        tx,
      )
      await setQualityJourneyActiveWorkItemsWithBusinessJoinInTransaction(
        journey.id,
        (JSON.parse(journey.activeWorkItemIdsJson) as string[]).map(id => (id === item.id ? work.id : id)).sort(),
        tx,
        beforeWrite,
      )
      const updatedJourney = await tx.qualityJourney.findUniqueOrThrow({ where: { id: journey.id } })
      const payload = issuanceSchema.parse({
        schemaVersion: 'appraise.analysis-correction-issuance/v1',
        workItemId: work.id,
        cycleId: journey.activeCycleId,
        predecessorAttemptId: attempt.id,
        predecessorWorkItemId: item.id,
        predecessorAssignmentHash: attempt.assignmentHash,
        predecessorAuthorizationId: attempt.authorizationId,
        authorizationId: authorization.id,
        inputHash: item.inputHash,
        inputArtifactRefsJson: item.inputArtifactRefsJson,
        advisoryInputRefsJson: item.advisoryInputRefsJson,
        failureJson: attempt.failureJson,
        failureHash: input.failureHash,
        successorAttempt: 1,
        issuedWorkItemVersion: work.version,
        coordinatorSessionId: owner.coordinatorSessionId,
        coordinatorGeneration: owner.coordinatorGeneration,
        dispatchReservedAt: attempt.dispatchReservedAt!.toISOString(),
        dispatchStartedAt: attempt.dispatchStartedAt!.toISOString(),
        diagnostics: {
          stage: failure.stage,
          ...(failure.detail ? { detail: failure.detail } : {}),
          ...(failure.rejection ? { rejection: failure.rejection } : {}),
        },
      })
      const eventId = `qje_analysis_correction_${hash({ attemptId: attempt.id, failureHash: input.failureHash }).slice(7, 31)}`
      let sequence = (await tx.qualityJourneyEvent.count({ where: { journeyId: journey.id } })) + 1
      await tx.qualityJourneyEvent.create({
        data: {
          id: eventId,
          ...inputScope(input),
          sequence: sequence++,
          eventType: 'ANALYSIS_CORRECTION_ISSUED',
          predecessorStateHash: journey.stateHash,
          successorStateHash: updatedJourney.stateHash,
          payloadJson: json(payload),
        },
      })
      return {
        eventId,
        predecessorAttemptId: attempt.id,
        workItemId: work.id,
        authorizationId: authorization.id,
        successorAttempt: payload.successorAttempt,
        expectedStateHash: updatedJourney.stateHash,
        nativeSend: false,
      }
    }),
  )
}
function inputScope(input: Scope) {
  return { journeyId: input.journeyId, targetProjectId: input.targetProjectId }
}

/** Exact existing correction issuance observation for task identity; never creates a successor. */
export async function readAppManagedAnalysisCorrectionIssuanceInTransaction(
  scope: Scope & { workItemId: string },
  tx: Prisma.TransactionClient,
) {
  const item = await tx.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: scope.workItemId } })
  const authorization = await tx.qualityJourneyWorkAuthorization.findFirst({
    where: { workItemId: item.id, successorAuthorization: { is: null } },
  })
  const events = await tx.qualityJourneyEvent.findMany({
    where: { ...inputScope(scope), eventType: 'ANALYSIS_CORRECTION_ISSUED' },
  })
  const matching = events
    .map(event => ({ ...issuanceSchema.parse(JSON.parse(event.payloadJson)), eventId: event.id }))
    .filter(payload => payload.workItemId === item.id && payload.authorizationId === authorization?.id)
  if (!matching.length) return null
  const { journey, owner } = await localOwner(scope, tx)
  if (matching.length !== 1) deny('Analysis correction issuance is ambiguous.')
  const correction = matching[0]!
  const prior = await tx.qualityJourneyWorkAttempt.findUnique({ where: { id: correction.predecessorAttemptId } })
  if (
    !prior ||
    prior.status !== 'FAILED' ||
    prior.dispatchAdapterId !== 'APP_SERVER_LOCAL_V1_ANALYSIS' ||
    prior.dispatchReservedAt ||
    prior.dispatchStartedAt ||
    prior.failureJson !== correction.failureJson ||
    hash(JSON.parse(prior.failureJson!)) !== correction.failureHash ||
    prior.assignmentHash !== correction.predecessorAssignmentHash ||
    prior.authorizationId !== correction.predecessorAuthorizationId ||
    prior.workItemId !== correction.predecessorWorkItemId ||
    correction.cycleId !== journey.activeCycleId ||
    item.inputHash !== correction.inputHash ||
    item.inputArtifactRefsJson !== correction.inputArtifactRefsJson ||
    item.advisoryInputRefsJson !== correction.advisoryInputRefsJson ||
    owner.coordinatorSessionId !== correction.coordinatorSessionId ||
    owner.coordinatorGeneration !== correction.coordinatorGeneration ||
    ![0, 1].includes(item.currentAttempt) ||
    authorization?.maxAttempts !== 1
  )
    deny('Analysis correction issuance no longer binds its exact predecessor, owner and inputs.')
  return correction
}
