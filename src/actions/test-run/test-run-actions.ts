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
import { waitForTask, taskSpawner, killTask } from '@/tests/utils/spawner.util'
import { revalidatePath } from 'next/cache'
import { formatLogsForStorage, parseLogsFromStorage, type LogEntry } from '@/lib/test-run/log-formatter'
import { processManager } from '@/lib/test-run/process-manager'
import { createTestRunLogger, closeLogger, getLogFilePath } from '@/lib/test-run/winston-logger'
import { promises as fs } from 'fs'
import path from 'path'
import { Prisma } from '@prisma/client'

/**
 * Check if a test run name already exists
 */
async function checkUniqueName(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.testRun.findFirst({
    where: {
      name: name,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })
  return !!existing
}

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

    // Check if name already exists
    const nameExists = await checkUniqueName(value.name)
    if (nameExists) {
      return {
        status: 400,
        error: 'A test run with this name already exists. Please choose a different name.',
      }
    }

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
        name: value.name,
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

    // Initialize Winston logger for this test run
    const logger = await createTestRunLogger(testRun.runId)
    const logFilePath = getLogFilePath(testRun.runId)

    // Store log file path in database
    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        logPath: logFilePath,
      },
    })

    // Execute test run asynchronously (don't await, let it run in background)
    try {
      const { process: spawnedProcess, reportPath } = await executeTestRun({
        testRunId: testRun.runId,
        environment,
        tags,
        testWorkersCount: value.testWorkersCount || 1,
        browserEngine: value.browserEngine,
        headless: true, // Default to headless
      })

      // Store report path in TestRun record
      await prisma.testRun.update({
        where: { id: testRun.id },
        data: {
          reportPath,
        },
      })

      const executePromise = Promise.resolve(spawnedProcess)

      // Set up server-side listener for scenario::end events to update test case statuses
      // This ensures status updates happen even if no client is connected
      const onScenarioEnd = async (eventData: {
        testRunId: string
        scenarioName: string
        status: string
        tracePath?: string
      }) => {
        // Only process events for this test run
        if (eventData.testRunId === testRun.runId) {
          console.log(
            `[TestRunAction] Server-side scenario::end event for testRunId: ${testRun.runId}, scenario: ${eventData.scenarioName}, status: ${eventData.status}${eventData.tracePath ? `, tracePath: ${eventData.tracePath}` : ''}`,
          )
          // Map the status string to the expected format
          const statusMap: Record<string, 'passed' | 'failed' | 'skipped' | 'unknown'> = {
            passed: 'passed',
            failed: 'failed',
            skipped: 'skipped',
          }
          const mappedStatus = statusMap[eventData.status] || 'unknown'
          // Update test case status in database
          await updateTestRunTestCaseStatusAction(
            testRun.runId,
            eventData.scenarioName,
            mappedStatus,
            eventData.tracePath,
          )
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
        .then(async spawnedProcess => {
          // Wait for process to complete
          const exitCode = await waitForTask(spawnedProcess.name)

          // Collect all logs from the process output
          const logEntries: LogEntry[] = []

          // Add stdout logs
          if (spawnedProcess.output.stdout.length > 0) {
            const stdoutText = spawnedProcess.output.stdout.join('')
            const stdoutLines = stdoutText.split('\n').filter(line => line.trim() !== '')
            stdoutLines.forEach((line, index) => {
              const timestamp = new Date(spawnedProcess.startTime.getTime() + index * 10)
              logEntries.push({
                type: 'stdout',
                message: line,
                timestamp,
              })
              // Log to Winston logger
              logger.info(line)
            })
          }

          // Add stderr logs
          if (spawnedProcess.output.stderr.length > 0) {
            const stderrText = spawnedProcess.output.stderr.join('')
            const stderrLines = stderrText.split('\n').filter(line => line.trim() !== '')
            const stdoutCount = logEntries.filter(e => e.type === 'stdout').length
            stderrLines.forEach((line, index) => {
              const timestamp = new Date(spawnedProcess.startTime.getTime() + stdoutCount * 10 + index * 10)
              logEntries.push({
                type: 'stderr',
                message: line,
                timestamp,
              })
              // Log to Winston logger
              logger.error(line)
            })
          }

          // Add exit status log
          const exitMessage = `Process exited with code ${exitCode}`
          logEntries.push({
            type: 'status',
            message: exitMessage,
            timestamp: spawnedProcess.endTime || new Date(),
          })
          // Log exit status to Winston logger
          logger.info(exitMessage)

          // Store logs in database
          await storeTestRunLogsAction(testRun.runId, logEntries)

          // Close Winston logger
          await closeLogger(logger)

          // Check current status before updating - preserve CANCELLED status if already set
          const currentTestRun = await prisma.testRun.findUnique({
            where: { id: testRun.id },
            select: { status: true, result: true },
          })

          // Only update to COMPLETED if not already CANCELLED or CANCELLING
          if (
            currentTestRun &&
            currentTestRun.status !== TestRunStatus.CANCELLED &&
            currentTestRun.status !== TestRunStatus.CANCELLING
          ) {
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
          } else {
            // Status is already CANCELLED or CANCELLING, just update completedAt if not set
            if (currentTestRun && !currentTestRun.result) {
              await prisma.testRun.update({
                where: { id: testRun.id },
                data: {
                  completedAt: new Date(),
                },
              })
            }
          }

          // Clean up the server-side event listener
          cleanupListener()

          // Store report in database if report path exists
          if (reportPath) {
            try {
              const { storeReportFromFile } = await import('@/actions/reports/report-actions')
              const reportResult = await storeReportFromFile(testRun.runId, reportPath)
              if (reportResult.status === 200) {
                console.log(`[TestRunAction] Report stored successfully for testRunId: ${testRun.runId}`)
              } else {
                console.warn(
                  `[TestRunAction] Failed to store report for testRunId: ${testRun.runId}: ${reportResult.error}`,
                )
              }
            } catch (error) {
              console.error(
                `[TestRunAction] Error storing report for testRunId: ${testRun.runId}:`,
                error,
              )
              // Don't fail the test run if report storage fails
            }
          } else {
            console.warn(`[TestRunAction] No report path available for testRunId: ${testRun.runId}`)
          }
        })
        .catch(async error => {
          console.error(`[TestRunAction] Error executing test run for testRunId: ${testRun.runId}:`, error)

          // Log error to Winston logger
          logger.error(`Error executing test run: ${error instanceof Error ? error.message : String(error)}`)
          if (error instanceof Error && error.stack) {
            logger.error(error.stack)
          }

          // Close Winston logger
          await closeLogger(logger).catch(err => {
            console.error(`[TestRunAction] Error closing logger for testRunId: ${testRun.runId}:`, err)
          })

          // Check current status before updating - preserve CANCELLED status if already set
          const currentTestRun = await prisma.testRun.findUnique({
            where: { id: testRun.id },
            select: { status: true, result: true },
          })

          // Only update to COMPLETED if not already CANCELLED or CANCELLING
          if (
            currentTestRun &&
            currentTestRun.status !== TestRunStatus.CANCELLED &&
            currentTestRun.status !== TestRunStatus.CANCELLING
          ) {
            // Update TestRun status to indicate failure
            await prisma.testRun.update({
              where: { id: testRun.id },
              data: {
                status: TestRunStatus.COMPLETED,
                result: TestRunResult.FAILED,
                completedAt: new Date(),
              },
            })
          } else {
            // Status is already CANCELLED or CANCELLING, just update completedAt if not set
            if (currentTestRun && !currentTestRun.result) {
              await prisma.testRun.update({
                where: { id: testRun.id },
                data: {
                  completedAt: new Date(),
                },
              })
            }
          }

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
    // Handle Prisma unique constraint error
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        status: 400,
        error: 'A test run with this name already exists. Please choose a different name.',
      }
    }
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
 * @param tracePath - Optional trace path for failed scenarios
 */
export async function updateTestRunTestCaseStatusAction(
  testRunId: string,
  scenarioName: string,
  status: 'passed' | 'failed' | 'skipped' | 'unknown',
  tracePath?: string,
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
      // This is expected when scenarios run without corresponding test cases (e.g., when filtered by tags)
      // Return success status to indicate this was handled gracefully
      console.log(
        `[TestRunAction] No matching test case found for scenario: ${scenarioName} (extracted title: ${testCaseTitle}). This is expected when scenarios run without corresponding test cases.`,
      )
      return {
        status: 200,
        message: `Scenario "${scenarioName}" completed but has no corresponding test case in this test run (likely filtered by tags)`,
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
        tracePath: tracePath || null,
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

/**
 * Checks if a trace viewer is currently running for a test case
 * @param testRunId - The test run ID (runId, not id)
 * @param testCaseId - The test case ID (TestRunTestCase id, not TestCase id)
 * @returns ActionResponse with isRunning status
 */
export async function checkTraceViewerStatusAction(testRunId: string, testCaseId: string): Promise<ActionResponse> {
  try {
    // Verify test run exists
    const testRun = await prisma.testRun.findUnique({
      where: { runId: testRunId },
      include: {
        testCases: {
          where: { id: testCaseId },
        },
      },
    })

    if (!testRun) {
      return {
        status: 404,
        error: 'Test run not found',
      }
    }

    // Verify test case belongs to this test run
    const testRunTestCase = testRun.testCases.find(tc => tc.id === testCaseId)
    if (!testRunTestCase) {
      return {
        status: 404,
        error: 'Test case not found in this test run',
      }
    }

    // Check if trace viewer process is running
    const processName = `trace-viewer-${testCaseId}`
    const process = taskSpawner.getProcess(processName)
    const isRunning = process?.isRunning ?? false

    return {
      status: 200,
      data: {
        isRunning,
        processName: isRunning ? processName : null,
      },
    }
  } catch (error) {
    console.error(
      `[TestRunAction] Error checking trace viewer status for testRunId: ${testRunId}, testCaseId: ${testCaseId}:`,
      error,
    )
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Spawns Playwright trace viewer for a failed test case
 * @param testRunId - The test run ID (runId, not id)
 * @param testCaseId - The test case ID (TestRunTestCase id, not TestCase id)
 * @returns ActionResponse indicating success or failure
 */
export async function spawnTraceViewerAction(testRunId: string, testCaseId: string): Promise<ActionResponse> {
  try {
    // Verify test run exists
    const testRun = await prisma.testRun.findUnique({
      where: { runId: testRunId },
      include: {
        testCases: {
          where: { id: testCaseId },
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

    // Verify test case belongs to this test run
    const testRunTestCase = testRun.testCases.find(tc => tc.id === testCaseId)
    if (!testRunTestCase) {
      return {
        status: 404,
        error: 'Test case not found in this test run',
      }
    }

    // Get trace path from database
    const tracePath = testRunTestCase.tracePath
    if (!tracePath) {
      return {
        status: 400,
        error: 'No trace path available for this test case',
      }
    }

    // Validate trace file exists
    try {
      await fs.access(tracePath)
    } catch {
      return {
        status: 404,
        error: `Trace file not found at path: ${tracePath}`,
      }
    }

    // Resolve absolute path if relative
    const absoluteTracePath = path.isAbsolute(tracePath) ? tracePath : path.join(process.cwd(), tracePath)

    // Spawn playwright show-trace command
    // The process is self-closing when the user closes the trace viewer
    const spawnedProcess = await taskSpawner.spawn('npx', ['playwright', 'show-trace', absoluteTracePath], {
      streamLogs: true,
      prefixLogs: true,
      logPrefix: `trace-viewer-${testCaseId}`,
      captureOutput: false, // No need to capture output for trace viewer
    })

    console.log(
      `[TestRunAction] Spawned trace viewer process for testCaseId: ${testCaseId}, tracePath: ${absoluteTracePath}`,
    )

    return {
      status: 200,
      message: 'Trace viewer launched successfully',
      data: {
        processName: spawnedProcess.name,
      },
    }
  } catch (error) {
    console.error(
      `[TestRunAction] Error spawning trace viewer for testRunId: ${testRunId}, testCaseId: ${testCaseId}:`,
      error,
    )
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function cancelTestRunAction(testRunId: string): Promise<ActionResponse> {
  try {
    const testRun = await prisma.testRun.findUnique({
      where: { runId: testRunId },
    })
    if (!testRun) {
      return {
        status: 404,
        error: 'Test run not found',
      }
    }

    if (
      testRun.status !== TestRunStatus.RUNNING &&
      testRun.status !== TestRunStatus.QUEUED &&
      testRun.status !== TestRunStatus.CANCELLING
    ) {
      return {
        status: 400,
        error: 'Test run is not running, queued, or already being cancelled',
      }
    }

    // If already cancelling, don't proceed
    if (testRun.status === TestRunStatus.CANCELLING) {
      return {
        status: 200,
        message: 'Test run cancellation is already in progress',
      }
    }

    // Set status to CANCELLING immediately
    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: TestRunStatus.CANCELLING,
      },
    })

    const process = processManager.get(testRunId)
    console.log(`[TestRunAction] Process: ${JSON.stringify(process)}`)

    if (!process) {
      console.warn(`[TestRunAction] No process found for testRunId: ${testRunId}`)
      await prisma.testRun.update({
        where: { id: testRun.id },
        data: {
          status: TestRunStatus.CANCELLED,
          result: TestRunResult.CANCELLED,
          completedAt: new Date(),
        },
      })
      return {
        status: 200,
        message: 'Test run cancelled successfully',
      }
    }

    const killed = killTask(process.name, 'SIGTERM')
    console.log(`[TestRunAction] Killed: ${killed}`)
    if (!killed) {
      const forceKilled = killTask(process.name, 'SIGKILL')
      if (!forceKilled) {
        console.warn(`[TestRunAction] Failed to force kill process for testRunId: ${testRunId}`)
      }
    }

    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: TestRunStatus.CANCELLED,
        result: TestRunResult.CANCELLED,
        completedAt: new Date(),
      },
    })

    await prisma.testRunTestCase.updateMany({
      where: {
        testRunId: testRun.id,
        status: {
          in: [TestRunTestCaseStatus.PENDING, TestRunTestCaseStatus.RUNNING],
        },
      },
      data: {
        status: TestRunTestCaseStatus.CANCELLED,
        result: TestRunTestCaseResult.UNTESTED,
      },
    })

    revalidatePath('/test-runs')
    revalidatePath(`/test-runs/${testRunId}`)

    return {
      status: 200,
      message: 'Test run stopped successfully',
    }
  } catch (error) {
    console.error(`[TestRunAction] Error stopping test run ${testRunId}:`, error)
    return {
      status: 500,
      error: `Server error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Check if a test run name is unique
 */
export async function checkTestRunNameUniqueAction(name: string, excludeId?: string): Promise<ActionResponse> {
  try {
    const nameExists = await checkUniqueName(name, excludeId)
    return {
      status: 200,
      data: { isUnique: !nameExists },
    }
  } catch (error) {
    return {
      status: 500,
      error: `Server error occurred: ${error}`,
    }
  }
}
