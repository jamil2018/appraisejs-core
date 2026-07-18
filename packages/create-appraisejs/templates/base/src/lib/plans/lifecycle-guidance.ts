export const LIFECYCLE_STAGES = [
  { id: 'plan', label: 'Plan review' },
  { id: 'validation', label: 'Validation review' },
  { id: 'baseline', label: 'Baseline' },
  { id: 'implementation', label: 'Implementation' },
  { id: 'completion', label: 'Completion' },
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
    return { actor: 'Agent', action: 'Start or retry the managed baseline.' }
  if (lifecycle === 'baseline_running') return { actor: 'Agent', action: 'Reconcile the active baseline runs.' }
  if (lifecycle === 'baseline_review') return { actor: 'Reviewer', action: 'Review and accept baseline evidence.' }
  if (lifecycle === 'baseline_accepted') return { actor: 'Agent', action: 'Start implementation.' }
  if (['in_progress', 'paused'].includes(lifecycle))
    return { actor: 'Agent', action: 'Complete runnable tasks and record verification.' }
  if (['validating', 'failed_validation'].includes(lifecycle))
    return { actor: 'Agent', action: 'Reconcile or repair managed implementation validation.' }
  if (lifecycle === 'validation_passed')
    return { actor: 'Reviewer', action: 'Review final evidence and approve completion.' }
  if (lifecycle === 'completed') return { actor: 'Complete', action: 'No further lifecycle action is required.' }
  return { actor: 'Agent', action: 'Continue the current Appraise lifecycle step.' }
}
