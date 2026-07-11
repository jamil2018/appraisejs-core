import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { deriveCoordinatorProjectIdentity } from '@/lib/coordinator-api/project-identity'
import { findProjectRoot } from '@/lib/plans/project-root'
import { ServiceError } from '@/services/shared/errors'

const COORDINATOR_LEASE_MS = 30_000
export const COORDINATOR_MAX_REQUEST_BYTES = 1_048_576
const COORDINATOR_LONG_POLL_MS = 25_000
const ACKNOWLEDGEMENT_MAX_WAITERS_PER_PLAN = 8
const ACKNOWLEDGEMENT_ADMISSION_TIMEOUT_MS = 1_000

type AcknowledgementAdmission = {
  waiters: Array<{ resolve: (release: () => void) => void; timeout: ReturnType<typeof setTimeout> }>
}

const acknowledgementAdmissions = new Map<string, AcknowledgementAdmission>()
const planEventLocks = new Map<string, Promise<void>>()
const heldPlanEventLocks = new AsyncLocalStorage<Set<string>>()

export async function withPlanEventStreamLock<T>(
  planId: string,
  operation: () => Promise<T>,
  client: PrismaClient = prisma,
): Promise<T> {
  const canonicalPlanId = await resolvePlanReference(planId, client)
  if (heldPlanEventLocks.getStore()?.has(canonicalPlanId)) return operation()
  const previous = planEventLocks.get(canonicalPlanId) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => {
    release = resolve
  })
  const queued = previous.then(() => current)
  planEventLocks.set(canonicalPlanId, queued)
  await previous
  try {
    const held = new Set(heldPlanEventLocks.getStore() ?? [])
    held.add(canonicalPlanId)
    return await heldPlanEventLocks.run(held, operation)
  } finally {
    release()
    if (planEventLocks.get(canonicalPlanId) === queued) planEventLocks.delete(canonicalPlanId)
  }
}

function releaseAcknowledgementAdmission(planProjectionId: string) {
  const admission = acknowledgementAdmissions.get(planProjectionId)
  const next = admission?.waiters.shift()
  if (next) {
    clearTimeout(next.timeout)
    next.resolve(() => releaseAcknowledgementAdmission(planProjectionId))
    return
  }
  acknowledgementAdmissions.delete(planProjectionId)
}

async function acquireAcknowledgementAdmission(planProjectionId: string) {
  const existing = acknowledgementAdmissions.get(planProjectionId)
  if (!existing) {
    acknowledgementAdmissions.set(planProjectionId, { waiters: [] })
    return () => releaseAcknowledgementAdmission(planProjectionId)
  }
  if (existing.waiters.length >= ACKNOWLEDGEMENT_MAX_WAITERS_PER_PLAN) {
    throw new ServiceError('Too many cumulative acknowledgement requests are queued for this plan.', 'CONFLICT')
  }
  return new Promise<() => void>((resolve, reject) => {
    const waiter = {
      resolve,
      timeout: setTimeout(() => {
        const index = existing.waiters.indexOf(waiter)
        if (index >= 0) existing.waiters.splice(index, 1)
        reject(new ServiceError('Timed out waiting to acknowledge plan events.', 'CONFLICT'))
      }, ACKNOWLEDGEMENT_ADMISSION_TIMEOUT_MS),
    }
    existing.waiters.push(waiter)
  })
}

const RUNTIME_DIRECTORY = '.appraisejs'
const IDENTITY_FILE = 'coordinator.json'
const PROGRESSION_EVENT_TYPES = [
  'plan_approved',
  'validations_approved',
  'validation_approved',
  'implementation_started',
  'task_updated',
  'validation_started',
  'validation_passed',
]

type CoordinatorOptions = {
  client?: PrismaClient
  now?: Date
  leaseMs?: number
}

type ProjectIdentity = {
  projectFingerprint: string
  token: string
}

export type CoordinatorEvent = {
  id: string
  planId: string
  sequence: number
  type: string
  payload: unknown
  acknowledgedAt: Date | null
  supersededAt: Date | null
  createdAt: Date
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function tokenHash(token: string): string {
  return `sha256:${hash(token)}`
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function parsePayload(payloadJson: string | null): unknown {
  if (!payloadJson) return null
  try {
    return JSON.parse(payloadJson)
  } catch {
    return payloadJson
  }
}

export async function resolvePlanReference(planReference: string, client: PrismaClient = prisma): Promise<string> {
  const direct = await client.planProjection.findUnique({
    where: { planId: planReference },
    select: { planId: true },
  })
  if (direct) return direct.planId

  const matches = await client.planProjection.findMany({
    where: {
      deletedAt: null,
      OR: [{ slug: planReference }, { legacyPlanId: planReference }],
    },
    select: { planId: true },
    take: 2,
  })
  if (matches.length === 1) return matches[0]!.planId
  if (matches.length > 1) {
    throw new ServiceError(
      `Plan reference "${planReference}" is ambiguous. Use the canonical opaque plan id.`,
      'VALIDATION',
      400,
    )
  }
  throw new ServiceError('Plan not found.', 'NOT_FOUND')
}

async function getProjection(client: PrismaClient, planReference: string) {
  const planId = await resolvePlanReference(planReference, client)
  const projection = await client.planProjection.findUnique({
    where: { planId },
    select: { id: true, planId: true, lifecycle: true },
  })
  if (!projection) throw new ServiceError('Plan not found.', 'NOT_FOUND')
  return projection
}

export async function ensureProjectIdentity(projectDirectory?: string, client: PrismaClient = prisma) {
  const projectRoot = projectDirectory ? path.resolve(projectDirectory) : await findProjectRoot()
  const runtimeDirectory = path.join(projectRoot, RUNTIME_DIRECTORY)
  const identityPath = path.join(runtimeDirectory, IDENTITY_FILE)
  const project = await deriveCoordinatorProjectIdentity(projectRoot)
  const projectFingerprint = project.projectFingerprint

  try {
    const identity = JSON.parse(await fs.readFile(identityPath, 'utf8')) as ProjectIdentity
    if (identity.projectFingerprint !== projectFingerprint) {
      throw new ServiceError('Coordinator identity belongs to a different project.', 'CONFLICT')
    }
    await client.appraiseProjectIdentity.upsert({
      where: { projectFingerprint },
      create: { projectFingerprint, tokenHash: tokenHash(identity.token) },
      update: { tokenHash: tokenHash(identity.token) },
    })
    return { ...identity, canonicalProjectPath: project.canonicalProjectPath }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const identity = { projectFingerprint, token: randomBytes(32).toString('base64url') }
  await fs.mkdir(runtimeDirectory, { recursive: true, mode: 0o700 })
  await fs.writeFile(identityPath, `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  await client.appraiseProjectIdentity.upsert({
    where: { projectFingerprint },
    create: { projectFingerprint, tokenHash: tokenHash(identity.token) },
    update: { tokenHash: tokenHash(identity.token), rotatedAt: new Date() },
  })
  return { ...identity, canonicalProjectPath: project.canonicalProjectPath }
}

export async function authenticateProject(
  projectFingerprint: string,
  token: string,
  client: PrismaClient = prisma,
): Promise<void> {
  const identity = await client.appraiseProjectIdentity.findUnique({ where: { projectFingerprint } })
  if (!identity || !secureEqual(identity.tokenHash, tokenHash(token))) {
    throw new ServiceError('Invalid project credentials.', 'UNAUTHORIZED')
  }
}

export async function registerCoordinator(
  input: { planId: string; coordinatorId: string; reconnectConnectionId?: string; takeoverApproved?: boolean },
  options: CoordinatorOptions = {},
) {
  const client = options.client ?? prisma
  const now = options.now ?? new Date()
  const leaseExpiresAt = new Date(now.getTime() + (options.leaseMs ?? COORDINATOR_LEASE_MS))
  const projection = await getProjection(client, input.planId)
  const existing = await client.planCoordinatorLease.findUnique({ where: { planProjectionId: projection.id } })

  if (existing && existing.leaseExpiresAt > now) {
    if (existing.coordinatorId === input.coordinatorId && input.reconnectConnectionId === existing.connectionId) {
      return client.planCoordinatorLease.update({
        where: { id: existing.id },
        data: { leaseExpiresAt },
      })
    }
    if (!input.takeoverApproved) {
      throw new ServiceError('This plan already has an active coordinator.', 'CONFLICT')
    }
  }

  return client.planCoordinatorLease.upsert({
    where: { planProjectionId: projection.id },
    create: {
      planProjectionId: projection.id,
      coordinatorId: input.coordinatorId,
      connectionId: randomUUID(),
      leaseExpiresAt,
      takeoverApproved: Boolean(existing && input.takeoverApproved),
    },
    update: {
      coordinatorId: input.coordinatorId,
      connectionId: randomUUID(),
      leaseExpiresAt,
      takeoverApproved: Boolean(existing && input.takeoverApproved),
    },
  })
}

export async function heartbeatCoordinator(
  input: { planId: string; coordinatorId: string; connectionId: string },
  options: CoordinatorOptions = {},
) {
  const client = options.client ?? prisma
  const now = options.now ?? new Date()
  const projection = await getProjection(client, input.planId)
  const lease = await client.planCoordinatorLease.findUnique({ where: { planProjectionId: projection.id } })
  if (
    !lease ||
    lease.coordinatorId !== input.coordinatorId ||
    lease.connectionId !== input.connectionId ||
    lease.leaseExpiresAt <= now
  ) {
    throw new ServiceError('Coordinator lease is missing or expired.', 'CONFLICT')
  }
  return client.planCoordinatorLease.update({
    where: { id: lease.id },
    data: { leaseExpiresAt: new Date(now.getTime() + (options.leaseMs ?? COORDINATOR_LEASE_MS)) },
  })
}

export async function appendPlanEvent(
  input: { planId: string; type: string; payload?: unknown },
  client: PrismaClient = prisma,
) {
  return withPlanEventStreamLock(
    input.planId,
    () =>
      client.$transaction(async transaction => {
        const projection = await getProjection(transaction as PrismaClient, input.planId)
        const lastEvent = await transaction.planEvent.findFirst({
          where: { planProjectionId: projection.id },
          orderBy: { sequence: 'desc' },
          select: { sequence: true },
        })
        if (input.type === 'plan_review_ready' && projection.lifecycle !== 'awaiting_plan_review') return undefined
        if (input.type === 'plan_cancelled') {
          await transaction.planEvent.updateMany({
            where: {
              planProjectionId: projection.id,
              type: { in: PROGRESSION_EVENT_TYPES },
              acknowledgedAt: null,
              supersededAt: null,
            },
            data: { supersededAt: new Date() },
          })
          await transaction.planProjection.update({
            where: { id: projection.id },
            data: { lifecycle: 'cancelled' },
          })
        }
        return transaction.planEvent.create({
          data: {
            planProjectionId: projection.id,
            sequence: (lastEvent?.sequence ?? 0) + 1,
            type: input.type,
            payloadJson: input.payload === undefined ? null : JSON.stringify(input.payload),
          },
        })
      }),
    client,
  )
}

export async function ensurePlanReviewReadyEvent(planId: string, client: PrismaClient = prisma) {
  const canonicalPlanId = await resolvePlanReference(planId, client)
  const projection = await client.planProjection.findUnique({
    where: { planId: canonicalPlanId },
    select: { id: true, lifecycle: true },
  })
  if (!projection) throw new ServiceError('Plan not found.', 'NOT_FOUND')
  if (projection.lifecycle !== 'awaiting_plan_review') return undefined
  const existing = await client.planEvent.findFirst({
    where: {
      planProjectionId: projection.id,
      type: 'plan_review_ready',
      supersededAt: null,
    },
    orderBy: { sequence: 'desc' },
  })
  if (existing) return existing
  return appendPlanEvent(
    { planId: canonicalPlanId, type: 'plan_review_ready', payload: { representation: 'graph-and-list' } },
    client,
  )
}

export async function readPlanEvents(
  input: { planId: string; afterSequence?: number; limit?: number },
  client: PrismaClient = prisma,
): Promise<CoordinatorEvent[]> {
  const projection = await getProjection(client, input.planId)
  const events = await client.planEvent.findMany({
    where: {
      planProjectionId: projection.id,
      sequence: { gt: input.afterSequence ?? 0 },
      acknowledgedAt: null,
      supersededAt: null,
    },
    orderBy: { sequence: 'asc' },
    take: Math.min(input.limit ?? 100, 100),
  })
  return events.map(event => ({
    id: event.id,
    planId: projection.planId,
    sequence: event.sequence,
    type: event.type,
    payload: parsePayload(event.payloadJson),
    acknowledgedAt: event.acknowledgedAt,
    supersededAt: event.supersededAt,
    createdAt: event.createdAt,
  }))
}

export async function readLatestPlanEventSequence(planId: string, client: PrismaClient = prisma): Promise<number> {
  const projection = await getProjection(client, planId)
  const event = await client.planEvent.findFirst({
    where: { planProjectionId: projection.id },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  })
  return event?.sequence ?? 0
}

export async function assertPlanNotCancelled(planId: string, client: PrismaClient = prisma): Promise<void> {
  const canonicalPlanId = await resolvePlanReference(planId, client)
  const projection = await client.planProjection.findUnique({
    where: { planId: canonicalPlanId },
    select: {
      id: true,
      lifecycle: true,
      events: {
        where: { type: 'plan_cancelled', supersededAt: null },
        select: { id: true },
        take: 1,
      },
    },
  })
  if (!projection) throw new ServiceError('Plan not found.', 'NOT_FOUND')
  if (projection.lifecycle === 'cancelled' || projection.events.length > 0) {
    throw new ServiceError('The plan has been cancelled and cannot progress.', 'CONFLICT')
  }
}

export async function waitForPlanEvents(
  input: {
    planId: string
    afterSequence?: number
    signal?: AbortSignal
    timeoutMs?: number
    pollIntervalMs?: number
  },
  client: PrismaClient = prisma,
): Promise<CoordinatorEvent[]> {
  const deadline = Date.now() + (input.timeoutMs ?? COORDINATOR_LONG_POLL_MS)
  while (!input.signal?.aborted && Date.now() < deadline) {
    const events = await readPlanEvents(input, client)
    if (events.length) return events
    await new Promise(resolve => setTimeout(resolve, input.pollIntervalMs ?? 100))
  }
  return []
}

export async function acknowledgePlanEvent(
  input: { planId: string; sequence: number; coordinatorId: string },
  client: PrismaClient = prisma,
) {
  const projection = await getProjection(client, input.planId)
  const event = await client.planEvent.findUnique({
    where: {
      planProjectionId_sequence: { planProjectionId: projection.id, sequence: input.sequence },
    },
  })
  if (!event) throw new ServiceError('Plan event not found.', 'NOT_FOUND')
  if (event.acknowledgedAt) return event
  return client.planEvent.update({
    where: { id: event.id },
    data: { acknowledgedAt: new Date(), acknowledgedBy: input.coordinatorId },
  })
}

export async function acknowledgePlanEventsThrough(
  input: { planId: string; sequence: number; coordinatorId: string },
  client: PrismaClient = prisma,
) {
  const projection = await getProjection(client, input.planId)
  const release = await acquireAcknowledgementAdmission(projection.id)
  try {
    const highestEvent = await client.planEvent.findFirst({
      where: { planProjectionId: projection.id },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    })
    if (!highestEvent || input.sequence > highestEvent.sequence) {
      throw new ServiceError('Plan event sequence is beyond the current event stream.', 'VALIDATION', 400)
    }
    const acknowledgedAt = new Date()
    const result = await client.planEvent.updateMany({
      where: { planProjectionId: projection.id, sequence: { lte: input.sequence }, acknowledgedAt: null },
      data: { acknowledgedAt, acknowledgedBy: input.coordinatorId },
    })
    return { acknowledgedThroughSequence: input.sequence, acknowledgedCount: result.count, acknowledgedAt }
  } finally {
    release()
  }
}
