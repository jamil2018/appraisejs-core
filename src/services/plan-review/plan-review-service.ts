import { createHash, randomUUID } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  parseYamlArtifact,
  serializeJsonArtifact,
  serializeYamlArtifact,
  type LayoutArtifact,
  type PlanArtifact,
  type ReviewArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { PlanArtifactRepository, PlanRepositoryError } from '@/lib/plans/artifact-repository'
import { findProjectRoot } from '@/lib/plans/project-root'
import { planContentHash, planStateHash, reviewBindingHash } from '@/lib/plans/plan-hashes'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { assessValidationReadiness, fileReviewHash, validationNodeHash } from '@/lib/validation-review/approval'
import { ServiceError } from '@/services/shared/errors'
import {
  appendPlanEvent,
  assertPlanNotCancelled,
  resolvePlanReference,
} from '@/services/coordinator/coordinator-service'
import { reviewImplementationCompletion } from '@/services/coordinator/coordinator-implementation-service'
import { analyzeExecutionOrder } from '@/lib/implementation-checkpoints/protocol'
import { auditManagedValidationIntegrity } from '@/services/coordinator/managed-validation-integrity-audit'

import {
  canApprovePlan,
  canRequestPlanChanges,
  derivePlanGraph,
  evaluateGraphReadiness,
  getBlockingThreads,
  getOrphanedThreads,
  getThreadStatus,
} from './plan-review-helpers'

const DEFAULT_REVIEWER = 'local-user'

type ReviewMutationOptions = {
  client?: PrismaClient
  projectDirectory?: string
  targetProjectId?: string
}

type WriteReviewOptions = ReviewMutationOptions & {
  sync?: boolean
}

export type PlanReviewDetail = {
  plan: PlanArtifact
  planContentHash: string
  planStateHash: string
  reviewBindingHash: string
  /** Compatibility alias for planContentHash. */
  contentHash: string
  review?: ReviewArtifact
  validation?: ValidationArtifact
  validationContentHash?: string
  validationReview?: {
    nodeHashes: Record<string, string>
    fileHashes: Record<string, string>
    readiness: ReturnType<typeof assessValidationReadiness>
    operationHash?: string
    reviewStateHash?: string
    extensionArtifactHashes: string[]
  }
  validationIntegrity: Awaited<ReturnType<typeof auditManagedValidationIntegrity>>
  completionReview?: Awaited<ReturnType<typeof reviewImplementationCompletion>>
  graph: ReturnType<typeof derivePlanGraph>
  executionOrder: ReturnType<typeof analyzeExecutionOrder>
  projection: {
    targetProjectId: string | null
    slug: string
    legacyPlanId: string | null
    sourceHash: string
    planContentHash: string
    planStateHash: string
    reviewBindingHash: string
    lifecycle: string
    stale: boolean
    conflicted: boolean
    lastValidProjectedAt: Date
    updatedAt: Date
  }
  issues: Array<{ code: string; message: string; blocking: boolean }>
  revisions: Array<{
    id: string
    sourceHash: string
    gitCommit: string | null
    reducedAssurance: boolean
    createdAt: Date
  }>
  events: Array<{ sequence: number; type: string; payloadJson: string | null; createdAt: Date }>
  delegations: Array<{
    id: string
    parentCoordinatorId: string
    delegatedCoordinatorId: string
    purpose: string
    permissions: string[]
    prohibitions: string[]
    expiresAt: Date
    revokedAt: Date | null
    consumptions: Array<{ permission: string; operationKey: string; consumedAt: Date }>
  }>
  personalPositions: LayoutArtifact['positions']
  sharedPositions: LayoutArtifact['positions']
  blockingThreadIds: string[]
  orphanedThreadIds: string[]
  reviewReady: boolean
  listFallback: boolean
}

type ReviewThreadSummary = {
  id: string
  target: ReviewArtifact['threads'][number]['target']
  blocking: boolean
  status: string
  latestBody?: string
  latestActor?: string
  latestCreatedAt?: string
  events: ReviewArtifact['threads'][number]['events']
  orphaned: boolean
}

export type PlanReviewSummary = {
  planId: string
  targetProjectId?: string
  plan: {
    revision: number
    lifecycle: PlanArtifact['lifecycle']
    planContentHash: string
    planStateHash: string
    reviewBindingHash: string
    contentHash: string
  }
  reviewHash: string
  blockingThreads: ReviewThreadSummary[]
  nonBlockingThreads: ReviewThreadSummary[]
  orphanedThreadIds: string[]
  links: {
    appraise: string
    route: string
  }
  recovery: {
    changesRequested: string
    revise: string
  }
}

function id(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

function hashContent(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function emptyReview(planId: string): ReviewArtifact {
  return {
    version: '1',
    planId,
    threads: [],
    planApprovals: [],
    fileApprovals: [],
  }
}

function findRemarkThread(review: ReviewArtifact, threadId: string): ReviewArtifact['threads'][number] {
  const thread = review.threads.find(candidate => candidate.id === threadId)
  if (!thread) throw new ServiceError('Remark thread not found.', 'NOT_FOUND')
  return thread
}

function parsePositions(value: string | null | undefined): LayoutArtifact['positions'] {
  if (!value) return {}
  try {
    return JSON.parse(value) as LayoutArtifact['positions']
  } catch {
    return {}
  }
}

function parseValidation(value: string | null | undefined): ValidationArtifact | undefined {
  return value ? (JSON.parse(value) as ValidationArtifact) : undefined
}

function reviewDetailEvents(
  events: PlanReviewDetail['events'],
  input: { ready: boolean; includePendingReviewReady: boolean },
): PlanReviewDetail['events'] {
  const projected = events.map(({ sequence, type, payloadJson, createdAt }) => ({
    sequence,
    type,
    payloadJson,
    createdAt,
  }))
  if (input.ready || !input.includePendingReviewReady) return projected
  return [
    ...projected,
    {
      sequence: (events.at(-1)?.sequence ?? 0) + 1,
      type: 'plan_review_ready',
      payloadJson: JSON.stringify({ representation: 'graph-and-list' }),
      createdAt: new Date(),
    },
  ]
}

function reviewHash(review: ReviewArtifact, storedHash?: string): string {
  return storedHash ?? hashContent(serializeYamlArtifact('review', review))
}

function summarizeThread(
  thread: ReviewArtifact['threads'][number],
  orphanedThreadIds: Set<string>,
): ReviewThreadSummary {
  const latest = thread.events.at(-1)
  return {
    id: thread.id,
    target: thread.target,
    blocking: thread.blocking,
    status: getThreadStatus(thread),
    latestBody: latest?.body,
    latestActor: latest?.actor,
    latestCreatedAt: latest?.createdAt,
    events: thread.events,
    orphaned: orphanedThreadIds.has(thread.id),
  }
}

async function readPlanAndReview(projectDirectory: string, planId: string) {
  const repository = new PlanArtifactRepository(projectDirectory)
  const planArtifact = await repository.read('plan', planId)
  const plan = parseYamlArtifact('plan', planArtifact.content) as PlanArtifact
  try {
    const reviewArtifact = await repository.read('review', planId)
    return {
      repository,
      planArtifact,
      plan,
      reviewArtifact,
      review: parseYamlArtifact('review', reviewArtifact.content) as ReviewArtifact,
    }
  } catch (error) {
    if (error instanceof PlanRepositoryError && error.code === 'not-found') {
      return { repository, planArtifact, plan, reviewArtifact: undefined, review: emptyReview(planId) }
    }
    throw error
  }
}

async function writeReview(
  planId: string,
  review: ReviewArtifact,
  currentHash: string | undefined,
  options?: WriteReviewOptions,
): Promise<void> {
  const projectRoot = await findProjectRoot(options?.projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const content = serializeYamlArtifact('review', review)
  try {
    if (currentHash) await repository.compareAndWrite('review', planId, currentHash, content)
    else await repository.create('review', planId, content)
  } catch (error) {
    if (error instanceof PlanRepositoryError && ['stale-write', 'already-exists'].includes(error.code)) {
      throw new ServiceError(
        'The review changed while this action was being submitted. Refresh and try again.',
        'CONFLICT',
      )
    }
    throw error
  }
  if (options?.sync !== false) await syncPlans({ projectDirectory: projectRoot, client: options?.client })
}

export async function listPlans(options?: ReviewMutationOptions) {
  const client = options?.client ?? prisma
  return client.planProjection.findMany({
    where: { deletedAt: null, targetProjectId: options?.targetProjectId },
    orderBy: { updatedAt: 'desc' },
    include: {
      tasks: { orderBy: { position: 'asc' } },
      issues: { where: { resolvedAt: null } },
      revisions: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
}

async function readValidationReviewEvidence(
  planId: string,
  validation: ValidationArtifact | undefined,
  review: ReviewArtifact | undefined,
  client: PrismaClient,
): Promise<PlanReviewDetail['validationReview']> {
  if (!validation || !review) return undefined
  const publishOperation = await client.validationAstPublishOperation.findFirst({
    where: { planId, phase: 'review_ready' },
    orderBy: { createdAt: 'desc' },
    include: { extensionReviews: true },
  })
  return {
    nodeHashes: Object.fromEntries(validation.validations.map(node => [node.id, validationNodeHash(node)])),
    fileHashes: Object.fromEntries(validation.files.map(file => [file.path, fileReviewHash(file)])),
    readiness: assessValidationReadiness(validation, review),
    operationHash: publishOperation?.operationHash,
    reviewStateHash: publishOperation?.reviewStateHash ?? undefined,
    extensionArtifactHashes: publishOperation?.extensionReviews.map(item => item.artifactHash).sort() ?? [],
  }
}

export async function getPlanReviewDetail(
  planId: string,
  owner = DEFAULT_REVIEWER,
  options?: ReviewMutationOptions,
): Promise<PlanReviewDetail> {
  const client = options?.client ?? prisma
  const canonicalPlanId = await resolvePlanReference(planId, client)
  const projectRoot = await findProjectRoot(options?.projectDirectory)
  const [{ plan, review }, projection] = await Promise.all([
    readPlanAndReview(projectRoot, canonicalPlanId),
    client.planProjection.findFirst({
      where: {
        planId: canonicalPlanId,
        targetProjectId: options?.targetProjectId,
      },
      include: {
        issues: { where: { resolvedAt: null }, orderBy: { createdAt: 'desc' } },
        revisions: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'asc' } },
        personalLayouts: { where: { owner }, take: 1 },
        targetProject: {
          include: {
            delegatedCoordinatorReceipts: {
              orderBy: { issuedAt: 'desc' },
              include: { consumptions: { orderBy: { consumedAt: 'asc' } } },
            },
          },
        },
      },
    }),
  ])
  if (!projection) throw new ServiceError('Plan not found.', 'NOT_FOUND')
  const validation = parseValidation(projection.validationJson)
  const validationReview = await readValidationReviewEvidence(canonicalPlanId, validation, review, client)
  const validationIntegrity = await auditManagedValidationIntegrity(canonicalPlanId, {
    client,
    projectDirectory: projectRoot,
  })
  const completionReview = ['failed_validation', 'validation_passed', 'completed'].includes(plan.lifecycle)
    ? await reviewImplementationCompletion(canonicalPlanId, { client, projectDirectory: projectRoot })
    : undefined

  const graph = derivePlanGraph(plan)
  const readiness = evaluateGraphReadiness(projection.events)
  const canReview = plan.lifecycle === 'awaiting_plan_review'
  if (canReview && !readiness.ready) {
    await appendPlanEvent(
      { planId: canonicalPlanId, type: 'plan_review_ready', payload: { representation: 'graph-and-list' } },
      client,
    )
  }
  const includePendingReviewReady = canReview && !readiness.ready

  return {
    plan,
    planContentHash: projection.planContentHash || planContentHash(plan),
    planStateHash: projection.planStateHash,
    reviewBindingHash: projection.reviewBindingHash,
    contentHash: projection.planContentHash || planContentHash(plan),
    review,
    validation,
    validationContentHash: validation ? hashContent(serializeYamlArtifact('validation', validation)) : undefined,
    validationReview,
    validationIntegrity,
    completionReview,
    graph,
    executionOrder: analyzeExecutionOrder(plan),
    projection,
    issues: projection.issues,
    revisions: projection.revisions,
    events: reviewDetailEvents(projection.events, { ready: readiness.ready, includePendingReviewReady }),
    delegations: (projection.targetProject?.delegatedCoordinatorReceipts ?? []).map(receipt => ({
      id: receipt.id,
      parentCoordinatorId: receipt.parentCoordinatorId,
      delegatedCoordinatorId: receipt.delegatedCoordinatorId,
      purpose: receipt.purpose,
      permissions: JSON.parse(receipt.permissionsJson) as string[],
      prohibitions: JSON.parse(receipt.prohibitionsJson) as string[],
      expiresAt: receipt.expiresAt,
      revokedAt: receipt.revokedAt,
      consumptions: receipt.consumptions.map(({ permission, operationKey, consumedAt }) => ({
        permission,
        operationKey,
        consumedAt,
      })),
    })),
    personalPositions: parsePositions(projection.personalLayouts[0]?.positionsJson),
    sharedPositions: parsePositions(projection.layoutJson),
    blockingThreadIds: getBlockingThreads(review).map(thread => thread.id),
    orphanedThreadIds: getOrphanedThreads(plan, review).map(thread => thread.id),
    reviewReady: canReview && (readiness.ready || !readiness.staleWorker),
    listFallback: readiness.listFallback,
  }
}

export async function readPlanReviewSummary(
  planId: string,
  options?: ReviewMutationOptions,
): Promise<PlanReviewSummary> {
  const client = options?.client ?? prisma
  const canonicalPlanId = await resolvePlanReference(planId, client)
  const projectRoot = await findProjectRoot(options?.projectDirectory)
  const { plan, review, reviewArtifact } = await readPlanAndReview(projectRoot, canonicalPlanId)
  const projection = await client.planProjection.findUnique({
    where: { planId: canonicalPlanId },
    select: { targetProjectId: true },
  })
  const orphanedThreads = getOrphanedThreads(plan, review)
  const orphanedThreadIds = new Set(orphanedThreads.map(thread => thread.id))
  const openThreads = review.threads.filter(thread => !['resolved', 'dismissed'].includes(getThreadStatus(thread)))
  return {
    planId: canonicalPlanId,
    targetProjectId: projection?.targetProjectId ?? undefined,
    plan: {
      revision: plan.revision,
      lifecycle: plan.lifecycle,
      planContentHash: planContentHash(plan),
      planStateHash: planStateHash(plan),
      reviewBindingHash: reviewBindingHash(plan),
      contentHash: planContentHash(plan),
    },
    reviewHash: reviewHash(review, reviewArtifact?.hash),
    blockingThreads: openThreads
      .filter(thread => thread.blocking)
      .map(thread => summarizeThread(thread, orphanedThreadIds)),
    nonBlockingThreads: openThreads
      .filter(thread => !thread.blocking)
      .map(thread => summarizeThread(thread, orphanedThreadIds)),
    orphanedThreadIds: [...orphanedThreadIds],
    links: {
      appraise: `appraise://plans/${canonicalPlanId}`,
      route: `/plans/${canonicalPlanId}`,
    },
    recovery: {
      changesRequested:
        'Review blockingThreads, preserve unresolved remark history, then submit a higher plan revision with plan_revise.',
      revise:
        'Call plan_revise with the current plan content hash and a higher revision; changed-request plans return to awaiting_plan_review after revision.',
    },
  }
}

export async function addPlanRemark(
  input: {
    planId: string
    target: ReviewArtifact['threads'][number]['target']
    body: string
    blocking: boolean
    actor?: string
  },
  options?: ReviewMutationOptions,
): Promise<void> {
  if (!input.body.trim()) throw new ServiceError('Remark text is required.', 'VALIDATION')
  const projectRoot = await findProjectRoot(options?.projectDirectory)
  const { review, reviewArtifact } = await readPlanAndReview(projectRoot, input.planId)
  review.threads.push({
    id: id('remark'),
    target: input.target,
    blocking: input.blocking,
    events: [
      {
        id: id('event'),
        action: 'created',
        actor: input.actor ?? DEFAULT_REVIEWER,
        createdAt: new Date().toISOString(),
        body: input.body.trim(),
      },
    ],
  })
  await writeReview(input.planId, review, reviewArtifact?.hash, options)
}

export async function transitionPlanRemark(
  input: {
    planId: string
    threadId: string
    action: 'addressed' | 'disputed' | 'resolved' | 'dismissed' | 'downgraded'
    body?: string
    actor?: string
  },
  options?: ReviewMutationOptions,
): Promise<void> {
  const projectRoot = await findProjectRoot(options?.projectDirectory)
  const { review, reviewArtifact } = await readPlanAndReview(projectRoot, input.planId)
  const thread = findRemarkThread(review, input.threadId)
  if (['resolved', 'dismissed'].includes(getThreadStatus(thread))) {
    throw new ServiceError('This remark thread is already closed.', 'CONFLICT')
  }
  if (input.action === 'downgraded') thread.blocking = false
  thread.events.push({
    id: id('event'),
    action: input.action,
    actor: input.actor ?? DEFAULT_REVIEWER,
    createdAt: new Date().toISOString(),
    body: input.body?.trim() || undefined,
  })
  await writeReview(input.planId, review, reviewArtifact?.hash, options)
}

export async function retargetPlanRemark(
  input: { planId: string; threadId: string; taskId: string },
  options?: ReviewMutationOptions,
): Promise<void> {
  const projectRoot = await findProjectRoot(options?.projectDirectory)
  const { plan, review, reviewArtifact } = await readPlanAndReview(projectRoot, input.planId)
  const thread = findRemarkThread(review, input.threadId)
  if (!plan.tasks.some(task => task.id === input.taskId)) throw new ServiceError('Target task not found.', 'VALIDATION')
  thread.target = { type: 'task', taskId: input.taskId }
  thread.events.push({
    id: id('event'),
    action: 'created',
    actor: DEFAULT_REVIEWER,
    createdAt: new Date().toISOString(),
    body: `Retargeted to ${input.taskId}.`,
  })
  await writeReview(input.planId, review, reviewArtifact?.hash, options)
}

export async function approvePlanRevision(
  input: {
    planId: string
    displayedRevision: number
    expectedPlanHash: string
    resolveThreadId?: string
    confirmSuspiciousReplacement?: boolean
    actor?: string
  },
  options?: ReviewMutationOptions,
): Promise<void> {
  const client = options?.client ?? prisma
  await assertPlanNotCancelled(input.planId, client)
  const projectRoot = await findProjectRoot(options?.projectDirectory)
  const { repository, plan, planArtifact, review, reviewArtifact } = await readPlanAndReview(projectRoot, input.planId)
  const projection = await client.planProjection.findUnique({
    where: { planId: input.planId },
    include: { issues: { where: { resolvedAt: null } } },
  })
  if (!projection) throw new ServiceError('Plan not found.', 'NOT_FOUND')
  if (plan.lifecycle !== 'awaiting_plan_review') {
    throw new ServiceError(
      plan.lifecycle === 'draft'
        ? 'This draft has not been submitted for plan review.'
        : 'The plan is not awaiting plan review.',
      'CONFLICT',
    )
  }
  if (input.resolveThreadId) {
    const thread = findRemarkThread(review, input.resolveThreadId)
    thread.events.push({
      id: id('event'),
      action: 'resolved',
      actor: input.actor ?? DEFAULT_REVIEWER,
      createdAt: new Date().toISOString(),
      body: 'Resolved during plan approval.',
    })
  }
  const blockingThreads = getBlockingThreads(review)
  const orphanedThreads = getOrphanedThreads(plan, review)
  const suspiciousReplacement = projection.issues.some(issue => issue.code === 'suspicious-node-replacement')
  const decision = canApprovePlan({
    displayedRevision: input.displayedRevision,
    currentRevision: plan.revision,
    expectedPlanHash: input.expectedPlanHash,
    currentPlanHash: planContentHash(plan),
    stale: projection.stale,
    conflicted: projection.conflicted,
    representationReady: true,
    blockingThreads: blockingThreads.length,
    orphanedThreads: orphanedThreads.length,
    suspiciousReplacement,
    suspiciousReplacementConfirmed: Boolean(input.confirmSuspiciousReplacement),
  })
  if (!decision.allowed) throw new ServiceError(decision.reason ?? 'Plan cannot be approved.', 'CONFLICT')
  await repository.compareAndWrite(
    'plan',
    input.planId,
    planArtifact.hash,
    serializeYamlArtifact('plan', { ...plan, lifecycle: 'plan_approved' }),
  )
  const approvedPlanHash = planContentHash(plan)
  review.planApprovals.push({
    id: id('approval'),
    revision: plan.revision,
    contentHash: approvedPlanHash,
    relevantHashes: { plan: approvedPlanHash },
    approvedBy: input.actor ?? DEFAULT_REVIEWER,
    approvedAt: new Date().toISOString(),
  })
  await writeReview(input.planId, review, reviewArtifact?.hash, { ...options, sync: false })
  await syncPlans({ projectDirectory: projectRoot, client: options?.client })
  await appendPlanEvent(
    { planId: input.planId, type: 'plan_approved', payload: { revision: plan.revision } },
    options?.client,
  )
}

export async function requestPlanChanges(
  input: {
    planId: string
    displayedRevision: number
    expectedPlanHash: string
    actor?: string
  },
  options?: ReviewMutationOptions,
): Promise<PlanReviewSummary> {
  const client = options?.client ?? prisma
  await assertPlanNotCancelled(input.planId, client)
  const projectRoot = await findProjectRoot(options?.projectDirectory)
  const { repository, plan, planArtifact, review, reviewArtifact } = await readPlanAndReview(projectRoot, input.planId)
  const projection = await client.planProjection.findUnique({
    where: { planId: input.planId },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  })
  if (!projection) throw new ServiceError('Plan not found.', 'NOT_FOUND')
  const readiness = evaluateGraphReadiness(projection.events)
  const blockingThreads = getBlockingThreads(review)
  const decision = canRequestPlanChanges({
    displayedRevision: input.displayedRevision,
    currentRevision: plan.revision,
    expectedPlanHash: input.expectedPlanHash,
    currentPlanHash: planContentHash(plan),
    stale: projection.stale,
    conflicted: projection.conflicted,
    representationReady: readiness.ready || !readiness.staleWorker,
    blockingThreads: blockingThreads.length,
    lifecycle: plan.lifecycle,
  })
  if (!decision.allowed) throw new ServiceError(decision.reason ?? 'Plan changes cannot be requested.', 'CONFLICT')

  const nextPlan = { ...plan, lifecycle: 'changes_requested' as const }
  const nextReview = {
    ...review,
    planApprovals: review.planApprovals.filter(approval => approval.revision !== plan.revision),
  }
  const writtenReview = reviewArtifact
    ? await repository.compareAndWrite(
        'review',
        input.planId,
        reviewArtifact.hash,
        serializeYamlArtifact('review', nextReview),
      )
    : await repository.create('review', input.planId, serializeYamlArtifact('review', nextReview))
  await repository.compareAndWrite('plan', input.planId, planArtifact.hash, serializeYamlArtifact('plan', nextPlan))
  await syncPlans({ projectDirectory: projectRoot, client })
  await appendPlanEvent(
    {
      planId: input.planId,
      type: 'plan_changes_requested',
      payload: {
        revision: plan.revision,
        reviewHash: writtenReview.hash,
        blockingThreadIds: blockingThreads.map(thread => thread.id),
      },
    },
    client,
  )
  return readPlanReviewSummary(input.planId, { ...options, projectDirectory: projectRoot, client })
}

export async function savePersonalPlanLayout(
  input: { planId: string; positions: LayoutArtifact['positions']; owner?: string },
  options?: ReviewMutationOptions,
): Promise<void> {
  const client = options?.client ?? prisma
  const projection = await client.planProjection.findUnique({ where: { planId: input.planId }, select: { id: true } })
  if (!projection) throw new ServiceError('Plan not found.', 'NOT_FOUND')
  const owner = input.owner ?? DEFAULT_REVIEWER
  await client.planPersonalLayout.upsert({
    where: { planProjectionId_owner: { planProjectionId: projection.id, owner } },
    create: { planProjectionId: projection.id, owner, positionsJson: JSON.stringify(input.positions) },
    update: { positionsJson: JSON.stringify(input.positions) },
  })
}

export async function publishSharedPlanLayout(
  input: { planId: string; positions: LayoutArtifact['positions']; expectedHash?: string },
  options?: ReviewMutationOptions,
): Promise<void> {
  const projectRoot = await findProjectRoot(options?.projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const layout: LayoutArtifact = { version: '1', planId: input.planId, positions: input.positions }
  const content = serializeJsonArtifact('layout', layout)
  try {
    if (input.expectedHash) await repository.compareAndWrite('layout', input.planId, input.expectedHash, content)
    else await repository.create('layout', input.planId, content)
  } catch (error) {
    if (error instanceof PlanRepositoryError && error.code === 'already-exists') {
      const current = await repository.read('layout', input.planId)
      await repository.compareAndWrite('layout', input.planId, current.hash, content)
    } else {
      throw error
    }
  }
  await syncPlans({ projectDirectory: projectRoot, client: options?.client })
}
