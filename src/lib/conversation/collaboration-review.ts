import { z } from 'zod'

import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const common = {
  targetProjectId: qualityJourneyIdentifierSchema,
  operationId: qualityJourneyIdentifierSchema,
  intent: z.enum(['RECEIVE', 'PUBLISH', 'RECONCILE', 'UNDO']),
  expectedVersion: z.number().int().nonnegative(),
  preparedDigest: digest,
}

export const conversationCollaborationReviewSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.literal('RECORDS'),
    reviewItems: z
      .array(z.strictObject({ recordKey: z.string().min(1).max(512), disposition: z.string().min(1).max(128) }))
      .min(1)
      .max(1000),
  }),
  z.strictObject({
    ...common,
    intent: z.literal('RECONCILE'),
    kind: z.literal('DIVERGENT'),
    reviewDigest: digest,
    reviewItems: z.tuple([]),
  }),
])

export type ConversationCollaborationReview = z.infer<typeof conversationCollaborationReviewSchema>
export type ConversationCollaborationDecision = 'KEEP_LOCAL' | 'USE_INCOMING' | 'ACCEPT' | 'REJECT'

export function parseConversationCollaborationRequest(content: string) {
  const normalized = content
    .trim()
    .replace(/[.!?]$/, '')
    .toLowerCase()
  switch (normalized) {
    case 'show collaboration status':
      return { kind: 'STATUS' as const }
    case 'prepare publication':
      return { kind: 'PREPARE' as const, intent: 'PUBLISH' as const }
    case 'prepare receive':
      return { kind: 'PREPARE' as const, intent: 'RECEIVE' as const }
    case 'keep all local':
      return { kind: 'DECIDE' as const, decision: 'KEEP_LOCAL' as const }
    case 'use all incoming':
      return { kind: 'DECIDE' as const, decision: 'USE_INCOMING' as const }
    case 'accept proposal':
      return { kind: 'DECIDE' as const, decision: 'ACCEPT' as const }
    case 'reject proposal':
      return { kind: 'DECIDE' as const, decision: 'REJECT' as const }
    default:
      return null
  }
}

/** Stable equality after independent Zod parsing, regardless of key insertion order. */
export function sameConversationCollaborationReview(
  left: ConversationCollaborationReview,
  right: ConversationCollaborationReview,
) {
  return (
    left.kind === right.kind &&
    left.targetProjectId === right.targetProjectId &&
    left.operationId === right.operationId &&
    left.intent === right.intent &&
    left.expectedVersion === right.expectedVersion &&
    left.preparedDigest === right.preparedDigest &&
    (left.kind === 'DIVERGENT' && right.kind === 'DIVERGENT'
      ? left.reviewDigest === right.reviewDigest
      : left.kind === 'RECORDS' &&
        right.kind === 'RECORDS' &&
        left.reviewItems.length === right.reviewItems.length &&
        left.reviewItems.every(
          (item, index) =>
            item.recordKey === right.reviewItems[index].recordKey &&
            item.disposition === right.reviewItems[index].disposition,
        ))
  )
}
