import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'
import { setQualityJourneyActiveWorkItemsWithBusinessJoinInTransaction } from './quality-journey-service'
import { assertCoordinatorAttemptSession, assertCurrentCoordinatorSession } from './quality-journey-coordinator-session'
import {
  assertJourneyBusinessGroupSupportsNoInvalidationInTransaction,
  withJourneyBusinessWriteJoinInTransaction,
} from './quality-journey-business-write-join'
import { readInternalDiscoveryAssignment, retryQualityJourneyDiscovery } from './quality-journey-discovery-service'
import { assertHistoricalHubQuiescent } from './quality-journey-provider-recovery'

function conflict(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}
type Input = { journeyId: string; targetProjectId: string; expectedStateHash: string }

/** These exact sender diagnostics originate in verifyManagedAnalysisExecutable, before credential access,
 * private-root creation or spawn. The legacy cleanup=false marker meant the service had not reached a returned
 * sender result; it does not mean a process existed. Do not generalize this exception to arbitrary native errors.
 */
function isPreModelExecutableRefusal(failure: Record<string, unknown>) {
  return (
    failure.state === 'UNKNOWN' &&
    failure.stage === 'NATIVE_SEND' &&
    failure.reason === 'NATIVE_SEND_DID_NOT_COMPLETE' &&
    failure.senderCleanupVerified === false &&
    failure.canonicalSubmissionStarted === false &&
    failure.refusalCategory === 'UNCLASSIFIED_REFUSAL' &&
    [
      'Managed Analysis requires pinned Codex 0.169.1; attempt outcome UNKNOWN',
      'Managed Analysis requires a supported Codex executable; attempt outcome UNKNOWN',
    ].includes(failure.detail as string) &&
    Object.keys(failure).length === 7
  )
}

/** A new canonical assignment after proven absence of native effects or completed cleanup, and no original commit.
 * Never resends, replaces a candidate, erases the original failure, or adopts uncertain native work.
 * Mixed invalidation is deliberately limited to the existing legacy enrollment boundary.
 */
async function reconcileAppManagedDiscoveryRole(
  input: Input,
  role: 'SCOUT' | 'RESOURCE_EXPLORER',
  client: PrismaClient,
) {
  return client.$transaction(async tx => {
    const journey = await tx.qualityJourney.findFirst({
      where: { id: input.journeyId, targetProjectId: input.targetProjectId },
    })
    if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
    const session = journey.currentCoordinatorSessionId
      ? await tx.qualityJourneyCoordinatorSession.findUnique({ where: { id: journey.currentCoordinatorSessionId } })
      : null
    if (
      !session ||
      session.generation === null ||
      session.ownerPrincipalId !== `appraise-local:${input.targetProjectId}`
    )
      conflict('Explorer correction requires the original current app-owned coordinator.')
    const binding = {
      ...input,
      coordinatorSessionId: session.id,
      coordinatorGeneration: session.generation,
      coordinatorPrincipalId: session.ownerPrincipalId,
    }
    await assertCurrentCoordinatorSession(binding, tx)
    const eventId = `app_explorer_correction_${hashCanonical({ ...input, role }).slice(7)}`
    const prior = await tx.qualityJourneyEvent.findUnique({ where: { id: eventId } })
    if (prior) {
      const recorded = JSON.parse(prior.payloadJson)
      if (
        prior.journeyId !== journey.id ||
        prior.targetProjectId !== input.targetProjectId ||
        recorded.coordinatorSessionId !== session.id ||
        recorded.coordinatorGeneration !== session.generation
      )
        conflict('Explorer correction belongs to another ownership generation.')
      return {
        replayed: true,
        workItemId: recorded.originalWorkItemId as string,
        originalAttemptId: recorded.originalAttemptId as string,
        discoveryRevisionId: recorded.discoveryRevisionId as string,
      }
    }
    if (
      journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
      journey.status !== 'ACTIVE' ||
      journey.stage !== 'DISCOVERY' ||
      journey.stateHash !== input.expectedStateHash
    )
      conflict('The active Discovery state changed. Reload before requesting a correction.')
    // Serialize with native reservations, then inspect all canonical witnesses in this same database transaction.
    const hub = await tx.qualityJourneyProviderSlot.upsert({
      where: { id: 'HUB' },
      create: { id: 'HUB' },
      update: { version: { increment: 1 } },
    })
    if (hub.intentId || hub.providerRunId)
      conflict('Provider effects require reconciliation before Explorer correction.')
    const revision = journey.activeDiscoveryRevisionId
      ? await tx.qualityJourneyDiscoveryRevision.findUnique({ where: { id: journey.activeDiscoveryRevisionId } })
      : null
    if (
      !revision ||
      revision.status !== 'COLLECTING' ||
      revision.cycleId !== journey.activeCycleId ||
      (role === 'SCOUT'
        ? revision.targetObservationHash ||
          revision.targetObservationJson ||
          revision.targetObservationIdempotencyKey ||
          revision.targetObservationSubmittedAt
        : revision.resourceResolutionHash ||
          revision.resourceResolutionJson ||
          revision.resourceResolutionIdempotencyKey ||
          revision.resourceResolutionSubmittedAt) ||
      revision.completionHash
    )
      conflict('Explorer correction requires an unchanged collecting revision with no accepted Resource output.')
    const item = await tx.qualityJourneyWorkItem.findUnique({
      where: { id: role === 'SCOUT' ? revision.scoutWorkItemId : revision.resourceWorkItemId },
    })
    const attempt = item
      ? await tx.qualityJourneyWorkAttempt.findUnique({
          where: { workItemId_attempt: { workItemId: item.id, attempt: item.currentAttempt } },
        })
      : null
    if (
      !item ||
      !attempt ||
      item.role !== role ||
      item.status !== 'IN_PROGRESS' ||
      attempt.status !== 'IN_PROGRESS' ||
      attempt.executionMode !== 'EXTERNAL_V1' ||
      attempt.externalPrincipalId !== session.ownerPrincipalId ||
      attempt.dispatchAdapterId !== `APP_SERVER_LOCAL_V1_DISCOVERY_${role}` ||
      !attempt.dispatchReservedAt ||
      !attempt.dispatchStartedAt ||
      !attempt.failureJson ||
      attempt.resultHash ||
      attempt.resultJson ||
      attempt.completedAt ||
      !attempt.authorizationId
    )
      conflict('Explorer correction has no exact failed post-sender assignment to reconcile.')
    const failure = JSON.parse(attempt.failureJson)
    const preModelExecutableRefusal = isPreModelExecutableRefusal(failure)
    const postSenderStages = ['OUTPUT_VALIDATION', 'APP_INJECTION', 'CONTRACT_PREFLIGHT', 'CANONICAL_SUBMISSION']
    if (
      !preModelExecutableRefusal &&
      (failure.state !== 'UNKNOWN' ||
        !postSenderStages.includes(failure.stage) ||
        failure.reason !== `${failure.stage}_DID_NOT_COMPLETE` ||
        failure.senderCleanupVerified === false)
    )
      conflict('The original native outcome is uncertain. Explorer correction is refused.')
    await assertCoordinatorAttemptSession({ ...binding, attemptId: attempt.id }, tx)
    const [acceptances, providerRuns] = await Promise.all([
      tx.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: attempt.id } }),
      tx.qualityJourneyProviderRun.count({ where: { attemptId: attempt.id } }),
    ])
    if (acceptances || providerRuns)
      conflict('Original acceptance or provider evidence requires reconciliation; no correction was issued.')
    const authorization = await tx.qualityJourneyWorkAuthorization.findUnique({
      where: { id: attempt.authorizationId },
    })
    if (!authorization || authorization.workItemId !== item.id || authorization.revokedAt || authorization.cancelledAt)
      conflict('The original Explorer authority changed.')
    // Revalidates approved Analysis, frozen registries, revision identity and role-specific input hash.
    await readInternalDiscoveryAssignment(journey, { ...item, role }, tx)
    await assertJourneyBusinessGroupSupportsNoInvalidationInTransaction(tx, input)
    return withJourneyBusinessWriteJoinInTransaction(tx, input, binding, async beforeWrite => {
      await beforeWrite(tx, input)
      const now = new Date()
      const originalFailureHash = hashCanonical(failure)
      const causalRecord = {
        schemaVersion: 'appraise.discovery-correction/v1',
        role,
        originalAttemptId: attempt.id,
        originalWorkItemId: item.id,
        originalFailure: failure,
        originalFailureHash,
        originalDispatchAdapterId: attempt.dispatchAdapterId,
        originalDispatchReservedAt: attempt.dispatchReservedAt!.toISOString(),
        originalDispatchStartedAt: attempt.dispatchStartedAt!.toISOString(),
        coordinatorSessionId: session.id,
        coordinatorGeneration: session.generation,
        discoveryRevisionId: revision.id,
        senderCleanupVerified: true,
        canonicalCommitObserved: false,
        ...(preModelExecutableRefusal
          ? { reconciliationBasis: 'PRE_MODEL_EXECUTABLE_REFUSAL', nativeSendStarted: false }
          : {}),
        evidence: preModelExecutableRefusal
          ? 'Exact executable-verification refusal occurred before credential access, private-root creation or native spawn; same-transaction canonical receipt, role output and original result are absent.'
          : 'Awaited native sender returned after cleanup; settled failure recorded; same-transaction canonical receipt, Resource output and original result are absent.',
        requestedBy: 'LOCAL_UI',
      }
      const reconciled = await tx.qualityJourneyWorkAttempt.updateMany({
        where: {
          id: attempt.id,
          status: 'IN_PROGRESS',
          failureJson: attempt.failureJson,
          resultHash: null,
          resultJson: null,
          dispatchAdapterId: attempt.dispatchAdapterId,
          dispatchReservedAt: attempt.dispatchReservedAt,
          dispatchStartedAt: attempt.dispatchStartedAt,
        },
        data: { status: 'FAILED', completedAt: now, dispatchReservedAt: null, dispatchStartedAt: null },
      })
      if (reconciled.count !== 1) conflict('The original Explorer attempt changed during reconciliation.')
      await tx.qualityJourneyWorkItem.update({
        where: { id: item.id },
        data: { status: 'SUPERSEDED', version: { increment: 1 } },
      })
      await tx.qualityJourneyWorkAuthorization.update({
        where: { id: authorization.id },
        data: {
          revokedAt: now,
          revokedBy: 'RUNNER',
          revocationReason: preModelExecutableRefusal
            ? 'Pre-model executable refusal with no native send or canonical commit; distinct Discovery correction requested by local UI.'
            : 'Post-sender no-commit reconciliation; distinct Explorer correction requested by local UI.',
        },
      })
      await assertHistoricalHubQuiescent(tx)
      await tx.qualityJourneyDiscoveryRevision.update({
        where: { id: revision.id },
        data: { status: 'INVALIDATED', invalidatedAt: now, rowVersion: { increment: 1 } },
      })
      const activeIds = JSON.parse(journey.activeWorkItemIdsJson) as string[]
      await setQualityJourneyActiveWorkItemsWithBusinessJoinInTransaction(
        journey.id,
        activeIds.filter(id => id !== item.id),
        tx,
        beforeWrite,
      )
      const current = await tx.qualityJourney.findUniqueOrThrow({ where: { id: journey.id } })
      await tx.qualityJourneyEvent.create({
        data: {
          id: eventId,
          journeyId: journey.id,
          targetProjectId: journey.targetProjectId,
          sequence: (await tx.qualityJourneyEvent.count({ where: { journeyId: journey.id } })) + 1,
          eventType: `${role}_RECONCILED_WITHOUT_COMMIT`,
          predecessorStateHash: journey.stateHash,
          successorStateHash: current.stateHash,
          payloadJson: canonicalContractJson(causalRecord),
        },
      })
      return {
        replayed: false,
        workItemId: item.id,
        originalAttemptId: attempt.id,
        discoveryRevisionId: revision.id,
      }
    })
  })
}

/** Explicit second step: freeze current configured registries through the existing canonical retry owner. */
export async function createAppManagedDiscoveryCorrection(input: Input, client: PrismaClient = prisma) {
  const binding = await client.$transaction(async tx => {
    const journey = await tx.qualityJourney.findFirst({
      where: { id: input.journeyId, targetProjectId: input.targetProjectId },
    })
    if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
    const session = journey.currentCoordinatorSessionId
      ? await tx.qualityJourneyCoordinatorSession.findUnique({ where: { id: journey.currentCoordinatorSessionId } })
      : null
    if (
      !session ||
      session.generation === null ||
      session.ownerPrincipalId !== `appraise-local:${input.targetProjectId}` ||
      journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
      journey.status !== 'ACTIVE' ||
      journey.stage !== 'DISCOVERY'
    )
      conflict('Discovery correction requires the current exact app-owned state.')
    const binding = {
      ...input,
      coordinatorSessionId: session.id,
      coordinatorGeneration: session.generation,
      coordinatorPrincipalId: session.ownerPrincipalId,
    }
    await assertCurrentCoordinatorSession(binding, tx)
    const events = await tx.qualityJourneyEvent.findMany({
      where: {
        journeyId: journey.id,
        targetProjectId: input.targetProjectId,
        eventType: { in: ['RESOURCE_EXPLORER_RECONCILED_WITHOUT_COMMIT', 'SCOUT_RECONCILED_WITHOUT_COMMIT'] },
        successorStateHash: input.expectedStateHash,
      },
    })
    const event = events.find(row => {
      const data = JSON.parse(row.payloadJson)
      return data.coordinatorSessionId === session.id && data.coordinatorGeneration === session.generation
    })
    if (!event) conflict('No exact current-owner Explorer reconciliation permits this retry.')
    const originalRevisionId = JSON.parse(event.payloadJson).discoveryRevisionId as string
    const revision = await tx.qualityJourneyDiscoveryRevision.findUnique({ where: { id: originalRevisionId } })
    const successor = await tx.qualityJourneyDiscoveryRevision.findFirst({
      where: { predecessorRevisionId: originalRevisionId },
    })
    const replay = successor?.retryIdempotencyKey === `${event.id}:retry`
    if (
      !revision ||
      (!replay &&
        (revision.status !== 'INVALIDATED' ||
          journey.activeDiscoveryRevisionId !== revision.id ||
          journey.stateHash !== input.expectedStateHash)) ||
      ((JSON.parse(event.payloadJson).role ?? 'RESOURCE_EXPLORER') === 'SCOUT'
        ? revision.targetObservationHash || revision.targetObservationJson
        : revision.resourceResolutionHash || revision.resourceResolutionJson)
    )
      conflict('Reconcile the original rejected Explorer attempt before creating fresh Discovery work.')
    const record = JSON.parse(event.payloadJson)
    const attempt = await tx.qualityJourneyWorkAttempt.findUnique({ where: { id: record.originalAttemptId } })
    if (
      !attempt ||
      attempt.status !== 'FAILED' ||
      attempt.failureJson !== canonicalContractJson(record.originalFailure) ||
      attempt.dispatchReservedAt ||
      attempt.dispatchStartedAt ||
      attempt.resultHash ||
      (await tx.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: attempt.id } }))
    )
      conflict('The original reconciliation evidence changed. No fresh work was created.')
    await assertHistoricalHubQuiescent(tx)
    return {
      ...binding,
      expectedActiveDiscoveryRevisionId: revision.id,
      idempotencyKey: `${event.id}:retry`,
      reason: 'Explicit local correction after proven cleaned native sender and no original canonical Explorer commit.',
    }
  })
  return retryQualityJourneyDiscovery(
    {
      journeyId: binding.journeyId,
      targetProjectId: binding.targetProjectId,
      expectedActiveDiscoveryRevisionId: binding.expectedActiveDiscoveryRevisionId,
      idempotencyKey: binding.idempotencyKey,
      reason: binding.reason,
    },
    client,
    binding,
  )
}

export async function requestAppManagedExplorerCorrection(input: Input, client: PrismaClient = prisma) {
  return reconcileAppManagedDiscoveryRole(input, 'RESOURCE_EXPLORER', client)
}
export async function requestAppManagedScoutCorrection(input: Input, client: PrismaClient = prisma) {
  return reconcileAppManagedDiscoveryRole(input, 'SCOUT', client)
}
