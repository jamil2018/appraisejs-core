import { describe, expect, it } from 'vitest'

import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import {
  delegatedOperationReceipts,
  liveAgentActivity,
  projectLifecycleNotifications,
  revisionImpact,
} from './plan-lifecycle-insights'

describe('plan lifecycle insights', () => {
  it('projects actionable lifecycle notifications from durable events', () => {
    const createdAt = new Date()
    expect(
      projectLifecycleNotifications([
        { sequence: 1, type: 'plan_review_ready', createdAt },
        { sequence: 2, type: 'task_updated', createdAt },
        { sequence: 3, type: 'validation_passed', createdAt },
      ]),
    ).toMatchObject([
      { eventSequence: 1, kind: 'review_ready', actor: 'Reviewer' },
      { eventSequence: 3, kind: 'completion_signoff_required', actor: 'Reviewer' },
    ])
  })

  it('reports bounded activity and stale revision impact', () => {
    const detail = {
      plan: { lifecycle: 'awaiting_validation_review', revision: 2, implementationGroups: [] },
      projection: { sourceHash: 'sha256:new' },
      events: [{ sequence: 4, type: 'validation_published', createdAt: new Date() }],
      validation: { revision: 1, baseRevision: { snapshotHash: 'sha256:old' }, baselineAttempts: [] },
      orphanedThreadIds: [],
    } as unknown as PlanReviewDetail
    expect(liveAgentActivity(detail)).toMatchObject({ phase: 'Validation review', waitState: 'waiting_for_human_gate' })
    expect(revisionImpact(detail)).toMatchObject({ status: 'stale', impacted: expect.arrayContaining(['validations']) })
  })

  it('keeps validation current across normal lifecycle source-hash transitions', () => {
    const detail = {
      plan: { lifecycle: 'completed', revision: 1, implementationGroups: [] },
      projection: { sourceHash: 'sha256:completed' },
      revisions: [{ sourceHash: 'sha256:validation-base' }, { sourceHash: 'sha256:completed' }],
      validation: {
        revision: 1,
        baseRevision: { snapshotHash: 'sha256:validation-base' },
        baselineAttempts: [],
      },
      orphanedThreadIds: [],
    } as unknown as PlanReviewDetail

    expect(revisionImpact(detail)).toMatchObject({ status: 'current', changedSinceValidation: false, impacted: [] })
  })

  it('content-addresses every automatic delegated authorization consumption', () => {
    const detail = {
      delegations: [
        {
          id: 'receipt-one',
          parentCoordinatorId: 'parent',
          delegatedCoordinatorId: 'worker',
          consumptions: [
            { permission: 'validation_prepare', operationKey: 'prepare-one', consumedAt: new Date('2026-07-18') },
          ],
        },
      ],
    } as unknown as PlanReviewDetail
    expect(delegatedOperationReceipts(detail)[0]).toMatchObject({
      authorizationReceiptId: 'receipt-one',
      delegatedCoordinatorId: 'worker',
      operationReceiptHash: expect.stringMatching(/^sha256:/),
    })
  })
})
