'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireActiveProjectForMutation } from '@/lib/active-project'
import { collaborationRecordSchema } from '@/lib/repository-collaboration'
import {
  connectCollaboration,
  cancelCollaborationOperation,
  createCollaborationHandoffTicket,
  decideCollaborationOperation,
  executeCollaborationOperation,
  getCollaborationStatus,
  prepareCollaborationOperation,
  recoverCollaborationOperationFilesystem,
  requireCollaborationOperationForProject,
  updateCollaborationPolicy,
} from '@/services/repository-collaboration'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

const projectSchema = z.object({ targetProjectId: z.string().uuid() }).strict()
const connectSchema = projectSchema
  .extend({
    trackedBranch: z.string().trim().min(1).max(255),
    remoteName: z.string().trim().min(1).max(255).default('origin'),
    portableProjectId: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
const prepareSchema = projectSchema
  .extend({
    intent: z.enum(['RECEIVE', 'PUBLISH', 'RECONCILE']),
    idempotencyKey: z.string().trim().min(1).max(255),
    incomingRecords: z.array(collaborationRecordSchema).optional(),
  })
  .strict()
const decisionSchema = projectSchema
  .extend({
    operationId: z.string().cuid(),
    expectedVersion: z.number().int().positive(),
    preparedDigest: z.string().min(1),
    decisions: z.array(
      z
        .object({
          recordKey: z.string().min(1),
          decision: z.enum(['KEEP_LOCAL', 'USE_INCOMING', 'EDIT']),
          editedRecord: collaborationRecordSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict()
const executeSchema = projectSchema
  .extend({
    operationId: z.string().cuid(),
    expectedVersion: z.number().int().positive(),
    preparedDigest: z.string().min(1),
    idempotencyKey: z.string().min(1),
    expectedFilesystemSnapshotHash: z.string().nullable().optional(),
  })
  .strict()
const recoverSchema = projectSchema.extend({ operationId: z.string().cuid() }).strict()
const cancelSchema = projectSchema.extend({ operationId: z.string().cuid() }).strict()
const handoffSchema = projectSchema.extend({ operationId: z.string().cuid() }).strict()
const policySchema = projectSchema
  .extend({
    changes: z.record(z.enum(['OBSERVE', 'PREPARE', 'INTEGRATE', 'COMMIT', 'PUSH', 'RESOLVE', 'ARCHIVE']), z.boolean()),
  })
  .strict()

function result(data: unknown): ActionResponse {
  revalidatePath('/collaboration')
  return { status: 200, success: true, data }
}

function failure(error: unknown): ActionResponse {
  return error instanceof ServiceError
    ? serviceErrorToActionResponse(error)
    : unknownErrorToActionResponse(error, 'Repository collaboration action failed')
}

async function scopedBinding(targetProjectId: string) {
  const project = await requireActiveProjectForMutation(targetProjectId)
  const status = await getCollaborationStatus(project.id)
  if (!status) throw new ServiceError('Connect repository collaboration first.', 'NOT_FOUND', 404)
  return { project, status }
}

export async function connectCollaborationAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = connectSchema.parse(input)
    const project = await requireActiveProjectForMutation(value.targetProjectId)
    if (!project.canonicalPath)
      throw new ServiceError('The active project is not a local workspace.', 'VALIDATION', 400)
    return result(
      await connectCollaboration({
        ...value,
        targetProjectId: project.id,
        repositoryRoot: project.canonicalPath,
        trustedPrincipalId: 'local-user',
        provenance: 'local-ui',
      }),
    )
  } catch (error) {
    return failure(error)
  }
}

export async function updateCollaborationPolicyAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = policySchema.parse(input)
    const { status } = await scopedBinding(value.targetProjectId)
    return result(
      await updateCollaborationPolicy({
        bindingId: status.id,
        changes: value.changes,
        trustedPrincipalId: 'local-user',
        provenance: 'local-ui',
      }),
    )
  } catch (error) {
    return failure(error)
  }
}

export async function prepareCollaborationAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = prepareSchema.parse(input)
    const { status } = await scopedBinding(value.targetProjectId)
    return result(
      await prepareCollaborationOperation({
        bindingId: status.id,
        intent: value.intent,
        idempotencyKey: value.idempotencyKey,
        expectedPolicyVersion: status.policyVersion,
        incomingRecords: value.incomingRecords,
        trigger: 'local-ui',
      }),
    )
  } catch (error) {
    return failure(error)
  }
}

export async function decideCollaborationAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = decisionSchema.parse(input)
    const project = await requireActiveProjectForMutation(value.targetProjectId)
    await requireCollaborationOperationForProject(value.operationId, project.id)
    return result(
      await decideCollaborationOperation({
        ...value,
        trustedPrincipalId: 'local-user',
        provenance: 'local-ui',
      }),
    )
  } catch (error) {
    return failure(error)
  }
}

export async function executeCollaborationAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = executeSchema.parse(input)
    const project = await requireActiveProjectForMutation(value.targetProjectId)
    await requireCollaborationOperationForProject(value.operationId, project.id)
    return result(await executeCollaborationOperation(value))
  } catch (error) {
    return failure(error)
  }
}

export async function recoverCollaborationFilesystemAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = recoverSchema.parse(input)
    const project = await requireActiveProjectForMutation(value.targetProjectId)
    await requireCollaborationOperationForProject(value.operationId, project.id)
    return result(await recoverCollaborationOperationFilesystem(value.operationId))
  } catch (error) {
    return failure(error)
  }
}

export async function cancelCollaborationAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = cancelSchema.parse(input)
    const project = await requireActiveProjectForMutation(value.targetProjectId)
    await requireCollaborationOperationForProject(value.operationId, project.id)
    return result(
      await cancelCollaborationOperation({ operationId: value.operationId, reason: 'Cancelled from Collaboration.' }),
    )
  } catch (error) {
    return failure(error)
  }
}

/** Creates one short-lived token for the visible operation; this never starts or wakes a desktop agent. */
export async function createCollaborationHandoffAction(input: unknown): Promise<ActionResponse> {
  try {
    const value = handoffSchema.parse(input)
    const { project, status } = await scopedBinding(value.targetProjectId)
    const operation = await requireCollaborationOperationForProject(value.operationId, project.id)
    const issued = await createCollaborationHandoffTicket({
      bindingId: status.id,
      operationId: operation.id,
      scope: {
        kind: 'INTERACTIVE_HANDOFF',
        operationId: operation.id,
        targetProjectId: project.id,
        preparedDigest: operation.preparedDigest,
      },
    })
    return result({
      token: issued.token,
      expiresAt: issued.ticket.expiresAt.toISOString(),
      bootstrap: `Appraise collaboration handoff token: ${issued.token}`,
    })
  } catch (error) {
    return failure(error)
  }
}
