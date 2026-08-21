import type { McpRegistryContext } from '../registry.js'
import {
  applyAuthoringResponseMode,
  applyLifecycleResponseMode,
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
    'assessment_create_successor',
    {
      description:
        'Create one immutable READY retry successor for a DECIDED, STALE, CANCELLED, or explicitly retried EVIDENCE_REVIEW assessment. The predecessor evidence and decision are never changed.',
      inputSchema: {
        assessmentId: z.string().min(1),
        subject: z.object({
          subjectDigest: z.string().startsWith('sha256:'),
          authority: z.string().min(1),
          subjectKind: z.enum(['ARTIFACT', 'DEPLOYMENT_SNAPSHOT']).optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
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
      text(
        applyLifecycleResponseMode(
          await api.request(`quality/assessments/${assessmentId}/successors`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
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
    async ({ responseMode, ...body }) =>
      text(
        applyLifecycleResponseMode(
          await api.request('quality/assessment-runs', { method: 'POST', body: JSON.stringify(body) }),
          responseMode,
        ),
      ),
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
