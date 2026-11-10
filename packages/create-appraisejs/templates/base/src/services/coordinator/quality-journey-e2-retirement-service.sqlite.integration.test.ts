/**
 * Synthetic C1 SQLite conformance only. The closed harness must supply a newly
 * migrated, empty case DB and its generated client. This file never loads the
 * configured app DB, constructs a producer, or dispatches a provider effect.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { e2CampaignPolicyDigest } from '@/lib/quality-journey/e2-campaign-policy-contract'
import {
  assertE2BusinessAdmission,
  commitE2RetirementRequest,
  type E2BusinessScope,
  type E2RetirementScope,
} from './quality-journey-e2-retirement-service'

const source = fileURLToPath(import.meta.url)
const caseBase = '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m06-work/e2-prisma-offline'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const sha = /^[a-f0-9]{64}$/
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const sample = new Date('2026-10-24T00:00:00.000Z')

let db: PrismaClient

function refuse(reason: string): never {
  throw new Error(`C1 SQLite case refused: ${reason}`)
}
async function regular(file: string) {
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || await fs.realpath(file) !== file) refuse('nonregular file')
}
async function fileHash(file: string) {
  await regular(file)
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/** No discovery, configured-client fallback, or case reuse. The packet itself
 * is separately reviewed and SHA-pinned by the external closed harness. */
async function openFreshHarnessCase() {
  const root = process.env.M06_E2_C1_CASE_ROOT
  const expectedManifestHash = process.env.M06_E2_C1_MANIFEST_SHA256
  if (!root || !path.isAbsolute(root) || path.normalize(root) !== root ||
    !uuid.test(path.basename(root)) || path.dirname(root) !== caseBase ||
    !expectedManifestHash || !sha.test(expectedManifestHash) || await fs.realpath(root) !== root)
    refuse('fresh harness case scope')
  const manifestPath = path.join(root, 'c1-sqlite-test-manifest.json')
  if (await fileHash(manifestPath) !== expectedManifestHash) refuse('manifest hash')
  const manifestBytes = await fs.readFile(manifestPath, 'utf8')
  const parsed: unknown = JSON.parse(manifestBytes)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
    manifestBytes !== `${JSON.stringify(parsed)}\n`) refuse('manifest canonical JSON')
  const manifest = parsed as Record<string, unknown>
  const exactKeys = ['version', 'caseId', 'caseRoot', 'stage', 'databasePath',
    'databaseSha256', 'generatedClientEntry', 'generatedClientSha256', 'generatedRuntimeSha256',
    'testSourceSha256', 'migrationIds',
    'sourceReviewSha256', 'operationalReviewSha256', 'hostProofSha256']
  if (Object.keys(manifest).length !== exactKeys.length ||
    Object.keys(manifest).some(key => !exactKeys.includes(key)) ||
    manifest.version !== 'M06_E2_C1_SQLITE_TEST_CASE_V1' ||
    manifest.stage !== 'C1_SQLITE_TEST' || manifest.caseId !== path.basename(root) ||
    manifest.caseRoot !== root ||
    manifest.databasePath !== path.join(root, 'fixture.sqlite') ||
    manifest.generatedClientEntry !== path.join(root, 'mirror/node_modules/.prisma/client/index.js') ||
    !Array.isArray(manifest.migrationIds) ||
    manifest.migrationIds.join(',') !== [
      '20261024010000_add_journey_e2_effect_admission',
      '20261024020000_add_journey_shared_resource_claims',
      '20261024030000_add_journey_e2_operation_preparation',
      '20261024040000_add_automation_materialization_source_proof',
    ].join(',') ||
    [manifest.databaseSha256, manifest.generatedClientSha256, manifest.generatedRuntimeSha256,
      manifest.testSourceSha256, manifest.sourceReviewSha256,
      manifest.operationalReviewSha256, manifest.hostProofSha256].some(value =>
      typeof value !== 'string' || !sha.test(value))) refuse('manifest fields')
  const databasePath = manifest.databasePath as string
  const entry = manifest.generatedClientEntry as string
  const runtime = path.join(root, 'mirror/node_modules/.prisma/client/runtime/library.js')
  for (const directory of [path.join(root, 'home'), path.join(root, 'tmp')]) {
    const stat = await fs.lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory)
      refuse('case home or temp directory')
  }
  if (process.env.DATABASE_URL !== `file:${databasePath}` ||
    process.env.HOME !== path.join(root, 'home') || process.env.TMPDIR !== path.join(root, 'tmp') ||
    await fileHash(databasePath) !== manifest.databaseSha256 ||
    await fileHash(entry) !== manifest.generatedClientSha256 ||
    await fileHash(runtime) !== manifest.generatedRuntimeSha256 ||
    await fileHash(source) !== manifest.testSourceSha256)
    refuse('fresh database or client custody')
  const imported = await import(pathToFileURL(entry).href) as unknown as {
    default?: { PrismaClient?: new (options: { datasources: { db: { url: string } } }) => PrismaClient }
    PrismaClient?: new (options: { datasources: { db: { url: string } } }) => PrismaClient
  }
  const constructor = imported.default?.PrismaClient ?? imported.PrismaClient
  if (typeof constructor !== 'function') refuse('generated client export')
  db = new constructor({ datasources: { db: { url: `file:${databasePath}` } } }) as PrismaClient
  const foreignKeys = await db.$queryRawUnsafe<Array<{ foreign_keys: number | bigint }>>('PRAGMA foreign_keys')
  if (foreignKeys.length !== 1 || Number(foreignKeys[0]?.foreign_keys) !== 1)
    refuse('SQLite foreign keys disabled')
  // The ownership migration inserts exactly this legacy target into an otherwise empty database.
  // Select only its ID; any other target or any Journey lineage is an unqualified fixture.
  const [targets, journeyCount, sessionCount, policyCount, retirementCount] = await Promise.all([
    db.targetProject.findMany({ select: { id: true }, take: 2 }),
    db.qualityJourney.count(), db.qualityJourneyCoordinatorSession.count(),
    db.qualityJourneyE2CampaignPolicy.count(), db.qualityJourneyE2Retirement.count(),
  ])
  if (targets.length !== 1 || targets[0]?.id !== '00000000-0000-4000-8000-000000000001' ||
    [journeyCount, sessionCount, policyCount, retirementCount].some(count => count !== 0))
    refuse('case database does not match the migration-only baseline')
}

function toyPolicy(journeyId: string, targetProjectId: string, sourceTupleDigest: string, suffix: string) {
  const policy = {
    id: `c1_policy_${suffix}`, allocationDigest: digest(`allocation:${suffix}`),
    journeyId, targetProjectId, sourceTupleDigest,
    policyVersion: 'M06_E2_CAMPAIGN_POLICY_V1', policyDigest: '', createdAt: sample,
    nativeStartWindowMs: 1000, dnsWindowMs: 1000, tcpWindowMs: 1000,
    tlsWindowMs: 1000, upgradeWindowMs: 1000, providerRequestWindowMs: 1000, mcpCallWindowMs: 1000,
    actorMaxOperations: 32, actorMaxBytes: 8_388_608, actorMaxFrames: 512,
    actorMaxSetup: 4, actorMaxProviderRequests: 5, actorMaxMcpCalls: 16,
    journeyMaxNativeStarts: 6, journeyMaxTurnStarts: 5,
    maxNativeStarts: 6, maxProviderRequests: 5, maxOperations: 192,
    maxBytes: 50_331_648, maxFrames: 3072, maxSetup: 24, maxMcpCalls: 96,
    nativeStartsReserved: 0, providerRequestsReserved: 0, operationsReserved: 0,
    bytesReserved: 0, framesReserved: 0, setupReserved: 0, mcpCallsReserved: 0, version: 0,
  }
  policy.policyDigest = e2CampaignPolicyDigest(policy)
  return policy
}

async function fixture(enrolled: boolean) {
  const suffix = randomUUID().replaceAll('-', '')
  const targetProjectId = `c1_target_${suffix}`
  const journeyId = `c1_journey_${suffix}`
  const coordinatorSessionId = `c1_session_${suffix}`
  const principalId = `c1_principal_${suffix}`
  const sourceTupleDigest = digest(`source:${suffix}`)
  await db.targetProject.create({ data: {
    id: targetProjectId, kind: 'LOCAL_WORKSPACE', canonicalIdentity: `c1:${suffix}`,
    canonicalPath: path.join(process.env.M06_E2_C1_CASE_ROOT!, 'synthetic-target', suffix),
    displayName: 'Synthetic C1 SQLite target', fingerprint: digest(`target:${suffix}`),
  } })
  await db.qualityJourney.create({ data: {
    id: journeyId, targetProjectId, rootIdempotencyKey: `c1_root_${suffix}`,
    rootRequestHash: digest(`root:${suffix}`), hostingMode: 'APP_SERVER_LOCAL_V1',
    hostingProvenance: 'M06_C1_SQLITE_SYNTHETIC_ONLY', activeCycleId: `c1_cycle_${suffix}`,
    stateHash: digest(`state:${suffix}`),
  } })
  await db.qualityJourneyCoordinatorSession.create({ data: {
    id: coordinatorSessionId, journeyId, targetProjectId,
    ownerPrincipalId: principalId, hostKind: 'APP_SERVER_LOCAL_V1', status: 'ACTIVE', generation: 1,
    registrationKey: `c1_registration_${suffix}`,
    registrationRequestHash: digest(`registration:${suffix}`),
    provenance: 'M06_C1_SQLITE_SYNTHETIC_ONLY', activatedAt: sample,
    ...(enrolled ? { e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: sourceTupleDigest,
      e2EnrolledAt: sample } : {}),
  } })
  await db.qualityJourney.update({ where: { id: journeyId }, data: { currentCoordinatorSessionId: coordinatorSessionId } })
  const policy = enrolled ? toyPolicy(journeyId, targetProjectId, sourceTupleDigest, suffix) : null
  if (policy) {
    await db.qualityJourneyE2CampaignPolicy.create({ data: policy })
    await db.qualityJourneyE2Retirement.create({ data: {
      id: `c1_retirement_${suffix}`, journeyId, targetProjectId,
      coordinatorSessionId, generation: 1, campaignPolicyId: policy.id,
    } })
  }
  const credentials = { journeyId, targetProjectId, coordinatorSessionId,
    coordinatorGeneration: 1, coordinatorPrincipalId: principalId }
  const business: E2BusinessScope = { journeyId, targetProjectId, coordinatorSessionId,
    generation: 1, credentials }
  const retirement: E2RetirementScope = { journeyId, targetProjectId, coordinatorSessionId,
    generation: 1, requestId: `c1_request_${suffix}`, requestedAt: sample,
    authority: { kind: 'CURRENT_SESSION', credentials } }
  return { suffix, journeyId, targetProjectId, coordinatorSessionId, sourceTupleDigest,
    business, retirement, policy }
}

beforeAll(openFreshHarnessCase)
afterAll(async () => { if (db) await db.$disconnect() })

describe('C1 E2 SQLite constraints and transaction-local retirement', () => {
  it('preserves all-null legacy and forbids update adoption into E2', async () => {
    const item = await fixture(false)
    expect(await db.$transaction(tx => assertE2BusinessAdmission(tx, item.business))).toEqual({ kind: 'LEGACY' })
    expect(await db.$transaction(tx => commitE2RetirementRequest(tx, item.retirement, 'PAUSE')))
      .toEqual({ status: 'LEGACY_NO_E2' })
    await expect(db.qualityJourneyCoordinatorSession.update({ where: { id: item.coordinatorSessionId }, data: {
      e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: item.sourceTupleDigest, e2EnrolledAt: sample,
    } })).rejects.toThrow()
    expect((await db.qualityJourneyCoordinatorSession.findUniqueOrThrow({ where: { id: item.coordinatorSessionId } }))
      .e2EnrollmentKind).toBeNull()
    expect((await db.qualityJourney.findUniqueOrThrow({ where: { id: item.journeyId } })).e2AdmissionVersion).toBe(0)
  })

  it('refuses an orphan retirement row attached to all-null enrollment', async () => {
    const item = await fixture(false)
    const policy = toyPolicy(item.journeyId, item.targetProjectId, item.sourceTupleDigest, item.suffix)
    await db.qualityJourneyE2CampaignPolicy.create({ data: policy })
    await db.qualityJourneyE2Retirement.create({ data: {
      id: `c1_orphan_${item.suffix}`, journeyId: item.journeyId,
      targetProjectId: item.targetProjectId, coordinatorSessionId: item.coordinatorSessionId,
      generation: 1, campaignPolicyId: policy.id,
    } })
    await expect(db.$transaction(tx => assertE2BusinessAdmission(tx, item.business))).rejects.toThrow()
    await expect(db.$transaction(tx => commitE2RetirementRequest(tx, item.retirement, 'PAUSE'))).rejects.toThrow()
    expect((await db.qualityJourney.findUniqueOrThrow({ where: { id: item.journeyId } })).e2AdmissionVersion).toBe(0)
  })

  it('commits one business CAS, latches PAUSE, preserves first request and refuses later business', async () => {
    const item = await fixture(true)
    await expect(db.qualityJourneyCoordinatorSession.update({ where: { id: item.coordinatorSessionId },
      data: { e2EnrollmentKind: null, e2EnrollmentDigest: null, e2EnrolledAt: null },
    })).rejects.toThrow()
    expect(await db.$transaction(tx => assertE2BusinessAdmission(tx, item.business)))
      .toEqual({ kind: 'E2_V1', admissionVersion: 1 })
    const first = await db.$transaction(tx => commitE2RetirementRequest(tx, item.retirement, 'PAUSE'))
    expect(first).toMatchObject({ status: 'RETIRE_REQUESTED', admissionVersion: 2,
      receipt: { requestId: item.retirement.requestId, requestReason: 'PAUSE' } })
    if (first.status !== 'RETIRE_REQUESTED') throw new Error('expected one committed retirement request')
    const repeated = await db.$transaction(tx => commitE2RetirementRequest(tx, {
      ...item.retirement, requestId: `c1_replay_${item.suffix}`,
      requestedAt: new Date(sample.getTime() + 1000),
    }, 'REVOKE'))
    expect(repeated).toEqual({ status: 'READ_ONLY_RECEIPT', receipt: first.receipt })
    await expect(db.$transaction(tx => assertE2BusinessAdmission(tx, item.business))).rejects.toThrow()
    const journey = await db.qualityJourney.findUniqueOrThrow({ where: { id: item.journeyId } })
    const row = await db.qualityJourneyE2Retirement.findUniqueOrThrow({ where: { coordinatorSessionId_generation: {
      coordinatorSessionId: item.coordinatorSessionId, generation: 1,
    } } })
    expect(journey.e2AdmissionVersion).toBe(2)
    expect(row).toMatchObject({ state: 'RETIRE_REQUESTED', requestId: item.retirement.requestId,
      requestReason: 'PAUSE', version: 1 })
  })

  it('makes campaign policy immutable, unique per Journey and nonrefundable', async () => {
    const item = await fixture(true)
    const original = item.policy!
    await expect(db.qualityJourneyE2CampaignPolicy.update({ where: { id: original.id },
      data: { dnsWindowMs: 2000 } })).rejects.toThrow()
    await expect(db.qualityJourneyE2CampaignPolicy.create({ data: {
      ...toyPolicy(item.journeyId, item.targetProjectId, item.sourceTupleDigest, `second_${item.suffix}`),
    } })).rejects.toThrow()
    const other = await fixture(false)
    const duplicateAllocation = toyPolicy(other.journeyId, other.targetProjectId,
      other.sourceTupleDigest, `duplicate_${other.suffix}`)
    duplicateAllocation.allocationDigest = original.allocationDigest
    duplicateAllocation.policyDigest = e2CampaignPolicyDigest(duplicateAllocation)
    await expect(db.qualityJourneyE2CampaignPolicy.create({ data: duplicateAllocation })).rejects.toThrow()
    await db.qualityJourneyE2CampaignPolicy.update({ where: { id: original.id },
      data: { operationsReserved: 1, version: { increment: 1 } } })
    await expect(db.qualityJourneyE2CampaignPolicy.update({ where: { id: original.id },
      data: { operationsReserved: 0, version: { increment: 1 } } })).rejects.toThrow()
    const retained = await db.qualityJourneyE2CampaignPolicy.findUniqueOrThrow({ where: { id: original.id } })
    expect(retained).toMatchObject({ policyDigest: original.policyDigest, dnsWindowMs: 1000,
      operationsReserved: 1, version: 1 })
    expect(await db.qualityJourneyE2CampaignPolicy.count({ where: {
      journeyId: item.journeyId, targetProjectId: item.targetProjectId,
    } })).toBe(1)
  })

  it('rejects overflow at SQL constraints and at the business admission bound', async () => {
    const item = await fixture(true)
    await expect(db.$executeRaw`UPDATE "QualityJourney" SET "e2AdmissionVersion" = 2147483647
      WHERE "id" = ${item.journeyId}`).rejects.toThrow()
    await expect(db.$executeRaw`UPDATE "QualityJourney" SET "e2NativeStartsReserved" = 7
      WHERE "id" = ${item.journeyId}`).rejects.toThrow()
    await expect(db.$executeRaw`UPDATE "QualityJourneyE2CampaignPolicy"
      SET "operationsReserved" = 193, "version" = 1 WHERE "id" = ${item.policy!.id}`).rejects.toThrow()
    await expect(db.$executeRaw`UPDATE "QualityJourneyE2CampaignPolicy"
      SET "version" = 2147483647 WHERE "id" = ${item.policy!.id}`).rejects.toThrow()
    await db.qualityJourney.update({ where: { id: item.journeyId }, data: { e2AdmissionVersion: 2_147_483_646 } })
    await expect(db.$transaction(tx => assertE2BusinessAdmission(tx, item.business))).rejects.toThrow()
    const journey = await db.qualityJourney.findUniqueOrThrow({ where: { id: item.journeyId } })
    expect(journey.e2AdmissionVersion).toBe(2_147_483_646)
    expect(journey.e2NativeStartsReserved).toBe(0)
  })

  it('rejects cross-lineage retirement FK and rolls back its preceding admission CAS', async () => {
    const owner = await fixture(true)
    const foreign = await fixture(true)
    await expect(db.$transaction(async tx => {
      await assertE2BusinessAdmission(tx, owner.business)
      await tx.qualityJourneyE2Retirement.create({ data: {
        id: `c1_foreign_${owner.suffix}`, journeyId: foreign.journeyId,
        targetProjectId: foreign.targetProjectId, coordinatorSessionId: owner.coordinatorSessionId,
        generation: 1, campaignPolicyId: foreign.policy!.id,
      } })
    })).rejects.toThrow()
    expect((await db.qualityJourney.findUniqueOrThrow({ where: { id: owner.journeyId } })).e2AdmissionVersion).toBe(0)
    expect(await db.qualityJourneyE2Retirement.count({ where: { journeyId: foreign.journeyId } })).toBe(1)
  })
})
