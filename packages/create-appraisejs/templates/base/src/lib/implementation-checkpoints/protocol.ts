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

type CompletionBlocker = {
  kind: 'task_unverified' | 'run_missing' | 'run_invalid' | 'run_terminal_failure' | 'evidence_unprotected'
  taskId?: string
  validationId?: string
  runId?: string
  state: string
  recovery: { tool: string; arguments: Record<string, unknown> }
}

type CompletionReadiness = {
  ready: boolean
  blockers: string[]
  structuredBlockers: CompletionBlocker[]
  runState: 'active' | 'passed' | 'failed' | 'cancelled' | 'infrastructure_failure' | 'invalid_evidence'
  activeRunIds: string[]
}

type ValidationRun = ImplementationState['validationRuns'][number]
type RequiredValidationRun = { validation: ValidationArtifact['validations'][number]; run: ValidationRun | undefined }

function verifiedTaskBlockers(plan: PlanArtifact, implementation: ImplementationState) {
  const unverified = plan.tasks.map(task => task.id).filter(taskId => implementation.taskStates[taskId] !== 'verified')
  return {
    blockers: unverified.length ? [`Required tasks are not verified: ${unverified.join(', ')}.`] : [],
    structuredBlockers: unverified.map(taskId => ({
      kind: 'task_unverified' as const,
      taskId,
      state: implementation.taskStates[taskId] ?? 'pending',
      recovery: { tool: 'implementation_task_update', arguments: { taskId, status: 'verified' } },
    })),
  }
}

function latestValidationRun(validationRuns: ValidationRun[], validationId: string) {
  return [...validationRuns].reverse().find(run => run.validationId === validationId)
}

function requiredValidationRuns(
  validation: ValidationArtifact,
  implementation: ImplementationState,
): RequiredValidationRun[] {
  return validation.validations
    .filter(item => item.required)
    .map(item => ({ validation: item, run: latestValidationRun(implementation.validationRuns, item.id) }))
}

function freshRunBlocker(validationId: string, run: ValidationRun | undefined): CompletionBlocker | undefined {
  if (run?.fresh) return undefined
  return {
    kind: run ? 'run_invalid' : 'run_missing',
    validationId,
    runId: run?.id,
    state: run ? 'stale' : 'missing',
    recovery: {
      tool: run ? 'implementation_validation_start' : 'implementation_validation_readiness',
      arguments: { validationIds: [validationId] },
    },
  }
}

function activeRunBlocker(validationId: string, run: ValidationRun): CompletionBlocker | undefined {
  if (run.status !== 'running') return undefined
  return {
    kind: 'run_invalid',
    validationId,
    runId: run.id,
    state: 'active',
    recovery: { tool: 'implementation_validation_reconcile', arguments: { runIds: [run.id] } },
  }
}

function hasFullManagedEvidence(run: ValidationRun) {
  return run.evidenceSource === 'managed' && run.assurance === 'full' && Boolean(run.testRunId)
}

function evidenceRunBlocker(validationId: string, run: ValidationRun): CompletionBlocker | undefined {
  if (hasFullManagedEvidence(run)) return undefined
  return {
    kind: 'run_invalid',
    validationId,
    runId: run.id,
    state: 'invalid_evidence',
    recovery: { tool: 'implementation_validation_start', arguments: { validationIds: [validationId] } },
  }
}

function terminalRunBlocker(validationId: string, run: ValidationRun): CompletionBlocker | undefined {
  if (run.status === 'passed') return undefined
  return {
    kind: 'run_terminal_failure',
    validationId,
    runId: run.id,
    state: run.status,
    recovery: { tool: 'implementation_validation_start', arguments: { validationIds: [validationId] } },
  }
}

function requiredRunBlocker(validationId: string, run: ValidationRun | undefined) {
  if (!run) return freshRunBlocker(validationId, run)
  const freshBlocker = freshRunBlocker(validationId, run)
  if (freshBlocker) return freshBlocker
  return (
    activeRunBlocker(validationId, run) ??
    evidenceRunBlocker(validationId, run) ??
    terminalRunBlocker(validationId, run)
  )
}

function requiredRunBlockerMessage(validationId: string, blocker: CompletionBlocker) {
  if (blocker.state === 'active') return `Required validation "${validationId}" is still active.`
  if (blocker.state === 'invalid_evidence')
    return `Required validation "${validationId}" needs managed Appraise TestRun evidence; manual evidence is reduced assurance.`
  return `Required validation "${validationId}" needs a fresh passing managed Appraise run.`
}

function completionEvidenceBlocker(
  plan: PlanArtifact,
  implementation: ImplementationState,
): CompletionBlocker | undefined {
  if (implementation.evidenceProtected || plan.lifecycle === 'completed') return undefined
  return {
    kind: 'evidence_unprotected',
    state: 'unprotected',
    recovery: { tool: 'implementation_completion_review', arguments: {} },
  }
}

function runStateFor(run: ValidationRun | undefined) {
  if (!run?.fresh || !hasFullManagedEvidence(run)) return 'invalid_evidence' as const
  return run.status === 'running' ? ('active' as const) : run.status
}

function summarizeRequiredRuns(requiredRuns: RequiredValidationRun[]) {
  const activeRunIds = requiredRuns.flatMap(item => (item.run?.status === 'running' ? [item.run.id] : [])).sort()
  const terminalStates = requiredRuns.map(item => runStateFor(item.run))
  if (activeRunIds.length) return { runState: 'active' as const, activeRunIds }
  if (terminalStates.every(state => state === 'passed')) return { runState: 'passed' as const, activeRunIds }
  if (terminalStates.includes('invalid_evidence')) return { runState: 'invalid_evidence' as const, activeRunIds }
  if (terminalStates.includes('infrastructure_failure'))
    return { runState: 'infrastructure_failure' as const, activeRunIds }
  if (terminalStates.includes('failed')) return { runState: 'failed' as const, activeRunIds }
  return { runState: 'cancelled' as const, activeRunIds }
}

export function canCompleteImplementation(plan: PlanArtifact, validation: ValidationArtifact): CompletionReadiness {
  const implementation = implementationState(validation)
  const taskBlockers = verifiedTaskBlockers(plan, implementation)
  const blockers = [...taskBlockers.blockers]
  const structuredBlockers: CompletionBlocker[] = [...taskBlockers.structuredBlockers]
  const requiredRuns = requiredValidationRuns(validation, implementation)
  for (const { validation: requiredValidation, run } of requiredRuns) {
    const blocker = requiredRunBlocker(requiredValidation.id, run)
    if (!blocker) continue
    blockers.push(requiredRunBlockerMessage(requiredValidation.id, blocker))
    structuredBlockers.push(blocker)
  }
  const evidenceBlocker = completionEvidenceBlocker(plan, implementation)
  if (evidenceBlocker) {
    blockers.push('Required evidence must remain protected until final completion.')
    structuredBlockers.push(evidenceBlocker)
  }
  const runSummary = summarizeRequiredRuns(requiredRuns)
  return { ready: blockers.length === 0, blockers, structuredBlockers, ...runSummary }
}

export function carriedFailureAcknowledgementIsValid(
  previousSignatureHash: string | undefined,
  currentSignatureHash: string | undefined,
  acknowledgedAt: string | undefined,
): boolean {
  return Boolean(acknowledgedAt && previousSignatureHash && previousSignatureHash === currentSignatureHash)
}
