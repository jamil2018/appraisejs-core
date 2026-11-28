import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { caseDeletionReviewSchema, type CaseDeletionReview } from '@/lib/conversation/case-deletion-review'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'
import { deleteReviewedTestCasesInTransaction } from '@/services/test-case/test-case-service'

type Scope = { targetProjectId: string; conversationId: string; messageId: string }

function reviewHash(scope: Scope, cases: CaseDeletionReview['cases']) {
  return hashCanonical({ version: 'conversation-case-deletion/v1', scope, cases })
}

export function buildCaseDeletionReview(scope: Scope, cases: CaseDeletionReview['cases']): CaseDeletionReview {
  return { cases, hash: reviewHash(scope, cases), status: 'PENDING' }
}

export function readCaseDeletionReview(raw: string | null | undefined) {
  if (!raw) return undefined
  try {
    const review = caseDeletionReviewSchema.safeParse(JSON.parse(raw))
    return review.success ? review.data : undefined
  } catch {
    return undefined
  }
}

export async function decideConversationCaseDeletion(
  input: Scope & { reviewHash: string; decision: 'DELETE' | 'KEEP' },
  client: PrismaClient = prisma,
) {
  const { targetProjectId, conversationId, messageId, reviewHash: expectedHash, decision } = input
  if (decision !== 'DELETE' && decision !== 'KEEP')
    throw new ServiceError('Choose whether to delete or keep the reviewed cases.', 'VALIDATION', 400)
  const scope = { targetProjectId, conversationId, messageId }
  const status = decision === 'DELETE' ? 'DELETED' : 'KEPT'
  return client.$transaction(async tx => {
    const row = await tx.projectConversationMessage.findFirst({
      where: { id: messageId, conversationId, role: 'APPRAISE', conversation: { targetProjectId } },
      select: { caseDeletionReviewJson: true },
    })
    const raw = row?.caseDeletionReviewJson
    const reviewed = readCaseDeletionReview(raw)
    if (!reviewed || reviewed.hash !== expectedHash || reviewHash(scope, reviewed.cases) !== reviewed.hash)
      throw new ServiceError('Open the current case deletion review before making a decision.', 'CONFLICT')
    if (reviewed.status === status) return { replayed: true }
    if (reviewed.status !== 'PENDING')
      throw new ServiceError('This case deletion review already has a decision.', 'CONFLICT')
    const updated = await tx.projectConversationMessage.updateMany({
      where: { id: messageId, conversationId, caseDeletionReviewJson: raw },
      data: { caseDeletionReviewJson: JSON.stringify({ ...reviewed, status }) },
    })
    if (updated.count !== 1)
      throw new ServiceError('This case deletion review changed. Reopen it before making a decision.', 'CONFLICT')
    if (decision === 'DELETE')
      await deleteReviewedTestCasesInTransaction(tx, { targetProjectId, reviewedCases: reviewed.cases })
    await tx.projectConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
    return { replayed: false }
  })
}
