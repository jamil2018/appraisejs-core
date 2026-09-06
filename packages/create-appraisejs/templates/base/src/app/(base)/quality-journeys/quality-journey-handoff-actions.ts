'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  inspectQualityJourneyHandoff,
  launchQualityJourneyHandoff,
  prepareQualityJourneyHandoff,
} from '@/services/coordinator/quality-journey-handoff-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const id = z.string().min(1).max(200)
const requestSchema = z.object({ journeyId: id }).strict()
const launchSchema = requestSchema.extend({ handoffId: id }).strict()

function failure(error: unknown): ActionResponse {
  return error instanceof ServiceError ? serviceErrorToActionResponse(error) : unknownErrorToActionResponse(error)
}

export async function prepareQualityJourneyHandoffAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = requestSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await prepareQualityJourneyHandoff({
      journeyId: value.journeyId,
      targetProjectId: project.id,
      providerId: 'codex',
    })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { status: 201, success: true, data: result }
  } catch (error) {
    return failure(error)
  }
}

export async function launchQualityJourneyHandoffAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = launchSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await launchQualityJourneyHandoff({
      handoffId: value.handoffId,
      journeyId: value.journeyId,
      targetProjectId: project.id,
    })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { status: 200, success: result.status !== 'FAILED', data: result, error: result.reason }
  } catch (error) {
    return failure(error)
  }
}

export async function inspectQualityJourneyHandoffAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = requestSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    return {
      status: 200,
      success: true,
      data: await inspectQualityJourneyHandoff({ journeyId: value.journeyId, targetProjectId: project.id }),
    }
  } catch (error) {
    return failure(error)
  }
}
