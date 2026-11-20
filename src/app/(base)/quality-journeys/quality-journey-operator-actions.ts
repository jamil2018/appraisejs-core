'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  requestAppManagedAutomatorManualRecovery,
  prepareAppManagedManualAutomationTask,
  getAppManagedManualAutomationDraftContext,
} from '@/services/coordinator/app-managed-automation-manual-recovery'
import { appManagedScenarioAutomationOutputSchema } from '@/services/coordinator/app-managed-scenario-automation-contract'
import { appManagedPreparationProjection } from '@/services/coordinator/app-managed-scenario-automation-projection'
import { operatorFindingSchema } from '@/services/coordinator/app-managed-operator-triage'
import { operatorTriage } from '@/services/coordinator/app-managed-triage-service'
import { ServiceError, serviceErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const scope = z.object({ journeyId: id, expectedStateHash: digest }).strict()

function failure(error: unknown): ActionResponse {
  if (error instanceof z.ZodError)
    return {
      success: false,
      status: 400,
      error: error.issues
        .slice(0, 3)
        .map(issue => `${issue.path.join('.') || 'Input'}: ${issue.message}`)
        .join(' ')
        .slice(0, 1000),
    }
  if (error instanceof SyntaxError)
    return {
      success: false,
      status: 400,
      error: 'Review the input. It must match the displayed preparation or report format.',
    }
  if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
  return {
    success: false,
    status: 500,
    error: 'The response is uncertain. Reload to inspect accepted work before submitting again.',
  }
}

export async function requestManualAutomationRecoveryAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = scope.extend({ attemptId: id, expectedFailureHash: digest }).strict().parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await requestAppManagedAutomatorManualRecovery({ ...value, targetProjectId: project.id })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    return failure(error)
  }
}

export async function submitManualAutomationAction(input: unknown): Promise<ActionResponse> {
  let task: Awaited<ReturnType<typeof prepareAppManagedManualAutomationTask>> | undefined
  try {
    const value = z
      .object({ journeyId: id, recoveryEventId: id, draftJson: z.string().min(1).max(1_000_000) })
      .strict()
      .parse(input)
    if (Buffer.byteLength(value.draftJson, 'utf8') > 1_000_000)
      throw new ServiceError('The JSON file exceeds 1 MB.', 'VALIDATION')
    const draft = z.object({ scenarios: z.unknown() }).strict().parse(JSON.parse(value.draftJson))
    // Reject malformed drafts before acquiring the distinct manual assignment.
    const reviewed = appManagedScenarioAutomationOutputSchema.parse({
      toolName: 'quality_journey_automation_materialize',
      arguments: { idempotencyKey: 'operator-draft-validation', scenarios: draft.scenarios },
    })
    if (reviewed.toolName !== 'quality_journey_automation_materialize')
      throw new ServiceError('Invalid preparation draft.', 'VALIDATION')
    const project = await requireActiveProjectForMutation()
    const observation = await getAppManagedManualAutomationDraftContext({
      journeyId: value.journeyId,
      targetProjectId: project.id,
    })
    if (!observation)
      throw new ServiceError('The manual preparation context changed. Reload before submitting.', 'CONFLICT')
    appManagedPreparationProjection('AUTOMATOR', observation.context).compile(reviewed, 'operator-draft-validation')
    task = await prepareAppManagedManualAutomationTask({
      journeyId: value.journeyId,
      targetProjectId: project.id,
      recoveryEventId: value.recoveryEventId,
    })
    const compiled = task.compile({
      ...reviewed,
      arguments: { ...reviewed.arguments, idempotencyKey: task.submissionIdempotencyKey },
    })
    const result = await task.delivery.invoke({ ...compiled, callId: task.submissionIdempotencyKey })
    if (!result.receipt.accepted)
      throw new ServiceError('The preparation was not accepted. Reload to inspect its state.', 'CONFLICT')
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: { accepted: true, nativeSend: false } }
  } catch (error) {
    return failure(error)
  } finally {
    task?.delivery.fence()
  }
}

export async function previewOperatorTriageAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = scope.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await operatorTriage({ ...value, targetProjectId: project.id }, null)
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    return failure(error)
  }
}

export async function saveOperatorTriageAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = scope
      .extend({ inputHash: digest, findings: z.array(operatorFindingSchema).max(512) })
      .strict()
      .parse(input)
    const project = await requireActiveProjectForMutation()
    const { inputHash, findings, ...request } = value
    const result = await operatorTriage({ ...request, targetProjectId: project.id }, { inputHash, findings })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { success: true, status: 200, data: result }
  } catch (error) {
    return failure(error)
  }
}
