import { describe, expect, it, vi } from 'vitest'
import { TestRunTestCaseResult } from '@prisma/client'
import { getTestSuiteExecutionData } from './dashboard-service'

vi.mock('@/config/db-config', () => ({
  default: {
    testRun: { findMany: vi.fn() },
    report: { findMany: vi.fn() },
  },
}))

import prisma from '@/config/db-config'

describe('getTestSuiteExecutionData', () => {
  it('returns empty array when no completed test runs', async () => {
    vi.mocked(prisma.testRun.findMany).mockResolvedValue([] as never)
    await expect(getTestSuiteExecutionData()).resolves.toEqual([])
    expect(prisma.report.findMany).not.toHaveBeenCalled()
  })

  it('aggregates per-suite counts from reports', async () => {
    vi.mocked(prisma.testRun.findMany).mockResolvedValue([{ id: 'run-1' }] as never)
    vi.mocked(prisma.report.findMany).mockResolvedValue([
      {
        id: 'rep-1',
        testCases: [
          {
            testRunTestCase: {
              result: TestRunTestCaseResult.PASSED,
              testCase: {
                TestSuite: [{ id: 'suite-a', name: 'Alpha' }],
              },
            },
          },
          {
            testRunTestCase: {
              result: TestRunTestCaseResult.FAILED,
              testCase: {
                TestSuite: [{ id: 'suite-a', name: 'Alpha' }],
              },
            },
          },
          {
            testRunTestCase: {
              result: TestRunTestCaseResult.UNTESTED,
              testCase: {
                TestSuite: [{ id: 'suite-b', name: 'Beta' }],
              },
            },
          },
        ],
      },
    ] as never)

    const data = await getTestSuiteExecutionData()

    expect(data).toHaveLength(2)
    const alpha = data.find(d => d.feature === 'Alpha')
    const beta = data.find(d => d.feature === 'Beta')
    expect(alpha).toMatchObject({
      passed: 1,
      failed: 1,
      cancelled: 0,
      unknown: 0,
      total: 2,
    })
    expect(beta).toMatchObject({
      passed: 0,
      failed: 0,
      cancelled: 1,
      unknown: 0,
      total: 1,
    })
  })

  it('maps non-pass/fail/untested results to unknown', async () => {
    vi.mocked(prisma.testRun.findMany).mockResolvedValue([{ id: 'run-1' }] as never)
    vi.mocked(prisma.report.findMany).mockResolvedValue([
      {
        id: 'rep-1',
        testCases: [
          {
            testRunTestCase: {
              result: 'OTHER' as TestRunTestCaseResult,
              testCase: {
                TestSuite: [{ id: 'suite-x', name: 'Gamma' }],
              },
            },
          },
        ],
      },
    ] as never)

    const data = await getTestSuiteExecutionData()
    expect(data).toEqual([
      expect.objectContaining({
        feature: 'Gamma',
        passed: 0,
        failed: 0,
        cancelled: 0,
        unknown: 1,
        total: 1,
      }),
    ])
  })
})
