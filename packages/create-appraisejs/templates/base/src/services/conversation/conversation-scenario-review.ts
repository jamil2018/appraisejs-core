import type { Prisma } from '@prisma/client'

import type { ChatScenarioReview } from '@/lib/conversation/scenario-review'
import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import { recordQualityJourneyScenarioDecisionInTransaction } from '@/services/coordinator/quality-journey-scenario-service'
import { ServiceError } from '@/services/shared/errors'

export async function approveConversationScenarios(
  tx: Prisma.TransactionClient,
  input: ChatScenarioReview & { targetProjectId: string; conversationId: string; key: string },
) {
  const { journeyId, targetProjectId, conversationId, key, portfolioId, portfolioRevisionId, portfolioHash } = input
  const approvedScenarioRevisionIds = [...new Set(input.pendingScenarioRevisionIds)].sort()
  const revision = await tx.qualityJourneyScenarioPortfolioRevision.findFirst({
    where: { journeyId, targetProjectId, artifactRevisionId: portfolioRevisionId },
    select: {
      reviewHash: true,
      scenarios: { where: { decisions: { none: {} } }, select: { scenarioRevisionId: true } },
    },
  })
  if (
    revision?.reviewHash !== input.reviewHash ||
    approvedScenarioRevisionIds.length !== revision.scenarios.length ||
    !revision.scenarios.every(scenario => approvedScenarioRevisionIds.includes(scenario.scenarioRevisionId))
  )
    throw new ServiceError('The pending scenarios changed. Load the current portfolio before approving.', 'CONFLICT')

  const commandId = `chat-scenarios:${conversationId}:${key}`
  await recordQualityJourneyScenarioDecisionInTransaction(
    {
      expectedReviewHash: input.reviewHash,
      approvedScenarioRevisionIds,
      rejectedScenarioRevisionIds: [],
      command: {
        schemaVersion: 'appraise.quality-journey/v1',
        command: 'DECIDE_SCENARIOS',
        commandId,
        idempotencyKey: commandId,
        journeyId,
        targetProjectId,
        actor: 'USER',
        expectedStateHash: input.stateHash,
        inputArtifactRefs: [
          {
            kind: 'SCENARIO_PORTFOLIO_REVISION',
            artifactId: portfolioId,
            revisionId: portfolioRevisionId,
            contentHash: portfolioHash,
          },
        ],
        payload: { portfolioRevisionId, portfolioHash, approvedScenarioRevisionIds, rejectedScenarioRevisionIds: [] },
      },
    },
    tx,
    trustedHumanCoordinatorSession,
  )
  const journey = await tx.qualityJourney.findUniqueOrThrow({ where: { id: journeyId }, select: { stateHash: true } })
  const count = approvedScenarioRevisionIds.length
  return {
    wake: { journeyId, targetProjectId, expectedStateHash: journey.stateHash },
    message: `${count} ${count === 1 ? 'scenario' : 'scenarios'} approved.`,
  }
}
