'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import prisma from '@/config/db-config'
import { revalidatePath } from 'next/cache'
import { unknownErrorToActionResponse } from '@/services/shared/errors'

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
        success: false,
        error: 'No conflicts found',
      }
    }
    return {
      status: 200,
      success: true,
      data: updatedConflicts.count,
      message: 'Conflicts resolved successfully',
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
