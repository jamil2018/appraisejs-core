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
import type { CollaborationRecord } from '@/lib/repository-collaboration/contracts'
import type { StepDefinition } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'
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

// Whole unused external adapters only. Pure contracts/graph/snapshot and all
// public owners, permission readers, collectors/materializers/guards stay real.
vi.mock('@/lib/repository-collaboration/filesystem', () => ({
  observeCollaborationSnapshot: () => { throw new Error('Unused filesystem adapter invoked') },
  installCollaborationSnapshot: () => { throw new Error('Unused filesystem adapter invoked') },
  recoverCollaborationSnapshot: () => { throw new Error('Unused filesystem adapter invoked') },
}))
vi.mock('@/lib/repository-collaboration/reader', () => ({
  readCollaborationSnapshot: () => { throw new Error('Unused snapshot reader invoked') },
}))
vi.mock('@/lib/repository-collaboration/git-repository', () => ({
  managedReceiveSnapshotWorktreePath: () => { throw new Error('Unused Git adapter invoked') },
  inspectRepository: () => { throw new Error('Unused Git adapter invoked') },
  fetchTrackedRef: () => { throw new Error('Unused Git adapter invoked') },
  fetchOperationSourceRef: () => { throw new Error('Unused Git adapter invoked') },
  observeOperationSourceRef: () => { throw new Error('Unused Git adapter invoked') },
  fetchOperationRecoveryRef: () => { throw new Error('Unused Git adapter invoked') },
  readCollaborationSnapshotAtCommit: () => { throw new Error('Unused Git adapter invoked') },
  verifyExactCollaborationCommit: () => { throw new Error('Unused Git adapter invoked') },
  isCommitAncestor: () => { throw new Error('Unused Git adapter invoked') },
  classifyPinnedReceive: () => { throw new Error('Unused Git adapter invoked') },
  fastForwardPinned: () => { throw new Error('Unused Git adapter invoked') },
  commitExactCollaborationPaths: () => { throw new Error('Unused Git adapter invoked') },
  restoreCollaborationIndex: () => { throw new Error('Unused Git adapter invoked') },
  readRemoteRef: () => { throw new Error('Unused Git adapter invoked') },
  pushPinnedCommit: () => { throw new Error('Unused Git adapter invoked') },
  collaborationGitLockKey: () => { throw new Error('Unused Git adapter invoked') },
}))

vi.mock('@/lib/repository-collaboration/git-runner', () => ({
  runGit: () => { throw new Error('Unused Git runner invoked') },
  runGitAllowFailure: () => { throw new Error('Unused Git runner invoked') },
  GitCommandError: class extends Error {
    constructor() { super('Unused Git error adapter invoked'); throw this }
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
let collaborationOwner: typeof import('@/services/repository-collaboration/materialization-service')
let targetOwner: typeof import('@/services/target-project/target-project-service')
let stepContracts: typeof import('../../../packages/cucumber-runtime/src/step-definitions/contracts.ts')
let guardService: typeof import('@/services/coordinator/quality-journey-shared-resource-guard-service')
let transactionCount = 0
type WriteEvent = { model: string; method: string; argument: unknown; result?: unknown }
let beforeWrite: undefined | ((tx: Prisma.TransactionClient, event: WriteEvent) => Promise<void>)
let afterWrite: undefined | ((tx: Prisma.TransactionClient, event: WriteEvent) => Promise<void>)
const writes: WriteEvent[] = []
const transactions: Promise<unknown>[] = []
const fixtureFault = new Error('SYNTHETIC_REMAINING_OWNER_POST_WRITE_FAULT')

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
  const root = process.env.M06_E2_REMAINING_AUTHORING_OWNER_CASE_ROOT
  const pin = process.env.M06_E2_REMAINING_AUTHORING_OWNER_MANIFEST_SHA256
  if (!root || !path.isAbsolute(root) || path.normalize(root) !== root || path.dirname(root) !== caseBase ||
    !uuid.test(path.basename(root)) || !pin || !sha.test(pin) || await fs.realpath(root) !== root)
    refuse('new case identity')
  if (source !== path.join(root, 'mirror/src/services/coordinator/quality-journey-remaining-authoring-owner.sqlite.integration.test.ts'))
    refuse('selector outside new mirror')
  const manifestFile = path.join(root, 'remaining-authoring-owner-sqlite-test-manifest.json')
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
    m.version !== 'M06_E2_REMAINING_AUTHORING_OWNER_SQLITE_TEST_CASE_V1' || m.stage !== 'REMAINING_AUTHORING_OWNER_SQLITE_TEST' ||
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
    db.collaborationBinding.count(), db.collaborationPolicyGrant.count(),
    db.projectResourceOwnership.count(), db.projectResourceImport.count(),
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
      const monitored = {
        qualityJourneySharedResourceCoverage: watch('coverage', tx.qualityJourneySharedResourceCoverage, tx),
        qualityJourneySharedResourceGuard: watch('guard', tx.qualityJourneySharedResourceGuard, tx),
        module: watch('module', tx.module, tx), locatorGroup: watch('locatorGroup', tx.locatorGroup, tx),
        locator: watch('locator', tx.locator, tx), testSuite: watch('testSuite', tx.testSuite, tx),
        testCase: watch('testCase', tx.testCase, tx), templateTestCase: watch('templateTestCase', tx.templateTestCase, tx),
        testCaseStep: watch('testCaseStep', tx.testCaseStep, tx), testCaseStepParameter: watch('testCaseStepParameter', tx.testCaseStepParameter, tx),
        testCaseFlowBlock: watch('testCaseFlowBlock', tx.testCaseFlowBlock, tx), testCaseFlowBlockNode: watch('testCaseFlowBlockNode', tx.testCaseFlowBlockNode, tx),
        templateTestCaseStep: watch('templateTestCaseStep', tx.templateTestCaseStep, tx),
        templateTestCaseStepParameter: watch('templateTestCaseStepParameter', tx.templateTestCaseStepParameter, tx),
        templateTestCaseFlowBlock: watch('templateTestCaseFlowBlock', tx.templateTestCaseFlowBlock, tx),
        templateTestCaseFlowBlockNode: watch('templateTestCaseFlowBlockNode', tx.templateTestCaseFlowBlockNode, tx),
        collaborationEntityMap: watch('collaborationEntityMap', tx.collaborationEntityMap, tx),
        collaborationBaseline: watch('collaborationBaseline', tx.collaborationBaseline, tx), tag: watch('tag', tx.tag, tx),
        projectResourceOwnership: watch('ownership', tx.projectResourceOwnership, tx), projectResourceImport: watch('import', tx.projectResourceImport, tx),
        testCaseMetrics: watch('caseMetrics', tx.testCaseMetrics, tx), testSuiteMetrics: watch('suiteMetrics', tx.testSuiteMetrics, tx),
        dashboardMetrics: watch('dashboardMetrics', tx.dashboardMetrics, tx), conflictResolution: watch('conflict', tx.conflictResolution, tx),
        environment: watch('environment', tx.environment, tx), targetProject: watch('target', tx.targetProject, tx),
      }
      return callback(new Proxy(tx, {
        get(target, property, receiver) {
          if (typeof property === 'string' && Object.hasOwn(monitored, property))
            return monitored[property as keyof typeof monitored]
          return Reflect.get(target, property, receiver)
        },
      }))
    })
    transactions.push(operation)
    return operation
  }
  stepContracts = await import('../../../packages/cucumber-runtime/src/step-definitions/contracts.ts')
  collaborationOwner = await import('@/services/repository-collaboration/materialization-service')
  targetOwner = await import('@/services/target-project/target-project-service')
}

// Instrument actual delegates inside the original private-client transaction.
// Every wrapped method executes the real SQL method; no replacement transaction,
// result, guard, collector or domain helper is supplied by these probes.
function watch<T extends object>(model: string, delegate: T, tx: Prisma.TransactionClient): T {
  return new Proxy(delegate, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof property !== 'string' || !['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(property) || typeof value !== 'function')
        return value
      return async (...args: unknown[]) => {
        const event: WriteEvent = { model, method: property, argument: args[0] }
        if (beforeWrite) await beforeWrite(tx, event)
        const result: unknown = await Reflect.apply(value, target, args)
        const completed = { ...event, result }
        writes.push(completed)
        if (afterWrite) await afterWrite(tx, completed)
        return result
      }
    },
  })
}

type Tx = Prisma.TransactionClient
async function guardRows(tx: Tx, targetProjectId: string) {
  return {
    coverage: await tx.qualityJourneySharedResourceCoverage.findMany({ where: { targetProjectId }, orderBy: { kind: 'asc' } }),
    guards: await tx.qualityJourneySharedResourceGuard.findMany({ where: { targetProjectId },
      orderBy: [{ kind: 'asc' }, { resourceId: 'asc' }] }),
  }
}


async function newFixture(collaboration = false, foreignIncoming = false) {
  const targetProjectId = randomUUID(), foreignTargetId = randomUUID()
  const ids = { parent: randomUUID(), leaf: randomUUID(), group: randomUUID(), locator: randomUUID(),
    suite: randomUUID(), caseA: randomUUID(), caseB: randomUUID(), template: randomUUID(), environment: randomUUID(), tag: randomUUID(),
    stepA: randomUUID(), stepB: randomUUID(), parameterA: randomUUID(), parameterB: randomUUID(),
    block: randomUUID(), node: randomUUID(), templateStep: randomUUID(), templateParameter: randomUUID(),
    templateBlock: randomUUID(), templateNode: randomUUID(), conflict: randomUUID(), foreignModule: randomUUID(),
    binding: randomUUID(), foreignOwnership: randomUUID() }
  const roots: SharedResourceMutationKey[] = [
    { kind: 'MODULE', resourceId: ids.parent }, { kind: 'MODULE', resourceId: ids.leaf },
    { kind: 'LOCATOR_GROUP', resourceId: ids.group }, { kind: 'LOCATOR', resourceId: ids.locator },
    { kind: 'TEST_SUITE', resourceId: ids.suite }, { kind: 'TEST_CASE', resourceId: ids.caseA }, { kind: 'TEST_CASE', resourceId: ids.caseB },
  ]
  const foreignRoots: SharedResourceMutationKey[] = [{ kind: 'MODULE', resourceId: ids.foreignModule }]
  const portableProjectId = `synthetic-${targetProjectId}`
  const definition: StepDefinition | undefined = collaboration ? {
    schemaVersion: '1', identity: { id: `synthetic.remaining.${randomUUID()}`, version: '1', status: 'ready' },
    provenance: { creationMethod: 'human-form', createdBy: 'Synthetic SQLite fixture', reviewedBy: 'Synthetic fixture only', createdAt: '2026-10-26T00:00:00.000Z' },
    intent: { title: 'Synthetic fixture', description: 'Metadata only', capabilities: ['fixture.remaining'], searchTerms: [], examples: ['Synthetic fixture'] },
    inputs: [], outputs: [], human: { signature: 'Given synthetic fixture', keywordCompatibility: ['Given'], parameterBindings: [], groupId: 'fixture' },
    agent: { summary: 'Synthetic fixture', usageGuidance: 'Metadata only', examples: [{ intent: 'Synthetic fixture', inputs: {} }] },
    execution: { kind: 'operation', handlerId: 'fixture.remaining', handlerVersion: '1', runtime: 'node' }, lifecycle: {},
  } : undefined
  await client().$transaction(async tx => {
    for (const id of [targetProjectId, foreignTargetId]) {
      await guardService.initializeNewTargetSharedResourceCoverage(tx, id)
      await tx.targetProject.create({ data: { id, kind: 'LOCAL_WORKSPACE', canonicalIdentity: `synthetic-remaining:${id}`,
        displayName: 'Synthetic remaining owner fixture', canonicalPath: path.join(process.env.M06_E2_REMAINING_AUTHORING_OWNER_CASE_ROOT!, 'synthetic-target', id),
        fingerprint: digest(`synthetic-remaining:${id}`) } })
    }
    await guardService.prepareSharedResourceMutationInTransaction(tx, targetProjectId, { existing: [], newRoots: roots, deleted: [] })
    await guardService.prepareSharedResourceMutationInTransaction(tx, foreignTargetId, { existing: [], newRoots: foreignRoots, deleted: [] })
    await tx.module.create({ data: { id: ids.parent, name: 'Synthetic read-only parent', targetProjectId } })
    await tx.module.create({ data: { id: ids.leaf, name: 'Synthetic changed leaf', parentId: ids.parent, targetProjectId } })
    // Adversarial incoming-FK fixture is created with real SQL, not a fake row.
    await tx.module.create({ data: { id: ids.foreignModule, name: 'Synthetic unrelated Module', targetProjectId: foreignTargetId,
      parentId: foreignIncoming ? ids.parent : null } })
    await tx.locatorGroup.create({ data: { id: ids.group, name: 'Synthetic Group', moduleId: ids.leaf, route: '/synthetic', targetProjectId } })
    await tx.locator.create({ data: { id: ids.locator, name: 'Synthetic Locator', value: '#synthetic', locatorGroupId: ids.group, targetProjectId } })
    for (const [id, archivedAt] of [[ids.caseA, null], [ids.caseB, sample]] as const)
      await tx.testCase.create({ data: { id, title: 'Synthetic existing Case', description: 'Fixture only', targetProjectId,
        archivedAt, collaborationManaged: id === ids.caseB } })
    await tx.tag.create({ data: { id: ids.tag, name: 'Synthetic existing Tag', tagExpression: '@synthetic', type: 'FILTER', targetProjectId,
      testCases: { connect: [{ id: ids.caseA }, { id: ids.caseB }] } } })
    await tx.testSuite.create({ data: { id: ids.suite, name: 'Synthetic Suite', moduleId: ids.leaf, targetProjectId,
      testCases: { connect: { id: ids.caseA } }, tags: { connect: { id: ids.tag } } } })
    for (const edge of [
      { id: ids.stepA, caseId: ids.caseA, parameter: ids.parameterA },
      { id: ids.stepB, caseId: ids.caseB, parameter: ids.parameterB },
    ]) {
      await tx.testCaseStep.create({ data: { id: edge.id, testCaseId: edge.caseId, order: 0, gherkinStep: 'Given',
        flowNodeId: edge.id === ids.stepA ? 'synthetic-old-node' : null, icon: 'MOUSE', label: 'Synthetic old step',
        invocationJson: definition ? JSON.stringify({ step: { id: definition.identity.id, version: definition.identity.version,
          definitionHash: stepContracts.computeStepReferenceHash(definition) }, inputs: {} }) : JSON.stringify({ syntheticOnly: true }) } })
      await tx.testCaseStepParameter.create({ data: { id: edge.parameter, testCaseStepId: edge.id, order: 0,
        name: 'syntheticLocator', value: 'synthetic', type: 'LOCATOR', locatorId: ids.locator } })
    }
    await tx.testCaseFlowBlock.create({ data: { id: ids.block, testCaseId: ids.caseA, order: 0, name: 'Synthetic old block',
      nodes: { create: { id: ids.node, flowNodeId: 'synthetic-old-node' } } } })
    if (!collaboration) {
      await tx.templateTestCase.create({ data: { id: ids.template, name: 'Synthetic Template', targetProjectId } })
      await tx.templateTestCaseStep.create({ data: { id: ids.templateStep, templateTestCaseId: ids.template, order: 0,
        flowNodeId: 'synthetic-template-node', gherkinStep: 'Given', icon: 'MOUSE', label: 'Synthetic template step', invocationJson: JSON.stringify({ syntheticOnly: true }) } })
      await tx.templateTestCaseStepParameter.create({ data: { id: ids.templateParameter, testCaseStepId: ids.templateStep,
        name: 'syntheticDefault', defaultValue: 'synthetic', order: 0, type: 'LOCATOR', locatorId: ids.locator, defaultLocatorId: ids.locator } })
      await tx.templateTestCaseFlowBlock.create({ data: { id: ids.templateBlock, templateTestCaseId: ids.template, name: 'Synthetic template block', order: 0,
        nodes: { create: { id: ids.templateNode, flowNodeId: 'synthetic-template-node' } } } })
    }
    await tx.environment.create({ data: { id: ids.environment, targetProjectId, name: 'synthetic', baseUrl: 'https://synthetic.invalid' } })
    await tx.testCaseMetrics.create({ data: { targetProjectId, testCaseId: ids.caseA } })
    await tx.testSuiteMetrics.create({ data: { targetProjectId, testSuiteId: ids.suite } })
    await tx.dashboardMetrics.create({ data: { targetProjectId } })
    await tx.projectResourceOwnership.create({ data: { id: ids.foreignOwnership, entityType: 'module', entityId: ids.foreignModule,
      targetProjectId: foreignTargetId, scope: 'global_library', origin: 'SYNTHETIC_FIXTURE_ONLY', contentHash: digest(`foreign:${foreignTargetId}`) } })
    if (collaboration) {
      await tx.collaborationBinding.create({ data: { id: ids.binding, targetProjectId, portableProjectId,
        repositoryRoot: path.join(process.env.M06_E2_REMAINING_AUTHORING_OWNER_CASE_ROOT!, 'synthetic-target', targetProjectId), trackedBranch: 'synthetic' } })
      // Fixture-local collaboration permission metadata only, never an issuer,
      // real auth/enrollment/policy API, provider grant or E2 effect permit.
      await tx.collaborationPolicyGrant.create({ data: { bindingId: ids.binding, permission: 'INTEGRATE', enabled: true,
        policyVersion: 1, scopeJson: JSON.stringify({ syntheticOnly: true }), trustedPrincipalId: 'synthetic-fixture-only', provenance: 'synthetic-fixture-only' } })
      for (const [kind, portableId, localEntityId] of [
        ['MODULE', 'module-leaf', ids.leaf], ['TAG', 'tag-existing', ids.tag],
        ['TEST_CASE', 'case-existing', ids.caseA], ['LOCATOR', 'locator-existing', ids.locator],
      ] as const) await tx.collaborationEntityMap.create({ data: { bindingId: ids.binding, kind, portableId, localEntityId } })
      if (!definition) throw new Error('Synthetic Step Definition missing')
      stepContracts.stepDefinitionSchema.parse(definition)
      await tx.stepDefinition.create({ data: { id: definition.identity.id, version: definition.identity.version, status: 'ready',
        title: definition.intent.title, description: definition.intent.description, definitionJson: JSON.stringify(definition),
        definitionHash: stepContracts.computeStepReferenceHash(definition), provenanceJson: JSON.stringify({ syntheticOnly: true }) } })
    } else {
      await tx.conflictResolution.create({ data: { id: ids.conflict, entityType: 'LOCATOR', entityId: ids.locator, conflictType: 'DUPLICATE_NAME' } })
      const owned = [
        ['module', ids.leaf], ['locator-group', ids.group], ['locator', ids.locator], ['test-suite', ids.suite],
        ['test-case', ids.caseA], ['environment', ids.environment], ['tag', ids.tag],
      ] as const
      let ownSource = ''
      for (const [entityType, entityId] of owned) {
        const ownership = await tx.projectResourceOwnership.create({ data: { entityType, entityId, targetProjectId,
          scope: 'project', origin: 'SYNTHETIC_FIXTURE_ONLY', contentHash: digest(`own:${entityId}`) } })
        if (entityType === 'locator') ownSource = ownership.id
      }
      for (const sourceOwnershipId of [ownSource, ids.foreignOwnership])
        await tx.projectResourceImport.create({ data: { sourceOwnershipId, destinationProjectId: targetProjectId, sharingMode: 'copy',
          sourceContentHash: digest(sourceOwnershipId), actor: 'synthetic-fixture-only', propagationPolicy: 'detached_copy' } })
    }
    // Explicitly synthetic Journey-free census/proof values only. No production
    // source issuer, bootstrap, enrollment, Journey, Use, Claim or reset exists.
    for (const [id, targetRoots] of [[targetProjectId, roots], [foreignTargetId, foreignRoots]] as const)
      for (const kind of sharedResourceKinds) {
        const census = targetRoots.filter(root => root.kind === kind).map(root => root.resourceId).sort()
        await tx.qualityJourneySharedResourceCoverage.update({ where: {
          targetProjectId_kind_protocolVersion: { targetProjectId: id, kind, protocolVersion: 1 },
        }, data: { state: 'COMPLETE', epoch: { increment: 1 }, proofKind: 'JOURNEY_FREE_V1', completedAt: sample,
          writerClosureDigest: digest(`SYNTHETIC_REMAINING:writer:${kind}`), readerClosureDigest: digest(`SYNTHETIC_REMAINING:reader:${kind}`),
          sourceUniverseDigest: digest(JSON.stringify({ syntheticOnly: true, id, kind, census })),
          reconciliationDigest: digest(`SYNTHETIC_REMAINING:no-Journey:${id}:${kind}`) } })
      }
  })
  return { targetProjectId, foreignTargetId, ids, roots, portableProjectId, definition }
}

type Fixture = Awaited<ReturnType<typeof newFixture>>
function records(item: Fixture): CollaborationRecord[] {
  const definition = item.definition
  if (!definition) throw new Error('Synthetic collaboration fixture requires a definition')
  const common = { format: 'appraise.repository-collaboration/v1' as const, portableProjectId: item.portableProjectId, version: 1, archived: false }
  const testCase = (portableId: string): CollaborationRecord => ({ ...common, kind: 'test-case', portableId,
    payload: { title: `Synthetic changed ${portableId}`, description: 'Synthetic real SQL', tagPortableIds: ['tag-existing', 'tag-new'],
      steps: [{ portableId: `${portableId}-step`, flowNodeId: `${portableId}-node`, order: 0, keyword: 'Given', gherkinStep: 'Given synthetic fixture',
        icon: 'MOUSE', label: 'Synthetic real SQL step', invocation: { step: { id: definition.identity.id, version: definition.identity.version,
          definitionHash: stepContracts.computeStepReferenceHash(definition) }, inputs: {} },
        parameters: [{ name: 'syntheticLocator', value: 'synthetic', type: 'LOCATOR', order: 0, locatorPortableId: 'locator-existing' }] }],
      flowBlocks: [{ portableId: `${portableId}-block`, name: 'Synthetic new block', order: 0, flowNodeIds: [`${portableId}-node`] }] } })
  return [
    { ...common, kind: 'module', portableId: 'module-leaf', payload: { name: 'Synthetic moved Module', parentPortableId: null } },
    { ...common, kind: 'tag', portableId: 'tag-existing', payload: { name: 'Synthetic changed Tag', expression: '@synthetic-changed', type: 'FILTER' } },
    { ...common, kind: 'tag', portableId: 'tag-new', payload: { name: 'Synthetic new Tag', expression: '@synthetic-new', type: 'FILTER' } },
    testCase('case-existing'), testCase('case-new'),
  ]
}

async function state(tx: Tx, targetIds: readonly string[], definitionId?: string) {
  const where = { targetProjectId: { in: [...targetIds] } }
  const cases = await tx.testCase.findMany({ where, orderBy: { id: 'asc' }, include: {
    TestSuite: { select: { id: true }, orderBy: { id: 'asc' } }, tags: { select: { id: true }, orderBy: { id: 'asc' } },
  } })
  const templates = await tx.templateTestCase.findMany({ where, orderBy: { id: 'asc' } })
  const steps = await tx.testCaseStep.findMany({ where: { testCaseId: { in: cases.map(row => row.id) } }, orderBy: { id: 'asc' } })
  const templateSteps = await tx.templateTestCaseStep.findMany({ where: { templateTestCaseId: { in: templates.map(row => row.id) } }, orderBy: { id: 'asc' } })
  const blocks = await tx.testCaseFlowBlock.findMany({ where: { testCaseId: { in: cases.map(row => row.id) } }, orderBy: { id: 'asc' } })
  const templateBlocks = await tx.templateTestCaseFlowBlock.findMany({ where: { templateTestCaseId: { in: templates.map(row => row.id) } }, orderBy: { id: 'asc' } })
  const bindings = await tx.collaborationBinding.findMany({ where, orderBy: { id: 'asc' } })
  const maps = await tx.collaborationEntityMap.findMany({ where: { bindingId: { in: bindings.map(row => row.id) } }, orderBy: { id: 'asc' } })
  return {
    targets: await tx.targetProject.findMany({ where: { id: { in: [...targetIds] } }, orderBy: { id: 'asc' } }),
    modules: await tx.module.findMany({ where, orderBy: { id: 'asc' } }),
    groups: await tx.locatorGroup.findMany({ where, orderBy: { id: 'asc' } }),
    locators: await tx.locator.findMany({ where, orderBy: { id: 'asc' } }),
    suites: await tx.testSuite.findMany({ where, orderBy: { id: 'asc' }, include: {
      testCases: { select: { id: true }, orderBy: { id: 'asc' } }, tags: { select: { id: true }, orderBy: { id: 'asc' } },
    } }),
    cases, templates, steps, templateSteps, blocks, templateBlocks,
    parameters: await tx.testCaseStepParameter.findMany({ where: { testCaseStepId: { in: steps.map(row => row.id) } }, orderBy: { id: 'asc' } }),
    templateParameters: await tx.templateTestCaseStepParameter.findMany({ where: { testCaseStepId: { in: templateSteps.map(row => row.id) } }, orderBy: { id: 'asc' } }),
    nodes: await tx.testCaseFlowBlockNode.findMany({ where: { flowBlockId: { in: blocks.map(row => row.id) } }, orderBy: { id: 'asc' } }),
    templateNodes: await tx.templateTestCaseFlowBlockNode.findMany({ where: { flowBlockId: { in: templateBlocks.map(row => row.id) } }, orderBy: { id: 'asc' } }),
    environments: await tx.environment.findMany({ where, orderBy: { id: 'asc' } }),
    tags: await tx.tag.findMany({ where, orderBy: { id: 'asc' }, include: {
      testCases: { select: { id: true }, orderBy: { id: 'asc' } }, testSuites: { select: { id: true }, orderBy: { id: 'asc' } },
    } }),
    conflicts: await tx.conflictResolution.findMany({ where: { entityId: { in: (await tx.locator.findMany({ where, select: { id: true } })).map(row => row.id) } }, orderBy: { id: 'asc' } }),
    caseMetrics: await tx.testCaseMetrics.findMany({ where, orderBy: { id: 'asc' } }),
    suiteMetrics: await tx.testSuiteMetrics.findMany({ where, orderBy: { id: 'asc' } }),
    dashboardMetrics: await tx.dashboardMetrics.findMany({ where, orderBy: { id: 'asc' } }),
    ownerships: await tx.projectResourceOwnership.findMany({ where, orderBy: { id: 'asc' } }),
    imports: await tx.projectResourceImport.findMany({ where: { destinationProjectId: { in: [...targetIds] } }, orderBy: { id: 'asc' } }),
    bindings, maps,
    policies: await tx.collaborationPolicyGrant.findMany({ where: { bindingId: { in: bindings.map(row => row.id) } }, orderBy: { id: 'asc' } }),
    baselines: await tx.collaborationBaseline.findMany({ where: { entityMapId: { in: maps.map(row => row.id) } }, orderBy: { id: 'asc' } }),
    definitions: await tx.stepDefinition.findMany({ where: { id: { in: definitionId ? [definitionId] : [] } }, orderBy: [{ id: 'asc' }, { version: 'asc' }] }),
    coverage: await tx.qualityJourneySharedResourceCoverage.findMany({ where, orderBy: [{ targetProjectId: 'asc' }, { kind: 'asc' }] }),
    guards: await tx.qualityJourneySharedResourceGuard.findMany({ where, orderBy: [{ targetProjectId: 'asc' }, { kind: 'asc' }, { resourceId: 'asc' }] }),
    uses: await tx.qualityJourneySharedResourceUse.findMany({ where, orderBy: { id: 'asc' } }),
    claims: await tx.qualityJourneySharedResourceClaim.findMany({ where, orderBy: { id: 'asc' } }),
  }
}
const identity = (key: SharedResourceMutationKey) => `${key.kind}/${key.resourceId}`
const key = (kind: SharedResourceMutationKey['kind'], resourceId: string): SharedResourceMutationKey => ({ kind, resourceId })
function assertPreparation(before: Awaited<ReturnType<typeof guardRows>>, after: Awaited<ReturnType<typeof guardRows>>,
  existing: readonly SharedResourceMutationKey[], newRoots: readonly SharedResourceMutationKey[] = [], deleted: readonly SharedResourceMutationKey[] = []) {
  const touched = new Set(existing.map(identity)), removed = new Set(deleted.map(identity))
  const domains = new Set<string>([...existing, ...newRoots].map(row => row.kind))
  expect(after.coverage).toEqual(before.coverage.map(row => ({ ...row, epoch: row.epoch + (domains.has(row.kind) ? 1 : 0) })))
  expect(after.guards).toHaveLength(before.guards.length + newRoots.length)
  for (const prior of before.guards) {
    const id = `${prior.kind}/${prior.resourceId}`, tombstone = removed.has(id)
    expect(after.guards.find(row => row.kind === prior.kind && row.resourceId === prior.resourceId)).toEqual({ ...prior,
      epoch: prior.epoch + (touched.has(id) ? 1 : 0), resourceState: tombstone ? 'DELETED' : prior.resourceState,
      deletedAt: tombstone ? expect.any(Date) : prior.deletedAt })
  }
  for (const root of newRoots) expect(after.guards.find(row => row.kind === root.kind && row.resourceId === root.resourceId)).toMatchObject({
    epoch: 0, coverageState: 'COMPLETE_V1', coverageDigest: expect.stringMatching(sha), resourceState: 'LIVE', deletedAt: null,
  })
}
function collaborationEffects(item: Fixture) {
  return item.roots.filter(root => root.resourceId !== item.ids.parent)
}
async function newCaseIdentity(tx: Tx, item: Fixture) {
  const mapping = await tx.collaborationEntityMap.findFirst({ where: { bindingId: item.ids.binding, kind: 'TEST_CASE', portableId: 'case-new' } })
  expect(mapping?.localEntityId).toMatch(uuid)
  return mapping!.localEntityId!
}
async function assertNewCaseChildren(tx: Tx, item: Fixture, id: string) {
  const created = await tx.testCase.findUniqueOrThrow({ where: { id }, include: { tags: true, steps: { include: { parameters: true } }, flowBlocks: { include: { nodes: true } } } })
  expect(created.targetProjectId).toBe(item.targetProjectId)
  expect(created.tags).toHaveLength(2)
  expect(created.steps).toHaveLength(1)
  expect(created.steps[0]!.id).toMatch(uuid)
  expect(created.steps[0]!.parameters).toHaveLength(1)
  expect(created.steps[0]!.parameters[0]).toMatchObject({ testCaseStepId: created.steps[0]!.id, locatorId: item.ids.locator })
  expect(created.flowBlocks).toHaveLength(1)
  expect(created.flowBlocks[0]!.nodes).toHaveLength(1)
  expect(JSON.parse(created.steps[0]!.invocationJson).step.id).toBe(item.definition!.identity.id)
}
function assertDeletedDomain(item: Fixture, snapshot: Awaited<ReturnType<typeof state>>) {
  for (const rows of [snapshot.targets, snapshot.modules, snapshot.groups, snapshot.locators, snapshot.suites, snapshot.cases,
    snapshot.templates, snapshot.steps, snapshot.parameters, snapshot.blocks, snapshot.nodes, snapshot.templateSteps,
    snapshot.templateParameters, snapshot.templateBlocks, snapshot.templateNodes, snapshot.tags, snapshot.environments,
    snapshot.conflicts, snapshot.caseMetrics, snapshot.suiteMetrics, snapshot.dashboardMetrics, snapshot.ownerships, snapshot.imports]) expect(rows).toEqual([])
  expect(snapshot.guards).toHaveLength(item.roots.length)
  expect(snapshot.guards.every(row => row.resourceState === 'DELETED' && row.deletedAt instanceof Date)).toBe(true)
  expect(snapshot.coverage).toHaveLength(sharedResourceKinds.length)
  expect(snapshot.uses).toEqual([])
  expect(snapshot.claims).toEqual([])
}
const semantic = (event: WriteEvent) => event.model !== 'coverage' && event.model !== 'guard'

beforeAll(openFreshCase)
afterAll(async () => {
  carrier.run = undefined
  await Promise.allSettled(transactions)
  if (db) await db.$disconnect()
  // Retain every fixture target/row and all tombstones/coverage as evidence;
  // only actual owner mutations under test may delete their finite rows.
})

describe.sequential('Remaining authoring owners synthetic fresh SQLite integration', () => {
  it('C1 commits actual public collaboration materialization with maps Tags Case children archived consumer guards and read-only parent preservation', async () => {
    const item = await newFixture(true), definitionId = item.definition!.identity.id
    const before = await state(client(), [item.targetProjectId], definitionId), foreign = await state(client(), [item.foreignTargetId])
    const guards = await guardRows(client(), item.targetProjectId), count = transactionCount
    const archived = await client().testCase.findUniqueOrThrow({ where: { id: item.ids.caseB } })
    const suite = await client().testSuite.findUniqueOrThrow({ where: { id: item.ids.suite } })
    let sawPrepared = false, preparedCase = ''
    beforeWrite = async (tx, event) => {
      if (!semantic(event) || sawPrepared) return
      expect(event.model).toBe('collaborationEntityMap')
      const now = await guardRows(tx, item.targetProjectId)
      const inserted = now.guards.filter(row => !guards.guards.some(old => old.kind === row.kind && old.resourceId === row.resourceId))
      expect(inserted).toHaveLength(1)
      expect(inserted[0]!.kind).toBe('TEST_CASE')
      preparedCase = inserted[0]!.resourceId
      assertPreparation(guards, now, collaborationEffects(item), [key('TEST_CASE', preparedCase)])
      sawPrepared = true
    }
    try {
      await expect(collaborationOwner.applyCollaborationRecords({ bindingId: item.ids.binding, records: records(item),
        expectedPolicyVersion: 1, repositoryRevision: 'synthetic-fixture-revision' })).resolves.toMatchObject({ applied: 5, snapshotHash: expect.stringMatching(sha) })
    } finally { beforeWrite = undefined }
    expect(transactionCount).toBe(count + 1)
    expect(sawPrepared).toBe(true)
    const created = await newCaseIdentity(client(), item)
    expect(created).toBe(preparedCase)
    assertPreparation(guards, await guardRows(client(), item.targetProjectId), collaborationEffects(item), [key('TEST_CASE', created)])
    await assertNewCaseChildren(client(), item, item.ids.caseA)
    await assertNewCaseChildren(client(), item, created)
    const after = await state(client(), [item.targetProjectId], definitionId)
    expect(after.maps).toHaveLength(before.maps.length + 2)
    expect(after.baselines).toHaveLength(5)
    expect(after.tags).toHaveLength(before.tags.length + 1)
    expect(after.tags.find(row => row.id === item.ids.tag)).toMatchObject({ name: 'Synthetic changed Tag', tagExpression: '@synthetic-changed' })
    expect(after.modules.find(row => row.id === item.ids.leaf)).toMatchObject({ name: 'Synthetic moved Module', parentId: null })
    expect(after.modules.find(row => row.id === item.ids.parent)).toEqual(before.modules.find(row => row.id === item.ids.parent))
    expect(after.groups).toEqual(before.groups)
    expect(after.locators).toEqual(before.locators)
    expect(await client().testCase.findUniqueOrThrow({ where: { id: item.ids.caseB } })).toEqual(archived)
    expect(archived.archivedAt).toEqual(sample)
    expect(await client().testSuite.findUniqueOrThrow({ where: { id: item.ids.suite } })).toEqual(suite)
    expect(after.steps.some(row => row.id === item.ids.stepA)).toBe(false)
    expect(after.parameters.some(row => row.id === item.ids.parameterA)).toBe(false)
    expect(after.definitions).toEqual(before.definitions)
    expect(await state(client(), [item.foreignTargetId])).toEqual(foreign)
  })

  it('C2 rolls back actual collaboration maps Tags roots children guards and coverage after a real post-write fault', async () => {
    const item = await newFixture(true), definitionId = item.definition!.identity.id
    const before = await state(client(), [item.targetProjectId, item.foreignTargetId], definitionId)
    const guards = await guardRows(client(), item.targetProjectId), count = transactionCount
    let witnessed = false
    afterWrite = async (tx, event) => {
      if (event.model !== 'collaborationBaseline' || event.method !== 'upsert') return
      const mapping = await tx.collaborationEntityMap.findFirst({ where: { bindingId: item.ids.binding, kind: 'TEST_CASE', portableId: 'case-new' } })
      if ((event.argument as Prisma.CollaborationBaselineUpsertArgs).where.entityMapId !== mapping?.id) return
      const created = await newCaseIdentity(tx, item)
      await assertNewCaseChildren(tx, item, item.ids.caseA)
      await assertNewCaseChildren(tx, item, created)
      const current = await state(tx, [item.targetProjectId], definitionId)
      expect(current.tags).toHaveLength(2)
      expect(current.maps).toHaveLength(6)
      expect(current.baselines).toHaveLength(5)
      expect(current.modules.find(row => row.id === item.ids.leaf)).toMatchObject({ parentId: null, name: 'Synthetic moved Module' })
      assertPreparation(guards, await guardRows(tx, item.targetProjectId), collaborationEffects(item), [key('TEST_CASE', created)])
      witnessed = true
      throw fixtureFault
    }
    try {
      await expect(collaborationOwner.applyCollaborationRecords({ bindingId: item.ids.binding, records: records(item),
        expectedPolicyVersion: 1, repositoryRevision: 'synthetic-rollback-revision' })).rejects.toBe(fixtureFault)
    } finally { afterWrite = undefined }
    expect(witnessed).toBe(true)
    expect(transactionCount).toBe(count + 1)
    expect(await state(client(), [item.targetProjectId, item.foreignTargetId], definitionId)).toEqual(before)
  })

  it('T1 deletes an actual complete Target closure with exact leaf counts metadata cleanup retained guards and unrelated target preservation', async () => {
    const item = await newFixture(), before = await state(client(), [item.targetProjectId]), foreign = await state(client(), [item.foreignTargetId])
    const guards = await guardRows(client(), item.targetProjectId), count = transactionCount, first = writes.length
    let observedPrepared = false
    beforeWrite = async (tx, event) => {
      if (!semantic(event)) return
      if (!observedPrepared) expect(event.model).toBe('import')
      assertPreparation(guards, await guardRows(tx, item.targetProjectId), item.roots, [], item.roots)
      observedPrepared = true
    }
    try { await expect(targetOwner.deleteTargetProject(item.targetProjectId)).resolves.toEqual(before.targets[0]) }
    finally { beforeWrite = undefined }
    expect(transactionCount).toBe(count + 1)
    expect(observedPrepared).toBe(true)
    const after = await state(client(), [item.targetProjectId])
    assertDeletedDomain(item, after)
    assertPreparation(guards, after, item.roots, [], item.roots)
    expect(writes.slice(first).filter(event => event.model === 'module' && event.method === 'deleteMany').map(event => ({
      id: (event.argument as Prisma.ModuleDeleteManyArgs).where!.id, count: (event.result as { count: number }).count,
    }))).toEqual([{ id: item.ids.leaf, count: 1 }, { id: item.ids.parent, count: 1 }])
    const effects = writes.slice(first).filter(semantic)
    expect(effects.map(event => `${event.model}.${event.method}`)).toEqual([
      'import.deleteMany', 'ownership.deleteMany', 'testCaseStepParameter.deleteMany', 'templateTestCaseStepParameter.deleteMany',
      'testCaseFlowBlockNode.deleteMany', 'templateTestCaseFlowBlockNode.deleteMany', 'testCaseStep.deleteMany', 'templateTestCaseStep.deleteMany',
      'testCaseFlowBlock.deleteMany', 'templateTestCaseFlowBlock.deleteMany', 'caseMetrics.deleteMany', 'suiteMetrics.deleteMany', 'dashboardMetrics.deleteMany',
      'testCase.deleteMany', 'templateTestCase.deleteMany', 'testSuite.deleteMany', 'conflict.deleteMany', 'locator.deleteMany', 'locatorGroup.deleteMany',
      'module.deleteMany', 'module.deleteMany', 'environment.deleteMany', 'tag.deleteMany', 'target.deleteMany',
    ])
    expect(effects.map(event => (event.result as { count: number }).count)).toEqual([
      2, 7, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ])
    expect(before.imports).toHaveLength(2)
    expect(before.ownerships).toHaveLength(7)
    expect(await state(client(), [item.foreignTargetId])).toEqual(foreign)
  })

  it('T2 refuses an actual foreign incoming Module endpoint before any batch or writer and preserves every row and guard', async () => {
    const item = await newFixture(false, true), before = await state(client(), [item.targetProjectId, item.foreignTargetId])
    const count = transactionCount, first = writes.length
    let attempted = false
    beforeWrite = async () => { attempted = true; throw new Error('Refusal path attempted a real mutation') }
    try { await expect(targetOwner.deleteTargetProject(item.targetProjectId)).rejects.toMatchObject({ statusCode: 409 }) }
    finally { beforeWrite = undefined }
    expect(transactionCount).toBe(count + 1)
    expect(attempted).toBe(false)
    expect(writes).toHaveLength(first)
    expect(await state(client(), [item.targetProjectId, item.foreignTargetId])).toEqual(before)
  })

  it('T3 rolls back actual Target deletion authored children metadata tombstones and coverage after a post-deletion fault', async () => {
    const item = await newFixture(), before = await state(client(), [item.targetProjectId, item.foreignTargetId])
    const guards = await guardRows(client(), item.targetProjectId), foreign = await state(client(), [item.foreignTargetId]), count = transactionCount
    let witnessed = false
    afterWrite = async (tx, event) => {
      if (event.model !== 'target' || event.method !== 'deleteMany') return
      expect(event.result).toEqual({ count: 1 })
      const deleted = await state(tx, [item.targetProjectId])
      assertDeletedDomain(item, deleted)
      assertPreparation(guards, deleted, item.roots, [], item.roots)
      expect(await state(tx, [item.foreignTargetId])).toEqual(foreign)
      witnessed = true
      throw fixtureFault
    }
    try { await expect(targetOwner.deleteTargetProject(item.targetProjectId)).rejects.toBe(fixtureFault) }
    finally { afterWrite = undefined }
    expect(witnessed).toBe(true)
    expect(transactionCount).toBe(count + 1)
    expect(await state(client(), [item.targetProjectId, item.foreignTargetId])).toEqual(before)
  })
})
