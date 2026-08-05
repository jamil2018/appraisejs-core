import { describe, expect, it } from 'vitest'

import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import { lifecycleCommandCenterState } from './lifecycle-command-center'

describe('lifecycleCommandCenterState', () => {
  it('projects the owner, active attempt, blocker, and scoped recovery URL', () => {
    const detail = {
      plan: { planId: 'plan-one', lifecycle: 'baseline_running' },
      projection: { targetProjectId: 'project-one' },
      issues: [{ blocking: true, message: 'Runtime evidence is incomplete.' }],
      blockingThreadIds: [],
      orphanedThreadIds: [],
      validation: {
        validations: [
          {
            id: 'validation-one',
            required: true,
            matrix: [{ browser: 'chromium', environment: 'local' }],
          },
        ],
        baselineAttempts: [
          {
            id: 'attempt-one',
            validationId: 'validation-one',
            testRunId: 'run-one',
            status: 'running',
            browser: 'chromium',
            environment: 'local',
          },
        ],
      },
    } as unknown as PlanReviewDetail
    expect(lifecycleCommandCenterState(detail)).toMatchObject({
      gate: 'Current evidence',
      owner: 'Agent',
      blockers: ['Runtime evidence is incomplete.'],
      activeAttempt: { id: 'attempt-one', testRunId: 'run-one' },
      recoveryUrl: '/plans/plan-one?project=project-one&review=baseline',
    })
  })
})
