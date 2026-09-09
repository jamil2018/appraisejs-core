import { createHash, randomBytes } from 'node:crypto'

import type { CollaborationAuthorityAction, Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalJson, collaborationHash } from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'

type Transaction = Prisma.TransactionClient
export type AuthorityReceiptAction = CollaborationAuthorityAction
export type AuthorityProvenance = 'local-ui'

const MAX_RECEIPT_LIFETIME_MS = 5 * 60 * 1000

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function authorityRequestDigest(request: unknown) {
  return collaborationHash(canonicalJson(request))
}

export async function issueCollaborationAuthorityReceipt(
  input: {
    bindingId: string
    action: AuthorityReceiptAction
    operationId?: string
    expectedPolicyVersion: number
    request: unknown
    trustedPrincipalId: string
    provenance: AuthorityProvenance
    expiresInMs?: number
  },
  client: PrismaClient = prisma,
) {
  const lifetime = Math.min(Math.max(input.expiresInMs ?? MAX_RECEIPT_LIFETIME_MS, 1), MAX_RECEIPT_LIFETIME_MS)
  const expiresAt = new Date(Date.now() + lifetime)
  const token = randomBytes(32).toString('base64url')
  const requestDigest = authorityRequestDigest(input.request)
  await client.$transaction(async transaction => {
    const binding = await transaction.collaborationBinding.findUnique({ where: { id: input.bindingId } })
    if (!binding) throw new ServiceError('Collaboration binding was not found.', 'NOT_FOUND', 404)
    if (binding.policyVersion !== input.expectedPolicyVersion)
      throw new ServiceError('Collaboration policy changed before authority receipt issuance.', 'CONFLICT', 409)
    await transaction.collaborationAuthorityReceipt.updateMany({
      where: {
        bindingId: input.bindingId,
        action: input.action,
        operationId: input.operationId ?? null,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: new Date() },
    })
    await transaction.collaborationAuthorityReceipt.create({
      data: {
        bindingId: input.bindingId,
        action: input.action,
        operationId: input.operationId,
        policyVersion: input.expectedPolicyVersion,
        requestDigest,
        tokenHash: tokenHash(token),
        trustedPrincipalId: input.trustedPrincipalId,
        provenance: input.provenance,
        expiresAt,
      },
    })
  })
  return { token, expiresAt, requestDigest }
}

/** Validates, runs, records the sanitized result, and consumes one receipt in one database transaction. */
export async function consumeCollaborationAuthorityReceipt<Result>(
  input: {
    token: string | null
    bindingId: string
    action: AuthorityReceiptAction
    operationId?: string
    request: unknown
  },
  mutate: (
    transaction: Transaction,
    authority: { trustedPrincipalId: string; provenance: AuthorityProvenance },
  ) => Promise<Result>,
  client: PrismaClient = prisma,
): Promise<Result> {
  if (!input.token) throw new ServiceError('A one-action authority receipt is required.', 'UNAUTHORIZED', 403)
  const suppliedToken = input.token
  const digest = authorityRequestDigest(input.request)
  return client.$transaction(async transaction => {
    const receipt = await transaction.collaborationAuthorityReceipt.findUnique({
      where: { tokenHash: tokenHash(suppliedToken) },
    })
    if (
      !receipt ||
      receipt.bindingId !== input.bindingId ||
      receipt.action !== input.action ||
      receipt.operationId !== (input.operationId ?? null) ||
      receipt.requestDigest !== digest
    )
      throw new ServiceError('Authority receipt is invalid for this exact request.', 'UNAUTHORIZED', 403)
    if (receipt.consumedAt) {
      if (!receipt.resultJson) throw new ServiceError('Authority receipt result is unavailable.', 'CONFLICT', 409)
      return JSON.parse(receipt.resultJson) as Result
    }
    if (receipt.invalidatedAt || receipt.expiresAt <= new Date())
      throw new ServiceError('Authority receipt is expired or replaced.', 'UNAUTHORIZED', 403)
    const binding = await transaction.collaborationBinding.findUnique({ where: { id: input.bindingId } })
    if (!binding || binding.policyVersion !== receipt.policyVersion)
      throw new ServiceError('Authority receipt no longer matches the current policy.', 'CONFLICT', 409)
    const result = await mutate(transaction, { trustedPrincipalId: receipt.trustedPrincipalId, provenance: 'local-ui' })
    const consumed = await transaction.collaborationAuthorityReceipt.updateMany({
      where: { id: receipt.id, consumedAt: null, invalidatedAt: null },
      data: { consumedAt: new Date(), resultJson: canonicalJson(result) },
    })
    if (consumed.count !== 1) throw new ServiceError('Authority receipt was already consumed.', 'CONFLICT', 409)
    return result
  })
}
