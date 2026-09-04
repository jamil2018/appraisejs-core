import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  hashScenarioPortfolio,
  qualityJourneyContractVersion,
  scenarioBehavioralIntentHash,
  scenarioEnrichmentHash,
  scenarioLayoutHash,
  scenarioPortfolioReviewHash,
  scenarioPortfolioSchema,
  journeyCommandSchema,
  workerResultEnvelopeSchema,
} from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'
import {
  completeScenarioDesignerWorkInTransaction,
  ensureEligibleQualityJourneyWorkItemsInTransaction,
  refreshQualityJourneyWorkAuthorizationInTransaction,
  submitDurableQualityJourneyCommandInTransaction,
} from './quality-journey-service'

type Db = PrismaClient | Prisma.TransactionClient
const json = canonicalContractJson
const hash = (value: unknown) => `sha256:${createHash('sha256').update(json(value)).digest('hex')}`
const idFor = (kind: string, ...parts: string[]) =>
  `qjs_${kind}_${createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 24)}`
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)

const scenarioSubmissionSchema = z
  .object({
    journeyId: z.string().min(1),
    targetProjectId: z.string().min(1),
    workItemId: z.string().min(1),
    attemptId: z.string().min(1),
    leaseId: z.string().min(1),
    ownerToken: z.string().min(1),
    idempotencyKey: z.string().min(1),
    expectedInputHash: digest,
    expectedScopeHash: digest,
    portfolio: z.unknown(),
    result: workerResultEnvelopeSchema,
  })
  .strict()

const exactScenarioReviewInputSchema = z
  .object({
    journeyId: z.string().min(1),
    targetProjectId: z.string().min(1),
    portfolioRevisionId: z.string().min(1),
    expectedReviewHash: digest,
  })
  .strict()

const scenarioCommentInputSchema = exactScenarioReviewInputSchema
  .extend({
    scenarioRevisionId: z.string().min(1).optional(),
    comment: z.string().trim().min(1).max(8_000),
    blocking: z.boolean().default(false),
    actor: z.string().trim().min(1).max(200),
    idempotencyKey: z.string().min(1),
  })
  .strict()

const scenarioCommentDispositionInputSchema = exactScenarioReviewInputSchema
  .extend({
    commentId: z.string().min(1),
    actor: z.string().trim().min(1).max(200),
    idempotencyKey: z.string().min(1),
  })
  .strict()

function scopeHash(scope: string) {
  return hash(JSON.parse(scope))
}

function requireCommittedScenarioCommand(result: { outcome: string }) {
  if (result.outcome !== 'COMMITTED')
    throw new ServiceError('Scenario lifecycle command did not commit; review records were not changed.', 'CONFLICT')
  return result
}

async function replayDurableScenarioCommand(
  command: { journeyId: string; idempotencyKey: string },
  tx: Prisma.TransactionClient,
) {
  const existing = await tx.qualityJourneyCommand.findUnique({
    where: { journeyId_idempotencyKey: { journeyId: command.journeyId, idempotencyKey: command.idempotencyKey } },
  })
  return existing ? submitDurableQualityJourneyCommandInTransaction(command, tx, true) : null
}

async function currentScenarioCommandContext(
  value: { journeyId: string; targetProjectId: string; idempotencyKey: string },
  tx: Prisma.TransactionClient,
) {
  const replay = await replayDurableScenarioCommand(value, tx)
  if (replay) return { replay }
  return currentPortfolio(value.journeyId, value.targetProjectId, tx)
}

function assertExactDesignerResult(
  result: ReturnType<typeof workerResultEnvelopeSchema.parse>,
  portfolio: ReturnType<typeof scenarioPortfolioSchema.parse>,
  contentHash: string,
) {
  if (result.role !== 'TEST_SCENARIO_DESIGNER' || result.status !== 'COMPLETED')
    throw new ServiceError(
      'Scenario submission requires a completed Test Scenario Designer result envelope.',
      'VALIDATION',
    )
  const expected = [
    {
      kind: 'SCENARIO_PORTFOLIO_REVISION',
      artifactId: portfolio.portfolioId,
      revisionId: portfolio.portfolioRevisionId,
      contentHash,
    },
    ...portfolio.scenarios.map(scenario => ({
      kind: 'SCENARIO_REVISION',
      artifactId: scenario.stableScenarioId,
      revisionId: scenario.scenarioRevisionId,
      contentHash: hash(scenario),
    })),
  ].sort((left, right) => json(left).localeCompare(json(right)))
  const actual = [...result.outputs].sort((left, right) => json(left).localeCompare(json(right)))
  if (json(actual) !== json(expected))
    throw new ServiceError(
      'Scenario Designer result outputs do not exactly match the submitted portfolio revisions.',
      'CONFLICT',
    )
}

async function currentPortfolio(journeyId: string, targetProjectId: string, db: Db) {
  const journey = await db.qualityJourney.findFirst({ where: { id: journeyId, targetProjectId } })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  if (!journey.activeScenarioPortfolioRevisionId)
    throw new ServiceError('Quality Journey has no active scenario portfolio.', 'NOT_FOUND')
  const portfolio = await db.qualityJourneyScenarioPortfolioRevision.findFirst({
    where: { id: journey.activeScenarioPortfolioRevisionId, journeyId },
    include: {
      scenarios: { orderBy: { stableScenarioId: 'asc' }, include: { decisions: true } },
      decisions: true,
      comments: true,
    },
  })
  if (!portfolio) throw new ServiceError('Active scenario portfolio is unavailable.', 'CONFLICT')
  return { journey, portfolio }
}

async function exactScenarioPortfolioUnderReview(
  value: z.infer<typeof exactScenarioReviewInputSchema>,
  db: Db,
  operation: 'comment' | 'comment disposition',
) {
  const { journey, portfolio } = await currentPortfolio(value.journeyId, value.targetProjectId, db)
  if (journey.stage !== 'SCENARIO_REVIEW' || portfolio.artifactRevisionId !== value.portfolioRevisionId)
    throw new ServiceError(`Scenario ${operation} requires the exact portfolio under review.`, 'CONFLICT')
  if (portfolio.reviewHash !== value.expectedReviewHash)
    throw new ServiceError(`Scenario ${operation} review identity is stale.`, 'CONFLICT')
  return { journey, portfolio }
}

async function reviewedScenarioPortfolio(
  value: z.infer<typeof exactScenarioReviewInputSchema>,
  tx: Prisma.TransactionClient,
) {
  const journey = await tx.qualityJourney.findFirst({
    where: { id: value.journeyId, targetProjectId: value.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  const portfolio = await tx.qualityJourneyScenarioPortfolioRevision.findFirst({
    where: { journeyId: journey.id, artifactRevisionId: value.portfolioRevisionId },
  })
  if (!portfolio) throw new ServiceError('Scenario portfolio revision is unavailable.', 'NOT_FOUND')
  return portfolio
}

async function currentScenarioReviewHash(portfolio: { id: string; artifactRecordId: string }, db: Db) {
  const [artifact, comments] = await Promise.all([
    db.qualityJourneyArtifact.findUniqueOrThrow({ where: { id: portfolio.artifactRecordId } }),
    db.qualityJourneyScenarioReviewComment.findMany({
      where: { portfolioRevisionId: portfolio.id },
      orderBy: { id: 'asc' },
    }),
  ])
  return hash({
    portfolio: scenarioPortfolioReviewHash(scenarioPortfolioSchema.parse(JSON.parse(artifact.artifactJson))),
    comments: comments.map(comment => ({
      id: comment.id,
      scenarioRevisionId: comment.scenarioRevisionId,
      blocking: comment.blocking,
      disposition: comment.disposition,
      requestHash: comment.requestHash,
    })),
  })
}

async function assertDiscoveryAuthority(portfolio: ReturnType<typeof scenarioPortfolioSchema.parse>, db: Db) {
  const discovery = await db.qualityJourneyDiscoveryRevision.findFirst({
    where: { id: portfolio.discoveryRevisionId, journeyId: portfolio.journeyId, status: 'COMPLETED' },
  })
  if (!discovery || discovery.completionHash !== portfolio.discoveryCompletionHash)
    throw new ServiceError('Scenario portfolio requires the exact completed discovery revision.', 'CONFLICT')
  const observations = JSON.parse(discovery.targetObservationJson ?? '{}') as {
    observations?: Array<{ observationId: string }>
  }
  const resources = JSON.parse(discovery.resourceResolutionJson ?? '{}') as {
    reusable?: Array<{ resourceId: string }>
    incompatible?: Array<{ resourceId: string }>
    stale?: Array<{ resourceId: string }>
    crossTarget?: Array<{ resourceId: string }>
  }
  const observationIds = new Set((observations.observations ?? []).map(item => item.observationId))
  const resourceIds = new Set(
    [resources.reusable, resources.incompatible, resources.stale, resources.crossTarget]
      .flatMap(items => items ?? [])
      .map(item => item.resourceId),
  )
  for (const scenario of portfolio.scenarios) {
    if (scenario.enrichment.observationIds.some(value => !observationIds.has(value)))
      throw new ServiceError('Scenario fact provenance is not present in completed Scout observations.', 'CONFLICT')
    if (scenario.enrichment.resourceAssumptionIds.some(value => !resourceIds.has(value)))
      throw new ServiceError(
        'Scenario resource assumption is not present in completed Resource Explorer results.',
        'CONFLICT',
      )
  }
  return discovery
}

async function approvedRequirementIds(journeyId: string, db: Db) {
  const journey = await db.qualityJourney.findUniqueOrThrow({ where: { id: journeyId } })
  const active = JSON.parse(journey.activeRevisionIdsJson) as Record<string, string>
  const analysis = active.analysis
    ? await db.qualityJourneyAnalysisRevision.findFirst({
        where: { journeyId, artifactRevisionId: active.analysis },
        include: { artifact: true },
      })
    : null
  if (!analysis) throw new ServiceError('Scenario portfolio requires the active approved analysis.', 'CONFLICT')
  const charter = JSON.parse(analysis.artifact.artifactJson) as { requirements?: Array<{ requirementId: string }> }
  return new Set((charter.requirements ?? []).map(requirement => requirement.requirementId))
}

/** Only an unchanged behavioral intent may retain its exact prior human
 * decision. Feasibility and layout are deliberately not part of that identity. */
async function carryForwardUnchangedScenarioDecisions(
  predecessorPortfolioId: string,
  successorPortfolioId: string,
  tx: Prisma.TransactionClient,
) {
  const [previous, next] = await Promise.all([
    tx.qualityJourneyScenarioRevision.findMany({
      where: { portfolioRevisionId: predecessorPortfolioId },
      include: { decisions: true },
    }),
    tx.qualityJourneyScenarioRevision.findMany({ where: { portfolioRevisionId: successorPortfolioId } }),
  ])
  const nextByStableId = new Map(next.map(scenario => [scenario.stableScenarioId, scenario]))
  for (const scenario of previous) {
    const decision = scenario.decisions[0]
    const successor = nextByStableId.get(scenario.stableScenarioId)
    if (!decision || !successor || successor.behavioralIntentHash !== scenario.behavioralIntentHash) continue
    const requestHash = hash({
      carriedFromDecisionId: decision.id,
      scenarioRevisionId: successor.scenarioRevisionId,
      behavioralIntentHash: successor.behavioralIntentHash,
    })
    await tx.qualityJourneyScenarioDecision.create({
      data: {
        id: idFor('decision-carry', successorPortfolioId, successor.scenarioRevisionId),
        portfolioRevisionId: successorPortfolioId,
        scenarioRevisionId: successor.scenarioRevisionId,
        decision: decision.decision,
        feedback: decision.feedback,
        actor: 'SYSTEM',
        idempotencyKey: `carry-forward:${decision.id}`,
        requestHash,
        contentHash: requestHash,
        carriedFromDecisionId: decision.id,
      },
    })
  }
}

type ScenarioSubmission = z.infer<typeof scenarioSubmissionSchema>
type ScenarioPortfolio = z.infer<typeof scenarioPortfolioSchema>

function scenarioCompletionInput(request: ScenarioSubmission) {
  return {
    journeyId: request.journeyId,
    targetProjectId: request.targetProjectId,
    workItemId: request.workItemId,
    leaseId: request.leaseId,
    ownerToken: request.ownerToken,
    result: request.result,
  }
}

async function scenarioSubmissionLease(request: ScenarioSubmission, journeyId: string, tx: Prisma.TransactionClient) {
  const [item, attempt] = await Promise.all([
    tx.qualityJourneyWorkItem.findFirst({
      where: { id: request.workItemId, journeyId, role: 'TEST_SCENARIO_DESIGNER' },
    }),
    tx.qualityJourneyWorkAttempt.findFirst({
      where: { id: request.attemptId, workItemId: request.workItemId, leaseId: request.leaseId },
    }),
  ])
  const tokenHash = createHash('sha256').update(request.ownerToken).digest('hex')
  if (
    !item ||
    !attempt ||
    attempt.ownerTokenHash !== tokenHash ||
    !['IN_PROGRESS', 'COMPLETED'].includes(attempt.status)
  )
    throw new ServiceError('Scenario portfolio ingress requires the exact active Designer lease.', 'UNAUTHORIZED')
  if (
    item.inputHash !== request.expectedInputHash ||
    scopeHash(item.authorizationScopeJson) !== request.expectedScopeHash
  )
    throw new ServiceError(
      'Scenario submission envelope does not match the exact claimed Designer assignment.',
      'CONFLICT',
    )
  return { item, attempt }
}

async function assertScenarioSubmissionReplayAuthority(
  request: ScenarioSubmission,
  portfolio: { submittedWorkItemId: string; submittedAttemptId: string },
  journeyId: string,
  tx: Prisma.TransactionClient,
) {
  const [item, attempt] = await Promise.all([
    tx.qualityJourneyWorkItem.findUnique({ where: { id: portfolio.submittedWorkItemId } }),
    tx.qualityJourneyWorkAttempt.findUnique({ where: { id: portfolio.submittedAttemptId } }),
  ])
  const authorization = attempt?.authorizationId
    ? await tx.qualityJourneyWorkAuthorization.findUnique({ where: { id: attempt.authorizationId } })
    : null
  if ([item, attempt, authorization].some(value => !value))
    throw new ServiceError('Scenario submission replay authority is invalid.', 'UNAUTHORIZED')
  const leasedItem = item as NonNullable<typeof item>
  const leasedAttempt = attempt as NonNullable<typeof attempt>
  const leasedAuthorization = authorization as NonNullable<typeof authorization>
  const bindings = [
    [portfolio.submittedWorkItemId, request.workItemId],
    [portfolio.submittedAttemptId, request.attemptId],
    [leasedItem.journeyId, journeyId],
    [leasedItem.role, 'TEST_SCENARIO_DESIGNER'],
    [leasedAttempt.workItemId, leasedItem.id],
    [leasedAttempt.leaseId, request.leaseId],
    [leasedAttempt.ownerTokenHash, createHash('sha256').update(request.ownerToken).digest('hex')],
    [leasedAuthorization.workItemId, leasedItem.id],
  ]
  const invalidAuthority = [
    bindings.some(([actual, expected]) => actual !== expected),
    Boolean(leasedAuthorization.revokedAt),
    Boolean(leasedAuthorization.cancelledAt),
    leasedAttempt.status === 'CANCELLED',
  ].some(Boolean)
  if (invalidAuthority) throw new ServiceError('Scenario submission replay authority is invalid.', 'UNAUTHORIZED')
  if (
    leasedItem.inputHash !== request.expectedInputHash ||
    scopeHash(leasedItem.authorizationScopeJson) !== request.expectedScopeHash
  )
    throw new ServiceError('Scenario submission replay envelope is stale.', 'CONFLICT')
}

async function assertScenarioPortfolioSubmissionAuthority(
  portfolio: ScenarioPortfolio,
  journeyId: string,
  tx: Prisma.TransactionClient,
) {
  const [discovery, requirements] = await Promise.all([
    assertDiscoveryAuthority(portfolio, tx),
    approvedRequirementIds(journeyId, tx),
  ])
  if (portfolio.scenarios.some(scenario => scenario.behavioralIntent.requirementIds?.some(id => !requirements.has(id))))
    throw new ServiceError('Scenario traces an unapproved requirement.', 'CONFLICT')
  return discovery
}

async function scenarioPortfolioPredecessor(
  journey: { activeScenarioPortfolioRevisionId: string | null },
  portfolio: ScenarioPortfolio,
  tx: Prisma.TransactionClient,
) {
  if (!journey.activeScenarioPortfolioRevisionId) {
    if (portfolio.predecessorPortfolioRevisionId)
      throw new ServiceError('Initial Scenario Portfolio cannot claim a predecessor revision.', 'CONFLICT')
    return null
  }
  const predecessor = await tx.qualityJourneyScenarioPortfolioRevision.findUnique({
    where: { id: journey.activeScenarioPortfolioRevisionId },
  })
  if (
    !predecessor ||
    predecessor.status !== 'REVISION_REQUIRED' ||
    portfolio.portfolioId !== predecessor.artifactId ||
    portfolio.predecessorPortfolioRevisionId !== predecessor.artifactRevisionId
  )
    throw new ServiceError(
      'Successor Scenario Portfolio must bind the exact revision-requested predecessor.',
      'CONFLICT',
    )
  return predecessor
}

async function persistScenarioPortfolioSubmission(
  request: ScenarioSubmission,
  portfolio: ScenarioPortfolio,
  contentHash: string,
  submissionHash: string,
  journey: { id: string; targetProjectId: string; activeCycleId: string },
  discovery: { id: string; completionHash: string | null },
  predecessor: { id: string } | null,
  item: { id: string },
  attempt: { id: string },
  tx: Prisma.TransactionClient,
) {
  const [priorCount, artifact] = await Promise.all([
    tx.qualityJourneyScenarioPortfolioRevision.count({ where: { journeyId: journey.id } }),
    tx.qualityJourneyArtifact.create({
      data: {
        id: idFor('artifact', journey.id, portfolio.portfolioId, portfolio.portfolioRevisionId),
        identityKey: `SCENARIO_PORTFOLIO_REVISION:${portfolio.portfolioId}:${portfolio.portfolioRevisionId}`,
        journeyId: journey.id,
        targetProjectId: journey.targetProjectId,
        cycleId: journey.activeCycleId,
        kind: 'SCENARIO_PORTFOLIO_REVISION',
        artifactId: portfolio.portfolioId,
        revisionId: portfolio.portfolioRevisionId,
        contentHash,
        artifactJson: json(portfolio),
      },
    }),
  ])
  const created = await tx.qualityJourneyScenarioPortfolioRevision.create({
    data: {
      id: idFor('portfolio', journey.id, portfolio.portfolioRevisionId),
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      cycleId: journey.activeCycleId,
      discoveryRevisionId: discovery.id,
      discoveryCompletionHash: discovery.completionHash!,
      ...(predecessor ? { predecessorPortfolioRevisionId: predecessor.id } : {}),
      artifactRecordId: artifact.id,
      artifactId: portfolio.portfolioId,
      artifactRevisionId: portfolio.portfolioRevisionId,
      revision: priorCount + 1,
      contentHash,
      behavioralIntentHash: hash(
        portfolio.scenarios.map(s => ({ id: s.scenarioRevisionId, intent: s.behavioralIntent })),
      ),
      enrichmentHash: hash(portfolio.scenarios.map(s => ({ id: s.scenarioRevisionId, enrichment: s.enrichment }))),
      layoutHash: hash(portfolio.scenarios.map(s => ({ id: s.scenarioRevisionId, layout: s.layout }))),
      coverageRationale: portfolio.coverageRationale,
      graphJson: json(portfolio.graph),
      submissionIdempotencyKey: request.idempotencyKey,
      submissionHash,
      submittedWorkItemId: item.id,
      submittedAttemptId: attempt.id,
    },
  })
  await tx.qualityJourneyScenarioRevision.createMany({
    data: portfolio.scenarios.map(scenario => ({
      id: idFor('scenario', created.id, scenario.scenarioRevisionId),
      portfolioRevisionId: created.id,
      stableScenarioId: scenario.stableScenarioId,
      scenarioRevisionId: scenario.scenarioRevisionId,
      behavioralIntentJson: json(scenario.behavioralIntent),
      behavioralIntentHash: scenarioBehavioralIntentHash(scenario.behavioralIntent),
      enrichmentJson: json(scenario.enrichment),
      enrichmentHash: scenarioEnrichmentHash(scenario.enrichment),
      layoutJson: json(scenario.layout),
      layoutHash: scenarioLayoutHash(scenario.layout),
      contentHash: hash(scenario),
    })),
  })
  if (predecessor) await carryForwardUnchangedScenarioDecisions(predecessor.id, created.id, tx)
  return created
}

async function submitScenarioPortfolioInTransaction(
  request: ScenarioSubmission,
  portfolio: ScenarioPortfolio,
  contentHash: string,
  submissionHash: string,
  tx: Prisma.TransactionClient,
) {
  const journey = await tx.qualityJourney.findFirst({
    where: { id: request.journeyId, targetProjectId: request.targetProjectId },
  })
  if (!journey) throw new ServiceError('Scenario design is not active for this journey.', 'CONFLICT')
  const existing = await tx.qualityJourneyScenarioPortfolioRevision.findFirst({
    where: { journeyId: journey.id, submissionIdempotencyKey: request.idempotencyKey },
  })
  if (existing) {
    if (existing.contentHash !== contentHash || existing.submissionHash !== submissionHash)
      throw new ServiceError('Scenario submission idempotency key was reused.', 'CONFLICT')
    await assertScenarioSubmissionReplayAuthority(request, existing, journey.id, tx)
    return { replayed: true, portfolio: existing }
  }
  if (journey.stage !== 'SCENARIO_DESIGN')
    throw new ServiceError('Scenario design is not active for this journey.', 'CONFLICT')
  if (portfolio.cycleId !== journey.activeCycleId)
    throw new ServiceError('Scenario portfolio cycle does not match the active journey cycle.', 'CONFLICT')
  const { item, attempt } = await scenarioSubmissionLease(request, journey.id, tx)
  const discovery = await assertScenarioPortfolioSubmissionAuthority(portfolio, journey.id, tx)
  const predecessor = await scenarioPortfolioPredecessor(journey, portfolio, tx)
  const created = await persistScenarioPortfolioSubmission(
    request,
    portfolio,
    contentHash,
    submissionHash,
    journey,
    discovery,
    predecessor,
    item,
    attempt,
    tx,
  )
  await completeScenarioDesignerWorkInTransaction(scenarioCompletionInput(request), tx)
  await tx.qualityJourney.update({ where: { id: journey.id }, data: { activeScenarioPortfolioRevisionId: created.id } })
  return { replayed: false, portfolio: created }
}

export async function submitQualityJourneyScenarioPortfolio(input: unknown, client: PrismaClient = prisma) {
  const request = scenarioSubmissionSchema.parse(input)
  const portfolio = scenarioPortfolioSchema.parse(request.portfolio)
  if (portfolio.journeyId !== request.journeyId || portfolio.targetProjectId !== request.targetProjectId)
    throw new ServiceError('Scenario portfolio scope does not match the leased journey.', 'CONFLICT')
  const contentHash = hashScenarioPortfolio(portfolio)
  assertExactDesignerResult(request.result, portfolio, contentHash)
  const submissionHash = hash({ ...request, ownerToken: undefined })
  return client.$transaction(tx =>
    submitScenarioPortfolioInTransaction(request, portfolio, contentHash, submissionHash, tx),
  )
}

async function configureScenarioDesignerAssignment(
  journey: { id: string },
  discovery: {
    id: string
    analysisArtifactId: string
    analysisRevisionArtifactId: string
    analysisRevisionContentHash: string
    completionHash: string | null
    targetObservationHash: string | null
    resourceResolutionHash: string | null
  },
  tx: Prisma.TransactionClient,
) {
  const item = await tx.qualityJourneyWorkItem.findFirst({
    where: { journeyId: journey.id, role: 'TEST_SCENARIO_DESIGNER' },
    orderBy: { createdAt: 'desc' },
  })
  if (!item) return
  await tx.qualityJourneyWorkItem.update({
    where: { id: item.id },
    data: {
      inputArtifactRefsJson: json([
        {
          kind: 'ANALYSIS_CHARTER_REVISION',
          artifactId: discovery.analysisArtifactId,
          revisionId: discovery.analysisRevisionArtifactId,
          contentHash: discovery.analysisRevisionContentHash,
        },
        {
          kind: 'TARGET_OBSERVATION_BUNDLE',
          artifactId: discovery.id,
          contentHash: discovery.targetObservationHash!,
        },
        {
          kind: 'RESOURCE_RESOLUTION_BUNDLE',
          artifactId: discovery.id,
          contentHash: discovery.resourceResolutionHash!,
        },
      ]),
      authorizationScopeJson: json({
        discoveryRevisionId: discovery.id,
        completionHash: discovery.completionHash,
        permittedTools: ['artifact.read', 'evidence.publish'],
      }),
    },
  })
  await refreshQualityJourneyWorkAuthorizationInTransaction(journey.id, item.id, tx)
}

export async function startQualityJourneyScenarioDesign(command: unknown, client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    const value = command as { journeyId: string; targetProjectId: string }
    const journey = await tx.qualityJourney.findFirst({
      where: { id: value.journeyId, targetProjectId: value.targetProjectId },
    })
    const discovery = journey?.activeDiscoveryRevisionId
      ? await tx.qualityJourneyDiscoveryRevision.findUnique({ where: { id: journey.activeDiscoveryRevisionId } })
      : null
    if (!journey || !discovery || discovery.status !== 'COMPLETED')
      throw new ServiceError('Scenario design requires exact completed discovery authority.', 'CONFLICT')
    const result = await submitDurableQualityJourneyCommandInTransaction(command, tx, true)
    if (result.outcome === 'COMMITTED' && !result.replayed)
      await configureScenarioDesignerAssignment(journey, discovery, tx)
    return result
  })
}

export async function publishQualityJourneyScenarioPortfolio(command: unknown, client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    const value = command as {
      journeyId: string
      targetProjectId: string
      idempotencyKey: string
      payload: { artifactRevisionId: string; artifactHash: string }
    }
    const context = await currentScenarioCommandContext(value, tx)
    if ('replay' in context) return context.replay
    const { journey, portfolio } = context
    if (
      journey.stage !== 'SCENARIO_DESIGN' ||
      portfolio.artifactRevisionId !== value.payload.artifactRevisionId ||
      portfolio.contentHash !== value.payload.artifactHash
    )
      throw new ServiceError('Only the exact current scenario portfolio may be published.', 'CONFLICT')
    const result = requireCommittedScenarioCommand(
      await submitDurableQualityJourneyCommandInTransaction(command, tx, true),
    )
    const reviewHash = await currentScenarioReviewHash(portfolio, tx)
    await tx.qualityJourneyScenarioPortfolioRevision.update({
      where: { id: portfolio.id },
      data: { status: 'IN_REVIEW', reviewHash, reviewedAt: new Date() },
    })
    const reviewed = await currentPortfolio(journey.id, journey.targetProjectId, tx)
    if (reviewed.portfolio.decisions.length !== reviewed.portfolio.scenarios.length) return result
    return finalizeScenarioDecisions(
      {
        command: {
          schemaVersion: qualityJourneyContractVersion,
          commandId: `finalize-carried-scenarios:${portfolio.id}`,
          journeyId: journey.id,
          targetProjectId: journey.targetProjectId,
          actor: 'USER',
          command: 'DECIDE_SCENARIOS',
          expectedStateHash: reviewed.journey.stateHash,
          idempotencyKey: `finalize-carried-scenarios:${portfolio.id}`,
          inputArtifactRefs: [
            {
              kind: 'SCENARIO_PORTFOLIO_REVISION',
              artifactId: portfolio.artifactId,
              revisionId: portfolio.artifactRevisionId,
              contentHash: portfolio.contentHash,
            },
          ],
          payload: { portfolioHash: portfolio.contentHash },
        },
        expectedReviewHash: reviewHash,
        approvedScenarioRevisionIds: [],
        rejectedScenarioRevisionIds: [],
      },
      journey.id,
      reviewed.portfolio,
      reviewed.portfolio.comments.filter(comment => comment.blocking && comment.disposition === 'OPEN'),
      tx,
    )
  })
}

const scenarioRevisionRequestSchema = z
  .object({
    command: z.unknown(),
    expectedReviewHash: digest,
  })
  .strict()
type ScenarioRevisionRequest = z.infer<typeof scenarioRevisionRequestSchema>
type ScenarioRevisionCommand = {
  journeyId: string
  targetProjectId: string
  idempotencyKey: string
  inputArtifactRefs: unknown[]
  payload: { reviewedRevisionId: string; reviewedHash: string; feedback: string }
}

async function replayScenarioRevisionRequest(
  request: ScenarioRevisionRequest,
  value: { journeyId: string; idempotencyKey: string },
  tx: Prisma.TransactionClient,
) {
  const requestHash = hash(request)
  const receipt = await tx.qualityJourneyScenarioDecisionReceipt.findUnique({
    where: { journeyId_idempotencyKey: { journeyId: value.journeyId, idempotencyKey: value.idempotencyKey } },
  })
  if (!receipt) return { requestHash }
  if (receipt.requestHash !== requestHash)
    throw new ServiceError('Scenario revision request idempotency key was reused.', 'CONFLICT')
  return { requestHash, replay: { ...(JSON.parse(receipt.resultJson) as Record<string, unknown>), replayed: true } }
}

function assertScenarioRevisionRequestIdentity(
  request: ScenarioRevisionRequest,
  value: ScenarioRevisionCommand,
  context: Awaited<ReturnType<typeof currentPortfolio>>,
) {
  const { journey, portfolio } = context
  const expectedArtifact = {
    kind: 'SCENARIO_PORTFOLIO_REVISION',
    artifactId: portfolio.artifactId,
    revisionId: portfolio.artifactRevisionId,
    contentHash: portfolio.contentHash,
  }
  const validPortfolio = [
    journey.stage === 'SCENARIO_REVIEW',
    portfolio.artifactRevisionId === value.payload.reviewedRevisionId,
    portfolio.contentHash === value.payload.reviewedHash,
    portfolio.reviewHash === request.expectedReviewHash,
    value.inputArtifactRefs?.length === 1,
    json(value.inputArtifactRefs[0]) === json(expectedArtifact),
  ].every(Boolean)
  if (!validPortfolio)
    throw new ServiceError(
      'Scenario revision request must bind the exact reviewed portfolio and review identity.',
      'CONFLICT',
    )
}

async function persistScenarioRevisionRequest(
  value: ScenarioRevisionCommand,
  requestHash: string,
  context: Awaited<ReturnType<typeof currentPortfolio>>,
  tx: Prisma.TransactionClient,
) {
  const { journey, portfolio } = context
  const result = requireCommittedScenarioCommand(
    await submitDurableQualityJourneyCommandInTransaction(value, tx, true, false),
  )
  await tx.qualityJourneyScenarioPortfolioRevision.update({
    where: { id: portfolio.id },
    data: { status: 'REVISION_REQUIRED', supersededAt: new Date() },
  })
  await ensureEligibleQualityJourneyWorkItemsInTransaction(journey.id, tx)
  await tx.qualityJourneyScenarioDecisionReceipt.create({
    data: {
      id: idFor('scenario-revision-receipt', portfolio.id, value.idempotencyKey),
      journeyId: journey.id,
      portfolioRevisionId: portfolio.id,
      idempotencyKey: value.idempotencyKey,
      requestHash,
      resultJson: json(result),
    },
  })
  return result
}

async function requestScenarioRevisionInTransaction(request: ScenarioRevisionRequest, tx: Prisma.TransactionClient) {
  const value = request.command as ScenarioRevisionCommand
  const replay = await replayScenarioRevisionRequest(request, value, tx)
  if ('replay' in replay) return replay.replay
  const context = await currentScenarioCommandContext(value, tx)
  if ('replay' in context) return context.replay
  assertScenarioRevisionRequestIdentity(request, value, context)
  return persistScenarioRevisionRequest(value, replay.requestHash, context, tx)
}

export async function requestQualityJourneyScenarioRevision(command: unknown, client: PrismaClient = prisma) {
  const request = scenarioRevisionRequestSchema.parse(command)
  return client.$transaction(tx => requestScenarioRevisionInTransaction(request, tx))
}

type ScenarioDecisionInput = {
  command: {
    schemaVersion: string
    commandId: string
    journeyId: string
    targetProjectId: string
    actor: string
    command: string
    expectedStateHash: string
    idempotencyKey: string
    inputArtifactRefs: unknown[]
    payload: { portfolioHash: string }
  }
  expectedReviewHash: string
  approvedScenarioRevisionIds: string[]
  rejectedScenarioRevisionIds: string[]
  feedback?: string
}
type CurrentScenarioPortfolio = Awaited<ReturnType<typeof currentPortfolio>>['portfolio']

function scenarioDecisionMap(value: ScenarioDecisionInput, portfolio: CurrentScenarioPortfolio) {
  const decisions = new Map<string, 'APPROVED' | 'REJECTED'>()
  for (const id of value.approvedScenarioRevisionIds) decisions.set(id, 'APPROVED')
  for (const id of value.rejectedScenarioRevisionIds) {
    if (decisions.has(id)) throw new ServiceError('A scenario cannot receive contradictory decisions.', 'VALIDATION')
    decisions.set(id, 'REJECTED')
  }
  const known = new Set(portfolio.scenarios.map(scenario => scenario.scenarioRevisionId))
  if ([...decisions.keys()].some(id => !known.has(id)))
    throw new ServiceError('Scenario decision references a foreign revision.', 'CONFLICT')
  if ([...decisions.values()].includes('REJECTED') && !value.feedback)
    throw new ServiceError('Rejected scenario decisions require scenario-specific feedback.', 'VALIDATION')
  return decisions
}

function assertScenarioDecisionNotBlocked(
  decisions: Map<string, 'APPROVED' | 'REJECTED'>,
  portfolio: CurrentScenarioPortfolio,
) {
  const openBlocking = portfolio.comments.filter(comment => comment.blocking && comment.disposition === 'OPEN')
  const blocksApproval = [...decisions].some(
    ([scenarioRevisionId, decision]) =>
      decision === 'APPROVED' &&
      openBlocking.some(comment => !comment.scenarioRevisionId || comment.scenarioRevisionId === scenarioRevisionId),
  )
  if (blocksApproval)
    throw new ServiceError('An approved scenario cannot have an open blocking review comment.', 'CONFLICT')
  return openBlocking
}

function assertDecisionCommandAuthority(command: ReturnType<typeof journeyCommandSchema.parse>) {
  if (command.command !== 'DECIDE_SCENARIOS' || command.actor !== 'USER')
    throw new ServiceError('Scenario decisions require the exact User decision command.', 'UNAUTHORIZED')
}

function assertDecisionStateIdentity(
  command: ReturnType<typeof journeyCommandSchema.parse>,
  journey: { stateHash: string },
) {
  if (command.expectedStateHash !== journey.stateHash)
    throw new ServiceError('Scenario decision state identity is stale.', 'CONFLICT')
}

function assertDecisionPortfolioIdentity(
  value: ScenarioDecisionInput,
  journey: { stage: string },
  portfolio: { reviewHash: string | null; contentHash: string },
) {
  if (
    journey.stage !== 'SCENARIO_REVIEW' ||
    portfolio.reviewHash !== value.expectedReviewHash ||
    portfolio.contentHash !== value.command.payload.portfolioHash
  )
    throw new ServiceError('Scenario decision must bind the exact reviewed portfolio.', 'CONFLICT')
}

async function exactScenarioDecisionContext(value: ScenarioDecisionInput, tx: Prisma.TransactionClient) {
  const { journey, portfolio } = await currentPortfolio(value.command.journeyId, value.command.targetProjectId, tx)
  const command = journeyCommandSchema.parse(value.command)
  assertDecisionCommandAuthority(command)
  assertDecisionStateIdentity(command, journey)
  assertDecisionPortfolioIdentity(value, journey, portfolio)
  const expectedArtifact = {
    kind: 'SCENARIO_PORTFOLIO_REVISION',
    artifactId: portfolio.artifactId,
    revisionId: portfolio.artifactRevisionId,
    contentHash: portfolio.contentHash,
  }
  if (
    value.command.inputArtifactRefs?.length !== 1 ||
    json(value.command.inputArtifactRefs[0]) !== json(expectedArtifact)
  )
    throw new ServiceError('Scenario decision must bind exactly the reviewed portfolio artifact.', 'CONFLICT')
  return { journey, portfolio }
}

async function persistScenarioDecisions(
  value: ScenarioDecisionInput,
  decisions: Map<string, 'APPROVED' | 'REJECTED'>,
  portfolio: CurrentScenarioPortfolio,
  tx: Prisma.TransactionClient,
) {
  for (const [scenarioRevisionId, decision] of decisions) {
    const requestHash = hash({ scenarioRevisionId, decision, feedback: value.feedback ?? null })
    const existing = await tx.qualityJourneyScenarioDecision.findUnique({
      where: { portfolioRevisionId_scenarioRevisionId: { portfolioRevisionId: portfolio.id, scenarioRevisionId } },
    })
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ServiceError('Scenario decisions are append-only and cannot be reversed.', 'CONFLICT')
      continue
    }
    await tx.qualityJourneyScenarioDecision.create({
      data: {
        id: idFor('decision', portfolio.id, scenarioRevisionId),
        portfolioRevisionId: portfolio.id,
        scenarioRevisionId,
        decision,
        feedback: value.feedback ?? null,
        actor: 'USER',
        idempotencyKey: `${value.command.idempotencyKey}:${scenarioRevisionId}`,
        requestHash,
        contentHash: requestHash,
      },
    })
  }
}

async function finalizeScenarioDecisions(
  value: ScenarioDecisionInput,
  journeyId: string,
  portfolio: CurrentScenarioPortfolio,
  openBlocking: CurrentScenarioPortfolio['comments'],
  tx: Prisma.TransactionClient,
) {
  const all = await tx.qualityJourneyScenarioDecision.findMany({ where: { portfolioRevisionId: portfolio.id } })
  if (all.length !== portfolio.scenarios.length)
    return {
      outcome: 'PARTIAL',
      portfolioRevisionId: portfolio.artifactRevisionId,
      classifiedScenarioRevisionIds: all.map(decision => decision.scenarioRevisionId).sort(),
    }
  if (openBlocking.length)
    throw new ServiceError('Final scenario approval requires disposition of every blocking review comment.', 'CONFLICT')
  const approved = all.filter(decision => decision.decision === 'APPROVED').map(decision => decision.scenarioRevisionId)
  const approvedRows = portfolio.scenarios.filter(scenario => approved.includes(scenario.scenarioRevisionId))
  const requirements = await approvedRequirementIds(journeyId, tx)
  const covered = new Set(
    approvedRows.flatMap(
      scenario => (JSON.parse(scenario.behavioralIntentJson) as { requirementIds?: string[] }).requirementIds ?? [],
    ),
  )
  if (!approved.length || [...requirements].some(id => !covered.has(id)))
    throw new ServiceError(
      'Final scenario approval requires approved coverage for every mandatory requirement.',
      'CONFLICT',
    )
  const completeCommand = {
    ...value.command,
    payload: {
      ...value.command.payload,
      portfolioRevisionId: portfolio.artifactRevisionId,
      portfolioHash: portfolio.contentHash,
      approvedScenarioRevisionIds: approved.sort(),
      rejectedScenarioRevisionIds: all
        .filter(decision => decision.decision === 'REJECTED')
        .map(decision => decision.scenarioRevisionId)
        .sort(),
      ...(value.feedback ? { feedback: value.feedback } : {}),
    },
  }
  const result = requireCommittedScenarioCommand(
    await submitDurableQualityJourneyCommandInTransaction(completeCommand, tx, true),
  )
  await tx.qualityJourneyScenarioPortfolioRevision.update({
    where: { id: portfolio.id },
    data: {
      status: 'APPROVED',
      approvedIntentHash: hash(
        approvedRows.map(row => ({
          scenarioRevisionId: row.scenarioRevisionId,
          behavioralIntentHash: row.behavioralIntentHash,
        })),
      ),
      approvedCoverageHash: hash([...covered].sort()),
      decisionSetHash: hash(
        all
          .map(decision => ({
            scenarioRevisionId: decision.scenarioRevisionId,
            decision: decision.decision,
            contentHash: decision.contentHash,
          }))
          .sort((left, right) => left.scenarioRevisionId.localeCompare(right.scenarioRevisionId)),
      ),
    },
  })
  return result
}

async function decideQualityJourneyScenariosInTransaction(value: ScenarioDecisionInput, tx: Prisma.TransactionClient) {
  const receipt = await tx.qualityJourneyScenarioDecisionReceipt.findUnique({
    where: {
      journeyId_idempotencyKey: { journeyId: value.command.journeyId, idempotencyKey: value.command.idempotencyKey },
    },
  })
  const requestHash = hash(value)
  if (receipt) {
    if (receipt.requestHash !== requestHash)
      throw new ServiceError('Scenario decision idempotency key was reused.', 'CONFLICT')
    return { ...(JSON.parse(receipt.resultJson) as Record<string, unknown>), replayed: true }
  }
  const priorCommand = await tx.qualityJourneyCommand.findUnique({
    where: {
      journeyId_idempotencyKey: { journeyId: value.command.journeyId, idempotencyKey: value.command.idempotencyKey },
    },
  })
  if (priorCommand) {
    if (priorCommand.requestHash !== hash(value.command))
      throw new ServiceError('Scenario decision idempotency key was reused.', 'CONFLICT')
    return { ...(JSON.parse(priorCommand.resultJson) as Record<string, unknown>), replayed: true }
  }
  const { journey, portfolio } = await exactScenarioDecisionContext(value, tx)
  const decisions = scenarioDecisionMap(value, portfolio)
  const openBlocking = assertScenarioDecisionNotBlocked(decisions, portfolio)
  await persistScenarioDecisions(value, decisions, portfolio, tx)
  const result = await finalizeScenarioDecisions(value, journey.id, portfolio, openBlocking, tx)
  await tx.qualityJourneyScenarioDecisionReceipt.create({
    data: {
      id: idFor('decision-receipt', portfolio.id, value.command.idempotencyKey),
      journeyId: journey.id,
      portfolioRevisionId: portfolio.id,
      idempotencyKey: value.command.idempotencyKey,
      requestHash,
      resultJson: json(result),
    },
  })
  return result
}

export async function decideQualityJourneyScenarios(input: unknown, client: PrismaClient = prisma) {
  return client.$transaction(tx => decideQualityJourneyScenariosInTransaction(input as ScenarioDecisionInput, tx))
}

export async function getQualityJourneyScenarioPortfolio(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  const { journey, portfolio } = await currentPortfolio(input.journeyId, input.targetProjectId, client)
  return { activeScenarioPortfolioRevisionId: journey.activeScenarioPortfolioRevisionId, portfolio }
}

export async function commentQualityJourneyScenarioPortfolio(input: unknown, client: PrismaClient = prisma) {
  const value = scenarioCommentInputSchema.parse(input)
  return client.$transaction(async tx => {
    const reviewed = await reviewedScenarioPortfolio(value, tx)
    const requestHash = hash(value)
    const existing = await tx.qualityJourneyScenarioReviewComment.findUnique({
      where: {
        portfolioRevisionId_idempotencyKey: { portfolioRevisionId: reviewed.id, idempotencyKey: value.idempotencyKey },
      },
    })
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ServiceError('Scenario comment idempotency key was reused.', 'CONFLICT')
      if (existing.createResponseJson)
        return { ...(JSON.parse(existing.createResponseJson) as Record<string, unknown>), replayed: true }
      return { replayed: true, comment: existing, reviewHash: reviewed.reviewHash }
    }
    const { portfolio } = await exactScenarioPortfolioUnderReview(value, tx, 'comment')
    if (
      value.scenarioRevisionId &&
      !portfolio.scenarios.some(scenario => scenario.scenarioRevisionId === value.scenarioRevisionId)
    )
      throw new ServiceError('Scenario comment references a foreign scenario revision.', 'CONFLICT')
    const comment = await tx.qualityJourneyScenarioReviewComment.create({
      data: {
        id: idFor('comment', portfolio.id, value.idempotencyKey),
        portfolioRevisionId: portfolio.id,
        scenarioRevisionId: value.scenarioRevisionId ?? null,
        comment: value.comment,
        blocking: value.blocking,
        disposition: 'OPEN',
        actor: value.actor,
        idempotencyKey: value.idempotencyKey,
        requestHash,
      },
    })
    const reviewHash = await currentScenarioReviewHash(portfolio, tx)
    await tx.qualityJourneyScenarioPortfolioRevision.update({ where: { id: portfolio.id }, data: { reviewHash } })
    const response = { replayed: false, comment, reviewHash }
    await tx.qualityJourneyScenarioReviewComment.update({
      where: { id: comment.id },
      data: { createResponseJson: json(response) },
    })
    return response
  })
}

export async function disposeQualityJourneyScenarioComment(input: unknown, client: PrismaClient = prisma) {
  const value = scenarioCommentDispositionInputSchema.parse(input)
  return client.$transaction(async tx => {
    const reviewed = await reviewedScenarioPortfolio(value, tx)
    const requestHash = hash(value)
    const priorReceipt = await tx.qualityJourneyScenarioReviewComment.findUnique({
      where: {
        portfolioRevisionId_dispositionIdempotencyKey: {
          portfolioRevisionId: reviewed.id,
          dispositionIdempotencyKey: value.idempotencyKey,
        },
      },
    })
    if (priorReceipt) {
      if (priorReceipt.dispositionRequestHash !== requestHash)
        throw new ServiceError('Scenario comment disposition idempotency key was reused.', 'CONFLICT')
      if (priorReceipt.dispositionResponseJson)
        return { ...(JSON.parse(priorReceipt.dispositionResponseJson) as Record<string, unknown>), replayed: true }
      return { replayed: true, comment: priorReceipt, reviewHash: reviewed.reviewHash }
    }
    const { portfolio } = await exactScenarioPortfolioUnderReview(value, tx, 'comment disposition')
    const comment = await tx.qualityJourneyScenarioReviewComment.findFirst({
      where: { id: value.commentId, portfolioRevisionId: portfolio.id },
    })
    if (!comment) throw new ServiceError('Scenario review comment was not found for this portfolio.', 'NOT_FOUND')
    if (comment.disposition !== 'OPEN')
      throw new ServiceError('Scenario comment disposition has already been recorded with another receipt.', 'CONFLICT')
    const disposed = await tx.qualityJourneyScenarioReviewComment.update({
      where: { id: comment.id },
      data: {
        disposition: 'DISPOSED',
        disposedAt: new Date(),
        disposedBy: value.actor,
        dispositionIdempotencyKey: value.idempotencyKey,
        dispositionRequestHash: requestHash,
      },
    })
    const reviewHash = await currentScenarioReviewHash(portfolio, tx)
    await tx.qualityJourneyScenarioPortfolioRevision.update({ where: { id: portfolio.id }, data: { reviewHash } })
    const response = { replayed: false, comment: disposed, reviewHash }
    await tx.qualityJourneyScenarioReviewComment.update({
      where: { id: comment.id },
      data: { dispositionResponseJson: json(response) },
    })
    return response
  })
}
