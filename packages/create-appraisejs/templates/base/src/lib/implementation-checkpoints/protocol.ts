import type { PlanArtifact, ValidationArtifact } from '@/lib/plan-contract'

export type TaskState = 'pending' | 'in_progress' | 'implemented' | 'verified'
export type CheckpointType =
  'before_task' | 'after_task' | 'before_group' | 'after_group' | 'before_validation' | 'before_completion'

export type FeedbackImpact = {
  affectedTaskIds: string[]
  transitiveDependentIds: string[]
  approvalsRequiringConfirmation: string[]
  independentTaskIds: string[]
  impactedValidationIds: string[]
}

export type ImplementationState = NonNullable<ValidationArtifact['implementation']>

export function implementationState(validation: ValidationArtifact): ImplementationState {
  return (
    validation.implementation ?? {
      taskStates: {},
      approvedGroupIds: [],
      pausedTaskIds: [],
      validationRuns: [],
      commits: [],
      reconciliationReceipts: [],
      evidenceProtected: true,
    }
  )
}

const executionEdges = (plan: PlanArtifact) =>
  plan.edges
    .filter(edge => edge.type !== 'relates-to')
    .map(edge =>
      edge.type === 'depends-on'
        ? { prerequisite: edge.to, dependent: edge.from }
        : { prerequisite: edge.from, dependent: edge.to },
    )

export function taskDependencies(plan: PlanArtifact, taskId: string): string[] {
  return executionEdges(plan)
    .filter(edge => edge.dependent === taskId)
    .map(edge => edge.prerequisite)
}

export function analyzeExecutionOrder(plan: PlanArtifact) {
  const remaining = new Set(plan.tasks.map(task => task.id))
  const orderedTaskIds: string[] = []
  while (remaining.size) {
    const runnable = plan.tasks
      .map(task => task.id)
      .filter(taskId => remaining.has(taskId))
      .filter(taskId => taskDependencies(plan, taskId).every(dependency => !remaining.has(dependency)))
    if (!runnable.length) break
    runnable.forEach(taskId => {
      orderedTaskIds.push(taskId)
      remaining.delete(taskId)
    })
  }
  return {
    valid: remaining.size === 0,
    orderedTaskIds,
    blockedTaskIds: [...remaining],
    issues: remaining.size ? ['Execution graph contains a dependency cycle.'] : [],
  }
}

export function transitiveDependents(plan: PlanArtifact, taskIds: string[]): string[] {
  const affected = new Set(taskIds)
  let changed = true
  while (changed) {
    changed = false
    for (const edge of executionEdges(plan)) {
      if (affected.has(edge.prerequisite) && !affected.has(edge.dependent)) {
        affected.add(edge.dependent)
        changed = true
      }
    }
  }
  return [...affected].filter(taskId => !taskIds.includes(taskId))
}

export function runnableTasks(
  plan: PlanArtifact,
  states: Record<string, TaskState>,
  approvedGroupIds: string[],
  pausedTaskIds: string[] = [],
): string[] {
  const approvedTasks = new Set(
    plan.implementationGroups.filter(group => approvedGroupIds.includes(group.id)).flatMap(group => group.taskIds),
  )
  return plan.tasks
    .filter(task => approvedTasks.has(task.id))
    .filter(task => !pausedTaskIds.includes(task.id))
    .filter(task => (states[task.id] ?? 'pending') === 'pending')
    .filter(task => taskDependencies(plan, task.id).every(dependency => states[dependency] === 'verified'))
    .map(task => task.id)
}

export function analyzeBlockingFeedback(
  plan: PlanArtifact,
  validation: ValidationArtifact,
  affectedTaskIds: string[],
  approvedGroupIds: string[],
): FeedbackImpact {
  const transitiveDependentIds = transitiveDependents(plan, affectedTaskIds)
  const blocked = new Set([...affectedTaskIds, ...transitiveDependentIds])
  const approvalsRequiringConfirmation = plan.implementationGroups
    .filter(group => approvedGroupIds.includes(group.id) && group.taskIds.some(taskId => blocked.has(taskId)))
    .map(group => group.id)
  return {
    affectedTaskIds,
    transitiveDependentIds,
    approvalsRequiringConfirmation,
    independentTaskIds: plan.tasks.map(task => task.id).filter(taskId => !blocked.has(taskId)),
    impactedValidationIds: validation.validations
      .filter(item => item.taskIds.some(taskId => blocked.has(taskId)))
      .map(item => item.id),
  }
}

export function queuedFeedbackMessage(checkpoint: CheckpointType): string {
  return `Feedback queued and will be acknowledged at the next ${checkpoint.replaceAll('_', ' ')} checkpoint.`
}

// This gate intentionally evaluates every independent completion invariant in one deterministic receipt.
// fallow-ignore-next-line complexity
export function canCompleteImplementation(
  plan: PlanArtifact,
  validation: ValidationArtifact,
): {
  ready: boolean
  blockers: string[]
  structuredBlockers: Array<{
    kind: 'task_unverified' | 'run_missing' | 'run_invalid' | 'run_terminal_failure' | 'evidence_unprotected'
    taskId?: string
    validationId?: string
    runId?: string
    state: string
    recovery: { tool: string; arguments: Record<string, unknown> }
  }>
  runState: 'active' | 'passed' | 'failed' | 'cancelled' | 'infrastructure_failure' | 'invalid_evidence'
  activeRunIds: string[]
} {
  const blockers: string[] = []
  const structuredBlockers: Array<{
    kind: 'task_unverified' | 'run_missing' | 'run_invalid' | 'run_terminal_failure' | 'evidence_unprotected'
    taskId?: string
    validationId?: string
    runId?: string
    state: string
    recovery: { tool: string; arguments: Record<string, unknown> }
  }> = []
  const implementation = implementationState(validation)
  const requiredTaskIds = plan.tasks.map(task => task.id)
  const unverified = requiredTaskIds.filter(taskId => implementation.taskStates[taskId] !== 'verified')
  if (unverified.length) blockers.push(`Required tasks are not verified: ${unverified.join(', ')}.`)
  structuredBlockers.push(
    ...unverified.map(taskId => ({
      kind: 'task_unverified' as const,
      taskId,
      state: implementation.taskStates[taskId] ?? 'pending',
      recovery: { tool: 'implementation_task_update', arguments: { taskId, status: 'verified' } },
    })),
  )

  const requiredRuns = validation.validations
    .filter(item => item.required)
    .map(requiredValidation => ({
      validation: requiredValidation,
      run: [...implementation.validationRuns].reverse().find(item => item.validationId === requiredValidation.id),
    }))
  for (const requiredValidation of validation.validations.filter(item => item.required)) {
    const run = [...implementation.validationRuns].reverse().find(item => item.validationId === requiredValidation.id)
    if (!run?.fresh) {
      blockers.push(`Required validation "${requiredValidation.id}" needs a fresh passing managed Appraise run.`)
      structuredBlockers.push({
        kind: run ? 'run_invalid' : 'run_missing',
        validationId: requiredValidation.id,
        runId: run?.id,
        state: run ? 'stale' : 'missing',
        recovery: {
          tool: run ? 'implementation_validation_start' : 'implementation_validation_readiness',
          arguments: { validationIds: [requiredValidation.id] },
        },
      })
      continue
    }
    if (run.status === 'running') {
      blockers.push(`Required validation "${requiredValidation.id}" is still active.`)
      structuredBlockers.push({
        kind: 'run_invalid',
        validationId: requiredValidation.id,
        runId: run.id,
        state: 'active',
        recovery: { tool: 'implementation_validation_reconcile', arguments: { runIds: [run.id] } },
      })
      continue
    }
    if (run.evidenceSource !== 'managed' || run.assurance !== 'full' || !run.testRunId) {
      blockers.push(
        `Required validation "${requiredValidation.id}" needs managed Appraise TestRun evidence; manual evidence is reduced assurance.`,
      )
      structuredBlockers.push({
        kind: 'run_invalid',
        validationId: requiredValidation.id,
        runId: run.id,
        state: 'invalid_evidence',
        recovery: { tool: 'implementation_validation_start', arguments: { validationIds: [requiredValidation.id] } },
      })
      continue
    }
    if (run.status !== 'passed') {
      blockers.push(`Required validation "${requiredValidation.id}" needs a fresh passing managed Appraise run.`)
      structuredBlockers.push({
        kind: 'run_terminal_failure',
        validationId: requiredValidation.id,
        runId: run.id,
        state: run.status,
        recovery: {
          tool: 'implementation_validation_start',
          arguments: { validationIds: [requiredValidation.id] },
        },
      })
    }
  }
  // Signed-off completion releases mutation protection while retaining the
  // immutable managed-run identities and artifact/sign-off hashes as proof.
  if (!implementation.evidenceProtected && plan.lifecycle !== 'completed') {
    blockers.push('Required evidence must remain protected until final completion.')
    structuredBlockers.push({
      kind: 'evidence_unprotected',
      state: 'unprotected',
      recovery: { tool: 'implementation_completion_review', arguments: {} },
    })
  }
  const activeRunIds = requiredRuns.flatMap(item => (item.run?.status === 'running' ? [item.run.id] : [])).sort()
  const terminalStates = requiredRuns.map(item => {
    const run = item.run
    if (!run?.fresh || run.evidenceSource !== 'managed' || run.assurance !== 'full' || !run.testRunId)
      return 'invalid_evidence' as const
    return run.status === 'running' ? 'active' : run.status
  })
  const runState = activeRunIds.length
    ? ('active' as const)
    : terminalStates.every(state => state === 'passed')
      ? ('passed' as const)
      : terminalStates.includes('invalid_evidence')
        ? ('invalid_evidence' as const)
        : terminalStates.includes('infrastructure_failure')
          ? ('infrastructure_failure' as const)
          : terminalStates.includes('failed')
            ? ('failed' as const)
            : ('cancelled' as const)
  return { ready: blockers.length === 0, blockers, structuredBlockers, runState, activeRunIds }
}

export function carriedFailureAcknowledgementIsValid(
  previousSignatureHash: string | undefined,
  currentSignatureHash: string | undefined,
  acknowledgedAt: string | undefined,
): boolean {
  return Boolean(acknowledgedAt && previousSignatureHash && previousSignatureHash === currentSignatureHash)
}
