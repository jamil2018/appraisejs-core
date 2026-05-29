import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TagType, TestRunTestCaseStatus } from '@prisma/client'
import { RECENT_PERIOD_DAYS } from '@/services/shared/constants'

const {
  mockReportFindUnique,
  mockReportFindFirst,
  mockReportCreate,
  mockReportFeatureCreate,
  mockReportFeatureTagCreate,
  mockReportScenarioCreate,
  mockReportScenarioTagCreate,
  mockReportStepCreate,
  mockReportHookCreate,
  mockReportTestCaseCreate,
  mockTestRunFindUnique,
  mockTestCaseFindMany,
  mockTestCaseMetricsFindMany,
  mockTestSuiteFindMany,
  mockTestSuiteMetricsFindMany,
  mockUpdateTestSuiteMetrics,
} = vi.hoisted(() => ({
  mockReportFindUnique: vi.fn(),
  mockReportFindFirst: vi.fn(),
  mockReportCreate: vi.fn(),
  mockReportFeatureCreate: vi.fn(),
  mockReportFeatureTagCreate: vi.fn(),
  mockReportScenarioCreate: vi.fn(),
  mockReportScenarioTagCreate: vi.fn(),
  mockReportStepCreate: vi.fn(),
  mockReportHookCreate: vi.fn(),
  mockReportTestCaseCreate: vi.fn(),
  mockTestRunFindUnique: vi.fn(),
  mockTestCaseFindMany: vi.fn(),
  mockTestCaseMetricsFindMany: vi.fn(),
  mockTestSuiteFindMany: vi.fn(),
  mockTestSuiteMetricsFindMany: vi.fn(),
  mockUpdateTestSuiteMetrics: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({
  default: {
    report: {
      findUnique: mockReportFindUnique,
      findFirst: mockReportFindFirst,
      create: mockReportCreate,
    },
    reportFeature: { create: mockReportFeatureCreate },
    reportFeatureTag: { create: mockReportFeatureTagCreate },
    reportScenario: { create: mockReportScenarioCreate },
    reportScenarioTag: { create: mockReportScenarioTagCreate },
    reportStep: { create: mockReportStepCreate },
    reportHook: { create: mockReportHookCreate },
    reportTestCase: { create: mockReportTestCaseCreate },
    testRun: { findUnique: mockTestRunFindUnique },
    testCase: { findMany: mockTestCaseFindMany },
    testSuite: { findMany: mockTestSuiteFindMany },
    testCaseMetrics: { findMany: mockTestCaseMetricsFindMany },
    testSuiteMetrics: { findMany: mockTestSuiteMetricsFindMany },
  },
}))

vi.mock('@/lib/metrics/metric-calculator', () => ({
  updateTestSuiteMetrics: mockUpdateTestSuiteMetrics,
}))

vi.mock('@/lib/automation/automation-path-roots', () => ({
  resolveStoredPath: vi.fn((storedPath: string) => storedPath),
  toProjectRelativePath: vi.fn((storedPath: string) => storedPath),
}))

import {
  getAllTestCaseMetricsForFilter,
  getAllTestSuiteMetricsForFilter,
  getReportByIdOrThrow,
  storeReportFromFileService,
} from './report-service'

const fixturePath = path.resolve(
  process.cwd(),
  'src/tests/reports/cucumber-b4087079-b7f9-415e-a93b-223a8c9be966-1771525057078.json',
)

function createIdentifierTag(name: string) {
  return {
    id: name,
    name,
    tagExpression: `@${name}`,
    type: TagType.IDENTIFIER,
  }
}

describe('storeReportFromFileService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReportCreate.mockResolvedValue({ id: 'report-1' })
    mockReportFeatureCreate.mockResolvedValue({ id: 'feature-1' })
    mockReportScenarioCreate.mockResolvedValue({ id: 'scenario-1' })
    mockReportStepCreate.mockResolvedValue({ id: 'step-1' })
    mockReportHookCreate.mockResolvedValue({ id: 'hook-1' })
    mockReportTestCaseCreate.mockResolvedValue({ id: 'rtc-1' })
  })

  it('stores a parsed cucumber report, links scenarios to test run test cases, and updates suite metrics', async () => {
    mockTestRunFindUnique.mockResolvedValue({
      id: 'db-run-1',
      runId: 'run-1',
      name: 'Nightly',
      completedAt: new Date('2025-02-01T00:00:00.000Z'),
      startedAt: new Date('2025-01-31T23:00:00.000Z'),
      testCases: [
        {
          id: 'trtc-1',
          testCaseId: 'tc-1',
          testSuiteId: 'suite-1',
          status: TestRunTestCaseStatus.PENDING,
          testCase: {
            id: 'tc-1',
            title: 'Login',
            tags: [createIdentifierTag('tc_2d328a936cf4c446')],
          },
          testSuite: {
            id: 'suite-1',
            name: 'Login Suite',
            tags: [createIdentifierTag('ts_login')],
          },
        },
      ],
    })

    const outcome = await storeReportFromFileService('run-1', fixturePath)

    expect(outcome).toEqual({ success: true, reportId: 'report-1' })
    expect(mockReportCreate).toHaveBeenCalledWith({
      data: {
        name: 'Test Run Report - Nightly',
        description: 'Report for test run: Nightly',
        reportPath: fixturePath,
        testRunId: 'db-run-1',
      },
    })
    expect(mockReportFeatureCreate).toHaveBeenCalledTimes(1)
    expect(mockReportScenarioCreate).toHaveBeenCalledTimes(1)
    expect(mockReportStepCreate).toHaveBeenCalledTimes(6)
    expect(mockReportHookCreate).toHaveBeenCalledTimes(2)
    expect(mockReportTestCaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reportId: 'report-1',
        testCaseId: 'tc-1',
        testRunTestCaseId: 'trtc-1',
        reportScenarioId: 'scenario-1',
        duration: expect.any(String),
      }),
    })
    expect(mockUpdateTestSuiteMetrics).toHaveBeenCalledWith('suite-1', new Date('2025-02-01T00:00:00.000Z'))
  })

  it('returns file_not_found when the report file does not exist', async () => {
    await expect(storeReportFromFileService('run-1', '/missing/report.json')).resolves.toEqual({
      success: false,
      reason: 'file_not_found',
      message: 'Report file not found at /missing/report.json',
    })
  })

  it('returns test_run_not_found when the run cannot be loaded', async () => {
    mockTestRunFindUnique.mockResolvedValue(null)

    await expect(storeReportFromFileService('run-1', fixturePath)).resolves.toEqual({
      success: false,
      reason: 'test_run_not_found',
      message: 'Test run not found for runId: run-1',
    })
  })
})

describe('getReportByIdOrThrow', () => {
  it('throws when the report is missing', async () => {
    mockReportFindUnique.mockResolvedValue(null)

    await expect(getReportByIdOrThrow('missing')).rejects.toMatchObject({
      message: 'Report not found',
      statusCode: 404,
    })
  })
})

describe('getAllTestCaseMetricsForFilter', () => {
  const baseRows = [
    { id: 'm1', isRepeatedlyFailing: true, isFlaky: false, testCase: {} },
    { id: 'm2', isRepeatedlyFailing: false, isFlaky: true, testCase: {} },
    { id: 'm3', isRepeatedlyFailing: false, isFlaky: false, testCase: {} },
  ]

  beforeEach(() => {
    mockTestCaseMetricsFindMany.mockResolvedValue(baseRows)
  })

  it('returns all rows when filter is empty', async () => {
    const r = await getAllTestCaseMetricsForFilter('')
    expect(r).toHaveLength(3)
  })

  it('filters to repeatedly failing when requested', async () => {
    const r = await getAllTestCaseMetricsForFilter('repeatedlyFailing')
    expect(r.map(x => x.id)).toEqual(['m1'])
  })

  it('filters to flaky when requested', async () => {
    const r = await getAllTestCaseMetricsForFilter('flaky')
    expect(r.map(x => x.id)).toEqual(['m2'])
  })
})

describe('getAllTestSuiteMetricsForFilter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns all rows when filter is not notExecutedRecently', async () => {
    const rows = [{ id: 's1', lastExecutedAt: new Date('2025-06-14'), testSuite: {} }]
    mockTestSuiteMetricsFindMany.mockResolvedValue(rows)

    const r = await getAllTestSuiteMetricsForFilter('')
    expect(r).toHaveLength(1)
  })

  it('keeps suites never executed or last run before the recent window', async () => {
    const old = new Date('2025-06-01T12:00:00.000Z')
    const neverExecutedCreatedAt = new Date('2025-05-01T12:00:00.000Z')
    mockTestSuiteFindMany.mockResolvedValue([
      {
        id: 'suite-a',
        createdAt: neverExecutedCreatedAt,
        updatedAt: neverExecutedCreatedAt,
        metrics: null,
      },
      {
        id: 'suite-b',
        createdAt: old,
        updatedAt: old,
        metrics: {
          id: 'metric-b',
          lastExecutedAt: old,
          createdAt: old,
          updatedAt: old,
        },
      },
    ])

    const r = await getAllTestSuiteMetricsForFilter('notExecutedRecently')
    expect(mockTestSuiteFindMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            metrics: {
              is: null,
            },
          },
          {
            metrics: {
              is: {
                lastExecutedAt: {
                  lt: new Date('2025-06-08T12:00:00.000Z'),
                },
              },
            },
          },
        ],
      },
      include: {
        tags: true,
        testCases: true,
        metrics: true,
      },
    })
    expect(r.map(x => x.id).sort()).toEqual(['metric-b', 'unexecuted-suite-a'])
    expect(r.find(x => x.id === 'unexecuted-suite-a')).toMatchObject({
      testSuiteId: 'suite-a',
      lastExecutedAt: null,
    })
    expect(RECENT_PERIOD_DAYS).toBe(7)
  })
})
