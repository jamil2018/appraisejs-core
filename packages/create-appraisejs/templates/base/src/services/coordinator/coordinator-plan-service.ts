import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { parseYamlArtifact, serializeYamlArtifact, type PlanArtifact, type ReviewArtifact } from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { createOpaquePlanId, createPlanSlug, isLegacyPlanId } from '@/lib/plans/plan-identity'
import { planContentHash, planStateHash, reviewBindingHash } from '@/lib/plans/plan-hashes'
import { findProjectRoot } from '@/lib/plans/project-root'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { ServiceError } from '@/services/shared/errors'
import { auditManagedValidationIntegrity } from './managed-validation-integrity-audit'

import {
  appendPlanEvent,
  assertPlanNotCancelled,
  ensurePlanReviewReadyEvent,
  resolvePlanReference,
} from './coordinator-service'

type PlanServiceOptions = {
  client?: PrismaClient
  projectDirectory?: string
  targetProjectId?: string | null
}

const ONLINE_PLAN_CREATE_LIFECYCLES = ['draft', 'awaiting_plan_review'] as const

export async function assertPlanBelongsToProject(
  planId: string,
  targetProjectId: string,
  client: PrismaClient = prisma,
): Promise<void> {
  const plan = await client.planProjection.findFirst({
    where: { planId, targetProjectId, deletedAt: null },
    select: { id: true },
  })
  if (!plan) throw new ServiceError('Plan not found.', 'NOT_FOUND', 404)
}

function resolvedPlanHashes(
  plan: PlanArtifact,
  projection?: { planContentHash: string; planStateHash: string; reviewBindingHash: string } | null,
) {
  return {
    planContentHash: projection?.planContentHash || planContentHash(plan),
    planStateHash: projection?.planStateHash || planStateHash(plan),
    reviewBindingHash: projection?.reviewBindingHash || reviewBindingHash(plan),
  }
}

export class CoordinatorPlanCreatePartialError extends Error {
  // fallow-ignore-next-line unused-class-member
  readonly code = 'plan-create-partial'
  // fallow-ignore-next-line unused-class-member
  readonly statusCode = 500

  constructor(
    message: string,
    readonly details: {
      planId: string
      artifactPath?: string
      stage: 'write-artifact' | 'sync-projection' | 'append-graph-event' | 'append-review-ready' | 'read-artifact'
      safeToRetry: boolean
      planContentHash?: string
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
  const planId = createOpaquePlanId()
  const slug = createPlanSlug(plan.goal)
  const legacyPlanId = isLegacyPlanId(plan.planId) ? plan.planId : null
  const reviewPlan = {
    ...plan,
    planId,
    lifecycle: plan.lifecycle === 'draft' ? ('awaiting_plan_review' as const) : plan.lifecycle,
  } satisfies PlanArtifact
  const client = options.client ?? prisma
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  let artifactPath: string | undefined
  let createdPlanContentHash: string | undefined
  const partial = (stage: CoordinatorPlanCreatePartialError['details']['stage'], error: unknown, safeToRetry = true) =>
    new CoordinatorPlanCreatePartialError(
      `Plan ${planId} was partially created but failed during ${stage}.`,
      {
        planId,
        artifactPath,
        stage,
        safeToRetry,
        planContentHash: createdPlanContentHash,
        recovery: `Run npm run sync-plans, then check appraise://plans/${planId} or retry plan status for ${planId}.`,
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
    if (options.targetProjectId || slug || legacyPlanId) {
      await client.planProjection.update({
        where: { planId },
        data: {
          slug,
          legacyPlanId,
          ...(options.targetProjectId ? { targetProjectId: options.targetProjectId } : {}),
        },
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
  try {
    await repository.read('plan', reviewPlan.planId)
    createdPlanContentHash = planContentHash(reviewPlan)
  } catch (error) {
    throw partial('read-artifact', error)
  }
  return {
    plan: reviewPlan,
    planId: reviewPlan.planId,
    slug,
    legacyPlanId: legacyPlanId ?? undefined,
    revision: reviewPlan.revision,
    lifecycle: reviewPlan.lifecycle,
    planContentHash: planContentHash(reviewPlan),
    planStateHash: planStateHash(reviewPlan),
    reviewBindingHash: reviewBindingHash(reviewPlan),
    contentHash: planContentHash(reviewPlan),
    eventSequence: reviewReadyEvent.sequence,
    reviewUrl: `/plans/${reviewPlan.planId}`,
  }
}

export async function readCoordinatorPlan(planId: string, options: PlanServiceOptions = {}) {
  const client = options.client ?? prisma
  const canonicalPlanId = await resolvePlanReference(planId, client)
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const artifact = await new PlanArtifactRepository(projectRoot).read('plan', canonicalPlanId)
  const plan = parseYamlArtifact('plan', artifact.content) as PlanArtifact
  const projection = await client.planProjection.findUnique({
    where: { planId: canonicalPlanId },
    select: { slug: true, legacyPlanId: true, planContentHash: true, planStateHash: true, reviewBindingHash: true },
  })
  const hashes = resolvedPlanHashes(plan, projection)
  const validationIntegrity = await auditManagedValidationIntegrity(canonicalPlanId, {
    client,
    projectDirectory: projectRoot,
  })
  return {
    planId: canonicalPlanId,
    plan,
    slug: projection?.slug ?? createPlanSlug(plan.goal),
    legacyPlanId: projection?.legacyPlanId ?? undefined,
    ...hashes,
    contentHash: hashes.planContentHash,
    reviewUrl: `/plans/${canonicalPlanId}`,
    validationIntegrity,
  }
}

export async function reviseCoordinatorPlan(
  planId: string,
  plan: PlanArtifact,
  expectedHash: string,
  options: PlanServiceOptions = {},
) {
  const client = options.client ?? prisma
  const canonicalPlanId = await resolvePlanReference(planId, client)
  if (plan.planId !== canonicalPlanId) throw new ServiceError('Plan ID does not match the route.', 'VALIDATION')
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const current = await repository.read('plan', canonicalPlanId)
  const currentPlan = parseYamlArtifact('plan', current.content) as PlanArtifact
  const currentPlanContentHash = planContentHash(currentPlan)
  if (expectedHash !== currentPlanContentHash) {
    throw new ServiceError('The expected plan content hash is stale.', 'CONFLICT', 409, {
      expectedPlanContentHash: expectedHash,
      currentPlanContentHash,
      currentPlanStateHash: planStateHash(currentPlan),
    })
  }
  if (plan.revision <= currentPlan.revision) {
    throw new ServiceError('A revision must increase the current revision number.', 'CONFLICT')
  }
  const nextPlan =
    currentPlan.lifecycle === 'changes_requested' && plan.lifecycle !== 'awaiting_plan_review'
      ? ({ ...plan, lifecycle: 'awaiting_plan_review' as const } satisfies PlanArtifact)
      : plan
  await repository.compareAndWrite('plan', canonicalPlanId, current.hash, serializeYamlArtifact('plan', nextPlan))
  await syncPlans({ projectDirectory: projectRoot, client })
  await appendPlanEvent(
    { planId: canonicalPlanId, type: 'plan_revision_submitted', payload: { revision: nextPlan.revision } },
    client,
  )
  return readCoordinatorPlan(canonicalPlanId, options)
}

export async function startCoordinatorPlan(planId: string, options: PlanServiceOptions = {}) {
  const client = options.client ?? prisma
  const canonicalPlanId = await resolvePlanReference(planId, client)
  await assertPlanNotCancelled(canonicalPlanId, client)
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const current = await repository.read('plan', canonicalPlanId)
  const plan = parseYamlArtifact('plan', current.content) as PlanArtifact
  const reviewArtifact = await repository.read('review', canonicalPlanId).catch(() => null)
  const review = reviewArtifact ? (parseYamlArtifact('review', reviewArtifact.content) as ReviewArtifact) : undefined
  if (
    !review?.planApprovals.some(
      approval => approval.revision === plan.revision && approval.contentHash === planContentHash(plan),
    )
  ) {
    throw new ServiceError('The current plan revision has not been approved.', 'CONFLICT')
  }
  const next = { ...plan, lifecycle: 'preparing_validations' as const }
  await repository.compareAndWrite('plan', canonicalPlanId, current.hash, serializeYamlArtifact('plan', next))
  await syncPlans({ projectDirectory: projectRoot, client })
  await appendPlanEvent(
    { planId: canonicalPlanId, type: 'validation_preparation_started', payload: { revision: plan.revision } },
    client,
  )
  return readCoordinatorPlan(canonicalPlanId, options)
}

export async function updateCoordinatorTask(
  input: { planId: string; taskId: string; status: string; detail?: string },
  client: PrismaClient = prisma,
) {
  const canonicalPlanId = await resolvePlanReference(input.planId, client)
  await assertPlanNotCancelled(canonicalPlanId, client)
  const task = await client.planTaskProjection.findFirst({
    where: { taskId: input.taskId, plan: { planId: canonicalPlanId } },
    select: { id: true },
  })
  if (!task) throw new ServiceError('Plan task not found.', 'NOT_FOUND')
  return appendPlanEvent(
    {
      planId: canonicalPlanId,
      type: 'task_updated',
      payload: { taskId: input.taskId, status: input.status, detail: input.detail },
    },
    client,
  )
}
