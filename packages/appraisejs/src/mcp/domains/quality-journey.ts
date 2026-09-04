import { z } from 'zod'
import type { McpRegistryContext } from '../registry.js'
import { text } from '../shared.js'

const journeyId = z.string().min(1)
const target = z.string().min(1)
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const timestamp = z.string().datetime()
const boundedText = z.string().trim().min(1).max(8_000)
const sortedUnique = (values: string[]) =>
  new Set(values).size === values.length && values.every((value, index) => index === 0 || values[index - 1] < value)
const evidenceReceiptIds = z
  .array(id)
  .min(1)
  .max(256)
  .refine(sortedUnique, 'Evidence receipt IDs must be unique and sorted.')
const analysisCharter = z
  .object({
    charterId: id,
    analysisRevisionId: id,
    cycleId: id,
    requirementRevisionId: id,
    objectives: z.array(z.string().trim().min(1).max(8_000)).min(1).max(64),
    scope: z
      .object({
        included: z.array(z.string().trim().min(1).max(8_000)).min(1).max(128),
        excluded: z.array(z.string().trim().min(1).max(8_000)).max(128),
      })
      .strict(),
    actors: z.array(z.string().trim().min(1).max(8_000)).max(128),
    requirements: z
      .array(
        z
          .object({
            requirementId: id,
            statement: z.string().trim().min(1).max(8_000),
            sourceRefs: z.array(z.string().trim().min(1).max(8_000)).min(1).max(64),
          })
          .strict(),
      )
      .min(1)
      .max(512),
    obligations: z
      .array(
        z
          .object({
            obligationId: id,
            requirementId: id,
            statement: z.string().trim().min(1).max(8_000),
            acceptanceSignals: z.array(z.string().trim().min(1).max(8_000)).min(1).max(64),
          })
          .strict(),
      )
      .min(1)
      .max(512),
    constraints: z.array(z.string().trim().min(1).max(8_000)).max(256),
    assumptions: z.array(z.string().trim().min(1).max(8_000)).max(256),
    risks: z.array(z.string().trim().min(1).max(8_000)).max(256),
    acceptanceSignals: z.array(z.string().trim().min(1).max(8_000)).min(1).max(256),
    retiredRequirementIds: z.array(id).max(512),
    questions: z
      .array(
        z
          .object({
            questionId: id,
            prompt: z.string().trim().min(1).max(8_000),
            required: z.boolean(),
            rationale: z.string().trim().min(1).max(8_000),
          })
          .strict(),
      )
      .max(256),
    resolvedQuestionAnswerIds: z.array(id).max(256),
  })
  .strict()

const analysisCommand = {
  commandId: id,
  expectedStateHash: hash,
  idempotencyKey: id,
  charterId: id,
  analysisRevisionId: id,
  contentHash: hash,
}

const specializedAnalysisLifecycleCommands = new Set([
  'PUBLISH_ANALYSIS',
  'REQUEST_ANALYSIS_REVISION',
  'DECIDE_ANALYSIS',
])
const specializedQualityJourneyCommands = new Set([
  ...specializedAnalysisLifecycleCommands,
  'RETRY_DISCOVERY',
  'RETRY_AUTOMATION',
  'START_EXECUTION',
  'START_SCENARIO_DESIGN',
  'PUBLISH_SCENARIO_PORTFOLIO',
  'DECIDE_SCENARIOS',
  'REQUEST_SCENARIO_REVISION',
])

export const genericQualityJourneyCommandSchema = z
  .record(z.string(), z.unknown())
  .refine(
    command => typeof command.command !== 'string' || !specializedQualityJourneyCommands.has(command.command),
    'Specialized Quality Journey commands require their dedicated MCP tool.',
  )

const genericQualityJourneyWorkCompletionResultSchema = z
  .record(z.string(), z.unknown())
  .refine(
    result =>
      result.role !== 'SCOUT' &&
      result.role !== 'RESOURCE_EXPLORER' &&
      result.role !== 'TEST_SCENARIO_DESIGNER' &&
      result.role !== 'AUTOMATOR',
    'Discovery, Scenario Designer, and Automator roles require their specialized completion tools.',
  )

// The package is published independently of the coordinator, so this is a
// deliberate mirror of src/lib/quality-journey/scenario-contracts.ts rather
// than an import from the app. Keep the structural constraints here in lock
// step with the canonical contract; the parity corpus in the root test suite
// exercises both ingress schemas against the same inputs.
const scenarioIdentifier = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const sortedUniqueScenarioIds = (options?: { min?: number; max?: number; message?: string }) => {
  const { min = 1, max = 512, message = 'IDs must be unique and lexicographically sorted.' } = options ?? {}
  return z
    .array(scenarioIdentifier)
    .min(min)
    .max(max)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length || values.some((value, index) => index && values[index - 1] >= value))
        context.addIssue({ code: 'custom', message })
    })
}

const artifactReference = z
  .object({
    kind: z.enum([
      'JOURNEY_REVISION',
      'ANALYSIS_CHARTER_REVISION',
      'ANALYSIS_QUESTION',
      'ANALYSIS_ANSWER',
      'ANALYSIS_REVISION_FEEDBACK',
      'TARGET_OBSERVATION_BUNDLE',
      'RESOURCE_RESOLUTION_BUNDLE',
      'SCENARIO_PORTFOLIO_REVISION',
      'SCENARIO_REVISION',
      'TEST_SUITE',
      'TEST_CASE',
      'RUNTIME_CAPSULE',
      'TEST_RUN',
      'EVIDENCE_RECEIPT',
      'TEST_REPORT_ANALYSIS_REVISION',
      'JOURNEY_APPROVAL',
      'JOURNEY_CLOSURE',
    ]),
    artifactId: id,
    revisionId: id.optional(),
    contentHash: hash,
  })
  .strict()
  .superRefine((reference, context) => {
    if (reference.kind.endsWith('_REVISION') && !reference.revisionId)
      context.addIssue({ code: 'custom', path: ['revisionId'], message: 'Revisioned artifacts require revisionId.' })
  })

const scenarioBehavioralIntent = z
  .object({
    title: boundedText,
    narrative: boundedText,
    requirementIds: sortedUniqueScenarioIds().optional(),
    exploratoryRationale: boundedText.optional(),
    expectedSignals: z.array(boundedText).min(1).max(64),
    steps: z
      .array(z.object({ stepId: scenarioIdentifier, action: boundedText, expected: boundedText }).strict())
      .min(1)
      .max(128),
  })
  .strict()
  .superRefine((intent, context) => {
    if (!intent.requirementIds?.length && !intent.exploratoryRationale)
      context.addIssue({
        code: 'custom',
        message: 'A scenario needs approved requirement traceability or an exploratory rationale.',
      })
  })

const scenarioEnrichment = z
  .object({
    observationIds: sortedUniqueScenarioIds(),
    resourceAssumptionIds: sortedUniqueScenarioIds({
      min: 0,
      message: 'Resource assumption IDs must be unique and sorted.',
    }),
    feasibilityNotes: z.array(boundedText).max(128),
  })
  .strict()

const scenarioRevision = z
  .object({
    stableScenarioId: scenarioIdentifier,
    scenarioRevisionId: scenarioIdentifier,
    behavioralIntent: scenarioBehavioralIntent,
    enrichment: scenarioEnrichment,
    layout: z
      .object({ x: z.number().finite(), y: z.number().finite(), sequence: z.number().int().nonnegative() })
      .strict(),
  })
  .strict()

const scenarioGraph = z
  .object({
    edges: z
      .array(
        z
          .object({
            sourceScenarioRevisionId: scenarioIdentifier,
            targetScenarioRevisionId: scenarioIdentifier,
            relation: z.enum(['DEPENDS_ON', 'BRANCHES_TO', 'SHARED_SETUP']),
            rationale: boundedText,
          })
          .strict(),
      )
      .max(2_048),
    sharedSetup: z
      .array(
        z
          .object({
            setupId: scenarioIdentifier,
            label: boundedText,
            scenarioRevisionIds: z.array(scenarioIdentifier).min(2),
          })
          .strict(),
      )
      .max(512),
  })
  .strict()

type ScenarioDraft = z.infer<typeof scenarioRevision>
type ScenarioGraph = z.infer<typeof scenarioGraph>

function validateScenarioIds(scenarios: ScenarioDraft[], context: z.RefinementCtx) {
  const stableIds = scenarios.map(scenario => scenario.stableScenarioId)
  const revisionIds = scenarios.map(scenario => scenario.scenarioRevisionId)
  if (
    new Set(stableIds).size !== stableIds.length ||
    stableIds.some((value, index) => index && stableIds[index - 1] >= value)
  )
    context.addIssue({ code: 'custom', path: ['scenarios'], message: 'Stable scenario IDs must be unique and sorted.' })
  if (new Set(revisionIds).size !== revisionIds.length)
    context.addIssue({ code: 'custom', path: ['scenarios'], message: 'Scenario revision IDs must be unique.' })
  const sequences = scenarios.map(scenario => scenario.layout.sequence)
  if (new Set(sequences).size !== sequences.length)
    context.addIssue({ code: 'custom', path: ['scenarios'], message: 'Scenario layout sequences must be unique.' })
  return new Set(revisionIds)
}

function validateGraphEdges(edges: ScenarioGraph['edges'], known: Set<string>, context: z.RefinementCtx) {
  const edgeKeys = new Set<string>()
  for (const [index, edge] of edges.entries()) {
    const edgeKey = `${edge.sourceScenarioRevisionId}\u0000${edge.targetScenarioRevisionId}\u0000${edge.relation}`
    if (index && [...edgeKeys].at(-1)! >= edgeKey)
      context.addIssue({
        code: 'custom',
        path: ['graph', 'edges', index],
        message: 'Graph edges must use deterministic source, target, and relation order.',
      })
    if (edgeKeys.has(edgeKey))
      context.addIssue({
        code: 'custom',
        path: ['graph', 'edges', index],
        message: 'Graph edges must not duplicate a dependency or branch relation.',
      })
    edgeKeys.add(edgeKey)
    if (!known.has(edge.sourceScenarioRevisionId) || !known.has(edge.targetScenarioRevisionId))
      context.addIssue({
        code: 'custom',
        path: ['graph', 'edges', index],
        message: 'Graph edges must reference portfolio scenarios.',
      })
    if (edge.sourceScenarioRevisionId === edge.targetScenarioRevisionId)
      context.addIssue({
        code: 'custom',
        path: ['graph', 'edges', index],
        message: 'Graph edges cannot self-reference.',
      })
  }
}

function validateSharedSetups(setups: ScenarioGraph['sharedSetup'], known: Set<string>, context: z.RefinementCtx) {
  const setupIds = setups.map(setup => setup.setupId)
  if (
    new Set(setupIds).size !== setupIds.length ||
    setupIds.some((setupId, index) => index && setupIds[index - 1] >= setupId)
  )
    context.addIssue({
      code: 'custom',
      path: ['graph', 'sharedSetup'],
      message: 'Shared setup IDs must be unique and sorted.',
    })
  for (const [index, setup] of setups.entries()) {
    if (setup.scenarioRevisionIds.some(scenarioRevisionId => !known.has(scenarioRevisionId)))
      context.addIssue({
        code: 'custom',
        path: ['graph', 'sharedSetup', index],
        message: 'Shared setup must reference portfolio scenarios.',
      })
    if (
      new Set(setup.scenarioRevisionIds).size !== setup.scenarioRevisionIds.length ||
      setup.scenarioRevisionIds.some(
        (scenarioRevisionId, scenarioIndex) =>
          scenarioIndex && setup.scenarioRevisionIds[scenarioIndex - 1] >= scenarioRevisionId,
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['graph', 'sharedSetup', index],
        message: 'Shared setup scenario IDs must be unique and sorted.',
      })
  }
}

export const scenarioPortfolioSchema = z
  .object({
    schemaVersion: z.literal('appraise.quality-journey/v1'),
    portfolioId: scenarioIdentifier,
    portfolioRevisionId: scenarioIdentifier,
    journeyId: scenarioIdentifier,
    targetProjectId: scenarioIdentifier,
    cycleId: scenarioIdentifier,
    discoveryRevisionId: scenarioIdentifier,
    discoveryCompletionHash: hash,
    predecessorPortfolioRevisionId: scenarioIdentifier.optional(),
    coverageRationale: boundedText,
    graph: scenarioGraph,
    scenarios: z.array(scenarioRevision).min(1).max(512),
  })
  .strict()
  .superRefine((value, context) => {
    const known = validateScenarioIds(value.scenarios, context)
    validateGraphEdges(value.graph.edges, known, context)
    validateSharedSetups(value.graph.sharedSetup, known, context)
  })

const workerResult = z
  .object({
    schemaVersion: z.literal('appraise.quality-journey/v1'),
    assignmentId: id,
    workItemId: id,
    attemptId: id,
    roleContractDigest: hash,
    inputHash: hash,
    role: z.enum([
      'REQUIREMENT_ANALYZER',
      'SCOUT',
      'RESOURCE_EXPLORER',
      'TEST_SCENARIO_DESIGNER',
      'AUTOMATOR',
      'TRIAGER',
    ]),
    status: z.enum(['COMPLETED', 'BLOCKED', 'QUESTION_RAISED', 'REVISION_REQUIRED']),
    outputs: z.array(artifactReference).max(1_536),
    evidenceReceipts: z.array(hash),
    assumptions: z.array(boundedText),
    blockers: z.array(
      z.object({ code: id, summary: boundedText, evidence: z.array(hash), requiredResolution: boundedText }).strict(),
    ),
    unresolvedQuestions: z.array(z.object({ questionId: id, prompt: boundedText, required: z.boolean() }).strict()),
    submittedAt: timestamp,
  })
  .strict()
  .refine(
    result =>
      result.role !== 'TEST_SCENARIO_DESIGNER' ||
      result.outputs.every(
        output => output.kind === 'SCENARIO_PORTFOLIO_REVISION' || output.kind === 'SCENARIO_REVISION',
      ),
    {
      message: 'Designer worker results may only publish Scenario Portfolio or Scenario Revision artifacts.',
      path: ['outputs'],
    },
  )

// Keep this independently published MCP ingress structurally identical to
// src/lib/quality-journey/automation-contracts.ts. The root parity corpus
// exercises both positive and negative packets.
const automationParameter = z
  .object({ name: z.string().min(1).max(200), type: z.string().min(1).max(100), value: z.unknown() })
  .strict()
const automationTestData = z
  .object({ key: z.string().min(1).max(200), type: z.string().min(1).max(100), value: z.unknown() })
  .strict()
const automationLocator = z
  .object({
    requirementId: id,
    parameterName: z.string().min(1).max(200),
    locatorId: id.optional(),
    runtimeParameter: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.locatorId && !value.runtimeParameter)
      context.addIssue({
        code: 'custom',
        message: 'A locator requirement needs a same-target locator or runtime parameter.',
      })
  })
const automationStep = z
  .object({
    sourceScenarioStepId: id,
    stepDefinition: z.object({ id, version: z.string().min(1).max(64), definitionHash: hash }).strict(),
    operation: z
      .object({
        id,
        version: z.string().min(1).max(64),
        handler: z.object({ id, version: z.string().min(1).max(64), contentHash: hash }).strict(),
      })
      .strict(),
    parameters: z.array(automationParameter).max(128),
    testData: z.array(automationTestData).max(128),
    locatorRequirements: z.array(automationLocator).max(128),
  })
  .strict()
export const automationMaterializationInput = z
  .object({
    target,
    journeyId: id,
    workItemId: id,
    attemptId: id,
    leaseId: id,
    ownerToken: z.string().min(1),
    idempotencyKey: id,
    expectedInputHash: hash,
    expectedScopeHash: hash,
    scenarios: z
      .array(z.object({ scenarioRevisionId: id, steps: z.array(automationStep).min(1).max(128) }).strict())
      .min(1)
      .max(512),
    result: workerResult,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.scenarios.map(scenario => scenario.scenarioRevisionId)).size !== value.scenarios.length)
      context.addIssue({ code: 'custom', path: ['scenarios'], message: 'Scenario revisions must be unique.' })
    if (value.result.role !== 'AUTOMATOR')
      context.addIssue({
        code: 'custom',
        path: ['result', 'role'],
        message: 'Automator materialization requires the Automator role.',
      })
    if (value.result.status !== 'COMPLETED')
      context.addIssue({
        code: 'custom',
        path: ['result', 'status'],
        message: 'Automator materialization requires a completed worker result.',
      })
    if (value.result.outputs.some(output => !['TEST_SUITE', 'TEST_CASE', 'RUNTIME_CAPSULE'].includes(output.kind)))
      context.addIssue({
        code: 'custom',
        path: ['result', 'outputs'],
        message: 'Output artifact kind is forbidden for role.',
      })
  })

const discoveryBundleBase = z
  .object({
    bundleId: id,
    cycleId: id,
    analysisRevision: z.object({ artifactId: id, revisionId: id, contentHash: hash }).strict(),
    analysisApproval: z.object({ artifactId: id, contentHash: hash }).strict(),
    authorizationId: id,
    inputHash: hash,
    assignmentScopeHash: hash,
    approvedRequirementSetHash: hash,
    inputArtifacts: z.array(artifactReference).min(1).max(256),
    evidenceReceipts: z
      .array(z.object({ artifactId: id, contentHash: hash }).strict())
      .min(1)
      .max(256),
  })
  .strict()

function validateDiscoveryBundleBase(bundle: z.infer<typeof discoveryBundleBase>, context: z.RefinementCtx) {
  const artifacts = [...bundle.inputArtifacts].sort((left, right) => {
    const leftKey = `${left.kind}\u0000${left.artifactId}\u0000${left.revisionId ?? ''}`
    const rightKey = `${right.kind}\u0000${right.artifactId}\u0000${right.revisionId ?? ''}`
    return leftKey.localeCompare(rightKey)
  })
  if (artifacts.some((artifact, index) => artifact !== bundle.inputArtifacts[index]))
    context.addIssue({ code: 'custom', path: ['inputArtifacts'], message: 'Input artifacts must be sorted.' })
  const analysis = bundle.inputArtifacts.filter(artifact => artifact.kind === 'ANALYSIS_CHARTER_REVISION')
  const approval = bundle.inputArtifacts.filter(artifact => artifact.kind === 'JOURNEY_APPROVAL')
  if (
    analysis.length !== 1 ||
    analysis[0].artifactId !== bundle.analysisRevision.artifactId ||
    analysis[0].revisionId !== bundle.analysisRevision.revisionId ||
    analysis[0].contentHash !== bundle.analysisRevision.contentHash
  )
    context.addIssue({ code: 'custom', path: ['inputArtifacts'], message: 'Analysis lineage must match.' })
  if (
    approval.length !== 1 ||
    approval[0].artifactId !== bundle.analysisApproval.artifactId ||
    approval[0].revisionId !== undefined ||
    approval[0].contentHash !== bundle.analysisApproval.contentHash
  )
    context.addIssue({ code: 'custom', path: ['inputArtifacts'], message: 'Approval lineage must match.' })
  if (!sortedUnique(bundle.evidenceReceipts.map(receipt => receipt.artifactId)))
    context.addIssue({
      code: 'custom',
      path: ['evidenceReceipts'],
      message: 'Evidence receipts must be unique and sorted.',
    })
}

const revalidationPolicy = z
  .object({
    triggers: z.array(boundedText).min(1).max(64),
    maxAgeSeconds: z.number().int().positive().max(31_536_000).optional(),
  })
  .strict()
const observationBundle = discoveryBundleBase
  .extend({
    observedAt: timestamp,
    targetSnapshot: z.object({ snapshotId: id, capturedAt: timestamp, contentHash: hash }).strict(),
    observations: z
      .array(
        z
          .object({
            observationId: id,
            snapshotId: id,
            routeId: z.string().min(1).max(2_000),
            environmentId: id,
            fact: boundedText,
            evidenceReceiptIds,
            confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
            confidenceRationale: boundedText,
            stability: z.enum(['STABLE', 'CONDITIONAL', 'VOLATILE']),
            stabilityRationale: boundedText,
            revalidationPolicy,
          })
          .strict(),
      )
      .min(1)
      .max(512),
  })
  .strict()
  .superRefine((bundle, context) => {
    validateDiscoveryBundleBase(bundle, context)
    const evidence = new Set(bundle.evidenceReceipts.map(receipt => receipt.artifactId))
    if (!sortedUnique(bundle.observations.map(observation => observation.observationId)))
      context.addIssue({ code: 'custom', path: ['observations'], message: 'Observations must be unique and sorted.' })
    if (
      bundle.observations.some(
        observation =>
          observation.snapshotId !== bundle.targetSnapshot.snapshotId ||
          observation.evidenceReceiptIds.some(receiptId => !evidence.has(receiptId)) ||
          !sortedUnique(observation.revalidationPolicy.triggers),
      )
    )
      context.addIssue({ code: 'custom', path: ['observations'], message: 'Observation provenance is invalid.' })
  })

const resourceEntry = z
  .object({
    resourceId: id,
    resourceKind: z.enum([
      'OPERATION',
      'STEP_DEFINITION',
      'LOCATOR',
      'MODULE',
      'TEMPLATE',
      'DATA',
      'EXAMPLE',
      'SCENARIO',
    ]),
    requirementId: id,
    rank: z.number().int().positive().max(512),
    explanation: boundedText,
    evidenceReceiptIds,
  })
  .strict()
const resourceResolutionBundle = discoveryBundleBase
  .extend({
    resolvedAt: timestamp,
    destinationModuleId: id,
    approvedRequirementIds: z.array(id).min(1).max(512),
    reusable: z.array(resourceEntry.extend({ reasonCode: z.literal('COMPATIBLE') }).strict()).max(512),
    incompatible: z.array(resourceEntry.extend({ reasonCode: z.literal('INCOMPATIBLE') }).strict()).max(512),
    stale: z.array(resourceEntry.extend({ reasonCode: z.literal('STALE') }).strict()).max(512),
    crossTarget: z
      .array(resourceEntry.extend({ reasonCode: z.literal('CROSS_TARGET'), sourceTargetProjectId: id }).strict())
      .max(512),
    missing: z
      .array(
        z
          .object({
            requirementId: id,
            capabilityId: id,
            reasonCode: z.enum(['NOT_FOUND', 'CAPABILITY_GAP']),
            explanation: boundedText,
            evidenceReceiptIds,
          })
          .strict(),
      )
      .max(512),
  })
  .strict()
  .superRefine((bundle, context) => {
    validateDiscoveryBundleBase(bundle, context)
    const bearing = [...bundle.reusable, ...bundle.incompatible, ...bundle.stale, ...bundle.crossTarget]
    const all = [...bearing, ...bundle.missing]
    const approved = new Set(bundle.approvedRequirementIds)
    const evidence = new Set(bundle.evidenceReceipts.map(receipt => receipt.artifactId))
    const resourceIdentities = bearing.map(entry => `${entry.requirementId}\u0000${entry.resourceId}`)
    const missingIdentities = bundle.missing.map(entry => `${entry.requirementId}\u0000${entry.capabilityId}`)
    if (!sortedUnique(bundle.approvedRequirementIds) || all.length === 0)
      context.addIssue({ code: 'custom', message: 'Approved requirements and classifications must be canonical.' })
    if (
      all.some(entry => !approved.has(entry.requirementId)) ||
      bundle.approvedRequirementIds.some(requirementId => !all.some(entry => entry.requirementId === requirementId))
    )
      context.addIssue({ code: 'custom', message: 'Every approved requirement must be covered exactly by ID.' })
    if (new Set(resourceIdentities).size !== resourceIdentities.length)
      context.addIssue({ code: 'custom', message: 'Resource identities must be disjoint across categories.' })
    if (new Set(missingIdentities).size !== missingIdentities.length)
      context.addIssue({ code: 'custom', path: ['missing'], message: 'Missing identities must be unique.' })
    for (const entries of [bundle.reusable, bundle.incompatible, bundle.stale, bundle.crossTarget]) {
      const keys = entries.map(
        entry => `${entry.requirementId}\u0000${String(entry.rank).padStart(4, '0')}\u0000${entry.resourceId}`,
      )
      if (!sortedUnique(keys))
        context.addIssue({ code: 'custom', message: 'Resource categories must be canonically ordered.' })
    }
    const missingKeys = bundle.missing.map(entry => `${entry.requirementId}\u0000${entry.capabilityId}`)
    if (!sortedUnique(missingKeys))
      context.addIssue({ code: 'custom', path: ['missing'], message: 'Missing entries must be canonically ordered.' })
    for (const requirementId of approved) {
      const ranks = bearing.filter(entry => entry.requirementId === requirementId).map(entry => entry.rank)
      if ([...ranks].sort((left, right) => left - right).some((rank, index) => rank !== index + 1))
        context.addIssue({ code: 'custom', message: 'Resource ranks must be contiguous from one.' })
    }
    if (
      all.some(entry => entry.evidenceReceiptIds.some(receiptId => !evidence.has(receiptId))) ||
      bundle.crossTarget.some(entry => entry.sourceTargetProjectId === '')
    )
      context.addIssue({ code: 'custom', message: 'Resource evidence and provenance must be bound.' })
  })

const discoverySubmission = {
  target,
  journeyId,
  discoveryRevisionId: id,
  workItemId: id,
  attemptId: id,
  leaseId: id,
  ownerToken: z.string().min(1).max(2_000),
  idempotencyKey: id,
  expectedInputHash: hash,
  expectedScopeHash: hash,
}

export function registerQualityJourneyOperations({ server, api }: McpRegistryContext): void {
  server.registerTool(
    'quality_journey_create',
    {
      description: 'Create or replay one durable target-bound Quality Journey at the intake gate.',
      inputSchema: { target, idempotencyKey: z.string().min(1), requirement: z.unknown() },
    },
    async body => text(await api.request('quality/journeys', { method: 'POST', body: JSON.stringify(body) })),
  )
  server.registerTool(
    'quality_journey_get',
    {
      description: 'Read the authoritative Quality Journey projection, work items, blockers, and event stream.',
      inputSchema: { target, journeyId },
    },
    async ({ target: targetRef, journeyId: id }) =>
      text(await api.request(`quality/journeys/${id}?target=${encodeURIComponent(targetRef)}`)),
  )
  server.registerTool(
    'quality_journey_discovery_get',
    {
      description:
        'Read the active provenance-bound Scout and Resource Explorer discovery revision without exposing a generic completion path.',
      inputSchema: { target, journeyId },
    },
    async ({ target: targetRef, journeyId: id }) =>
      text(await api.request(`quality/journeys/${id}/discovery?target=${encodeURIComponent(targetRef)}`)),
  )
  server.registerTool(
    'quality_journey_target_observation_submit',
    {
      description:
        'Submit one strict Target Observation Bundle only through the exact leased Scout discovery assignment.',
      inputSchema: { ...discoverySubmission, bundle: observationBundle },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/discovery/target-observations`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_resource_resolution_submit',
    {
      description:
        'Submit one strict ranked Resource Resolution Bundle only through the exact leased Resource Explorer discovery assignment.',
      inputSchema: { ...discoverySubmission, bundle: resourceResolutionBundle },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/discovery/resource-resolutions`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_discovery_retry',
    {
      description:
        'Create or replay a complete successor discovery authorization snapshot; never retry an individual role output.',
      inputSchema: {
        target,
        journeyId,
        expectedActiveDiscoveryRevisionId: id,
        idempotencyKey: id,
        reason: boundedText,
      },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/discovery/retries`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_discovery_revalidate',
    {
      description:
        'Revalidate the exact active discovery authorization snapshot against analysis, target, and registry lineage.',
      inputSchema: { target, journeyId, expectedActiveDiscoveryRevisionId: id },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/discovery/revalidations`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_analysis_get',
    {
      description: 'Read immutable Analysis Charter revisions, questions, answers, publication, and approval lineage.',
      inputSchema: { target, journeyId },
    },
    async ({ target: targetRef, journeyId: id }) =>
      text(await api.request(`quality/journeys/${id}/analysis?target=${encodeURIComponent(targetRef)}`)),
  )
  server.registerTool(
    'quality_journey_analysis_submit',
    {
      description: 'Submit an Analysis Charter only through the current leased Requirement Analyzer assignment.',
      inputSchema: {
        target,
        journeyId,
        workItemId: id,
        attemptId: id,
        leaseId: id,
        ownerToken: z.string().min(1).max(2_000),
        idempotencyKey: id,
        predecessorAnalysisRevisionId: id.optional(),
        charter: analysisCharter,
      },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/analysis/submissions`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_analysis_answer',
    {
      description: 'Append one immutable user answer or correction to an exact current Analysis Charter question.',
      inputSchema: {
        target,
        journeyId,
        idempotencyKey: id,
        answerId: id,
        analysisRevisionId: id,
        questionId: id,
        answer: z.string().trim().min(1).max(8_000),
        correctionOfAnswerId: id.optional(),
      },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/analysis/answers`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_analysis_publish',
    {
      description: 'Have the Runner publish one exact Analysis Charter after all required questions are resolved.',
      inputSchema: { target, journeyId, ...analysisCommand },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/analysis/publications`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_analysis_revision_request',
    {
      description:
        'Request a fresh Analyzer revision from one exact published Analysis Charter and current Q&A review hash.',
      inputSchema: {
        target,
        journeyId,
        ...analysisCommand,
        expectedReviewHash: hash,
        feedback: z.string().trim().min(1).max(8_000),
      },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/analysis/revision-requests`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_analysis_decide',
    {
      description: 'Approve one exact published Analysis Charter against its current immutable Q&A review identity.',
      inputSchema: { target, journeyId, ...analysisCommand },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/analysis/decisions`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_scenarios_start',
    {
      description:
        'Start scenario design only from the exact completed discovery revision and issue the Designer assignment.',
      inputSchema: { target, journeyId, commandId: id, expectedStateHash: hash, idempotencyKey: id },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/scenarios/starts`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_scenarios_get',
    {
      description:
        'Read the exact active Scenario Portfolio, graph coordinates, feasibility enrichment, and accumulated review decisions.',
      inputSchema: { target, journeyId },
    },
    async ({ target: targetRef, journeyId: journey }) =>
      text(await api.request(`quality/journeys/${journey}/scenarios?target=${encodeURIComponent(targetRef)}`)),
  )
  server.registerTool(
    'quality_journey_automation_context_get',
    {
      description:
        'Read the immutable approved-scenario materialization context and prepared capsule receipts. This never starts execution.',
      inputSchema: { target, journeyId },
    },
    async ({ target: targetRef, journeyId: journey }) =>
      text(await api.request(`quality/journeys/${journey}/automation/context?target=${encodeURIComponent(targetRef)}`)),
  )
  server.registerTool(
    'quality_journey_automation_materialize',
    {
      description:
        'Materialize exact approved Scenario revisions through the leased Automator ingress. It creates prepared capsules only; TestRuns and RuntimeCapsules remain Phase 7 authority.',
      inputSchema: automationMaterializationInput.shape,
    },
    async input => {
      const { target: targetRef, journeyId: journey, ...body } = automationMaterializationInput.parse(input)
      return text(
        await api.request(`quality/journeys/${journey}/automation/materializations`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      )
    },
  )
  server.registerTool(
    'quality_journey_scenarios_submit',
    {
      description:
        'Submit a provenance-bound Scenario Portfolio only through the active leased Test Scenario Designer assignment.',
      inputSchema: {
        target,
        journeyId,
        workItemId: id,
        attemptId: id,
        leaseId: id,
        ownerToken: z.string().min(1),
        idempotencyKey: id,
        expectedInputHash: hash,
        expectedScopeHash: hash,
        portfolio: scenarioPortfolioSchema,
        result: workerResult,
      },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/scenarios/submissions`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_scenarios_publish',
    {
      description: 'Publish one exact Scenario Portfolio for review after the Designer submission is durably recorded.',
      inputSchema: {
        target,
        journeyId,
        commandId: id,
        expectedStateHash: hash,
        idempotencyKey: id,
        portfolioId: id,
        portfolioRevisionId: id,
        portfolioHash: hash,
      },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/scenarios/publications`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_scenarios_decide',
    {
      description:
        'Accumulate exact scenario approvals or rejections during review; only a complete mandatory-coverage decision advances to automation.',
      inputSchema: {
        target,
        journeyId,
        commandId: id,
        expectedStateHash: hash,
        idempotencyKey: id,
        portfolioId: id,
        portfolioRevisionId: id,
        portfolioHash: hash,
        expectedReviewHash: hash,
        approvedScenarioRevisionIds: z.array(scenarioIdentifier).max(512),
        rejectedScenarioRevisionIds: z.array(scenarioIdentifier).max(512),
        feedback: boundedText.optional(),
      },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/scenarios/decisions`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_scenarios_comment',
    {
      description: 'Append an exact scoped scenario review comment without mutating scenario intent.',
      inputSchema: {
        target,
        journeyId,
        portfolioRevisionId: id,
        scenarioRevisionId: id.optional(),
        comment: boundedText,
        blocking: z.boolean().default(false),
        idempotencyKey: id,
        expectedReviewHash: hash,
      },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/scenarios/comments`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_scenarios_comment_dispose',
    {
      description: 'Dispose one exact scenario review comment with a durable idempotency receipt.',
      inputSchema: {
        target,
        journeyId,
        portfolioRevisionId: id,
        commentId: id,
        idempotencyKey: id,
        expectedReviewHash: hash,
      },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/scenarios/comment-dispositions`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_scenarios_revision_request',
    {
      description: 'Request a feedback-bound successor Scenario Portfolio from one exact reviewed revision.',
      inputSchema: {
        target,
        journeyId,
        commandId: id,
        expectedStateHash: hash,
        idempotencyKey: id,
        portfolioId: id,
        portfolioRevisionId: id,
        portfolioHash: hash,
        expectedReviewHash: hash,
        feedback: boundedText,
      },
    },
    async ({ target: targetRef, journeyId: journey, ...body }) =>
      text(
        await api.request(`quality/journeys/${journey}/scenarios/revision-requests`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_resume',
    {
      description: 'Reconstruct runner state, expire elapsed leases, and make replacement work reclaimable.',
      inputSchema: { target, journeyId },
    },
    async ({ target: targetRef, journeyId: id }) =>
      text(
        await api.request(`quality/journeys/${id}/resume`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_command_submit',
    {
      description:
        'Submit one exact-state, idempotent Quality Journey command when no specialized lifecycle boundary applies; Analysis and discovery retry commands require their dedicated tools.',
      inputSchema: { target, journeyId, command: genericQualityJourneyCommandSchema },
    },
    async ({ target: targetRef, journeyId: id, command }) =>
      text(
        await api.request(`quality/journeys/${id}/commands`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, command }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_factory_evidence_inspect',
    {
      description: 'Read durable Factory authorization, attempt, receipt, replacement, and terminal-state hashes.',
      inputSchema: { target, journeyId },
    },
    async ({ target: targetRef, journeyId: id }) =>
      text(await api.request(`quality/journeys/${id}/factory-evidence?target=${encodeURIComponent(targetRef)}`)),
  )
  server.registerTool(
    'quality_journey_work_claim',
    {
      description: 'Atomically claim one eligible role work item and receive its bounded lease authority.',
      inputSchema: {
        target,
        journeyId,
        role: z.enum([
          'REQUIREMENT_ANALYZER',
          'SCOUT',
          'RESOURCE_EXPLORER',
          'TEST_SCENARIO_DESIGNER',
          'AUTOMATOR',
          'TRIAGER',
        ]),
        leaseSeconds: z.number().int().min(30).max(900).optional(),
      },
    },
    async ({ target: targetRef, journeyId: id, ...body }) =>
      text(
        await api.request(`quality/journeys/${id}/work/claim`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_work_dispatch',
    {
      description: 'Dispatch one exact leased Factory request through a compatible provider-neutral adapter.',
      inputSchema: {
        target,
        journeyId,
        workItemId: z.string().min(1),
        leaseId: z.string().min(1),
        ownerToken: z.string().min(1),
      },
    },
    async ({ target: targetRef, journeyId: id, workItemId, ...body }) =>
      text(
        await api.request(`quality/journeys/${id}/work/${workItemId}/dispatch`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  for (const [name, action, description] of [
    ['quality_journey_work_cancel', 'cancel', 'Immediately invalidate an active Factory work authorization.'],
    [
      'quality_journey_work_revoke',
      'revoke',
      'Terminally revoke Factory authority and reject all late worker ingress.',
    ],
  ] as const) {
    server.registerTool(
      name,
      {
        description,
        inputSchema: {
          target,
          journeyId,
          workItemId: z.string().min(1),
          actor: z.enum(['USER', 'COORDINATOR', 'RUNNER']),
          reason: z.string().min(1).max(8_000),
        },
      },
      async ({ target: targetRef, journeyId: id, workItemId, ...body }) =>
        text(
          await api.request(`quality/journeys/${id}/work/${workItemId}/${action}`, {
            method: 'POST',
            body: JSON.stringify({ target: targetRef, ...body }),
          }),
        ),
    )
  }
  server.registerTool(
    'quality_journey_work_complete',
    {
      description:
        'Complete an exact claimed work attempt with a contract-bound worker result envelope; Discovery and Scenario Designer roles require their specialized completion tools.',
      inputSchema: {
        target,
        journeyId,
        workItemId: z.string().min(1),
        leaseId: z.string().min(1),
        ownerToken: z.string().min(1),
        result: genericQualityJourneyWorkCompletionResultSchema,
      },
    },
    async ({ target: targetRef, journeyId: id, workItemId, ...body }) =>
      text(
        await api.request(`quality/journeys/${id}/work/${workItemId}/complete`, {
          method: 'POST',
          body: JSON.stringify({ target: targetRef, ...body }),
        }),
      ),
  )
  server.registerTool(
    'quality_journey_artifacts_list',
    {
      description: 'List revision, cycle, and artifact-link lineage for one exact Quality Journey.',
      inputSchema: { target, journeyId },
    },
    async ({ target: targetRef, journeyId: id }) =>
      text(await api.request(`quality/journeys/${id}/artifacts?target=${encodeURIComponent(targetRef)}`)),
  )
}
