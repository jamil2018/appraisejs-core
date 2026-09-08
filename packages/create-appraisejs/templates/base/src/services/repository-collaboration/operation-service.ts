import type {
  CollaborationDecisionKind,
  CollaborationOperation,
  CollaborationOperationIntent,
  Prisma,
  PrismaClient,
} from '@prisma/client'

import prisma from '@/config/db-config'
import {
  buildCollaborationSnapshotFiles,
  canonicalJson,
  collaborationHash,
  collaborationRecordSchema,
  prepareThreeWayCollaboration,
  recordKey,
  recoverCollaborationSnapshot,
  resolvePreparedCollaboration,
  installCollaborationSnapshot,
  validateCollaborationGraph,
  type CollaborationRecord,
  type PreparedCollaborationRecord,
} from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'

import { requireCollaborationPermission } from './binding-service'
import { appendCollaborationJournalEntry as appendJournal } from './collaboration-journal-service'
import { applyCollaborationRecordsInTransaction } from './materialization-service'
import { projectSnapshotInTransaction } from './projection-helpers'

type Transaction = Prisma.TransactionClient
type Resolution = { decision: 'KEEP_LOCAL' | 'USE_INCOMING' | 'EDIT'; editedRecord?: CollaborationRecord }

const trustedProvenance = ['local-ui', 'authenticated-host'] as const
type TrustedProvenance = (typeof trustedProvenance)[number]

interface PreparedOperationPayload {
  schema: 'appraise.repository-collaboration.operation/v1'
  incoming: CollaborationRecord[]
  local: CollaborationRecord[]
  baselines: CollaborationRecord[]
  prepared: PreparedCollaborationRecord[]
  localReadSetHash: string
}

export interface PrepareCollaborationOperationInput {
  bindingId: string
  intent: CollaborationOperationIntent
  idempotencyKey: string
  expectedPolicyVersion: number
  incomingRecords?: CollaborationRecord[]
  sourceRevision?: string
  targetRevision?: string
  trigger?: string
}

export interface DecideCollaborationOperationInput {
  operationId: string
  expectedVersion: number
  preparedDigest: string
  decisions: Array<{
    recordKey: string
    decision: 'KEEP_LOCAL' | 'USE_INCOMING' | 'EDIT'
    editedRecord?: CollaborationRecord
  }>
  trustedPrincipalId: string
  provenance: TrustedProvenance
}

export interface ExecuteCollaborationOperationInput {
  operationId: string
  expectedVersion: number
  preparedDigest: string
  idempotencyKey: string
  expectedFilesystemSnapshotHash?: string | null
}

function operationInputDigest(input: PrepareCollaborationOperationInput, incoming: CollaborationRecord[]) {
  return collaborationHash({
    bindingId: input.bindingId,
    intent: input.intent,
    sourceRevision: input.sourceRevision ?? null,
    targetRevision: input.targetRevision ?? null,
    incoming,
  })
}

function parseRecordArray(value: unknown): CollaborationRecord[] {
  if (!Array.isArray(value)) throw new ServiceError('Prepared operation data is invalid.', 'CONFLICT', 409)
  return value.map(record => collaborationRecordSchema.parse(record))
}

function parsePreparedOperation(value: string | null): PreparedOperationPayload {
  if (!value) throw new ServiceError('The operation has not been prepared.', 'CONFLICT', 409)
  const parsed = JSON.parse(value) as Partial<PreparedOperationPayload>
  if (parsed.schema !== 'appraise.repository-collaboration.operation/v1' || !Array.isArray(parsed.prepared)) {
    throw new ServiceError('Prepared operation data is invalid.', 'CONFLICT', 409)
  }
  return {
    schema: parsed.schema,
    incoming: parseRecordArray(parsed.incoming),
    local: parseRecordArray(parsed.local),
    baselines: parseRecordArray(parsed.baselines),
    prepared: parsed.prepared as PreparedCollaborationRecord[],
    localReadSetHash: String(parsed.localReadSetHash ?? ''),
  }
}

function dependencyClosed(records: CollaborationRecord[]): CollaborationRecord[] {
  try {
    return validateCollaborationGraph(records).ordered
  } catch (error) {
    throw new ServiceError(
      error instanceof Error
        ? `Incoming snapshot is not dependency-closed: ${error.message}`
        : 'Incoming snapshot is invalid.',
      'VALIDATION',
      400,
    )
  }
}

function buildPreparedPayload(
  incoming: CollaborationRecord[],
  local: CollaborationRecord[],
  baselines: CollaborationRecord[],
): PreparedOperationPayload {
  const prepared = prepareThreeWayCollaboration({
    incoming,
    localByKey: new Map(local.map(record => [recordKey(record), record])),
    baselineByKey: new Map(baselines.map(record => [recordKey(record), record])),
  })
  return {
    schema: 'appraise.repository-collaboration.operation/v1',
    incoming,
    local,
    baselines,
    prepared,
    localReadSetHash: collaborationHash(local),
  }
}

function snapshotRecords(snapshot: Awaited<ReturnType<typeof projectSnapshotInTransaction>>): CollaborationRecord[] {
  return [...snapshot.files]
    .filter(([file]) => file !== 'manifest.json')
    .map(([, content]) => collaborationRecordSchema.parse(JSON.parse(content) as unknown))
}

function incomingRecords(
  input: PrepareCollaborationOperationInput,
  localSnapshot: Awaited<ReturnType<typeof projectSnapshotInTransaction>>,
) {
  return dependencyClosed(input.incomingRecords ?? snapshotRecords(localSnapshot))
}

function assertMatchingPortableProject(records: CollaborationRecord[], portableProjectId: string) {
  if (records.some(record => record.portableProjectId !== portableProjectId)) {
    throw new ServiceError('Portable project identity does not match the local binding.', 'CONFLICT', 409)
  }
}

function assertIdempotentOperation(
  existing: CollaborationOperation,
  input: PrepareCollaborationOperationInput,
  requestDigest: string,
) {
  if (existing.sourceSnapshotHash !== requestDigest || existing.intent !== input.intent) {
    throw new ServiceError('The idempotency key belongs to a different operation.', 'CONFLICT', 409)
  }
  return existing
}

async function findIdempotentOperation(
  transaction: Transaction,
  bindingId: string,
  input: PrepareCollaborationOperationInput,
  requestDigest: string,
) {
  const existing = await transaction.collaborationOperation.findUnique({
    where: { bindingId_idempotencyKey: { bindingId, idempotencyKey: input.idempotencyKey } },
  })
  return existing ? assertIdempotentOperation(existing, input, requestDigest) : null
}

async function createPreparedOperation(
  transaction: Transaction,
  input: PrepareCollaborationOperationInput,
  binding: { id: string; policyVersion: number },
  payload: PreparedOperationPayload,
  requestDigest: string,
) {
  const preparedDigest = collaborationHash(payload)
  const requiresDecision = requiredDecisionKeys(payload).size > 0
  const operation = await transaction.collaborationOperation.create({
    data: {
      bindingId: binding.id,
      intent: input.intent,
      trigger: input.trigger ?? 'local-ui',
      state: requiresDecision ? 'WAITING_FOR_DECISION' : 'READY',
      idempotencyKey: input.idempotencyKey,
      sourceRevision: input.sourceRevision,
      targetRevision: input.targetRevision,
      sourceSnapshotHash: requestDigest,
      localReadSetHash: payload.localReadSetHash,
      policyVersion: binding.policyVersion,
      preparedJson: canonicalJson(payload),
      preparedDigest,
      acceptedDigest: requiresDecision ? null : preparedDigest,
    },
  })
  await appendJournal(transaction, operation.id, 'PREPARED', {
    preparedDigest,
    localReadSetHash: payload.localReadSetHash,
    dependencyClosed: true,
  })
  return operation
}

async function baselineRecords(transaction: Transaction, bindingId: string): Promise<CollaborationRecord[]> {
  const maps = await transaction.collaborationEntityMap.findMany({
    where: { bindingId, baseline: { isNot: null } },
    include: { baseline: true },
  })
  return maps.map(map => collaborationRecordSchema.parse(JSON.parse(map.baseline!.payloadJson) as unknown))
}

function requiredDecisionKeys(prepared: PreparedOperationPayload): Set<string> {
  return new Set(prepared.prepared.filter(record => record.requiresDecision).map(record => record.recordKey))
}

function decisionMap(
  decisions: Array<{ recordKey: string; kind: CollaborationDecisionKind; resolutionJson: string | null }>,
): Map<string, Resolution> {
  const result = new Map<string, Resolution>()
  for (const decision of decisions) {
    if (decision.kind === 'ACCEPT' || decision.kind === 'REJECT') continue
    const resolution = decision.resolutionJson ? (JSON.parse(decision.resolutionJson) as Resolution) : undefined
    if (!resolution) continue
    result.set(decision.recordKey, resolution)
  }
  return result
}

function assertTrustedProvenance(provenance: string): asserts provenance is TrustedProvenance {
  if (!trustedProvenance.includes(provenance as TrustedProvenance)) {
    throw new ServiceError('Decision provenance is not trusted.', 'UNAUTHORIZED', 403)
  }
}

async function appendFilesystemBoundary(
  client: PrismaClient,
  operationId: string,
  boundary: { boundary: string; stagingPath: string; backupPath: string },
) {
  await client.$transaction(async transaction => {
    await appendJournal(transaction, operationId, `FILESYSTEM_${boundary.boundary}`, boundary)
    const operation = await transaction.collaborationOperation.findUniqueOrThrow({ where: { id: operationId } })
    const journal = JSON.parse(operation.mutationJournalJson) as unknown[]
    journal.push({ boundary: boundary.boundary, stagingPath: boundary.stagingPath, backupPath: boundary.backupPath })
    await transaction.collaborationOperation.update({
      where: { id: operationId },
      data: { mutationJournalJson: canonicalJson(journal) },
    })
  })
}

function assertDecisionOperation(operation: CollaborationOperation, input: DecideCollaborationOperationInput) {
  if (operation.version !== input.expectedVersion || operation.preparedDigest !== input.preparedDigest) {
    throw new ServiceError('The prepared operation is stale.', 'CONFLICT', 409)
  }
  if (operation.state !== 'WAITING_FOR_DECISION' && operation.state !== 'READY') {
    throw new ServiceError('The operation is not awaiting a decision.', 'CONFLICT', 409)
  }
}

function validateDecisionInput(
  prepared: PreparedOperationPayload,
  decisions: DecideCollaborationOperationInput['decisions'],
) {
  const required = requiredDecisionKeys(prepared)
  for (const decision of decisions) {
    if (!required.has(decision.recordKey)) {
      throw new ServiceError(`Decision is not applicable to ${decision.recordKey}.`, 'VALIDATION', 400)
    }
    if (decision.decision === 'EDIT') validateEditedDecision(decision)
  }
  return required
}

function validateEditedDecision(decision: DecideCollaborationOperationInput['decisions'][number]) {
  if (!decision.editedRecord || recordKey(decision.editedRecord) !== decision.recordKey) {
    throw new ServiceError(`Edited decision identity mismatch for ${decision.recordKey}.`, 'VALIDATION', 400)
  }
  collaborationRecordSchema.parse(decision.editedRecord)
}

async function persistDecisions(
  transaction: Transaction,
  operation: CollaborationOperation,
  input: DecideCollaborationOperationInput,
) {
  for (const decision of input.decisions) {
    const resolution: Resolution = { decision: decision.decision, editedRecord: decision.editedRecord }
    const resolutionDigest = collaborationHash(resolution)
    await transaction.collaborationDecision.upsert({
      where: {
        operationId_recordKey_resolutionDigest: {
          operationId: operation.id,
          recordKey: decision.recordKey,
          resolutionDigest,
        },
      },
      create: {
        operationId: operation.id,
        recordKey: decision.recordKey,
        kind: decision.decision,
        resolutionJson: canonicalJson(resolution),
        resolutionDigest,
        trustedPrincipalId: input.trustedPrincipalId,
        provenance: input.provenance,
      },
      update: { trustedPrincipalId: input.trustedPrincipalId, provenance: input.provenance },
    })
  }
  return transaction.collaborationDecision.findMany({ where: { operationId: operation.id } })
}

async function finalizeDecision(
  transaction: Transaction,
  operation: CollaborationOperation,
  preparedDigest: string,
  required: Set<string>,
  persisted: Awaited<ReturnType<typeof transaction.collaborationDecision.findMany>>,
) {
  const covered = new Set(persisted.map(decision => decision.recordKey))
  const ready = [...required].every(key => covered.has(key))
  const acceptedDigest = ready ? collaborationHash({ prepared: preparedDigest, decisions: [...persisted] }) : null
  const updated = await transaction.collaborationOperation.update({
    where: { id: operation.id },
    data: { state: ready ? 'READY' : 'WAITING_FOR_DECISION', acceptedDigest, version: { increment: 1 } },
  })
  await appendJournal(transaction, operation.id, 'DECISION_RECORDED', { ready, preparedDigest })
  return updated
}

export async function prepareCollaborationOperation(
  input: PrepareCollaborationOperationInput,
  client: PrismaClient = prisma,
) {
  if (!input.idempotencyKey.trim()) throw new ServiceError('An idempotency key is required.', 'VALIDATION', 400)
  return client.$transaction(async transaction => {
    const { binding } = await requireCollaborationPermission(
      transaction,
      input.bindingId,
      'PREPARE',
      input.expectedPolicyVersion,
    )
    const localSnapshot = await projectSnapshotInTransaction(transaction, binding.id)
    const incoming = incomingRecords(input, localSnapshot)
    assertMatchingPortableProject(incoming, binding.portableProjectId)
    const requestDigest = operationInputDigest(input, incoming)
    const existing = await findIdempotentOperation(transaction, binding.id, input, requestDigest)
    if (existing) return existing
    const local = dependencyClosed(snapshotRecords(localSnapshot))
    const baselines = input.intent === 'PUBLISH' ? local : await baselineRecords(transaction, binding.id)
    const payload = buildPreparedPayload(incoming, local, baselines)
    return createPreparedOperation(transaction, input, binding, payload, requestDigest)
  })
}

export async function decideCollaborationOperation(
  input: DecideCollaborationOperationInput,
  client: PrismaClient = prisma,
) {
  assertTrustedProvenance(input.provenance)
  return client.$transaction(async transaction => {
    const operation = await transaction.collaborationOperation.findUnique({ where: { id: input.operationId } })
    if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
    await requireCollaborationPermission(transaction, operation.bindingId, 'RESOLVE', operation.policyVersion)
    assertDecisionOperation(operation, input)
    const prepared = parsePreparedOperation(operation.preparedJson)
    const required = validateDecisionInput(prepared, input.decisions)
    const persisted = await persistDecisions(transaction, operation, input)
    return finalizeDecision(transaction, operation, input.preparedDigest, required, persisted)
  })
}

async function currentSnapshotRecords(transaction: Transaction, bindingId: string): Promise<CollaborationRecord[]> {
  const snapshot = await projectSnapshotInTransaction(transaction, bindingId)
  return dependencyClosed(snapshotRecords(snapshot))
}

function resolveForExecution(prepared: PreparedOperationPayload, decisions: Map<string, Resolution>) {
  try {
    return resolvePreparedCollaboration(prepared.prepared, decisions)
  } catch (error) {
    throw new ServiceError(
      error instanceof Error ? error.message : 'Operation decisions are incomplete.',
      'CONFLICT',
      409,
    )
  }
}

async function loadExecution(
  transaction: Transaction,
  input: ExecuteCollaborationOperationInput,
  permission: 'INTEGRATE' | 'COMMIT',
) {
  const operation = await transaction.collaborationOperation.findUnique({ where: { id: input.operationId } })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  await requireCollaborationPermission(transaction, operation.bindingId, permission, operation.policyVersion)
  if (
    operation.version !== input.expectedVersion ||
    operation.preparedDigest !== input.preparedDigest ||
    operation.idempotencyKey !== input.idempotencyKey
  ) {
    throw new ServiceError('The operation execution request is stale.', 'CONFLICT', 409)
  }
  if (operation.state !== 'READY' || !operation.acceptedDigest) {
    throw new ServiceError('The operation is not accepted for execution.', 'CONFLICT', 409)
  }
  return operation
}

async function completeOperation(
  transaction: Transaction,
  operationId: string,
  receipt: Record<string, unknown>,
  journalBoundary: string,
) {
  const completed = await transaction.collaborationOperation.update({
    where: { id: operationId },
    data: {
      state: 'COMPLETED',
      receiptJson: canonicalJson(receipt),
      receiptHash: collaborationHash(receipt),
      completedAt: new Date(),
      version: { increment: 1 },
    },
  })
  await appendJournal(transaction, operationId, journalBoundary, receipt)
  return completed
}

async function executeDatabaseOperation(input: ExecuteCollaborationOperationInput, client: PrismaClient) {
  return client.$transaction(async transaction => {
    const operation = await loadExecution(transaction, input, 'INTEGRATE')
    const prepared = parsePreparedOperation(operation.preparedJson)
    const current = await currentSnapshotRecords(transaction, operation.bindingId)
    if (collaborationHash(current) !== operation.localReadSetHash) {
      throw new ServiceError('Local authored data changed after preparation.', 'CONFLICT', 409)
    }
    const decisions = decisionMap(
      await transaction.collaborationDecision.findMany({ where: { operationId: operation.id } }),
    )
    const resolved = dependencyClosed(resolveForExecution(prepared, decisions))
    await appendJournal(transaction, operation.id, 'DATABASE_BEFORE_IMAGE', { records: current })
    await applyCollaborationRecordsInTransaction(transaction, {
      bindingId: operation.bindingId,
      records: resolved,
      expectedPolicyVersion: operation.policyVersion,
      repositoryRevision: operation.sourceRevision ?? undefined,
    })
    const receipt = {
      operationId: operation.id,
      preparedDigest: operation.preparedDigest,
      acceptedDigest: operation.acceptedDigest,
      appliedSnapshotHash: collaborationHash(resolved),
      appliedAt: new Date().toISOString(),
    }
    return completeOperation(transaction, operation.id, receipt, 'DATABASE_APPLIED')
  })
}

async function executePublication(input: ExecuteCollaborationOperationInput, client: PrismaClient) {
  const applying = await client.$transaction(async transaction => {
    const operation = await loadExecution(transaction, input, 'COMMIT')
    const current = await currentSnapshotRecords(transaction, operation.bindingId)
    if (collaborationHash(current) !== operation.localReadSetHash) {
      throw new ServiceError('Local authored data changed after preparation.', 'CONFLICT', 409)
    }
    const updated = await transaction.collaborationOperation.update({
      where: { id: operation.id },
      data: { state: 'APPLYING', version: { increment: 1 } },
      include: { binding: true },
    })
    await appendJournal(transaction, operation.id, 'PUBLICATION_STARTED', {
      localReadSetHash: operation.localReadSetHash,
    })
    return { operation: updated, records: current }
  })
  const snapshot = buildCollaborationSnapshotFiles(applying.records, applying.operation.binding.portableProjectId)
  const installed = await installCollaborationSnapshot({
    repositoryRoot: applying.operation.binding.repositoryRoot,
    operationId: applying.operation.id,
    snapshot,
    expectedPreviousSnapshotHash: input.expectedFilesystemSnapshotHash ?? null,
    onBoundary: boundary => appendFilesystemBoundary(client, applying.operation.id, boundary),
  })
  if (installed.status !== 'succeeded') {
    await client.collaborationOperation.update({
      where: { id: applying.operation.id },
      data: { state: 'BLOCKED', blockerJson: canonicalJson(installed) },
    })
    throw new ServiceError('Repository collaboration files changed outside this operation.', 'CONFLICT', 409, installed)
  }
  return client.$transaction(async transaction => {
    const operation = await transaction.collaborationOperation.findUniqueOrThrow({
      where: { id: applying.operation.id },
    })
    if (operation.state !== 'APPLYING' || operation.version !== applying.operation.version) {
      throw new ServiceError('Publication completion is stale.', 'CONFLICT', 409)
    }
    const receipt = { operationId: operation.id, publishedSnapshotHash: snapshot.snapshotHash, installed }
    return completeOperation(transaction, operation.id, receipt, 'PUBLICATION_COMPLETED')
  })
}

export async function executeCollaborationOperation(
  input: ExecuteCollaborationOperationInput,
  client: PrismaClient = prisma,
) {
  const operation = await client.collaborationOperation.findUnique({ where: { id: input.operationId } })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  return operation.intent === 'PUBLISH' ? executePublication(input, client) : executeDatabaseOperation(input, client)
}

export async function recoverCollaborationOperationFilesystem(operationId: string, client: PrismaClient = prisma) {
  const operation = await client.collaborationOperation.findUnique({
    where: { id: operationId },
    include: { binding: true },
  })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  const journal = JSON.parse(operation.mutationJournalJson) as Array<{ stagingPath?: string; backupPath?: string }>
  const boundary = [...journal].reverse().find(item => item.stagingPath && item.backupPath)
  if (!boundary?.stagingPath || !boundary.backupPath) {
    throw new ServiceError('No durable filesystem recovery boundary exists.', 'CONFLICT', 409)
  }
  const recovered = await recoverCollaborationSnapshot({
    repositoryRoot: operation.binding.repositoryRoot,
    operationId: operation.id,
    stagingPath: boundary.stagingPath,
    backupPath: boundary.backupPath,
  })
  await client.$transaction(transaction =>
    appendJournal(transaction, operation.id, 'FILESYSTEM_RECOVERED', { ...recovered }),
  )
  return recovered
}
