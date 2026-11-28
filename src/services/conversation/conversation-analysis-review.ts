import type { Prisma } from '@prisma/client'

import type { ChatAnalysisQuestion, ChatAnalysisReview } from '@/lib/conversation/analysis-review'
import {
  recordQualityJourneyAnalysisAnswerInTransaction,
  requestQualityJourneyAnalysisRevisionInTransaction,
  submitQualityJourneyAnalysisDecisionInTransaction,
} from '@/services/coordinator/quality-journey-analysis-service'
import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import { ServiceError } from '@/services/shared/errors'

type ChatTurnScope = { journeyId: string; targetProjectId: string; conversationId: string; key: string }

async function readCurrentChatAnalysis(
  tx: Prisma.TransactionClient,
  {
    journeyId,
    targetProjectId,
    stateHash,
  }: Pick<ChatTurnScope, 'journeyId' | 'targetProjectId'> & { stateHash: string },
) {
  const current = await tx.qualityJourney.findFirst({ where: { id: journeyId, targetProjectId } })
  if (!current || current.status !== 'ACTIVE' || current.stateHash !== stateHash)
    throw new ServiceError('The Journey changed. Load the current question or review.', 'CONFLICT')
  return current
}

async function readAnalysisWake(tx: Prisma.TransactionClient, journeyId: string, targetProjectId: string) {
  const current = await tx.qualityJourney.findUniqueOrThrow({ where: { id: journeyId }, select: { stateHash: true } })
  return { journeyId, targetProjectId, expectedStateHash: current.stateHash }
}

export async function requestConversationAnalysisRevision(
  tx: Prisma.TransactionClient,
  input: ChatAnalysisReview & ChatTurnScope & { feedback: string },
) {
  const { journeyId, targetProjectId, revisionId, reviewHash, stateHash, key, conversationId, feedback } = input
  const revision = await tx.qualityJourneyAnalysisRevision.findFirst({
    where: { journeyId, targetProjectId, artifactRevisionId: revisionId },
    select: { artifactId: true, contentHash: true },
  })
  const staleReview = () =>
    new ServiceError(
      'This review changed. Load the latest Journey before requesting another revision.',
      'CONFLICT',
      409,
    )
  if (!revision) throw staleReview()

  const commandId = `chat-analysis:${conversationId}:${key}`
  const result = await requestQualityJourneyAnalysisRevisionInTransaction(
    {
      expectedReviewHash: reviewHash,
      command: {
        schemaVersion: 'appraise.quality-journey/v1',
        journeyId,
        targetProjectId,
        actor: 'USER',
        command: 'REQUEST_ANALYSIS_REVISION',
        commandId,
        idempotencyKey: commandId,
        expectedStateHash: stateHash,
        inputArtifactRefs: [{ kind: 'ANALYSIS_CHARTER_REVISION', ...revision, revisionId }],
        payload: { reviewedRevisionId: revisionId, reviewedHash: revision.contentHash, feedback },
      },
    },
    tx,
    trustedHumanCoordinatorSession,
  )
  if (result.outcome !== 'COMMITTED') throw staleReview()

  return readAnalysisWake(tx, journeyId, targetProjectId)
}

export async function answerConversationAnalysisQuestion(
  tx: Prisma.TransactionClient,
  input: ChatAnalysisQuestion & ChatTurnScope & { answer: string },
) {
  const { journeyId, targetProjectId, revisionId, questionId, conversationId, key, answer } = input
  await readCurrentChatAnalysis(tx, input)
  const question = await tx.qualityJourneyAnalysisQuestion.findFirst({
    where: { journeyId, analysisRevisionId: revisionId, required: true, answers: { none: {} } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { questionId: true },
  })
  if (question?.questionId !== questionId)
    throw new ServiceError('This question is no longer the current unanswered question.', 'CONFLICT')

  const answerId = `chat-analysis-answer:${conversationId}:${key}`
  await recordQualityJourneyAnalysisAnswerInTransaction(
    {
      idempotencyKey: answerId,
      answer: {
        schemaVersion: 'appraise.quality-journey/v1',
        journeyId,
        targetProjectId,
        analysisRevisionId: revisionId,
        actor: 'USER',
        questionId,
        answerId,
        answer,
      },
    },
    tx,
    trustedHumanCoordinatorSession,
  )
  return readAnalysisWake(tx, journeyId, targetProjectId)
}

export async function approveConversationAnalysis(
  tx: Prisma.TransactionClient,
  input: ChatAnalysisReview & ChatTurnScope,
) {
  const { journeyId, targetProjectId, revisionId, reviewHash, stateHash, conversationId, key } = input
  const current = await readCurrentChatAnalysis(tx, input)
  const revision = await tx.qualityJourneyAnalysisRevision.findFirst({
    where: { journeyId, targetProjectId, cycleId: current.activeCycleId, artifactRevisionId: revisionId },
    select: { artifactId: true, contentHash: true, revision: true, publication: { select: { reviewHash: true } } },
  })
  if (
    current.stage !== 'ANALYSIS_REVIEW' ||
    current.analysisReviewHash !== reviewHash ||
    revision?.publication?.reviewHash !== reviewHash
  )
    throw new ServiceError('This review changed. Load the current revision before approving.', 'CONFLICT')

  const commandId = `chat-analysis:${conversationId}:${key}`
  const { artifactId, contentHash } = revision
  const result = await submitQualityJourneyAnalysisDecisionInTransaction(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      journeyId,
      targetProjectId,
      actor: 'USER',
      command: 'DECIDE_ANALYSIS',
      commandId,
      idempotencyKey: commandId,
      expectedStateHash: stateHash,
      inputArtifactRefs: [{ kind: 'ANALYSIS_CHARTER_REVISION', artifactId, contentHash, revisionId }],
      payload: { revisionId, contentHash, decision: 'APPROVED' },
    },
    tx,
    trustedHumanCoordinatorSession,
  )
  if (result.outcome !== 'COMMITTED')
    throw new ServiceError('This review changed. Load the current revision before approving.', 'CONFLICT')

  return { wake: await readAnalysisWake(tx, journeyId, targetProjectId), revision: revision.revision }
}
