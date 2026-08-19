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
  type Prisma,
  type PrismaClient,
} from '@prisma/client'
import type { TestRunExecutionResult } from '@/lib/executor/types'
import { formatLogsForStorage, type LogEntry } from '@/lib/test-run/log-formatter'
import { processManager } from '@/lib/test-run/process-manager'
import { createTestRunLogger } from '@/lib/test-run/winston-logger'
import { TestRunLogger } from '@/lib/test-run/test-run-logger'
import { resolveTestRunTerminalState, type TestRunTerminalOutcome } from '@/lib/test-run/terminal-state'
import { promises as fs } from 'fs'
import path from 'path'
import { updateTestCaseMetrics, updateMetricsForTestRun } from '@/lib/metrics/metric-calculator'
import { ensureTestSuiteIdentifierTags } from '@/lib/test-suite-identifier-service'
import { getIdentifierTagByPrefix } from '@/lib/tag-filters'
import { findMatchingTestRunTestCase } from '@/lib/test-run/matching'
import { storeReportFromFileService } from '@/services/report/report-service'
import {
  createTestRunArtifactAccess,
  createTestRunArtifactContext,
  readTestRunArtifactText,
} from '@/services/test-run/test-run-artifact-context'
import { readRuntimeCapsuleDiagnostic } from '@/services/test-run/runtime-capsule-diagnostics-service'
import { spawnTraceViewerFromSnapshot } from '@/services/test-run/trace-viewer-snapshot-service'
import {
  persistRunEvidenceHealth,
  summarizeRunEvidence,
  type RunEvidenceSummary,
} from '@/services/test-run/run-evidence-summary-service'
import {
  buildOrExpression,
  buildTestRunsWhereClause,
  isCancelledOrCancellingStatus,
  normalizeSuiteSelection,
} from '@/services/test-run/test-run-helpers'
import { executeRun } from '@/services/test-run/stages/execute-run'
import { collectRunOutput, resolveCollectedRunOutcome } from '@/services/test-run/stages/collect-run-evidence'
import {
  appliedPageLimit,
  decodePageCursor,
  encodePageCursor,
  pageFromItems,
  type Page,
  type PageRequest,
} from '@/lib/pagination'
import { readLogTail } from '@/lib/test-run/log-tail-reader'
import { spawnTask, waitForTask } from '@/lib/process/task-spawner'
import { credentialRedactor } from '@/lib/runtime-capsule/secret-redaction'
import {
  computeStepReferenceHash,
  stepDefinitionSchema,
  stepInvocationSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts'

export async function isTestRunNameTaken(name: string, targetProjectId: string, excludeId?: string): Promise<boolean> {
  const existing = await prisma.testRun.findFirst({
    where: {
      name,
      targetProjectId,
      ...(excludeId && { id: { not: excludeId } }),
    },
  })
  return !!existing
}

export async function listTestRuns(
  targetProjectId: string,
  filter?: string,
  page: PageRequest = {},
): Promise<Page<Awaited<ReturnType<typeof getTestRunPageItems>>[number]>> {
  const whereClause = buildTestRunsWhereClause(filter)
  const limit = appliedPageLimit(page.limit)
  const cursor = decodePageCursor(page.cursor, targetProjectId)
  const items = await getTestRunPageItems({ targetProjectId, whereClause, cursor, limit })
  return pageFromItems({
    items,
    limit,
    encodeCursor: last =>
      encodePageCursor({ scope: targetProjectId, id: last.id, sortValue: last.startedAt.toISOString() }),
  })
}

async function getTestRunPageItems(input: {
  targetProjectId: string
  whereClause: Prisma.TestRunWhereInput
  cursor?: { id: string; sortValue: string }
  limit: number
}) {
  const cursorWhere: Prisma.TestRunWhereInput = input.cursor
    ? {
        OR: [
          { startedAt: { lt: new Date(input.cursor.sortValue) } },
          { startedAt: new Date(input.cursor.sortValue), id: { lt: input.cursor.id } },
        ],
      }
    : {}
  return prisma.testRun.findMany({
    where: { AND: [input.whereClause, { targetProjectId: input.targetProjectId }, cursorWhere] },
    include: {
      testCases: true,
      tags: true,
      environment: true,
    },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
  })
}

export async function getTestRunByIdOrThrow(id: string, targetProjectId: string) {
  const testRun = await prisma.testRun.findFirst({
    where: {
      targetProjectId,
      OR: [{ id }, { runId: id }],
    },
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

export async function listTestSuiteTestCases(targetProjectId: string) {
  await ensureTestSuiteIdentifierTags(undefined, targetProjectId)

  return prisma.testSuite.findMany({
    where: { targetProjectId },
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

async function resolveTagExpressionAndTestCases(
  value: TestRunFormValue,
  targetProjectId: string,
): Promise<{
  tagExpression: string
  tags: Tag[]
  testRunTestCases: TestRunTestCaseLink[]
  environment: Environment
}> {
  const environment = await prisma.environment.findFirst({
    where: { id: value.environmentId, targetProjectId },
  })

  if (!environment) {
    throw new ServiceError('Environment not found', 'VALIDATION', 400)
  }

  const isFilteringByTags = value.tags.length > 0
  const isFilteringByTestSuites = value.testSuites.length > 0 && value.tags.length === 0

  if (!isFilteringByTags && !isFilteringByTestSuites) {
    throw new ServiceError('Either tags or test suites must be provided to filter the test run.', 'VALIDATION', 400)
  }

  const { tagExpression, tags, testRunTestCases } = isFilteringByTags
    ? await resolveTaggedTestRunFilters(value.tags, targetProjectId)
    : await resolveSuiteTestRunFilters(value.testSuites, targetProjectId)

  if (!tagExpression) {
    throw new ServiceError('No executable tests were resolved from the selected filters.', 'VALIDATION', 400)
  }

  return { tagExpression, tags, testRunTestCases, environment }
}

async function resolveTaggedTestRunFilters(tagIds: string[], targetProjectId: string): Promise<ResolvedTestRunFilters> {
  const tags = await prisma.tag.findMany({
    where: { id: { in: tagIds }, targetProjectId },
  })
  if (tags.length !== tagIds.length)
    throw new ServiceError('One or more selected tags do not belong to the active project.', 'VALIDATION', 400)

  const tagExpression = buildOrExpression(tags.map(tag => `(${tag.tagExpression})`))
  const tagFilteredTestCases = await prisma.testCase.findMany({
    where: {
      targetProjectId,
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

async function resolveSuiteTestRunFilters(
  value: TestRunFormValue['testSuites'],
  targetProjectId: string,
): Promise<ResolvedTestRunFilters> {
  await ensureTestSuiteIdentifierTags(
    value.map(testSuite => testSuite.testSuiteId),
    targetProjectId,
  )

  const selectedSuites = await prisma.testSuite.findMany({
    where: {
      id: {
        in: value.map(testSuite => testSuite.testSuiteId),
      },
      targetProjectId,
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

type UpdateScenarioStatusResult =
  { kind: 'updated' } | { kind: 'no_match'; message: string } | { kind: 'test_run_not_found' }

async function updateTestRunTestCaseStatusFromScenario(
  testRunId: string,
  scenario: {
    scenarioName: string
    status: 'passed' | 'failed' | 'skipped' | 'unknown'
    tracePath?: string
    featureName?: string
    scenarioTags?: string[]
  },
  client: PrismaClient = prisma,
): Promise<UpdateScenarioStatusResult> {
  const testRun = await client.testRun.findUnique({
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

  await client.testRunTestCase.update({
    where: { id: matchingTestCase.id },
    data: {
      status: testCaseStatus,
      result: testCaseResult,
      tracePath: scenario.tracePath || null,
    },
  })

  try {
    if (client !== prisma) return { kind: 'updated' }
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

async function persistTestRunLogs(args: {
  runId: string
  logEntries: LogEntry[]
  client?: PrismaClient
}): Promise<void> {
  const { runId, logEntries, client = prisma } = args

  if (logEntries.length > 0) {
    const formattedLogs = formatLogsForStorage(logEntries)
    await client.testRunLog.upsert({
      where: { testRunId: runId },
      create: { testRunId: runId, logs: formattedLogs },
      update: { logs: formattedLogs },
    })
  }
}

async function reconcileFinalRunEvidence(args: {
  testRunDbId: string
  runId: string
  client?: PrismaClient
  appraiseRoot?: string
}): Promise<RunEvidenceSummary> {
  const { testRunDbId, runId, client = prisma } = args
  const summary = await persistRunEvidenceHealth(runId, client, undefined, args.appraiseRoot)

  try {
    if (client !== prisma) return summary
    await updateMetricsForTestRun(testRunDbId)
  } catch (error) {
    console.error(`[TestRunService] Error updating metrics for test run ${testRunDbId}:`, error)
  }

  return {
    ...summary,
    evidenceHealth: summary.evidenceHealth,
    grade: summary.evidenceHealth === 'valid' ? 'valid' : summary.grade,
  }
}

async function terminalizeTestRun(args: {
  testRunDbId: string
  outcome: TestRunTerminalOutcome
  executionAttempt?: { id: string; ownerToken: string }
  failure?: string
  evidenceHealth?: 'infrastructure_failure'
  client?: PrismaClient
}): Promise<void> {
  const { testRunDbId, outcome, executionAttempt, failure, evidenceHealth, client = prisma } = args
  const current = await client.testRun.findUniqueOrThrow({
    where: { id: testRunDbId },
    select: {
      status: true,
      result: true,
      logPath: true,
      reportPath: true,
      runtimeCapsule: { select: { id: true } },
      runtimeCapsuleExecutionAttempt: { select: { state: true } },
    },
  })
  const terminal = resolveTestRunTerminalState({
    currentStatus: current.status,
    currentResult: current.result,
    outcome,
    managed: Boolean(executionAttempt),
    artifacts: {
      logPath: current.logPath,
      reportPath: current.reportPath,
      runtimeCapsuleId: current.runtimeCapsule?.id,
    },
  })
  if (
    !terminal.shouldPersist &&
    (!executionAttempt || current.runtimeCapsuleExecutionAttempt?.state === terminal.attemptState)
  ) {
    return
  }
  const completedAt = new Date()

  await client.$transaction(async tx => {
    if (terminal.shouldPersist) {
      const run = await tx.testRun.updateMany({
        where: { id: testRunDbId, status: current.status, result: current.result },
        data: {
          status: terminal.status,
          result: terminal.result,
          completedAt,
          ...(evidenceHealth ? { evidenceHealth } : {}),
        },
      })
      if (run.count !== 1) throw new Error('TestRun terminal state changed before terminalization CAS.')
    }
    if (!executionAttempt) return
    const attempt = await tx.runtimeCapsuleExecutionAttempt.updateMany({
      where: {
        id: executionAttempt.id,
        ownerToken: executionAttempt.ownerToken,
        state: { in: ['STARTING', 'RUNNING'] },
      },
      data: {
        state: terminal.attemptState,
        completedAt,
        failure: outcome === 'failed' ? (failure ?? 'Test-run execution failed.') : null,
        version: { increment: 1 },
      },
    })
    if (attempt.count !== 1 && terminal.shouldPersist) {
      throw new Error('Execution attempt terminal state changed before terminalization CAS.')
    }
  })
}

async function storeReportAfterRunIfNeeded(
  testRunDbId: string,
  runId: string,
  reportPath: string | null | undefined,
  client: PrismaClient = prisma,
  appraiseRoot?: string,
): Promise<void> {
  const finalTestRunStatus = await client.testRun.findUnique({
    where: { id: testRunDbId },
    select: { status: true },
  })

  if (finalTestRunStatus && isCancelledOrCancellingStatus(finalTestRunStatus.status)) {
    console.log(`[TestRunService] Skipping report generation for testRunId: ${runId} - test run was cancelled`)
  } else if (reportPath) {
    try {
      const reportOutcome = await storeReportFromFileService(runId, reportPath, client, appraiseRoot)
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

async function redactManagedReportOutput(
  reportPath: string,
  environment: Pick<Environment, 'passwordEnvironmentVariable'>,
) {
  const reference = environment.passwordEnvironmentVariable
  const resolvedPassword = reference ? process.env[reference] : undefined
  if (!resolvedPassword) return
  try {
    const report = await fs.readFile(reportPath, 'utf8')
    const redacted = credentialRedactor([resolvedPassword])(report)
    if (redacted !== report) await fs.writeFile(reportPath, redacted, { mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export async function scheduleTestRunCompletion(args: {
  testRun: { id: string; runId: string }
  environment: Environment
  logger: Awaited<ReturnType<typeof createTestRunLogger>>
  launch: () => Promise<TestRunExecutionResult>
  executionAttempt?: { id: string; ownerToken: string }
  client?: PrismaClient
  waitForProcess?: (processName: string) => Promise<number | null>
  appraiseRoot?: string
}): Promise<void> {
  const {
    testRun,
    environment,
    logger,
    launch,
    executionAttempt,
    client = prisma,
    waitForProcess = processName => waitForTask(processName),
    appraiseRoot,
  } = args
  const runLogger = new TestRunLogger(logger)
  let cleanupListener = () => {}
  let blockedByHumanVerification = false
  let humanVerificationTerminationRequested = false
  const onHumanVerificationBlocked = (eventData: { testRunId: string; reason: string }) => {
    if (
      humanVerificationTerminationRequested ||
      eventData.testRunId !== testRun.runId ||
      eventData.reason !== 'human_verification_required'
    )
      return
    blockedByHumanVerification = true
    humanVerificationTerminationRequested = true
    const managedProcess = processManager.get(testRun.runId)
    if (!managedProcess) return
    managedProcess.process.kill('SIGTERM')
  }

  try {
    // Register before spawning: a challenge can be emitted by the first
    // operation and must not race process-launch bookkeeping.
    processManager.on('test-run::blocked', onHumanVerificationBlocked)
    cleanupListener = () => processManager.removeListener('test-run::blocked', onHumanVerificationBlocked)

    const { process: spawnedProcess, reportPath } = await executeRun({ launch })

    await client.testRun.update({
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
      if (humanVerificationTerminationRequested || eventData.testRunId !== testRun.runId) {
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
      await updateTestRunTestCaseStatusFromScenario(
        testRun.runId,
        {
          scenarioName: eventData.scenarioName,
          status: mappedStatus,
          tracePath: eventData.tracePath,
          featureName: eventData.featureName,
          scenarioTags: eventData.scenarioTags,
        },
        client,
      )
    }

    processManager.on('scenario::end', onScenarioEnd)
    console.log(`[TestRunService] Registered server-side scenario::end listener for testRunId: ${testRun.runId}`)

    cleanupListener = () => {
      processManager.removeListener('scenario::end', onScenarioEnd)
      processManager.removeListener('test-run::blocked', onHumanVerificationBlocked)
      console.log(`[TestRunService] Removed server-side scenario::end listener for testRunId: ${testRun.runId}`)
    }

    const executePromise = Promise.resolve(spawnedProcess)

    executePromise
      .then(async proc => {
        const exitCodeRaw = await waitForProcess(proc.name)
        const exitCode = exitCodeRaw ?? 1

        const { logEntries } = collectRunOutput(proc, exitCode, runLogger)

        if (executionAttempt) {
          const managedRun = await client.testRun.findUnique({
            where: { id: testRun.id },
            select: { logPath: true },
          })
          if (!managedRun?.logPath)
            throw new ServiceError('Managed test run log path was not prepared.', 'CONFLICT', 409)
          await fs.writeFile(managedRun.logPath, formatLogsForStorage(logEntries), { mode: 0o600 })
        }

        await persistTestRunLogs({
          runId: testRun.runId,
          logEntries,
          client,
        })

        if (executionAttempt) await redactManagedReportOutput(reportPath, environment)
        await storeReportAfterRunIfNeeded(testRun.id, testRun.runId, reportPath, client, appraiseRoot)
        const evidence = await reconcileFinalRunEvidence({
          testRunDbId: testRun.id,
          runId: testRun.runId,
          client,
          appraiseRoot,
        })
        const current = await client.testRun.findUniqueOrThrow({
          where: { id: testRun.id },
          select: { status: true },
        })
        const outcome = resolveCollectedRunOutcome({
          cancelled: isCancelledOrCancellingStatus(current.status),
          blocked: blockedByHumanVerification,
          exitCode,
          evidenceHealth: evidence.evidenceHealth,
        })
        await terminalizeTestRun({ testRunDbId: testRun.id, outcome, executionAttempt, client })
      })
      .catch(async error => {
        console.error(`[TestRunService] Error executing test run for testRunId: ${testRun.runId}:`, error)

        const message = error instanceof Error ? error.message : String(error)
        runLogger.error(`Error executing test run: ${message}`)
        if (error instanceof Error && error.stack) runLogger.error(error.stack)
        const current = await client.testRun.findUniqueOrThrow({
          where: { id: testRun.id },
          select: { status: true },
        })
        await terminalizeTestRun({
          testRunDbId: testRun.id,
          outcome: isCancelledOrCancellingStatus(current.status) ? 'cancelled' : 'failed',
          executionAttempt,
          failure: message,
          evidenceHealth: 'infrastructure_failure',
          client,
        })
      })
      .finally(async () => {
        cleanupListener()
        await runLogger.close().catch(error => {
          console.error(`[TestRunService] Error closing logger for testRunId: ${testRun.runId}:`, error)
        })
      })
  } catch (error) {
    cleanupListener()
    console.error(`[TestRunService] Synchronous error calling executeTestRun for testRunId: ${testRun.runId}:`, error)
    console.error(`[TestRunService] Error stack:`, error instanceof Error ? error.stack : 'No stack trace')
    const message = error instanceof Error ? error.message : String(error)
    runLogger.error(`Error executing test run: ${message}`)
    await terminalizeTestRun({
      testRunDbId: testRun.id,
      outcome: 'failed',
      executionAttempt,
      failure: message,
      evidenceHealth: 'infrastructure_failure',
      client,
    }).catch(terminalError => {
      console.error(`[TestRunService] Error terminalizing testRunId: ${testRun.runId}:`, terminalError)
    })
    await runLogger.close().catch(closeError => {
      console.error(`[TestRunService] Error closing logger for testRunId: ${testRun.runId}:`, closeError)
    })
    throw error
  }
}

export async function createTestRunFromValidatedValue(
  value: TestRunFormValue,
  targetProjectId: string,
): Promise<{ runId: string; id: string }> {
  const { tags, testRunTestCases } = await resolveTagExpressionAndTestCases(value, targetProjectId)
  if (testRunTestCases.some(selection => !selection.testSuiteId))
    throw new ServiceError('Independent authored runs require explicit suite/case selections.', 'VALIDATION', 400)
  return createIndependentAuthoredCapsuleTestRun({
    targetProjectId,
    environmentId: value.environmentId,
    name: value.name,
    selections: testRunTestCases.map(selection => ({
      testSuiteId: selection.testSuiteId as string,
      testCaseId: selection.testCaseId,
    })),
    browserEngine: value.browserEngine,
    testWorkersCount: value.testWorkersCount || 1,
    tagIds: tags.map(tag => tag.id),
  })
}

export type IndependentAuthoredSelectionInput = {
  targetProjectId: string
  environmentId: string
  name: string
  selections: Array<{ testSuiteId: string; testCaseId: string }>
  browserEngine?: 'CHROMIUM' | 'FIREFOX' | 'WEBKIT'
  testWorkersCount?: number
  tagIds?: string[]
}

/** Validates canonical authored authority before a TestRun or capsule exists. */
export async function createIndependentAuthoredCapsuleTestRun(input: IndependentAuthoredSelectionInput) {
  const selections = [
    ...new Map(input.selections.map(item => [`${item.testSuiteId}:${item.testCaseId}`, item])).values(),
  ]
  if (selections.length === 0) throw new ServiceError('Select at least one authored test case.', 'VALIDATION', 400)
  const [environment, cases] = await Promise.all([
    prisma.environment.findFirst({ where: { id: input.environmentId, targetProjectId: input.targetProjectId } }),
    prisma.testCase.findMany({
      where: { id: { in: selections.map(item => item.testCaseId) }, targetProjectId: input.targetProjectId },
      include: { steps: { orderBy: { order: 'asc' } }, TestSuite: { select: { id: true, targetProjectId: true } } },
    }),
  ])
  if (!environment) throw new ServiceError('Target-owned environment not found.', 'VALIDATION', 400)
  const caseById = new Map(cases.map(testCase => [testCase.id, testCase]))
  const invocations = []
  for (const selection of selections) {
    const testCase = caseById.get(selection.testCaseId)
    if (
      !testCase ||
      !testCase.TestSuite.some(
        suite => suite.id === selection.testSuiteId && suite.targetProjectId === input.targetProjectId,
      )
    )
      throw new ServiceError(
        'Authored selection contains an unavailable or cross-project suite/case.',
        'VALIDATION',
        400,
      )
    if (testCase.steps.length === 0)
      throw new ServiceError(`Authored test case ${testCase.id} has no executable Step Invocations.`, 'VALIDATION', 400)
    for (const step of testCase.steps) {
      try {
        invocations.push(stepInvocationSchema.parse(JSON.parse(step.invocationJson)))
      } catch {
        throw new ServiceError(
          `Authored test case ${testCase.id} has an incomplete canonical Step Invocation.`,
          'VALIDATION',
          400,
        )
      }
    }
  }
  const references = [...new Map(invocations.map(item => [`${item.step.id}@${item.step.version}`, item.step])).values()]
  const definitions = await prisma.stepDefinition.findMany({
    where: {
      OR: references.map(step => ({ id: step.id, version: step.version, status: { in: ['ready', 'deprecated'] } })),
    },
  })
  const definitionByRef = new Map(definitions.map(row => [`${row.id}@${row.version}`, row]))
  for (const reference of references) {
    const row = definitionByRef.get(`${reference.id}@${reference.version}`)
    if (
      !row ||
      computeStepReferenceHash(stepDefinitionSchema.parse(JSON.parse(row.definitionJson))) !== reference.definitionHash
    )
      throw new ServiceError(
        'Authored selection contains a stale or unavailable exact Step Reference.',
        'VALIDATION',
        400,
      )
  }
  if (await isTestRunNameTaken(input.name, input.targetProjectId))
    throw new ServiceError('A test run with this name already exists.', 'VALIDATION', 400)
  const testRun = await prisma.testRun.create({
    data: {
      name: input.name,
      targetProjectId: input.targetProjectId,
      environmentId: input.environmentId,
      browserEngine: input.browserEngine ?? 'CHROMIUM',
      testWorkersCount: input.testWorkersCount ?? 1,
      status: 'QUEUED',
      result: 'PENDING',
      intent: 'INDEPENDENT',
      tags: { connect: (input.tagIds ?? []).map(id => ({ id })) },
      testCases: { create: selections },
    },
  })
  return { id: testRun.id, runId: testRun.runId }
}

async function assertExpectedTargetProject(
  runId: string,
  expectedTargetProjectId?: string,
  client: PrismaClient = prisma,
) {
  if (!expectedTargetProjectId) return
  const owned = await client.testRun.findFirst({
    where: { runId, targetProjectId: expectedTargetProjectId },
    select: { id: true },
  })
  if (!owned) throw new ServiceError('Test run not found.', 'NOT_FOUND', 404)
}

export async function readTestRunEvidenceSummary(
  runId: string,
  expectedTargetProjectId?: string,
  client: PrismaClient = prisma,
  appraiseRoot = path.join(process.cwd(), '.appraise'),
) {
  await assertExpectedTargetProject(runId, expectedTargetProjectId, client)
  return summarizeRunEvidence(runId, client, appraiseRoot)
}

export async function diagnoseTestRunEvidence(
  runId: string,
  expectedTargetProjectId?: string,
  client: PrismaClient = prisma,
  appraiseRoot = path.join(process.cwd(), '.appraise'),
) {
  const run = await client.testRun.findUnique({
    where: { runId },
    select: { runtimeCapsule: { select: { id: true } } },
  })
  await assertExpectedTargetProject(runId, expectedTargetProjectId, client)
  if (!run?.runtimeCapsule) throw new ServiceError('TestRun has no immutable runtime capsule.', 'CONFLICT', 409)
  return {
    kind: 'capsule' as const,
    diagnostic: await readRuntimeCapsuleDiagnostic({ runId, expectedTargetProjectId }, client, appraiseRoot),
  }
}

export async function deleteTestRunsByIds(ids: string[], targetProjectId: string): Promise<void> {
  const testRuns = await prisma.testRun.findMany({
    where: { id: { in: ids }, targetProjectId },
    select: {
      runId: true,
      logPath: true,
      reportPath: true,
      testCases: {
        select: {
          testCaseId: true,
          tracePath: true,
        },
      },
    },
  })

  const deletedRunTestCaseIds = testRuns.flatMap(testRun => testRun.testCases.map(testCase => testCase.testCaseId))

  await prisma.testRun.deleteMany({
    where: { id: { in: ids }, targetProjectId },
  })

  const { recalculateMetricsForTestCases, updateDashboardMetrics } = await import('@/lib/metrics/metric-calculator')

  const recentPeriodDate = new Date()
  recentPeriodDate.setDate(recentPeriodDate.getDate() - RECENT_PERIOD_DAYS)

  const allRecentTestRunTestCases = await prisma.testRunTestCase.findMany({
    where: {
      status: TestRunTestCaseStatus.COMPLETED,
      testRun: {
        targetProjectId,
        completedAt: {
          gte: recentPeriodDate,
        },
      },
    },
    select: {
      testCaseId: true,
    },
  })

  const allAffectedTestCaseIds = [
    ...new Set([...deletedRunTestCaseIds, ...allRecentTestRunTestCases.map(trtc => trtc.testCaseId)]),
  ]

  if (allAffectedTestCaseIds.length > 0) {
    await recalculateMetricsForTestCases(allAffectedTestCaseIds)
  }

  await updateDashboardMetrics(targetProjectId)
}

export async function getTestRunLogsService(
  testRunId: string,
  expectedTargetProjectId?: string,
  appraiseRoot = path.join(process.cwd(), '.appraise'),
  client: PrismaClient = prisma,
): Promise<LogEntry[]> {
  const capsule = await client.testRun.findUnique({
    where: { runId: testRunId },
    select: { runtimeCapsule: { select: { id: true } } },
  })
  if (!capsule?.runtimeCapsule) throw new ServiceError('TestRun has no immutable runtime capsule.', 'CONFLICT', 409)
  const text = await readTestRunArtifactText(
    createTestRunArtifactAccess(createTestRunArtifactContext(appraiseRoot), client),
    { runId: testRunId, kind: 'log', expectedTargetProjectId },
  )
  return text
    .split('\n')
    .filter(Boolean)
    .map((message, index) => ({ type: 'stdout', message, timestamp: new Date(index) }))
}

export async function getTestRunLogTailService(
  testRunId: string,
  expectedTargetProjectId: string,
  maxBytes: number,
  appraiseRoot = path.join(process.cwd(), '.appraise'),
  client: PrismaClient = prisma,
) {
  const capsule = await client.testRun.findUnique({
    where: { runId: testRunId },
    select: { runtimeCapsule: { select: { id: true } } },
  })
  if (!capsule?.runtimeCapsule) throw new ServiceError('TestRun has no immutable runtime capsule.', 'CONFLICT', 409)
  const access = createTestRunArtifactAccess(createTestRunArtifactContext(appraiseRoot), client)
  const artifact = await access.resolve({ runId: testRunId, kind: 'log', expectedTargetProjectId })
  const tail = await readLogTail(artifact.absolutePath, Math.min(maxBytes, artifact.maxBytes))
  return {
    ...tail,
    logs: tail.text
      .split('\n')
      .filter(Boolean)
      .map((message, index) => ({ type: 'stdout' as const, message, timestamp: new Date(index) })),
  }
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

  process.process.kill('SIGTERM')

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

async function loadTraceViewerTestRun(testRunId: string, testCaseId: string) {
  return prisma.testRun.findUnique({
    where: { runId: testRunId },
    include: {
      runtimeCapsule: true,
      testCases: {
        where: { id: testCaseId },
        include: { testCase: true },
      },
    },
  })
}

async function resolveTraceViewerMembership(testRunId: string, testCaseId: string) {
  const testRun = await loadTraceViewerTestRun(testRunId, testCaseId)
  if (!testRun) return { kind: 'test_run_not_found' as const }
  const testRunTestCase = testRun.testCases.find(testCase => testCase.id === testCaseId)
  if (!testRunTestCase) return { kind: 'test_case_not_in_run' as const }
  return { kind: 'found' as const, testRun, testRunTestCase }
}

export async function checkTraceViewerStatusService(
  testRunId: string,
  testCaseId: string,
): Promise<
  | { kind: 'ok'; isRunning: boolean; processName: string | null }
  | { kind: 'test_run_not_found' }
  | { kind: 'test_case_not_in_run' }
> {
  const membership = await resolveTraceViewerMembership(testRunId, testCaseId)
  if (membership.kind !== 'found') return membership

  const processName = `trace-viewer-${testCaseId}`
  const proc = processManager.get(processName)
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
  const membership = await resolveTraceViewerMembership(testRunId, testCaseId)
  if (membership.kind !== 'found') return membership
  const { testRun, testRunTestCase } = membership

  const tracePath = testRunTestCase.tracePath
  if (!tracePath) {
    return { kind: 'no_trace_path' }
  }

  if (!testRun.runtimeCapsule) return { kind: 'trace_file_missing', path: tracePath }
  const artifact = await createTestRunArtifactAccess(createTestRunArtifactContext(), prisma).readBytes({
    runId: testRunId,
    kind: 'trace',
    testCaseId,
    storedPath: tracePath,
  })
  const spawnedProcess = await spawnTraceViewerFromSnapshot(artifact.bytes, snapshotPath =>
    spawnTask('npx', ['playwright', 'show-trace', snapshotPath], {
      captureOutput: true,
      streamLogs: false,
      logPrefix: `trace-viewer-${testCaseId}`,
    }),
  )

  return { kind: 'ok', processName: spawnedProcess.name }
}
