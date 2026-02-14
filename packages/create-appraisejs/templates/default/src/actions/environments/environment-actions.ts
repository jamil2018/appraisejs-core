'use server'

import prisma from '@/config/db-config'
import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createOrUpdateEnvironmentsFile, updateEnvironmentEntry } from '@/lib/environment-file-utils'

/**
 * Check if an environment name already exists
 */
async function checkUniqueName(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.environment.findFirst({
    where: {
      name: name,
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

    // Update the environments.json file
    await createOrUpdateEnvironmentsFile()

    return {
      status: 200,
      data: environments,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function deleteEnvironmentAction(ids: string[]): Promise<ActionResponse> {
  try {
    await prisma.environment.deleteMany({
      where: {
        id: { in: ids },
      },
    })

    // Update the environments.json file
    await createOrUpdateEnvironmentsFile()

    revalidatePath('/environments')
    return {
      status: 200,
      message: 'Environments deleted successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function createEnvironmentAction(
  _prev: unknown,
  value: z.infer<typeof environmentSchema>,
): Promise<ActionResponse> {
  try {
    environmentSchema.parse(value)

    // Check if name already exists
    const nameExists = await checkUniqueName(value.name)
    if (nameExists) {
      return {
        status: 400,
        error: 'An environment with this name already exists. Please choose a different name.',
      }
    }

    // Convert empty strings to null for optional fields
    const environmentData = {
      ...value,
      apiBaseUrl: value.apiBaseUrl === '' ? null : value.apiBaseUrl,
      username: value.username === '' ? null : value.username,
      password: value.password === '' ? null : value.password,
    }

    const newEnvironment = await prisma.environment.create({
      data: environmentData,
    })

    // Update the environments.json file
    await createOrUpdateEnvironmentsFile()

    revalidatePath('/environments')
    return {
      status: 200,
      data: newEnvironment,
      message: 'Environment created successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function getEnvironmentByIdAction(id: string): Promise<ActionResponse> {
  try {
    const environmentData = await prisma.environment.findUniqueOrThrow({
      where: { id },
    })
    return {
      status: 200,
      data: environmentData,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function updateEnvironmentAction(
  _prev: unknown,
  value: z.infer<typeof environmentSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    environmentSchema.parse(value)

    // Get the current environment to check if name changed
    const currentEnvironment = await prisma.environment.findUnique({
      where: { id },
      select: { name: true },
    })

    // Check if name is being changed and if the new name already exists
    if (currentEnvironment?.name !== value.name) {
      const nameExists = await checkUniqueName(value.name, id)
      if (nameExists) {
        return {
          status: 400,
          error: 'An environment with this name already exists. Please choose a different name.',
        }
      }
    }

    // Convert empty strings to null for optional fields
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

    // Update the environments.json file
    // If name changed, we need to remove the old entry and add the new one
    const oldName = currentEnvironment?.name !== value.name ? currentEnvironment?.name : undefined
    await updateEnvironmentEntry(id!, oldName)

    revalidatePath('/environments')
    return {
      status: 200,
      data: updatedEnvironment,
      message: 'Environment updated successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

/**
 * Check if an environment name is unique
 */
export async function checkEnvironmentNameUniqueAction(name: string, excludeId?: string): Promise<ActionResponse> {
  try {
    const nameExists = await checkUniqueName(name, excludeId)
    return {
      status: 200,
      data: { isUnique: !nameExists },
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
