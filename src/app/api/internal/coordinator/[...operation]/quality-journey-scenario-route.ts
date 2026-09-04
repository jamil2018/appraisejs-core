import { z } from 'zod'

import { qualityJourneyContractVersion } from '@/lib/quality-journey'
import {
  commentQualityJourneyScenarioPortfolio,
  decideQualityJourneyScenarios,
  disposeQualityJourneyScenarioComment,
  getQualityJourneyScenarioPortfolio,
  publishQualityJourneyScenarioPortfolio,
  requestQualityJourneyScenarioRevision,
  startQualityJourneyScenarioDesign,
  submitQualityJourneyScenarioPortfolio,
} from '@/services/coordinator/quality-journey-scenario-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const target = z.string().min(1)
const portfolioInput = z.record(z.string(), z.unknown())
const submission = z
  .object({
    target,
    workItemId: id,
    attemptId: id,
    leaseId: id,
    ownerToken: z.string().min(1),
    idempotencyKey: id,
    expectedInputHash: digest,
    expectedScopeHash: digest,
    portfolio: portfolioInput,
    result: z.record(z.string(), z.unknown()),
  })
  .strict()
const commandBase = z
  .object({
    target,
    commandId: id,
    expectedStateHash: digest,
    idempotencyKey: id,
    portfolioId: id,
    portfolioRevisionId: id,
    portfolioHash: digest,
  })
  .strict()
const scenarioComment = z
  .object({
    target,
    portfolioRevisionId: id,
    scenarioRevisionId: id.optional(),
    comment: z.string().trim().min(1).max(8_000),
    blocking: z.boolean().default(false),
    actor: z.string().min(1).max(200).optional(),
    idempotencyKey: id,
    expectedReviewHash: digest,
  })
  .strict()
const scenarioCommentDisposition = z
  .object({
    target,
    portfolioRevisionId: id,
    commentId: id,
    actor: z.string().min(1).max(200).optional(),
    idempotencyKey: id,
    expectedReviewHash: digest,
  })
  .strict()

function command(
  value: z.infer<typeof commandBase>,
  journeyId: string,
  targetProjectId: string,
  kind: 'PUBLISH_SCENARIO_PORTFOLIO' | 'DECIDE_SCENARIOS',
  payload: Record<string, unknown>,
) {
  return {
    schemaVersion: qualityJourneyContractVersion,
    commandId: value.commandId,
    journeyId,
    targetProjectId,
    actor: kind === 'PUBLISH_SCENARIO_PORTFOLIO' ? 'RUNNER' : 'USER',
    expectedStateHash: value.expectedStateHash,
    idempotencyKey: value.idempotencyKey,
    inputArtifactRefs: [
      {
        kind: 'SCENARIO_PORTFOLIO_REVISION' as const,
        artifactId: value.portfolioId,
        revisionId: value.portfolioRevisionId,
        contentHash: value.portfolioHash,
      },
    ],
    command: kind,
    payload,
  }
}

async function scopedScenarioResponse(
  value: { target: string },
  handler: (targetProjectId: string) => Promise<unknown>,
  init?: ResponseInit,
) {
  const resolved = await resolveTargetProject(value.target)
  return Response.json(await handler(resolved.id), init)
}

export async function postQualityJourneyScenarioRoute(
  operation: string[],
  body: unknown,
): Promise<Response | undefined> {
  if (
    operation.length !== 5 ||
    operation[0] !== 'quality' ||
    operation[1] !== 'journeys' ||
    operation[3] !== 'scenarios'
  )
    return undefined
  const journeyId = operation[2]!
  if (operation[4] === 'submissions') {
    const { target: targetRef, ...value } = submission.parse(body)
    const resolved = await resolveTargetProject(targetRef)
    return Response.json(
      await submitQualityJourneyScenarioPortfolio({
        ...value,
        journeyId,
        targetProjectId: resolved.id,
        portfolio: {
          ...value.portfolio,
          schemaVersion: qualityJourneyContractVersion,
          journeyId,
          targetProjectId: resolved.id,
        },
      }),
      { status: 201 },
    )
  }
  if (operation[4] === 'starts') {
    const { target: targetRef, ...value } = z
      .object({ target, commandId: id, expectedStateHash: digest, idempotencyKey: id })
      .strict()
      .parse(body)
    const resolved = await resolveTargetProject(targetRef)
    return Response.json(
      await startQualityJourneyScenarioDesign({
        schemaVersion: qualityJourneyContractVersion,
        ...value,
        journeyId,
        targetProjectId: resolved.id,
        actor: 'RUNNER',
        command: 'START_SCENARIO_DESIGN',
        inputArtifactRefs: [],
        payload: {},
      }),
    )
  }
  if (operation[4] === 'publications') {
    const value = commandBase.parse(body)
    const resolved = await resolveTargetProject(value.target)
    return Response.json(
      await publishQualityJourneyScenarioPortfolio(
        command(value, journeyId, resolved.id, 'PUBLISH_SCENARIO_PORTFOLIO', {
          artifactRevisionId: value.portfolioRevisionId,
          artifactHash: value.portfolioHash,
        }),
      ),
    )
  }
  if (operation[4] === 'decisions') {
    const value = commandBase
      .extend({
        approvedScenarioRevisionIds: z.array(id).max(512),
        rejectedScenarioRevisionIds: z.array(id).max(512),
        feedback: z.string().trim().min(1).max(8_000).optional(),
        expectedReviewHash: digest,
      })
      .strict()
      .parse(body)
    const resolved = await resolveTargetProject(value.target)
    return Response.json(
      await decideQualityJourneyScenarios({
        expectedReviewHash: value.expectedReviewHash,
        approvedScenarioRevisionIds: value.approvedScenarioRevisionIds,
        rejectedScenarioRevisionIds: value.rejectedScenarioRevisionIds,
        feedback: value.feedback,
        command: command(value, journeyId, resolved.id, 'DECIDE_SCENARIOS', {
          portfolioRevisionId: value.portfolioRevisionId,
          portfolioHash: value.portfolioHash,
          approvedScenarioRevisionIds: value.approvedScenarioRevisionIds,
          rejectedScenarioRevisionIds: value.rejectedScenarioRevisionIds,
          ...(value.feedback ? { feedback: value.feedback } : {}),
        }),
      }),
    )
  }
  if (operation[4] === 'comments') {
    const { target: targetRef, ...value } = scenarioComment.parse(body)
    return scopedScenarioResponse(
      { target: targetRef },
      targetProjectId =>
        commentQualityJourneyScenarioPortfolio({ ...value, journeyId, targetProjectId, actor: 'USER' }),
      { status: 201 },
    )
  }
  if (operation[4] === 'comment-dispositions') {
    const { target: targetRef, ...value } = scenarioCommentDisposition.parse(body)
    return scopedScenarioResponse({ target: targetRef }, targetProjectId =>
      disposeQualityJourneyScenarioComment({ ...value, journeyId, targetProjectId, actor: 'USER' }),
    )
  }
  if (operation[4] === 'revision-requests') {
    const value = commandBase
      .extend({ feedback: z.string().trim().min(1).max(8_000), expectedReviewHash: digest })
      .strict()
      .parse(body)
    const resolved = await resolveTargetProject(value.target)
    return Response.json(
      await requestQualityJourneyScenarioRevision({
        expectedReviewHash: value.expectedReviewHash,
        command: {
          schemaVersion: qualityJourneyContractVersion,
          commandId: value.commandId,
          journeyId,
          targetProjectId: resolved.id,
          actor: 'USER',
          expectedStateHash: value.expectedStateHash,
          idempotencyKey: value.idempotencyKey,
          inputArtifactRefs: [
            {
              kind: 'SCENARIO_PORTFOLIO_REVISION',
              artifactId: value.portfolioId,
              revisionId: value.portfolioRevisionId,
              contentHash: value.portfolioHash,
            },
          ],
          command: 'REQUEST_SCENARIO_REVISION',
          payload: {
            reviewedRevisionId: value.portfolioRevisionId,
            reviewedHash: value.portfolioHash,
            feedback: value.feedback,
          },
        },
      }),
    )
  }
  return undefined
}

export async function getQualityJourneyScenarioRoute(
  operation: string[],
  query: URLSearchParams,
): Promise<Response | undefined> {
  if (
    operation.length !== 4 ||
    operation[0] !== 'quality' ||
    operation[1] !== 'journeys' ||
    operation[3] !== 'scenarios'
  )
    return undefined
  const resolved = await resolveTargetProject(target.parse(query.get('target')))
  return Response.json(
    await getQualityJourneyScenarioPortfolio({ journeyId: operation[2]!, targetProjectId: resolved.id }),
  )
}
