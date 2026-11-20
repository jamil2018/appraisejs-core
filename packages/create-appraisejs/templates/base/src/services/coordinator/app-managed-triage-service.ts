import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import {
  runManagedAnalysis,
  classifyManagedAnalysisFailure,
} from '@/lib/quality-journey/codex-app-server/managed-analysis-sender'
import { ServiceError } from '@/services/shared/errors'
import { appManagedAnalysisCredential } from './app-managed-analysis-credential'
import { appManagedTriageOutputSchema } from './app-managed-triage-contract'
import { prepareAppManagedTriageTask } from './app-managed-triage-task'
import { assertCurrentCoordinatorSession, readScopedQualityJourney } from './quality-journey-coordinator-session'
import { readInternalWorkerAuthority } from './quality-journey-internal-worker-authority'
import { assertHistoricalHubQuiescent } from './quality-journey-provider-recovery'
import { prepareQualityJourneyTriage } from './quality-journey-triage-service'
import { previewAppManagedOperatorTriage } from './app-managed-operator-triage-preview'

import {
  composeOperatorReport,
  hasOperatorPreparation,
  reviewSealedRuns,
  type OperatorFinding,
} from './app-managed-operator-triage'

export function appManagedTriageEnabled() {
  return process.env.APPRAISE_LOCAL_CODEX_TRIAGE_ENABLED === 'true'
}
type Input = { journeyId: string; targetProjectId: string; expectedStateHash: string }
function conflict(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}

/** One explicit local request. Only canonical submission can accept and publish the report for human review. */
async function getTriageOwner(input: Input, client: PrismaClient = prisma) {
  const journey = await readScopedQualityJourney(input, client)
  if (
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.status !== 'ACTIVE' ||
    journey.stage !== 'TRIAGE' ||
    journey.stateHash !== input.expectedStateHash
  )
    conflict('The Journey changed or is not active in Triage. Reload before starting.')
  const principalId = `appraise-local:${input.targetProjectId}`
  const session = journey.currentCoordinatorSessionId
    ? await client.qualityJourneyCoordinatorSession.findUnique({ where: { id: journey.currentCoordinatorSessionId } })
    : null
  if (!session || session.ownerPrincipalId !== principalId || session.generation === null)
    conflict('Triage requires the current local coordinator. Use the ownership recovery controls.')
  const owner = {
    journeyId: input.journeyId,
    targetProjectId: input.targetProjectId,
    coordinatorPrincipalId: principalId,
    coordinatorSessionId: session.id,
    coordinatorGeneration: session.generation,
  }
  await assertCurrentCoordinatorSession(owner, client)
  const currentAssignment = await client.qualityJourneyTriageAssignment.findFirst({
    where: {
      journeyId: journey.id,
      workItem: {
        id: { in: JSON.parse(journey.activeWorkItemIdsJson) as string[] },
        targetProjectId: journey.targetProjectId,
        cycleId: journey.activeCycleId,
      },
    },
  })
  if (!currentAssignment) {
    const cycles = await client.qualityJourneyExecutionCycle.findMany({
      where: {
        journeyId: journey.id,
        targetProjectId: journey.targetProjectId,
        cycleId: journey.activeCycleId,
        status: { in: ['COMPLETED', 'CANCELLED'] },
      },
      select: { id: true },
      take: 2,
    })
    if (cycles.length !== 1) conflict('Triage requires one exact terminal execution cycle with sealed evidence.')
    await prepareQualityJourneyTriage(
      { executionCycleId: cycles[0]!.id, journeyId: journey.id, targetProjectId: journey.targetProjectId },
      client,
      owner,
    )
  }
  return { owner, principalId, cycleId: journey.activeCycleId }
}

async function triageTask(
  owner: Awaited<ReturnType<typeof getTriageOwner>>['owner'],
  client: PrismaClient,
  mode: 'operator' | 'native',
) {
  const principalId = owner.coordinatorPrincipalId
  return prepareAppManagedTriageTask(
    {
      ...owner,
      principal: { principalId, assurance: 'PROJECT_CREDENTIAL_ONLY' },
      assignmentSecret: await appManagedAnalysisCredential(owner, client),
    },
    client,
    mode,
  )
}

export async function getOperatorTriageAvailable(
  input: Pick<Input, 'journeyId' | 'targetProjectId'>,
  client: PrismaClient = prisma,
) {
  const journey = await readScopedQualityJourney(input, client)
  return (
    journey.stage === 'TRIAGE' &&
    journey.status === 'ACTIVE' &&
    journey.hostingMode === 'APP_SERVER_LOCAL_V1' &&
    hasOperatorPreparation({ ...input, cycleId: journey.activeCycleId }, client)
  )
}

export async function operatorTriage(
  input: Input,
  decision: { inputHash: string; findings: OperatorFinding[] } | null,
  client: PrismaClient = prisma,
) {
  const { owner } = await getTriageOwner(input, client)
  if (!decision) return previewAppManagedOperatorTriage(owner, client)
  const task = await triageTask(owner, client, 'operator')
  try {
    const runs = reviewSealedRuns(task.sealedInput, task.evidence)
    if (decision) {
      if (decision.inputHash !== task.sealedInput.inputHash)
        conflict('Run evidence changed. Review the current results.')
      const report = composeOperatorReport(task.sealedInput, runs, decision.findings)
      const accepted = await task.delivery.invoke({
        toolName: 'quality_journey_triage_submit',
        arguments: { idempotencyKey: task.submissionIdempotencyKey, report: { ...report, ...task.reportIdentity } },
        callId: task.submissionIdempotencyKey,
      })
      if (!accepted.receipt.accepted) conflict('The report was not accepted.')
    }
    const current = await readScopedQualityJourney(input, client)
    return { inputHash: task.sealedInput.inputHash, expectedStateHash: current.stateHash, runs }
  } finally {
    task.delivery.fence()
  }
}

export async function startAppManagedTriage(input: Input, client: PrismaClient = prisma) {
  if (!appManagedTriageEnabled()) conflict('Local Codex triage must be enabled by the Appraise server owner.')
  const { owner, cycleId } = await getTriageOwner(input, client)
  if (
    await hasOperatorPreparation(
      { journeyId: input.journeyId, targetProjectId: input.targetProjectId, cycleId },
      client,
    )
  )
    return { accepted: false, awaitingOperator: true }
  const task = await triageTask(owner, client, 'native')
  const marker = 'APP_SERVER_LOCAL_V1_TRIAGE'
  try {
    await client.$transaction(async tx => {
      const hub = await tx.qualityJourneyProviderSlot.upsert({
        where: { id: 'HUB' },
        create: { id: 'HUB' },
        update: { version: { increment: 1 } },
      })
      if (hub.intentId || hub.providerRunId) conflict('The local worker requires reconciliation before reuse.')
      await assertHistoricalHubQuiescent(tx)
      await readInternalWorkerAuthority(task.binding, tx)
      const reserved = await tx.qualityJourneyWorkAttempt.updateMany({
        where: {
          id: task.binding.attemptId,
          status: 'IN_PROGRESS',
          dispatchAdapterId: null,
          dispatchReservedAt: null,
          dispatchStartedAt: null,
        },
        data: {
          dispatchAdapterId: marker,
          dispatchReservedAt: new Date(),
          dispatchStartedAt: new Date(),
          failureJson: canonicalContractJson({ state: 'UNKNOWN', reason: 'LOCAL_CODEX_TRIAGE_CONSUMED' }),
        },
      })
      if (reserved.count !== 1) conflict('Triage was already dispatched and cannot be restarted.')
    })
  } catch (error) {
    task.delivery.fence()
    throw error
  }
  let stage = 'NATIVE_SEND'
  let candidate: ReturnType<typeof appManagedTriageOutputSchema.parse> | undefined
  try {
    const raw = await runManagedAnalysis(task.prompt)
    stage = 'OUTPUT_VALIDATION'
    if (Buffer.byteLength(raw, 'utf8') > 1_000_000) throw new Error('Triage output exceeds the local bound.')
    const call = appManagedTriageOutputSchema.parse(JSON.parse(raw))
    if (call.arguments.idempotencyKey !== task.submissionIdempotencyKey)
      throw new Error('Triage output changed its original submission identity.')
    candidate = call
    stage = 'CANONICAL_SUBMISSION'
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: task.binding.attemptId, dispatchAdapterId: marker },
      data: {
        failureJson: canonicalContractJson({
          state: 'UNKNOWN',
          stage,
          senderCleanupVerified: true,
          recoveryEligible: true,
          candidate,
          candidateHash: hashCanonical(candidate),
          submissionIdempotencyKey: task.submissionIdempotencyKey,
        }),
      },
    })
    const accepted = await task.delivery.invoke({
      ...call,
      arguments: { ...call.arguments, report: { ...call.arguments.report, ...task.reportIdentity } },
      callId: task.submissionIdempotencyKey,
    })
    if (!accepted.receipt.accepted) throw new Error('Triage has no canonical acceptance.')
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: task.binding.attemptId, dispatchAdapterId: marker },
      data: { dispatchReservedAt: null, dispatchStartedAt: null, failureJson: null },
    })
    return { accepted: true, reportRevisionId: task.reportIdentity.reportRevisionId }
  } catch (error) {
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: task.binding.attemptId, dispatchAdapterId: marker },
      data: {
        failureJson: canonicalContractJson({
          state: 'UNKNOWN',
          stage,
          reason: `${stage}_DID_NOT_COMPLETE`,
          senderCleanupVerified: stage !== 'NATIVE_SEND',
          recoveryEligible: Boolean(candidate),
          ...(candidate
            ? {
                candidate,
                candidateHash: hashCanonical(candidate),
                submissionIdempotencyKey: task.submissionIdempotencyKey,
              }
            : {}),
          rejection: canonicalTriageRejection(error),
          detail:
            stage === 'NATIVE_SEND'
              ? classifyManagedAnalysisFailure(error)
              : stage === 'OUTPUT_VALIDATION'
                ? 'Model output did not satisfy the exact report content contract.'
                : error instanceof ServiceError
                  ? `Canonical service ${error.code}.`
                  : 'Canonical submission did not complete.',
        }),
      },
    })
    throw new ServiceError(
      'Triage could not finish. Its dispatch is consumed and may be UNKNOWN. Reload to inspect accepted work and use recovery; do not restart it.',
      'CONFLICT',
    )
  } finally {
    task.delivery.fence()
  }
}

function canonicalTriageRejection(error: unknown) {
  let current = error
  for (let depth = 0; depth < 6 && current instanceof Error; depth++) {
    if (current instanceof ServiceError)
      return {
        kind: 'CANONICAL',
        code: current.code,
        message: current.message
          .replace(/[\r\n\x00-\x1f]/g, ' ')
          .replace(/https?:\/\/[^\s]+/g, '[url]')
          .slice(0, 1000),
      }
    current = current.cause
  }
  return { kind: 'UNCLASSIFIED' }
}
