export const LIFECYCLE_STAGES = [
  { id: 'plan', label: 'Quality plan' },
  { id: 'validation', label: 'Validation design' },
  { id: 'baseline', label: 'Current evidence' },
  { id: 'implementation', label: 'External change' },
  { id: 'completion', label: 'Final evidence' },
] as const

const STAGE_BY_LIFECYCLE: Record<string, number> = {
  draft: 0,
  awaiting_plan_review: 0,
  changes_requested: 0,
  plan_approved: 1,
  preparing_validations: 1,
  awaiting_validation_review: 1,
  validation_changes_requested: 1,
  validations_approved: 2,
  baseline_running: 2,
  baseline_review: 2,
  baseline_changes_requested: 2,
  baseline_accepted: 3,
  in_progress: 3,
  paused: 3,
  validating: 3,
  failed_validation: 3,
  validation_passed: 4,
  completed: 4,
}

const LIFECYCLE_DISPLAY_LABELS: Record<string, string> = {
  baseline_running: 'collecting current evidence',
  baseline_review: 'current evidence review',
  baseline_changes_requested: 'evidence changes requested',
  baseline_accepted: 'current evidence accepted',
}

export function lifecycleDisplayLabel(lifecycle: string) {
  return LIFECYCLE_DISPLAY_LABELS[lifecycle] ?? lifecycle.replaceAll('_', ' ')
}

export function lifecycleProgress(lifecycle: string) {
  const activeIndex = STAGE_BY_LIFECYCLE[lifecycle] ?? 0
  return LIFECYCLE_STAGES.map((stage, index) => ({
    ...stage,
    state:
      lifecycle === 'completed' || index < activeIndex
        ? ('complete' as const)
        : index === activeIndex
          ? ('active' as const)
          : ('upcoming' as const),
  }))
}

export function nextLifecycleAction(lifecycle: string) {
  if (lifecycle === 'awaiting_plan_review')
    return { actor: 'Reviewer', action: 'Review and approve this plan revision.' }
  if (lifecycle === 'plan_approved') return { actor: 'Agent', action: 'Prepare managed validation evidence.' }
  if (['preparing_validations', 'validation_changes_requested'].includes(lifecycle))
    return { actor: 'Agent', action: 'Compile and publish corrected validation evidence.' }
  if (lifecycle === 'awaiting_validation_review')
    return { actor: 'Reviewer', action: 'Review and approve validation evidence.' }
  if (['validations_approved', 'baseline_changes_requested'].includes(lifecycle))
    return { actor: 'Agent', action: 'Collect or retry current-state evidence.' }
  if (lifecycle === 'baseline_running') return { actor: 'Agent', action: 'Reconcile active evidence runs.' }
  if (lifecycle === 'baseline_review') return { actor: 'Reviewer', action: 'Review and accept current-state evidence.' }
  if (lifecycle === 'baseline_accepted')
    return { actor: 'Agent', action: 'Current-state evidence is accepted; continue the external workflow.' }
  if (['in_progress', 'paused'].includes(lifecycle))
    return { actor: 'Agent', action: 'Track the external change and record verification evidence.' }
  if (['validating', 'failed_validation'].includes(lifecycle))
    return { actor: 'Agent', action: 'Reconcile or repair final managed validation evidence.' }
  if (lifecycle === 'validation_passed')
    return { actor: 'Reviewer', action: 'Review final evidence and record the quality decision.' }
  if (lifecycle === 'completed') return { actor: 'Complete', action: 'The quality decision is recorded.' }
  return { actor: 'Agent', action: 'Continue the current Appraise lifecycle step.' }
}
