'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  pauseQualityJourneyOperational,
  resumeQualityJourneyOperational,
} from '@/services/coordinator/quality-journey-recovery-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const base = z.object({
  journeyId: id,
  expectedStateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: id,
})
const pauseSchema = base.extend({ reason: z.string().trim().min(1).max(1000) }).strict()
const resumeSchema = base.strict()

export async function qualityJourneyRecoveryAction(
  operation: 'pause' | 'resume',
  value: unknown,
): Promise<ActionResponse> {
  try {
    const selected = z.enum(['pause', 'resume']).parse(operation)
    const request = selected === 'pause' ? pauseSchema.parse(value) : resumeSchema.parse(value)
    const project = await requireActiveProjectForMutation()
    const scoped = { ...request, targetProjectId: project.id }
    const data =
      selected === 'pause'
        ? await pauseQualityJourneyOperational({ ...scoped, reason: pauseSchema.parse(value).reason })
        : await resumeQualityJourneyOperational(scoped)
    revalidatePath(`/quality-journeys/${request.journeyId}`)
    return { success: true, status: 200, data }
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, status: 400, error: error.issues[0]?.message ?? 'Invalid recovery request.' }
    return error instanceof ServiceError ? serviceErrorToActionResponse(error) : unknownErrorToActionResponse(error)
  }
}
