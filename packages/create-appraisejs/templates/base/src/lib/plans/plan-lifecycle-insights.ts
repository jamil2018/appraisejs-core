import { createHash } from 'node:crypto'

import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import { lifecycleProgress, nextLifecycleAction } from './lifecycle-guidance'

type EventLike = { sequence: number; type: string; payloadJson?: string | null; createdAt: Date }

const NOTIFICATION_BY_EVENT: Record<
  string,
  { kind: string; severity: 'info' | 'warning' | 'action'; message: string; actor: 'Agent' | 'Reviewer' }
> = {
  plan_review_ready: {
    kind: 'review_ready',
    severity: 'action',
    message: 'Plan review is ready.',
    actor: 'Reviewer',
  },
  plan_revision_submitted: {
    kind: 'review_ready',
    severity: 'action',
    message: 'A revised plan is ready for review.',
    actor: 'Reviewer',
  },
  plan_changes_requested: {
    kind: 'changes_requested',
    severity: 'warning',
    message: 'Plan changes were requested.',
    actor: 'Agent',
  },
  plan_approved: {
    kind: 'approval',
    severity: 'info',
    message: 'The plan revision was approved.',
    actor: 'Agent',
  },
  validation_review_ready: {
    kind: 'review_ready',
    severity: 'action',
    message: 'Validation evidence is ready for review.',
    actor: 'Reviewer',
  },
  validation_changes_requested: {
    kind: 'changes_requested',
    severity: 'warning',
    message: 'Validation changes were requested.',
    actor: 'Agent',
  },
  validations_approved: {
    kind: 'approval',
    severity: 'info',
    message: 'Validation evidence was approved.',
    actor: 'Agent',
  },
  baseline_run_start_failed: {
    kind: 'blocked_attempt',
    severity: 'warning',
    message: 'A baseline attempt is blocked and needs recovery.',
    actor: 'Agent',
  },
  baseline_review_ready: {
    kind: 'recovery_or_review_ready',
    severity: 'action',
    message: 'Baseline evidence is ready for review.',
    actor: 'Reviewer',
  },
  baseline_accepted: {
    kind: 'approval',
    severity: 'info',
    message: 'Baseline evidence was accepted.',
    actor: 'Agent',
  },
  validation_failed: {
    kind: 'blocked_attempt',
    severity: 'warning',
    message: 'Implementation validation failed and needs recovery.',
    actor: 'Agent',
  },
  validation_passed: {
    kind: 'completion_signoff_required',
    severity: 'action',
    message: 'Final evidence is ready for completion sign-off.',
    actor: 'Reviewer',
  },
}

export function projectLifecycleNotifications(events: EventLike[]) {
  return events.flatMap(event => {
    const notification = NOTIFICATION_BY_EVENT[event.type]
    return notification ? [{ eventSequence: event.sequence, createdAt: event.createdAt, ...notification }] : []
  })
}

export function liveAgentActivity(detail: PlanReviewDetail) {
  const latest = detail.events.at(-1)
  const progress = lifecycleProgress(detail.plan.lifecycle)
  const next = nextLifecycleAction(detail.plan.lifecycle)
  return {
    phase: progress.find(stage => stage.state === 'active')?.label ?? 'Completion',
    completedStages: progress.filter(stage => stage.state === 'complete').length,
    totalStages: progress.length,
    latestDurableOperation: latest
      ? { sequence: latest.sequence, type: latest.type, createdAt: latest.createdAt }
      : undefined,
    waitState: next.actor === 'Reviewer' ? 'waiting_for_human_gate' : 'agent_action_available',
    nextAction: next,
  }
}

function receiptHash(value: unknown) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

export function delegatedOperationReceipts(detail: PlanReviewDetail) {
  return detail.delegations.flatMap(delegation =>
    delegation.consumptions.map(consumption => {
      const evidence = {
        schemaVersion: '1',
        authorizationReceiptId: delegation.id,
        parentCoordinatorId: delegation.parentCoordinatorId,
        delegatedCoordinatorId: delegation.delegatedCoordinatorId,
        permission: consumption.permission,
        operationKey: consumption.operationKey,
        consumedAt: consumption.consumedAt,
      }
      return { ...evidence, operationReceiptHash: receiptHash(evidence) }
    }),
  )
}

export function evidenceProvenanceTimeline(detail: PlanReviewDetail) {
  const revisionEntries = detail.revisions.map(revision => ({
    at: revision.createdAt,
    kind: 'plan_revision',
    identity: revision.sourceHash,
    detail: revision.gitCommit ?? (revision.reducedAssurance ? 'filesystem snapshot' : 'no commit'),
  }))
  const eventEntries = detail.events.map(event => ({
    at: event.createdAt,
    kind: 'plan_event',
    identity: `sequence:${event.sequence}`,
    detail: event.type,
  }))
  const publication = detail.exactExecutionPreview
    ? [
        {
          at: detail.projection.updatedAt,
          kind: 'validation_publication',
          identity: detail.exactExecutionPreview.hashes.receiptHash,
          detail: detail.exactExecutionPreview.operationId,
        },
      ]
    : []
  const attempts = (detail.validation?.baselineAttempts ?? []).map(attempt => ({
    at: new Date(attempt.createdAt),
    kind: 'baseline_attempt',
    identity: attempt.id,
    detail: `TestRun ${attempt.testRunId} · ${attempt.status}`,
  }))
  const delegation = delegatedOperationReceipts(detail).map(receipt => ({
    at: receipt.consumedAt,
    kind: 'delegated_operation',
    identity: receipt.operationReceiptHash,
    detail: `${receipt.delegatedCoordinatorId} · ${receipt.permission} · ${receipt.operationKey}`,
  }))
  const implementationRuns = (detail.completionReview?.validationRuns ?? []).map(run => ({
    at: detail.projection.updatedAt,
    kind: 'implementation_test_run',
    identity: run.testRunId ?? run.id,
    detail: `${run.validationId} · ${run.status} · ${run.assurance}`,
  }))
  const capsules = (detail.runtimeCapsules ?? []).map(capsule => ({
    at: capsule.createdAt,
    kind: 'runtime_capsule',
    identity: capsule.capsuleHash,
    detail: `TestRun ${capsule.testRunId} · ${capsule.integrityState} · receipt ${capsule.executionAttempt?.receiptHash ?? 'not prepared'}`,
  }))
  const completion = detail.completionReview
    ? [
        {
          at: detail.projection.updatedAt,
          kind: 'completion_evidence',
          identity: detail.completionReview.evidenceHash,
          detail: detail.completionReview.readiness.ready ? 'ready for sign-off' : 'blocked',
        },
      ]
    : []
  return [
    ...revisionEntries,
    ...eventEntries,
    ...publication,
    ...attempts,
    ...implementationRuns,
    ...capsules,
    ...completion,
    ...delegation,
  ].sort((left, right) => right.at.getTime() - left.at.getTime())
}

export function revisionImpact(detail: PlanReviewDetail) {
  const validationSnapshotHash = detail.validation?.baseRevision.snapshotHash
  const validationSnapshotKnown = Boolean(
    validationSnapshotHash &&
      (validationSnapshotHash === detail.projection.sourceHash ||
        detail.revisions?.some(revision => revision.sourceHash === validationSnapshotHash)),
  )
  const validationStale = Boolean(
    detail.validation && (detail.validation.revision !== detail.plan.revision || !validationSnapshotKnown),
  )
  const impacted = []
  if (validationStale) impacted.push('validations', 'validation approvals', 'selected resources')
  if (validationStale && (detail.validation?.baselineAttempts.length ?? 0) > 0) impacted.push('baseline evidence')
  if (validationStale && detail.plan.implementationGroups.length > 0) impacted.push('implementation groups')
  if (detail.orphanedThreadIds.length > 0) impacted.push('review remarks')
  return {
    status: impacted.length ? ('stale' as const) : ('current' as const),
    currentPlanRevision: detail.plan.revision,
    validationRevision: detail.validation?.revision,
    changedSinceValidation: validationStale,
    impacted: [...new Set(impacted)],
    reasons: [
      ...(validationStale ? ['Validation revision or base snapshot is outside the current plan lineage.'] : []),
      ...(detail.orphanedThreadIds.length ? ['Open remarks target nodes removed by the revision.'] : []),
    ],
  }
}
