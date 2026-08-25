import { z } from 'zod'

import { randomUUID } from 'node:crypto'

import { CoordinatorRequestError } from '../coordinator-client.js'

export const responseModeEnum = z
  .enum(['summary', 'decisionOnly', 'evidenceOnly', 'blockersOnly', 'linksOnly', 'full'])
  .describe(
    'Response projection: summary (compact default), decisionOnly (decision hash/status/counts), evidenceOnly, blockersOnly, linksOnly, or full (largest payload).',
  )
export const responseModeSchema = responseModeEnum.default('summary')
export const decisionResponseModeSchema = responseModeEnum.default('decisionOnly')

export const MCP_RESPONSE_TOKEN_BUDGETS = {
  diagnostic: 1000,
  qualityMutation: 1500,
  assessmentMutation: 1500,
} as const

export function measureMcpResponse(value: unknown) {
  const json = JSON.stringify(value)
  return { bytes: Buffer.byteLength(json, 'utf8'), estimatedTokens: Math.ceil(Buffer.byteLength(json, 'utf8') / 4) }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function compactPreparationPreflight(value: unknown) {
  const preflight = record(value)
  if (!preflight) return undefined
  return {
    ready: preflight.ready,
    validationCount: preflight.validationCount,
    stepReferenceCount: preflight.stepReferenceCount,
    locatorReferenceCount: preflight.locatorReferenceCount,
    stepReferenceHash: preflight.stepReferenceHash,
    locatorReferenceHash: preflight.locatorReferenceHash,
    algorithmVersion: preflight.algorithmVersion,
    scopeIntentHash: preflight.scopeIntentHash,
    realizationIntentHash: preflight.realizationIntentHash,
    preflightHash: preflight.preflightHash,
    expectedPreflight: preflight.expectedPreflight,
    validations: preflight.validations,
    diagnostics: preflight.diagnostics,
  }
}

function preflightLifecycleResponse(payload: Record<string, unknown>) {
  const preflight = compactPreparationPreflight(payload.preflight)
  const preflightSummary = (preflight ?? compactPreparationPreflight(payload) ?? {}) as Record<string, unknown>
  return {
    preflight,
    algorithmVersion: preflightSummary.algorithmVersion,
    scopeIntentHash: preflightSummary.scopeIntentHash,
    realizationIntentHash: preflightSummary.realizationIntentHash,
    preflightHash: preflightSummary.preflightHash,
    expectedPreflight: preflightSummary.expectedPreflight ?? payload.expectedPreflight,
    validationCount: preflightSummary.validationCount,
    stepReferenceCount: preflightSummary.stepReferenceCount,
    locatorReferenceCount: preflightSummary.locatorReferenceCount,
    stepReferenceHash: preflightSummary.stepReferenceHash,
    locatorReferenceHash: preflightSummary.locatorReferenceHash,
    validations: preflightSummary.validations,
    diagnostics: preflightSummary.diagnostics,
  }
}

function subjectRevisionId(payload: Record<string, unknown>) {
  const subject = record(payload.subject)
  return payload.subjectRevisionId ?? subject?.id
}

function validSubjectRevisionId(payload: Record<string, unknown>) {
  const subject = record(payload.subject)
  const id = payload.subjectRevisionId ?? subject?.id
  return typeof id === 'string' && id.trim().length > 0 ? id : undefined
}

/** A requirement-query answer can create a new immutable Quality Plan
 * revision. Keep its exact successor handoff machine-usable in compact MCP
 * responses, without projecting the revision's source, requirement graph, or
 * other authoring payload. */
function revisionIdentity(value: unknown) {
  const revision = record(value)
  if (!revision) return undefined
  return {
    id: revision.id,
    revision: revision.revision,
    status: revision.status,
    contentHash: revision.contentHash,
  }
}

const sha256HashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const authorizationHandoffSchema = z
  .object({
    executionRequestId: z.string().uuid(),
    expectedRequestHash: sha256HashSchema,
    expiresAt: z.string().datetime(),
    authorizationRequestCreated: z.literal(true),
    nextAction: z
      .object({
        tool: z.literal('assessment_prepare_run'),
        reason: z.string().trim().min(1).max(1_000),
      })
      .strict(),
  })
  .strict()

function authorizationHandoff(payload: Record<string, unknown>) {
  const parsed = authorizationHandoffSchema.safeParse(payload.authorization)
  return parsed.success ? parsed.data : undefined
}

function authorizationLifecycleResponse(payload: Record<string, unknown>) {
  const authorization = authorizationHandoff(payload)
  if (authorization) return { durableState: 'authorization_request_committed' as const, authorization }
  const executionConsent = executionConsentHandoffSchema.safeParse(payload.executionConsent)
  return executionConsent.success
    ? {
        durableState: 'execution_consent_request_committed' as const,
        executionConsent: executionConsent.data,
      }
    : {}
}

const executionConsentHandoffSchema = z
  .object({
    assessmentId: z.string().min(1),
    consentId: z.string().uuid(),
    expectedExecutionManifestHash: sha256HashSchema,
    consentRequestCreated: z.literal(true),
    nextAction: z
      .object({
        tool: z.literal('execution_consent_decide'),
        arguments: z
          .object({
            assessmentId: z.string().min(1),
            consentId: z.string().uuid(),
            expectedExecutionManifestHash: sha256HashSchema,
          })
          .strict(),
        reason: z.string().trim().min(1).max(1_000),
      })
      .strict(),
  })
  .strict()

const remotePreflightTokenSchema = z
  .object({
    algorithmVersion: z.literal('appraise.quality-assessment-preflight/v2'),
    preflightHash: sha256HashSchema,
  })
  .strict()
const remoteScopeReceiptSchema = z
  .object({
    scopeHash: sha256HashSchema,
    algorithmVersion: z.literal('appraise.quality-assessment-preflight/v2'),
    scopeIntentHash: sha256HashSchema,
    realizationIntentHash: sha256HashSchema,
    preflightHash: sha256HashSchema,
    expectedPreflight: remotePreflightTokenSchema,
    validationBindingsHash: sha256HashSchema,
    environmentId: z.string().min(1),
  })
  .strict()

function invalidRemoteScopeReceiptError(operation = 'evaluation_subject_remote_scope_create') {
  return new CoordinatorRequestError(502, undefined, {
    schema: 'appraise.error/v1',
    errorId: randomUUID(),
    occurredAt: new Date().toISOString(),
    classification: 'appraise_runtime_defect',
    code: 'remote_scope_receipt_invalid',
    message: 'Coordinator returned an invalid remote scope receipt.',
    httpStatus: 502,
    operation: { name: operation },
    // A 2xx scope-issuance response may already have committed its durable
    // idempotency receipt. The adapter cannot truthfully call that not-started.
    operationOutcome: 'unknown',
    targetOutcome: 'not_evaluated',
    retry: {
      safe: false,
      strategy: 'read_state_then_retry',
      nextAction: {
        tool: operation,
        reason: 'Reconcile the remote scope issuance with the original idempotency key before making another request.',
      },
    },
  })
}

function invalidRemoteScopeReadError() {
  return new CoordinatorRequestError(502, undefined, {
    schema: 'appraise.error/v1',
    errorId: randomUUID(),
    occurredAt: new Date().toISOString(),
    classification: 'appraise_runtime_defect',
    code: 'remote_scope_recovery_invalid',
    message: 'Coordinator returned an invalid remote scope recovery packet.',
    httpStatus: 502,
    operation: { name: 'evaluation_subject_remote_scope_read' },
    operationOutcome: 'unknown',
    targetOutcome: 'not_evaluated',
    retry: {
      safe: false,
      strategy: 'read_state_then_retry',
      nextAction: {
        tool: 'evaluation_subject_remote_scope_read',
        reason: 'Reconnect and re-read the exact remote scope before preparing an Assessment.',
      },
    },
  })
}

/** Keep a remote-scope issuance response portable without widening its public
 * surface when a server-only scope field is added later. */
function remoteScopeReceipt(value: unknown) {
  if (value === undefined) return undefined
  const parsed = remoteScopeReceiptSchema.safeParse(value)
  // The scope issuer—not the MCP adapter—is authoritative for this token.
  // A partial or conflicting service payload fails closed rather than being
  // repaired from sibling fields, so a caller can never continue on inferred
  // intent while retaining a successful subject receipt.
  if (!parsed.success || parsed.data.expectedPreflight.preflightHash !== parsed.data.preflightHash)
    throw invalidRemoteScopeReceiptError()
  return parsed.data
}

const remoteScopeRecoveryValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(16_384),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(remoteScopeRecoveryValueSchema).max(100),
    z.record(z.string().max(128), remoteScopeRecoveryValueSchema),
  ]),
)
const remoteScopeRecoveryBindingsSchema = z
  .array(
    z
      .object({
        validationId: z.string().min(1),
        locatorIds: z.array(z.string().min(1)).max(100),
        steps: z
          .array(
            z
              .object({
                stepId: z.string().min(1),
                version: z.string().min(1),
                inputs: z.record(z.string(), remoteScopeRecoveryValueSchema),
                keyword: z.enum(['Given', 'When', 'Then', 'And']),
                description: z.string().min(1).max(500),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
  )
  .min(1)
const remoteScopeRecoveryBaseSchema = z
  .object({
    subject: z
      .object({
        subjectRevisionId: z.string().min(1),
        subjectDigest: sha256HashSchema,
        subjectKind: z.literal('REMOTE_EVALUATION_SCOPE'),
        authority: z.literal('appraisejs:remote-evaluation-scope:v2'),
      })
      .strict(),
    targetProjectId: z.string().min(1),
    qualityPlanId: z.string().min(1),
    revisionId: z.string().min(1),
    expectedDesignHash: sha256HashSchema,
    environment: z.object({ environmentId: z.string().min(1) }).strict(),
    runtime: z.object({ browserEngine: z.literal('CHROMIUM') }).strict(),
    scope: remoteScopeReceiptSchema,
    counts: z
      .object({
        validationCount: z.number().int().nonnegative(),
        stepCount: z.number().int().nonnegative(),
        locatorCount: z.number().int().nonnegative(),
      })
      .strict(),
    nextRecommendedAction: z.string().min(1),
  })
  // Strip, rather than reject, unknown persistence fields. The projector
  // returns the parsed whitelist below, so an otherwise valid recovery never
  // leaks a newly added coordinator field.
  .strip()

/** Recovery has a deliberately different full-mode rule from generic
 * lifecycle projections: full is the reviewed compact packet that can be
 * passed straight to preflight. Whitelist every returned property so an
 * accidental persistence field can never cross the MCP boundary. */
export function projectRemoteScopeReadResponse(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  const source = record(value)
  const base = remoteScopeRecoveryBaseSchema.safeParse(source)
  if (!base.success) throw invalidRemoteScopeReadError()
  if (responseMode !== 'full') return base.data
  const full = remoteScopeRecoveryBaseSchema
    .extend({ validationBindings: remoteScopeRecoveryBindingsSchema })
    .safeParse(source)
  if (!full.success) throw invalidRemoteScopeReadError()
  return full.data
}

function lifecycleIdentityResponse(payload: Record<string, unknown>) {
  return {
    status: payload.status,
    qualityPlanId: payload.qualityPlanId,
    revisionId: payload.revisionId,
    revision: revisionIdentity(payload.revision),
    predecessorRevisionId: payload.predecessorRevisionId,
    idempotent: payload.idempotent,
    preparationId: payload.preparationId,
    phase: payload.phase,
    subject: payload.subject,
    // Keep the exact opaque identifier at top-level as well as under subject,
    // so the next-operation payload is machine-constructible from the compact
    // default response rather than from recommendation prose.
    subjectRevisionId: subjectRevisionId(payload),
    scope: remoteScopeReceipt(payload.scope),
    replayed: payload.replayed,
    environment: payload.environment,
    publication: payload.publication,
    assessment: payload.assessment,
    assessmentRun: payload.assessmentRun,
    hashes: payload.hashes,
    assessmentId: payload.assessmentId,
    assessmentRunId: payload.assessmentRunId,
    validationVersionId: payload.validationVersionId,
    evidenceSetHash: payload.evidenceSetHash,
    nextRecommendedAction: payload.nextRecommendedAction,
    nextRequiredAgentBehavior: payload.nextRequiredAgentBehavior,
    ...authorizationLifecycleResponse(payload),
  }
}

function commonLifecycleResponse(payload: Record<string, unknown>) {
  return { ...preflightLifecycleResponse(payload), ...lifecycleIdentityResponse(payload) }
}

function projectDecisionOnly(payload: Record<string, unknown>, common: ReturnType<typeof commonLifecycleResponse>) {
  return {
    ...common,
    targetOutcome: payload.targetOutcome,
    readiness: payload.readiness,
    evidenceReceiptCount: payload.evidenceReceiptCount,
    decisions: payload.decisions,
  }
}

function projectLinksOnly(payload: Record<string, unknown>, common: ReturnType<typeof commonLifecycleResponse>) {
  return { ...common, links: payload.links, browserUrl: payload.browserUrl }
}

function projectBlockersOnly(payload: Record<string, unknown>, common: ReturnType<typeof commonLifecycleResponse>) {
  return { ...common, blockers: payload.blockers, warnings: payload.warnings }
}

function projectEvidenceOnly(payload: Record<string, unknown>, common: ReturnType<typeof commonLifecycleResponse>) {
  return {
    ...common,
    evidence: payload.evidence,
    receipts: payload.receipts,
    counts: payload.counts,
    hashes: payload.hashes,
  }
}

function projectSummary(payload: Record<string, unknown>, common: ReturnType<typeof commonLifecycleResponse>) {
  return {
    ...common,
    ready: payload.ready,
    blockers: payload.blockers,
    warnings: payload.warnings,
    links: payload.links,
  }
}

function project(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  const payload = record(value)
  if (!payload) return value
  if (responseMode === 'full') {
    if (payload.scope !== undefined) {
      const scope = remoteScopeReceipt(payload.scope)
      return {
        subject: payload.subject,
        subjectRevisionId: subjectRevisionId(payload),
        scope,
        replayed: payload.replayed,
        nextRecommendedAction: payload.nextRecommendedAction,
        nextRequiredAgentBehavior: payload.nextRequiredAgentBehavior,
      }
    }
    // Full is diagnostic breadth, not permission to disclose canonical
    // preflight internals (locator values, Step inputs, or source bindings).
    // The public identity is hashes/counts in every response mode.
    const redactPreflight = (candidate: unknown): Record<string, unknown> => {
      const item = record(candidate)
      if (!item) return {}
      const next = { ...item }
      delete next.scopeIntent
      delete next.realizationIntent
      delete next.validationBindings
      delete next.authorization
      delete next.executionConsent
      delete next.durableState
      return next
    }
    return {
      ...redactPreflight(payload),
      ...(payload.subject ? { subjectRevisionId: subjectRevisionId(payload) } : {}),
      ...(payload.preflight ? { preflight: redactPreflight(payload.preflight) } : {}),
      ...(payload.scope ? { scope: remoteScopeReceipt(payload.scope) } : {}),
      ...authorizationLifecycleResponse(payload),
    }
  }
  const common = commonLifecycleResponse(payload)
  switch (responseMode) {
    case 'decisionOnly':
      return projectDecisionOnly(payload, common)
    case 'linksOnly':
      return projectLinksOnly(payload, common)
    case 'blockersOnly':
      return projectBlockersOnly(payload, common)
    case 'evidenceOnly':
      return projectEvidenceOnly(payload, common)
    default:
      return projectSummary(payload, common)
  }
}

export function applyResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  return project(value, responseMode)
}

/** `scope` is optional on generic lifecycle payloads, but it is mandatory on
 * the successful remote-scope issuance operation. Keep that stronger contract
 * at the operation boundary rather than breaking unrelated projections. */
export function projectRemoteScopeCreateResponse(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  const payload = record(value)
  if (!payload || !validSubjectRevisionId(payload) || payload.scope === undefined)
    throw invalidRemoteScopeReceiptError()
  remoteScopeReceipt(payload.scope)
  return project(value, responseMode)
}

const remoteScopePartitionCreateResponseSchema = z
  .object({
    manifest: z
      .object({
        manifestId: z.string().min(1),
        manifestHash: sha256HashSchema,
        coverageHash: sha256HashSchema,
      })
      .strict(),
    children: z
      .array(
        z
          .object({
            partitionKey: z.string().min(1),
            environmentId: z.string().min(1),
            childHash: sha256HashSchema,
            validationBindings: remoteScopeRecoveryBindingsSchema,
            subject: z
              .object({
                subjectRevisionId: z.string().min(1),
                subjectDigest: sha256HashSchema,
                subjectKind: z.literal('REMOTE_EVALUATION_SCOPE'),
                authority: z.literal('appraisejs:remote-evaluation-scope:v2'),
              })
              .strict(),
            scope: remoteScopeReceiptSchema,
          })
          .strict(),
      )
      .min(1),
    replayed: z.boolean(),
    nextRecommendedAction: z.string().min(1),
  })
  .strict()

export function projectRemoteScopePartitionCreateResponse(
  value: unknown,
  responseMode: z.infer<typeof responseModeSchema>,
) {
  void responseMode
  const parsed = remoteScopePartitionCreateResponseSchema.safeParse(value)
  if (!parsed.success) throw invalidRemoteScopeReceiptError('evaluation_subject_remote_scope_partition_create')
  return parsed.data
}

export function applyLifecycleResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  return project(value, responseMode)
}

export function applyAuthoringResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  return project(value, responseMode)
}

export function applyCapsuleDiagnosticMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  if (responseMode === 'full') return value
  const diagnostic = record(value)
  if (!diagnostic) return value
  const preflight = record(diagnostic.preflight)
  if (responseMode === 'blockersOnly')
    return {
      schemaVersion: diagnostic.schemaVersion,
      blockers: diagnostic.blockers,
      failureOutput: preflight?.failureOutput,
      nextRecoveryAction: diagnostic.nextRecoveryAction,
    }
  if (responseMode === 'evidenceOnly')
    return { schemaVersion: diagnostic.schemaVersion, run: diagnostic.run, evidence: diagnostic.evidence }
  if (responseMode === 'linksOnly') {
    const evidence = record(diagnostic.evidence)
    return { schemaVersion: diagnostic.schemaVersion, runId: record(diagnostic.run)?.runId, links: evidence?.links }
  }
  return project(value, responseMode)
}
