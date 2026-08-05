import { describe, expect, it } from 'vitest'

import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import {
  continuationPackage,
  evidenceDelta,
  lifecycleDisplayLabel,
  lifecycleProgress,
  nextLifecycleAction,
} from './plan-lifecycle-guidance'

describe('plan lifecycle guidance', () => {
  it('maps lifecycle state to a five-stage progress rail and exact next actor', () => {
    expect(lifecycleProgress('baseline_review').map(stage => stage.state)).toEqual([
      'complete',
      'complete',
      'active',
      'upcoming',
      'upcoming',
    ])
    expect(lifecycleProgress('baseline_review')[2]).toMatchObject({ label: 'Current evidence', state: 'active' })
    expect(lifecycleProgress('baseline_review').map(stage => stage.label)).toEqual([
      'Quality plan',
      'Validation design',
      'Current evidence',
      'External change',
      'Final evidence',
    ])
    expect(lifecycleDisplayLabel('baseline_review')).toBe('current evidence review')
    expect(nextLifecycleAction('baseline_accepted')).toEqual({
      actor: 'Agent',
      action: 'Current-state evidence is accepted; continue the external workflow.',
    })
    expect(nextLifecycleAction('validation_passed')).toEqual({
      actor: 'Reviewer',
      action: 'Review final evidence and record the quality decision.',
    })
  })

  it('builds a compact continuation package and compares baseline with final evidence', () => {
    const detail = {
      plan: { planId: 'plan-1', lifecycle: 'validation_passed', revision: 2 },
      planContentHash: 'sha256:plan',
      planStateHash: 'sha256:state',
      reviewBindingHash: 'sha256:review',
      validationContentHash: 'sha256:validation',
      projection: { targetProjectId: 'project-1' },
      events: [{ sequence: 7 }],
      validation: {
        baselineAttempts: [
          {
            id: 'baseline-1',
            validationId: 'validation-1',
            status: 'completed',
            classification: 'unrelated_existing_failure',
            createdAt: '2026-07-14T00:00:00.000Z',
          },
        ],
      },
      completionReview: {
        evidenceHash: 'sha256:completion',
        validationRuns: [{ validationId: 'validation-1', status: 'passed', assurance: 'full', testRunId: 'run-final' }],
      },
    } as unknown as PlanReviewDetail

    expect(JSON.parse(continuationPackage(detail, 'http://localhost:3000/plans/plan-1'))).toMatchObject({
      planId: 'plan-1',
      targetProjectId: 'project-1',
      cursor: { currentAfterSequence: 7, nextAfterSequence: 7 },
      hashes: { completionEvidenceHash: 'sha256:completion' },
    })
    expect(evidenceDelta(detail)).toEqual([
      expect.objectContaining({
        validationId: 'validation-1',
        baselineStatus: 'unrelated_existing_failure',
        finalStatus: 'passed',
        assurance: 'full',
        baseline: expect.objectContaining({ classification: 'unrelated_existing_failure' }),
        final: expect.objectContaining({ status: 'passed', assurance: 'full' }),
      }),
    ])
  })
})
