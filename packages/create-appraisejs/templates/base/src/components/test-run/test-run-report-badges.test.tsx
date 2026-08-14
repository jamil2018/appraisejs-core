import { TestRunResult, TestRunStatus } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { testRunResultPresentation, testRunStatusPresentation } from './test-run-report-badges'

describe('test-run report badges', () => {
  it.each([
    [TestRunResult.PASSED, 'Passed'],
    [TestRunResult.FAILED, 'Failed'],
    [TestRunResult.BLOCKED, 'Blocked'],
    [TestRunResult.CANCELLED, 'Cancelled'],
    [TestRunResult.PENDING, 'Pending'],
  ] as const)('presents %s results exhaustively', (result, label) => {
    expect(testRunResultPresentation[result].label).toBe(label)
  })

  it.each([
    [TestRunStatus.QUEUED, 'Queued'],
    [TestRunStatus.RUNNING, 'Running'],
    [TestRunStatus.CANCELLING, 'Cancelling'],
    [TestRunStatus.COMPLETED, 'Completed'],
    [TestRunStatus.CANCELLED, 'Cancelled'],
  ] as const)('presents %s statuses exhaustively', (status, label) => {
    expect(testRunStatusPresentation[status].label).toBe(label)
  })
})
