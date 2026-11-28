'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  copyUnstartedManagedJourneyBriefWithAssistant,
  readGuidedCopyReplay,
} from '@/services/coordinator/app-managed-guided-copy'
import { getManagedJourneyReadinessForProvider } from '@/services/coordinator/app-managed-journey-readiness'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const inputSchema = z
  .object({
    journeyId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    idempotencyKey: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    provider: z.enum(['CODEX', 'CLAUDE_CODE']),
  })
  .strict()

export async function copyUnstartedManagedJourneyBriefWithAssistantAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = inputSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const scope = { ...value, targetProjectId: project.id }
    const replay = await readGuidedCopyReplay(scope)
    if (replay) return { status: 200, success: true, data: replay }
    const readiness = await getManagedJourneyReadinessForProvider({ targetProjectId: project.id }, value.provider)
    if (!readiness.ready)
      throw new ServiceError(readiness.reason ?? 'The selected assistant is unavailable.', 'CONFLICT')
    const result = await copyUnstartedManagedJourneyBriefWithAssistant(scope)
    revalidatePath('/quality-journeys')
    return { status: result.replayed ? 200 : 201, success: true, data: result }
  } catch (error) {
    return error instanceof ServiceError ? serviceErrorToActionResponse(error) : unknownErrorToActionResponse(error)
  }
}
