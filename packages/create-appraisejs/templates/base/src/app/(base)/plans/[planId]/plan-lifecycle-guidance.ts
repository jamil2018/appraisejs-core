import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'
import { nextLifecycleAction } from '@/lib/plans/lifecycle-guidance'

export {
  LIFECYCLE_STAGES,
  lifecycleDisplayLabel,
  lifecycleProgress,
  nextLifecycleAction,
} from '@/lib/plans/lifecycle-guidance'

export function continuationPackage(detail: PlanReviewDetail, browserUrl: string) {
  const latestSequence = detail.events.reduce((latest, event) => Math.max(latest, event.sequence), 0)
  const nextAction = nextLifecycleAction(detail.plan.lifecycle)
  return JSON.stringify(
    {
      schemaVersion: 1,
      planId: detail.plan.planId,
      targetProjectId: detail.projection.targetProjectId,
      lifecycle: detail.plan.lifecycle,
      revision: detail.plan.revision,
      hashes: {
        planContentHash: detail.planContentHash,
        planStateHash: detail.planStateHash,
        reviewBindingHash: detail.reviewBindingHash,
        validationContentHash: detail.validationContentHash,
        completionEvidenceHash: detail.completionReview?.evidenceHash,
      },
      cursor: { currentAfterSequence: latestSequence, nextAfterSequence: latestSequence },
      reviewUrl: browserUrl,
      nextAction,
    },
    null,
    2,
  )
}

type BaselineAttempt = NonNullable<PlanReviewDetail['validation']>['baselineAttempts'][number]
type FinalRun = NonNullable<PlanReviewDetail['completionReview']>['validationRuns'][number]

function baselineLabel(baseline: BaselineAttempt | undefined) {
  if (!baseline) return 'Missing'
  return baseline.classification ?? baseline.status
}

function assuranceLabel(baseline: BaselineAttempt | undefined, finalRun: FinalRun | undefined) {
  if (finalRun) return finalRun.assurance
  return baseline ? 'baseline only' : 'none'
}

function evidenceDeltaRow(
  validationId: string,
  latestBaseline: Map<string, BaselineAttempt>,
  finalRuns: Map<string, FinalRun>,
) {
  const baseline = latestBaseline.get(validationId)
  const final = finalRuns.get(validationId)
  return {
    validationId,
    baseline,
    final,
    baselineStatus: baselineLabel(baseline),
    finalStatus: final?.status ?? 'Not run',
    assurance: assuranceLabel(baseline, final),
  }
}

export function evidenceDelta(detail: PlanReviewDetail) {
  const latestBaseline = new Map<string, BaselineAttempt>()
  for (const attempt of detail.validation?.baselineAttempts ?? []) {
    const current = latestBaseline.get(attempt.validationId)
    if (!current || current.createdAt < attempt.createdAt) latestBaseline.set(attempt.validationId, attempt)
  }
  const finalRuns = new Map((detail.completionReview?.validationRuns ?? []).map(run => [run.validationId, run]))
  const validationIds = new Set([...latestBaseline.keys(), ...finalRuns.keys()])
  return [...validationIds].sort().map(validationId => evidenceDeltaRow(validationId, latestBaseline, finalRuns))
}
