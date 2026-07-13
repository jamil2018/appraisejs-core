import { describe, expect, it } from 'vitest'
import { hasInvalidLatestBaselineEvidence, latestBaselineAttempts } from './baseline-attempt-summary'

describe('baseline attempt UI summary', () => {
  it('uses only the latest attempt for each required combination', () => {
    const attempts = [
      {
        id: 'old',
        validationId: 'validation',
        browser: 'chromium',
        environment: 'local',
        testRunId: 'run-old',
        status: 'completed',
        classification: 'authoring_failure',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'latest',
        validationId: 'validation',
        browser: 'chromium',
        environment: 'local',
        testRunId: 'run-latest',
        status: 'completed',
        classification: 'expected_product_failure',
        createdAt: '2026-01-01T00:01:00.000Z',
      },
    ] as never

    expect(latestBaselineAttempts(attempts).map(attempt => attempt.id)).toEqual(['latest'])
    expect(hasInvalidLatestBaselineEvidence(attempts)).toBe(false)
  })
})
