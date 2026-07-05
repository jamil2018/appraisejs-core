import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  analyzeBlockingFeedback,
  canCompleteImplementation,
  implementationState,
  queuedFeedbackMessage,
  runnableTasks,
  type CheckpointType,
  type TaskState,
} from '@/lib/implementation-checkpoints/protocol'
import {
  parseYamlArtifact,
  serializeYamlArtifact,
  type PlanArtifact,
  type ReviewArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { findProjectRoot } from '@/lib/plans/project-root'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { ServiceError } from '@/services/shared/errors'

import { appendPlanEvent, assertPlanNotCancelled } from './coordinator-service'

type Options = { client?: PrismaClient; projectDirectory?: string; now?: Date }

function completionEvidenceHash(value: unknown) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

async function readArtifacts(planId: string, projectDirectory?: string) {
  const projectRoot = await findProjectRoot(projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const [planStored, validationStored, reviewStored] = await Promise.all([
    repository.read('plan', planId),
    repository.read('validation', planId),
    repository.read('review', planId),
  ])
  return {
    projectRoot,
    repository,
    planStored,
    validationStored,
    reviewStored,
    plan: parseYamlArtifact('plan', planStored.content) as PlanArtifact,
    validation: parseYamlArtifact('validation', validationStored.content) as ValidationArtifact,
    review: parseYamlArtifact('review', reviewStored.content) as ReviewArtifact,
  }
}

async function writeArtifacts(
  artifacts: Awaited<ReturnType<typeof readArtifacts>>,
  plan: PlanArtifact,
  validation: ValidationArtifact,
  review: ReviewArtifact,
  client: PrismaClient,
) {
  // This mirrors the baseline coordinator's artifact transaction boundary.
  // fallow-ignore-next-line code-duplication
  await artifacts.repository.compareAndWrite(
    'validation',
    plan.planId,
    artifacts.validationStored.hash,
    serializeYamlArtifact('validation', validation),
  )
  if (plan.lifecycle !== artifacts.plan.lifecycle) {
    await artifacts.repository.compareAndWrite(
      'plan',
      plan.planId,
      artifacts.planStored.hash,
      serializeYamlArtifact('plan', plan),
    )
  }
  if (review.finalSignOff !== artifacts.review.finalSignOff) {
    await artifacts.repository.compareAndWrite(
      'review',
      plan.planId,
      artifacts.reviewStored.hash,
      serializeYamlArtifact('review', review),
    )
  }
  await syncPlans({ projectDirectory: artifacts.projectRoot, client })
}

function assertImplementationLifecycle(plan: PlanArtifact) {
  if (
    !['in_progress', 'paused', 'ready_for_validation', 'validating', 'failed_validation', 'validation_passed'].includes(
      plan.lifecycle,
    )
  ) {
    throw new ServiceError('The plan is not in implementation.', 'CONFLICT')
  }
}

function assertBaselineAccepted(validation: ValidationArtifact) {
  if (validation.baselineDecision === 'accepted') return
  throw new ServiceError('Accepted baselines are required before implementation.', 'CONFLICT')
}

function preImplementationRecovery(plan: PlanArtifact, validation: ValidationArtifact) {
  if (
    ['in_progress', 'paused', 'ready_for_validation', 'validating', 'failed_validation', 'validation_passed'].includes(
      plan.lifecycle,
    ) &&
    validation.baselineDecision === 'accepted'
  ) {
    return null
  }
  const next =
    plan.lifecycle === 'validations_approved' || plan.lifecycle === 'baseline_changes_requested'
      ? {
          action: 'start_baseline',
          tool: 'baseline_start',
          endpoint: `/api/internal/coordinator/plans/${plan.planId}/baseline/start`,
        }
      : plan.lifecycle === 'baseline_running'
        ? {
            action: 'reconcile_baseline',
            tool: 'baseline_reconcile',
            endpoint: `/api/internal/coordinator/plans/${plan.planId}/baseline/reconcile`,
          }
        : plan.lifecycle === 'baseline_review'
          ? {
              action: 'accept_baseline',
              tool: 'baseline_accept',
              endpoint: `/api/internal/coordinator/plans/${plan.planId}/baseline/accept`,
            }
          : plan.lifecycle === 'baseline_accepted' && validation.baselineDecision === 'accepted'
            ? {
                action: 'start_implementation',
                tool: 'implementation_start',
                endpoint: `/api/internal/coordinator/plans/${plan.planId}/implementation/start`,
              }
            : {
                action: 'wait_for_lifecycle_gate',
                tool: 'validation_review_loop',
                endpoint: `/api/internal/coordinator/plans/${plan.planId}/events`,
              }
  return {
    status: 'blocked_pre_implementation',
    planId: plan.planId,
    lifecycle: plan.lifecycle,
    baselineDecision: validation.baselineDecision,
    terminal: false,
    mustContinue: true,
    blockingReasons: ['Implementation checkpoints require accepted baseline evidence and implementation_start.'],
    nextAllowedAction: next,
    nextRecommendedAction:
      'Complete validation review, baseline execution, baseline acceptance, and implementation_start before recording implementation checkpoints.',
    nextRequiredAgentBehavior: next.action,
  }
}

function completionNextActions(planId: string, blockers: string[]) {
  return blockers.map(blocker => {
    if (blocker.includes('Required tasks are not verified')) {
      return {
        blocker,
        nextMcpAction: 'implementation_task_update',
        requiredInput: { planId, taskId: '<task-id>', status: 'verified' },
      }
    }
    if (blocker.includes('fresh passing run')) {
      return {
        blocker,
        nextMcpAction: 'implementation_validation_start',
        requiredInput: { planId, validationIds: ['<validation-id>'], commitHash: '<current-commit>' },
      }
    }
    if (blocker.includes('evidence must remain protected')) {
      return {
        blocker,
        nextMcpAction: 'implementation_completion_review',
        requiredInput: { planId },
      }
    }
    return {
      blocker,
      nextMcpAction: 'implementation_checkpoint',
      requiredInput: { planId, type: 'before_completion' },
    }
  })
}

async function implementationContext(planId: string, options: Options) {
  const client = options.client ?? prisma
  await assertPlanNotCancelled(planId, client)
  const artifacts = await readArtifacts(planId, options.projectDirectory)
  assertImplementationLifecycle(artifacts.plan)
  assertBaselineAccepted(artifacts.validation)
  return { client, artifacts, implementation: implementationState(artifacts.validation) }
}

// fallow-ignore-next-line complexity
export async function reachImplementationCheckpoint(
  input: { planId: string; type: CheckpointType; taskIds?: string[]; queuedFeedbackCount?: number },
  options: Options = {},
) {
  const client = options.client ?? prisma
  await assertPlanNotCancelled(input.planId, client)
  const artifacts = await readArtifacts(input.planId, options.projectDirectory)
  const recovery = preImplementationRecovery(artifacts.plan, artifacts.validation)
  if (recovery) return recovery
  assertImplementationLifecycle(artifacts.plan)
  assertBaselineAccepted(artifacts.validation)
  const implementation = implementationState(artifacts.validation)
  const checkpoint = {
    type: input.type,
    taskIds: input.taskIds ?? [],
    queuedFeedbackCount: input.queuedFeedbackCount ?? 0,
    reachedAt: (options.now ?? new Date()).toISOString(),
  }
  const validation = { ...artifacts.validation, implementation: { ...implementation, checkpoint } }
  await writeArtifacts(artifacts, artifacts.plan, validation, artifacts.review, client)
  await appendPlanEvent(
    {
      planId: input.planId,
      type: 'implementation_checkpoint',
      payload: {
        ...checkpoint,
        feedbackMessage: checkpoint.queuedFeedbackCount ? queuedFeedbackMessage(input.type) : undefined,
      },
    },
    client,
  )
  return {
    checkpoint,
    runnableTaskIds: runnableTasks(
      artifacts.plan,
      implementation.taskStates,
      implementation.approvedGroupIds,
      implementation.pausedTaskIds,
    ),
  }
}

// Task transition and dependency checks intentionally remain together.
// fallow-ignore-next-line complexity
export async function updateImplementationTask(
  input: { planId: string; taskId: string; status: TaskState; commitHash?: string },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  if (!artifacts.plan.tasks.some(task => task.id === input.taskId))
    throw new ServiceError('Plan task not found.', 'NOT_FOUND')
  const allowed: Record<TaskState, readonly TaskState[]> = {
    pending: ['in_progress'],
    in_progress: ['implemented', 'pending'],
    implemented: ['verified', 'in_progress'],
    verified: ['in_progress'],
  }
  const current = implementation.taskStates[input.taskId] ?? 'pending'
  if (!allowed[current].includes(input.status)) {
    throw new ServiceError(`Cannot transition task from ${current} to ${input.status}.`, 'CONFLICT')
  }
  if (input.status === 'in_progress') {
    const runnable = runnableTasks(
      artifacts.plan,
      implementation.taskStates,
      implementation.approvedGroupIds,
      implementation.pausedTaskIds,
    )
    if (!runnable.includes(input.taskId) && current === 'pending') {
      throw new ServiceError('Task dependencies or implementation-group approval are incomplete.', 'CONFLICT')
    }
  }
  const commits =
    input.status === 'implemented' && input.commitHash
      ? [
          ...implementation.commits,
          { hash: input.commitHash, taskIds: [input.taskId], createdAt: (options.now ?? new Date()).toISOString() },
        ]
      : implementation.commits
  const validation = {
    ...artifacts.validation,
    implementation: {
      ...implementation,
      taskStates: { ...implementation.taskStates, [input.taskId]: input.status },
      commits,
    },
  }
  await writeArtifacts(artifacts, artifacts.plan, validation, artifacts.review, client)
  await appendPlanEvent({ planId: input.planId, type: 'task_updated', payload: input }, client)
  return validation.implementation
}

export async function approveImplementationGroups(
  input: { planId: string; groupIds: string[] },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  const knownGroupIds = new Set(artifacts.plan.implementationGroups.map(group => group.id))
  const unknownGroupIds = input.groupIds.filter(groupId => !knownGroupIds.has(groupId))
  if (unknownGroupIds.length > 0) {
    throw new ServiceError(`Implementation groups were not found: ${unknownGroupIds.join(', ')}.`, 'NOT_FOUND')
  }
  const approvedGroupIds = Array.from(new Set([...implementation.approvedGroupIds, ...input.groupIds])).sort()
  const validation = { ...artifacts.validation, implementation: { ...implementation, approvedGroupIds } }
  await writeArtifacts(artifacts, artifacts.plan, validation, artifacts.review, client)
  const runnableTaskIds = runnableTasks(
    artifacts.plan,
    validation.implementation.taskStates,
    validation.implementation.approvedGroupIds,
    validation.implementation.pausedTaskIds,
  )
  await appendPlanEvent(
    {
      planId: input.planId,
      type: 'implementation_groups_approved',
      payload: { approvedGroupIds, runnableTaskIds },
    },
    client,
  )
  return { implementation: validation.implementation, runnableTaskIds }
}

// fallow-ignore-next-line complexity
export async function applyBlockingFeedback(
  input: { planId: string; affectedTaskIds: string[]; confirmed: boolean; pausePlanWide?: boolean },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  const impact = analyzeBlockingFeedback(
    artifacts.plan,
    artifacts.validation,
    input.affectedTaskIds,
    implementation.approvedGroupIds,
  )
  if (!input.confirmed) return { confirmationRequired: true, impact }
  const pausedTaskIds = input.pausePlanWide
    ? artifacts.plan.tasks.map(task => task.id)
    : [...new Set([...implementation.pausedTaskIds, ...impact.affectedTaskIds, ...impact.transitiveDependentIds])]
  const impactedValidationIds = new Set(impact.impactedValidationIds)
  const validation = {
    ...artifacts.validation,
    implementation: {
      ...implementation,
      pausedTaskIds,
      approvedGroupIds: implementation.approvedGroupIds.filter(
        id => !impact.approvalsRequiringConfirmation.includes(id),
      ),
      taskStates: Object.fromEntries(
        Object.entries(implementation.taskStates).map(([taskId, state]) => [
          taskId,
          pausedTaskIds.includes(taskId) && state !== 'pending' ? 'pending' : state,
        ]),
      ),
      validationRuns: implementation.validationRuns.map(run =>
        impactedValidationIds.has(run.validationId) ? { ...run, fresh: false } : run,
      ),
    },
  }
  const plan = input.pausePlanWide ? { ...artifacts.plan, lifecycle: 'paused' as const } : artifacts.plan
  await writeArtifacts(artifacts, plan, validation, artifacts.review, client)
  await appendPlanEvent({ planId: input.planId, type: 'implementation_feedback_applied', payload: impact }, client)
  return { confirmationRequired: false, impact, plan, implementation: validation.implementation }
}

// fallow-ignore-next-line complexity
export async function controlImplementation(
  input: { planId: string; action: 'pause' | 'resume' | 'cancel'; stopActiveRuns?: boolean },
  options: Options = {},
) {
  const client = options.client ?? prisma
  if (input.action !== 'cancel') await assertPlanNotCancelled(input.planId, client)
  const artifacts = await readArtifacts(input.planId, options.projectDirectory)
  assertImplementationLifecycle(artifacts.plan)
  const lifecycle = input.action === 'pause' ? 'paused' : input.action === 'resume' ? 'in_progress' : 'cancelled'
  const plan = { ...artifacts.plan, lifecycle } as PlanArtifact
  await writeArtifacts(artifacts, plan, artifacts.validation, artifacts.review, client)
  await appendPlanEvent(
    {
      planId: input.planId,
      type: input.action === 'cancel' ? 'plan_cancelled' : `implementation_${input.action}d`,
      payload: input.action === 'cancel' ? { stopActiveRuns: input.stopActiveRuns ?? false } : undefined,
    },
    client,
  )
  return plan
}

export async function recordImplementationValidation(
  input: {
    planId: string
    run: NonNullable<ValidationArtifact['implementation']>['validationRuns'][number]
  },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  const validationRuns = [...implementation.validationRuns.filter(run => run.id !== input.run.id), input.run]
  const validation = { ...artifacts.validation, implementation: { ...implementation, validationRuns } }
  const readiness = canCompleteImplementation(artifacts.plan, validation)
  const plan = {
    ...artifacts.plan,
    lifecycle: readiness.ready ? ('validation_passed' as const) : ('failed_validation' as const),
  }
  await writeArtifacts(artifacts, plan, validation, artifacts.review, client)
  await appendPlanEvent(
    {
      planId: input.planId,
      type: readiness.ready ? 'validation_passed' : 'validation_failed',
      payload: { runId: input.run.id, blockers: readiness.blockers },
    },
    client,
  )
  return { plan, validation, readiness }
}

export async function startImplementationValidation(
  input: { planId: string; validationIds?: string[]; commitHash?: string },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  const requestedIds = new Set(input.validationIds ?? artifacts.validation.validations.map(validation => validation.id))
  const selected = artifacts.validation.validations.filter(validation => requestedIds.has(validation.id))
  if (selected.length !== requestedIds.size) {
    throw new ServiceError('One or more implementation validations were not found.', 'NOT_FOUND')
  }
  const startedAt = (options.now ?? new Date()).toISOString()
  const runningRuns = selected.map(validation => ({
    id: `implementation-validation-${validation.id}-${startedAt.replace(/[^0-9]/g, '').slice(0, 14)}`,
    validationId: validation.id,
    taskIds: validation.taskIds,
    required: validation.required,
    status: 'running' as const,
    fresh: true,
    commitHash: input.commitHash ?? 'pending',
    evidenceUrls: [`/plans/${input.planId}?review=implementation#${validation.id}`],
  }))
  const existingIds = new Set(runningRuns.map(run => run.id))
  const validation = {
    ...artifacts.validation,
    implementation: {
      ...implementation,
      validationRuns: [...implementation.validationRuns.filter(run => !existingIds.has(run.id)), ...runningRuns],
    },
  }
  const plan = { ...artifacts.plan, lifecycle: 'validating' as const }
  await writeArtifacts(artifacts, plan, validation, artifacts.review, client)
  await appendPlanEvent(
    {
      planId: input.planId,
      type: 'implementation_validation_started',
      payload: { runIds: runningRuns.map(run => run.id) },
    },
    client,
  )
  return { plan, validation, runs: runningRuns }
}

export async function reconcileImplementationValidation(
  input: {
    planId: string
    runs?: NonNullable<ValidationArtifact['implementation']>['validationRuns']
  },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  if (!input.runs?.length) {
    return {
      plan: artifacts.plan,
      validation: artifacts.validation,
      readiness: canCompleteImplementation(artifacts.plan, artifacts.validation),
    }
  }
  const completedAt = (options.now ?? new Date()).toISOString()
  const updates = new Map(
    input.runs.map(run => [
      run.id,
      run.status === 'running' ? run : { ...run, completedAt: run.completedAt ?? completedAt },
    ]),
  )
  const validation = {
    ...artifacts.validation,
    implementation: {
      ...implementation,
      validationRuns: implementation.validationRuns.map(run => updates.get(run.id) ?? run),
    },
  }
  const readiness = canCompleteImplementation(artifacts.plan, validation)
  const plan = {
    ...artifacts.plan,
    lifecycle: readiness.ready ? ('validation_passed' as const) : ('failed_validation' as const),
  }
  await writeArtifacts(artifacts, plan, validation, artifacts.review, client)
  await appendPlanEvent(
    {
      planId: input.planId,
      type: readiness.ready ? 'validation_passed' : 'validation_failed',
      payload: { runIds: [...updates.keys()], blockers: readiness.blockers },
    },
    client,
  )
  return { plan, validation, readiness }
}

export async function reviewImplementationCompletion(planId: string, options: Options = {}) {
  const artifacts = await readArtifacts(planId, options.projectDirectory)
  const implementation = implementationState(artifacts.validation)
  const readiness = canCompleteImplementation(artifacts.plan, artifacts.validation)
  const tasks = artifacts.plan.tasks.map(task => ({
    taskId: task.id,
    status: implementation.taskStates[task.id] ?? 'pending',
  }))
  const optionalFailures = implementation.validationRuns.filter(run => !run.required && run.status !== 'passed')
  const acknowledgedFailures = implementation.validationRuns.filter(
    run => run.failureSignatureHash && run.acknowledgedAt,
  )
  const evidence = {
    plan: {
      planId: artifacts.plan.planId,
      revision: artifacts.plan.revision,
      lifecycle: artifacts.plan.lifecycle,
      hash: artifacts.planStored.hash,
    },
    validation: {
      revision: artifacts.validation.revision,
      hash: artifacts.validationStored.hash,
      requiredValidationIds: artifacts.validation.validations.filter(item => item.required).map(item => item.id),
    },
    readiness,
    tasks,
    commits: implementation.commits,
    validationRuns: implementation.validationRuns,
    structuredBlockers: completionNextActions(artifacts.plan.planId, readiness.blockers),
    optionalFailures,
    acknowledgedFailures,
    blockingRemarks: artifacts.review.threads.filter(thread => thread.blocking),
    nonBlockingRemarks: artifacts.review.threads.filter(thread => !thread.blocking),
    finalSignOff: artifacts.review.finalSignOff,
  }
  return { ...evidence, evidenceHash: completionEvidenceHash(evidence) }
}

// Completion deliberately keeps all final gates adjacent to the sign-off write.
// fallow-ignore-next-line complexity
export async function approveImplementationCompletion(
  input: { planId: string; approvedBy: string; contentHash: string },
  options: Options = {},
) {
  const client = options.client ?? prisma
  const artifacts = await readArtifacts(input.planId, options.projectDirectory)
  if (artifacts.plan.lifecycle !== 'validation_passed') {
    throw new ServiceError('Passing validations are required before completion.', 'CONFLICT')
  }
  const readiness = canCompleteImplementation(artifacts.plan, artifacts.validation)
  if (!readiness.ready) throw new ServiceError(readiness.blockers.join(' '), 'CONFLICT')
  const blocking = artifacts.review.threads.filter(thread => thread.blocking)
  if (blocking.length) throw new ServiceError('Blocking feedback must be resolved before completion.', 'CONFLICT')
  const currentReview = await reviewImplementationCompletion(input.planId, options)
  if (input.contentHash !== currentReview.evidenceHash) {
    throw new ServiceError('Completion approval must reference the current completion evidence hash.', 'CONFLICT')
  }
  const review = {
    ...artifacts.review,
    finalSignOff: {
      id: `completion-${input.planId}`,
      revision: artifacts.plan.revision,
      contentHash: input.contentHash,
      relevantHashes: {
        plan: artifacts.planStored.hash,
        validation: artifacts.validationStored.hash,
        review: artifacts.reviewStored.hash,
      },
      approvedBy: input.approvedBy,
      approvedAt: (options.now ?? new Date()).toISOString(),
    },
  }
  const plan = { ...artifacts.plan, lifecycle: 'completed' as const }
  const validation = {
    ...artifacts.validation,
    implementation: { ...implementationState(artifacts.validation), evidenceProtected: false },
  }
  await writeArtifacts(artifacts, plan, validation, review, client)
  await appendPlanEvent(
    { planId: input.planId, type: 'plan_completed', payload: { approvedBy: input.approvedBy } },
    client,
  )
  return { plan, review, validation }
}
