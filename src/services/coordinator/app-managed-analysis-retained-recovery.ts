import type { PrismaClient, QualityJourneyWorkAttempt } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'
import { appManagedAnalysisDefinitions, appManagedAnalysisOutputSchema } from './app-managed-analysis-contract'
import { appManagedAnalysisCredential } from './app-managed-analysis-credential'
import { classifyAppManagedAnalysisRejection, publishAppManagedAnalysis } from './app-managed-analysis-service'
import {
  assertCurrentCoordinatorSession,
  assertCoordinatorAttemptSession,
  readScopedQualityJourney,
} from './quality-journey-coordinator-session'
import { createManagedQualityJourneyRoleDelivery } from './quality-journey-managed-role-delivery'
import {
  readExternalQualityJourneySubmissionOutcome,
  type ExternalQualityJourneySubmissionBinding,
} from './quality-journey-service'

type Scope = { journeyId: string; targetProjectId: string }
const retained = z
  .object({
    senderCleanupVerified: z.literal(true),
    recoveryEligible: z.boolean(),
    handoffPhase: z.string().optional(),
    candidate: appManagedAnalysisOutputSchema,
    candidateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    submissionIdempotencyKey: z.string().min(1),
    canonicalRecoveryUsed: z.boolean().optional(),
    rejection: z
      .object({ kind: z.string(), code: z.string().optional(), message: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()
function deny(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}

function recoverable(state: z.infer<typeof retained>, leaseExpiresAt: Date, accepted: boolean) {
  // Expiry can admit receipt reconciliation, never another delivery under expired authority.
  return (
    !state.canonicalRecoveryUsed &&
    hashCanonical(state.candidate) === state.candidateHash &&
    state.candidate.arguments.idempotencyKey === state.submissionIdempotencyKey &&
    (!deterministicallyRejected(state) || accepted) &&
    (leaseExpiresAt <= new Date() ? accepted : state.recoveryEligible)
  )
}

function deterministicallyRejected(state: z.infer<typeof retained>) {
  return state.rejection?.kind === 'CANONICAL' && ['CONFLICT', 'VALIDATION'].includes(state.rejection.code ?? '')
}

async function hasCanonicalAcceptance(
  input: Scope,
  attempt: QualityJourneyWorkAttempt,
  key: string,
  client: PrismaClient,
) {
  return Boolean(
    await client.qualityJourneyExternalSubmissionAcceptance.findFirst({
      where: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        attemptId: attempt.id,
        workItemId: attempt.workItemId,
        assignmentId: attempt.assignmentId ?? '',
        assignmentGeneration: attempt.assignmentGeneration,
        leaseId: attempt.leaseId,
        role: 'REQUIREMENT_ANALYZER',
        operation: 'ANALYSIS_SUBMIT',
        principalId: `appraise-local:${input.targetProjectId}`,
        idempotencyKey: key,
      },
      select: { id: true },
    }),
  )
}

/** Exact current proposal observation only; neither missing output nor a new report is synthesized. */
export async function getAppManagedAnalysisRetainedRecovery(input: Scope, client: PrismaClient = prisma) {
  const journey = await readScopedQualityJourney(input, client)
  if (
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.status !== 'ACTIVE' ||
    !['ANALYSIS', 'ANALYSIS_REVIEW'].includes(journey.stage)
  )
    return null
  const accepted = await client.qualityJourneyAnalysisRevision.findFirst({
    where: { journeyId: input.journeyId, targetProjectId: input.targetProjectId, cycleId: journey.activeCycleId },
    orderBy: { revision: 'desc' },
    select: { submittedAttemptId: true },
  })
  const attempt = await client.qualityJourneyWorkAttempt.findFirst({
    where: {
      dispatchAdapterId: 'APP_SERVER_LOCAL_V1_ANALYSIS',
      failureJson: { not: null },
      workItem: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        cycleId: journey.activeCycleId,
        role: 'REQUIREMENT_ANALYZER',
      },
      OR: [
        { workItemId: { in: JSON.parse(journey.activeWorkItemIdsJson) } },
        ...(accepted ? [{ id: accepted.submittedAttemptId }] : []),
      ],
    },
    include: { workItem: { select: { currentAttempt: true } } },
    orderBy: { startedAt: 'desc' },
  })
  if (!attempt?.failureJson || attempt.workItem.currentAttempt !== attempt.attempt) return null
  let value: unknown
  try {
    value = JSON.parse(attempt.failureJson)
  } catch {
    return null
  }
  const state = retained.safeParse(value)
  const acceptedSubmission =
    state.success && (attempt.leaseExpiresAt <= new Date() || deterministicallyRejected(state.data))
      ? await hasCanonicalAcceptance(input, attempt, state.data.submissionIdempotencyKey, client)
      : false
  if (!state.success || !recoverable(state.data, attempt.leaseExpiresAt, acceptedSubmission)) return null
  return { attemptId: attempt.id, candidateHash: state.data.candidateHash }
}

/** One canonical-only submission/publication of unchanged native output. Native dispatch is never called. */
export async function recoverAppManagedAnalysisRetained(
  input: Scope & { expectedStateHash: string; attemptId: string; candidateHash: string },
  client: PrismaClient = prisma,
) {
  const journey = await readScopedQualityJourney(input, client)
  if (journey.stateHash !== input.expectedStateHash) deny('The Journey changed. Reload before Analysis recovery.')
  const recovery = await getAppManagedAnalysisRetainedRecovery(input, client)
  if (recovery?.attemptId !== input.attemptId || recovery.candidateHash !== input.candidateHash)
    deny('Analysis recovery does not bind an unused retained proposal.')
  const session = await client.qualityJourneyCoordinatorSession.findUnique({
    where: { id: journey.currentCoordinatorSessionId ?? '' },
  })
  const principalId = `appraise-local:${input.targetProjectId}`
  if (!session || session.ownerPrincipalId !== principalId || !session.generation)
    deny('Analysis recovery requires the current local coordinator.')
  const owner = {
    journeyId: input.journeyId,
    targetProjectId: input.targetProjectId,
    coordinatorPrincipalId: principalId,
    coordinatorSessionId: session.id,
    coordinatorGeneration: session.generation,
  }
  await assertCurrentCoordinatorSession(owner, client)
  const attempt = await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: input.attemptId } })
  const state = retained.parse(JSON.parse(attempt.failureJson!))
  const acceptedSubmission =
    attempt.leaseExpiresAt <= new Date() || deterministicallyRejected(state)
      ? await hasCanonicalAcceptance(input, attempt, state.submissionIdempotencyKey, client)
      : false
  if (!recoverable(state, attempt.leaseExpiresAt, acceptedSubmission) || state.candidateHash !== input.candidateHash)
    deny('Analysis recovery changed or was already consumed.')
  if (!attempt.assignmentId) deny('The original Analysis assignment is unavailable.')
  const binding: ExternalQualityJourneySubmissionBinding = {
    ...owner,
    role: 'REQUIREMENT_ANALYZER',
    principal: { principalId, assurance: 'PROJECT_CREDENTIAL_ONLY' },
    assignmentSecret: await appManagedAnalysisCredential(owner, client),
    workItemId: attempt.workItemId,
    attemptId: attempt.id,
    assignmentId: attempt.assignmentId,
    assignmentGeneration: attempt.assignmentGeneration,
    leaseId: attempt.leaseId,
  }
  await assertCoordinatorAttemptSession(binding, client)
  const used = await client.$transaction(async tx => {
    const current = await readScopedQualityJourney(input, tx)
    if (current.stateHash !== input.expectedStateHash || current.status !== 'ACTIVE')
      deny('The Journey changed before Analysis recovery could be reserved.')
    await assertCurrentCoordinatorSession(owner, tx)
    const work = await tx.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: attempt.workItemId } })
    if (work.currentAttempt !== attempt.attempt) deny('The original Analysis attempt is no longer current.')
    return tx.qualityJourneyWorkAttempt.updateMany({
      where: {
        id: attempt.id,
        status: attempt.status,
        failureJson: attempt.failureJson,
        assignmentGeneration: attempt.assignmentGeneration,
      },
      data: { failureJson: canonicalContractJson({ ...state, canonicalRecoveryUsed: true }) },
    })
  })
  if (used.count !== 1) deny('Analysis recovery was already consumed.')
  let delivery: Awaited<ReturnType<typeof createManagedQualityJourneyRoleDelivery>> | undefined
  try {
    let committed = false
    try {
      await readExternalQualityJourneySubmissionOutcome(
        { ...binding, operation: 'ANALYSIS_SUBMIT', idempotencyKey: state.submissionIdempotencyKey },
        client,
      )
      committed = true
    } catch (error) {
      if (!(error instanceof ServiceError) || error.code !== 'NOT_FOUND') throw error
    }
    if (!committed) {
      delivery = await createManagedQualityJourneyRoleDelivery({
        binding,
        canonicalDefinitions: appManagedAnalysisDefinitions,
        client,
      })
      const accepted = await delivery.invoke({ ...state.candidate, callId: state.submissionIdempotencyKey })
      if (!accepted.receipt.accepted) deny('The retained Analysis has no canonical acceptance.')
    }
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id, dispatchAdapterId: 'APP_SERVER_LOCAL_V1_ANALYSIS' },
      data: { dispatchReservedAt: null, dispatchStartedAt: null },
    })
    const publication = await publishAppManagedAnalysis(input, owner, attempt.id, client)
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id, dispatchAdapterId: 'APP_SERVER_LOCAL_V1_ANALYSIS' },
      data: {
        failureJson: canonicalContractJson({
          ...state,
          canonicalRecoveryUsed: true,
          canonicalRecoveryOutcome: 'ACCEPTED',
        }),
      },
    })
    return { accepted: true, nativeSend: false, ...publication }
  } catch (error) {
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id },
      data: {
        failureJson: canonicalContractJson({
          ...state,
          canonicalRecoveryUsed: true,
          canonicalRecoveryOutcome: 'REJECTED_OR_UNKNOWN',
          canonicalRecoveryRejection: classifyAppManagedAnalysisRejection(error),
        }),
      },
    })
    throw new ServiceError(
      'The retained Analysis could not complete canonical recovery. Its original proposal is preserved; no new native send was performed.',
      'CONFLICT',
    )
  } finally {
    delivery?.fence()
  }
}
