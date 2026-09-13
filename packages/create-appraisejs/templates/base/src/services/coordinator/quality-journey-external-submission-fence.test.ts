import { expect, it, vi } from 'vitest'

import { materializeQualityJourneyApprovedScenarios } from './quality-journey-automation-service'
import {
  submitQualityJourneyResourceResolution,
  submitQualityJourneyTargetObservation,
} from './quality-journey-discovery-service'
import { submitQualityJourneyScenarioPortfolio } from './quality-journey-scenario-service'
import { submitQualityJourneyTriageReport } from './quality-journey-triage-service'

const digest = `sha256:${'a'.repeat(64)}`
const ids = {
  journeyId: 'journey-1',
  targetProjectId: 'target-1',
  workItemId: 'work-1',
  attemptId: 'attempt-1',
  leaseId: 'lease-1',
}

function result(role: 'TEST_SCENARIO_DESIGNER' | 'AUTOMATOR' | 'TRIAGER') {
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    assignmentId: 'assignment-1',
    workItemId: ids.workItemId,
    attemptId: ids.attemptId,
    roleContractDigest: digest,
    inputHash: digest,
    role,
    status: 'COMPLETED',
    outputs: [],
    evidenceReceipts: [],
    assumptions: [],
    blockers: [],
    unresolvedQuestions: [],
    submittedAt: '2026-09-13T00:00:00.000Z',
  }
}

function externalAttemptClient() {
  const findUnique = vi.fn().mockResolvedValue({ executionMode: 'EXTERNAL_V1' })
  const mutation = vi.fn(() => {
    throw new Error('A legacy EXTERNAL_V1 submission reached a mutation path.')
  })
  const client = {
    $transaction: async (effect: (tx: unknown) => Promise<unknown>) => effect(client),
    qualityJourneyWorkAttempt: { findUnique },
    qualityJourneyExternalSubmissionAcceptance: { create: mutation },
    qualityJourneyArtifact: { create: mutation },
  }
  return {
    client,
    findUnique,
    mutation,
  }
}

const discoveryEnvelope = {
  ...ids,
  discoveryRevisionId: 'discovery-1',
  ownerToken: 'x'.repeat(32),
  idempotencyKey: 'legacy-submit-1',
  expectedInputHash: digest,
  expectedScopeHash: digest,
  bundle: {},
}

it.each([
  ['Scout', (client: unknown) => submitQualityJourneyTargetObservation(discoveryEnvelope, client as never)],
  [
    'Resource Explorer',
    (client: unknown) => submitQualityJourneyResourceResolution(discoveryEnvelope, client as never),
  ],
  [
    'Test Scenario Designer',
    (client: unknown) =>
      submitQualityJourneyScenarioPortfolio(
        {
          ...ids,
          ownerToken: 'x'.repeat(32),
          idempotencyKey: 'legacy-scenario-1',
          expectedInputHash: digest,
          expectedScopeHash: digest,
          portfolio: {},
          result: result('TEST_SCENARIO_DESIGNER'),
        },
        client as never,
      ),
  ],
  [
    'Automator',
    (client: unknown) =>
      materializeQualityJourneyApprovedScenarios(
        {
          ...ids,
          ownerToken: 'x'.repeat(32),
          idempotencyKey: 'legacy-automation-1',
          expectedInputHash: digest,
          expectedScopeHash: digest,
          scenarios: [
            {
              scenarioRevisionId: 'scenario-1',
              steps: [
                {
                  sourceScenarioStepId: 'step-1',
                  stepDefinition: { id: 'definition-1', version: '1', definitionHash: digest },
                  operation: {
                    id: 'operation-1',
                    version: '1',
                    handler: { id: 'handler-1', version: '1', contentHash: digest },
                  },
                  parameters: [],
                  testData: [],
                  locatorRequirements: [],
                },
              ],
            },
          ],
          result: result('AUTOMATOR'),
        },
        client as never,
      ),
  ],
  [
    'Triager',
    (client: unknown) =>
      submitQualityJourneyTriageReport(
        {
          ...ids,
          ownerToken: 'x'.repeat(32),
          idempotencyKey: 'legacy-triage-1',
          report: {
            schemaVersion: 'appraise.quality-journey/v1',
            reportRevisionId: 'report-1',
            executionCycleId: 'execution-1',
            cycleId: 'cycle-1',
            inputHash: digest,
            summary: 'Triage summary.',
            findings: [],
            coverage: [
              {
                requirementId: 'requirement-1',
                scenarioRevisionIds: [],
                testRunIds: [],
                outcome: 'NOT_EVALUATED',
                rationale: 'No execution evidence is available.',
              },
            ],
            residualRisks: [],
            recommendations: ['Collect the required evidence.'],
          },
          result: result('TRIAGER'),
        },
        client as never,
      ),
  ],
] as const)(
  '%s legacy submission rejects an EXTERNAL_V1 attempt before acceptance or artifact mutation',
  async (_, submit) => {
    const { client, findUnique, mutation } = externalAttemptClient()

    await expect(submit(client)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(findUnique).toHaveBeenCalledWith({ where: { id: ids.attemptId } })
    expect(mutation).not.toHaveBeenCalled()
  },
)
