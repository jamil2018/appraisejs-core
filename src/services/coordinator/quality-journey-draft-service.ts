import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import {
  hashQualityJourneyDraft,
  hashQualityJourneyRequirement,
  parseGuidedQualityJourneyRequirement,
  parseQualityJourneyDraftRequirement,
  type QualityJourneyDraftRequirement,
} from '@/lib/quality-journey'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'
import {
  createQualityJourneyInTransaction,
  submitDurableQualityJourneyCommandInTransaction,
} from './quality-journey-service'

type Db = PrismaClient | Prisma.TransactionClient
type DraftRow = Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyDraft']['findFirst']>>
const json = (value: unknown) => canonicalContractJson(value)
const hash = (value: unknown) => `sha256:${createHash('sha256').update(json(value)).digest('hex')}`

function projection(row: NonNullable<DraftRow>) {
  return {
    id: row.id,
    targetProjectId: row.targetProjectId,
    status: row.status,
    requirement: parseQualityJourneyDraftRequirement(JSON.parse(row.requirementJson)),
    currentStep: row.currentStep,
    predecessorJourneyId: row.predecessorJourneyId ?? undefined,
    version: row.version,
    draftHash: row.draftHash,
    confirmedJourneyId: row.confirmedJourneyId ?? undefined,
    updatedAt: row.updatedAt,
  }
}

async function scopedDraft(input: { draftId: string; targetProjectId: string }, db: Db) {
  const row = await db.qualityJourneyDraft.findFirst({
    where: { id: input.draftId, targetProjectId: input.targetProjectId },
  })
  if (!row) throw new ServiceError('This draft was not found in the active workspace.', 'NOT_FOUND')
  return row
}

function draftValues(input: {
  requirement: QualityJourneyDraftRequirement
  currentStep: number
  predecessorJourneyId?: string
  version: number
}) {
  const requirement = parseQualityJourneyDraftRequirement(input.requirement)
  return {
    requirement,
    currentStep: input.currentStep,
    predecessorJourneyId: input.predecessorJourneyId,
    draftHash: hashQualityJourneyDraft({
      requirement,
      predecessorJourneyId: input.predecessorJourneyId,
      version: input.version,
    }),
  }
}

export async function createQualityJourneyDraft(
  input: {
    targetProjectId: string
    idempotencyKey: string
    requirement?: unknown
    currentStep?: number
    predecessorJourneyId?: string
  },
  client: PrismaClient = prisma,
) {
  const requirement = parseQualityJourneyDraftRequirement(input.requirement ?? {})
  const currentStep = input.currentStep ?? 0
  if (!Number.isInteger(currentStep) || currentStep < 0 || currentStep > 3)
    throw new ServiceError('Draft step must be between 0 and 3.', 'VALIDATION')
  const requestHash = hash({ requirement, currentStep, predecessorJourneyId: input.predecessorJourneyId ?? null })
  const existing = await client.qualityJourneyDraft.findUnique({
    where: {
      targetProjectId_createIdempotencyKey: {
        targetProjectId: input.targetProjectId,
        createIdempotencyKey: input.idempotencyKey,
      },
    },
  })
  if (existing) {
    if (existing.createRequestHash !== requestHash)
      throw new ServiceError('Draft creation key was reused with different input.', 'CONFLICT')
    return { replayed: true, draft: projection(existing) }
  }
  const values = draftValues({ requirement, currentStep, predecessorJourneyId: input.predecessorJourneyId, version: 1 })
  const data = {
    targetProjectId: input.targetProjectId,
    createIdempotencyKey: input.idempotencyKey,
    createRequestHash: requestHash,
    requirementJson: json(values.requirement),
    currentStep: values.currentStep,
    predecessorJourneyId: values.predecessorJourneyId,
    version: 1,
    draftHash: values.draftHash,
  }
  let row
  try {
    row = await client.qualityJourneyDraft.create({ data })
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const raced = await client.qualityJourneyDraft.findUnique({
      where: {
        targetProjectId_createIdempotencyKey: {
          targetProjectId: input.targetProjectId,
          createIdempotencyKey: input.idempotencyKey,
        },
      },
    })
    if (!raced || raced.createRequestHash !== requestHash)
      throw new ServiceError('Draft creation key was reused with different input.', 'CONFLICT')
    return { replayed: true, draft: projection(raced) }
  }
  return { replayed: false, draft: projection(row) }
}

/** Copying a brief is intentionally not a follow-up: only an explicit linked
 * follow-up action may set predecessorJourneyId. */
export async function copyQualityJourneyBriefToDraft(
  input: { journeyId: string; targetProjectId: string; idempotencyKey: string },
  client: PrismaClient = prisma,
) {
  const journey = await client.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
    select: { activeRevisionIdsJson: true },
  })
  if (!journey) throw new ServiceError('This Quality Journey was not found in the active workspace.', 'NOT_FOUND')
  const active = JSON.parse(journey.activeRevisionIdsJson) as { journey?: string }
  const revision = active.journey
    ? await client.qualityJourneyRevision.findFirst({
        where: { id: active.journey, journey: { targetProjectId: input.targetProjectId } },
      })
    : null
  if (!revision) throw new ServiceError('The immutable Journey brief is unavailable.', 'CONFLICT')
  return createQualityJourneyDraft(
    {
      targetProjectId: input.targetProjectId,
      idempotencyKey: input.idempotencyKey,
      requirement: JSON.parse(revision.contentJson),
      currentStep: 0,
    },
    client,
  )
}

export async function getQualityJourneyDraft(input: { draftId: string; targetProjectId: string }, client: Db = prisma) {
  return projection(await scopedDraft(input, client))
}

export async function listQualityJourneyDrafts(
  input: { targetProjectId: string; status?: 'ACTIVE' | 'ARCHIVED' | 'CONFIRMED' },
  client: Db = prisma,
) {
  const rows = await client.qualityJourneyDraft.findMany({
    where: { targetProjectId: input.targetProjectId, ...(input.status ? { status: input.status } : {}) },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  })
  return rows.map(projection)
}

export async function saveQualityJourneyDraft(
  input: {
    draftId: string
    targetProjectId: string
    expectedVersion: number
    requirement: unknown
    currentStep: number
    predecessorJourneyId?: string
  },
  client: PrismaClient = prisma,
) {
  const requirement = parseQualityJourneyDraftRequirement(input.requirement)
  if (!Number.isInteger(input.currentStep) || input.currentStep < 0 || input.currentStep > 3)
    throw new ServiceError('Draft step must be between 0 and 3.', 'VALIDATION')
  const nextVersion = input.expectedVersion + 1
  const values = draftValues({
    requirement,
    currentStep: input.currentStep,
    predecessorJourneyId: input.predecessorJourneyId,
    version: nextVersion,
  })
  const changed = await client.qualityJourneyDraft.updateMany({
    where: {
      id: input.draftId,
      targetProjectId: input.targetProjectId,
      status: 'ACTIVE',
      version: input.expectedVersion,
    },
    data: {
      requirementJson: json(values.requirement),
      currentStep: values.currentStep,
      predecessorJourneyId: values.predecessorJourneyId ?? null,
      version: nextVersion,
      draftHash: values.draftHash,
    },
  })
  if (changed.count !== 1) {
    const current = await scopedDraft(input, client)
    if (current.status !== 'ACTIVE') throw new ServiceError('Confirmed or archived drafts cannot be saved.', 'CONFLICT')
    throw new ServiceError(
      'A newer saved version is available. Load it or save your edits as a new draft.',
      'CONFLICT',
      409,
      {
        current: projection(current),
      },
    )
  }
  return getQualityJourneyDraft({ draftId: input.draftId, targetProjectId: input.targetProjectId }, client)
}

async function moveDraft(
  input: { draftId: string; targetProjectId: string; expectedVersion: number; status: 'ACTIVE' | 'ARCHIVED' },
  client: PrismaClient,
) {
  const draft = await scopedDraft(input, client)
  const nextVersion = input.expectedVersion + 1
  const draftHash = hashQualityJourneyDraft({
    requirement: parseQualityJourneyDraftRequirement(JSON.parse(draft.requirementJson)),
    predecessorJourneyId: draft.predecessorJourneyId ?? undefined,
    version: nextVersion,
  })
  const changed = await client.qualityJourneyDraft.updateMany({
    where: {
      id: input.draftId,
      targetProjectId: input.targetProjectId,
      version: input.expectedVersion,
      status: { not: 'CONFIRMED' },
    },
    data: { status: input.status, version: nextVersion, draftHash },
  })
  if (changed.count !== 1)
    throw new ServiceError('This draft changed elsewhere. Reload it before trying again.', 'CONFLICT')
  return getQualityJourneyDraft({ draftId: input.draftId, targetProjectId: input.targetProjectId }, client)
}

export function archiveQualityJourneyDraft(
  input: { draftId: string; targetProjectId: string; expectedVersion: number },
  client: PrismaClient = prisma,
) {
  return moveDraft({ ...input, status: 'ARCHIVED' }, client)
}

export function restoreQualityJourneyDraft(
  input: { draftId: string; targetProjectId: string; expectedVersion: number },
  client: PrismaClient = prisma,
) {
  return moveDraft({ ...input, status: 'ACTIVE' }, client)
}

function replayConfirmedDraft(draft: NonNullable<DraftRow>, confirmationKey: string, requestHash: string) {
  if (
    draft.confirmationKey !== confirmationKey ||
    draft.confirmationRequestHash !== requestHash ||
    !draft.confirmedJourneyId
  )
    throw new ServiceError('This confirmed draft was retried with different confirmation input.', 'CONFLICT')
  return { replayed: true as const, journeyId: draft.confirmedJourneyId }
}

function guidedRequirementForConfirmation(draft: NonNullable<DraftRow>) {
  try {
    return parseGuidedQualityJourneyRequirement(JSON.parse(draft.requirementJson))
  } catch (error) {
    throw new ServiceError(
      error instanceof Error ? error.message : 'Complete the guided brief before confirming.',
      'VALIDATION',
    )
  }
}

async function createAndSubmitDraftJourney(
  draft: NonNullable<DraftRow>,
  input: { draftId: string; targetProjectId: string },
  confirmationKey: string,
  requirement: ReturnType<typeof parseGuidedQualityJourneyRequirement>,
  requirementHash: string,
  tx: Prisma.TransactionClient,
) {
  const created = await createQualityJourneyInTransaction(
    {
      targetProjectId: input.targetProjectId,
      idempotencyKey: confirmationKey,
      requirement,
      ...(draft.predecessorJourneyId ? { predecessorJourneyId: draft.predecessorJourneyId } : {}),
    },
    tx,
  )
  const journey = created.journey
  const revision = await tx.qualityJourneyRevision.findFirst({
    where: { id: journey.activeRevisionIds.journey, journeyId: journey.journeyId },
  })
  if (!revision || revision.contentHash !== requirementHash)
    throw new ServiceError('The saved brief could not be bound to its immutable Journey revision.', 'CONFLICT')
  const submitted = await submitDurableQualityJourneyCommandInTransaction(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: `submit-requirement:${input.draftId}`,
      journeyId: journey.journeyId,
      targetProjectId: input.targetProjectId,
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      expectedStateHash: journey.stateHash,
      idempotencyKey: `submit-requirement:${input.draftId}`,
      inputArtifactRefs: [],
      payload: { journeyRevisionId: journey.activeRevisionIds.journey, requirementHash },
    },
    tx,
  )
  if (submitted.outcome !== 'COMMITTED') throw new ServiceError('Requirement submission did not commit.', 'CONFLICT')
  return journey.journeyId
}

async function markDraftConfirmed(
  draft: NonNullable<DraftRow>,
  input: { targetProjectId: string; expectedVersion: number; expectedDraftHash: string },
  confirmation: { key: string; requestHash: string; requirementHash: string; journeyId: string },
  tx: Prisma.TransactionClient,
) {
  const confirmed = await tx.qualityJourneyDraft.updateMany({
    where: {
      id: draft.id,
      targetProjectId: input.targetProjectId,
      status: 'ACTIVE',
      version: input.expectedVersion,
      draftHash: input.expectedDraftHash,
    },
    data: {
      status: 'CONFIRMED',
      version: { increment: 1 },
      confirmationKey: confirmation.key,
      confirmationRequestHash: confirmation.requestHash,
      confirmedRequirementHash: confirmation.requirementHash,
      confirmedSourceVersion: input.expectedVersion,
      confirmedDraftHash: input.expectedDraftHash,
      confirmedJourneyId: confirmation.journeyId,
      confirmedAt: new Date(),
    },
  })
  if (confirmed.count !== 1)
    throw new ServiceError('Draft confirmation conflicted. Reload before retrying.', 'CONFLICT')
}

export async function confirmQualityJourneyDraft(
  input: {
    draftId: string
    targetProjectId: string
    expectedVersion: number
    expectedDraftHash: string
    requirementHash: string
  },
  client: PrismaClient = prisma,
) {
  const confirmationKey = `draft-confirm:${input.draftId}`
  const requestHash = hash({ ...input, confirmationKey })
  return client.$transaction(async tx => {
    const draft = await scopedDraft(input, tx)
    if (draft.status === 'CONFIRMED') return replayConfirmedDraft(draft, confirmationKey, requestHash)
    if (draft.status !== 'ACTIVE') throw new ServiceError('Restore this draft before confirming it.', 'CONFLICT')
    if (draft.version !== input.expectedVersion || draft.draftHash !== input.expectedDraftHash)
      throw new ServiceError('A newer saved version is available. Reload before confirming.', 'CONFLICT')
    const requirement = guidedRequirementForConfirmation(draft)
    const normalizedRequirementHash = hashQualityJourneyRequirement(requirement)
    if (normalizedRequirementHash !== input.requirementHash)
      throw new ServiceError('The saved brief changed. Reload the review before confirming.', 'CONFLICT')
    const journeyId = await createAndSubmitDraftJourney(
      draft,
      input,
      confirmationKey,
      requirement,
      normalizedRequirementHash,
      tx,
    )
    await markDraftConfirmed(
      draft,
      input,
      { key: confirmationKey, requestHash, requirementHash: normalizedRequirementHash, journeyId },
      tx,
    )
    return { replayed: false, journeyId }
  })
}
