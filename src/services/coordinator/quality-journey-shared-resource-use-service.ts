import { createHash } from 'node:crypto'
import type {
  Prisma,
  QualityJourneyLocatorEnsureReceipt,
  QualityJourneySharedResourceClaim,
  QualityJourneySharedResourceUse,
} from '@prisma/client'
import { z } from 'zod'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { validateE2CampaignPolicyRow } from '@/lib/quality-journey/e2-campaign-policy-contract'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import {
  automationTargetBindingSchema,
  hashAutomationMaterialization,
  hashAutomationTargetBinding,
  preparedRuntimeCapsuleSchema,
} from '@/lib/quality-journey/automation-contracts'
import { hashResourceResolutionBundle, resourceResolutionBundleSchema } from '@/lib/quality-journey/discovery-contracts'
import { hashQualityJourneyExecutionValue } from '@/lib/quality-journey/execution-contracts'
import { classifyJourneyExecutionEffects } from '@/lib/quality-journey/execution-effects'
import { reconstructMaterializationSource } from '@/lib/quality-journey/materialization-source-contract'
import {
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  stepDefinitionSchema,
  stepInvocationSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts'
import {
  canonicalSharedResourceJson,
  isSharedResourceDigest,
  isSharedResourceId,
  nextSharedResourceEpoch,
  sharedClaimId,
  sharedClaimSetDigest,
  sharedResourceBounds,
  sharedResourceDigest,
  sharedResourceKinds,
  sharedResourceSourceKinds,
  sharedSourceDigest,
  sharedUseId,
  type SharedResourceKind,
  type SharedResourceSourceKind,
} from '@/lib/quality-journey/shared-resource-contract'
import { ServiceError } from '@/services/shared/errors'
import {
  readJourneyBusinessEnrollmentKindInTransaction,
  withJourneySharedResourcePublicationInTransaction,
  type BeforeJourneyBusinessWrite,
} from './quality-journey-business-write-join'
import { assertCurrentCoordinatorSession } from './quality-journey-coordinator-session'
import { assertE2BusinessAdmission, type E2BusinessScope } from './quality-journey-e2-retirement-service'
import {
  resolveSharedResourceDescriptors,
  type SharedResourceDescriptorKey,
  type SharedResourceDescriptorResult,
} from './quality-journey-shared-resource-descriptor-service'

const refuse = (reason: string): never => {
  throw new ServiceError(
    'Shared resource Use requires exact retained source and complete association proof.',
    'CONFLICT',
    409,
    { protocol: 'M06_SHARED_USE_V1', reason },
  )
}
const validDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime())
const validCounter = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= sharedResourceBounds.epoch
const compareKey = (left: SharedResourceDescriptorKey, right: SharedResourceDescriptorKey) =>
  left.kind < right.kind
    ? -1
    : left.kind > right.kind
      ? 1
      : left.resourceId < right.resourceId
        ? -1
        : left.resourceId > right.resourceId
          ? 1
          : 0
const prefixedDigest = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const canonicalId = z.string().refine(isSharedResourceId)
const frozenResourceSchema = z
  .object({
    id: canonicalId,
    kind: z.string(),
    contentHash: prefixedDigest,
    sourceTargetProjectId: canonicalId.nullable(),
  })
  .strict()
const frozenScopeSchema = z
  .object({ resources: z.array(frozenResourceSchema).max(65_536), operationIds: z.array(canonicalId).max(65_536) })
  .strict()
const bindingResourceHashesSchema = z
  .array(z.object({ id: canonicalId, contentHash: prefixedDigest }).strict())
  .max(4096)
// Exact fields produced by freezePreparedCapsules. Unknown fields are refused,
// rather than stripped before comparison with the original selection hash.
const executionSelectionSchema = z
  .array(
    z
      .object({
        preparedCapsuleId: canonicalId,
        capsuleHash: prefixedDigest,
        manifestHash: prefixedDigest,
        manifestJson: z.string(),
        materializationId: canonicalId,
        scenarioRevisionId: canonicalId,
        scenarioContentHash: prefixedDigest,
        targetBindingId: canonicalId,
        targetBindingHash: prefixedDigest,
        testCaseId: canonicalId,
        suiteId: canonicalId,
        resourceHashes: bindingResourceHashesSchema,
        harmless: z.boolean(),
        actions: z.array(z.string().min(1).max(1000)).max(512),
      })
      .strict(),
  )
  .min(1)
  .max(512)
// Common run-rooted classification preserves the original frozen reader's two
// resource-hash representations and passthrough source fields. PROTECTED_E2 is
// independently reparsed by the strict R06 executionSelectionSchema below.
const retainedResourceHashSchema = z.object({ id: z.string(), contentHash: z.string() }).strict()
const retainedResourceHashesSchema = z.array(
  z.union([
    retainedResourceHashSchema,
    retainedResourceHashSchema.extend({
      kind: z.enum(['OPERATION', 'STEP_DEFINITION', 'LOCATOR', 'MODULE']),
      sourceTargetProjectId: z.string().nullable(),
    }),
  ]),
)
const retainedExecutionSelectionSchema = z
  .array(
    z
      .object({
        preparedCapsuleId: z.string(),
        capsuleHash: z.string(),
        manifestHash: z.string(),
        manifestJson: z.string(),
        materializationId: z.string(),
        scenarioRevisionId: z.string(),
        scenarioContentHash: z.string(),
        targetBindingId: z.string(),
        targetBindingHash: z.string(),
        testCaseId: z.string(),
        suiteId: z.string(),
        resourceHashes: retainedResourceHashesSchema,
      })
      .passthrough(),
  )
  .min(1)
  .max(512)
// Exact existing Discovery hash representation; do not strip the sha256: prefix
// or replace its legacy canonical encoder with the new SRP1 ASCII encoder.
const discoveryHash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

export type SharedResourceUseIdentity = Readonly<{
  journeyId: string
  targetProjectId: string
  coordinatorSessionId: string
  generation: number
  sourceKind: SharedResourceSourceKind
  sourceOwnerId: string
  sourceDigest: string
}>
export type SharedResourceClaimPlan = Readonly<
  SharedResourceUseIdentity & {
    id: string
    dependencyDigest: string
    claimSetDigest: string
    claimSetCount: number
    claims: readonly Readonly<{
      id: string
      useId: string
      journeyId: string
      targetProjectId: string
      kind: SharedResourceKind
      resourceId: string
      dependencyDigest: string
    }>[]
  }
>
export type SharedResourceUseRequest = Readonly<{
  scope: E2BusinessScope
  source: Readonly<{ sourceKind: SharedResourceSourceKind; sourceOwnerId: string; expectedSourceDigest: string }>
  expectedDependencyDigest: string
}>
export type SharedResourceUseReceipt = Readonly<{
  status: 'CREATED_ACTIVE_INERT' | 'READ_ONLY_ACTIVE_RECEIPT'
  useId: string
  sourceDigest: string
  dependencyDigest: string
  claimSetDigest: string
  claimSetCount: number
}>

type FreshEnsureMembership = Readonly<{
  tx: Prisma.TransactionClient
  receiptId: string
  sourceDigest: string
  journeyId: string
  targetProjectId: string
  coordinatorSessionId: string
  generation: number
}>
const freshEnsureMemberships = new WeakMap<object, FreshEnsureMembership>()

/** Shared with the canonical ENSURE writer. Legacy nullable receipt identities are not admitted here. */
export function sharedLocatorEnsureReceiptId(
  input: Readonly<{
    journeyId: string
    targetProjectId: string
    coordinatorSessionId: string
    generation: number
    requestHash: string
  }>,
): string {
  if (
    ![input.journeyId, input.targetProjectId, input.coordinatorSessionId].every(isSharedResourceId) ||
    !Number.isInteger(input.generation) ||
    input.generation < 1 ||
    input.generation > 2_147_483_647 ||
    !isSharedResourceDigest(input.requestHash)
  )
    return refuse('ENSURE_RECEIPT_IDENTITY')
  return sharedResourceDigest('M06_LOCATOR_ENSURE_RECEIPT_V1', {
    journeyId: input.journeyId,
    targetProjectId: input.targetProjectId,
    coordinatorSessionId: input.coordinatorSessionId,
    generation: input.generation,
    requestHash: input.requestHash,
  })
}

/** All immutable receipt scalars, including generation provenance and original creation time. */
export function sharedLocatorEnsureSourceDigest(receipt: QualityJourneyLocatorEnsureReceipt): string {
  if (
    !receipt.coordinatorSessionId ||
    receipt.generation === null ||
    !isSharedResourceDigest(receipt.resultHash) ||
    ![receipt.moduleId, receipt.locatorGroupId, receipt.locatorId].every(isSharedResourceId) ||
    !validDate(receipt.createdAt) ||
    receipt.id !==
      sharedLocatorEnsureReceiptId({
        journeyId: receipt.journeyId,
        targetProjectId: receipt.targetProjectId,
        coordinatorSessionId: receipt.coordinatorSessionId,
        generation: receipt.generation,
        requestHash: receipt.requestHash,
      })
  )
    return refuse('ENSURE_RECEIPT_IDENTITY_OR_RESULT')
  const sourceHash = sharedResourceDigest('M06_LOCATOR_ENSURE_SOURCE_V1', {
    id: receipt.id,
    journeyId: receipt.journeyId,
    targetProjectId: receipt.targetProjectId,
    coordinatorSessionId: receipt.coordinatorSessionId,
    generation: receipt.generation,
    requestHash: receipt.requestHash,
    resultHash: receipt.resultHash,
    moduleId: receipt.moduleId,
    locatorGroupId: receipt.locatorGroupId,
    locatorId: receipt.locatorId,
    createdAt: receipt.createdAt.toISOString(),
  })
  return sharedSourceDigest({ sourceKind: 'ENSURE', sourceOwnerId: receipt.id, sourceHash })
}

function assertIdentity(identity: SharedResourceUseIdentity) {
  if (
    ![identity.journeyId, identity.targetProjectId, identity.coordinatorSessionId, identity.sourceOwnerId].every(
      isSharedResourceId,
    ) ||
    !sharedResourceSourceKinds.includes(identity.sourceKind) ||
    !isSharedResourceDigest(identity.sourceDigest) ||
    !Number.isInteger(identity.generation) ||
    identity.generation < 1 ||
    identity.generation > 2_147_483_647
  )
    refuse('USE_IDENTITY')
}

/** Pure inert metadata construction; callers cannot supply this plan to the transaction entry point. */
export function buildSharedResourceClaimPlan(
  identity: SharedResourceUseIdentity,
  descriptor: SharedResourceDescriptorResult,
): SharedResourceClaimPlan {
  assertIdentity(identity)
  if (
    descriptor.protocol !== 'M06_SHARED_DESCRIPTOR_V1' ||
    !isSharedResourceDigest(descriptor.dependencyDigest) ||
    !Array.isArray(descriptor.resources) ||
    !Array.isArray(descriptor.keys) ||
    descriptor.resources.length < 1 ||
    descriptor.resources.length > sharedResourceBounds.keys ||
    descriptor.keys.length !== descriptor.resources.length
  )
    refuse('DESCRIPTOR_METADATA')
  const identitySnapshot = {
    journeyId: identity.journeyId,
    targetProjectId: identity.targetProjectId,
    coordinatorSessionId: identity.coordinatorSessionId,
    generation: identity.generation,
    sourceKind: identity.sourceKind,
    sourceOwnerId: identity.sourceOwnerId,
    sourceDigest: identity.sourceDigest,
  }
  // Session/generation are immutable provenance, deliberately excluded from the
  // deterministic source identity: a later generation cannot resurrect a Use.
  const useId = sharedUseId({
    journeyId: identitySnapshot.journeyId,
    targetProjectId: identitySnapshot.targetProjectId,
    sourceKind: identitySnapshot.sourceKind,
    sourceOwnerId: identitySnapshot.sourceOwnerId,
    sourceDigest: identitySnapshot.sourceDigest,
  })
  const resources = [...descriptor.resources].sort(compareKey)
  const keys = [...descriptor.keys].sort(compareKey)
  let previous: SharedResourceDescriptorKey | undefined
  const claims = resources.map((resource, index) => {
    if (
      !sharedResourceKinds.includes(resource.kind) ||
      !isSharedResourceId(resource.resourceId) ||
      !isSharedResourceDigest(resource.dependencyDigest) ||
      keys[index]?.kind !== resource.kind ||
      keys[index]?.resourceId !== resource.resourceId ||
      (previous?.kind === resource.kind && previous.resourceId === resource.resourceId)
    )
      return refuse('DESCRIPTOR_CLAIM_KEYS')
    previous = resource
    return Object.freeze({
      id: sharedClaimId(useId, resource.kind, resource.resourceId),
      useId,
      journeyId: identitySnapshot.journeyId,
      targetProjectId: identitySnapshot.targetProjectId,
      kind: resource.kind,
      resourceId: resource.resourceId,
      dependencyDigest: resource.dependencyDigest,
    })
  })
  const claimSetDigest = sharedClaimSetDigest(claims.map(claim => ({ ...claim, claimId: claim.id })))
  return Object.freeze({
    ...identitySnapshot,
    id: useId,
    dependencyDigest: descriptor.dependencyDigest,
    claimSetDigest,
    claimSetCount: claims.length,
    claims: Object.freeze(claims),
  })
}

/** Exact cardinality, deterministic identity, lineage, and ACTIVE state; partial releases never pass. */
export function assertExactSharedResourceClaims(
  plan: SharedResourceClaimPlan,
  claims: readonly QualityJourneySharedResourceClaim[],
): void {
  if (!Array.isArray(claims) || claims.length !== plan.claimSetCount || claims.length > sharedResourceBounds.keys)
    refuse('CLAIM_SET_INCOMPLETE')
  const ordered = [...claims].sort((left, right) =>
    compareKey(
      { kind: left.kind as SharedResourceKind, resourceId: left.resourceId },
      { kind: right.kind as SharedResourceKind, resourceId: right.resourceId },
    ),
  )
  for (const [index, claim] of ordered.entries()) {
    const expected = plan.claims[index]
    if (
      !expected ||
      claim.id !== expected.id ||
      claim.useId !== plan.id ||
      claim.journeyId !== plan.journeyId ||
      claim.targetProjectId !== plan.targetProjectId ||
      claim.kind !== expected.kind ||
      claim.resourceId !== expected.resourceId ||
      claim.dependencyDigest !== expected.dependencyDigest ||
      claim.state !== 'ACTIVE' ||
      !validCounter(claim.claimEpoch) ||
      !validDate(claim.createdAt) ||
      claim.releaseEpoch !== null ||
      claim.releasedAt !== null ||
      claim.releaseEvidenceDigest !== null ||
      claim.releaseReason !== null
    )
      refuse('CLAIM_SET_CORRUPT_OR_RELEASED')
  }
  if (
    sharedClaimSetDigest(
      ordered.map(claim => ({
        claimId: claim.id,
        kind: claim.kind as SharedResourceKind,
        resourceId: claim.resourceId,
        dependencyDigest: claim.dependencyDigest,
      })),
    ) !== plan.claimSetDigest
  )
    refuse('CLAIM_SET_DIGEST_MISMATCH')
}

export function assertExactActiveSharedResourceUse(
  plan: SharedResourceClaimPlan,
  use: QualityJourneySharedResourceUse | null,
  claims: readonly QualityJourneySharedResourceClaim[],
): void {
  if (
    !use ||
    use.id !== plan.id ||
    use.journeyId !== plan.journeyId ||
    use.targetProjectId !== plan.targetProjectId ||
    use.coordinatorSessionId !== plan.coordinatorSessionId ||
    use.generation !== plan.generation ||
    use.sourceKind !== plan.sourceKind ||
    use.sourceOwnerId !== plan.sourceOwnerId ||
    use.sourceDigest !== plan.sourceDigest ||
    use.dependencyDigest !== plan.dependencyDigest ||
    use.claimSetDigest !== plan.claimSetDigest ||
    use.claimSetCount !== plan.claimSetCount ||
    use.state !== 'ACTIVE' ||
    !validCounter(use.version) ||
    use.version < 1 ||
    !validDate(use.createdAt) ||
    use.releasedAt !== null ||
    use.releaseEvidenceDigest !== null ||
    use.releaseReason !== null
  )
    refuse('USE_CORRUPT_STALE_OR_RELEASED')
  assertExactSharedResourceClaims(plan, claims)
}

function boundedJson(value: string): unknown {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > sharedResourceBounds.bytes)
    return refuse('SOURCE_BYTES_UNBOUNDED')
  try {
    const parsed: unknown = JSON.parse(value)
    canonicalSharedResourceJson(parsed)
    return parsed
  } catch {
    return refuse('SOURCE_JSON_MALFORMED_OR_UNBOUNDED')
  }
}

type TypedSource = { sourceDigest: string; keys: SharedResourceDescriptorKey[] }
function uniqueSourceKeys(keys: readonly SharedResourceDescriptorKey[]): SharedResourceDescriptorKey[] {
  const unique = new Map<string, SharedResourceDescriptorKey>()
  for (const key of keys) {
    if (!sharedResourceKinds.includes(key.kind) || !isSharedResourceId(key.resourceId)) refuse('SOURCE_RESOURCE_KEY')
    unique.set(`${key.kind}\n${key.resourceId}`, { ...key })
  }
  if (!unique.size || unique.size > sharedResourceBounds.keys) refuse('SOURCE_RESOURCE_KEYS_UNBOUNDED')
  return [...unique.values()].sort(compareKey)
}

// Retained provenance is not caller authority: no credentials, current-session
// authentication or business admission can be supplied through this private type.
type MaterializationProvenance = Pick<
  E2BusinessScope,
  'journeyId' | 'targetProjectId' | 'coordinatorSessionId' | 'generation'
>
type MaterializationSourceRequest = Readonly<{
  scope: MaterializationProvenance
  source: SharedResourceUseRequest['source']
}>
const materializationOwnerSelect = {
  id: true,
  journeyId: true,
  targetProjectId: true,
  cycleId: true,
  scenarioRevisionId: true,
  scenarioContentHash: true,
  portfolioRevisionId: true,
  portfolioContentHash: true,
  decisionId: true,
  decisionHash: true,
  workItemId: true,
  attemptId: true,
  leaseId: true,
  inputHash: true,
  materializationHash: true,
  status: true,
  sourceProofVersion: true,
  suiteId: true,
  testCaseId: true,
  artifactRecordId: true,
  artifactJson: true,
} satisfies Prisma.QualityJourneyAutomationMaterializationSelect
const materializationOwnerBindingSelect = {
  id: true,
  journeyId: true,
  targetProjectId: true,
  suiteId: true,
  testCaseId: true,
  semanticHash: true,
  suiteHash: true,
  testCaseHash: true,
  stepHash: true,
  bindingJson: true,
  resourceHashJson: true,
} satisfies Prisma.QualityJourneyAutomationTargetBindingSelect
const materializationOwnerAssociationSelect = {
  materializationId: true,
  bindingId: true,
} satisfies Prisma.QualityJourneyAutomationMaterializationBindingSelect

async function readMaterializationSource(
  tx: Prisma.TransactionClient,
  request: MaterializationSourceRequest,
  mode: 'CURRENT_MATERIALIZATION' | 'RETAINED_EXECUTION' = 'CURRENT_MATERIALIZATION',
) {
  const retainedExecution = mode === 'RETAINED_EXECUTION'
  const { scope, source } = request
  const row = await tx.qualityJourneyAutomationMaterialization.findUnique({
    where: { id: source.sourceOwnerId },
    select: materializationOwnerSelect,
  })
  if (
    !row ||
    row.id !== source.sourceOwnerId ||
    row.journeyId !== scope.journeyId ||
    row.targetProjectId !== scope.targetProjectId
  )
    return refuse('MATERIALIZATION_SCOPE')
  const [proof, artifact, associations, binding, attempt, item, journey] = await Promise.all([
    tx.qualityJourneyAutomationMaterializationSourceProof.findUnique({ where: { materializationId: row.id } }),
    tx.qualityJourneyArtifact.findUnique({
      where: { id: row.artifactRecordId },
      select: {
        id: true,
        journeyId: true,
        targetProjectId: true,
        cycleId: true,
        kind: true,
        artifactId: true,
        contentHash: true,
        artifactJson: true,
      },
    }),
    // Read every association without target/owner filtering. A duplicate, missing,
    // foreign or unsupported cardinality is a refusal, never a selected subset.
    tx.qualityJourneyAutomationMaterializationBinding.findMany({
      where: { materializationId: row.id },
      orderBy: { bindingId: 'asc' },
      take: sharedResourceBounds.keys + 1,
    }),
    tx.qualityJourneyWorkAttemptSessionBinding.findUnique({ where: { attemptId: row.attemptId } }),
    tx.qualityJourneyWorkAttempt.findUnique({
      where: { id: row.attemptId },
      select: { workItemId: true, authorizationId: true, leaseId: true, assignmentGeneration: true },
    }),
    tx.qualityJourneyWorkItem.findUnique({
      where: { id: row.workItemId },
      select: { journeyId: true, targetProjectId: true, cycleId: true, role: true, inputHash: true },
    }),
    retainedExecution
      ? null
      : tx.qualityJourney.findFirst({
          where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
          select: { activeCycleId: true },
        }),
  ])
  if (
    !binding ||
    binding.journeyId !== scope.journeyId ||
    binding.targetProjectId !== scope.targetProjectId ||
    (!retainedExecution &&
      (binding.sessionId !== scope.coordinatorSessionId || binding.coordinatorGeneration !== scope.generation)) ||
    binding.workItemId !== row.workItemId ||
    binding.leaseId !== row.leaseId ||
    binding.inputHash !== row.inputHash ||
    binding.role !== 'AUTOMATOR' ||
    !attempt ||
    attempt.workItemId !== row.workItemId ||
    attempt.leaseId !== row.leaseId ||
    attempt.assignmentGeneration !== binding.assignmentGeneration ||
    attempt.authorizationId !== binding.authorizationId ||
    !attempt.authorizationId ||
    !item ||
    item.journeyId !== scope.journeyId ||
    item.targetProjectId !== scope.targetProjectId ||
    item.cycleId !== row.cycleId ||
    item.role !== 'AUTOMATOR' ||
    item.inputHash !== row.inputHash ||
    (!retainedExecution && journey?.activeCycleId !== row.cycleId)
  )
    return refuse('MATERIALIZATION_GENERATION_OR_WORK_LINEAGE')
  if (retainedExecution) {
    // Retained producer lineage is provenance, never current caller authority.
    // Neither its session nor an old source/predecessor Use must remain ACTIVE.
    if (
      binding.attemptId !== row.attemptId ||
      !isSharedResourceId(binding.sessionId) ||
      !Number.isInteger(binding.coordinatorGeneration) ||
      !binding.coordinatorGeneration ||
      binding.coordinatorGeneration < 1 ||
      binding.coordinatorGeneration > 2_147_483_647
    )
      return refuse('EXECUTION_RETAINED_PRODUCER_BINDING')
    const [producer, producerCycle] = await Promise.all([
      tx.qualityJourneyCoordinatorSession.findUnique({
        where: { id: binding.sessionId },
        select: { id: true, journeyId: true, targetProjectId: true, generation: true },
      }),
      tx.qualityJourneyCycle.findUnique({ where: { id: row.cycleId }, select: { id: true, journeyId: true } }),
    ])
    if (
      !producer ||
      producer.id !== binding.sessionId ||
      producer.journeyId !== row.journeyId ||
      producer.targetProjectId !== row.targetProjectId ||
      producer.generation !== binding.coordinatorGeneration ||
      !producerCycle ||
      producerCycle.id !== row.cycleId ||
      producerCycle.journeyId !== row.journeyId
    )
      return refuse('EXECUTION_RETAINED_PRODUCER_SESSION_OR_CYCLE')
  }
  const authorization = await tx.qualityJourneyWorkAuthorization.findUnique({
    where: { id: attempt.authorizationId },
    select: { journeyId: true, targetProjectId: true, workItemId: true, role: true },
  })
  if (
    !authorization ||
    authorization.journeyId !== scope.journeyId ||
    authorization.targetProjectId !== scope.targetProjectId ||
    authorization.workItemId !== row.workItemId ||
    authorization.role !== 'AUTOMATOR'
  )
    return refuse('MATERIALIZATION_AUTHORIZATION_LINEAGE')
  if (!associations.length || associations.length > sharedResourceBounds.keys)
    return refuse('MATERIALIZATION_ASSOCIATIONS_UNBOUNDED_OR_MISSING')
  const targetBindings = await tx.qualityJourneyAutomationTargetBinding.findMany({
    where: { id: { in: associations.map(association => association.bindingId) } },
    select: {
      id: true,
      targetProjectId: true,
      suiteId: true,
      testCaseId: true,
      semanticHash: true,
      suiteHash: true,
      testCaseHash: true,
      stepHash: true,
      bindingJson: true,
      resourceHashJson: true,
    },
    orderBy: { id: 'asc' },
    take: sharedResourceBounds.keys + 1,
  })
  let reconstructed: ReturnType<typeof reconstructMaterializationSource>
  try {
    reconstructed = reconstructMaterializationSource({
      materialization: row,
      proof,
      artifact,
      materializationBindings: associations,
      targetBindings,
    })
  } catch {
    return refuse('MATERIALIZATION_SOURCE_RECONSTRUCTION_REFUSED')
  }
  if (
    reconstructed.sourceOwnerId !== source.sourceOwnerId ||
    reconstructed.sourceDigest !== source.expectedSourceDigest
  )
    return refuse('MATERIALIZATION_SOURCE_DIGEST_STALE')
  const keys: SharedResourceDescriptorKey[] = []
  const frozenLocatorIds = new Set<string>()
  for (const targetBinding of targetBindings) {
    const decoded = automationTargetBindingSchema.safeParse(boundedJson(targetBinding.bindingJson))
    if (!decoded.success) return refuse('MATERIALIZATION_BINDING_PACKET_MALFORMED')
    const packet = decoded.data
    if (
      packet.targetProjectId !== scope.targetProjectId ||
      targetBinding.targetProjectId !== scope.targetProjectId ||
      packet.suite.id !== targetBinding.suiteId ||
      packet.testCase.id !== targetBinding.testCaseId ||
      packet.suite.id !== row.suiteId ||
      packet.testCase.id !== row.testCaseId ||
      canonicalContractJson(packet) !== targetBinding.bindingJson ||
      hashAutomationTargetBinding(packet) !== targetBinding.testCaseHash ||
      hashAutomationMaterialization(packet.testCase.steps) !== targetBinding.stepHash ||
      hashAutomationMaterialization({
        targetProjectId: packet.targetProjectId,
        moduleId: packet.moduleId,
        suite: packet.suite,
      }) !== targetBinding.suiteHash ||
      hashAutomationMaterialization({
        schemaVersion: packet.schemaVersion,
        targetProjectId: packet.targetProjectId,
        moduleId: packet.moduleId,
        suite: { name: packet.suite.name, description: packet.suite.description },
        testCase: {
          title: packet.testCase.title,
          description: packet.testCase.description,
          steps: packet.testCase.steps,
        },
      }) !== targetBinding.semanticHash
    )
      return refuse('MATERIALIZATION_BINDING_CANONICAL_HASH_OR_SCOPE')
    if (!retainedExecution) {
      const [suite, testCase, steps] = await Promise.all([
        tx.testSuite.findUnique({
          where: { id: packet.suite.id },
          select: {
            id: true,
            targetProjectId: true,
            moduleId: true,
            name: true,
            description: true,
            testCases: { where: { id: packet.testCase.id }, select: { id: true }, take: 2 },
          },
        }),
        tx.testCase.findUnique({
          where: { id: packet.testCase.id },
          select: { id: true, targetProjectId: true, title: true, description: true },
        }),
        tx.testCaseStep.findMany({
          where: { testCaseId: packet.testCase.id },
          select: { testCaseId: true, order: true, gherkinStep: true, label: true, icon: true, invocationJson: true },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          take: 129,
        }),
      ])
      if (
        !suite ||
        suite.targetProjectId !== scope.targetProjectId ||
        suite.moduleId !== packet.moduleId ||
        suite.name !== packet.suite.name ||
        suite.description !== packet.suite.description ||
        suite.testCases.length !== 1 ||
        suite.testCases[0]?.id !== packet.testCase.id ||
        !testCase ||
        testCase.targetProjectId !== scope.targetProjectId ||
        testCase.title !== packet.testCase.title ||
        testCase.description !== packet.testCase.description ||
        steps.some(step => step.testCaseId !== packet.testCase.id) ||
        canonicalContractJson(
          steps.map(({ order, gherkinStep, label, icon, invocationJson }) => ({
            order,
            gherkinStep,
            label,
            icon,
            invocationJson,
          })),
        ) !== canonicalContractJson(packet.testCase.steps)
      )
        return refuse('MATERIALIZATION_CURRENT_BINDING_CONTENT_CHANGED')
    }
    // A binding's creator Journey is not the owner set. Its complete association
    // supplies this source's relationship; other Journeys keep independent Uses.
    keys.push(
      { kind: 'MODULE', resourceId: packet.moduleId },
      { kind: 'TEST_SUITE', resourceId: packet.suite.id },
      { kind: 'TEST_CASE', resourceId: packet.testCase.id },
    )
    const resources = bindingResourceHashesSchema.safeParse(boundedJson(targetBinding.resourceHashJson))
    if (!resources.success || canonicalContractJson(resources.data) !== targetBinding.resourceHashJson)
      return refuse('MATERIALIZATION_RESOURCE_REFERENCES_MALFORMED')
    const seen = new Set<string>()
    for (const resource of resources.data) {
      if (seen.has(resource.id)) return refuse('MATERIALIZATION_RESOURCE_REFERENCE_DUPLICATE')
      seen.add(resource.id)
      if (resource.id.startsWith('module:')) {
        const moduleId = resource.id.slice('module:'.length)
        if (!isSharedResourceId(moduleId)) return refuse('MATERIALIZATION_RESOURCE_REFERENCE_MALFORMED')
        if (!retainedExecution) {
          const moduleRow = await tx.module.findUnique({
            where: { id: moduleId },
            select: { id: true, name: true, updatedAt: true, targetProjectId: true },
          })
          if (
            !moduleRow ||
            moduleRow.targetProjectId !== scope.targetProjectId ||
            hashAutomationMaterialization({
              id: moduleRow.id,
              name: moduleRow.name,
              updatedAt: moduleRow.updatedAt,
            }) !== resource.contentHash
          )
            return refuse('MATERIALIZATION_FROZEN_MODULE_CHANGED_OR_FOREIGN')
        }
        keys.push({ kind: 'MODULE', resourceId: moduleId })
      } else if (resource.id.startsWith('locator:')) {
        const locatorId = resource.id.slice('locator:'.length)
        if (!isSharedResourceId(locatorId)) return refuse('MATERIALIZATION_RESOURCE_REFERENCE_MALFORMED')
        const locator = await tx.locator.findUnique({
          where: { id: locatorId },
          select: { id: true, value: true, updatedAt: true, targetProjectId: true },
        })
        if (
          !locator ||
          locator.targetProjectId !== scope.targetProjectId ||
          hashAutomationMaterialization(locator) !== resource.contentHash
        )
          return refuse('MATERIALIZATION_FROZEN_LOCATOR_CHANGED_OR_FOREIGN')
        frozenLocatorIds.add(locatorId)
        keys.push({ kind: 'LOCATOR', resourceId: locatorId })
      } else if (resource.id.startsWith('operation:') || resource.id.startsWith('step:')) {
        // Preexisting immutable operation/definition authority remains separate.
        // These references cannot stand in for mutable-resource closure proof.
        if (
          !resource.id
            .split(':')
            .slice(1)
            .every(part => part.length > 0)
        )
          return refuse('MATERIALIZATION_IMMUTABLE_REFERENCE_MALFORMED')
      } else return refuse('MATERIALIZATION_RESOURCE_REFERENCE_UNSUPPORTED')
    }
  }
  for (const step of reconstructed.proposal.steps) {
    for (const requirement of step.locatorRequirements) {
      if (!requirement.locatorId) return refuse('MATERIALIZATION_RUNTIME_LOCATOR_UNRESOLVED')
      if (!frozenLocatorIds.has(requirement.locatorId)) return refuse('MATERIALIZATION_LOCATOR_NOT_FROZEN')
      keys.push({ kind: 'LOCATOR', resourceId: requirement.locatorId })
    }
  }
  // Only this internal helper retains transient reconstruction bytes. The
  // public result and readPlan's source snapshot contain digests and keys only.
  return {
    sourceDigest: reconstructed.sourceDigest,
    keys: uniqueSourceKeys(keys),
    materialization: row,
    targetBindings,
    proposal: reconstructed.proposal,
  }
}

/**
 * The source writer inserts the exact cycle in its existing reservation
 * transaction, then acquires this Use before publishing any TestRun/binding.
 * Prepared capsules are Phase 6 inputs: no future TestRun or managed capsule is
 * required here. All provenance is checked through the actual materialization
 * attempt/session binding; a capsule scalar alone never supplies lineage.
 */
async function readExecutionSource(
  tx: Prisma.TransactionClient,
  request: MaterializationSourceRequest,
): Promise<TypedSource> {
  const { scope, source } = request
  const cycle = await tx.qualityJourneyExecutionCycle.findUnique({
    where: { id: source.sourceOwnerId },
    select: {
      id: true,
      journeyId: true,
      targetProjectId: true,
      cycleId: true,
      predecessorExecutionCycleId: true,
      preparedCapsulesJson: true,
      preparedCapsulesHash: true,
    },
  })
  const journey = await tx.qualityJourney.findFirst({
    where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
    select: { activeCycleId: true },
  })
  if (
    !cycle ||
    cycle.id !== source.sourceOwnerId ||
    cycle.journeyId !== scope.journeyId ||
    cycle.targetProjectId !== scope.targetProjectId ||
    cycle.cycleId !== journey?.activeCycleId
  )
    return refuse('EXECUTION_CYCLE_SCOPE_OR_CURRENT_CYCLE')
  const decoded = executionSelectionSchema.safeParse(boundedJson(cycle.preparedCapsulesJson))
  if (
    !decoded.success ||
    canonicalContractJson(decoded.data) !== cycle.preparedCapsulesJson ||
    hashQualityJourneyExecutionValue(decoded.data) !== cycle.preparedCapsulesHash
  )
    return refuse('EXECUTION_SELECTION_CANONICAL_HASH_OR_SHAPE')
  const selection = decoded.data
  if (cycle.predecessorExecutionCycleId) {
    const predecessor = await tx.qualityJourneyExecutionCycle.findUnique({
      where: { id: cycle.predecessorExecutionCycleId },
      select: {
        id: true,
        journeyId: true,
        targetProjectId: true,
        status: true,
        preparedCapsulesJson: true,
        preparedCapsulesHash: true,
      },
    })
    if (
      !predecessor ||
      predecessor.id === cycle.id ||
      predecessor.id !== cycle.predecessorExecutionCycleId ||
      predecessor.journeyId !== scope.journeyId ||
      predecessor.targetProjectId !== scope.targetProjectId ||
      !['COMPLETED', 'CANCELLED'].includes(predecessor.status)
    )
      return refuse('EXECUTION_PREDECESSOR_SCOPE_OR_STATUS')
    const previous = executionSelectionSchema.safeParse(boundedJson(predecessor.preparedCapsulesJson))
    if (
      !previous.success ||
      canonicalContractJson(previous.data) !== predecessor.preparedCapsulesJson ||
      hashQualityJourneyExecutionValue(previous.data) !== predecessor.preparedCapsulesHash ||
      canonicalContractJson(
        [...previous.data].sort((a, b) => a.preparedCapsuleId.localeCompare(b.preparedCapsuleId)),
      ) !== predecessor.preparedCapsulesJson ||
      new Set(previous.data.map(item => item.preparedCapsuleId)).size !== previous.data.length ||
      new Set(previous.data.map(item => item.materializationId)).size !== previous.data.length
    )
      return refuse('EXECUTION_PREDECESSOR_SELECTION_CORRUPT')
    const previousById = new Map(previous.data.map(item => [item.preparedCapsuleId, item]))
    if (
      selection.some(
        item => canonicalContractJson(previousById.get(item.preparedCapsuleId) ?? null) !== canonicalContractJson(item),
      )
    )
      return refuse('EXECUTION_PREDECESSOR_SELECTION_MISMATCH')
  }
  const selectedIds = selection.map(item => item.preparedCapsuleId)
  if (
    new Set(selectedIds).size !== selection.length ||
    canonicalContractJson([...selection].sort((a, b) => a.preparedCapsuleId.localeCompare(b.preparedCapsuleId))) !==
      cycle.preparedCapsulesJson ||
    new Set(selection.map(item => item.materializationId)).size !== selection.length
  )
    return refuse('EXECUTION_SELECTION_DUPLICATE_OR_ORDER')
  const sourceDigest = sharedSourceDigest({
    sourceKind: 'EXECUTION_CYCLE',
    sourceOwnerId: cycle.id,
    sourceHash: cycle.preparedCapsulesHash,
  })
  if (sourceDigest !== source.expectedSourceDigest) return refuse('EXECUTION_SOURCE_DIGEST_STALE')
  // Resolve all selected identities without scope/status filters that could hide
  // a foreign row. The exact set is checked before any business admission/CAS.
  const preparedRows = await tx.qualityJourneyPreparedRuntimeCapsule.findMany({
    where: { id: { in: selectedIds } },
    orderBy: { id: 'asc' },
    take: 513,
  })
  const preparedById = new Map(preparedRows.map(row => [row.id, row]))
  if (
    preparedRows.length !== selection.length ||
    preparedById.size !== selection.length ||
    preparedRows.some(row => !selectedIds.includes(row.id))
  )
    return refuse('EXECUTION_PREPARED_SET_INCOMPLETE_OR_DUPLICATE')
  let keys: SharedResourceDescriptorKey[] = []
  for (const frozen of selection) {
    const prepared = preparedById.get(frozen.preparedCapsuleId)
    if (
      !prepared ||
      prepared.journeyId !== scope.journeyId ||
      prepared.targetProjectId !== scope.targetProjectId ||
      prepared.materializationId !== frozen.materializationId ||
      prepared.status !== 'PREPARED'
    )
      return refuse('EXECUTION_PREPARED_LINEAGE_OR_STATUS')
    const capsuleIdentity = preparedRuntimeCapsuleSchema.safeParse({
      schemaVersion: 'appraise.quality-journey/v1',
      capsuleId: prepared.id,
      journeyId: prepared.journeyId,
      targetProjectId: prepared.targetProjectId,
      cycleId: prepared.cycleId,
      materializationId: prepared.materializationId,
      inputHash: prepared.inputHash,
      manifestHash: prepared.manifestHash,
      status: prepared.status,
    })
    const manifest = boundedJson(prepared.manifestJson)
    if (
      !capsuleIdentity.success ||
      canonicalContractJson(manifest) !== prepared.manifestJson ||
      hashQualityJourneyExecutionValue(manifest) !== prepared.manifestHash ||
      hashQualityJourneyExecutionValue(capsuleIdentity.data) !== prepared.capsuleHash ||
      frozen.capsuleHash !== prepared.capsuleHash ||
      frozen.manifestHash !== prepared.manifestHash ||
      frozen.manifestJson !== prepared.manifestJson
    )
      return refuse('EXECUTION_PREPARED_CANONICAL_HASH')
    // Reconstruct original producer lineage/frozen bytes independently of this
    // execution cycle. An old Use is not source availability or fresh authority.
    const materializationRow = await tx.qualityJourneyAutomationMaterialization.findUnique({
      where: { id: prepared.materializationId },
      select: { materializationHash: true },
    })
    if (!materializationRow || !prefixedDigest.safeParse(materializationRow.materializationHash).success)
      return refuse('EXECUTION_MATERIALIZATION_SOURCE_MISSING')
    const materialization = await readMaterializationSource(
      tx,
      {
        ...request,
        source: {
          sourceKind: 'AUTOMATION_MATERIALIZATION',
          sourceOwnerId: prepared.materializationId,
          expectedSourceDigest: sharedSourceDigest({
            sourceKind: 'AUTOMATION_MATERIALIZATION',
            sourceOwnerId: prepared.materializationId,
            sourceHash: materializationRow.materializationHash,
          }),
        },
      },
      'RETAINED_EXECUTION',
    )
    const row = materialization.materialization
    if (
      row.cycleId !== prepared.cycleId ||
      row.inputHash !== prepared.inputHash ||
      row.scenarioRevisionId !== frozen.scenarioRevisionId ||
      row.scenarioContentHash !== frozen.scenarioContentHash ||
      row.suiteId !== frozen.suiteId ||
      row.testCaseId !== frozen.testCaseId ||
      materialization.targetBindings.length !== 1
    )
      return refuse('EXECUTION_MATERIALIZATION_SELECTION_LINEAGE')
    // Reconstruct the exact preparation manifest from the verified materialization
    // artifact, omitting only the three artifact-only fields used by its writer.
    const artifact = boundedJson(row.artifactJson)
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return refuse('EXECUTION_ARTIFACT_SHAPE')
    const expectedManifest = { ...artifact } as Record<string, unknown>
    delete expectedManifest.decision
    delete expectedManifest.portfolioRevisionId
    delete expectedManifest.portfolioHash
    if (canonicalContractJson(expectedManifest) !== prepared.manifestJson)
      return refuse('EXECUTION_MANIFEST_MATERIALIZATION_MISMATCH')
    const binding = materialization.targetBindings[0]!
    if (
      binding.id !== frozen.targetBindingId ||
      binding.suiteId !== frozen.suiteId ||
      binding.testCaseId !== frozen.testCaseId ||
      hashQualityJourneyExecutionValue(boundedJson(binding.bindingJson)) !== frozen.targetBindingHash ||
      binding.resourceHashJson !== canonicalContractJson(frozen.resourceHashes)
    )
      return refuse('EXECUTION_FROZEN_BINDING_SELECTION_MISMATCH')
    const packet = automationTargetBindingSchema.parse(boundedJson(binding.bindingJson))
    const invocations = packet.testCase.steps.map(step => {
      const raw = boundedJson(step.invocationJson)
      const invocation = stepInvocationSchema.safeParse(raw)
      if (!invocation.success || canonicalContractJson(invocation.data) !== step.invocationJson)
        return refuse('EXECUTION_INVOCATION_MALFORMED_OR_NONCANONICAL')
      return invocation.data
    })
    // The preexisting immutable definition/operation authority is separate from
    // five-kind resource coverage. Recheck the exact definitions used to freeze
    // the classification; no live-tag or current Suite/Case inventory fallback.
    const references = new Map(
      invocations.map(invocation => [`${invocation.step.id}@${invocation.step.version}`, invocation.step]),
    )
    for (const resource of frozen.resourceHashes) {
      if (resource.id.startsWith('step:')) {
        const parts = resource.id.split(':')
        if (parts.length !== 3 || !parts[1] || !parts[2]) return refuse('EXECUTION_FROZEN_DEFINITION_REFERENCE')
        const reference = { id: parts[1], version: parts[2] }
        // The reference hash is checked separately for every actual invocation.
        if (!references.has(`${reference.id}@${reference.version}`))
          references.set(`${reference.id}@${reference.version}`, { ...reference, definitionHash: resource.contentHash })
      } else if (resource.id.startsWith('operation:')) {
        const operation = defaultOperationDefinitions.find(
          value => `operation:${value.id}:${value.version}` === resource.id,
        )
        if (!operation || hashQualityJourneyExecutionValue(operation) !== resource.contentHash)
          return refuse('EXECUTION_FROZEN_OPERATION_HASH')
      }
    }
    if (references.size > sharedResourceBounds.keys) return refuse('EXECUTION_DEFINITION_SET_UNBOUNDED')
    const definitions = await tx.stepDefinition.findMany({
      where: {
        OR: [...references.values()].map(step => ({
          id: step.id,
          version: step.version,
        })),
      },
      select: {
        id: true,
        version: true,
        status: true,
        definitionJson: true,
        definitionHash: true,
        humanProjectionHash: true,
        agentContractHash: true,
        executionHash: true,
      },
      take: 4097,
    })
    const byReference = new Map(definitions.map(definition => [`${definition.id}@${definition.version}`, definition]))
    if (definitions.length !== references.size || byReference.size !== references.size)
      return refuse('EXECUTION_DEFINITION_SET_MISSING_OR_DUPLICATE')
    for (const definition of definitions) {
      if (!references.has(`${definition.id}@${definition.version}`) || definition.status !== 'ready')
        return refuse('EXECUTION_DEFINITION_NOT_READY')
      const parsed = stepDefinitionSchema.safeParse(boundedJson(definition.definitionJson))
      if (
        !parsed.success ||
        canonicalContractJson(parsed.data) !== definition.definitionJson ||
        parsed.data.identity.id !== definition.id ||
        parsed.data.identity.version !== definition.version ||
        parsed.data.identity.status !== 'ready'
      )
        return refuse('EXECUTION_DEFINITION_CANONICAL_IDENTITY')
      const hashes = computeStepDefinitionHashes(parsed.data)
      if (
        definition.definitionHash !== hashes.definitionHash ||
        definition.humanProjectionHash !== hashes.humanProjectionHash ||
        definition.agentContractHash !== hashes.agentContractHash ||
        definition.executionHash !== hashes.executionHash ||
        frozen.resourceHashes.find(resource => resource.id === `step:${definition.id}:${definition.version}`)
          ?.contentHash !== hashes.definitionHash ||
        invocations.some(
          invocation =>
            invocation.step.id === definition.id &&
            invocation.step.version === definition.version &&
            computeStepReferenceHash(parsed.data) !== invocation.step.definitionHash,
        )
      )
        return refuse('EXECUTION_DEFINITION_REFERENCE_HASH')
    }
    const effects = classifyJourneyExecutionEffects(invocations, definitions)
    if (
      effects.harmless !== frozen.harmless ||
      canonicalContractJson(effects.actions) !== canonicalContractJson(frozen.actions)
    )
      return refuse('EXECUTION_FROZEN_EFFECT_CLASSIFICATION_CHANGED')
    keys = uniqueSourceKeys([...keys, ...materialization.keys])
  }
  return { sourceDigest, keys: uniqueSourceKeys(keys) }
}

async function readTypedSource(
  tx: Prisma.TransactionClient,
  request: Pick<SharedResourceUseRequest, 'scope' | 'source'>,
): Promise<TypedSource> {
  const { scope, source } = request
  if (source.sourceKind === 'EXECUTION_CYCLE') return readExecutionSource(tx, request)
  let sourceHash: string
  let keys: SharedResourceDescriptorKey[]
  if (source.sourceKind === 'ENSURE') {
    const receipt = await tx.qualityJourneyLocatorEnsureReceipt.findUnique({ where: { id: source.sourceOwnerId } })
    if (
      !receipt ||
      receipt.journeyId !== scope.journeyId ||
      receipt.targetProjectId !== scope.targetProjectId ||
      receipt.coordinatorSessionId !== scope.coordinatorSessionId ||
      receipt.generation !== scope.generation ||
      !isSharedResourceDigest(receipt.id) ||
      !isSharedResourceDigest(receipt.requestHash) ||
      !isSharedResourceDigest(receipt.resultHash) ||
      !validDate(receipt.createdAt)
    )
      return refuse('ENSURE_RECEIPT_SCOPE')
    const sourceDigest = sharedLocatorEnsureSourceDigest(receipt)
    if (sourceDigest !== source.expectedSourceDigest) return refuse('SOURCE_DIGEST_STALE')
    const [group, locator] = await Promise.all([
      tx.locatorGroup.findUnique({
        where: { id: receipt.locatorGroupId },
        select: { id: true, moduleId: true, targetProjectId: true },
      }),
      tx.locator.findUnique({
        where: { id: receipt.locatorId },
        select: { id: true, locatorGroupId: true, targetProjectId: true },
      }),
    ])
    if (
      !group ||
      !locator ||
      group.id !== receipt.locatorGroupId ||
      locator.id !== receipt.locatorId ||
      group.targetProjectId !== scope.targetProjectId ||
      locator.targetProjectId !== scope.targetProjectId ||
      group.moduleId !== receipt.moduleId ||
      locator.locatorGroupId !== receipt.locatorGroupId
    )
      return refuse('ENSURE_RESULT_RELATIONSHIP_CHANGED')
    keys = [
      { kind: 'MODULE', resourceId: receipt.moduleId },
      { kind: 'LOCATOR_GROUP', resourceId: receipt.locatorGroupId },
      { kind: 'LOCATOR', resourceId: receipt.locatorId },
    ]
    return { sourceDigest, keys: uniqueSourceKeys(keys) }
  } else if (source.sourceKind === 'AUTOMATION_MATERIALIZATION') {
    const { sourceDigest, keys } = await readMaterializationSource(tx, request)
    return { sourceDigest, keys }
  } else if (source.sourceKind === 'RESOURCE_RESOLUTION') {
    const revision = await tx.qualityJourneyDiscoveryRevision.findUnique({ where: { id: source.sourceOwnerId } })
    const journey = await tx.qualityJourney.findFirst({
      where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
      select: { activeDiscoveryRevisionId: true, activeCycleId: true },
    })
    if (
      !revision ||
      revision.journeyId !== scope.journeyId ||
      revision.targetProjectId !== scope.targetProjectId ||
      journey?.activeDiscoveryRevisionId !== revision.id ||
      journey.activeCycleId !== revision.cycleId ||
      !['COLLECTING', 'COMPLETED'].includes(revision.status) ||
      revision.invalidatedAt !== null ||
      revision.supersededAt !== null ||
      !validDate(revision.resourceResolutionSubmittedAt) ||
      !revision.resourceResolutionJson ||
      !prefixedDigest.safeParse(revision.resourceResolutionHash).success
    )
      return refuse('RESOURCE_RESOLUTION_NOT_CURRENT_ACCEPTED')
    const decodedBundle = resourceResolutionBundleSchema.safeParse(boundedJson(revision.resourceResolutionJson))
    if (!decodedBundle.success) return refuse('RESOURCE_RESOLUTION_BUNDLE_MALFORMED')
    const bundle = decodedBundle.data
    if (
      canonicalContractJson(bundle) !== revision.resourceResolutionJson ||
      hashResourceResolutionBundle(bundle) !== revision.resourceResolutionHash ||
      bundle.journeyId !== scope.journeyId ||
      bundle.targetProjectId !== scope.targetProjectId ||
      bundle.cycleId !== revision.cycleId ||
      bundle.workItemId !== revision.resourceWorkItemId ||
      bundle.inputHash !== revision.resourceInputHash ||
      bundle.approvedRequirementSetHash !== revision.approvedRequirementSetHash ||
      bundle.analysisRevision.artifactId !== revision.analysisRevisionArtifactId ||
      bundle.analysisRevision.contentHash !== revision.analysisRevisionContentHash ||
      bundle.analysisApproval.artifactId !== revision.analysisApprovalArtifactId ||
      bundle.analysisApproval.contentHash !== revision.analysisApprovalContentHash
    )
      return refuse('RESOURCE_RESOLUTION_ENVELOPE_MISMATCH')
    const [analysis, decision, item, attempt, authorization] = await Promise.all([
      tx.qualityJourneyAnalysisRevision.findUnique({
        where: { id: revision.analysisRevisionId },
        select: {
          id: true,
          journeyId: true,
          targetProjectId: true,
          artifactId: true,
          artifactRecordId: true,
          artifactRevisionId: true,
          contentHash: true,
        },
      }),
      tx.qualityJourneyAnalysisDecision.findUnique({
        where: { id: revision.analysisDecisionId },
        select: {
          journeyId: true,
          analysisRevisionId: true,
          decision: true,
          artifact: { select: { journeyId: true, targetProjectId: true, artifactId: true, contentHash: true } },
        },
      }),
      tx.qualityJourneyWorkItem.findUnique({
        where: { id: bundle.workItemId },
        select: { journeyId: true, targetProjectId: true, cycleId: true, role: true, inputHash: true },
      }),
      tx.qualityJourneyWorkAttempt.findUnique({
        where: { id: bundle.attemptId },
        select: { workItemId: true, authorizationId: true, leaseId: true, assignmentGeneration: true },
      }),
      tx.qualityJourneyWorkAuthorization.findUnique({
        where: { id: bundle.authorizationId },
        select: { journeyId: true, targetProjectId: true, workItemId: true, role: true },
      }),
    ])
    if (
      !analysis ||
      !decision ||
      analysis.journeyId !== scope.journeyId ||
      analysis.targetProjectId !== scope.targetProjectId ||
      analysis.artifactRecordId !== revision.analysisArtifactId ||
      analysis.artifactId !== revision.analysisRevisionArtifactId ||
      analysis.contentHash !== revision.analysisRevisionContentHash ||
      analysis.artifactRevisionId !== bundle.analysisRevision.revisionId ||
      decision.journeyId !== scope.journeyId ||
      decision.analysisRevisionId !== analysis.id ||
      decision.decision !== 'APPROVED' ||
      decision.artifact.journeyId !== scope.journeyId ||
      decision.artifact.targetProjectId !== scope.targetProjectId ||
      decision.artifact.artifactId !== revision.analysisApprovalArtifactId ||
      decision.artifact.contentHash !== revision.analysisApprovalContentHash ||
      !item ||
      item.journeyId !== scope.journeyId ||
      item.targetProjectId !== scope.targetProjectId ||
      item.cycleId !== revision.cycleId ||
      item.role !== 'RESOURCE_EXPLORER' ||
      item.inputHash !== revision.resourceInputHash ||
      !attempt ||
      attempt.workItemId !== revision.resourceWorkItemId ||
      attempt.authorizationId !== bundle.authorizationId ||
      !authorization ||
      authorization.journeyId !== scope.journeyId ||
      authorization.targetProjectId !== scope.targetProjectId ||
      authorization.workItemId !== revision.resourceWorkItemId ||
      authorization.role !== 'RESOURCE_EXPLORER'
    )
      return refuse('RESOURCE_RESOLUTION_CANONICAL_LINEAGE_MISMATCH')
    const binding = await tx.qualityJourneyWorkAttemptSessionBinding.findUnique({
      where: { attemptId: bundle.attemptId },
    })
    if (
      !binding ||
      binding.journeyId !== scope.journeyId ||
      binding.targetProjectId !== scope.targetProjectId ||
      binding.sessionId !== scope.coordinatorSessionId ||
      binding.coordinatorGeneration !== scope.generation ||
      binding.workItemId !== revision.resourceWorkItemId ||
      binding.authorizationId !== bundle.authorizationId ||
      binding.role !== 'RESOURCE_EXPLORER' ||
      binding.inputHash !== revision.resourceInputHash ||
      binding.leaseId !== attempt.leaseId ||
      binding.assignmentGeneration !== attempt.assignmentGeneration
    )
      return refuse('RESOURCE_RESOLUTION_GENERATION_MISMATCH')
    const decodedScope = frozenScopeSchema.safeParse(boundedJson(revision.resourceScopeJson))
    if (!decodedScope.success) return refuse('RESOURCE_RESOLUTION_FROZEN_SCOPE_MALFORMED')
    const frozen = decodedScope.data
    const inputArtifacts = [
      {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: analysis.artifactId,
        revisionId: analysis.artifactRevisionId,
        contentHash: analysis.contentHash,
      },
      {
        kind: 'JOURNEY_APPROVAL',
        artifactId: decision.artifact.artifactId,
        contentHash: decision.artifact.contentHash,
      },
    ]
    const shared = {
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      cycleId: revision.cycleId,
      approvedRequirementSetHash: revision.approvedRequirementSetHash,
      environmentRegistryHash: revision.environmentRegistryHash,
      locatorRegistryHash: revision.locatorRegistryHash,
      resourceRegistryHash: revision.resourceRegistryHash,
      stepDefinitionRegistryHash: revision.stepDefinitionRegistryHash,
      operationRegistryHash: revision.operationRegistryHash,
      inputArtifacts,
    }
    if (
      canonicalContractJson(frozen) !== revision.resourceScopeJson ||
      canonicalContractJson(bundle.inputArtifacts) !== canonicalContractJson(inputArtifacts) ||
      discoveryHash(frozen.resources) !== revision.resourceRegistryHash ||
      discoveryHash(frozen.resources.filter(resource => resource.kind === 'STEP_DEFINITION')) !==
        revision.stepDefinitionRegistryHash ||
      discoveryHash(frozen.resources.filter(resource => resource.kind === 'OPERATION')) !==
        revision.operationRegistryHash ||
      discoveryHash({ ...shared, role: 'RESOURCE_EXPLORER', scope: frozen }) !== revision.resourceInputHash ||
      discoveryHash({ ...shared, scoutScope: boundedJson(revision.scoutScopeJson), resourceScope: frozen }) !==
        revision.scopeHash
    )
      return refuse('RESOURCE_RESOLUTION_FROZEN_HASH_MISMATCH')
    const byId = new Map(frozen.resources.map(resource => [resource.id, resource]))
    if (byId.size !== frozen.resources.length) return refuse('RESOURCE_RESOLUTION_FROZEN_DUPLICATE')
    keys = [{ kind: 'MODULE', resourceId: bundle.destinationModuleId }]
    for (const entry of bundle.reusable) {
      const resource = byId.get(entry.resourceId)
      if (!resource || resource.kind !== entry.resourceKind) return refuse('RESOURCE_RESOLUTION_NOT_FROZEN')
      if (entry.resourceKind === 'OPERATION' || entry.resourceKind === 'STEP_DEFINITION') {
        // Their preexisting immutable operation/definition authority remains a
        // separate caller obligation; they cannot masquerade as five-kind proof.
        const prefix = entry.resourceKind === 'OPERATION' ? 'operation:' : 'step:'
        if (!entry.resourceId.startsWith(prefix)) return refuse('RESOURCE_RESOLUTION_IMMUTABLE_KIND_MISMATCH')
        continue
      }
      if (entry.resourceKind !== 'MODULE' && entry.resourceKind !== 'LOCATOR')
        return refuse('RESOURCE_RESOLUTION_MUTABLE_KIND_UNSUPPORTED')
      const prefix = entry.resourceKind === 'MODULE' ? 'module:' : 'locator:'
      if (!entry.resourceId.startsWith(prefix) || resource.sourceTargetProjectId !== scope.targetProjectId)
        return refuse('RESOURCE_RESOLUTION_MUTABLE_SCOPE')
      keys.push({ kind: entry.resourceKind, resourceId: entry.resourceId.slice(prefix.length) })
    }
    if (
      !bundle.reusable.some(
        entry => entry.resourceKind === 'MODULE' && entry.resourceId === `module:${bundle.destinationModuleId}`,
      )
    )
      return refuse('RESOURCE_RESOLUTION_DESTINATION_NOT_COMPATIBLE')
    sourceHash = revision.resourceResolutionHash!
  } else return refuse('SOURCE_KIND_UNSUPPORTED')
  const sourceDigest = sharedSourceDigest({
    sourceKind: source.sourceKind,
    sourceOwnerId: source.sourceOwnerId,
    sourceHash,
  })
  if (sourceDigest !== source.expectedSourceDigest) return refuse('SOURCE_DIGEST_STALE')
  return { sourceDigest, keys: uniqueSourceKeys(keys) }
}

function snapshotSourceRequest(
  request: Pick<SharedResourceUseRequest, 'scope' | 'source'>,
): Pick<SharedResourceUseRequest, 'scope' | 'source'> {
  const scope = request.scope
  const source = request.source
  if (
    !scope ||
    !source ||
    ![scope.journeyId, scope.targetProjectId, scope.coordinatorSessionId, source.sourceOwnerId].every(
      isSharedResourceId,
    ) ||
    !Number.isInteger(scope.generation) ||
    scope.generation < 1 ||
    scope.generation > 2_147_483_647 ||
    !sharedResourceSourceKinds.includes(source.sourceKind) ||
    !isSharedResourceDigest(source.expectedSourceDigest) ||
    !scope.credentials ||
    scope.credentials.journeyId !== scope.journeyId ||
    scope.credentials.targetProjectId !== scope.targetProjectId ||
    scope.credentials.coordinatorSessionId !== scope.coordinatorSessionId ||
    scope.credentials.coordinatorGeneration !== scope.generation
  )
    return refuse('REQUEST_SCOPE')
  return {
    scope: {
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      coordinatorSessionId: scope.coordinatorSessionId,
      generation: scope.generation,
      credentials: {
        journeyId: scope.credentials.journeyId,
        targetProjectId: scope.credentials.targetProjectId,
        coordinatorSessionId: scope.credentials.coordinatorSessionId,
        coordinatorGeneration: scope.credentials.coordinatorGeneration,
        coordinatorHandoffId: scope.credentials.coordinatorHandoffId,
        coordinatorPrincipalId: scope.credentials.coordinatorPrincipalId,
      },
    },
    source: {
      sourceKind: source.sourceKind,
      sourceOwnerId: source.sourceOwnerId,
      expectedSourceDigest: source.expectedSourceDigest,
    },
  }
}

function snapshotRequest(request: SharedResourceUseRequest): SharedResourceUseRequest {
  const expectedDependencyDigest = request.expectedDependencyDigest
  if (!isSharedResourceDigest(expectedDependencyDigest)) return refuse('REQUEST_SCOPE')
  return { ...snapshotSourceRequest(request), expectedDependencyDigest }
}

/** Read-only composition for the actual Discovery owner. The retained typed
 * source supplies all selected keys; caller hashes are only exact comparison
 * inputs. Acquisition/validation independently reconstructs this entire request.
 */
export async function resolveResourceResolutionUseRequestInTransaction(
  tx: Prisma.TransactionClient,
  input: Readonly<{ scope: E2BusinessScope; discoveryRevisionId: string; resourceResolutionHash: string }>,
): Promise<SharedResourceUseRequest> {
  if (!prefixedDigest.safeParse(input.resourceResolutionHash).success)
    return refuse('RESOURCE_RESOLUTION_NOT_CURRENT_ACCEPTED')
  const request = snapshotSourceRequest({
    scope: input.scope,
    source: {
      sourceKind: 'RESOURCE_RESOLUTION',
      sourceOwnerId: input.discoveryRevisionId,
      expectedSourceDigest: sharedSourceDigest({
        sourceKind: 'RESOURCE_RESOLUTION',
        sourceOwnerId: input.discoveryRevisionId,
        sourceHash: input.resourceResolutionHash,
      }),
    },
  })
  const source = await readTypedSource(tx, request)
  const descriptor = await resolveSharedResourceDescriptors(tx, request.scope.targetProjectId, source.keys)
  return snapshotRequest({ ...request, expectedDependencyDigest: descriptor.dependencyDigest })
}

/** Read-only composition for the exact newly retained Automator source. The
 * source itself supplies all resource keys; acquisition independently reconstructs
 * this normal inert request through the actual owning beforeWrite callback.
 */
export async function resolveAutomationMaterializationUseRequestInTransaction(
  tx: Prisma.TransactionClient,
  input: Readonly<{ scope: E2BusinessScope; materializationId: string; materializationHash: string }>,
): Promise<SharedResourceUseRequest> {
  if (!prefixedDigest.safeParse(input.materializationHash).success) return refuse('MATERIALIZATION_SOURCE_DIGEST_STALE')
  const request = snapshotSourceRequest({
    scope: input.scope,
    source: {
      sourceKind: 'AUTOMATION_MATERIALIZATION',
      sourceOwnerId: input.materializationId,
      expectedSourceDigest: sharedSourceDigest({
        sourceKind: 'AUTOMATION_MATERIALIZATION',
        sourceOwnerId: input.materializationId,
        sourceHash: input.materializationHash,
      }),
    },
  })
  const source = await readTypedSource(tx, request)
  const descriptor = await resolveSharedResourceDescriptors(tx, request.scope.targetProjectId, source.keys)
  return snapshotRequest({ ...request, expectedDependencyDigest: descriptor.dependencyDigest })
}

/** Exact newly inserted cycle source. Current credentials authenticate its new
 * Use; retained producer rows are only provenance. No future TestRun is required. */
export async function resolveExecutionCycleUseRequestInTransaction(
  tx: Prisma.TransactionClient,
  input: Readonly<{ scope: E2BusinessScope; executionCycleId: string; preparedCapsulesHash: string }>,
): Promise<SharedResourceUseRequest> {
  if (!prefixedDigest.safeParse(input.preparedCapsulesHash).success)
    return refuse('EXECUTION_SELECTION_CANONICAL_HASH_OR_SHAPE')
  if (
    [
      tx.qualityJourneyExecutionCycle?.findUnique,
      tx.qualityJourneyPreparedRuntimeCapsule?.findMany,
      tx.qualityJourneyAutomationMaterialization?.findUnique,
      tx.qualityJourneyAutomationMaterializationSourceProof?.findUnique,
      tx.qualityJourneyArtifact?.findUnique,
      tx.qualityJourneyAutomationMaterializationBinding?.findMany,
      tx.qualityJourneyAutomationTargetBinding?.findMany,
      tx.qualityJourneyWorkAttemptSessionBinding?.findUnique,
      tx.qualityJourneyWorkAttempt?.findUnique,
      tx.qualityJourneyWorkItem?.findUnique,
      tx.qualityJourneyWorkAuthorization?.findUnique,
      tx.qualityJourneyCoordinatorSession?.findUnique,
      tx.qualityJourneyCycle?.findUnique,
      tx.stepDefinition?.findMany,
    ].some(method => typeof method !== 'function')
  )
    return refuse('EXECUTION_SOURCE_CLIENT_UNSUPPORTED')
  const request = snapshotSourceRequest({
    scope: input.scope,
    source: {
      sourceKind: 'EXECUTION_CYCLE',
      sourceOwnerId: input.executionCycleId,
      expectedSourceDigest: sharedSourceDigest({
        sourceKind: 'EXECUTION_CYCLE',
        sourceOwnerId: input.executionCycleId,
        sourceHash: input.preparedCapsulesHash,
      }),
    },
  })
  const source = await readTypedSource(tx, request)
  const descriptor = await resolveSharedResourceDescriptors(tx, request.scope.targetProjectId, source.keys)
  return snapshotRequest({ ...request, expectedDependencyDigest: descriptor.dependencyDigest })
}

function identityFor(request: SharedResourceUseRequest, source: TypedSource): SharedResourceUseIdentity {
  return {
    journeyId: request.scope.journeyId,
    targetProjectId: request.scope.targetProjectId,
    coordinatorSessionId: request.scope.coordinatorSessionId,
    generation: request.scope.generation,
    sourceKind: request.source.sourceKind,
    sourceOwnerId: request.source.sourceOwnerId,
    sourceDigest: source.sourceDigest,
  }
}

async function readPlan(tx: Prisma.TransactionClient, request: SharedResourceUseRequest) {
  const source = await readTypedSource(tx, request)
  const descriptor = await resolveSharedResourceDescriptors(tx, request.scope.targetProjectId, source.keys)
  if (descriptor.dependencyDigest !== request.expectedDependencyDigest) refuse('DEPENDENCIES_STALE')
  return { source, plan: buildSharedResourceClaimPlan(identityFor(request, source), descriptor) }
}

async function assertSourceAndPlanUnchanged(
  tx: Prisma.TransactionClient,
  request: SharedResourceUseRequest,
  original: Awaited<ReturnType<typeof readPlan>>,
) {
  const reread = await readPlan(tx, request)
  if (
    canonicalSharedResourceJson(reread.source) !== canonicalSharedResourceJson(original.source) ||
    reread.plan.id !== original.plan.id ||
    reread.plan.sourceDigest !== original.plan.sourceDigest ||
    reread.plan.dependencyDigest !== original.plan.dependencyDigest ||
    reread.plan.claimSetCount !== original.plan.claimSetCount ||
    reread.plan.claimSetDigest !== original.plan.claimSetDigest
  )
    refuse('SOURCE_OR_DEPENDENCIES_CHANGED_BEFORE_PUBLICATION')
}

/** All five domains participate, including those whose current selected key set is empty. */
async function contendCoverage(tx: Prisma.TransactionClient, targetProjectId: string, advance: boolean) {
  for (const kind of [...sharedResourceKinds].sort()) {
    const row = await tx.qualityJourneySharedResourceCoverage.findUnique({
      where: { targetProjectId_kind_protocolVersion: { targetProjectId, kind, protocolVersion: 1 } },
    })
    if (
      !row ||
      row.targetProjectId !== targetProjectId ||
      row.kind !== kind ||
      row.protocolVersion !== 1 ||
      row.state !== 'COMPLETE' ||
      !validCounter(row.epoch) ||
      !validDate(row.createdAt) ||
      !validDate(row.completedAt) ||
      !isSharedResourceDigest(row.writerClosureDigest) ||
      !isSharedResourceDigest(row.readerClosureDigest) ||
      !isSharedResourceDigest(row.sourceUniverseDigest) ||
      !isSharedResourceDigest(row.reconciliationDigest) ||
      !['JOURNEY_FREE_V1', 'RECONCILED_V1'].includes(row.proofKind ?? '')
    )
      return refuse('DOMAIN_COVERAGE_INCOMPLETE_OR_CORRUPT')
    if (!advance) continue
    const changed = await tx.qualityJourneySharedResourceCoverage.updateMany({
      where: {
        targetProjectId,
        kind,
        protocolVersion: 1,
        epoch: row.epoch,
        state: 'COMPLETE',
        writerClosureDigest: row.writerClosureDigest,
        readerClosureDigest: row.readerClosureDigest,
        sourceUniverseDigest: row.sourceUniverseDigest,
        reconciliationDigest: row.reconciliationDigest,
        proofKind: row.proofKind,
        completedAt: row.completedAt,
      },
      data: { epoch: nextSharedResourceEpoch(row.epoch) },
    })
    if (changed.count !== 1) refuse('DOMAIN_COVERAGE_CAS_LOST')
  }
  const preparing = await tx.qualityJourneySharedResourceUse.findFirst({
    where: { targetProjectId, state: 'PREPARING' },
    select: { id: true },
  })
  if (preparing) refuse('TARGET_HAS_INCOMPLETE_PREPARING_USE')
}

async function contendGuards(tx: Prisma.TransactionClient, plan: SharedResourceClaimPlan, advance: boolean) {
  const epochs = new Map<string, number>()
  for (const claim of plan.claims) {
    const row = await tx.qualityJourneySharedResourceGuard.findUnique({
      where: {
        targetProjectId_kind_resourceId: {
          targetProjectId: plan.targetProjectId,
          kind: claim.kind,
          resourceId: claim.resourceId,
        },
      },
    })
    if (
      !row ||
      row.targetProjectId !== plan.targetProjectId ||
      row.kind !== claim.kind ||
      row.resourceId !== claim.resourceId ||
      !validCounter(row.epoch) ||
      !validDate(row.createdAt) ||
      row.coverageState !== 'COMPLETE_V1' ||
      !isSharedResourceDigest(row.coverageDigest) ||
      row.resourceState !== 'LIVE' ||
      row.deletedAt !== null
    )
      return refuse('RESOURCE_GUARD_INCOMPLETE_OR_CORRUPT')
    let epoch = row.epoch
    if (advance) {
      epoch = nextSharedResourceEpoch(row.epoch)
      const changed = await tx.qualityJourneySharedResourceGuard.updateMany({
        where: {
          targetProjectId: plan.targetProjectId,
          kind: claim.kind,
          resourceId: claim.resourceId,
          epoch: row.epoch,
          coverageState: 'COMPLETE_V1',
          coverageDigest: row.coverageDigest,
          resourceState: 'LIVE',
          deletedAt: null,
        },
        data: { epoch },
      })
      if (changed.count !== 1) refuse('RESOURCE_GUARD_CAS_LOST')
    }
    // Normal ACTIVE claims may share immutable resources across Journeys.
    // Partial/contradictory parent-or-claim release is never treated as absence.
    const inconsistent = await tx.qualityJourneySharedResourceClaim.findFirst({
      where: {
        targetProjectId: plan.targetProjectId,
        kind: claim.kind,
        resourceId: claim.resourceId,
        OR: [
          { state: { notIn: ['ACTIVE', 'RELEASED'] } },
          { state: 'ACTIVE', use: { isNot: { state: 'ACTIVE' } } },
          { state: 'RELEASED', use: { isNot: { state: 'RELEASED' } } },
        ],
      },
      select: { id: true },
    })
    if (inconsistent) refuse('RESOURCE_HAS_INCONSISTENT_PARENT_OR_CLAIM')
    epochs.set(claim.id, epoch)
  }
  return epochs
}

async function readClaims(tx: Prisma.TransactionClient, plan: SharedResourceClaimPlan) {
  return tx.qualityJourneySharedResourceClaim.findMany({
    where: { useId: plan.id },
    orderBy: [{ kind: 'asc' }, { resourceId: 'asc' }],
    take: sharedResourceBounds.keys + 1,
  })
}

function receipt(plan: SharedResourceClaimPlan, status: SharedResourceUseReceipt['status']): SharedResourceUseReceipt {
  return Object.freeze({
    status,
    useId: plan.id,
    sourceDigest: plan.sourceDigest,
    dependencyDigest: plan.dependencyDigest,
    claimSetDigest: plan.claimSetDigest,
    claimSetCount: plan.claimSetCount,
  })
}

/** Read-only integrity predicate. Authentication remains with each public caller. */
async function assertRetainedActivePlan(
  tx: Prisma.TransactionClient,
  plan: SharedResourceClaimPlan,
  use: QualityJourneySharedResourceUse | null,
): Promise<void> {
  await contendCoverage(tx, plan.targetProjectId, false)
  const epochs = await contendGuards(tx, plan, false)
  const claims = await readClaims(tx, plan)
  assertExactActiveSharedResourceUse(plan, use, claims)
  if (claims.some(claim => claim.claimEpoch > (epochs.get(claim.id) ?? -1))) refuse('CLAIM_EPOCH_EXCEEDS_GUARD')
}

// This reader observes retained lineage. It never constructs caller credentials,
// invokes current-session authentication, admits business writes or returns a Use capability.
const validRetainedGeneration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647

async function retainedExecutionProducerKind(
  tx: Prisma.TransactionClient,
  materializationId: string,
  scope: { journeyId: string; targetProjectId: string },
): Promise<'LEGACY' | 'E2'> {
  const materialization = await tx.qualityJourneyAutomationMaterialization.findUnique({
    where: { id: materializationId },
  })
  if (
    !materialization ||
    materialization.id !== materializationId ||
    materialization.journeyId !== scope.journeyId ||
    materialization.targetProjectId !== scope.targetProjectId ||
    ![
      materialization.id,
      materialization.journeyId,
      materialization.targetProjectId,
      materialization.cycleId,
      materialization.workItemId,
      materialization.attemptId,
      materialization.leaseId,
    ].every(isSharedResourceId) ||
    !prefixedDigest.safeParse(materialization.inputHash).success
  )
    return refuse('RETAINED_EXECUTION_PRODUCER_SCOPE')
  const [attempt, work, binding] = await Promise.all([
    tx.qualityJourneyWorkAttempt.findUnique({ where: { id: materialization.attemptId } }),
    tx.qualityJourneyWorkItem.findUnique({ where: { id: materialization.workItemId } }),
    tx.qualityJourneyWorkAttemptSessionBinding.findUnique({ where: { attemptId: materialization.attemptId } }),
  ])
  if (
    !attempt ||
    !work ||
    !binding ||
    !isSharedResourceId(attempt.authorizationId) ||
    !validRetainedGeneration(attempt.assignmentGeneration) ||
    !(attempt.assignmentId === null || isSharedResourceId(attempt.assignmentId)) ||
    attempt.id !== materialization.attemptId ||
    attempt.workItemId !== materialization.workItemId ||
    attempt.leaseId !== materialization.leaseId ||
    work.id !== materialization.workItemId ||
    work.journeyId !== scope.journeyId ||
    work.targetProjectId !== scope.targetProjectId ||
    work.cycleId !== materialization.cycleId ||
    work.role !== 'AUTOMATOR' ||
    work.inputHash !== materialization.inputHash ||
    binding.attemptId !== attempt.id ||
    binding.workItemId !== work.id ||
    binding.journeyId !== scope.journeyId ||
    binding.targetProjectId !== scope.targetProjectId ||
    binding.role !== 'AUTOMATOR' ||
    binding.authorizationId !== attempt.authorizationId ||
    binding.leaseId !== attempt.leaseId ||
    binding.assignmentId !== attempt.assignmentId ||
    binding.assignmentGeneration !== attempt.assignmentGeneration ||
    binding.inputHash !== materialization.inputHash
  )
    return refuse('RETAINED_EXECUTION_PRODUCER_LINEAGE')
  const authorization = await tx.qualityJourneyWorkAuthorization.findUnique({ where: { id: attempt.authorizationId! } })
  if (
    !authorization ||
    authorization.id !== attempt.authorizationId ||
    authorization.workItemId !== work.id ||
    authorization.journeyId !== scope.journeyId ||
    authorization.targetProjectId !== scope.targetProjectId ||
    authorization.role !== 'AUTOMATOR'
  )
    return refuse('RETAINED_EXECUTION_PRODUCER_AUTHORIZATION')
  if (binding.sessionId === null && binding.coordinatorGeneration === null) {
    if (binding.provenance === 'CLAIM_EXPLICIT_LEGACY_NO_SESSION_V1') return 'LEGACY'
    return refuse('RETAINED_EXECUTION_PRODUCER_ENROLLMENT_UNKNOWN')
  }
  if (
    !isSharedResourceId(binding.sessionId) ||
    !validRetainedGeneration(binding.coordinatorGeneration) ||
    binding.provenance !== 'CLAIM_SESSION_V1'
  )
    return refuse('RETAINED_EXECUTION_PRODUCER_ENROLLMENT_UNKNOWN')
  const session = await tx.qualityJourneyCoordinatorSession.findUnique({
    where: { id: binding.sessionId! },
    select: {
      id: true,
      journeyId: true,
      targetProjectId: true,
      generation: true,
      e2EnrollmentKind: true,
      e2EnrollmentDigest: true,
      e2EnrolledAt: true,
    },
  })
  if (
    !session ||
    session.id !== binding.sessionId ||
    session.journeyId !== scope.journeyId ||
    session.targetProjectId !== scope.targetProjectId ||
    session.generation !== binding.coordinatorGeneration
  )
    return refuse('RETAINED_EXECUTION_PRODUCER_SESSION')
  if ([session.e2EnrollmentKind, session.e2EnrollmentDigest, session.e2EnrolledAt].every(value => value === null)) {
    if (
      await tx.qualityJourneyE2Retirement.findFirst({
        where: { coordinatorSessionId: session.id },
        select: { id: true },
      })
    )
      return refuse('RETAINED_EXECUTION_PRODUCER_ORPHAN_RETIREMENT')
    return 'LEGACY'
  }
  if (
    session.e2EnrollmentKind !== 'E2_V1' ||
    !isSharedResourceDigest(session.e2EnrollmentDigest) ||
    !validDate(session.e2EnrolledAt)
  )
    return refuse('RETAINED_EXECUTION_PRODUCER_ENROLLMENT_UNKNOWN')
  return 'E2'
}

async function readRetainedExecutionRun(tx: Prisma.TransactionClient, testRunId: string) {
  const [run, bindings] = await Promise.all([
    tx.testRun.findUnique({
      where: { id: testRunId },
      select: {
        id: true,
        intent: true,
        runId: true,
        targetProjectId: true,
        environmentId: true,
        browserEngine: true,
        environmentSnapshotJson: true,
        environmentSnapshotHash: true,
        environmentSnapshotVersion: true,
        testCases: { select: { id: true, testCaseId: true, testSuiteId: true }, orderBy: { id: 'asc' } },
      },
    }),
    tx.qualityJourneyExecutionTestRun.findMany({ where: { testRunId }, take: 2 }),
  ])
  if (!run || run.id !== testRunId || run.intent !== 'QUALITY_JOURNEY' || bindings.length !== 1)
    return refuse('RETAINED_EXECUTION_RUN_JOIN')
  const binding = bindings[0]!
  const cycle = await tx.qualityJourneyExecutionCycle.findUnique({ where: { id: binding.executionCycleId } })
  if (
    !cycle ||
    binding.testRunId !== run.id ||
    binding.runId !== run.runId ||
    binding.executionCycleId !== cycle.id ||
    run.targetProjectId !== cycle.targetProjectId ||
    run.environmentId !== cycle.environmentId ||
    run.browserEngine !== cycle.browserEngine ||
    run.environmentSnapshotJson !== cycle.environmentSnapshotJson ||
    run.environmentSnapshotHash !== cycle.environmentSnapshotHash ||
    run.environmentSnapshotVersion !== cycle.environmentSnapshotVersion
  )
    return refuse('RETAINED_EXECUTION_RUN_SCOPE_OR_ENVIRONMENT')
  const environment = boundedJson(cycle.environmentSnapshotJson)
  if (
    !environment ||
    typeof environment !== 'object' ||
    Array.isArray(environment) ||
    canonicalContractJson(environment) !== cycle.environmentSnapshotJson ||
    hashQualityJourneyExecutionValue(environment) !== cycle.environmentSnapshotHash ||
    !('id' in environment) ||
    environment.id !== cycle.environmentId ||
    !('targetProjectId' in environment) ||
    environment.targetProjectId !== cycle.targetProjectId ||
    !('scopeVersion' in environment) ||
    environment.scopeVersion !== cycle.environmentSnapshotVersion
  )
    return refuse('RETAINED_EXECUTION_ENVIRONMENT_PACKET')
  const [journey, target] = await Promise.all([
    tx.qualityJourney.findFirst({ where: { id: cycle.journeyId, targetProjectId: cycle.targetProjectId } }),
    tx.targetProject.findUnique({ where: { id: cycle.targetProjectId }, select: { id: true } }),
  ])
  if (
    !journey ||
    journey.id !== cycle.journeyId ||
    journey.targetProjectId !== cycle.targetProjectId ||
    !target ||
    target.id !== cycle.targetProjectId
  )
    return refuse('RETAINED_EXECUTION_JOURNEY_TARGET')
  const parsed = retainedExecutionSelectionSchema.safeParse(boundedJson(cycle.preparedCapsulesJson))
  if (
    !parsed.success ||
    canonicalContractJson(parsed.data) !== cycle.preparedCapsulesJson ||
    hashQualityJourneyExecutionValue(parsed.data) !== cycle.preparedCapsulesHash ||
    canonicalContractJson([...parsed.data].sort((a, b) => a.preparedCapsuleId.localeCompare(b.preparedCapsuleId))) !==
      cycle.preparedCapsulesJson ||
    new Set(parsed.data.map(item => item.preparedCapsuleId)).size !== parsed.data.length ||
    new Set(parsed.data.map(item => item.materializationId)).size !== parsed.data.length
  )
    return refuse('RETAINED_EXECUTION_SELECTION')
  const selected = parsed.data.filter(item => item.preparedCapsuleId === binding.preparedCapsuleId)
  if (
    selected.length !== 1 ||
    run.testCases.length !== 1 ||
    run.testCases[0]!.testCaseId !== selected[0]!.testCaseId ||
    run.testCases[0]!.testSuiteId !== selected[0]!.suiteId
  )
    return refuse('RETAINED_EXECUTION_CASE_SUITE_IDENTITY')
  return { run, binding, cycle, journey, selection: parsed.data }
}

/** Inert copied scope only; every launch owner independently validates current authority. */
export type RetainedExecutionIdentity = Readonly<{
  intent: 'QUALITY_JOURNEY'
  journeyId: string
  targetProjectId: string
  executionCycleId: string
  executionJourneyCycleId: string
  executionBindingId: string
  preparedCapsuleId: string
  testRunDbId: string
  runId: string
  preparedCapsulesHash: string
  resourceUse:
    | Readonly<{ kind: 'LEGACY_UNPROTECTED' }>
    | Readonly<{
        kind: 'E2_RETAINED_USE'
        useId: string
        coordinatorSessionId: string
        generation: number
        sourceKind: 'EXECUTION_CYCLE'
        sourceOwnerId: string
        sourceDigest: string
        dependencyDigest: string
        claimSetDigest: string
        claimSetCount: number
      }>
}>

function retainedExecutionIdentity(
  source: Awaited<ReturnType<typeof readRetainedExecutionRun>>,
  resourceUse: RetainedExecutionIdentity['resourceUse'],
): RetainedExecutionIdentity {
  return Object.freeze({
    intent: 'QUALITY_JOURNEY',
    journeyId: source.cycle.journeyId,
    targetProjectId: source.cycle.targetProjectId,
    executionCycleId: source.cycle.id,
    executionJourneyCycleId: source.cycle.cycleId,
    executionBindingId: source.binding.id,
    preparedCapsuleId: source.binding.preparedCapsuleId,
    testRunDbId: source.run.id,
    runId: source.run.runId,
    preparedCapsulesHash: source.cycle.preparedCapsulesHash,
    resourceUse: Object.freeze({ ...resourceUse }),
  })
}

/** Internal integrity read rooted ONLY in the persisted TestRun DB ID.
 * The inert run-source hash only binds the loader's copied rows to this capture.
 * No authentication/admission or reusable plan/receipt is returned. */
export async function validateRetainedExecutionUseForTestRunInTransaction(
  tx: Prisma.TransactionClient,
  testRunId: string,
): Promise<
  Readonly<{
    protection: 'LEGACY' | 'PROTECTED_E2'
    runSourceHash: string
    executionIdentity: RetainedExecutionIdentity
  }>
> {
  if (!isSharedResourceId(testRunId)) return refuse('RETAINED_EXECUTION_RUN_ID')
  if (
    [
      tx.testRun?.findUnique,
      tx.qualityJourneyExecutionTestRun?.findMany,
      tx.targetProject?.findUnique,
      tx.qualityJourney?.findFirst,
      tx.qualityJourneyExecutionCycle?.findUnique,
      tx.qualityJourneyPreparedRuntimeCapsule?.findMany,
      tx.qualityJourneyAutomationMaterialization?.findUnique,
      tx.qualityJourneyAutomationMaterializationSourceProof?.findUnique,
      tx.qualityJourneyArtifact?.findUnique,
      tx.qualityJourneyAutomationMaterializationBinding?.findMany,
      tx.qualityJourneyAutomationTargetBinding?.findMany,
      tx.qualityJourneyWorkAttemptSessionBinding?.findUnique,
      tx.qualityJourneyWorkAttempt?.findUnique,
      tx.qualityJourneyWorkItem?.findUnique,
      tx.qualityJourneyWorkAuthorization?.findUnique,
      tx.qualityJourneyCoordinatorSession?.findUnique,
      tx.qualityJourneyCycle?.findUnique,
      tx.stepDefinition?.findMany,
      tx.qualityJourneyE2Retirement?.findFirst,
      tx.qualityJourneyE2Retirement?.findMany,
      tx.qualityJourneyE2CampaignPolicy?.findUnique,
      tx.qualityJourneySharedResourceUse?.findMany,
      tx.qualityJourneySharedResourceUse?.findFirst,
      tx.qualityJourneySharedResourceClaim?.findMany,
      tx.qualityJourneySharedResourceClaim?.findFirst,
      tx.qualityJourneySharedResourceCoverage?.findUnique,
      tx.qualityJourneySharedResourceGuard?.findUnique,
      tx.locator?.findUnique,
      tx.locatorGroup?.findUnique,
      tx.module?.findUnique,
      tx.tag?.findMany,
      tx.testCase?.findMany,
      tx.testCase?.findUnique,
      tx.testCaseFlowBlock?.findMany,
      tx.testCaseFlowBlockNode?.findMany,
      tx.testCaseStep?.findMany,
      tx.testCaseStepParameter?.findMany,
      tx.testSuite?.findUnique,
    ].some(method => typeof method !== 'function')
  )
    return refuse('RETAINED_EXECUTION_CLIENT_UNSUPPORTED')
  const original = await readRetainedExecutionRun(tx, testRunId)
  const { cycle, journey } = original
  const runSourceHash = hashQualityJourneyExecutionValue({ run: original.run, binding: original.binding, cycle })
  const scope = { journeyId: cycle.journeyId, targetProjectId: cycle.targetProjectId }
  const sourceDigest = sharedSourceDigest({
    sourceKind: 'EXECUTION_CYCLE',
    sourceOwnerId: cycle.id,
    sourceHash: cycle.preparedCapsulesHash,
  })
  const id = sharedUseId({ ...scope, sourceKind: 'EXECUTION_CYCLE', sourceOwnerId: cycle.id, sourceDigest })
  const uses = await tx.qualityJourneySharedResourceUse.findMany({
    where: { OR: [{ id }, { sourceKind: 'EXECUTION_CYCLE', sourceOwnerId: cycle.id }] },
    take: 2,
  })
  const producerKinds = await Promise.all(
    original.selection.map(item => retainedExecutionProducerKind(tx, item.materializationId, scope)),
  )
  const currentKind = await readJourneyBusinessEnrollmentKindInTransaction(tx, scope)
  const sourceUse = await tx.qualityJourneySharedResourceUse.findFirst({
    where: {
      sourceKind: 'AUTOMATION_MATERIALIZATION',
      sourceOwnerId: { in: original.selection.map(item => item.materializationId) },
    },
    select: { id: true },
  })
  const retirement = await tx.qualityJourneyE2Retirement.findFirst({
    where: { journeyId: cycle.journeyId },
    select: { id: true },
  })
  if (
    uses.length === 0 &&
    !sourceUse &&
    !retirement &&
    currentKind === 'LEGACY' &&
    producerKinds.every(kind => kind === 'LEGACY')
  ) {
    const reread = await readRetainedExecutionRun(tx, testRunId)
    if (canonicalContractJson(reread) !== canonicalContractJson(original))
      return refuse('RETAINED_EXECUTION_RUN_CHANGED')
    return Object.freeze({
      protection: 'LEGACY',
      runSourceHash,
      executionIdentity: retainedExecutionIdentity(original, { kind: 'LEGACY_UNPROTECTED' }),
    })
  }
  if (uses.length !== 1) return refuse('RETAINED_EXECUTION_USE_MISSING_OR_DUPLICATE')
  const use = uses[0]!
  if (use.coordinatorSessionId === null) return refuse('RETAINED_EXECUTION_CURRENT_LINEAGE')
  const session = await tx.qualityJourneyCoordinatorSession.findUnique({
    where: { id: use.coordinatorSessionId },
    select: {
      id: true,
      journeyId: true,
      targetProjectId: true,
      generation: true,
      status: true,
      hostKind: true,
      fencedAt: true,
      e2EnrollmentKind: true,
      e2EnrollmentDigest: true,
      e2EnrolledAt: true,
    },
  })
  if (
    !session ||
    session.id !== use.coordinatorSessionId ||
    session.journeyId !== cycle.journeyId ||
    session.targetProjectId !== cycle.targetProjectId ||
    session.generation !== use.generation ||
    !validRetainedGeneration(use.generation) ||
    session.status !== 'ACTIVE' ||
    session.fencedAt !== null ||
    session.hostKind !== journey.hostingMode ||
    journey.status !== 'ACTIVE' ||
    !['EXTERNAL_LEGACY', 'APP_SERVER_LOCAL_V1'].includes(journey.hostingMode) ||
    journey.currentCoordinatorSessionId !== session.id ||
    journey.activeCycleId !== cycle.cycleId ||
    session.e2EnrollmentKind !== 'E2_V1' ||
    !isSharedResourceDigest(session.e2EnrollmentDigest) ||
    !validDate(session.e2EnrolledAt)
  )
    return refuse('RETAINED_EXECUTION_CURRENT_LINEAGE')
  const retirements = await tx.qualityJourneyE2Retirement.findMany({
    where: { coordinatorSessionId: session.id },
    take: 2,
  })
  const active = retirements[0]
  if (
    retirements.length !== 1 ||
    !active ||
    active.journeyId !== cycle.journeyId ||
    active.targetProjectId !== cycle.targetProjectId ||
    active.coordinatorSessionId !== session.id ||
    active.generation !== use.generation ||
    active.state !== 'ACTIVE' ||
    !isSharedResourceId(active.id) ||
    !validCounter(active.version) ||
    !isSharedResourceId(active.campaignPolicyId) ||
    active.requestId !== null ||
    active.requestedAt !== null ||
    active.requestReason !== null ||
    active.effectiveAt !== null ||
    active.effectiveEvidenceDigest !== null
  )
    return refuse('RETAINED_EXECUTION_RETIRED')
  const policy = validateE2CampaignPolicyRow(
    await tx.qualityJourneyE2CampaignPolicy.findUnique({ where: { id: active.campaignPolicyId! } }),
  )
  if (
    policy.id !== active.campaignPolicyId ||
    policy.journeyId !== cycle.journeyId ||
    policy.targetProjectId !== cycle.targetProjectId ||
    policy.sourceTupleDigest !== session.e2EnrollmentDigest
  )
    return refuse('RETAINED_EXECUTION_ENROLLMENT_POLICY')
  const provenance: MaterializationProvenance = {
    ...scope,
    coordinatorSessionId: session.id,
    generation: use.generation,
  }
  const request: MaterializationSourceRequest = {
    scope: provenance,
    source: { sourceKind: 'EXECUTION_CYCLE', sourceOwnerId: cycle.id, expectedSourceDigest: sourceDigest },
  }
  const read = async () => {
    const source = await readExecutionSource(tx, request)
    const descriptor = await resolveSharedResourceDescriptors(tx, cycle.targetProjectId, source.keys)
    const plan = buildSharedResourceClaimPlan(
      { ...provenance, sourceKind: 'EXECUTION_CYCLE', sourceOwnerId: cycle.id, sourceDigest: source.sourceDigest },
      descriptor,
    )
    const rows = await tx.qualityJourneySharedResourceUse.findMany({
      where: { OR: [{ id: plan.id }, { sourceKind: 'EXECUTION_CYCLE', sourceOwnerId: cycle.id }] },
      take: 2,
    })
    if (rows.length !== 1) return refuse('RETAINED_EXECUTION_USE_MISSING_OR_DUPLICATE')
    await assertRetainedActivePlan(tx, plan, rows[0]!)
    return { source, plan, use: rows[0], claims: await readClaims(tx, plan) }
  }
  const first = await read()
  const second = await read()
  const reread = await readRetainedExecutionRun(tx, testRunId)
  if (
    canonicalContractJson(second) !== canonicalContractJson(first) ||
    canonicalContractJson(reread) !== canonicalContractJson(original)
  )
    return refuse('RETAINED_EXECUTION_SOURCE_OR_PLAN_CHANGED')
  // Reobserve current lineage/retirement after the source/claim reread. No CAS.
  const [lastSession, lastJourney, lastRetirement] = await Promise.all([
    tx.qualityJourneyCoordinatorSession.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        journeyId: true,
        targetProjectId: true,
        generation: true,
        status: true,
        hostKind: true,
        fencedAt: true,
        e2EnrollmentKind: true,
        e2EnrollmentDigest: true,
        e2EnrolledAt: true,
      },
    }),
    tx.qualityJourney.findFirst({ where: { id: cycle.journeyId, targetProjectId: cycle.targetProjectId } }),
    tx.qualityJourneyE2Retirement.findMany({ where: { coordinatorSessionId: session.id }, take: 2 }),
  ])
  if (
    canonicalContractJson(lastSession) !== canonicalContractJson(session) ||
    canonicalContractJson(lastJourney) !== canonicalContractJson(journey) ||
    canonicalContractJson(lastRetirement) !== canonicalContractJson(retirements)
  )
    return refuse('RETAINED_EXECUTION_LINEAGE_CHANGED')
  return Object.freeze({
    protection: 'PROTECTED_E2',
    runSourceHash,
    executionIdentity: retainedExecutionIdentity(original, {
      kind: 'E2_RETAINED_USE',
      useId: first.plan.id,
      coordinatorSessionId: first.plan.coordinatorSessionId,
      generation: first.plan.generation,
      sourceKind: 'EXECUTION_CYCLE',
      sourceOwnerId: cycle.id,
      sourceDigest: first.plan.sourceDigest,
      dependencyDigest: first.plan.dependencyDigest,
      claimSetDigest: first.plan.claimSetDigest,
      claimSetCount: first.plan.claimSetCount,
    }),
  })
}

async function validateExisting(
  tx: Prisma.TransactionClient,
  request: SharedResourceUseRequest,
  original: Awaited<ReturnType<typeof readPlan>>,
  use: QualityJourneySharedResourceUse | null,
) {
  await assertCurrentCoordinatorSession(request.scope.credentials, tx)
  await assertRetainedActivePlan(tx, original.plan, use)
  await assertSourceAndPlanUnchanged(tx, request, original)
  return receipt(original.plan, 'READ_ONLY_ACTIVE_RECEIPT')
}

type MaterializationOwnerRow = Prisma.QualityJourneyAutomationMaterializationGetPayload<{
  select: typeof materializationOwnerSelect
}>
type MaterializationOwnerBinding = Prisma.QualityJourneyAutomationTargetBindingGetPayload<{
  select: typeof materializationOwnerBindingSelect
}>
type MaterializationOwnerAssociation = Prisma.QualityJourneyAutomationMaterializationBindingGetPayload<{
  select: typeof materializationOwnerAssociationSelect
}>

function addOwnerCensusRows<T>(rows: Map<string, T>, found: readonly T[], key: (row: T) => string): void {
  if (!Array.isArray(found) || found.length > sharedResourceBounds.keys) refuse('AUTOMATION_OWNER_CENSUS_OVERFLOW')
  const batch = new Set<string>()
  for (const row of found) {
    const id = key(row)
    if (batch.has(id)) refuse('AUTOMATION_OWNER_CENSUS_DUPLICATE')
    batch.add(id)
    if (rows.has(id) && canonicalContractJson(rows.get(id)) !== canonicalContractJson(row))
      refuse('AUTOMATION_OWNER_CENSUS_CHANGED')
    rows.set(id, row)
  }
  if (rows.size > sharedResourceBounds.keys) refuse('AUTOMATION_OWNER_CENSUS_OVERFLOW')
}

/** Concrete Suite/Case closure only; no target/status/Journey filter may hide an alias. */
async function readAutomationOwnerCensus(
  tx: Prisma.TransactionClient,
  targetProjectId: string,
  targetBindingId: string,
) {
  const seed = await tx.qualityJourneyAutomationTargetBinding.findUnique({
    where: { id: targetBindingId },
    select: materializationOwnerBindingSelect,
  })
  if (!seed || seed.id !== targetBindingId) return refuse('AUTOMATION_OWNER_BINDING_MISSING')
  const suites = new Set<string>()
  const cases = new Set<string>()
  const bindings = new Map<string, MaterializationOwnerBinding>()
  const materializations = new Map<string, MaterializationOwnerRow>()
  const associations = new Map<string, MaterializationOwnerAssociation>()
  const addRoots = (row: { targetProjectId: string; suiteId: string | null; testCaseId: string | null }) => {
    if (
      row.targetProjectId !== targetProjectId ||
      !isSharedResourceId(row.suiteId) ||
      !isSharedResourceId(row.testCaseId)
    )
      return refuse('AUTOMATION_OWNER_ROOT_FOREIGN_OR_MALFORMED')
    suites.add(row.suiteId)
    cases.add(row.testCaseId)
    if (suites.size + cases.size > sharedResourceBounds.keys) refuse('AUTOMATION_OWNER_CENSUS_OVERFLOW')
  }
  addRoots(seed)
  bindings.set(seed.id, seed)
  for (let iteration = 0; iteration < sharedResourceBounds.keys; iteration++) {
    const before = suites.size + cases.size + bindings.size + materializations.size + associations.size
    const suiteIds = [...suites].sort()
    const caseIds = [...cases].sort()
    const rootWhere = { OR: [{ suiteId: { in: suiteIds } }, { testCaseId: { in: caseIds } }] }
    const [rootBindings, rootMaterializations] = await Promise.all([
      tx.qualityJourneyAutomationTargetBinding.findMany({
        where: rootWhere,
        select: materializationOwnerBindingSelect,
        orderBy: { id: 'asc' },
        take: sharedResourceBounds.keys + 1,
      }),
      tx.qualityJourneyAutomationMaterialization.findMany({
        where: rootWhere,
        select: materializationOwnerSelect,
        orderBy: { id: 'asc' },
        take: sharedResourceBounds.keys + 1,
      }),
    ])
    if (
      rootBindings.some(row => !suiteIds.includes(row.suiteId) && !caseIds.includes(row.testCaseId)) ||
      rootMaterializations.some(row => !suiteIds.includes(row.suiteId ?? '') && !caseIds.includes(row.testCaseId ?? ''))
    )
      return refuse('AUTOMATION_OWNER_CENSUS_UNREQUESTED_ROOT')
    addOwnerCensusRows(bindings, rootBindings, row => row.id)
    addOwnerCensusRows(materializations, rootMaterializations, row => row.id)
    const bindingIds = [...bindings.keys()].sort()
    const materializationIds = [...materializations.keys()].sort()
    const [byBinding, byMaterialization] = await Promise.all([
      tx.qualityJourneyAutomationMaterializationBinding.findMany({
        where: { bindingId: { in: bindingIds } },
        select: materializationOwnerAssociationSelect,
        orderBy: [{ materializationId: 'asc' }, { bindingId: 'asc' }],
        take: sharedResourceBounds.keys + 1,
      }),
      tx.qualityJourneyAutomationMaterializationBinding.findMany({
        where: { materializationId: { in: materializationIds } },
        select: materializationOwnerAssociationSelect,
        orderBy: [{ materializationId: 'asc' }, { bindingId: 'asc' }],
        take: sharedResourceBounds.keys + 1,
      }),
    ])
    if (
      byBinding.some(row => !bindingIds.includes(row.bindingId)) ||
      byMaterialization.some(row => !materializationIds.includes(row.materializationId))
    )
      return refuse('AUTOMATION_OWNER_CENSUS_UNREQUESTED_ASSOCIATION')
    const associationKey = (row: MaterializationOwnerAssociation) => {
      if (!isSharedResourceId(row.materializationId) || !isSharedResourceId(row.bindingId))
        return refuse('AUTOMATION_OWNER_ASSOCIATION_MALFORMED')
      return `${row.materializationId}\n${row.bindingId}`
    }
    addOwnerCensusRows(associations, byBinding, associationKey)
    addOwnerCensusRows(associations, byMaterialization, associationKey)
    const endpointBindingIds = [...new Set([...associations.values()].map(row => row.bindingId))].sort()
    const endpointMaterializationIds = [...new Set([...associations.values()].map(row => row.materializationId))].sort()
    const [endpointBindings, endpointMaterializations] = await Promise.all([
      tx.qualityJourneyAutomationTargetBinding.findMany({
        where: { id: { in: endpointBindingIds } },
        select: materializationOwnerBindingSelect,
        orderBy: { id: 'asc' },
        take: sharedResourceBounds.keys + 1,
      }),
      tx.qualityJourneyAutomationMaterialization.findMany({
        where: { id: { in: endpointMaterializationIds } },
        select: materializationOwnerSelect,
        orderBy: { id: 'asc' },
        take: sharedResourceBounds.keys + 1,
      }),
    ])
    if (
      endpointBindings.length !== endpointBindingIds.length ||
      endpointMaterializations.length !== endpointMaterializationIds.length ||
      endpointBindings.some(row => !endpointBindingIds.includes(row.id)) ||
      endpointMaterializations.some(row => !endpointMaterializationIds.includes(row.id))
    )
      return refuse('AUTOMATION_OWNER_ENDPOINT_SET_INCOMPLETE')
    addOwnerCensusRows(bindings, endpointBindings, row => row.id)
    addOwnerCensusRows(materializations, endpointMaterializations, row => row.id)
    for (const row of bindings.values()) {
      if (!isSharedResourceId(row.id)) return refuse('AUTOMATION_OWNER_BINDING_MALFORMED')
      addRoots(row)
    }
    for (const row of materializations.values()) {
      if (!isSharedResourceId(row.id)) return refuse('AUTOMATION_OWNER_MATERIALIZATION_MALFORMED')
      addRoots(row)
    }
    const ownerCounts = new Map<string, number>()
    const ownedBindings = new Set<string>()
    for (const edge of associations.values()) {
      const binding = bindings.get(edge.bindingId)
      const owner = materializations.get(edge.materializationId)
      if (!binding || !owner || binding.suiteId !== owner.suiteId || binding.testCaseId !== owner.testCaseId)
        return refuse('AUTOMATION_OWNER_ASSOCIATION_ROOT_MISMATCH')
      ownerCounts.set(owner.id, (ownerCounts.get(owner.id) ?? 0) + 1)
      ownedBindings.add(binding.id)
    }
    if (
      [...bindings.keys()].some(id => !ownedBindings.has(id)) ||
      [...materializations.keys()].some(id => ownerCounts.get(id) !== 1)
    )
      return refuse('AUTOMATION_OWNER_ORPHAN_OR_UNSUPPORTED_ASSOCIATIONS')
    const after = suites.size + cases.size + bindings.size + materializations.size + associations.size
    if (after === before) return { suites, cases, bindings, materializations, associations }
    if (after < before) return refuse('AUTOMATION_OWNER_CENSUS_NONMONOTONE')
  }
  return refuse('AUTOMATION_OWNER_CENSUS_ITERATION_OVERFLOW')
}

function assertAutomationOwnerCensusUnchanged(
  original: Awaited<ReturnType<typeof readAutomationOwnerCensus>>,
  current: Awaited<ReturnType<typeof readAutomationOwnerCensus>>,
): void {
  if (
    canonicalContractJson([...original.suites].sort()) !== canonicalContractJson([...current.suites].sort()) ||
    canonicalContractJson([...original.cases].sort()) !== canonicalContractJson([...current.cases].sort())
  )
    refuse('AUTOMATION_OWNER_CENSUS_CHANGED')
  const sameRows = <T>(left: Map<string, T>, right: Map<string, T>) =>
    left.size === right.size &&
    [...left].every(([id, row]) => right.has(id) && canonicalContractJson(row) === canonicalContractJson(right.get(id)))
  if (
    !sameRows(original.bindings, current.bindings) ||
    !sameRows(original.materializations, current.materializations) ||
    !sameRows(original.associations, current.associations)
  )
    refuse('AUTOMATION_OWNER_CENSUS_CHANGED')
}

async function readRetainedAutomationOwnerPlan(
  tx: Prisma.TransactionClient,
  row: MaterializationOwnerRow,
  targetProjectId: string,
) {
  const binding = await tx.qualityJourneyWorkAttemptSessionBinding.findUnique({ where: { attemptId: row.attemptId } })
  if (
    !binding ||
    binding.journeyId !== row.journeyId ||
    binding.targetProjectId !== targetProjectId ||
    !isSharedResourceId(binding.sessionId) ||
    typeof binding.coordinatorGeneration !== 'number' ||
    !Number.isInteger(binding.coordinatorGeneration) ||
    binding.coordinatorGeneration < 1 ||
    binding.coordinatorGeneration > 2_147_483_647 ||
    !prefixedDigest.safeParse(row.materializationHash).success
  )
    return refuse('AUTOMATION_OWNER_RETAINED_PROVENANCE_MISSING')
  const scope: MaterializationProvenance = {
    journeyId: row.journeyId,
    targetProjectId,
    coordinatorSessionId: binding.sessionId,
    generation: binding.coordinatorGeneration,
  }
  const source = await readMaterializationSource(tx, {
    scope,
    source: {
      sourceKind: 'AUTOMATION_MATERIALIZATION',
      sourceOwnerId: row.id,
      expectedSourceDigest: sharedSourceDigest({
        sourceKind: 'AUTOMATION_MATERIALIZATION',
        sourceOwnerId: row.id,
        sourceHash: row.materializationHash,
      }),
    },
  })
  if (canonicalContractJson(source.materialization) !== canonicalContractJson(row))
    return refuse('AUTOMATION_OWNER_SOURCE_CHANGED')
  const descriptor = await resolveSharedResourceDescriptors(tx, targetProjectId, source.keys)
  const plan = buildSharedResourceClaimPlan(
    { ...scope, sourceKind: 'AUTOMATION_MATERIALIZATION', sourceOwnerId: row.id, sourceDigest: source.sourceDigest },
    descriptor,
  )
  const uses = await tx.qualityJourneySharedResourceUse.findMany({
    where: {
      OR: [
        { id: plan.id },
        {
          journeyId: plan.journeyId,
          targetProjectId,
          sourceKind: plan.sourceKind,
          sourceOwnerId: plan.sourceOwnerId,
          sourceDigest: plan.sourceDigest,
        },
      ],
    },
    take: 2,
  })
  if (uses.length !== 1) return refuse('AUTOMATION_OWNER_USE_MISSING_OR_DUPLICATE')
  await assertRetainedActivePlan(tx, plan, uses[0]!)
  // Retain only exact comparison data within the owning call; never return it to consumers.
  return { source: { sourceDigest: source.sourceDigest, keys: source.keys }, plan }
}

/**
 * Read-only retained-owner integrity for one actual candidate binding. Only the
 * original caller is authenticated. Foreign retained provenance supplies neither
 * credentials nor admission, and this function returns no bytes or reusable authority.
 */
export async function validateAutomationMaterializationOwnersInTransaction(
  tx: Prisma.TransactionClient,
  input: Readonly<{ scope: E2BusinessScope; targetBindingId: string }>,
): Promise<void> {
  const targetBindingId = input.targetBindingId
  if (!isSharedResourceId(targetBindingId)) return refuse('AUTOMATION_OWNER_BINDING_ID')
  const supplied = input.scope
  if (
    !supplied ||
    ![supplied.journeyId, supplied.targetProjectId, supplied.coordinatorSessionId].every(isSharedResourceId) ||
    !Number.isInteger(supplied.generation) ||
    supplied.generation < 1 ||
    supplied.generation > 2_147_483_647 ||
    !supplied.credentials ||
    supplied.credentials.journeyId !== supplied.journeyId ||
    supplied.credentials.targetProjectId !== supplied.targetProjectId ||
    supplied.credentials.coordinatorSessionId !== supplied.coordinatorSessionId ||
    supplied.credentials.coordinatorGeneration !== supplied.generation
  )
    return refuse('REQUEST_SCOPE')
  const scope: E2BusinessScope = {
    journeyId: supplied.journeyId,
    targetProjectId: supplied.targetProjectId,
    coordinatorSessionId: supplied.coordinatorSessionId,
    generation: supplied.generation,
    credentials: {
      journeyId: supplied.credentials.journeyId,
      targetProjectId: supplied.credentials.targetProjectId,
      coordinatorSessionId: supplied.credentials.coordinatorSessionId,
      coordinatorGeneration: supplied.credentials.coordinatorGeneration,
      coordinatorHandoffId: supplied.credentials.coordinatorHandoffId,
      coordinatorPrincipalId: supplied.credentials.coordinatorPrincipalId,
    },
  }
  await assertCurrentCoordinatorSession(scope.credentials, tx)
  if (
    [
      tx.qualityJourneyAutomationTargetBinding?.findUnique,
      tx.qualityJourneyAutomationTargetBinding?.findMany,
      tx.qualityJourneyAutomationMaterialization?.findUnique,
      tx.qualityJourneyAutomationMaterialization?.findMany,
      tx.qualityJourneyAutomationMaterializationBinding?.findMany,
    ].some(method => typeof method !== 'function')
  )
    return refuse('AUTOMATION_OWNER_CENSUS_CLIENT_UNSUPPORTED')
  const original = await readAutomationOwnerCensus(tx, scope.targetProjectId, targetBindingId)
  const ownerPlans = new Map<string, Awaited<ReturnType<typeof readRetainedAutomationOwnerPlan>>>()
  for (const row of original.materializations.values())
    ownerPlans.set(row.id, await readRetainedAutomationOwnerPlan(tx, row, scope.targetProjectId))
  const current = await readAutomationOwnerCensus(tx, scope.targetProjectId, targetBindingId)
  assertAutomationOwnerCensusUnchanged(original, current)
  for (const row of current.materializations.values()) {
    const reread = await readRetainedAutomationOwnerPlan(tx, row, scope.targetProjectId)
    if (canonicalContractJson(reread) !== canonicalContractJson(ownerPlans.get(row.id)))
      return refuse('AUTOMATION_OWNER_SOURCE_OR_DEPENDENCIES_CHANGED')
  }
}

/**
 * The owning authenticated source-publication transaction must call this after
 * persisting its typed source and before publishing its result. No transaction is
 * opened here. Propagate every error to roll back the entire owning transaction.
 * New ENSURE receipt + Use + Claims must commit together; no historical adoption.
 *
 * New Uses perform the E2 business fence, all-five-domain CAS, every guard CAS,
 * source/descriptor reread, PREPARING insert, exact complete claims, then ACTIVE.
 * Other Journeys' immutable ACTIVE claims remain intact. Replay is read-only and
 * cannot supply new business publication, supplier authority or effect capability.
 */
async function acquireUse(
  tx: Prisma.TransactionClient,
  input: SharedResourceUseRequest,
  admitE2: () => Promise<void>,
  freshEnsureMarker?: object,
): Promise<SharedResourceUseReceipt> {
  const request = snapshotRequest(input)
  const original = await readPlan(tx, request)
  const { plan } = original
  let freshEnsure: FreshEnsureMembership | undefined
  if (freshEnsureMarker) {
    freshEnsure = freshEnsureMemberships.get(freshEnsureMarker)
    freshEnsureMemberships.delete(freshEnsureMarker)
    if (
      !freshEnsure ||
      freshEnsure.tx !== tx ||
      freshEnsure.receiptId !== plan.sourceOwnerId ||
      freshEnsure.sourceDigest !== plan.sourceDigest ||
      freshEnsure.journeyId !== plan.journeyId ||
      freshEnsure.targetProjectId !== plan.targetProjectId ||
      freshEnsure.coordinatorSessionId !== plan.coordinatorSessionId ||
      freshEnsure.generation !== plan.generation ||
      plan.sourceKind !== 'ENSURE'
    )
      return refuse('ENSURE_FRESHNESS_MEMBERSHIP_INVALID')
  }
  const existing = await tx.qualityJourneySharedResourceUse.findMany({
    where: {
      OR: [
        { id: plan.id },
        {
          journeyId: plan.journeyId,
          targetProjectId: plan.targetProjectId,
          sourceKind: plan.sourceKind,
          sourceOwnerId: plan.sourceOwnerId,
          sourceDigest: plan.sourceDigest,
        },
      ],
    },
    take: 2,
  })
  if (existing.length > 1) refuse('USE_IDENTITY_COLLISION')
  if (existing.length === 1) {
    if (freshEnsure) return refuse('ENSURE_NEW_SOURCE_COLLISION')
    return validateExisting(tx, request, original, existing[0]!)
  }

  if (plan.sourceKind === 'ENSURE' && !freshEnsure) return refuse('ENSURE_ORPHAN_ADOPTION_REFUSED')
  if (!freshEnsure) await admitE2()
  await contendCoverage(tx, plan.targetProjectId, true)
  const epochs = await contendGuards(tx, plan, true)
  await assertSourceAndPlanUnchanged(tx, request, original)
  await tx.qualityJourneySharedResourceUse.create({
    data: {
      id: plan.id,
      journeyId: plan.journeyId,
      targetProjectId: plan.targetProjectId,
      sourceKind: plan.sourceKind,
      sourceOwnerId: plan.sourceOwnerId,
      sourceDigest: plan.sourceDigest,
      dependencyDigest: plan.dependencyDigest,
      claimSetDigest: plan.claimSetDigest,
      claimSetCount: plan.claimSetCount,
      coordinatorSessionId: plan.coordinatorSessionId,
      generation: plan.generation,
      state: 'PREPARING',
      version: 0,
    },
  })
  for (const claim of plan.claims) {
    const claimEpoch = epochs.get(claim.id)
    if (claimEpoch === undefined) return refuse('CLAIM_GUARD_EPOCH_MISSING')
    await tx.qualityJourneySharedResourceClaim.create({ data: { ...claim, state: 'ACTIVE', claimEpoch } })
  }
  const claims = await readClaims(tx, plan)
  assertExactSharedResourceClaims(plan, claims)
  const activated = await tx.qualityJourneySharedResourceUse.updateMany({
    where: {
      id: plan.id,
      journeyId: plan.journeyId,
      targetProjectId: plan.targetProjectId,
      coordinatorSessionId: plan.coordinatorSessionId,
      generation: plan.generation,
      state: 'PREPARING',
      version: 0,
      claimSetCount: plan.claimSetCount,
      claimSetDigest: plan.claimSetDigest,
    },
    data: { state: 'ACTIVE', version: 1 },
  })
  if (activated.count !== 1) return refuse('USE_ACTIVATION_CAS_LOST')
  const use = await tx.qualityJourneySharedResourceUse.findUnique({ where: { id: plan.id } })
  assertExactActiveSharedResourceUse(plan, use, claims)
  return receipt(plan, 'CREATED_ACTIVE_INERT')
}

/** Existing ENSURE rows may only replay an exact ACTIVE Use; no row can recreate freshness membership. */
export async function acquireSharedResourceUseInTransaction(
  tx: Prisma.TransactionClient,
  input: SharedResourceUseRequest,
): Promise<SharedResourceUseReceipt> {
  const request = snapshotRequest(input)
  return acquireUse(tx, request, () => admitStandaloneUse(tx, request.scope))
}

async function admitStandaloneUse(tx: Prisma.TransactionClient, scope: E2BusinessScope): Promise<void> {
  const admission = await assertE2BusinessAdmission(tx, scope)
  if (admission.kind !== 'E2_V1') return refuse('NEW_USE_REQUIRES_EXACT_E2_GENERATION')
}

/** Input capture is deferred into owner-aware scope getters, before its first
 * await. Even capture/validation errors poison the recognized genuine owner.
 * This private adapter never exposes its capture/operation thunks to a caller.
 */
function joinedPublication<TInput extends { scope: E2BusinessScope }, TResult>(
  tx: Prisma.TransactionClient,
  actualBeforeWrite: BeforeJourneyBusinessWrite,
  capture: () => TInput,
  operation: (input: TInput, admitE2: () => Promise<void>) => Promise<TResult>,
): Promise<TResult> {
  let captured: TInput | undefined
  const input = () => (captured ??= capture())
  const scope: E2BusinessScope = {
    get journeyId() {
      return input().scope.journeyId
    },
    get targetProjectId() {
      return input().scope.targetProjectId
    },
    get coordinatorSessionId() {
      return input().scope.coordinatorSessionId
    },
    get generation() {
      return input().scope.generation
    },
    get credentials() {
      return input().scope.credentials
    },
  }
  return withJourneySharedResourcePublicationInTransaction(tx, scope, actualBeforeWrite, admitE2 =>
    operation(input(), admitE2),
  )
}

export function acquireSharedResourceUseInBusinessGroupInTransaction(
  tx: Prisma.TransactionClient,
  input: SharedResourceUseRequest,
  actualBeforeWrite: BeforeJourneyBusinessWrite,
): Promise<SharedResourceUseReceipt> {
  return joinedPublication(
    tx,
    actualBeforeWrite,
    () => snapshotRequest(input),
    (request, admitE2) => acquireUse(tx, request, admitE2),
  )
}

export type NewLocatorEnsureUseRequest = Readonly<{
  scope: E2BusinessScope
  requestHash: string
  resultHash: string
  moduleId: string
  locatorGroupId: string
  locatorId: string
  createdAt: Date
  expectedDependencyDigest: string
}>

/**
 * The actual ENSURE writer must use this combined entry after its existing
 * authentication and canonical request/result validation and within its owning
 * transaction. This helper also performs its own E2 business fence before the
 * receipt INSERT. It proves local insertion membership only, never producer or
 * supplier authority, outer commit fulfillment, or permission to mutate roots.
 */
async function createEnsureReceiptAndAcquireUse(
  tx: Prisma.TransactionClient,
  input: NewLocatorEnsureUseRequest,
  admitE2: () => Promise<void>,
): Promise<SharedResourceUseReceipt> {
  if (
    !isSharedResourceDigest(input.resultHash) ||
    ![input.moduleId, input.locatorGroupId, input.locatorId].every(isSharedResourceId) ||
    !validDate(input.createdAt)
  )
    return refuse('ENSURE_RESULT_METADATA')
  const plannedReceipt: QualityJourneyLocatorEnsureReceipt = {
    id: sharedLocatorEnsureReceiptId({
      journeyId: input.scope.journeyId,
      targetProjectId: input.scope.targetProjectId,
      coordinatorSessionId: input.scope.coordinatorSessionId,
      generation: input.scope.generation,
      requestHash: input.requestHash,
    }),
    journeyId: input.scope.journeyId,
    targetProjectId: input.scope.targetProjectId,
    coordinatorSessionId: input.scope.coordinatorSessionId,
    generation: input.scope.generation,
    requestHash: input.requestHash,
    resultHash: input.resultHash,
    moduleId: input.moduleId,
    locatorGroupId: input.locatorGroupId,
    locatorId: input.locatorId,
    createdAt: new Date(input.createdAt.getTime()),
  }
  const sourceDigest = sharedLocatorEnsureSourceDigest(plannedReceipt)
  const request = snapshotRequest({
    scope: input.scope,
    source: { sourceKind: 'ENSURE', sourceOwnerId: plannedReceipt.id, expectedSourceDigest: sourceDigest },
    expectedDependencyDigest: input.expectedDependencyDigest,
  })
  const [existingReceipt, retainedUse] = await Promise.all([
    tx.qualityJourneyLocatorEnsureReceipt.findUnique({ where: { id: plannedReceipt.id }, select: { id: true } }),
    tx.qualityJourneySharedResourceUse.findFirst({
      where: { sourceKind: 'ENSURE', sourceOwnerId: plannedReceipt.id },
      select: { id: true },
    }),
  ])
  if (existingReceipt || retainedUse) return refuse('ENSURE_RECEIPT_IDENTITY_ALREADY_RETAINED')
  await admitE2()
  const created = await tx.qualityJourneyLocatorEnsureReceipt.create({ data: plannedReceipt })
  if (sharedLocatorEnsureSourceDigest(created) !== sourceDigest) return refuse('ENSURE_RECEIPT_INSERT_MISMATCH')
  const marker = Object.freeze({})
  freshEnsureMemberships.set(marker, {
    tx,
    receiptId: plannedReceipt.id,
    sourceDigest,
    journeyId: request.scope.journeyId,
    targetProjectId: request.scope.targetProjectId,
    coordinatorSessionId: request.scope.coordinatorSessionId,
    generation: request.scope.generation,
  })
  try {
    return await acquireUse(tx, request, admitE2, marker)
  } finally {
    freshEnsureMemberships.delete(marker)
  }
}

function snapshotNewEnsureInput(input: NewLocatorEnsureUseRequest): NewLocatorEnsureUseRequest {
  const createdAt = input.createdAt
  if (!validDate(createdAt)) return refuse('ENSURE_RESULT_METADATA')
  const scope = input.scope
  const credentials = scope.credentials
  return {
    scope: {
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      coordinatorSessionId: scope.coordinatorSessionId,
      generation: scope.generation,
      credentials: {
        journeyId: credentials.journeyId,
        targetProjectId: credentials.targetProjectId,
        coordinatorSessionId: credentials.coordinatorSessionId,
        coordinatorGeneration: credentials.coordinatorGeneration,
        coordinatorHandoffId: credentials.coordinatorHandoffId,
        coordinatorPrincipalId: credentials.coordinatorPrincipalId,
      },
    },
    requestHash: input.requestHash,
    resultHash: input.resultHash,
    moduleId: input.moduleId,
    locatorGroupId: input.locatorGroupId,
    locatorId: input.locatorId,
    createdAt: new Date(createdAt.getTime()),
    expectedDependencyDigest: input.expectedDependencyDigest,
  }
}

/** Standalone receipt insertion retains its own admission. It cannot authorize
 * any earlier ENSURE root writes; the real root owner uses the joined entry.
 */
export async function createLocatorEnsureReceiptAndAcquireUseInTransaction(
  tx: Prisma.TransactionClient,
  input: NewLocatorEnsureUseRequest,
): Promise<SharedResourceUseReceipt> {
  const request = snapshotNewEnsureInput(input)
  return createEnsureReceiptAndAcquireUse(tx, request, () => admitStandaloneUse(tx, request.scope))
}

export function createLocatorEnsureReceiptAndAcquireUseInBusinessGroupInTransaction(
  tx: Prisma.TransactionClient,
  input: NewLocatorEnsureUseRequest,
  actualBeforeWrite: BeforeJourneyBusinessWrite,
): Promise<SharedResourceUseReceipt> {
  return joinedPublication(
    tx,
    actualBeforeWrite,
    () => snapshotNewEnsureInput(input),
    (request, admitE2) => createEnsureReceiptAndAcquireUse(tx, request, admitE2),
  )
}

/** Read-only exact validation. Every subsequent business write still needs its own E2 fence/CAS. */
export async function validateActiveSharedResourceUseInTransaction(
  tx: Prisma.TransactionClient,
  input: SharedResourceUseRequest,
): Promise<SharedResourceUseReceipt> {
  const request = snapshotRequest(input)
  const original = await readPlan(tx, request)
  const use = await tx.qualityJourneySharedResourceUse.findUnique({ where: { id: original.plan.id } })
  return validateExisting(tx, request, original, use)
}

/** No typed authenticated release/descendant-finality issuer is currently available. No SQL or release occurs. */
export function refuseUnqualifiedSharedResourceUseRelease() {
  return Object.freeze({
    status: 'REFUSED_UNQUALIFIED_RELEASE' as const,
    reason: 'AUTHENTICATED_TYPED_SOURCE_AND_DESCENDANT_PROOF_UNAVAILABLE' as const,
  })
}
