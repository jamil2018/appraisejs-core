import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { configuredDatabaseReads } = vi.hoisted(() => ({ configuredDatabaseReads: vi.fn() }))
// Importing this unit must never initialize or use the configured Prisma client.
vi.mock('@/config/db-config', () => ({
  default: new Proxy({}, {
    get: (_, key) => {
      configuredDatabaseReads(String(key))
      throw new Error('DEFAULT_DATABASE_ACCESS_FORBIDDEN')
    },
  }),
}))

import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  assignmentManifestSchema,
  createWorkerSpawnRequest,
  qualityJourneyContractDigest,
  qualityJourneyRoleRegistryVersion,
  resolveQualityJourneyCapabilityProfile,
  resolveQualityJourneyRoleDefinition,
  validateWorkerSpawnReceipt,
  workerSpawnReceiptSchema,
} from '@/lib/quality-journey'
import type { CoordinatorSessionBinding } from './quality-journey-coordinator-session'
import { trustedHumanCoordinatorSession } from './quality-journey-coordinator-session'
import {
  assertDiscoverySubmissionModeLineageInTransaction,
  externalAssignmentSecretHash,
  type ExternalQualityJourneySubmissionBinding,
} from './quality-journey-service'

type Row = Record<string, unknown>
type Role = 'SCOUT' | 'RESOURCE_EXPLORER'
type Mode = 'MANAGED' | 'EXTERNAL_V1'
const roles = ['SCOUT', 'RESOURCE_EXPLORER'] as const
const modes = ['MANAGED', 'EXTERNAL_V1'] as const
const json = canonicalContractJson
const hash = (value: unknown) => `sha256:${createHash('sha256').update(json(value)).digest('hex')}`
const scope = { journeyId: 'journey-lineage-test', targetProjectId: 'target-lineage-test' }
const principal = { principalId: 'principal-lineage-test', assurance: 'PROJECT_CREDENTIAL_ONLY' as const }
const secret = 'synthetic-assignment-secret-for-lineage-unit-tests-only'
const leaseExpiresAt = new Date('2099-01-01T00:00:00.000Z')
const admittedAt = '2026-10-24T00:00:00.000Z'
const readMethods = ['findFirst', 'findUnique'] as const
const writeMethods = ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'] as const

function matches(row: Row | null, where: Row) {
  return row !== null && Object.entries(where).every(([key, value]) => row[key] === value)
}

/** Canonical contracts, detached rows and read delegates only: no database or actor. */
function fixture(role: Role, mode: Mode) {
  const roleDefinition = resolveQualityJourneyRoleDefinition(qualityJourneyRoleRegistryVersion, role)!
  const profile = resolveQualityJourneyCapabilityProfile(
    qualityJourneyRoleRegistryVersion,
    roleDefinition.capabilityProfileId,
  )!
  const attemptId = 'attempt-lineage-test'
  const workItemId = 'work-lineage-test'
  const authorizationId = 'authorization-lineage-test'
  const leaseId = 'lease-lineage-test'
  const inputHash = hash('frozen-discovery-input')
  const assignment = assignmentManifestSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    ...scope,
    assignmentId: `qjma_${attemptId}`,
    workItemId,
    roleDefinition: {
      role,
      version: qualityJourneyRoleRegistryVersion,
      digest: qualityJourneyContractDigest(roleDefinition),
    },
    capabilityProfile: {
      profileId: profile.profileId,
      version: qualityJourneyRoleRegistryVersion,
      digest: qualityJourneyContractDigest(profile),
    },
    inputArtifacts: [],
    allowedTargetRoutes: role === 'SCOUT' ? ['route-lineage-test'] : [],
    allowedResourceIds: ['resource-lineage-test'],
    targetEnvironmentBindings: [{ environmentId: 'environment-lineage-test', origin: 'https://lineage.invalid' }],
    writableArtifactKinds: [...roleDefinition.writableArtifacts],
    scope: {
      permittedTools: [...roleDefinition.permittedTools],
      permittedCommands: [...roleDefinition.permittedCommands],
      filesystemPaths: [],
      networkOrigins: role === 'SCOUT' ? ['https://lineage.invalid'] : [],
      credentialGrantIds: [],
      targetAccess: role === 'SCOUT' ? 'READ_ONLY' : 'NONE',
    },
    stateHash: inputHash,
    inputHash,
    lease: { leaseId, expiresAt: leaseExpiresAt.toISOString(), heartbeatSeconds: 30 },
    idempotencyKey: `assignment_${attemptId}`,
    completionCriteria: ['Publish only the frozen Discovery scope.'],
  })
  // This real builder reconstructs registry/capability/assignment authority.
  const spawnRequest = createWorkerSpawnRequest({
    requestId: 'spawn-request-lineage-test', attemptId, manifest: assignment,
  })
  const spawnReceipt = workerSpawnReceiptSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    spawnReceiptId: 'spawn-receipt-lineage-test',
    assignmentId: assignment.assignmentId,
    workItemId,
    attemptId,
    roleDefinitionDigest: spawnRequest.roleDefinitionDigest,
    capabilityProfileDigest: spawnRequest.capabilityProfileDigest,
    outcome: 'STARTED',
    effectiveWorker: {
      modelId: 'synthetic-observation-model',
      reasoningLevel: spawnRequest.requestedJudgment,
      latencyPreference: spawnRequest.requestedLatency,
      toolIds: [...spawnRequest.capabilityProfile.requiredTools],
    },
    boundaries: spawnRequest.requiredBoundaries.map(boundary => ({
      boundary: boundary.boundary,
      requested: [...boundary.allowedValues],
      effective: [...boundary.allowedValues],
      status: 'VERIFIED',
      evidence: [hash({ syntheticBoundary: boundary.boundary })],
    })),
    startedAt: admittedAt,
  })
  validateWorkerSpawnReceipt(spawnReceipt, spawnRequest)
  // Projection of the actual canonical authorization fields, not a second policy.
  const authorizationFields = Object.fromEntries(Object.entries(assignment).filter(([key]) =>
    !['assignmentId', 'stateHash', 'inputHash', 'lease', 'idempotencyKey'].includes(key),
  ))
  const authorizationPayload = { ...authorizationFields, authorizationId }
  const credentials: CoordinatorSessionBinding = {
    ...scope,
    coordinatorSessionId: 'session-lineage-test',
    coordinatorGeneration: 1,
    coordinatorPrincipalId: principal.principalId,
  }
  const item: Row = {
    id: workItemId, ...scope, cycleId: 'cycle-lineage-test', role, status: 'IN_PROGRESS',
    inputHash, currentAttempt: 1, version: 1,
    roleContractDigest: assignment.roleDefinition.digest,
    inputArtifactRefsJson: json(assignment.inputArtifacts), advisoryInputRefsJson: '[]',
    allowedOutputsJson: json(assignment.writableArtifactKinds), completionCriteriaJson: json(assignment.completionCriteria),
    authorizationScopeJson: json({
      allowedTargetRoutes: assignment.allowedTargetRoutes,
      allowedResourceIds: assignment.allowedResourceIds,
      targetEnvironmentBindings: assignment.targetEnvironmentBindings,
      scope: assignment.scope,
    }),
  }
  const authorization: Row = {
    id: authorizationId, ...scope, workItemId, role,
    roleContractDigest: assignment.roleDefinition.digest,
    capabilityProfileId: assignment.capabilityProfile.profileId,
    capabilityProfileHash: assignment.capabilityProfile.digest,
    authorizationJson: json(authorizationPayload), authorizationHash: hash(authorizationPayload),
    revokedAt: null, cancelledAt: null,
    externalAdmissionProtocol: mode === 'EXTERNAL_V1' ? mode : null,
    externalPrincipalId: mode === 'EXTERNAL_V1' ? principal.principalId : null,
    externalPrincipalAssurance: mode === 'EXTERNAL_V1' ? principal.assurance : null,
  }
  // Exact seventeen-field shape emitted by admitExternalQualityJourneyWork.
  // There is no separately exported external receipt builder or public schema.
  const externalReceipt = {
    schemaVersion: 'appraise.quality-journey-external-admission/v1',
    admissionId: 'admission-lineage-test', protocol: 'EXTERNAL_V1',
    assignmentId: assignment.assignmentId, assignmentGeneration: 1,
    attemptId, workItemId, ...scope, role, principal: { ...principal },
    authorizationId, authorizationHash: authorization.authorizationHash, inputHash, leaseId,
    hostIsolation: 'NOT_ATTESTED', admittedAt,
  }
  const attempt: Row = {
    id: attemptId, workItemId, authorizationId, attempt: 1, assignmentGeneration: 1,
    assignmentId: assignment.assignmentId, assignmentJson: json(assignment), assignmentHash: hash(assignment),
    executionMode: mode, status: 'IN_PROGRESS', leaseId, leaseExpiresAt,
    heartbeatSeconds: 30,
    ownerTokenHash: mode === 'EXTERNAL_V1' ? externalAssignmentSecretHash(secret) : 'a'.repeat(64),
    spawnRequestId: mode === 'MANAGED' ? spawnRequest.requestId : null,
    spawnRequestJson: mode === 'MANAGED' ? json(spawnRequest) : null,
    spawnRequestHash: mode === 'MANAGED' ? hash(spawnRequest) : null,
    spawnReceiptId: mode === 'MANAGED' ? spawnReceipt.spawnReceiptId : null,
    spawnReceiptJson: mode === 'MANAGED' ? json(spawnReceipt) : null,
    spawnReceiptHash: mode === 'MANAGED' ? hash(spawnReceipt) : null,
    externalAdmissionId: mode === 'EXTERNAL_V1' ? externalReceipt.admissionId : null,
    externalAdmissionJson: mode === 'EXTERNAL_V1' ? json(externalReceipt) : null,
    externalAdmissionHash: mode === 'EXTERNAL_V1' ? hash(externalReceipt) : null,
    // The actual producer samples these independently; equality is not required.
    externalAdmittedAt: mode === 'EXTERNAL_V1' ? new Date('2026-10-24T00:00:01.000Z') : null,
    externalAdmissionRequestJson: null, externalAdmissionRequestHash: null,
    externalPrincipalId: mode === 'EXTERNAL_V1' ? principal.principalId : null,
    externalPrincipalAssurance: mode === 'EXTERNAL_V1' ? principal.assurance : null,
    replacementProjectionHash: null, predecessorDiagnosticsJson: null,
  }
  const binding: Row = {
    ...scope, attemptId, workItemId, authorizationId, role, leaseId, inputHash,
    assignmentId: assignment.assignmentId, assignmentGeneration: 1,
    sessionId: credentials.coordinatorSessionId, coordinatorGeneration: 1, provenance: 'CLAIM_SESSION_V1',
  }
  const session: Row = {
    id: credentials.coordinatorSessionId, ...scope, generation: 1,
    ownerPrincipalId: principal.principalId, hostKind: 'APP_SERVER_LOCAL_V1', status: 'ACTIVE', fencedAt: null,
    e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: 'b'.repeat(64), e2EnrolledAt: new Date(admittedAt),
  }
  const state = {
    journey: { id: scope.journeyId, targetProjectId: scope.targetProjectId,
      currentCoordinatorSessionId: credentials.coordinatorSessionId,
      hostingMode: 'APP_SERVER_LOCAL_V1', hostingContractVersion: 1, status: 'ACTIVE' } as Row,
    item: item as Row | null, attempt: attempt as Row | null,
    authorization: authorization as Row | null,
    session: session as Row | null, binding: binding as Row | null,
    retirement: null as Row | null,
  }
  const writes = vi.fn()
  const delegate = (name: string, row: () => Row | null) => {
    const methods: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of readMethods) {
      methods[method] = vi.fn(async ({ where }: { where: Row }) => {
        const value = row()
        return matches(value, where) ? structuredClone(value) : null
      })
    }
    for (const method of writeMethods) {
      methods[method] = vi.fn(() => {
        writes(`${name}.${method}`)
        throw new Error('MODE_VERIFIER_WRITE_FORBIDDEN')
      })
    }
    return methods
  }
  const models = {
    qualityJourney: delegate('qualityJourney', () => state.journey),
    qualityJourneyCoordinatorSession: delegate('qualityJourneyCoordinatorSession', () => state.session),
    qualityJourneyE2Retirement: delegate('qualityJourneyE2Retirement', () => state.retirement),
    qualityJourneyWorkItem: delegate('qualityJourneyWorkItem', () => state.item),
    qualityJourneyWorkAuthorization: delegate('qualityJourneyWorkAuthorization', () => state.authorization),
    qualityJourneyWorkAttempt: delegate('qualityJourneyWorkAttempt', () => state.attempt && ({
      ...state.attempt, workItem: state.item, sessionBinding: state.binding,
    })),
  }
  const tx = new Proxy(models, {
    get(target, key) {
      if (typeof key === 'string' && key in target) return target[key as keyof typeof target]
      writes(`unexpected-prisma-access:${String(key)}`)
      throw new Error('MODE_VERIFIER_UNEXPECTED_PRISMA_ACCESS')
    },
  }) as unknown as Prisma.TransactionClient
  const input = { ...scope, workItemId, attemptId, authorizationId, leaseId, inputHash, expectedRole: role }
  const externalBinding: ExternalQualityJourneySubmissionBinding = {
    ...credentials, ...scope, role, workItemId, attemptId,
    assignmentId: assignment.assignmentId, assignmentGeneration: 1,
    leaseId, assignmentSecret: secret, principal: { ...principal },
  }
  return { role, mode, input, credentials, externalBinding, state, models, tx, writes, assignment, spawnRequest, spawnReceipt }
}

type Fixture = ReturnType<typeof fixture>
function setPath(value: Row, path: readonly string[], replacement: unknown) {
  let cursor = value
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Row
  cursor[path[path.length - 1]!] = replacement
}
function repinAttemptJson(f: Fixture, field: string, hashField: string, mutate: (value: Row) => void) {
  const value = JSON.parse(f.state.attempt![field] as string) as Row
  mutate(value)
  f.state.attempt![field] = json(value)
  f.state.attempt![hashField] = hash(value)
}
function repinAdmission(f: Fixture, mutate: (value: Row) => void) {
  repinAttemptJson(f, 'externalAdmissionJson', 'externalAdmissionHash', mutate)
}
function repinAuthorization(f: Fixture, mutate: (value: Row) => void) {
  const value = JSON.parse(f.state.authorization!.authorizationJson as string) as Row
  mutate(value)
  f.state.authorization!.authorizationJson = json(value)
  f.state.authorization!.authorizationHash = hash(value)
}
async function verify(f: Fixture, binding = f.mode === 'EXTERNAL_V1' ? f.externalBinding : undefined) {
  return assertDiscoverySubmissionModeLineageInTransaction(f.input, f.tx, f.credentials, binding)
}
async function rejectsWithoutWrites(f: Fixture, action: () => Promise<unknown> = () => verify(f)) {
  try { await expect(action()).rejects.toThrow() }
  finally {
    expect(f.writes).not.toHaveBeenCalled()
    expect(configuredDatabaseReads).not.toHaveBeenCalled()
  }
}
async function acceptsWithoutWrites(f: Fixture) {
  await expect(verify(f)).resolves.toBeUndefined()
  expect(f.writes).not.toHaveBeenCalled()
  expect(configuredDatabaseReads).not.toHaveBeenCalled()
}

beforeEach(() => { vi.clearAllMocks() })

describe.each(roles)('Discovery E2 %s mode lineage', role => {
  it.each(modes)('%s accepts complete canonical mode evidence without writes or grants', async mode => {
    await acceptsWithoutWrites(fixture(role, mode))
  })

  describe('MANAGED persisted Factory evidence', () => {
    it('rejects external submission context on a managed owner', async () => {
      const f = fixture(role, 'MANAGED')
      await rejectsWithoutWrites(f, () => verify(f, f.externalBinding))
    })
    const requiredFields = [
      'authorizationId', 'assignmentJson', 'assignmentHash', 'spawnRequestId', 'spawnRequestJson',
      'spawnRequestHash', 'spawnReceiptId', 'spawnReceiptJson', 'spawnReceiptHash',
    ] as const
    it.each(requiredFields)('rejects missing %s', async field => {
      const f = fixture(role, 'MANAGED')
      f.state.attempt![field] = null
      await rejectsWithoutWrites(f)
    })
    it.each(['spawnRequestJson', 'spawnReceiptJson'])('rejects malformed %s', async field => {
      const f = fixture(role, 'MANAGED')
      f.state.attempt![field] = '{'
      await rejectsWithoutWrites(f)
    })
    it('rejects a valid canonical REFUSED receipt, rather than mistaking validation for STARTED', async () => {
      const f = fixture(role, 'MANAGED')
      const boundary = f.spawnRequest.requiredBoundaries[0]!
      const receipt = workerSpawnReceiptSchema.parse({
        schemaVersion: f.spawnReceipt.schemaVersion, spawnReceiptId: f.spawnReceipt.spawnReceiptId,
        assignmentId: f.spawnReceipt.assignmentId, workItemId: f.spawnReceipt.workItemId,
        attemptId: f.spawnReceipt.attemptId, roleDefinitionDigest: f.spawnReceipt.roleDefinitionDigest,
        capabilityProfileDigest: f.spawnReceipt.capabilityProfileDigest,
        outcome: 'REFUSED', refusalCode: 'REQUIRED_BOUNDARY_UNSUPPORTED', refusedAt: admittedAt,
        boundaries: [{ boundary: boundary.boundary, requested: boundary.allowedValues,
          status: 'UNSUPPORTED', evidence: [hash('synthetic-refusal-evidence')] }],
      })
      expect(validateWorkerSpawnReceipt(receipt, f.spawnRequest).outcome).toBe('REFUSED')
      f.state.attempt!.spawnReceiptJson = json(receipt)
      f.state.attempt!.spawnReceiptHash = hash(receipt)
      await rejectsWithoutWrites(f)
    })
    it('rejects another canonical request/receipt attempt even when both hashes are correctly recomputed', async () => {
      const f = fixture(role, 'MANAGED')
      repinAttemptJson(f, 'spawnRequestJson', 'spawnRequestHash', value => { value.attemptId = 'foreign-attempt' })
      repinAttemptJson(f, 'spawnReceiptJson', 'spawnReceiptHash', value => { value.attemptId = 'foreign-attempt' })
      expect(() => validateWorkerSpawnReceipt(
        JSON.parse(f.state.attempt!.spawnReceiptJson as string), JSON.parse(f.state.attempt!.spawnRequestJson as string),
      )).not.toThrow()
      await rejectsWithoutWrites(f)
    })
    it('binds a valid rehashed spawnReceiptId to its independently persisted attempt field', async () => {
      const f = fixture(role, 'MANAGED')
      repinAttemptJson(f, 'spawnReceiptJson', 'spawnReceiptHash', value => { value.spawnReceiptId = 'foreign-receipt' })
      expect(() => validateWorkerSpawnReceipt(JSON.parse(f.state.attempt!.spawnReceiptJson as string), f.spawnRequest))
        .not.toThrow()
      await rejectsWithoutWrites(f)
    })
    const requestMismatches: ReadonlyArray<readonly [string, unknown]> = [
      ['requestId', 'foreign-request'], ['assignmentId', 'foreign-assignment'],
      ['journeyId', 'foreign-journey'], ['targetProjectId', 'foreign-target'], ['workItemId', 'foreign-work'],
      ['role', role === 'SCOUT' ? 'RESOURCE_EXPLORER' : 'SCOUT'], ['inputHash', hash('foreign-input')],
    ]
    it.each(requestMismatches)('rejects rehashed request %s mismatch', async (field, value) => {
      const f = fixture(role, 'MANAGED')
      repinAttemptJson(f, 'spawnRequestJson', 'spawnRequestHash', request => { request[field] = value })
      await rejectsWithoutWrites(f)
    })
    const receiptMismatches: ReadonlyArray<readonly [string, unknown]> = [
      ['assignmentId', 'foreign-assignment'], ['workItemId', 'foreign-work'], ['attemptId', 'foreign-attempt'],
      ['roleDefinitionDigest', hash('foreign-role')], ['capabilityProfileDigest', hash('foreign-profile')],
    ]
    it.each(receiptMismatches)('rejects rehashed receipt %s mismatch', async (field, value) => {
      const f = fixture(role, 'MANAGED')
      repinAttemptJson(f, 'spawnReceiptJson', 'spawnReceiptHash', receipt => { receipt[field] = value })
      await rejectsWithoutWrites(f)
    })
    it('rejects rehashed assignment scope that differs from canonical authority', async () => {
      const f = fixture(role, 'MANAGED')
      repinAttemptJson(f, 'assignmentJson', 'assignmentHash', value => {
        setPath(value, ['scope', 'networkOrigins'], ['https://foreign.invalid'])
      })
      await rejectsWithoutWrites(f)
    })
  })

  describe('EXTERNAL_V1 actual receipt and original trusted context', () => {
    const topLevelKeys = [
      'schemaVersion', 'admissionId', 'protocol', 'assignmentId', 'assignmentGeneration', 'attemptId',
      'workItemId', 'journeyId', 'targetProjectId', 'role', 'principal', 'authorizationId',
      'authorizationHash', 'inputHash', 'leaseId', 'hostIsolation', 'admittedAt',
    ] as const
    it('starts with the exact actual-constructor shape and independently sampled admission metadata', async () => {
      const f = fixture(role, 'EXTERNAL_V1')
      expect(Object.keys(JSON.parse(f.state.attempt!.externalAdmissionJson as string)).sort())
        .toEqual([...topLevelKeys].sort())
      expect((f.state.attempt!.externalAdmittedAt as Date).toISOString()).not.toBe(admittedAt)
      await acceptsWithoutWrites(f)
    })
    it.each(topLevelKeys)('rejects missing actual receipt %s even with a correct new hash', async field => {
      const f = fixture(role, 'EXTERNAL_V1')
      repinAdmission(f, value => { delete value[field] })
      await rejectsWithoutWrites(f)
    })
    it.each(['scope', 'actor', 'permission', 'result', 'capability', 'unexpected'])('rejects extra receipt %s', async field => {
      const f = fixture(role, 'EXTERNAL_V1')
      repinAdmission(f, value => { value[field] = 'not-admission-authority' })
      await rejectsWithoutWrites(f)
    })
    const rehashedMismatches: ReadonlyArray<readonly [readonly string[], unknown]> = [
      [['schemaVersion'], 'appraise.quality-journey-external-admission/v2'],
      [['admissionId'], 'foreign-admission'], [['protocol'], 'MANAGED'], [['assignmentId'], 'foreign-assignment'],
      [['assignmentGeneration'], 2], [['attemptId'], 'foreign-attempt'], [['workItemId'], 'foreign-work'],
      [['journeyId'], 'foreign-journey'], [['targetProjectId'], 'foreign-target'],
      [['role'], role === 'SCOUT' ? 'RESOURCE_EXPLORER' : 'SCOUT'],
      [['principal', 'principalId'], 'foreign-principal'], [['principal', 'assurance'], 'FOREIGN_ASSURANCE'],
      [['authorizationId'], 'foreign-authorization'], [['authorizationHash'], hash('foreign-authorization')],
      [['inputHash'], hash('foreign-input')], [['leaseId'], 'foreign-lease'], [['hostIsolation'], 'ATTESTED'],
    ]
    it.each(rehashedMismatches)('rejects independently rehashed %j mismatch', async (path, value) => {
      const f = fixture(role, 'EXTERNAL_V1')
      repinAdmission(f, receipt => { setPath(receipt, path, value) })
      await rejectsWithoutWrites(f)
    })
    it.each(['principalId', 'assurance'])('rejects missing principal.%s', async field => {
      const f = fixture(role, 'EXTERNAL_V1')
      repinAdmission(f, receipt => { delete (receipt.principal as Row)[field] })
      await rejectsWithoutWrites(f)
    })
    it.each(['actor', 'scope', 'principalIdExtra', 'assuranceExtra'])('rejects extra principal.%s', async field => {
      const f = fixture(role, 'EXTERNAL_V1')
      repinAdmission(f, receipt => { (receipt.principal as Row)[field] = 'unexpected' })
      await rejectsWithoutWrites(f)
    })
    it.each([null, [], 'principal', 7].map(value => [value] as const))('rejects non-object principal %j', async value => {
      const f = fixture(role, 'EXTERNAL_V1')
      repinAdmission(f, receipt => { receipt.principal = value })
      await rejectsWithoutWrites(f)
    })
    it.each(['2', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null])('rejects generation %j', async value => {
      const f = fixture(role, 'EXTERNAL_V1')
      repinAdmission(f, receipt => { receipt.assignmentGeneration = value })
      await rejectsWithoutWrites(f)
    })
    it.each([null, [], 7, 'receipt', true].map(value => [value] as const))('rejects a non-object receipt %j', async value => {
      const f = fixture(role, 'EXTERNAL_V1')
      f.state.attempt!.externalAdmissionJson = json(value)
      f.state.attempt!.externalAdmissionHash = hash(value)
      await rejectsWithoutWrites(f)
    })
    it.each([null, 7, 'not-a-date', '2026-10-24T00:00:00Z'])('rejects admittedAt %j', async value => {
      const f = fixture(role, 'EXTERNAL_V1')
      repinAdmission(f, receipt => { receipt.admittedAt = value })
      await rejectsWithoutWrites(f)
    })
    it.each([null, new Date('invalid')])('rejects invalid persisted admission metadata %j', async value => {
      const f = fixture(role, 'EXTERNAL_V1')
      f.state.attempt!.externalAdmittedAt = value
      await rejectsWithoutWrites(f)
    })
    it('accepts a different valid rehashed ISO timestamp without treating it as a pinned deadline', async () => {
      const f = fixture(role, 'EXTERNAL_V1')
      repinAdmission(f, receipt => { receipt.admittedAt = '2026-10-24T00:00:09.000Z' })
      await acceptsWithoutWrites(f)
    })
    it('does not reconstruct missing original context from a complete stored receipt', async () => {
      const f = fixture(role, 'EXTERNAL_V1')
      await rejectsWithoutWrites(f, () => assertDiscoverySubmissionModeLineageInTransaction(f.input, f.tx, f.credentials))
    })
    const contextMismatches: ReadonlyArray<readonly [readonly string[], unknown]> = [
      [['assignmentSecret'], 'another-synthetic-assignment-secret-of-sufficient-length'],
      [['principal', 'principalId'], 'foreign-principal'], [['principal', 'assurance'], 'FOREIGN_ASSURANCE'],
      [['assignmentId'], 'foreign-assignment'], [['assignmentGeneration'], 2], [['leaseId'], 'foreign-lease'],
      [['journeyId'], 'foreign-journey'], [['targetProjectId'], 'foreign-target'], [['workItemId'], 'foreign-work'],
      [['attemptId'], 'foreign-attempt'], [['role'], role === 'SCOUT' ? 'RESOURCE_EXPLORER' : 'SCOUT'],
      [['coordinatorSessionId'], 'foreign-session'], [['coordinatorGeneration'], 2],
      [['coordinatorPrincipalId'], 'foreign-principal'], [['coordinatorHandoffId'], 'foreign-handoff'],
    ]
    it.each(contextMismatches)('rejects cross-wired original context %j', async (path, value) => {
      const f = fixture(role, 'EXTERNAL_V1')
      setPath(f.externalBinding as unknown as Row, path, value)
      await rejectsWithoutWrites(f)
    })
    it('does not consume historical admission request JSON as terminal authority', async () => {
      const f = fixture(role, 'EXTERNAL_V1')
      f.state.attempt!.externalAdmissionRequestJson = '{not-consumed'
      f.state.attempt!.externalAdmissionRequestHash = hash('unrelated-retained-request')
      await acceptsWithoutWrites(f)
    })
  })

  describe.each(modes)('%s canonical authorization, assignment and session', mode => {
    it('rejects malformed canonical assignment JSON', async () => {
      const f = fixture(role, mode)
      f.state.attempt!.assignmentJson = '{'
      await rejectsWithoutWrites(f)
    })
    it('rejects a canonical assignment whose independently persisted hash differs', async () => {
      const f = fixture(role, mode)
      f.state.attempt!.assignmentHash = hash('foreign-assignment')
      await rejectsWithoutWrites(f)
    })
    it('rejects a rehashed canonical assignment lease that differs from its original attempt', async () => {
      const f = fixture(role, mode)
      repinAttemptJson(f, 'assignmentJson', 'assignmentHash', value => {
        setPath(value, ['lease', 'leaseId'], 'foreign-lease')
      })
      await rejectsWithoutWrites(f)
    })
    it('rejects canonical authorization whose independently persisted hash differs', async () => {
      const f = fixture(role, mode)
      f.state.authorization!.authorizationHash = hash('foreign-authorization')
      if (mode === 'EXTERNAL_V1')
        repinAdmission(f, receipt => { receipt.authorizationHash = f.state.authorization!.authorizationHash })
      await rejectsWithoutWrites(f)
    })
    it.each(['revokedAt', 'cancelledAt'])('rejects current authorization %s', async field => {
      const f = fixture(role, mode)
      f.state.authorization![field] = new Date(admittedAt)
      await rejectsWithoutWrites(f)
    })
    const scopeMismatches: ReadonlyArray<readonly [readonly string[], unknown]> = [
      [['allowedTargetRoutes'], ['foreign-route']], [['allowedResourceIds'], ['foreign-resource']],
      [['targetEnvironmentBindings'], [{ environmentId: 'foreign-environment', origin: 'https://foreign.invalid' }]],
      [['roleDefinition', 'digest'], hash('foreign-role')], [['capabilityProfile', 'digest'], hash('foreign-profile')],
      [['scope', 'permittedTools'], ['foreign.tool']], [['scope', 'permittedCommands'], ['foreign.command']],
      [['scope', 'filesystemPaths'], ['/synthetic-foreign']], [['scope', 'networkOrigins'], ['https://foreign.invalid']],
      [['scope', 'credentialGrantIds'], ['foreign-grant']], [['scope', 'targetAccess'], 'MUTATING'],
      [['writableArtifactKinds'], ['JOURNEY_CLOSURE']],
      [['inputArtifacts'], [{ kind: 'ANALYSIS_CHARTER_REVISION', artifactId: 'foreign-artifact', contentHash: hash('foreign') }]],
      [['completionCriteria'], ['Different frozen completion criteria.']],
    ]
    it.each(scopeMismatches)('rejects rehashed canonical authorization %j mismatch', async (path, value) => {
      const f = fixture(role, mode)
      repinAuthorization(f, authorization => { setPath(authorization, path, value) })
      if (mode === 'EXTERNAL_V1')
        repinAdmission(f, receipt => { receipt.authorizationHash = f.state.authorization!.authorizationHash })
      await rejectsWithoutWrites(f)
    })
    it.each(['journeyId', 'targetProjectId', 'workItemId', 'attemptId', 'authorizationId', 'leaseId'])
      ('rejects foreign specialized %s', async field => {
        const f = fixture(role, mode)
        ;(f.input as unknown as Row)[field] = `foreign-${field}`
        await rejectsWithoutWrites(f)
      })
    it.each(['sessionId', 'coordinatorGeneration', 'assignmentId', 'assignmentGeneration', 'authorizationId', 'leaseId', 'inputHash'])
      ('rejects changed immutable attempt session binding %s', async field => {
        const f = fixture(role, mode)
        f.state.binding![field] = typeof f.state.binding![field] === 'number' ? 2 : `foreign-${field}`
        await rejectsWithoutWrites(f)
      })
    it.each(['coordinatorSessionId', 'coordinatorGeneration', 'coordinatorPrincipalId'])
      ('rejects wrong original coordinator %s', async field => {
        const f = fixture(role, mode)
        ;(f.credentials as unknown as Row)[field] = field === 'coordinatorGeneration' ? 2 : `foreign-${field}`
        await rejectsWithoutWrites(f)
      })
    it('rejects absent original coordinator credentials', async () => {
      const f = fixture(role, mode)
      await rejectsWithoutWrites(f, () => assertDiscoverySubmissionModeLineageInTransaction(f.input, f.tx, undefined, f.externalBinding))
    })
    it('rejects the trusted-human symbol as ordinary E2 credentials', async () => {
      const f = fixture(role, mode)
      await rejectsWithoutWrites(f, () => assertDiscoverySubmissionModeLineageInTransaction(
        f.input, f.tx, trustedHumanCoordinatorSession, mode === 'EXTERNAL_V1' ? f.externalBinding : undefined,
      ))
    })
    it('rejects an unknown execution mode', async () => {
      const f = fixture(role, mode)
      f.state.attempt!.executionMode = 'UNKNOWN_MODE'
      await rejectsWithoutWrites(f)
    })
    it('does not treat partial enrollment as the legacy missing-evidence bypass', async () => {
      const f = fixture(role, mode)
      f.state.session!.e2EnrollmentDigest = null
      f.state.attempt![mode === 'MANAGED' ? 'spawnReceiptJson' : 'externalAdmissionJson'] = null
      await rejectsWithoutWrites(f)
    })
    it('does not treat orphan retirement as the legacy missing-evidence bypass', async () => {
      const f = fixture(role, mode)
      f.state.session!.e2EnrollmentKind = null
      f.state.session!.e2EnrollmentDigest = null
      f.state.session!.e2EnrolledAt = null
      f.state.retirement = { id: 'orphan-retirement', ...scope, coordinatorSessionId: f.credentials.coordinatorSessionId }
      f.state.attempt![mode === 'MANAGED' ? 'spawnReceiptJson' : 'externalAdmissionJson'] = null
      await rejectsWithoutWrites(f)
    })
    it.each(['missing', 'foreign'])('rejects %s current session lineage', async kind => {
      const f = fixture(role, mode)
      if (kind === 'missing') f.state.session = null
      else f.state.session!.targetProjectId = 'foreign-target'
      await rejectsWithoutWrites(f)
    })
    it('preserves all-null/no-orphan legacy behavior without adopting missing mode evidence', async () => {
      const f = fixture(role, mode)
      f.state.session!.e2EnrollmentKind = null
      f.state.session!.e2EnrollmentDigest = null
      f.state.session!.e2EnrolledAt = null
      f.state.authorization = null
      f.state.attempt = null
      await acceptsWithoutWrites(f)
      expect(f.models.qualityJourneyWorkAttempt.findUnique).not.toHaveBeenCalled()
      expect(f.models.qualityJourneyWorkAuthorization.findUnique).not.toHaveBeenCalled()
    })
  })
})
