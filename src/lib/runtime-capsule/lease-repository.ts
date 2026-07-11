import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { runtimeCapsuleHashSchema, runtimeCapsuleSegmentSchema } from './contracts'

const MIN_LEASE_MS = 10_000
const MAX_LEASE_MS = 10 * 60_000

function leaseDuration(value = 30_000): number {
  if (!Number.isInteger(value) || value < MIN_LEASE_MS || value > MAX_LEASE_MS)
    throw new Error(`Runtime capsule lease duration must be ${MIN_LEASE_MS}-${MAX_LEASE_MS} ms.`)
  return value
}

export class RuntimeCapsuleLeaseRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async acquire(input: {
    projectId: string
    validationHash: string
    runId: string
    durationMs?: number
    ownerToken?: string
  }) {
    const projectId = runtimeCapsuleSegmentSchema.parse(input.projectId)
    const validationHash = runtimeCapsuleHashSchema.parse(input.validationHash)
    const runId = runtimeCapsuleSegmentSchema.parse(input.runId)
    const durationMs = leaseDuration(input.durationMs)
    const ownerToken = input.ownerToken ?? randomUUID()
    const now = this.now()
    const leaseExpiresAt = new Date(now.getTime() + durationMs)
    const where = { targetProjectId_validationHash_runId: { targetProjectId: projectId, validationHash, runId } }

    if (!(await this.prisma.targetProject.findUnique({ where: { id: projectId }, select: { id: true } })))
      throw new Error('Runtime capsule lease target project does not exist.')
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const acquired = await this.acquireOnce({
        where,
        projectId,
        validationHash,
        runId,
        ownerToken,
        leaseExpiresAt,
        now,
        durationMs,
      })
      if (acquired) return acquired
    }
    throw new Error('Runtime capsule lease acquisition conflicted repeatedly.')
  }

  private async acquireOnce(input: {
    where: { targetProjectId_validationHash_runId: { targetProjectId: string; validationHash: string; runId: string } }
    projectId: string
    validationHash: string
    runId: string
    ownerToken: string
    leaseExpiresAt: Date
    now: Date
    durationMs: number
  }) {
    const current = await this.prisma.runtimeCapsuleLease.findUnique({ where: input.where })
    if (!current) {
      try {
        return await this.prisma.runtimeCapsuleLease.create({
          data: {
            targetProjectId: input.projectId,
            validationHash: input.validationHash,
            runId: input.runId,
            ownerToken: input.ownerToken,
            leaseExpiresAt: input.leaseExpiresAt,
          },
        })
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error
        return null
      }
    }
    if (current.ownerToken === input.ownerToken && current.leaseExpiresAt > input.now)
      return this.renew({ ...input, durationMs: input.durationMs })
    if (current.leaseExpiresAt > input.now) throw new Error('Runtime capsule materialization lease is already active.')
    const claimed = await this.prisma.runtimeCapsuleLease.updateMany({
      where: { id: current.id, version: current.version, leaseExpiresAt: { lte: input.now } },
      data: { ownerToken: input.ownerToken, leaseExpiresAt: input.leaseExpiresAt, version: { increment: 1 } },
    })
    return claimed.count === 1 ? this.prisma.runtimeCapsuleLease.findUniqueOrThrow({ where: input.where }) : null
  }

  async renew(input: {
    projectId: string
    validationHash: string
    runId: string
    ownerToken: string
    durationMs?: number
  }) {
    const durationMs = leaseDuration(input.durationMs)
    const now = this.now()
    const result = await this.prisma.runtimeCapsuleLease.updateMany({
      where: {
        targetProjectId: runtimeCapsuleSegmentSchema.parse(input.projectId),
        validationHash: runtimeCapsuleHashSchema.parse(input.validationHash),
        runId: runtimeCapsuleSegmentSchema.parse(input.runId),
        ownerToken: runtimeCapsuleSegmentSchema.parse(input.ownerToken),
        leaseExpiresAt: { gt: now },
      },
      data: { leaseExpiresAt: new Date(now.getTime() + durationMs), version: { increment: 1 } },
    })
    if (result.count !== 1) throw new Error('Runtime capsule lease is expired or owned by another materializer.')
    return this.prisma.runtimeCapsuleLease.findUniqueOrThrow({
      where: {
        targetProjectId_validationHash_runId: {
          targetProjectId: input.projectId,
          validationHash: input.validationHash,
          runId: input.runId,
        },
      },
    })
  }

  async release(input: { projectId: string; validationHash: string; runId: string; ownerToken: string }) {
    const result = await this.prisma.runtimeCapsuleLease.deleteMany({
      where: {
        targetProjectId: runtimeCapsuleSegmentSchema.parse(input.projectId),
        validationHash: runtimeCapsuleHashSchema.parse(input.validationHash),
        runId: runtimeCapsuleSegmentSchema.parse(input.runId),
        ownerToken: runtimeCapsuleSegmentSchema.parse(input.ownerToken),
      },
    })
    return result.count === 1
  }
}
