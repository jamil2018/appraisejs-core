import { z } from 'zod'
import type { McpRegistryContext } from '../registry.js'
import { text } from '../shared.js'

const journeyId = z.string().min(1)
const target = z.string().min(1)
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const id = z.string().min(1).max(200)
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
const specializedQualityJourneyCommands = new Set([...specializedAnalysisLifecycleCommands, 'RETRY_DISCOVERY'])

export const genericQualityJourneyCommandSchema = z
  .record(z.string(), z.unknown())
  .refine(
    command => typeof command.command !== 'string' || !specializedQualityJourneyCommands.has(command.command),
    'Specialized Quality Journey commands require their dedicated MCP tool.',
  )

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
    resourceKind: z.enum(['OPERATION', 'STEP_DEFINITION', 'LOCATOR', 'TEMPLATE', 'DATA', 'EXAMPLE', 'SCENARIO']),
    requirementId: id,
    rank: z.number().int().positive().max(512),
    explanation: boundedText,
    evidenceReceiptIds,
  })
  .strict()
const resourceResolutionBundle = discoveryBundleBase
  .extend({
    resolvedAt: timestamp,
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
      description: 'Complete an exact claimed work attempt with a contract-bound worker result envelope.',
      inputSchema: {
        target,
        journeyId,
        workItemId: z.string().min(1),
        leaseId: z.string().min(1),
        ownerToken: z.string().min(1),
        result: z.record(z.string(), z.unknown()),
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
