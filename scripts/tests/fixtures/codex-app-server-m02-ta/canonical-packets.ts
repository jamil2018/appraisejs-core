import type { ExternalWorkerRole } from '../../../../packages/appraisejs/src/mcp/external-worker-gateway'

const digest = `sha256:${'a'.repeat(64)}`
const now = '2026-10-14T00:00:00.000Z'

function result(role: ExternalWorkerRole) {
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    assignmentId: 'assignment-1',
    workItemId: 'work-1',
    attemptId: 'attempt-1',
    roleContractDigest: digest,
    inputHash: digest,
    role,
    status: 'COMPLETED',
    outputs: [],
    evidenceReceipts: [],
    assumptions: [],
    blockers: [],
    unresolvedQuestions: [],
    submittedAt: now,
  }
}
const bundle = {
  bundleId: 'bundle-1',
  cycleId: 'cycle-1',
  analysisRevision: { artifactId: 'analysis-1', revisionId: 'revision-1', contentHash: digest },
  analysisApproval: { artifactId: 'approval-1', contentHash: digest },
  authorizationId: 'authorization-1',
  inputHash: digest,
  assignmentScopeHash: digest,
  approvedRequirementSetHash: digest,
  inputArtifacts: [
    { kind: 'ANALYSIS_CHARTER_REVISION', artifactId: 'analysis-1', revisionId: 'revision-1', contentHash: digest },
    { kind: 'JOURNEY_APPROVAL', artifactId: 'approval-1', contentHash: digest },
  ],
  evidenceReceipts: [{ artifactId: 'receipt-1', contentHash: digest }],
}
function packet(role: ExternalWorkerRole): Record<string, unknown> {
  const base = { idempotencyKey: 'submit-1' }
  switch (role) {
    case 'REQUIREMENT_ANALYZER':
      return {
        ...base,
        charter: {
          charterId: 'charter-1',
          analysisRevisionId: 'analysis-1',
          cycleId: 'cycle-1',
          requirementRevisionId: 'requirement-1',
          objectives: ['Exercise a synthetic requirement'],
          scope: { included: ['Fixture'], excluded: [] },
          actors: [],
          requirements: [{ requirementId: 'r1', statement: 'Fixture requirement', sourceRefs: ['brief-1'] }],
          obligations: [
            {
              obligationId: 'o1',
              requirementId: 'r1',
              statement: 'Fixture obligation',
              acceptanceSignals: ['Fixture passes'],
            },
          ],
          constraints: [],
          assumptions: [],
          risks: [],
          acceptanceSignals: ['Fixture passes'],
          retiredRequirementIds: [],
          questions: [],
          resolvedQuestionAnswerIds: [],
        },
      }
    case 'SCOUT':
      return {
        ...base,
        discoveryRevisionId: 'discovery-1',
        bundle: {
          ...bundle,
          observedAt: now,
          targetSnapshot: { snapshotId: 'snapshot-1', capturedAt: now, contentHash: digest },
          observations: [
            {
              observationId: 'observation-1',
              snapshotId: 'snapshot-1',
              routeId: 'route-1',
              environmentId: 'environment-1',
              fact: 'Synthetic sealed fact',
              evidenceReceiptIds: ['receipt-1'],
              confidence: 'HIGH',
              confidenceRationale: 'Fixture receipt',
              stability: 'STABLE',
              stabilityRationale: 'Fixture',
              revalidationPolicy: { triggers: ['revision-changed'] },
            },
          ],
        },
      }
    case 'RESOURCE_EXPLORER':
      return {
        ...base,
        discoveryRevisionId: 'discovery-1',
        bundle: {
          ...bundle,
          resolvedAt: now,
          destinationModuleId: 'module-1',
          approvedRequirementIds: ['r1'],
          reusable: [],
          incompatible: [],
          stale: [],
          crossTarget: [],
          missing: [
            {
              requirementId: 'r1',
              capabilityId: 'capability-1',
              reasonCode: 'NOT_FOUND',
              explanation: 'Synthetic gap',
              evidenceReceiptIds: ['receipt-1'],
            },
          ],
        },
      }
    case 'TEST_SCENARIO_DESIGNER':
      return {
        ...base,
        result: result(role),
        portfolio: {
          schemaVersion: 'appraise.quality-journey/v1',
          portfolioId: 'portfolio-1',
          portfolioRevisionId: 'portfolio-revision-1',
          journeyId: 'journey-1',
          targetProjectId: 'project-1',
          cycleId: 'cycle-1',
          discoveryRevisionId: 'discovery-1',
          discoveryCompletionHash: digest,
          coverageRationale: 'Synthetic coverage',
          graph: { edges: [], sharedSetup: [] },
          scenarios: [
            {
              stableScenarioId: 'scenario-1',
              scenarioRevisionId: 'scenario-revision-1',
              behavioralIntent: {
                title: 'Synthetic scenario',
                narrative: 'Exercise fixture',
                requirementIds: ['r1'],
                expectedSignals: ['Pass'],
                steps: [{ stepId: 'step-1', action: 'Use fixture', expected: 'Pass' }],
              },
              enrichment: { observationIds: ['observation-1'], resourceAssumptionIds: [], feasibilityNotes: [] },
              layout: { x: 0, y: 0, sequence: 0 },
            },
          ],
        },
      }
    case 'AUTOMATOR':
      return {
        ...base,
        result: result(role),
        scenarios: [
          {
            scenarioRevisionId: 'scenario-revision-1',
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
      }
    case 'TRIAGER':
      return {
        ...base,
        result: result(role),
        report: {
          schemaVersion: 'appraise.quality-journey/v1',
          reportRevisionId: 'report-1',
          executionCycleId: 'execution-1',
          cycleId: 'cycle-1',
          inputHash: digest,
          summary: 'Synthetic triage',
          findings: [],
          coverage: [
            {
              requirementId: 'r1',
              scenarioRevisionIds: [],
              testRunIds: [],
              outcome: 'NOT_EVALUATED',
              rationale: 'Fixture only',
            },
          ],
          residualRisks: [],
          recommendations: ['Collect evidence'],
        },
      }
  }
}

export function canonicalPacket(
  role: ExternalWorkerRole,
  identity: {
    assignmentId: string
    workItemId: string
    attemptId: string
    journeyId: string
    targetProjectId: string
    authorizationId: string
    expectedInputHash: string
    expectedScopeHash: string
  },
): Record<string, unknown> {
  const value = structuredClone(packet(role))
  const replacements: Record<string, string> = {
    'assignment-1': identity.assignmentId,
    'work-1': identity.workItemId,
    'attempt-1': identity.attemptId,
    'journey-1': identity.journeyId,
    'project-1': identity.targetProjectId,
    'authorization-1': identity.authorizationId,
  }
  const visit = (input: unknown): unknown => {
    if (typeof input === 'string') return replacements[input] ?? input
    if (Array.isArray(input)) return input.map(visit)
    if (input && typeof input === 'object')
      return Object.fromEntries(Object.entries(input).map(([key, child]) => [key, visit(child)]))
    return input
  }
  const output = visit(value) as Record<string, unknown>
  const result = output.result as Record<string, unknown> | undefined
  if (result) result.inputHash = identity.expectedInputHash
  const bundle = output.bundle as Record<string, unknown> | undefined
  if (bundle) {
    bundle.inputHash = identity.expectedInputHash
    bundle.assignmentScopeHash = identity.expectedScopeHash
  }
  return output
}
