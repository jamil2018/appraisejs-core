import { describe, expect, it } from 'vitest'

import type { PlanArtifact } from '@/lib/plan-contract'

import { planContentHash, planStateHash, reviewBindingHash } from './plan-hashes'

function plan(overrides: Partial<PlanArtifact> = {}): PlanArtifact {
  return {
    version: '1',
    planId: 'hash-contract',
    revision: 1,
    lifecycle: 'awaiting_plan_review',
    goal: 'Prove named hash semantics',
    description: 'Keep reviewed content distinct from lifecycle state.',
    tasks: [],
    edges: [],
    implementationGroups: [],
    ...overrides,
  }
}

describe('named plan hashes', () => {
  it('preserves reviewed content across lifecycle-only transitions', () => {
    const awaitingReview = plan()
    const approved = plan({ lifecycle: 'plan_approved' })

    expect(planContentHash(approved)).toBe(planContentHash(awaitingReview))
    expect(reviewBindingHash(approved)).toBe(reviewBindingHash(awaitingReview))
    expect(planStateHash(approved)).not.toBe(planStateHash(awaitingReview))
  })

  it('changes content and review binding when a revision changes', () => {
    const first = plan()
    const revised = plan({ revision: 2, description: 'Reviewed content changed.' })

    expect(planContentHash(revised)).not.toBe(planContentHash(first))
    expect(reviewBindingHash(revised)).not.toBe(reviewBindingHash(first))
    expect(planStateHash(revised)).not.toBe(planStateHash(first))
  })
})
