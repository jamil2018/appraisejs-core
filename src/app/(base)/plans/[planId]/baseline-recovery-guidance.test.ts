import { describe, expect, it } from 'vitest'

import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import { baselineRecoveryGuidance } from './baseline-recovery-guidance'

type Validation = NonNullable<PlanReviewDetail['validation']>

const attempt: Validation['baselineAttempts'][number] = {
  id: 'attempt-1',
  validationId: 'validation-1',
  browser: 'chromium',
  environment: 'local',
  testRunId: 'run-1',
  status: 'completed',
  classification: 'expected_product_failure',
  signatureHash: `sha256:${'a'.repeat(64)}`,
  evidence: { logsUrl: '/logs', reportUrl: '/report', traceUrls: [], screenshotUrls: [] },
  createdAt: '2026-07-18T00:00:00.000Z',
}

const validation = {
  validations: [
    {
      id: 'validation-1',
      expectedFailures: [
        {
          browser: 'chromium',
          environment: 'local',
          signature: 'Todo is not implemented',
          order: 0,
          lastPassingStepId: null,
        },
      ],
    },
  ],
  baselineAcknowledgements: [],
} as unknown as Validation

describe('baselineRecoveryGuidance', () => {
  it('guides exact expected-red acknowledgement and explains retry consequences', () => {
    expect(baselineRecoveryGuidance(validation, attempt)).toMatchObject({
      title: 'Expected regression captured',
      expectedSignatures: ['Todo is not implemented'],
      acknowledged: false,
      retryConsequence: expect.stringContaining('signature hash'),
    })
  })

  it('directs authoring failures through validation repair while preserving history', () => {
    expect(baselineRecoveryGuidance(validation, { ...attempt, classification: 'authoring_failure' })).toMatchObject({
      title: 'Validation authoring failed',
      allowedAction: expect.stringContaining('Repair and republish'),
      retryConsequence: expect.stringContaining('prior attempts'),
    })
  })
})
