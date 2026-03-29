'use server'

import type { ActionResponse } from '@/types/form/actionHandler'
import type { SavePickedLocatorRequest, StartLocatorPickerSessionRequest } from '@/types/locator-picker'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { locatorPickerSessionManager } from '@/lib/locator-picker/session-manager'
import { savePickedLocatorFromRequest } from '@/services/locator/locator-service'

const startLocatorPickerSessionSchema = z
  .object({
    environmentId: z.string().optional(),
    url: z.string().optional(),
  })
  .refine(value => Boolean(value.environmentId || value.url), {
    message: 'Choose an environment or provide a URL.',
  })

export async function startLocatorPickerSessionAction(
  request: StartLocatorPickerSessionRequest,
): Promise<ActionResponse> {
  try {
    const parsedRequest = startLocatorPickerSessionSchema.parse(request)
    const session = await locatorPickerSessionManager.startSession(parsedRequest)

    return {
      status: session.status === 'error' ? 500 : 200,
      success: session.status !== 'error',
      data: session,
      error: session.error,
    }
  } catch (error) {
    return {
      status: 500,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start the locator picker session.',
    }
  }
}

export async function getLocatorPickerSessionAction(sessionId: string): Promise<ActionResponse> {
  try {
    const session = await locatorPickerSessionManager.getSession(sessionId)
    if (!session) {
      return {
        status: 404,
        success: false,
        error: 'Locator picker session not found.',
      }
    }

    return {
      status: 200,
      success: true,
      data: session,
    }
  } catch (error) {
    return {
      status: 500,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load the locator picker session.',
    }
  }
}

export async function closeLocatorPickerSessionAction(sessionId: string): Promise<ActionResponse> {
  try {
    const session = await locatorPickerSessionManager.closeSession(sessionId)
    if (!session) {
      return {
        status: 404,
        success: false,
        error: 'Locator picker session not found.',
      }
    }

    return {
      status: 200,
      success: true,
      data: session,
    }
  } catch (error) {
    return {
      status: 500,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close the locator picker session.',
    }
  }
}

export async function savePickedLocatorAction(request: SavePickedLocatorRequest): Promise<ActionResponse> {
  try {
    const outcome = await savePickedLocatorFromRequest(request)

    if (outcome.kind === 'error') {
      return {
        status: outcome.status,
        success: false,
        error: outcome.message,
      }
    }

    revalidatePath('/locators')
    revalidatePath('/locator-groups')
    revalidatePath('/locators/create')
    if (outcome.wasUpdate) {
      revalidatePath(`/locators/modify/${outcome.locatorId}`)
    }

    return {
      status: 200,
      success: true,
      data: {
        locatorId: outcome.locatorId,
        locatorGroupId: outcome.locatorGroupId,
      },
      message: outcome.message,
    }
  } catch (error) {
    await locatorPickerSessionManager.markReadyAfterSave(request.sessionId).catch(() => undefined)
    return {
      status: 500,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save the picked locator.',
    }
  }
}
