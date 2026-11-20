'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { startAppManagedTriage } from '@/services/coordinator/app-managed-triage-service'
import { recoverAppManagedTriage } from '@/services/coordinator/app-managed-triage-recovery'
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

export async function startQualityJourneyManagedTriageAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = request.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await startAppManagedTriage({ ...value, targetProjectId: project.id })
    revalidatePath('/quality-journeys')
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, status: 400, error: 'Invalid triage request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    console.error('Local triage request failed', {
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
    return { success: false, status: 500, error: 'Unable to start triage. Reload to check its current state.' }
  }
}

export async function recoverQualityJourneyManagedTriageAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = request
      .extend({ attemptId: z.string().min(1).max(200), candidateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/) })
      .parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await recoverAppManagedTriage({ ...value, targetProjectId: project.id })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, status: 400, error: 'Invalid retained report recovery request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    return { success: false, status: 500, error: 'Unable to recover the retained report. Reload to inspect its state.' }
  }
}
