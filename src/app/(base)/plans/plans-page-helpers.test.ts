import { describe, expect, it } from 'vitest'

import {
  computePlanStats,
  filterPlans,
  getCardStyles,
  getLifecycleLabel,
  getPlanTaskProgress,
  parsePlansListSearchParams,
  sortPlans,
  type ListedPlan,
} from './plans-page-helpers'

function makePlan(overrides: Partial<ListedPlan> & Pick<ListedPlan, 'planId' | 'lifecycle'>): ListedPlan {
  return {
    slug: overrides.planId,
    goal: 'Test goal',
    description: 'Test description',
    revision: 1,
    stale: false,
    conflicted: false,
    tasks: [],
    issues: [],
    validationJson: null,
    updatedAt: new Date('2026-06-28T00:00:00.000Z'),
    ...overrides,
  }
}

describe('plans-page-helpers', () => {
  const plans: ListedPlan[] = [
    makePlan({ planId: 'draft', lifecycle: 'draft', goal: 'Draft plan' }),
    makePlan({ planId: 'review', lifecycle: 'awaiting_plan_review', goal: 'Review plan' }),
    makePlan({ planId: 'approved', lifecycle: 'plan_approved', goal: 'Approved plan' }),
    makePlan({ planId: 'running', lifecycle: 'in_progress', goal: 'Running plan' }),
    makePlan({ planId: 'done', lifecycle: 'completed', goal: 'Completed plan' }),
  ]

  it('filters plans by tab and query', () => {
    expect(filterPlans(plans, 'draft', '').map(plan => plan.planId)).toEqual(['draft'])
    expect(filterPlans(plans, 'awaiting_review', '').map(plan => plan.planId)).toEqual(['review'])
    expect(filterPlans(plans, 'all', 'running').map(plan => plan.planId)).toEqual(['running'])
  })

  it('filters plans by the canonical plan ID', () => {
    const plan = makePlan({ planId: 'pln_01canonical', lifecycle: 'draft', slug: 'friendly-slug' })

    expect(filterPlans([plan], 'all', 'pln_01canonical')).toEqual([plan])
  })

  it('sorts plans by selected comparator', () => {
    const byGoal = sortPlans(plans, 'goal').map(plan => plan.planId)
    expect(byGoal).toEqual(['approved', 'done', 'draft', 'review', 'running'])
  })

  it('computes dashboard stats from lifecycle buckets', () => {
    expect(computePlanStats(plans)).toEqual({
      totalActive: 3,
      totalApproved: 2,
      totalAwaitingReview: 1,
      totalInProgress: 1,
    })
  })

  it('derives card styles and labels from lifecycle state', () => {
    expect(getLifecycleLabel('awaiting_plan_review', false, false)).toBe('awaiting plan review')
    expect(getLifecycleLabel('draft', true, false)).toBe('Stale')
    expect(getLifecycleLabel('draft', false, true)).toBe('Conflicted')
    expect(getCardStyles('plan_approved', false, false).border).toContain('emerald')
    expect(getCardStyles('failed_validation', false, false).border).toContain('destructive')
  })

  it('calculates task progress from validation json', () => {
    const plan = makePlan({
      planId: 'progress',
      lifecycle: 'in_progress',
      tasks: [{ taskId: 'a' }, { taskId: 'b' }, { taskId: 'c' }],
      validationJson: JSON.stringify({
        implementation: { taskStates: { a: 'completed', b: 'implemented', c: 'pending' } },
      }),
    })

    expect(getPlanTaskProgress(plan)).toEqual({
      completedCount: 2,
      totalCount: 3,
      completionPercentage: 67,
    })
  })

  it('parses default list search params', () => {
    expect(parsePlansListSearchParams()).toEqual({ query: '', tab: 'all', sort: 'recent' })
    expect(parsePlansListSearchParams({ query: 'auth', tab: 'draft', sort: 'goal' })).toEqual({
      query: 'auth',
      tab: 'draft',
      sort: 'goal',
    })
  })
})
