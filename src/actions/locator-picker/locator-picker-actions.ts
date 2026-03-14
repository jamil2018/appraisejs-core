'use server'

import prisma from '@/config/db-config'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { locatorPickerSessionManager } from '@/lib/locator-picker/session-manager'
import type { ActionResponse } from '@/types/form/actionHandler'
import type { SavePickedLocatorRequest, StartLocatorPickerSessionRequest } from '@/types/locator-picker'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const startLocatorPickerSessionSchema = z
  .object({
    environmentId: z.string().optional(),
    url: z.string().optional(),
    browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
  })
  .refine(value => Boolean(value.environmentId || value.url), {
    message: 'Choose an environment or provide a URL.',
  })

const savePickedLocatorSchema = z.object({
  sessionId: z.string().min(1),
  locatorName: z.string().min(1, { message: 'Locator name is required.' }),
  selector: z.string().min(1, { message: 'Selector is required.' }),
  resolutionMode: z.enum(['existing', 'create']),
  existingLocatorGroupId: z.string().optional(),
  newLocatorGroupName: z.string().optional(),
  route: z.string().optional(),
  moduleId: z.string().optional(),
})

function normalizeRoute(value: string | undefined): string {
  if (!value || value.trim() === '') {
    return '/'
  }

  try {
    const parsed = new URL(value)
    return parsed.pathname || '/'
  } catch {
    return value.startsWith('/') ? value : `/${value}`
  }
}

export async function startLocatorPickerSessionAction(
  request: StartLocatorPickerSessionRequest,
): Promise<ActionResponse> {
  try {
    const parsedRequest = startLocatorPickerSessionSchema.parse(request)
    const session = await locatorPickerSessionManager.startSession(parsedRequest)

    return {
      status: session.status === 'error' ? 500 : 200,
      data: session,
      error: session.error,
    }
  } catch (error) {
    return {
      status: 500,
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
        error: 'Locator picker session not found.',
      }
    }

    return {
      status: 200,
      data: session,
    }
  } catch (error) {
    return {
      status: 500,
      error: error instanceof Error ? error.message : 'Failed to load the locator picker session.',
    }
  }
}

export async function toggleLocatorPickerSelectionModeAction(
  sessionId: string,
  enabled: boolean,
): Promise<ActionResponse> {
  try {
    const session = await locatorPickerSessionManager.updateSelectionMode(sessionId, enabled)
    return {
      status: 200,
      data: session,
    }
  } catch (error) {
    return {
      status: 500,
      error: error instanceof Error ? error.message : 'Failed to update picker selection mode.',
    }
  }
}

export async function closeLocatorPickerSessionAction(sessionId: string): Promise<ActionResponse> {
  try {
    const session = await locatorPickerSessionManager.closeSession(sessionId)
    if (!session) {
      return {
        status: 404,
        error: 'Locator picker session not found.',
      }
    }

    return {
      status: 200,
      data: session,
    }
  } catch (error) {
    return {
      status: 500,
      error: error instanceof Error ? error.message : 'Failed to close the locator picker session.',
    }
  }
}

export async function savePickedLocatorAction(request: SavePickedLocatorRequest): Promise<ActionResponse> {
  try {
    const value = savePickedLocatorSchema.parse(request)
    const session = await locatorPickerSessionManager.getSession(value.sessionId)
    const fail = async (status: number, error: string): Promise<ActionResponse> => {
      await locatorPickerSessionManager.markReadyAfterSave(value.sessionId)
      return { status, error }
    }

    if (!session) {
      return {
        status: 404,
        error: 'Locator picker session not found.',
      }
    }

    if (!session.pickedElement) {
      return {
        status: 400,
        error: 'Select an element in the picker before saving.',
      }
    }

    await locatorPickerSessionManager.markSaving(value.sessionId)

    let locatorGroupId = value.existingLocatorGroupId
    let locatorGroupName = ''
    const route = normalizeRoute(value.route || session.currentPathname)

    if (value.resolutionMode === 'existing') {
      if (!locatorGroupId) {
        return fail(400, 'Choose an existing locator group before saving.')
      }

      const locatorGroup = await prisma.locatorGroup.findUnique({
        where: {
          id: locatorGroupId,
        },
      })

      if (!locatorGroup) {
        return fail(404, 'The selected locator group no longer exists.')
      }

      locatorGroupName = locatorGroup.name
    } else {
      if (!value.newLocatorGroupName || value.newLocatorGroupName.trim() === '') {
        return fail(400, 'Locator group name is required when creating a new group.')
      }

      if (!value.moduleId) {
        return fail(400, 'Choose a module for the new locator group.')
      }

      const duplicateGroup = await prisma.locatorGroup.findFirst({
        where: {
          name: value.newLocatorGroupName.trim(),
        },
      })

      if (duplicateGroup) {
        return fail(400, 'A locator group with this name already exists. Choose a different name.')
      }

      const newLocatorGroup = await prisma.locatorGroup.create({
        data: {
          name: value.newLocatorGroupName.trim(),
          route,
          moduleId: value.moduleId,
        },
      })

      locatorGroupId = newLocatorGroup.id
      locatorGroupName = newLocatorGroup.name

      await automationProjectionService.createEmptyLocatorGroup(newLocatorGroup.id)
      await automationProjectionService.syncLocatorMap(newLocatorGroup.name, route)
    }

    if (!locatorGroupId) {
      return fail(500, 'Failed to resolve the locator group for saving.')
    }

    const existingLocator = await prisma.locator.findFirst({
      where: {
        locatorGroupId,
        name: value.locatorName.trim(),
      },
    })

    if (existingLocator) {
      return fail(400, `A locator named "${value.locatorName.trim()}" already exists in ${locatorGroupName}.`)
    }

    const locator = await prisma.locator.create({
      data: {
        name: value.locatorName.trim(),
        value: value.selector.trim(),
        locatorGroupId,
      },
    })

    await automationProjectionService.syncLocatorGroup(locatorGroupId)
    await locatorPickerSessionManager.markReadyAfterSave(value.sessionId)

    revalidatePath('/locators')
    revalidatePath('/locator-groups')

    return {
      status: 200,
      data: {
        locatorId: locator.id,
        locatorGroupId,
      },
      message: 'Locator saved successfully.',
    }
  } catch (error) {
    await locatorPickerSessionManager.markReadyAfterSave(request.sessionId).catch(() => undefined)
    return {
      status: 500,
      error: error instanceof Error ? error.message : 'Failed to save the picked locator.',
    }
  }
}
