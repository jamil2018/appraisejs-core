import { StepStatus } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  formatDuration,
  getDurationData,
  getFeatureData,
  getOverviewData,
  getReportMetrics,
  isValidReportDetail,
} from './report-detail-helpers'

function createReport() {
  return {
    id: 'report-1',
    testRun: {
      id: 'run-1',
      name: 'Nightly',
      environment: {
        name: 'Staging',
        baseUrl: 'https://example.com',
        apiBaseUrl: 'https://api.example.com',
      },
      result: 'PASSED',
      status: 'COMPLETED',
      testWorkersCount: 2,
      browserEngine: 'CHROMIUM',
      startedAt: new Date('2024-01-01T00:00:00.000Z'),
      completedAt: new Date('2024-01-01T00:00:10.000Z'),
      tags: [],
    },
    testCases: [
      {
        testRunTestCase: {
          result: 'PASSED',
        },
      },
      {
        testRunTestCase: {
          result: 'FAILED',
        },
      },
      {
        testRunTestCase: {
          result: 'UNTESTED',
        },
      },
    ],
    features: [
      {
        name: 'Checkout',
        scenarios: [
          {
            steps: [
              { status: StepStatus.PASSED, duration: BigInt(1_000_000_000) },
              { status: StepStatus.PASSED, duration: BigInt(2_000_000_000) },
            ],
            hooks: [{ status: StepStatus.PASSED, duration: BigInt(500_000_000) }],
          },
          {
            steps: [{ status: StepStatus.FAILED, duration: BigInt(1_000_000_000) }],
            hooks: [],
          },
          {
            steps: [{ status: StepStatus.SKIPPED, duration: BigInt(0) }],
            hooks: [],
          },
        ],
      },
    ],
  } as never
}

describe('report-detail helpers', () => {
  it('validates report shape and formats durations', () => {
    expect(isValidReportDetail(createReport())).toBe(true)
    expect(formatDuration(new Date('2024-01-01T00:00:00.000Z'), new Date('2024-01-01T01:02:03.000Z'))).toBe(
      '01h 02m 03s',
    )
  })

  it('derives report metrics and chart datasets', () => {
    const report = createReport()

    expect(getReportMetrics(report)).toEqual({
      totalTests: 3,
      passedTests: 1,
      failedTests: 1,
      untestedTests: 1,
    })
    expect(getOverviewData(report).map(item => item.value)).toEqual([1, 1, 1, 0])
    expect(getFeatureData(report)).toEqual([
      {
        feature: 'Checkout',
        passed: 1,
        failed: 1,
        cancelled: 1,
        unknown: 0,
        total: 3,
      },
    ])
    expect(getDurationData(report)).toEqual([
      {
        feature: 'Checkout',
        duration: 4.5,
      },
    ])
  })
})
