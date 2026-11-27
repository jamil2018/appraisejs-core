import type { Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  conversationCollaborationReviewSchema,
  sameConversationCollaborationReview,
  type ConversationCollaborationReview,
  type ConversationCollaborationDecision,
} from '@/lib/conversation/collaboration-review'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'
import {
  collaborationPublicDigest,
  decideCollaborationOperationInTransaction,
  prepareCollaborationOperation,
} from '@/services/repository-collaboration/operation-service'
import { decideDivergentCollaborationProposal } from '@/services/repository-collaboration/divergent-reconciliation-service'

type Transaction = Prisma.TransactionClient

function parseReviewItems(preparedJson: string | null) {
  try {
    const value = JSON.parse(preparedJson ?? '') as unknown
    if (!value || typeof value !== 'object' || !('prepared' in value) || !Array.isArray(value.prepared)) return null
    const items: Array<{ recordKey: string; disposition: string }> = []
    for (const entry of value.prepared) {
      if (!entry || typeof entry !== 'object') return null
      if (entry.requiresDecision !== true) continue
      if (typeof entry.recordKey !== 'string' || !entry.recordKey || typeof entry.disposition !== 'string') return null
      items.push({ recordKey: entry.recordKey, disposition: entry.disposition })
    }
    if (new Set(items.map(item => item.recordKey)).size !== items.length) return null
    return items
  } catch {
    return null
  }
}

function parseDivergentDigest(payloadJson: string | null) {
  try {
    const parsed = JSON.parse(payloadJson ?? '') as unknown
    if (!parsed || typeof parsed !== 'object' || !('review' in parsed)) return null
    const review = parsed.review
    if (!review || typeof review !== 'object' || !('reviewDigest' in review)) return null
    return typeof review.reviewDigest === 'string' && /^[a-f0-9]{64}$/.test(review.reviewDigest)
      ? `sha256:${review.reviewDigest}`
      : null
  } catch {
    return null
  }
}

/** A displayable review is derived from one durable, project-scoped operation. */
export async function readConversationCollaborationReview(
  targetProjectId: string,
  client: PrismaClient | Transaction = prisma,
  operationId?: string,
): Promise<ConversationCollaborationReview | null> {
  qualityJourneyIdentifierSchema.parse(targetProjectId)
  if (operationId) qualityJourneyIdentifierSchema.parse(operationId)
  const operation = await client.collaborationOperation.findFirst({
    where: { ...(operationId ? { id: operationId } : {}), binding: { targetProjectId }, state: 'WAITING_FOR_DECISION' },
    orderBy: { createdAt: 'desc' },
    include: {
      artifacts: {
        where: { kind: 'DIVERGENT_PROPOSAL_REVIEW' },
        orderBy: { revision: 'desc' },
        take: 1,
        select: { payloadJson: true },
      },
    },
  })
  if (!operation?.preparedDigest) return null
  const preparedDigest = collaborationPublicDigest(operation.preparedDigest)
  if (!preparedDigest) return null
  const base = {
    targetProjectId,
    operationId: operation.id,
    intent: operation.intent,
    expectedVersion: operation.version,
    preparedDigest,
  }
  if (operation.intent === 'RECONCILE') {
    const reviewDigest = parseDivergentDigest(operation.artifacts[0]?.payloadJson ?? null)
    const review = reviewDigest
      ? conversationCollaborationReviewSchema.safeParse({
          ...base,
          intent: 'RECONCILE',
          kind: 'DIVERGENT',
          reviewDigest,
          reviewItems: [],
        })
      : null
    return review?.success ? review.data : null
  }
  const reviewItems = parseReviewItems(operation.preparedJson)
  const review = reviewItems?.length
    ? conversationCollaborationReviewSchema.safeParse({ ...base, kind: 'RECORDS', reviewItems })
    : null
  return review?.success ? review.data : null
}

/** All chat decisions bind to the reviewed operation and are persisted in the caller's chat transaction. */
export async function decideConversationCollaborationInTransaction(
  transaction: Transaction,
  input: {
    targetProjectId: string
    review: ConversationCollaborationReview
    decision: ConversationCollaborationDecision
  },
) {
  qualityJourneyIdentifierSchema.parse(input.targetProjectId)
  const current = await readConversationCollaborationReview(
    input.targetProjectId,
    transaction,
    input.review.operationId,
  )
  if (!current || !sameConversationCollaborationReview(current, input.review))
    throw new ServiceError('The collaboration review changed. Refresh the exact proposal.', 'CONFLICT', 409)
  if (current.kind === 'DIVERGENT') {
    if (input.decision !== 'ACCEPT' && input.decision !== 'REJECT')
      throw new ServiceError('This proposal requires accept or reject.', 'VALIDATION', 400)
    const operation = await decideDivergentCollaborationProposal(
      {
        operationId: current.operationId,
        expectedVersion: current.expectedVersion,
        preparedDigest: current.preparedDigest,
        reviewDigest: current.reviewDigest,
        decision: input.decision,
        trustedPrincipalId: 'local-user',
        provenance: 'local-ui',
      },
      transaction,
    )
    return {
      operationId: operation.id,
      state: operation.state,
      afterCommit: input.decision === 'ACCEPT' ? ('CONTINUE_ACCEPTED' as const) : ('CLEANUP_REJECTED' as const),
    }
  }
  if (input.decision !== 'KEEP_LOCAL' && input.decision !== 'USE_INCOMING')
    throw new ServiceError('This review requires a whole-record decision.', 'VALIDATION', 400)
  const decision = input.decision
  const operation = await decideCollaborationOperationInTransaction(
    {
      operationId: current.operationId,
      expectedVersion: current.expectedVersion,
      preparedDigest: current.preparedDigest,
      decisions: current.reviewItems.map(item => ({ recordKey: item.recordKey, decision })),
      trustedPrincipalId: 'local-user',
      provenance: 'local-ui',
    },
    transaction,
  )
  return {
    operationId: operation.id,
    state: operation.state,
    afterCommit: operation.state === 'READY' ? ('CONTINUE_ACCEPTED' as const) : ('NONE' as const),
  }
}

/** Lost responses are resolved by the same durable key. The caller never starts a second attempt after an unknown outcome. */
export async function prepareConversationCollaboration(
  input: { targetProjectId: string; intent: 'PUBLISH' | 'RECEIVE'; idempotencyKey: string },
  client: PrismaClient = prisma,
) {
  qualityJourneyIdentifierSchema.parse(input.targetProjectId)
  if (!input.idempotencyKey.trim()) throw new ServiceError('A stable turn key is required.', 'VALIDATION', 400)
  const binding = await client.collaborationBinding.findUnique({
    where: { targetProjectId: input.targetProjectId },
    select: { id: true, policyVersion: true },
  })
  if (!binding) throw new ServiceError('Collaboration is not connected for this project.', 'NOT_FOUND', 404)
  const observe = () =>
    client.collaborationOperation.findUnique({
      where: { bindingId_idempotencyKey: { bindingId: binding.id, idempotencyKey: input.idempotencyKey } },
      select: { id: true, intent: true, state: true, version: true, preparedDigest: true },
    })
  const existing = await observe()
  if (existing) {
    if (existing.intent !== input.intent)
      throw new ServiceError('This turn key belongs to another intent.', 'CONFLICT', 409)
    return {
      ...existing,
      preparedDigest: collaborationPublicDigest(existing.preparedDigest),
      outcome: 'OBSERVED' as const,
    }
  }
  try {
    const operation = await prepareCollaborationOperation(
      {
        bindingId: binding.id,
        intent: input.intent,
        idempotencyKey: input.idempotencyKey,
        expectedPolicyVersion: binding.policyVersion,
        // Preparation in chat only records scope. No-conflict READY operations
        // need an explicit execution request rather than a scheduler wake.
        trigger: 'local-ui-chat-preparation',
      },
      client,
    )
    return { ...operation, outcome: 'OBSERVED' as const }
  } catch (error) {
    const recovered = await observe()
    if (recovered) {
      if (recovered.intent !== input.intent)
        throw new ServiceError('This turn key belongs to another intent.', 'CONFLICT', 409)
      return {
        ...recovered,
        preparedDigest: collaborationPublicDigest(recovered.preparedDigest),
        outcome: 'OBSERVED' as const,
      }
    }
    if (error instanceof ServiceError) throw error
    return { id: null, state: 'UNKNOWN', outcome: 'UNKNOWN_NO_DISPATCH' as const }
  }
}

export async function readConversationCollaborationOperation(
  targetProjectId: string,
  operationId: string,
  client: PrismaClient | Transaction = prisma,
) {
  qualityJourneyIdentifierSchema.parse(targetProjectId)
  qualityJourneyIdentifierSchema.parse(operationId)
  const operation = await client.collaborationOperation.findFirst({
    where: { id: operationId, binding: { targetProjectId } },
    select: {
      id: true,
      intent: true,
      state: true,
      version: true,
      preparedDigest: true,
      acceptedDigest: true,
      blockerJson: true,
      receiptHash: true,
      updatedAt: true,
    },
  })
  if (!operation) throw new ServiceError('Scoped collaboration operation was not found.', 'NOT_FOUND', 404)
  return {
    ...operation,
    preparedDigest: collaborationPublicDigest(operation.preparedDigest),
    acceptedDigest: collaborationPublicDigest(operation.acceptedDigest),
  }
}
