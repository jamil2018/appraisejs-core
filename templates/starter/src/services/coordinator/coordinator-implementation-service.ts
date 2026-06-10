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

import { appendPlanEvent } from './coordinator-service'

type Options = { client?: PrismaClient; projectDirectory?: string; now?: Date }

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

async function implementationContext(planId: string, options: Options) {
  const client = options.client ?? prisma
  const artifacts = await readArtifacts(planId, options.projectDirectory)
  assertImplementationLifecycle(artifacts.plan)
  return { client, artifacts, implementation: implementationState(artifacts.validation) }
}

// fallow-ignore-next-line complexity
export async function reachImplementationCheckpoint(
  input: { planId: string; type: CheckpointType; taskIds?: string[]; queuedFeedbackCount?: number },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
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

// fallow-ignore-next-line complexity
export async function applyBlockingFeedback(
  input: { planId: string; affectedTaskIds: string[]; confirmed: boolean; pausePlanWide?: boolean },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  const impact = analyzeBlockingFeedback(artifacts.plan, input.affectedTaskIds, implementation.approvedGroupIds)
  if (!input.confirmed) return { confirmationRequired: true, impact }
  const pausedTaskIds = input.pausePlanWide
    ? artifacts.plan.tasks.map(task => task.id)
    : [...new Set([...implementation.pausedTaskIds, ...impact.affectedTaskIds, ...impact.transitiveDependentIds])]
  const validation = {
    ...artifacts.validation,
    implementation: {
      ...implementation,
      pausedTaskIds,
      approvedGroupIds: implementation.approvedGroupIds.filter(
        id => !impact.approvalsRequiringConfirmation.includes(id),
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

export async function reviewImplementationCompletion(planId: string, options: Options = {}) {
  const artifacts = await readArtifacts(planId, options.projectDirectory)
  const readiness = canCompleteImplementation(artifacts.plan, artifacts.validation)
  return {
    readiness,
    tasks: artifacts.plan.tasks.map(task => ({
      taskId: task.id,
      status: implementationState(artifacts.validation).taskStates[task.id] ?? 'pending',
    })),
    commits: implementationState(artifacts.validation).commits,
    validationRuns: implementationState(artifacts.validation).validationRuns,
    blockingRemarks: artifacts.review.threads.filter(thread => thread.blocking),
    nonBlockingRemarks: artifacts.review.threads.filter(thread => !thread.blocking),
  }
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
  const review = {
    ...artifacts.review,
    finalSignOff: {
      id: `completion-${input.planId}`,
      revision: artifacts.plan.revision,
      contentHash: input.contentHash,
      relevantHashes: {},
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
