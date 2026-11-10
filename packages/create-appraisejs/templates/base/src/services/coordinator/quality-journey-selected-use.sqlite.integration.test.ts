/** Fresh synthetic SQLite selected-use semantics only. This source is inert
 * until a separately reviewed outer harness supplies a new migrated case, exact
 * source/SDK/native pins and HOST custody proof. No provider/runtime qualification.
 * Discovery publication and competing-writer serialization remain pending. */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  sharedResourceDigest,
  sharedResourceKinds,
  sharedSourceDigest,
} from '@/lib/quality-journey/shared-resource-contract'
import { e2CampaignPolicyDigest } from '@/lib/quality-journey/e2-campaign-policy-contract'
import type { LocatorEnsureInput } from './locator-ensure-service'

const carrier = vi.hoisted(() => ({
  run: undefined as undefined | ((callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>),
}))
// Only the default DB adapter is replaced. Its sole allowed operation delegates
// to the exact real private Prisma transaction; no authority or SQL result mock.
vi.mock('@/config/db-config', () => ({
  default: new Proxy(Object.create(null) as object, {
    get(_target, key) {
      if (key !== '$transaction') throw new Error(`Selected-use fixture root operation refused: ${String(key)}`)
      return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        if (!carrier.run) throw new Error('Selected-use fixture carrier is not armed')
        return carrier.run(callback)
      }
    },
    set() {
      throw new Error('Selected-use fixture root mutation refused')
    },
  }),
}))

const source = fileURLToPath(import.meta.url)
const caseBase = '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m06-work/e2-prisma-offline'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sha = /^[0-9a-f]{64}$/
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const sample = new Date('2026-10-26T00:00:00.000Z')
const migrationIds = [
  '20261024010000_add_journey_e2_effect_admission',
  '20261024020000_add_journey_shared_resource_claims',
  '20261024030000_add_journey_e2_operation_preparation',
  '20261024040000_add_automation_materialization_source_proof',
]
let db: PrismaClient | undefined
let ensureOwner: typeof import('./locator-ensure-service')
let guardService: typeof import('./quality-journey-shared-resource-guard-service')
let descriptorService: typeof import('./quality-journey-shared-resource-descriptor-service')
let useService: typeof import('./quality-journey-shared-resource-use-service')
let transactionCount = 0
type Tx = Prisma.TransactionClient
type WriteEvent = { model: string; method: string; argument: unknown; result: unknown }
let afterWrite: undefined | ((tx: Tx, event: WriteEvent) => Promise<void>)
const writes: WriteEvent[] = []
const transactions: Promise<unknown>[] = []
const fixtureFault = new Error('SYNTHETIC_SELECTED_USE_POST_ACTIVATION_FAULT')

function refuse(reason: string): never {
  throw new Error(`Selected-use SQLite case refused: ${reason}`)
}
function client(): PrismaClient {
  return db ?? refuse('fresh client unavailable')
}
async function hashFile(file: string) {
  const info = await fs.lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || (await fs.realpath(file)) !== file) refuse('nonregular pinned file')
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256'),
      stream = createReadStream(file)
    stream.on('data', bytes => hash.update(bytes))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function openFreshCase() {
  const root = process.env.M06_E2_SELECTED_USE_CASE_ROOT
  const pin = process.env.M06_E2_SELECTED_USE_MANIFEST_SHA256
  if (
    !root ||
    !path.isAbsolute(root) ||
    path.normalize(root) !== root ||
    path.dirname(root) !== caseBase ||
    !uuid.test(path.basename(root)) ||
    !pin ||
    !sha.test(pin) ||
    (await fs.realpath(root)) !== root
  )
    refuse('new case identity')
  if (
    source !==
    path.join(root, 'mirror/src/services/coordinator/quality-journey-selected-use.sqlite.integration.test.ts')
  )
    refuse('selector outside new mirror')
  const manifestFile = path.join(root, 'selected-use-sqlite-test-manifest.json')
  if ((await hashFile(manifestFile)) !== pin) refuse('manifest digest')
  const bytes = await fs.readFile(manifestFile, 'utf8')
  const value: unknown = JSON.parse(bytes)
  if (!value || typeof value !== 'object' || Array.isArray(value) || bytes !== `${JSON.stringify(value)}\n`)
    refuse('manifest encoding')
  const m = value as Record<string, unknown>
  const fields = [
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
  const sdkDirectory = path.join(root, 'mirror/node_modules/.prisma/client')
  if (
    Object.keys(m).length !== fields.length ||
    Object.keys(m).some(key => !fields.includes(key)) ||
    m.version !== 'M06_E2_SELECTED_USE_SQLITE_TEST_CASE_V1' ||
    m.stage !== 'SELECTED_USE_SQLITE_TEST' ||
    m.caseRoot !== root ||
    m.caseId !== path.basename(root) ||
    m.databasePath !== path.join(root, 'fixture.sqlite') ||
    m.generatedClientEntry !== path.join(sdkDirectory, 'index.js') ||
    typeof m.generatedEnginePath !== 'string' ||
    path.dirname(m.generatedEnginePath) !== sdkDirectory ||
    !/^libquery_engine-[a-zA-Z0-9_-]+\.(?:dylib|so)\.node$/.test(path.basename(m.generatedEnginePath)) ||
    !Array.isArray(m.migrationIds) ||
    m.migrationIds.join(',') !== migrationIds.join(',') ||
    [
      m.databaseSha256,
      m.generatedClientSha256,
      m.generatedRuntimeSha256,
      m.testSourceSha256,
      m.sourceReviewSha256,
      m.operationalReviewSha256,
      m.hostProofSha256,
      m.generatedEngineSha256,
    ].some(pin => typeof pin !== 'string' || !sha.test(pin))
  )
    refuse('manifest scope or fields')
  const databasePath = m.databasePath as string,
    entry = m.generatedClientEntry as string
  const engine = m.generatedEnginePath as string
  for (const directory of [path.join(root, 'home'), path.join(root, 'tmp')]) {
    const info = await fs.lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || (await fs.realpath(directory)) !== directory)
      refuse('case home/temp identity')
  }
  if (
    process.env.DATABASE_URL !== `file:${databasePath}` ||
    process.env.HOME !== path.join(root, 'home') ||
    process.env.TMPDIR !== path.join(root, 'tmp') ||
    process.env.PRISMA_QUERY_ENGINE_LIBRARY !== engine ||
    process.env.PRISMA_QUERY_ENGINE_BINARY !== undefined ||
    (process.env.PRISMA_CLIENT_ENGINE_TYPE !== undefined && process.env.PRISMA_CLIENT_ENGINE_TYPE !== 'library') ||
    (await hashFile(databasePath)) !== m.databaseSha256 ||
    (await hashFile(entry)) !== m.generatedClientSha256 ||
    (await hashFile(path.join(sdkDirectory, 'runtime/library.js'))) !== m.generatedRuntimeSha256 ||
    (await hashFile(engine)) !== m.generatedEngineSha256 ||
    (await hashFile(source)) !== m.testSourceSha256
  )
    refuse('reviewed baseline image or private SDK/native custody')

  // No SDK or service runtime import precedes the complete custody checks above.
  type Sdk = {
    PrismaClient?: new (options: { datasources: { db: { url: string } } }) => PrismaClient
    Prisma?: { prismaVersion?: { client?: string }; PrismaClientKnownRequestError?: unknown }
  }
  const imported = (await import(pathToFileURL(entry).href)) as unknown as Sdk & { default?: Sdk }
  const sdk = imported.default ?? imported
  if (
    typeof sdk.PrismaClient !== 'function' ||
    sdk.Prisma?.prismaVersion?.client !== '6.19.3' ||
    typeof sdk.Prisma.PrismaClientKnownRequestError !== 'function'
  )
    refuse('supported public SDK exports')
  // Outer Vitest config must alias this bare specifier to exactly the same
  // private entry. No unit mock, installed SDK fallback or forbidden stub.
  const aliasImport = (await import('@prisma/client')) as unknown as Sdk & { default?: Sdk }
  const alias = aliasImport.default ?? aliasImport
  if (
    alias.PrismaClient !== sdk.PrismaClient ||
    alias.Prisma?.PrismaClientKnownRequestError !== sdk.Prisma.PrismaClientKnownRequestError
  )
    refuse('Prisma runtime alias identity')
  db = new sdk.PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  const fk = await db.$queryRawUnsafe<Array<{ foreign_keys: number | bigint }>>('PRAGMA foreign_keys')
  if (fk.length !== 1 || Number(fk[0]?.foreign_keys) !== 1) refuse('foreign keys disabled')
  const migrated = await db.$queryRawUnsafe<
    Array<{ migration_name: string; finished_at: unknown; rolled_back_at: unknown }>
  >('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"')
  if (
    migrated.some(row => row.finished_at === null || row.rolled_back_at !== null) ||
    migrationIds.some(id => migrated.filter(row => row.migration_name === id).length !== 1)
  )
    refuse('migration baseline')
  const projects = await db.targetProject.findMany({ select: { id: true }, take: 2 })
  const counts = await Promise.all([
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
    db.testCaseStep.count(),
    db.testCaseStepParameter.count(),
    db.testRun.count(),
    db.testRunTestCase.count(),
    db.tag.count(),
    db.collaborationBinding.count(),
    db.collaborationPolicyGrant.count(),
    db.projectResourceOwnership.count(),
    db.projectResourceImport.count(),
  ])
  const baselineCoverage = await db.qualityJourneySharedResourceCoverage.findMany({ orderBy: { kind: 'asc' } })
  if (
    projects.length !== 1 ||
    projects[0]?.id !== '00000000-0000-4000-8000-000000000001' ||
    counts.some(count => count !== 0) ||
    baselineCoverage.length !== sharedResourceKinds.length ||
    baselineCoverage.some(
      (row, index) =>
        row.targetProjectId !== projects[0]?.id ||
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
    refuse('migration-only legacy target and zero lineage/resources')

  guardService = await import('./quality-journey-shared-resource-guard-service')
  descriptorService = await import('./quality-journey-shared-resource-descriptor-service')
  useService = await import('./quality-journey-shared-resource-use-service')
  carrier.run = callback => {
    transactionCount++
    const operation = client().$transaction(async tx => {
      const monitored = {
        qualityJourney: watch('journey', tx.qualityJourney, tx),
        qualityJourneyE2Retirement: watch('retirement', tx.qualityJourneyE2Retirement, tx),
        qualityJourneySharedResourceCoverage: watch('coverage', tx.qualityJourneySharedResourceCoverage, tx),
        qualityJourneySharedResourceGuard: watch('guard', tx.qualityJourneySharedResourceGuard, tx),
        qualityJourneyLocatorEnsureReceipt: watch('receipt', tx.qualityJourneyLocatorEnsureReceipt, tx),
        qualityJourneySharedResourceUse: watch('use', tx.qualityJourneySharedResourceUse, tx),
        qualityJourneySharedResourceClaim: watch('claim', tx.qualityJourneySharedResourceClaim, tx),
        module: watch('module', tx.module, tx),
        locatorGroup: watch('group', tx.locatorGroup, tx),
        locator: watch('locator', tx.locator, tx),
      }
      return callback(
        new Proxy(tx, {
          get(target, property, receiver) {
            if (typeof property === 'string' && Object.hasOwn(monitored, property))
              return monitored[property as keyof typeof monitored]
            return Reflect.get(target, property, receiver)
          },
        }),
      )
    })
    transactions.push(operation)
    return operation
  }
  ensureOwner = await import('./locator-ensure-service')
}

// Run the original SQL method first, retain its actual result, then inspect or
// inject a failure in that same owning transaction. No result replacement.
function watch<T extends object>(model: string, delegate: T, tx: Tx): T {
  return new Proxy(delegate, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (
        typeof property !== 'string' ||
        !['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(property) ||
        typeof value !== 'function'
      )
        return value
      return async (...args: unknown[]) => {
        const result: unknown = await Reflect.apply(value, target, args)
        const event: WriteEvent = { model, method: property, argument: args[0], result }
        writes.push(event)
        if (afterWrite) await afterWrite(tx, event)
        return result
      }
    },
  })
}
function dataOf(event: WriteEvent): Record<string, unknown> {
  if (
    !event.argument ||
    typeof event.argument !== 'object' ||
    !('data' in event.argument) ||
    !event.argument.data ||
    typeof event.argument.data !== 'object'
  )
    return {}
  return event.argument.data as Record<string, unknown>
}
const admission = (event: WriteEvent) => event.model === 'journey' && Object.hasOwn(dataOf(event), 'e2AdmissionVersion')
const authorizationFence = (event: WriteEvent) =>
  event.model === 'journey' && Object.hasOwn(dataOf(event), 'ownershipVersion') && !admission(event)
const rootWrite = (event: WriteEvent) => ['module', 'group', 'locator'].includes(event.model)
const activateUse = (event: WriteEvent) =>
  event.model === 'use' && event.method === 'updateMany' && dataOf(event).state === 'ACTIVE'

async function newFixture(reuseParents = false, unknownCaseDomain = false) {
  const targetProjectId = randomUUID(),
    journeyId = randomUUID(),
    sessionId = randomUUID()
  const principalId = `synthetic-selected-use:${randomUUID()}`,
    cycleId = randomUUID()
  const fingerprint = digest(`synthetic-selected-target:${targetProjectId}`)
  const sourceTupleDigest = digest(`synthetic-inert-source:${sessionId}`)
  const ids = {
    ancestor: randomUUID(),
    module: randomUUID(),
    group: randomUUID(),
    policy: randomUUID(),
    retirement: randomUUID(),
  }
  const request: LocatorEnsureInput = {
    journeyId,
    coordinatorSessionId: sessionId,
    coordinatorGeneration: 1,
    coordinatorPrincipalId: principalId,
    allowCreate: true,
    group: reuseParents
      ? { mode: 'existing', id: ids.group }
      : {
          mode: 'ensure',
          name: 'Synthetic selected-use fresh Group',
          route: '/synthetic-selected-use',
          module: { mode: 'ensure', name: 'Synthetic selected-use fresh Module' },
        },
    locator: { name: 'Synthetic selected-use submit', selector: '[data-synthetic-selected-use="submit"]' },
  }
  await client().$transaction(async tx => {
    await guardService.initializeNewTargetSharedResourceCoverage(tx, targetProjectId)
    await tx.targetProject.create({
      data: {
        id: targetProjectId,
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: `synthetic-selected-use:${targetProjectId}`,
        displayName: 'Synthetic selected-use fixture',
        canonicalPath: path.join(process.env.M06_E2_SELECTED_USE_CASE_ROOT!, 'synthetic-target', targetProjectId),
        fingerprint,
      },
    })
    if (reuseParents) {
      await guardService.prepareSharedResourceMutationInTransaction(tx, targetProjectId, {
        existing: [],
        deleted: [],
        newRoots: [
          { kind: 'MODULE', resourceId: ids.ancestor },
          { kind: 'MODULE', resourceId: ids.module },
          { kind: 'LOCATOR_GROUP', resourceId: ids.group },
        ],
      })
      await tx.module.create({
        data: { id: ids.ancestor, targetProjectId, name: 'Synthetic archived structural ancestor', archivedAt: sample },
      })
      await tx.module.create({
        data: { id: ids.module, targetProjectId, parentId: ids.ancestor, name: 'Synthetic reused child Module' },
      })
      await tx.locatorGroup.create({
        data: {
          id: ids.group,
          targetProjectId,
          moduleId: ids.module,
          name: 'Synthetic reused Group',
          route: '/synthetic-existing-group',
        },
      })
    }
    // Fresh-fixture census metadata before any Journey exists; not real issuer,
    // enrollment or campaign evidence. The negative case retains initial UNKNOWN.
    for (const kind of sharedResourceKinds) {
      if (unknownCaseDomain && kind === 'TEST_CASE') continue
      const census = !reuseParents
        ? []
        : kind === 'MODULE'
          ? [ids.ancestor, ids.module].sort()
          : kind === 'LOCATOR_GROUP'
            ? [ids.group]
            : []
      await tx.qualityJourneySharedResourceCoverage.update({
        where: {
          targetProjectId_kind_protocolVersion: { targetProjectId, kind, protocolVersion: 1 },
        },
        data: {
          state: 'COMPLETE',
          epoch: { increment: 1 },
          proofKind: 'JOURNEY_FREE_V1',
          completedAt: sample,
          writerClosureDigest: digest(`SYNTHETIC_SELECTED:writer:${kind}`),
          readerClosureDigest: digest(`SYNTHETIC_SELECTED:reader:${kind}`),
          sourceUniverseDigest: digest(JSON.stringify({ syntheticOnly: true, targetProjectId, kind, census })),
          reconciliationDigest: digest(`SYNTHETIC_SELECTED:empty-Journey:${targetProjectId}:${kind}`),
        },
      })
    }
    await tx.qualityJourney.create({
      data: {
        id: journeyId,
        targetProjectId,
        rootIdempotencyKey: randomUUID(),
        rootRequestHash: digest(`synthetic-root:${journeyId}`),
        hostingMode: 'APP_SERVER_LOCAL_V1',
        hostingProvenance: 'SYNTHETIC_SELECTED_USE_ONLY',
        activeCycleId: cycleId,
        stateHash: digest(`synthetic-state:${journeyId}`),
      },
    })
    await tx.qualityJourneyCoordinatorSession.create({
      data: {
        id: sessionId,
        journeyId,
        targetProjectId,
        ownerPrincipalId: principalId,
        hostKind: 'APP_SERVER_LOCAL_V1',
        status: 'ACTIVE',
        generation: 1,
        registrationKey: randomUUID(),
        registrationRequestHash: digest(`synthetic-register:${sessionId}`),
        e2EnrollmentKind: 'E2_V1',
        e2EnrollmentDigest: sourceTupleDigest,
        e2EnrolledAt: sample,
        activatedAt: sample,
        provenance: 'SYNTHETIC_SELECTED_USE_ONLY',
      },
    })
    await tx.qualityJourney.update({ where: { id: journeyId }, data: { currentCoordinatorSessionId: sessionId } })
    // Zero effect quotas; synthetic retained rows satisfy canonical SQL reads.
    // No production enrollment/allocation API, grant or provider is invoked.
    const policy = {
      id: ids.policy,
      allocationDigest: digest(`synthetic-inert-policy:${ids.policy}`),
      journeyId,
      targetProjectId,
      sourceTupleDigest,
      policyVersion: 'M06_E2_CAMPAIGN_POLICY_V1',
      policyDigest: '',
      nativeStartWindowMs: 1,
      dnsWindowMs: 1,
      tcpWindowMs: 1,
      tlsWindowMs: 1,
      upgradeWindowMs: 1,
      providerRequestWindowMs: 1,
      mcpCallWindowMs: 1,
      actorMaxOperations: 0,
      actorMaxBytes: 0,
      actorMaxFrames: 0,
      actorMaxSetup: 0,
      actorMaxProviderRequests: 0,
      actorMaxMcpCalls: 0,
      journeyMaxNativeStarts: 0,
      journeyMaxTurnStarts: 0,
      maxNativeStarts: 0,
      maxProviderRequests: 0,
      maxOperations: 0,
      maxBytes: 0,
      maxFrames: 0,
      maxSetup: 0,
      maxMcpCalls: 0,
      nativeStartsReserved: 0,
      providerRequestsReserved: 0,
      operationsReserved: 0,
      bytesReserved: 0,
      framesReserved: 0,
      setupReserved: 0,
      mcpCallsReserved: 0,
      version: 0,
      createdAt: sample,
    }
    policy.policyDigest = e2CampaignPolicyDigest(policy)
    await tx.qualityJourneyE2CampaignPolicy.create({ data: policy })
    await tx.qualityJourneyE2Retirement.create({
      data: {
        id: ids.retirement,
        journeyId,
        targetProjectId,
        coordinatorSessionId: sessionId,
        generation: 1,
        campaignPolicyId: ids.policy,
      },
    })
  })
  return { targetProjectId, journeyId, sessionId, ids, request, target: { id: targetProjectId, fingerprint } }
}
type Fixture = Awaited<ReturnType<typeof newFixture>>
const ensure = (item: Fixture) => ensureOwner.ensureTargetLocator(item.request, item.target)

async function state(tx: Tx, item: Fixture) {
  const where = { targetProjectId: item.targetProjectId }
  return {
    journey: await tx.qualityJourney.findUniqueOrThrow({ where: { id: item.journeyId } }),
    modules: await tx.module.findMany({ where, orderBy: { id: 'asc' } }),
    groups: await tx.locatorGroup.findMany({ where, orderBy: { id: 'asc' } }),
    locators: await tx.locator.findMany({ where, orderBy: { id: 'asc' } }),
    coverage: await tx.qualityJourneySharedResourceCoverage.findMany({ where, orderBy: { kind: 'asc' } }),
    guards: await tx.qualityJourneySharedResourceGuard.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { resourceId: 'asc' }],
    }),
    receipts: await tx.qualityJourneyLocatorEnsureReceipt.findMany({ where, orderBy: { id: 'asc' } }),
    uses: await tx.qualityJourneySharedResourceUse.findMany({ where, orderBy: { id: 'asc' } }),
    claims: await tx.qualityJourneySharedResourceClaim.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { resourceId: 'asc' }],
    }),
    retirement: await tx.qualityJourneyE2Retirement.findUniqueOrThrow({ where: { id: item.ids.retirement } }),
    policy: await tx.qualityJourneyE2CampaignPolicy.findUniqueOrThrow({ where: { id: item.ids.policy } }),
  }
}
async function assertPublished(item: Fixture, result: Awaited<ReturnType<typeof ensure>>) {
  const persisted = await state(client(), item)
  expect(persisted.receipts).toHaveLength(1)
  expect(persisted.uses).toHaveLength(1)
  const receipt = persisted.receipts[0]!,
    use = persisted.uses[0]!
  const descriptor = await descriptorService.resolveSharedResourceDescriptors(client(), item.targetProjectId, [
    { kind: 'MODULE', resourceId: result.resources.module.id },
    { kind: 'LOCATOR_GROUP', resourceId: result.resources.locatorGroup.id },
    { kind: 'LOCATOR', resourceId: result.resources.locator.id },
  ])
  const expectedKeys = [
    ...(item.request.group.mode === 'existing' ? [{ kind: 'MODULE', resourceId: item.ids.ancestor }] : []),
    { kind: 'MODULE', resourceId: result.resources.module.id },
    { kind: 'LOCATOR_GROUP', resourceId: result.resources.locatorGroup.id },
    { kind: 'LOCATOR', resourceId: result.resources.locator.id },
  ].sort((a, b) =>
    a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0,
  )
  expect(descriptor.keys).toEqual(expectedKeys)
  const requestHash = sharedResourceDigest('M06_LOCATOR_ENSURE_REQUEST_V1', {
    journeyId: item.journeyId,
    targetProjectId: item.targetProjectId,
    allowCreate: true,
    group: item.request.group,
    locator: item.request.locator,
  })
  const resultHash = sharedResourceDigest('M06_LOCATOR_ENSURE_RESULT_V1', {
    moduleId: result.resources.module.id,
    locatorGroupId: result.resources.locatorGroup.id,
    locatorId: result.resources.locator.id,
    dependencyDigest: descriptor.dependencyDigest,
  })
  expect(receipt).toMatchObject({
    journeyId: item.journeyId,
    targetProjectId: item.targetProjectId,
    coordinatorSessionId: item.sessionId,
    generation: 1,
    requestHash,
    resultHash,
    moduleId: result.resources.module.id,
    locatorGroupId: result.resources.locatorGroup.id,
    locatorId: result.resources.locator.id,
    createdAt: expect.any(Date),
  })
  expect(receipt.id).toBe(
    useService.sharedLocatorEnsureReceiptId({
      journeyId: item.journeyId,
      targetProjectId: item.targetProjectId,
      coordinatorSessionId: item.sessionId,
      generation: 1,
      requestHash,
    }),
  )
  const sourceDigest = sharedSourceDigest({
    sourceKind: 'ENSURE',
    sourceOwnerId: receipt.id,
    sourceHash: sharedResourceDigest('M06_LOCATOR_ENSURE_SOURCE_V1', {
      id: receipt.id,
      journeyId: receipt.journeyId,
      targetProjectId: receipt.targetProjectId,
      coordinatorSessionId: receipt.coordinatorSessionId,
      generation: receipt.generation,
      requestHash: receipt.requestHash,
      resultHash: receipt.resultHash,
      moduleId: receipt.moduleId,
      locatorGroupId: receipt.locatorGroupId,
      locatorId: receipt.locatorId,
      createdAt: receipt.createdAt.toISOString(),
    }),
  })
  expect(useService.sharedLocatorEnsureSourceDigest(receipt)).toBe(sourceDigest)
  expect(use).toMatchObject({
    journeyId: item.journeyId,
    targetProjectId: item.targetProjectId,
    coordinatorSessionId: item.sessionId,
    generation: 1,
    sourceKind: 'ENSURE',
    sourceOwnerId: receipt.id,
    sourceDigest,
    dependencyDigest: descriptor.dependencyDigest,
    state: 'ACTIVE',
    version: 1,
    claimSetCount: expectedKeys.length,
    releasedAt: null,
    releaseEvidenceDigest: null,
    releaseReason: null,
  })
  const plan = useService.buildSharedResourceClaimPlan(
    {
      journeyId: item.journeyId,
      targetProjectId: item.targetProjectId,
      coordinatorSessionId: item.sessionId,
      generation: 1,
      sourceKind: 'ENSURE',
      sourceOwnerId: receipt.id,
      sourceDigest,
    },
    descriptor,
  )
  useService.assertExactActiveSharedResourceUse(plan, use, persisted.claims)
  expect(use.id).toBe(plan.id)
  expect(use.claimSetDigest).toBe(plan.claimSetDigest)
  expect(persisted.claims.map(({ kind, resourceId }) => ({ kind, resourceId }))).toEqual(expectedKeys)
  for (const claim of persisted.claims) {
    const guard = persisted.guards.find(row => row.kind === claim.kind && row.resourceId === claim.resourceId)
    expect(guard).toMatchObject({
      epoch: claim.claimEpoch,
      coverageState: 'COMPLETE_V1',
      resourceState: 'LIVE',
      deletedAt: null,
    })
    expect(guard!.coverageDigest).toMatch(sha)
    expect(claim).toMatchObject({
      state: 'ACTIVE',
      releaseEpoch: null,
      releasedAt: null,
      releaseEvidenceDigest: null,
      releaseReason: null,
    })
  }
  expect(persisted.coverage).toHaveLength(sharedResourceKinds.length)
  expect(persisted.coverage.every(row => row.state === 'COMPLETE')).toBe(true)
  expect(persisted.retirement).toMatchObject({ state: 'ACTIVE', requestId: null, requestedAt: null, version: 0 })
  return persisted
}
function assertOneAdmissionBeforeEffects(events: WriteEvent[]) {
  expect(events.filter(admission)).toHaveLength(1)
  expect(events.findIndex(admission)).toBeGreaterThanOrEqual(0)
  for (const [index, event] of events.entries()) {
    if (!authorizationFence(event) && !admission(event)) expect(index).toBeGreaterThan(events.findIndex(admission))
  }
  expect(events.filter(event => event.model === 'retirement')).toEqual([])
  expect(events.filter(event => event.model === 'use' && event.method === 'create')).toHaveLength(1)
  expect(events.filter(activateUse)).toHaveLength(1)
}

beforeAll(openFreshCase)
afterAll(async () => {
  carrier.run = undefined
  afterWrite = undefined
  await Promise.allSettled(transactions)
  if (db) await db.$disconnect()
  // Keep all synthetic rows and failed transaction evidence; no fixture reset.
})

describe.sequential('Selected-use synthetic fresh SQLite ENSURE integration', () => {
  it('commits fresh owning ENSURE with one ordinary admission complete provenance and exact replay without resource writes', async () => {
    const item = await newFixture(),
      before = await state(client(), item),
      count = transactionCount
    writes.length = 0
    const result = await ensure(item),
      events = [...writes]
    expect(transactionCount - count).toBe(1)
    expect(result.outcome).toBe('created')
    assertOneAdmissionBeforeEffects(events)
    expect(events.filter(rootWrite).map(event => event.model)).toEqual(['module', 'group', 'locator'])
    const firstRoot = events.findIndex(rootWrite)
    expect(
      events.slice(0, firstRoot).filter(event => event.model === 'guard' && event.method === 'create'),
    ).toHaveLength(3)
    const committed = await assertPublished(item, result)
    expect(committed.journey.e2AdmissionVersion - before.journey.e2AdmissionVersion).toBe(1)
    expect(committed.policy).toEqual(before.policy)
    expect(committed.retirement).toEqual(before.retirement)
    const replayCount = transactionCount
    writes.length = 0
    const replay = await ensure(item),
      replayEvents = [...writes],
      after = await state(client(), item)
    expect(transactionCount - replayCount).toBe(1)
    expect(replay.outcome).toBe('reused')
    expect([replay.resources.module.id, replay.resources.locatorGroup.id, replay.resources.locator.id]).toEqual([
      result.resources.module.id,
      result.resources.locatorGroup.id,
      result.resources.locator.id,
    ])
    expect(replayEvents.filter(event => !authorizationFence(event))).toEqual([])
    expect(after.journey.e2AdmissionVersion).toBe(committed.journey.e2AdmissionVersion)
    // M03 authentication owns its separate ownershipVersion CAS. Replay has zero
    // ordinary/resource/guard/receipt/Use/Claim writes, not total SQL read-only.
    expect(after.journey.ownershipVersion).toBe(committed.journey.ownershipVersion + 1)
    expect(after).toEqual({
      ...committed,
      journey: { ...committed.journey, ownershipVersion: committed.journey.ownershipVersion + 1 },
    })
  })

  it('reuses archived structural ancestry while creating only the missing Locator and retaining every exact dependency Claim', async () => {
    const item = await newFixture(true),
      before = await state(client(), item),
      count = transactionCount
    writes.length = 0
    const result = await ensure(item),
      events = [...writes]
    expect(transactionCount - count).toBe(1)
    expect(result.resources.module).toEqual({ id: item.ids.module, outcome: 'reused' })
    expect(result.resources.locatorGroup).toEqual({ id: item.ids.group, outcome: 'reused' })
    expect(result.resources.locator.outcome).toBe('created')
    assertOneAdmissionBeforeEffects(events)
    expect(events.filter(rootWrite).map(event => event.model)).toEqual(['locator'])
    expect(events.filter(event => event.model === 'guard' && event.method === 'create')).toHaveLength(1)
    const after = await assertPublished(item, result)
    expect(after.modules).toEqual(before.modules)
    expect(after.groups).toEqual(before.groups)
    expect(after.modules.find(row => row.id === item.ids.ancestor)?.archivedAt).toEqual(sample)
    expect(after.journey.e2AdmissionVersion - before.journey.e2AdmissionVersion).toBe(1)
    // Parent guards contend for Use; their business resource rows do not mutate.
    for (const prior of before.guards)
      expect(after.guards.find(row => row.kind === prior.kind && row.resourceId === prior.resourceId)).toEqual({
        ...prior,
        epoch: prior.epoch + 1,
      })
  })

  it('rolls back actual roots coverage guards receipt complete Claims and ACTIVE Use after a post-write injected failure', async () => {
    const item = await newFixture(),
      before = await state(client(), item),
      count = transactionCount
    let observedPublishedShapeInsideOwner = false
    writes.length = 0
    afterWrite = async (tx, event) => {
      if (!activateUse(event)) return
      expect(event.result).toEqual({ count: 1 })
      const staged = await state(tx, item)
      expect(staged.modules).toHaveLength(1)
      expect(staged.groups).toHaveLength(1)
      expect(staged.locators).toHaveLength(1)
      expect(staged.guards).toHaveLength(3)
      expect(staged.receipts).toHaveLength(1)
      expect(staged.claims).toHaveLength(3)
      expect(staged.uses).toHaveLength(1)
      expect(staged.uses[0]).toMatchObject({ state: 'ACTIVE', version: 1 })
      expect(staged.journey.e2AdmissionVersion).toBe(before.journey.e2AdmissionVersion + 1)
      for (const prior of before.coverage)
        expect(staged.coverage.find(row => row.kind === prior.kind)!.epoch).toBeGreaterThan(prior.epoch)
      observedPublishedShapeInsideOwner = true
      throw fixtureFault
    }
    try {
      await expect(ensure(item)).rejects.toBe(fixtureFault)
    } finally {
      afterWrite = undefined
    }
    expect(observedPublishedShapeInsideOwner).toBe(true)
    expect(transactionCount - count).toBe(1)
    assertOneAdmissionBeforeEffects(writes)
    expect(await state(client(), item)).toEqual(before)
  })

  it('refuses UNKNOWN Use domain coverage after real root and receipt writes and rolls the entire owner back without retry', async () => {
    const item = await newFixture(false, true),
      before = await state(client(), item),
      count = transactionCount
    expect(before.coverage.find(row => row.kind === 'TEST_CASE')!.state).toBe('UNKNOWN')
    let sawReceiptAfterRealRoots = false
    writes.length = 0
    afterWrite = async (tx, event) => {
      if (event.model !== 'receipt' || event.method !== 'create') return
      const staged = await state(tx, item)
      expect(staged.modules).toHaveLength(1)
      expect(staged.groups).toHaveLength(1)
      expect(staged.locators).toHaveLength(1)
      expect(staged.guards).toHaveLength(3)
      expect(staged.receipts).toHaveLength(1)
      expect(staged.uses).toEqual([])
      sawReceiptAfterRealRoots = true
    }
    try {
      await expect(ensure(item)).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { protocol: 'M06_SHARED_USE_V1', reason: 'DOMAIN_COVERAGE_INCOMPLETE_OR_CORRUPT' },
      })
    } finally {
      afterWrite = undefined
    }
    expect(sawReceiptAfterRealRoots).toBe(true)
    expect(transactionCount - count).toBe(1)
    expect(writes.filter(admission)).toHaveLength(1)
    expect(writes.filter(rootWrite).map(event => event.model)).toEqual(['module', 'group', 'locator'])
    expect(writes.filter(event => event.model === 'receipt' && event.method === 'create')).toHaveLength(1)
    expect(writes.filter(activateUse)).toEqual([])
    expect(await state(client(), item)).toEqual(before)
  })
})
