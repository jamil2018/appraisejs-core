import { createHash } from 'node:crypto'

import { canonicalize, type PlanArtifact } from '@/lib/plan-contract'

function namedHash(domain: string, value: unknown): string {
  const serialized = JSON.stringify({ domain, value: canonicalize(value) })
  return `sha256:${createHash('sha256').update(serialized).digest('hex')}`
}

export function planContentHash(plan: PlanArtifact): string {
  const { lifecycle, ...reviewedContent } = plan
  void lifecycle
  return namedHash('appraise.plan-content', reviewedContent)
}

export function reviewBindingHash(plan: PlanArtifact): string {
  return namedHash('appraise.plan-review-binding', {
    planContentHash: planContentHash(plan),
    revision: plan.revision,
  })
}

export function planStateHash(plan: PlanArtifact): string {
  return namedHash('appraise.plan-state', {
    lifecycle: plan.lifecycle,
    planContentHash: planContentHash(plan),
    revision: plan.revision,
  })
}

export function transitionStateHash(input: { lifecycle: string; planContentHash: string; revision: number }): string {
  return namedHash('appraise.plan-state', input)
}
