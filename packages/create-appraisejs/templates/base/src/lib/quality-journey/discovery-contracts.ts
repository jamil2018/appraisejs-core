import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { artifactReferenceContractSchema, qualityJourneyContractVersion } from './contracts'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const text = z.string().trim().min(1).max(8_000)
const timestamp = z.string().datetime()

const evidenceReceiptSchema = z.object({ artifactId: id, contentHash: digest }).strict()
const evidenceReceiptIdsSchema = z
  .array(id)
  .min(1)
  .max(256)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length)
      context.addIssue({ code: 'custom', message: 'Evidence receipt IDs must be unique.' })
    if (!isStrictlyLexicographicallySorted(values))
      context.addIssue({ code: 'custom', message: 'Evidence receipt IDs must be sorted.' })
  })

const targetSnapshotSchema = z.object({ snapshotId: id, capturedAt: timestamp, contentHash: digest }).strict()

const revalidationPolicySchema = z
  .object({
    triggers: z.array(text).min(1).max(64),
    maxAgeSeconds: z.number().int().positive().max(31_536_000).optional(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (new Set(policy.triggers).size !== policy.triggers.length)
      context.addIssue({ code: 'custom', path: ['triggers'], message: 'Revalidation triggers must be unique.' })
    if (!isStrictlyLexicographicallySorted(policy.triggers))
      context.addIssue({ code: 'custom', path: ['triggers'], message: 'Revalidation triggers must be sorted.' })
  })

const targetObservationSchema = z
  .object({
    observationId: id,
    snapshotId: id,
    routeId: id,
    environmentId: id,
    fact: text,
    evidenceReceiptIds: evidenceReceiptIdsSchema,
    confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    confidenceRationale: text,
    stability: z.enum(['STABLE', 'CONDITIONAL', 'VOLATILE']),
    stabilityRationale: text,
    revalidationPolicy: revalidationPolicySchema,
  })
  .strict()

const analysisRevisionReferenceSchema = z.object({ artifactId: id, revisionId: id, contentHash: digest }).strict()
const analysisApprovalReferenceSchema = z.object({ artifactId: id, contentHash: digest }).strict()

const discoveryBundleBaseSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    journeyId: id,
    targetProjectId: id,
    cycleId: id,
    analysisRevision: analysisRevisionReferenceSchema,
    analysisApproval: analysisApprovalReferenceSchema,
    workItemId: id,
    attemptId: id,
    authorizationId: id,
    inputHash: digest,
    assignmentScopeHash: digest,
    approvedRequirementSetHash: digest,
    inputArtifacts: z.array(artifactReferenceContractSchema).min(1).max(256),
    evidenceReceipts: z.array(evidenceReceiptSchema).min(1).max(256),
  })
  .strict()

function compareStrings(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function isStrictlyLexicographicallySorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || compareStrings(values[index - 1], value) < 0)
}

type InputArtifact = z.infer<typeof artifactReferenceContractSchema>

function compareInputArtifacts(left: InputArtifact, right: InputArtifact): number {
  const kind = compareStrings(left.kind, right.kind)
  if (kind !== 0) return kind
  const artifactId = compareStrings(left.artifactId, right.artifactId)
  if (artifactId !== 0) return artifactId
  return compareStrings(left.revisionId ?? '', right.revisionId ?? '')
}

function isCanonicallySortedInputArtifacts(artifacts: readonly InputArtifact[]): boolean {
  return artifacts.every((artifact, index) => index === 0 || compareInputArtifacts(artifacts[index - 1], artifact) < 0)
}

type DiscoveryBundleBase = z.infer<typeof discoveryBundleBaseSchema>

function addInputArtifactIdentityIssue(bundle: DiscoveryBundleBase, context: z.RefinementCtx): void {
  const inputIdentities = bundle.inputArtifacts.map(
    artifact => `${artifact.kind}\u0000${artifact.artifactId}\u0000${artifact.revisionId ?? ''}`,
  )
  if (new Set(inputIdentities).size !== inputIdentities.length)
    context.addIssue({
      code: 'custom',
      path: ['inputArtifacts'],
      message: 'Input artifacts must have unique compound identities.',
    })
}

function addInputArtifactOrderIssue(bundle: DiscoveryBundleBase, context: z.RefinementCtx): void {
  if (!isCanonicallySortedInputArtifacts(bundle.inputArtifacts))
    context.addIssue({
      code: 'custom',
      path: ['inputArtifacts'],
      message: 'Input artifacts must be canonically sorted.',
    })
}

function matchesAnalysisRevision(artifact: InputArtifact, bundle: DiscoveryBundleBase): boolean {
  return (
    artifact.artifactId === bundle.analysisRevision.artifactId &&
    artifact.revisionId === bundle.analysisRevision.revisionId &&
    artifact.contentHash === bundle.analysisRevision.contentHash
  )
}

function matchesAnalysisApproval(artifact: InputArtifact, bundle: DiscoveryBundleBase): boolean {
  return (
    artifact.artifactId === bundle.analysisApproval.artifactId &&
    artifact.revisionId === undefined &&
    artifact.contentHash === bundle.analysisApproval.contentHash
  )
}

function addSingletonUpstreamArtifactIssue(
  bundle: DiscoveryBundleBase,
  kind: InputArtifact['kind'],
  matchesReference: (artifact: InputArtifact, value: DiscoveryBundleBase) => boolean,
  message: string,
  context: z.RefinementCtx,
): void {
  const artifacts = bundle.inputArtifacts.filter(artifact => artifact.kind === kind)
  if (artifacts.length !== 1 || !matchesReference(artifacts[0], bundle))
    context.addIssue({ code: 'custom', path: ['inputArtifacts'], message })
}

function addUpstreamArtifactIssues(bundle: DiscoveryBundleBase, context: z.RefinementCtx): void {
  addSingletonUpstreamArtifactIssue(
    bundle,
    'ANALYSIS_CHARTER_REVISION',
    matchesAnalysisRevision,
    'Input artifacts must contain exactly one matching analysis revision.',
    context,
  )
  addSingletonUpstreamArtifactIssue(
    bundle,
    'JOURNEY_APPROVAL',
    matchesAnalysisApproval,
    'Input artifacts must contain exactly one matching analysis approval.',
    context,
  )
}

function addEvidenceReceiptIssues(bundle: DiscoveryBundleBase, context: z.RefinementCtx): Set<string> {
  const evidenceReceiptIds = bundle.evidenceReceipts.map(receipt => receipt.artifactId)
  if (new Set(evidenceReceiptIds).size !== evidenceReceiptIds.length)
    context.addIssue({ code: 'custom', path: ['evidenceReceipts'], message: 'Evidence receipt IDs must be unique.' })
  if (!isStrictlyLexicographicallySorted(evidenceReceiptIds))
    context.addIssue({
      code: 'custom',
      path: ['evidenceReceipts'],
      message: 'Evidence receipts must be sorted by artifact ID.',
    })
  return new Set(evidenceReceiptIds)
}

function addProvenanceIssues(bundle: DiscoveryBundleBase, context: z.RefinementCtx): Set<string> {
  addInputArtifactIdentityIssue(bundle, context)
  addInputArtifactOrderIssue(bundle, context)
  addUpstreamArtifactIssues(bundle, context)
  return addEvidenceReceiptIssues(bundle, context)
}

/** Immutable, provenance-bound Scout output. It intentionally contains no
 * target mutation capability or catalog resource writes. */
export const targetObservationBundleSchema = discoveryBundleBaseSchema
  .extend({
    bundleId: id,
    observedAt: timestamp,
    targetSnapshot: targetSnapshotSchema,
    observations: z.array(targetObservationSchema).min(1).max(512),
  })
  .strict()
  .superRefine((bundle, context) => {
    const evidenceReceiptIds = addProvenanceIssues(bundle, context)
    const observationIds = bundle.observations.map(observation => observation.observationId)
    if (new Set(observationIds).size !== observationIds.length)
      context.addIssue({ code: 'custom', path: ['observations'], message: 'Observation IDs must be unique.' })
    if (!isStrictlyLexicographicallySorted(observationIds))
      context.addIssue({
        code: 'custom',
        path: ['observations'],
        message: 'Observations must be sorted by observation ID.',
      })
    for (const [index, observation] of bundle.observations.entries()) {
      if (observation.snapshotId !== bundle.targetSnapshot.snapshotId)
        context.addIssue({
          code: 'custom',
          path: ['observations', index, 'snapshotId'],
          message: 'Observation snapshot ID must match the bundle target snapshot.',
        })
      if (observation.evidenceReceiptIds.some(receiptId => !evidenceReceiptIds.has(receiptId)))
        context.addIssue({
          code: 'custom',
          path: ['observations', index, 'evidenceReceiptIds'],
          message: 'Observation evidence must be bound by the bundle.',
        })
    }
  })

const resourceKindSchema = z.enum([
  'OPERATION',
  'STEP_DEFINITION',
  'LOCATOR',
  'TEMPLATE',
  'DATA',
  'EXAMPLE',
  'SCENARIO',
])
const rank = z.number().int().positive().max(512)

const resourceResolutionEntryBaseSchema = z
  .object({
    resourceId: id,
    resourceKind: resourceKindSchema,
    requirementId: id,
    rank,
    explanation: text,
    evidenceReceiptIds: evidenceReceiptIdsSchema,
  })
  .strict()

const reusableResourceResolutionEntrySchema = resourceResolutionEntryBaseSchema
  .extend({ reasonCode: z.literal('COMPATIBLE') })
  .strict()
const incompatibleResourceResolutionEntrySchema = resourceResolutionEntryBaseSchema
  .extend({ reasonCode: z.literal('INCOMPATIBLE') })
  .strict()
const staleResourceResolutionEntrySchema = resourceResolutionEntryBaseSchema
  .extend({ reasonCode: z.literal('STALE') })
  .strict()
const crossTargetResourceResolutionEntrySchema = resourceResolutionEntryBaseSchema
  .extend({ reasonCode: z.literal('CROSS_TARGET'), sourceTargetProjectId: id })
  .strict()

const missingResourceResolutionEntrySchema = z
  .object({
    requirementId: id,
    capabilityId: id,
    reasonCode: z.enum(['NOT_FOUND', 'CAPABILITY_GAP']),
    explanation: text,
    evidenceReceiptIds: evidenceReceiptIdsSchema,
  })
  .strict()

type RankedResourceEntry = z.infer<typeof resourceResolutionEntryBaseSchema>

function compareResourceEntries(left: RankedResourceEntry, right: RankedResourceEntry): number {
  if (left.requirementId !== right.requirementId) return left.requirementId < right.requirementId ? -1 : 1
  if (left.rank !== right.rank) return left.rank - right.rank
  if (left.resourceId !== right.resourceId) return left.resourceId < right.resourceId ? -1 : 1
  return 0
}

function addRankIssues(entries: readonly RankedResourceEntry[], context: z.RefinementCtx): void {
  const requirementIds = new Set(entries.map(entry => entry.requirementId))
  for (const requirementId of requirementIds) {
    const ranks = entries.filter(entry => entry.requirementId === requirementId).map(entry => entry.rank)
    const expected = Array.from({ length: ranks.length }, (_, index) => index + 1)
    if (
      new Set(ranks).size !== ranks.length ||
      [...ranks].sort((left, right) => left - right).some((value, index) => value !== expected[index])
    )
      context.addIssue({
        code: 'custom',
        message: 'Resource ranks must be unique and contiguous from 1 across all categories per requirement.',
      })
  }
}

function addCanonicalOrderIssue(
  category: string,
  entries: readonly RankedResourceEntry[],
  context: z.RefinementCtx,
): void {
  if (entries.some((entry, index) => index > 0 && compareResourceEntries(entries[index - 1], entry) > 0))
    context.addIssue({
      code: 'custom',
      path: [category],
      message: 'Resource category entries must be ordered by requirement ID, rank, then resource ID.',
    })
}

function isCanonicallySortedMissingEntries(
  entries: readonly z.infer<typeof missingResourceResolutionEntrySchema>[],
): boolean {
  return entries.every((entry, index) => {
    if (index === 0) return true
    const previous = entries[index - 1]
    const requirement = compareStrings(previous.requirementId, entry.requirementId)
    return requirement < 0 || (requirement === 0 && compareStrings(previous.capabilityId, entry.capabilityId) < 0)
  })
}

type ResourceResolutionBundleInput = DiscoveryBundleBase & {
  approvedRequirementIds: string[]
  reusable: z.infer<typeof reusableResourceResolutionEntrySchema>[]
  incompatible: z.infer<typeof incompatibleResourceResolutionEntrySchema>[]
  stale: z.infer<typeof staleResourceResolutionEntrySchema>[]
  crossTarget: z.infer<typeof crossTargetResourceResolutionEntrySchema>[]
  missing: z.infer<typeof missingResourceResolutionEntrySchema>[]
}

function resourceBearingEntries(bundle: ResourceResolutionBundleInput): RankedResourceEntry[] {
  return [...bundle.reusable, ...bundle.incompatible, ...bundle.stale, ...bundle.crossTarget]
}

function allResourceEntries(bundle: ResourceResolutionBundleInput) {
  return [...resourceBearingEntries(bundle), ...bundle.missing]
}

function addApprovedRequirementIssues(bundle: ResourceResolutionBundleInput, context: z.RefinementCtx): void {
  if (new Set(bundle.approvedRequirementIds).size !== bundle.approvedRequirementIds.length)
    context.addIssue({ code: 'custom', path: ['approvedRequirementIds'], message: 'Requirement IDs must be unique.' })
  if (!isStrictlyLexicographicallySorted(bundle.approvedRequirementIds))
    context.addIssue({ code: 'custom', path: ['approvedRequirementIds'], message: 'Requirement IDs must be sorted.' })
}

function addClassificationPresenceIssue(bundle: ResourceResolutionBundleInput, context: z.RefinementCtx): void {
  if (allResourceEntries(bundle).length === 0)
    context.addIssue({
      code: 'custom',
      message: 'At least one resource classification or missing capability is required.',
    })
}

function addResourceIdentityIssues(bundle: ResourceResolutionBundleInput, context: z.RefinementCtx): void {
  const resourceIdentities = resourceBearingEntries(bundle).map(
    resource => `${resource.requirementId}\u0000${resource.resourceId}`,
  )
  if (new Set(resourceIdentities).size !== resourceIdentities.length)
    context.addIssue({
      code: 'custom',
      message: 'Resource identities must be unique and disjoint across resource-bearing categories per requirement.',
    })
  const missingIdentities = bundle.missing.map(entry => `${entry.requirementId}\u0000${entry.capabilityId}`)
  if (new Set(missingIdentities).size !== missingIdentities.length)
    context.addIssue({
      code: 'custom',
      path: ['missing'],
      message: 'Missing capabilities must be unique per requirement.',
    })
}

function addRequirementCoverageIssues(bundle: ResourceResolutionBundleInput, context: z.RefinementCtx): void {
  const entries = allResourceEntries(bundle)
  const approvedRequirements = new Set(bundle.approvedRequirementIds)
  if (entries.some(entry => !approvedRequirements.has(entry.requirementId)))
    context.addIssue({ code: 'custom', message: 'Every classification must reference a declared requirement ID.' })
  if (
    bundle.approvedRequirementIds.some(requirementId => !entries.some(entry => entry.requirementId === requirementId))
  )
    context.addIssue({
      code: 'custom',
      message: 'Every declared requirement must have a resource classification or missing capability.',
    })
}

function addResourceRankingAndOrderIssues(bundle: ResourceResolutionBundleInput, context: z.RefinementCtx): void {
  addRankIssues(resourceBearingEntries(bundle), context)
  for (const [category, entries] of [
    ['reusable', bundle.reusable],
    ['incompatible', bundle.incompatible],
    ['stale', bundle.stale],
    ['crossTarget', bundle.crossTarget],
  ] as const)
    addCanonicalOrderIssue(category, entries, context)
  if (!isCanonicallySortedMissingEntries(bundle.missing))
    context.addIssue({
      code: 'custom',
      path: ['missing'],
      message: 'Missing entries must be ordered by requirement ID then capability ID.',
    })
}

function addCrossTargetIssue(bundle: ResourceResolutionBundleInput, context: z.RefinementCtx): void {
  if (bundle.crossTarget.some(entry => entry.sourceTargetProjectId === bundle.targetProjectId))
    context.addIssue({
      code: 'custom',
      path: ['crossTarget'],
      message: 'Cross-target resources must originate from a different target project.',
    })
}

function addResourceEvidenceIssue(
  bundle: ResourceResolutionBundleInput,
  evidenceReceiptIds: Set<string>,
  context: z.RefinementCtx,
): void {
  if (
    allResourceEntries(bundle).some(entry =>
      entry.evidenceReceiptIds.some(receiptId => !evidenceReceiptIds.has(receiptId)),
    )
  )
    context.addIssue({ code: 'custom', message: 'Resource evidence must be bound by the bundle.' })
}

function validateResourceResolutionBundle(bundle: ResourceResolutionBundleInput, context: z.RefinementCtx): void {
  const evidenceReceiptIds = addProvenanceIssues(bundle, context)
  addApprovedRequirementIssues(bundle, context)
  addClassificationPresenceIssue(bundle, context)
  addResourceIdentityIssues(bundle, context)
  addRequirementCoverageIssues(bundle, context)
  addResourceRankingAndOrderIssues(bundle, context)
  addCrossTargetIssue(bundle, context)
  addResourceEvidenceIssue(bundle, evidenceReceiptIds, context)
}

/** Immutable Resource Explorer output. Candidate IDs are Appraise-owned
 * stable identifiers; missing capability declarations deliberately cannot
 * carry a fabricated resource ID. */
export const resourceResolutionBundleSchema = discoveryBundleBaseSchema
  .extend({
    bundleId: id,
    resolvedAt: timestamp,
    /** The service must verify this declaration and approvedRequirementSetHash against the exact approved charter;
     * the contract hash includes both fields. */
    approvedRequirementIds: z.array(id).min(1).max(512),
    reusable: z.array(reusableResourceResolutionEntrySchema).max(512),
    incompatible: z.array(incompatibleResourceResolutionEntrySchema).max(512),
    stale: z.array(staleResourceResolutionEntrySchema).max(512),
    crossTarget: z.array(crossTargetResourceResolutionEntrySchema).max(512),
    missing: z.array(missingResourceResolutionEntrySchema).max(512),
  })
  .strict()
  .superRefine(validateResourceResolutionBundle)

export function hashTargetObservationBundle(value: unknown): string {
  return hashCanonical(targetObservationBundleSchema.parse(value))
}

export function hashResourceResolutionBundle(value: unknown): string {
  return hashCanonical(resourceResolutionBundleSchema.parse(value))
}

function hashCanonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}
