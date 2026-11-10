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
// This carrier delegates each owning transaction to the exact real private
// client. No production db-config/createRequire body is evaluated.
vi.mock('@/config/db-config', () => ({
  default: new Proxy(Object.create(null) as object, {
    get(_target, key) {
      if (key !== '$transaction') throw new Error(`Authoring fixture root operation refused: ${String(key)}`)
      return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        if (!carrier.run) throw new Error('Authoring fixture carrier is not armed')
        return carrier.run(callback)
      }
    },
    set() { throw new Error('Authoring fixture root mutation refused') },
  }),
}))

// Whole manual mock: do not import session/companion/process runtime.
vi.mock('@/lib/locator-picker/session-manager', () => ({
  locatorPickerSessionManager: {
    getSession: async () => null,
    markSaving: async () => undefined,
    markReadyAfterSave: async () => undefined,
  },
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
let locatorOwner: typeof import('@/services/locator/locator-service')
let suiteOwner: typeof import('@/services/test-suite/test-suite-service')
let identifierOwner: typeof import('@/lib/test-suite-identifier-service')
let guardService: typeof import('@/services/coordinator/quality-journey-shared-resource-guard-service')
let transactionCount = 0
let postWriteProbe: undefined | ((tx: Prisma.TransactionClient) => Promise<void>)
const transactions: Promise<unknown>[] = []
const fixtureFault = new Error('SYNTHETIC_AUTHORING_FAULT_AFTER_REAL_SUITE_UPDATE')
let beforeOwnerTransaction: undefined | (() => Promise<void>)
let beforeTagCreate: undefined | ((tx: Prisma.TransactionClient) => Promise<void>)
let afterSuiteUpdate: undefined | ((tx: Prisma.TransactionClient) => Promise<void>)

function refuse(reason: string): never { throw new Error(`Authoring SQLite case refused: ${reason}`) }
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
  const root = process.env.M06_E2_AUTHORING_OWNER_CASE_ROOT
  const pin = process.env.M06_E2_AUTHORING_OWNER_MANIFEST_SHA256
  if (!root || !path.isAbsolute(root) || path.normalize(root) !== root || path.dirname(root) !== caseBase ||
    !uuid.test(path.basename(root)) || !pin || !sha.test(pin) || await fs.realpath(root) !== root)
    refuse('new case identity')
  if (source !== path.join(root, 'mirror/src/services/coordinator/quality-journey-authoring-owner.sqlite.integration.test.ts'))
    refuse('selector outside new mirror')
  const manifestFile = path.join(root, 'authoring-owner-sqlite-test-manifest.json')
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
    m.version !== 'M06_E2_AUTHORING_OWNER_SQLITE_TEST_CASE_V1' || m.stage !== 'AUTHORING_OWNER_SQLITE_TEST' ||
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
    db.testCaseStepParameter.count(), db.testRun.count(), db.testRunTestCase.count(), db.tag.count(),
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
  carrier.run = async callback => {
    transactionCount++
    if (beforeOwnerTransaction) await beforeOwnerTransaction()
    const operation = client().$transaction(async tx => {
      const suite = new Proxy(tx.testSuite, {
        get(target, key, receiver) {
          if (key !== 'update' || (!postWriteProbe && !afterSuiteUpdate)) return Reflect.get(target, key, receiver)
          return async (args: Prisma.TestSuiteUpdateArgs) => {
            const result = await tx.testSuite.update(args)
            if (afterSuiteUpdate) await afterSuiteUpdate(tx)
            if (postWriteProbe) { await postWriteProbe(tx); throw fixtureFault }
            return result
          }
        },
      })
      const tag = new Proxy(tx.tag, {
        get(target, key, receiver) {
          if (key !== 'create' || !beforeTagCreate) return Reflect.get(target, key, receiver)
          return async (args: Prisma.TagCreateArgs) => {
            await beforeTagCreate!(tx)
            return tx.tag.create(args)
          }
        },
      })
      return callback(new Proxy(tx, {
        get(target, key, receiver) {
          if (key === 'testSuite') return suite
          if (key === 'tag') return tag
          return Reflect.get(target, key, receiver)
        },
      }))
    })
    transactions.push(operation)
    return operation
  }
  locatorOwner = await import('@/services/locator/locator-service')
  suiteOwner = await import('@/services/test-suite/test-suite-service')
  identifierOwner = await import('@/lib/test-suite-identifier-service')
}

type Tx = Prisma.TransactionClient
async function guardRows(tx: Tx, targetProjectId: string) {
  return {
    coverage: await tx.qualityJourneySharedResourceCoverage.findMany({ where: { targetProjectId }, orderBy: { kind: 'asc' } }),
    guards: await tx.qualityJourneySharedResourceGuard.findMany({ where: { targetProjectId },
      orderBy: [{ kind: 'asc' }, { resourceId: 'asc' }] }),
  }
}

async function newFixture() {
  const targetProjectId = randomUUID()
  const ids = {
    moduleA: randomUUID(), moduleB: randomUUID(), groupA: randomUUID(), groupB: randomUUID(),
    locatorA: randomUUID(), locatorB: randomUUID(), caseA: randomUUID(), caseB: randomUUID(),
    stepA: randomUUID(), stepB: randomUUID(), parameterA: randomUUID(), parameterB: randomUUID(),
    suiteA: randomUUID(), suiteB: randomUUID(), filterA: randomUUID(), filterB: randomUUID(),
  }
  const roots: SharedResourceMutationKey[] = [
    { kind: 'MODULE', resourceId: ids.moduleA }, { kind: 'MODULE', resourceId: ids.moduleB },
    { kind: 'LOCATOR_GROUP', resourceId: ids.groupA }, { kind: 'LOCATOR_GROUP', resourceId: ids.groupB },
    { kind: 'LOCATOR', resourceId: ids.locatorA }, { kind: 'LOCATOR', resourceId: ids.locatorB },
    { kind: 'TEST_CASE', resourceId: ids.caseA }, { kind: 'TEST_CASE', resourceId: ids.caseB },
    { kind: 'TEST_SUITE', resourceId: ids.suiteA }, { kind: 'TEST_SUITE', resourceId: ids.suiteB },
  ]
  await client().$transaction(async tx => {
    await guardService.initializeNewTargetSharedResourceCoverage(tx, targetProjectId)
    await tx.targetProject.create({ data: { id: targetProjectId, kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `synthetic-authoring:${targetProjectId}`, displayName: 'Synthetic authoring SQLite fixture',
      canonicalPath: path.join(process.env.M06_E2_AUTHORING_OWNER_CASE_ROOT!, 'synthetic-target', targetProjectId),
      fingerprint: digest(`synthetic-authoring-target:${targetProjectId}`) } })
    await guardService.prepareSharedResourceMutationInTransaction(tx, targetProjectId, { existing: [], newRoots: roots, deleted: [] })
    for (const [id, name] of [[ids.moduleA, 'Synthetic Module A'], [ids.moduleB, 'Synthetic Module B']] as const)
      await tx.module.create({ data: { id, name, targetProjectId } })
    await tx.locatorGroup.create({ data: { id: ids.groupA, name: 'Synthetic prior A', moduleId: ids.moduleA, route: '/a', targetProjectId } })
    await tx.locatorGroup.create({ data: { id: ids.groupB, name: 'Synthetic prior B', moduleId: ids.moduleB, route: '/b', targetProjectId } })
    await tx.locator.create({ data: { id: ids.locatorA, name: 'Synthetic Locator A', value: '#synthetic-a',
      locatorGroupId: ids.groupA, targetProjectId, archivedAt: null } })
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
    for (const [id, name] of [[ids.filterA, 'Synthetic Filter A'], [ids.filterB, 'Synthetic Filter B']] as const)
      await tx.tag.create({ data: { id, name, tagExpression: `@${id}`, type: 'FILTER', targetProjectId } })
    for (const [id, caseId] of [[ids.suiteA, ids.caseA], [ids.suiteB, ids.caseB]] as const)
      await tx.testSuite.create({ data: { id, name: 'Synthetic missing identifier Suite', moduleId: ids.moduleA,
        targetProjectId, testCases: { connect: { id: caseId } } } })
    // These are explicitly synthetic, Journey-free census/proof values. No
    // production bootstrap or issuer is called or installed by this fixture.
    for (const kind of sharedResourceKinds) {
      const census = roots.filter(root => root.kind === kind).map(root => root.resourceId).sort()
      await tx.qualityJourneySharedResourceCoverage.update({
        where: { targetProjectId_kind_protocolVersion: { targetProjectId, kind, protocolVersion: 1 } },
        data: { state: 'COMPLETE', epoch: { increment: 1 }, proofKind: 'JOURNEY_FREE_V1', completedAt: sample,
          writerClosureDigest: digest(`SYNTHETIC_AUTHORING_ONLY:writer:${kind}`),
          readerClosureDigest: digest(`SYNTHETIC_AUTHORING_ONLY:reader:${kind}`),
          sourceUniverseDigest: digest(JSON.stringify({ syntheticOnly: true, targetProjectId, kind, census })),
          reconciliationDigest: digest(`SYNTHETIC_AUTHORING_ONLY:no-Journey:${targetProjectId}:${kind}`) },
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
    suites: await tx.testSuite.findMany({ where: { targetProjectId }, orderBy: { id: 'asc' }, include: {
      testCases: { select: { id: true }, orderBy: { id: 'asc' } },
      tags: { select: { id: true }, orderBy: { id: 'asc' } },
    } }),
    tags: await tx.tag.findMany({ where: { targetProjectId }, orderBy: { id: 'asc' }, include: {
      testSuites: { select: { id: true }, orderBy: { id: 'asc' } },
    } }),
    ...await guardRows(tx, targetProjectId),
  }
}

const identity = (key: SharedResourceMutationKey) => `${key.kind}/${key.resourceId}`
const key = (kind: SharedResourceMutationKey['kind'], resourceId: string): SharedResourceMutationKey => ({ kind, resourceId })
function assertPreparation(before: Awaited<ReturnType<typeof guardRows>>, after: Awaited<ReturnType<typeof guardRows>>,
  existing: readonly SharedResourceMutationKey[], newRoots: readonly SharedResourceMutationKey[] = [],
  deleted: readonly SharedResourceMutationKey[] = []) {
  const touched = new Set(existing.map(identity)), tombstones = new Set(deleted.map(identity))
  const domains = new Set<string>([...existing, ...newRoots].map(row => row.kind))
  expect(after.coverage).toEqual(before.coverage.map(row => ({ ...row, epoch: row.epoch + (domains.has(row.kind) ? 1 : 0) })))
  expect(after.guards).toHaveLength(before.guards.length + newRoots.length)
  for (const prior of before.guards) {
    const id = `${prior.kind}/${prior.resourceId}`, removed = tombstones.has(id)
    expect(after.guards.find(row => row.kind === prior.kind && row.resourceId === prior.resourceId)).toEqual({
      ...prior, epoch: prior.epoch + (touched.has(id) ? 1 : 0), resourceState: removed ? 'DELETED' : prior.resourceState,
      deletedAt: removed ? expect.any(Date) : prior.deletedAt,
    })
  }
  for (const root of newRoots)
    expect(after.guards.find(row => row.kind === root.kind && row.resourceId === root.resourceId)).toMatchObject({
      targetProjectId: before.coverage[0]!.targetProjectId, epoch: 0, coverageState: 'COMPLETE_V1',
      coverageDigest: expect.stringMatching(sha), resourceState: 'LIVE', deletedAt: null,
    })
}

beforeAll(openFreshCase)
afterAll(async () => {
  carrier.run = undefined
  await Promise.allSettled(transactions)
  if (db) await db.$disconnect()
  // Retain the fresh DB and every domain, coverage and guard row as evidence.
})

describe.sequential('E2 authoring owners synthetic fresh SQLite integration', () => {
  it('L1 commits real picker Group and Locator creation separately then guards only Locator and dependent Case for an FK and value update', async () => {
    const item = await newFixture(), before = await state(client(), item)
    const initialGuards = await guardRows(client(), item.targetProjectId), count = transactionCount
    let observedSeparateCommit = false
    beforeOwnerTransaction = async () => {
      if (transactionCount !== count + 2) return
      const groups = await client().locatorGroup.findMany({ where: { targetProjectId: item.targetProjectId, name: 'Synthetic picker Group' } })
      expect(groups).toHaveLength(1)
      const groupId = groups[0]!.id
      expect(groupId).toMatch(uuid)
      assertPreparation(initialGuards, await guardRows(client(), item.targetProjectId), [], [key('LOCATOR_GROUP', groupId)])
      expect(await client().locator.count({ where: { targetProjectId: item.targetProjectId, name: 'Synthetic picker Locator' } })).toBe(0)
      observedSeparateCommit = true
    }
    let created: Awaited<ReturnType<typeof locatorOwner.savePickedLocatorFromRequest>>
    try {
      created = await locatorOwner.savePickedLocatorFromRequest({ locatorName: ' Synthetic picker Locator ', selector: ' #synthetic-created ',
        resolutionMode: 'create', newLocatorGroupName: ' Synthetic picker Group ', moduleId: item.ids.moduleB,
        route: 'https://synthetic.invalid/created?discard=1' }, item.targetProjectId)
    } finally { beforeOwnerTransaction = undefined }
    expect(observedSeparateCommit).toBe(true)
    expect(transactionCount).toBe(count + 2)
    if (created.kind !== 'success') throw new Error('Synthetic picker create unexpectedly refused')
    expect(created).toMatchObject({ locatorName: 'Synthetic picker Locator', selector: '#synthetic-created',
      route: '/created', moduleId: item.ids.moduleB, wasUpdate: false })
    expect(created.locatorId).toMatch(uuid)
    const createdGuards = await guardRows(client(), item.targetProjectId)
    assertPreparation(initialGuards, createdGuards, [], [key('LOCATOR_GROUP', created.locatorGroupId), key('LOCATOR', created.locatorId)])
    const afterCreate = await state(client(), item)
    expect(afterCreate.modules).toEqual(before.modules)
    expect(afterCreate.groups.filter(row => row.id !== created.locatorGroupId)).toEqual(before.groups)
    expect(afterCreate.locators.filter(row => row.id !== created.locatorId)).toEqual(before.locators)
    await expect(locatorOwner.savePickedLocatorFromRequest({ locatorId: item.ids.locatorA, locatorName: 'Synthetic moved Locator',
      selector: '#synthetic-moved', resolutionMode: 'existing', existingLocatorGroupId: created.locatorGroupId }, item.targetProjectId))
      .resolves.toMatchObject({ kind: 'success', locatorId: item.ids.locatorA, locatorGroupId: created.locatorGroupId,
        selector: '#synthetic-moved', wasUpdate: true })
    expect(transactionCount).toBe(count + 3)
    assertPreparation(createdGuards, await guardRows(client(), item.targetProjectId),
      [key('LOCATOR', item.ids.locatorA), key('TEST_CASE', item.ids.caseA)])
    const after = await state(client(), item)
    expect(after.locators.find(row => row.id === item.ids.locatorA)).toMatchObject({
      value: '#synthetic-moved', locatorGroupId: created.locatorGroupId,
    })
    expect(after.groups).toEqual(afterCreate.groups)
    expect(after.modules).toEqual(before.modules)
    expect(after.cases).toEqual(before.cases)
    expect(after.steps).toEqual(before.steps)
    expect(after.parameters).toEqual(before.parameters)
  })

  it('L2 deletes a real Locator with parameter SET NULL while retaining its Case Step parents and Locator tombstone', async () => {
    const item = await newFixture(), before = await state(client(), item)
    const guards = await guardRows(client(), item.targetProjectId), count = transactionCount
    await expect(locatorOwner.deleteLocators([item.ids.locatorA], item.targetProjectId)).resolves.toEqual({ count: 1 })
    expect(transactionCount).toBe(count + 1)
    assertPreparation(guards, await guardRows(client(), item.targetProjectId),
      [key('LOCATOR', item.ids.locatorA), key('TEST_CASE', item.ids.caseA)], [], [key('LOCATOR', item.ids.locatorA)])
    const after = await state(client(), item)
    expect(after.locators).toEqual(before.locators.filter(row => row.id !== item.ids.locatorA))
    expect(after.parameters).toEqual(before.parameters.map(row => row.id === item.ids.parameterA ? { ...row, locatorId: null } : row))
    expect(after.parameters.find(row => row.id === item.ids.parameterA)?.locatorId).toBeNull()
    expect(after.cases).toEqual(before.cases)
    expect(after.steps).toEqual(before.steps)
    expect(after.groups).toEqual(before.groups)
    expect(after.modules).toEqual(before.modules)
    expect(after.guards.find(row => row.resourceId === item.ids.caseA)).toMatchObject({ resourceState: 'LIVE', deletedAt: null })
    expect(after.guards.find(row => row.resourceId === item.ids.locatorA)).toMatchObject({ resourceState: 'DELETED', deletedAt: expect.any(Date) })
  })

  it('S1 creates replaces membership and deletes a real Suite with exact Case epochs Suite-only tombstone and orphan identifier cleanup', async () => {
    const item = await newFixture(), before = await state(client(), item)
    const guards = await guardRows(client(), item.targetProjectId), count = transactionCount
    const created = await suiteOwner.createTestSuiteFromInput({ name: 'Synthetic created Suite', description: 'Fixture-only',
      moduleId: item.ids.moduleA, testCases: [item.ids.caseA], tagIds: [item.ids.filterA] }, item.targetProjectId)
    expect(transactionCount).toBe(count + 1)
    expect(created.id).toMatch(uuid)
    const createdGuards = await guardRows(client(), item.targetProjectId)
    assertPreparation(guards, createdGuards, [key('TEST_CASE', item.ids.caseA)], [key('TEST_SUITE', created.id)])
    const createdSuite = await client().testSuite.findUniqueOrThrow({ where: { id: created.id }, include: { tags: true, testCases: true } })
    expect(createdSuite.testCases.map(row => row.id)).toEqual([item.ids.caseA])
    const identifiers = createdSuite.tags.filter(row => row.type === 'IDENTIFIER' && row.name.startsWith('ts_'))
    expect(identifiers).toHaveLength(1)
    const identifierId = identifiers[0]!.id
    await suiteOwner.updateTestSuiteFromInput({ name: 'Synthetic replaced Suite', moduleId: item.ids.moduleB,
      testCases: [item.ids.caseB], tagIds: [item.ids.filterB] }, created.id, item.targetProjectId)
    expect(transactionCount).toBe(count + 2)
    const replacedGuards = await guardRows(client(), item.targetProjectId)
    assertPreparation(createdGuards, replacedGuards,
      [key('TEST_SUITE', created.id), key('TEST_CASE', item.ids.caseA), key('TEST_CASE', item.ids.caseB)])
    const replaced = await client().testSuite.findUniqueOrThrow({ where: { id: created.id }, include: { tags: true, testCases: true } })
    expect(replaced.moduleId).toBe(item.ids.moduleB)
    expect(replaced.testCases.map(row => row.id)).toEqual([item.ids.caseB])
    expect(replaced.tags.map(row => row.id).sort()).toEqual([identifierId, item.ids.filterB].sort())
    await suiteOwner.deleteTestSuitesByIds([created.id], item.targetProjectId)
    expect(transactionCount).toBe(count + 3)
    assertPreparation(replacedGuards, await guardRows(client(), item.targetProjectId),
      [key('TEST_SUITE', created.id), key('TEST_CASE', item.ids.caseB)], [], [key('TEST_SUITE', created.id)])
    const after = await state(client(), item)
    expect(after.suites).toEqual(before.suites)
    expect(after.tags).toEqual(before.tags)
    expect(await client().tag.findUnique({ where: { id: identifierId } })).toBeNull()
    expect(after.cases).toEqual(before.cases)
    expect(after.steps).toEqual(before.steps)
    expect(after.parameters).toEqual(before.parameters)
    expect(after.modules).toEqual(before.modules)
    expect(after.guards.filter(row => row.kind === 'TEST_CASE').every(row => row.resourceState === 'LIVE' && row.deletedAt === null)).toBe(true)
  })

  it('S2 repairs two real missing Suite identifiers in one prepared batch then repeats without writes or epoch changes', async () => {
    const item = await newFixture(), before = await state(client(), item)
    const guards = await guardRows(client(), item.targetProjectId), count = transactionCount
    const effects: string[] = []
    const existing = [key('TEST_SUITE', item.ids.suiteA), key('TEST_SUITE', item.ids.suiteB)]
    beforeTagCreate = async tx => {
      assertPreparation(guards, await guardRows(tx, item.targetProjectId), existing)
      expect(await tx.tag.count({ where: { targetProjectId: item.targetProjectId } })).toBe(before.tags.length + effects.filter(effect => effect === 'link').length)
      effects.push('tag')
    }
    afterSuiteUpdate = async tx => {
      assertPreparation(guards, await guardRows(tx, item.targetProjectId), existing)
      const rows = await tx.testSuite.findMany({ where: { id: { in: [item.ids.suiteA, item.ids.suiteB] } }, include: { tags: true } })
      expect(rows.reduce((total, row) => total + row.tags.length, 0)).toBe(effects.filter(effect => effect === 'tag').length)
      effects.push('link')
    }
    try { await identifierOwner.ensureTestSuiteIdentifierTags([item.ids.suiteB, item.ids.suiteA], item.targetProjectId) }
    finally { beforeTagCreate = undefined; afterSuiteUpdate = undefined }
    expect(transactionCount).toBe(count + 1)
    expect(effects).toEqual(['tag', 'link', 'tag', 'link'])
    const repaired = await state(client(), item)
    assertPreparation(guards, repaired, existing)
    expect(repaired.tags).toHaveLength(before.tags.length + 2)
    const repairedIds: string[] = []
    for (const suiteId of [item.ids.suiteA, item.ids.suiteB]) {
      const suite = repaired.suites.find(row => row.id === suiteId)!
      expect(suite.tags).toHaveLength(1)
      const tag = repaired.tags.find(row => row.id === suite.tags[0]!.id)!
      expect(tag).toMatchObject({ type: 'IDENTIFIER', name: expect.stringMatching(/^ts_[0-9a-f]{16}$/) })
      expect(tag.tagExpression).toBe(`@${tag.name}`)
      repairedIds.push(tag.id)
    }
    expect(new Set(repairedIds).size).toBe(2)
    expect(repaired.cases).toEqual(before.cases)
    expect(repaired.modules).toEqual(before.modules)
    beforeTagCreate = async () => { throw new Error('Already identified repair attempted a Tag write') }
    afterSuiteUpdate = async () => { throw new Error('Already identified repair attempted a Suite write') }
    try { await identifierOwner.ensureTestSuiteIdentifierTags([item.ids.suiteA, item.ids.suiteB], item.targetProjectId) }
    finally { beforeTagCreate = undefined; afterSuiteUpdate = undefined }
    expect(transactionCount).toBe(count + 2)
    expect(await state(client(), item)).toEqual(repaired)
  })

  it('S3 rolls back actual Suite update identifier Tag membership guards and coverage after a controlled post-write fixture fault', async () => {
    const item = await newFixture(), before = await state(client(), item)
    const guards = await guardRows(client(), item.targetProjectId), count = transactionCount
    let witnessed = false, newIdentifierId: string | undefined
    postWriteProbe = async tx => {
      const suite = await tx.testSuite.findUniqueOrThrow({ where: { id: item.ids.suiteA }, include: { tags: true, testCases: true } })
      expect(suite).toMatchObject({ name: 'Synthetic Suite rolled back', moduleId: item.ids.moduleB })
      expect(suite.testCases.map(row => row.id)).toEqual([item.ids.caseB])
      expect(suite.tags.some(row => row.id === item.ids.filterB)).toBe(true)
      const identifiers = suite.tags.filter(row => row.type === 'IDENTIFIER' && row.name.startsWith('ts_'))
      expect(identifiers).toHaveLength(1)
      newIdentifierId = identifiers[0]!.id
      expect(await tx.tag.count({ where: { targetProjectId: item.targetProjectId } })).toBe(before.tags.length + 1)
      expect(await tx.tag.findUnique({ where: { id: newIdentifierId } })).not.toBeNull()
      assertPreparation(guards, await guardRows(tx, item.targetProjectId),
        [key('TEST_SUITE', item.ids.suiteA), key('TEST_CASE', item.ids.caseA), key('TEST_CASE', item.ids.caseB)])
      witnessed = true
    }
    try {
      await expect(suiteOwner.updateTestSuiteFromInput({ name: 'Synthetic Suite rolled back', moduleId: item.ids.moduleB,
        testCases: [item.ids.caseB], tagIds: [item.ids.filterB] }, item.ids.suiteA, item.targetProjectId)).rejects.toBe(fixtureFault)
    } finally { postWriteProbe = undefined }
    expect(witnessed).toBe(true)
    expect(transactionCount).toBe(count + 1)
    expect(newIdentifierId).toMatch(uuid)
    expect(await client().tag.findUnique({ where: { id: newIdentifierId! } })).toBeNull()
    expect(await state(client(), item)).toEqual(before)
  })
})
