import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  analysisAnswerRequestSchema,
  analysisCharterSchema,
  analysisSubmissionSchema,
  createQualityJourneyKernelState,
  hashAnalysisAnswer,
  hashAnalysisCharter,
  hashAnalysisQuestion,
  hashCanonical,
  journeyCommandSchema,
  qualityJourneyContractVersion,
  type QualityJourneyStage,
} from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'
import {
  completeQualityJourneyWorkInTransaction,
  submitDurableQualityJourneyCommandInTransaction,
  type WorkCompletionInput,
} from './quality-journey-service'

type Db = PrismaClient | Prisma.TransactionClient
const json = (value: unknown) => canonicalContractJson(value)
const hash = (value: unknown) => hashCanonical(value)
const artifactRecordId = (journeyId: string, identityKey: string) =>
  `qja_${createHash('sha256').update(`${journeyId}:${identityKey}`).digest('hex').slice(0, 24)}`

async function journeyOrThrow(journeyId: string, targetProjectId: string, db: Db) {
  const journey = await db.qualityJourney.findFirst({ where: { id: journeyId, targetProjectId } })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  return journey
}

function nextStateHash(
  row: {
    id: string
    targetProjectId: string
    activeCycleId: string
    stage: string
    activeRevisionIdsJson: string
    analysisReviewHash: string | null
    blockerIdsJson: string
    activeWorkItemIdsJson: string
  },
  unresolvedQuestionIds: readonly string[],
  analysisReviewHash: string,
) {
  return createQualityJourneyKernelState({
    journeyId: row.id,
    targetProjectId: row.targetProjectId,
    activeCycleId: row.activeCycleId,
    stage: row.stage as QualityJourneyStage,
    activeRevisionIds: JSON.parse(row.activeRevisionIdsJson),
    analysisReviewHash,
    unresolvedQuestionIds,
    blockerIds: JSON.parse(row.blockerIdsJson),
    activeWorkItemIds: JSON.parse(row.activeWorkItemIdsJson),
  }).stateHash
}

async function setAnalysisReviewProjection(
  row: Awaited<ReturnType<typeof journeyOrThrow>>,
  input: { unresolvedQuestionIds: readonly string[]; reviewHash: string },
  eventType: 'ANALYSIS_SUBMITTED' | 'ANALYSIS_ANSWERED',
  payload: unknown,
  tx: Prisma.TransactionClient,
) {
  const normalized = [...new Set(input.unresolvedQuestionIds)].sort()
  if (
    json((JSON.parse(row.unresolvedQuestionIdsJson) as string[]).sort()) === json(normalized) &&
    row.analysisReviewHash === input.reviewHash
  )
    return row
  const successorStateHash = nextStateHash(row, normalized, input.reviewHash)
  const updated = await tx.qualityJourney.updateMany({
    where: { id: row.id, version: row.version, stateHash: row.stateHash },
    data: {
      analysisReviewHash: input.reviewHash,
      unresolvedQuestionIdsJson: json(normalized),
      stateHash: successorStateHash,
      version: { increment: 1 },
    },
  })
  if (updated.count !== 1)
    throw new ServiceError('Quality Journey changed while reconciling analysis questions.', 'CONFLICT')
  const sequence = (await tx.qualityJourneyEvent.count({ where: { journeyId: row.id } })) + 1
  await tx.qualityJourneyEvent.create({
    data: {
      id: `qje_analysis_${createHash('sha256').update(`${row.id}:${eventType}:${sequence}:${successorStateHash}`).digest('hex').slice(0, 24)}`,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      sequence,
      eventType,
      predecessorStateHash: row.stateHash,
      successorStateHash,
      payloadJson: json(payload),
    },
  })
  return tx.qualityJourney.findUniqueOrThrow({ where: { id: row.id } })
}

function analysisArtifactIdentity(charter: ReturnType<typeof analysisCharterSchema.parse>) {
  return `ANALYSIS_CHARTER_REVISION:${charter.charterId}:${charter.analysisRevisionId}`
}

function questionArtifactIdentity(questionId: string, analysisRevisionId: string) {
  return `ANALYSIS_QUESTION:${questionId}:${analysisRevisionId}`
}

function answerArtifactIdentity(answerId: string) {
  return `ANALYSIS_ANSWER:${answerId}:unrevisioned`
}

async function createImmutableArtifact(
  input: {
    journeyId: string
    targetProjectId: string
    cycleId: string
    identityKey: string
    kind: 'ANALYSIS_CHARTER_REVISION' | 'ANALYSIS_QUESTION' | 'ANALYSIS_ANSWER' | 'JOURNEY_APPROVAL'
    artifactId: string
    revisionId?: string
    contentHash: string
    payload: unknown
  },
  tx: Prisma.TransactionClient,
) {
  const id = artifactRecordId(input.journeyId, input.identityKey)
  const existing = await tx.qualityJourneyArtifact.findUnique({
    where: { journeyId_identityKey: { journeyId: input.journeyId, identityKey: input.identityKey } },
  })
  if (existing) {
    if (existing.contentHash !== input.contentHash || existing.artifactJson !== json(input.payload))
      throw new ServiceError(
        'Quality Journey immutable artifact identity conflicts with different payload.',
        'CONFLICT',
      )
    return existing
  }
  return tx.qualityJourneyArtifact.create({
    data: {
      id,
      identityKey: input.identityKey,
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      cycleId: input.cycleId,
      kind: input.kind,
      artifactId: input.artifactId,
      revisionId: input.revisionId,
      contentHash: input.contentHash,
      artifactJson: json(input.payload),
    },
  })
}

function exactCharterRef(charter: ReturnType<typeof analysisCharterSchema.parse>, contentHash: string) {
  return {
    kind: 'ANALYSIS_CHARTER_REVISION' as const,
    artifactId: charter.charterId,
    revisionId: charter.analysisRevisionId,
    contentHash,
  }
}

/** Review identity is deliberately content-addressed from the charter and
 * append-only Q&A payloads. It contains no timestamps or database row IDs. */
async function currentAnalysisReviewHash(analysisRevisionId: string, tx: Prisma.TransactionClient) {
  const revision = await tx.qualityJourneyAnalysisRevision.findUniqueOrThrow({
    where: { id: analysisRevisionId },
    include: { questions: { include: { answers: true } } },
  })
  return hash({
    domain: 'appraise.quality-journey-analysis-review/v1',
    analysisRevisionId: revision.id,
    charterHash: revision.contentHash,
    questions: revision.questions
      .map(question => ({
        questionId: question.questionId,
        contentHash: question.contentHash,
        required: question.required,
        answers: question.answers
          .map(answer => ({ answerId: answer.answerId, contentHash: answer.contentHash }))
          .sort((left, right) => left.answerId.localeCompare(right.answerId)),
      }))
      .sort((left, right) => left.questionId.localeCompare(right.questionId)),
  })
}

/** Returns the control plane plus immutable payload records. It intentionally
 * has no UI or MCP envelope; wrappers are a later Phase 3 increment. */
export async function getQualityJourneyAnalysis(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  await journeyOrThrow(input.journeyId, input.targetProjectId, client)
  const revisions = await client.qualityJourneyAnalysisRevision.findMany({
    where: { journeyId: input.journeyId },
    orderBy: { createdAt: 'asc' },
    include: {
      artifact: true,
      questions: {
        orderBy: { createdAt: 'asc' },
        include: { artifact: true, answers: { orderBy: { createdAt: 'asc' }, include: { artifact: true } } },
      },
      publication: true,
      decision: { include: { artifact: true } },
    },
  })
  return { revisions }
}

type AnalysisSubmission = ReturnType<typeof analysisSubmissionSchema.parse>
type AnalysisCharter = ReturnType<typeof analysisCharterSchema.parse>
type AnalysisOutputReference = {
  kind: 'ANALYSIS_CHARTER_REVISION' | 'ANALYSIS_QUESTION'
  artifactId: string
  revisionId: string
  contentHash: string
}

async function replayedAnalysisSubmission(
  submission: AnalysisSubmission,
  submissionHash: string,
  tx: Prisma.TransactionClient,
) {
  const existing = await tx.qualityJourneyAnalysisRevision.findUnique({
    where: {
      journeyId_submissionIdempotencyKey: {
        journeyId: submission.journeyId,
        submissionIdempotencyKey: submission.idempotencyKey,
      },
    },
  })
  if (!existing) return null
  if (existing.submissionHash !== submissionHash)
    throw new ServiceError('Analysis submission idempotency key was reused with different input.', 'CONFLICT')
  return { replayed: true, analysisRevision: existing }
}

function assertAnalysisSubmissionMatchesJourney(
  submission: AnalysisSubmission,
  charter: AnalysisCharter,
  journey: Awaited<ReturnType<typeof journeyOrThrow>>,
) {
  if (journey.stage !== 'ANALYSIS')
    throw new ServiceError('Analysis can only be submitted during the analysis stage.', 'CONFLICT')
  if (charter.cycleId !== journey.activeCycleId)
    throw new ServiceError('Analysis charter cycle is not the active journey cycle.', 'CONFLICT')
  const activeIds = JSON.parse(journey.activeRevisionIdsJson) as Record<string, string>
  if (charter.requirementRevisionId !== activeIds.journey)
    throw new ServiceError('Analysis charter does not bind the active requirement revision.', 'CONFLICT')
  if (
    submission.predecessorAnalysisRevisionId !== activeIds.analysis &&
    (activeIds.analysis || submission.predecessorAnalysisRevisionId)
  )
    throw new ServiceError('Analysis successor does not bind the current reviewed analysis revision.', 'CONFLICT')
}

function assertAnalyzerAttemptAuthority(
  submission: AnalysisSubmission,
  item: { id: string; role: string; status: string; inputHash: string },
  attempt: { id: string; workItemId: string; ownerTokenHash: string; leaseExpiresAt: Date; status: string },
  journeyStateHash: string,
) {
  if (attempt.id !== submission.attemptId || attempt.workItemId !== item.id)
    throw new ServiceError('Analysis submission does not bind a current work attempt.', 'UNAUTHORIZED')
  if (item.role !== 'REQUIREMENT_ANALYZER')
    throw new ServiceError('Only the Requirement Analyzer assignment may submit an Analysis Charter.', 'UNAUTHORIZED')
  if (attempt.ownerTokenHash !== createHash('sha256').update(submission.ownerToken).digest('hex'))
    throw new ServiceError('Analysis submission lease authority is invalid.', 'UNAUTHORIZED')
  if (attempt.leaseExpiresAt <= new Date() || item.status !== 'IN_PROGRESS' || attempt.status !== 'IN_PROGRESS')
    throw new ServiceError('Analysis submission work attempt is stale.', 'CONFLICT')
  if (item.inputHash !== journeyStateHash)
    throw new ServiceError('Analysis submission input hash is stale.', 'CONFLICT')
}

async function validatedAnalysisSubmissionContext(
  submission: AnalysisSubmission,
  charter: AnalysisCharter,
  tx: Prisma.TransactionClient,
) {
  const journey = await journeyOrThrow(submission.journeyId, submission.targetProjectId, tx)
  assertAnalysisSubmissionMatchesJourney(submission, charter, journey)
  const item = await tx.qualityJourneyWorkItem.findFirst({
    where: { id: submission.workItemId, journeyId: journey.id, targetProjectId: journey.targetProjectId },
  })
  const attempt = await tx.qualityJourneyWorkAttempt.findUnique({ where: { leaseId: submission.leaseId } })
  if (!item || !attempt)
    throw new ServiceError('Analysis submission does not bind a current work attempt.', 'UNAUTHORIZED')
  assertAnalyzerAttemptAuthority(submission, item, attempt, journey.stateHash)
  return { journey, item, attempt }
}

function assertStableRequirementLineage(charter: AnalysisCharter, predecessorCharter: AnalysisCharter) {
  const priorRequirementIds = new Set(predecessorCharter.requirements.map(requirement => requirement.requirementId))
  const currentRequirementIds = new Set(charter.requirements.map(requirement => requirement.requirementId))
  const priorRetiredRequirementIds = new Set(predecessorCharter.retiredRequirementIds)
  const restoredRetiredId = [...priorRetiredRequirementIds].some(id => !charter.retiredRequirementIds.includes(id))
  const silentlyRemovedId = [...priorRequirementIds].some(
    id => !currentRequirementIds.has(id) && !charter.retiredRequirementIds.includes(id),
  )
  const reusedRetiredId = [...currentRequirementIds].some(id => priorRetiredRequirementIds.has(id))
  if (restoredRetiredId || silentlyRemovedId || reusedRetiredId)
    throw new ServiceError('Analysis successor violates stable requirement ID lineage.', 'CONFLICT')
}

async function validatedAnalysisSuccessorLineage(
  submission: AnalysisSubmission,
  charter: AnalysisCharter,
  journeyId: string,
  tx: Prisma.TransactionClient,
) {
  const predecessor = submission.predecessorAnalysisRevisionId
    ? await tx.qualityJourneyAnalysisRevision.findFirst({
        where: { id: submission.predecessorAnalysisRevisionId, journeyId },
        include: { artifact: true },
      })
    : null
  if (submission.predecessorAnalysisRevisionId && !predecessor)
    throw new ServiceError('Analysis predecessor is outside the journey.', 'CONFLICT')
  const resolvedAnswers = await tx.qualityJourneyAnalysisAnswer.findMany({
    where: { journeyId, answerId: { in: charter.resolvedQuestionAnswerIds } },
    include: { question: true },
  })
  const hasForeignAnswer = resolvedAnswers.some(
    answer => !predecessor || answer.question.analysisRevisionId !== predecessor.id,
  )
  if (resolvedAnswers.length !== charter.resolvedQuestionAnswerIds.length || hasForeignAnswer)
    throw new ServiceError('Analysis successor references answers outside its immediate predecessor.', 'CONFLICT')
  if (!predecessor) return { predecessor, resolvedAnswers }
  assertStableRequirementLineage(charter, analysisCharterSchema.parse(JSON.parse(predecessor.artifact.artifactJson)))
  const predecessorQuestions = await tx.qualityJourneyAnalysisQuestion.findMany({
    where: { analysisRevisionId: predecessor.id, required: true },
  })
  const carriedQuestionIds = new Set(charter.questions.map(question => question.questionId))
  const resolvedQuestionIds = new Set(resolvedAnswers.map(answer => answer.question.questionId))
  if (
    predecessorQuestions.some(
      question => !carriedQuestionIds.has(question.questionId) && !resolvedQuestionIds.has(question.questionId),
    )
  )
    throw new ServiceError('A required predecessor question cannot be silently withdrawn from a successor.', 'CONFLICT')
  return { predecessor, resolvedAnswers }
}

async function createAnalysisRevision(
  input: {
    submission: AnalysisSubmission
    charter: AnalysisCharter
    submissionHash: string
    journey: Awaited<ReturnType<typeof journeyOrThrow>>
    predecessorRevisionId?: string
    workItemId: string
    attemptId: string
    inputHash: string
  },
  tx: Prisma.TransactionClient,
) {
  const contentHash = hashAnalysisCharter(input.charter)
  const artifact = await createImmutableArtifact(
    {
      journeyId: input.journey.id,
      targetProjectId: input.journey.targetProjectId,
      cycleId: input.journey.activeCycleId,
      identityKey: analysisArtifactIdentity(input.charter),
      kind: 'ANALYSIS_CHARTER_REVISION',
      artifactId: input.charter.charterId,
      revisionId: input.charter.analysisRevisionId,
      contentHash,
      payload: input.charter,
    },
    tx,
  )
  const revision = await tx.qualityJourneyAnalysisRevision.create({
    data: {
      id: input.charter.analysisRevisionId,
      journeyId: input.journey.id,
      targetProjectId: input.journey.targetProjectId,
      cycleId: input.journey.activeCycleId,
      artifactRecordId: artifact.id,
      artifactId: input.charter.charterId,
      artifactRevisionId: input.charter.analysisRevisionId,
      revision: (await tx.qualityJourneyAnalysisRevision.count({ where: { journeyId: input.journey.id } })) + 1,
      contentHash,
      predecessorRevisionId: input.predecessorRevisionId,
      submissionIdempotencyKey: input.submission.idempotencyKey,
      submissionHash: input.submissionHash,
      submittedWorkItemId: input.workItemId,
      submittedAttemptId: input.attemptId,
      inputHash: input.inputHash,
    },
  })
  return { revision, contentHash }
}

async function createAnalysisQuestions(
  charter: AnalysisCharter,
  revision: { id: string },
  journey: Awaited<ReturnType<typeof journeyOrThrow>>,
  tx: Prisma.TransactionClient,
) {
  const outputRefs: AnalysisOutputReference[] = []
  for (const question of charter.questions) {
    const contentHash = hashAnalysisQuestion(question)
    const artifact = await createImmutableArtifact(
      {
        journeyId: journey.id,
        targetProjectId: journey.targetProjectId,
        cycleId: journey.activeCycleId,
        identityKey: questionArtifactIdentity(question.questionId, charter.analysisRevisionId),
        kind: 'ANALYSIS_QUESTION',
        artifactId: question.questionId,
        revisionId: charter.analysisRevisionId,
        contentHash,
        payload: question,
      },
      tx,
    )
    await tx.qualityJourneyAnalysisQuestion.create({
      data: {
        id: `qjaq_${createHash('sha256').update(`${revision.id}:${question.questionId}`).digest('hex').slice(0, 24)}`,
        journeyId: journey.id,
        analysisRevisionId: revision.id,
        artifactRecordId: artifact.id,
        questionId: question.questionId,
        contentHash,
        required: question.required,
      },
    })
    outputRefs.push({
      kind: 'ANALYSIS_QUESTION',
      artifactId: question.questionId,
      revisionId: charter.analysisRevisionId,
      contentHash,
    })
  }
  return outputRefs
}

async function completeAnalysisSubmission(
  input: {
    submission: AnalysisSubmission
    charter: AnalysisCharter
    journey: Awaited<ReturnType<typeof journeyOrThrow>>
    item: { id: string; roleContractDigest: string; inputHash: string }
    attempt: { id: string }
    outputRefs: AnalysisOutputReference[]
  },
  tx: Prisma.TransactionClient,
) {
  const result: WorkCompletionInput['result'] = {
    schemaVersion: qualityJourneyContractVersion,
    assignmentId: `qjma_${input.attempt.id}`,
    workItemId: input.item.id,
    attemptId: input.attempt.id,
    roleContractDigest: input.item.roleContractDigest,
    inputHash: input.item.inputHash,
    role: 'REQUIREMENT_ANALYZER',
    status: 'COMPLETED',
    outputs: input.outputRefs,
    evidenceReceipts: [],
    assumptions: input.charter.assumptions,
    blockers: [],
    unresolvedQuestions: input.charter.questions.map(question => ({
      questionId: question.questionId,
      prompt: question.prompt,
      required: question.required,
    })),
    submittedAt: new Date().toISOString(),
  }
  return completeQualityJourneyWorkInTransaction(
    {
      journeyId: input.journey.id,
      targetProjectId: input.journey.targetProjectId,
      workItemId: input.item.id,
      leaseId: input.submission.leaseId,
      ownerToken: input.submission.ownerToken,
      result,
    },
    tx,
  )
}

async function reconcileSubmittedAnalysisReview(
  journey: Awaited<ReturnType<typeof journeyOrThrow>>,
  charter: AnalysisCharter,
  revisionId: string,
  tx: Prisma.TransactionClient,
) {
  const unresolvedQuestionIds = charter.questions
    .filter(question => question.required)
    .map(question => question.questionId)
  await setAnalysisReviewProjection(
    journey,
    { unresolvedQuestionIds, reviewHash: await currentAnalysisReviewHash(revisionId, tx) },
    'ANALYSIS_SUBMITTED',
    { analysisRevisionId: revisionId, unresolvedQuestionIds },
    tx,
  )
}

async function submitQualityJourneyAnalysisSuccessorInTransaction(
  submission: AnalysisSubmission,
  charter: AnalysisCharter,
  submissionHash: string,
  tx: Prisma.TransactionClient,
) {
  const replay = await replayedAnalysisSubmission(submission, submissionHash, tx)
  if (replay) return replay
  const { journey, item, attempt } = await validatedAnalysisSubmissionContext(submission, charter, tx)
  const lineage = await validatedAnalysisSuccessorLineage(submission, charter, journey.id, tx)
  const { revision, contentHash } = await createAnalysisRevision(
    {
      submission,
      charter,
      submissionHash,
      journey,
      predecessorRevisionId: lineage.predecessor?.id,
      workItemId: item.id,
      attemptId: attempt.id,
      inputHash: item.inputHash,
    },
    tx,
  )
  const outputRefs: AnalysisOutputReference[] = [exactCharterRef(charter, contentHash)]
  outputRefs.push(...(await createAnalysisQuestions(charter, revision, journey, tx)))
  const completion = await completeAnalysisSubmission({ submission, charter, journey, item, attempt, outputRefs }, tx)
  await reconcileSubmittedAnalysisReview(
    await journeyOrThrow(journey.id, journey.targetProjectId, tx),
    charter,
    revision.id,
    tx,
  )
  return { replayed: completion.replayed, analysisRevision: revision }
}

/** The Analyzer may only submit against its current, receipt-validated work
 * attempt. The atomic completion records the normal Phase 1 work event. */
export async function submitQualityJourneyAnalysisSuccessor(input: unknown, client: PrismaClient = prisma) {
  const submission = analysisSubmissionSchema.parse(input)
  const charter = submission.charter
  if (charter.journeyId !== submission.journeyId || charter.targetProjectId !== submission.targetProjectId)
    throw new ServiceError('Analysis charter identity does not match its assignment scope.', 'CONFLICT')
  const submissionHash = hash({ ...submission, ownerToken: undefined })
  return client.$transaction(tx =>
    submitQualityJourneyAnalysisSuccessorInTransaction(submission, charter, submissionHash, tx),
  )
}

type AnalysisAnswerRequest = ReturnType<typeof analysisAnswerRequestSchema.parse>
type AnalysisAnswer = AnalysisAnswerRequest['answer']

async function replayedAnalysisAnswer(
  request: AnalysisAnswerRequest,
  requestHash: string,
  tx: Prisma.TransactionClient,
) {
  const existing = await tx.qualityJourneyAnalysisAnswer.findUnique({
    where: {
      journeyId_idempotencyKey: { journeyId: request.answer.journeyId, idempotencyKey: request.idempotencyKey },
    },
  })
  if (!existing) return null
  if (existing.requestHash !== requestHash)
    throw new ServiceError('Answer idempotency key was reused with different input.', 'CONFLICT')
  return { replayed: true, answer: existing }
}

async function assertAnswerTargetsCurrentAnalysis(
  answer: AnalysisAnswer,
  journey: Awaited<ReturnType<typeof journeyOrThrow>>,
  tx: Prisma.TransactionClient,
) {
  if (journey.stage !== 'ANALYSIS' && journey.stage !== 'ANALYSIS_REVIEW')
    throw new ServiceError('Analysis questions may only be answered before or during review.', 'CONFLICT')
  const activeIds = JSON.parse(journey.activeRevisionIdsJson) as Record<string, string>
  if (journey.stage === 'ANALYSIS_REVIEW' && activeIds.analysis !== answer.analysisRevisionId)
    throw new ServiceError('Analysis answer is not for the current exact review revision.', 'CONFLICT')
  if (journey.stage !== 'ANALYSIS') return
  const candidate = await tx.qualityJourneyAnalysisRevision.findFirst({
    where: { id: answer.analysisRevisionId, journeyId: journey.id },
  })
  const hasSuccessor = candidate
    ? (await tx.qualityJourneyAnalysisRevision.count({ where: { predecessorRevisionId: candidate.id } })) > 0
    : true
  if (hasSuccessor) throw new ServiceError('Analysis answer is not for the current submitted successor.', 'CONFLICT')
}

async function answerQuestionOrThrow(answer: AnalysisAnswer, journeyId: string, tx: Prisma.TransactionClient) {
  const question = await tx.qualityJourneyAnalysisQuestion.findFirst({
    where: { journeyId, analysisRevisionId: answer.analysisRevisionId, questionId: answer.questionId },
  })
  if (!question) throw new ServiceError('Analysis question not found for the exact revision.', 'NOT_FOUND')
  const decision = await tx.qualityJourneyAnalysisDecision.findUnique({
    where: { analysisRevisionId: answer.analysisRevisionId },
  })
  if (decision) throw new ServiceError('Approved analysis cannot be changed; submit a successor revision.', 'CONFLICT')
  if (!answer.correctionOfAnswerId) return { question, corrected: null }
  const corrected = await tx.qualityJourneyAnalysisAnswer.findFirst({
    where: { answerId: answer.correctionOfAnswerId, questionRecordId: question.id },
  })
  if (!corrected) throw new ServiceError('Answer correction does not reference the same analysis question.', 'CONFLICT')
  return { question, corrected }
}

async function persistAnalysisAnswer(
  input: {
    request: AnalysisAnswerRequest
    requestHash: string
    journey: Awaited<ReturnType<typeof journeyOrThrow>>
    question: { id: string; questionId: string }
    correctedId?: string
  },
  tx: Prisma.TransactionClient,
) {
  const answer = input.request.answer
  const contentHash = hashAnalysisAnswer(answer)
  const artifact = await createImmutableArtifact(
    {
      journeyId: input.journey.id,
      targetProjectId: input.journey.targetProjectId,
      cycleId: input.journey.activeCycleId,
      identityKey: answerArtifactIdentity(answer.answerId),
      kind: 'ANALYSIS_ANSWER',
      artifactId: answer.answerId,
      contentHash,
      payload: answer,
    },
    tx,
  )
  return tx.qualityJourneyAnalysisAnswer.create({
    data: {
      id: `qjaa_${createHash('sha256').update(`${input.journey.id}:${answer.answerId}`).digest('hex').slice(0, 24)}`,
      journeyId: input.journey.id,
      questionRecordId: input.question.id,
      artifactRecordId: artifact.id,
      answerId: answer.answerId,
      contentHash,
      actor: answer.actor,
      correctionOfAnswerId: input.correctedId,
      idempotencyKey: input.request.idempotencyKey,
      requestHash: input.requestHash,
    },
  })
}

async function answerQualityJourneyAnalysisQuestionInTransaction(
  request: AnalysisAnswerRequest,
  requestHash: string,
  tx: Prisma.TransactionClient,
) {
  const replay = await replayedAnalysisAnswer(request, requestHash, tx)
  if (replay) return replay
  const answer = request.answer
  const journey = await journeyOrThrow(answer.journeyId, answer.targetProjectId, tx)
  await assertAnswerTargetsCurrentAnalysis(answer, journey, tx)
  const { question, corrected } = await answerQuestionOrThrow(answer, journey.id, tx)
  const persisted = await persistAnalysisAnswer(
    { request, requestHash, journey, question, correctedId: corrected?.id },
    tx,
  )
  const unresolvedQuestionIds = (JSON.parse(journey.unresolvedQuestionIdsJson) as string[]).filter(
    id => id !== question.questionId,
  )
  await setAnalysisReviewProjection(
    journey,
    { unresolvedQuestionIds, reviewHash: await currentAnalysisReviewHash(answer.analysisRevisionId, tx) },
    'ANALYSIS_ANSWERED',
    { analysisRevisionId: answer.analysisRevisionId, questionId: question.questionId, answerId: persisted.answerId },
    tx,
  )
  return { replayed: false, answer: persisted }
}

/** Answers are immutable payloads. A correction appends a new answer and is
 * prohibited after exact approval; a changed charter still needs a successor. */
export async function answerQualityJourneyAnalysisQuestion(input: unknown, client: PrismaClient = prisma) {
  const request = analysisAnswerRequestSchema.parse(input)
  const requestHash = hash(request)
  return client.$transaction(tx => answerQualityJourneyAnalysisQuestionInTransaction(request, requestHash, tx))
}

function assertExactCommandArtifact(
  command: ReturnType<typeof journeyCommandSchema.parse>,
  revision: { artifactId: string; artifactRevisionId: string; contentHash: string },
) {
  const expected = {
    kind: 'ANALYSIS_CHARTER_REVISION',
    artifactId: revision.artifactId,
    revisionId: revision.artifactRevisionId,
    contentHash: revision.contentHash,
  }
  if (command.inputArtifactRefs.length !== 1 || json(command.inputArtifactRefs[0]) !== json(expected))
    throw new ServiceError('Analysis command must bind exactly the reviewed Analysis Charter revision.', 'CONFLICT')
}

type JourneyCommand = ReturnType<typeof journeyCommandSchema.parse>
type PublishAnalysisCommand = Extract<JourneyCommand, { command: 'PUBLISH_ANALYSIS' }>
type DecideAnalysisCommand = Extract<JourneyCommand, { command: 'DECIDE_ANALYSIS' }>

async function replayedAnalysisPublication(
  command: PublishAnalysisCommand,
  journeyId: string,
  tx: Prisma.TransactionClient,
) {
  const existingCommand = await tx.qualityJourneyCommand.findUnique({
    where: { journeyId_idempotencyKey: { journeyId, idempotencyKey: command.idempotencyKey } },
  })
  if (!existingCommand) return null
  const replay = await submitDurableQualityJourneyCommandInTransaction(command, tx)
  if (replay.outcome !== 'COMMITTED' || !replay.replayed) return replay
  const publication = await tx.qualityJourneyAnalysisPublication.findUnique({ where: { commandId: command.commandId } })
  if (!publication)
    throw new ServiceError('Published analysis command has no immutable publication record.', 'CONFLICT')
  return { ...replay, publication }
}

async function publicationRevisionOrThrow(
  command: PublishAnalysisCommand,
  journeyId: string,
  tx: Prisma.TransactionClient,
) {
  const revision = await tx.qualityJourneyAnalysisRevision.findFirst({
    where: { journeyId, artifactRevisionId: command.payload.artifactRevisionId },
  })
  if (!revision || revision.contentHash !== command.payload.artifactHash)
    throw new ServiceError('Analysis publication does not bind an exact immutable charter revision.', 'CONFLICT')
  assertExactCommandArtifact(command, revision)
  const unanswered = await tx.qualityJourneyAnalysisQuestion.count({
    where: { analysisRevisionId: revision.id, required: true, answers: { none: {} } },
  })
  if (unanswered > 0) throw new ServiceError('Required analysis questions remain unresolved.', 'CONFLICT')
  return revision
}

async function ensureAnalysisPublication(
  input: {
    command: PublishAnalysisCommand
    journey: Awaited<ReturnType<typeof journeyOrThrow>>
    revision: { id: string; contentHash: string }
    reviewHash: string
  },
  tx: Prisma.TransactionClient,
) {
  const existing = await tx.qualityJourneyAnalysisPublication.findUnique({
    where: { commandId: input.command.commandId },
  })
  if (!existing)
    return tx.qualityJourneyAnalysisPublication.create({
      data: {
        id: `qjap_${input.command.commandId}`,
        journeyId: input.journey.id,
        analysisRevisionId: input.revision.id,
        commandId: input.command.commandId,
        artifactHash: input.revision.contentHash,
        reviewHash: input.reviewHash,
      },
    })
  if (
    existing.journeyId !== input.journey.id ||
    existing.analysisRevisionId !== input.revision.id ||
    existing.artifactHash !== input.revision.contentHash ||
    existing.reviewHash !== input.reviewHash
  )
    throw new ServiceError('Analysis publication replay conflicts with immutable publication identity.', 'CONFLICT')
  return existing
}

async function publishQualityJourneyAnalysisInTransaction(
  command: PublishAnalysisCommand,
  tx: Prisma.TransactionClient,
) {
  const journey = await journeyOrThrow(command.journeyId, command.targetProjectId, tx)
  const replay = await replayedAnalysisPublication(command, journey.id, tx)
  if (replay) return replay
  const revision = await publicationRevisionOrThrow(command, journey.id, tx)
  const reviewHash = await currentAnalysisReviewHash(revision.id, tx)
  if (journey.analysisReviewHash !== reviewHash)
    throw new ServiceError('Analysis review identity is stale; refresh the current charter and Q&A.', 'CONFLICT')
  const result = await submitDurableQualityJourneyCommandInTransaction(command, tx)
  if (result.outcome !== 'COMMITTED') return result
  const publication = await ensureAnalysisPublication({ command, journey, revision, reviewHash }, tx)
  return { ...result, publication }
}

export async function publishQualityJourneyAnalysis(value: unknown, client: PrismaClient = prisma) {
  const command = journeyCommandSchema.parse(value)
  if (command.command !== 'PUBLISH_ANALYSIS' || command.actor !== 'RUNNER')
    throw new ServiceError('Only the Runner may publish an Analysis Charter.', 'UNAUTHORIZED')
  return client.$transaction(tx => publishQualityJourneyAnalysisInTransaction(command, tx))
}

async function decidableAnalysisRevisionOrThrow(
  command: DecideAnalysisCommand,
  journey: Awaited<ReturnType<typeof journeyOrThrow>>,
  tx: Prisma.TransactionClient,
) {
  const revision = await tx.qualityJourneyAnalysisRevision.findFirst({
    where: { journeyId: journey.id, artifactRevisionId: command.payload.revisionId },
  })
  if (!revision || revision.contentHash !== command.payload.contentHash)
    throw new ServiceError('Analysis decision does not bind an exact immutable charter revision.', 'CONFLICT')
  assertExactCommandArtifact(command, revision)
  const activeIds = JSON.parse(journey.activeRevisionIdsJson) as Record<string, string>
  if (activeIds.analysis !== revision.artifactRevisionId)
    throw new ServiceError('Analysis decision does not bind the active analysis revision.', 'CONFLICT')
  const reviewHash = await currentAnalysisReviewHash(revision.id, tx)
  if (journey.analysisReviewHash !== reviewHash)
    throw new ServiceError('Analysis decision review identity is stale; refresh the current Q&A.', 'CONFLICT')
  const publication = await tx.qualityJourneyAnalysisPublication.findUnique({
    where: { analysisRevisionId: revision.id },
  })
  if (!publication) throw new ServiceError('Analysis revision has not been published for review.', 'CONFLICT')
  if (publication.reviewHash !== reviewHash)
    throw new ServiceError('Analysis publication review identity is stale; submit a successor revision.', 'CONFLICT')
  const unanswered = await tx.qualityJourneyAnalysisQuestion.count({
    where: { analysisRevisionId: revision.id, required: true, answers: { none: {} } },
  })
  if (unanswered > 0) throw new ServiceError('Required analysis questions remain unresolved.', 'CONFLICT')
  return { revision, reviewHash }
}

function analysisApprovalPayload(
  command: DecideAnalysisCommand,
  journey: Awaited<ReturnType<typeof journeyOrThrow>>,
  revision: { id: string; contentHash: string },
  reviewHash: string,
) {
  return {
    schemaVersion: qualityJourneyContractVersion,
    approvalId: `analysis-approval:${revision.id}`,
    journeyId: journey.id,
    targetProjectId: journey.targetProjectId,
    analysisRevisionId: revision.id,
    contentHash: revision.contentHash,
    reviewHash,
    decision: 'APPROVED' as const,
    actor: 'USER' as const,
    commandId: command.commandId,
  }
}

async function ensureAnalysisDecision(
  input: {
    command: DecideAnalysisCommand
    journey: Awaited<ReturnType<typeof journeyOrThrow>>
    revision: { id: string; contentHash: string }
    reviewHash: string
  },
  tx: Prisma.TransactionClient,
) {
  const approval = analysisApprovalPayload(input.command, input.journey, input.revision, input.reviewHash)
  const artifact = await createImmutableArtifact(
    {
      journeyId: input.journey.id,
      targetProjectId: input.journey.targetProjectId,
      cycleId: input.journey.activeCycleId,
      identityKey: `JOURNEY_APPROVAL:${approval.approvalId}:unrevisioned`,
      kind: 'JOURNEY_APPROVAL',
      artifactId: approval.approvalId,
      contentHash: hash(approval),
      payload: approval,
    },
    tx,
  )
  const existing = await tx.qualityJourneyAnalysisDecision.findUnique({ where: { commandId: input.command.commandId } })
  if (!existing)
    return tx.qualityJourneyAnalysisDecision.create({
      data: {
        id: `qjad_${input.command.commandId}`,
        journeyId: input.journey.id,
        analysisRevisionId: input.revision.id,
        artifactRecordId: artifact.id,
        commandId: input.command.commandId,
        contentHash: input.revision.contentHash,
        reviewHash: input.reviewHash,
        decision: 'APPROVED',
        actor: 'USER',
      },
    })
  if (
    existing.journeyId !== input.journey.id ||
    existing.analysisRevisionId !== input.revision.id ||
    existing.artifactRecordId !== artifact.id ||
    existing.contentHash !== input.revision.contentHash ||
    existing.reviewHash !== input.reviewHash ||
    existing.decision !== 'APPROVED' ||
    existing.actor !== 'USER'
  )
    throw new ServiceError('Analysis decision replay conflicts with immutable approval identity.', 'CONFLICT')
  return existing
}

async function decideQualityJourneyAnalysisInTransaction(command: DecideAnalysisCommand, tx: Prisma.TransactionClient) {
  const journey = await journeyOrThrow(command.journeyId, command.targetProjectId, tx)
  const { revision, reviewHash } = await decidableAnalysisRevisionOrThrow(command, journey, tx)
  const result = await submitDurableQualityJourneyCommandInTransaction(command, tx)
  if (result.outcome === 'COMMITTED') await ensureAnalysisDecision({ command, journey, revision, reviewHash }, tx)
  return result
}

export async function decideQualityJourneyAnalysis(value: unknown, client: PrismaClient = prisma) {
  const command = journeyCommandSchema.parse(value)
  if (command.command !== 'DECIDE_ANALYSIS' || command.actor !== 'USER')
    throw new ServiceError('Only a user may approve an Analysis Charter.', 'UNAUTHORIZED')
  return client.$transaction(tx => decideQualityJourneyAnalysisInTransaction(command, tx))
}
