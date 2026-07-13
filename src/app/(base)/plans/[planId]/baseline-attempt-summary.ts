import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

type Attempt = NonNullable<PlanReviewDetail['validation']>['baselineAttempts'][number]

export function latestBaselineAttempts(attempts: Attempt[]): Attempt[] {
  const latest = new Map<string, Attempt>()
  attempts.forEach(attempt => {
    latest.set(`${attempt.validationId}:${attempt.browser}:${attempt.environment}`, attempt)
  })
  return [...latest.values()]
}

export function hasInvalidLatestBaselineEvidence(attempts: Attempt[]): boolean {
  return latestBaselineAttempts(attempts).some(
    attempt => attempt.classification === 'authoring_failure' || attempt.classification === 'infrastructure_failure',
  )
}
