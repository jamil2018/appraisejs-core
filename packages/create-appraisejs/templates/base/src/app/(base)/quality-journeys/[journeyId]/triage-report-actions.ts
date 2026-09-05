'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  approveQualityJourneyRemediation,
  requestQualityJourneyReportRevision,
} from '@/services/coordinator/quality-journey-triage-service'
import { serviceErrorToActionResponse, unknownErrorToActionResponse, ServiceError } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const action = z.enum(['revision', 'approve'])
const reviewInput = z
  .object({
    journeyId: z.string().min(1),
    reportRevisionId: z.string().min(1),
    expectedReportHash: z.string().startsWith('sha256:'),
    expectedStateHash: z.string().startsWith('sha256:'),
    idempotencyKey: z.string().min(1),
    feedback: z.string().trim().min(1).max(8_000),
  })
  .strict()

function invalidReviewRequest(error: z.ZodError) {
  return { success: false as const, status: 400, error: error.issues[0]?.message ?? 'Invalid report review request.' }
}

function reviewActionFailure(error: unknown): ActionResponse {
  if (error instanceof z.ZodError) return invalidReviewRequest(error)
  if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
  return unknownErrorToActionResponse(error)
}

/** Report review is a local UI decision: the active project supplies the only target scope. */
export async function qualityJourneyTriageReviewAction(
  kind: z.infer<typeof action>,
  input: unknown,
): Promise<ActionResponse> {
  try {
    const values = z.record(z.string(), z.unknown()).parse(input)
    if ('targetProjectId' in values || 'actor' in values || 'feedbackScope' in values)
      throw new ServiceError('Report review authority is resolved by Appraise.', 'UNAUTHORIZED')
    const project = await requireActiveProjectForMutation()
    const request = { ...reviewInput.parse(values), targetProjectId: project.id }
    const data =
      action.parse(kind) === 'revision'
        ? await requestQualityJourneyReportRevision(request)
        : await approveQualityJourneyRemediation(request)
    revalidatePath(`/quality-journeys/${request.journeyId}`)
    return { success: true, status: 200, data }
  } catch (error) {
    return reviewActionFailure(error)
  }
}
