import prisma from '@/config/db-config'
import { ActionResponse } from '@/types/form/actionHandler'

export async function getDashboardMetricsAction(): Promise<ActionResponse> {
  try {
    const dashboardMetrics = await prisma.dashboardMetrics.findFirst()
    return {
      status: 200,
      data: dashboardMetrics,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
