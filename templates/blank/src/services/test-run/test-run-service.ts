import prisma from '@/config/db-config'
import type { TestRun as TestRunFormValue } from '@/constants/form-opts/test-run-form-opts'
import { ServiceError } from '@/services/shared/errors'
import { RECENT_PERIOD_DAYS } from '@/services/shared/constants'
import {
  TestRunStatus,
  TestRunResult,
  TestRunTestCaseStatus,
  TestRunTestCaseResult,
  Tag,
  Environment,
} from '@prisma/client'
import { localExecutorAdapter } from '@/lib/executor/local-executor-adapter'
import { formatLogsForStorage, parseLogsFromStorage, type LogEntry } from '@/lib/test-run/log-formatter'
import { processManager } from '@/lib/test-run/process-manager'
import { createTestRunLogger, closeLogger, getLogFilePath } from '@/lib/test-run/winston-logger'
import { promises as fs } from 'fs'
import { updateTestCaseMetrics, updateMetricsForTestRun } from '@/lib/metrics/metric-calculator'
import { getAutomationReportRunDir, resolveStoredPath } from '@/lib/automation/automation-path-roots'
import { ensureTestSuiteIdentifierTags } from '@/lib/test-suite-identifier-service'
import { getIdentifierTagByPrefix } from '@/lib/tag-filters'
import { findMatchingTestRunTestCase } from '@/lib/test-run/matching'
import { storeReportFromFileService } from '@/services/report/report-service'
import {
  buildOrExpression,
  buildTestRunsWhereClause,
  isCancelledOrCancellingStatus,
  normalizeSuiteSelection,
} from '@/services/test-run/test-run-helpers'

export {
  buildOrExpression,
  buildTestRunsWhereClause,
  isCancelledOrCancellingStatus,
  normalizeSuiteSelection,
} from '@/services/test-run/test-run-helpers'

export async function isTestRunNameTaken(name: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.testRun.findFirst({
    where: {
      name,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })
  return !!existing
}

export async function listTestRuns(filter?: string) {
  const whereClause = buildTestRunsWhereClause(filter)

  return prisma.testRun.findMany({
    where: whereClause,
    include: {
      testCases: true,
      tags: true,
      environment: true,
    },
  })
}

export async function getTestRunByIdOrThrow(id: string) {
  const testRun = await prisma.testRun.findUnique({
    where: { id },
    include: {
      testCases: {
        include: {
          testCase: true,
          testSuite: true,
        },
      },
      tags: true,
      environment: true,
      reports: true,
    },
  })

  if (!testRun) {
    throw new ServiceError('Test run not found', 'NOT_FOUND', 404)
  }

  return testRun
}

export async function listTestSuiteTestCases() {
  await ensureTestSuiteIdentifierTags()

  return prisma.testSuite.findMany({
    include: {
      module: true,
      tags: true,
      testCases: {
        include: {
          steps: true,
          tags: true,
        },
      },
    },
  })
}

type TestRunTestCaseLink = { testCaseId: string; testSuiteId?: string | null }

type ResolvedTestRunFilters = {
  tagExpression: string | null
  tags: Tag[]
  testRunTestCases: TestRunTestCaseLink[]
}

async function resolveTagExpressionAndTestCases(value: TestRunFormValue): Promise<{
  tagExpression: string
  tags: Tag[]
  testRunTestCases: TestRunTestCaseLink[]
  environment: Environment
}> {
  const environment = await prisma.environment.findUnique({
    where: { id: value.environmentId },
  })

  if (!environment) {
    throw new ServiceError('Environment not found', 'VALIDATION', 400)
  }

  const isFilteringByTags = value.tags.length > 0
  const isFilteringByTestSuites = value.testSuites.length > 0 && value.tags.length === 0

  if (!isFilteringByTags && !isFilteringByTestSuites) {
    throw new ServiceError(
      'Either tags or test suites must be provided to filter the test run.',
      'VALIDATION',
      400,
    )
  }

  const { tagExpression, tags, testRunTestCases } = isFilteringByTags
    ? await resolveTaggedTestRunFilters(value.tags)
    : await resolveSuiteTestRunFilters(value.testSuites)

  if (!tagExpression) {
    throw new ServiceError('No executable tests were resolved from the selected filters.', 'VALIDATION', 400)
  }

  return { tagExpression, tags, testRunTestCases, environment }
}

async function resolveTaggedTestRunFilters(tagIds: string[]): Promise<ResolvedTestRunFilters> {
  const tags = await prisma.tag.findMany({
    where: { id: { in: tagIds } },
  })

  const tagExpression = buildOrExpression(tags.map(tag => `(${tag.tagExpression})`))
  const tagFilteredTestCases = await prisma.testCase.findMany({
    where: {
      OR: [
        {
          tags: {
            some: { id: { in: tagIds } },
          },
        },
        {
          TestSuite: {
            some: {
              tags: {
                some: { id: { in: tagIds } },
              },
            },
          },
        },
      ],
    },
  })

  return {
    tagExpression,
    tags,
    testRunTestCases: tagFilteredTestCases.map(testCase => ({
      testCaseId: testCase.id,
      testSuiteId: null,
    })),
  }
}

async function resolveSuiteTestRunFilters(value: TestRunFormValue['testSuites']): Promise<ResolvedTestRunFilters> {
  await ensureTestSuiteIdentifierTags(value.map(testSuite => testSuite.testSuiteId))

  const selectedSuites = await prisma.testSuite.findMany({
    where: {
      id: {
        in: value.map(testSuite => testSuite.testSuiteId),
      },
    },
    include: {
      tags: true,
      testCases: {
        include: {
          tags: true,
        },
      },
    },
  })

  if (selectedSuites.length !== value.length) {
    throw new ServiceError('One or more selected test suites could not be found.', 'VALIDATION', 400)
  }

  const selectedSuiteById = new Map(selectedSuites.map(testSuite => [testSuite.id, testSuite]))
  const suiteClauses: string[] = []
  const testRunTestCases: TestRunTestCaseLink[] = []

  for (const suiteSelection of value) {
    const suiteResult = resolveSuiteSelectionFilter(selectedSuiteById.get(suiteSelection.testSuiteId), suiteSelection)
    if (!suiteResult) {
      continue
    }

    suiteClauses.push(suiteResult.clause)
    testRunTestCases.push(...suiteResult.testRunTestCases)
  }

  return {
    tagExpression: buildOrExpression(suiteClauses.map(clause => `(${clause})`)),
    tags: [],
    testRunTestCases,
  }
}

function resolveSuiteSelectionFilter(
  selectedSuite:
    | {
        id: string
        name: string
        tags: Tag[]
        testCases: Array<{ id: string; title: string; tags: Tag[] }>
      }
    | undefined,
  suiteSelection: TestRunFormValue['testSuites'][number],
): { clause: string; testRunTestCases: TestRunTestCaseLink[] } | null {
  if (!selectedSuite || selectedSuite.testCases.length === 0) {
    return null
  }

  const normalizedSelection = normalizeSuiteSelection(
    suiteSelection,
    selectedSuite.testCases.map(testCase => testCase.id),
  )

  if (!normalizedSelection) {
    return null
  }

  const suiteIdentifierTag = getIdentifierTagByPrefix(selectedSuite.tags, 'ts_')
  if (!suiteIdentifierTag) {
    throw new ServiceError(`Test suite "${selectedSuite.name}" does not have an identifier tag.`, 'VALIDATION', 400)
  }

  if (normalizedSelection.runAll) {
    return {
      clause: `(${suiteIdentifierTag.tagExpression})`,
      testRunTestCases: selectedSuite.testCases.map(testCase => ({
        testCaseId: testCase.id,
        testSuiteId: selectedSuite.id,
      })),
    }
  }

  return resolvePartialSuiteSelectionFilter(selectedSuite, normalizedSelection.testCaseIds, suiteIdentifierTag)
}

function resolvePartialSuiteSelectionFilter(
  selectedSuite: {
    id: string
    name: string
    testCases: Array<{ id: string; title: string; tags: Tag[] }>
  },
  selectedTestCaseIds: string[],
  suiteIdentifierTag: Tag,
): { clause: string; testRunTestCases: TestRunTestCaseLink[] } {
  const selectedTestCases = selectedSuite.testCases.filter(testCase => selectedTestCaseIds.includes(testCase.id))

  if (selectedTestCases.length === 0) {
    throw new ServiceError(
      `Test suite "${selectedSuite.name}" requires at least one selected test case.`,
      'VALIDATION',
      400,
    )
  }

  const testCaseTagExpressions = selectedTestCases.map(testCase => {
    const identifierTag = getIdentifierTagByPrefix(testCase.tags, 'tc_')
    if (!identifierTag) {
      throw new ServiceError(`Test case "${testCase.title}" does not have an identifier tag.`, 'VALIDATION', 400)
    }

    return identifierTag.tagExpression
  })

  return {
    clause: `(${suiteIdentifierTag.tagExpression}) and (${testCaseTagExpressions.map(tag => `(${tag})`).join(' or ')})`,
    testRunTestCases: selectedTestCases.map(testCase => ({
      testCaseId: testCase.id,
      testSuiteId: selectedSuite.id,
    })),
  }
}

export type UpdateScenarioStatusResult =
  | { kind: 'updated' }
  | { kind: 'no_match'; message: string }
  | { kind: 'test_run_not_found' }

export async function updateTestRunTestCaseStatusFromScenario(
  testRunId: string,
  scenario: {
    scenarioName: string
    status: 'passed' | 'failed' | 'skipped' | 'unknown'
    tracePath?: string
    featureName?: string
    scenarioTags?: string[]
  },
): Promise<UpdateScenarioStatusResult> {
  const testRun = await prisma.testRun.findUnique({
    where: { runId: testRunId },
    include: {
      testCases: {
        include: {
          testCase: {
            include: {
              tags: true,
            },
          },
          testSuite: {
            include: {
              tags: true,
            },
          },
        },
      },
    },
  })

  if (!testRun) {
    return { kind: 'test_run_not_found' }
  }

  const matchingTestCase = findMatchingTestRunTestCase(testRun.testCases, {
    scenarioName: scenario.scenarioName,
    scenarioTags: scenario.scenarioTags,
  })

  if (!matchingTestCase) {
    console.log(
      `[TestRunService] No matching test case found for scenario: ${scenario.scenarioName}. This is expected when scenarios run without corresponding test cases in this test run.`,
    )
    return {
      kind: 'no_match',
      message: `Scenario "${scenario.scenarioName}" completed but has no corresponding test case in this test run`,
    }
  }

  const testCaseStatus: TestRunTestCaseStatus = TestRunTestCaseStatus.COMPLETED
  let testCaseResult: TestRunTestCaseResult

  switch (scenario.status) {
    case 'passed':
      testCaseResult = TestRunTestCaseResult.PASSED
      break
    case 'failed':
      testCaseResult = TestRunTestCaseResult.FAILED
      break
    case 'skipped':
      testCaseResult = TestRunTestCaseResult.UNTESTED
      break
    default:
      testCaseResult = TestRunTestCaseResult.UNTESTED
  }

  await prisma.testRunTestCase.update({
    where: { id: matchingTestCase.id },
    data: {
      status: testCaseStatus,
      result: testCaseResult,
      tracePath: scenario.tracePath || null,
    },
  })

  try {
    await updateTestCaseMetrics(
      matchingTestCase.testCaseId,
      testCaseResult,
      testRun.completedAt || testRun.startedAt || new Date(),
    )
  } catch (error) {
    console.error(`[TestRunService] Error updating metrics for test case ${matchingTestCase.testCaseId}:`, error)
  }

  return { kind: 'updated' }
}

async function persistLogsAndUpdateRunStatus(args: {
  testRunDbId: string
  runId: string
  logEntries: LogEntry[]
  logger: Awaited<ReturnType<typeof createTestRunLogger>>
  exitCode: number
}): Promise<void> {
  const { testRunDbId, runId, logEntries, logger, exitCode } = args

  await storeTestRunLogsService(runId, logEntries)
  await closeLogger(logger)

  const currentTestRun = await prisma.testRun.findUnique({
    where: { id: testRunDbId },
    select: { status: true, result: true },
  })

  if (currentTestRun && !isCancelledOrCancellingStatus(currentTestRun.status)) {
    const result = exitCode === 0 ? TestRunResult.PASSED : TestRunResult.FAILED

    await prisma.testRun.update({
      where: { id: testRunDbId },
      data: {
        status: TestRunStatus.COMPLETED,
        result,
        completedAt: new Date(),
      },
    })

    try {
      await updateMetricsForTestRun(testRunDbId)
    } catch (error) {
      console.error(`[TestRunService] Error updating metrics for test run ${testRunDbId}:`, error)
    }
  } else if (currentTestRun && !currentTestRun.result) {
    await prisma.testRun.update({
      where: { id: testRunDbId },
      data: {
        completedAt: new Date(),
      },
    })
  }
}

async function storeReportAfterRunIfNeeded(testRunDbId: string, runId: string, reportPath: string | null | undefined): Promise<void> {
  const finalTestRunStatus = await prisma.testRun.findUnique({
    where: { id: testRunDbId },
    select: { status: true },
  })

  if (finalTestRunStatus && isCancelledOrCancellingStatus(finalTestRunStatus.status)) {
    console.log(`[TestRunService] Skipping report generation for testRunId: ${runId} - test run was cancelled`)
  } else if (reportPath) {
    try {
      const reportOutcome = await storeReportFromFileService(runId, reportPath)
      if (reportOutcome.success) {
        console.log(`[TestRunService] Report stored successfully for testRunId: ${runId}`)
      } else {
        console.warn(`[TestRunService] Failed to store report for testRunId: ${runId}: ${reportOutcome.message}`)
      }
    } catch (error) {
      console.error(`[TestRunService] Error storing report for testRunId: ${runId}:`, error)
    }
  } else {
    console.warn(`[TestRunService] No report path available for testRunId: ${runId}`)
  }
}

async function scheduleTestRunCompletion(args: {
  testRun: { id: string; runId: string }
  environment: Environment
  tagExpression: string
  value: TestRunFormValue
  logger: Awaited<ReturnType<typeof createTestRunLogger>>
}): Promise<void> {
  const { testRun, environment, tagExpression, value, logger } = args

  try {
    const { process: spawnedProcess, reportPath } = await localExecutorAdapter.executeTestRun({
      testRunId: testRun.runId,
      environment,
      tagExpression,
      testWorkersCount: value.testWorkersCount || 1,
      browserEngine: value.browserEngine,
      headless: true,
    })

    await prisma.testRun.update({
      where: { id: testRun.id },
      data: { reportPath },
    })

    const onScenarioEnd = async (eventData: {
      testRunId: string
      scenarioName: string
      status: string
      tracePath?: string
      featureName?: string
      scenarioTags?: string[]
    }) => {
      if (eventData.testRunId !== testRun.runId) {
        return
      }
      console.log(
        `[TestRunService] Server-side scenario::end event for testRunId: ${testRun.runId}, scenario: ${eventData.scenarioName}, status: ${eventData.status}${eventData.tracePath ? `, tracePath: ${eventData.tracePath}` : ''}`,
      )
      const statusMap: Record<string, 'passed' | 'failed' | 'skipped' | 'unknown'> = {
        passed: 'passed',
        failed: 'failed',
        skipped: 'skipped',
      }
      const mappedStatus = statusMap[eventData.status] || 'unknown'
      await updateTestRunTestCaseStatusFromScenario(testRun.runId, {
        scenarioName: eventData.scenarioName,
        status: mappedStatus,
        tracePath: eventData.tracePath,
        featureName: eventData.featureName,
        scenarioTags: eventData.scenarioTags,
      })
    }

    processManager.on('scenario::end', onScenarioEnd)
    console.log(`[TestRunService] Registered server-side scenario::end listener for testRunId: ${testRun.runId}`)

    const cleanupListener = () => {
      processManager.removeListener('scenario::end', onScenarioEnd)
      console.log(`[TestRunService] Removed server-side scenario::end listener for testRunId: ${testRun.runId}`)
    }

    const executePromise = Promise.resolve(spawnedProcess)

    executePromise
      .then(async proc => {
        const exitCodeRaw = await localExecutorAdapter.waitForProcess(proc.name)
        const exitCode = exitCodeRaw ?? 1

        const logEntries: LogEntry[] = []

        if (proc.output.stdout.length > 0) {
          const stdoutText = proc.output.stdout.join('')
          const stdoutLines = stdoutText.split('\n').filter(line => line.trim() !== '')
          stdoutLines.forEach((line, index) => {
            const timestamp = new Date(proc.startTime.getTime() + index * 10)
            logEntries.push({
              type: 'stdout',
              message: line,
              timestamp,
            })
            logger.info(line)
          })
        }

        if (proc.output.stderr.length > 0) {
          const stderrText = proc.output.stderr.join('')
          const stderrLines = stderrText.split('\n').filter(line => line.trim() !== '')
          const stdoutCount = logEntries.filter(e => e.type === 'stdout').length
          stderrLines.forEach((line, index) => {
            const timestamp = new Date(proc.startTime.getTime() + stdoutCount * 10 + index * 10)
            logEntries.push({
              type: 'stderr',
              message: line,
              timestamp,
            })
            logger.error(line)
          })
        }

        const exitMessage = `Process exited with code ${exitCode}`
        logEntries.push({
          type: 'status',
          message: exitMessage,
          timestamp: proc.endTime || new Date(),
        })
        logger.info(exitMessage)

        await persistLogsAndUpdateRunStatus({
          testRunDbId: testRun.id,
          runId: testRun.runId,
          logEntries,
          logger,
          exitCode,
        })

        cleanupListener()

        await storeReportAfterRunIfNeeded(testRun.id, testRun.runId, reportPath)
      })
      .catch(async error => {
        console.error(`[TestRunService] Error executing test run for testRunId: ${testRun.runId}:`, error)

        logger.error(`Error executing test run: ${error instanceof Error ? error.message : String(error)}`)
        if (error instanceof Error && error.stack) {
          logger.error(error.stack)
        }

        await closeLogger(logger).catch(err => {
          console.error(`[TestRunService] Error closing logger for testRunId: ${testRun.runId}:`, err)
        })

        const currentTestRun = await prisma.testRun.findUnique({
          where: { id: testRun.id },
          select: { status: true, result: true },
        })

        if (currentTestRun && !isCancelledOrCancellingStatus(currentTestRun.status)) {
          await prisma.testRun.update({
            where: { id: testRun.id },
            data: {
              status: TestRunStatus.COMPLETED,
              result: TestRunResult.FAILED,
              completedAt: new Date(),
            },
          })
        } else if (currentTestRun && !currentTestRun.result) {
          await prisma.testRun.update({
            where: { id: testRun.id },
            data: {
              completedAt: new Date(),
            },
          })
        }

        cleanupListener()
      })
  } catch (error) {
    console.error(`[TestRunService] Synchronous error calling executeTestRun for testRunId: ${testRun.runId}:`, error)
    console.error(`[TestRunService] Error stack:`, error instanceof Error ? error.stack : 'No stack trace')
  }
}

export async function createTestRunFromValidatedValue(value: TestRunFormValue): Promise<{ runId: string; id: string }> {
  const nameTaken = await isTestRunNameTaken(value.name)
  if (nameTaken) {
    throw new ServiceError(
      'A test run with this name already exists. Please choose a different name.',
      'VALIDATION',
      400,
    )
  }

  const { tagExpression, tags, testRunTestCases, environment } = await resolveTagExpressionAndTestCases(value)

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
          testSuiteId: tc.testSuiteId ?? null,
        })),
      },
    },
  })

  const logger = await createTestRunLogger(testRun.runId)
  const logFilePath = getLogFilePath(testRun.runId)

  await prisma.testRun.update({
    where: { id: testRun.id },
    data: {
      logPath: logFilePath,
    },
  })

  await scheduleTestRunCompletion({
    testRun,
    environment,
    tagExpression,
    value,
    logger,
  })

  return { runId: testRun.runId, id: testRun.id }
}

export async function deleteTestRunsByIds(ids: string[]): Promise<void> {
  const testRuns = await prisma.testRun.findMany({
    where: { id: { in: ids } },
    select: {
      runId: true,
      logPath: true,
      reportPath: true,
      testCases: {
        select: {
          tracePath: true,
        },
      },
    },
  })

  for (const testRun of testRuns) {
    await fs.rm(getAutomationReportRunDir(testRun.runId), { recursive: true, force: true })

    const legacyArtifactPaths = [
      testRun.logPath,
      testRun.reportPath,
      ...testRun.testCases.map(testCase => testCase.tracePath),
    ].filter((artifactPath): artifactPath is string => Boolean(artifactPath))

    for (const artifactPath of legacyArtifactPaths) {
      await fs.rm(resolveStoredPath(artifactPath), { force: true }).catch(() => {})
    }
  }

  await prisma.testRun.deleteMany({
    where: { id: { in: ids } },
  })

  const { recalculateMetricsForTestCases, updateDashboardMetrics } = await import('@/lib/metrics/metric-calculator')

  const recentPeriodDate = new Date()
  recentPeriodDate.setDate(recentPeriodDate.getDate() - RECENT_PERIOD_DAYS)

  const allRecentTestRunTestCases = await prisma.testRunTestCase.findMany({
    where: {
      status: TestRunTestCaseStatus.COMPLETED,
      testRun: {
        completedAt: {
          gte: recentPeriodDate,
        },
      },
    },
    select: {
      testCaseId: true,
    },
  })

  const allAffectedTestCaseIds = [...new Set(allRecentTestRunTestCases.map(trtc => trtc.testCaseId))]

  if (allAffectedTestCaseIds.length > 0) {
    await recalculateMetricsForTestCases(allAffectedTestCaseIds)
  }

  await updateDashboardMetrics()
}

export async function storeTestRunLogsService(testRunId: string, logs: LogEntry[]): Promise<void> {
  if (logs.length === 0) {
    return
  }
  const formattedLogs = formatLogsForStorage(logs)
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
}

export async function getTestRunLogsService(testRunId: string): Promise<LogEntry[]> {
  const testRunLog = await prisma.testRunLog.findUnique({
    where: { testRunId },
  })
  if (!testRunLog) {
    return []
  }
  return parseLogsFromStorage(testRunLog.logs)
}

export type CancelTestRunOutcome =
  | { kind: 'not_found' }
  | { kind: 'invalid_state'; message: string }
  | { kind: 'already_cancelling' }
  | { kind: 'cancelled_no_process' }
  | { kind: 'stopped' }

export async function cancelTestRunService(testRunId: string): Promise<CancelTestRunOutcome> {
  const testRun = await prisma.testRun.findUnique({
    where: { runId: testRunId },
  })
  if (!testRun) {
    return { kind: 'not_found' }
  }

  if (
    testRun.status !== TestRunStatus.RUNNING &&
    testRun.status !== TestRunStatus.QUEUED &&
    testRun.status !== TestRunStatus.CANCELLING
  ) {
    return {
      kind: 'invalid_state',
      message: 'Test run is not running, queued, or already being cancelled',
    }
  }

  if (testRun.status === TestRunStatus.CANCELLING) {
    return { kind: 'already_cancelling' }
  }

  await prisma.testRun.update({
    where: { id: testRun.id },
    data: {
      status: TestRunStatus.CANCELLING,
    },
  })

  const process = processManager.get(testRunId)
  console.log(`[TestRunService] Process: ${JSON.stringify(process)}`)

  if (!process) {
    console.warn(`[TestRunService] No process found for testRunId: ${testRunId}`)
    await prisma.testRun.update({
      where: { id: testRun.id },
      data: {
        status: TestRunStatus.CANCELLED,
        result: TestRunResult.CANCELLED,
        completedAt: new Date(),
      },
    })
    return { kind: 'cancelled_no_process' }
  }

  const killed = localExecutorAdapter.killProcess(process.name, 'SIGTERM')
  console.log(`[TestRunService] Killed: ${killed}`)
  if (!killed) {
    const forceKilled = localExecutorAdapter.killProcess(process.name, 'SIGKILL')
    if (!forceKilled) {
      console.warn(`[TestRunService] Failed to force kill process for testRunId: ${testRunId}`)
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

  return { kind: 'stopped' }
}

export async function checkTraceViewerStatusService(
  testRunId: string,
  testCaseId: string,
): Promise<
  | { kind: 'ok'; isRunning: boolean; processName: string | null }
  | { kind: 'test_run_not_found' }
  | { kind: 'test_case_not_in_run' }
> {
  const testRun = await prisma.testRun.findUnique({
    where: { runId: testRunId },
    include: {
      testCases: {
        where: { id: testCaseId },
      },
    },
  })

  if (!testRun) {
    return { kind: 'test_run_not_found' }
  }

  const testRunTestCase = testRun.testCases.find(tc => tc.id === testCaseId)
  if (!testRunTestCase) {
    return { kind: 'test_case_not_in_run' }
  }

  const processName = `trace-viewer-${testCaseId}`
  const proc = localExecutorAdapter.getProcess(processName)
  const isRunning = proc?.isRunning ?? false

  return {
    kind: 'ok',
    isRunning,
    processName: isRunning ? processName : null,
  }
}

export async function spawnTraceViewerService(
  testRunId: string,
  testCaseId: string,
): Promise<
  | { kind: 'ok'; processName: string }
  | { kind: 'test_run_not_found' }
  | { kind: 'test_case_not_in_run' }
  | { kind: 'no_trace_path' }
  | { kind: 'trace_file_missing'; path: string }
> {
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
    return { kind: 'test_run_not_found' }
  }

  const testRunTestCase = testRun.testCases.find(tc => tc.id === testCaseId)
  if (!testRunTestCase) {
    return { kind: 'test_case_not_in_run' }
  }

  const tracePath = testRunTestCase.tracePath
  if (!tracePath) {
    return { kind: 'no_trace_path' }
  }

  const absoluteTracePath = resolveStoredPath(tracePath)

  try {
    await fs.access(absoluteTracePath)
  } catch {
    return { kind: 'trace_file_missing', path: tracePath }
  }

  const spawnedProcess = await localExecutorAdapter.spawnTraceViewer(testCaseId, absoluteTracePath)

  console.log(
    `[TestRunService] Spawned trace viewer process for testCaseId: ${testCaseId}, tracePath: ${absoluteTracePath}`,
  )

  return { kind: 'ok', processName: spawnedProcess.name }
}
