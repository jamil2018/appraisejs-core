'use server'

import { ActionResponse } from '@/types/form/actionHandler'
import { getRunningTestRunsCount } from '@/services/dashboard/dashboard-service'
import { unknownErrorToActionResponse } from '@/services/shared/errors'
import { requireActiveProjectForMutation } from '@/lib/active-project'

export async function getRunningTestRunsCountAction(targetProjectId?: string): Promise<ActionResponse> {
  try {
    const project = await requireActiveProjectForMutation(targetProjectId)
    const count = await getRunningTestRunsCount(project.id)
    return {
      status: 200,
      success: true,
      data: count,
    }
  } catch (error) {
    return unknownErrorToActionResponse(error)
  }
}
