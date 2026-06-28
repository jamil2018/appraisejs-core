import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { parseYamlArtifact, serializeYamlArtifact, type PlanArtifact, type ReviewArtifact } from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { findProjectRoot } from '@/lib/plans/project-root'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { ServiceError } from '@/services/shared/errors'

import { appendPlanEvent, assertPlanNotCancelled, ensurePlanReviewReadyEvent } from './coordinator-service'

type PlanServiceOptions = {
  client?: PrismaClient
  projectDirectory?: string
  targetProjectId?: string | null
}

const ONLINE_PLAN_CREATE_LIFECYCLES = ['draft', 'awaiting_plan_review'] as const

export class CoordinatorPlanCreatePartialError extends Error {
  readonly code = 'plan-create-partial'
  readonly statusCode = 500

  constructor(
    message: string,
    readonly details: {
      planId: string
      artifactPath?: string
      stage: 'write-artifact' | 'sync-projection' | 'append-graph-event' | 'append-review-ready' | 'read-artifact'
      safeToRetry: boolean
      contentHash?: string
      recovery: string
    },
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'CoordinatorPlanCreatePartialError'
  }
}

export async function createCoordinatorPlan(plan: PlanArtifact, options: PlanServiceOptions = {}) {
  if (!ONLINE_PLAN_CREATE_LIFECYCLES.includes(plan.lifecycle as (typeof ONLINE_PLAN_CREATE_LIFECYCLES)[number])) {
    throw new ServiceError(
      'Online plan creation only accepts draft or awaiting_plan_review lifecycle submissions.',
      'VALIDATION',
    )
  }
  const reviewPlan =
    plan.lifecycle === 'draft' ? ({ ...plan, lifecycle: 'awaiting_plan_review' as const } satisfies PlanArtifact) : plan
  const client = options.client ?? prisma
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  let artifactPath: string | undefined
  let contentHash: string | undefined
  const partial = (stage: CoordinatorPlanCreatePartialError['details']['stage'], error: unknown, safeToRetry = true) =>
    new CoordinatorPlanCreatePartialError(
      `Plan ${plan.planId} was partially created but failed during ${stage}.`,
      {
        planId: reviewPlan.planId,
        artifactPath,
        stage,
        safeToRetry,
        contentHash,
        recovery: `Run npm run sync-plans, then check appraise://plans/${reviewPlan.planId} or retry plan status for ${reviewPlan.planId}.`,
      },
      { cause: error },
    )
  try {
    await repository.create('plan', reviewPlan.planId, serializeYamlArtifact('plan', reviewPlan))
    artifactPath = `appraise/plans/${reviewPlan.planId}.yaml`
  } catch (error) {
    throw partial('write-artifact', error, false)
  }
  try {
    await syncPlans({ projectDirectory: projectRoot, client })
    if (options.targetProjectId) {
      await client.planProjection.update({
        where: { planId: reviewPlan.planId },
        data: { targetProjectId: options.targetProjectId },
      })
    }
  } catch (error) {
    throw partial('sync-projection', error)
  }
  try {
    await appendPlanEvent({ planId: reviewPlan.planId, type: 'plan_graph_processing_started' }, client)
  } catch (error) {
    throw partial('append-graph-event', error)
  }
  let reviewReadyEvent: NonNullable<Awaited<ReturnType<typeof ensurePlanReviewReadyEvent>>>
  try {
    const event = await ensurePlanReviewReadyEvent(reviewPlan.planId, client)
    if (!event) {
      throw new ServiceError('The plan is not awaiting plan review.', 'CONFLICT')
    }
    reviewReadyEvent = event
  } catch (error) {
    throw partial('append-review-ready', error)
  }
  let artifact
  try {
    artifact = await repository.read('plan', reviewPlan.planId)
    contentHash = artifact.hash
  } catch (error) {
    throw partial('read-artifact', error)
  }
  return {
    plan: reviewPlan,
    planId: reviewPlan.planId,
    revision: reviewPlan.revision,
    lifecycle: reviewPlan.lifecycle,
    contentHash: artifact.hash,
    eventSequence: reviewReadyEvent.sequence,
    reviewUrl: `/plans/${reviewPlan.planId}`,
  }
}

export async function readCoordinatorPlan(planId: string, options: PlanServiceOptions = {}) {
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const artifact = await new PlanArtifactRepository(projectRoot).read('plan', planId)
  return {
    plan: parseYamlArtifact('plan', artifact.content) as PlanArtifact,
    contentHash: artifact.hash,
    reviewUrl: `/plans/${planId}`,
  }
}

export async function reviseCoordinatorPlan(
  planId: string,
  plan: PlanArtifact,
  expectedHash: string,
  options: PlanServiceOptions = {},
) {
  if (plan.planId !== planId) throw new ServiceError('Plan ID does not match the route.', 'VALIDATION')
  const client = options.client ?? prisma
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const current = await repository.read('plan', planId)
  const currentPlan = parseYamlArtifact('plan', current.content) as PlanArtifact
  if (plan.revision <= currentPlan.revision) {
    throw new ServiceError('A revision must increase the current revision number.', 'CONFLICT')
  }
  const nextPlan =
    currentPlan.lifecycle === 'changes_requested' && plan.lifecycle !== 'awaiting_plan_review'
      ? ({ ...plan, lifecycle: 'awaiting_plan_review' as const } satisfies PlanArtifact)
      : plan
  await repository.compareAndWrite('plan', planId, expectedHash, serializeYamlArtifact('plan', nextPlan))
  await syncPlans({ projectDirectory: projectRoot, client })
  await appendPlanEvent({ planId, type: 'plan_revision_submitted', payload: { revision: nextPlan.revision } }, client)
  return readCoordinatorPlan(planId, options)
}

export async function startCoordinatorPlan(planId: string, options: PlanServiceOptions = {}) {
  const client = options.client ?? prisma
  await assertPlanNotCancelled(planId, client)
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const current = await repository.read('plan', planId)
  const plan = parseYamlArtifact('plan', current.content) as PlanArtifact
  const reviewArtifact = await repository.read('review', planId).catch(() => null)
  const review = reviewArtifact ? (parseYamlArtifact('review', reviewArtifact.content) as ReviewArtifact) : undefined
  if (
    !review?.planApprovals.some(
      approval => approval.revision === plan.revision && approval.contentHash === current.hash,
    )
  ) {
    throw new ServiceError('The current plan revision has not been approved.', 'CONFLICT')
  }
  const next = { ...plan, lifecycle: 'preparing_validations' as const }
  await repository.compareAndWrite('plan', planId, current.hash, serializeYamlArtifact('plan', next))
  await syncPlans({ projectDirectory: projectRoot, client })
  await appendPlanEvent(
    { planId, type: 'validation_preparation_started', payload: { revision: plan.revision } },
    client,
  )
  return readCoordinatorPlan(planId, options)
}

export async function updateCoordinatorTask(
  input: { planId: string; taskId: string; status: string; detail?: string },
  client: PrismaClient = prisma,
) {
  await assertPlanNotCancelled(input.planId, client)
  const task = await client.planTaskProjection.findFirst({
    where: { taskId: input.taskId, plan: { planId: input.planId } },
    select: { id: true },
  })
  if (!task) throw new ServiceError('Plan task not found.', 'NOT_FOUND')
  return appendPlanEvent(
    {
      planId: input.planId,
      type: 'task_updated',
      payload: { taskId: input.taskId, status: input.status, detail: input.detail },
    },
    client,
  )
}
