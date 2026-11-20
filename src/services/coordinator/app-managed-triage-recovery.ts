import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'
import { appManagedTriageDefinitions, appManagedTriageOutputSchema } from './app-managed-triage-contract'
import { appManagedTriageAssignmentSchema } from './app-managed-triage-evidence'
import { appManagedAnalysisCredential } from './app-managed-analysis-credential'
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

const retained = z
  .object({
    senderCleanupVerified: z.literal(true),
    recoveryEligible: z.literal(true),
    candidate: appManagedTriageOutputSchema,
    candidateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    submissionIdempotencyKey: z.string().min(1),
    canonicalRecoveryUsed: z.boolean().optional(),
  })
  .passthrough()
type Scope = { journeyId: string; targetProjectId: string }
function deny(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}

/** Only a validated retained proposal is recoverable; a missing native output is never reconstructed. */
export async function getAppManagedTriageRecovery(input: Scope, client: PrismaClient = prisma) {
  const journey = await readScopedQualityJourney(input, client)
  if (
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.status !== 'ACTIVE' ||
    !['TRIAGE', 'REPORT_REVIEW'].includes(journey.stage)
  )
    return null
  const report =
    journey.stage === 'REPORT_REVIEW' && journey.activeTriageReportId
      ? await client.qualityJourneyTriageReport.findFirst({
          where: { id: journey.activeTriageReportId, journeyId: input.journeyId },
          select: { assignment: { select: { workItemId: true } } },
        })
      : null
  const workItemIds = [
    ...(JSON.parse(journey.activeWorkItemIdsJson) as string[]),
    ...(report ? [report.assignment.workItemId] : []),
  ]
  const attempt = await client.qualityJourneyWorkAttempt.findFirst({
    where: {
      dispatchAdapterId: 'APP_SERVER_LOCAL_V1_TRIAGE',
      failureJson: { not: null },
      workItemId: { in: workItemIds },
      workItem: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        cycleId: journey.activeCycleId,
        role: 'TRIAGER',
      },
    },
    include: { workItem: { select: { currentAttempt: true } } },
    orderBy: { startedAt: 'desc' },
  })
  if (!attempt?.failureJson || attempt.workItem.currentAttempt !== attempt.attempt) return null
  const state = retained.safeParse(JSON.parse(attempt.failureJson))
  if (
    !state.success ||
    state.data.canonicalRecoveryUsed ||
    hashCanonical(state.data.candidate) !== state.data.candidateHash ||
    state.data.candidate.arguments.idempotencyKey !== state.data.submissionIdempotencyKey
  )
    return null
  return { attemptId: attempt.id, candidateHash: state.data.candidateHash }
}

/** One canonical-only continuation of the exact retained report. It never calls a native sender. */
export async function recoverAppManagedTriage(
  input: Scope & { expectedStateHash: string; attemptId: string; candidateHash: string },
  client: PrismaClient = prisma,
) {
  const journey = await readScopedQualityJourney(input, client)
  if (journey.stateHash !== input.expectedStateHash) deny('The Journey changed. Reload before report recovery.')
  const recovery = await getAppManagedTriageRecovery(input, client)
  if (recovery?.attemptId !== input.attemptId || recovery.candidateHash !== input.candidateHash)
    deny('Report recovery does not bind an unused retained proposal.')
  const session = await client.qualityJourneyCoordinatorSession.findUnique({
    where: { id: journey.currentCoordinatorSessionId ?? '' },
  })
  const principalId = `appraise-local:${input.targetProjectId}`
  if (!session || session.ownerPrincipalId !== principalId || !session.generation)
    deny('Report recovery requires the current local coordinator.')
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
  if (!attempt.assignmentId) deny('The original Triager assignment is unavailable.')
  const binding: ExternalQualityJourneySubmissionBinding = {
    ...owner,
    role: 'TRIAGER',
    principal: { principalId, assurance: 'PROJECT_CREDENTIAL_ONLY' },
    assignmentSecret: await appManagedAnalysisCredential(owner, client),
    workItemId: attempt.workItemId,
    attemptId: attempt.id,
    assignmentId: attempt.assignmentId,
    assignmentGeneration: attempt.assignmentGeneration,
    leaseId: attempt.leaseId,
  }
  await assertCoordinatorAttemptSession(binding, client)
  const used = await client.qualityJourneyWorkAttempt.updateMany({
    where: { id: attempt.id, failureJson: attempt.failureJson },
    data: { failureJson: canonicalContractJson({ ...state, canonicalRecoveryUsed: true }) },
  })
  if (used.count !== 1) deny('Report recovery was already consumed.')
  let delivery: Awaited<ReturnType<typeof createManagedQualityJourneyRoleDelivery>> | undefined
  try {
    let committed = false
    try {
      await readExternalQualityJourneySubmissionOutcome(
        { ...binding, operation: 'TRIAGE_REPORT_SUBMIT', idempotencyKey: state.submissionIdempotencyKey },
        client,
      )
      committed = true
    } catch (error) {
      if (!(error instanceof ServiceError) || error.code !== 'NOT_FOUND') throw error
    }
    if (!committed) {
      delivery = await createManagedQualityJourneyRoleDelivery({
        binding,
        canonicalDefinitions: appManagedTriageDefinitions,
        client,
      })
      const read = await delivery.invoke({
        toolName: 'quality_journey_triage_get',
        arguments: {},
        callId: 'retained-triage-read',
      })
      const assignment = appManagedTriageAssignmentSchema.parse(read.result)
      const accepted = await delivery.invoke({
        ...state.candidate,
        arguments: {
          ...state.candidate.arguments,
          report: {
            ...state.candidate.arguments.report,
            schemaVersion: 'appraise.quality-journey/v1',
            reportRevisionId: assignment.reportRevisionId,
            executionCycleId: assignment.executionCycleId,
            cycleId: assignment.cycleId,
            ...(assignment.predecessorReport
              ? { predecessorReportRevisionId: assignment.predecessorReport.reportRevisionId }
              : {}),
          },
        },
        callId: state.submissionIdempotencyKey,
      })
      if (!accepted.receipt.accepted) deny('The retained report has no canonical acceptance.')
    }
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id, dispatchAdapterId: 'APP_SERVER_LOCAL_V1_TRIAGE' },
      data: {
        dispatchReservedAt: null,
        dispatchStartedAt: null,
        failureJson: canonicalContractJson({
          ...state,
          canonicalRecoveryUsed: true,
          canonicalRecoveryOutcome: 'ACCEPTED',
        }),
      },
    })
    return { accepted: true, nativeSend: false }
  } catch {
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id },
      data: {
        failureJson: canonicalContractJson({
          ...state,
          canonicalRecoveryUsed: true,
          canonicalRecoveryOutcome: 'REJECTED_OR_UNKNOWN',
        }),
      },
    })
    throw new ServiceError(
      'The retained report could not complete canonical recovery. Its original data is preserved; no new native send was performed.',
      'CONFLICT',
    )
  } finally {
    delivery?.fence()
  }
}
