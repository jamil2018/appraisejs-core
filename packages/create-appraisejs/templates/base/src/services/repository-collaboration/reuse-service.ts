import { createHash } from 'node:crypto'

import { Prisma, type PrismaClient } from '@prisma/client'
import { z } from 'zod'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { canonicalJson, collaborationHash } from '@/lib/repository-collaboration'
import {
  advisoryReuseInputReferenceSchema,
  assignmentManifestSchema,
  hashQualityJourneyDraft,
  hashQualityJourneyDraftReuseSeeds,
  parseQualityJourneyDraftRequirement,
  type AdvisoryReuseInputReference,
} from '@/lib/quality-journey'
import { createQualityJourneyDraft } from '@/services/coordinator/quality-journey-draft-service'
import { ServiceError } from '@/services/shared/errors'

type Db = PrismaClient | Prisma.TransactionClient

const identifier = z.string().trim().min(1).max(500)
const reuseAssetPayloadSchema = z
  .object({
    assetKind: z.enum(['brief', 'analysis', 'scenario']),
    title: z.string().trim().min(1).max(500),
    content: z.record(z.string(), z.unknown()),
  })
  .strict()

const reuseBriefInputSchema = z
  .object({
    bindingId: identifier,
    targetProjectId: identifier,
    assetPortableId: identifier,
    sourceVersion: z.number().int().positive(),
    idempotencyKey: identifier,
  })
  .strict()

type ReuseAssetPayload = z.infer<typeof reuseAssetPayloadSchema>
type ReuseBriefInput = z.infer<typeof reuseBriefInputSchema>
type ReuseSeedKind = 'ANALYSIS' | 'SCENARIO'
type ReuseSeedSelection = { kind: ReuseSeedKind; assetPortableId: string; sourceVersion: number }

const qualityJourneyHash = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

function annotationProjection(annotation: {
  bindingId: string
  assetPortableId: string
  sourceVersion: number
  payloadHash: string
  sourceRevision: string | null
}) {
  return {
    bindingId: annotation.bindingId,
    assetPortableId: annotation.assetPortableId,
    sourceVersion: annotation.sourceVersion,
    payloadHash: annotation.payloadHash,
    sourceRevision: annotation.sourceRevision ?? undefined,
  }
}

function parseReuseAsset(asset: { kind: string; payloadJson: string; payloadHash: string }) {
  let payload: ReuseAssetPayload
  try {
    payload = reuseAssetPayloadSchema.parse(JSON.parse(asset.payloadJson) as unknown)
  } catch {
    throw new ServiceError('The shared reuse asset has invalid content.', 'CONFLICT', 409)
  }
  if (asset.kind !== payload.assetKind || collaborationHash(payload) !== asset.payloadHash)
    throw new ServiceError('The shared reuse asset no longer matches its pinned content.', 'CONFLICT', 409)
  return payload
}

async function readReuseAsset(
  input: Pick<ReuseBriefInput, 'bindingId' | 'targetProjectId' | 'assetPortableId' | 'sourceVersion'>,
  db: Db,
) {
  const asset = await db.collaborationReuseAsset.findFirst({
    where: {
      bindingId: input.bindingId,
      portableId: input.assetPortableId,
      sourceVersion: input.sourceVersion,
    },
    include: { binding: { select: { targetProjectId: true, enabled: true } } },
  })
  if (!asset || asset.binding.targetProjectId !== input.targetProjectId)
    throw new ServiceError('This shared reuse asset is not available in the active workspace.', 'NOT_FOUND')
  if (!asset.binding.enabled)
    throw new ServiceError('Repository collaboration is disabled for this workspace.', 'CONFLICT', 409)
  const payload = parseReuseAsset(asset)
  return { asset, payload }
}

function draftIdempotencyKey(input: ReuseBriefInput) {
  return `reuse:${input.bindingId}:${input.idempotencyKey}`
}

function assertReplayMatchesPin(
  annotation: Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyDraftReuseAnnotation']['findUnique']>>,
  asset: {
    bindingId: string
    portableId: string
    sourceVersion: number
    payloadHash: string
    sourceRevision: string | null
  },
) {
  if (
    !annotation ||
    annotation.bindingId !== asset.bindingId ||
    annotation.assetPortableId !== asset.portableId ||
    annotation.sourceVersion !== asset.sourceVersion ||
    annotation.payloadHash !== asset.payloadHash ||
    annotation.sourceRevision !== asset.sourceRevision
  )
    throw new ServiceError('Draft creation key was reused with a different shared reuse asset.', 'CONFLICT')
  return annotation
}

/**
 * Creates an ordinary local draft from a version-pinned reusable brief. The
 * annotation is provenance only: it is not included in draft hashes, cannot
 * set predecessor lineage, and is never read by Journey lifecycle services.
 */
export async function createQualityJourneyDraftFromReuseBrief(input: unknown, client: PrismaClient = prisma) {
  const parsed = reuseBriefInputSchema.parse(input)
  return client.$transaction(async tx => {
    const { asset, payload } = await readReuseAsset(parsed, tx)
    if (payload.assetKind !== 'brief')
      throw new ServiceError('Only reusable briefs can create a Quality Journey draft.', 'VALIDATION')
    const requirement = parseQualityJourneyDraftRequirement(payload.content)
    const created = await createQualityJourneyDraft(
      {
        targetProjectId: parsed.targetProjectId,
        idempotencyKey: draftIdempotencyKey(parsed),
        requirement,
        currentStep: 0,
      },
      tx,
    )
    if (created.draft.predecessorJourneyId)
      throw new ServiceError('A shared reuse brief must not create continuation lineage.', 'CONFLICT', 409)
    if (created.replayed) {
      const annotation = assertReplayMatchesPin(
        await tx.qualityJourneyDraftReuseAnnotation.findUnique({ where: { draftId: created.draft.id } }),
        asset,
      )
      return { ...created, reuseAnnotation: annotationProjection(annotation) }
    }
    const annotation = await tx.qualityJourneyDraftReuseAnnotation.create({
      data: {
        draftId: created.draft.id,
        bindingId: asset.bindingId,
        assetPortableId: asset.portableId,
        sourceVersion: asset.sourceVersion,
        payloadHash: asset.payloadHash,
        sourceRevision: asset.sourceRevision,
      },
    })
    return { ...created, reuseAnnotation: annotationProjection(annotation) }
  })
}

const reuseSeedSelectionSchema = z
  .object({
    bindingId: identifier,
    targetProjectId: identifier,
    draftId: identifier,
    expectedVersion: z.number().int().positive(),
    expectedDraftHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    assets: z
      .array(
        z
          .object({
            kind: z.enum(['ANALYSIS', 'SCENARIO']),
            assetPortableId: identifier,
            sourceVersion: z.number().int().positive(),
          })
          .strict(),
      )
      .max(128),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = value.assets.map(asset => `${asset.kind}:${asset.assetPortableId}:${asset.sourceVersion}`)
    if (new Set(keys).size !== keys.length)
      context.addIssue({ code: 'custom', path: ['assets'], message: 'Reuse seed assets must be unique.' })
  })

function sourceKind(kind: ReuseSeedKind) {
  return kind === 'ANALYSIS' ? 'analysis' : 'scenario'
}

function normalizedSeedContent(payload: ReuseAssetPayload) {
  return {
    contentJson: canonicalJson(payload.content),
    contentHash: collaborationHash(payload.content),
  }
}

function seedReference(seed: {
  id: string
  kind: ReuseSeedKind
  assetPortableId: string
  sourceVersion: number
  sourcePayloadHash: string
  contentHash: string
}): AdvisoryReuseInputReference {
  return {
    kind: seed.kind,
    seedId: seed.id,
    assetPortableId: seed.assetPortableId,
    sourceVersion: seed.sourceVersion,
    sourcePayloadHash: seed.sourcePayloadHash,
    contentHash: seed.contentHash,
  }
}

function sortedSeedReferences(seeds: Parameters<typeof seedReference>[0][]) {
  return seeds
    .map(seedReference)
    .sort((left, right) => canonicalContractJson(left).localeCompare(canonicalContractJson(right)))
}

async function resolveSelectedSeed(
  selection: ReuseSeedSelection,
  input: Pick<ReuseBriefInput, 'bindingId' | 'targetProjectId'>,
  tx: Prisma.TransactionClient,
) {
  const { asset, payload } = await readReuseAsset(
    {
      bindingId: input.bindingId,
      targetProjectId: input.targetProjectId,
      assetPortableId: selection.assetPortableId,
      sourceVersion: selection.sourceVersion,
    },
    tx,
  )
  if (payload.assetKind !== sourceKind(selection.kind))
    throw new ServiceError('The selected reuse asset does not match its advisory role.', 'VALIDATION')
  return { selection, asset, ...normalizedSeedContent(payload) }
}

type SelectedSeed = Awaited<ReturnType<typeof resolveSelectedSeed>>

function hashDraftWithSelectedSeeds(
  draft: { requirementJson: string; predecessorJourneyId: string | null; version: number },
  selected: readonly SelectedSeed[],
) {
  return hashQualityJourneyDraft({
    requirement: parseQualityJourneyDraftRequirement(JSON.parse(draft.requirementJson)),
    predecessorJourneyId: draft.predecessorJourneyId ?? undefined,
    version: draft.version + 1,
    advisorySeedDigest: selected.length
      ? hashQualityJourneyDraftReuseSeeds(
          selected.map(item => ({
            kind: item.selection.kind,
            assetPortableId: item.asset.portableId,
            sourceVersion: item.asset.sourceVersion,
            sourcePayloadHash: item.asset.payloadHash,
            sourceRevision: item.asset.sourceRevision,
            contentHash: item.contentHash,
          })),
        )
      : undefined,
  })
}

async function replaceDraftReuseSeeds(
  draftId: string,
  bindingId: string,
  selected: readonly SelectedSeed[],
  tx: Prisma.TransactionClient,
) {
  await tx.qualityJourneyReuseSeed.deleteMany({ where: { draftId } })
  if (!selected.length) return
  await tx.qualityJourneyReuseSeed.createMany({
    data: selected.map(item => ({
      draftId,
      bindingId,
      kind: item.selection.kind,
      assetPortableId: item.asset.portableId,
      sourceVersion: item.asset.sourceVersion,
      sourcePayloadHash: item.asset.payloadHash,
      sourceRevision: item.asset.sourceRevision,
      contentJson: item.contentJson,
      contentHash: item.contentHash,
    })),
  })
}

/**
 * Replaces a draft's advisory seed selection before confirmation. Selection
 * advances the draft version and hash; it never writes a Journey authority
 * record or links the draft as a continuation.
 */
export async function selectQualityJourneyReuseSeeds(input: unknown, client: PrismaClient = prisma) {
  const parsed = reuseSeedSelectionSchema.parse(input)
  return client.$transaction(async tx => {
    const draft = await tx.qualityJourneyDraft.findFirst({
      where: { id: parsed.draftId, targetProjectId: parsed.targetProjectId, status: 'ACTIVE' },
      include: { reuseAnnotation: true },
    })
    if (!draft) throw new ServiceError('This draft is unavailable for reuse seed selection.', 'NOT_FOUND')
    if (draft.version !== parsed.expectedVersion || draft.draftHash !== parsed.expectedDraftHash)
      throw new ServiceError('The draft changed. Reload before changing reuse seeds.', 'CONFLICT')
    if (!draft.reuseAnnotation || draft.reuseAnnotation.bindingId !== parsed.bindingId)
      throw new ServiceError('Reuse seeds must belong to the draft source binding.', 'UNAUTHORIZED')
    const selected = await Promise.all(parsed.assets.map(selection => resolveSelectedSeed(selection, parsed, tx)))
    const nextVersion = draft.version + 1
    const draftHash = hashDraftWithSelectedSeeds(draft, selected)
    await replaceDraftReuseSeeds(draft.id, parsed.bindingId, selected, tx)
    const changed = await tx.qualityJourneyDraft.updateMany({
      where: { id: draft.id, status: 'ACTIVE', version: draft.version, draftHash: draft.draftHash },
      data: { version: nextVersion, draftHash },
    })
    if (changed.count !== 1) throw new ServiceError('The draft changed while selecting reuse seeds.', 'CONFLICT')
    const seeds = await tx.qualityJourneyReuseSeed.findMany({ where: { draftId: draft.id } })
    return { draftId: draft.id, version: nextVersion, draftHash, advisoryInputRefs: sortedSeedReferences(seeds) }
  })
}

const advisorySeedReadSchema = z
  .object({
    journeyId: identifier,
    targetProjectId: identifier,
    workItemId: identifier,
    role: z.enum(['REQUIREMENT_ANALYZER', 'TEST_SCENARIO_DESIGNER']),
    leaseId: identifier,
    ownerToken: identifier,
    assignmentId: identifier,
    assignmentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    inputHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()

function exactReferences(left: readonly AdvisoryReuseInputReference[], right: readonly AdvisoryReuseInputReference[]) {
  return canonicalContractJson(left) === canonicalContractJson(right)
}

function attemptMatchesAdvisoryLease(
  input: z.infer<typeof advisorySeedReadSchema>,
  item: { id: string },
  attempt: {
    workItemId: string
    ownerTokenHash: string
    assignmentId: string | null
    assignmentHash: string | null
  } | null,
) {
  if (!attempt) return false
  return (
    attempt.workItemId === item.id &&
    attempt.ownerTokenHash === createHash('sha256').update(input.ownerToken).digest('hex') &&
    attempt.assignmentId === input.assignmentId &&
    attempt.assignmentHash === input.assignmentHash
  )
}

function attemptIsCurrentForAdvisoryLease(
  item: { currentAttempt: number },
  attempt: { leaseExpiresAt: Date; attempt: number; status: string },
) {
  return (
    attempt.leaseExpiresAt > new Date() &&
    item.currentAttempt === attempt.attempt &&
    ['WORKER_REQUESTED', 'WORKER_STARTED', 'IN_PROGRESS'].includes(attempt.status)
  )
}

function assignmentMatchesAdvisoryLease(
  assignment: ReturnType<typeof assignmentManifestSchema.parse>,
  input: z.infer<typeof advisorySeedReadSchema>,
  workItemId: string,
) {
  return (
    assignment.assignmentId === input.assignmentId &&
    assignment.journeyId === input.journeyId &&
    assignment.targetProjectId === input.targetProjectId &&
    assignment.workItemId === workItemId &&
    assignment.roleDefinition.role === input.role &&
    assignment.inputHash === input.inputHash
  )
}

function parsedAdvisoryAssignment(attempt: { assignmentJson: string | null; assignmentHash: string | null }) {
  if (!attempt.assignmentJson || qualityJourneyHash(JSON.parse(attempt.assignmentJson)) !== attempt.assignmentHash)
    throw new ServiceError('Quality Journey advisory reuse assignment lineage is invalid.', 'UNAUTHORIZED')
  return assignmentManifestSchema.parse(JSON.parse(attempt.assignmentJson))
}

function assertAdvisoryReuseLease(
  input: z.infer<typeof advisorySeedReadSchema>,
  item: { id: string; currentAttempt: number; inputHash: string },
  attempt: {
    workItemId: string
    ownerTokenHash: string
    assignmentId: string | null
    assignmentHash: string | null
    assignmentJson: string | null
    leaseExpiresAt: Date
    attempt: number
    status: string
  } | null,
) {
  if (
    !attemptMatchesAdvisoryLease(input, item, attempt) ||
    !attempt ||
    !attemptIsCurrentForAdvisoryLease(item, attempt)
  )
    throw new ServiceError('Quality Journey advisory reuse lease is invalid or stale.', 'UNAUTHORIZED')
  if (item.inputHash !== input.inputHash)
    throw new ServiceError('Quality Journey advisory reuse input is stale.', 'CONFLICT')
  const assignment = parsedAdvisoryAssignment(attempt)
  if (!assignmentMatchesAdvisoryLease(assignment, input, item.id))
    throw new ServiceError('Quality Journey advisory reuse assignment does not match its lease.', 'UNAUTHORIZED')
  return assignment
}

async function localAdvisorySeeds(input: z.infer<typeof advisorySeedReadSchema>, client: Db) {
  const kind = input.role === 'REQUIREMENT_ANALYZER' ? 'ANALYSIS' : 'SCENARIO'
  const draft = await client.qualityJourneyDraft.findFirst({
    where: { confirmedJourneyId: input.journeyId, targetProjectId: input.targetProjectId },
    include: {
      reuseSeeds: { where: { kind }, include: { binding: { select: { targetProjectId: true, enabled: true } } } },
    },
  })
  if (!draft) throw new ServiceError('Quality Journey reuse lineage is unavailable.', 'CONFLICT')
  return draft.reuseSeeds
}

function projectAdvisorySeed(seed: Awaited<ReturnType<typeof localAdvisorySeeds>>[number], targetProjectId: string) {
  if (seed.binding.targetProjectId !== targetProjectId || !seed.binding.enabled)
    throw new ServiceError('Quality Journey advisory reuse source is unavailable locally.', 'CONFLICT')
  let content: Record<string, unknown>
  try {
    content = z.record(z.string(), z.unknown()).parse(JSON.parse(seed.contentJson))
  } catch {
    throw new ServiceError('Quality Journey advisory reuse content is invalid.', 'CONFLICT')
  }
  if (collaborationHash(content) !== seed.contentHash)
    throw new ServiceError('Quality Journey advisory reuse content no longer matches its pin.', 'CONFLICT')
  return {
    kind: seed.kind,
    assetPortableId: seed.assetPortableId,
    sourceVersion: seed.sourceVersion,
    sourcePayloadHash: seed.sourcePayloadHash,
    sourceRevision: seed.sourceRevision ?? undefined,
    contentHash: seed.contentHash,
    content,
  }
}

/**
 * A worker may read advisory content only through the exact assignment it
 * holds: the lease, assignment digest, role, local draft lineage, and pinned
 * content hashes are all rechecked on every read.
 */
export async function readQualityJourneyAdvisoryReuseSeeds(input: unknown, client: Db = prisma) {
  const parsed = advisorySeedReadSchema.parse(input)
  const item = await client.qualityJourneyWorkItem.findFirst({
    where: {
      id: parsed.workItemId,
      journeyId: parsed.journeyId,
      targetProjectId: parsed.targetProjectId,
      role: parsed.role,
    },
  })
  if (!item) throw new ServiceError('Quality Journey work item was not found for advisory reuse.', 'NOT_FOUND')
  const attempt = await client.qualityJourneyWorkAttempt.findUnique({ where: { leaseId: parsed.leaseId } })
  const assignment = assertAdvisoryReuseLease(parsed, item, attempt)
  const seeds = await localAdvisorySeeds(parsed, client)
  const references = sortedSeedReferences(seeds)
  const assigned = (assignment.advisoryInputRefs ?? []).map(reference =>
    advisoryReuseInputReferenceSchema.parse(reference),
  )
  if (!exactReferences(assigned, references))
    throw new ServiceError('Quality Journey advisory reuse references do not match local lineage.', 'CONFLICT')
  return seeds.map(seed => projectAdvisorySeed(seed, parsed.targetProjectId))
}

/** A local library listing exposes only validated, non-authoritative content. */
export async function listQualityJourneyReuseAssets(
  input: { bindingId: string; targetProjectId: string },
  client: Db = prisma,
) {
  const assets = await client.collaborationReuseAsset.findMany({
    where: { bindingId: input.bindingId, binding: { targetProjectId: input.targetProjectId, enabled: true } },
    orderBy: [{ portableId: 'asc' }, { sourceVersion: 'desc' }],
  })
  return assets.map(asset => {
    const payload = parseReuseAsset(asset)
    return {
      portableId: asset.portableId,
      sourceVersion: asset.sourceVersion,
      kind: payload.assetKind,
      title: payload.title,
      payloadHash: asset.payloadHash,
      sourceRevision: asset.sourceRevision ?? undefined,
    }
  })
}
