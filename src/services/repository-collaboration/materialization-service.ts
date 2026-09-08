import { randomUUID } from 'node:crypto'

import type { Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  collaborationHash,
  recordKey,
  validateCollaborationGraph,
  type CollaborationRecord,
} from '@/lib/repository-collaboration'
import { requireCollaborationPermission } from '@/services/repository-collaboration/binding-service'
import { ServiceError } from '@/services/shared/errors'
import {
  createCollisionChecker,
  entityKindByRecordKind,
  materializeRecords,
  persistMaterializationBaselines,
  validateExactSteps,
} from './materialization-helpers'

export interface ApplyCollaborationRecordsInput {
  bindingId: string
  records: CollaborationRecord[]
  expectedPolicyVersion: number
  repositoryRevision?: string
  adoptedLocalIds?: Map<string, string>
}

function recordMapKey(record: Pick<CollaborationRecord, 'kind' | 'portableId'>) {
  return `${entityKindByRecordKind[record.kind]}:${record.portableId}`
}

async function ensureIdentityMaps(
  transaction: Prisma.TransactionClient,
  bindingId: string,
  records: CollaborationRecord[],
  adoptedLocalIds: Map<string, string> | undefined,
  now: Date,
) {
  const existingMaps = await transaction.collaborationEntityMap.findMany({ where: { bindingId } })
  const localIdByKey = new Map(
    existingMaps.map(mapping => [`${mapping.kind}:${mapping.portableId}`, mapping.localEntityId]),
  )
  const entityMapIdByKey = new Map(existingMaps.map(mapping => [`${mapping.kind}:${mapping.portableId}`, mapping.id]))
  for (const record of records) {
    const key = recordMapKey(record)
    if (entityMapIdByKey.has(key)) continue
    const localEntityId = adoptedLocalIds?.get(recordKey(record)) ?? (record.archived ? null : randomUUID())
    const mapping = await transaction.collaborationEntityMap.create({
      data: {
        bindingId,
        kind: entityKindByRecordKind[record.kind],
        portableId: record.portableId,
        localEntityId,
        archivedAt: record.archived ? now : null,
      },
    })
    entityMapIdByKey.set(key, mapping.id)
    localIdByKey.set(key, localEntityId)
  }
  return { localIdByKey, entityMapIdByKey }
}

function localIdResolver(localIdByKey: Map<string, string | null>) {
  return (record: Pick<CollaborationRecord, 'kind' | 'portableId'>) => {
    const localId = localIdByKey.get(recordMapKey(record))
    if (!localId) throw new ServiceError(`Missing local identity for ${recordKey(record)}.`, 'INTERNAL', 500)
    return localId
  }
}

export async function applyCollaborationRecords(input: ApplyCollaborationRecordsInput, client: PrismaClient = prisma) {
  return client.$transaction(async transaction => {
    const { binding } = await requireCollaborationPermission(
      transaction,
      input.bindingId,
      'INTEGRATE',
      input.expectedPolicyVersion,
    )
    if (input.records.some(record => record.portableProjectId !== binding.portableProjectId)) {
      throw new ServiceError('Portable project identity does not match the local binding.', 'CONFLICT', 409)
    }
    const { ordered } = validateCollaborationGraph(input.records)
    await validateExactSteps(transaction, ordered)
    const now = new Date()
    const { localIdByKey, entityMapIdByKey } = await ensureIdentityMaps(
      transaction,
      binding.id,
      ordered,
      input.adoptedLocalIds,
      now,
    )
    const localIdFor = localIdResolver(localIdByKey)
    const entityMapIdFor = (record: Pick<CollaborationRecord, 'kind' | 'portableId'>) => {
      const id = entityMapIdByKey.get(recordMapKey(record))
      if (!id) throw new ServiceError(`Missing collaboration map for ${recordKey(record)}.`, 'INTERNAL', 500)
      return id
    }
    const assertNoCollision = createCollisionChecker(transaction, input.adoptedLocalIds, localIdFor)
    await materializeRecords(
      {
        transaction,
        binding,
        now,
        repositoryRevision: input.repositoryRevision,
        localIdFor,
        entityMapIdFor,
        assertNoCollision,
      },
      ordered,
    )
    await persistMaterializationBaselines(
      transaction,
      ordered,
      entityMapIdByKey,
      recordMapKey,
      now,
      input.repositoryRevision,
    )
    return { applied: ordered.length, snapshotHash: collaborationHash(ordered) }
  })
}
