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
  BrowserEngine,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'
import { localExecutorAdapter } from '@/lib/executor/local-executor-adapter'
import type { TestRunExecutionRequest, TestRunExecutionResult } from '@/lib/executor/types'
import { formatLogsForStorage, parseLogsFromStorage, type LogEntry } from '@/lib/test-run/log-formatter'
import { processManager } from '@/lib/test-run/process-manager'
import { createTestRunLogger, getLogFilePath } from '@/lib/test-run/winston-logger'
import { TestRunLogger } from '@/lib/test-run/test-run-logger'
import { resolveTestRunTerminalState, type TestRunTerminalOutcome } from '@/lib/test-run/terminal-state'
import { promises as fs } from 'fs'
import path from 'path'
import { testRunEvidenceLinks } from './test-run-evidence-links'
import { updateTestCaseMetrics, updateMetricsForTestRun } from '@/lib/metrics/metric-calculator'
import { getAutomationReportRunDir, resolveStoredPath } from '@/lib/automation/automation-path-roots'
import { automationProjectionService } from '@/lib/automation/projection-service'
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
import { resolveTargetProject } from '@/services/target-project/target-project-service'
import {
  diagnoseRunEvidence,
  persistRunEvidenceHealth,
  preflightTestRun,
  summarizeRunEvidence,
  type RunEvidenceSummary,
} from '@/services/test-run/run-evidence-summary-service'
import {
  buildOrExpression,
  buildTestRunsWhereClause,
  isCancelledOrCancellingStatus,
  normalizeSuiteSelection,
} from '@/services/test-run/test-run-helpers'
import { prepareRun } from '@/services/test-run/stages/prepare-run'
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

export {
  buildOrExpression,
  buildTestRunsWhereClause,
  isCancelledOrCancellingStatus,
  normalizeSuiteSelection,
} from '@/services/test-run/test-run-helpers'

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

export type UpdateScenarioStatusResult =
  { kind: 'updated' } | { kind: 'no_match'; message: string } | { kind: 'test_run_not_found' }

export async function updateTestRunTestCaseStatusFromScenario(
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

async function ensureFeatureFilesForTestRun(testRunTestCases: TestRunTestCaseLink[]): Promise<void> {
  if (testRunTestCases.length === 0) {
    return
  }

  const suiteIds = new Set<string>()

  for (const link of testRunTestCases) {
    if (link.testSuiteId) {
      suiteIds.add(link.testSuiteId)
    }
  }

  const unresolvedTestCaseIds = testRunTestCases.filter(link => !link.testSuiteId).map(link => link.testCaseId)

  if (unresolvedTestCaseIds.length > 0) {
    const testCases = await prisma.testCase.findMany({
      where: { id: { in: unresolvedTestCaseIds } },
      select: {
        TestSuite: {
          select: { id: true },
        },
      },
    })

    for (const testCase of testCases) {
      for (const suite of testCase.TestSuite) {
        suiteIds.add(suite.id)
      }
    }
  }

  await Promise.all([...suiteIds].map(suiteId => automationProjectionService.generateFeature(suiteId)))
}

export async function scheduleTestRunCompletion(args: {
  testRun: { id: string; runId: string }
  environment: Environment
  tagExpression: string
  testRunTestCases: TestRunTestCaseLink[]
  value: TestRunFormValue
  logger: Awaited<ReturnType<typeof createTestRunLogger>>
  projectRoot?: string
  featurePaths?: string[]
  importPaths?: string[]
  supportPaths?: string[]
  prepareWorkspace?: boolean
  launch?: () => Promise<TestRunExecutionResult>
  executionAttempt?: { id: string; ownerToken: string }
  client?: PrismaClient
  waitForProcess?: (processName: string) => Promise<number | null>
  appraiseRoot?: string
}): Promise<void> {
  const {
    testRun,
    environment,
    tagExpression,
    testRunTestCases,
    value,
    logger,
    projectRoot,
    featurePaths,
    importPaths,
    supportPaths,
    prepareWorkspace,
    launch,
    executionAttempt,
    client = prisma,
    waitForProcess = processName => localExecutorAdapter.waitForProcess(processName),
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
    if (!localExecutorAdapter.killProcess(managedProcess.name, 'SIGTERM'))
      localExecutorAdapter.killProcess(managedProcess.name, 'SIGKILL')
  }

  try {
    await prepareRun({
      prepareWorkspace: prepareWorkspace !== false,
      prepareFeatureFiles: () => ensureFeatureFilesForTestRun(testRunTestCases),
    })
    // Register before spawning: a challenge can be emitted by the first
    // operation and must not race process-launch bookkeeping.
    processManager.on('test-run::blocked', onHumanVerificationBlocked)
    cleanupListener = () => processManager.removeListener('test-run::blocked', onHumanVerificationBlocked)

    const { process: spawnedProcess, reportPath } = await executeRun({
      launch:
        launch ??
        (() =>
          localExecutorAdapter.executeTestRun({
            testRunId: testRun.runId,
            environment,
            tagExpression,
            testWorkersCount: value.testWorkersCount || 1,
            browserEngine: value.browserEngine,
            headless: true,
            projectRoot,
            featurePaths,
            importPaths,
            supportPaths,
            prepareWorkspace,
          })),
    })

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
      // fallow-ignore-next-line complexity
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

export type TestRunExecutionOverrides = Pick<
  TestRunExecutionRequest,
  'projectRoot' | 'featurePaths' | 'importPaths' | 'supportPaths' | 'prepareWorkspace'
>

export async function createTestRunFromValidatedValue(
  value: TestRunFormValue,
  targetProjectId: string,
  executionOverrides: TestRunExecutionOverrides = {},
): Promise<{ runId: string; id: string }> {
  const nameTaken = await isTestRunNameTaken(value.name, targetProjectId)
  if (nameTaken) {
    throw new ServiceError(
      'A test run with this name already exists. Please choose a different name.',
      'VALIDATION',
      400,
    )
  }

  const { tagExpression, tags, testRunTestCases, environment } = await resolveTagExpressionAndTestCases(
    value,
    targetProjectId,
  )

  const testRun = await prisma.testRun.create({
    data: {
      name: value.name,
      targetProjectId,
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
    testRunTestCases,
    value,
    logger,
    ...executionOverrides,
  })

  return { runId: testRun.runId, id: testRun.id }
}

export type StandaloneTargetTestRunInput = {
  target: string
  environmentId: string
  name?: string
  tagExpression?: string | null
  testWorkersCount?: number
  browserEngine?: BrowserEngine
  featurePaths?: string[]
  importPaths?: string[]
  supportPaths?: string[]
  prepareWorkspace?: boolean
  expectedTestCases?: TestRunTestCaseLink[]
}

async function resolveStandaloneExpectedTestCases(input: StandaloneTargetTestRunInput): Promise<TestRunTestCaseLink[]> {
  const links = [
    ...new Map(
      (input.expectedTestCases ?? []).map(link => [`${link.testSuiteId ?? ''}:${link.testCaseId}`, link]),
    ).values(),
  ]
  if (links.length === 0) return links
  const storedTestCases = await prisma.testCase.findMany({
    where: { id: { in: [...new Set(links.map(link => link.testCaseId))] } },
    select: { id: true, TestSuite: { select: { id: true } } },
  })
  const suitesByCase = new Map(
    storedTestCases.map(testCase => [testCase.id, new Set(testCase.TestSuite.map(suite => suite.id))]),
  )
  const invalid = links.find(link => !suitesByCase.get(link.testCaseId)?.has(link.testSuiteId as string))
  if (invalid) {
    throw new ServiceError(
      `Test case "${invalid.testCaseId}" is not associated with test suite "${invalid.testSuiteId}".`,
      'VALIDATION',
      400,
    )
  }
  return links
}

export async function createStandaloneTargetTestRun(input: StandaloneTargetTestRunInput): Promise<{
  runId: string
  id: string
  targetProjectId: string
  testRunPageId: string
  executionRunId: string
  reportUrl: string
  logsUrl: string
  evidenceHealth: string
  nextAllowedAction: { tool: string; reason: string }
}> {
  const targetProject = await resolveTargetProject(input.target)
  const environment = await prisma.environment.findUnique({
    where: { id: input.environmentId },
  })

  if (!environment) {
    throw new ServiceError('Environment not found', 'VALIDATION', 400)
  }

  const name = input.name?.trim() || `${targetProject.displayName} standalone ${new Date().toISOString()}`
  const nameTaken = await isTestRunNameTaken(name, targetProject.id)
  if (nameTaken) {
    throw new ServiceError(
      'A test run with this name already exists. Please choose a different name.',
      'VALIDATION',
      400,
    )
  }

  const expectedTestCases = await resolveStandaloneExpectedTestCases(input)

  const testRun = await prisma.testRun.create({
    data: {
      name,
      environmentId: environment.id,
      testWorkersCount: input.testWorkersCount || 1,
      browserEngine: input.browserEngine ?? BrowserEngine.CHROMIUM,
      status: TestRunStatus.RUNNING,
      result: TestRunResult.PENDING,
      targetProjectId: targetProject.id,
      testCases: {
        create: expectedTestCases.map(link => ({
          testCaseId: link.testCaseId,
          testSuiteId: link.testSuiteId ?? null,
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
    tagExpression: input.tagExpression ?? '',
    testRunTestCases: expectedTestCases,
    value: {
      name,
      environmentId: environment.id,
      tags: [],
      testSuites: [],
      testWorkersCount: input.testWorkersCount || 1,
      browserEngine: input.browserEngine ?? BrowserEngine.CHROMIUM,
    },
    logger,
    projectRoot: targetProject.canonicalPath,
    featurePaths: input.featurePaths,
    importPaths: input.importPaths,
    supportPaths: input.supportPaths,
    prepareWorkspace: input.prepareWorkspace ?? false,
  })

  const evidenceLinks = testRunEvidenceLinks(testRun.runId, targetProject.id)

  return {
    runId: testRun.runId,
    id: testRun.id,
    targetProjectId: targetProject.id,
    testRunPageId: testRun.runId,
    executionRunId: testRun.runId,
    reportUrl: evidenceLinks.reportUrl,
    logsUrl: evidenceLinks.logsUrl,
    evidenceHealth: 'invalid_missing_report',
    nextAllowedAction: {
      tool: 'test_run_read',
      reason: 'Poll bounded run evidence until the managed test run completes.',
    },
  }
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
  return run?.runtimeCapsule
    ? {
        kind: 'capsule' as const,
        diagnostic: await readRuntimeCapsuleDiagnostic({ runId, expectedTargetProjectId }, client, appraiseRoot),
      }
    : { kind: 'manual' as const, evidence: await diagnoseRunEvidence(runId, client, appraiseRoot) }
}

export async function preflightStandaloneTargetTestRun(input: Parameters<typeof preflightTestRun>[0]) {
  return preflightTestRun(input)
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

  for (const testRun of testRuns) {
    await fs.rm(getAutomationReportRunDir(testRun.runId), { recursive: true, force: true })

    const manualArtifactPaths = [
      testRun.logPath,
      testRun.reportPath,
      ...testRun.testCases.map(testCase => testCase.tracePath),
    ].filter((artifactPath): artifactPath is string => Boolean(artifactPath))

    for (const artifactPath of manualArtifactPaths) {
      await fs.rm(resolveStoredPath(artifactPath), { force: true }).catch(() => {})
    }
  }

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
  if (capsule?.runtimeCapsule) {
    const text = await readTestRunArtifactText(
      createTestRunArtifactAccess(createTestRunArtifactContext(appraiseRoot), client),
      { runId: testRunId, kind: 'log', expectedTargetProjectId },
    )
    return text
      .split('\n')
      .filter(Boolean)
      .map((message, index) => ({ type: 'stdout', message, timestamp: new Date(index) }))
  }
  const testRunLog = await client.testRunLog.findUnique({
    where: { testRunId },
  })
  if (!testRunLog) {
    return []
  }
  return parseLogsFromStorage(testRunLog.logs)
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
  if (capsule?.runtimeCapsule) {
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
  const logs = await getTestRunLogsService(testRunId, expectedTargetProjectId, appraiseRoot, client)
  const selected: LogEntry[] = []
  let bytes = 0
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const entryBytes = Buffer.byteLength(logs[index].message, 'utf8')
    if (selected.length > 0 && bytes + entryBytes > maxBytes) break
    selected.unshift(logs[index])
    bytes += entryBytes
  }
  return {
    text: selected.map(log => log.message).join('\n'),
    logs: selected,
    truncated: selected.length < logs.length,
    startOffset: Math.max(0, logs.length - selected.length),
    endOffset: logs.length,
    partialStart: false,
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

  const killed = localExecutorAdapter.killProcess(process.name, 'SIGTERM')
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
  const membership = await resolveTraceViewerMembership(testRunId, testCaseId)
  if (membership.kind !== 'found') return membership
  const { testRun, testRunTestCase } = membership

  const tracePath = testRunTestCase.tracePath
  if (!tracePath) {
    return { kind: 'no_trace_path' }
  }

  if (testRun.runtimeCapsule) {
    const artifact = await createTestRunArtifactAccess(createTestRunArtifactContext(), prisma).readBytes({
      runId: testRunId,
      kind: 'trace',
      testCaseId,
      storedPath: tracePath,
    })
    const spawnedProcess = await spawnTraceViewerFromSnapshot(artifact.bytes, snapshotPath =>
      localExecutorAdapter.spawnTraceViewer(testCaseId, snapshotPath),
    )
    return { kind: 'ok', processName: spawnedProcess.name }
  }

  const absoluteTracePath = resolveStoredPath(tracePath)

  try {
    await fs.access(absoluteTracePath)
  } catch {
    return { kind: 'trace_file_missing', path: tracePath }
  }

  const spawnedProcess = await localExecutorAdapter.spawnTraceViewer(testCaseId, absoluteTracePath)

  return { kind: 'ok', processName: spawnedProcess.name }
}
