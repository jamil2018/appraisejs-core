import { describe, expect, it } from 'vitest'

import {
  conversationCollaborationReviewSchema,
  parseConversationCollaborationRequest,
  sameConversationCollaborationReview,
} from './collaboration-review'

const digest = `sha256:${'a'.repeat(64)}`
const review = {
  kind: 'RECORDS' as const,
  targetProjectId: 'project-1',
  operationId: 'operation-1',
  intent: 'RECEIVE' as const,
  expectedVersion: 2,
  preparedDigest: digest,
  reviewItems: [{ recordKey: 'module:one', disposition: 'CONFLICT' }],
}

describe('exact collaboration chat review', () => {
  it('accepts only the bounded exact review envelope', () => {
    expect(conversationCollaborationReviewSchema.safeParse(review).success).toBe(true)
    expect(conversationCollaborationReviewSchema.safeParse({ ...review, extra: 'forged' }).success).toBe(false)
    expect(conversationCollaborationReviewSchema.safeParse({ ...review, reviewItems: [] }).success).toBe(false)
    expect(conversationCollaborationReviewSchema.safeParse({ ...review, preparedDigest: 'changed' }).success).toBe(
      false,
    )
  })

  it('compares scope and review items independent of key insertion order', () => {
    const reordered = conversationCollaborationReviewSchema.parse({
      operationId: review.operationId,
      targetProjectId: review.targetProjectId,
      preparedDigest: review.preparedDigest,
      expectedVersion: review.expectedVersion,
      reviewItems: review.reviewItems,
      kind: review.kind,
      intent: review.intent,
    })
    expect(sameConversationCollaborationReview(review, reordered)).toBe(true)
    expect(sameConversationCollaborationReview(review, { ...review, expectedVersion: 3 })).toBe(false)
    expect(
      sameConversationCollaborationReview(review, {
        ...review,
        reviewItems: [{ recordKey: 'module:two', disposition: 'CONFLICT' }],
      }),
    ).toBe(false)
  })

  it('recognizes a narrow set of exact phrases', () => {
    expect(parseConversationCollaborationRequest(' Prepare receive. ')).toEqual({ kind: 'PREPARE', intent: 'RECEIVE' })
    expect(parseConversationCollaborationRequest('Use all incoming')).toEqual({
      kind: 'DECIDE',
      decision: 'USE_INCOMING',
    })
    expect(parseConversationCollaborationRequest('Use incoming except one')).toBeNull()
  })
})
