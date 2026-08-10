import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BrowserEngine,
  TagType,
  TestRunResult,
  TestRunStatus,
  TestRunTestCaseResult,
  TestRunTestCaseStatus,
} from '@prisma/client'
import { testRunSchema } from '@/constants/form-opts/test-run-form-opts'
import { RECENT_PERIOD_DAYS } from '@/services/shared/constants'

const {
  mockEnvironmentFindUnique,
  mockTagFindMany,
  mockTestCaseFindMany,
  mockTestSuiteFindMany,
  mockTestRunFindFirst,
  mockTestRunFindUnique,
  mockTestRunCreate,
  mockTestRunUpdate,
  mockTestRunTestCaseUpdate,
  mockTestRunTestCaseUpdateMany,
  mockTestRunLogUpsert,
  mockTestRunLogFindUnique,
  mockExecuteTestRun,
  mockWaitForProcess,
  mockKillProcess,
  mockGetProcess,
  mockSpawnTraceViewer,
  mockCreateTestRunLogger,
  mockCloseLogger,
  mockGetLogFilePath,
  mockUpdateTestCaseMetrics,
  mockUpdateMetricsForTestRun,
  mockEnsureTestSuiteIdentifierTags,
  mockStoreReportFromFileService,
  mockProcessManagerGet,
  mockProcessManagerOn,
  mockProcessManagerRemoveListener,
  mockFsAccess,
  mockGenerateFeature,
  mockResolveTargetProject,
  mockArtifactReadBytes,
  mockSpawnTraceViewerFromSnapshot,
} = vi.hoisted(() => ({
  mockEnvironmentFindUnique: vi.fn(),
  mockTagFindMany: vi.fn(),
  mockTestCaseFindMany: vi.fn(),
  mockTestSuiteFindMany: vi.fn(),
  mockTestRunFindFirst: vi.fn(),
  mockTestRunFindUnique: vi.fn(),
  mockTestRunCreate: vi.fn(),
  mockTestRunUpdate: vi.fn(),
  mockTestRunTestCaseUpdate: vi.fn(),
  mockTestRunTestCaseUpdateMany: vi.fn(),
  mockTestRunLogUpsert: vi.fn(),
  mockTestRunLogFindUnique: vi.fn(),
  mockExecuteTestRun: vi.fn(),
  mockWaitForProcess: vi.fn(),
  mockKillProcess: vi.fn(),
  mockGetProcess: vi.fn(),
  mockSpawnTraceViewer: vi.fn(),
  mockCreateTestRunLogger: vi.fn(),
  mockCloseLogger: vi.fn(),
  mockGetLogFilePath: vi.fn(),
  mockUpdateTestCaseMetrics: vi.fn(),
  mockUpdateMetricsForTestRun: vi.fn(),
  mockEnsureTestSuiteIdentifierTags: vi.fn(),
  mockStoreReportFromFileService: vi.fn(),
  mockProcessManagerGet: vi.fn(),
  mockProcessManagerOn: vi.fn(),
  mockProcessManagerRemoveListener: vi.fn(),
  mockFsAccess: vi.fn(),
  mockGenerateFeature: vi.fn(),
  mockResolveTargetProject: vi.fn(),
  mockArtifactReadBytes: vi.fn(),
  mockSpawnTraceViewerFromSnapshot: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({
  default: {
    environment: { findUnique: mockEnvironmentFindUnique, findFirst: mockEnvironmentFindUnique },
    tag: { findMany: mockTagFindMany },
    testCase: { findMany: mockTestCaseFindMany },
    testSuite: { findMany: mockTestSuiteFindMany },
    testRun: {
      findFirst: mockTestRunFindFirst,
      findUnique: mockTestRunFindUnique,
      create: mockTestRunCreate,
      update: mockTestRunUpdate,
    },
    testRunTestCase: {
      update: mockTestRunTestCaseUpdate,
      updateMany: mockTestRunTestCaseUpdateMany,
    },
    testRunLog: {
      upsert: mockTestRunLogUpsert,
      findUnique: mockTestRunLogFindUnique,
    },
  },
}))

vi.mock('@/lib/executor/local-executor-adapter', () => ({
  localExecutorAdapter: {
    executeTestRun: mockExecuteTestRun,
    waitForProcess: mockWaitForProcess,
    killProcess: mockKillProcess,
    getProcess: mockGetProcess,
    spawnTraceViewer: mockSpawnTraceViewer,
  },
}))

vi.mock('@/lib/test-run/winston-logger', () => ({
  createTestRunLogger: mockCreateTestRunLogger,
  closeLogger: mockCloseLogger,
  getLogFilePath: mockGetLogFilePath,
}))

vi.mock('@/lib/metrics/metric-calculator', () => ({
  updateTestCaseMetrics: mockUpdateTestCaseMetrics,
  updateMetricsForTestRun: mockUpdateMetricsForTestRun,
}))

vi.mock('@/lib/test-suite-identifier-service', () => ({
  ensureTestSuiteIdentifierTags: mockEnsureTestSuiteIdentifierTags,
}))

vi.mock('@/lib/automation/projection-service', () => ({
  automationProjectionService: {
    generateFeature: mockGenerateFeature,
  },
}))

vi.mock('@/services/report/report-service', () => ({
  storeReportFromFileService: mockStoreReportFromFileService,
}))

vi.mock('@/services/target-project/target-project-service', () => ({
  resolveTargetProject: mockResolveTargetProject,
}))

vi.mock('@/lib/test-run/process-manager', () => ({
  processManager: {
    get: mockProcessManagerGet,
    on: mockProcessManagerOn,
    removeListener: mockProcessManagerRemoveListener,
  },
}))

vi.mock('@/lib/automation/automation-path-roots', () => ({
  getAutomationReportRunDir: vi.fn((runId: string) => `/artifacts/${runId}`),
  resolveStoredPath: vi.fn((storedPath: string) => `/resolved/${storedPath}`),
}))

vi.mock('@/services/test-run/test-run-artifact-context', () => ({
  createTestRunArtifactContext: vi.fn(() => ({ appraiseRoot: '/appraise' })),
  createTestRunArtifactAccess: vi.fn(() => ({ readBytes: mockArtifactReadBytes })),
}))

vi.mock('@/services/test-run/trace-viewer-snapshot-service', () => ({
  spawnTraceViewerFromSnapshot: mockSpawnTraceViewerFromSnapshot,
}))

vi.mock('fs', () => ({
  promises: {
    access: mockFsAccess,
    rm: vi.fn(),
  },
}))

import {
  buildOrExpression,
  buildTestRunsWhereClause,
  cancelTestRunService,
  checkTraceViewerStatusService,
  createStandaloneTargetTestRun,
  createTestRunFromValidatedValue,
  getTestRunLogsService,
  isCancelledOrCancellingStatus,
  normalizeSuiteSelection,
  spawnTraceViewerService,
  storeTestRunLogsService,
  updateTestRunTestCaseStatusFromScenario,
} from './test-run-service'

function createIdentifierTag(prefix: 'ts' | 'tc', suffix: string) {
  return {
    id: `${prefix}-${suffix}`,
    name: `${prefix}_${suffix}`,
    tagExpression: `@${prefix}_${suffix}`,
    type: TagType.IDENTIFIER,
  }
}

const baseValue = testRunSchema.parse({
  name: 'Nightly Run',
  environmentId: 'env-1',
  tags: [],
  testWorkersCount: 2,
  browserEngine: BrowserEngine.CHROMIUM,
  testSuites: [{ testSuiteId: 'suite-1', runAll: true, testCaseIds: [] }],
})

function mockRunnableSuite(testCases: Array<{ id: string; title: string; tag: string }>) {
  mockTestRunFindFirst.mockResolvedValue(null)
  mockEnvironmentFindUnique.mockResolvedValue({ id: 'env-1', name: 'QA' })
  mockTestSuiteFindMany.mockResolvedValue([
    {
      id: 'suite-1',
      name: 'Login Suite',
      tags: [createIdentifierTag('ts', 'login')],
      testCases: testCases.map(testCase => ({
        id: testCase.id,
        title: testCase.title,
        tags: [createIdentifierTag('tc', testCase.tag)],
      })),
    },
  ])
}

function mockStandaloneTarget() {
  mockResolveTargetProject.mockResolvedValue({
    id: 'target-1',
    displayName: 'Target App',
    canonicalPath: '/target/app',
  })
  mockTestRunFindFirst.mockResolvedValue(null)
  mockEnvironmentFindUnique.mockResolvedValue({ id: 'env-1', name: 'QA' })
}

describe('buildOrExpression', () => {
  it('returns null for empty input', () => {
    expect(buildOrExpression([])).toBeNull()
  })

  it('returns single expression unchanged', () => {
    expect(buildOrExpression(['@a'])).toBe('@a')
  })

  it('joins multiple with " or "', () => {
    expect(buildOrExpression(['@a', '@b'])).toBe('@a or @b')
  })
})

describe('normalizeSuiteSelection', () => {
  const base = { testSuiteId: 's1', runAll: false, testCaseIds: ['c1', 'c2'] as string[] }

  it('keeps runAll with empty ids', () => {
    const sel = { ...base, runAll: true, testCaseIds: [] }
    const out = normalizeSuiteSelection(sel, ['c1', 'c2'])
    expect(out.runAll).toBe(true)
    expect(out.testCaseIds).toEqual([])
  })

  it('treats full selection as runAll', () => {
    const sel = { ...base, runAll: false, testCaseIds: ['c1', 'c2'] }
    const out = normalizeSuiteSelection(sel, ['c1', 'c2'])
    expect(out.runAll).toBe(true)
    expect(out.testCaseIds).toEqual([])
  })

  it('keeps partial selection', () => {
    const sel = { ...base, runAll: false, testCaseIds: ['c1'] }
    const out = normalizeSuiteSelection(sel, ['c1', 'c2'])
    expect(out.runAll).toBe(false)
    expect(out.testCaseIds).toEqual(['c1'])
  })
})

describe('isCancelledOrCancellingStatus', () => {
  it('returns true for cancelled or cancelling', () => {
    expect(isCancelledOrCancellingStatus(TestRunStatus.CANCELLED)).toBe(true)
    expect(isCancelledOrCancellingStatus(TestRunStatus.CANCELLING)).toBe(true)
  })

  it('returns false for running', () => {
    expect(isCancelledOrCancellingStatus(TestRunStatus.RUNNING)).toBe(false)
  })
})

describe('buildTestRunsWhereClause', () => {
  it('returns empty object when no filter', () => {
    expect(buildTestRunsWhereClause(undefined)).toEqual({})
    expect(buildTestRunsWhereClause('')).toEqual({})
  })

  it('sets recentFailed window using RECENT_PERIOD_DAYS', () => {
    const before = Date.now()
    const clause = buildTestRunsWhereClause('recentFailed')
    const after = Date.now()
    expect(clause.result).toBe(TestRunResult.FAILED)
    expect(clause.completedAt).toMatchObject({ not: null })
    const gte = (clause.completedAt as { gte?: Date }).gte
    expect(gte).toBeInstanceOf(Date)
    const expected = new Date()
    expected.setDate(expected.getDate() - RECENT_PERIOD_DAYS)
    const diffMs = Math.abs(gte!.getTime() - expected.getTime())
    expect(diffMs).toBeLessThan(after - before + 2000)
  })
})

describe('testRunSchema', () => {
  it('parses minimal valid payload', () => {
    const parsed = testRunSchema.parse({
      name: 'Run',
      environmentId: 'env1',
      tags: [],
      browserEngine: BrowserEngine.CHROMIUM,
      testSuites: [{ testSuiteId: 'ts1', runAll: true, testCaseIds: [] }],
    })
    expect(parsed.name).toBe('Run')
  })
})

describe('createTestRunFromValidatedValue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateTestRunLogger.mockResolvedValue({
      info: vi.fn(),
      error: vi.fn(),
    })
    mockGetLogFilePath.mockReturnValue('logs/run-1.log')
    mockGenerateFeature.mockResolvedValue('automation/features/login.feature')
    mockTestRunUpdate.mockResolvedValue({})
    mockExecuteTestRun.mockResolvedValue({
      process: {
        name: 'proc-1',
        output: { stdout: [], stderr: [] },
        startTime: new Date('2025-01-01T00:00:00.000Z'),
      },
      reportPath: 'reports/run-1.json',
    })
    mockWaitForProcess.mockReturnValue(new Promise(() => {}))
  })

  it('creates a run from suite selection and schedules execution', async () => {
    mockRunnableSuite([
      { id: 'tc-1', title: 'Login', tag: 'login' },
      { id: 'tc-2', title: 'Logout', tag: 'logout' },
    ])
    mockTestRunCreate.mockResolvedValue({ id: 'db-1', runId: 'run-1' })

    const result = await createTestRunFromValidatedValue(baseValue, 'project-1')

    expect(mockEnsureTestSuiteIdentifierTags).toHaveBeenCalledWith(['suite-1'], 'project-1')
    expect(mockGenerateFeature).toHaveBeenCalledWith('suite-1')
    expect(mockTestRunCreate).toHaveBeenCalledWith({
      data: {
        name: 'Nightly Run',
        targetProjectId: 'project-1',
        environmentId: 'env-1',
        testWorkersCount: 2,
        browserEngine: BrowserEngine.CHROMIUM,
        status: TestRunStatus.RUNNING,
        result: TestRunResult.PENDING,
        tags: {
          connect: [],
        },
        testCases: {
          create: [
            { testCaseId: 'tc-1', testSuiteId: 'suite-1' },
            { testCaseId: 'tc-2', testSuiteId: 'suite-1' },
          ],
        },
      },
    })
    expect(mockCreateTestRunLogger).toHaveBeenCalledWith('run-1')
    expect(mockExecuteTestRun).toHaveBeenCalledWith({
      testRunId: 'run-1',
      environment: { id: 'env-1', name: 'QA' },
      tagExpression: '((@ts_login))',
      testWorkersCount: 2,
      browserEngine: BrowserEngine.CHROMIUM,
      headless: true,
      projectRoot: undefined,
      prepareWorkspace: undefined,
    })
    expect(result).toEqual({ runId: 'run-1', id: 'db-1' })
  })

  it('rejects duplicate run names', async () => {
    mockTestRunFindFirst.mockResolvedValue({ id: 'existing' })

    await expect(createTestRunFromValidatedValue(baseValue, 'project-1')).rejects.toMatchObject({
      message: expect.stringContaining('already exists'),
      statusCode: 400,
    })
  })

  it('rejects runs without environments', async () => {
    mockTestRunFindFirst.mockResolvedValue(null)
    mockEnvironmentFindUnique.mockResolvedValue(null)

    await expect(createTestRunFromValidatedValue(baseValue, 'project-1')).rejects.toMatchObject({
      message: 'Environment not found',
      statusCode: 400,
    })
  })

  it('rejects runs without tags or suite selections', async () => {
    mockTestRunFindFirst.mockResolvedValue(null)
    mockEnvironmentFindUnique.mockResolvedValue({ id: 'env-1' })

    await expect(
      createTestRunFromValidatedValue(
        {
          ...baseValue,
          tags: [],
          testSuites: [],
        },
        'project-1',
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('Either tags or test suites'),
      statusCode: 400,
    })
  })

  it('rejects suite selections when a suite cannot be found', async () => {
    mockTestRunFindFirst.mockResolvedValue(null)
    mockEnvironmentFindUnique.mockResolvedValue({ id: 'env-1' })
    mockTestSuiteFindMany.mockResolvedValue([])

    await expect(createTestRunFromValidatedValue(baseValue, 'project-1')).rejects.toMatchObject({
      message: 'One or more selected test suites could not be found.',
      statusCode: 400,
    })
  })

  it('rejects suite selections when the suite identifier tag is missing', async () => {
    mockTestRunFindFirst.mockResolvedValue(null)
    mockEnvironmentFindUnique.mockResolvedValue({ id: 'env-1' })
    mockTestSuiteFindMany.mockResolvedValue([
      {
        id: 'suite-1',
        name: 'Login Suite',
        tags: [],
        testCases: [{ id: 'tc-1', title: 'Login', tags: [createIdentifierTag('tc', 'login')] }],
      },
    ])

    await expect(createTestRunFromValidatedValue(baseValue, 'project-1')).rejects.toMatchObject({
      message: 'Test suite "Login Suite" does not have an identifier tag.',
      statusCode: 400,
    })
  })

  it('creates a standalone target-project run without generating hub feature files', async () => {
    mockResolveTargetProject.mockResolvedValue({
      id: 'target-1',
      displayName: 'Target App',
      canonicalPath: '/target/app',
    })
    mockTestRunFindFirst.mockResolvedValue(null)
    mockEnvironmentFindUnique.mockResolvedValue({ id: 'env-1', name: 'QA' })
    mockTestRunCreate.mockResolvedValue({ id: 'db-1', runId: 'run-1' })
    mockTestCaseFindMany.mockResolvedValue([{ id: 'case-1', TestSuite: [{ id: 'suite-1' }] }])

    const result = await createStandaloneTargetTestRun({
      target: 'target-1',
      environmentId: 'env-1',
      name: 'Target smoke',
      tagExpression: '@smoke',
      testWorkersCount: 3,
      browserEngine: BrowserEngine.FIREFOX,
    })

    expect(mockGenerateFeature).not.toHaveBeenCalled()
    expect(mockTestRunCreate).toHaveBeenCalledWith({
      data: {
        name: 'Target smoke',
        environmentId: 'env-1',
        testWorkersCount: 3,
        browserEngine: BrowserEngine.FIREFOX,
        status: TestRunStatus.RUNNING,
        result: TestRunResult.PENDING,
        targetProjectId: 'target-1',
        testCases: { create: [] },
      },
    })
    expect(mockExecuteTestRun).toHaveBeenCalledWith({
      testRunId: 'run-1',
      environment: { id: 'env-1', name: 'QA' },
      tagExpression: '@smoke',
      testWorkersCount: 3,
      browserEngine: BrowserEngine.FIREFOX,
      headless: true,
      projectRoot: '/target/app',
      prepareWorkspace: false,
    })
    expect(result).toMatchObject({
      runId: 'run-1',
      id: 'db-1',
      targetProjectId: 'target-1',
      testRunPageId: 'run-1',
      executionRunId: 'run-1',
      reportUrl: '/test-runs/run-1?project=target-1',
      logsUrl: '/api/test-runs/run-1/logs?targetProjectId=target-1',
      evidenceHealth: 'invalid_missing_report',
      nextAllowedAction: { tool: 'test_run_read' },
    })
  })

  it('atomically creates one expected association for a standalone run', async () => {
    mockResolveTargetProject.mockResolvedValue({
      id: 'target-1',
      displayName: 'Target App',
      canonicalPath: '/target/app',
    })
    mockTestRunFindFirst.mockResolvedValue(null)
    mockEnvironmentFindUnique.mockResolvedValue({ id: 'env-1', name: 'QA' })
    mockTestRunCreate.mockResolvedValue({ id: 'db-1', runId: 'run-1' })

    await createStandaloneTargetTestRun({
      target: 'target-1',
      environmentId: 'env-1',
      name: 'Standalone validation',
      tagExpression: '@ts_suite-1 and @tc_case-1',
      expectedTestCases: [{ testCaseId: 'case-1', testSuiteId: 'suite-1' }],
    })

    expect(mockTestRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        testCases: { create: [{ testCaseId: 'case-1', testSuiteId: 'suite-1' }] },
      }),
    })
    expect(mockExecuteTestRun).toHaveBeenCalledWith(
      expect.objectContaining({ tagExpression: '@ts_suite-1 and @tc_case-1' }),
    )
  })

  it('rejects an expected case paired with a suite it does not belong to', async () => {
    mockStandaloneTarget()
    mockTestCaseFindMany.mockResolvedValue([{ id: 'case-1', TestSuite: [{ id: 'suite-other' }] }])

    await expect(
      createStandaloneTargetTestRun({
        target: 'target-1',
        environmentId: 'env-1',
        expectedTestCases: [{ testCaseId: 'case-1', testSuiteId: 'suite-1' }],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('is not associated with test suite') })
    expect(mockTestRunCreate).not.toHaveBeenCalled()
  })
})

describe('updateTestRunTestCaseStatusFromScenario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the matching test run test case and metrics', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      completedAt: new Date('2025-01-03T00:00:00.000Z'),
      startedAt: new Date('2025-01-02T00:00:00.000Z'),
      testCases: [
        {
          id: 'trtc-1',
          testCaseId: 'tc-1',
          status: TestRunTestCaseStatus.PENDING,
          testSuiteId: 'suite-1',
          testCase: {
            id: 'tc-1',
            title: 'Login',
            tags: [createIdentifierTag('tc', 'login')],
          },
          testSuite: {
            id: 'suite-1',
            name: 'Login Suite',
            tags: [createIdentifierTag('ts', 'login')],
          },
        },
      ],
    })

    const result = await updateTestRunTestCaseStatusFromScenario('run-1', {
      scenarioName: '[Login] successful login',
      scenarioTags: ['@ts_login', '@tc_login'],
      status: 'failed',
      tracePath: 'traces/run-1.zip',
    })

    expect(result).toEqual({ kind: 'updated' })
    expect(mockTestRunTestCaseUpdate).toHaveBeenCalledWith({
      where: { id: 'trtc-1' },
      data: {
        status: TestRunTestCaseStatus.COMPLETED,
        result: TestRunTestCaseResult.FAILED,
        tracePath: 'traces/run-1.zip',
      },
    })
    expect(mockUpdateTestCaseMetrics).toHaveBeenCalledWith(
      'tc-1',
      TestRunTestCaseResult.FAILED,
      new Date('2025-01-03T00:00:00.000Z'),
    )
  })

  it('returns no_match when the scenario cannot be linked', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      testCases: [],
    })

    const result = await updateTestRunTestCaseStatusFromScenario('run-1', {
      scenarioName: 'Unknown scenario',
      status: 'passed',
    })

    expect(result).toEqual({
      kind: 'no_match',
      message: 'Scenario "Unknown scenario" completed but has no corresponding test case in this test run',
    })
    expect(mockTestRunTestCaseUpdate).not.toHaveBeenCalled()
  })

  it('returns test_run_not_found when the run is missing', async () => {
    mockTestRunFindUnique.mockResolvedValue(null)

    await expect(
      updateTestRunTestCaseStatusFromScenario('run-1', {
        scenarioName: 'Anything',
        status: 'passed',
      }),
    ).resolves.toEqual({ kind: 'test_run_not_found' })
  })
})

describe('test run log storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores formatted log lines and parses them back', async () => {
    const logs = [
      {
        type: 'stdout' as const,
        message: 'line one\nline two',
        timestamp: new Date('2025-01-01T00:00:00.000Z'),
      },
      {
        type: 'stderr' as const,
        message: 'boom',
        timestamp: new Date('2025-01-01T00:00:01.000Z'),
      },
    ]

    await storeTestRunLogsService('run-1', logs)

    expect(mockTestRunLogUpsert).toHaveBeenCalledWith({
      where: { testRunId: 'run-1' },
      create: {
        testRunId: 'run-1',
        logs: '[2025-01-01T00:00:00.000Z] [STDOUT] line one\\nline two\n[2025-01-01T00:00:01.000Z] [STDERR] boom',
      },
      update: {
        logs: '[2025-01-01T00:00:00.000Z] [STDOUT] line one\\nline two\n[2025-01-01T00:00:01.000Z] [STDERR] boom',
      },
    })

    mockTestRunLogFindUnique.mockResolvedValue({
      logs: '[2025-01-01T00:00:00.000Z] [STDOUT] line one\\nline two\n[2025-01-01T00:00:01.000Z] [STDERR] boom',
    })

    await expect(getTestRunLogsService('run-1')).resolves.toEqual(logs)
  })
})

describe('cancelTestRunService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns not_found when the run is missing', async () => {
    mockTestRunFindUnique.mockResolvedValue(null)

    await expect(cancelTestRunService('run-1')).resolves.toEqual({ kind: 'not_found' })
  })

  it('rejects cancellation for finished runs', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      id: 'db-1',
      status: TestRunStatus.COMPLETED,
    })

    await expect(cancelTestRunService('run-1')).resolves.toEqual({
      kind: 'invalid_state',
      message: 'Test run is not running, queued, or already being cancelled',
    })
  })

  it('marks the run cancelled when no process can be found', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      id: 'db-1',
      status: TestRunStatus.RUNNING,
    })
    mockProcessManagerGet.mockReturnValue(undefined)

    const result = await cancelTestRunService('run-1')

    expect(result).toEqual({ kind: 'cancelled_no_process' })
    expect(mockTestRunUpdate).toHaveBeenCalledTimes(2)
    expect(mockTestRunTestCaseUpdateMany).not.toHaveBeenCalled()
  })

  it('kills the running process and cancels pending test cases', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      id: 'db-1',
      status: TestRunStatus.RUNNING,
    })
    mockProcessManagerGet.mockReturnValue({ name: 'proc-1' })
    mockKillProcess.mockReturnValue(true)

    const result = await cancelTestRunService('run-1')

    expect(result).toEqual({ kind: 'stopped' })
    expect(mockKillProcess).toHaveBeenCalledWith('proc-1', 'SIGTERM')
    expect(mockTestRunTestCaseUpdateMany).toHaveBeenCalledWith({
      where: {
        testRunId: 'db-1',
        status: {
          in: [TestRunTestCaseStatus.PENDING, TestRunTestCaseStatus.RUNNING],
        },
      },
      data: {
        status: TestRunTestCaseStatus.CANCELLED,
        result: TestRunTestCaseResult.UNTESTED,
      },
    })
  })
})

describe('trace viewer helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns status for a running trace viewer process', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1' }],
    })
    mockGetProcess.mockReturnValue({ isRunning: true })

    await expect(checkTraceViewerStatusService('run-1', 'trtc-1')).resolves.toEqual({
      kind: 'ok',
      isRunning: true,
      processName: 'trace-viewer-trtc-1',
    })
  })

  it('returns test_case_not_in_run when the trace status lookup misses the case', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      testCases: [],
    })

    await expect(checkTraceViewerStatusService('run-1', 'trtc-1')).resolves.toEqual({
      kind: 'test_case_not_in_run',
    })
  })

  it('reports missing trace paths before spawn', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1', tracePath: null, testCase: { id: 'tc-1' } }],
    })

    await expect(spawnTraceViewerService('run-1', 'trtc-1')).resolves.toEqual({
      kind: 'no_trace_path',
    })
  })

  it('reports missing trace files before spawn', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1', tracePath: 'trace.zip', testCase: { id: 'tc-1' } }],
    })
    mockFsAccess.mockRejectedValue(new Error('missing'))

    await expect(spawnTraceViewerService('run-1', 'trtc-1')).resolves.toEqual({
      kind: 'trace_file_missing',
      path: 'trace.zip',
    })
  })

  it('spawns the trace viewer when the trace file exists', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1', tracePath: 'trace.zip', testCase: { id: 'tc-1' } }],
    })
    mockFsAccess.mockResolvedValue(undefined)
    mockSpawnTraceViewer.mockResolvedValue({ name: 'trace-viewer-trtc-1' })

    await expect(spawnTraceViewerService('run-1', 'trtc-1')).resolves.toEqual({
      kind: 'ok',
      processName: 'trace-viewer-trtc-1',
    })
    expect(mockSpawnTraceViewer).toHaveBeenCalledWith('trtc-1', '/resolved/trace.zip')
  })

  it('spawns capsule traces only from a verified private snapshot', async () => {
    const bytes = Buffer.from('PK capsule trace')
    mockTestRunFindUnique.mockResolvedValue({
      runtimeCapsule: { id: 'capsule-1' },
      testCases: [{ id: 'trtc-1', tracePath: 'managed/trace.zip', testCase: { id: 'tc-1' } }],
    })
    mockArtifactReadBytes.mockResolvedValue({ bytes, contentType: 'application/zip' })
    mockSpawnTraceViewerFromSnapshot.mockImplementation(async (_bytes, spawn) =>
      spawn('/appraise/tmp/trace-viewers/trace-private/trace.zip'),
    )
    mockSpawnTraceViewer.mockResolvedValue({ name: 'trace-viewer-trtc-1' })

    await expect(spawnTraceViewerService('run-1', 'trtc-1')).resolves.toEqual({
      kind: 'ok',
      processName: 'trace-viewer-trtc-1',
    })
    expect(mockArtifactReadBytes).toHaveBeenCalledWith({
      runId: 'run-1',
      kind: 'trace',
      testCaseId: 'trtc-1',
      storedPath: 'managed/trace.zip',
    })
    expect(mockSpawnTraceViewerFromSnapshot).toHaveBeenCalledWith(bytes, expect.any(Function))
    expect(mockSpawnTraceViewer).toHaveBeenCalledWith('trtc-1', '/appraise/tmp/trace-viewers/trace-private/trace.zip')
    expect(mockFsAccess).not.toHaveBeenCalled()
    expect(mockSpawnTraceViewer).not.toHaveBeenCalledWith('trtc-1', expect.stringContaining('managed/trace.zip'))
  })
})
