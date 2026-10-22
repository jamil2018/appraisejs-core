import type {
  PrismaClient,
  Prisma,
  QualityJourneyProviderRun,
  QualityJourneyProviderDispatchIntent,
} from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'
import {
  analysisFollowupExpectedWorkSchema,
  type AnalysisFollowupExpectedWork,
} from './quality-journey-analysis-followup'
import {
  createQualityJourneyAnalysisFixtureDelivery,
  type QualityJourneyAnalysisFixtureDeliveryOptions,
} from './quality-journey-analysis-delivery'
import { assertCurrentCoordinatorSession, type CoordinatorSessionBinding } from './quality-journey-coordinator-session'
import { assertHistoricalHubQuiescent, assertProviderReplacementSafe } from './quality-journey-provider-recovery'
import {
  claimExternalQualityJourneyAnalysisFollowup,
  admitExternalQualityJourneyWork,
  ensureQualityJourneyAnalysisFollowupInTransaction,
  readExternalQualityJourneySubmissionOutcome,
  type ExternalAnalyzerProjectPrincipal,
} from './quality-journey-service'

export type AnalysisFollowupSchedulerInput = CoordinatorSessionBinding & {
  expected: AnalysisFollowupExpectedWork
  principal: ExternalAnalyzerProjectPrincipal
  /** Original caller-owned credential. Never persisted, recovered or regenerated here. */
  assignmentSecret: string
  fixture: Omit<QualityJourneyAnalysisFixtureDeliveryOptions, 'submissionIdempotencyKey'>
}
export type AnalysisFollowupDelivery = Awaited<ReturnType<typeof createQualityJourneyAnalysisFixtureDelivery>>
export type AnalysisFollowupController = { retainDelivery: (actualDelivery: AnalysisFollowupDelivery) => void }

export function analysisFollowupOperationKeys(
  input: Pick<
    AnalysisFollowupSchedulerInput,
    'expected' | 'coordinatorSessionId' | 'coordinatorGeneration' | 'coordinatorPrincipalId'
  >,
) {
  const key = hashCanonical({
    schemaVersion: 'appraise.analysis-followup-operations/v1',
    expected: analysisFollowupExpectedWorkSchema.parse(input.expected),
    sessionId: input.coordinatorSessionId,
    generation: input.coordinatorGeneration,
    principalId: input.coordinatorPrincipalId,
  }).slice(7)
  return {
    claim: `analysis-followup:${key}:claim`,
    admit: `analysis-followup:${key}:admit`,
    prepare: `analysis-followup:${key}:prepare`,
    submit: `analysis-followup:${key}:submit`,
    providerNamespace: `synthetic:m06-followup:${key}`,
  }
}

async function readAnalysisFollowupPhysicalReadiness(
  request: AnalysisFollowupSchedulerInput,
  expected: AnalysisFollowupExpectedWork,
  tx: Prisma.TransactionClient,
) {
  const slot = await tx.qualityJourneyProviderSlot.findUnique({ where: { id: 'HUB' } })
  if (slot?.intentId || slot?.providerRunId) return { reason: 'PHYSICAL_RECONCILIATION_REQUIRED' }
  await assertProviderReplacementSafe(
    { journeyId: request.journeyId, targetProjectId: request.targetProjectId, workItemId: expected.workItemId },
    tx,
  )
  await assertHistoricalHubQuiescent(tx)
  return { reason: null }
}

/** Explicit offline controller only. One canonical claim/admission/delivery step, no timer or public route. */
async function readCurrentFollowupReadiness(
  request: AnalysisFollowupSchedulerInput,
  expected: AnalysisFollowupExpectedWork,
  client: PrismaClient,
) {
  return client.$transaction(async tx => {
    const { journey, session } = await assertCurrentCoordinatorSession(request, tx)
    if (!session || journey.hostingMode !== 'APP_SERVER_LOCAL_V1') return { reason: 'MANAGED_SESSION_REQUIRED' }
    if (journey.status !== 'ACTIVE') return { reason: 'INACTIVE' }
    const compiled = await ensureQualityJourneyAnalysisFollowupInTransaction(request, tx)
    if (!compiled.expected) return { reason: compiled.status }
    if (canonicalContractJson(compiled.expected) !== canonicalContractJson(expected))
      return { reason: 'STALE_EXPECTED_WORK' }
    return readAnalysisFollowupPhysicalReadiness(request, expected, tx)
  })
}

type FollowupClaim = Awaited<ReturnType<typeof claimExternalQualityJourneyAnalysisFollowup>>
function isReusableFollowupPreparation(
  run: QualityJourneyProviderRun,
  intent: QualityJourneyProviderDispatchIntent | null,
): intent is QualityJourneyProviderDispatchIntent {
  if (
    !intent ||
    run.status !== 'PREPARED' ||
    run.terminalReconciledAt ||
    run.unresolvedRetentionAt <= new Date() ||
    intent.sendBoundaryId ||
    intent.armedAt ||
    intent.reconciledAt ||
    intent.invalidatedAt
  )
    return false
  return true
}

async function readFollowupRunDisposition(claimed: FollowupClaim, client: PrismaClient) {
  const run = await client.qualityJourneyProviderRun.findUnique({ where: { attemptId: claimed.attempt.id } })
  if (run) {
    const intent = await client.qualityJourneyProviderDispatchIntent.findUnique({
      where: { providerRunId_turnOrdinal: { providerRunId: run.id, turnOrdinal: 1 } },
    })
    if (!isReusableFollowupPreparation(run, intent))
      return { phase: 'RECOVERY_REQUIRED' as const, reason: 'ARMED_OR_AMBIGUOUS_PROVIDER_RUN' }
    if (intent.status === 'CLAIMED' && intent.claimExpiresAt && intent.claimExpiresAt > new Date())
      return { phase: 'WAITING' as const, reason: 'ORIGINAL_INTENT_CLAIM_ACTIVE' }
    if (!['PENDING', 'CLAIMED'].includes(intent.status))
      return { phase: 'RECOVERY_REQUIRED' as const, reason: 'PROVIDER_INTENT_REQUIRES_RECOVERY' }
  }
  return null
}

function followupSubmissionBinding(request: AnalysisFollowupSchedulerInput, claimed: FollowupClaim) {
  return {
    ...request,
    role: 'REQUIREMENT_ANALYZER' as const,
    workItemId: claimed.workItem.id,
    attemptId: claimed.attempt.id,
    assignmentId: claimed.assignment.assignmentId,
    assignmentGeneration: claimed.assignmentGeneration,
    leaseId: claimed.attempt.leaseId,
  }
}
async function observeFollowupAcceptance(
  request: AnalysisFollowupSchedulerInput,
  claimed: FollowupClaim,
  keys: ReturnType<typeof analysisFollowupOperationKeys>,
  expected: AnalysisFollowupExpectedWork,
  client: PrismaClient,
) {
  try {
    const accepted = await readExternalQualityJourneySubmissionOutcome(
      { ...followupSubmissionBinding(request, claimed), operation: 'ANALYSIS_SUBMIT', idempotencyKey: keys.submit },
      client,
    )
    return {
      phase: 'OBSERVED' as const,
      reason: 'CANONICAL_ACCEPTANCE_REPLAY',
      expected,
      acceptance: accepted.outcome,
      runtimeQualified: false as const,
    }
  } catch (error) {
    if (!(error instanceof ServiceError) || error.code !== 'NOT_FOUND') throw error
    return null
  }
}

function followupRecovery(reason: string, expected: AnalysisFollowupExpectedWork) {
  return { phase: 'RECOVERY_REQUIRED' as const, reason, expected, runtimeQualified: false as const }
}
async function advanceClaimedAnalysisFollowup(
  request: AnalysisFollowupSchedulerInput,
  claimed: FollowupClaim,
  keys: ReturnType<typeof analysisFollowupOperationKeys>,
  expected: AnalysisFollowupExpectedWork,
  client: PrismaClient,
  controller?: AnalysisFollowupController,
) {
  const binding = followupSubmissionBinding(request, claimed)
  if (claimed.attempt.leaseExpiresAt <= new Date()) return followupRecovery('ASSIGNMENT_LEASE_EXPIRED', expected)
  if (claimed.attempt.status === 'WORKER_REQUESTED') {
    await admitExternalQualityJourneyWork({ ...binding, idempotencyKey: keys.admit }, client)
    return {
      phase: 'ADMITTED' as const,
      expected,
      attemptId: claimed.attempt.id,
      assignmentId: claimed.assignment.assignmentId,
      runtimeQualified: false as const,
    }
  }
  if (claimed.attempt.status !== 'IN_PROGRESS' || !claimed.attempt.externalAdmissionId)
    return followupRecovery('ASSIGNMENT_REQUIRES_RECOVERY', expected)
  const runDisposition = await readFollowupRunDisposition(claimed, client)
  if (runDisposition) return { ...runDisposition, expected, runtimeQualified: false as const }
  const delivery = await createQualityJourneyAnalysisFixtureDelivery(
    {
      ...binding,
      idempotencyKey: keys.prepare,
      providerNamespace: keys.providerNamespace,
      configurationDigest: hashCanonical('fixture configuration bound by delivery'),
      envelopeDigest: hashCanonical('fixture envelope bound by delivery'),
    },
    { ...request.fixture, submissionIdempotencyKey: keys.submit },
    client,
  )
  // The observer retains this exact real object before any start; it is not
  // cloned input, an injected factory, or a dispatch capability.
  controller?.retainDelivery(delivery)
  const result = await delivery.start()
  return {
    phase: 'DELIVERY' as const,
    expected,
    attemptId: claimed.attempt.id,
    result,
    runtimeQualified: false as const,
  }
}

function originalFollowupCallerRefusal(request: AnalysisFollowupSchedulerInput) {
  if (
    typeof request.assignmentSecret !== 'string' ||
    Buffer.byteLength(request.assignmentSecret, 'utf8') < 32 ||
    request.assignmentSecret.length > 2_000
  )
    return 'ORIGINAL_ASSIGNMENT_CREDENTIAL_REQUIRED'
  if (
    request.principal.assurance !== 'PROJECT_CREDENTIAL_ONLY' ||
    request.principal.principalId !== request.coordinatorPrincipalId
  )
    return 'CURRENT_PROJECT_PRINCIPAL_REQUIRED'
  return null
}

export async function advanceQualityJourneyAnalysisFollowup(
  input: AnalysisFollowupSchedulerInput,
  client: PrismaClient,
  controller?: AnalysisFollowupController,
) {
  const request = structuredClone(input)
  const expected = analysisFollowupExpectedWorkSchema.parse(request.expected)
  const keys = analysisFollowupOperationKeys(request)
  const recovery = (reason: string) => followupRecovery(reason, expected)
  const waiting = (reason: string) => ({
    phase: 'WAITING' as const,
    reason,
    expected,
    runtimeQualified: false as const,
  })
  const refusal = originalFollowupCallerRefusal(request)
  if (refusal) return recovery(refusal)
  const claimInput = { ...request, role: 'REQUIREMENT_ANALYZER' as const, idempotencyKey: keys.claim }
  try {
    // Read the exact original receipt before current-work selection. Historical
    // replay authenticates the original credential and cannot mint an attempt.
    const receipt = await client.qualityJourneyExternalWorkClaimReceipt.findUnique({
      where: {
        journeyId_targetProjectId_principalId_protocol_idempotencyKey: {
          journeyId: request.journeyId,
          targetProjectId: request.targetProjectId,
          principalId: request.principal.principalId,
          protocol: 'EXTERNAL_V1',
          idempotencyKey: keys.claim,
        },
      },
    })
    let claimed = receipt ? await claimExternalQualityJourneyAnalysisFollowup(claimInput, client) : null
    if (claimed) {
      const accepted = await observeFollowupAcceptance(request, claimed, keys, expected, client)
      if (accepted) return accepted
    }
    const current = await readCurrentFollowupReadiness(request, expected, client)
    if (current.reason)
      return current.reason === 'STALE_EXPECTED_WORK' ? recovery(current.reason) : waiting(current.reason)
    if (!claimed) {
      claimed = await claimExternalQualityJourneyAnalysisFollowup(claimInput, client)
      return {
        phase: 'CLAIMED' as const,
        expected,
        attemptId: claimed.attempt.id,
        assignmentId: claimed.assignment.assignmentId,
        runtimeQualified: false as const,
      }
    }
    return await advanceClaimedAnalysisFollowup(request, claimed, keys, expected, client, controller)
  } catch (error) {
    if (error instanceof ServiceError && ['UNAUTHORIZED', 'CONFLICT', 'NOT_FOUND'].includes(error.code))
      return recovery(error.code)
    throw error
  }
}
