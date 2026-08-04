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

export function registerQualityDesignOperations(context: McpRegistryContext): void {
  const { server, api } = context

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
    'requirements_revise',
    {
      description:
        'Pending service: create a successor Quality Plan revision; unchanged content-addressed requirements may be inherited.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        expectedRevisionHash: z.string().startsWith('sha256:'),
        revision: z.unknown(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, expectedRevisionHash, revision, idempotencyKey, responseMode }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/requirements/revisions`, {
            method: 'POST',
            body: JSON.stringify({ expectedRevisionHash, revision, idempotencyKey }),
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
    'requirements_report_drift',
    {
      description:
        'Pending service: report requirement drift and proposed successor dispositions; human approval is required before successor adoption.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        currentRevisionId: z.string().min(1),
        drift: z.unknown(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/requirements/drift`, {
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
    'validation_design_revise',
    {
      description:
        'Pending service: revise scenario design after behavioral, assertion, coverage, limitation, or matrix feedback.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        expectedDesignHash: z.string().startsWith('sha256:'),
        revision: z.unknown(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/validation-design/revisions`, {
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
    'validation_reuse_resolve',
    {
      description:
        'Pending service: resolve scenario realization reuse as exact_match, compatible_reuse, version_required, no_match, or ambiguous.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        candidates: z.array(z.unknown()).min(1),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/validations/reuse`, {
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
    'target_discovery_session_start',
    {
      description:
        'Pending service: start an authorized managed-browser discovery session for black-box target inspection.',
      inputSchema: {
        target: z.string().min(1),
        environmentId: z.string().min(1),
        purpose: z.string().min(1),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request('quality/target-discovery/sessions', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'target_discovery_inspect',
    {
      description:
        'Pending service: inspect a managed-browser state and collect locator evidence without publishing selectors.',
      inputSchema: { sessionId: z.string().min(1), state: z.unknown(), responseMode: responseModeSchema },
    },
    async ({ sessionId, state, responseMode }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/target-discovery/sessions/${sessionId}/inspect`, {
            method: 'POST',
            body: JSON.stringify({ state }),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'target_discovery_locator_propose',
    {
      description:
        'Pending service: propose role/name, test id, stable app attribute, or reviewed structural locator versions with provenance and fingerprint.',
      inputSchema: {
        sessionId: z.string().min(1),
        locator: z.unknown(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ sessionId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/target-discovery/sessions/${sessionId}/locators/propose`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'target_discovery_locator_verify',
    {
      description:
        'Pending service: verify a proposed locator version against surface, state, environment, and element fingerprint.',
      inputSchema: {
        sessionId: z.string().min(1),
        locatorVersionId: z.string().min(1),
        verification: z.unknown(),
        responseMode: responseModeSchema,
      },
    },
    async ({ sessionId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/target-discovery/sessions/${sessionId}/locators/verify`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'target_discovery_locator_publish',
    {
      description:
        'Pending service: publish reviewed locator versions; auth-blocked, unreachable, or unstable targets remain non-executable.',
      inputSchema: {
        sessionId: z.string().min(1),
        locatorVersionIds: z.array(z.string().min(1)).min(1),
        expectedVerificationHash: z.string().startsWith('sha256:'),
        responseMode: responseModeSchema,
      },
    },
    async ({ sessionId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/target-discovery/sessions/${sessionId}/locators/publish`, {
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
        'Pending service: run approved validation versions for an assessment or standalone evidence-only execution; decisions require reviewed assessments.',
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
      description:
        'Pending service: stop an in-flight assessment run while preserving partial sealed evidence receipts.',
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
      description:
        'Read the current assessment readiness and blocker packet; runtime and sealed-evidence diagnostics remain pending service publication.',
      inputSchema: assessmentInputSchema.shape,
    },
    async ({ assessmentId, responseMode }) =>
      text(applyLifecycleResponseMode(await api.request(`quality/assessments/${assessmentId}/diagnose`), responseMode)),
  )

  server.registerTool(
    'assessment_reconcile',
    {
      description:
        'Pending service: reconcile terminal runs into sealed evidence receipts and immutable assessment evidence sets.',
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
