'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { startAppManagedScenarioAutomation } from '@/services/coordinator/app-managed-scenario-automation-service'
import { scheduleAppManagedJourneyContinuation } from '@/services/coordinator/app-managed-progression-service'
import { getQualityJourney } from '@/services/coordinator/quality-journey-service'
import { appManagedScenarioAutomationRoleSchema } from '@/services/coordinator/app-managed-scenario-automation-contract'
import {
  recoverAppManagedScenarioAutomation,
  requestAppManagedScenarioDesignCorrection,
} from '@/services/coordinator/app-managed-scenario-automation-recovery'
import { ServiceError, serviceErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const request = z
  .object({
    journeyId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    role: appManagedScenarioAutomationRoleSchema,
    expectedStateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
const recoveryRequest = request
  .extend({
    attemptId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    candidateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
const correctionRequest = request
  .pick({ journeyId: true, expectedStateHash: true })
  .extend({
    attemptId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    expectedFailureHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()

export async function requestQualityJourneyManagedScenarioCorrectionAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = correctionRequest.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await requestAppManagedScenarioDesignCorrection({ ...value, targetProjectId: project.id })
    try {
      const { journey } = await getQualityJourney({ journeyId: value.journeyId, targetProjectId: project.id })
      scheduleAppManagedJourneyContinuation({
        journeyId: value.journeyId,
        targetProjectId: project.id,
        expectedStateHash: journey.stateHash,
      })
    } catch {
      // The issued successor is durable; reconnect may wake it if this request cannot register a callback.
    }
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, status: 400, error: 'Invalid design correction request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    return {
      success: false,
      status: 500,
      error: 'A distinct design assignment could not be issued. Reload to inspect the original evidence.',
    }
  }
}

export async function recoverQualityJourneyManagedScenarioAutomationAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = recoveryRequest.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await recoverAppManagedScenarioAutomation({ ...value, targetProjectId: project.id })
    revalidatePath('/quality-journeys')
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, status: 400, error: 'Invalid proposal recovery request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    return {
      success: false,
      status: 500,
      error: 'Proposal recovery did not complete. Reload to inspect retained state.',
    }
  }
}

export async function startQualityJourneyManagedScenarioAutomationAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = request.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await startAppManagedScenarioAutomation({ ...value, targetProjectId: project.id })
    revalidatePath('/quality-journeys')
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, status: 400, error: 'Invalid preparation request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    // Only classification and owning source frames are logged; provider messages, prompts and credentials stay private.
    console.error('Local preparation request failed', {
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
    return { success: false, status: 500, error: 'Unable to start preparation. Reload to check its current state.' }
  }
}
