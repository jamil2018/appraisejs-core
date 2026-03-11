'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import prisma from '@/config/db-config'
import { revalidatePath } from 'next/cache'

export async function resolveConflictsAction(conflictIds: string[]): Promise<ActionResponse> {
  try {
    const updatedConflicts = await prisma.conflictResolution.updateMany({
      where: { entityId: { in: conflictIds } },
      data: { resolved: true },
    })

    revalidatePath('/locators')

    if (updatedConflicts.count === 0) {
      return {
        status: 404,
        error: 'No conflicts found',
      }
    }
    return {
      status: 200,
      data: updatedConflicts.count,
      message: 'Conflicts resolved successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
