import type { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/config/db-config'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'
import { readScopedQualityJourney } from './quality-journey-coordinator-session'

type Scope = { journeyId: string; targetProjectId: string }
const marker = 'APP_SERVER_LOCAL_V1_PREPARATION_AUTOMATOR'
export const manualAutomationRecoveryEventType = 'AUTOMATOR_MANUAL_RECOVERY_REQUESTED'
const manualRecoveryFailure = z
  .object({
    state: z.literal('UNKNOWN'),
    stage: z.enum(['NATIVE_SEND', 'OUTPUT_VALIDATION']),
    senderCleanupVerified: z.boolean(),
    canonicalSubmissionStarted: z.literal(false),
    recoveryEligible: z.literal(false),
    reason: z.string().optional(),
    candidate: z.never().optional(),
    candidateHash: z.never().optional(),
    normalizedOutput: z.never().optional(),
    normalizedOutputHash: z.never().optional(),
    compiledCall: z.never().optional(),
    compiledCallHash: z.never().optional(),
    canonicalRecoveryCall: z.never().optional(),
    canonicalRecoveryCallHash: z.never().optional(),
    canonicalRecoveryUsed: z.never().optional(),
    canonicalRecoveryOutcome: z.never().optional(),
  })
  .passthrough()
  .refine(failure =>
    failure.stage === 'NATIVE_SEND'
      ? !failure.senderCleanupVerified
      : failure.senderCleanupVerified && failure.reason === 'OUTPUT_VALIDATION_DID_NOT_COMPLETE',
  )

export function readManualAutomationFailure(value: string | null) {
  if (value === null) return undefined
  try {
    return manualRecoveryFailure.safeParse(JSON.parse(value)).data
  } catch {
    return undefined
  }
}
function conflict(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}

export async function readFailedManualAutomationAttempt(
  input: Scope & { attemptId?: string },
  tx: PrismaClient | Prisma.TransactionClient,
  includeWaiting = false,
) {
  const journey = await readScopedQualityJourney(input, tx)
  if (journey.hostingMode !== 'APP_SERVER_LOCAL_V1' || journey.status !== 'ACTIVE' || journey.stage !== 'AUTOMATION')
    conflict('Manual preparation recovery requires an active local Automation stage.')
  const attempts = await tx.qualityJourneyWorkAttempt.findMany({
    where: {
      ...(input.attemptId ? { id: input.attemptId } : {}),
      dispatchAdapterId: marker,
      workItemId: { in: JSON.parse(journey.activeWorkItemIdsJson) as string[] },
      workItem: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        cycleId: journey.activeCycleId,
        role: 'AUTOMATOR',
      },
    },
    include: { workItem: true },
  })
  const attempt = attempts.find(row => row.workItem.currentAttempt === row.attempt)
  if (
    !attempt ||
    !attempt.failureJson ||
    attempt.status !== 'IN_PROGRESS' ||
    attempt.workItem.status !== 'IN_PROGRESS' ||
    attempt.executionMode !== 'EXTERNAL_V1' ||
    attempt.externalPrincipalId !== `appraise-local:${input.targetProjectId}` ||
    attempt.externalPrincipalAssurance !== 'PROJECT_CREDENTIAL_ONLY' ||
    (!includeWaiting && attempt.leaseExpiresAt > new Date()) ||
    !attempt.assignmentId ||
    !attempt.authorizationId ||
    !attempt.dispatchReservedAt ||
    !attempt.dispatchStartedAt ||
    attempt.resultJson ||
    attempt.resultHash ||
    attempt.spawnRequestJson ||
    attempt.spawnReceiptJson ||
    attempt.dispatchKey
  )
    conflict('Only the exact expired local Automator assignment can be fenced for manual preparation.')
  const failure = readManualAutomationFailure(attempt.failureJson)
  if (!failure) conflict('Manual preparation requires an unresolved attempt with no retained proposal.')
  const [acceptances, materializations, providerRuns] = await Promise.all([
    tx.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: attempt.id } }),
    tx.qualityJourneyAutomationMaterialization.count({ where: { attemptId: attempt.id } }),
    tx.qualityJourneyProviderRun.count({ where: { attemptId: attempt.id } }),
  ])
  if (acceptances || materializations || providerRuns)
    conflict('The original Automator has accepted work or provider effects requiring separate recovery.')
  const authorization = await tx.qualityJourneyWorkAuthorization.findFirst({
    where: { workItemId: attempt.workItemId, successorAuthorization: { is: null } },
  })
  if (
    !authorization ||
    authorization.id !== attempt.authorizationId ||
    authorization.revokedAt ||
    authorization.cancelledAt ||
    (await tx.qualityJourneyWorkAttempt.count({ where: { authorizationId: authorization.id } })) >=
      authorization.maxAttempts
  )
    conflict('Manual recovery requires remaining authority under the original hard attempt budget.')
  return { journey, attempt, failure, failureHash: hashCanonical(failure) }
}

/** An expired authority can be abandoned without asserting that its physical effects stopped. */
export async function getAppManagedAutomatorManualRecovery(
  input: Scope & { includeWaiting?: boolean },
  client: PrismaClient | Prisma.TransactionClient = prisma,
) {
  try {
    const { attempt, failure, failureHash } = await readFailedManualAutomationAttempt(
      input,
      client,
      input.includeWaiting,
    )
    const waiting = attempt.leaseExpiresAt > new Date()
    if (waiting && failure.stage !== 'OUTPUT_VALIDATION') return null
    return {
      attemptId: attempt.id,
      failureHash,
      nativeOutcome: 'UNKNOWN' as const,
      senderCleanupVerified: failure.senderCleanupVerified,
      ...(waiting ? { availableAt: attempt.leaseExpiresAt.toISOString() } : {}),
    }
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'CONFLICT') return null
    throw error
  }
}

/** Refresh-safe observation of issued manual authority, including an already claimed successor. */
export async function observePendingManualAutomationRecovery(
  input: Scope,
  client: PrismaClient | Prisma.TransactionClient = prisma,
) {
  const journey = await readScopedQualityJourney(input, client)
  if (journey.hostingMode !== 'APP_SERVER_LOCAL_V1' || journey.status !== 'ACTIVE' || journey.stage !== 'AUTOMATION')
    return null
  const events = await client.qualityJourneyEvent.findMany({
    where: { ...input, eventType: manualAutomationRecoveryEventType },
    orderBy: { sequence: 'desc' },
  })
  for (const event of events) {
    const payload = JSON.parse(event.payloadJson)
    if (
      payload.cycleId !== journey.activeCycleId ||
      !JSON.parse(journey.activeWorkItemIdsJson).includes(payload.workItemId)
    )
      continue
    const prior = await client.qualityJourneyWorkAttempt.findUnique({
      where: { id: payload.predecessorAttemptId },
      include: { workItem: true },
    })
    const failure = readManualAutomationFailure(prior?.failureJson ?? null)
    if (
      !prior ||
      !failure ||
      prior.workItemId !== payload.workItemId ||
      prior.workItem.journeyId !== input.journeyId ||
      prior.workItem.targetProjectId !== input.targetProjectId ||
      prior.workItem.role !== 'AUTOMATOR' ||
      prior.status !== 'CANCELLED' ||
      prior.failureJson !== payload.failureJson ||
      prior.assignmentId !== payload.predecessorAssignmentId ||
      prior.authorizationId !== payload.authorizationId ||
      payload.schemaVersion !== 'appraise.automator-manual-recovery/v1' ||
      payload.successorAttempt !== prior.attempt + 1 ||
      payload.failureHash !== hashCanonical(JSON.parse(prior.failureJson!)) ||
      payload.dispatchReservedAt !== prior.dispatchReservedAt?.toISOString() ||
      payload.dispatchStartedAt !== prior.dispatchStartedAt?.toISOString() ||
      payload.nativeSend !== false ||
      payload.senderCleanupVerified !== failure.senderCleanupVerified ||
      payload.canonicalSubmissionStarted !== false ||
      payload.acceptedSubmissionCount !== 0 ||
      payload.nativeOutcome !== 'UNKNOWN' ||
      !['REPLACEMENT_REQUESTED', 'WORKER_REQUESTED', 'IN_PROGRESS'].includes(prior.workItem.status)
    )
      continue
    const successor = await client.qualityJourneyWorkAttempt.findFirst({
      where: { workItemId: prior.workItemId, attempt: payload.successorAttempt },
    })
    if (
      successor &&
      (successor.replacesAttemptId !== prior.id ||
        !['WORKER_REQUESTED', 'IN_PROGRESS'].includes(successor.status) ||
        successor.leaseExpiresAt <= new Date() ||
        successor.dispatchAdapterId ||
        successor.dispatchReservedAt ||
        successor.dispatchStartedAt)
    )
      continue
    if (prior.workItem.currentAttempt !== (successor ? successor.attempt : prior.attempt)) continue
    return {
      eventId: event.id,
      predecessorAttemptId: prior.id,
      workItemId: prior.workItemId,
      successorAttempt: payload.successorAttempt as number,
      ...(successor ? { successorAttemptId: successor.id, successorAssignmentId: successor.assignmentId } : {}),
      nativeSend: false as const,
    }
  }
  return null
}
