'use server'

import prisma from '@/config/db-config'
import { testRunSchema } from '@/constants/form-opts/test-run-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { z } from 'zod'

export async function getAllTestRunsAction(): Promise<ActionResponse> {
  try {
    const testRuns = await prisma.testRun.findMany({
      include: {
        testCases: true,
        tags: true,
        environment: true,
      },
    })
    return {
      status: 200,
      data: testRuns,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function deleteTestRunAction(id: string[]): Promise<ActionResponse> {
  try {
    await prisma.testRun.deleteMany({
      where: { id: { in: id } },
    })
    return {
      status: 200,
      message: 'Test run(s) deleted successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function getAllTestSuiteTestCasesAction(): Promise<ActionResponse> {
  try {
    const testSuiteTestCases = await prisma.testSuite.findMany({
      include: {
        testCases: true,
      },
    })
    return {
      status: 200,
      data: testSuiteTestCases,
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}

export async function createTestRunAction(
  _prev: unknown,
  value: z.infer<typeof testRunSchema>,
): Promise<ActionResponse> {
  try {
    testRunSchema.parse(value)
    console.log(value)
    return {
      status: 200,
      message: 'Test run created successfully',
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
