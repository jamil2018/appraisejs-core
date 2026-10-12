import { createHash, timingSafeEqual } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { qualityJourneyTriageEvidenceMaxBytes, qualityJourneyTriageEvidenceReadSchema } from '@/lib/quality-journey'
import { hashRuntimeCapsuleBytes, hashRuntimeCapsuleValue } from '@/lib/runtime-capsule'
import { ServiceError } from '@/services/shared/errors'
import { TestRunArtifactAccessService } from '@/services/test-run/test-run-artifact-access-service'
import type { TriageInput } from './quality-journey-triage-input'
import { externalAssignmentSecretHash } from './quality-journey-service'

function conflict(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}
function missing(message: string): never {
  throw new ServiceError(message, 'NOT_FOUND')
}
function unauthorized(message: string): never {
  throw new ServiceError(message, 'UNAUTHORIZED')
}

type SealedArtifact = { kind: string; contentHash: string; size: number }
type SealedEvidence = {
  journeyId: string
  targetProjectId: string
  executionCycleId: string
  cycleId: string
  testRunId: string
  runId: string
  runtimeCapsuleId: string | null
  runtimeCapsuleHash: string | null
  manifestHash: string | null
  artifacts: SealedArtifact[]
}
type EvidenceReadInput = ReturnType<typeof qualityJourneyTriageEvidenceReadSchema.parse>

async function loadLeaseRecords(input: EvidenceReadInput, client: PrismaClient) {
  const [journey, assignment] = await Promise.all([
    client.qualityJourney.findFirst({ where: { id: input.journeyId, targetProjectId: input.targetProjectId } }),
    client.qualityJourneyTriageAssignment.findFirst({
      where: { journeyId: input.journeyId, workItemId: input.workItemId },
      include: {
        workItem: { include: { attempts: { where: { id: input.attemptId }, include: { authorization: true } } } },
      },
    }),
  ])
  const item = assignment?.workItem
  const attempt = item?.attempts[0]
  const authorization = attempt?.authorization
  if (!journey || !assignment || !item || !attempt || !authorization)
    unauthorized('Triager evidence lease or authorization is invalid.')
  return { journey, assignment, item, attempt, authorization }
}

type LeaseRecords = Awaited<ReturnType<typeof loadLeaseRecords>>

function parseFrozenTriageInput(records: LeaseRecords): TriageInput {
  try {
    return JSON.parse(records.assignment.inputJson) as TriageInput
  } catch {
    return unauthorized('Triager evidence authority is corrupt.')
  }
}

function activeWorkItemIds(records: LeaseRecords): string[] {
  try {
    const ids = JSON.parse(records.journey.activeWorkItemIdsJson)
    if (!Array.isArray(ids)) unauthorized('Triager evidence lease or receipt authority is invalid.')
    return ids
  } catch {
    return unauthorized('Triager evidence authority is corrupt.')
  }
}

function assertActiveTriageCycle(records: LeaseRecords, frozen: TriageInput) {
  if (records.journey.stage !== 'TRIAGE' || frozen.cycleId !== records.journey.activeCycleId)
    unauthorized('Triager evidence lease or receipt authority is invalid.')
  if (!activeWorkItemIds(records).includes(records.item.id))
    unauthorized('Triager evidence lease or receipt authority is invalid.')
}

function assertTriagerAssignment(records: LeaseRecords) {
  if (records.assignment.workItemId !== records.item.id || records.item.role !== 'TRIAGER')
    unauthorized('Triager evidence lease or receipt authority is invalid.')
  if (records.item.status !== 'IN_PROGRESS' || records.item.currentAttempt !== records.attempt.attempt)
    unauthorized('Triager evidence lease or receipt authority is invalid.')
}

function assertAttemptIdentity(input: EvidenceReadInput, records: LeaseRecords) {
  const { attempt, item } = records
  if (attempt.workItemId !== item.id || attempt.id !== input.attemptId || attempt.leaseId !== input.leaseId)
    unauthorized('Triager evidence lease or receipt authority is invalid.')
  const ownerHash = ownerVerifier(input.ownerToken, attempt.executionMode)
  if (!exactHexHash(attempt.ownerTokenHash) || !exactHexHash(ownerHash))
    unauthorized('Triager evidence lease or receipt authority is invalid.')
  if (!timingSafeEqual(Buffer.from(attempt.ownerTokenHash, 'hex'), Buffer.from(ownerHash, 'hex')))
    unauthorized('Triager evidence lease or receipt authority is invalid.')
}

function ownerVerifier(secret: string, executionMode: string) {
  if (executionMode === 'EXTERNAL_V1') return externalAssignmentSecretHash(secret)
  if (executionMode === 'MANAGED') return createHash('sha256').update(secret).digest('hex')
  return unauthorized('Triager evidence lease or receipt authority is invalid.')
}

const exactHexHash = (value: string) => /^[a-f0-9]{64}$/.test(value)

function canonicalHash(value: unknown) {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}

function parseAdmission(value: string | null): Record<string, unknown> {
  if (!value) unauthorized('Triager external admission authority is invalid.')
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      unauthorized('Triager external admission authority is invalid.')
    return parsed as Record<string, unknown>
  } catch {
    return unauthorized('Triager external admission authority is invalid.')
  }
}

function assertExternalAdmissionMetadata(records: LeaseRecords) {
  const { attempt, authorization } = records
  const required = [
    attempt.externalAdmissionId,
    attempt.externalAdmissionHash,
    attempt.externalAdmissionRequestHash,
    attempt.assignmentId,
    attempt.externalAdmittedAt,
    attempt.externalPrincipalId,
  ]
  const authorityMatches = [
    [attempt.externalPrincipalAssurance, 'PROJECT_CREDENTIAL_ONLY'],
    [authorization.externalAdmissionProtocol, 'EXTERNAL_V1'],
    [authorization.externalPrincipalId, attempt.externalPrincipalId],
    [authorization.externalPrincipalAssurance, attempt.externalPrincipalAssurance],
  ]
  if (required.some(value => !value) || authorityMatches.some(([actual, expected]) => actual !== expected))
    unauthorized('Triager external admission authority is invalid.')
}

function assertAdmissionBindings(actual: Record<string, unknown>, expected: Record<string, unknown>) {
  if (Object.entries(expected).some(([key, value]) => actual[key] !== value))
    unauthorized('Triager external admission authority is invalid.')
}

function assertAdmissionPrincipal(value: unknown, records: LeaseRecords) {
  const principal = value as Record<string, unknown> | null
  if (
    !principal ||
    principal.principalId !== records.attempt.externalPrincipalId ||
    principal.assurance !== records.attempt.externalPrincipalAssurance
  )
    unauthorized('Triager external admission authority is invalid.')
}

function assertAdmissionReceipt(receipt: Record<string, unknown>, records: LeaseRecords) {
  const { attempt, item, authorization, journey } = records
  assertAdmissionBindings(receipt, {
    schemaVersion: 'appraise.quality-journey-external-admission/v1',
    admissionId: attempt.externalAdmissionId,
    protocol: 'EXTERNAL_V1',
    hostIsolation: 'NOT_ATTESTED',
    assignmentId: attempt.assignmentId,
    assignmentGeneration: attempt.assignmentGeneration,
    attemptId: attempt.id,
    workItemId: item.id,
    journeyId: journey.id,
    targetProjectId: journey.targetProjectId,
    role: 'TRIAGER',
    authorizationId: authorization.id,
    authorizationHash: authorization.authorizationHash,
    inputHash: item.inputHash,
    leaseId: attempt.leaseId,
  })
  assertAdmissionPrincipal(receipt.principal, records)
}

function assertAdmissionRequest(
  request: Record<string, unknown>,
  receipt: Record<string, unknown>,
  records: LeaseRecords,
) {
  assertAdmissionBindings(request, {
    schemaVersion: 'appraise.quality-journey-external-admission-request/v1',
    operation: 'ADMIT',
    protocol: 'EXTERNAL_V1',
    assignmentId: receipt.assignmentId,
    assignmentGeneration: receipt.assignmentGeneration,
    attemptId: receipt.attemptId,
    workItemId: receipt.workItemId,
    journeyId: receipt.journeyId,
    targetProjectId: receipt.targetProjectId,
    role: receipt.role,
    leaseId: receipt.leaseId,
    assignmentSecretVerifier: records.attempt.ownerTokenHash,
  })
  assertAdmissionPrincipal(request.principal, records)
}

function assertExternalAdmission(records: LeaseRecords) {
  const { attempt } = records
  assertExternalAdmissionMetadata(records)
  const receipt = parseAdmission(attempt.externalAdmissionJson)
  const request = parseAdmission(attempt.externalAdmissionRequestJson)
  if (
    attempt.externalAdmissionHash !== canonicalHash(receipt) ||
    attempt.externalAdmissionRequestHash !== canonicalHash(request)
  )
    unauthorized('Triager external admission authority is invalid.')
  assertAdmissionReceipt(receipt, records)
  assertAdmissionRequest(request, receipt, records)
}

function assertLiveAttempt(records: LeaseRecords) {
  const { attempt } = records
  if (attempt.status !== 'IN_PROGRESS' || attempt.leaseExpiresAt <= new Date())
    unauthorized('Triager evidence lease or receipt authority is invalid.')
  if (attempt.executionMode === 'EXTERNAL_V1') {
    assertExternalAdmission(records)
  } else if (!attempt.spawnReceiptHash || !attempt.spawnReceiptJson)
    unauthorized('Triager evidence lease or receipt authority is invalid.')
}

function assertLiveAuthorization(input: EvidenceReadInput, records: LeaseRecords) {
  const { authorization, attempt, item, journey } = records
  if (attempt.authorizationId !== authorization.id || authorization.journeyId !== journey.id)
    unauthorized('Triager evidence lease or receipt authority is invalid.')
  if (
    authorization.targetProjectId !== input.targetProjectId ||
    authorization.workItemId !== item.id ||
    authorization.role !== 'TRIAGER'
  )
    unauthorized('Triager evidence lease or receipt authority is invalid.')
  if (authorization.revokedAt || authorization.cancelledAt)
    unauthorized('Triager evidence lease or receipt authority is invalid.')
}

/** The worker's lease is required for bytes, unlike historical triage context. */
async function assertTriageEvidenceLease(input: EvidenceReadInput, client: PrismaClient) {
  const records = await loadLeaseRecords(input, client)
  const frozen = parseFrozenTriageInput(records)
  assertActiveTriageCycle(records, frozen)
  assertTriagerAssignment(records)
  assertAttemptIdentity(input, records)
  assertLiveAttempt(records)
  assertLiveAuthorization(input, records)
  if (!frozen.runs.some(run => run.evidenceReceiptId === input.receiptId))
    unauthorized('Triager evidence lease or receipt authority is invalid.')
}

async function loadSealedReceipt(input: EvidenceReadInput, client: PrismaClient) {
  const receipt = await client.qualityJourneyExecutionEvidenceReceipt.findFirst({
    where: {
      id: input.receiptId,
      executionCycle: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    },
    include: {
      executionCycle: { include: { testRuns: { include: { testRun: { include: { runtimeCapsule: true } } } } } },
    },
  })
  if (!receipt) missing('Sealed Journey evidence receipt not found.')
  return receipt
}

function parseSealedEvidence(receipt: Awaited<ReturnType<typeof loadSealedReceipt>>): SealedEvidence {
  try {
    const evidence = JSON.parse(receipt.evidenceJson) as SealedEvidence
    if (hashRuntimeCapsuleValue(evidence) !== receipt.receiptHash) conflict('Sealed Journey evidence hash is corrupt.')
    return evidence
  } catch (error) {
    if (error instanceof ServiceError) throw error
    return conflict('Sealed Journey evidence is corrupt.')
  }
}

function assertEvidenceScope(
  input: EvidenceReadInput,
  receipt: Awaited<ReturnType<typeof loadSealedReceipt>>,
  evidence: SealedEvidence,
) {
  const cycle = receipt.executionCycle
  if (evidence.journeyId !== input.journeyId || evidence.targetProjectId !== input.targetProjectId)
    conflict('Sealed Journey evidence scope is corrupt.')
  if (
    evidence.executionCycleId !== cycle.id ||
    evidence.cycleId !== cycle.cycleId ||
    evidence.testRunId !== receipt.testRunId
  )
    conflict('Sealed Journey evidence scope is corrupt.')
}

function findEvidenceRun(receipt: Awaited<ReturnType<typeof loadSealedReceipt>>) {
  const binding = receipt.executionCycle.testRuns.find(item => item.testRunId === receipt.testRunId)
  const run = binding?.testRun
  const capsule = run?.runtimeCapsule
  if (!binding || !run || !capsule) conflict('Sealed Journey runtime capsule identity is corrupt.')
  return { binding, run, capsule }
}

function assertRuntimeIdentity(
  input: EvidenceReadInput,
  evidence: SealedEvidence,
  run: ReturnType<typeof findEvidenceRun>,
) {
  if (run.run.targetProjectId !== input.targetProjectId || run.binding.runId !== evidence.runId)
    conflict('Sealed Journey runtime capsule identity is corrupt.')
  if (run.capsule.testRunId !== run.run.id || evidence.runtimeCapsuleId !== run.capsule.id)
    conflict('Sealed Journey runtime capsule identity is corrupt.')
  if (evidence.runtimeCapsuleHash !== run.capsule.capsuleHash || evidence.manifestHash !== run.capsule.manifestHash)
    conflict('Sealed Journey runtime capsule identity is corrupt.')
}

function sealedArtifact(evidence: SealedEvidence, input: EvidenceReadInput) {
  const artifact = evidence.artifacts.find(item => item.kind === input.artifactKind)
  if (!artifact) missing('The sealed evidence receipt has no requested artifact.')
  if (!Number.isSafeInteger(artifact.size) || artifact.size < 0 || artifact.size > qualityJourneyTriageEvidenceMaxBytes)
    conflict('Sealed Journey artifact descriptor is corrupt or exceeds the read limit.')
  if (!/^sha256:[a-f0-9]{64}$/.test(artifact.contentHash))
    conflict('Sealed Journey artifact descriptor is corrupt or exceeds the read limit.')
  return artifact
}

async function readVerifiedArtifact(
  input: EvidenceReadInput,
  evidence: SealedEvidence,
  artifact: SealedArtifact,
  client: PrismaClient,
) {
  const read = await new TestRunArtifactAccessService(client).readBytes({
    runId: evidence.runId,
    kind: input.artifactKind,
    expectedTargetProjectId: input.targetProjectId,
  })
  if (read.bytes.length !== artifact.size || hashRuntimeCapsuleBytes(read.bytes) !== artifact.contentHash)
    conflict('Artifact bytes differ from the sealed Journey evidence receipt.')
  return read
}

function pageArtifact(
  input: EvidenceReadInput,
  receipt: Awaited<ReturnType<typeof loadSealedReceipt>>,
  artifact: SealedArtifact,
  read: Awaited<ReturnType<typeof readVerifiedArtifact>>,
) {
  const offset = Math.min(input.offset, read.bytes.length)
  const endOffset = Math.min(offset + input.limit, read.bytes.length)
  return {
    receiptId: receipt.id,
    artifactKind: input.artifactKind,
    contentHash: artifact.contentHash,
    size: artifact.size,
    contentType: read.contentType,
    offset,
    endOffset,
    complete: endOffset === read.bytes.length,
    text: read.bytes.subarray(offset, endOffset).toString('utf8'),
  }
}

/** Reads only a report/log descriptor that the runtime sealed into this exact
 * Journey evidence receipt. Stored paths remain internal to artifact access. */
export async function readQualityJourneyTriageEvidence(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyTriageEvidenceReadSchema.parse(value)
  await assertTriageEvidenceLease(input, client)
  const receipt = await loadSealedReceipt(input, client)
  const evidence = parseSealedEvidence(receipt)
  assertEvidenceScope(input, receipt, evidence)
  const run = findEvidenceRun(receipt)
  assertRuntimeIdentity(input, evidence, run)
  const artifact = sealedArtifact(evidence, input)
  const read = await readVerifiedArtifact(input, evidence, artifact, client)
  // Revocation, replacement, and lease expiry can occur while artifact I/O is in progress.
  await assertTriageEvidenceLease(input, client)
  return pageArtifact(input, receipt, artifact, read)
}
