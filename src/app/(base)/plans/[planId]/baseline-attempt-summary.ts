import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

type Attempt = NonNullable<PlanReviewDetail['validation']>['baselineAttempts'][number]
type Validation = NonNullable<PlanReviewDetail['validation']>

function requiredCombinationKeys(validation?: Validation): Set<string> | undefined {
  if (!validation) return undefined
  return new Set(
    validation.validations
      .filter(item => item.required)
      .flatMap(item => item.matrix.map(combination => `${item.id}:${combination.browser}:${combination.environment}`)),
  )
}

export function latestBaselineAttempts(attempts: Attempt[], validation?: Validation): Attempt[] {
  const requiredKeys = requiredCombinationKeys(validation)
  const latest = new Map<string, Attempt>()
  attempts.forEach(attempt => {
    const key = `${attempt.validationId}:${attempt.browser}:${attempt.environment}`
    if (!requiredKeys || requiredKeys.has(key)) latest.set(key, attempt)
  })
  return [...latest.values()]
}

export function hasInvalidLatestBaselineEvidence(attempts: Attempt[], validation?: Validation): boolean {
  return latestBaselineAttempts(attempts, validation).some(
    attempt => attempt.classification === 'authoring_failure' || attempt.classification === 'infrastructure_failure',
  )
}
