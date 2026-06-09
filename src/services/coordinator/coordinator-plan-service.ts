import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { parseYamlArtifact, serializeYamlArtifact, type PlanArtifact, type ReviewArtifact } from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { findProjectRoot } from '@/lib/plans/project-root'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { ServiceError } from '@/services/shared/errors'

import { appendPlanEvent } from './coordinator-service'

type PlanServiceOptions = {
  client?: PrismaClient
  projectDirectory?: string
}

export async function createCoordinatorPlan(plan: PlanArtifact, options: PlanServiceOptions = {}) {
  const client = options.client ?? prisma
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  await repository.create('plan', plan.planId, serializeYamlArtifact('plan', plan))
  await syncPlans({ projectDirectory: projectRoot, client })
  await appendPlanEvent({ planId: plan.planId, type: 'plan_graph_processing_started' }, client)
  await appendPlanEvent(
    { planId: plan.planId, type: 'plan_review_ready', payload: { representation: 'graph-and-list' } },
    client,
  )
  return {
    plan,
    reviewUrl: `/plans/${plan.planId}`,
  }
}

export async function readCoordinatorPlan(planId: string, options: PlanServiceOptions = {}) {
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const artifact = await new PlanArtifactRepository(projectRoot).read('plan', planId)
  return {
    plan: parseYamlArtifact('plan', artifact.content) as PlanArtifact,
    contentHash: artifact.hash,
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
  await repository.compareAndWrite('plan', planId, expectedHash, serializeYamlArtifact('plan', plan))
  await syncPlans({ projectDirectory: projectRoot, client })
  await appendPlanEvent({ planId, type: 'plan_revision_submitted', payload: { revision: plan.revision } }, client)
  return readCoordinatorPlan(planId, options)
}

export async function startCoordinatorPlan(planId: string, options: PlanServiceOptions = {}) {
  const client = options.client ?? prisma
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
