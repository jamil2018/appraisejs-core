'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  approveQualityJourneyHandoffTakeover,
  inspectQualityJourneyHandoff,
  launchQualityJourneyHandoff,
  prepareQualityJourneyHandoff,
} from '@/services/coordinator/quality-journey-handoff-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const id = z.string().min(1).max(200)
const requestSchema = z.object({ journeyId: id }).strict()
const launchSchema = requestSchema.extend({ handoffId: id, launchUrl: z.string().url().max(4_000) }).strict()
const takeoverSchema = requestSchema
  .extend({
    handoffId: id,
    generation: z.number().int().positive(),
    takeoverApproval: z.string().regex(/^qjha_[A-Za-z0-9_-]{32}$/),
    takeoverRequestId: z.string().regex(/^qjhr_[A-Za-z0-9_-]{32}$/),
  })
  .strict()

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
      launchUrl: value.launchUrl,
    })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return {
      status: 200,
      success: result.status !== 'FAILED',
      data: result,
      error: result.status === 'FAILED' ? result.reason : undefined,
    }
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

/** A distinct local UI action is the only C1.3 takeover approval ingress. */
export async function approveQualityJourneyHandoffTakeoverAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = takeoverSchema.parse(input)
    const project = await requireActiveProjectForMutation()
    const result = await approveQualityJourneyHandoffTakeover({
      handoffId: value.handoffId,
      journeyId: value.journeyId,
      targetProjectId: project.id,
      generation: value.generation,
      takeoverApproval: value.takeoverApproval,
      takeoverRequestId: value.takeoverRequestId,
      approvedBy: 'local-ui',
    })
    revalidatePath(`/quality-journeys/${value.journeyId}`)
    return { status: 200, success: true, data: result }
  } catch (error) {
    return failure(error)
  }
}
