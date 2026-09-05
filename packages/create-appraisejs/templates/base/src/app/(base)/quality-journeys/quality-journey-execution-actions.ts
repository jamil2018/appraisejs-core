'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  qualityJourneyExecutionStartSchema,
  qualityJourneyExecutionCancelSchema,
  qualityJourneyExecutionReconcileSchema,
  qualityJourneyRerunProposalSchema,
  qualityJourneyRerunStartSchema,
  qualityJourneyExecutionConsentGrantSchema,
  qualityJourneyRerunApprovalSchema,
} from '@/lib/quality-journey'
import {
  startQualityJourneyExecution,
  cancelQualityJourneyExecution,
  reconcileQualityJourneyExecution,
  proposeQualityJourneyRerun,
  startQualityJourneyRerun,
  grantQualityJourneyExecutionConsent,
  approveQualityJourneyRerun,
} from '@/services/coordinator/quality-journey-execution-service'
import { serviceErrorToActionResponse, unknownErrorToActionResponse, ServiceError } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const actions = {
  start: { schema: qualityJourneyExecutionStartSchema, run: startQualityJourneyExecution },
  cancel: { schema: qualityJourneyExecutionCancelSchema, run: cancelQualityJourneyExecution },
  reconcile: { schema: qualityJourneyExecutionReconcileSchema, run: reconcileQualityJourneyExecution },
  propose: { schema: qualityJourneyRerunProposalSchema, run: proposeQualityJourneyRerun },
  rerun: { schema: qualityJourneyRerunStartSchema, run: startQualityJourneyRerun },
  consent: { schema: qualityJourneyExecutionConsentGrantSchema, run: grantQualityJourneyExecutionConsent },
  approve: { schema: qualityJourneyRerunApprovalSchema, run: approveQualityJourneyRerun },
} as const

/** Ownership comes from the active project; browser input cannot select it. */
export async function qualityJourneyExecutionAction(
  action: keyof typeof actions,
  input: unknown,
): Promise<ActionResponse> {
  try {
    const operation =
      actions[z.enum(['start', 'cancel', 'reconcile', 'propose', 'rerun', 'consent', 'approve']).parse(action)]
    const values = z.record(z.string(), z.unknown()).parse(input)
    if ('targetProjectId' in values || 'grantSource' in values || 'actor' in values)
      throw new ServiceError('Execution ownership is resolved by Appraise.', 'UNAUTHORIZED')
    const project = await requireActiveProjectForMutation()
    const request = operation.schema.parse({ ...values, targetProjectId: project.id })
    const data = await operation.run(request)
    revalidatePath(`/quality-journeys/${request.journeyId}`)
    return { success: true, status: 200, data }
  } catch (error) {
    if (error instanceof z.ZodError)
      return { success: false, status: 400, error: error.issues[0]?.message ?? 'Invalid execution request.' }
    return error instanceof ServiceError ? serviceErrorToActionResponse(error) : unknownErrorToActionResponse(error)
  }
}
