import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  classifyManagedAnalysisFailure,
  runManagedAnalysis,
  verifyManagedAnalysisExecutable,
} from '@/lib/quality-journey/codex-app-server/managed-analysis-sender'
import { ServiceError } from '@/services/shared/errors'
import { managedDiscoveryRoleSchema } from './app-managed-discovery-contract'
import {
  projectAppManagedDiscoverySelection,
  managedDiscoveryNativeOutputSchema,
} from './app-managed-discovery-projection'
import { prepareAppManagedDiscoveryTask } from './app-managed-discovery-task'
import { readScopedQualityJourney } from './quality-journey-coordinator-session'
import { readInternalWorkerAuthority } from './quality-journey-internal-worker-authority'
import { assertHistoricalHubQuiescent } from './quality-journey-provider-recovery'

export function appManagedDiscoveryEnabled() {
  return process.env.APPRAISE_LOCAL_CODEX_DISCOVERY_ENABLED === 'true'
}

function sanitizedDiscoveryRefusal(error: unknown): string {
  let current = error
  for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
    if (current.message.includes('Resource resolution exceeds the frozen inventory'))
      return 'RESOURCE_OUTSIDE_FROZEN_INVENTORY'
    if (current.message.includes('destination module must be approved as compatible'))
      return 'DESTINATION_MODULE_NOT_CLASSIFIED_COMPATIBLE'
    if (current.message.includes('destination module is outside the frozen target inventory'))
      return 'DESTINATION_OUTSIDE_FROZEN_TARGET'
    if (current instanceof ServiceError) return `CANONICAL_${current.code}`
    current = current.cause
  }
  return 'UNCLASSIFIED_REFUSAL'
}

/** One explicit local request. Consumed or uncertain native sends are never replayed. */
export async function startAppManagedDiscovery(
  input: { journeyId: string; targetProjectId: string; expectedStateHash: string; role: 'SCOUT' | 'RESOURCE_EXPLORER' },
  client: PrismaClient = prisma,
) {
  if (!appManagedDiscoveryEnabled())
    throw new ServiceError('Local Codex Discovery has not been enabled by this Appraise server owner.', 'CONFLICT')
  managedDiscoveryRoleSchema.parse(input.role)
  const journey = await readScopedQualityJourney(input, client)
  const session = journey.currentCoordinatorSessionId
    ? await client.qualityJourneyCoordinatorSession.findUnique({ where: { id: journey.currentCoordinatorSessionId } })
    : null
  if (!session || session.generation === null || session.ownerPrincipalId !== `appraise-local:${input.targetProjectId}`)
    throw new ServiceError(
      'Discovery requires the current app-owned coordinator. Use recovery to inspect ownership.',
      'CONFLICT',
    )
  // Reject an incompatible host before claiming or consuming a fresh Discovery assignment.
  await verifyManagedAnalysisExecutable()
  const task = await prepareAppManagedDiscoveryTask(
    {
      ...input,
      coordinatorSessionId: session.id,
      coordinatorGeneration: session.generation,
      coordinatorPrincipalId: session.ownerPrincipalId,
    },
    client,
  )
  const adapter = `APP_SERVER_LOCAL_V1_DISCOVERY_${input.role}`
  let consumed = false
  let stage = 'RESERVATION'
  try {
    await client.$transaction(async tx => {
      const hub = await tx.qualityJourneyProviderSlot.upsert({
        where: { id: 'HUB' },
        create: { id: 'HUB' },
        update: { version: { increment: 1 } },
      })
      if (hub.intentId || hub.providerRunId)
        throw new ServiceError('The local Codex worker requires reconciliation before reuse.', 'CONFLICT')
      await assertHistoricalHubQuiescent(tx)
      await readInternalWorkerAuthority(task.binding, tx)
      const result = await tx.qualityJourneyWorkAttempt.updateMany({
        where: {
          id: task.binding.attemptId,
          status: 'IN_PROGRESS',
          dispatchAdapterId: null,
          dispatchReservedAt: null,
          dispatchStartedAt: null,
        },
        data: {
          dispatchAdapterId: adapter,
          dispatchReservedAt: new Date(),
          dispatchStartedAt: new Date(),
          failureJson: canonicalContractJson({ state: 'UNKNOWN', reason: 'LOCAL_CODEX_DISCOVERY_DISPATCH_CONSUMED' }),
        },
      })
      if (result.count !== 1)
        throw new ServiceError(
          'Discovery was already dispatched. Reconcile its original outcome; it cannot be restarted.',
          'CONFLICT',
        )
    })
    consumed = true
    stage = 'NATIVE_SEND'
    const raw = await runManagedAnalysis(task.prompt, managedDiscoveryNativeOutputSchema(input.role))
    stage = 'OUTPUT_VALIDATION'
    if (Buffer.byteLength(raw, 'utf8') > 1_000_000) throw new Error('Discovery output exceeds the allowed bound.')
    const selection = JSON.parse(raw)
    stage = 'CONTRACT_PREFLIGHT'
    const call = projectAppManagedDiscoverySelection(task, selection)
    stage = 'CANONICAL_SUBMISSION'
    const accepted = await task.delivery.invoke(call)
    if (!accepted.receipt.accepted) throw new Error('Discovery did not receive canonical acceptance.')
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: task.binding.attemptId, dispatchAdapterId: adapter },
      data: { dispatchReservedAt: null, dispatchStartedAt: null, failureJson: null },
    })
    return { discoveryRevisionId: task.discoveryRevisionId, role: input.role, accepted: true }
  } catch (error) {
    if (!consumed) throw error
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: task.binding.attemptId, dispatchAdapterId: adapter },
      data: {
        failureJson: canonicalContractJson({
          state: 'UNKNOWN',
          stage,
          reason: `${stage}_DID_NOT_COMPLETE`,
          senderCleanupVerified: stage !== 'NATIVE_SEND',
          canonicalSubmissionStarted: stage === 'CANONICAL_SUBMISSION',
          refusalCategory: sanitizedDiscoveryRefusal(error),
          detail:
            stage === 'NATIVE_SEND'
              ? classifyManagedAnalysisFailure(error)
              : stage === 'OUTPUT_VALIDATION'
                ? 'Model output did not satisfy the exact Discovery contract.'
                : 'Canonical Discovery handoff did not complete.',
          ...(error instanceof z.ZodError
            ? { validation: error.issues.slice(0, 20).map(issue => ({ code: issue.code, path: issue.path.join('.') })) }
            : {}),
        }),
      },
    })
    throw new ServiceError(
      'Discovery did not finish. The dispatch is consumed and may be UNKNOWN. Reload to inspect accepted work and use recovery; do not restart it.',
      'CONFLICT',
    )
  } finally {
    task.delivery.fence()
  }
}
