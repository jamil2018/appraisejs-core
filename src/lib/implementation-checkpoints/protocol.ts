import type { PlanArtifact, ValidationArtifact } from '@/lib/plan-contract'

export type TaskState = 'pending' | 'in_progress' | 'implemented' | 'verified'
export type CheckpointType =
  | 'before_task'
  | 'after_task'
  | 'before_group'
  | 'after_group'
  | 'before_validation'
  | 'before_completion'

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

export function canCompleteImplementation(
  plan: PlanArtifact,
  validation: ValidationArtifact,
): { ready: boolean; blockers: string[] } {
  const blockers: string[] = []
  const implementation = implementationState(validation)
  const requiredTaskIds = plan.tasks.map(task => task.id)
  const unverified = requiredTaskIds.filter(taskId => implementation.taskStates[taskId] !== 'verified')
  if (unverified.length) blockers.push(`Required tasks are not verified: ${unverified.join(', ')}.`)

  for (const requiredValidation of validation.validations.filter(item => item.required)) {
    const run = [...implementation.validationRuns].reverse().find(item => item.validationId === requiredValidation.id)
    if (!run?.fresh) {
      blockers.push(`Required validation "${requiredValidation.id}" needs a fresh passing managed Appraise run.`)
      continue
    }
    if (run.evidenceSource !== 'managed' || run.assurance !== 'full' || !run.testRunId) {
      blockers.push(
        `Required validation "${requiredValidation.id}" needs managed Appraise TestRun evidence; manual evidence is reduced assurance.`,
      )
      continue
    }
    if (run.status !== 'passed') {
      blockers.push(`Required validation "${requiredValidation.id}" needs a fresh passing managed Appraise run.`)
    }
  }
  // Signed-off completion releases mutation protection while retaining the
  // immutable managed-run identities and artifact/sign-off hashes as proof.
  if (!implementation.evidenceProtected && plan.lifecycle !== 'completed') {
    blockers.push('Required evidence must remain protected until final completion.')
  }
  return { ready: blockers.length === 0, blockers }
}

export function carriedFailureAcknowledgementIsValid(
  previousSignatureHash: string | undefined,
  currentSignatureHash: string | undefined,
  acknowledgedAt: string | undefined,
): boolean {
  return Boolean(acknowledgedAt && previousSignatureHash && previousSignatureHash === currentSignatureHash)
}
