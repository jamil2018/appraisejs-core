import { describe, expect, it } from 'vitest'
import { TestRunResult, TestRunStatus } from '@prisma/client'

import {
  getDurationSeconds,
  getProgressStats,
  getTestRunResultText,
  getTestRunStatusMeta,
} from './test-run-details-helpers'

describe('test-run-details helpers', () => {
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
})
