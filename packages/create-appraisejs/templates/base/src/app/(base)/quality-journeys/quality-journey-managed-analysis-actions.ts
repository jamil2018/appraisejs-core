'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { startAppManagedAnalysis } from '@/services/coordinator/app-managed-analysis-service'
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

export async function startQualityJourneyManagedAnalysisAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = request.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await startAppManagedAnalysis({ ...value, targetProjectId: project.id })
    revalidatePath('/quality-journeys')
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, status: 400, error: 'Invalid Analysis request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    // Only classification and owning source frames are logged; provider messages, prompts and credentials stay private.
    console.error('Local Analysis request failed', {
      kind: error instanceof Error ? error.name : typeof error,
      frames:
        error instanceof Error
          ? error.stack
              ?.split('\n')
              .slice(1)
              .filter(line => line.includes('/src/'))
              .slice(0, 3)
          : [],
    })
    return { success: false, status: 500, error: 'Unable to start Analysis. Reload to check its current state.' }
  }
}
