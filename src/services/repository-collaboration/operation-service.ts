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
  observeOperationSourceRef,
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
import {
  acquireCollaborationGitMutationLock,
  assertCollaborationGitMutationIdentity,
  assertCollaborationGitMutationLock,
  releaseCollaborationGitMutationLock,
  withCollaborationGitMutationLeaseHeartbeat,
  type CollaborationGitIdentityInspector,
} from './git-mutation-lock-service'
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

type FilesystemRecoveryOperation = Prisma.CollaborationOperationGetPayload<{
  include: { binding: true; steps: { orderBy: { ordinal: 'asc' } } }
}>
type FilesystemRecoveryStep = FilesystemRecoveryOperation['steps'][number]
type FilesystemStepIntent = {
  schema?: unknown
  operationId?: unknown
  ordinal?: unknown
  kind?: unknown
  requestVersion?: unknown
  executorEpoch?: unknown
  snapshotHash?: unknown
}
type FilesystemRecoveryClassification = 'VERIFIED_COMPLETED' | 'SAFE_NO_EFFECT_RETRY' | 'AMBIGUOUS_BLOCK'

/** Test-only seam for proving a repository-path retarget cannot certify an
 * external filesystem result under the lease for an earlier common directory. */
export type FilesystemGitMutationHooks = {
  inspectRepository?: CollaborationGitIdentityInspector
  /** Test-only seam proving the pre-effect identity fence prevents recovery work. */
  recoverCollaborationSnapshot?: typeof recoverCollaborationSnapshot
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

export type PrepareCollaborationOperationHooks = {
  /** Called immediately before the durable operation-owned Git fetch begins. */
  onExternalEffectStarted?: (operationId: string) => void
  /** Test-only crash seam: the fetch completed, but its observed receipt has
   * not yet been persisted, so a retry must remain conservatively PREPARING. */
  afterFetchBeforeReceiptPersistence?: (operationId: string) => Promise<void> | void
  /** Test-only crash seam after an observed fetch receipt is durable. Retrying
   * this operation must materialize that receipt without a second fetch. */
  afterFetchReceiptPersisted?: (operationId: string) => Promise<void> | void
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

function requiresDivergentProposal(input: PersistedPrepareCollaborationOperationInput) {
  return input.intent === 'RECONCILE' && Boolean(input.sourceRevision) && Boolean(input.targetRevision)
}

function initialOperationState(requiresDecision: boolean, divergentProposal: boolean) {
  if (divergentProposal) return 'PREPARING'
  return requiresDecision ? 'WAITING_FOR_DECISION' : 'READY'
}

function initialAcceptedDigest(preparedDigest: string, requiresDecision: boolean, divergentProposal: boolean) {
  return requiresDecision || divergentProposal ? null : preparedDigest
}

async function persistPreparedOperationPlan(
  transaction: Transaction,
  input: {
    operationId: string
    intent: CollaborationOperationIntent
    sourceRevision: string | undefined
    targetRevision: string | undefined
    trigger: string | undefined
    payload: PreparedOperationPayload
    preparedDigest: string
  },
) {
  await transaction.collaborationOperationStep.createMany({
    data: operationPlan(input.intent, input.sourceRevision, input.targetRevision, input.trigger).map(
      (step, ordinal) => ({
        operationId: input.operationId,
        ordinal,
        kind: step.kind,
        requiredPermission: step.requiredPermission,
        prerequisiteDigest: input.preparedDigest,
      }),
    ),
  })
  await transaction.collaborationOperationArtifact.create({
    data: {
      operationId: input.operationId,
      kind: 'PREPARED_OPERATION',
      revision: 1,
      payloadJson: canonicalJson(input.payload),
      payloadHash: input.preparedDigest,
    },
  })
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
  const divergentProposal = requiresDivergentProposal(input)
  const operation = await transaction.collaborationOperation.create({
    data: {
      ...(input.operationId ? { id: input.operationId } : {}),
      bindingId: binding.id,
      intent: input.intent,
      trigger: input.trigger ?? 'local-ui',
      state: initialOperationState(requiresDecision, divergentProposal),
      idempotencyKey: input.idempotencyKey,
      sourceRevision: input.sourceRevision,
      targetRevision: input.targetRevision,
      sourceSnapshotHash: requestDigest,
      localReadSetHash: payload.localReadSetHash,
      policyVersion: binding.policyVersion,
      preparedJson: canonicalJson(payload),
      preparedDigest,
      acceptedDigest: initialAcceptedDigest(preparedDigest, requiresDecision, divergentProposal),
    },
  })
  await persistPreparedOperationPlan(transaction, {
    operationId: operation.id,
    intent: input.intent,
    sourceRevision: input.sourceRevision,
    targetRevision: input.targetRevision,
    trigger: input.trigger,
    payload,
    preparedDigest,
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

function isDivergentReconciliationOperation(operation: CollaborationOperation) {
  return operation.intent === 'RECONCILE' && Boolean(operation.sourceRevision) && Boolean(operation.targetRevision)
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

type ReceiveFetchObservation = {
  sourceRef: string
  sourceRevision: string
  sourceTree: string
  targetRevision: string
}
type ReceiveFetchPreEffect = {
  schema: 'appraise.repository-collaboration.receive-fetch-pre-effect/v1'
  operationId: string
  remote: string
  branch: string
  sourceRef: string
  commonDirectory: string
  targetRevision: string
}
type ReceiveClassification = Awaited<ReturnType<typeof classifyPinnedReceive>>
type ReceiveMaterializationDisposition = {
  intent: CollaborationOperationIntent
  state: 'BLOCKED' | 'PREPARING' | 'WAITING_FOR_DECISION' | 'READY'
  accepted: boolean
  blockerJson: string | null
}

function receiveReservationDigest(input: PrepareCollaborationOperationInput) {
  return operationInputDigest({ ...input, sourceRevision: undefined, targetRevision: undefined }, [])
}

function receiveSourceRef(operationId: string) {
  return `refs/appraise/collaboration/${operationId}/source`
}

function receiveFetchIntent(
  input: PrepareCollaborationOperationInput,
  operationId: string,
  binding: { remoteName: string; trackedBranch: string },
) {
  return {
    schema: 'appraise.repository-collaboration.receive-fetch-intent/v1',
    operationId,
    bindingId: input.bindingId,
    requestDigest: receiveReservationDigest(input),
    remote: binding.remoteName,
    branch: binding.trackedBranch,
    sourceRef: receiveSourceRef(operationId),
  }
}

async function reserveReceiveFetch(
  input: PrepareCollaborationOperationInput,
  client: PrismaClient,
): Promise<{
  operation: CollaborationOperation
  binding: Awaited<ReturnType<typeof requireCollaborationPermission>>['binding']
  created: boolean
}> {
  return client.$transaction(async transaction => {
    const permission = await requireCollaborationPermission(
      transaction,
      input.bindingId,
      'PREPARE',
      input.expectedPolicyVersion,
    )
    const requestDigest = receiveReservationDigest(input)
    const existing = await transaction.collaborationOperation.findUnique({
      where: { bindingId_idempotencyKey: { bindingId: permission.binding.id, idempotencyKey: input.idempotencyKey } },
    })
    if (existing) {
      if (existing.sourceSnapshotHash !== requestDigest || !['RECEIVE', 'RECONCILE'].includes(existing.intent))
        throw new ServiceError('The idempotency key belongs to a different operation.', 'CONFLICT', 409)
      return { operation: existing, binding: permission.binding, created: false }
    }
    const operationId = input.operationId ?? randomUUID()
    const operation = await transaction.collaborationOperation.create({
      data: {
        id: operationId,
        bindingId: permission.binding.id,
        intent: 'RECEIVE',
        trigger: input.trigger ?? 'local-ui',
        state: 'PREPARING',
        idempotencyKey: input.idempotencyKey,
        sourceSnapshotHash: requestDigest,
        policyVersion: permission.binding.policyVersion,
      },
    })
    const intent = receiveFetchIntent(input, operation.id, permission.binding)
    await transaction.collaborationOperationArtifact.create({
      data: {
        operationId: operation.id,
        kind: 'GIT_RECEIVE_FETCH_INTENT',
        revision: 1,
        payloadJson: canonicalJson(intent),
        payloadHash: collaborationHash(intent),
      },
    })
    await appendJournal(transaction, operation.id, 'RECEIVE_FETCH_RESERVED', { requestDigest })
    return { operation, binding: permission.binding, created: true }
  })
}

function parseReceiveFetchObservation(artifact: { payloadJson: string; payloadHash: string }): ReceiveFetchObservation {
  try {
    const parsed = JSON.parse(artifact.payloadJson) as Partial<ReceiveFetchObservation>
    if (
      typeof parsed.sourceRef !== 'string' ||
      typeof parsed.sourceRevision !== 'string' ||
      typeof parsed.sourceTree !== 'string' ||
      typeof parsed.targetRevision !== 'string' ||
      artifact.payloadHash !== collaborationHash(parsed)
    )
      throw new Error('invalid observed fetch receipt')
    return parsed as ReceiveFetchObservation
  } catch {
    throw new ServiceError('The persisted receive fetch receipt is invalid.', 'CONFLICT', 409)
  }
}

async function observedReceiveFetch(operationId: string, client: PrismaClient) {
  const artifact = await client.collaborationOperationArtifact.findFirst({
    where: { operationId, kind: 'GIT_RECEIVE_FETCH_OBSERVED' },
    orderBy: { revision: 'desc' },
  })
  return artifact ? parseReceiveFetchObservation(artifact) : null
}

function parseReceiveFetchPreEffect(artifact: { payloadJson: string; payloadHash: string }): ReceiveFetchPreEffect {
  try {
    const parsed = JSON.parse(artifact.payloadJson) as Partial<ReceiveFetchPreEffect>
    const validFields = [
      parsed.schema === 'appraise.repository-collaboration.receive-fetch-pre-effect/v1',
      typeof parsed.operationId === 'string',
      typeof parsed.remote === 'string',
      typeof parsed.branch === 'string',
      typeof parsed.sourceRef === 'string',
      typeof parsed.commonDirectory === 'string',
      typeof parsed.targetRevision === 'string',
      artifact.payloadHash === collaborationHash(parsed),
    ]
    if (!validFields.every(Boolean)) throw new Error('invalid receive fetch pre-effect receipt')
    return parsed as ReceiveFetchPreEffect
  } catch {
    throw new ServiceError('The persisted receive fetch intent is invalid.', 'CONFLICT', 409)
  }
}

async function receiveFetchPreEffect(operationId: string, client: PrismaClient) {
  const artifact = await client.collaborationOperationArtifact.findFirst({
    where: { operationId, kind: 'GIT_RECEIVE_FETCH_PRE_EFFECT' },
    orderBy: { revision: 'desc' },
  })
  return artifact ? parseReceiveFetchPreEffect(artifact) : null
}

async function persistReceiveFetchObservation(
  transaction: Transaction,
  input: {
    operationId: string
    requestDigest: string
    observation: ReceiveFetchObservation
    lease: Awaited<ReturnType<typeof acquireCollaborationGitMutationLock>>
  },
) {
  await assertCollaborationGitMutationLock(transaction, input.lease)
  const current = await transaction.collaborationOperation.findUnique({ where: { id: input.operationId } })
  if (!current || current.state !== 'PREPARING' || current.sourceSnapshotHash !== input.requestDigest) {
    throw new ServiceError('The receive operation changed before its fetch receipt was recorded.', 'CONFLICT', 409)
  }
  await transaction.collaborationOperationArtifact.create({
    data: {
      operationId: current.id,
      kind: 'GIT_RECEIVE_FETCH_OBSERVED',
      revision: 1,
      payloadJson: canonicalJson(input.observation),
      payloadHash: collaborationHash(input.observation),
    },
  })
  await appendJournal(transaction, current.id, 'RECEIVE_FETCH_OBSERVED', input.observation)
}

async function blockPreparingReceiveOperation(
  operationId: string,
  client: PrismaClient,
  input: { kind: string; message: string },
) {
  await client.$transaction(async transaction => {
    const current = await transaction.collaborationOperation.findUnique({ where: { id: operationId } })
    if (!current || current.state !== 'PREPARING') return
    await transaction.collaborationOperation.update({
      where: { id: current.id },
      data: {
        state: 'BLOCKED',
        acceptedDigest: null,
        blockerJson: canonicalJson(input),
      },
    })
    await appendJournal(transaction, current.id, input.kind, { message: input.message }, 'BLOCKED')
  })
}

async function blockReceiveFetchRecovery(operationId: string, client: PrismaClient, error: unknown): Promise<never> {
  const message = error instanceof Error ? error.message : 'The operation-owned receive ref cannot be observed.'
  await blockPreparingReceiveOperation(operationId, client, { kind: 'RECEIVE_FETCH_RECOVERY_REQUIRED', message })
  throw new ServiceError('The receive fetch outcome is unknown and requires recovery.', 'CONFLICT', 409)
}

async function recoverReceiveFetchObservation(
  reserved: Awaited<ReturnType<typeof reserveReceiveFetch>>,
  input: PrepareCollaborationOperationInput,
  client: PrismaClient,
): Promise<ReceiveFetchObservation | null> {
  const preEffect = await receiveFetchPreEffect(reserved.operation.id, client)
  if (!preEffect) return null
  const lease = await client.$transaction(transaction =>
    acquireCollaborationGitMutationLock(transaction, preEffect.commonDirectory, reserved.operation.id),
  )
  try {
    return await withCollaborationGitMutationLeaseHeartbeat(client, lease, async () => {
      try {
        await client.$transaction(transaction => assertCollaborationGitMutationLock(transaction, lease))
        await assertCollaborationGitMutationIdentity(
          reserved.binding.repositoryRoot,
          preEffect.commonDirectory,
          preEffect.remote,
        )
        const pinned = await observeOperationSourceRef({
          repositoryRoot: reserved.binding.repositoryRoot,
          operationId: reserved.operation.id,
        })
        if (pinned.sourceRef !== preEffect.sourceRef) throw new Error('The operation-owned source ref changed.')
        const observation = {
          sourceRef: pinned.sourceRef,
          sourceRevision: pinned.fetchedCommit,
          sourceTree: pinned.fetchedTree,
          targetRevision: preEffect.targetRevision,
        }
        await client.$transaction(transaction =>
          persistReceiveFetchObservation(transaction, {
            operationId: reserved.operation.id,
            requestDigest: receiveReservationDigest(input),
            observation,
            lease,
          }),
        )
        return observation
      } catch (error) {
        return blockReceiveFetchRecovery(reserved.operation.id, client, error)
      }
    })
  } finally {
    await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, lease))
  }
}

async function fetchAndObserveReceiveSource(
  reserved: Awaited<ReturnType<typeof reserveReceiveFetch>>,
  input: PrepareCollaborationOperationInput,
  client: PrismaClient,
  hooks?: PrepareCollaborationOperationHooks,
): Promise<ReceiveFetchObservation> {
  const identity = await inspectRepository(reserved.binding.repositoryRoot, reserved.binding.remoteName)
  const lease = await client.$transaction(transaction =>
    acquireCollaborationGitMutationLock(transaction, identity.commonDirectory, reserved.operation.id),
  )
  try {
    return await withCollaborationGitMutationLeaseHeartbeat(client, lease, async () => {
      await client.$transaction(transaction => assertCollaborationGitMutationLock(transaction, lease))
      await assertCollaborationGitMutationIdentity(
        reserved.binding.repositoryRoot,
        identity.commonDirectory,
        reserved.binding.remoteName,
      )
      const preEffect: ReceiveFetchPreEffect = {
        schema: 'appraise.repository-collaboration.receive-fetch-pre-effect/v1',
        operationId: reserved.operation.id,
        remote: reserved.binding.remoteName,
        branch: reserved.binding.trackedBranch,
        sourceRef: receiveSourceRef(reserved.operation.id),
        commonDirectory: identity.commonDirectory,
        targetRevision: identity.head,
      }
      await client.$transaction(async transaction => {
        await assertCollaborationGitMutationLock(transaction, lease)
        const current = await transaction.collaborationOperation.findUnique({ where: { id: reserved.operation.id } })
        if (
          !current ||
          current.state !== 'PREPARING' ||
          current.sourceSnapshotHash !== receiveReservationDigest(input)
        ) {
          throw new ServiceError('The receive operation changed before its fetch began.', 'CONFLICT', 409)
        }
        await transaction.collaborationOperationArtifact.create({
          data: {
            operationId: current.id,
            kind: 'GIT_RECEIVE_FETCH_PRE_EFFECT',
            revision: 1,
            payloadJson: canonicalJson(preEffect),
            payloadHash: collaborationHash(preEffect),
          },
        })
        await appendJournal(transaction, current.id, 'RECEIVE_FETCH_PRE_EFFECT', preEffect)
      })
      hooks?.onExternalEffectStarted?.(reserved.operation.id)
      const fetched = await fetchOperationSourceRef({
        repositoryRoot: reserved.binding.repositoryRoot,
        remote: reserved.binding.remoteName,
        branch: reserved.binding.trackedBranch,
        operationId: reserved.operation.id,
      })
      await hooks?.afterFetchBeforeReceiptPersistence?.(reserved.operation.id)
      await assertCollaborationGitMutationIdentity(
        reserved.binding.repositoryRoot,
        identity.commonDirectory,
        reserved.binding.remoteName,
      )
      const observed = {
        sourceRef: fetched.sourceRef,
        sourceRevision: fetched.fetchedCommit,
        sourceTree: fetched.fetchedTree,
        targetRevision: identity.head,
      }
      await client.$transaction(transaction =>
        persistReceiveFetchObservation(transaction, {
          operationId: reserved.operation.id,
          requestDigest: receiveReservationDigest(input),
          observation: observed,
          lease,
        }),
      )
      await hooks?.afterFetchReceiptPersisted?.(reserved.operation.id)
      return observed
    })
  } finally {
    await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, lease))
  }
}

async function blockReceiveAfterObservedFetch(operationId: string, client: PrismaClient, error: unknown) {
  const message = error instanceof Error ? error.message : 'Receive validation failed after remote fetch.'
  await blockPreparingReceiveOperation(operationId, client, { kind: 'RECEIVE_POST_FETCH_VALIDATION_FAILED', message })
}

function blockedReceiveDisposition(
  kind: 'LOCAL_AHEAD' | 'UNRELATED_HISTORY' | 'FOREIGN_PATH_DIVERGENCE',
  classification: ReceiveClassification,
): ReceiveMaterializationDisposition {
  return {
    intent: 'RECEIVE',
    state: 'BLOCKED',
    accepted: false,
    blockerJson: canonicalJson({ kind, classification }),
  }
}

function receiveMaterializationDisposition(
  classification: ReceiveClassification,
  requiresDecision: boolean,
): ReceiveMaterializationDisposition {
  if (classification.kind === 'DIVERGED') {
    if (classification.foreignPaths.length === 0) {
      return { intent: 'RECONCILE', state: 'PREPARING', accepted: false, blockerJson: null }
    }
    return blockedReceiveDisposition('FOREIGN_PATH_DIVERGENCE', classification)
  }
  if (classification.kind === 'LOCAL_AHEAD') return blockedReceiveDisposition('LOCAL_AHEAD', classification)
  if (classification.kind === 'UNRELATED') return blockedReceiveDisposition('UNRELATED_HISTORY', classification)
  if (requiresDecision) {
    return { intent: 'RECEIVE', state: 'WAITING_FOR_DECISION', accepted: false, blockerJson: null }
  }
  return { intent: 'RECEIVE', state: 'READY', accepted: true, blockerJson: null }
}

async function readReceiveMaterializationInputs(
  transaction: Transaction,
  reserved: Awaited<ReturnType<typeof reserveReceiveFetch>>,
  input: PrepareCollaborationOperationInput,
) {
  const permission = await requireCollaborationPermission(
    transaction,
    input.bindingId,
    'PREPARE',
    input.expectedPolicyVersion,
  )
  const current = await transaction.collaborationOperation.findUnique({ where: { id: reserved.operation.id } })
  if (!current) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  if (current.state !== 'PREPARING' || current.sourceSnapshotHash !== receiveReservationDigest(input)) {
    throw new ServiceError('The receive operation changed before classification.', 'CONFLICT', 409)
  }
  const localSnapshot = await projectSnapshotInTransaction(transaction, permission.binding.id)
  return {
    bindingId: permission.binding.id,
    operationId: current.id,
    local: dependencyClosed(snapshotRecords(localSnapshot)),
    baselines: await baselineRecords(transaction, permission.binding.id),
  }
}

async function persistMaterializedReceive(
  transaction: Transaction,
  input: {
    operationId: string
    trigger: string | undefined
    observed: ReceiveFetchObservation
    sourceSnapshotHash: string
    payload: PreparedOperationPayload
    preparedDigest: string
    classification: ReceiveClassification
    disposition: ReceiveMaterializationDisposition
  },
) {
  const operation = await transaction.collaborationOperation.update({
    where: { id: input.operationId },
    data: {
      intent: input.disposition.intent,
      state: input.disposition.state,
      sourceRevision: input.observed.sourceRevision,
      targetRevision: input.observed.targetRevision,
      localReadSetHash: input.payload.localReadSetHash,
      preparedJson: canonicalJson(input.payload),
      preparedDigest: input.preparedDigest,
      acceptedDigest: input.disposition.accepted ? input.preparedDigest : null,
      blockerJson: input.disposition.blockerJson,
      version: { increment: 1 },
    },
  })
  await persistPreparedOperationPlan(transaction, {
    operationId: operation.id,
    intent: input.disposition.intent,
    sourceRevision: input.observed.sourceRevision,
    targetRevision: input.observed.targetRevision,
    trigger: input.trigger,
    payload: input.payload,
    preparedDigest: input.preparedDigest,
  })
  const sourceReceipt = { ...input.observed, snapshotHash: input.sourceSnapshotHash }
  await transaction.collaborationOperationArtifact.create({
    data: {
      operationId: operation.id,
      kind: 'GIT_RECEIVE_SOURCE',
      revision: 1,
      payloadJson: canonicalJson(sourceReceipt),
      payloadHash: collaborationHash(sourceReceipt),
    },
  })
  await appendJournal(transaction, operation.id, 'PREPARED', {
    preparedDigest: input.preparedDigest,
    localReadSetHash: input.payload.localReadSetHash,
    dependencyClosed: true,
    plan: operationPlan(
      input.disposition.intent,
      input.observed.sourceRevision,
      input.observed.targetRevision,
      input.trigger,
    ).map(step => step.kind),
  })
  await appendJournal(transaction, operation.id, 'RECEIVE_CLASSIFIED', input.classification)
  return operation
}

async function materializeObservedReceive(
  reserved: Awaited<ReturnType<typeof reserveReceiveFetch>>,
  input: PrepareCollaborationOperationInput,
  observed: ReceiveFetchObservation,
  client: PrismaClient,
) {
  const sourceSnapshot = await readCollaborationSnapshotAtCommit({
    repositoryRoot: reserved.binding.repositoryRoot,
    commit: observed.sourceRevision,
    operationId: reserved.operation.id,
  })
  const received = dependencyClosed(sourceSnapshot.records)
  assertMatchingPortableProject(received, reserved.binding.portableProjectId)
  const classification = await classifyPinnedReceive({
    repositoryRoot: reserved.binding.repositoryRoot,
    sourceRevision: observed.sourceRevision,
    targetRevision: observed.targetRevision,
  })
  const materialized = await client.$transaction(async transaction => {
    const materialization = await readReceiveMaterializationInputs(transaction, reserved, input)
    const payload = buildPreparedPayload(received, materialization.local, materialization.baselines)
    const preparedDigest = collaborationHash(payload)
    const disposition = receiveMaterializationDisposition(classification, requiredDecisionKeys(payload).size > 0)
    const operation = await persistMaterializedReceive(transaction, {
      operationId: materialization.operationId,
      trigger: input.trigger,
      observed,
      sourceSnapshotHash: sourceSnapshot.snapshotHash,
      payload,
      preparedDigest,
      classification,
      disposition,
    })
    return { operation, classification }
  })
  if (materialized.classification.kind === 'DIVERGED' && materialized.classification.foreignPaths.length === 0) {
    await prepareDivergentCollaborationReconciliation(
      {
        operationId: materialized.operation.id,
        expectedVersion: materialized.operation.version,
        preparedDigest: materialized.operation.preparedDigest!,
        queueAfterPreparation: true,
      },
      client,
    )
    return client.collaborationOperation.findUniqueOrThrow({ where: { id: materialized.operation.id } })
  }
  return materialized.operation
}

export async function prepareCollaborationOperation(
  input: PrepareCollaborationOperationInput,
  client: PrismaClient = prisma,
  hooks?: PrepareCollaborationOperationHooks,
) {
  if (!input.idempotencyKey.trim()) throw new ServiceError('An idempotency key is required.', 'VALIDATION', 400)
  if (input.intent === 'RECEIVE' && !input.incomingRecords) {
    const reserved = await reserveReceiveFetch(input, client)
    if (reserved.operation.state !== 'PREPARING') return publicOperation(reserved.operation)
    const observed =
      (await observedReceiveFetch(reserved.operation.id, client)) ??
      (await recoverReceiveFetchObservation(reserved, input, client)) ??
      (await fetchAndObserveReceiveSource(reserved, input, client, hooks))
    try {
      return publicOperation(await materializeObservedReceive(reserved, input, observed, client))
    } catch (error) {
      // Once a fetch receipt exists, malformed source content or classification
      // is known durable state—not an unknown Git effect—so make the operation
      // observable and recoverable instead of dropping its identity.
      await blockReceiveAfterObservedFetch(reserved.operation.id, client, error)
      throw error
    }
  }
  const publicationPreparation =
    input.intent === 'PUBLISH'
      ? await (async () => {
          const binding = await client.$transaction(transaction =>
            requireCollaborationPermission(transaction, input.bindingId, 'PREPARE', input.expectedPolicyVersion),
          )
          const [snapshot, identity] = await Promise.all([
            observeCollaborationSnapshot({ repositoryRoot: binding.binding.repositoryRoot }),
            inspectRepository(binding.binding.repositoryRoot, binding.binding.remoteName),
          ])
          return { expectedPreviousSnapshotHash: snapshot.snapshotHash, targetRevision: identity.head }
        })()
      : undefined
  const persistedInput: PersistedPrepareCollaborationOperationInput = {
    ...input,
    ...(publicationPreparation ? { targetRevision: publicationPreparation.targetRevision } : {}),
    expectedPreviousSnapshotHash: publicationPreparation?.expectedPreviousSnapshotHash,
  }
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
    const requestDigest = operationInputDigest(persistedInput, incoming)
    const existing = await findIdempotentOperation(transaction, binding.id, persistedInput, requestDigest)
    if (existing) return publicOperation(existing)
    const local = dependencyClosed(snapshotRecords(localSnapshot))
    const baselines = input.intent === 'PUBLISH' ? local : await baselineRecords(transaction, binding.id)
    const payload = buildPreparedPayload(incoming, local, baselines)
    return publicOperation(await createPreparedOperation(transaction, persistedInput, binding, payload, requestDigest))
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
  if (isDivergentReconciliationOperation(operation)) {
    throw new ServiceError(
      'Divergent reconciliation proposals must use the dedicated decision authority.',
      'CONFLICT',
      409,
    )
  }
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
  const operation = await transaction.collaborationOperation.findFirst({
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
  requestVersion: number,
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
      requestVersion,
      evidenceJson: canonicalJson(receipt),
      evidenceHash,
      completedVersion,
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
    return completeOperation(transaction, operation.id, step, input.expectedVersion, receipt, 'DATABASE_APPLIED')
  })
}

async function executePublication(
  input: ExecuteCollaborationOperationInput,
  client: PrismaClient,
  hooks?: FilesystemGitMutationHooks,
) {
  // Publication mutates appraise/collaboration in the same worktree that later
  // Git steps mutate.  Resolve the verified shared Git directory before
  // starting the durable filesystem intent, then keep that exact lock alive
  // without holding a database transaction across filesystem work.
  const candidate = await client.collaborationOperation.findUnique({
    where: { id: input.operationId },
    include: { binding: true },
  })
  if (!candidate) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  const inspect = hooks?.inspectRepository ?? inspectRepository
  const initialIdentity = await inspect(candidate.binding.repositoryRoot, candidate.binding.remoteName)
  const lease = await client.$transaction(transaction =>
    acquireCollaborationGitMutationLock(transaction, initialIdentity.commonDirectory, candidate.id),
  )
  try {
    return await withCollaborationGitMutationLeaseHeartbeat(client, lease, async () => {
      // A retargeted/symlink-swapped repository cannot inherit a lock taken for
      // a different common Git directory.
      await assertCollaborationGitMutationIdentity(
        candidate.binding.repositoryRoot,
        initialIdentity.commonDirectory,
        candidate.binding.remoteName,
        inspect,
      )
      const applying = await client.$transaction(async transaction => {
        await assertCollaborationGitMutationLock(transaction, lease)
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
      // The install touched a path rooted in the leased repository. Re-read
      // the common Git directory before recording either success or a blocked
      // outcome, so a retargeted path cannot certify an effect under another
      // repository's mutation lease.
      await assertCollaborationGitMutationIdentity(
        applying.operation.binding.repositoryRoot,
        initialIdentity.commonDirectory,
        applying.operation.binding.remoteName,
        inspect,
      )
      if (installed.status !== 'succeeded') {
        await client.collaborationOperation.update({
          where: { id: applying.operation.id },
          data: { state: 'BLOCKED', blockerJson: canonicalJson(installed) },
        })
        throw new ServiceError(
          'Repository collaboration files changed outside this operation.',
          'CONFLICT',
          409,
          installed,
        )
      }
      return client.$transaction(async transaction => {
        await assertCollaborationGitMutationLock(transaction, lease)
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
        return completeOperation(
          transaction,
          operation.id,
          applying.step,
          input.expectedVersion,
          receipt,
          'PUBLICATION_COMPLETED',
        )
      })
    })
  } finally {
    await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, lease))
  }
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
    const completedVersion = operation.version + 1
    await transaction.collaborationOperationStep.update({
      where: { operationId_ordinal: { operationId: operation.id, ordinal: step.ordinal } },
      data: {
        state: 'COMPLETED',
        requestVersion: input.expectedVersion,
        evidenceJson: canonicalJson(receipt),
        evidenceHash: receiptHash,
        completedVersion,
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
  hooks?: FilesystemGitMutationHooks,
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
          ? await executePublication(input, client, hooks)
          : next.kind === 'APPLY_DATABASE'
            ? await executeDatabaseOperation(input, client)
            : (() => {
                throw new ServiceError(`The next operation step (${next.kind}) is not executable.`, 'CONFLICT', 409)
              })()
  return publicOperation(completed)
}

/**
 * Advances only the persisted, permission-checked plan that an exact decision
 * already accepted. Callers never supply a Git step, revision, or permission.
 * A running boundary is left for its crash-recovery path rather than guessed
 * past, and every successful iteration must advance the durable version.
 */
function continuationStepLimit(input: { maxSteps?: number }) {
  const maxSteps = input.maxSteps ?? 12
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 24)
    throw new ServiceError('Continuation step limit is out of range.', 'VALIDATION', 400)
  return maxSteps
}

async function loadContinuableAcceptedOperation(operationId: string, client: PrismaClient) {
  const operation = await client.collaborationOperation.findUnique({
    where: { id: operationId },
    include: { steps: { where: { state: 'RUNNING' }, select: { ordinal: true } } },
  })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  if (operation.state === 'COMPLETED') return operation
  if (operation.state !== 'READY') {
    throw new ServiceError('Accepted collaboration operation cannot continue from its current state.', 'CONFLICT', 409)
  }
  if (operation.steps.length) {
    throw new ServiceError(
      'A collaboration boundary is still running and requires recovery before continuation.',
      'CONFLICT',
      409,
    )
  }
  if (!operation.preparedDigest) {
    throw new ServiceError('Accepted collaboration operation has no durable prepared digest.', 'CONFLICT', 409)
  }
  return operation
}

async function continueOneAcceptedOperationStep(
  operation: Awaited<ReturnType<typeof loadContinuableAcceptedOperation>>,
  client: PrismaClient,
) {
  const completed = await executeCollaborationOperation(
    {
      operationId: operation.id,
      expectedVersion: operation.version,
      preparedDigest: operation.preparedDigest!,
      idempotencyKey: operation.idempotencyKey,
    },
    client,
  )
  if (completed.version <= operation.version) {
    throw new ServiceError('Accepted collaboration continuation did not advance its durable version.', 'CONFLICT', 409)
  }
  return completed
}

export async function continueAcceptedCollaborationOperation(
  input: { operationId: string; maxSteps?: number },
  client: PrismaClient = prisma,
) {
  const maxSteps = continuationStepLimit(input)
  for (let executed = 0; executed < maxSteps; executed += 1) {
    const operation = await loadContinuableAcceptedOperation(input.operationId, client)
    if (operation.state === 'COMPLETED') return publicOperation(operation)
    const completed = await continueOneAcceptedOperationStep(operation, client)
    if (completed.state === 'COMPLETED') return completed
  }
  throw new ServiceError('Accepted collaboration operation exceeded its bounded continuation plan.', 'CONFLICT', 409)
}

function hasFilesystemRecoveryIdentity(running: FilesystemRecoveryStep) {
  return (
    running.requestVersion !== null &&
    Boolean(running.intentJson) &&
    Boolean(running.intentHash) &&
    running.executorEpoch !== null
  )
}

function matchesFilesystemRecoveryIntent(
  intent: FilesystemStepIntent,
  operation: FilesystemRecoveryOperation,
  running: FilesystemRecoveryStep,
) {
  return (
    intent.schema === 'appraise.repository-collaboration.filesystem-step-intent/v1' &&
    intent.operationId === operation.id &&
    intent.ordinal === running.ordinal &&
    intent.kind === running.kind &&
    intent.requestVersion === running.requestVersion &&
    intent.executorEpoch === running.executorEpoch &&
    typeof intent.snapshotHash === 'string' &&
    collaborationHash(intent) === running.intentHash
  )
}

function parseFilesystemRecoveryIntent(
  operation: FilesystemRecoveryOperation,
  running: FilesystemRecoveryStep,
): FilesystemStepIntent {
  let intent: FilesystemStepIntent
  try {
    intent = JSON.parse(running.intentJson!) as FilesystemStepIntent
  } catch {
    throw new ServiceError('The applying filesystem step has an invalid durable intent.', 'CONFLICT', 409)
  }
  if (!matchesFilesystemRecoveryIntent(intent, operation, running)) {
    throw new ServiceError('The applying filesystem step intent does not match its durable fence.', 'CONFLICT', 409)
  }
  return intent
}

function assertFilesystemRecoveryStep(
  operation: FilesystemRecoveryOperation,
  running: FilesystemRecoveryStep | undefined,
): asserts running is FilesystemRecoveryStep {
  if (operation.state !== 'APPLYING' || !running || running.kind !== 'INSTALL_SNAPSHOT') {
    throw new ServiceError('No applying filesystem publication step requires recovery.', 'CONFLICT', 409)
  }
  if (!hasFilesystemRecoveryIdentity(running) || running.startedVersion !== operation.version) {
    throw new ServiceError('The applying filesystem step has no durable execution identity.', 'CONFLICT', 409)
  }
}

async function loadFilesystemRecovery(
  operationId: string,
  client: PrismaClient,
): Promise<{ operation: FilesystemRecoveryOperation; running: FilesystemRecoveryStep; intent: FilesystemStepIntent }> {
  const operation = await client.collaborationOperation.findUnique({
    where: { id: operationId },
    include: { binding: true, steps: { orderBy: { ordinal: 'asc' } } },
  })
  if (!operation) throw new ServiceError('Collaboration operation was not found.', 'NOT_FOUND', 404)
  const running = operation.steps.find(step => step.state === 'RUNNING')
  assertFilesystemRecoveryStep(operation, running)
  return { operation, running, intent: parseFilesystemRecoveryIntent(operation, running) }
}

async function expectedPreviousFilesystemSnapshot(
  operationId: string,
  client: PrismaClient,
): Promise<string | null | undefined> {
  const artifact = await client.collaborationOperationArtifact.findFirst({
    where: { operationId, kind: 'PREPARED_PUBLICATION_FILESYSTEM', revision: 1 },
  })
  try {
    const payload = artifact ? (JSON.parse(artifact.payloadJson) as { expectedPreviousSnapshotHash?: unknown }) : null
    return payload?.expectedPreviousSnapshotHash === null || typeof payload?.expectedPreviousSnapshotHash === 'string'
      ? payload.expectedPreviousSnapshotHash
      : undefined
  } catch {
    return undefined
  }
}

function classifyFilesystemRecovery(
  recovered: { status: string },
  observedSnapshotHash: string | null,
  expectedSnapshotHash: string,
  expectedPreviousSnapshotHash: string | null | undefined,
): FilesystemRecoveryClassification {
  if (
    observedSnapshotHash === expectedSnapshotHash &&
    ['NO_RECOVERY_NEEDED', 'INSTALLED_STAGING'].includes(recovered.status)
  )
    return 'VERIFIED_COMPLETED'
  if (
    observedSnapshotHash === expectedPreviousSnapshotHash &&
    ['NO_RECOVERY_NEEDED', 'RESTORED_BACKUP'].includes(recovered.status)
  )
    return 'SAFE_NO_EFFECT_RETRY'
  return 'AMBIGUOUS_BLOCK'
}

function recoveryBoundary(operation: FilesystemRecoveryOperation): { stagingPath: string; backupPath: string } {
  const journal = JSON.parse(operation.mutationJournalJson) as Array<{ stagingPath?: string; backupPath?: string }>
  const boundary = [...journal].reverse().find(item => item.stagingPath && item.backupPath)
  if (!boundary?.stagingPath || !boundary.backupPath) {
    throw new ServiceError('No durable filesystem recovery boundary exists.', 'CONFLICT', 409)
  }
  return { stagingPath: boundary.stagingPath, backupPath: boundary.backupPath }
}

type FilesystemRecoveryDetails = {
  classification: FilesystemRecoveryClassification
  expectedSnapshotHash: string
  expectedPreviousSnapshotHash: string | null
  observedSnapshotHash: string | null
  [key: string]: unknown
}

async function assertCurrentFilesystemRecovery(
  transaction: Transaction,
  recovery: { operation: FilesystemRecoveryOperation; running: FilesystemRecoveryStep },
  lease: Awaited<ReturnType<typeof acquireCollaborationGitMutationLock>>,
) {
  await assertCollaborationGitMutationLock(transaction, lease)
  const current = await transaction.collaborationOperation.findUnique({
    where: { id: recovery.operation.id },
    include: { steps: true },
  })
  const currentStep = current?.steps.find(step => step.ordinal === recovery.running.ordinal)
  if (
    !current ||
    !currentStep ||
    current.state !== 'APPLYING' ||
    current.version !== recovery.operation.version ||
    currentStep.state !== 'RUNNING' ||
    currentStep.intentHash !== recovery.running.intentHash ||
    currentStep.executorEpoch !== recovery.running.executorEpoch
  ) {
    throw new ServiceError('The applying filesystem operation changed before recovery.', 'CONFLICT', 409)
  }
  return { current, currentStep }
}

async function completeRecoveredFilesystemStep(
  transaction: Transaction,
  current: NonNullable<Awaited<ReturnType<typeof transaction.collaborationOperation.findUnique>>>,
  currentStep: FilesystemRecoveryStep,
  details: FilesystemRecoveryDetails,
  evidenceHash: string,
) {
  const completedVersion = current.version + 1
  await transaction.collaborationOperationStep.update({
    where: { operationId_ordinal: { operationId: current.id, ordinal: currentStep.ordinal } },
    data: {
      state: 'COMPLETED',
      evidenceJson: canonicalJson(details),
      evidenceHash,
      completedVersion,
      completedAt: new Date(),
    },
  })
  await transaction.collaborationOperationArtifact.create({
    data: {
      operationId: current.id,
      kind: `STEP_${currentStep.kind}`,
      revision: 2,
      payloadJson: canonicalJson(details),
      payloadHash: evidenceHash,
    },
  })
  await appendJournal(transaction, current.id, 'FILESYSTEM_RECOVERED', details)
  return transaction.collaborationOperation.update({
    where: { id: current.id },
    data: { state: 'READY', version: { increment: 1 } },
  })
}

async function resetRecoveredFilesystemStep(
  transaction: Transaction,
  current: NonNullable<Awaited<ReturnType<typeof transaction.collaborationOperation.findUnique>>>,
  currentStep: FilesystemRecoveryStep,
  details: FilesystemRecoveryDetails,
) {
  await transaction.collaborationOperationStep.update({
    where: { operationId_ordinal: { operationId: current.id, ordinal: currentStep.ordinal } },
    data: {
      state: 'PENDING',
      requestVersion: null,
      intentJson: null,
      intentHash: null,
      executorEpoch: null,
      startedVersion: null,
      completedVersion: null,
      startedAt: null,
      completedAt: null,
    },
  })
  await appendJournal(transaction, current.id, 'FILESYSTEM_RECOVERED', details)
  return transaction.collaborationOperation.update({
    where: { id: current.id },
    data: { state: 'READY', executorEpoch: { increment: 1 }, version: { increment: 1 } },
  })
}

async function blockRecoveredFilesystemStep(
  transaction: Transaction,
  current: NonNullable<Awaited<ReturnType<typeof transaction.collaborationOperation.findUnique>>>,
  currentStep: FilesystemRecoveryStep,
  details: FilesystemRecoveryDetails,
  evidenceHash: string,
) {
  await transaction.collaborationOperationStep.update({
    where: { operationId_ordinal: { operationId: current.id, ordinal: currentStep.ordinal } },
    data: { state: 'BLOCKED', evidenceJson: canonicalJson(details), evidenceHash, completedAt: new Date() },
  })
  await appendJournal(transaction, current.id, 'FILESYSTEM_RECOVERED', details)
  return transaction.collaborationOperation.update({
    where: { id: current.id },
    data: { state: 'BLOCKED', blockerJson: canonicalJson(details), version: { increment: 1 } },
  })
}

async function reconcileFilesystemRecovery(
  recovery: { operation: FilesystemRecoveryOperation; running: FilesystemRecoveryStep },
  lease: Awaited<ReturnType<typeof acquireCollaborationGitMutationLock>>,
  details: FilesystemRecoveryDetails,
  client: PrismaClient,
) {
  return client.$transaction(async transaction => {
    const { current, currentStep } = await assertCurrentFilesystemRecovery(transaction, recovery, lease)
    const evidenceHash = collaborationHash(details)
    if (details.classification === 'VERIFIED_COMPLETED') {
      return completeRecoveredFilesystemStep(transaction, current, currentStep, details, evidenceHash)
    }
    if (details.classification === 'SAFE_NO_EFFECT_RETRY') {
      return resetRecoveredFilesystemStep(transaction, current, currentStep, details)
    }
    return blockRecoveredFilesystemStep(transaction, current, currentStep, details, evidenceHash)
  })
}

async function performFilesystemRecovery(
  recovery: { operation: FilesystemRecoveryOperation; running: FilesystemRecoveryStep; intent: FilesystemStepIntent },
  lease: Awaited<ReturnType<typeof acquireCollaborationGitMutationLock>>,
  client: PrismaClient,
  commonDirectory: string,
  hooks?: FilesystemGitMutationHooks,
) {
  const inspect = hooks?.inspectRepository ?? inspectRepository
  await client.$transaction(transaction => assertCollaborationGitMutationLock(transaction, lease))
  await assertCollaborationGitMutationIdentity(
    recovery.operation.binding.repositoryRoot,
    commonDirectory,
    recovery.operation.binding.remoteName,
    inspect,
  )
  const boundary = recoveryBoundary(recovery.operation)
  const recoverSnapshot = hooks?.recoverCollaborationSnapshot ?? recoverCollaborationSnapshot
  const recovered = await recoverSnapshot({
    repositoryRoot: recovery.operation.binding.repositoryRoot,
    operationId: recovery.operation.id,
    stagingPath: boundary.stagingPath,
    backupPath: boundary.backupPath,
  })
  await assertCollaborationGitMutationIdentity(
    recovery.operation.binding.repositoryRoot,
    commonDirectory,
    recovery.operation.binding.remoteName,
    inspect,
  )
  const observed = await observeCollaborationSnapshot({ repositoryRoot: recovery.operation.binding.repositoryRoot })
  await assertCollaborationGitMutationIdentity(
    recovery.operation.binding.repositoryRoot,
    commonDirectory,
    recovery.operation.binding.remoteName,
    inspect,
  )
  const expectedPreviousSnapshotHash = await expectedPreviousFilesystemSnapshot(recovery.operation.id, client)
  const expectedSnapshotHash = recovery.intent.snapshotHash as string
  const classification = classifyFilesystemRecovery(
    recovered,
    observed.snapshotHash,
    expectedSnapshotHash,
    expectedPreviousSnapshotHash,
  )
  const details: FilesystemRecoveryDetails = {
    ...recovered,
    classification,
    expectedSnapshotHash,
    expectedPreviousSnapshotHash: expectedPreviousSnapshotHash ?? null,
    observedSnapshotHash: observed.snapshotHash,
  }
  const reconciled = await reconcileFilesystemRecovery(recovery, lease, details, client)
  return { ...details, operation: publicOperation(reconciled) }
}

export async function recoverCollaborationOperationFilesystem(
  operationId: string,
  client: PrismaClient = prisma,
  hooks?: FilesystemGitMutationHooks,
) {
  const recovery = await loadFilesystemRecovery(operationId, client)
  const inspect = hooks?.inspectRepository ?? inspectRepository
  const recoveryIdentity = await inspect(
    recovery.operation.binding.repositoryRoot,
    recovery.operation.binding.remoteName,
  )
  const recoveryLease = await client.$transaction(transaction =>
    acquireCollaborationGitMutationLock(transaction, recoveryIdentity.commonDirectory, recovery.operation.id),
  )
  try {
    return await withCollaborationGitMutationLeaseHeartbeat(client, recoveryLease, () =>
      performFilesystemRecovery(recovery, recoveryLease, client, recoveryIdentity.commonDirectory, hooks),
    )
  } finally {
    await client.$transaction(transaction => releaseCollaborationGitMutationLock(transaction, recoveryLease))
  }
}
