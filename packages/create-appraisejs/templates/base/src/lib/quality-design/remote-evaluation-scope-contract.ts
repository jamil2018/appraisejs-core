import { createHash } from 'node:crypto'

import { z } from 'zod'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  canonicalFrozenRemoteEnvironmentPacket,
  canonicalFrozenRemoteOrigin,
} from '@/lib/quality-design/frozen-environment-snapshot'
import { hashCanonical } from '@/lib/quality-design/state'
import { ServiceError } from '@/services/shared/errors'

/**
 * A remote scope is an immutable evaluation *intent*.  v1 mixed that intent
 * with realization/publication outputs, which allowed Appraise-owned writes to
 * make an otherwise valid scope stale.  Keep the version here (rather than in
 * callers) so every public surface speaks one contract.
 */
export const REMOTE_EVALUATION_SCOPE_AUTHORITY = 'appraisejs:remote-evaluation-scope:v2'
export const QUALITY_VALIDATION_PUBLICATION_AUTHORITY = 'appraisejs:quality-validation-publication:v2'
export const REMOTE_EVALUATION_SCOPE_SCHEMA = 'appraise.remote-evaluation-scope/v2'
export const REMOTE_EVALUATION_SCOPE_PARTITION_SCHEMA = 'appraise.remote-evaluation-scope-partition-manifest/v1'
export const ASSESSMENT_PREFLIGHT_ALGORITHM = 'appraise.quality-assessment-preflight/v2'
export const ASSESSMENT_PREFLIGHT_RECEIPT_SCHEMA = 'appraise.quality-assessment-preflight-receipt/v2'

/** The persisted publication authority is an execution gate, not descriptive
 * metadata. Remote scope publications carry their scope issuer; every other
 * v2 publication carries the Quality publication issuer. */
export function expectedQualityPublicationPreflightAuthority(targetKind: string) {
  return targetKind === 'REMOTE_BLACK_BOX'
    ? REMOTE_EVALUATION_SCOPE_AUTHORITY
    : QUALITY_VALIDATION_PUBLICATION_AUTHORITY
}

export function isKnownQualityPublicationPreflightAuthority(authority: unknown) {
  return authority === REMOTE_EVALUATION_SCOPE_AUTHORITY || authority === QUALITY_VALIDATION_PUBLICATION_AUTHORITY
}

const remoteScopeStepValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(16_384),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(remoteScopeStepValueSchema).max(100),
    z.record(z.string().max(128), remoteScopeStepValueSchema),
  ]),
)

const remoteScopeStepBindingSchema = z
  .object({
    stepId: z.string().min(1),
    version: z.string().min(1),
    inputs: z.record(z.string(), remoteScopeStepValueSchema).default({}),
    keyword: z.enum(['Given', 'When', 'Then', 'And']).default('Given'),
    description: z.string().min(1).max(500),
  })
  .strict()

export const remoteScopeValidationBindingSchema = z
  .object({
    validationId: z.string().min(1),
    steps: z.array(remoteScopeStepBindingSchema).min(1),
    locatorIds: z.array(z.string().min(1)).max(100).default([]),
  })
  .strict()

export const remoteEvaluationScopeCreateSchema = z
  .object({
    target: z.string().min(1),
    qualityPlanId: z.string().min(1),
    revisionId: z.string().min(1),
    expectedDesignHash: z.string().startsWith('sha256:'),
    validationBindings: z.array(remoteScopeValidationBindingSchema).min(1),
    environment: z.object({ environmentId: z.string().min(1) }).strict(),
    runtime: z
      .object({ browserEngine: z.literal('CHROMIUM').optional() })
      .strict()
      .default({}),
    idempotencyKey: z.string().trim().min(1).max(1_000),
  })
  .strict()

/** Atomic partition issuance is additive: v2 continues to require one
 * environment and the complete approved validation set. Every child below
 * carries one frozen environment and a nonempty subset. */
export const remoteEvaluationScopePartitionCreateSchema = z
  .object({
    target: z.string().min(1),
    qualityPlanId: z.string().min(1),
    revisionId: z.string().min(1),
    expectedDesignHash: z.string().startsWith('sha256:'),
    partitions: z
      .array(
        z
          .object({
            partitionKey: z.string().trim().min(1).max(200),
            environment: z.object({ environmentId: z.string().min(1) }).strict(),
            validationBindings: z.array(remoteScopeValidationBindingSchema).min(1),
          })
          .strict(),
      )
      .min(1),
    runtime: z
      .object({ browserEngine: z.literal('CHROMIUM').optional() })
      .strict()
      .default({}),
    idempotencyKey: z.string().trim().min(1).max(1_000),
  })
  .strict()

/** A recovery read is deliberately narrower than scope issuance: it names an
 * already durable v2 subject and can only return its bounded public handoff.
 * The complete response mode remains useful to resume preparation, while all
 * other standard response modes use the compact summary projection. */
export const remoteEvaluationScopeReadSchema = z
  .object({
    target: z.string().min(1),
    qualityPlanId: z.string().min(1),
    revisionId: z.string().min(1),
    subjectRevisionId: z.string().min(1),
    expectedSubjectDigest: z.string().startsWith('sha256:').optional(),
    expectedScopeHash: z.string().startsWith('sha256:').optional(),
    expectedPreflightHash: z.string().startsWith('sha256:').optional(),
    responseMode: z
      .enum(['summary', 'decisionOnly', 'evidenceOnly', 'blockersOnly', 'linksOnly', 'full'])
      .default('summary'),
  })
  .strict()

export const remoteSubjectReferenceSchema = z
  .object({
    subjectRevisionId: z.string().min(1),
    expectedSubjectDigest: z.string().startsWith('sha256:').optional(),
  })
  .strict()

export type RemoteEvaluationScopeCreateInput = z.infer<typeof remoteEvaluationScopeCreateSchema>
export type RemoteEvaluationScopePartitionCreateInput = z.infer<typeof remoteEvaluationScopePartitionCreateSchema>
export type RemoteEvaluationScopeReadInput = z.infer<typeof remoteEvaluationScopeReadSchema>
export type RemoteSubjectReference = z.infer<typeof remoteSubjectReferenceSchema>

/** Immutable approved-validation catalog identity. The scope binds this
 * separately from server-owned realization/publication lifecycle output. */
export type RemoteScopeValidationIdentity = {
  validationVersionId: string
  validationIdentity: string
  version: number
  canonicalHash: string
  canonicalAstHash: string
  /** Compiler-owned canonical intent, never a persisted realization output. */
  realizationIntentHash: string
}

export type RemoteScopeBinding = {
  id: string
  evaluationSubjectRevisionId: string
  targetProjectId: string
  qualityPlanId: string
  qualityPlanRevisionId: string
  environmentId: string
  scopeHash: string
  scopeSchemaVersion: string
  preflightAlgorithmVersion: string
  scopeIntentHash: string
  realizationIntentHash: string
  preflightHash: string
  canonicalPreflightJson: string
  targetFingerprint: string
  designHash: string
  revisionContentHash: string
  validationBindingsHash: string
  /** Transitional database field retained for audit. v2 callers use preflightHash. */
  realizationPreflightHash: string
  runtimePolicyHash: string
  securityPolicyHash: string
  evidencePolicyHash: string
  canonicalScopeJson: string
  validationBindingsJson: string
  environmentSnapshotHash: string
  environmentSnapshotJson: string
  environmentScopeVersion: number
  environmentUpdatedAt: Date
}

export type RemoteScopePhaseBinding = Pick<
  RemoteScopeBinding,
  | 'targetProjectId'
  | 'qualityPlanId'
  | 'qualityPlanRevisionId'
  | 'environmentId'
  | 'preflightAlgorithmVersion'
  | 'scopeIntentHash'
  | 'realizationIntentHash'
  | 'preflightHash'
  /** Historical v1-compatible alias only. Phase authority is the v2 tuple
   * above; callers must never use this alone as an execution identity. */
  | 'scopeHash'
  | 'environmentSnapshotHash'
  | 'environmentSnapshotJson'
  | 'environmentScopeVersion'
  | 'environmentUpdatedAt'
> & { subjectRevisionId: string }

export type RemoteScopeTarget = {
  id: string
  kind: string
  fingerprint: string
  canonicalIdentity: string
  normalizedRemoteOrigin: string | null
}

export type RemoteScopeEnvironment = {
  id: string
  targetProjectId: string
  name: string
  baseUrl: string
  expectedPageTitle: string | null
  apiBaseUrl: string | null
  username: string | null
  credentialState: string
  passwordEnvironmentVariable: string | null
  scopeVersion: number
  updatedAt: Date
}

export function remoteScopePhaseBinding(input: {
  subject: { id: string }
  binding: RemoteScopeBinding | null | undefined
}): RemoteScopePhaseBinding {
  if (!input.binding)
    throw new ServiceError('Remote evaluation scope binding is incomplete or stale.', 'CONFLICT', 409, {
      code: 'remote_evaluation_scope_stale',
    })
  return {
    subjectRevisionId: input.subject.id,
    targetProjectId: input.binding.targetProjectId,
    qualityPlanId: input.binding.qualityPlanId,
    qualityPlanRevisionId: input.binding.qualityPlanRevisionId,
    environmentId: input.binding.environmentId,
    preflightAlgorithmVersion: input.binding.preflightAlgorithmVersion,
    scopeIntentHash: input.binding.scopeIntentHash,
    realizationIntentHash: input.binding.realizationIntentHash,
    preflightHash: input.binding.preflightHash,
    scopeHash: input.binding.scopeHash,
    environmentSnapshotHash: input.binding.environmentSnapshotHash,
    environmentSnapshotJson: input.binding.environmentSnapshotJson,
    environmentScopeVersion: input.binding.environmentScopeVersion,
    environmentUpdatedAt: input.binding.environmentUpdatedAt,
  }
}

export function normalizedRemoteScopeBindings(bindings: RemoteEvaluationScopeCreateInput['validationBindings']) {
  return [...bindings]
    .map(binding => ({ ...binding, locatorIds: [...binding.locatorIds].sort() }))
    .sort((left, right) => left.validationId.localeCompare(right.validationId))
}

export function normalizedRemoteScopePartitions(partitions: RemoteEvaluationScopePartitionCreateInput['partitions']) {
  return [...partitions]
    .map(partition => ({
      partitionKey: partition.partitionKey,
      environment: { environmentId: partition.environment.environmentId },
      validationBindings: normalizedRemoteScopeBindings(partition.validationBindings),
    }))
    .sort((left, right) => left.partitionKey.localeCompare(right.partitionKey))
}

export function remoteScopePartitionRequestIdentity(input: RemoteEvaluationScopePartitionCreateInput) {
  return {
    schemaVersion: REMOTE_EVALUATION_SCOPE_PARTITION_SCHEMA,
    target: input.target,
    qualityPlanId: input.qualityPlanId,
    revisionId: input.revisionId,
    expectedDesignHash: input.expectedDesignHash,
    partitions: normalizedRemoteScopePartitions(input.partitions),
    runtime: { browserEngine: 'CHROMIUM' as const },
  }
}

export function remoteScopeRequestIdentity(input: RemoteEvaluationScopeCreateInput) {
  return {
    target: input.target,
    qualityPlanId: input.qualityPlanId,
    revisionId: input.revisionId,
    expectedDesignHash: input.expectedDesignHash,
    validationBindings: normalizedRemoteScopeBindings(input.validationBindings),
    environment: input.environment,
    runtime: { browserEngine: 'CHROMIUM' as const },
  }
}

export function remoteScopePolicies() {
  return {
    runtimePolicyHash: hashCanonical({ schemaVersion: 'remote-scope-runtime/v1', browserEngine: 'CHROMIUM' }),
    securityPolicyHash: hashCanonical({
      schemaVersion: 'remote-scope-security/v1',
      credentials: 'not_resolved',
      targetIo: 'none_during_scope_issuance',
    }),
    evidencePolicyHash: hashCanonical({
      schemaVersion: 'remote-scope-evidence/v1',
      targetContentIdentity: 'not_asserted',
      identityStrength: 'evaluation_scope_only',
    }),
  }
}

export function canonicalRemoteEvaluationOrigin(value: string, label = 'Remote URL') {
  try {
    return canonicalFrozenRemoteOrigin(value, label)
  } catch (error) {
    throw new ServiceError(error instanceof Error ? error.message : String(error), 'VALIDATION')
  }
}

export function canonicalRemoteEvaluationEnvironmentBinding(
  environment: RemoteScopeEnvironment,
  target: RemoteScopeTarget,
) {
  const packet = canonicalFrozenRemoteEnvironmentPacket(environment)
  if (packet.targetProjectId !== target.id)
    throw new ServiceError('Remote environment must belong to the registered remote target.', 'CONFLICT')
  const targetOrigin = target.normalizedRemoteOrigin
    ? canonicalRemoteEvaluationOrigin(target.normalizedRemoteOrigin, 'Registered remote target origin')
    : null
  if (!targetOrigin || packet.baseUrl !== targetOrigin)
    throw new ServiceError(
      'Remote environment origin must exactly match the registered remote target origin.',
      'CONFLICT',
    )
  return packet
}

export function remoteScopeEnvironmentSnapshot(environment: RemoteScopeEnvironment, target: RemoteScopeTarget) {
  return canonicalRemoteEvaluationEnvironmentBinding(environment, target)
}

export function remoteEvaluationScopeDigest(canonicalScope: unknown) {
  return `sha256:${createHash('sha256')
    .update(canonicalContractJson({ domain: REMOTE_EVALUATION_SCOPE_SCHEMA, canonicalScope }))
    .digest('hex')}`
}
