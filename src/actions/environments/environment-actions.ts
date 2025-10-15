'use server'

import prisma from '@/config/db-config'
import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function getAllEnvironmentsAction(): Promise<ActionResponse> {
  try {
    const environments = await prisma.environment.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    })
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
