'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  authorizeQualityJourneyDiscoveryBrowserExactReturn,
  captureQualityJourneyDiscoveryBrowserReceipt,
  closeQualityJourneyDiscoveryBrowserSession,
  confirmQualityJourneyDiscoveryBrowserAccess,
  logoutQualityJourneyDiscoveryBrowserSession,
  markQualityJourneyDiscoveryBrowserMissingAccess,
  replaceQualityJourneyDiscoveryBrowserContext,
  revokeQualityJourneyDiscoveryBrowserSession,
  startQualityJourneyDiscoveryBrowserSession,
} from '@/services/coordinator/quality-journey-discovery-browser-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const route = z.string().trim().min(1).max(2_000).regex(/^\//)
const binding = z.object({ journeyId: id, discoveryRevisionId: id }).strict()
const start = binding
  .extend({
    workItemId: id,
    environmentId: id,
    routeId: route,
    accessMode: z.enum(['ANONYMOUS', 'AUTHENTICATED_INTENT']),
    authFlowId: id.optional(),
    ttlSeconds: z.number().int().min(30).max(900).optional(),
  })
  .strict()
const session = binding.extend({ sessionId: id }).strict()
const capture = session.extend({ snapshotId: id }).strict()

function failure(error: unknown): ActionResponse {
  return error instanceof ServiceError ? serviceErrorToActionResponse(error) : unknownErrorToActionResponse(error)
}

async function mutate<T>(
  input: unknown,
  schema: z.ZodType<T>,
  operation: (value: T & { targetProjectId: string }) => Promise<unknown>,
): Promise<ActionResponse> {
  try {
    const value = schema.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await operation({ ...value, targetProjectId: project.id })
    const journeyId = (value as { journeyId: string }).journeyId
    revalidatePath(`/quality-journeys/${journeyId}`)
    return { status: 200, success: true, data: result }
  } catch (error) {
    return failure(error)
  }
}

export async function startQualityJourneyDiscoveryBrowserAction(input: unknown): Promise<ActionResponse> {
  return mutate(input, start, value => startQualityJourneyDiscoveryBrowserSession(value))
}

export async function confirmQualityJourneyDiscoveryBrowserAccessAction(input: unknown): Promise<ActionResponse> {
  return mutate(input, session, value => confirmQualityJourneyDiscoveryBrowserAccess(value))
}

/** Human approval triggers the one exact return in the owned browser. The
 * client can name no URL, origin, route, credential, or browser state. */
export async function authorizeQualityJourneyDiscoveryBrowserExactReturnAction(
  input: unknown,
): Promise<ActionResponse> {
  return mutate(input, session, async value => {
    const result = await authorizeQualityJourneyDiscoveryBrowserExactReturn(value)
    if (result.return !== 'RETURN_COMMITTED') throw new ServiceError('Exact return did not commit.', 'CONFLICT')
    return { return: 'RETURN_COMMITTED', session: result.session }
  })
}

export async function captureQualityJourneyDiscoveryBrowserReceiptAction(input: unknown): Promise<ActionResponse> {
  return mutate(input, capture, value => captureQualityJourneyDiscoveryBrowserReceipt(value))
}

export async function markQualityJourneyDiscoveryBrowserMissingAccessAction(input: unknown): Promise<ActionResponse> {
  return mutate(input, session, value => markQualityJourneyDiscoveryBrowserMissingAccess(value))
}

export async function logoutQualityJourneyDiscoveryBrowserAction(input: unknown): Promise<ActionResponse> {
  return mutate(input, session, value => logoutQualityJourneyDiscoveryBrowserSession(value))
}

export async function revokeQualityJourneyDiscoveryBrowserAction(input: unknown): Promise<ActionResponse> {
  return mutate(input, session, value => revokeQualityJourneyDiscoveryBrowserSession(value))
}

export async function replaceQualityJourneyDiscoveryBrowserContextAction(input: unknown): Promise<ActionResponse> {
  return mutate(input, session, value => replaceQualityJourneyDiscoveryBrowserContext(value))
}

export async function closeQualityJourneyDiscoveryBrowserAction(input: unknown): Promise<ActionResponse> {
  return mutate(input, session, value => closeQualityJourneyDiscoveryBrowserSession(value))
}
