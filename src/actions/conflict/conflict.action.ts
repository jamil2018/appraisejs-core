'use server'

import { resolveConflictsByEntityIds } from '@/services/conflict/conflict-service'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'

export async function resolveConflictsAction(conflictIds: string[]): Promise<ActionResponse> {
  try {
    const count = await resolveConflictsByEntityIds(conflictIds)
    revalidatePath('/locators')
    return {
      status: 200,
      success: true,
      data: count,
      message: 'Conflicts resolved successfully',
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return serviceErrorToActionResponse(error)
    }
    return unknownErrorToActionResponse(error)
  }
}
