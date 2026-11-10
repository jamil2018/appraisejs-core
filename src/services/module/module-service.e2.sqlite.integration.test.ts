/**
 * Synthetic Module-owner SQLite conformance only. A separately reviewed closed
 * harness supplies a new migrated DB, mirror and Prisma 6.19.3 SDK/native engine.
 * COMPLETE fixture census data below is never a production issuer or bootstrap.
 * Keep this selector separate from the six retained C1 retirement cases.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { sharedResourceKinds } from '@/lib/quality-journey/shared-resource-contract'
import {
  initializeNewTargetSharedResourceCoverage,
  prepareSharedResourceMutationInTransaction,
  type SharedResourceMutationKey,
} from '@/services/coordinator/quality-journey-shared-resource-guard-service'

// Do not load db-config: its createRequire bypasses a generated-client alias and
// can construct the configured app client. This inert carrier exposes only the
// owning transaction, delegated below to the exact verified fresh real client.
const carrier = vi.hoisted(() => ({
  run: undefined as undefined | ((work: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>),
}))
vi.mock('@/config/db-config', () => ({
  default: new Proxy(Object.create(null) as object, {
    get(_target, key) {
      if (key !== '$transaction') throw new Error(`Module fixture root operation refused: ${String(key)}`)
      return (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        if (!carrier.run) throw new Error('Module fixture transaction carrier is not armed')
        return carrier.run(work)
      }
    },
    set() {
      throw new Error('Module fixture root mutation refused')
    },
  }),
}))

const source = fileURLToPath(import.meta.url)
const caseBase = '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m06-work/e2-prisma-offline'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const sha = /^[a-f0-9]{64}$/
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const migrations = [
  '20261024010000_add_journey_e2_effect_admission',
  '20261024020000_add_journey_shared_resource_claims',
  '20261024030000_add_journey_e2_operation_preparation',
  '20261024040000_add_automation_materialization_source_proof',
]
const legacyTarget = '00000000-0000-4000-8000-000000000001'
const sample = new Date('2026-10-24T00:00:00.000Z')
const ownedOperations: Promise<unknown>[] = []
const knownFault = new Error('SYNTHETIC_MODULE_OWNER_FAULT_AFTER_REAL_UPDATE')
let db: PrismaClient | undefined
let owner: typeof import('./module-service')
let faultAfterUpdate: undefined | ((tx: Prisma.TransactionClient) => Promise<void>)
let transactionCount = 0

function refuse(reason: string): never {
  throw new Error(`Module SQLite case refused: ${reason}`)
}

function client(): PrismaClient {
  if (!db) return refuse('fresh client not opened')
  return db
}

async function regular(file: string) {
  const stat = await fs.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || (await fs.realpath(file)) !== file) refuse('nonregular file')
}

async function fileHash(file: string) {
  await regular(file)
  return new Promise<string>((resolve, reject) => {
    const digest = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', chunk => digest.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(digest.digest('hex')))
  })
}

async function openFreshHarnessCase() {
  const root = process.env.M06_E2_MODULE_OWNER_CASE_ROOT
  const expectedManifestHash = process.env.M06_E2_MODULE_OWNER_MANIFEST_SHA256
  if (
    !root ||
    !path.isAbsolute(root) ||
    path.normalize(root) !== root ||
    !uuid.test(path.basename(root)) ||
    path.dirname(root) !== caseBase ||
    !expectedManifestHash ||
    !sha.test(expectedManifestHash) ||
    (await fs.realpath(root)) !== root
  )
    refuse('fresh harness case scope')
  // All runtime source/file reads stay in this new mirror. No W/root fallback.
  if (source !== path.join(root, 'mirror/src/services/module/module-service.e2.sqlite.integration.test.ts'))
    refuse('test must execute from its fresh mirror')
  const manifestPath = path.join(root, 'module-owner-sqlite-test-manifest.json')
  if ((await fileHash(manifestPath)) !== expectedManifestHash) refuse('manifest hash')
  const bytes = await fs.readFile(manifestPath, 'utf8')
  const parsed: unknown = JSON.parse(bytes)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || bytes !== `${JSON.stringify(parsed)}\n`)
    refuse('manifest canonical JSON')
  const manifest = parsed as Record<string, unknown>
  const exactKeys = [
    'version',
    'caseId',
    'caseRoot',
    'stage',
    'databasePath',
    'databaseSha256',
    'generatedClientEntry',
    'generatedClientSha256',
    'generatedRuntimeSha256',
    'testSourceSha256',
    'migrationIds',
    'sourceReviewSha256',
    'operationalReviewSha256',
    'hostProofSha256',
    'generatedEnginePath',
    'generatedEngineSha256',
  ]
  const sdk = path.join(root, 'mirror/node_modules/.prisma/client')
  if (
    Object.keys(manifest).length !== exactKeys.length ||
    Object.keys(manifest).some(key => !exactKeys.includes(key)) ||
    manifest.version !== 'M06_E2_MODULE_OWNER_SQLITE_TEST_CASE_V1' ||
    manifest.stage !== 'MODULE_OWNER_SQLITE_TEST' ||
    manifest.caseId !== path.basename(root) ||
    manifest.caseRoot !== root ||
    manifest.databasePath !== path.join(root, 'fixture.sqlite') ||
    manifest.generatedClientEntry !== path.join(sdk, 'index.js') ||
    typeof manifest.generatedEnginePath !== 'string' ||
    path.dirname(manifest.generatedEnginePath) !== sdk ||
    !/^libquery_engine-[a-zA-Z0-9_-]+\.(?:dylib|so)\.node$/.test(path.basename(manifest.generatedEnginePath)) ||
    !Array.isArray(manifest.migrationIds) ||
    manifest.migrationIds.join(',') !== migrations.join(',') ||
    [
      manifest.databaseSha256,
      manifest.generatedClientSha256,
      manifest.generatedRuntimeSha256,
      manifest.testSourceSha256,
      manifest.sourceReviewSha256,
      manifest.operationalReviewSha256,
      manifest.hostProofSha256,
      manifest.generatedEngineSha256,
    ].some(value => typeof value !== 'string' || !sha.test(value))
  )
    refuse('manifest fields')
  const databasePath = manifest.databasePath as string
  const entry = manifest.generatedClientEntry as string
  const engine = manifest.generatedEnginePath as string
  for (const directory of [path.join(root, 'home'), path.join(root, 'tmp')]) {
    const stat = await fs.lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await fs.realpath(directory)) !== directory)
      refuse('case home or temp directory')
  }
  if (
    process.env.DATABASE_URL !== `file:${databasePath}` ||
    process.env.HOME !== path.join(root, 'home') ||
    process.env.TMPDIR !== path.join(root, 'tmp') ||
    process.env.PRISMA_QUERY_ENGINE_LIBRARY !== engine ||
    process.env.PRISMA_QUERY_ENGINE_BINARY !== undefined ||
    (process.env.PRISMA_CLIENT_ENGINE_TYPE !== undefined && process.env.PRISMA_CLIENT_ENGINE_TYPE !== 'library') ||
    (await fileHash(databasePath)) !== manifest.databaseSha256 ||
    (await fileHash(entry)) !== manifest.generatedClientSha256 ||
    (await fileHash(path.join(sdk, 'runtime/library.js'))) !== manifest.generatedRuntimeSha256 ||
    (await fileHash(engine)) !== manifest.generatedEngineSha256 ||
    (await fileHash(source)) !== manifest.testSourceSha256
  )
    refuse('fresh reviewed baseline image or SDK/native custody')

  // The outer preflight pins the migration-only image before this import. Its
  // SQL baseline is then checked through only this explicit fresh datasource.
  type Sdk = {
    PrismaClient?: new (options: { datasources: { db: { url: string } } }) => PrismaClient
    Prisma?: { prismaVersion?: { client?: string } }
  }
  const imported = (await import(pathToFileURL(entry).href)) as unknown as Sdk & { default?: Sdk }
  const constructor = imported.default?.PrismaClient ?? imported.PrismaClient
  const version = imported.default?.Prisma?.prismaVersion?.client ?? imported.Prisma?.prismaVersion?.client
  if (typeof constructor !== 'function' || version !== '6.19.3') refuse('supported generated SDK export/version')
  db = new constructor({ datasources: { db: { url: `file:${databasePath}` } } })
  const foreignKeys = await db.$queryRawUnsafe<Array<{ foreign_keys: number | bigint }>>('PRAGMA foreign_keys')
  if (foreignKeys.length !== 1 || Number(foreignKeys[0]?.foreign_keys) !== 1) refuse('SQLite foreign keys disabled')
  const applied = await db.$queryRawUnsafe<
    Array<{
      migration_name: string
      finished_at: unknown
      rolled_back_at: unknown
    }>
  >('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"')
  if (
    applied.some(row => row.finished_at === null || row.rolled_back_at !== null) ||
    migrations.some(id => applied.filter(row => row.migration_name === id).length !== 1)
  )
    refuse('required completed migrations')
  const targets = await db.targetProject.findMany({ select: { id: true }, take: 2 })
  const emptyCounts = await Promise.all([
    db.qualityJourney.count(),
    db.qualityJourneyCoordinatorSession.count(),
    db.qualityJourneyE2CampaignPolicy.count(),
    db.qualityJourneyE2Retirement.count(),
    db.qualityJourneySharedResourceUse.count(),
    db.qualityJourneySharedResourceClaim.count(),
    db.qualityJourneySharedResourceGuard.count(),
    db.qualityJourneyLocatorEnsureReceipt.count(),
    db.module.count(),
    db.locatorGroup.count(),
    db.locator.count(),
    db.testSuite.count(),
    db.testCase.count(),
    db.testRun.count(),
    db.testRunTestCase.count(),
  ])
  const coverage = await db.qualityJourneySharedResourceCoverage.findMany({ orderBy: { kind: 'asc' } })
  if (
    targets.length !== 1 ||
    targets[0]?.id !== legacyTarget ||
    emptyCounts.some(count => count !== 0) ||
    coverage.length !== sharedResourceKinds.length ||
    coverage.some(
      (row, index) =>
        row.targetProjectId !== legacyTarget ||
        row.kind !== [...sharedResourceKinds].sort()[index] ||
        row.protocolVersion !== 1 ||
        row.state !== 'UNKNOWN' ||
        row.epoch !== 0 ||
        row.writerClosureDigest !== null ||
        row.readerClosureDigest !== null ||
        row.sourceUniverseDigest !== null ||
        row.reconciliationDigest !== null ||
        row.proofKind !== null ||
        row.completedAt !== null,
    )
  )
    refuse('migration-only legacy target and zero Journey/resource baseline')

  carrier.run = work => {
    transactionCount++
    const operation = client().$transaction(async tx => {
      const probe = faultAfterUpdate
      if (!probe) return work(tx)
      // Sole fault seam: await the actual module update, observe its real guard
      // preparation inside the original outer tx, then throw without retry.
      const moduleDelegate = new Proxy(tx.module, {
        get(target, key, receiver) {
          if (key !== 'update') return Reflect.get(target, key, receiver)
          return async (args: Prisma.ModuleUpdateArgs) => {
            await tx.module.update(args)
            await probe(tx)
            throw knownFault
          }
        },
      })
      return work(
        new Proxy(tx, {
          get(target, key, receiver) {
            return key === 'module' ? moduleDelegate : Reflect.get(target, key, receiver)
          },
        }),
      )
    })
    ownedOperations.push(operation)
    return operation
  }
  owner = await import('./module-service')
}

type Tx = Prisma.TransactionClient
type Fixture = Awaited<ReturnType<typeof fixture>>

async function guards(tx: Tx, targetProjectId: string) {
  return {
    coverage: await tx.qualityJourneySharedResourceCoverage.findMany({
      where: { targetProjectId },
      orderBy: { kind: 'asc' },
    }),
    resources: await tx.qualityJourneySharedResourceGuard.findMany({
      where: { targetProjectId },
      orderBy: [{ kind: 'asc' }, { resourceId: 'asc' }],
    }),
  }
}

// Exact semantic rows of this new DB, including join tables, guards and epochs.
// No old database or fixture artifact is opened; no snapshot files are written.
async function allRows(tx: Tx) {
  const tables = await tx.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  const result: Record<string, string[]> = {}
  for (const { name } of tables) {
    const rows = await tx.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
    result[name] = rows
      .map(row => {
        const serialized = JSON.stringify(row, (_key, value: unknown) =>
          typeof value === 'bigint' ? { sqliteBigInt: value.toString() } : value,
        )
        if (typeof serialized !== 'string') return refuse('unserializable fresh SQLite row')
        return serialized
      })
      .sort()
  }
  return result
}

async function fixture(archivedChild = false, history = false) {
  const targetProjectId = randomUUID()
  const ids = {
    root: randomUUID(),
    child: randomUUID(),
    outside: randomUUID(),
    group: randomUUID(),
    locator: randomUUID(),
    suite: randomUUID(),
    testCase: randomUUID(),
    metrics: randomUUID(),
    environment: randomUUID(),
    run: randomUUID(),
    runIdentity: randomUUID(),
    selection: randomUUID(),
  }
  const roots: SharedResourceMutationKey[] = [
    { kind: 'MODULE', resourceId: ids.root },
    { kind: 'MODULE', resourceId: ids.child },
    { kind: 'MODULE', resourceId: ids.outside },
    { kind: 'LOCATOR_GROUP', resourceId: ids.group },
    { kind: 'LOCATOR', resourceId: ids.locator },
    { kind: 'TEST_SUITE', resourceId: ids.suite },
    { kind: 'TEST_CASE', resourceId: ids.testCase },
  ]
  await client().$transaction(async tx => {
    await initializeNewTargetSharedResourceCoverage(tx, targetProjectId)
    await tx.targetProject.create({
      data: {
        id: targetProjectId,
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: `synthetic-module:${targetProjectId}`,
        canonicalPath: path.join(process.env.M06_E2_MODULE_OWNER_CASE_ROOT!, 'synthetic-target', targetProjectId),
        displayName: 'Synthetic Module SQLite fixture',
        fingerprint: hash(`synthetic-target:${targetProjectId}`),
      },
    })
    await prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
      existing: [],
      newRoots: roots,
      deleted: [],
    })
    await tx.module.create({ data: { id: ids.root, name: 'Synthetic root', targetProjectId } })
    await tx.module.create({
      data: {
        id: ids.child,
        name: 'Synthetic child',
        targetProjectId,
        parentId: ids.root,
        archivedAt: archivedChild ? sample : null,
      },
    })
    await tx.module.create({ data: { id: ids.outside, name: 'Synthetic outside', targetProjectId } })
    await tx.locatorGroup.create({
      data: {
        id: ids.group,
        name: 'Synthetic group',
        moduleId: ids.child,
        targetProjectId,
      },
    })
    await tx.locator.create({
      data: {
        id: ids.locator,
        name: 'Synthetic locator',
        value: '#synthetic-only',
        locatorGroupId: ids.group,
        targetProjectId,
      },
    })
    await tx.testCase.create({
      data: {
        id: ids.testCase,
        title: 'Synthetic surviving Case',
        description: 'Fixture-only membership',
        targetProjectId,
      },
    })
    await tx.testSuite.create({
      data: {
        id: ids.suite,
        name: 'Synthetic Suite',
        moduleId: ids.child,
        targetProjectId,
        testCases: { connect: { id: ids.testCase } },
      },
    })
    await tx.testSuiteMetrics.create({ data: { id: ids.metrics, testSuiteId: ids.suite, targetProjectId } })
    if (history) {
      await tx.environment.create({
        data: {
          id: ids.environment,
          name: 'Synthetic unvisited environment',
          baseUrl: 'http://fixture.invalid',
          targetProjectId,
        },
      })
      await tx.testRun.create({
        data: {
          id: ids.run,
          runId: ids.runIdentity,
          name: 'Synthetic retained history',
          environmentId: ids.environment,
          targetProjectId,
          status: 'QUEUED',
        },
      })
      await tx.testRunTestCase.create({
        data: {
          id: ids.selection,
          testRunId: ids.run,
          testCaseId: ids.testCase,
          testSuiteId: ids.suite,
        },
      })
    }
    // Explicit synthetic census over only this new fixture. SQL requires an
    // epoch step with UNKNOWN -> COMPLETE; no live producer/issuer is installed.
    for (const kind of sharedResourceKinds) {
      const census = roots
        .filter(key => key.kind === kind)
        .map(key => key.resourceId)
        .sort()
      await tx.qualityJourneySharedResourceCoverage.update({
        where: { targetProjectId_kind_protocolVersion: { targetProjectId, kind, protocolVersion: 1 } },
        data: {
          state: 'COMPLETE',
          epoch: { increment: 1 },
          proofKind: 'JOURNEY_FREE_V1',
          completedAt: sample,
          writerClosureDigest: hash(`SYNTHETIC_FIXTURE_ONLY:writer:${kind}`),
          readerClosureDigest: hash(`SYNTHETIC_FIXTURE_ONLY:reader:${kind}`),
          sourceUniverseDigest: hash(JSON.stringify({ syntheticOnly: true, targetProjectId, kind, census })),
          reconciliationDigest: hash(`SYNTHETIC_FIXTURE_ONLY:no-Journey:${targetProjectId}:${kind}`),
        },
      })
    }
  })
  return { targetProjectId, ids, roots }
}

function assertPrepared(
  before: Awaited<ReturnType<typeof guards>>,
  after: Awaited<ReturnType<typeof guards>>,
  item: Fixture,
  deleting: boolean,
) {
  expect(after.coverage).toEqual(before.coverage.map(row => ({ ...row, epoch: row.epoch + 1 })))
  expect(after.resources).toHaveLength(item.roots.length)
  for (const prior of before.resources) {
    const retained = after.resources.find(row => row.kind === prior.kind && row.resourceId === prior.resourceId)
    const outside = prior.resourceId === item.ids.outside
    const deleted = deleting && !outside && prior.kind !== 'TEST_CASE'
    expect(retained).toEqual({
      ...prior,
      epoch: prior.epoch + (outside ? 0 : 1),
      resourceState: deleted ? 'DELETED' : 'LIVE',
      deletedAt: deleted ? expect.any(Date) : null,
    })
  }
}

async function assertCascade(item: Fixture, before: Awaited<ReturnType<typeof guards>>) {
  const targetProjectId = item.targetProjectId
  expect(await client().module.findMany({ where: { targetProjectId }, select: { id: true } })).toEqual([
    { id: item.ids.outside },
  ])
  expect(await client().locatorGroup.count({ where: { targetProjectId } })).toBe(0)
  expect(await client().locator.count({ where: { targetProjectId } })).toBe(0)
  expect(await client().testSuite.count({ where: { targetProjectId } })).toBe(0)
  expect(await client().testSuiteMetrics.count({ where: { targetProjectId } })).toBe(0)
  expect(
    await client().testCase.findMany({
      where: { targetProjectId },
      select: { id: true, TestSuite: { select: { id: true } } },
    }),
  ).toEqual([{ id: item.ids.testCase, TestSuite: [] }])
  assertPrepared(before, await guards(client(), targetProjectId), item, true)
  expect(await client().qualityJourney.count({ where: { targetProjectId } })).toBe(0)
}

beforeAll(openFreshHarnessCase)
afterAll(async () => {
  carrier.run = undefined
  await Promise.allSettled(ownedOperations)
  if (db) await db.$disconnect()
  // Retain every new target, guard, history row and the fresh case DB.
})

describe.sequential('E2 Module owner synthetic fresh SQLite integration', () => {
  it('normalizes overlapping requested roots and commits exact cascade counts with retained tombstones and a LIVE Case', async () => {
    const item = await fixture()
    const before = await guards(client(), item.targetProjectId)
    const transactions = transactionCount
    await owner.deleteModules([item.ids.child, item.ids.root, item.ids.child, item.ids.root], item.targetProjectId)
    expect(transactionCount).toBe(transactions + 1)
    await assertCascade(item, before)
  })

  it('includes an archived descendant in the physical cascade and retained guard closure', async () => {
    const item = await fixture(true)
    expect((await client().module.findUniqueOrThrow({ where: { id: item.ids.child } })).archivedAt).toEqual(sample)
    const before = await guards(client(), item.targetProjectId)
    const transactions = transactionCount
    await owner.deleteModules([item.ids.root], item.targetProjectId)
    expect(transactionCount).toBe(transactions + 1)
    await assertCascade(item, before)
    expect(
      (
        await client().qualityJourneySharedResourceGuard.findUniqueOrThrow({
          where: {
            targetProjectId_kind_resourceId: {
              targetProjectId: item.targetProjectId,
              kind: 'MODULE',
              resourceId: item.ids.child,
            },
          },
        })
      ).resourceState,
    ).toBe('DELETED')
  })

  it('rolls back actual domain writes and every prepared guard and coverage epoch after a controlled post-update fault', async () => {
    const item = await fixture()
    const before = await allRows(client())
    const priorGuards = await guards(client(), item.targetProjectId)
    const transactions = transactionCount
    let observedActualWrite = false
    faultAfterUpdate = async tx => {
      expect((await tx.module.findUniqueOrThrow({ where: { id: item.ids.root } })).name).toBe(
        'Synthetic update that must roll back',
      )
      assertPrepared(priorGuards, await guards(tx, item.targetProjectId), item, false)
      observedActualWrite = true
    }
    try {
      await expect(
        owner.updateModule(item.ids.root, { name: 'Synthetic update that must roll back' }, item.targetProjectId),
      ).rejects.toBe(knownFault)
    } finally {
      faultAfterUpdate = undefined
    }
    expect(observedActualWrite).toBe(true)
    expect(transactionCount).toBe(transactions + 1)
    expect(await allRows(client())).toEqual(before)
  })

  it('refuses incoming TestRunTestCase Suite history and preserves its exact association, all rows, guards and epochs', async () => {
    const item = await fixture(false, true)
    const selection = await client().testRunTestCase.findUniqueOrThrow({ where: { id: item.ids.selection } })
    expect(selection.testSuiteId).toBe(item.ids.suite)
    const before = await allRows(client())
    const transactions = transactionCount
    await expect(owner.deleteModules([item.ids.root, item.ids.child], item.targetProjectId)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Modules with historical test run suite associations cannot be deleted.',
    })
    expect(transactionCount).toBe(transactions + 1)
    expect(await client().testRunTestCase.findUniqueOrThrow({ where: { id: item.ids.selection } })).toEqual(selection)
    expect(await allRows(client())).toEqual(before)
  })
})
