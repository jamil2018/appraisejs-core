'use server'

import prisma from '@/config/db-config'
import { testRunSchema } from '@/constants/form-opts/test-run-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { z } from 'zod'
import { TestRunStatus, TestRunResult } from '@prisma/client'
import { executeTestRun } from '@/lib/test-run/test-run-executor'
import { waitForTask } from '@/tests/utils/spawner.util'

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

export async function getTestRunByIdAction(id: string): Promise<ActionResponse> {
  try {
    const testRun = await prisma.testRun.findUnique({
      where: { id },
      include: {
        testCases: {
          include: {
            testCase: true,
          },
        },
        tags: true,
        environment: true,
      },
    })

    if (!testRun) {
      return {
        status: 404,
        error: 'Test run not found',
      }
    }

    return {
      status: 200,
      data: testRun,
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
    // Validate input
    testRunSchema.parse(value)

    // Fetch environment and tags from database
    const environment = await prisma.environment.findUnique({
      where: { id: value.environmentId },
    })

    if (!environment) {
      return {
        status: 400,
        error: 'Environment not found',
      }
    }

    const tags = await prisma.tag.findMany({
      where: { id: { in: value.tags } },
    })

    // Create TestRun record in database with RUNNING status
    const testRun = await prisma.testRun.create({
      data: {
        environmentId: value.environmentId,
        testWorkersCount: value.testWorkersCount || 1,
        browserEngine: value.browserEngine,
        status: TestRunStatus.RUNNING,
        result: TestRunResult.PENDING,
        tags: {
          connect: tags.map(tag => ({ id: tag.id })),
        },
        testCases: {
          create: value.testCases.map(tc => ({
            testCaseId: tc.testCaseId,
          })),
        },
      },
    })

    // Execute test run asynchronously (don't await, let it run in background)
    console.log(`[TestRunAction] About to execute test run for testRunId: ${testRun.runId}`)
    console.log(`[TestRunAction] Config:`, {
      testRunId: testRun.runId,
      environment: environment.name,
      tags: tags.map(t => t.name),
      testWorkersCount: value.testWorkersCount || 1,
      browserEngine: value.browserEngine,
    })
    
    try {
      const executePromise = executeTestRun({
        testRunId: testRun.runId,
        environment,
        tags,
        testWorkersCount: value.testWorkersCount || 1,
        browserEngine: value.browserEngine,
        headless: true, // Default to headless
      })
      
      console.log(`[TestRunAction] executeTestRun promise created for testRunId: ${testRun.runId}`)
      
      executePromise
        .then(async process => {
          console.log(`[TestRunAction] Test run execution started successfully for testRunId: ${testRun.runId}, process name: ${process.name}`)
          // Wait for process to complete
          const exitCode = await waitForTask(process.name)

          // Update TestRun status based on exit code
          const status = exitCode === 0 ? TestRunStatus.COMPLETED : TestRunStatus.COMPLETED
          const result = exitCode === 0 ? TestRunResult.PASSED : TestRunResult.FAILED

          await prisma.testRun.update({
            where: { id: testRun.id },
            data: {
              status,
              result,
              completedAt: new Date(),
            },
          })
          console.log(`[TestRunAction] Test run completed for testRunId: ${testRun.runId}, exitCode: ${exitCode}`)
        })
        .catch(async error => {
          console.error(`[TestRunAction] Error executing test run for testRunId: ${testRun.runId}:`, error)
          console.error(`[TestRunAction] Error stack:`, error instanceof Error ? error.stack : 'No stack trace')
          // Update TestRun status to indicate failure
          await prisma.testRun.update({
            where: { id: testRun.id },
            data: {
              status: TestRunStatus.COMPLETED,
              result: TestRunResult.FAILED,
              completedAt: new Date(),
            },
          })
        })
    } catch (error) {
      // Catch any synchronous errors
      console.error(`[TestRunAction] Synchronous error calling executeTestRun for testRunId: ${testRun.runId}:`, error)
      console.error(`[TestRunAction] Error stack:`, error instanceof Error ? error.stack : 'No stack trace')
    }

    return {
      status: 200,
      message: 'Test run created successfully',
      data: { testRunId: testRun.runId, id: testRun.id },
    }
  } catch (error) {
    console.error('Error creating test run:', error)
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
