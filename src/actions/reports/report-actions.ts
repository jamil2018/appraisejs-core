'use server'

import { sampleReportData } from '@/app/(base)/reports/sample-report-data'
import { ActionResponse } from '@/types/form/actionHandler'

export const getAllReportsAction = async (): Promise<ActionResponse> => {
  try {
    return {
      status: 200,
      data: sampleReportData,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
