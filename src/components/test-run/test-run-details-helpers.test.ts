import { describe, expect, it } from 'vitest'
import { TestRunResult, TestRunStatus } from '@prisma/client'

import {
  getDurationSeconds,
  getProgressStats,
  getTestRunResultText,
  getTestRunStatusMeta,
} from './test-run-details-helpers'
import { getTestRunDetailsData, getTraceViewerStatusData } from './test-run-details-guards'

describe('test-run-details helpers', () => {
  const validTestRunDetails = {
    id: 'run-row-1',
    runId: 'RUN-1',
    status: TestRunStatus.COMPLETED,
    result: TestRunResult.PASSED,
    startedAt: new Date('2024-01-01T00:00:00.000Z'),
    completedAt: new Date('2024-01-01T00:00:07.000Z'),
    browserEngine: 'chromium',
    testWorkersCount: 2,
    testCases: [
      {
        id: 'case-run-1',
        status: TestRunStatus.COMPLETED,
        result: TestRunResult.PASSED,
        tracePath: null,
        testCase: {
          title: 'Can sign in',
          description: 'Valid credentials open the dashboard',
        },
        testSuite: {
          id: 'suite-1',
          name: 'Authentication',
        },
      },
    ],
    tags: [{ id: 'tag-1', name: 'smoke' }],
    environment: { id: 'environment-1', name: 'Local' },
    reports: [{ id: 'report-1', testRunId: 'run-row-1' }],
  }

  const withTestRunDetails = (overrides: Record<string, unknown>) => ({
    ...validTestRunDetails,
    ...overrides,
  })

  it('builds progress stats from completed and cancelled test cases', () => {
    const progress = getProgressStats([
      { status: 'COMPLETED' },
      { status: 'CANCELLED' },
      { status: 'RUNNING' },
    ] as never)

    expect(progress).toEqual({
      total: 3,
      completed: 2,
      percentage: (2 / 3) * 100,
    })
  })

  it('formats run status, result, and duration values', () => {
    expect(getTestRunStatusMeta(TestRunStatus.COMPLETED, TestRunResult.PASSED).label).toBe('Completed')
    expect(getTestRunResultText(TestRunResult.FAILED)).toBe('Failed')
    expect(getDurationSeconds(new Date('2024-01-01T00:00:00.000Z'), new Date('2024-01-01T00:00:07.000Z'))).toBe(7)
  })

  it('returns test run details data only for the expected nested payload shape', () => {
    expect(getTestRunDetailsData(validTestRunDetails)).toBe(validTestRunDetails)
    expect(getTestRunDetailsData({ ...validTestRunDetails, startedAt: '2024-01-01T00:00:00.000Z' })).toBeNull()
    expect(getTestRunDetailsData({ ...validTestRunDetails, testCases: [{ id: 'case-run-1' }] })).toBeNull()
    expect(getTestRunDetailsData({ ...validTestRunDetails, environment: null })).toBeNull()
  })

  it('accepts valid nullable completedAt, tracePath, and testSuite values', () => {
    const validNullablePayload = withTestRunDetails({
      completedAt: null,
      testCases: [
        {
          ...validTestRunDetails.testCases[0],
          tracePath: '/tmp/trace.zip',
          testSuite: null,
        },
      ],
    })

    expect(getTestRunDetailsData(validNullablePayload)).toBe(validNullablePayload)
  })

  it('rejects malformed top-level test run details fields', () => {
    expect(getTestRunDetailsData(undefined)).toBeNull()
    expect(getTestRunDetailsData(null)).toBeNull()
    expect(getTestRunDetailsData('not-a-run')).toBeNull()
    expect(getTestRunDetailsData(withTestRunDetails({ completedAt: '2024-01-01T00:00:07.000Z' }))).toBeNull()
    expect(getTestRunDetailsData(withTestRunDetails({ tags: [{ id: 'tag-1' }] }))).toBeNull()
    expect(getTestRunDetailsData(withTestRunDetails({ reports: [{ id: 'report-1' }] }))).toBeNull()
  })

  it('rejects malformed nested test case details', () => {
    const baseTestCase = validTestRunDetails.testCases[0]
    const testCaseWithoutTracePath: Record<string, unknown> = { ...baseTestCase }
    delete testCaseWithoutTracePath.tracePath

    expect(
      getTestRunDetailsData(
        withTestRunDetails({
          testCases: [{ ...baseTestCase, testCase: { title: 'Missing description' } }],
        }),
      ),
    ).toBeNull()
    expect(
      getTestRunDetailsData(
        withTestRunDetails({
          testCases: [{ ...baseTestCase, testSuite: { id: 'suite-1' } }],
        }),
      ),
    ).toBeNull()
    expect(
      getTestRunDetailsData(
        withTestRunDetails({
          testCases: [testCaseWithoutTracePath],
        }),
      ),
    ).toBeNull()
  })

  it('returns trace viewer status data only when isRunning is boolean', () => {
    expect(getTraceViewerStatusData({ isRunning: true })).toEqual({ isRunning: true })
    expect(getTraceViewerStatusData({ isRunning: false })).toEqual({ isRunning: false })
    expect(getTraceViewerStatusData({ isRunning: 'true' })).toBeNull()
    expect(getTraceViewerStatusData(undefined)).toBeNull()
  })
})
