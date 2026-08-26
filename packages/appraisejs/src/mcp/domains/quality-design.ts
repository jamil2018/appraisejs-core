import type { McpRegistryContext } from '../registry.js'
import {
  applyAuthoringResponseMode,
  applyLifecycleResponseMode,
  projectRemoteScopeCreateResponse,
  projectRemoteScopePartitionCreateResponse,
  projectRemoteScopeReadResponse,
  decisionResponseModeSchema,
  responseModeSchema,
  text,
  z,
} from '../shared.js'

const qualityPlanRevisionInputSchema = z.object({
  qualityPlanId: z.string().min(1),
  revisionId: z.string().min(1).optional(),
  responseMode: responseModeSchema,
})

const assessmentInputSchema = z.object({
  assessmentId: z.string().min(1),
  responseMode: responseModeSchema,
})

const assessmentDecisionInputSchema = z.object({
  assessmentId: z.string().min(1),
  responseMode: decisionResponseModeSchema,
})

const requirementQueryAnswerSchema = z.object({
  queryId: z.string().min(1),
  status: z.enum(['ANSWERED', 'DEFERRED', 'ACCEPTED_ASSUMPTION']),
  answer: z.string().optional(),
  rationale: z.string().optional(),
})
const methodologyRefSchema = z
  .object({
    providerId: z.string().min(1),
    methodologyId: z.string().min(1),
    version: z.string().min(1),
    digest: z.string().startsWith('sha256:'),
  })
  .strict()
const provenanceSchema = z.object({ sourceRequirementIds: z.array(z.string().min(1)), rationale: z.string() }).strict()
const requirementAnalysisProposalSchema = z
  .object({
    schemaVersion: z.literal('1'),
    methodology: methodologyRefSchema,
    requirements: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) }).strict()).min(1),
    inferences: z.array(
      z
        .object({
          id: z.string().min(1),
          statement: z.string().min(1),
          confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
          provenance: provenanceSchema,
        })
        .strict(),
    ),
    obligations: z
      .array(
        z
          .object({
            id: z.string().min(1),
            requirementIds: z.array(z.string().min(1)).min(1),
            intent: z.string().min(1),
            minimumAssurance: z.enum(['SMOKE', 'STANDARD', 'HIGH', 'EXHAUSTIVE']),
            provenance: provenanceSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
const validationDesignProposalSchema = z
  .object({
    schemaVersion: z.literal('1'),
    methodology: methodologyRefSchema,
    requiredAssurance: z.enum(['SMOKE', 'STANDARD', 'HIGH', 'EXHAUSTIVE']),
    scenarios: z
      .array(
        z
          .object({
            id: z.string().min(1),
            title: z.string().min(1),
            obligationIds: z.array(z.string().min(1)).min(1),
            behavior: z.string().min(1),
            kind: z.enum(['POSITIVE', 'NEGATIVE', 'RECOVERY']),
            assertions: z
              .array(
                z.object({ id: z.string().min(1), statement: z.string().min(1), observable: z.boolean() }).strict(),
              )
              .min(1),
            requiredMinimumAssurance: z.enum(['SMOKE', 'STANDARD', 'HIGH', 'EXHAUSTIVE']),
            matrix: z
              .object({
                cells: z
                  .array(z.object({ browser: z.string().min(1), environment: z.string().min(1) }).strict())
                  .min(1),
                rationale: z.string(),
              })
              .strict(),
            failureMeaning: z.string(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
const compactStepValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(16_384),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(compactStepValueSchema).max(100),
    z.record(z.string().max(128), compactStepValueSchema),
  ]),
)
const boundedCompactStepValueSchema = compactStepValueSchema.superRefine((value, context) => {
  const visit = (candidate: unknown, depth: number, nodes: { count: number }) => {
    nodes.count += 1
    if (nodes.count > 1_000) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Operation value exceeds 1,000 nodes.' })
      return
    }
    if (depth > 10) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Operation value exceeds depth 10.' })
      return
    }
    if (Array.isArray(candidate)) candidate.forEach(item => visit(item, depth + 1, nodes))
    else if (candidate && typeof candidate === 'object')
      Object.values(candidate as Record<string, unknown>).forEach(item => visit(item, depth + 1, nodes))
  }
  visit(value, 0, { count: 0 })
})
const assessmentEnvironmentProposalSchema = z
  .object({
    name: z.string().min(1),
    baseUrl: z.string().url(),
    expectedPageTitle: z.string().max(200).optional().or(z.literal('')),
    apiBaseUrl: z.string().url().optional().or(z.literal('')),
    username: z.string().optional().or(z.literal('')),
    passwordEnvironmentVariable: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
      .optional()
      .or(z.literal('')),
  })
  .strict()
const assessmentPreparationEnvironmentSchema = z.union([
  z.object({ environmentId: z.string().min(1) }).strict(),
  z.object({ allowCreate: z.literal(true), proposal: assessmentEnvironmentProposalSchema }).strict(),
])
const compactAssessmentStepSchema = z
  .object({
    stepId: z.string().min(1),
    version: z.string().min(1),
    inputs: z.record(z.string(), boundedCompactStepValueSchema).default({}),
    keyword: z.enum(['Given', 'When', 'Then', 'And']).default('Given'),
    description: z.string().min(1).max(500),
  })
  .strict()
const compactAssessmentBindingSchema = z
  .object({
    validationId: z.string().min(1),
    steps: z.array(compactAssessmentStepSchema).min(1),
    locatorIds: z.array(z.string().min(1)).max(100).default([]),
  })
  .strict()
const compactAssessmentSubjectSchema = z.union([
  z
    .object({
      subjectDigest: z.string().startsWith('sha256:'),
      authority: z.string().min(1),
      subjectKind: z.enum(['ARTIFACT', 'DEPLOYMENT_SNAPSHOT']).optional(),
      metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    })
    .strict(),
  z
    .object({
      subjectRevisionId: z.string().min(1),
      expectedSubjectDigest: z.string().startsWith('sha256:').optional(),
    })
    .strict(),
])
const compactAssessmentRuntimeSchema = z
  .object({ browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional() })
  .strict()
const compactAssessmentFields = {
  target: z.string().min(1),
  qualityPlanId: z.string().min(1),
  revisionId: z.string().min(1),
  expectedDesignHash: z.string().startsWith('sha256:'),
  validationBindings: z.array(compactAssessmentBindingSchema).min(1),
}
const compactAssessmentRecoveryFields = {
  ...compactAssessmentFields,
  // The service makes this target-dependent: local requests still fail unless
  // they carry bindings, while an exact v2 remote subject can hydrate its
  // immutable binding packet before preflight/preparation.
  validationBindings: z.array(compactAssessmentBindingSchema).min(1).optional(),
}
const remoteScopeEnvironmentSchema = z.object({ environmentId: z.string().min(1) }).strict()

async function lifecyclePost(
  api: McpRegistryContext['api'],
  path: string,
  body: unknown,
  responseMode: z.infer<typeof responseModeSchema>,
) {
  return text(
    applyLifecycleResponseMode(await api.request(path, { method: 'POST', body: JSON.stringify(body) }), responseMode),
  )
}

function assessmentSuccessorPath(assessmentId: string) {
  return `quality/assessments/${assessmentId}/successors`
}

function assessmentReconciliationPath(assessmentId: string) {
  return `quality/assessments/${assessmentId}/reconcile`
}

export const assessmentPreflightInputSchema = z
  .object({
    ...compactAssessmentRecoveryFields,
    environment: remoteScopeEnvironmentSchema,
    subject: compactAssessmentSubjectSchema,
    runtime: compactAssessmentRuntimeSchema.optional(),
    responseMode: responseModeSchema,
  })
  .strict()

export const assessmentPrepareInputSchema = z
  .object({
    ...compactAssessmentRecoveryFields,
    environment: assessmentPreparationEnvironmentSchema,
    subject: compactAssessmentSubjectSchema,
    runtime: compactAssessmentRuntimeSchema.optional(),
    authorizationGrantId: z.string().uuid().optional(),
    executionRequestId: z.string().uuid().optional(),
    expectedRequestHash: z.string().startsWith('sha256:').optional(),
    consentId: z.string().uuid().optional(),
    expectedExecutionManifestHash: z.string().startsWith('sha256:').optional(),
    riskClassification: z.enum(['READ_ONLY', 'REVERSIBLE_WRITE', 'MATERIAL_EFFECT']).optional(),
    materialEffects: z
      .array(
        z.enum([
          'PERMISSION_ESCALATION',
          'ACCOUNT_CREATION',
          'PURCHASE',
          'DESTRUCTIVE_MUTATION',
          'EXTERNAL_MESSAGE',
          'IRREVERSIBLE_SIDE_EFFECT',
          'UNCLASSIFIED_OPERATION',
        ]),
      )
      .optional(),
    expectedPreflight: z
      .object({
        algorithmVersion: z.literal('appraise.quality-assessment-preflight/v2'),
        preflightHash: z.string().startsWith('sha256:'),
      })
      .strict()
      .optional(),
    assessmentId: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1),
    responseMode: responseModeSchema,
  })
  .strict()

export function registerQualityDesignOperations(context: McpRegistryContext): void {
  const { server, api } = context

  server.registerTool(
    'evaluation_subject_remote_scope_create',
    {
      description:
        'Create or replay an Appraise-owned REMOTE_EVALUATION_SCOPE for an approved remote black-box evaluation. It performs zero target I/O and returns a bounded v2 handoff: subjectRevisionId plus algorithmVersion, scopeIntentHash, realizationIntentHash, preflightHash, and expectedPreflight. It asserts no deployment or content identity.',
      inputSchema: {
        ...compactAssessmentFields,
        environment: remoteScopeEnvironmentSchema,
        runtime: z
          .object({ browserEngine: z.literal('CHROMIUM').optional() })
          .strict()
          .optional(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...body }) =>
      text(
        projectRemoteScopeCreateResponse(
          await api.request('quality/evaluation-subjects/remote-scopes', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'evaluation_subject_remote_scope_partition_create',
    {
      description:
        'Atomically create or replay an Appraise-owned manifest that partitions every current approved remote ValidationVersion exactly once across frozen environments. Each returned child is the only authority for its own validations and performs zero target I/O during issuance.',
      inputSchema: {
        target: z.string().min(1),
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        expectedDesignHash: z.string().startsWith('sha256:'),
        partitions: z
          .array(
            z
              .object({
                partitionKey: z.string().min(1).max(200),
                environment: remoteScopeEnvironmentSchema,
                validationBindings: z.array(compactAssessmentBindingSchema).min(1),
              })
              .strict(),
          )
          .min(1),
        runtime: z
          .object({ browserEngine: z.literal('CHROMIUM').optional() })
          .strict()
          .optional(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...body }) =>
      text(
        projectRemoteScopePartitionCreateResponse(
          await api.request('quality/evaluation-subjects/remote-scope-partitions', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'evaluation_subject_remote_scope_read',
    {
      description:
        'Read the exact persisted v2 REMOTE_EVALUATION_SCOPE packet after an interrupted workflow. This is DB-only and read-only: it neither issues a scope nor performs target I/O. Use full only when the complete compact bindings are needed for assessment_preflight or assessment_prepare_run.',
      inputSchema: {
        target: z.string().min(1),
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        subjectRevisionId: z.string().min(1),
        expectedSubjectDigest: z.string().startsWith('sha256:').optional(),
        expectedScopeHash: z.string().startsWith('sha256:').optional(),
        expectedPreflightHash: z.string().startsWith('sha256:').optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...body }) =>
      text(
        projectRemoteScopeReadResponse(
          await api.request('quality/evaluation-subjects/remote-scopes/read', {
            method: 'POST',
            body: JSON.stringify({ ...body, responseMode }),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'methodology_list',
    { description: 'List the versioned Appraise quality methodologies available to guide host-agent reasoning.' },
    async () => text(await api.request('quality/methodologies')),
  )

  server.registerTool(
    'methodology_get',
    {
      description: 'Read one exact methodology manifest, rubric, planner contract, and critique contract.',
      inputSchema: { providerId: z.string().min(1), methodologyId: z.string().min(1), version: z.string().min(1) },
    },
    async ({ providerId, methodologyId, version }) =>
      text(await api.request(`quality/methodologies/${providerId}/${methodologyId}/${version}`)),
  )

  server.registerTool(
    'assessment_execution_authorization_issue',
    {
      description:
        'Exchange a compact Ed25519 host assertion for one target-bound credential execution grant. This operation never accepts UI issuance or credential values.',
      inputSchema: { assertion: z.string().min(1).max(12_000), responseMode: responseModeSchema },
    },
    async ({ assertion, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          await api.request('quality/assessment-execution-authorizations/host', {
            method: 'POST',
            body: JSON.stringify({ assertion }),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'assessment_execution_authorization_revoke',
    {
      description: 'Deny an unconsumed credential execution grant. Consumed grants cannot be revoked.',
      inputSchema: { grantId: z.string().uuid(), reason: z.string().min(1).max(500), responseMode: responseModeSchema },
    },
    async ({ grantId, reason, responseMode }) =>
      text(
        applyLifecycleResponseMode(
          await api.request('quality/assessment-execution-authorizations/revoke', {
            method: 'POST',
            body: JSON.stringify({ grantId, reason }),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'assessment_preflight',
    {
      description:
        'Read-only, browser-free v2 canonical preflight for compact approved bindings against an existing environment. Returns algorithmVersion, scopeIntentHash, realizationIntentHash, preflightHash, and bounded diagnostics; it never creates or executes anything.',
      inputSchema: assessmentPreflightInputSchema.shape,
    },
    async ({ responseMode, ...body }) => lifecyclePost(api, 'quality/assessment-preflights', body, responseMode),
  )

  server.registerTool(
    'assessment_prepare_run',
    {
      description:
        'Resumably prepare approved validation bindings, environment, publication, Assessment, and managed execution without reconciling evidence or issuing a decision. Optionally bind one exact READY Assessment (including an explicitly selected successor); this never selects a latest successor. REMOTE_BLACK_BOX preparation must supply the exact v2 expectedPreflight returned by assessment_preflight.',
      inputSchema: assessmentPrepareInputSchema.shape,
    },
    async ({ responseMode, ...body }) => lifecyclePost(api, 'quality/assessment-prepare-runs', body, responseMode),
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
    'requirement_analysis_propose',
    {
      description:
        'Submit a methodology-bound requirement analysis that separates facts, inferences, provenance, and derived obligations.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        proposal: requirementAnalysisProposalSchema,
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/requirement-analyses`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'requirement_analysis_read',
    {
      description: 'Read an immutable requirement analysis, critique, provenance, queries, and review state.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        analysisId: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, analysisId, responseMode }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/requirement-analyses/${analysisId}`),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'requirement_analysis_decide',
    {
      description: 'Approve or reject one exact requirement-analysis content hash after resolving blocking queries.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        analysisId: z.string().min(1),
        expectedContentHash: z.string().startsWith('sha256:'),
        decision: z.enum(['APPROVED', 'NEEDS_REVISION', 'REJECTED']),
        decidedBy: z.string().min(1),
        rationale: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, analysisId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/requirement-analyses/${analysisId}/decision`, {
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
        requirementAnalysisId: z.string().min(1),
        expectedAnalysisHash: z.string().startsWith('sha256:'),
        expectedObligationSetHash: z.string().startsWith('sha256:'),
        proposal: validationDesignProposalSchema,
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
    'validation_design_read',
    {
      description: 'Read one immutable validation strategy and scenario portfolio with deterministic critique.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        designId: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, designId, responseMode }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/validation-designs/${designId}`),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'validation_design_decide',
    {
      description: 'Approve or reject one exact strategy-and-scenario design hash before mechanical realization.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        designId: z.string().min(1),
        expectedContentHash: z.string().startsWith('sha256:'),
        decision: z.enum(['APPROVED', 'NEEDS_REVISION', 'REJECTED']),
        decidedBy: z.string().min(1),
        rationale: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ qualityPlanId, designId, responseMode, ...body }) =>
      text(
        applyAuthoringResponseMode(
          await api.request(`quality/plans/${qualityPlanId}/validation-designs/${designId}/decision`, {
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
      description:
        'Create a repeatable Quality Plan Assessment. REMOTE_BLACK_BOX targets require an Appraise-owned remote scope subjectRevisionId; it is evaluation-scope identity only, not content identity.',
      inputSchema: {
        qualityPlanId: z.string().min(1),
        revisionId: z.string().min(1),
        subject: compactAssessmentSubjectSchema,
        baselineAssessmentId: z.string().min(1).optional(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...body }) => lifecyclePost(api, 'quality/assessments', body, responseMode),
  )

  server.registerTool(
    'assessment_create_successor',
    {
      description:
        'Create one immutable READY retry successor for a DECIDED, STALE, CANCELLED, or explicitly retried EVIDENCE_REVIEW assessment. The predecessor evidence and decision are never changed.',
      inputSchema: {
        assessmentId: z.string().min(1),
        subject: compactAssessmentSubjectSchema,
        disposition: z.object({
          code: z.string().min(1).max(120),
          rationale: z.string().min(1).max(2_000),
          retryReason: z.string().min(1).max(2_000).optional(),
        }),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ assessmentId, responseMode, ...body }) =>
      lifecyclePost(api, assessmentSuccessorPath(assessmentId), body, responseMode),
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
      description: 'Run the published validation matrix owned by an existing reviewable assessment.',
      inputSchema: {
        assessmentId: z.string().min(1),
        subject: z.never().optional(),
        validationVersionIds: z.array(z.string().min(1)).optional(),
        runtime: z
          .object({
            environmentId: z.string().min(1).optional(),
            browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
            cells: z
              .array(
                z
                  .object({
                    validationVersionId: z.string().min(1),
                    resultMatrixCell: z.string().min(1),
                    environmentId: z.string().min(1),
                    browserEngine: z.enum(['CHROMIUM', 'FIREFOX', 'WEBKIT']).optional(),
                  })
                  .strict(),
              )
              .optional(),
          })
          .strict()
          .optional(),
        authorizationGrantId: z.string().uuid().optional(),
        executionRequestId: z.string().uuid().optional(),
        expectedRequestHash: z.string().startsWith('sha256:').optional(),
        consentId: z.string().uuid().optional(),
        expectedExecutionManifestHash: z.string().startsWith('sha256:').optional(),
        riskClassification: z.enum(['READ_ONLY', 'REVERSIBLE_WRITE', 'MATERIAL_EFFECT']).optional(),
        materialEffects: z
          .array(
            z.enum([
              'PERMISSION_ESCALATION',
              'ACCOUNT_CREATION',
              'PURCHASE',
              'DESTRUCTIVE_MUTATION',
              'EXTERNAL_MESSAGE',
              'IRREVERSIBLE_SIDE_EFFECT',
              'UNCLASSIFIED_OPERATION',
            ]),
          )
          .optional(),
        idempotencyKey: z.string().min(1),
        responseMode: responseModeSchema,
      },
    },
    async ({ responseMode, ...body }) => lifecyclePost(api, 'quality/assessment-runs', body, responseMode),
  )

  server.registerTool(
    'execution_consent_decide',
    {
      description:
        'Grant or deny one execution manifest under the target consent policy. Consent is separate from credential authorization.',
      inputSchema: {
        assessmentId: z.string().min(1),
        consentId: z.string().uuid(),
        expectedExecutionManifestHash: z.string().startsWith('sha256:'),
        decision: z.enum(['GRANTED', 'REVOKED']),
        decidedBy: z.string().min(1),
        rationale: z.string().min(1),
        expiresAt: z.string().datetime().optional(),
        responseMode: responseModeSchema,
      },
    },
    async ({ assessmentId, responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request(`quality/assessments/${assessmentId}/execution-consent`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          responseMode,
        ),
      ),
  )

  server.registerTool(
    'assessment_finding_record',
    {
      description:
        'Record a hash-bound obligation finding from sealed evidence. Only target_defect attribution may violate an obligation.',
      inputSchema: {
        assessmentId: z.string().min(1),
        obligationId: z.string().min(1),
        outcome: z.enum(['SATISFIED', 'VIOLATED', 'NOT_EVALUATED']),
        attribution: z
          .object({
            schemaVersion: z.literal('1'),
            kind: z.enum([
              'target_defect',
              'requirement_ambiguity',
              'validation_design_defect',
              'validation_realization_defect',
              'appraise_runtime_defect',
              'environment_or_data_defect',
              'automation_blocked',
              'inconclusive',
            ]),
            supportingEvidenceHashes: z.array(z.string().startsWith('sha256:')).min(1),
            contradictingEvidenceHashes: z.array(z.string().startsWith('sha256:')),
            validationRechecked: z.boolean(),
            requirementAlignmentConfirmed: z.boolean(),
            confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
            rationale: z.string().min(1),
          })
          .strict()
          .optional(),
        evidenceReceiptIds: z.array(z.string().min(1)).min(1),
        expectedEvidenceSetHash: z.string().startsWith('sha256:'),
        responseMode: responseModeSchema,
      },
    },
    async ({ assessmentId, responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request(`quality/assessments/${assessmentId}/findings`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
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
      lifecyclePost(api, assessmentReconciliationPath(assessmentId), body, responseMode),
  )

  server.registerTool(
    'assessment_review',
    {
      description:
        'Read the assessment review packet, alignment status, evidence hash, assurance observations, and decision blockers. Human-verification blocked evidence remains targetOutcome not_evaluated.',
      inputSchema: assessmentDecisionInputSchema.shape,
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
        decision: z.enum(['accepted', 'rejected', 'accepted_with_limitations', 'needs_revision']),
        decidedBy: z.string().min(1),
        rationale: z.string().min(1),
        responseMode: decisionResponseModeSchema,
      },
    },
    async ({ assessmentId, responseMode, ...body }) =>
      lifecyclePost(api, `quality/assessments/${assessmentId}/decision`, body, responseMode),
  )
}
