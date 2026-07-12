import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { findProjectRoot } from '@/lib/plans/project-root'
import { ServiceError } from '@/services/shared/errors'

import { appendPlanEvent, readLatestPlanEventSequence, resolvePlanReference } from './coordinator-service'

const MAX_PLANS_PER_OBJECTIVE = 24
const MAX_TASKS_PER_PLAN = 12
const MAX_NARRATIVE_BYTES = 8_192
const MAX_CONTINUATION_BYTES = 32_768
const SMALL_FIXTURE_RESPONSE_BYTES = 8_192
const END_TO_END_HARD_CEILING_MS = 45 * 60_000
const PHASE_HARD_CEILINGS_MS: Record<string, number> = {
  planning: 5 * 60_000,
  catalog: 5 * 60_000,
  validation: 5 * 60_000,
  baseline: 5 * 60_000,
  implementation: 30 * 60_000,
  implementation_validation: 10 * 60_000,
  completion: 3 * 60_000,
}

const digest = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`

export type ObjectivePlanInput = {
  planId: string
  milestoneId: string
  dependsOn?: string[]
  impactedPaths?: string[]
}

export type ObjectiveInput = {
  objectiveId?: string
  title: string
  milestones: Array<{ id: string; title: string }>
  plans: ObjectivePlanInput[]
}

function assertPortableId(value: string, label: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new ServiceError(`${label} must be a portable lowercase identifier.`, 'VALIDATION', 400)
  }
}

function validateObjectiveMetadata(input: ObjectiveInput) {
  if (!input.title.trim() || Buffer.byteLength(input.title) > 160)
    throw new ServiceError('Objective title must be 1-160 bytes.', 'VALIDATION', 400)
  if (input.plans.length === 0 || input.plans.length > MAX_PLANS_PER_OBJECTIVE)
    throw new ServiceError(`An objective must contain 1-${MAX_PLANS_PER_OBJECTIVE} plans.`, 'VALIDATION', 400)
  const objectiveId = input.objectiveId ?? `obj-${randomUUID()}`
  assertPortableId(objectiveId, 'Objective id')
  const milestoneIds = new Set<string>()
  for (const milestone of input.milestones) {
    assertPortableId(milestone.id, 'Milestone id')
    if (milestoneIds.has(milestone.id)) throw new ServiceError('Milestone ids must be unique.', 'VALIDATION', 400)
    milestoneIds.add(milestone.id)
  }
  return { objectiveId, milestoneIds }
}

async function resolveObjectivePlans(input: ObjectiveInput, milestoneIds: Set<string>, client: PrismaClient) {
  const planIds = new Set<string>()
  const plans = []
  for (const item of input.plans) {
    if (!milestoneIds.has(item.milestoneId))
      throw new ServiceError(`Plan ${item.planId} references an unknown milestone.`, 'VALIDATION', 400)
    const planId = await resolvePlanReference(item.planId, client)
    if (planIds.has(planId)) throw new ServiceError('Objective plan ids must be unique.', 'VALIDATION', 400)
    planIds.add(planId)
    const projection = await client.planProjection.findUniqueOrThrow({
      where: { planId },
      select: { lifecycle: true, tasks: { select: { taskId: true } } },
    })
    if (projection.tasks.length > MAX_TASKS_PER_PLAN)
      throw new ServiceError(
        `Plan ${planId} has ${projection.tasks.length} tasks; split it below ${MAX_TASKS_PER_PLAN + 1}.`,
        'VALIDATION',
        400,
      )
    plans.push({
      ...item,
      planId,
      lifecycle: projection.lifecycle,
      independentlyComplete: projection.lifecycle === 'completed',
    })
  }
  return { planIds, plans }
}

async function normalizeObjectiveDependencies(
  plans: Awaited<ReturnType<typeof resolveObjectivePlans>>['plans'],
  planIds: Set<string>,
  client: PrismaClient,
) {
  for (const item of plans) {
    const dependencies = await Promise.all((item.dependsOn ?? []).map(value => resolvePlanReference(value, client)))
    for (const dependency of dependencies) {
      if (!planIds.has(dependency) || dependency === item.planId)
        throw new ServiceError('Plan dependencies must reference another plan in the objective.', 'VALIDATION', 400)
    }
    item.dependsOn = dependencies
  }
}

async function boundedObjective(input: ObjectiveInput, client: PrismaClient) {
  const { objectiveId, milestoneIds } = validateObjectiveMetadata(input)
  const { planIds, plans } = await resolveObjectivePlans(input, milestoneIds, client)
  await normalizeObjectiveDependencies(plans, planIds, client)
  return { schemaVersion: '1', objectiveId, title: input.title.trim(), milestones: input.milestones, plans }
}

async function writeContentAddressed(projectRoot: string, kind: string, value: unknown) {
  const contentHash = digest(value)
  const directory = path.join(projectRoot, '.appraise', 'coordination', kind)
  const filePath = path.join(directory, `${contentHash.slice(7)}.json`)
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 }).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  })
  return { contentHash, reference: path.relative(projectRoot, filePath) }
}

export async function createObjective(
  input: ObjectiveInput,
  options: { client?: PrismaClient; projectDirectory?: string } = {},
) {
  const client = options.client ?? prisma
  const objective = await boundedObjective(input, client)
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const stored = await writeContentAddressed(projectRoot, 'objectives', objective)
  await Promise.all(
    objective.plans.map(plan =>
      appendPlanEvent(
        { planId: plan.planId, type: 'objective_attached', payload: { objectiveId: objective.objectiveId, ...stored } },
        client,
      ),
    ),
  )
  return { ...objective, ...stored }
}

export async function createLifecycleSnapshot(
  planReference: string,
  options: { client?: PrismaClient; projectDirectory?: string; archiveThroughSequence?: number } = {},
) {
  const client = options.client ?? prisma
  const planId = await resolvePlanReference(planReference, client)
  const latestSequence = await readLatestPlanEventSequence(planId, client)
  const archiveThroughSequence = Math.min(options.archiveThroughSequence ?? latestSequence, latestSequence)
  const projection = await client.planProjection.findUniqueOrThrow({
    where: { planId },
    select: { revision: true, lifecycle: true, sourceHash: true, tasks: { orderBy: { position: 'asc' } } },
  })
  const events = await client.planEvent.findMany({
    where: { plan: { planId }, sequence: { lte: archiveThroughSequence } },
    orderBy: { sequence: 'asc' },
  })
  const snapshot = {
    schemaVersion: '1',
    planId,
    revision: projection.revision,
    lifecycle: projection.lifecycle,
    sourceHash: projection.sourceHash,
    throughSequence: archiveThroughSequence,
    tasks: projection.tasks.map(task => ({ taskId: task.taskId, title: task.title })),
    eventDigest: digest(events.map(event => [event.sequence, event.type, event.payloadJson])),
  }
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const archive = await writeContentAddressed(
    projectRoot,
    'event-archives',
    events.map(event => ({
      sequence: event.sequence,
      type: event.type,
      payload: event.payloadJson,
      acknowledgedAt: event.acknowledgedAt,
      acknowledgedBy: event.acknowledgedBy,
      createdAt: event.createdAt,
    })),
  )
  const stored = await writeContentAddressed(projectRoot, 'snapshots', { ...snapshot, archive })
  const event = await appendPlanEvent(
    { planId, type: 'lifecycle_snapshot', payload: { ...stored, ...snapshot, archive } },
    client,
  )
  await client.planEvent.updateMany({
    where: {
      plan: { planId },
      sequence: { lte: archiveThroughSequence },
      acknowledgedAt: { not: null },
      supersededAt: null,
    },
    data: { supersededAt: new Date() },
  })
  return { ...snapshot, ...stored, archive, eventSequence: event?.sequence }
}

export async function createContinuationPackage(
  input: { planId: string; narrative: string; references?: string[]; objectiveReference?: string },
  options: { client?: PrismaClient; projectDirectory?: string } = {},
) {
  const client = options.client ?? prisma
  const planId = await resolvePlanReference(input.planId, client)
  if (Buffer.byteLength(input.narrative) > MAX_NARRATIVE_BYTES)
    throw new ServiceError(`Continuation narrative exceeds ${MAX_NARRATIVE_BYTES} bytes.`, 'VALIDATION', 400)
  const snapshot = await createLifecycleSnapshot(planId, options)
  const continuation = {
    schemaVersion: '1',
    planId,
    snapshot: {
      contentHash: snapshot.contentHash,
      reference: snapshot.reference,
      throughSequence: snapshot.throughSequence,
    },
    objectiveReference: input.objectiveReference,
    narrative: input.narrative,
    references: [...new Set(input.references ?? [])].sort(),
    provenance: { authoredBy: 'agent', authoritativeStateBy: 'appraise', createdAt: new Date().toISOString() },
  }
  if (Buffer.byteLength(JSON.stringify(continuation)) > MAX_CONTINUATION_BYTES)
    throw new ServiceError(`Continuation package exceeds ${MAX_CONTINUATION_BYTES} bytes.`, 'VALIDATION', 400)
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const stored = await writeContentAddressed(projectRoot, 'handoffs', continuation)
  await appendPlanEvent({ planId, type: 'continuation_package_created', payload: stored }, client)
  return { ...continuation, ...stored }
}

export function evaluateCoordinationSlo(input: {
  phases: Array<{ phase: string; activeAppraiseMs: number; activeAgentMs: number; humanReviewMs: number }>
  responseBytes: number[]
  operations: number
  retries: number
  approvals: number
}) {
  const responseBytes = input.responseBytes.reduce((total, value) => total + value, 0)
  const maxResponseBytes = Math.max(0, ...input.responseBytes)
  const activeMs = input.phases.reduce((total, phase) => total + phase.activeAppraiseMs + phase.activeAgentMs, 0)
  const humanReviewMs = input.phases.reduce((total, phase) => total + phase.humanReviewMs, 0)
  const blockers = [
    ...(maxResponseBytes > SMALL_FIXTURE_RESPONSE_BYTES ? ['lifecycle-summary-over-8kb'] : []),
    ...(input.retries > input.phases.length ? ['more-than-one-retry-per-phase'] : []),
    ...(input.approvals > 2 ? ['repeated-approval-cycle'] : []),
    ...(activeMs > END_TO_END_HARD_CEILING_MS ? ['end-to-end-active-time-over-45m'] : []),
    ...input.phases.flatMap(phase => {
      const ceiling = PHASE_HARD_CEILINGS_MS[phase.phase]
      return ceiling !== undefined && phase.activeAppraiseMs + phase.activeAgentMs > ceiling
        ? [`${phase.phase}-active-time-over-budget`]
        : []
    }),
  ]
  return {
    passed: blockers.length === 0,
    blockers,
    activeMs,
    humanReviewMs,
    responseBytes,
    maxResponseBytes,
    operations: input.operations,
    retries: input.retries,
    approvals: input.approvals,
  }
}

export function selectImpactedPlans(
  plans: Array<{ planId: string; dependsOn?: string[]; impactedPaths?: string[] }>,
  changedPaths: string[],
) {
  const selected = new Set(
    plans
      .filter(plan =>
        (plan.impactedPaths ?? []).some(scope =>
          changedPaths.some(changed => changed === scope || changed.startsWith(`${scope.replace(/\/$/, '')}/`)),
        ),
      )
      .map(plan => plan.planId),
  )
  let changed = true
  while (changed) {
    changed = false
    for (const plan of plans) {
      if (selected.has(plan.planId) || !(plan.dependsOn ?? []).some(dependency => selected.has(dependency))) continue
      selected.add(plan.planId)
      changed = true
    }
  }
  return plans.filter(plan => selected.has(plan.planId)).map(plan => plan.planId)
}
