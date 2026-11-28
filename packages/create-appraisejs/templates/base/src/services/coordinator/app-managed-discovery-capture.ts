import type { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/config/db-config'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'
import { assertCurrentCoordinatorSession, readScopedQualityJourney } from './quality-journey-coordinator-session'
import { managedJourneyProvider } from './app-managed-provider-sender'
import { appManagedDiscoveryEnabled } from './app-managed-discovery-service'
import { readInternalDiscoveryAssignment } from './quality-journey-discovery-service'
import {
  captureQualityJourneyDiscoveryBrowserReceipt,
  closeQualityJourneyDiscoveryBrowserSession,
  startQualityJourneyDiscoveryBrowserSession,
  type DiscoveryBrowserRuntime,
} from './quality-journey-discovery-browser-service'

type Input = { journeyId: string; targetProjectId: string; expectedStateHash: string }
export type AnonymousDiscoveryCaptureStatus =
  'READY' | 'INSPECTING' | 'EVIDENCE_AVAILABLE' | 'MANUAL_REQUIRED' | 'RECOVERY_REQUIRED' | 'INACTIVE'
const activeCaptures = new Set<string>()
const frozenScope = z
  .object({
    environmentIds: z.array(z.string()),
    routes: z.array(z.string()),
    environmentBindings: z
      .array(
        z.object({ environmentId: z.string(), discoveryAuthTransitPolicyJson: z.string().nullable() }).passthrough(),
      )
      .optional(),
  })
  .passthrough()

/** Observe only. Anonymous captures need no access confirmation; authenticated access remains human-owned. */
export async function readAppManagedAnonymousDiscoveryCapture(input: Input, tx: Prisma.TransactionClient) {
  const journey = await tx.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey was not found in the active project.', 'NOT_FOUND')
  const inactive = { status: 'INACTIVE' as const, request: null }
  if (
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.status !== 'ACTIVE' ||
    journey.stage !== 'DISCOVERY' ||
    journey.stateHash !== input.expectedStateHash ||
    !journey.currentCoordinatorSessionId ||
    JSON.parse(journey.blockerIdsJson).length ||
    JSON.parse(journey.unresolvedQuestionIdsJson).length
  )
    return inactive
  const session = await tx.qualityJourneyCoordinatorSession.findUnique({
    where: { id: journey.currentCoordinatorSessionId },
  })
  if (!session || session.generation === null || session.ownerPrincipalId !== `appraise-local:${input.targetProjectId}`)
    return inactive
  await assertCurrentCoordinatorSession(
    {
      ...input,
      coordinatorSessionId: session.id,
      coordinatorGeneration: session.generation,
      coordinatorPrincipalId: session.ownerPrincipalId,
    },
    tx,
  )
  const revision = await tx.qualityJourneyDiscoveryRevision.findUnique({
    where: { id: journey.activeDiscoveryRevisionId ?? '' },
  })
  if (!revision || revision.status !== 'COLLECTING' || revision.cycleId !== journey.activeCycleId) return inactive
  const item = await tx.qualityJourneyWorkItem.findUnique({ where: { id: revision.scoutWorkItemId } })
  if (
    !item ||
    item.status !== 'ELIGIBLE' ||
    item.currentAttempt !== 0 ||
    !JSON.parse(journey.activeWorkItemIdsJson).includes(item.id)
  )
    return inactive
  const sessionId = `qjdb_auto_${hashCanonical({ journeyId: journey.id, discoveryRevisionId: revision.id, workItemId: item.id, inputHash: item.inputHash }).slice(7, 39)}`
  const prior = await tx.qualityJourneyOwnedBrowser.findUnique({ where: { id: sessionId } })
  if (activeCaptures.has(sessionId)) return { status: 'INSPECTING' as const, request: null }
  if (prior && prior.status !== 'STOP_OBSERVED') return { status: 'RECOVERY_REQUIRED' as const, request: null }
  try {
    await readInternalDiscoveryAssignment(journey, { ...item, role: 'SCOUT' }, tx)
    return { status: 'EVIDENCE_AVAILABLE' as const, request: null }
  } catch (error) {
    if (!(
      error instanceof ServiceError &&
      error.code === 'CONFLICT' &&
      error.details?.reason === 'DISCOVERY_BROWSER_EVIDENCE_REQUIRED'
    ))
      throw error
  }
  if (prior) return { status: 'MANUAL_REQUIRED' as const, request: null }
  const scope = frozenScope.parse(JSON.parse(revision.scoutScopeJson))
  // Selection between environments or routes remains explicit rather than guessed.
  if (
    !scope.environmentBindings?.some(
      binding => binding.environmentId === scope.environmentIds[0] && binding.discoveryAuthTransitPolicyJson === null,
    ) ||
    scope.environmentBindings.some(binding => binding.discoveryAuthTransitPolicyJson) ||
    scope.environmentIds.length !== 1 ||
    scope.routes.length !== 1
  )
    return { status: 'MANUAL_REQUIRED' as const, request: null }
  const activeBrowser = await tx.qualityJourneyOwnedBrowser.findFirst({
    where: { journeyId: journey.id, targetProjectId: journey.targetProjectId, status: { not: 'STOP_OBSERVED' } },
  })
  if (activeBrowser) return { status: 'MANUAL_REQUIRED' as const, request: null }
  return {
    status: 'READY' as const,
    request: {
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      discoveryRevisionId: revision.id,
      workItemId: item.id,
      environmentId: scope.environmentIds[0]!,
      routeId: scope.routes[0]!,
      accessMode: 'ANONYMOUS' as const,
      sessionId,
    },
  }
}

/** One bounded anonymous read. Canonical browser ownership reserves the deterministic identity before native launch. */
export async function captureAppManagedAnonymousDiscovery(
  input: Input,
  client: PrismaClient = prisma,
  runtime?: DiscoveryBrowserRuntime,
) {
  const provider = managedJourneyProvider(await readScopedQualityJourney(input, client))
  if (!appManagedDiscoveryEnabled(provider))
    throw new ServiceError(
      'Automatic target inspection has not been enabled by this Appraise server owner.',
      'CONFLICT',
    )
  const readiness = await client.$transaction(tx => readAppManagedAnonymousDiscoveryCapture(input, tx))
  if (!readiness.request)
    throw new ServiceError(
      'Automatic anonymous inspection is unavailable. Inspect the current Discovery status before continuing.',
      'CONFLICT',
    )
  const { sessionId, ...request } = readiness.request
  if (activeCaptures.has(sessionId))
    throw new ServiceError('Automatic target inspection is already in progress.', 'CONFLICT')
  activeCaptures.add(sessionId)
  try {
    const browser = await startQualityJourneyDiscoveryBrowserSession(request, client, runtime, 1, sessionId)
    const binding = {
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      discoveryRevisionId: request.discoveryRevisionId,
      sessionId: browser.id,
    }
    try {
      return await captureQualityJourneyDiscoveryBrowserReceipt(
        { ...binding, snapshotId: `automatic:${request.discoveryRevisionId}` },
        client,
        { automaticAnonymous: true },
      )
    } finally {
      // A failed close remains UNKNOWN in the canonical ledger and prevents another automatic attempt.
      await closeQualityJourneyDiscoveryBrowserSession(binding)
    }
  } finally {
    activeCaptures.delete(sessionId)
  }
}

/** Status only: private frozen request and browser ownership identifiers never enter the client view. */
export async function getAppManagedAnonymousDiscoveryCaptureStatus(
  input: Input,
  client: PrismaClient = prisma,
): Promise<AnonymousDiscoveryCaptureStatus> {
  try {
    const provider = managedJourneyProvider(await readScopedQualityJourney(input, client))
    const status = (await client.$transaction(tx => readAppManagedAnonymousDiscoveryCapture(input, tx))).status
    return status === 'READY' && !appManagedDiscoveryEnabled(provider) ? 'MANUAL_REQUIRED' : status
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'CONFLICT') return 'RECOVERY_REQUIRED'
    throw error
  }
}
