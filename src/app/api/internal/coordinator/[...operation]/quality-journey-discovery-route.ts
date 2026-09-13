import { z } from 'zod'

import { qualityJourneyContractVersion } from '@/lib/quality-journey'
import {
  getQualityJourneyDiscovery,
  revalidateQualityJourneyDiscovery,
  submitExternalQualityJourneyResourceResolution,
  submitExternalQualityJourneyTargetObservation,
  retryQualityJourneyDiscovery,
  submitQualityJourneyResourceResolution,
  submitQualityJourneyTargetObservation,
} from '@/services/coordinator/quality-journey-discovery-service'
import type { ExternalAnalyzerProjectPrincipal } from '@/services/coordinator/quality-journey-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'
import { ServiceError } from '@/services/shared/errors'
import type { CoordinatorSessionCredentials } from '@/services/coordinator/quality-journey-coordinator-session'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const target = z.string().min(1)
const reason = z.string().trim().min(1).max(8_000)
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)

const serverOwnedBundleKeys = new Set([
  'schemaVersion',
  'journeyId',
  'targetProjectId',
  'workItemId',
  'attemptId',
  'actor',
  'command',
])
const submittedBundle = z.record(z.string(), z.unknown()).superRefine((bundle, context) => {
  for (const key of serverOwnedBundleKeys)
    if (key in bundle)
      context.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is server-owned and must not be supplied in a discovery bundle.`,
      })
})

const submissionBase = {
  target,
  discoveryRevisionId: id,
  workItemId: id,
  attemptId: id,
  leaseId: id,
  ownerToken: z.string().min(1).max(2_000),
  idempotencyKey: id,
  expectedInputHash: hash,
  expectedScopeHash: hash,
}
const targetObservationSubmissionSchema = z.object({ ...submissionBase, bundle: submittedBundle }).strict()
const resourceResolutionSubmissionSchema = z.object({ ...submissionBase, bundle: submittedBundle }).strict()
const { ownerToken: _ownerToken, idempotencyKey: _idempotencyKey, ...externalSubmissionBase } = submissionBase
const externalTargetObservationSubmissionSchema = z
  .object({
    ...externalSubmissionBase,
    assignmentId: id,
    assignmentGeneration: z.number().int().positive(),
    assignmentSecret: z.string().min(32).max(2_000),
    idempotencyKey: id,
    bundle: submittedBundle,
  })
  .strict()
const externalResourceResolutionSubmissionSchema = externalTargetObservationSubmissionSchema
const retrySchema = z.object({ target, expectedActiveDiscoveryRevisionId: id, idempotencyKey: id, reason }).strict()
const revalidationSchema = z.object({ target, expectedActiveDiscoveryRevisionId: id }).strict()

type DiscoveryPostHandler = (
  journeyId: string,
  body: unknown,
  coordinatorSession?: CoordinatorSessionCredentials,
) => Promise<Response>

function scopedBundle<T extends Record<string, unknown>>(
  bundle: T,
  journeyId: string,
  targetProjectId: string,
  workItemId: string,
  attemptId: string,
) {
  return {
    ...bundle,
    schemaVersion: qualityJourneyContractVersion,
    journeyId,
    targetProjectId,
    workItemId,
    attemptId,
  }
}

async function submitTargetObservation(
  journeyId: string,
  body: unknown,
  coordinatorSession?: CoordinatorSessionCredentials,
): Promise<Response> {
  const value = targetObservationSubmissionSchema.parse(body)
  const resolvedTarget = await resolveTargetProject(value.target)
  return Response.json(
    await submitQualityJourneyTargetObservation(
      {
        journeyId,
        targetProjectId: resolvedTarget.id,
        discoveryRevisionId: value.discoveryRevisionId,
        workItemId: value.workItemId,
        attemptId: value.attemptId,
        leaseId: value.leaseId,
        ownerToken: value.ownerToken,
        idempotencyKey: value.idempotencyKey,
        expectedInputHash: value.expectedInputHash,
        expectedScopeHash: value.expectedScopeHash,
        bundle: scopedBundle(value.bundle, journeyId, resolvedTarget.id, value.workItemId, value.attemptId),
      },
      undefined,
      coordinatorSession,
    ),
    { status: 201 },
  )
}

async function submitResourceResolution(
  journeyId: string,
  body: unknown,
  coordinatorSession?: CoordinatorSessionCredentials,
): Promise<Response> {
  const value = resourceResolutionSubmissionSchema.parse(body)
  const resolvedTarget = await resolveTargetProject(value.target)
  return Response.json(
    await submitQualityJourneyResourceResolution(
      {
        journeyId,
        targetProjectId: resolvedTarget.id,
        discoveryRevisionId: value.discoveryRevisionId,
        workItemId: value.workItemId,
        attemptId: value.attemptId,
        leaseId: value.leaseId,
        ownerToken: value.ownerToken,
        idempotencyKey: value.idempotencyKey,
        expectedInputHash: value.expectedInputHash,
        expectedScopeHash: value.expectedScopeHash,
        bundle: scopedBundle(value.bundle, journeyId, resolvedTarget.id, value.workItemId, value.attemptId),
      },
      undefined,
      coordinatorSession,
    ),
    { status: 201 },
  )
}

async function submitExternalTargetObservation(
  journeyId: string,
  body: unknown,
  principal: ExternalAnalyzerProjectPrincipal | undefined,
  coordinatorSession?: CoordinatorSessionCredentials,
): Promise<Response> {
  if (!principal) throw new ServiceError('External project principal is unavailable.', 'UNAUTHORIZED')
  const value = externalTargetObservationSubmissionSchema.parse(body)
  const resolvedTarget = await resolveTargetProject(value.target)
  return Response.json(
    await submitExternalQualityJourneyTargetObservation(
      {
        ...value,
        journeyId,
        targetProjectId: resolvedTarget.id,
        bundle: scopedBundle(value.bundle, journeyId, resolvedTarget.id, value.workItemId, value.attemptId),
      },
      principal,
      undefined,
      coordinatorSession,
    ),
    { status: 201 },
  )
}

async function submitExternalResourceResolution(
  journeyId: string,
  body: unknown,
  principal: ExternalAnalyzerProjectPrincipal | undefined,
  coordinatorSession?: CoordinatorSessionCredentials,
): Promise<Response> {
  if (!principal) throw new ServiceError('External project principal is unavailable.', 'UNAUTHORIZED')
  const value = externalResourceResolutionSubmissionSchema.parse(body)
  const resolvedTarget = await resolveTargetProject(value.target)
  return Response.json(
    await submitExternalQualityJourneyResourceResolution(
      {
        ...value,
        journeyId,
        targetProjectId: resolvedTarget.id,
        bundle: scopedBundle(value.bundle, journeyId, resolvedTarget.id, value.workItemId, value.attemptId),
      },
      principal,
      undefined,
      coordinatorSession,
    ),
    { status: 201 },
  )
}

async function retry(
  journeyId: string,
  body: unknown,
  coordinatorSession?: CoordinatorSessionCredentials,
): Promise<Response> {
  const value = retrySchema.parse(body)
  const resolvedTarget = await resolveTargetProject(value.target)
  return Response.json(
    await retryQualityJourneyDiscovery(
      {
        journeyId,
        targetProjectId: resolvedTarget.id,
        expectedActiveDiscoveryRevisionId: value.expectedActiveDiscoveryRevisionId,
        idempotencyKey: value.idempotencyKey,
        reason: value.reason,
      },
      undefined,
      coordinatorSession,
    ),
    { status: 201 },
  )
}

async function revalidate(
  journeyId: string,
  body: unknown,
  coordinatorSession?: CoordinatorSessionCredentials,
): Promise<Response> {
  const value = revalidationSchema.parse(body)
  const resolvedTarget = await resolveTargetProject(value.target)
  return Response.json(
    await revalidateQualityJourneyDiscovery(
      {
        journeyId,
        targetProjectId: resolvedTarget.id,
        expectedActiveDiscoveryRevisionId: value.expectedActiveDiscoveryRevisionId,
      },
      undefined,
      coordinatorSession,
    ),
  )
}

const postHandlers: Readonly<Record<string, DiscoveryPostHandler>> = {
  'target-observations': submitTargetObservation,
  'resource-resolutions': submitResourceResolution,
  retries: retry,
  revalidations: revalidate,
}

export async function postQualityJourneyDiscoveryRoute(
  operation: string[],
  body: unknown,
  coordinatorSession?: CoordinatorSessionCredentials,
  principal?: ExternalAnalyzerProjectPrincipal,
): Promise<Response | undefined> {
  if (
    operation.length !== 5 ||
    operation[0] !== 'quality' ||
    operation[1] !== 'journeys' ||
    operation[3] !== 'discovery'
  )
    return undefined
  if (operation[4] === 'external-target-observations')
    return submitExternalTargetObservation(operation[2]!, body, principal, coordinatorSession)
  if (operation[4] === 'external-resource-resolutions')
    return submitExternalResourceResolution(operation[2]!, body, principal, coordinatorSession)
  const handler = postHandlers[operation[4] ?? '']
  return handler ? handler(operation[2]!, body, coordinatorSession) : undefined
}

export async function getQualityJourneyDiscoveryRoute(
  operation: string[],
  query: URLSearchParams,
): Promise<Response | undefined> {
  if (
    operation.length !== 4 ||
    operation[0] !== 'quality' ||
    operation[1] !== 'journeys' ||
    operation[3] !== 'discovery'
  )
    return undefined
  const resolvedTarget = await resolveTargetProject(target.parse(query.get('target')))
  return Response.json(
    await getQualityJourneyDiscovery({ journeyId: operation[2]!, targetProjectId: resolvedTarget.id }),
  )
}
