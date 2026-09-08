import { createHash } from 'node:crypto'

import { z } from 'zod'

import prisma from '@/config/db-config'
import {
  canonicalJson,
  collaborationRecordSchema,
  MAX_COLLABORATION_RECORD_BYTES,
  MAX_COLLABORATION_RECORDS,
  MAX_COLLABORATION_TOTAL_BYTES,
} from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'
import {
  connectCollaboration,
  updateCollaborationPolicyWithAuthorityReceipt,
} from '@/services/repository-collaboration/binding-service'
import { prepareCollaborationUndo } from '@/services/repository-collaboration/archive-service'
import {
  decideDivergentCollaborationProposal,
  proposeDivergentCollaborationReconciliation,
} from '@/services/repository-collaboration/divergent-reconciliation-service'
import { consumeCollaborationAuthorityReceipt } from '@/services/repository-collaboration/authority-receipt-service'
import {
  decideCollaborationOperationWithAuthorityReceipt,
  executeCollaborationOperation,
  prepareCollaborationOperation,
  collaborationPublicDigest,
  normalizeCollaborationDigest,
} from '@/services/repository-collaboration/operation-service'
import {
  getCollaborationStatus,
  requireCollaborationOperationForProject,
} from '@/services/repository-collaboration/query-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'
import {
  claimCollaborationWork,
  completeCollaborationWork,
  heartbeatCollaborationWork,
  redeemCollaborationHandoffTicket,
  registerCollaborationWorker,
} from '@/services/repository-collaboration/worker-service'

const id = z.string().trim().min(1).max(200)
const target = z.string().trim().min(1)
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const policyVersion = z.number().int().positive()
const idempotencyKey = id
const recordArray = z.array(z.unknown()).min(1).max(MAX_COLLABORATION_RECORDS)
const standardDecisionRequest = z
  .object({
    target,
    operationId: id,
    expectedVersion: z.number().int().positive(),
    preparedDigest: sha256,
    decisions: z
      .array(
        z
          .object({
            recordKey: id,
            decision: z.enum(['KEEP_LOCAL', 'USE_INCOMING', 'EDIT']),
            editedRecord: z.unknown().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2_000),
  })
  .strict()
const divergentProposalDecisionRequest = z
  .object({
    target,
    operationId: id,
    expectedVersion: z.number().int().positive(),
    preparedDigest: sha256,
    reviewDigest: sha256,
    decision: z.enum(['ACCEPT', 'REJECT']),
  })
  .strict()

export const collaborationRequestSchemas = {
  connect: z
    .object({
      target,
      repositoryRoot: z.string().trim().min(1),
      remoteName: z.string().trim().min(1).max(200).optional(),
      trackedBranch: z.string().trim().min(1).max(300),
      portableProjectId: id.optional(),
    })
    .strict(),
  policyUpdate: z
    .object({
      target,
      expectedPolicyVersion: policyVersion,
      changes: z
        .object({
          OBSERVE: z.boolean().optional(),
          PREPARE: z.boolean().optional(),
          INTEGRATE: z.boolean().optional(),
          COMMIT: z.boolean().optional(),
          PUSH: z.boolean().optional(),
          RESOLVE: z.boolean().optional(),
          ARCHIVE: z.boolean().optional(),
        })
        .strict()
        .refine(value => Object.keys(value).length > 0, 'At least one policy change is required.'),
    })
    .strict(),
  prepare: z
    .object({
      target,
      intent: z.enum(['RECEIVE', 'PUBLISH']),
      idempotencyKey,
      expectedPolicyVersion: policyVersion,
      trigger: z.string().trim().min(1).max(200).optional(),
    })
    .strict(),
  get: z.object({ target, operationId: id }).strict(),
  resolutionPropose: z
    .object({
      target,
      operationId: id,
      expectedVersion: z.number().int().positive(),
      preparedDigest: sha256,
      records: recordArray,
    })
    .strict(),
  decide: z.union([standardDecisionRequest, divergentProposalDecisionRequest]),
  execute: z
    .object({
      target,
      operationId: id,
      expectedVersion: z.number().int().positive(),
      preparedDigest: sha256,
      idempotencyKey,
    })
    .strict(),
  undoPrepare: z
    .object({ target, operationId: id, expectedPolicyVersion: policyVersion, idempotencyKey, trigger: id.optional() })
    .strict(),
  workerRegister: z
    .object({
      target,
      workerIdentity: id,
      capabilities: z.array(id).min(1).max(100),
      ttlMs: z.number().int().min(5_000).max(300_000).optional(),
    })
    .strict(),
  workClaim: z
    .object({
      target,
      workerIdentity: id,
      sessionNonce: id,
      leaseMs: z.number().int().min(1_000).max(300_000).optional(),
    })
    .strict(),
  workHeartbeat: z
    .object({
      target,
      workerIdentity: id,
      sessionNonce: id,
      operationId: id,
      attemptId: id,
      fencingToken: z.number().int().positive(),
      leaseToken: id,
      leaseMs: z.number().int().min(1_000).max(300_000).optional(),
    })
    .strict(),
  workComplete: z
    .object({
      target,
      workerIdentity: id,
      sessionNonce: id,
      operationId: id,
      attemptId: id,
      fencingToken: z.number().int().positive(),
      leaseToken: id,
      proposal: z.object({ records: recordArray }).strict(),
    })
    .strict(),
  handoffRedeem: z.object({ target, token: id, redeemedBy: id }).strict(),
} as const

function principal(request: Request) {
  const fingerprint = request.headers.get('x-appraise-project')
  if (!fingerprint) throw new ServiceError('Coordinator project identity is missing.', 'UNAUTHORIZED', 403)
  return { trustedPrincipalId: `coordinator:${fingerprint}`, provenance: 'authenticated-host' as const }
}

async function bindingForTarget(targetReference: string) {
  const targetProject = await resolveTargetProject(targetReference)
  const binding = await prisma.collaborationBinding.findUnique({ where: { targetProjectId: targetProject.id } })
  if (!binding) throw new ServiceError('Repository collaboration is not connected for this target.', 'NOT_FOUND', 404)
  return { targetProject, binding }
}

function operationSummary(operation: {
  id: string
  intent: string
  state: string
  version: number
  preparedDigest: string | null
  acceptedDigest: string | null
  receiptHash: string | null
  sourceRevision: string | null
  targetRevision: string | null
  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
}) {
  return {
    id: operation.id,
    intent: operation.intent,
    state: operation.state,
    version: operation.version,
    preparedDigest: collaborationPublicDigest(operation.preparedDigest),
    acceptedDigest: collaborationPublicDigest(operation.acceptedDigest),
    receiptHash: collaborationPublicDigest(operation.receiptHash),
    sourceRevision: operation.sourceRevision,
    targetRevision: operation.targetRevision,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    completedAt: operation.completedAt,
  }
}

/** Stored collaboration hashes are bare SHA-256 values. Public coordinator
 * responses always expose their algorithm exactly once, including nested
 * divergent-review evidence. */
export function publicCollaborationHashes<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => publicCollaborationHashes(item)) as T
  if (!value || typeof value !== 'object' || value instanceof Date) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      (key.endsWith('Digest') || key.endsWith('Hash')) && typeof nested === 'string'
        ? collaborationPublicDigest(nested)
        : publicCollaborationHashes(nested),
    ]),
  ) as T
}

function records(value: unknown[]) {
  let totalBytes = 0
  return value.map(record => {
    const parsed = collaborationRecordSchema.parse(record)
    const bytes = Buffer.byteLength(canonicalJson(parsed))
    if (bytes > MAX_COLLABORATION_RECORD_BYTES)
      throw new ServiceError('A collaboration record exceeds the per-record byte limit.', 'VALIDATION', 413)
    totalBytes += bytes
    if (totalBytes > MAX_COLLABORATION_TOTAL_BYTES)
      throw new ServiceError('Collaboration records exceed the total byte limit.', 'VALIDATION', 413)
    return parsed
  })
}

function publicCollaborationStatus(status: Awaited<ReturnType<typeof getCollaborationStatus>>) {
  if (!status) return null
  return publicCollaborationHashes(status)
}

function ticketTokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function getRepositoryCollaborationRoute(request: Request, operation: string[]): Promise<Response | null> {
  if (operation.length !== 2 || operation[0] !== 'collaboration' || operation[1] !== 'status') return null
  const targetReference = target.parse(new URL(request.url).searchParams.get('target'))
  const targetProject = await resolveTargetProject(targetReference)
  return Response.json({
    targetProjectId: targetProject.id,
    collaboration: publicCollaborationStatus(await getCollaborationStatus(targetProject.id)),
  })
}

async function postConnect(request: Request, body: unknown) {
  const value = collaborationRequestSchemas.connect.parse(body)
  const targetProject = await resolveTargetProject(value.target)
  const binding = await connectCollaboration({ ...value, targetProjectId: targetProject.id, ...principal(request) })
  return Response.json(
    {
      targetProjectId: targetProject.id,
      binding: { id: binding.id, portableProjectId: binding.portableProjectId, policyVersion: binding.policyVersion },
    },
    { status: 201 },
  )
}

async function postPolicyUpdate(request: Request, body: unknown) {
  const value = collaborationRequestSchemas.policyUpdate.parse(body)
  const { targetProject, binding } = await bindingForTarget(value.target)
  const updated = await updateCollaborationPolicyWithAuthorityReceipt({
    bindingId: binding.id,
    changes: value.changes,
    expectedPolicyVersion: value.expectedPolicyVersion,
    authorityReceipt: request.headers.get('x-appraise-authority-receipt'),
    request: value,
  })
  return Response.json({
    targetProjectId: targetProject.id,
    binding: { id: updated.id, policyVersion: updated.policyVersion },
  })
}

async function postPrepare(_request: Request, body: unknown) {
  const value = collaborationRequestSchemas.prepare.parse(body)
  const { targetProject, binding } = await bindingForTarget(value.target)
  const prepared = await prepareCollaborationOperation({
    bindingId: binding.id,
    intent: value.intent,
    idempotencyKey: value.idempotencyKey,
    expectedPolicyVersion: value.expectedPolicyVersion,
    trigger: value.trigger,
  })
  return Response.json({ targetProjectId: targetProject.id, operation: operationSummary(prepared) })
}

async function postGet(_request: Request, body: unknown) {
  const value = collaborationRequestSchemas.get.parse(body)
  const targetProject = await resolveTargetProject(value.target)
  const operation = await requireCollaborationOperationForProject(value.operationId, targetProject.id)
  return Response.json({
    targetProjectId: targetProject.id,
    operation: operationSummary(operation),
    decisions: operation.decisions.map(decision => ({
      recordKey: decision.recordKey,
      decision: decision.kind,
      resolutionDigest: collaborationPublicDigest(decision.resolutionDigest),
      createdAt: decision.createdAt,
    })),
    journal: operation.journalEntries.map(entry => ({
      sequence: entry.sequence,
      boundary: entry.boundary,
      status: entry.status,
      createdAt: entry.createdAt,
    })),
  })
}

async function postResolutionPropose(_request: Request, body: unknown) {
  const value = collaborationRequestSchemas.resolutionPropose.parse(body)
  const targetProject = await resolveTargetProject(value.target)
  await requireCollaborationOperationForProject(value.operationId, targetProject.id)
  const result = await proposeDivergentCollaborationReconciliation({
    operationId: value.operationId,
    expectedVersion: value.expectedVersion,
    preparedDigest: normalizeCollaborationDigest(value.preparedDigest),
    records: records(value.records),
  })
  return Response.json({ targetProjectId: targetProject.id, result: publicCollaborationHashes(result) })
}

async function postDecide(request: Request, body: unknown) {
  const value = collaborationRequestSchemas.decide.parse(body)
  const targetProject = await resolveTargetProject(value.target)
  await requireCollaborationOperationForProject(value.operationId, targetProject.id)
  if ('reviewDigest' in value) {
    const operation = await prisma.collaborationOperation.findUnique({ where: { id: value.operationId } })
    if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
    const decided = await consumeCollaborationAuthorityReceipt(
      {
        token: request.headers.get('x-appraise-authority-receipt'),
        bindingId: operation.bindingId,
        action: 'DECIDE',
        operationId: operation.id,
        request: value,
      },
      (transaction, authority) => decideDivergentCollaborationProposal({ ...value, ...authority }, transaction),
    )
    return Response.json({ targetProjectId: targetProject.id, operation: operationSummary(decided) })
  }
  const decisions = value.decisions.map(decision =>
    decision.decision === 'EDIT'
      ? {
          recordKey: decision.recordKey,
          decision: decision.decision,
          editedRecord: collaborationRecordSchema.parse(decision.editedRecord),
        }
      : { recordKey: decision.recordKey, decision: decision.decision },
  )
  const decided = await decideCollaborationOperationWithAuthorityReceipt({
    operationId: value.operationId,
    expectedVersion: value.expectedVersion,
    preparedDigest: value.preparedDigest,
    decisions,
    authorityReceipt: request.headers.get('x-appraise-authority-receipt'),
    request: value,
  })
  return Response.json({ targetProjectId: targetProject.id, operation: operationSummary(decided) })
}

async function postExecute(_request: Request, body: unknown) {
  const value = collaborationRequestSchemas.execute.parse(body)
  const targetProject = await resolveTargetProject(value.target)
  await requireCollaborationOperationForProject(value.operationId, targetProject.id)
  const operation = await executeCollaborationOperation({
    operationId: value.operationId,
    expectedVersion: value.expectedVersion,
    preparedDigest: normalizeCollaborationDigest(value.preparedDigest),
    idempotencyKey: value.idempotencyKey,
  })
  return Response.json({ targetProjectId: targetProject.id, operation: operationSummary(operation) })
}

async function postUndoPrepare(_request: Request, body: unknown) {
  const value = collaborationRequestSchemas.undoPrepare.parse(body)
  const targetProject = await resolveTargetProject(value.target)
  await requireCollaborationOperationForProject(value.operationId, targetProject.id)
  const operation = await prepareCollaborationUndo({
    operationId: value.operationId,
    expectedPolicyVersion: value.expectedPolicyVersion,
    idempotencyKey: value.idempotencyKey,
    trigger: value.trigger,
  })
  return Response.json({ targetProjectId: targetProject.id, operation: operationSummary(operation) })
}

async function postWorkerRegister(request: Request, body: unknown) {
  const value = collaborationRequestSchemas.workerRegister.parse(body)
  const { targetProject, binding } = await bindingForTarget(value.target)
  const registration = await registerCollaborationWorker({
    bindingId: binding.id,
    workerIdentity: value.workerIdentity,
    capabilities: value.capabilities,
    ttlMs: value.ttlMs,
    ...principal(request),
  })
  return Response.json({
    targetProjectId: targetProject.id,
    worker: {
      workerIdentity: registration.worker.workerIdentity,
      connectionState: registration.worker.connectionState,
      expiresAt: registration.worker.expiresAt,
    },
    sessionNonce: registration.sessionNonce,
  })
}

async function postWorkClaim(_request: Request, body: unknown) {
  const value = collaborationRequestSchemas.workClaim.parse(body)
  const { targetProject, binding } = await bindingForTarget(value.target)
  return Response.json({
    targetProjectId: targetProject.id,
    work: await claimCollaborationWork({ ...value, bindingId: binding.id }),
  })
}

async function postWorkHeartbeat(_request: Request, body: unknown) {
  const value = collaborationRequestSchemas.workHeartbeat.parse(body)
  const { targetProject, binding } = await bindingForTarget(value.target)
  const operation = await heartbeatCollaborationWork({ ...value, bindingId: binding.id })
  return Response.json({ targetProjectId: targetProject.id, operation: operationSummary(operation) })
}

async function postWorkComplete(_request: Request, body: unknown) {
  const value = collaborationRequestSchemas.workComplete.parse(body)
  const { targetProject, binding } = await bindingForTarget(value.target)
  const operation = await completeCollaborationWork({ ...value, bindingId: binding.id })
  return Response.json({ targetProjectId: targetProject.id, operation: operationSummary(operation) })
}

async function postHandoffRedeem(_request: Request, body: unknown) {
  const value = collaborationRequestSchemas.handoffRedeem.parse(body)
  const { targetProject, binding } = await bindingForTarget(value.target)
  const ticket = await prisma.collaborationHandoffTicket.findUnique({
    where: { tokenHash: ticketTokenHash(value.token) },
  })
  if (!ticket || ticket.bindingId !== binding.id)
    throw new ServiceError('Handoff ticket belongs to another target or is unavailable.', 'NOT_FOUND', 404)
  const redeemed = await redeemCollaborationHandoffTicket({ token: value.token, redeemedBy: value.redeemedBy })
  return Response.json({
    targetProjectId: targetProject.id,
    operationId: redeemed.operationId,
    scope: publicCollaborationHashes(redeemed.scope),
  })
}

const postActions: Readonly<Record<string, (request: Request, body: unknown) => Promise<Response>>> = {
  connect: postConnect,
  'policy-update': postPolicyUpdate,
  prepare: postPrepare,
  get: postGet,
  'resolution-propose': postResolutionPropose,
  decide: postDecide,
  execute: postExecute,
  'undo-prepare': postUndoPrepare,
  'worker-register': postWorkerRegister,
  'work-claim': postWorkClaim,
  'work-heartbeat': postWorkHeartbeat,
  'work-complete': postWorkComplete,
  'handoff-redeem': postHandoffRedeem,
}

export async function postRepositoryCollaborationRoute(
  request: Request,
  operation: string[],
  body: unknown,
): Promise<Response | null> {
  if (operation[0] !== 'collaboration' || operation.length !== 2) return null
  const action = postActions[operation[1] ?? '']
  return action ? action(request, body) : null
}
