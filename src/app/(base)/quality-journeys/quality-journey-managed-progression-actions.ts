'use server'

import { z } from 'zod'
import { getAppManagedAnonymousDiscoveryCaptureStatus } from '@/services/coordinator/app-managed-discovery-capture'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  readAppManagedJourneyContinuation,
  scheduleAppManagedJourneyContinuation,
} from '@/services/coordinator/app-managed-progression-service'
import { ServiceError, serviceErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const request = z
  .object({
    journeyId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    expectedStateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()

export async function continueQualityJourneyManagedAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = request.parse(input)
    const project = await requireActiveProjectForMutation()
    const scoped = { ...value, targetProjectId: project.id }
    const next = await readAppManagedJourneyContinuation(scoped)
    if (next) scheduleAppManagedJourneyContinuation(scoped)
    const discoveryCaptureStatus = await getAppManagedAnonymousDiscoveryCaptureStatus(scoped)
    return { success: true, status: 200, data: { scheduled: Boolean(next), discoveryCaptureStatus } }
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, status: 400, error: 'Invalid Journey continuation request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    return {
      success: false,
      status: 500,
      error: 'Unable to continue Journey work. Reload to inspect its current state.',
    }
  }
}
