import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'

import prisma from '@/config/db-config'
import { canonicalize } from '@/lib/plan-contract'
import { ServiceError } from '@/services/shared/errors'

export const DELEGATED_COORDINATOR_PERMISSIONS = [
  'target_project_register',
  'plan_create',
  'validation_prepare',
  'baseline_execute',
  'implementation_execute',
] as const

const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const permissionSchema = z.enum(DELEGATED_COORDINATOR_PERMISSIONS)
export const delegatedCoordinatorClaimsSchema = z
  .object({
    version: z.literal(1),
    receiptId: z.string().uuid(),
    parentCoordinatorId: z.string().min(1),
    delegatedCoordinatorId: z.string().min(1),
    targetProjectId: z.string().min(1).optional(),
    targetFingerprint: hashSchema,
    pathFingerprint: hashSchema,
    purpose: z.string().min(1),
    permissions: z.array(permissionSchema).min(1),
    prohibitions: z.array(z.string().min(1)),
    briefOrPlanHash: hashSchema.optional(),
    issuedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    nonce: z.string().min(32),
  })
  .strict()

const delegatedCoordinatorReceiptSchema = z
  .object({
    claims: delegatedCoordinatorClaimsSchema,
    signature: z.string().regex(/^hmac-sha256:[a-f0-9]{64}$/),
  })
  .strict()

export type DelegatedCoordinatorPermission = z.infer<typeof permissionSchema>
type DelegatedCoordinatorReceipt = z.infer<typeof delegatedCoordinatorReceiptSchema>

function configuredSecret(secret?: string): string {
  const value = secret ?? process.env.APPRAISE_DELEGATED_AUTHORIZATION_SECRET
  if (!value) throw new ServiceError('Delegated authorization is not configured.', 'CONFLICT')
  return value
}

function sign(claims: z.infer<typeof claimsSchema>, secret: string): string {
  return `hmac-sha256:${createHmac('sha256', secret)
    .update(JSON.stringify(canonicalize(claims)))
    .digest('hex')}`
}

function assertSignature(receipt: DelegatedCoordinatorReceipt, secret: string) {
  const expected = Buffer.from(sign(receipt.claims, secret))
  const actual = Buffer.from(receipt.signature)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new ServiceError('Delegation receipt signature is invalid.', 'UNAUTHORIZED', 401)
  }
}

export async function createDelegatedCoordinatorReceipt(
  input: {
    parentCoordinatorId: string
    delegatedCoordinatorId: string
    targetProjectId?: string
    targetFingerprint: string
    pathFingerprint: string
    purpose: string
    permissions: DelegatedCoordinatorPermission[]
    prohibitions?: string[]
    briefOrPlanHash?: string
    expiresAt: string
    now?: Date
    secret?: string
  },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  if (Date.parse(input.expiresAt) <= now.getTime()) {
    throw new ServiceError('Delegation expiry must be in the future.', 'VALIDATION')
  }
  const claims = claimsSchema.parse({
    version: 1,
    receiptId: randomUUID(),
    parentCoordinatorId: input.parentCoordinatorId,
    delegatedCoordinatorId: input.delegatedCoordinatorId,
    targetProjectId: input.targetProjectId,
    targetFingerprint: input.targetFingerprint,
    pathFingerprint: input.pathFingerprint,
    purpose: input.purpose,
    permissions: [...new Set(input.permissions)],
    prohibitions: input.prohibitions ?? [],
    briefOrPlanHash: input.briefOrPlanHash,
    issuedAt: now.toISOString(),
    expiresAt: input.expiresAt,
    nonce: randomBytes(24).toString('hex'),
  })
  const receipt = delegatedCoordinatorReceiptSchema.parse({
    claims,
    signature: sign(claims, configuredSecret(input.secret)),
  })
  await client.delegatedCoordinatorReceipt.create({
    data: {
      id: claims.receiptId,
      parentCoordinatorId: claims.parentCoordinatorId,
      delegatedCoordinatorId: claims.delegatedCoordinatorId,
      targetProjectId: claims.targetProjectId,
      targetFingerprint: claims.targetFingerprint,
      pathFingerprint: claims.pathFingerprint,
      purpose: claims.purpose,
      permissionsJson: JSON.stringify(claims.permissions),
      prohibitionsJson: JSON.stringify(claims.prohibitions),
      briefOrPlanHash: claims.briefOrPlanHash,
      nonce: claims.nonce,
      receiptJson: JSON.stringify(receipt),
      issuedAt: now,
      expiresAt: new Date(claims.expiresAt),
    },
  })
  return receipt
}

export async function readDelegatedCoordinatorReceipt(id: string, client: PrismaClient = prisma) {
  const receipt = await client.delegatedCoordinatorReceipt.findUnique({
    where: { id },
    include: { consumptions: { orderBy: { consumedAt: 'asc' } } },
  })
  if (!receipt) throw new ServiceError('Delegation receipt not found.', 'NOT_FOUND')
  return {
    ...receipt,
    permissions: JSON.parse(receipt.permissionsJson) as DelegatedCoordinatorPermission[],
    prohibitions: JSON.parse(receipt.prohibitionsJson) as string[],
  }
}

export async function revokeDelegatedCoordinatorReceipt(
  input: { id: string; revokedBy: string; reason?: string; now?: Date },
  client: PrismaClient = prisma,
) {
  const existing = await readDelegatedCoordinatorReceipt(input.id, client)
  if (existing.revokedAt) return existing
  await client.delegatedCoordinatorReceipt.update({
    where: { id: input.id },
    data: {
      revokedAt: input.now ?? new Date(),
      revokedBy: input.revokedBy,
      revocationReason: input.reason,
    },
  })
  return readDelegatedCoordinatorReceipt(input.id, client)
}

export async function verifyDelegatedCoordinatorReceipt(
  input: {
    receipt: unknown
    delegatedCoordinatorId: string
    targetFingerprint: string
    pathFingerprint: string
    permission: DelegatedCoordinatorPermission
    operationKey: string
    briefOrPlanHash?: string
    now?: Date
    secret?: string
  },
  client: PrismaClient = prisma,
) {
  const receipt = delegatedCoordinatorReceiptSchema.parse(input.receipt)
  assertSignature(receipt, configuredSecret(input.secret))
  const stored = await readDelegatedCoordinatorReceipt(receipt.claims.receiptId, client)
  const now = input.now ?? new Date()
  if (stored.receiptJson !== JSON.stringify(receipt))
    throw new ServiceError('Delegation receipt was altered.', 'CONFLICT')
  if (stored.revokedAt) throw new ServiceError('Delegation receipt is revoked.', 'CONFLICT')
  if (stored.expiresAt.getTime() <= now.getTime()) throw new ServiceError('Delegation receipt is expired.', 'CONFLICT')
  if (receipt.claims.delegatedCoordinatorId !== input.delegatedCoordinatorId)
    throw new ServiceError('Delegation recipient does not match.', 'UNAUTHORIZED', 401)
  if (receipt.claims.targetFingerprint !== input.targetFingerprint)
    throw new ServiceError('Delegation target does not match.', 'CONFLICT')
  if (receipt.claims.pathFingerprint !== input.pathFingerprint)
    throw new ServiceError('Delegation path does not match.', 'CONFLICT')
  if (receipt.claims.briefOrPlanHash && receipt.claims.briefOrPlanHash !== input.briefOrPlanHash)
    throw new ServiceError('Delegation plan binding does not match.', 'CONFLICT')
  if (!receipt.claims.permissions.includes(input.permission))
    throw new ServiceError(`Delegation does not permit ${input.permission}.`, 'UNAUTHORIZED', 403)
  try {
    await client.delegatedCoordinatorConsumption.create({
      data: { receiptId: stored.id, permission: input.permission, operationKey: input.operationKey, consumedAt: now },
    })
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
      throw new ServiceError('Delegation operation was already consumed.', 'CONFLICT')
    }
    throw error
  }
  return receipt.claims
}
