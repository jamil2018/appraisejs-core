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
      return formatFixtureAnalysisRecovery(error, recovery)
    throw error
  }
}

function formatFixtureAnalysisRecovery(
  error: ServiceError,
  recovery: (reason: string) => ReturnType<typeof followupRecovery>,
) {
  const result = recovery(error.code)
  if (error.code === 'CONFLICT') return { ...result, fixtureConflictClass: fixtureAnalysisConflictClass(error) }
  return result
}

/** Fixed source-bound labels for the repository-only offline scheduler. */
const fixtureAnalysisConflictClasses: ReadonlyMap<string, string> = new Map<string, string>([
  [
    'A prior provider run may still have effects; replacement requires reconciliation.',
    'M06_CONFLICT_0F5E91D792BC5DF2',
  ],
  ['A required predecessor question cannot be silently withdrawn from a successor.', 'M06_CONFLICT_62C6BF407E014D3E'],
  ['A transfer requires a distinct successor.', 'M06_CONFLICT_0AFF662BA5AA0E10'],
  ['Ambiguous start cannot be replayed.', 'M06_CONFLICT_658C23EDA06E3391'],
  ['An analysis question already has an answer head; submit a correction instead.', 'M06_CONFLICT_B2BCE994DC2DF705'],
  ['Analysis answer is not for the current exact review revision.', 'M06_CONFLICT_C90F52B217BAE628'],
  ['Analysis answer is not for the current submitted successor.', 'M06_CONFLICT_A2FD0431EB2DDD36'],
  ['Analysis answer must bind the current accepted leaf in the active cycle.', 'M06_CONFLICT_CBEFE1FF09B44026'],
  [
    'Analysis answers are frozen while a requested successor Analyzer submission is pending.',
    'M06_CONFLICT_1CB77C4EC3949487',
  ],
  ['Analysis assignment lineage is invalid.', 'M06_CONFLICT_B11AF177BFE198FD'],
  ['Analysis can only be submitted during the analysis stage.', 'M06_CONFLICT_1CDEE588A33D6A85'],
  ['Analysis charter cycle is not the active journey cycle.', 'M06_CONFLICT_E497AF77EC386A0C'],
  ['Analysis charter does not bind the active requirement revision.', 'M06_CONFLICT_2436707E6ADF54EE'],
  ['Analysis charter identity does not match its assignment scope.', 'M06_CONFLICT_59B2DE89DEC5F147'],
  ['Analysis charter references an unknown requirement revision.', 'M06_CONFLICT_4C7EAACF48AE8CF9'],
  ['Analysis command must bind exactly the reviewed Analysis Charter revision.', 'M06_CONFLICT_D09C1394577B891F'],
  ['Analysis decision does not bind an exact immutable charter revision.', 'M06_CONFLICT_28215969667AF7EC'],
  ['Analysis decision does not bind the active analysis revision.', 'M06_CONFLICT_DAA08114E3A989F0'],
  ['Analysis decision replay conflicts with immutable approval identity.', 'M06_CONFLICT_E065BC79FAE560A1'],
  ['Analysis decision review identity is stale; refresh the current Q&A.', 'M06_CONFLICT_64501A640352F5B5'],
  ['Analysis delivery is cancelled.', 'M06_CONFLICT_5C5EAAADFE49730B'],
  ['Analysis delivery requires Analyzer work.', 'M06_CONFLICT_B822DAACA2F7472B'],
  ['Analysis follow-up advisory digest is invalid.', 'M06_CONFLICT_269CBA4DB3548E67'],
  ['Analysis follow-up answer hash is invalid.', 'M06_CONFLICT_98FD7FE9D67C9508'],
  ['Analysis follow-up answer heads are ambiguous.', 'M06_CONFLICT_A4150517A5709499'],
  ['Analysis follow-up artifact identity is invalid.', 'M06_CONFLICT_8DA0860512AA5155'],
  [
    'Analysis follow-up artifact references do not bind the exact predecessor and requirement.',
    'M06_CONFLICT_BAB0F4F105CDCB21',
  ],
  ['Analysis follow-up assignment does not authorize the exact envelope.', 'M06_CONFLICT_97558DB505639D0F'],
  ['Analysis follow-up authority has exhausted or inconsistent attempt counters.', 'M06_CONFLICT_53F5E0342AC1802F'],
  ['Analysis follow-up authority is missing.', 'M06_CONFLICT_DAB6D4B7628F1E2C'],
  ['Analysis follow-up authorization is stale.', 'M06_CONFLICT_E422F89976C50AB4'],
  ['Analysis follow-up authorization was not issued.', 'M06_CONFLICT_BB7A70DB70ABAA2F'],
  ['Analysis follow-up canonical inputs changed.', 'M06_CONFLICT_BA5805157079A04D'],
  ['Analysis follow-up delivery inputs changed.', 'M06_CONFLICT_83D84A3C04CE2236'],
  ['Analysis follow-up feedback differs from its committed command.', 'M06_CONFLICT_737F90FFB4211B15'],
  ['Analysis follow-up feedback has no exact committed command.', 'M06_CONFLICT_7AD13D8967082D31'],
  ['Analysis follow-up feedback identity is ambiguous.', 'M06_CONFLICT_4D5825ADB3F5EEE5'],
  ['Analysis follow-up has ambiguous accepted leaves.', 'M06_CONFLICT_D1E5E784D2899E76'],
  ['Analysis follow-up has ambiguous question identity.', 'M06_CONFLICT_FBED2DE14491F0D5'],
  ['Analysis follow-up issuance changed concurrently.', 'M06_CONFLICT_BF15F78B0AD2EFA8'],
  ['Analysis follow-up issuance content is invalid.', 'M06_CONFLICT_2A34DF0F10A5AFAC'],
  ['Analysis follow-up predecessor artifact is invalid.', 'M06_CONFLICT_4B0E825F11BAD6F4'],
  ['Analysis follow-up predecessor authorization is unavailable.', 'M06_CONFLICT_1ACB96092C3BE48D'],
  ['Analysis follow-up predecessor completion lineage is invalid.', 'M06_CONFLICT_822929FBAE87042C'],
  ['Analysis follow-up requirement identity is stale.', 'M06_CONFLICT_C8FB98A719C2C530'],
  ['Analysis follow-up state changed concurrently.', 'M06_CONFLICT_FCF3BEAF67359E72'],
  ['Analysis predecessor is outside the journey.', 'M06_CONFLICT_88CE7F415BC29005'],
  ['Analysis publication does not bind an exact immutable charter revision.', 'M06_CONFLICT_06BEAD7697345FCA'],
  ['Analysis publication replay conflicts with immutable publication identity.', 'M06_CONFLICT_8B2F9E7AF6F5A1BA'],
  ['Analysis publication review identity is stale; submit a successor revision.', 'M06_CONFLICT_4084CB15AABF5174'],
  ['Analysis questions may only be answered before or during review.', 'M06_CONFLICT_6D0A38890CB0977A'],
  ['Analysis requires one exact requirement reference.', 'M06_CONFLICT_C6A12FF440ECC140'],
  ['Analysis review identity is stale; refresh the current charter and Q&A.', 'M06_CONFLICT_0E1B5AE8C94206BB'],
  ['Analysis revision feedback artifact conflicts with immutable command identity.', 'M06_CONFLICT_7D232F8F9D1CE6A6'],
  ['Analysis revision has not been published for review.', 'M06_CONFLICT_0A793D33632124B9'],
  ['Analysis revision request does not bind an exact immutable charter revision.', 'M06_CONFLICT_58652DBFD4D09536'],
  ['Analysis revision request does not bind the active analysis revision.', 'M06_CONFLICT_E25AD1AFC83BC4C4'],
  ['Analysis revision request requires an exact published analysis revision.', 'M06_CONFLICT_A934B9B8C25278D5'],
  [
    'Analysis revision request review identity is stale; refresh the current charter and Q&A.',
    'M06_CONFLICT_9F843AE51FF1114D',
  ],
  ['Analysis revision work cannot be reissued without an active predecessor charter.', 'M06_CONFLICT_AD3B4C192FC8616E'],
  ['Analysis revision work cannot be reissued without durable predecessor lineage.', 'M06_CONFLICT_B2AC9DDB1C964990'],
  ['Analysis revision work cannot be reissued without durable user feedback.', 'M06_CONFLICT_51B1F3C89277FE8E'],
  ['Analysis revision work has no predecessor Factory authorization to supersede.', 'M06_CONFLICT_D810047C0C5D2234'],
  ['Analysis submission idempotency key was reused with different input.', 'M06_CONFLICT_8A12FD3E942E82C2'],
  ['Analysis submission identity is required.', 'M06_CONFLICT_FD4ABC7DD900CB65'],
  ['Analysis submission input hash is stale.', 'M06_CONFLICT_E9FDC15E74A732FC'],
  ['Analysis submission work attempt is stale.', 'M06_CONFLICT_E8342DEE9F264414'],
  ['Analysis successor does not bind the current reviewed analysis revision.', 'M06_CONFLICT_1A7B494ADDA44012'],
  [
    'Analysis successor must reference the current answer head for every resolved question.',
    'M06_CONFLICT_4630332458F3C01C',
  ],
  ['Analysis successor references answers outside its immediate predecessor.', 'M06_CONFLICT_005E3ABB9FD7550C'],
  ['Analysis successor violates stable requirement ID lineage.', 'M06_CONFLICT_020F199EB6B78754'],
  ['Answer correction must extend the current answer head for the exact question.', 'M06_CONFLICT_F2087654F60B68D1'],
  ['Answer idempotency key was reused with different input.', 'M06_CONFLICT_B8EF06CC4992A0CE'],
  ['Approved analysis artifact is missing.', 'M06_CONFLICT_196C5CBEB10EBAA1'],
  ['Approved analysis cannot be changed; submit a successor revision.', 'M06_CONFLICT_96F2CB0A4C165F49'],
  ['Approved analysis has no requirements to discover.', 'M06_CONFLICT_2CBDDE98DA36DE2A'],
  ['Authenticated Discovery must complete the one-shot human return before capture.', 'M06_CONFLICT_C66DF2A60AC22966'],
  [
    'Authenticated Discovery must return through the authorized flow to the frozen target route.',
    'M06_CONFLICT_28EAE184B203B639',
  ],
  ['Authenticated Scout evidence receipt has stale transit-policy provenance.', 'M06_CONFLICT_2BE4E9547C959165'],
  [
    'Authenticated Scout evidence receipt lacks valid one-shot human-return provenance.',
    'M06_CONFLICT_38C4E21540984EAC',
  ],
  ['Closed Quality Journeys are immutable. Start a linked follow-up journey.', 'M06_CONFLICT_7F897BF19D1BA0D2'],
  ['Closure receipt integrity mismatch.', 'M06_CONFLICT_7ADFC1032F55228D'],
  ['Completed Analysis work has no matching accepted attempt; recovery is required.', 'M06_CONFLICT_FA120A786F681233'],
  ['Completed Quality Journey work cannot be cancelled.', 'M06_CONFLICT_43E5E673F60CBEE3'],
  ['Conflicting provider evidence requires reconciliation before hub reuse.', 'M06_CONFLICT_FA83B4F8A92CC356'],
  ['Consumed provider sender requires qualified transport reconciliation.', 'M06_CONFLICT_F72D462E46F92864'],
  ['Coordinator activation identity conflicts with a recorded transition.', 'M06_CONFLICT_AB75CAA52EC0A663'],
  ['Coordinator approval snapshot changed; obtain a fresh explicit decision.', 'M06_CONFLICT_03C30A3105F9604D'],
  ['Coordinator ownership changed concurrently.', 'M06_CONFLICT_E3DF0E43947DFDB6'],
  [
    'Coordinator ownership contention requires rereading the exact request outcome before any retry.',
    'M06_CONFLICT_BC73FCECC7869085',
  ],
  ['Coordinator predecessor changed concurrently.', 'M06_CONFLICT_73C838B42FA410CC'],
  ['Coordinator registration key was reused with different input.', 'M06_CONFLICT_590A540783320348'],
  ['Coordinator registration requires explicit managed hosting.', 'M06_CONFLICT_887A19A5D4D30DB8'],
  ['Coordinator successor is not a fresh registered session.', 'M06_CONFLICT_9E923BDC26B25D3B'],
  ['Coordinator takeover cannot reissue work without current Factory authorization.', 'M06_CONFLICT_C6C6AB6E9329BC71'],
  ['Coordinator takeover work authorization changed concurrently.', 'M06_CONFLICT_5092EF6BA740E00F'],
  ['Coordinator transfer requires reconciled browser cleanup.', 'M06_CONFLICT_983EA87ED0FFDE8B'],
  ['Coordinator transfer requires reconciled execution effects.', 'M06_CONFLICT_18C5A1AB11B600F4'],
  [
    'Coordinator transfer requires reconciled quiescence; active or unknown work remains.',
    'M06_CONFLICT_B57E127DCD708BFC',
  ],
  ['Cross-target resource provenance does not match frozen ownership.', 'M06_CONFLICT_0AD47E2944910792'],
  ['Discovery analysis authority is unavailable.', 'M06_CONFLICT_1B370535B3B6B4C2'],
  ['Discovery analysis lineage is stale.', 'M06_CONFLICT_22F7E952BAEEF1BB'],
  ['Discovery browser Journey is no longer active.', 'M06_CONFLICT_7D81355446DEE184'],
  ['Discovery browser access confirmation could not resolve its blocker.', 'M06_CONFLICT_FBA0CB72C9475F4A'],
  ['Discovery browser authority changed while the operation was in flight.', 'M06_CONFLICT_CF12790E3C6CD301'],
  ['Discovery browser capture is outside the permitted target.', 'M06_CONFLICT_213C6109FD7ED9A2'],
  ['Discovery browser closed while the session was starting.', 'M06_CONFLICT_D7F1724862B9008D'],
  ['Discovery browser environment scope is stale; revalidate before capture.', 'M06_CONFLICT_26FC1C47DB2AE877'],
  [
    'Discovery browser environment scope is stale; revalidate before using this revision.',
    'M06_CONFLICT_8B9D8CA9C4A23BB0',
  ],
  ['Discovery browser exact return did not commit.', 'M06_CONFLICT_4476039F9472DA55'],
  ['Discovery browser exact return is already in progress.', 'M06_CONFLICT_21AAABE0B69C5B7C'],
  ['Discovery browser exact return is no longer available.', 'M06_CONFLICT_4B1A66DE9BBB9296'],
  ['Discovery browser exact return navigation failed.', 'M06_CONFLICT_34095F3407BDED27'],
  ['Discovery browser is unavailable.', 'M06_CONFLICT_17AC9AD4B5BB8F9F'],
  ['Discovery browser launch authority was revoked.', 'M06_CONFLICT_32ED7EBA8A195999'],
  ['Discovery browser lifecycle operation is already in progress.', 'M06_CONFLICT_5CA328CCE3D3B30A'],
  ['Discovery browser lifecycle operation is no longer current.', 'M06_CONFLICT_3693FC5626A00EB7'],
  [
    'Discovery browser navigation is still in flight; retry from a fresh scoped session.',
    'M06_CONFLICT_EC0651D8CFC8805B',
  ],
  ['Discovery browser navigation was rejected.', 'M06_CONFLICT_644FE6D82D3EBF99'],
  ['Discovery browser navigation was unavailable.', 'M06_CONFLICT_F34ECC922EFE78C2'],
  ['Discovery browser ownership changed during cleanup.', 'M06_CONFLICT_F4A2DCBB77CA1685'],
  ['Discovery browser ownership scope changed.', 'M06_CONFLICT_92F31EF5D1445DAD'],
  ['Discovery browser receipt identity conflicts.', 'M06_CONFLICT_8FC6D1A022F59940'],
  ['Discovery browser runtime cleanup is unconfirmed.', 'M06_CONFLICT_949A10B4A592AA81'],
  ['Discovery browser scope exceeds the frozen Scout authorization.', 'M06_CONFLICT_A2A4973A58935986'],
  ['Discovery browser scope is no longer current.', 'M06_CONFLICT_AB818E60A41AEE1F'],
  ['Discovery browser session is not available for this operation.', 'M06_CONFLICT_E29C341BB150C3FE'],
  ['Discovery browser session is not ready.', 'M06_CONFLICT_8E51E4ECF0D795DD'],
  ['Discovery bundle analysis provenance is stale.', 'M06_CONFLICT_33473BF64FEE43CB'],
  ['Discovery bundle does not bind the frozen revision authority.', 'M06_CONFLICT_2B2257F1D558BE77'],
  ['Discovery bundle input artifacts do not match frozen lineage.', 'M06_CONFLICT_5F62621C7C7B3BE5'],
  [
    'Discovery cannot be issued until environment, locator-group, and resource inventory authority is available.',
    'M06_CONFLICT_A523084F83FEAA72',
  ],
  ['Discovery idempotency key was reused with different input.', 'M06_CONFLICT_494897BC13342C69'],
  ['Discovery is not active for this journey.', 'M06_CONFLICT_791F3670C9732383'],
  ['Discovery registry authority is stale; revalidate before using this revision.', 'M06_CONFLICT_7C2C32A55A5078BC'],
  ['Discovery requires an exact approved analysis decision.', 'M06_CONFLICT_B501800F4FB864EB'],
  ['Discovery requires the active approved analysis revision.', 'M06_CONFLICT_FF995DAD42F5926D'],
  ['Discovery retry already has a competing successor.', 'M06_CONFLICT_E8EC4E4C74529D04'],
  ['Discovery retry does not bind the active discovery revision.', 'M06_CONFLICT_B05730739148A2F1'],
  ['Discovery retry requires a terminal or invalidated predecessor.', 'M06_CONFLICT_9E4CBC358964DDEE'],
  ['Discovery revalidation does not bind the active discovery revision.', 'M06_CONFLICT_BBAAE293B14D73F9'],
  ['Discovery revision cannot accept additional output.', 'M06_CONFLICT_64F0994DBA3B42D6'],
  ['Discovery route is outside the frozen target scope.', 'M06_CONFLICT_09375852896743C7'],
  ['Discovery target is invalid.', 'M06_CONFLICT_20468B3185D88501'],
  ['Durable Discovery browser ownership is unconfirmed.', 'M06_CONFLICT_907AB046AF31860D'],
  ['Environment discovery sign-in transit policy is not canonical.', 'M06_CONFLICT_98D44EAD6868593C'],
  ['Exact Analysis input artifact is missing or ambiguous.', 'M06_CONFLICT_9BDAC19EEF08B6E4'],
  ['Exact Analysis input projection changed.', 'M06_CONFLICT_CB72FE39486735F3'],
  ['Exact consumed provider sender and original transport are required.', 'M06_CONFLICT_55A24E1EBAFF7024'],
  ['Exact original provider sender exclusion and physical evidence are required.', 'M06_CONFLICT_14ADF5D34CF18F74'],
  ['Exact original provider sender exclusion is required.', 'M06_CONFLICT_A0ED8A2C8C20DE7F'],
  ['Exact original provider sender must be disabled before release.', 'M06_CONFLICT_1EBFB2C9B9AC5D4B'],
  ['Exact requirement descriptor changed.', 'M06_CONFLICT_76F633EA7B05946D'],
  ['Expected Analysis follow-up work identity is stale.', 'M06_CONFLICT_69725F5B92D7C8F4'],
  ['External Analysis submission generation is stale.', 'M06_CONFLICT_44084EA2A7C064AC'],
  ['External Analyzer admission changed concurrently.', 'M06_CONFLICT_CE57FFDB89D8A34C'],
  ['External Analyzer admission generation is stale.', 'M06_CONFLICT_674578C6C2A33D2D'],
  ['External Analyzer admission idempotency key was reused with different input.', 'M06_CONFLICT_4D1E4F6540F92F9B'],
  ['External Analyzer admission is stale.', 'M06_CONFLICT_69D0497E6D74DDFD'],
  ['External Analyzer authorization changed concurrently.', 'M06_CONFLICT_2066938AE6F25E7E'],
  ['External submission idempotency key was reused with different input.', 'M06_CONFLICT_78C23F27D9FD48B2'],
  ['External work admission role does not match its assignment.', 'M06_CONFLICT_407446216BB44205'],
  ['External work claim idempotency key was reused with different input.', 'M06_CONFLICT_212AA1389A12228C'],
  ['External work submission assignment generation is stale.', 'M06_CONFLICT_49EF4B778C162551'],
  ['External work submission attempt is stale.', 'M06_CONFLICT_5CCF85A464E88677'],
  ['External work submission lease has expired.', 'M06_CONFLICT_E83CD9623CFB23C3'],
  ['Follow-up requires a closed journey in the same target.', 'M06_CONFLICT_40964602CC0D1A83'],
  ['Historical provider dispatch requires reconciliation before hub reuse.', 'M06_CONFLICT_373081AFDF3330EE'],
  ['Hub provider slot is occupied or uncertain.', 'M06_CONFLICT_385A6D1B9224BE69'],
  ['Human confirmation is required before authenticated discovery capture.', 'M06_CONFLICT_AAF90EBAB588F3BF'],
  [
    'Human return may be armed only from a committed origin with an exact selected-flow GET return rule.',
    'M06_CONFLICT_DCF8447B8FAF861B',
  ],
  ['Inactive Analysis cannot accept new answers.', 'M06_CONFLICT_CFD6D63D884052F8'],
  ['Initial activation cannot adopt prior work; explicit recovery is required.', 'M06_CONFLICT_6789797B83B41AB4'],
  [
    'Initial activation cannot replace prior ownership; explicit transfer is required.',
    'M06_CONFLICT_21715A5372E52844',
  ],
  ['Legacy provider observation timestamp is invalid.', 'M06_CONFLICT_7C59A87E82769737'],
  ['Legacy provider reconciliation does not match the original validated receipt.', 'M06_CONFLICT_FB65ACAC49952963'],
  ['Legacy stored provider receipt differs from its validated original candidate.', 'M06_CONFLICT_31593778CA6507D8'],
  ['Malformed provider handle.', 'M06_CONFLICT_5F2F9F9789354E23'],
  ['Malformed provider reply.', 'M06_CONFLICT_48F2599FEB1AE1BC'],
  ['Managed Analysis follow-up assignment requires recovery.', 'M06_CONFLICT_B4971B9FDD4930AD'],
  ['Managed Analysis follow-up canonical input identity is stale or invalid.', 'M06_CONFLICT_1B82E035DDC4EC8E'],
  ['Managed Analysis follow-up issuance requires recovery.', 'M06_CONFLICT_6A19FD6B7412F2FB'],
  ['Managed Analysis follow-up issuance scope is invalid.', 'M06_CONFLICT_BDE1D40A71DC6F5A'],
  [
    'Managed app-server dispatch is unavailable; production provider execution requires separately approved and qualified supervision.',
    'M06_CONFLICT_B95F248DF59110AD',
  ],
  ['Managed ownership cannot adopt compatibility or unresolved hosting.', 'M06_CONFLICT_6D9B2826AEDAD5FD'],
  ['No Discovery sign-in flow is authorized.', 'M06_CONFLICT_44750303857E7A45'],
  [
    'No committed provider reconciliation receipt exists; live proof cannot be reconstructed.',
    'M06_CONFLICT_52709B0332AFAE38',
  ],
  ['No correlated Analysis candidate is available.', 'M06_CONFLICT_1E72DF494B3CF662'],
  ['No eligible Quality Journey work item is available.', 'M06_CONFLICT_DB46E00F7F469B3D'],
  ['No eligible external Quality Journey work item is available.', 'M06_CONFLICT_4C71F7DDC7025B2D'],
  ['No exact committed legacy provider reconciliation exists.', 'M06_CONFLICT_598337E97F135308'],
  ['No exact committed provider reconciliation exists in the clean replay resolver.', 'M06_CONFLICT_E51B1DAE0878D469'],
  ['Only explicitly promoted global-library resources can be imported.', 'M06_CONFLICT_6ED2EEB150CC2766'],
  [
    'Only the current completed Analysis leaf may be published; successor work is pending or the revision is stale.',
    'M06_CONFLICT_FC28DF4E5661D945',
  ],
  ['Original provider sender is unavailable or disabled.', 'M06_CONFLICT_6BAAF93DE5055C8B'],
  ['Original provider sender is unavailable.', 'M06_CONFLICT_05CFED30F6E1F3D4'],
  ['Original provider transport is already bound or consumed.', 'M06_CONFLICT_192C7CED4AEF724B'],
  ['Original provider transport is not bound.', 'M06_CONFLICT_CC9267EA5861BBDB'],
  ['Original source custody is required.', 'M06_CONFLICT_B6E6051A37EAE3F3'],
  ['Original source discard reservation is no longer current.', 'M06_CONFLICT_C76FB1E9620E99A5'],
  ['Original source outcome custody is no longer current.', 'M06_CONFLICT_4345D239363F0214'],
  ['Owned Discovery browser runtime cleanup is unconfirmed.', 'M06_CONFLICT_7EAC613A77343A27'],
  ['Owned sender is fenced.', 'M06_CONFLICT_3B1BF7F2D87AF5A9'],
  ['Pending Analysis follow-up input changed.', 'M06_CONFLICT_160430E07DFF78C9'],
  ['Prior Discovery browser ownership is unresolved.', 'M06_CONFLICT_1C14A7F54B6E9899'],
  ['Prior Discovery browser runtime cleanup is unconfirmed.', 'M06_CONFLICT_08008AC7B30DF6FD'],
  ['Production app-server dispatch remains blocked.', 'M06_CONFLICT_4AA1AE5F59A28D87'],
  ['Provider attempt budget is exhausted.', 'M06_CONFLICT_A4989720DC7FD214'],
  ['Provider claim lease or epoch is stale.', 'M06_CONFLICT_1877055178F73715'],
  ['Provider hub requires physical reconciliation before Analysis claim.', 'M06_CONFLICT_9BE337CA7429091D'],
  ['Provider hub slot no longer binds exact reconciliation identity.', 'M06_CONFLICT_DC2368E05C9B8243'],
  ['Provider immutable correlation is stale.', 'M06_CONFLICT_5C49823BD5C82704'],
  ['Provider intent claim changed concurrently.', 'M06_CONFLICT_D607C186C0A9C230'],
  ['Provider intent has no original send boundary.', 'M06_CONFLICT_568E8173BBDE39D7'],
  ['Provider intent is not claimable.', 'M06_CONFLICT_940101099A98C97B'],
  [
    'Provider intent or physical effects require reconciliation before transfer or resume.',
    'M06_CONFLICT_EAF667E690FFE5E0',
  ],
  ['Provider native correlation conflicts; the run remains fenced.', 'M06_CONFLICT_23AB6D7979F4C387'],
  ['Provider observation does not bind its durable send boundary.', 'M06_CONFLICT_4E414CAEF8ED811E'],
  ['Provider preparation identity was reused with different input.', 'M06_CONFLICT_AFDB89C94323F76B'],
  ['Provider reconciliation conflicts with retained evidence.', 'M06_CONFLICT_9E17FFDE8813F5D8'],
  [
    'Provider reconciliation conflicts with retained physical evidence; hub remains quarantined.',
    'M06_CONFLICT_145AC9001FEB2777',
  ],
  ['Provider reconciliation does not bind exact send identity.', 'M06_CONFLICT_CF815701D9C95C7C'],
  ['Provider reconciliation durable receipt digest is invalid.', 'M06_CONFLICT_BC94C6674407BF0E'],
  ['Provider reconciliation has no committed exact release receipt.', 'M06_CONFLICT_FE413469B2EFAB7E'],
  ['Provider reconciliation key was reused with different evidence.', 'M06_CONFLICT_7E0786992B4AD7BA'],
  ['Provider reconciliation observation does not match its exact receipt.', 'M06_CONFLICT_1FE439CAD9AABC16'],
  ['Provider reconciliation replay hash does not match exact evidence.', 'M06_CONFLICT_7262ACA9F940EE38'],
  ['Provider reconciliation requires exact qualified two-part evidence.', 'M06_CONFLICT_0504AC267B941DF2'],
  ['Provider reconciliation transaction callback may only enter once.', 'M06_CONFLICT_5FC6BCAB0C62BD6F'],
  ['Provider run requires explicit recovery.', 'M06_CONFLICT_A558804DC4FDBE88'],
  ['Provider send boundary already has an original sender.', 'M06_CONFLICT_3BC64E9561937F59'],
  ['Provider send boundary changed concurrently.', 'M06_CONFLICT_146A40612C02FC52'],
  ['Provider send permit is no longer current.', 'M06_CONFLICT_E10793C68811FB06'],
  ['Provider send permit is unavailable or already consumed.', 'M06_CONFLICT_81785798568823AB'],
  ['Provider transport is fenced or expired.', 'M06_CONFLICT_B9FABC3003759020'],
  ['Provider turn budget is exhausted or fenced.', 'M06_CONFLICT_80F90E53A59FE4AE'],
  ['Provider work is not currently eligible.', 'M06_CONFLICT_E65CD871437AC3E5'],
  ['Published analysis command has no immutable publication record.', 'M06_CONFLICT_1427DDCE75F2031D'],
  ['Quality Journey artifact identity already has different immutable content.', 'M06_CONFLICT_59A28983C398CF60'],
  ['Quality Journey attempt assignment lineage changed.', 'M06_CONFLICT_DE85550527695B2B'],
  ['Quality Journey capability profile is unavailable.', 'M06_CONFLICT_ACC127E608466639'],
  ['Quality Journey changed during work completion.', 'M06_CONFLICT_B0037024AE488A09'],
  ['Quality Journey changed while reconciling analysis questions.', 'M06_CONFLICT_37EE2214B274BE7F'],
  ['Quality Journey discovery bootstrap is unavailable.', 'M06_CONFLICT_F248126F83E0084B'],
  ['Quality Journey durable artifact JSON is corrupt.', 'M06_CONFLICT_9C919CDB1EC11713'],
  ['Quality Journey idempotency key was reused with different input.', 'M06_CONFLICT_5D22D968DF86B190'],
  ['Quality Journey immutable artifact identity conflicts with different payload.', 'M06_CONFLICT_99340A99EE0E731B'],
  ['Quality Journey is paused. Reconcile owned work before resuming.', 'M06_CONFLICT_6D9F681759D4CD3C'],
  ['Quality Journey ownership changed concurrently.', 'M06_CONFLICT_1038318387D0A963'],
  ['Quality Journey ownership requires explicit recovery.', 'M06_CONFLICT_7FFAAFDB9916F598'],
  ['Quality Journey role authority is unavailable.', 'M06_CONFLICT_008A2B023C0CCB9C'],
  ['Quality Journey sealed evidence JSON is corrupt.', 'M06_CONFLICT_EEB714AFCCBD57D0'],
  ['Quality Journey wake cause was reused with different input.', 'M06_CONFLICT_5D3D13150E72FFD1'],
  ['Quality Journey wake claim is stale or unavailable.', 'M06_CONFLICT_69662CE8F416D49F'],
  ['Quality Journey work authorization has been cancelled.', 'M06_CONFLICT_0908B7C19B21F5C8'],
  ['Quality Journey work cancellation changed concurrently.', 'M06_CONFLICT_A640A8C0CA071A62'],
  ['Quality Journey work completion is stale.', 'M06_CONFLICT_94321B354C288EB0'],
  ['Quality Journey work completion was replayed with a different result.', 'M06_CONFLICT_800CBD741949872F'],
  ['Quality Journey work has been cancelled.', 'M06_CONFLICT_5AB642A193CB6EA1'],
  ['Quality Journey work has exhausted its maximum attempt budget.', 'M06_CONFLICT_D6A9AD2007842922'],
  ['Quality Journey work item was claimed concurrently.', 'M06_CONFLICT_8CF10F14BD6E098D'],
  ['Quality Journey work lease expired.', 'M06_CONFLICT_EC65CB4543633914'],
  ['Quality Journey work revocation changed concurrently.', 'M06_CONFLICT_4A889502525787C4'],
  ['Quality Journey worker dispatch is stale.', 'M06_CONFLICT_8E74A47FA81DA043'],
  ['Quality Journey worker receipt changed concurrently.', 'M06_CONFLICT_3A00B91861D1D741'],
  ['Quality Journey worker receipt is stale.', 'M06_CONFLICT_55411C01BF19ED91'],
  ['Quality Journey worker receipt was replayed with different input.', 'M06_CONFLICT_5C49F19C11D76858'],
  ['Report finding identity is corrupt.', 'M06_CONFLICT_6F85BC1AB757EB77'],
  ['Report findings are corrupt.', 'M06_CONFLICT_F2F6514A46E3FCAB'],
  ['Required analysis questions remain unresolved.', 'M06_CONFLICT_92176F56C02C7D7D'],
  ['Requirement Analyzer work requires an immutable requirement revision.', 'M06_CONFLICT_28809EAF8FEEA2DA'],
  ['Requirement intake references an environment outside the Journey target.', 'M06_CONFLICT_6B4AEDA366C0B85C'],
  ['Resource Explorer assignment scope hash is stale.', 'M06_CONFLICT_6569AF7A4A793F95'],
  ['Resource output is already immutable for this revision.', 'M06_CONFLICT_A364F0728DF5148C'],
  ['Resource output raced with another submission.', 'M06_CONFLICT_1615A0EFCE2378FE'],
  ['Resource resolution destination module is outside the frozen target inventory.', 'M06_CONFLICT_DB206BD03366AFE6'],
  ['Resource resolution destination module must be approved as compatible.', 'M06_CONFLICT_D824237AFB176EFE'],
  ['Resource resolution exceeds the frozen inventory.', 'M06_CONFLICT_8A8FA3322202AA3F'],
  ['Resource submission envelope does not match its strict bundle.', 'M06_CONFLICT_FDB014C79CA8DC20'],
  ['Scenario revision feedback requires the exact reviewed portfolio.', 'M06_CONFLICT_4B0DEC35A527DEDD'],
  [
    'Scenario revision work cannot be reissued without an active predecessor portfolio.',
    'M06_CONFLICT_BC704407AA8A744E',
  ],
  ['Scenario revision work cannot be reissued without durable predecessor lineage.', 'M06_CONFLICT_562D0F5A3F144ACC'],
  ['Scenario revision work cannot be reissued without durable user feedback.', 'M06_CONFLICT_FD8791B5CE060A95'],
  [
    'Scenario revision work cannot be reissued without exact completed discovery authority.',
    'M06_CONFLICT_8AB05158F44B3D2F',
  ],
  ['Scenario revision work has no predecessor Factory authorization to supersede.', 'M06_CONFLICT_8220FE97259ABD2B'],
  ['Scout assignment scope hash is stale.', 'M06_CONFLICT_0697FE0F0F2ECB75'],
  ['Scout evidence must contain only referenced Appraise browser receipts.', 'M06_CONFLICT_7ACA2B36704FB43F'],
  ['Scout evidence receipt does not bind the observation snapshot and scope.', 'M06_CONFLICT_FA3848C7C40C107B'],
  ['Scout evidence receipt has invalid Appraise browser provenance.', 'M06_CONFLICT_4C6E56770C6FA61A'],
  ['Scout evidence receipt has invalid frozen discovery scope.', 'M06_CONFLICT_3BDC0E02C9343A16'],
  ['Scout evidence receipt has stale environment or target provenance.', 'M06_CONFLICT_CCCEEDB81F62BFFE'],
  ['Scout evidence receipt hash does not match the immutable artifact.', 'M06_CONFLICT_ED1F785E31F78D9E'],
  ['Scout evidence receipt is not an Appraise browser receipt.', 'M06_CONFLICT_06AD96D78C854AA9'],
  ['Scout evidence receipt is outside the exact discovery browser scope.', 'M06_CONFLICT_52F929583FC0A046'],
  ['Scout observations exceed the frozen target scope.', 'M06_CONFLICT_A468958A79D8841C'],
  ['Scout output is already immutable for this revision.', 'M06_CONFLICT_0497B19BE2C0AD75'],
  ['Scout output raced with another submission.', 'M06_CONFLICT_69290E76523D3360'],
  ['Scout submission envelope does not match its strict bundle.', 'M06_CONFLICT_EE70A67C90E54D10'],
  ['Specialized work issuance has no authorization to supersede.', 'M06_CONFLICT_C1BB20F00C8A171C'],
  ['Terminal diagnostic is available only after a session becomes inactive.', 'M06_CONFLICT_017FB8420EB50308'],
  ['The draft is unavailable for advisory reuse binding.', 'M06_CONFLICT_3CD1A4BBDFE5FBAE'],
  ['The human return grant was already used or armed.', 'M06_CONFLICT_22029A5EB20BC977'],
  ['The initial Analyzer authorization is unavailable.', 'M06_CONFLICT_9D0553E936CDB2FD'],
  ['The initial Analyzer work item is unavailable for advisory reuse binding.', 'M06_CONFLICT_E78906BF2B6DD535'],
  ['The selected Discovery sign-in flow is not authorized.', 'M06_CONFLICT_0497C7F5F7101324'],
  ['Worker result does not match the claimed Quality Journey work item.', 'M06_CONFLICT_0D9CEFDC172BEEC8'],
])

const fixtureAnalysisTraceabilityFields = [
  'objective',
  'context',
  'coverageRigor',
  'testDimensions',
  'includedScope',
  'excludedScope',
  'environmentIds',
  'actors',
  'testDataNeeds',
  'constraints',
  'risks',
  'desiredEvidenceSignals',
]

/** Returns fixed labels without exposing error text or invoking message getters. */
function fixtureAnalysisConflictClass(error: ServiceError): string {
  const descriptor = Object.getOwnPropertyDescriptor(error, 'message')
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || typeof descriptor.value !== 'string')
    return 'M06_CONFLICT_UNCLASSIFIED'
  const message = descriptor.value
  const literalClass = fixtureAnalysisConflictClasses.get(message)
  if (literalClass !== undefined) return literalClass
  if (matchesFixtureAnalysisTraceability(message)) return 'M06_CONFLICT_TRACEABILITY_FIELDS'
  return fixtureAnalysisConflictTemplateClass(message)
}

/** The source template permits only ordered unique subsets of its fixed intake fields. */
function matchesFixtureAnalysisTraceability(message: string): boolean {
  if (
    !message.startsWith('Analysis charter does not trace supplied intake fields: ') ||
    !message.endsWith('.') ||
    message.length > 219
  )
    return false
  const missing = message.slice(56, -1).split(', ')
  let previous = -1
  return (
    missing.length <= fixtureAnalysisTraceabilityFields.length &&
    missing.every(field => {
      const index = fixtureAnalysisTraceabilityFields.indexOf(field)
      if (index <= previous) return false
      previous = index
      return true
    })
  )
}

/** Arbitrary producer text is classified only by invariant template boundaries. */
function fixtureAnalysisConflictTemplateClass(message: string): string {
  const specializedIdentity = message.endsWith(' work item identity conflicts with frozen authority.')
  const workerDispatchBlocked = message.startsWith('Quality Journey worker dispatch was blocked: ')
  const workerResultInvalid = message.startsWith('Quality Journey worker result is invalid: ')
  if (specializedIdentity && (workerDispatchBlocked || workerResultInvalid))
    return 'M06_CONFLICT_AMBIGUOUS_SPECIALIZED_WORKER'
  if (specializedIdentity) return 'M06_CONFLICT_SPECIALIZED_IDENTITY'
  if (workerDispatchBlocked) return 'M06_CONFLICT_WORKER_DISPATCH_BLOCKED'
  if (workerResultInvalid) return 'M06_CONFLICT_WORKER_RESULT_INVALID'
  return 'M06_CONFLICT_UNCLASSIFIED'
}
