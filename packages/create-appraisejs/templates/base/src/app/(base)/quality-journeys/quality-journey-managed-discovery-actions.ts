'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { managedDiscoveryRoleSchema } from '@/services/coordinator/app-managed-discovery-contract'
import { startAppManagedDiscovery } from '@/services/coordinator/app-managed-discovery-service'
import {
  requestAppManagedExplorerCorrection,
  requestAppManagedScoutCorrection,
  createAppManagedDiscoveryCorrection,
} from '@/services/coordinator/app-managed-discovery-correction'
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
    role: managedDiscoveryRoleSchema,
  })
  .strict()

export async function startQualityJourneyManagedDiscoveryAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = request.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await startAppManagedDiscovery({ ...value, targetProjectId: project.id })
    revalidatePath('/quality-journeys')
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, status: 400, error: 'Invalid Discovery request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    return { success: false, status: 500, error: 'Unable to start Discovery. Reload to check its current state.' }
  }
}

export async function requestQualityJourneyExplorerCorrectionAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = request.omit({ role: true }).parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await requestAppManagedExplorerCorrection({ ...value, targetProjectId: project.id })
    revalidatePath('/quality-journeys')
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, status: 400, error: 'Invalid Explorer correction request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    return { success: false, status: 500, error: 'Explorer correction did not finish. Reload to inspect its state.' }
  }
}

export async function createQualityJourneyDiscoveryCorrectionAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = request.omit({ role: true }).parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await createAppManagedDiscoveryCorrection({ ...value, targetProjectId: project.id })
    revalidatePath('/quality-journeys')
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: { discoveryRevisionId: result.discoveryRevision.id } }
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, status: 400, error: 'Invalid Discovery correction request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    return {
      success: false,
      status: 500,
      error: 'Fresh Discovery preparation did not finish. Reload to inspect its state.',
    }
  }
}

export async function requestQualityJourneyScoutCorrectionAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = request.omit({ role: true }).parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await requestAppManagedScoutCorrection({ ...value, targetProjectId: project.id })
    revalidatePath('/quality-journeys')
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, status: 400, error: 'Invalid Scout correction request.' }
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    return { success: false, status: 500, error: 'Scout reconciliation did not finish. Reload to inspect its state.' }
  }
}
