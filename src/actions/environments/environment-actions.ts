'use server'

import prisma from '@/config/db-config'
import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { unknownErrorToActionResponse } from '@/services/shared/errors'

async function checkUniqueName(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.environment.findFirst({
    where: {
      name,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })
  return !!existing
}

export async function getAllEnvironmentsAction(): Promise<ActionResponse> {
  try {
    const environments = await prisma.environment.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    })

    await automationProjectionService.syncEnvironments()

    return {
      status: 200,
      success: true,
      data: environments,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function deleteEnvironmentAction(ids: string[]): Promise<ActionResponse> {
  try {
    await prisma.environment.deleteMany({
      where: {
        id: { in: ids },
      },
    })

    await automationProjectionService.syncEnvironments()

    revalidatePath('/environments')
    return {
      status: 200,
      success: true,
      message: 'Environments deleted successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function createEnvironmentAction(
  _prev: unknown,
  value: z.infer<typeof environmentSchema>,
): Promise<ActionResponse> {
  try {
    environmentSchema.parse(value)

    const nameExists = await checkUniqueName(value.name)
    if (nameExists) {
      return {
        status: 400,
        success: false,
        error: 'An environment with this name already exists. Please choose a different name.',
      }
    }

    const environmentData = {
      ...value,
      apiBaseUrl: value.apiBaseUrl === '' ? null : value.apiBaseUrl,
      username: value.username === '' ? null : value.username,
      password: value.password === '' ? null : value.password,
    }

    const newEnvironment = await prisma.environment.create({
      data: environmentData,
    })

    await automationProjectionService.syncEnvironments()

    revalidatePath('/environments')
    return {
      status: 200,
      success: true,
      data: newEnvironment,
      message: 'Environment created successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function getEnvironmentByIdAction(id: string): Promise<ActionResponse> {
  try {
    const environmentData = await prisma.environment.findUnique({
      where: { id },
    })
    if (!environmentData) {
      return {
        status: 404,
        success: false,
        error: 'Environment not found',
      }
    }
    return {
      status: 200,
      success: true,
      data: environmentData,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function updateEnvironmentAction(
  _prev: unknown,
  value: z.infer<typeof environmentSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    environmentSchema.parse(value)

    const currentEnvironment = await prisma.environment.findUnique({
      where: { id },
      select: { name: true },
    })

    if (currentEnvironment?.name !== value.name) {
      const nameExists = await checkUniqueName(value.name, id)
      if (nameExists) {
        return {
          status: 400,
          success: false,
          error: 'An environment with this name already exists. Please choose a different name.',
        }
      }
    }

    const environmentData = {
      ...value,
      apiBaseUrl: value.apiBaseUrl === '' ? null : value.apiBaseUrl,
      username: value.username === '' ? null : value.username,
      password: value.password === '' ? null : value.password,
    }

    const updatedEnvironment = await prisma.environment.update({
      where: { id },
      data: environmentData,
    })

    await automationProjectionService.syncEnvironments()

    revalidatePath('/environments')
    return {
      status: 200,
      success: true,
      data: updatedEnvironment,
      message: 'Environment updated successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}

export async function checkEnvironmentNameUniqueAction(name: string, excludeId?: string): Promise<ActionResponse> {
  try {
    const nameExists = await checkUniqueName(name, excludeId)
    return {
      status: 200,
      success: true,
      data: { isUnique: !nameExists },
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
