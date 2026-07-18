import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

type Validation = NonNullable<PlanReviewDetail['validation']>
type Attempt = Validation['baselineAttempts'][number]

export type BaselineRecoveryGuidance = {
  title: string
  rootCause: string
  allowedAction: string
  retryConsequence: string
  expectedSignatures: string[]
  acknowledged: boolean
}

export function baselineRecoveryGuidance(validation: Validation, attempt: Attempt): BaselineRecoveryGuidance {
  const node = validation.validations.find(item => item.id === attempt.validationId)
  const expectedSignatures = (node?.expectedFailures ?? [])
    .filter(item => item.browser === attempt.browser && item.environment === attempt.environment)
    .sort((left, right) => left.order - right.order)
    .map(item => item.signature)
  const acknowledged = validation.baselineAcknowledgements.some(
    item => item.attemptId === attempt.id && item.signatureHash === attempt.signatureHash,
  )

  if (attempt.status === 'running' || attempt.status === 'scheduled') {
    return {
      title: 'Baseline is still running',
      rootCause: 'The managed run has not produced terminal evidence yet.',
      allowedAction: 'Wait for the connected agent to reconcile, or cancel all active baseline runs.',
      retryConsequence: 'A retry is unavailable until the active attempt reaches a terminal state.',
      expectedSignatures,
      acknowledged,
    }
  }
  if (attempt.classification === 'expected_product_failure') {
    return {
      title: 'Expected regression captured',
      rootCause: 'The observed ordered failure signatures match the approved expected-red declaration.',
      allowedAction: acknowledged ? 'Review the captured evidence.' : 'Acknowledge this exact expected regression.',
      retryConsequence:
        'Acknowledgement is bound to this attempt and signature hash; changed evidence requires a new acknowledgement.',
      expectedSignatures,
      acknowledged,
    }
  }
  if (attempt.classification === 'unexpected_pass') {
    return {
      title: 'Validation already passes',
      rootCause: 'The product behavior did not reproduce the approved pre-implementation failure.',
      allowedAction: attempt.regressionJustification
        ? 'Review the saved justification.'
        : 'Explain why this still proves regression coverage.',
      retryConsequence: 'A rerun creates a new immutable attempt; this justification remains attached to this attempt.',
      expectedSignatures,
      acknowledged,
    }
  }
  if (attempt.classification === 'unrelated_existing_failure') {
    return {
      title: 'Unrelated existing failure',
      rootCause: 'The observed failure falls outside the approved expected-red signatures.',
      allowedAction: acknowledged
        ? 'Review the acknowledgement.'
        : 'Acknowledge this exact unchanged failure or repair validation.',
      retryConsequence: 'Acknowledgement is signature-bound and becomes stale when the observed failure changes.',
      expectedSignatures,
      acknowledged,
    }
  }
  if (attempt.classification === 'authoring_failure') {
    return {
      title: 'Validation authoring failed',
      rootCause: 'Step definitions, imports, Cucumber configuration, setup, or the last required setup step failed.',
      allowedAction: 'Repair and republish the validation, then start a fresh managed baseline.',
      retryConsequence:
        'Review approvals and runtime projections are cleared; prior attempts and TestRun evidence remain immutable.',
      expectedSignatures,
      acknowledged,
    }
  }
  return {
    title: 'Baseline infrastructure failed',
    rootCause: 'The managed runtime ended without trustworthy product evidence.',
    allowedAction: 'Repair the runtime prerequisite, then start a fresh managed baseline.',
    retryConsequence: 'The retry creates a new attempt and preserves this attempt for audit history.',
    expectedSignatures,
    acknowledged,
  }
}
