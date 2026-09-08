import type {
  CollaborationDecisionKind,
  CollaborationPermission,
  CollaborationOperation,
  CollaborationOperationIntent,
  Prisma,
  PrismaClient,
} from '@prisma/client'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

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
  observeCollaborationSnapshot,
  validateCollaborationGraph,
  fetchOperationSourceRef,
  classifyPinnedReceive,
  inspectRepository,
  readCollaborationSnapshotAtCommit,
  readCollaborationSnapshot,
  type CollaborationRecord,
  type PreparedCollaborationRecord,
} from '@/lib/repository-collaboration'
import { ServiceError } from '@/services/shared/errors'

import { requireCollaborationPermission } from './binding-service'
import { appendCollaborationJournalEntry as appendJournal } from './collaboration-journal-service'
import { applyCollaborationRecordsInTransaction } from './materialization-service'
import { projectSnapshotInTransaction } from './projection-helpers'
import { executeCollaborationGitStep } from './git-operation-service'
import { consumeCollaborationAuthorityReceipt } from './authority-receipt-service'
import { prepareDivergentCollaborationReconciliation } from './divergent-reconciliation-service'

type Transaction = Prisma.TransactionClient
type Resolution = { decision: 'KEEP_LOCAL' | 'USE_INCOMING' | 'EDIT'; editedRecord?: CollaborationRecord }

const bareDigestPattern = /^[a-f0-9]{64}$/
const publicDigestPattern = /^sha256:([a-f0-9]{64})$/

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

type PersistedOperationStep = {
  kind: string
  requiredPermission: CollaborationPermission
}

/** The plan is created with preparation and is the sole authority for later execution. */
function operationPlan(
  intent: CollaborationOperationIntent,
  sourceRevision: string | undefined,
  targetRevision: string | undefined,
  trigger: string | undefined,
): PersistedOperationStep[] {
  switch (intent) {
    case 'RECEIVE':
      return [
        ...(sourceRevision ? [{ kind: 'FAST_FORWARD_LOCAL', requiredPermission: 'INTEGRATE' as const }] : []),
        { kind: 'APPLY_DATABASE', requiredPermission: 'INTEGRATE' },
        { kind: 'FINALIZE', requiredPermission: 'OBSERVE' },
      ]
    case 'PUBLISH':
      return [
        { kind: 'INSTALL_SNAPSHOT', requiredPermission: 'COMMIT' },
        { kind: 'CREATE_COMMIT', requiredPermission: 'COMMIT' },
        { kind: 'PUSH_REMOTE', requiredPermission: 'PUSH' },
        { kind: 'FINALIZE', requiredPermission: 'OBSERVE' },
      ]
    case 'RECONCILE':
      if (!sourceRevision || !targetRevision) {
        return [
          {
            kind: 'APPLY_DATABASE',
            requiredPermission: trigger === 'archive-review' || trigger === 'restore-review' ? 'ARCHIVE' : 'INTEGRATE',
          },
          { kind: 'FINALIZE', requiredPermission: 'OBSERVE' },
        ]
      }
      return [
        { kind: 'CREATE_MERGE_COMMIT', requiredPermission: 'RESOLVE' },
        { kind: 'FAST_FORWARD_LOCAL', requiredPermission: 'INTEGRATE' },
        { kind: 'APPLY_DATABASE', requiredPermission: 'INTEGRATE' },
        { kind: 'PUSH_REMOTE', requiredPermission: 'PUSH' },
        { kind: 'CLEANUP_WORKTREE', requiredPermission: 'RESOLVE' },
        { kind: 'FINALIZE', requiredPermission: 'OBSERVE' },
      ]
    case 'UNDO':
      return [
        { kind: 'APPLY_DATABASE', requiredPermission: 'ARCHIVE' },
        { kind: 'FINALIZE', requiredPermission: 'OBSERVE' },
      ]
  }
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
  /** Internal preparation binds this generated id before the operation-owned fetch ref exists. */
  operationId?: string
}

type PersistedPrepareCollaborationOperationInput = PrepareCollaborationOperationInput & {
  /** Internal-only observed filesystem precondition; not part of the public request shape. */
  expectedPreviousSnapshotHash?: string | null
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
}

/** Stored digest columns remain bare hashes; public collaboration contracts use an explicit algorithm prefix. */
export function collaborationPublicDigest(value: string | null): string | null {
  if (!value) return null
  if (bareDigestPattern.test(value)) return `sha256:${value}`
  return value
}

export function normalizeCollaborationDigest(value: string): string {
  const prefixed = publicDigestPattern.exec(value)
  if (prefixed) return prefixed[1]!
  if (bareDigestPattern.test(value)) return value
  throw new ServiceError('Collaboration digest must be a SHA-256 digest.', 'VALIDATION', 400)
}

function publicOperation<T extends { preparedDigest: string | null; acceptedDigest: string | null }>(operation: T): T {
  return {
    ...operation,
    preparedDigest: collaborationPublicDigest(operation.preparedDigest),
    acceptedDigest: collaborationPublicDigest(operation.acceptedDigest),
  }
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
  persistedIntent: CollaborationOperationIntent = input.intent,
) {
  if (existing.sourceSnapshotHash !== requestDigest || existing.intent !== persistedIntent) {
    throw new ServiceError('The idempotency key belongs to a different operation.', 'CONFLICT', 409)
  }
  return existing
}

async function findIdempotentOperation(
  transaction: Transaction,
  bindingId: string,
  input: PrepareCollaborationOperationInput,
  requestDigest: string,
  persistedIntent: CollaborationOperationIntent = input.intent,
) {
  const existing = await transaction.collaborationOperation.findUnique({
    where: { bindingId_idempotencyKey: { bindingId, idempotencyKey: input.idempotencyKey } },
  })
  return existing ? assertIdempotentOperation(existing, input, requestDigest, persistedIntent) : null
}

async function createPreparedOperation(
  transaction: Transaction,
  input: PersistedPrepareCollaborationOperationInput,
  binding: { id: string; policyVersion: number },
  payload: PreparedOperationPayload,
  requestDigest: string,
) {
  const preparedDigest = collaborationHash(payload)
  const requiresDecision = requiredDecisionKeys(payload).size > 0
  const operation = await transaction.collaborationOperation.create({
    data: {
      ...(input.operationId ? { id: input.operationId } : {}),
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
  await transaction.collaborationOperationStep.createMany({
    data: operationPlan(input.intent, input.sourceRevision, input.targetRevision, input.trigger).map(
      (step, ordinal) => ({
        operationId: operation.id,
        ordinal,
        kind: step.kind,
        requiredPermission: step.requiredPermission,
        prerequisiteDigest: preparedDigest,
      }),
    ),
  })
  await transaction.collaborationOperationArtifact.create({
    data: {
      operationId: operation.id,
      kind: 'PREPARED_OPERATION',
      revision: 1,
      payloadJson: canonicalJson(payload),
      payloadHash: preparedDigest,
    },
  })
  if (input.intent === 'PUBLISH') {
    const { expectedPreviousSnapshotHash } = input
    await transaction.collaborationOperationArtifact.create({
      data: {
        operationId: operation.id,
        kind: 'PREPARED_PUBLICATION_FILESYSTEM',
        revision: 1,
        payloadJson: canonicalJson({ expectedPreviousSnapshotHash: expectedPreviousSnapshotHash ?? null }),
        payloadHash: collaborationHash({ expectedPreviousSnapshotHash: expectedPreviousSnapshotHash ?? null }),
      },
    })
  }
  await appendJournal(transaction, operation.id, 'PREPARED', {
    preparedDigest,
    localReadSetHash: payload.localReadSetHash,
    dependencyClosed: true,
    plan: operationPlan(input.intent, input.sourceRevision, input.targetRevision, input.trigger).map(step => step.kind),
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
  if (
    operation.version !== input.expectedVersion ||
    operation.preparedDigest !== normalizeCollaborationDigest(input.preparedDigest)
  ) {
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
  const seen = new Set<string>()
  for (const decision of decisions) {
    if (!required.has(decision.recordKey)) {
      throw new ServiceError(`Decision is not applicable to ${decision.recordKey}.`, 'VALIDATION', 400)
    }
    if (seen.has(decision.recordKey)) {
      throw new ServiceError(`Only one decision is allowed for ${decision.recordKey}.`, 'VALIDATION', 400)
    }
    seen.add(decision.recordKey)
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

function resolutionDigest(decision: DecideCollaborationOperationInput['decisions'][number]) {
  return collaborationHash({ decision: decision.decision, editedRecord: decision.editedRecord })
}

function isExactDecisionReplay(
  operation: CollaborationOperation,
  input: DecideCollaborationOperationInput,
  persisted: Array<{ recordKey: string; resolutionDigest: string }>,
) {
  if (
    operation.version !== input.expectedVersion + 1 ||
    operation.preparedDigest !== normalizeCollaborationDigest(input.preparedDigest) ||
    (operation.state !== 'WAITING_FOR_DECISION' && operation.state !== 'READY') ||
    persisted.length !== input.decisions.length
  )
    return false
  const expectedByKey = new Map(input.decisions.map(decision => [decision.recordKey, resolutionDigest(decision)]))
  return persisted.every(decision => expectedByKey.get(decision.recordKey) === decision.resolutionDigest)
}

function assertNoConflictingPersistedDecision(
  input: DecideCollaborationOperationInput,
  persisted: Array<{ recordKey: string; resolutionDigest: string }>,
) {
  const persistedByKey = new Map(persisted.map(decision => [decision.recordKey, decision.resolutionDigest]))
  for (const decision of input.decisions) {
    const existingDigest = persistedByKey.get(decision.recordKey)
    if (existingDigest && existingDigest !== resolutionDigest(decision)) {
      throw new ServiceError(`A different decision was already recorded for ${decision.recordKey}.`, 'CONFLICT', 409)
    }
  }
  return persistedByKey
}

async function persistDecisions(
  transaction: Transaction,
  operation: CollaborationOperation,
  input: DecideCollaborationOperationInput,
  persistedByKey: Map<string, string>,
) {
  for (const decision of input.decisions) {
    if (persistedByKey.has(decision.recordKey)) continue
    const resolution: Resolution = { decision: decision.decision, editedRecord: decision.editedRecord }
    const digest = resolutionDigest(decision)
    await transaction.collaborationDecision.create({
      data: {
        operationId: operation.id,
        recordKey: decision.recordKey,
        kind: decision.decision,
        resolutionJson: canonicalJson(resolution),
        resolutionDigest: digest,
        trustedPrincipalId: input.trustedPrincipalId,
        provenance: input.provenance,
      },
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
  if (input.intent === 'RECEIVE' && !input.incomingRecords) {
    const binding = await client.$transaction(transaction =>
      requireCollaborationPermission(transaction, input.bindingId, 'PREPARE', input.expectedPolicyVersion),
    )
    const operationId = input.operationId ?? randomUUID()
    const identity = await inspectRepository(binding.binding.repositoryRoot, binding.binding.remoteName)
    const fetched = await fetchOperationSourceRef({
      repositoryRoot: binding.binding.repositoryRoot,
      remote: binding.binding.remoteName,
      branch: binding.binding.trackedBranch,
      operationId,
    })
    const sourceSnapshot = await readCollaborationSnapshotAtCommit({
      repositoryRoot: binding.binding.repositoryRoot,
      commit: fetched.fetchedCommit,
      operationId,
    })
    const received = dependencyClosed(sourceSnapshot.records)
    assertMatchingPortableProject(received, binding.binding.portableProjectId)
    const classification = await classifyPinnedReceive({
      repositoryRoot: binding.binding.repositoryRoot,
      sourceRevision: fetched.fetchedCommit,
      targetRevision: identity.head,
    })
    const preparedInput = {
      ...input,
      operationId,
      incomingRecords: received,
      sourceRevision: fetched.fetchedCommit,
      targetRevision: identity.head,
    }
    const persisted = await client.$transaction(async transaction => {
      const { binding: currentBinding } = await requireCollaborationPermission(
        transaction,
        input.bindingId,
        'PREPARE',
        input.expectedPolicyVersion,
      )
      const localSnapshot = await projectSnapshotInTransaction(transaction, currentBinding.id)
      const local = dependencyClosed(snapshotRecords(localSnapshot))
      const baselines = await baselineRecords(transaction, currentBinding.id)
      const payload = buildPreparedPayload(received, local, baselines)
      const requestDigest = operationInputDigest(preparedInput, received)
      const reconciliationInput =
        classification.kind === 'DIVERGED' && classification.foreignPaths.length === 0
          ? { ...preparedInput, intent: 'RECONCILE' as const }
          : preparedInput
      const existing = await findIdempotentOperation(
        transaction,
        currentBinding.id,
        preparedInput,
        requestDigest,
        reconciliationInput.intent,
      )
      if (existing) return { operation: existing, classification, created: false }
      const operation = await createPreparedOperation(
        transaction,
        reconciliationInput,
        currentBinding,
        payload,
        requestDigest,
      )
      await transaction.collaborationOperationArtifact.create({
        data: {
          operationId: operation.id,
          kind: 'GIT_RECEIVE_SOURCE',
          revision: 1,
          payloadJson: canonicalJson({
            sourceRef: fetched.sourceRef,
            sourceRevision: fetched.fetchedCommit,
            sourceTree: fetched.fetchedTree,
            targetRevision: identity.head,
            snapshotHash: sourceSnapshot.snapshotHash,
          }),
          payloadHash: collaborationHash({
            sourceRevision: fetched.fetchedCommit,
            sourceTree: fetched.fetchedTree,
            targetRevision: identity.head,
            snapshotHash: sourceSnapshot.snapshotHash,
          }),
        },
      })
      await appendJournal(transaction, operation.id, 'RECEIVE_CLASSIFIED', classification)
      if (
        classification.kind === 'LOCAL_AHEAD' ||
        classification.kind === 'UNRELATED' ||
        (classification.kind === 'DIVERGED' && classification.foreignPaths.length > 0)
      ) {
        const blocked = await transaction.collaborationOperation.update({
          where: { id: operation.id },
          data: {
            state: 'BLOCKED',
            acceptedDigest: null,
            blockerJson: canonicalJson({
              kind:
                classification.kind === 'LOCAL_AHEAD'
                  ? 'LOCAL_AHEAD'
                  : classification.kind === 'UNRELATED'
                    ? 'UNRELATED_HISTORY'
                    : 'FOREIGN_PATH_DIVERGENCE',
              classification,
            }),
          },
        })
        return { operation: blocked, classification, created: true }
      }
      if (classification.kind === 'DIVERGED') {
        const preparing = await transaction.collaborationOperation.update({
          where: { id: operation.id },
          data: { state: 'PREPARING', acceptedDigest: null, queueKey: null, nextAttemptAt: null },
        })
        return { operation: preparing, classification, created: true }
      }
      return { operation, classification, created: true }
    })
    if (
      !persisted.created ||
      persisted.classification.kind !== 'DIVERGED' ||
      persisted.classification.foreignPaths.length > 0
    )
      return publicOperation(persisted.operation)
    // The operation stays PREPARING while the isolated worktree is created;
    // no worker can claim it until that preparation receipt is durable.
    await prepareDivergentCollaborationReconciliation(
      {
        operationId: persisted.operation.id,
        expectedVersion: persisted.operation.version,
        preparedDigest: persisted.operation.preparedDigest!,
        queueAfterPreparation: true,
      },
      client,
    )
    return publicOperation(
      await client.collaborationOperation.findUniqueOrThrow({ where: { id: persisted.operation.id } }),
    )
  }
  const expectedPreviousSnapshotHash =
    input.intent === 'PUBLISH'
      ? (
          await observeCollaborationSnapshot({
            repositoryRoot: (
              await client.$transaction(transaction =>
                requireCollaborationPermission(transaction, input.bindingId, 'PREPARE', input.expectedPolicyVersion),
              )
            ).binding.repositoryRoot,
          })
        ).snapshotHash
      : undefined
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
    if (existing) return publicOperation(existing)
    const local = dependencyClosed(snapshotRecords(localSnapshot))
    const baselines = input.intent === 'PUBLISH' ? local : await baselineRecords(transaction, binding.id)
    const payload = buildPreparedPayload(incoming, local, baselines)
    return publicOperation(
      await createPreparedOperation(
        transaction,
        { ...input, expectedPreviousSnapshotHash },
        binding,
        payload,
        requestDigest,
      ),
    )
  })
}

export async function decideCollaborationOperation(
  input: DecideCollaborationOperationInput,
  client: PrismaClient = prisma,
) {
  assertTrustedProvenance(input.provenance)
  return client.$transaction(transaction => decideCollaborationOperationInTransaction(input, transaction))
}

async function decideCollaborationOperationInTransaction(
  input: DecideCollaborationOperationInput,
  transaction: Transaction,
) {
  assertTrustedProvenance(input.provenance)
  const operation = await transaction.collaborationOperation.findUnique({ where: { id: input.operationId } })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  await requireCollaborationPermission(transaction, operation.bindingId, 'RESOLVE', operation.policyVersion)
  const prepared = parsePreparedOperation(operation.preparedJson)
  const required = validateDecisionInput(prepared, input.decisions)
  const existing = await transaction.collaborationDecision.findMany({
    where: { operationId: operation.id },
    select: { recordKey: true, resolutionDigest: true },
  })
  if (isExactDecisionReplay(operation, input, existing)) return publicOperation(operation)
  assertDecisionOperation(operation, input)
  const persistedByKey = assertNoConflictingPersistedDecision(input, existing)
  const persisted = await persistDecisions(transaction, operation, input, persistedByKey)
  return publicOperation(
    await finalizeDecision(
      transaction,
      operation,
      normalizeCollaborationDigest(input.preparedDigest),
      required,
      persisted,
    ),
  )
}

export async function decideCollaborationOperationWithAuthorityReceipt(
  input: Omit<DecideCollaborationOperationInput, 'trustedPrincipalId' | 'provenance'> & {
    authorityReceipt: string | null
    request: unknown
  },
  client: PrismaClient = prisma,
) {
  const operation = await client.collaborationOperation.findUnique({ where: { id: input.operationId } })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  return consumeCollaborationAuthorityReceipt(
    {
      token: input.authorityReceipt,
      bindingId: operation.bindingId,
      action: 'DECIDE',
      operationId: input.operationId,
      request: input.request,
    },
    (transaction, authority) => decideCollaborationOperationInTransaction({ ...input, ...authority }, transaction),
    client,
  )
}

async function currentSnapshotRecords(transaction: Transaction, bindingId: string): Promise<CollaborationRecord[]> {
  const snapshot = await projectSnapshotInTransaction(transaction, bindingId)
  return dependencyClosed(snapshotRecords(snapshot))
}

/** Recheck the Git commit and strict on-disk snapshot that a prior Git step bound before SQLite materialization. */
async function assertPinnedGitSnapshotBeforeDatabaseApply(
  transaction: Transaction,
  operation: { id: string; sourceRevision: string | null; targetRevision: string | null; bindingId: string },
) {
  if (!operation.sourceRevision || !operation.targetRevision) return
  const binding = await transaction.collaborationBinding.findUniqueOrThrow({ where: { id: operation.bindingId } })
  const identity = await inspectRepository(binding.repositoryRoot, binding.remoteName)
  if (identity.head !== operation.targetRevision || operation.sourceRevision !== operation.targetRevision) {
    throw new ServiceError('Pinned Git HEAD changed before database materialization.', 'CONFLICT', 409)
  }
  const artifact = await transaction.collaborationOperationArtifact.findFirst({
    where: {
      operationId: operation.id,
      kind: { in: ['GIT_RECEIVE_SOURCE', 'STEP_CREATE_MERGE_COMMIT'] },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!artifact)
    throw new ServiceError('No exact Git snapshot receipt is persisted for database materialization.', 'CONFLICT', 409)
  let expectedSnapshotHash: string | undefined
  try {
    expectedSnapshotHash = (JSON.parse(artifact.payloadJson) as { snapshotHash?: string }).snapshotHash
  } catch {
    // Handled by the same conservative blocker below.
  }
  if (!expectedSnapshotHash) throw new ServiceError('The persisted Git snapshot receipt is invalid.', 'CONFLICT', 409)
  let observedSnapshotHash: string
  try {
    observedSnapshotHash = (
      await readCollaborationSnapshot(path.join(binding.repositoryRoot, 'appraise', 'collaboration'))
    ).snapshotHash
  } catch {
    throw new ServiceError('The reviewed Git collaboration snapshot is no longer strict.', 'CONFLICT', 409)
  }
  if (observedSnapshotHash !== expectedSnapshotHash) {
    throw new ServiceError(
      'The reviewed Git collaboration snapshot changed before database materialization.',
      'CONFLICT',
      409,
    )
  }
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

async function persistedDivergentRecords(
  transaction: Transaction,
  operationId: string,
): Promise<CollaborationRecord[]> {
  const artifact = await transaction.collaborationOperationArtifact.findFirst({
    where: { operationId, kind: 'DIVERGENT_ACCEPTED_PROPOSAL' },
    orderBy: { revision: 'desc' },
  })
  if (!artifact)
    throw new ServiceError(
      'No designated accepted divergent proposal is persisted for this operation.',
      'CONFLICT',
      409,
    )
  try {
    const payload = JSON.parse(artifact.payloadJson) as {
      records?: unknown[]
      review?: { proposedSnapshotHash?: string }
    }
    if (!Array.isArray(payload.records) || !payload.review?.proposedSnapshotHash)
      throw new Error('missing proposal records')
    const records = dependencyClosed(payload.records.map(record => collaborationRecordSchema.parse(record)))
    if (buildCollaborationSnapshotFiles(records).snapshotHash !== payload.review.proposedSnapshotHash) {
      throw new Error('reviewed snapshot hash mismatch')
    }
    return records
  } catch {
    throw new ServiceError('The persisted divergent proposal is invalid.', 'CONFLICT', 409)
  }
}

async function loadExecution(
  transaction: Transaction,
  input: ExecuteCollaborationOperationInput,
  expectedStepKinds: readonly string[],
) {
  const operation = await transaction.collaborationOperation.findUnique({
    where: { id: input.operationId },
    include: { binding: true, steps: { orderBy: { ordinal: 'asc' } } },
  })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  if (
    operation.version !== input.expectedVersion ||
    operation.preparedDigest !== normalizeCollaborationDigest(input.preparedDigest) ||
    operation.idempotencyKey !== input.idempotencyKey
  ) {
    throw new ServiceError('The operation execution request is stale.', 'CONFLICT', 409)
  }
  if (operation.state !== 'READY' || !operation.acceptedDigest) {
    throw new ServiceError('The operation is not accepted for execution.', 'CONFLICT', 409)
  }
  const step = operation.steps.find(candidate => candidate.state === 'PENDING')
  if (!step)
    throw new ServiceError('Legacy operation has no safe persisted execution plan; prepare it again.', 'CONFLICT', 409)
  if (
    step.prerequisiteDigest !== operation.preparedDigest ||
    operation.steps.some(candidate => candidate.ordinal < step.ordinal && candidate.state !== 'COMPLETED')
  ) {
    throw new ServiceError('The persisted operation plan is not eligible for its next step.', 'CONFLICT', 409)
  }
  if (!expectedStepKinds.includes(step.kind)) {
    throw new ServiceError(`The next operation step (${step.kind}) is not eligible here.`, 'CONFLICT', 409)
  }
  await requireCollaborationPermission(
    transaction,
    operation.bindingId,
    step.requiredPermission,
    operation.policyVersion,
  )
  return { operation, step }
}

async function completeOperation(
  transaction: Transaction,
  operationId: string,
  expectedStep: { ordinal: number; kind: string },
  receipt: Record<string, unknown>,
  journalBoundary: string,
) {
  const step = await transaction.collaborationOperationStep.findFirst({
    where: {
      operationId,
      ordinal: expectedStep.ordinal,
      state: { in: ['PENDING', 'RUNNING'] },
      kind: expectedStep.kind,
    },
    orderBy: { ordinal: 'asc' },
  })
  if (!step)
    throw new ServiceError('The persisted operation has no eligible database/filesystem step.', 'CONFLICT', 409)
  const evidenceHash = collaborationHash(receipt)
  const operation = await transaction.collaborationOperation.findUniqueOrThrow({ where: { id: operationId } })
  if (step.state === 'RUNNING' && step.startedVersion !== operation.version) {
    throw new ServiceError('The persisted external operation step is stale.', 'CONFLICT', 409)
  }
  const completedVersion = operation.version + 1
  await transaction.collaborationOperationStep.update({
    where: { operationId_ordinal: { operationId, ordinal: step.ordinal } },
    data: {
      state: 'COMPLETED',
      evidenceJson: canonicalJson(receipt),
      evidenceHash,
      ...(step.state === 'RUNNING' ? { completedVersion } : {}),
      completedAt: new Date(),
    },
  })
  await transaction.collaborationOperationArtifact.create({
    data: {
      operationId,
      kind: `STEP_${step.kind}`,
      revision: 1,
      payloadJson: canonicalJson(receipt),
      payloadHash: evidenceHash,
    },
  })
  const remaining = await transaction.collaborationOperationStep.count({
    where: { operationId, state: { not: 'COMPLETED' } },
  })
  const completed = await transaction.collaborationOperation.update({
    where: { id: operationId },
    data: {
      state: remaining === 0 ? 'COMPLETED' : 'READY',
      receiptJson: canonicalJson(receipt),
      receiptHash: collaborationHash(receipt),
      ...(remaining === 0 ? { completedAt: new Date() } : {}),
      version: { increment: 1 },
    },
  })
  await appendJournal(transaction, operationId, journalBoundary, receipt)
  return completed
}

async function executeDatabaseOperation(input: ExecuteCollaborationOperationInput, client: PrismaClient) {
  return client.$transaction(async transaction => {
    const { operation, step } = await loadExecution(transaction, input, ['APPLY_DATABASE'])
    await assertPinnedGitSnapshotBeforeDatabaseApply(transaction, operation)
    const prepared = parsePreparedOperation(operation.preparedJson)
    const current = await currentSnapshotRecords(transaction, operation.bindingId)
    if (collaborationHash(current) !== operation.localReadSetHash) {
      throw new ServiceError('Local authored data changed after preparation.', 'CONFLICT', 409)
    }
    const decisions = decisionMap(
      await transaction.collaborationDecision.findMany({ where: { operationId: operation.id } }),
    )
    const resolved =
      operation.intent === 'RECONCILE' && operation.sourceRevision && operation.targetRevision
        ? await persistedDivergentRecords(transaction, operation.id)
        : dependencyClosed(resolveForExecution(prepared, decisions))
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
    return completeOperation(transaction, operation.id, step, receipt, 'DATABASE_APPLIED')
  })
}

async function executePublication(input: ExecuteCollaborationOperationInput, client: PrismaClient) {
  const applying = await client.$transaction(async transaction => {
    const { operation, step } = await loadExecution(transaction, input, ['INSTALL_SNAPSHOT'])
    const current = await currentSnapshotRecords(transaction, operation.bindingId)
    if (collaborationHash(current) !== operation.localReadSetHash) {
      throw new ServiceError('Local authored data changed after preparation.', 'CONFLICT', 409)
    }
    const snapshot = buildCollaborationSnapshotFiles(current, operation.binding.portableProjectId)
    const executorEpoch = operation.executorEpoch + 1
    const intent = {
      schema: 'appraise.repository-collaboration.filesystem-step-intent/v1',
      operationId: operation.id,
      ordinal: step.ordinal,
      kind: step.kind,
      requestVersion: input.expectedVersion,
      executorEpoch,
      localReadSetHash: operation.localReadSetHash,
      snapshotHash: snapshot.snapshotHash,
    }
    const intentJson = canonicalJson(intent)
    const intentHash = collaborationHash(intent)
    const updated = await transaction.collaborationOperation.update({
      where: { id: operation.id },
      data: { state: 'APPLYING', executorEpoch, version: { increment: 1 } },
      include: { binding: true },
    })
    await transaction.collaborationOperationStep.update({
      where: { operationId_ordinal: { operationId: operation.id, ordinal: step.ordinal } },
      data: {
        state: 'RUNNING',
        requestVersion: input.expectedVersion,
        intentJson,
        intentHash,
        executorEpoch,
        startedVersion: updated.version,
        startedAt: new Date(),
      },
    })
    await transaction.collaborationOperationArtifact.create({
      data: {
        operationId: operation.id,
        kind: `FILESYSTEM_STEP_INTENT_${step.ordinal}`,
        revision: executorEpoch,
        payloadJson: intentJson,
        payloadHash: intentHash,
      },
    })
    await appendJournal(transaction, operation.id, 'PUBLICATION_STARTED', {
      localReadSetHash: operation.localReadSetHash,
    })
    return { operation: updated, records: current, step, snapshot }
  })
  const snapshot = applying.snapshot
  const preparedFilesystem = await client.collaborationOperationArtifact.findFirst({
    where: { operationId: applying.operation.id, kind: 'PREPARED_PUBLICATION_FILESYSTEM', revision: 1 },
  })
  if (!preparedFilesystem)
    throw new ServiceError(
      'Legacy publication has no persisted filesystem snapshot; prepare it again.',
      'CONFLICT',
      409,
    )
  const expectedPreviousSnapshotHash = (() => {
    try {
      const value = JSON.parse(preparedFilesystem.payloadJson) as { expectedPreviousSnapshotHash?: unknown }
      return value.expectedPreviousSnapshotHash === null || typeof value.expectedPreviousSnapshotHash === 'string'
        ? value.expectedPreviousSnapshotHash
        : undefined
    } catch {
      return undefined
    }
  })()
  if (expectedPreviousSnapshotHash === undefined)
    throw new ServiceError('Prepared publication filesystem state is invalid.', 'CONFLICT', 409)
  const installed = await installCollaborationSnapshot({
    repositoryRoot: applying.operation.binding.repositoryRoot,
    operationId: applying.operation.id,
    snapshot,
    expectedPreviousSnapshotHash,
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
    const persistedStep = await transaction.collaborationOperationStep.findUnique({
      where: { operationId_ordinal: { operationId: operation.id, ordinal: applying.step.ordinal } },
    })
    if (
      !persistedStep ||
      persistedStep.state !== 'RUNNING' ||
      persistedStep.requestVersion !== input.expectedVersion ||
      persistedStep.executorEpoch !== operation.executorEpoch
    )
      throw new ServiceError('Publication completion lost its persisted executor fence.', 'CONFLICT', 409)
    const current = await currentSnapshotRecords(transaction, operation.bindingId)
    if (collaborationHash(current) !== operation.localReadSetHash) {
      throw new ServiceError('Local authored data changed during publication.', 'CONFLICT', 409)
    }
    const receipt = { operationId: operation.id, publishedSnapshotHash: snapshot.snapshotHash, installed }
    return completeOperation(transaction, operation.id, applying.step, receipt, 'PUBLICATION_COMPLETED')
  })
}

async function executeFinalizeOperation(input: ExecuteCollaborationOperationInput, client: PrismaClient) {
  return client.$transaction(async transaction => {
    const { operation, step } = await loadExecution(transaction, input, ['FINALIZE'])
    const receipt = {
      operationId: operation.id,
      preparedDigest: operation.preparedDigest,
      acceptedDigest: operation.acceptedDigest,
    }
    const receiptHash = collaborationHash(receipt)
    await transaction.collaborationOperationStep.update({
      where: { operationId_ordinal: { operationId: operation.id, ordinal: step.ordinal } },
      data: {
        state: 'COMPLETED',
        evidenceJson: canonicalJson(receipt),
        evidenceHash: receiptHash,
        completedAt: new Date(),
      },
    })
    await transaction.collaborationOperationArtifact.create({
      data: {
        operationId: operation.id,
        kind: 'STEP_FINALIZE',
        revision: 1,
        payloadJson: canonicalJson(receipt),
        payloadHash: receiptHash,
      },
    })
    await appendJournal(transaction, operation.id, 'FINALIZED', receipt)
    return transaction.collaborationOperation.update({
      where: { id: operation.id },
      data: {
        state: 'COMPLETED',
        receiptJson: canonicalJson(receipt),
        receiptHash,
        completedAt: new Date(),
        version: { increment: 1 },
      },
    })
  })
}

export async function executeCollaborationOperation(
  input: ExecuteCollaborationOperationInput,
  client: PrismaClient = prisma,
) {
  const operation = await client.collaborationOperation.findUnique({ where: { id: input.operationId } })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  // A lost response is retried with the request version that began the step,
  // not the newer version produced by completion. Return only the persisted
  // result while that completion is still the operation's current version.
  const replay = await client.collaborationOperationStep.findFirst({
    where: {
      operationId: operation.id,
      state: 'COMPLETED',
      requestVersion: input.expectedVersion,
      completedVersion: operation.version,
    },
  })
  if (
    replay &&
    operation.preparedDigest === normalizeCollaborationDigest(input.preparedDigest) &&
    operation.idempotencyKey === input.idempotencyKey
  )
    return publicOperation(operation)
  if (
    operation.state === 'COMPLETED' &&
    operation.version === input.expectedVersion &&
    operation.preparedDigest === normalizeCollaborationDigest(input.preparedDigest) &&
    operation.idempotencyKey === input.idempotencyKey
  )
    return publicOperation(operation)
  const next = await client.collaborationOperationStep.findFirst({
    where: { operationId: operation.id, state: 'PENDING' },
    orderBy: { ordinal: 'asc' },
  })
  if (!next)
    throw new ServiceError('Legacy operation has no safe persisted execution plan; prepare it again.', 'CONFLICT', 409)
  const completed =
    next.kind === 'FINALIZE'
      ? await executeFinalizeOperation(input, client)
      : ['CREATE_MERGE_COMMIT', 'FAST_FORWARD_LOCAL', 'PUSH_REMOTE', 'CLEANUP_WORKTREE', 'CREATE_COMMIT'].includes(
            next.kind,
          )
        ? await executeCollaborationGitStep(input, client)
        : next.kind === 'INSTALL_SNAPSHOT'
          ? await executePublication(input, client)
          : next.kind === 'APPLY_DATABASE'
            ? await executeDatabaseOperation(input, client)
            : (() => {
                throw new ServiceError(`The next operation step (${next.kind}) is not executable.`, 'CONFLICT', 409)
              })()
  return publicOperation(completed)
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
