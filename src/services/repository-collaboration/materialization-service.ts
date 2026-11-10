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
import { prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { planCollaborationMaterialization } from './materialization-plan'
import {
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

function snapshotInput(input: ApplyCollaborationRecordsInput): ApplyCollaborationRecordsInput {
  return { bindingId: input.bindingId, expectedPolicyVersion: input.expectedPolicyVersion,
    records: structuredClone(input.records), repositoryRevision: input.repositoryRevision,
    adoptedLocalIds: input.adoptedLocalIds ? new Map(input.adoptedLocalIds) : undefined }
}

export async function applyCollaborationRecordsInTransaction(
  transaction: Prisma.TransactionClient,
  input: ApplyCollaborationRecordsInput,
) {
  input = snapshotInput(input)
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
  const plan = await planCollaborationMaterialization(transaction, binding, ordered, input.adoptedLocalIds, now)
  const snapshotHash = collaborationHash(ordered)
  await prepareSharedResourceMutationInTransaction(transaction, binding.targetProjectId, plan.batch)
  // Mapping identities and every semantic branch/child ID were fixed before this first mapping writer.
  for (const data of plan.mapCreates) await transaction.collaborationEntityMap.create({ data })
  for (const mapping of plan.mapUpdates) await transaction.collaborationEntityMap.update({
    where: { id: mapping.id }, data: { localEntityId: mapping.localEntityId, archivedAt: null },
  })
  await materializeRecords(
    {
      transaction,
      binding,
      now,
      repositoryRevision: input.repositoryRevision,
      plan,
    },
    ordered,
  )
  await persistMaterializationBaselines(
    transaction,
    ordered,
    plan.entityMapIdByKey,
    recordKey,
    now,
    input.repositoryRevision,
  )
  return { applied: ordered.length, snapshotHash }
}

export async function applyCollaborationRecords(input: ApplyCollaborationRecordsInput, client: PrismaClient = prisma) {
  const request = snapshotInput(input)
  return client.$transaction(transaction => applyCollaborationRecordsInTransaction(transaction, request))
}
