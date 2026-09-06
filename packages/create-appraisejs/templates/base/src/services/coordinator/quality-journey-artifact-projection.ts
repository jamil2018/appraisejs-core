import { journeyClosureSchema, hashQualityJourneyExecutionValue as hash } from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'

type Shape = { [key: string]: true | readonly [true] | Shape | readonly [Shape] }
const scalar = (value: unknown) =>
  typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
export function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}
export function publicFields(value: unknown, shape: Shape): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(shape).flatMap(([key, field]) => {
      const item = source[key]
      if (field === true) return scalar(item) ? [[key, item]] : []
      if (Array.isArray(field)) {
        if (!Array.isArray(item)) return []
        return [[key, field[0] === true ? item.filter(scalar) : item.map(child => publicFields(child, field[0]))]]
      }
      return item && typeof item === 'object' ? [[key, publicFields(item, field as Shape)]] : []
    }),
  )
}
const questionFields: Shape = { questionId: true, prompt: true, required: true, rationale: true }
const analysisFields: Shape = {
  schemaVersion: true,
  charterId: true,
  analysisRevisionId: true,
  journeyId: true,
  targetProjectId: true,
  cycleId: true,
  requirementRevisionId: true,
  objectives: [true],
  scope: { included: [true], excluded: [true] },
  actors: [true],
  requirements: [{ requirementId: true, statement: true, sourceRefs: [true] }],
  obligations: [{ obligationId: true, requirementId: true, statement: true, acceptanceSignals: [true] }],
  constraints: [true],
  assumptions: [true],
  risks: [true],
  acceptanceSignals: [true],
  retiredRequirementIds: [true],
  questions: [questionFields],
  resolvedQuestionAnswerIds: [true],
}
export const scenarioFields: Shape = {
  narrative: true,
  exploratoryRationale: true,
  expectedSignals: [true],
  steps: [{ stepId: true, action: true, expected: true }],
  title: true,
  objective: true,
  requirementIds: [true],
  preconditions: [true],
  actions: [true],
  expectedOutcomes: [true],
  dataNeeds: [true],
  acceptanceSignals: [true],
}
const resourceFields: Shape = {
  resourceId: true,
  resourceKind: true,
  requirementId: true,
  rank: true,
  explanation: true,
  evidenceReceiptIds: [true],
  reasonCode: true,
  capability: true,
}
export const observationFields: Shape = {
  bundleId: true,
  observedAt: true,
  observations: [
    {
      observationId: true,
      snapshotId: true,
      fact: true,
      evidenceReceiptIds: [true],
      confidence: true,
      confidenceRationale: true,
      stability: true,
      stabilityRationale: true,
    },
  ],
}
export const resourceFieldsProjection: Shape = {
  bundleId: true,
  searchedAt: true,
  destinationModuleId: true,
  approvedRequirementIds: [true],
  reusable: [resourceFields],
  incompatible: [resourceFields],
  stale: [resourceFields],
  crossTarget: [resourceFields],
  missing: [resourceFields],
}
export const findingFields: Shape = {
  findingId: true,
  testRunId: true,
  evidenceReceiptId: true,
  scenarioRevisionId: true,
  requirementIds: [true],
  kind: true,
  targetOutcome: true,
  confidence: true,
  rationale: true,
  competingHypotheses: [true],
  unresolved: true,
  postmortem: { observation: true, expectedBehavior: true, causalAnalysis: true, nextAction: true },
}
export const reportFields: Shape = {
  schemaVersion: true,
  reportRevisionId: true,
  executionCycleId: true,
  cycleId: true,
  predecessorReportRevisionId: true,
  inputHash: true,
  summary: true,
  findings: [findingFields],
  coverage: [{ requirementId: true, scenarioRevisionIds: [true], testRunIds: [true], outcome: true, rationale: true }],
  residualRisks: [true],
  recommendations: [true],
  remediation: { kind: true, findingIds: [true], scenarioRevisionIds: [true], scope: true },
}
const shapes: Record<string, Shape> = {
  TARGET_OBSERVATION_BUNDLE: observationFields,
  RESOURCE_RESOLUTION_BUNDLE: resourceFieldsProjection,
  TEST_REPORT_ANALYSIS_REVISION: { report: reportFields },
  SCENARIO_PORTFOLIO_REVISION: {
    schemaVersion: true,
    portfolioId: true,
    portfolioRevisionId: true,
    coverageRationale: true,
    scenarios: [{ stableScenarioId: true, scenarioRevisionId: true, behavioralIntent: scenarioFields }],
    graph: {
      edges: [{ sourceScenarioRevisionId: true, targetScenarioRevisionId: true, relation: true, rationale: true }],
      sharedSetup: [{ setupId: true, label: true, scenarioRevisionIds: [true] }],
    },
  },
  ANALYSIS_CHARTER_REVISION: analysisFields,
  ANALYSIS_QUESTION: questionFields,
  ANALYSIS_ANSWER: {
    answerId: true,
    questionId: true,
    answer: true,
    response: true,
    rationale: true,
    actor: true,
    supersedesAnswerId: true,
  },
  JOURNEY_APPROVAL: {
    approvalId: true,
    actor: true,
    decision: true,
    feedback: true,
    artifactRevisionId: true,
    contentHash: true,
    reviewHash: true,
  },
  ANALYSIS_REVISION_FEEDBACK: { feedbackId: true, feedback: true, reviewedRevisionId: true, reviewedContentHash: true },
  SCENARIO_REVISION_FEEDBACK: { feedbackId: true, feedback: true, reviewedRevisionId: true, reviewedContentHash: true },
  REPORT_REVISION_FEEDBACK: { feedback: true, reportRevisionId: true, expectedReportHash: true },
  SCENARIO_REVISION: scenarioFields,
  RUNTIME_CAPSULE: {
    schemaVersion: true,
    capsuleId: true,
    materializationId: true,
    scenarioRevisionId: true,
    suiteId: true,
    testCaseId: true,
    capsuleHash: true,
    manifestHash: true,
  },
}
export function closureProjection(value: string, expectedHash: string) {
  const receipt = journeyClosureSchema.parse(JSON.parse(value))
  if (hash(receipt) !== expectedHash) throw new ServiceError('Closure receipt integrity mismatch.', 'CONFLICT')
  return receipt
}
export function authoredArtifactProjection(kind: string, value: unknown) {
  if (kind === 'JOURNEY_CLOSURE') return journeyClosureSchema.parse(value)
  const shape = shapes[kind]
  return shape ? publicFields(value, shape) : { recordKind: kind, projection: 'IDENTITY_ONLY' }
}
