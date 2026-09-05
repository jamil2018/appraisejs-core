'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { qualityJourneyClosureInputSchema } from '@/lib/quality-journey'
import { closeQualityJourney } from '@/services/coordinator/quality-journey-closure-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

export async function closeQualityJourneyAction(value: unknown): Promise<ActionResponse> {
  try {
    const input = qualityJourneyClosureInputSchema.omit({ targetProjectId: true }).parse(value)
    const project = await requireActiveProjectForMutation()
    const data = await closeQualityJourney({ ...input, targetProjectId: project.id })
    revalidatePath(`/quality-journeys/${input.journeyId}`)
    revalidatePath('/quality-journeys')
    return { success: true, status: 200, data }
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, status: 400, error: error.issues[0]?.message ?? 'Invalid closure request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    return unknownErrorToActionResponse(error)
  }
}
