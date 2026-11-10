/** Synthetic fresh SQLite owner semantics only; all persisted proof data is
 * fixture-only. The outer reviewed harness owns migration/tool/alias/HOST proof.
 * No production DB adapter, issuer, runtime or provider qualification follows. */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { sharedResourceKinds } from '@/lib/quality-journey/shared-resource-contract'
import type { SharedResourceMutationKey } from '@/services/coordinator/quality-journey-shared-resource-guard-service'

const carrier = vi.hoisted(() => ({
  run: undefined as undefined | ((callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>),
}))
// The sole mock prevents production db-config/createRequire from loading a root
// client. The real private SDK and its real public Prisma error class are used.
vi.mock('@/config/db-config', () => ({
  default: new Proxy(Object.create(null) as object, {
    get(_target, key) {
      if (key !== '$transaction') throw new Error(`Group fixture root operation refused: ${String(key)}`)
      return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        if (!carrier.run) throw new Error('Group fixture carrier is not armed')
        return carrier.run(callback)
      }
    },
    set() { throw new Error('Group fixture root mutation refused') },
  }),
}))

const source = fileURLToPath(import.meta.url)
const caseBase = '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m06-work/e2-prisma-offline'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sha = /^[0-9a-f]{64}$/
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const sample = new Date('2026-10-24T00:00:00.000Z')
const migrationIds = [
  '20261024010000_add_journey_e2_effect_admission',
  '20261024020000_add_journey_shared_resource_claims',
  '20261024030000_add_journey_e2_operation_preparation',
  '20261024040000_add_automation_materialization_source_proof',
]
let db: PrismaClient | undefined
let owner: typeof import('./locator-group-service')
let guardService: typeof import('@/services/coordinator/quality-journey-shared-resource-guard-service')
let transactionCount = 0
let postWriteProbe: undefined | ((tx: Prisma.TransactionClient) => Promise<void>)
const transactions: Promise<unknown>[] = []
const fixtureFault = new Error('SYNTHETIC_GROUP_FAULT_AFTER_REAL_UPDATE')

function refuse(reason: string): never { throw new Error(`Group SQLite case refused: ${reason}`) }
function client(): PrismaClient { return db ?? refuse('fresh client unavailable') }
async function hashFile(file: string) {
  const info = await fs.lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || await fs.realpath(file) !== file) refuse('nonregular pinned file')
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256'), stream = createReadStream(file)
    stream.on('data', bytes => hash.update(bytes))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function openFreshCase() {
  const root = process.env.M06_E2_LOCATOR_GROUP_OWNER_CASE_ROOT
  const pin = process.env.M06_E2_LOCATOR_GROUP_OWNER_MANIFEST_SHA256
  if (!root || !path.isAbsolute(root) || path.normalize(root) !== root || path.dirname(root) !== caseBase ||
    !uuid.test(path.basename(root)) || !pin || !sha.test(pin) || await fs.realpath(root) !== root)
    refuse('new case identity')
  if (source !== path.join(root, 'mirror/src/services/locator-group/locator-group-service.e2.sqlite.integration.test.ts'))
    refuse('selector outside new mirror')
  const manifestFile = path.join(root, 'locator-group-owner-sqlite-test-manifest.json')
  if (await hashFile(manifestFile) !== pin) refuse('manifest digest')
  const bytes = await fs.readFile(manifestFile, 'utf8')
  const value: unknown = JSON.parse(bytes)
  if (!value || typeof value !== 'object' || Array.isArray(value) || bytes !== `${JSON.stringify(value)}\n`)
    refuse('manifest encoding')
  const m = value as Record<string, unknown>
  const fields = ['version', 'caseId', 'caseRoot', 'stage', 'databasePath', 'databaseSha256',
    'generatedClientEntry', 'generatedClientSha256', 'generatedRuntimeSha256', 'testSourceSha256',
    'migrationIds', 'sourceReviewSha256', 'operationalReviewSha256', 'hostProofSha256',
    'generatedEnginePath', 'generatedEngineSha256']
  const sdkDirectory = path.join(root, 'mirror/node_modules/.prisma/client')
  if (Object.keys(m).length !== fields.length || Object.keys(m).some(key => !fields.includes(key)) ||
    m.version !== 'M06_E2_LOCATOR_GROUP_OWNER_SQLITE_TEST_CASE_V1' || m.stage !== 'LOCATOR_GROUP_OWNER_SQLITE_TEST' ||
    m.caseRoot !== root || m.caseId !== path.basename(root) || m.databasePath !== path.join(root, 'fixture.sqlite') ||
    m.generatedClientEntry !== path.join(sdkDirectory, 'index.js') || typeof m.generatedEnginePath !== 'string' ||
    path.dirname(m.generatedEnginePath) !== sdkDirectory ||
    !/^libquery_engine-[a-zA-Z0-9_-]+\.(?:dylib|so)\.node$/.test(path.basename(m.generatedEnginePath)) ||
    !Array.isArray(m.migrationIds) || m.migrationIds.join(',') !== migrationIds.join(',') ||
    [m.databaseSha256, m.generatedClientSha256, m.generatedRuntimeSha256, m.testSourceSha256,
      m.sourceReviewSha256, m.operationalReviewSha256, m.hostProofSha256, m.generatedEngineSha256]
      .some(pin => typeof pin !== 'string' || !sha.test(pin))) refuse('manifest scope or fields')
  const databasePath = m.databasePath as string, entry = m.generatedClientEntry as string
  const engine = m.generatedEnginePath as string
  for (const directory of [path.join(root, 'home'), path.join(root, 'tmp')]) {
    const info = await fs.lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || await fs.realpath(directory) !== directory)
      refuse('case home/temp identity')
  }
  if (process.env.DATABASE_URL !== `file:${databasePath}` || process.env.HOME !== path.join(root, 'home') ||
    process.env.TMPDIR !== path.join(root, 'tmp') || process.env.PRISMA_QUERY_ENGINE_LIBRARY !== engine ||
    process.env.PRISMA_QUERY_ENGINE_BINARY !== undefined ||
    (process.env.PRISMA_CLIENT_ENGINE_TYPE !== undefined && process.env.PRISMA_CLIENT_ENGINE_TYPE !== 'library') ||
    await hashFile(databasePath) !== m.databaseSha256 || await hashFile(entry) !== m.generatedClientSha256 ||
    await hashFile(path.join(sdkDirectory, 'runtime/library.js')) !== m.generatedRuntimeSha256 ||
    await hashFile(engine) !== m.generatedEngineSha256 || await hashFile(source) !== m.testSourceSha256)
    refuse('reviewed baseline image or private SDK/native custody')

  // No SDK or service runtime import precedes the complete custody checks above.
  type Sdk = {
    PrismaClient?: new (options: { datasources: { db: { url: string } } }) => PrismaClient
    Prisma?: { prismaVersion?: { client?: string }; PrismaClientKnownRequestError?: unknown }
  }
  const imported = await import(pathToFileURL(entry).href) as unknown as Sdk & { default?: Sdk }
  const sdk = imported.default ?? imported
  if (typeof sdk.PrismaClient !== 'function' || sdk.Prisma?.prismaVersion?.client !== '6.19.3' ||
    typeof sdk.Prisma.PrismaClientKnownRequestError !== 'function') refuse('supported public SDK exports')
  // Outer Vitest config must alias this bare specifier to exactly the same
  // private entry. No unit mock, installed SDK fallback or forbidden stub.
  const aliasImport = await import('@prisma/client') as unknown as Sdk & { default?: Sdk }
  const alias = aliasImport.default ?? aliasImport
  if (alias.PrismaClient !== sdk.PrismaClient ||
    alias.Prisma?.PrismaClientKnownRequestError !== sdk.Prisma.PrismaClientKnownRequestError)
    refuse('Prisma runtime alias identity')
  db = new sdk.PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  const fk = await db.$queryRawUnsafe<Array<{ foreign_keys: number | bigint }>>('PRAGMA foreign_keys')
  if (fk.length !== 1 || Number(fk[0]?.foreign_keys) !== 1) refuse('foreign keys disabled')
  const migrated = await db.$queryRawUnsafe<Array<{ migration_name: string; finished_at: unknown; rolled_back_at: unknown }>>(
    'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"',
  )
  if (migrated.some(row => row.finished_at === null || row.rolled_back_at !== null) ||
    migrationIds.some(id => migrated.filter(row => row.migration_name === id).length !== 1)) refuse('migration baseline')
  const projects = await db.targetProject.findMany({ select: { id: true }, take: 2 })
  const counts = await Promise.all([
    db.qualityJourney.count(), db.qualityJourneyCoordinatorSession.count(), db.qualityJourneyE2CampaignPolicy.count(),
    db.qualityJourneyE2Retirement.count(), db.qualityJourneySharedResourceUse.count(), db.qualityJourneySharedResourceClaim.count(),
    db.qualityJourneySharedResourceGuard.count(), db.qualityJourneyLocatorEnsureReceipt.count(), db.module.count(),
    db.locatorGroup.count(), db.locator.count(), db.testSuite.count(), db.testCase.count(), db.testCaseStep.count(),
    db.testCaseStepParameter.count(), db.testRun.count(), db.testRunTestCase.count(),
  ])
  const baselineCoverage = await db.qualityJourneySharedResourceCoverage.findMany({ orderBy: { kind: 'asc' } })
  if (projects.length !== 1 || projects[0]?.id !== '00000000-0000-4000-8000-000000000001' ||
    counts.some(count => count !== 0) || baselineCoverage.length !== sharedResourceKinds.length ||
    baselineCoverage.some((row, index) => row.targetProjectId !== projects[0]?.id ||
      row.kind !== [...sharedResourceKinds].sort()[index] || row.protocolVersion !== 1 || row.state !== 'UNKNOWN' ||
      row.epoch !== 0 || row.writerClosureDigest !== null || row.readerClosureDigest !== null ||
      row.sourceUniverseDigest !== null || row.reconciliationDigest !== null || row.proofKind !== null || row.completedAt !== null))
    refuse('migration-only legacy target and zero lineage/resources')

  guardService = await import('@/services/coordinator/quality-journey-shared-resource-guard-service')
  carrier.run = callback => {
    transactionCount++
    const operation = client().$transaction(async tx => {
      const probe = postWriteProbe
      if (!probe) return callback(tx)
      const group = new Proxy(tx.locatorGroup, {
        get(target, key, receiver) {
          if (key !== 'update') return Reflect.get(target, key, receiver)
          return async (args: Prisma.LocatorGroupUpdateArgs) => {
            await tx.locatorGroup.update(args)
            await probe(tx)
            throw fixtureFault
          }
        },
      })
      return callback(new Proxy(tx, {
        get(target, key, receiver) { return key === 'locatorGroup' ? group : Reflect.get(target, key, receiver) },
      }))
    })
    transactions.push(operation)
    return operation
  }
  owner = await import('./locator-group-service')
}

type Tx = Prisma.TransactionClient
async function guardRows(tx: Tx, targetProjectId: string) {
  return {
    coverage: await tx.qualityJourneySharedResourceCoverage.findMany({ where: { targetProjectId }, orderBy: { kind: 'asc' } }),
    guards: await tx.qualityJourneySharedResourceGuard.findMany({ where: { targetProjectId },
      orderBy: [{ kind: 'asc' }, { resourceId: 'asc' }] }),
  }
}

async function newFixture(archiveFirstLocator = false) {
  const targetProjectId = randomUUID()
  const ids = {
    moduleA: randomUUID(), moduleB: randomUUID(), groupA: randomUUID(), groupB: randomUUID(),
    locatorA: randomUUID(), locatorB: randomUUID(), caseA: randomUUID(), caseB: randomUUID(),
    stepA: randomUUID(), stepB: randomUUID(), parameterA: randomUUID(), parameterB: randomUUID(),
  }
  const roots: SharedResourceMutationKey[] = [
    { kind: 'MODULE', resourceId: ids.moduleA }, { kind: 'MODULE', resourceId: ids.moduleB },
    { kind: 'LOCATOR_GROUP', resourceId: ids.groupA }, { kind: 'LOCATOR_GROUP', resourceId: ids.groupB },
    { kind: 'LOCATOR', resourceId: ids.locatorA }, { kind: 'LOCATOR', resourceId: ids.locatorB },
    { kind: 'TEST_CASE', resourceId: ids.caseA }, { kind: 'TEST_CASE', resourceId: ids.caseB },
  ]
  await client().$transaction(async tx => {
    await guardService.initializeNewTargetSharedResourceCoverage(tx, targetProjectId)
    await tx.targetProject.create({ data: { id: targetProjectId, kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `synthetic-group:${targetProjectId}`, displayName: 'Synthetic Group SQLite fixture',
      canonicalPath: path.join(process.env.M06_E2_LOCATOR_GROUP_OWNER_CASE_ROOT!, 'synthetic-target', targetProjectId),
      fingerprint: digest(`synthetic-group-target:${targetProjectId}`) } })
    await guardService.prepareSharedResourceMutationInTransaction(tx, targetProjectId, { existing: [], newRoots: roots, deleted: [] })
    for (const [id, name] of [[ids.moduleA, 'Synthetic Module A'], [ids.moduleB, 'Synthetic Module B']] as const)
      await tx.module.create({ data: { id, name, targetProjectId } })
    await tx.locatorGroup.create({ data: { id: ids.groupA, name: 'Synthetic prior A', moduleId: ids.moduleA, route: '/a', targetProjectId } })
    await tx.locatorGroup.create({ data: { id: ids.groupB, name: 'Synthetic prior B', moduleId: ids.moduleB, route: '/b', targetProjectId } })
    await tx.locator.create({ data: { id: ids.locatorA, name: 'Synthetic Locator A', value: '#synthetic-a',
      locatorGroupId: ids.groupA, targetProjectId, archivedAt: archiveFirstLocator ? sample : null } })
    await tx.locator.create({ data: { id: ids.locatorB, name: 'Synthetic Locator B', value: '#synthetic-b', locatorGroupId: ids.groupB, targetProjectId } })
    for (const edge of [
      { caseId: ids.caseA, stepId: ids.stepA, parameterId: ids.parameterA, locatorId: ids.locatorA },
      { caseId: ids.caseB, stepId: ids.stepB, parameterId: ids.parameterB, locatorId: ids.locatorB },
    ]) {
      await tx.testCase.create({ data: { id: edge.caseId, title: 'Synthetic dependent Case', description: 'Fixture-only', targetProjectId } })
      await tx.testCaseStep.create({ data: { id: edge.stepId, testCaseId: edge.caseId, order: 0,
        gherkinStep: 'When', icon: 'MOUSE', label: 'Synthetic inert step', invocationJson: JSON.stringify({ syntheticFixtureOnly: true }) } })
      await tx.testCaseStepParameter.create({ data: { id: edge.parameterId, testCaseStepId: edge.stepId,
        name: 'syntheticLocator', value: 'synthetic-only', order: 0, type: 'LOCATOR', locatorId: edge.locatorId } })
    }
    // These are explicitly synthetic, Journey-free census/proof values. No
    // production bootstrap or issuer is called or installed by this fixture.
    for (const kind of sharedResourceKinds) {
      const census = roots.filter(root => root.kind === kind).map(root => root.resourceId).sort()
      await tx.qualityJourneySharedResourceCoverage.update({
        where: { targetProjectId_kind_protocolVersion: { targetProjectId, kind, protocolVersion: 1 } },
        data: { state: 'COMPLETE', epoch: { increment: 1 }, proofKind: 'JOURNEY_FREE_V1', completedAt: sample,
          writerClosureDigest: digest(`SYNTHETIC_GROUP_ONLY:writer:${kind}`),
          readerClosureDigest: digest(`SYNTHETIC_GROUP_ONLY:reader:${kind}`),
          sourceUniverseDigest: digest(JSON.stringify({ syntheticOnly: true, targetProjectId, kind, census })),
          reconciliationDigest: digest(`SYNTHETIC_GROUP_ONLY:no-Journey:${targetProjectId}:${kind}`) },
      })
    }
  })
  return { targetProjectId, ids }
}

type Fixture = Awaited<ReturnType<typeof newFixture>>
async function state(tx: Tx, item: Fixture) {
  const targetProjectId = item.targetProjectId
  return {
    target: await tx.targetProject.findUniqueOrThrow({ where: { id: targetProjectId } }),
    modules: await tx.module.findMany({ where: { targetProjectId }, orderBy: { id: 'asc' } }),
    groups: await tx.locatorGroup.findMany({ where: { targetProjectId }, orderBy: { id: 'asc' } }),
    locators: await tx.locator.findMany({ where: { targetProjectId }, orderBy: { id: 'asc' } }),
    cases: await tx.testCase.findMany({ where: { targetProjectId }, orderBy: { id: 'asc' } }),
    steps: await tx.testCaseStep.findMany({ where: { testCaseId: { in: [item.ids.caseA, item.ids.caseB] } }, orderBy: { id: 'asc' } }),
    parameters: await tx.testCaseStepParameter.findMany({ where: { testCaseStepId: { in: [item.ids.stepA, item.ids.stepB] } }, orderBy: { id: 'asc' } }),
    coverage: await tx.qualityJourneySharedResourceCoverage.findMany({ orderBy: [{ targetProjectId: 'asc' }, { kind: 'asc' }] }),
    guards: await tx.qualityJourneySharedResourceGuard.findMany({ orderBy: [{ targetProjectId: 'asc' }, { kind: 'asc' }, { resourceId: 'asc' }] }),
  }
}

const identity = (key: SharedResourceMutationKey) => `${key.kind}/${key.resourceId}`
function assertPreparation(before: Awaited<ReturnType<typeof guardRows>>, after: Awaited<ReturnType<typeof guardRows>>,
  existing: readonly SharedResourceMutationKey[], newGroup?: string, deleted: readonly SharedResourceMutationKey[] = []) {
  const touched = new Set(existing.map(identity)), tombstones = new Set(deleted.map(identity))
  const domains = new Set([...existing.map(key => key.kind), ...(newGroup ? ['LOCATOR_GROUP'] : [])])
  expect(after.coverage).toEqual(before.coverage.map(row => ({ ...row, epoch: row.epoch + (domains.has(row.kind) ? 1 : 0) })))
  expect(after.guards).toHaveLength(before.guards.length + (newGroup ? 1 : 0))
  for (const prior of before.guards) {
    const key = `${prior.kind}/${prior.resourceId}`, removed = tombstones.has(key)
    expect(after.guards.find(row => row.kind === prior.kind && row.resourceId === prior.resourceId)).toEqual({
      ...prior, epoch: prior.epoch + (touched.has(key) ? 1 : 0), resourceState: removed ? 'DELETED' : prior.resourceState,
      deletedAt: removed ? expect.any(Date) : prior.deletedAt,
    })
  }
  if (newGroup) expect(after.guards.find(row => row.kind === 'LOCATOR_GROUP' && row.resourceId === newGroup)).toMatchObject({
    epoch: 0, coverageState: 'COMPLETE_V1', coverageDigest: expect.stringMatching(sha), resourceState: 'LIVE', deletedAt: null,
  })
}
function selectedKeys(groupIds: string[], locatorIds: string[], caseIds: string[]): SharedResourceMutationKey[] {
  return [
    ...groupIds.map(resourceId => ({ kind: 'LOCATOR_GROUP' as const, resourceId })),
    ...locatorIds.map(resourceId => ({ kind: 'LOCATOR' as const, resourceId })),
    ...caseIds.map(resourceId => ({ kind: 'TEST_CASE' as const, resourceId })),
  ]
}

beforeAll(openFreshCase)
afterAll(async () => {
  carrier.run = undefined
  await Promise.allSettled(transactions)
  if (db) await db.$disconnect()
  // Keep the fresh DB, all domain rows and every retained guard as evidence.
})

describe.sequential('E2 LocatorGroup owner synthetic fresh SQLite integration', () => {
  it('commits create connect and explicit structural set with exact old new and dependent guard unions', async () => {
    const item = await newFixture(), before = await state(client(), item)
    const initialGuards = await guardRows(client(), item.targetProjectId), count = transactionCount
    const created = await owner.createLocatorGroup({ name: 'Synthetic connected Group', moduleId: item.ids.moduleA,
      route: '/created', locators: [item.ids.locatorA] }, item.targetProjectId)
    expect(transactionCount).toBe(count + 1)
    expect(created.id).toMatch(uuid)
    expect([item.ids.groupA, item.ids.groupB]).not.toContain(created.id)
    const connectedGuards = await guardRows(client(), item.targetProjectId)
    assertPreparation(initialGuards, connectedGuards,
      selectedKeys([], [item.ids.locatorA], [item.ids.caseA]), created.id)
    expect(connectedGuards.guards.find(row => row.kind === 'LOCATOR_GROUP' && row.resourceId === item.ids.groupA))
      .toEqual(initialGuards.guards.find(row => row.kind === 'LOCATOR_GROUP' && row.resourceId === item.ids.groupA))
    expect((await client().locator.findUniqueOrThrow({ where: { id: item.ids.locatorA } })).locatorGroupId).toBe(created.id)
    expect(await client().locatorGroup.count({ where: { targetProjectId: item.targetProjectId } })).toBe(3)
    await owner.updateLocatorGroup(created.id, { name: 'Synthetic structural replacement', moduleId: item.ids.moduleB,
      route: '/changed', locators: [item.ids.locatorB] }, item.targetProjectId)
    expect(transactionCount).toBe(count + 2)
    const replacedGuards = await guardRows(client(), item.targetProjectId)
    assertPreparation(connectedGuards, replacedGuards,
      selectedKeys([created.id], [item.ids.locatorA, item.ids.locatorB], [item.ids.caseA, item.ids.caseB]))
    expect(replacedGuards.guards.find(row => row.kind === 'LOCATOR_GROUP' && row.resourceId === item.ids.groupB))
      .toEqual(connectedGuards.guards.find(row => row.kind === 'LOCATOR_GROUP' && row.resourceId === item.ids.groupB))
    expect(await client().locatorGroup.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      name: 'Synthetic structural replacement', moduleId: item.ids.moduleB, route: '/changed',
    })
    expect((await client().locator.findUniqueOrThrow({ where: { id: item.ids.locatorA } })).locatorGroupId).toBeNull()
    expect((await client().locator.findUniqueOrThrow({ where: { id: item.ids.locatorB } })).locatorGroupId).toBe(created.id)
    const after = await state(client(), item)
    expect(after.modules).toEqual(before.modules)
    expect(after.cases).toEqual(before.cases)
    expect(after.steps).toEqual(before.steps)
    expect(after.parameters).toEqual(before.parameters)
  })

  it('cascades an archived Locator and preserves its Case and Step with real parameter SET NULL and retained tombstones', async () => {
    const item = await newFixture(true), before = await state(client(), item)
    const initialGuards = await guardRows(client(), item.targetProjectId), count = transactionCount
    expect(before.locators.find(row => row.id === item.ids.locatorA)?.archivedAt).toEqual(sample)
    await expect(owner.deleteLocatorGroups([item.ids.groupA], item.targetProjectId)).resolves.toEqual([item.ids.groupA])
    expect(transactionCount).toBe(count + 1)
    const removed = selectedKeys([item.ids.groupA], [item.ids.locatorA], [])
    assertPreparation(initialGuards, await guardRows(client(), item.targetProjectId),
      selectedKeys([item.ids.groupA], [item.ids.locatorA], [item.ids.caseA]), undefined, removed)
    const after = await state(client(), item)
    expect(after.groups).toEqual(before.groups.filter(row => row.id !== item.ids.groupA))
    expect(after.locators).toEqual(before.locators.filter(row => row.id !== item.ids.locatorA))
    expect(after.modules).toEqual(before.modules)
    expect(after.cases).toEqual(before.cases)
    expect(after.steps).toEqual(before.steps)
    expect(after.parameters).toEqual(before.parameters.map(row => row.id === item.ids.parameterA ? { ...row, locatorId: null } : row))
    expect(after.parameters.find(row => row.id === item.ids.parameterA)?.locatorId).toBeNull()
  })

  it('rolls back actual Group update membership writes and every guard and coverage epoch after a post-write fixture fault', async () => {
    const item = await newFixture(), before = await state(client(), item)
    const initialGuards = await guardRows(client(), item.targetProjectId), count = transactionCount
    let witnessed = false
    postWriteProbe = async tx => {
      expect(await tx.locatorGroup.findUniqueOrThrow({ where: { id: item.ids.groupA } })).toMatchObject({
        name: 'Synthetic update to roll back', route: '/rollback', moduleId: item.ids.moduleB,
      })
      expect((await tx.locator.findUniqueOrThrow({ where: { id: item.ids.locatorA } })).locatorGroupId).toBeNull()
      expect((await tx.locator.findUniqueOrThrow({ where: { id: item.ids.locatorB } })).locatorGroupId).toBe(item.ids.groupA)
      const preparedGuards = await guardRows(tx, item.targetProjectId)
      assertPreparation(initialGuards, preparedGuards,
        selectedKeys([item.ids.groupA], [item.ids.locatorA, item.ids.locatorB], [item.ids.caseA, item.ids.caseB]))
      expect(preparedGuards.guards.find(row => row.kind === 'LOCATOR_GROUP' && row.resourceId === item.ids.groupB))
        .toEqual(initialGuards.guards.find(row => row.kind === 'LOCATOR_GROUP' && row.resourceId === item.ids.groupB))
      witnessed = true
    }
    try {
      await expect(owner.updateLocatorGroup(item.ids.groupA, { name: 'Synthetic update to roll back', route: '/rollback',
        moduleId: item.ids.moduleB, locators: [item.ids.locatorB] }, item.targetProjectId)).rejects.toBe(fixtureFault)
    } finally { postWriteProbe = undefined }
    expect(witnessed).toBe(true)
    expect(transactionCount).toBe(count + 1)
    expect(await state(client(), item)).toEqual(before)
  })
})
