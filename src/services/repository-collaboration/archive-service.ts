import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  canonicalJson,
  collaborationHash,
  collaborationRecordSchema,
  recordKey,
  resolvePreparedCollaboration,
  validateCollaborationGraph,
  type CollaborationRecord,
  type PreparedCollaborationRecord,
} from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'

import { requireCollaborationPermission } from './binding-service'
import { entityKindByRecordKind } from './materialization-helpers'
import {
  collaborationPublicDigest,
  prepareCollaborationOperation,
  type PrepareCollaborationOperationInput,
} from './operation-service'
import { projectSnapshotInTransaction } from './projection-helpers'

type Resolution = { decision: 'KEEP_LOCAL' | 'USE_INCOMING' | 'EDIT'; editedRecord?: CollaborationRecord }

export interface PrepareCollaborationArchiveInput {
  bindingId: string
  recordKeys: string[]
  expectedPolicyVersion: number
  idempotencyKey: string
  sourceRevision?: string
  trigger?: string
}

export interface PrepareCollaborationRestoreInput {
  bindingId: string
  records: CollaborationRecord[]
  expectedPolicyVersion: number
  idempotencyKey: string
  sourceRevision?: string
  trigger?: string
}

export interface RecordUnseenTombstoneInput {
  bindingId: string
  record: CollaborationRecord
  expectedPolicyVersion: number
  idempotencyKey: string
  sourceRevision?: string
}

export interface PrepareCollaborationUndoInput {
  operationId: string
  expectedPolicyVersion: number
  idempotencyKey: string
  trigger?: string
}

function operationInput(
  input: Omit<PrepareCollaborationOperationInput, 'intent' | 'incomingRecords'>,
  intent: PrepareCollaborationOperationInput['intent'],
  incomingRecords: CollaborationRecord[],
): PrepareCollaborationOperationInput {
  return { ...input, intent, incomingRecords }
}

function snapshotRecords(snapshot: Awaited<ReturnType<typeof projectSnapshotInTransaction>>): CollaborationRecord[] {
  return snapshot.manifest.records.map(entry => {
    const content = snapshot.files.get(entry.path)
    if (!content) throw new ServiceError(`Projection omitted ${entry.path}.`, 'INTERNAL', 500)
    return collaborationRecordSchema.parse(JSON.parse(content) as unknown)
  })
}

function orderedRecords(records: CollaborationRecord[]) {
  return validateCollaborationGraph(records).ordered
}

/** Local projections have no external revision counter; guard their authored state, not an incoming record version. */
function localStateHash(records: CollaborationRecord[]) {
  return collaborationHash(records.map(record => ({ ...record, version: 1 })))
}

function activeDependencies(record: CollaborationRecord): string[] {
  if (record.archived) return []
  switch (record.kind) {
    case 'module':
      return record.payload.parentPortableId ? [`module:${record.payload.parentPortableId}`] : []
    case 'test-suite':
      return [
        `module:${record.payload.modulePortableId}`,
        ...record.payload.testCasePortableIds.map(id => `test-case:${id}`),
        ...record.payload.tagPortableIds.map(id => `tag:${id}`),
      ]
    case 'test-case':
      return [
        ...record.payload.tagPortableIds.map(id => `tag:${id}`),
        ...record.payload.steps.flatMap(step =>
          step.parameters.flatMap(parameter =>
            parameter.locatorPortableId ? [`locator:${parameter.locatorPortableId}`] : [],
          ),
        ),
      ]
    case 'template':
      return record.payload.steps.flatMap(step =>
        step.parameters.flatMap(parameter =>
          parameter.locatorPortableId ? [`locator:${parameter.locatorPortableId}`] : [],
        ),
      )
    case 'locator-group':
      return [`module:${record.payload.modulePortableId}`]
    case 'locator':
      return [`locator-group:${record.payload.locatorGroupPortableId}`]
    default:
      return []
  }
}

function archiveReview(records: CollaborationRecord[], requestedKeys: Set<string>) {
  const byKey = new Map(records.map(record => [recordKey(record), record]))
  for (const key of requestedKeys) {
    const record = byKey.get(key)
    if (!record)
      throw new ServiceError(`Archive target ${key} is not an active collaboration record.`, 'NOT_FOUND', 404)
    if (record.archived) throw new ServiceError(`Archive target ${key} is already tombstoned.`, 'CONFLICT', 409)
  }
  const dependents = records
    .filter(record => !record.archived && !requestedKeys.has(recordKey(record)))
    .filter(record => activeDependencies(record).some(dependency => requestedKeys.has(dependency)))
    .map(recordKey)
  if (dependents.length > 0) {
    throw new ServiceError(
      `Archive requires reviewed handling for active dependents: ${dependents.sort().join(', ')}.`,
      'CONFLICT',
      409,
      { dependents: dependents.sort() },
    )
  }
}

function tombstone(record: CollaborationRecord): CollaborationRecord {
  return collaborationRecordSchema.parse({ ...record, archived: true, version: record.version + 1 })
}

/** A restored record may rely on an already-active local dependency. Include that exact projection in preparation. */
function restorationClosure(requested: CollaborationRecord[], projected: CollaborationRecord[]) {
  const requestedByKey = new Map(requested.map(record => [recordKey(record), record]))
  if (requestedByKey.size !== requested.length)
    throw new ServiceError('Restoration records must not repeat an identity.', 'VALIDATION', 400)
  const projectedByKey = new Map(projected.map(record => [recordKey(record), record]))
  const closure = new Map(requestedByKey)
  const pending = [...requested]
  while (pending.length) {
    const record = pending.pop()!
    for (const dependencyKey of activeDependencies(record)) {
      const dependency = requestedByKey.get(dependencyKey) ?? projectedByKey.get(dependencyKey)
      if (!dependency || dependency.archived) {
        throw new ServiceError(`Restore requires active dependency ${dependencyKey}.`, 'CONFLICT', 409)
      }
      if (!closure.has(dependencyKey)) {
        closure.set(dependencyKey, dependency)
        pending.push(dependency)
      }
    }
  }
  return orderedRecords([...closure.values()])
}

async function archivePreparation(input: PrepareCollaborationArchiveInput, client: PrismaClient) {
  return client.$transaction(async transaction => {
    const { binding } = await requireCollaborationPermission(
      transaction,
      input.bindingId,
      'ARCHIVE',
      input.expectedPolicyVersion,
    )
    const records = orderedRecords(snapshotRecords(await projectSnapshotInTransaction(transaction, binding.id)))
    const requestedKeys = new Set(input.recordKeys)
    if (requestedKeys.size === 0 || requestedKeys.size !== input.recordKeys.length) {
      throw new ServiceError('Archive targets must be a non-empty unique record-key set.', 'VALIDATION', 400)
    }
    archiveReview(records, requestedKeys)
    return records.filter(record => requestedKeys.has(recordKey(record))).map(tombstone)
  })
}

/** Prepares explicit tombstones; callers still review/decide and execute the durable operation. */
export async function prepareCollaborationArchive(
  input: PrepareCollaborationArchiveInput,
  client: PrismaClient = prisma,
) {
  const records = await archivePreparation(input, client)
  return prepareCollaborationOperation(
    operationInput(
      {
        bindingId: input.bindingId,
        idempotencyKey: input.idempotencyKey,
        expectedPolicyVersion: input.expectedPolicyVersion,
        sourceRevision: input.sourceRevision,
        trigger: input.trigger ?? 'archive-review',
      },
      'RECONCILE',
      records,
    ),
    client,
  )
}

async function restorePreparation(input: PrepareCollaborationRestoreInput, client: PrismaClient) {
  return client.$transaction(async transaction => {
    const { binding } = await requireCollaborationPermission(
      transaction,
      input.bindingId,
      'ARCHIVE',
      input.expectedPolicyVersion,
    )
    const requested = input.records.map(record => collaborationRecordSchema.parse(record))
    if (requested.some(record => record.archived)) {
      throw new ServiceError('Restoration requires complete active records, not tombstones.', 'VALIDATION', 400)
    }
    if (requested.some(record => record.portableProjectId !== binding.portableProjectId)) {
      throw new ServiceError('Portable project identity does not match the local binding.', 'CONFLICT', 409)
    }
    const records = restorationClosure(
      requested,
      snapshotRecords(await projectSnapshotInTransaction(transaction, binding.id)),
    )
    for (const record of requested) {
      const entityMap = await transaction.collaborationEntityMap.findUnique({
        where: {
          bindingId_kind_portableId: {
            bindingId: binding.id,
            kind: entityKindByRecordKind[record.kind],
            portableId: record.portableId,
          },
        },
        include: { baseline: true },
      })
      if (!entityMap?.archivedAt || !entityMap.baseline) {
        throw new ServiceError(`Restore requires an existing tombstone for ${recordKey(record)}.`, 'CONFLICT', 409)
      }
      const baseline = collaborationRecordSchema.parse(JSON.parse(entityMap.baseline.payloadJson) as unknown)
      if (!baseline.archived) {
        throw new ServiceError(`Restore baseline for ${recordKey(record)} is not a tombstone.`, 'CONFLICT', 409)
      }
    }
    return records
  })
}

/** Requires a full, dependency-closed active graph; restoring a tombstone never reuses a deleted identity. */
export async function prepareCollaborationRestore(
  input: PrepareCollaborationRestoreInput,
  client: PrismaClient = prisma,
) {
  const records = await restorePreparation(input, client)
  return prepareCollaborationOperation(
    operationInput(
      {
        bindingId: input.bindingId,
        idempotencyKey: input.idempotencyKey,
        expectedPolicyVersion: input.expectedPolicyVersion,
        sourceRevision: input.sourceRevision,
        trigger: input.trigger ?? 'restore-review',
      },
      'RECONCILE',
      records,
    ),
    client,
  )
}

function unseenTombstoneDigest(record: CollaborationRecord) {
  return collaborationHash({ kind: 'unseen-tombstone', record })
}

/** Stores an unseen incoming tombstone as baseline state without inventing a domain row. */
export async function recordUnseenCollaborationTombstone(
  input: RecordUnseenTombstoneInput,
  client: PrismaClient = prisma,
) {
  const record = collaborationRecordSchema.parse(input.record)
  if (!record.archived)
    throw new ServiceError('Only explicit tombstones may use the unseen archive path.', 'VALIDATION', 400)
  const requestDigest = unseenTombstoneDigest(record)
  return client.$transaction(async transaction => {
    const { binding } = await requireCollaborationPermission(
      transaction,
      input.bindingId,
      'ARCHIVE',
      input.expectedPolicyVersion,
    )
    await requireCollaborationPermission(transaction, input.bindingId, 'INTEGRATE', input.expectedPolicyVersion)
    if (record.portableProjectId !== binding.portableProjectId) {
      throw new ServiceError('Portable project identity does not match the local binding.', 'CONFLICT', 409)
    }
    const existingOperation = await transaction.collaborationOperation.findUnique({
      where: { bindingId_idempotencyKey: { bindingId: binding.id, idempotencyKey: input.idempotencyKey } },
    })
    if (existingOperation) {
      if (existingOperation.sourceSnapshotHash !== requestDigest || existingOperation.intent !== 'RECEIVE') {
        throw new ServiceError('The idempotency key belongs to a different operation.', 'CONFLICT', 409)
      }
      return existingOperation
    }
    const kind = entityKindByRecordKind[record.kind]
    const existingMap = await transaction.collaborationEntityMap.findUnique({
      where: { bindingId_kind_portableId: { bindingId: binding.id, kind, portableId: record.portableId } },
    })
    if (existingMap) {
      throw new ServiceError(
        `Known identity ${recordKey(record)} must use reviewed archive reconciliation.`,
        'CONFLICT',
        409,
      )
    }
    const now = new Date()
    const payloadHash = collaborationHash(record)
    const operation = await transaction.collaborationOperation.create({
      data: {
        bindingId: binding.id,
        intent: 'RECEIVE',
        trigger: 'incoming-unseen-tombstone',
        state: 'COMPLETED',
        idempotencyKey: input.idempotencyKey,
        sourceRevision: input.sourceRevision,
        sourceSnapshotHash: requestDigest,
        localReadSetHash: collaborationHash([]),
        policyVersion: binding.policyVersion,
        preparedJson: canonicalJson({ schema: 'appraise.repository-collaboration.unseen-tombstone/v1', record }),
        preparedDigest: requestDigest,
        acceptedDigest: requestDigest,
        receiptJson: canonicalJson({
          operation: 'unseen-tombstone',
          recordKey: recordKey(record),
          appliedAt: now.toISOString(),
        }),
        receiptHash: requestDigest,
        completedAt: now,
      },
    })
    const entityMap = await transaction.collaborationEntityMap.create({
      data: {
        bindingId: binding.id,
        kind,
        portableId: record.portableId,
        localEntityId: null,
        currentHash: payloadHash,
        archivedAt: now,
      },
    })
    await transaction.collaborationBaseline.create({
      data: {
        entityMapId: entityMap.id,
        payloadJson: canonicalJson(record),
        payloadHash,
        repositoryRevision: input.sourceRevision,
      },
    })
    await transaction.collaborationJournalEntry.createMany({
      data: [
        {
          operationId: operation.id,
          sequence: 1,
          boundary: 'DATABASE_BEFORE_IMAGE',
          status: 'COMMITTED',
          detailsJson: canonicalJson({ records: [], absence: recordKey(record) }),
        },
        {
          operationId: operation.id,
          sequence: 2,
          boundary: 'UNSEEN_TOMBSTONE_RECORDED',
          status: 'COMMITTED',
          detailsJson: canonicalJson({ recordKey: recordKey(record), localEntityId: null }),
        },
      ],
    })
    return {
      ...operation,
      preparedDigest: collaborationPublicDigest(operation.preparedDigest),
      acceptedDigest: collaborationPublicDigest(operation.acceptedDigest),
    }
  })
}

function beforeImage(operation: { journalEntries: Array<{ boundary: string; detailsJson: string }> }) {
  const entry = operation.journalEntries.find(item => item.boundary === 'DATABASE_BEFORE_IMAGE')
  if (!entry) throw new ServiceError('The operation has no database before-image for undo.', 'CONFLICT', 409)
  const parsed = JSON.parse(entry.detailsJson) as { records?: unknown }
  if (!Array.isArray(parsed.records) || parsed.records.length === 0) {
    throw new ServiceError('An unseen tombstone requires an explicit full-record restoration.', 'CONFLICT', 409)
  }
  return orderedRecords(parsed.records.map(record => collaborationRecordSchema.parse(record)))
}

function operationAfterImage(
  before: CollaborationRecord[],
  operation: { preparedJson: string | null; decisions: Array<{ recordKey: string; resolutionJson: string | null }> },
) {
  if (!operation.preparedJson) throw new ServiceError('The operation has no prepared data for undo.', 'CONFLICT', 409)
  const parsed = JSON.parse(operation.preparedJson) as { prepared?: PreparedCollaborationRecord[] }
  if (!Array.isArray(parsed.prepared))
    throw new ServiceError('The operation prepared data is invalid.', 'CONFLICT', 409)
  const decisions = new Map<string, Resolution>()
  for (const decision of operation.decisions) {
    if (!decision.resolutionJson) continue
    decisions.set(decision.recordKey, JSON.parse(decision.resolutionJson) as Resolution)
  }
  const after = new Map(before.map(record => [recordKey(record), record]))
  for (const record of resolvePreparedCollaboration(parsed.prepared, decisions)) after.set(recordKey(record), record)
  return orderedRecords([...after.values()])
}

async function undoPreparation(input: PrepareCollaborationUndoInput, client: PrismaClient) {
  return client.$transaction(async transaction => {
    const operation = await transaction.collaborationOperation.findUnique({
      where: { id: input.operationId },
      include: {
        decisions: { select: { recordKey: true, resolutionJson: true } },
        journalEntries: { orderBy: { sequence: 'asc' }, select: { boundary: true, detailsJson: true } },
      },
    })
    if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
    if (operation.intent === 'PUBLISH' || operation.state !== 'COMPLETED') {
      throw new ServiceError(
        'Published or incomplete operations require a new reviewed correction, not undo.',
        'CONFLICT',
        409,
      )
    }
    const { binding } = await requireCollaborationPermission(
      transaction,
      operation.bindingId,
      'ARCHIVE',
      input.expectedPolicyVersion,
    )
    const before = beforeImage(operation)
    const expectedAfter = operationAfterImage(before, operation)
    const current = orderedRecords(snapshotRecords(await projectSnapshotInTransaction(transaction, binding.id)))
    if (localStateHash(current) !== localStateHash(expectedAfter)) {
      throw new ServiceError(
        'Undo is stale because authored collaboration state changed after the operation.',
        'CONFLICT',
        409,
      )
    }
    return { bindingId: binding.id, records: before, sourceRevision: operation.sourceRevision }
  })
}

/** Prepares a normal durable UNDO operation only when the stored before-image still exactly matches current state. */
export async function prepareCollaborationUndo(input: PrepareCollaborationUndoInput, client: PrismaClient = prisma) {
  const prepared = await undoPreparation(input, client)
  return prepareCollaborationOperation(
    operationInput(
      {
        bindingId: prepared.bindingId,
        idempotencyKey: input.idempotencyKey,
        expectedPolicyVersion: input.expectedPolicyVersion,
        sourceRevision: prepared.sourceRevision ?? undefined,
        trigger: input.trigger ?? 'undo-review',
      },
      'UNDO',
      prepared.records,
    ),
    client,
  )
}
