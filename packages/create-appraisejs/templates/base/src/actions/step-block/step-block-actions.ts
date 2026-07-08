'use server'

import { revalidatePath } from 'next/cache'
import { z, ZodError } from 'zod'

import { stepBlockSchema } from '@/constants/form-opts/step-block-form-opts'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import {
  createStepBlock,
  deleteStepBlocks,
  getStepBlockByIdOrThrow,
  listStepBlocks,
  updateStepBlock,
} from '@/services/step-block/step-block-service'
import type { ActionResponse } from '@/types/form/actionHandler'

export async function getAllStepBlocksAction(): Promise<ActionResponse> {
  try {
    const stepBlocks = await listStepBlocks()
    return { status: 200, success: true, data: stepBlocks }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getStepBlockByIdAction(id: string): Promise<ActionResponse> {
  try {
    const stepBlock = await getStepBlockByIdOrThrow(id)
    return { status: 200, success: true, data: stepBlock }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function createStepBlockAction(
  _prev: unknown,
  value: z.infer<typeof stepBlockSchema>,
): Promise<ActionResponse> {
  try {
    const stepBlock = await createStepBlock(value)
    revalidatePath('/step-blocks')
    return { status: 200, success: true, message: 'Step block created successfully', data: stepBlock }
  } catch (error) {
    if (error instanceof ZodError) {
      return { status: 400, success: false, error: error.message }
    }
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function updateStepBlockAction(
  _prev: unknown,
  value: z.infer<typeof stepBlockSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    const stepBlock = await updateStepBlock(id, value)
    revalidatePath('/step-blocks')
    return { status: 200, success: true, message: 'Step block updated successfully', data: stepBlock }
  } catch (error) {
    if (error instanceof ZodError) {
      return { status: 400, success: false, error: error.message }
    }
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteStepBlockAction(ids: string[]): Promise<ActionResponse> {
  try {
    await deleteStepBlocks(ids)
    revalidatePath('/step-blocks')
    return { status: 200, success: true, message: 'Step block(s) deleted successfully' }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
