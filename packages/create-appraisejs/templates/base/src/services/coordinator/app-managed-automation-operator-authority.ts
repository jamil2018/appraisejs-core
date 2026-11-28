import type { Prisma } from '@prisma/client'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'
import { readManualAutomationFailure } from './app-managed-automation-manual-recovery-observation'

/** Server-held durable manual recovery, never a model-asserted reviewer or payload flag. */
export async function assertOperatorAutomationLocatorAuthority(
  scope: { journeyId: string; targetProjectId: string; workItemId: string; attemptId: string },
  tx: Prisma.TransactionClient,
) {
  const fail = (): never => {
    throw new ServiceError(
      'Supplemental locator preparation requires its exact admitted manual recovery successor.',
      'CONFLICT',
    )
  }
  const attempt = await tx.qualityJourneyWorkAttempt.findUnique({ where: { id: scope.attemptId } })
  if (
    !attempt ||
    attempt.workItemId !== scope.workItemId ||
    !attempt.replacesAttemptId ||
    !attempt.externalAdmittedAt ||
    !attempt.externalAdmissionHash ||
    attempt.dispatchAdapterId ||
    attempt.dispatchReservedAt ||
    attempt.dispatchStartedAt ||
    attempt.executionMode !== 'EXTERNAL_V1'
  )
    return fail()
  const prior = await tx.qualityJourneyWorkAttempt.findUnique({ where: { id: attempt.replacesAttemptId } })
  if (
    !prior ||
    prior.workItemId !== scope.workItemId ||
    prior.status !== 'CANCELLED' ||
    !prior.cancelledAt ||
    !prior.failureJson ||
    prior.dispatchAdapterId !== 'APP_SERVER_LOCAL_V1_PREPARATION_AUTOMATOR' ||
    !prior.dispatchReservedAt ||
    !prior.dispatchStartedAt ||
    prior.resultJson ||
    prior.resultHash
  )
    return fail()
  const failure = readManualAutomationFailure(prior.failureJson)
  if (!failure) return fail()
  const events = await tx.qualityJourneyEvent.findMany({
    where: {
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      eventType: 'AUTOMATOR_MANUAL_RECOVERY_REQUESTED',
    },
  })
  const matching = events.filter(event => {
    const value = JSON.parse(event.payloadJson)
    return (
      value.schemaVersion === 'appraise.automator-manual-recovery/v1' &&
      value.workItemId === scope.workItemId &&
      value.predecessorAttemptId === prior.id &&
      value.predecessorAssignmentId === prior.assignmentId &&
      value.authorizationId === prior.authorizationId &&
      value.successorAttempt === attempt.attempt &&
      value.failureJson === prior.failureJson &&
      value.failureHash === hashCanonical(JSON.parse(prior.failureJson!)) &&
      value.dispatchReservedAt === prior.dispatchReservedAt!.toISOString() &&
      value.dispatchStartedAt === prior.dispatchStartedAt!.toISOString() &&
      value.nativeOutcome === 'UNKNOWN' &&
      value.senderCleanupVerified === failure.senderCleanupVerified &&
      value.canonicalSubmissionStarted === false &&
      value.acceptedSubmissionCount === 0 &&
      value.nativeSend === false
    )
  })
  if (
    matching.length !== 1 ||
    (await tx.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: prior.id } }))
  )
    return fail()
}
