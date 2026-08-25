import { createHash } from 'node:crypto'

import { z } from 'zod'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { parseFrozenRemoteEnvironmentPacket } from '@/lib/quality-design/frozen-environment-snapshot'
import {
  canonicalRemoteEvaluationEnvironmentBinding,
  canonicalRemoteEvaluationOrigin,
  normalizedRemoteScopeBindings,
  remoteEvaluationScopeCreateSchema,
  remoteEvaluationScopePartitionCreateSchema,
  remoteEvaluationScopeReadSchema,
  remoteScopeEnvironmentSnapshot,
  remoteScopePolicies,
  remoteScopeRequestIdentity,
  remoteScopePartitionRequestIdentity,
  remoteSubjectReferenceSchema,
  REMOTE_EVALUATION_SCOPE_AUTHORITY,
  REMOTE_EVALUATION_SCOPE_PARTITION_SCHEMA,
  REMOTE_EVALUATION_SCOPE_SCHEMA,
  ASSESSMENT_PREFLIGHT_ALGORITHM,
  type RemoteEvaluationScopeCreateInput,
  type RemoteEvaluationScopePartitionCreateInput,
  type RemoteScopeBinding,
  type RemoteScopeEnvironment,
  type RemoteScopePhaseBinding,
  type RemoteScopeTarget,
  type RemoteSubjectReference,
} from '@/lib/quality-design/remote-evaluation-scope-contract'
import { hashCanonical } from '@/lib/quality-design/state'
import { ServiceError } from '@/services/shared/errors'

export {
  canonicalRemoteEvaluationEnvironmentBinding,
  canonicalRemoteEvaluationOrigin,
  remoteScopePhaseBinding,
  type RemoteScopePhaseBinding,
  type RemoteSubjectReference,
} from '@/lib/quality-design/remote-evaluation-scope-contract'
export { remoteEvaluationScopeDigest } from '@/lib/quality-design/remote-evaluation-scope-contract'

const db = prisma as typeof prisma & {
  remoteEvaluationScopeBinding: {
    findFirst(args: unknown): Promise<RemoteScopeBinding | null>
    create(args: unknown): Promise<RemoteScopeBinding>
  }
  remoteEvaluationScopeIssuance: {
    findFirst(args: unknown): Promise<{ id: string; requestHash: string; evaluationSubjectRevisionId: string } | null>
    create(args: unknown): Promise<unknown>
  }
  targetProject: { findFirst(args: unknown): Promise<RemoteScopeTarget | null> }
  environment: { findFirst(args: unknown): Promise<RemoteScopeEnvironment | null> }
}

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

/** DB-only exact target lookup. This deliberately never calls the general
 * resolver, whose LOCAL_WORKSPACE path may inspect the filesystem. */
type ScopeReadClient = Pick<typeof db, 'targetProject' | 'environment' | 'qualityPlanRevision'>

async function resolveExactRemoteTarget(alias: string, client: ScopeReadClient = db) {
  const target = await client.targetProject.findFirst({
    where: { OR: [{ id: alias }, { fingerprint: alias }, { canonicalIdentity: alias }] },
    select: { id: true, kind: true, fingerprint: true, canonicalIdentity: true, normalizedRemoteOrigin: true },
  })
  if (!target || target.kind !== 'REMOTE_BLACK_BOX')
    throw new ServiceError(
      'REMOTE_BLACK_BOX target was not found for the exact supplied target reference.',
      'NOT_FOUND',
    )
  return target
}

async function scopeEnvironment(target: RemoteScopeTarget, environmentId: string, client: ScopeReadClient = db) {
  const environment = await client.environment.findFirst({ where: { id: environmentId, targetProjectId: target.id } })
  if (!environment)
    throw new ServiceError('Remote scope environment was not found for the requested target.', 'NOT_FOUND')
  const snapshot = remoteScopeEnvironmentSnapshot(environment, target)
  return {
    binding: canonicalRemoteEvaluationEnvironmentBinding(environment, target),
    snapshot,
    snapshotHash: hashCanonical(snapshot),
    updatedAt: environment.updatedAt,
  }
}

type RemoteScopePreflight = {
  schemaVersion?: string
  algorithmVersion?: string
  scopeIntentHash?: string
  realizationIntentHash?: string
  preflightHash?: string
  /** Test-only legacy seam input; production resolver returns the v2 fields. */
  realizationPreflightHash?: string
  validations: unknown[]
}

export type RemoteScopeAuthority =
  { kind: 'all-approved-v2' } | { kind: 'persisted-partition-manifest'; validationVersionIds: readonly string[] }

type RemoteScopePreflightResolver = (
  input: RemoteEvaluationScopeCreateInput,
  client: typeof prisma,
  authority: RemoteScopeAuthority,
) => Promise<RemoteScopePreflight>

function unconfiguredRemoteScopePreflightResolver(): Promise<RemoteScopePreflight> {
  throw new Error('Canonical assessment preflight authority is not configured.')
}

/* The preparation service owns the read-only v2 realization authority. It
 * registers that authority below at module initialization, keeping scope
 * issuance independent from the mutating preparation module's import graph. */
let remoteScopePreflightResolver: RemoteScopePreflightResolver = unconfiguredRemoteScopePreflightResolver

export function setCanonicalAssessmentPreflightAuthority(resolver?: RemoteScopePreflightResolver) {
  remoteScopePreflightResolver = resolver ?? unconfiguredRemoteScopePreflightResolver
}

/** Test-only seam for proving issuance stays DB-only. Production always uses
 * the canonical pure preparation realization resolver above. */
export function setRemoteEvaluationScopePreflightResolverForTests(
  resolver?: (input: RemoteEvaluationScopeCreateInput, client?: typeof prisma) => Promise<RemoteScopePreflight>,
) {
  remoteScopePreflightResolver = resolver
    ? (input, client) => resolver(input, client)
    : unconfiguredRemoteScopePreflightResolver
}

type ScopeAuthority = RemoteScopeAuthority

/** Partition issuance only needs the immutable revision identity and its
 * complete ValidationVersion set. Keeping this small read model here avoids a
 * reverse dependency on the mutating quality-design coordinator service. */
async function readPartitionRevision(input: {
  targetProjectId: string
  qualityPlanId: string
  revisionId: string
  expectedDesignHash: string
}) {
  const revision = await db.qualityPlanRevision.findFirst({
    where: {
      id: input.revisionId,
      qualityPlanId: input.qualityPlanId,
      targetProjectId: input.targetProjectId,
    },
    select: {
      status: true,
      validationVersions: { select: { id: true, canonicalAstJson: true, canonicalHash: true } },
    },
  })
  if (!revision || !['SCENARIOS_APPROVED', 'REALIZED', 'PUBLISHED'].includes(revision.status))
    throw new ServiceError('Approved Quality Plan revision does not match the partition request.', 'CONFLICT')
  const designs = [...revision.validationVersions]
    .sort((left, right) => left.canonicalHash.localeCompare(right.canonicalHash))
    .map(version => JSON.parse(version.canonicalAstJson) as unknown)
  if (hashCanonical(designs) !== input.expectedDesignHash)
    throw new ServiceError('Approved Quality Plan revision does not match the partition request.', 'CONFLICT')
  return revision
}

async function scopeFor(
  input: RemoteEvaluationScopeCreateInput,
  client: typeof db = db,
  authority: ScopeAuthority = { kind: 'all-approved-v2' },
) {
  const target = await resolveExactRemoteTarget(input.target, client)
  const environment = await scopeEnvironment(target, input.environment.environmentId, client)
  const rawPreflight = await remoteScopePreflightResolver(input, client, authority)
  // Test seams may omit v2 fields, but production's resolver must never
  // downgrade a public scope to a bare legacy hash.
  const seamHash = rawPreflight.preflightHash ?? rawPreflight.realizationPreflightHash
  if (!seamHash)
    throw new ServiceError('Remote scope preflight resolver did not return a v2 preflight hash.', 'CONFLICT', 409, {
      code: 'preflight_algorithm_unsupported',
    })
  const preflight = {
    ...rawPreflight,
    schemaVersion: rawPreflight.schemaVersion ?? 'appraise.quality-assessment-preflight-receipt/v2',
    algorithmVersion: rawPreflight.algorithmVersion ?? ASSESSMENT_PREFLIGHT_ALGORITHM,
    scopeIntentHash:
      rawPreflight.scopeIntentHash ??
      hashCanonical({
        testSeam: true,
        input: remoteScopeRequestIdentity(input),
        targetFingerprint: target.fingerprint,
        environmentSnapshotHash: environment.snapshotHash,
        hash: seamHash,
      }),
    realizationIntentHash: rawPreflight.realizationIntentHash ?? seamHash,
    preflightHash: seamHash,
  }
  const policies = remoteScopePolicies()
  const revision = await client.qualityPlanRevision.findFirst({
    where: { id: input.revisionId, qualityPlanId: input.qualityPlanId, targetProjectId: target.id },
    select: { contentHash: true },
  })
  if (!revision) throw new ServiceError('Quality Plan revision was not found for the requested target.', 'NOT_FOUND')
  if (!rawPreflight.scopeIntentHash)
    preflight.scopeIntentHash = hashCanonical({
      testSeam: true,
      input: remoteScopeRequestIdentity(input),
      targetFingerprint: target.fingerprint,
      environmentSnapshotHash: environment.snapshotHash,
      revisionContentHash: revision.contentHash,
      hash: seamHash,
    })
  const canonicalScope = {
    schemaVersion: REMOTE_EVALUATION_SCOPE_SCHEMA,
    target: { id: target.id, fingerprint: target.fingerprint, kind: target.kind },
    qualityPlan: {
      id: input.qualityPlanId,
      revisionId: input.revisionId,
      revisionContentHash: revision.contentHash,
      designHash: input.expectedDesignHash,
    },
    environment: {
      ...environment.binding,
      bindingHash: hashCanonical(environment.binding),
      snapshotHash: environment.snapshotHash,
    },
    scopeIntentHash: preflight.scopeIntentHash,
    realizationIntentHash: preflight.realizationIntentHash,
    preflightHash: preflight.preflightHash,
    validation: { bindingsHash: hashCanonical(normalizedRemoteScopeBindings(input.validationBindings)) },
    policies,
    targetContentIdentity: 'not_asserted' as const,
    identityStrength: 'evaluation_scope_only' as const,
  }
  return {
    target,
    environment,
    preflight,
    policies,
    canonicalScope,
    // Scope identity is the immutable intent only. Server-owned realization
    // and publication outputs are separately verified by their own services.
    scopeHash: preflight.scopeIntentHash,
  }
}

function scopeSubjectMetadata(scopeHash: string) {
  return {
    schemaVersion: REMOTE_EVALUATION_SCOPE_SCHEMA,
    scopeHash,
    targetContentIdentity: 'not_asserted',
    identityStrength: 'evaluation_scope_only',
  }
}

function uniqueConstraint(error: unknown) {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002',
  )
}

/** SQLite may report an insert race as either the unique constraint itself or
 * a transaction/lock abort.  Both are safe to reconcile only by re-reading
 * the immutable idempotency packet below; no failed write is treated as a
 * replay without that exact durable comparison. */
function partitionReplayRace(error: unknown) {
  if (uniqueConstraint(error)) return true
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  if (candidate.code === 'P2034' || candidate.code === 'P2028') return true
  return typeof candidate.message === 'string' && /database is locked|sqlite_busy/i.test(candidate.message)
}

type ResolvedScope = Awaited<ReturnType<typeof scopeFor>>
type ScopeSubject = NonNullable<Awaited<ReturnType<typeof db.evaluationSubjectRevision.findFirst>>>
type ScopeWriteResult = { subject: ScopeSubject; replayed: boolean }

function throwScopeStale(): never {
  throw new ServiceError('Remote evaluation scope has changed before issuance.', 'CONFLICT', 409, {
    code: 'remote_evaluation_scope_stale',
  })
}

/** A scope subject turns the compact bindings into an immutable contract.
 * Read-model validation failures while recomputing that contract are catalog
 * drift, rather than fresh caller-input errors. Keep this boundary separate
 * from initial issuance, where the same failures must remain actionable
 * validation feedback for a new request. */
function throwIssuedScopeCatalogStale(): never {
  throw new ServiceError(
    'Remote evaluation scope has drifted; create a new scope before continuing.',
    'CONFLICT',
    409,
    {
      code: 'remote_evaluation_scope_stale',
    },
  )
}

async function scopeForIssuedFreshness(
  input: RemoteEvaluationScopeCreateInput,
  client: typeof db = db,
  authority: ScopeAuthority = { kind: 'all-approved-v2' },
) {
  try {
    return await scopeFor(input, client, authority)
  } catch (error) {
    // scopeFor only raises ServiceErrors for its target/environment/catalog
    // reads. A raw infrastructure failure must retain its original diagnosis.
    // A partial/missing relation from a concurrent projection is stale scope
    // state, not an untyped TypeError for callers. Infrastructure failures
    // retain their diagnosis.
    if (error instanceof ServiceError || error instanceof TypeError) throwIssuedScopeCatalogStale()
    throw error
  }
}

async function committedScopeForIssuance(
  input: RemoteEvaluationScopeCreateInput,
  expectedScope: ResolvedScope,
  tx: typeof db,
) {
  const committedScope = await scopeFor(input, tx)
  if (!sameScopePacket(expectedScope, committedScope)) throwScopeStale()
  return committedScope
}

/**
 * Scope issuance begins with an ordinary read-only request validation, but the
 * durable receipt is always derived from a second packet resolved inside the
 * write transaction.  Comparing the complete packet (rather than the old
 * scopeHash alias) prevents a realization-only or algorithm-only drift from
 * being committed under an outer read.
 */
function scopePacket(scope: ResolvedScope) {
  return {
    targetProjectId: scope.target.id,
    targetFingerprint: scope.target.fingerprint,
    qualityPlanId: scope.canonicalScope.qualityPlan.id,
    qualityPlanRevisionId: scope.canonicalScope.qualityPlan.revisionId,
    environmentId: scope.environment.snapshot.id,
    preflightAlgorithmVersion: scope.preflight.algorithmVersion,
    scopeIntentHash: scope.preflight.scopeIntentHash,
    realizationIntentHash: scope.preflight.realizationIntentHash,
    preflightHash: scope.preflight.preflightHash,
    // Retained only for historical v1 readers. It must agree with the v2
    // scope-intent field, but it is never sufficient on its own.
    scopeHash: scope.scopeHash,
    canonicalScopeJson: canonicalContractJson(scope.canonicalScope),
    environmentSnapshotHash: scope.environment.snapshotHash,
    environmentSnapshotJson: canonicalContractJson(scope.environment.snapshot),
    environmentScopeVersion: scope.environment.snapshot.scopeVersion,
  }
}

/**
 * The three durable rows that represent a remote scope are an audit packet,
 * not independently trustworthy cache entries.  Keep their comparison in one
 * place so exact replay, binding reuse, and a P2002 recovery cannot each omit
 * a semantic field.  Timestamps and generated IDs are deliberately absent.
 */
function expectedScopeSubjectPacket(scope: ResolvedScope) {
  const metadata = canonicalContractJson(scopeSubjectMetadata(scope.scopeHash))
  return {
    subjectDigest: digest({ domain: REMOTE_EVALUATION_SCOPE_SCHEMA, scopeHash: scope.scopeHash }),
    subjectKind: 'REMOTE_EVALUATION_SCOPE',
    authority: REMOTE_EVALUATION_SCOPE_AUTHORITY,
    metadataJson: metadata,
  }
}

function expectedScopeBindingPacket(scope: ResolvedScope, input: RemoteEvaluationScopeCreateInput) {
  const packet = scopePacket(scope)
  return {
    targetProjectId: packet.targetProjectId,
    qualityPlanId: input.qualityPlanId,
    qualityPlanRevisionId: input.revisionId,
    environmentId: packet.environmentId,
    scopeHash: packet.scopeHash,
    scopeSchemaVersion: REMOTE_EVALUATION_SCOPE_SCHEMA,
    preflightAlgorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
    scopeIntentHash: packet.scopeIntentHash,
    realizationIntentHash: packet.realizationIntentHash,
    preflightHash: packet.preflightHash,
    canonicalPreflightJson: canonicalContractJson(scope.preflight),
    targetFingerprint: scope.target.fingerprint,
    designHash: input.expectedDesignHash,
    revisionContentHash: scope.canonicalScope.qualityPlan.revisionContentHash,
    validationBindingsHash: scope.canonicalScope.validation.bindingsHash,
    realizationPreflightHash: scope.preflight.preflightHash,
    runtimePolicyHash: scope.policies.runtimePolicyHash,
    securityPolicyHash: scope.policies.securityPolicyHash,
    evidencePolicyHash: scope.policies.evidencePolicyHash,
    canonicalScopeJson: packet.canonicalScopeJson,
    validationBindingsJson: canonicalContractJson(normalizedRemoteScopeBindings(input.validationBindings)),
    environmentSnapshotHash: packet.environmentSnapshotHash,
    environmentSnapshotJson: packet.environmentSnapshotJson,
    environmentScopeVersion: packet.environmentScopeVersion,
  }
}

function isExactScopeSubject(
  subject: { subjectDigest: string; subjectKind: string; authority: string; metadataJson?: string | null },
  scope: ResolvedScope,
) {
  const expected = expectedScopeSubjectPacket(scope)
  return (
    subject.subjectDigest === expected.subjectDigest &&
    subject.subjectKind === expected.subjectKind &&
    subject.authority === expected.authority &&
    subject.metadataJson === expected.metadataJson
  )
}

/** The durable subject metadata is part of v2 authority, not descriptive
 * decoration. A matching ID/digest must not make a damaged metadata row
 * recoverable or runnable. */
function hasExactPersistedScopeSubjectMetadata(
  subject: { metadataJson?: string | null },
  binding: Pick<RemoteScopeBinding, 'scopeHash'>,
) {
  return subject.metadataJson === canonicalContractJson(scopeSubjectMetadata(binding.scopeHash))
}

function sameScopePacket(left: ResolvedScope, right: ResolvedScope) {
  return canonicalContractJson(scopePacket(left)) === canonicalContractJson(scopePacket(right))
}

function scopeRequestHash(scope: ResolvedScope) {
  return digest({
    schemaVersion: 'remote-evaluation-scope-request/v2',
    canonicalScope: scope.canonicalScope,
    preflight: {
      algorithmVersion: scope.preflight.algorithmVersion,
      scopeIntentHash: scope.preflight.scopeIntentHash,
      realizationIntentHash: scope.preflight.realizationIntentHash,
      preflightHash: scope.preflight.preflightHash,
    },
  })
}

function bindingMatchesScope(
  binding: RemoteScopeBinding,
  scope: ResolvedScope,
  input: RemoteEvaluationScopeCreateInput,
) {
  const expected = expectedScopeBindingPacket(scope, input)
  return Object.entries(expected).every(([field, value]) => binding[field as keyof typeof expected] === value)
}

function assertExactScopeSubjectAndBinding(
  subject: { subjectDigest: string; subjectKind: string; authority: string; metadataJson?: string | null },
  binding: RemoteScopeBinding | null | undefined,
  scope: ResolvedScope,
  input: RemoteEvaluationScopeCreateInput,
) {
  if (!binding || !isExactScopeSubject(subject, scope) || !bindingMatchesScope(binding, scope, input)) throwScopeStale()
}

async function exactScopeIssuance(
  tx: typeof db,
  scope: ResolvedScope,
  input: RemoteEvaluationScopeCreateInput,
  requestHash: string,
) {
  const replay = await tx.remoteEvaluationScopeIssuance.findFirst({
    where: { targetProjectId: scope.target.id, idempotencyKey: input.idempotencyKey },
  })
  if (!replay) return null
  if (replay.requestHash !== requestHash)
    throw new ServiceError('Remote evaluation scope idempotency key has different canonical input.', 'CONFLICT')
  const subject = await tx.evaluationSubjectRevision.findFirst({
    where: { id: replay.evaluationSubjectRevisionId },
    include: { remoteEvaluationScopeBinding: true },
  })
  if (!subject) throw new ServiceError('Remote evaluation scope issuance is incomplete.', 'CONFLICT')
  assertExactScopeSubjectAndBinding(
    subject,
    subject.remoteEvaluationScopeBinding as RemoteScopeBinding | null,
    scope,
    input,
  )
  return { subject, replayed: true } satisfies ScopeWriteResult
}

async function scopeSubjectForIssuance(tx: typeof db, scope: ResolvedScope, input: RemoteEvaluationScopeCreateInput) {
  const binding = await tx.remoteEvaluationScopeBinding.findFirst({
    where: { targetProjectId: scope.target.id, scopeHash: scope.scopeHash },
  })
  if (binding) {
    const subject = await tx.evaluationSubjectRevision.findFirst({
      where: { id: binding.evaluationSubjectRevisionId },
      include: { remoteEvaluationScopeBinding: true },
    })
    if (!subject) throw new ServiceError('Remote evaluation scope binding is incomplete.', 'CONFLICT')
    assertExactScopeSubjectAndBinding(
      subject,
      subject.remoteEvaluationScopeBinding as RemoteScopeBinding | null,
      scope,
      input,
    )
    return subject
  }
  const subjectDigest = digest({ domain: REMOTE_EVALUATION_SCOPE_SCHEMA, scopeHash: scope.scopeHash })
  const existing = await tx.evaluationSubjectRevision.findFirst({ where: { subjectDigest } })
  if (
    existing &&
    (existing.subjectKind !== 'REMOTE_EVALUATION_SCOPE' || existing.authority !== REMOTE_EVALUATION_SCOPE_AUTHORITY)
  )
    throw new ServiceError('Remote evaluation scope digest collides with a foreign subject.', 'CONFLICT')
  // A digest match only proves the hash constituent. Before it can authorize
  // a new immutable binding/issuance, require the whole canonical subject
  // packet too; a legacy/corrupt null or noncanonical metadata row must never
  // be silently promoted into the v2 audit trail.
  if (existing && !isExactScopeSubject(existing, scope)) throwScopeStale()
  const subject =
    existing ??
    (await tx.evaluationSubjectRevision.create({
      data: {
        subjectDigest,
        subjectKind: 'REMOTE_EVALUATION_SCOPE',
        authority: REMOTE_EVALUATION_SCOPE_AUTHORITY,
        metadataJson: canonicalContractJson(scopeSubjectMetadata(scope.scopeHash)),
      },
    }))
  await tx.remoteEvaluationScopeBinding.create({
    data: {
      evaluationSubjectRevisionId: subject.id,
      ...expectedScopeBindingPacket(scope, input),
      environmentUpdatedAt: scope.environment.updatedAt,
    },
  })
  return subject
}

async function writeScopeIssuance(
  tx: typeof db,
  scope: ResolvedScope,
  input: RemoteEvaluationScopeCreateInput,
  requestHash: string,
  subject: ScopeSubject,
) {
  await tx.remoteEvaluationScopeIssuance.create({
    data: {
      targetProjectId: scope.target.id,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      evaluationSubjectRevisionId: subject.id,
    },
  })
  return { subject, replayed: false } satisfies ScopeWriteResult
}

export async function createRemoteEvaluationScope(source: unknown) {
  const input = remoteEvaluationScopeCreateSchema.parse(source)
  // This first resolve is read-only input validation. The transaction below
  // repeats it and is the sole source for request hashes and public receipts.
  const outerScope = await scopeFor(input)
  const write = async () =>
    db.$transaction(async transaction => {
      const tx = transaction as typeof db
      const committedScope = await committedScopeForIssuance(input, outerScope, tx)
      const requestHash = scopeRequestHash(committedScope)
      const replay = await exactScopeIssuance(tx, committedScope, input, requestHash)
      if (replay) return { ...replay, scope: committedScope }
      const subject = await scopeSubjectForIssuance(tx, committedScope, input)
      return { ...(await writeScopeIssuance(tx, committedScope, input, requestHash, subject)), scope: committedScope }
    })
  let result: Awaited<ReturnType<typeof write>>
  try {
    result = await write()
  } catch (error) {
    if (!partitionReplayRace(error)) throw error
    // A unique race still returns through a fresh transaction-local scope
    // comparison.  Do not write a late issuance receipt against a scope read
    // before the competing mutation.
    result = await db.$transaction(async transaction => {
      const tx = transaction as typeof db
      const committedScope = await committedScopeForIssuance(input, outerScope, tx)
      const requestHash = scopeRequestHash(committedScope)
      const exact = await exactScopeIssuance(tx, committedScope, input, requestHash)
      if (exact) return { ...exact, scope: committedScope }
      const binding = await tx.remoteEvaluationScopeBinding.findFirst({
        where: { targetProjectId: committedScope.target.id, scopeHash: committedScope.scopeHash },
      })
      if (!binding) throw error
      if (!bindingMatchesScope(binding, committedScope, input)) throwScopeStale()
      const subject = await tx.evaluationSubjectRevision.findFirst({
        where: { id: binding.evaluationSubjectRevisionId },
        include: { remoteEvaluationScopeBinding: true },
      })
      if (!subject) throw error
      assertExactScopeSubjectAndBinding(
        subject,
        subject.remoteEvaluationScopeBinding as RemoteScopeBinding | null,
        committedScope,
        input,
      )
      try {
        return { ...(await writeScopeIssuance(tx, committedScope, input, requestHash, subject)), scope: committedScope }
      } catch (issuanceError) {
        if (!uniqueConstraint(issuanceError)) throw issuanceError
        const replay = await exactScopeIssuance(tx, committedScope, input, requestHash)
        if (!replay) throw issuanceError
        return { ...replay, scope: committedScope }
      }
    })
  }
  return {
    subject: {
      id: result.subject.id,
      subjectDigest: result.subject.subjectDigest,
      subjectKind: 'REMOTE_EVALUATION_SCOPE' as const,
      authority: REMOTE_EVALUATION_SCOPE_AUTHORITY,
      targetContentIdentity: 'not_asserted' as const,
      identityStrength: 'evaluation_scope_only' as const,
    },
    scope: {
      scopeHash: result.scope.scopeHash,
      // This public v2 receipt must carry its own algorithm identity rather
      // than asking a caller to infer it from the subject authority.
      algorithmVersion: result.scope.preflight.algorithmVersion,
      preflightHash: result.scope.preflight.preflightHash,
      scopeIntentHash: result.scope.preflight.scopeIntentHash,
      realizationIntentHash: result.scope.preflight.realizationIntentHash,
      expectedPreflight: {
        algorithmVersion: result.scope.preflight.algorithmVersion,
        preflightHash: result.scope.preflight.preflightHash,
      },
      validationBindingsHash: result.scope.canonicalScope.validation.bindingsHash,
      environmentId: input.environment.environmentId,
    },
    replayed: result.replayed,
    nextRecommendedAction:
      'Use subjectRevisionId with assessment_preflight; pass the returned scope.expectedPreflight token to assessment_prepare_run.',
  }
}

function partitionScopeInput(
  input: RemoteEvaluationScopePartitionCreateInput,
  partition: RemoteEvaluationScopePartitionCreateInput['partitions'][number],
): RemoteEvaluationScopeCreateInput {
  return {
    target: input.target,
    qualityPlanId: input.qualityPlanId,
    revisionId: input.revisionId,
    expectedDesignHash: input.expectedDesignHash,
    validationBindings: partition.validationBindings,
    environment: partition.environment,
    runtime: input.runtime,
    idempotencyKey: `partition:${input.idempotencyKey}:${partition.partitionKey}`,
  }
}

function partitionAuthority(
  partition: RemoteEvaluationScopePartitionCreateInput['partitions'][number],
): ScopeAuthority {
  return {
    kind: 'persisted-partition-manifest',
    validationVersionIds: partition.validationBindings.map(binding => binding.validationId).sort(),
  }
}

function partitionAuthorityViolation(): never {
  throw new ServiceError('REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION', 'CONFLICT', 409, {
    code: 'REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION',
  })
}

function assertPartitionCoverage(
  expectedValidationIds: readonly string[],
  partitions: RemoteEvaluationScopePartitionCreateInput['partitions'],
) {
  const keys = new Set<string>()
  const seen = new Set<string>()
  for (const partition of partitions) {
    if (keys.has(partition.partitionKey)) partitionAuthorityViolation()
    keys.add(partition.partitionKey)
    for (const binding of partition.validationBindings) {
      if (seen.has(binding.validationId)) partitionAuthorityViolation()
      seen.add(binding.validationId)
    }
  }
  const expected = [...expectedValidationIds].sort()
  if (expected.length !== seen.size || expected.some(id => !seen.has(id))) partitionAuthorityViolation()
}

function partitionManifestIdentity(
  input: RemoteEvaluationScopePartitionCreateInput,
  coverageHash: string,
  children: Array<{ partitionKey: string; environmentId: string; scopeHash: string; validationBindingsHash: string }>,
) {
  return {
    ...remoteScopePartitionRequestIdentity(input),
    coverageHash,
    children: [...children].sort((left, right) => left.partitionKey.localeCompare(right.partitionKey)),
  }
}

type PersistedPartitionSubject = {
  id: string
  subjectDigest: string
  subjectKind: string
  authority: string
  metadataJson: string | null
}
type PersistedPartitionChild = {
  partitionKey: string
  environmentId: string
  validationVersionIdsJson: string
  validationBindingsHash: string
  childHash: string
  remoteEvaluationScopeBinding: RemoteScopeBinding & { evaluationSubjectRevision: PersistedPartitionSubject }
}
type PersistedPartitionManifest = {
  id: string
  targetProjectId: string
  qualityPlanId: string
  qualityPlanRevisionId: string
  designHash: string
  coverageHash: string
  manifestHash: string
  requestHash: string
  canonicalManifestJson: string
  partitions: PersistedPartitionChild[]
}

const persistedPartitionManifestIdentitySchema = z
  .object({
    schemaVersion: z.literal(REMOTE_EVALUATION_SCOPE_PARTITION_SCHEMA),
    target: z.string().min(1),
    qualityPlanId: z.string().min(1),
    revisionId: z.string().min(1),
    expectedDesignHash: z.string().startsWith('sha256:'),
    partitions: remoteEvaluationScopePartitionCreateSchema.shape.partitions,
    runtime: z.object({ browserEngine: z.literal('CHROMIUM') }).strict(),
    coverageHash: z.string().startsWith('sha256:'),
    children: z
      .array(
        z
          .object({
            partitionKey: z.string().min(1),
            environmentId: z.string().min(1),
            scopeHash: z.string().startsWith('sha256:'),
            validationBindingsHash: z.string().startsWith('sha256:'),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()

const persistedScopePreflightSchema = z
  .object({
    schemaVersion: z.literal('appraise.quality-assessment-preflight-receipt/v2'),
    algorithmVersion: z.literal(ASSESSMENT_PREFLIGHT_ALGORITHM),
    scopeIntentHash: z.string().startsWith('sha256:'),
    realizationIntentHash: z.string().startsWith('sha256:'),
    preflightHash: z.string().startsWith('sha256:'),
    validations: z.array(z.object({ validationVersionId: z.string().min(1) }).passthrough()).min(1),
  })
  .passthrough()

/** Rebuild the entire child authority packet from its own durable bytes. This
 * deliberately does not consult a current catalog or environment row: replay
 * integrity must reject corruption, not reinterpret an immutable packet. */
function assertPersistedScopeSubjectAndBinding(subject: PersistedPartitionSubject, binding: RemoteScopeBinding) {
  let validationBindings: RecoveredValidationBinding[]
  let environmentSnapshot: ReturnType<typeof parseFrozenRemoteEnvironmentPacket>
  let preflight: z.infer<typeof persistedScopePreflightSchema>
  try {
    validationBindings = recoveredValidationBindings(binding)
    environmentSnapshot = parseFrozenRemoteEnvironmentPacket(JSON.parse(binding.environmentSnapshotJson))
    preflight = persistedScopePreflightSchema.parse(JSON.parse(binding.canonicalPreflightJson))
  } catch {
    throwScopeStale()
  }
  const normalizedBindings = normalizedRemoteScopeBindings(validationBindings)
  const validationIds = normalizedBindings.map(item => item.validationId)
  if (
    binding.evaluationSubjectRevisionId !== subject.id ||
    subject.subjectDigest !== digest({ domain: REMOTE_EVALUATION_SCOPE_SCHEMA, scopeHash: binding.scopeHash }) ||
    subject.subjectKind !== 'REMOTE_EVALUATION_SCOPE' ||
    subject.authority !== REMOTE_EVALUATION_SCOPE_AUTHORITY ||
    subject.metadataJson !== canonicalContractJson(scopeSubjectMetadata(binding.scopeHash)) ||
    canonicalContractJson(normalizedBindings) !== binding.validationBindingsJson ||
    hashCanonical(normalizedBindings) !== binding.validationBindingsHash ||
    canonicalContractJson(environmentSnapshot) !== binding.environmentSnapshotJson ||
    hashCanonical(environmentSnapshot) !== binding.environmentSnapshotHash ||
    environmentSnapshot.id !== binding.environmentId ||
    environmentSnapshot.targetProjectId !== binding.targetProjectId ||
    environmentSnapshot.scopeVersion !== binding.environmentScopeVersion ||
    canonicalContractJson(preflight) !== binding.canonicalPreflightJson ||
    preflight.algorithmVersion !== binding.preflightAlgorithmVersion ||
    preflight.scopeIntentHash !== binding.scopeIntentHash ||
    preflight.realizationIntentHash !== binding.realizationIntentHash ||
    preflight.preflightHash !== binding.preflightHash ||
    binding.realizationPreflightHash !== binding.preflightHash ||
    preflight.validations.length !== validationIds.length ||
    canonicalContractJson(preflight.validations.map(item => item.validationVersionId).sort()) !==
      canonicalContractJson(validationIds)
  )
    throwScopeStale()

  const expectedCanonicalScope = {
    schemaVersion: REMOTE_EVALUATION_SCOPE_SCHEMA,
    target: { id: binding.targetProjectId, fingerprint: binding.targetFingerprint, kind: 'REMOTE_BLACK_BOX' },
    qualityPlan: {
      id: binding.qualityPlanId,
      revisionId: binding.qualityPlanRevisionId,
      revisionContentHash: binding.revisionContentHash,
      designHash: binding.designHash,
    },
    environment: {
      ...environmentSnapshot,
      bindingHash: hashCanonical(environmentSnapshot),
      snapshotHash: binding.environmentSnapshotHash,
    },
    scopeIntentHash: binding.scopeIntentHash,
    realizationIntentHash: binding.realizationIntentHash,
    preflightHash: binding.preflightHash,
    validation: { bindingsHash: binding.validationBindingsHash },
    policies: {
      runtimePolicyHash: binding.runtimePolicyHash,
      securityPolicyHash: binding.securityPolicyHash,
      evidencePolicyHash: binding.evidencePolicyHash,
    },
    targetContentIdentity: 'not_asserted',
    identityStrength: 'evaluation_scope_only',
  }
  if (
    binding.scopeSchemaVersion !== REMOTE_EVALUATION_SCOPE_SCHEMA ||
    binding.preflightAlgorithmVersion !== ASSESSMENT_PREFLIGHT_ALGORITHM ||
    binding.scopeHash !== binding.scopeIntentHash ||
    canonicalContractJson(expectedCanonicalScope) !== binding.canonicalScopeJson
  )
    throwScopeStale()
  return validationBindings
}

/**
 * Partition rows are insert-only but must still be treated as untrusted at
 * every replay/read boundary. Rebuild every public hash from the immutable
 * child scope packets; a malformed row is never a reusable subset authority.
 */
function assertPersistedPartitionManifestIntegrity(manifest: PersistedPartitionManifest) {
  let sealed: z.infer<typeof persistedPartitionManifestIdentitySchema>
  try {
    sealed = persistedPartitionManifestIdentitySchema.parse(JSON.parse(manifest.canonicalManifestJson))
  } catch {
    throwScopeStale()
  }
  if (canonicalContractJson(sealed) !== manifest.canonicalManifestJson) throwScopeStale()

  const seenKeys = new Set<string>()
  const seenBindings = new Set<string>()
  const seenValidationIds = new Set<string>()
  const actualPartitions = manifest.partitions.map(partition => {
    const binding = partition.remoteEvaluationScopeBinding
    const subject = binding.evaluationSubjectRevision
    let validationVersionIds: string[]
    try {
      validationVersionIds = z.array(z.string().min(1)).min(1).parse(JSON.parse(partition.validationVersionIdsJson))
    } catch {
      throwScopeStale()
    }
    const sortedValidationVersionIds = [...validationVersionIds].sort()
    const bindings = assertPersistedScopeSubjectAndBinding(subject, binding)
    const boundValidationIds = bindings.map(item => item.validationId).sort()
    if (
      canonicalContractJson(sortedValidationVersionIds) !== partition.validationVersionIdsJson ||
      new Set(validationVersionIds).size !== validationVersionIds.length ||
      seenKeys.has(partition.partitionKey) ||
      seenBindings.has(binding.id) ||
      sortedValidationVersionIds.length !== boundValidationIds.length ||
      sortedValidationVersionIds.some((id, index) => id !== boundValidationIds[index]) ||
      partition.environmentId !== binding.environmentId ||
      partition.validationBindingsHash !== binding.validationBindingsHash ||
      binding.targetProjectId !== manifest.targetProjectId ||
      binding.qualityPlanId !== manifest.qualityPlanId ||
      binding.qualityPlanRevisionId !== manifest.qualityPlanRevisionId ||
      binding.designHash !== manifest.designHash ||
      subject.subjectKind !== 'REMOTE_EVALUATION_SCOPE' ||
      subject.authority !== REMOTE_EVALUATION_SCOPE_AUTHORITY
    )
      throwScopeStale()
    seenKeys.add(partition.partitionKey)
    seenBindings.add(binding.id)
    for (const validationId of sortedValidationVersionIds) {
      if (seenValidationIds.has(validationId)) throwScopeStale()
      seenValidationIds.add(validationId)
    }
    return { partition, binding, validationVersionIds: sortedValidationVersionIds, bindings }
  })
  if (actualPartitions.length !== sealed.partitions.length || actualPartitions.length !== sealed.children.length)
    throwScopeStale()

  const coverageHash = hashCanonical({
    schemaVersion: 'appraise.remote-evaluation-scope-partition-coverage/v1',
    validationVersionIds: [...seenValidationIds].sort(),
  })
  const reconstructedInput = remoteEvaluationScopePartitionCreateSchema.parse({
    target: sealed.target,
    qualityPlanId: manifest.qualityPlanId,
    revisionId: manifest.qualityPlanRevisionId,
    expectedDesignHash: manifest.designHash,
    partitions: actualPartitions.map(({ partition, bindings }) => ({
      partitionKey: partition.partitionKey,
      environment: { environmentId: partition.environmentId },
      validationBindings: bindings,
    })),
    runtime: sealed.runtime,
    idempotencyKey: 'persisted-partition-integrity',
  })
  const identity = partitionManifestIdentity(
    reconstructedInput,
    coverageHash,
    actualPartitions.map(({ partition, binding, validationVersionIds }) => {
      const childHash = digest({
        manifestHash: manifest.manifestHash,
        partitionKey: partition.partitionKey,
        environmentId: partition.environmentId,
        validationVersionIds,
        scopeHash: binding.scopeHash,
      })
      if (childHash !== partition.childHash) throwScopeStale()
      return {
        partitionKey: partition.partitionKey,
        environmentId: partition.environmentId,
        scopeHash: binding.scopeHash,
        validationBindingsHash: binding.validationBindingsHash,
      }
    }),
  )
  const requestHash = digest({ schemaVersion: 'remote-scope-partition-request/v1', identity })
  const manifestHash = digest({ schemaVersion: REMOTE_EVALUATION_SCOPE_PARTITION_SCHEMA, identity })
  if (
    sealed.qualityPlanId !== manifest.qualityPlanId ||
    sealed.revisionId !== manifest.qualityPlanRevisionId ||
    sealed.expectedDesignHash !== manifest.designHash ||
    sealed.coverageHash !== coverageHash ||
    manifest.coverageHash !== coverageHash ||
    canonicalContractJson(identity) !== manifest.canonicalManifestJson ||
    requestHash !== manifest.requestHash ||
    manifestHash !== manifest.manifestHash
  )
    throwScopeStale()
  return actualPartitions
}

async function partitionManifestResponse(manifest: {
  id: string
  manifestHash: string
  coverageHash: string
  targetProjectId: string
  qualityPlanId: string
  qualityPlanRevisionId: string
  designHash: string
  requestHash: string
  canonicalManifestJson: string
  partitions: Array<{
    partitionKey: string
    environmentId: string
    validationVersionIdsJson: string
    validationBindingsHash: string
    childHash: string
    remoteEvaluationScopeBinding: RemoteScopeBinding & {
      evaluationSubjectRevision: {
        id: string
        subjectDigest: string
        subjectKind: string
        authority: string
        metadataJson: string | null
      }
    }
  }>
}) {
  assertPersistedPartitionManifestIntegrity(manifest)
  return {
    manifest: {
      manifestId: manifest.id,
      manifestHash: manifest.manifestHash,
      coverageHash: manifest.coverageHash,
    },
    children: manifest.partitions
      .map(partition => {
        const binding = partition.remoteEvaluationScopeBinding
        const subject = binding.evaluationSubjectRevision
        return {
          partitionKey: partition.partitionKey,
          environmentId: partition.environmentId,
          childHash: partition.childHash,
          validationBindings: recoveredValidationBindings(binding),
          subject: {
            subjectRevisionId: subject.id,
            subjectDigest: subject.subjectDigest,
            subjectKind: 'REMOTE_EVALUATION_SCOPE' as const,
            authority: REMOTE_EVALUATION_SCOPE_AUTHORITY,
          },
          scope: recoveredScopeReceipt(binding),
        }
      })
      .sort((left, right) => left.partitionKey.localeCompare(right.partitionKey)),
    nextRecommendedAction:
      'Use one returned child subject and its exact validationBindings with assessment_preflight, then prepare that child only.',
  }
}

/** Atomic additive issuer for a complete, environment-homogeneous partition
 * of the approved remote validation set. v2 remains all-approved-only. */
export async function createRemoteEvaluationScopePartition(source: unknown) {
  const input = remoteEvaluationScopePartitionCreateSchema.parse(source)
  for (const partition of input.partitions)
    if (containsSecretBearingRecoveryInput(partition.validationBindings))
      throw new ServiceError('Partition compact bindings are not safe for a portable manifest.', 'VALIDATION', 400, {
        code: 'remote_scope_partition_secret_input',
      })
  const target = await resolveExactRemoteTarget(input.target)
  const revision = await readPartitionRevision({
    targetProjectId: target.id,
    qualityPlanId: input.qualityPlanId,
    revisionId: input.revisionId,
    expectedDesignHash: input.expectedDesignHash,
  })
  const approvedValidationIds = revision.validationVersions.map(version => version.id).sort()
  assertPartitionCoverage(approvedValidationIds, input.partitions)
  const coverageHash = hashCanonical({
    schemaVersion: 'appraise.remote-evaluation-scope-partition-coverage/v1',
    validationVersionIds: approvedValidationIds,
  })
  const outerChildren = await Promise.all(
    input.partitions.map(async partition => {
      const scopeInput = partitionScopeInput(input, partition)
      const scope = await scopeFor(scopeInput, db, partitionAuthority(partition))
      return { partition, scopeInput, scope }
    }),
  )
  const identity = partitionManifestIdentity(
    input,
    coverageHash,
    outerChildren.map(({ partition, scope }) => ({
      partitionKey: partition.partitionKey,
      environmentId: partition.environment.environmentId,
      scopeHash: scope.scopeHash,
      validationBindingsHash: scope.canonicalScope.validation.bindingsHash,
    })),
  )
  const requestHash = digest({ schemaVersion: 'remote-scope-partition-request/v1', identity })
  const manifestHash = digest({ schemaVersion: REMOTE_EVALUATION_SCOPE_PARTITION_SCHEMA, identity })
  const writeManifest = () =>
    db.$transaction(async transaction => {
      const tx = transaction as typeof db
      const replay = await tx.remoteEvaluationScopePartitionManifest.findFirst({
        where: { targetProjectId: target.id, idempotencyKey: input.idempotencyKey },
        include: {
          partitions: { include: { remoteEvaluationScopeBinding: { include: { evaluationSubjectRevision: true } } } },
        },
      })
      if (replay) {
        assertPersistedPartitionManifestIntegrity(replay)
        if (replay.requestHash !== requestHash)
          throw new ServiceError('Partition idempotency key has different canonical input.', 'CONFLICT')
        return { manifest: replay, replayed: true }
      }
      const committedChildren = await Promise.all(
        outerChildren.map(async ({ partition, scopeInput, scope: outerScope }) => {
          const scope = await scopeFor(scopeInput, tx, partitionAuthority(partition))
          if (!sameScopePacket(outerScope, scope)) throwScopeStale()
          return { partition, scopeInput, scope }
        }),
      )
      const manifest = await tx.remoteEvaluationScopePartitionManifest.create({
        data: {
          targetProjectId: target.id,
          qualityPlanId: input.qualityPlanId,
          qualityPlanRevisionId: input.revisionId,
          designHash: input.expectedDesignHash,
          coverageHash,
          manifestHash,
          requestHash,
          idempotencyKey: input.idempotencyKey,
          canonicalManifestJson: canonicalContractJson(identity),
        },
      })
      for (const { partition, scopeInput, scope } of committedChildren) {
        const subject = await scopeSubjectForIssuance(tx, scope, scopeInput)
        const binding = await tx.remoteEvaluationScopeBinding.findFirst({
          where: { evaluationSubjectRevisionId: subject.id },
        })
        if (!binding) throwScopeStale()
        const validationVersionIds = partition.validationBindings.map(item => item.validationId).sort()
        await tx.remoteEvaluationScopePartition.create({
          data: {
            manifestId: manifest.id,
            partitionKey: partition.partitionKey,
            environmentId: partition.environment.environmentId,
            remoteEvaluationScopeBindingId: binding.id,
            validationVersionIdsJson: canonicalContractJson(validationVersionIds),
            validationBindingsHash: binding.validationBindingsHash,
            childHash: digest({
              manifestHash,
              partitionKey: partition.partitionKey,
              environmentId: partition.environment.environmentId,
              validationVersionIds,
              scopeHash: binding.scopeHash,
            }),
          },
        })
      }
      const complete = await tx.remoteEvaluationScopePartitionManifest.findFirst({
        where: { id: manifest.id },
        include: {
          partitions: { include: { remoteEvaluationScopeBinding: { include: { evaluationSubjectRevision: true } } } },
        },
      })
      if (!complete) throwScopeStale()
      assertPersistedPartitionManifestIntegrity(complete)
      return { manifest: complete, replayed: false }
    })
  let result: Awaited<ReturnType<typeof writeManifest>>
  try {
    result = await writeManifest()
  } catch (error) {
    if (!uniqueConstraint(error)) throw error
    result = await db.$transaction(async transaction => {
      const tx = transaction as typeof db
      const replay = await tx.remoteEvaluationScopePartitionManifest.findFirst({
        where: { targetProjectId: target.id, idempotencyKey: input.idempotencyKey },
        include: {
          partitions: { include: { remoteEvaluationScopeBinding: { include: { evaluationSubjectRevision: true } } } },
        },
      })
      if (!replay) throw error
      assertPersistedPartitionManifestIntegrity(replay)
      if (replay.requestHash !== requestHash)
        throw new ServiceError('Partition idempotency key has different canonical input.', 'CONFLICT')
      if (replay.partitions.length !== input.partitions.length) throwScopeStale()
      return { manifest: replay, replayed: true }
    })
  }
  return { ...(await partitionManifestResponse(result.manifest)), replayed: result.replayed }
}

export function parseRemoteSubjectReference(value: unknown): RemoteSubjectReference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (typeof (value as Record<string, unknown>).subjectRevisionId !== 'string') return null
  return remoteSubjectReferenceSchema.parse(value)
}

export async function resolveRemoteEvaluationScopeSubject(
  input: {
    subject: RemoteSubjectReference
    targetProjectId: string
    qualityPlanId: string
    revisionId: string
  },
  client: Pick<typeof db, 'evaluationSubjectRevision'> = db,
) {
  const subject = await client.evaluationSubjectRevision.findFirst({
    where: { id: input.subject.subjectRevisionId },
    include: { remoteEvaluationScopeBinding: true },
  })
  if (
    !subject ||
    subject.subjectKind !== 'REMOTE_EVALUATION_SCOPE' ||
    subject.authority !== REMOTE_EVALUATION_SCOPE_AUTHORITY
  )
    throw new ServiceError(
      'Remote evaluation scope uses an unsupported preflight algorithm; issue a v2 scope.',
      'CONFLICT',
      409,
      {
        code: 'preflight_algorithm_unsupported',
        requiredAlgorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
      },
    )
  if (input.subject.expectedSubjectDigest && input.subject.expectedSubjectDigest !== subject.subjectDigest)
    throw new ServiceError('Remote evaluation scope subject digest does not match.', 'CONFLICT')
  const binding = subject.remoteEvaluationScopeBinding as RemoteScopeBinding | null
  if (
    !binding ||
    binding.scopeSchemaVersion !== REMOTE_EVALUATION_SCOPE_SCHEMA ||
    binding.preflightAlgorithmVersion !== ASSESSMENT_PREFLIGHT_ALGORITHM ||
    binding.targetProjectId !== input.targetProjectId ||
    binding.qualityPlanId !== input.qualityPlanId ||
    binding.qualityPlanRevisionId !== input.revisionId
  )
    throw new ServiceError(
      'Remote evaluation scope is stale or uses an unsupported preflight algorithm.',
      'CONFLICT',
      409,
      {
        code:
          binding?.scopeSchemaVersion !== REMOTE_EVALUATION_SCOPE_SCHEMA ||
          binding?.preflightAlgorithmVersion !== ASSESSMENT_PREFLIGHT_ALGORITHM
            ? 'preflight_algorithm_unsupported'
            : 'remote_evaluation_scope_stale',
      },
    )
  if (!hasExactPersistedScopeSubjectMetadata(subject, binding)) throwScopeStale()
  return { subject, binding }
}

type RecoveredValidationBinding = RemoteEvaluationScopeCreateInput['validationBindings'][number]

function recoveredValidationBindings(binding: RemoteScopeBinding): RecoveredValidationBinding[] {
  try {
    // Do not normalize here. The audit row is the recovery authority, and its
    // validation and Step Invocation array order is part of that exact packet.
    return remoteEvaluationScopeCreateSchema.shape.validationBindings.parse(JSON.parse(binding.validationBindingsJson))
  } catch {
    throwScopeStale()
  }
}

/** Returns the only subset authority accepted by preparation: an immutable
 * persisted manifest membership linked to this exact remote scope binding.
 * No caller field or request schema can create this value. */
export async function remoteScopePartitionAuthorityForSubject(
  subjectReference: unknown,
  client: typeof db = db,
): Promise<ScopeAuthority> {
  const reference = parseRemoteSubjectReference(subjectReference)
  if (!reference) return { kind: 'all-approved-v2' }
  const subject = await client.evaluationSubjectRevision.findFirst({
    where: { id: reference.subjectRevisionId },
    include: { remoteEvaluationScopeBinding: true },
  })
  const binding = subject?.remoteEvaluationScopeBinding as RemoteScopeBinding | null
  if (!binding) return { kind: 'all-approved-v2' }
  const partitionStore = (
    client as typeof client & {
      remoteEvaluationScopePartition?: { findFirst(args: unknown): Promise<unknown> }
    }
  ).remoteEvaluationScopePartition
  // Narrow legacy/mock compatibility: absence is only the existing v2
  // all-approved authority, never a way for a caller to request a subset.
  if (!partitionStore) return { kind: 'all-approved-v2' }
  const partition = (await partitionStore.findFirst({
    where: { remoteEvaluationScopeBindingId: binding.id },
    include: {
      remoteEvaluationScopeBinding: { include: { evaluationSubjectRevision: true } },
      manifest: {
        include: {
          partitions: { include: { remoteEvaluationScopeBinding: { include: { evaluationSubjectRevision: true } } } },
        },
      },
    },
  })) as {
    validationVersionIdsJson: string
    environmentId: string
    validationBindingsHash: string
    manifest?: PersistedPartitionManifest
  } | null
  if (!partition) return { kind: 'all-approved-v2' }
  if (!partition.manifest) throwScopeStale()
  assertPersistedPartitionManifestIntegrity(partition.manifest)
  let validationVersionIds: unknown
  try {
    validationVersionIds = JSON.parse(partition.validationVersionIdsJson)
  } catch {
    throwScopeStale()
  }
  const parsed = z.array(z.string().min(1)).min(1).safeParse(validationVersionIds)
  const persisted = recoveredValidationBindings(binding)
    .map(item => item.validationId)
    .sort()
  if (
    !parsed.success ||
    partition.environmentId !== binding.environmentId ||
    partition.validationBindingsHash !== binding.validationBindingsHash ||
    canonicalContractJson([...parsed.data].sort()) !== canonicalContractJson(persisted)
  )
    throwScopeStale()
  return { kind: 'persisted-partition-manifest', validationVersionIds: persisted }
}

const secretBearingInputName = /(password|secret|token|api[_-]?key|authorization|credential|private[_-]?key|bearer)/i

function isPublicRecoveryValue(value: unknown): boolean {
  if (typeof value === 'string') return !/^[a-z][a-z0-9+.-]*:\/\/[^/]*@/i.test(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return true
  if (Array.isArray(value)) return value.every(isPublicRecoveryValue)
  return false
}

/** Full recovery must never make an authored secret portable. This guard is
 * intentionally about persisted input names and values only: a canonical
 * configured-credential invocation has the same safe `{ target: locatorId }`
 * shape as another locator-only step, regardless of its operation ID or human
 * description. The binding has already passed the canonical compact schema at
 * issuance, so unknown harmless scalar names remain portable; nested payloads
 * and non-portable values fail closed rather than being redacted as exact. */
function containsSecretBearingRecoveryInput(bindings: readonly RecoveredValidationBinding[]) {
  return bindings.some(binding =>
    binding.steps.some(step => {
      const entries = Object.entries(step.inputs)
      return entries.some(([name, value]) => secretBearingInputName.test(name) || !isPublicRecoveryValue(value))
    }),
  )
}

function remoteScopeBindingMismatch(): never {
  throw new ServiceError(
    'Supplied validation bindings do not match the immutable remote evaluation scope.',
    'CONFLICT',
    409,
    { code: 'remote_evaluation_scope_binding_mismatch' },
  )
}

/** Hydrate the sealed compact packet for internal preflight/preparation. This
 * is deliberately not the public recovery response: it reuses the immutable
 * parser and portability guard without exposing any binding payload. */
export async function hydrateRemoteEvaluationScopeBindings(
  input: {
    subject: RemoteSubjectReference
    targetProjectId: string
    qualityPlanId: string
    revisionId: string
    environmentId: string
    validationBindings?: unknown
  },
  client: Pick<typeof db, 'evaluationSubjectRevision'> = db,
) {
  const resolved = await resolveRemoteEvaluationScopeSubject(
    {
      subject: input.subject,
      targetProjectId: input.targetProjectId,
      qualityPlanId: input.qualityPlanId,
      revisionId: input.revisionId,
    },
    client,
  )
  if (resolved.binding.environmentId !== input.environmentId) remoteScopeBindingMismatch()
  const persisted = recoveredValidationBindings(resolved.binding)
  if (containsSecretBearingRecoveryInput(persisted))
    throw new ServiceError(
      'Remote evaluation scope compact bindings are not safe for exact recovery.',
      'CONFLICT',
      409,
      { code: 'remote_evaluation_scope_recovery_secret_input' },
    )
  if (input.validationBindings !== undefined) {
    let supplied: RecoveredValidationBinding[]
    try {
      supplied = remoteEvaluationScopeCreateSchema.shape.validationBindings.parse(input.validationBindings)
    } catch {
      remoteScopeBindingMismatch()
    }
    // A persisted partition is a narrower authority boundary than the generic
    // v2 packet equality check. Surface a supplied foreign cell as an
    // authority violation before comparing the rest of the packet, so callers
    // cannot mistake it for an ordinary replay conflict.
    const authority = await remoteScopePartitionAuthorityForSubject(input.subject, client as typeof db)
    if (
      authority.kind === 'persisted-partition-manifest' &&
      supplied.some(binding => !authority.validationVersionIds.includes(binding.validationId))
    )
      partitionAuthorityViolation()
    if (
      canonicalContractJson(normalizedRemoteScopeBindings(supplied)) !==
      canonicalContractJson(normalizedRemoteScopeBindings(persisted))
    )
      remoteScopeBindingMismatch()
  }
  return {
    ...resolved,
    validationBindings: persisted,
    bindingsSource:
      input.validationBindings === undefined
        ? ('persisted_remote_scope' as const)
        : ('caller_exact_remote_scope' as const),
    bindingsRecovered: input.validationBindings === undefined,
    counts: {
      validationCount: persisted.length,
      stepCount: persisted.reduce((count, binding) => count + binding.steps.length, 0),
      locatorCount: persisted.reduce((count, binding) => count + binding.locatorIds.length, 0),
    },
  }
}

function remoteScopeReadMismatch(): never {
  throw new ServiceError(
    'Remote evaluation scope cannot be recovered for the supplied immutable scope.',
    'CONFLICT',
    409,
    {
      code: 'remote_evaluation_scope_read_mismatch',
    },
  )
}

function recoveredScopeReceipt(binding: RemoteScopeBinding) {
  return {
    scopeHash: binding.scopeHash,
    algorithmVersion: binding.preflightAlgorithmVersion,
    scopeIntentHash: binding.scopeIntentHash,
    realizationIntentHash: binding.realizationIntentHash,
    preflightHash: binding.preflightHash,
    expectedPreflight: {
      algorithmVersion: binding.preflightAlgorithmVersion,
      preflightHash: binding.preflightHash,
    },
    validationBindingsHash: binding.validationBindingsHash,
    environmentId: binding.environmentId,
  }
}

/**
 * Read the persisted compact v2 packet after an interrupted first-user flow.
 * It intentionally does not call the canonical preflight resolver: recovery
 * must neither observe the target nor turn current catalog/environment drift
 * into a different packet. Later preflight/preparation performs its own phase
 * recheck using this immutable handoff.
 */
export async function readRemoteEvaluationScope(source: unknown) {
  const input = remoteEvaluationScopeReadSchema.parse(source)
  const target = await resolveExactRemoteTarget(input.target)
  const resolved = await resolveRemoteEvaluationScopeSubject({
    subject: {
      subjectRevisionId: input.subjectRevisionId,
      ...(input.expectedSubjectDigest ? { expectedSubjectDigest: input.expectedSubjectDigest } : {}),
    },
    targetProjectId: target.id,
    qualityPlanId: input.qualityPlanId,
    revisionId: input.revisionId,
  })
  const { subject, binding } = resolved
  if (
    (input.expectedScopeHash && input.expectedScopeHash !== binding.scopeHash) ||
    (input.expectedPreflightHash && input.expectedPreflightHash !== binding.preflightHash)
  )
    remoteScopeReadMismatch()

  const validationBindings = recoveredValidationBindings(binding)
  const stepCount = validationBindings.reduce((count, validation) => count + validation.steps.length, 0)
  const locatorCount = validationBindings.reduce((count, validation) => count + validation.locatorIds.length, 0)
  const base = {
    subject: {
      subjectRevisionId: subject.id,
      subjectDigest: subject.subjectDigest,
      subjectKind: 'REMOTE_EVALUATION_SCOPE' as const,
      authority: REMOTE_EVALUATION_SCOPE_AUTHORITY,
    },
    targetProjectId: binding.targetProjectId,
    qualityPlanId: binding.qualityPlanId,
    revisionId: binding.qualityPlanRevisionId,
    expectedDesignHash: binding.designHash,
    environment: { environmentId: binding.environmentId },
    runtime: { browserEngine: 'CHROMIUM' as const },
    scope: recoveredScopeReceipt(binding),
    counts: {
      validationCount: validationBindings.length,
      stepCount,
      locatorCount,
    },
    nextRecommendedAction:
      'Use the full recovery packet unchanged with assessment_preflight, then pass scope.expectedPreflight to assessment_prepare_run.',
  }
  if (input.responseMode !== 'full') return base
  if (containsSecretBearingRecoveryInput(validationBindings))
    throw new ServiceError(
      'Remote evaluation scope compact bindings are not safe for exact recovery.',
      'CONFLICT',
      409,
      { code: 'remote_evaluation_scope_recovery_secret_input' },
    )
  return { ...base, validationBindings }
}

/**
 * Re-reads the mutable Environment row immediately at each remote mutation
 * boundary. Callers carry the immutable packet from the scope binding into
 * their own transaction; a changed row can never be substituted silently.
 */
async function assertRemoteEvaluationScopeEnvironmentSnapshot(
  binding: Omit<
    Pick<
      RemoteScopeBinding,
      | 'environmentId'
      | 'targetProjectId'
      | 'environmentSnapshotHash'
      | 'environmentSnapshotJson'
      | 'environmentUpdatedAt'
      | 'environmentScopeVersion'
    >,
    'environmentScopeVersion'
  > & { environmentScopeVersion?: number },
  client: { environment: { findFirst(args: unknown): Promise<RemoteScopeEnvironment | null> } } = db,
) {
  const environment = await client.environment.findFirst({
    where: { id: binding.environmentId, targetProjectId: binding.targetProjectId },
  })
  if (!environment)
    throw new ServiceError('Scope-bound remote environment no longer exists.', 'CONFLICT', 409, {
      code: 'remote_evaluation_scope_stale',
    })
  const syntheticTarget: RemoteScopeTarget = {
    id: binding.targetProjectId,
    kind: 'REMOTE_BLACK_BOX',
    fingerprint: '',
    canonicalIdentity: '',
    normalizedRemoteOrigin: canonicalRemoteEvaluationOrigin(environment.baseUrl, 'Remote environment baseUrl'),
  }
  const actual = remoteScopeEnvironmentSnapshot(environment, syntheticTarget)
  if (
    (binding.environmentScopeVersion !== undefined && hashCanonical(actual) !== binding.environmentSnapshotHash) ||
    (binding.environmentScopeVersion !== undefined && actual.scopeVersion !== binding.environmentScopeVersion) ||
    (binding.environmentScopeVersion !== undefined && canonicalContractJson(actual) !== binding.environmentSnapshotJson)
  )
    throw new ServiceError(
      'Remote evaluation scope environment has changed; create a new scope before mutation.',
      'CONFLICT',
      409,
      { code: 'remote_evaluation_scope_stale' },
    )
  return actual
}

/** Recomputes the immutable remote scope from the same pure preflight result.
 * This is called before an assessment becomes ready or any run is created. */
export async function assertRemoteEvaluationScopePreflight(input: {
  subject: unknown
  target: string
  qualityPlanId: string
  revisionId: string
  expectedDesignHash: string
  validationBindings: unknown
  environment: { environmentId: string }
  runtime?: { browserEngine?: 'CHROMIUM' | 'FIREFOX' | 'WEBKIT' }
  preflight: {
    algorithmVersion: string
    preflightHash: string
  }
}) {
  const reference = parseRemoteSubjectReference(input.subject)
  if (!reference) return null
  const target = await resolveExactRemoteTarget(input.target)
  const resolved = await resolveRemoteEvaluationScopeSubject({
    subject: reference,
    targetProjectId: target.id,
    qualityPlanId: input.qualityPlanId,
    revisionId: input.revisionId,
  })
  const createInput = remoteEvaluationScopeCreateSchema
    .omit({ idempotencyKey: true })
    .extend({ idempotencyKey: z.literal('scope-assertion') })
    .parse({
      target: input.target,
      qualityPlanId: input.qualityPlanId,
      revisionId: input.revisionId,
      expectedDesignHash: input.expectedDesignHash,
      validationBindings: input.validationBindings,
      environment: input.environment,
      runtime: { browserEngine: input.runtime?.browserEngine ?? 'CHROMIUM' },
      idempotencyKey: 'scope-assertion',
    }) as RemoteEvaluationScopeCreateInput
  const actual = await scopeForIssuedFreshness(
    createInput,
    db,
    await remoteScopePartitionAuthorityForSubject(input.subject),
  )
  const preflightMismatch = {
    algorithmVersion: input.preflight.algorithmVersion !== ASSESSMENT_PREFLIGHT_ALGORITHM,
    request: input.preflight.preflightHash !== resolved.binding.preflightHash,
    recomputed: actual.preflight.preflightHash !== resolved.binding.preflightHash,
  }
  if (Object.values(preflightMismatch).some(Boolean))
    throw new ServiceError(
      'Remote scope publication/preflight identity does not match the issued scope.',
      'CONFLICT',
      409,
      {
        code: 'publication_preflight_mismatch',
        mismatch: Object.entries(preflightMismatch)
          .filter(([, mismatched]) => mismatched)
          .map(([field]) => field),
        expectedPreflight: {
          algorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
          preflightHash: resolved.binding.preflightHash,
        },
        observedPreflight: {
          algorithmVersion: input.preflight.algorithmVersion,
          preflightHash: input.preflight.preflightHash,
        },
      },
    )
  if (!bindingMatchesScope(resolved.binding, actual, createInput))
    throw new ServiceError(
      'Remote evaluation scope has drifted; issue a new scope before preparation.',
      'CONFLICT',
      409,
      {
        code: 'remote_evaluation_scope_stale',
      },
    )
  return resolved
}

/** Full DB/read-model scope recheck immediately before an AssessmentRun is
 * reserved. It detects environment URL/config drift as well as compact
 * realization drift without doing target I/O. */
export async function assertRemoteEvaluationScopeCurrent(
  input:
    | RemoteScopePhaseBinding
    | {
        subjectRevisionId: string
        targetProjectId: string
        qualityPlanId: string
        revisionId: string
        environmentId: string
      },
  client: typeof db = db,
) {
  const revisionId = 'qualityPlanRevisionId' in input ? input.qualityPlanRevisionId : input.revisionId
  const expectedScopeHash = 'scopeHash' in input ? input.scopeHash : undefined
  const subject = await client.evaluationSubjectRevision.findFirst({
    where: { id: input.subjectRevisionId },
    include: { remoteEvaluationScopeBinding: true },
  })
  const binding = subject?.remoteEvaluationScopeBinding as RemoteScopeBinding | null
  if (
    !subject ||
    !binding ||
    subject.subjectKind !== 'REMOTE_EVALUATION_SCOPE' ||
    subject.authority !== REMOTE_EVALUATION_SCOPE_AUTHORITY ||
    binding.scopeSchemaVersion !== REMOTE_EVALUATION_SCOPE_SCHEMA ||
    binding.preflightAlgorithmVersion !== ASSESSMENT_PREFLIGHT_ALGORITHM ||
    binding.targetProjectId !== input.targetProjectId
  )
    throw new ServiceError(
      'Remote evaluation scope uses an unsupported preflight algorithm; issue a v2 scope.',
      'CONFLICT',
      409,
      {
        code: 'preflight_algorithm_unsupported',
        requiredAlgorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
      },
    )
  if (
    binding.qualityPlanId !== input.qualityPlanId ||
    binding.qualityPlanRevisionId !== revisionId ||
    binding.environmentId !== input.environmentId ||
    (expectedScopeHash !== undefined && binding.scopeHash !== expectedScopeHash)
  )
    throw new ServiceError('Remote evaluation scope is outside the Assessment plan or revision.', 'CONFLICT')
  let scope: { qualityPlan?: { designHash?: string } }
  let validationBindings: unknown
  try {
    scope = JSON.parse(binding.canonicalScopeJson) as { qualityPlan?: { designHash?: string } }
    validationBindings = JSON.parse(binding.validationBindingsJson)
  } catch {
    throwIssuedScopeCatalogStale()
  }
  const currentInput: RemoteEvaluationScopeCreateInput = {
    target: input.targetProjectId,
    qualityPlanId: input.qualityPlanId,
    revisionId,
    expectedDesignHash: scope.qualityPlan?.designHash ?? binding.designHash,
    validationBindings: validationBindings as RemoteEvaluationScopeCreateInput['validationBindings'],
    environment: { environmentId: input.environmentId },
    runtime: { browserEngine: 'CHROMIUM' },
    idempotencyKey: 'scope-current-check',
  }
  const current = await scopeForIssuedFreshness(
    currentInput,
    client,
    await remoteScopePartitionAuthorityForSubject({ subjectRevisionId: input.subjectRevisionId }, client),
  )
  const expectedPacket =
    'preflightHash' in input
      ? {
          preflightAlgorithmVersion: input.preflightAlgorithmVersion,
          scopeIntentHash: input.scopeIntentHash,
          realizationIntentHash: input.realizationIntentHash,
          preflightHash: input.preflightHash,
        }
      : null
  if (
    !isExactScopeSubject(subject, current) ||
    !bindingMatchesScope(binding, current, currentInput) ||
    (expectedPacket !== null &&
      (expectedPacket.preflightAlgorithmVersion !== binding.preflightAlgorithmVersion ||
        expectedPacket.scopeIntentHash !== binding.scopeIntentHash ||
        expectedPacket.realizationIntentHash !== binding.realizationIntentHash ||
        expectedPacket.preflightHash !== binding.preflightHash))
  )
    throw new ServiceError(
      'Remote evaluation scope has drifted; create a new scope before execution.',
      'CONFLICT',
      409,
      {
        code: 'remote_evaluation_scope_stale',
      },
    )
  await assertRemoteEvaluationScopeEnvironmentSnapshot(binding, client)
  return { subject, binding }
}
