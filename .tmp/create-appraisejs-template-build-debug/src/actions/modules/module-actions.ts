'use server'

import prisma from '@/config/db-config'
import { moduleSchema, ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function getAllModulesAction(): Promise<ActionResponse> {
  try {
    const modules = await prisma.module.findMany({
      include: {
        parent: {
          select: {
            name: true,
          },
        },
      },
    })
    return {
      status: 200,
      data: modules,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function deleteModuleAction(ids: string[]): Promise<ActionResponse> {
  try {
    await prisma.module.deleteMany({
      where: {
        id: { in: ids },
      },
    })
    await automationProjectionService.regenerateAllPathDependentArtifacts()
    revalidatePath('/modules')
    return {
      status: 200,
      message: 'Modules deleted successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function createModuleAction(_prev: unknown, value: z.infer<typeof moduleSchema>): Promise<ActionResponse> {
  try {
    moduleSchema.parse(value)

    const moduleData = {
      ...value,
      parentId: value.parentId === ROOT_MODULE_UUID ? null : value.parentId,
    }

    const newModule = await prisma.module.create({
      data: moduleData,
    })
    await automationProjectionService.regenerateAllPathDependentArtifacts()
    revalidatePath('/modules')
    return {
      status: 200,
      data: newModule,
      message: 'Module created successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function getModuleByIdAction(id: string): Promise<ActionResponse> {
  try {
    const moduleData = await prisma.module.findUniqueOrThrow({
      where: { id },
      include: {
        parent: {
          select: {
            name: true,
          },
        },
      },
    })
    return {
      status: 200,
      data: moduleData,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function updateModuleAction(
  _prev: unknown,
  value: z.infer<typeof moduleSchema>,
  id?: string,
): Promise<ActionResponse> {
  try {
    moduleSchema.parse(value)

    const moduleData = {
      ...value,
      parentId: value.parentId === ROOT_MODULE_UUID ? null : value.parentId,
    }

    const updatedModule = await prisma.module.update({
      where: { id },
      data: moduleData,
    })
    await automationProjectionService.regenerateAllPathDependentArtifacts()
    revalidatePath('/modules')
    return {
      status: 200,
      data: updatedModule,
      message: 'Module updated successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
