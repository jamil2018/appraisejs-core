import { z } from 'zod'

import { qualityJourneyContractVersion } from '@/lib/quality-journey'
import {
  getQualityJourneyScenarioPortfolio,
  publishQualityJourneyScenarioPortfolio,
  submitExternalQualityJourneyScenarioPortfolio,
  startQualityJourneyScenarioDesign,
  submitQualityJourneyScenarioPortfolio,
} from '@/services/coordinator/quality-journey-scenario-service'
import type { ExternalAnalyzerProjectPrincipal } from '@/services/coordinator/quality-journey-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'
import { ServiceError } from '@/services/shared/errors'
import type { CoordinatorSessionCredentials } from '@/services/coordinator/quality-journey-coordinator-session'

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
const externalSubmission = submission
  .omit({ ownerToken: true, idempotencyKey: true })
  .extend({
    assignmentId: id,
    assignmentGeneration: z.number().int().positive(),
    assignmentSecret: z.string().min(32).max(2_000),
    idempotencyKey: id,
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
function command(
  value: z.infer<typeof commandBase>,
  journeyId: string,
  targetProjectId: string,
  kind: 'PUBLISH_SCENARIO_PORTFOLIO',
  payload: Record<string, unknown>,
) {
  return {
    schemaVersion: qualityJourneyContractVersion,
    commandId: value.commandId,
    journeyId,
    targetProjectId,
    actor: 'RUNNER',
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

export async function postQualityJourneyScenarioRoute(
  operation: string[],
  body: unknown,
  coordinatorSession?: CoordinatorSessionCredentials,
  principal?: ExternalAnalyzerProjectPrincipal,
): Promise<Response | undefined> {
  if (
    operation.length !== 5 ||
    operation[0] !== 'quality' ||
    operation[1] !== 'journeys' ||
    operation[3] !== 'scenarios'
  )
    return undefined
  const journeyId = operation[2]!
  if (operation[4] === 'external-submissions') {
    if (!principal) throw new ServiceError('External project principal is unavailable.', 'UNAUTHORIZED')
    const { target: targetRef, ...value } = externalSubmission.parse(body)
    const resolved = await resolveTargetProject(targetRef)
    return Response.json(
      await submitExternalQualityJourneyScenarioPortfolio(
        {
          ...value,
          journeyId,
          targetProjectId: resolved.id,
          portfolio: {
            ...value.portfolio,
            schemaVersion: qualityJourneyContractVersion,
            journeyId,
            targetProjectId: resolved.id,
          },
        },
        principal,
        undefined,
        coordinatorSession,
      ),
      { status: 201 },
    )
  }
  if (operation[4] === 'submissions') {
    const { target: targetRef, ...value } = submission.parse(body)
    const resolved = await resolveTargetProject(targetRef)
    return Response.json(
      await submitQualityJourneyScenarioPortfolio(
        {
          ...value,
          journeyId,
          targetProjectId: resolved.id,
          portfolio: {
            ...value.portfolio,
            schemaVersion: qualityJourneyContractVersion,
            journeyId,
            targetProjectId: resolved.id,
          },
        },
        undefined,
        coordinatorSession,
      ),
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
      await startQualityJourneyScenarioDesign(
        {
          schemaVersion: qualityJourneyContractVersion,
          ...value,
          journeyId,
          targetProjectId: resolved.id,
          actor: 'RUNNER',
          command: 'START_SCENARIO_DESIGN',
          inputArtifactRefs: [],
          payload: {},
        },
        undefined,
        coordinatorSession,
      ),
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
        undefined,
        coordinatorSession,
      ),
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
