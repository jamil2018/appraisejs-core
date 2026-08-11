import type { McpRegistryContext } from '../registry.js'
import { applyAuthoringResponseMode, applyLifecycleResponseMode, responseModeSchema, text, z } from '../shared.js'

const qualityPlanRevisionInputSchema = z.object({
  qualityPlanId: z.string().min(1),
  revisionId: z.string().min(1).optional(),
  responseMode: responseModeSchema,
})

const assessmentInputSchema = z.object({
  assessmentId: z.string().min(1),
  responseMode: responseModeSchema,
})

const requirementQueryAnswerSchema = z.object({
  queryId: z.string().min(1),
  status: z.enum(['ANSWERED', 'DEFERRED', 'ACCEPTED_ASSUMPTION']),
  answer: z.string().optional(),
  rationale: z.string().optional(),
})
const compactStepValueSchema: z.ZodType<
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>
  | Record<string, string | number | boolean | null>
> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
])

export function registerQualityDesignOperations(context: McpRegistryContext): void {
  const { server, api } = context

  server.registerTool(
    'assessment_prepare_run',
    {
      description:
        'Resumably prepare approved validation bindings, environment, publication, Assessment, and managed execution without reconciling evidence or issuing a decision.',
      inputSchema: {
        target: z.string().min(1),
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        expectedDesignHash: z.string().startsWith('sha256:'),
        validationBindings: z
          .array(
            z.object({
              validationId: z.string().min(1),
              steps: z
                .array(
                  z.object({
                    stepId: z.string().min(1),
                    version: z.string().min(1),
                    inputs: z.record(z.string(), compactStepValueSchema).default({}),
                    keyword: z.enum(['Given', 'When', 'Then', 'And']).default('Given'),
                    description: z.string().min(1).max(500),
                  }),
                )
                .min(1),
              locatorIds: z.array(z.string().min(1)).max(100).default([]),
            }),
          )
          .min(1),
        environment: z.object({
          environmentId: z.string().min(1).optional(),
          allowCreate: z.literal(true).optional(),
          proposal: z
            .object({
              name: z.string().min(1),
              baseUrl: z.string().url(),
              expectedPageTitle: z.string().max(200).optional(),
              apiBaseUrl: z.string().url().optional(),
              username: z.string().optional(),
              passwordEnvironmentVariable: z
                .string()
                .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
                .optional(),
            })
            .optional(),
        }),
        subject: z.object({
          subjectDigest: z.string().startsWith('sha256:'),
          authority: z.string().min(1),
          subjectKind: z.enum(['ARTIFACT', 'DEPLOYMENT_SNAPSHOT']).optional(),
          metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
        }),
        runtime: z.object({ browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional() }).optional(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request('quality/assessment-prepare-runs', { method: 'POST', body: JSON.stringify(body) }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'requirements_submit_source',
    {
      description:
        'Submit an immutable source specification snapshot for Appraise-owned requirement analysis and Quality Plan revisioning.',
      inputSchema: {
        target: z.string().min(1),
        source: z.unknown(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ target, source, idempotencyKey, responseMode }) =>
      text(
        applyAuthoringResponseMode(
          await api.request('quality/requirements/source', {
            method: 'POST',
            body: JSON.stringify({ target, source, idempotencyKey }),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'requirements_analyze',
    {
      description:
        'Analyze the submitted source snapshot into a resolved requirement graph, queries, assumptions, and quality obligations.',
      inputSchema: qualityPlanRevisionInputSchema.shape,
    },
    async ({ qualityPlanId, revisionId, responseMode }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/requirements/analyze`, {
            method: 'POST',
            body: JSON.stringify({ revisionId }),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'requirements_graph_read',
    {
      description: 'Read the current requirement graph, quality obligations, approval state, and blocking queries.',
      inputSchema: qualityPlanRevisionInputSchema.shape,
    },
    async ({ qualityPlanId, revisionId, responseMode }) => {
      const params = new URLSearchParams()
      if (revisionId) params.set('revisionId', revisionId)
      return text(
        applyLifecycleResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/requirements?${params}`),
          responseMode,
        ),
      )
    },
  )

  server.registerTool(
    'requirements_answer_queries',
    {
      description:
        'Answer, defer with rationale, or accept requirement queries as assumptions; unresolved blocking queries prevent approval.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1).optional(),
        answers: z.array(requirementQueryAnswerSchema).min(1),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, revisionId, answers, idempotencyKey, responseMode }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/requirements/queries`, {
            method: 'POST',
            body: JSON.stringify({ revisionId, answers, idempotencyKey }),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'requirements_approve',
    {
      description:
        'Approve the resolved requirement graph and immutable QualityPlanRevision; blocking queries are rejected.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        expectedRevisionHash: z.string().startsWith('sha256:'),
        approvedBy: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/requirements/approve`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'validation_design_propose',
    {
      description:
        'Propose obligation-linked behavioral scenarios, assertions, coverage, assurance, matrix intent, and limitations.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        proposal: z.unknown(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/validation-design/proposals`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'validation_design_approve',
    {
      description:
        'Approve obligation-linked scenarios; mechanical selectors, runtime bindings, and locators are intentionally outside this review gate.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        expectedDesignHash: z.string().startsWith('sha256:'),
        approvedBy: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/validation-design/approve`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'validation_compile',
    {
      description:
        'Compile approved scenario design with mechanical realization metadata into immutable realized validation versions.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        expectedDesignHash: z.string().startsWith('sha256:'),
        realization: z.unknown(),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/validations/compile`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'validation_publish',
    {
      description:
        'Publish realized validation versions using an expected compilation hash after mechanical bindings are resolved.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        validationVersionIds: z.array(z.string().min(1)).min(1),
        expectedCompilationHash: z.string().startsWith('sha256:'),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/validations/publish`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'assessment_create',
    {
      description: 'Create a repeatable Quality Plan Assessment for an immutable evaluation subject digest.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        subject: z.unknown(),
        baselineAssessmentId: z.string().min(1).optional(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request('quality/assessments', { method: 'POST', body: JSON.stringify(body) }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'assessment_readiness',
    {
      description:
        'Read current assessment readiness blockers for scenario approval, published validation versions, and requirement alignment.',
      inputSchema: assessmentInputSchema.shape,
    },
    async ({ assessmentId, responseMode }) =>
      text(
        applyLifecycleResponseMode(await api.request(`quality/assessments/${assessmentId}/readiness`), responseMode),
      ),
  )

  server.registerTool(
    'assessment_run',
    {
      description:
        'Run approved validation versions for an assessment or standalone evidence-only execution; decisions require reviewed assessments.',
      inputSchema: {
        assessmentId: z.string().min(1).optional(),
        validationVersionIds: z.array(z.string().min(1)).optional(),
        subject: z.unknown().optional(),
        runtime: z.unknown().optional(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request('quality/assessment-runs', { method: 'POST', body: JSON.stringify(body) }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'assessment_stop',
    {
      description: 'Stop an in-flight assessment run while preserving partial sealed evidence receipts.',
      inputSchema: { assessmentId: z.string().min(1), reason: z.string().min(1), responseMode: responseModeSchema },
    },
    async ({ assessmentId, reason, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          await api.request(`quality/assessments/${assessmentId}/stop`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'assessment_diagnose',
    {
      description: 'Read the current assessment readiness, runtime, and sealed-evidence diagnostic packet.',
      inputSchema: assessmentInputSchema.shape,
    },
    async ({ assessmentId, responseMode }) =>
      text(applyLifecycleResponseMode(await api.request(`quality/assessments/${assessmentId}/diagnose`), responseMode)),
  )

  server.registerTool(
    'assessment_reconcile',
    {
      description: 'Reconcile terminal runs into sealed evidence receipts and immutable assessment evidence sets.',
      inputSchema: {
        assessmentId: z.string().min(1),
        runIds: z.array(z.string().min(1)).optional(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ assessmentId, responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request(`quality/assessments/${assessmentId}/reconcile`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'assessment_review',
    {
      description:
        'Read the assessment review packet, alignment status, evidence hash, assurance observations, and decision blockers.',
      inputSchema: assessmentInputSchema.shape,
    },
    async ({ assessmentId, responseMode }) =>
      text(applyLifecycleResponseMode(await api.request(`quality/assessments/${assessmentId}/review`), responseMode)),
  )

  server.registerTool(
    'assessment_decide',
    {
      description:
        'Issue an AssessmentDecision for a reviewed Quality Plan Assessment with current requirement alignment.',
      inputSchema: {
        assessmentId: z.string().min(1),
        expectedEvidenceSetHash: z.string().startsWith('sha256:'),
        decision: z.enum(['accepted', 'rejected', 'accepted_with_limitations']),
        decidedBy: z.string().min(1),
        rationale: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ assessmentId, responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request(`quality/assessments/${assessmentId}/decision`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )
}
