'use server'

import prisma from '@/config/db-config'
import { testRunSchema } from '@/constants/form-opts/test-run-form-opts'
import { ActionResponse } from '@/types/form/actionHandler'
import { z } from 'zod'
import {
  TestRunStatus,
  TestRunResult,
  TestRunTestCaseStatus,
  TestRunTestCaseResult,
  TagType,
  Tag,
} from '@prisma/client'
import { executeTestRun } from '@/lib/test-run/test-run-executor'
import { waitForTask } from '@/tests/utils/spawner.util'
import { revalidatePath } from 'next/cache'
import { formatLogsForStorage, parseLogsFromStorage, type LogEntry } from '@/lib/test-run/log-formatter'
import { processManager } from '@/lib/test-run/process-manager'

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
    revalidatePath('/test-runs')
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

/**
 * Stores test run logs in the database
 * @param testRunId - The test run ID (runId, not id)
 * @param logs - Array of log entries to store
 */
export async function storeTestRunLogsAction(testRunId: string, logs: LogEntry[]): Promise<ActionResponse> {
  try {
    if (logs.length === 0) {
      return {
        status: 200,
        message: 'No logs to store',
      }
    }

    // Format logs for storage
    const formattedLogs = formatLogsForStorage(logs)

    // Upsert logs in TestRunLog table
    await prisma.testRunLog.upsert({
      where: { testRunId },
      create: {
        testRunId,
        logs: formattedLogs,
      },
      update: {
        logs: formattedLogs,
      },
    })

    return {
      status: 200,
      message: 'Logs stored successfully',
    }
  } catch (error) {
    console.error(`[TestRunAction] Error storing logs for testRunId: ${testRunId}:`, error)
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Retrieves test run logs from the database
 * @param testRunId - The test run ID (runId, not id)
 */
export async function getTestRunLogsAction(testRunId: string): Promise<ActionResponse> {
  try {
    const testRunLog = await prisma.testRunLog.findUnique({
      where: { testRunId },
    })

    if (!testRunLog) {
      return {
        status: 200,
        data: [],
      }
    }

    // Parse logs from storage
    const logs = parseLogsFromStorage(testRunLog.logs)

    return {
      status: 200,
      data: logs,
    }
  } catch (error) {
    console.error(`[TestRunAction] Error retrieving logs for testRunId: ${testRunId}:`, error)
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // Determine if we're filtering by tags or test cases
    const isFilteringByTags = value.tags.length > 0
    const isFilteringByTestCases = value.testCases.length > 0 && value.tags.length === 0

    // Validate that at least one filtering option is provided
    if (!isFilteringByTags && !isFilteringByTestCases) {
      return {
        status: 400,
        error: 'Either tags or test cases must be provided to filter the test run.',
      }
    }

    let tags: Tag[] = []
    let testRunTestCases: Array<{ testCaseId: string }> = []

    if (isFilteringByTags) {
      // Existing behavior: filter by tags
      tags = await prisma.tag.findMany({
        where: { id: { in: value.tags } },
      })

      const tagFilteredTestCases = await prisma.testCase.findMany({
        where: {
          tags: {
            some: { id: { in: value.tags } },
          },
        },
      })

      testRunTestCases = tagFilteredTestCases.map(tc => ({
        testCaseId: tc.id,
      }))
    } else if (isFilteringByTestCases) {
      // New behavior: filter by test cases - extract identifier tags
      const selectedTestCases = await prisma.testCase.findMany({
        where: {
          id: { in: value.testCases.map(tc => tc.testCaseId) },
        },
        include: {
          tags: true,
        },
      })

      // Extract identifier tags from selected test cases
      const identifierTags = selectedTestCases
        .flatMap(tc => tc.tags)
        .filter(tag => tag.type === TagType.IDENTIFIER)
        // Remove duplicates by id
        .filter((tag, index, self) => index === self.findIndex(t => t.id === tag.id))

      // Safety check: if no identifier tags found, this would run all tests
      // which is not what the user expects when they select specific test cases
      if (identifierTags.length === 0) {
        return {
          status: 400,
          error: 'Selected test cases do not have identifier tags. Cannot execute specific test cases.',
        }
      }

      // Filter to only include test cases that have identifier tags
      // Test cases without identifier tags cannot be executed and should be excluded
      const testCasesWithIdentifierTags = selectedTestCases.filter(tc =>
        tc.tags.some(tag => tag.type === TagType.IDENTIFIER),
      )

      // Log warning if some test cases don't have identifier tags
      const testCasesWithoutIdentifierTags = selectedTestCases.filter(
        tc => !tc.tags.some(tag => tag.type === TagType.IDENTIFIER),
      )
      if (testCasesWithoutIdentifierTags.length > 0) {
        console.warn(
          `[TestRunAction] Some selected test cases (${testCasesWithoutIdentifierTags.length}) do not have identifier tags and will not be executed.`,
        )
      }

      tags = identifierTags

      // Only include test cases that have identifier tags
      testRunTestCases = testCasesWithIdentifierTags.map(tc => ({
        testCaseId: tc.id,
      }))
    }

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
          create: testRunTestCases.map(tc => ({
            testCaseId: tc.testCaseId,
          })),
        },
      },
    })

    // Execute test run asynchronously (don't await, let it run in background)
    try {
      const executePromise = executeTestRun({
        testRunId: testRun.runId,
        environment,
        tags,
        testWorkersCount: value.testWorkersCount || 1,
        browserEngine: value.browserEngine,
        headless: true, // Default to headless
      })

      // Set up server-side listener for scenario::end events to update test case statuses
      // This ensures status updates happen even if no client is connected
      const onScenarioEnd = async (eventData: { testRunId: string; scenarioName: string; status: string }) => {
        // Only process events for this test run
        if (eventData.testRunId === testRun.runId) {
          console.log(
            `[TestRunAction] Server-side scenario::end event for testRunId: ${testRun.runId}, scenario: ${eventData.scenarioName}, status: ${eventData.status}`,
          )
          // Map the status string to the expected format
          const statusMap: Record<string, 'passed' | 'failed' | 'skipped' | 'unknown'> = {
            passed: 'passed',
            failed: 'failed',
            skipped: 'skipped',
          }
          const mappedStatus = statusMap[eventData.status] || 'unknown'
          // Update test case status in database
          await updateTestRunTestCaseStatusAction(testRun.runId, eventData.scenarioName, mappedStatus)
        }
      }

      // Register the server-side listener
      processManager.on('scenario::end', onScenarioEnd)
      console.log(`[TestRunAction] Registered server-side scenario::end listener for testRunId: ${testRun.runId}`)

      // Cleanup function to remove the listener
      const cleanupListener = () => {
        processManager.removeListener('scenario::end', onScenarioEnd)
        console.log(`[TestRunAction] Removed server-side scenario::end listener for testRunId: ${testRun.runId}`)
      }

      executePromise
        .then(async process => {
          // Wait for process to complete
          const exitCode = await waitForTask(process.name)

          // Collect all logs from the process output
          const logEntries: LogEntry[] = []

          // Add stdout logs
          if (process.output.stdout.length > 0) {
            const stdoutText = process.output.stdout.join('')
            const stdoutLines = stdoutText.split('\n').filter(line => line.trim() !== '')
            stdoutLines.forEach((line, index) => {
              const timestamp = new Date(process.startTime.getTime() + index * 10)
              logEntries.push({
                type: 'stdout',
                message: line,
                timestamp,
              })
            })
          }

          // Add stderr logs
          if (process.output.stderr.length > 0) {
            const stderrText = process.output.stderr.join('')
            const stderrLines = stderrText.split('\n').filter(line => line.trim() !== '')
            const stdoutCount = logEntries.filter(e => e.type === 'stdout').length
            stderrLines.forEach((line, index) => {
              const timestamp = new Date(process.startTime.getTime() + stdoutCount * 10 + index * 10)
              logEntries.push({
                type: 'stderr',
                message: line,
                timestamp,
              })
            })
          }

          // Add exit status log
          logEntries.push({
            type: 'status',
            message: `Process exited with code ${exitCode}`,
            timestamp: process.endTime || new Date(),
          })

          // Store logs in database
          await storeTestRunLogsAction(testRun.runId, logEntries)

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

          // Clean up the server-side event listener
          cleanupListener()
        })
        .catch(async error => {
          console.error(`[TestRunAction] Error executing test run for testRunId: ${testRun.runId}:`, error)
          // Update TestRun status to indicate failure
          await prisma.testRun.update({
            where: { id: testRun.id },
            data: {
              status: TestRunStatus.COMPLETED,
              result: TestRunResult.FAILED,
              completedAt: new Date(),
            },
          })

          // Clean up the server-side event listener
          cleanupListener()
        })
    } catch (error) {
      // Catch any synchronous errors
      console.error(`[TestRunAction] Synchronous error calling executeTestRun for testRunId: ${testRun.runId}:`, error)
      console.error(`[TestRunAction] Error stack:`, error instanceof Error ? error.stack : 'No stack trace')
      // Note: If executeTestRun throws synchronously, the listener won't be set up, so no cleanup needed
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

/**
 * Updates a test case status and result in a test run based on scenario completion
 * @param testRunId - The test run ID (runId, not id)
 * @param scenarioName - The scenario name from cucumber (format: "[Test Case Title] Description")
 * @param status - The scenario status (passed, failed, skipped)
 */
export async function updateTestRunTestCaseStatusAction(
  testRunId: string,
  scenarioName: string,
  status: 'passed' | 'failed' | 'skipped' | 'unknown',
): Promise<ActionResponse> {
  try {
    // Find the test run by runId
    const testRun = await prisma.testRun.findUnique({
      where: { runId: testRunId },
      include: {
        testCases: {
          include: {
            testCase: true,
          },
        },
      },
    })

    if (!testRun) {
      return {
        status: 404,
        error: 'Test run not found',
      }
    }

    // Parse scenario name to extract test case title
    // Format: "[Test Case Title] Description" or just "Test Case Title"
    let testCaseTitle: string | null = null

    // Try to extract title from [brackets]
    const bracketMatch = scenarioName.match(/^\[([^\]]+)\]/)
    if (bracketMatch) {
      testCaseTitle = bracketMatch[1].trim()
    } else {
      // If no brackets, use the full scenario name (might be just the title)
      testCaseTitle = scenarioName.trim()
    }

    if (!testCaseTitle) {
      return {
        status: 400,
        error: 'Could not extract test case title from scenario name',
      }
    }

    // Find matching test case by title
    const matchingTestCase = testRun.testCases.find(trtc => trtc.testCase.title === testCaseTitle)

    if (!matchingTestCase) {
      console.warn(
        `[TestRunAction] No matching test case found for scenario: ${scenarioName} (extracted title: ${testCaseTitle})`,
      )
      return {
        status: 404,
        error: `Test case not found for scenario: ${scenarioName}`,
      }
    }

    // Map status to TestRunTestCaseStatus and TestRunTestCaseResult
    const testCaseStatus: TestRunTestCaseStatus = TestRunTestCaseStatus.COMPLETED
    let testCaseResult: TestRunTestCaseResult

    switch (status) {
      case 'passed':
        testCaseResult = TestRunTestCaseResult.PASSED
        break
      case 'failed':
        testCaseResult = TestRunTestCaseResult.FAILED
        break
      case 'skipped':
        testCaseResult = TestRunTestCaseResult.UNTESTED // Skipped is treated as untested
        break
      default:
        testCaseResult = TestRunTestCaseResult.UNTESTED
    }

    // Update the TestRunTestCase
    await prisma.testRunTestCase.update({
      where: { id: matchingTestCase.id },
      data: {
        status: testCaseStatus,
        result: testCaseResult,
      },
    })

    return {
      status: 200,
      message: 'Test case status updated successfully',
    }
  } catch (error) {
    console.error(
      `[TestRunAction] Error updating test case status for testRunId: ${testRunId}, scenario: ${scenarioName}:`,
      error,
    )
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
