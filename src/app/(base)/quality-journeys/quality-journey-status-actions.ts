'use server'

import { z } from 'zod'

import { requireActiveProject } from '@/lib/active-project'
import { getQualityJourneyStatusSnapshot } from '@/services/coordinator/quality-journey-query-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const statusRequestSchema = z
  .object({
    journeyId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
  })
  .strict()

/** Project ownership is resolved from the active workspace, never client input. */
export async function readQualityJourneyStatusAction(input: unknown): Promise<ActionResponse> {
  try {
    const request = statusRequestSchema.parse(input)
    const project = await requireActiveProject()
    const data = await getQualityJourneyStatusSnapshot({
      journeyId: request.journeyId,
      targetProjectId: project.id,
    })
    return { success: true, status: 200, data }
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, status: 400, error: error.issues[0]?.message ?? 'Invalid status request.' }
    return error instanceof ServiceError ? serviceErrorToActionResponse(error) : unknownErrorToActionResponse(error)
  }
}
