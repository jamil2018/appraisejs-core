import { z } from 'zod'
import type { McpRegistryContext } from '../registry.js'
import { text } from '../shared.js'

const journeyId = z.string().min(1)
const target = z.string().min(1)
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const id = z.string().min(1).max(200)
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

export const genericQualityJourneyCommandSchema = z
  .record(z.string(), z.unknown())
  .refine(
    command => typeof command.command !== 'string' || !specializedAnalysisLifecycleCommands.has(command.command),
    'Phase 3 analysis commands require their dedicated MCP tool.',
  )

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
        'Submit one exact-state, idempotent pre-Phase-3 Quality Journey lifecycle command; Analysis publication, revision, and approval require their dedicated tools.',
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
