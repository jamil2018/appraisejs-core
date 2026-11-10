/** Fresh synthetic SQLite Discovery selected publication semantics only. This source is inert
 * until a separately reviewed outer harness supplies a new migrated case, exact
 * source/SDK/native pins and HOST custody proof. No provider/runtime qualification.
 * Synthetic Factory receipt rows are fixture-only, never host/provider proof. */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { sharedResourceKinds, sharedSourceDigest } from '@/lib/quality-journey/shared-resource-contract'
import { e2CampaignPolicyDigest } from '@/lib/quality-journey/e2-campaign-policy-contract'
import { canonicalContractJson } from '@/lib/catalog-contracts/canonical-json'
import { resourceResolutionBundleSchema, hashResourceResolutionBundle } from '@/lib/quality-journey/discovery-contracts'
import type { AssignmentManifest } from '@/lib/quality-journey/contracts'

const carrier = vi.hoisted(() => ({
  run: undefined as undefined | ((callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>),
}))
// The default DB adapter sole allowed operation delegates
// to the exact real private Prisma transaction; no authority or SQL result mock.
vi.mock('@/config/db-config', () => ({
  default: new Proxy(Object.create(null) as object, {
    get(_target, key) {
      if (key !== '$transaction') throw new Error(`Discovery selected-use fixture root operation refused: ${String(key)}`)
      return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        if (!carrier.run) throw new Error('Discovery selected-use fixture carrier is not armed')
        return carrier.run(callback)
      }
    },
    has(_target, key) { return key === '$transaction' },
    set() { throw new Error('Discovery selected-use fixture root mutation refused') },
  }),
}))

// The only runtime export consumed by browser-runtime is this dormant launch
// adapter; protocol/event imports are erased types. RESOURCE_RESOLUTION never
// calls browser launch. Preserve real Discovery/browser-service/session authority.
const unusedBrowser = vi.hoisted(() => ({ calls: 0 }))
vi.mock('./quality-journey-discovery-browser-transport', () => ({
  launchDiscoveryBrowserTransport: () => {
    unusedBrowser.calls++
    throw new Error('UNSELECTED_DISCOVERY_BROWSER_TRANSPORT')
  },
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
let discoveryOwner: typeof import('./quality-journey-discovery-service')
let businessJoin: typeof import('./quality-journey-business-write-join')
let sessionService: typeof import('./quality-journey-coordinator-session')
let factoryContracts: typeof import('@/lib/quality-journey/agent-factory')
let guardService: typeof import('./quality-journey-shared-resource-guard-service')
let descriptorService: typeof import('./quality-journey-shared-resource-descriptor-service')
let useService: typeof import('./quality-journey-shared-resource-use-service')
let transactionCount = 0
type Tx = Prisma.TransactionClient
type WriteEvent = { model: string; method: string; argument: unknown; result: unknown }
let afterWrite: undefined | ((tx: Tx, event: WriteEvent) => Promise<void>)
const writes: WriteEvent[] = []
const transactions: Promise<unknown>[] = []
const fixtureFault = new Error('SYNTHETIC_DISCOVERY_POST_RETIREMENT_FAULT')

function refuse(reason: string): never { throw new Error(`Discovery selected-use SQLite case refused: ${reason}`) }
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
  const root = process.env.M06_E2_DISCOVERY_SELECTED_USE_CASE_ROOT
  const pin = process.env.M06_E2_DISCOVERY_SELECTED_USE_MANIFEST_SHA256
  if (!root || !path.isAbsolute(root) || path.normalize(root) !== root || path.dirname(root) !== caseBase ||
    !uuid.test(path.basename(root)) || !pin || !sha.test(pin) || await fs.realpath(root) !== root)
    refuse('new case identity')
  if (source !== path.join(root, 'mirror/src/services/coordinator/quality-journey-discovery-selected-use.sqlite.integration.test.ts'))
    refuse('selector outside new mirror')
  const manifestFile = path.join(root, 'discovery-selected-use-sqlite-test-manifest.json')
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
    m.version !== 'M06_E2_DISCOVERY_SELECTED_USE_SQLITE_TEST_CASE_V1' || m.stage !== 'DISCOVERY_SELECTED_USE_SQLITE_TEST' ||
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
    db.qualityJourneyDiscoveryRevision.count(), db.qualityJourneyAnalysisRevision.count(),
    db.qualityJourneyAnalysisDecision.count(), db.qualityJourneyArtifact.count(), db.qualityJourneyWorkItem.count(),
    db.qualityJourneyWorkAuthorization.count(), db.qualityJourneyWorkAttempt.count(),
    db.qualityJourneyWorkAttemptSessionBinding.count(), db.qualityJourneyCycle.count(),
    db.environment.count(), db.stepDefinition.count(),
  ])
  const baselineCoverage = await db.qualityJourneySharedResourceCoverage.findMany({ orderBy: { kind: 'asc' } })
  if (projects.length !== 1 || projects[0]?.id !== '00000000-0000-4000-8000-000000000001' ||
    counts.some(count => count !== 0) || baselineCoverage.length !== sharedResourceKinds.length ||
    baselineCoverage.some((row, index) => row.targetProjectId !== projects[0]?.id ||
      row.kind !== [...sharedResourceKinds].sort()[index] || row.protocolVersion !== 1 || row.state !== 'UNKNOWN' ||
      row.epoch !== 0 || row.writerClosureDigest !== null || row.readerClosureDigest !== null ||
      row.sourceUniverseDigest !== null || row.reconciliationDigest !== null || row.proofKind !== null || row.completedAt !== null))
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
        module: watch('module', tx.module, tx), locatorGroup: watch('group', tx.locatorGroup, tx),
        locator: watch('locator', tx.locator, tx),
        qualityJourneyDiscoveryRevision: watch('discovery', tx.qualityJourneyDiscoveryRevision, tx),
        qualityJourneyWorkAttempt: watch('attempt', tx.qualityJourneyWorkAttempt, tx),
        qualityJourneyWorkItem: watch('item', tx.qualityJourneyWorkItem, tx),
        qualityJourneyEvent: watch('event', tx.qualityJourneyEvent, tx),
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
  businessJoin = await import('./quality-journey-business-write-join')
  sessionService = await import('./quality-journey-coordinator-session')
  factoryContracts = await import('@/lib/quality-journey/agent-factory')
  discoveryOwner = await import('./quality-journey-discovery-service')
}

// Run the original SQL method first, retain its actual result, then inspect or
// inject a failure in that same owning transaction. No result replacement.
function watch<T extends object>(model: string, delegate: T, tx: Tx): T {
  return new Proxy(delegate, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof property !== 'string' ||
        !['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(property) ||
        typeof value !== 'function') return value
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
  if (!event.argument || typeof event.argument !== 'object' || !('data' in event.argument) ||
    !event.argument.data || typeof event.argument.data !== 'object') return {}
  return event.argument.data as Record<string, unknown>
}
const admission = (event: WriteEvent) => event.model === 'journey' &&
  Object.hasOwn(dataOf(event), 'e2AdmissionVersion')
const authorizationFence = (event: WriteEvent) => event.model === 'journey' &&
  Object.hasOwn(dataOf(event), 'ownershipVersion') && !admission(event)
const useActivation = (event: WriteEvent) => event.model === 'use' &&
  event.method === 'updateMany' && dataOf(event).state === 'ACTIVE'

const json = canonicalContractJson
const contentHash = (value: unknown) => `sha256:${digest(json(value))}`
const resolutionWrite = (event: WriteEvent) => event.model === 'discovery' &&
  typeof dataOf(event).resourceResolutionHash === 'string'
const terminalAttemptWrite = (event: WriteEvent) => event.model === 'attempt' && dataOf(event).status === 'COMPLETED'
const terminalItemWrite = (event: WriteEvent) => event.model === 'item' && dataOf(event).status === 'COMPLETED'
const retirementWrite = (event: WriteEvent) => event.model === 'retirement' && dataOf(event).state === 'RETIRE_REQUESTED'

type AuthorityFields = Pick<AssignmentManifest, 'schemaVersion' | 'journeyId' | 'targetProjectId' | 'workItemId' |
  'roleDefinition' | 'capabilityProfile' | 'inputArtifacts' | 'advisoryInputRefs' | 'allowedTargetRoutes' |
  'allowedResourceIds' | 'targetEnvironmentBindings' | 'writableArtifactKinds' | 'scope' | 'completionCriteria'>

async function newFixture(unknownCaseDomain = false) {
  const targetProjectId = randomUUID(), journeyId = randomUUID(), cycleId = randomUUID(), sessionId = randomUUID()
  const ids = { ancestor: randomUUID(), destination: randomUUID(), group: randomUUID(), locator: randomUUID(),
    unselectedModule: randomUUID(), unselectedLocator: randomUUID(), environment: randomUUID(),
    analysisArtifact: randomUUID(), approvalArtifact: randomUUID(), analysis: randomUUID(), decision: randomUUID(),
    analysisWork: randomUUID(), analysisAttempt: randomUUID(), attempt: randomUUID(), lease: randomUUID(),
    policy: randomUUID(), retirement: randomUUID() }
  const analysisArtifactId = `synthetic-discovery-analysis-${randomUUID()}`
  const analysisRevisionId = `synthetic-discovery-revision-${randomUUID()}`
  const approvalArtifactId = `synthetic-discovery-approval-${randomUUID()}`
  const requirementId = `synthetic-discovery-requirement-${randomUUID()}`
  const principalId = `synthetic-discovery-principal-${randomUUID()}`
  const ownerToken = `synthetic-discovery-owner-${randomUUID()}`
  const charter = { requirements: [{ requirementId }] }, approval = { syntheticOnly: true, decision: 'APPROVED' }
  const credentials = { journeyId, targetProjectId, coordinatorSessionId: sessionId,
    coordinatorGeneration: 1, coordinatorPrincipalId: principalId }
  const fixture = await client().$transaction(async tx => {
    await guardService.initializeNewTargetSharedResourceCoverage(tx, targetProjectId)
    await tx.targetProject.create({ data: { id: targetProjectId, kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `synthetic-discovery-sql:${targetProjectId}`, displayName: 'Synthetic Discovery SQL target',
      canonicalPath: path.join(process.env.M06_E2_DISCOVERY_SELECTED_USE_CASE_ROOT!, 'synthetic-target', targetProjectId),
      fingerprint: digest(`synthetic-discovery-fingerprint:${targetProjectId}`) } })
    const roots = [
      { kind: 'MODULE' as const, resourceId: ids.ancestor }, { kind: 'MODULE' as const, resourceId: ids.destination },
      { kind: 'MODULE' as const, resourceId: ids.unselectedModule }, { kind: 'LOCATOR_GROUP' as const, resourceId: ids.group },
      { kind: 'LOCATOR' as const, resourceId: ids.locator }, { kind: 'LOCATOR' as const, resourceId: ids.unselectedLocator },
    ]
    await guardService.prepareSharedResourceMutationInTransaction(tx, targetProjectId, { existing: [], newRoots: roots, deleted: [] })
    await tx.module.create({ data: { id: ids.ancestor, targetProjectId, name: 'Synthetic archived Discovery ancestor', archivedAt: sample } })
    await tx.module.create({ data: { id: ids.destination, targetProjectId, parentId: ids.ancestor, name: 'Synthetic Discovery destination' } })
    await tx.module.create({ data: { id: ids.unselectedModule, targetProjectId, name: 'Synthetic visible unselected Module' } })
    await tx.locatorGroup.create({ data: { id: ids.group, targetProjectId, moduleId: ids.destination,
      name: 'Synthetic Discovery Group', route: '/synthetic-discovery' } })
    await tx.locator.create({ data: { id: ids.locator, targetProjectId, locatorGroupId: ids.group,
      name: 'Synthetic selected resource', value: '[data-synthetic-discovery="selected"]' } })
    await tx.locator.create({ data: { id: ids.unselectedLocator, targetProjectId, locatorGroupId: ids.group,
      name: 'Synthetic visible unselected resource', value: '[data-synthetic-discovery="unselected"]' } })
    await tx.environment.create({ data: { id: ids.environment, targetProjectId,
      name: 'synthetic-discovery-environment', baseUrl: 'https://synthetic-discovery.invalid' } })
    // New fixture census before its Journey exists. No source issuer or real
    // campaign/enrollment API; UNKNOWN stays initial in the negative fixture.
    for (const kind of sharedResourceKinds) {
      if (unknownCaseDomain && kind === 'TEST_CASE') continue
      await tx.qualityJourneySharedResourceCoverage.update({ where: {
        targetProjectId_kind_protocolVersion: { targetProjectId, kind, protocolVersion: 1 },
      }, data: { state: 'COMPLETE', epoch: { increment: 1 }, proofKind: 'JOURNEY_FREE_V1', completedAt: sample,
        writerClosureDigest: digest(`SYNTHETIC_DISCOVERY:writer:${kind}`), readerClosureDigest: digest(`SYNTHETIC_DISCOVERY:reader:${kind}`),
        sourceUniverseDigest: digest(json({ syntheticOnly: true, targetProjectId, kind,
          census: roots.filter(root => root.kind === kind).map(root => root.resourceId).sort() })),
        reconciliationDigest: digest(`SYNTHETIC_DISCOVERY:no-Journey:${targetProjectId}:${kind}`) } })
    }
    // One uncommitted fixture construction. The real legacy compiler derives
    // current registry hashes/work authorizations before this fixture's E2 rows
    // are inserted. No persisted generation is reset, transferred or enrolled.
    await tx.qualityJourney.create({ data: { id: journeyId, targetProjectId, stage: 'DISCOVERY',
      rootIdempotencyKey: randomUUID(), rootRequestHash: digest(`synthetic-discovery-root:${journeyId}`),
      hostingMode: 'EXTERNAL_LEGACY', hostingProvenance: 'CREATED_COMPATIBILITY_V1', activeCycleId: cycleId,
      activeRevisionIdsJson: json({ analysis: analysisRevisionId }), stateHash: contentHash({ syntheticOnly: true, journeyId }) } })
    await tx.qualityJourneyCycle.create({ data: { id: cycleId, journeyId, sequence: 1, scopeJson: json({ syntheticOnly: true }) } })
    await tx.qualityJourneyWorkItem.create({ data: { id: ids.analysisWork, journeyId, targetProjectId, cycleId,
      role: 'REQUIREMENT_ANALYZER', status: 'COMPLETED', inputHash: contentHash('synthetic-analysis-input'),
      roleContractDigest: contentHash('synthetic-analysis-FK-only'), currentAttempt: 1 } })
    await tx.qualityJourneyWorkAttempt.create({ data: { id: ids.analysisAttempt, workItemId: ids.analysisWork,
      attempt: 1, status: 'COMPLETED', leaseId: randomUUID(), ownerTokenHash: digest('synthetic-analysis-owner-FK-only'),
      leaseExpiresAt: sample, heartbeatSeconds: 30, completedAt: sample } })
    for (const entry of [
      { id: ids.analysisArtifact, kind: 'ANALYSIS_CHARTER_REVISION', artifactId: analysisArtifactId,
        revisionId: analysisRevisionId, contentHash: contentHash(charter), artifactJson: json(charter) },
      { id: ids.approvalArtifact, kind: 'JOURNEY_APPROVAL', artifactId: approvalArtifactId,
        revisionId: null, contentHash: contentHash(approval), artifactJson: json(approval) },
    ]) await tx.qualityJourneyArtifact.create({ data: { ...entry, journeyId, targetProjectId, cycleId,
      identityKey: `synthetic-discovery:${entry.id}` } })
    await tx.qualityJourneyAnalysisRevision.create({ data: { id: ids.analysis, journeyId, targetProjectId, cycleId,
      artifactRecordId: ids.analysisArtifact, artifactId: analysisArtifactId, artifactRevisionId: analysisRevisionId,
      revision: 1, contentHash: contentHash(charter), submissionIdempotencyKey: randomUUID(),
      submissionHash: contentHash(charter), submittedWorkItemId: ids.analysisWork, submittedAttemptId: ids.analysisAttempt,
      inputHash: contentHash('synthetic-analysis-input') } })
    await tx.qualityJourneyAnalysisDecision.create({ data: { id: ids.decision, journeyId,
      analysisRevisionId: ids.analysis, artifactRecordId: ids.approvalArtifact, commandId: randomUUID(),
      contentHash: contentHash(approval), reviewHash: contentHash('synthetic-analysis-review'), decision: 'APPROVED',
      actor: 'SYNTHETIC_DISCOVERY_FIXTURE_ONLY' } })
    const revision = await businessJoin.withJourneyBusinessWriteJoinInTransaction(tx, { journeyId, targetProjectId }, undefined,
      before => discoveryOwner.ensureQualityJourneyDiscoveryForApprovedAnalysis({ journeyId, targetProjectId }, tx, before))
    const item = await tx.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: revision.resourceWorkItemId } })
    const authorization = await tx.qualityJourneyWorkAuthorization.findFirstOrThrow({ where: { workItemId: item.id } })
    const authority = JSON.parse(authorization.authorizationJson) as AuthorityFields
    const leaseExpiresAt = new Date('2099-01-01T00:00:00.000Z'), heartbeatSeconds = 30
    const assignment: AssignmentManifest = { schemaVersion: authority.schemaVersion, journeyId, targetProjectId,
      workItemId: item.id, roleDefinition: authority.roleDefinition, capabilityProfile: authority.capabilityProfile,
      inputArtifacts: authority.inputArtifacts, allowedTargetRoutes: authority.allowedTargetRoutes,
      allowedResourceIds: authority.allowedResourceIds, writableArtifactKinds: authority.writableArtifactKinds,
      scope: authority.scope, completionCriteria: authority.completionCriteria,
      ...(authority.advisoryInputRefs?.length ? { advisoryInputRefs: authority.advisoryInputRefs } : {}),
      ...(authority.targetEnvironmentBindings ? { targetEnvironmentBindings: authority.targetEnvironmentBindings } : {}),
      assignmentId: `qjma_${ids.attempt}`, stateHash: item.inputHash, inputHash: item.inputHash,
      lease: { leaseId: ids.lease, expiresAt: leaseExpiresAt.toISOString(), heartbeatSeconds },
      idempotencyKey: `assignment_${ids.attempt}` }
    const spawnRequest = factoryContracts.createWorkerSpawnRequest({ requestId: randomUUID(), attemptId: ids.attempt, manifest: assignment })
    // Fictional fixture receipt, validated by the unchanged pure contract. These
    // rows never establish an actual Factory start, model/tool grant or HOST proof.
    const spawnReceipt = factoryContracts.validateWorkerSpawnReceipt({ schemaVersion: 'appraise.quality-journey/v1',
      spawnReceiptId: randomUUID(), assignmentId: assignment.assignmentId, workItemId: item.id, attemptId: ids.attempt,
      roleDefinitionDigest: spawnRequest.roleDefinitionDigest, capabilityProfileDigest: spawnRequest.capabilityProfileDigest,
      boundaries: spawnRequest.requiredBoundaries.map(boundary => ({ boundary: boundary.boundary,
        requested: boundary.allowedValues, status: 'VERIFIED', effective: boundary.allowedValues,
        evidence: [contentHash({ syntheticReceiptOnly: true, boundary: boundary.boundary })] })),
      outcome: 'STARTED', effectiveWorker: { modelId: 'synthetic-fixture-model-only',
        reasoningLevel: spawnRequest.requestedJudgment, latencyPreference: spawnRequest.requestedLatency,
        toolIds: spawnRequest.scope.permittedTools }, startedAt: sample.toISOString() }, spawnRequest)
    await tx.qualityJourneyWorkItem.update({ where: { id: item.id }, data: { status: 'IN_PROGRESS', currentAttempt: 1 } })
    await tx.qualityJourneyWorkAttempt.create({ data: { id: ids.attempt, workItemId: item.id, authorizationId: authorization.id,
      attempt: 1, status: 'IN_PROGRESS', leaseId: ids.lease, ownerTokenHash: digest(ownerToken), executionMode: 'MANAGED',
      leaseExpiresAt, heartbeatSeconds, assignmentId: assignment.assignmentId, assignmentJson: json(assignment),
      assignmentHash: contentHash(assignment), spawnRequestId: spawnRequest.requestId, spawnRequestJson: json(spawnRequest),
      spawnRequestHash: contentHash(spawnRequest), spawnReceiptId: spawnReceipt.spawnReceiptId,
      spawnReceiptJson: json(spawnReceipt), spawnReceiptHash: contentHash(spawnReceipt) } })
    const sourceTupleDigest = digest(`synthetic-discovery-source:${sessionId}`)
    await tx.qualityJourneyCoordinatorSession.create({ data: { id: sessionId, journeyId, targetProjectId,
      ownerPrincipalId: principalId, hostKind: 'APP_SERVER_LOCAL_V1', status: 'ACTIVE', generation: 1,
      registrationKey: randomUUID(), registrationRequestHash: digest(`synthetic-discovery-register:${sessionId}`),
      e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: sourceTupleDigest, e2EnrolledAt: sample,
      activatedAt: sample, provenance: 'SYNTHETIC_DISCOVERY_SQL_ONLY' } })
    await tx.qualityJourney.update({ where: { id: journeyId }, data: { currentCoordinatorSessionId: sessionId,
      hostingMode: 'APP_SERVER_LOCAL_V1', hostingProvenance: 'SYNTHETIC_DISCOVERY_SQL_ONLY' } })
    const policy = { id: ids.policy, allocationDigest: digest(`synthetic-discovery-policy:${ids.policy}`),
      journeyId, targetProjectId, sourceTupleDigest, policyVersion: 'M06_E2_CAMPAIGN_POLICY_V1', policyDigest: '',
      nativeStartWindowMs: 1, dnsWindowMs: 1, tcpWindowMs: 1, tlsWindowMs: 1, upgradeWindowMs: 1,
      providerRequestWindowMs: 1, mcpCallWindowMs: 1, actorMaxOperations: 0, actorMaxBytes: 0, actorMaxFrames: 0,
      actorMaxSetup: 0, actorMaxProviderRequests: 0, actorMaxMcpCalls: 0, journeyMaxNativeStarts: 0, journeyMaxTurnStarts: 0,
      maxNativeStarts: 0, maxProviderRequests: 0, maxOperations: 0, maxBytes: 0, maxFrames: 0, maxSetup: 0, maxMcpCalls: 0,
      nativeStartsReserved: 0, providerRequestsReserved: 0, operationsReserved: 0, bytesReserved: 0,
      framesReserved: 0, setupReserved: 0, mcpCallsReserved: 0, version: 0, createdAt: sample }
    policy.policyDigest = e2CampaignPolicyDigest(policy)
    await tx.qualityJourneyE2CampaignPolicy.create({ data: policy })
    await tx.qualityJourneyE2Retirement.create({ data: { id: ids.retirement, journeyId, targetProjectId,
      coordinatorSessionId: sessionId, generation: 1, campaignPolicyId: ids.policy } })
    await sessionService.bindCoordinatorAttemptSession({ ...credentials, attemptId: ids.attempt }, tx)
    const bundle = resourceResolutionBundleSchema.parse({ schemaVersion: 'appraise.quality-journey/v1', journeyId,
      targetProjectId, cycleId, analysisRevision: { artifactId: analysisArtifactId, revisionId: analysisRevisionId,
        contentHash: contentHash(charter) }, analysisApproval: { artifactId: approvalArtifactId, contentHash: contentHash(approval) },
      workItemId: item.id, attemptId: ids.attempt, authorizationId: authorization.id, inputHash: item.inputHash,
      assignmentScopeHash: contentHash(JSON.parse(item.authorizationScopeJson)),
      approvedRequirementSetHash: revision.approvedRequirementSetHash, inputArtifacts: authority.inputArtifacts,
      evidenceReceipts: [{ artifactId: 'synthetic-discovery-selection-evidence', contentHash: contentHash('synthetic-evidence') }],
      bundleId: randomUUID(), resolvedAt: sample.toISOString(), destinationModuleId: ids.destination,
      approvedRequirementIds: [requirementId], reusable: [
        { resourceId: `module:${ids.destination}`, resourceKind: 'MODULE', requirementId, rank: 1, reasonCode: 'COMPATIBLE',
          explanation: 'Synthetic selected destination', evidenceReceiptIds: ['synthetic-discovery-selection-evidence'] },
        { resourceId: `locator:${ids.locator}`, resourceKind: 'LOCATOR', requirementId, rank: 2, reasonCode: 'COMPATIBLE',
          explanation: 'Synthetic selected locator', evidenceReceiptIds: ['synthetic-discovery-selection-evidence'] },
      ], incompatible: [], stale: [], crossTarget: [], missing: [] })
    return { revisionId: revision.id, resourceWorkItemId: item.id, scoutWorkItemId: revision.scoutWorkItemId,
      authorizationId: authorization.id, bundle }
  })
  const request = { journeyId, targetProjectId, discoveryRevisionId: fixture.revisionId,
    workItemId: fixture.resourceWorkItemId, attemptId: ids.attempt, leaseId: ids.lease, ownerToken,
    idempotencyKey: `synthetic-discovery-submit-${randomUUID()}`, expectedInputHash: fixture.bundle.inputHash,
    expectedScopeHash: fixture.bundle.assignmentScopeHash, bundle: fixture.bundle }
  return { targetProjectId, journeyId, ids, credentials, request, ...fixture }
}
type Fixture = Awaited<ReturnType<typeof newFixture>>
const submit = (item: Fixture) => discoveryOwner.submitQualityJourneyResourceResolution(item.request, undefined, item.credentials)

async function state(tx: Tx, item: Fixture) {
  const where = { targetProjectId: item.targetProjectId }
  const attempts = await tx.qualityJourneyWorkAttempt.findMany({ where: { workItem: { journeyId: item.journeyId } }, orderBy: { id: 'asc' } })
  return {
    journey: await tx.qualityJourney.findUniqueOrThrow({ where: { id: item.journeyId } }),
    revision: await tx.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: item.revisionId } }),
    workItems: await tx.qualityJourneyWorkItem.findMany({ where: { journeyId: item.journeyId }, orderBy: { id: 'asc' } }),
    attempts,
    authorizations: await tx.qualityJourneyWorkAuthorization.findMany({ where: { journeyId: item.journeyId }, orderBy: { id: 'asc' } }),
    bindings: await tx.qualityJourneyWorkAttemptSessionBinding.findMany({ where: { journeyId: item.journeyId }, orderBy: { attemptId: 'asc' } }),
    artifacts: await tx.qualityJourneyArtifact.findMany({ where: { journeyId: item.journeyId }, orderBy: { id: 'asc' } }),
    analysis: await tx.qualityJourneyAnalysisRevision.findMany({ where: { journeyId: item.journeyId }, orderBy: { id: 'asc' } }),
    decisions: await tx.qualityJourneyAnalysisDecision.findMany({ where: { journeyId: item.journeyId }, orderBy: { id: 'asc' } }),
    modules: await tx.module.findMany({ where, orderBy: { id: 'asc' } }),
    groups: await tx.locatorGroup.findMany({ where, orderBy: { id: 'asc' } }),
    locators: await tx.locator.findMany({ where, orderBy: { id: 'asc' } }),
    coverage: await tx.qualityJourneySharedResourceCoverage.findMany({ where, orderBy: { kind: 'asc' } }),
    guards: await tx.qualityJourneySharedResourceGuard.findMany({ where, orderBy: [{ kind: 'asc' }, { resourceId: 'asc' }] }),
    uses: await tx.qualityJourneySharedResourceUse.findMany({ where, orderBy: { id: 'asc' } }),
    claims: await tx.qualityJourneySharedResourceClaim.findMany({ where, orderBy: [{ kind: 'asc' }, { resourceId: 'asc' }] }),
    receipts: await tx.qualityJourneyLocatorEnsureReceipt.findMany({ where, orderBy: { id: 'asc' } }),
    events: await tx.qualityJourneyEvent.findMany({ where: { journeyId: item.journeyId }, orderBy: { id: 'asc' } }),
    retirement: await tx.qualityJourneyE2Retirement.findUniqueOrThrow({ where: { id: item.ids.retirement } }),
    policy: await tx.qualityJourneyE2CampaignPolicy.findUniqueOrThrow({ where: { id: item.ids.policy } }),
  }
}
function assertPublicationOrder(events: WriteEvent[]) {
  const admissions = events.map((event, index) => admission(event) ? index : -1).filter(index => index >= 0)
  // One ordinary business CAS plus the unchanged separate final invalidator CAS.
  expect(admissions).toHaveLength(2)
  const resolution = events.findIndex(resolutionWrite), active = events.findIndex(useActivation)
  const attempt = events.findIndex(terminalAttemptWrite), work = events.findIndex(terminalItemWrite)
  const retirement = events.findIndex(retirementWrite)
  expect(resolution).toBeGreaterThan(admissions[0]!)
  expect(active).toBeGreaterThan(resolution)
  expect(attempt).toBeGreaterThan(active)
  expect(work).toBeGreaterThan(attempt)
  expect(admissions[1]!).toBeGreaterThan(work)
  expect(retirement).toBeGreaterThan(admissions[1]!)
  expect(events.filter(resolutionWrite)).toHaveLength(1)
  expect(events.filter(useActivation)).toHaveLength(1)
  expect(events.filter(terminalAttemptWrite)).toHaveLength(1)
  expect(events.filter(terminalItemWrite)).toHaveLength(1)
  expect(events.filter(retirementWrite)).toHaveLength(1)
  expect(events.filter(event => ['module', 'group', 'locator', 'receipt', 'event'].includes(event.model))).toEqual([])
}
async function assertPublished(item: Fixture) {
  const after = await state(client(), item), bundleHash = hashResourceResolutionBundle(item.bundle)
  expect(after.revision).toMatchObject({ resourceResolutionJson: json(item.bundle), resourceResolutionHash: bundleHash,
    resourceResolutionIdempotencyKey: item.request.idempotencyKey, rowVersion: 1, status: 'COLLECTING',
    resourceResolutionSubmittedAt: expect.any(Date), targetObservationHash: null, completionHash: null })
  expect(after.uses).toHaveLength(1)
  const descriptor = await descriptorService.resolveSharedResourceDescriptors(client(), item.targetProjectId, [
    { kind: 'MODULE', resourceId: item.ids.destination }, { kind: 'LOCATOR', resourceId: item.ids.locator },
  ])
  const expectedKeys = [
    { kind: 'MODULE', resourceId: item.ids.ancestor }, { kind: 'MODULE', resourceId: item.ids.destination },
    { kind: 'LOCATOR_GROUP', resourceId: item.ids.group }, { kind: 'LOCATOR', resourceId: item.ids.locator },
  ].sort((a, b) => a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0)
  expect(descriptor.keys).toEqual(expectedKeys)
  const sourceDigest = sharedSourceDigest({ sourceKind: 'RESOURCE_RESOLUTION', sourceOwnerId: item.revisionId, sourceHash: bundleHash })
  const plan = useService.buildSharedResourceClaimPlan({ journeyId: item.journeyId, targetProjectId: item.targetProjectId,
    coordinatorSessionId: item.credentials.coordinatorSessionId, generation: 1, sourceKind: 'RESOURCE_RESOLUTION',
    sourceOwnerId: item.revisionId, sourceDigest }, descriptor)
  const use = after.uses[0]!
  expect(use).toMatchObject({ id: plan.id, state: 'ACTIVE', version: 1, sourceKind: 'RESOURCE_RESOLUTION',
    sourceOwnerId: item.revisionId, sourceDigest, dependencyDigest: descriptor.dependencyDigest,
    claimSetDigest: plan.claimSetDigest, claimSetCount: 4, coordinatorSessionId: item.credentials.coordinatorSessionId, generation: 1 })
  useService.assertExactActiveSharedResourceUse(plan, use, after.claims)
  expect(after.claims.map(({ kind, resourceId }) => ({ kind, resourceId }))).toEqual(expectedKeys)
  expect(
    after.claims.some(claim => claim.resourceId === item.ids.unselectedModule || claim.resourceId === item.ids.unselectedLocator),
  ).toBe(false)
  expect(after.modules.find(row => row.id === item.ids.ancestor)?.archivedAt).toEqual(sample)
  for (const claim of after.claims) {
    const guard = after.guards.find(row => row.kind === claim.kind && row.resourceId === claim.resourceId)
    expect(guard).toMatchObject({ epoch: claim.claimEpoch, resourceState: 'LIVE', coverageState: 'COMPLETE_V1' })
  }
  expect(after.attempts.find(row => row.id === item.ids.attempt)).toMatchObject({ status: 'COMPLETED',
    resultHash: bundleHash, resultJson: json(item.bundle), completedAt: expect.any(Date) })
  expect(after.workItems.find(row => row.id === item.resourceWorkItemId)).toMatchObject({ status: 'COMPLETED', version: 1 })
  expect(after.workItems.find(row => row.id === item.scoutWorkItemId)).toMatchObject({ status: 'ELIGIBLE', currentAttempt: 0 })
  expect(after.retirement).toMatchObject({ state: 'RETIRE_REQUESTED', version: 1, requestReason: 'ATTEMPT_TERMINAL',
    requestId: expect.stringMatching(/^e2_attempt_terminal_[0-9a-f]{64}$/), requestedAt: expect.any(Date),
    effectiveAt: null, effectiveEvidenceDigest: null })
  expect(after.receipts).toEqual([])
  return after
}

beforeAll(openFreshCase)
afterAll(async () => {
  carrier.run = undefined
  afterWrite = undefined
  await Promise.allSettled(transactions)
  if (db) await db.$disconnect()
  expect(unusedBrowser.calls).toBe(0)
  // Retain fixture rows, accepted source, terminal latch and failed-call evidence.
})

describe.sequential('Discovery selected-use synthetic fresh SQLite public submission', () => {
  it('publishes the selected typed source and exact ACTIVE Claims before terminal rows and separate retirement then replays without business writes', async () => {
    expect(unusedBrowser.calls).toBe(0)
    const item = await newFixture(), before = await state(client(), item), count = transactionCount
    writes.length = 0
    const result = await submit(item), events = [...writes]
    expect(result.replayed).toBe(false)
    expect(transactionCount - count).toBe(1)
    assertPublicationOrder(events)
    const committed = await assertPublished(item)
    expect(committed.journey.e2AdmissionVersion - before.journey.e2AdmissionVersion).toBe(2)
    expect(committed.modules).toEqual(before.modules)
    expect(committed.groups).toEqual(before.groups)
    expect(committed.locators).toEqual(before.locators)
    expect(committed.policy).toEqual(before.policy)
    expect(committed.artifacts).toEqual(before.artifacts)
    expect(committed.authorizations).toEqual(before.authorizations)
    expect(committed.bindings).toEqual(before.bindings)
    for (const prior of before.coverage)
      expect(committed.coverage.find(row => row.kind === prior.kind)).toEqual({ ...prior, epoch: prior.epoch + 1 })
    for (const prior of before.guards) {
      const selected = committed.claims.some(claim => claim.kind === prior.kind && claim.resourceId === prior.resourceId)
      expect(committed.guards.find(row => row.kind === prior.kind && row.resourceId === prior.resourceId))
        .toEqual({ ...prior, epoch: prior.epoch + (selected ? 1 : 0) })
    }
    writes.length = 0
    const replayCount = transactionCount, replay = await submit(item), replayEvents = [...writes]
    expect(replay.replayed).toBe(true)
    expect(replay.discoveryRevision).toEqual(committed.revision)
    expect(transactionCount - replayCount).toBe(1)
    expect(replayEvents.filter(event => !authorizationFence(event))).toEqual([])
    // Authentication retains M03's ownershipVersion CAS. No ordinary E2 CAS,
    // typed-source/Use/Claim/coverage/guard/terminal/retirement writer may recur.
    expect(await state(client(), item)).toEqual({ ...committed,
      journey: { ...committed.journey, ownershipVersion: committed.journey.ownershipVersion + 1 } })
  })

  it('rolls back actual typed publication ACTIVE Use complete Claims terminal rows and final retirement after a real post-write failure', async () => {
    expect(unusedBrowser.calls).toBe(0)
    const item = await newFixture(), before = await state(client(), item), count = transactionCount
    let sawAllWritesBeforeFailure = false
    writes.length = 0
    afterWrite = async (tx, event) => {
      if (!retirementWrite(event)) return
      expect(event.result).toEqual({ count: 1 })
      const staged = await state(tx, item)
      expect(staged.revision.resourceResolutionHash).toBe(hashResourceResolutionBundle(item.bundle))
      expect(staged.uses).toHaveLength(1)
      expect(staged.uses[0]).toMatchObject({ state: 'ACTIVE', claimSetCount: 4 })
      expect(staged.claims).toHaveLength(4)
      expect(staged.attempts.find(row => row.id === item.ids.attempt)?.status).toBe('COMPLETED')
      expect(staged.workItems.find(row => row.id === item.resourceWorkItemId)?.status).toBe('COMPLETED')
      expect(staged.retirement).toMatchObject({ state: 'RETIRE_REQUESTED', version: 1 })
      expect(staged.journey.e2AdmissionVersion).toBe(before.journey.e2AdmissionVersion + 2)
      sawAllWritesBeforeFailure = true
      throw fixtureFault
    }
    try { await expect(submit(item)).rejects.toBe(fixtureFault) }
    finally { afterWrite = undefined }
    expect(sawAllWritesBeforeFailure).toBe(true)
    expect(transactionCount - count).toBe(1)
    assertPublicationOrder(writes)
    expect(await state(client(), item)).toEqual(before)
  })

  it('refuses UNKNOWN domain coverage after actual typed source publication and rolls back without a Use terminal writer or retry', async () => {
    expect(unusedBrowser.calls).toBe(0)
    const item = await newFixture(true), before = await state(client(), item), count = transactionCount
    expect(before.coverage.find(row => row.kind === 'TEST_CASE')!.state).toBe('UNKNOWN')
    let sawTypedPublication = false
    writes.length = 0
    afterWrite = async (tx, event) => {
      if (!resolutionWrite(event)) return
      expect(event.result).toEqual({ count: 1 })
      const staged = await state(tx, item)
      expect(staged.revision.resourceResolutionHash).toBe(hashResourceResolutionBundle(item.bundle))
      expect(staged.revision.resourceResolutionJson).toBe(json(item.bundle))
      expect(staged.uses).toEqual([])
      expect(staged.claims).toEqual([])
      expect(staged.attempts.find(row => row.id === item.ids.attempt)?.status).toBe('IN_PROGRESS')
      sawTypedPublication = true
    }
    try { await expect(submit(item)).rejects.toMatchObject({ code: 'CONFLICT',
      details: { protocol: 'M06_SHARED_USE_V1', reason: 'DOMAIN_COVERAGE_INCOMPLETE_OR_CORRUPT' } }) }
    finally { afterWrite = undefined }
    expect(sawTypedPublication).toBe(true)
    expect(transactionCount - count).toBe(1)
    expect(writes.filter(admission)).toHaveLength(1)
    expect(writes.filter(resolutionWrite)).toHaveLength(1)
    expect(writes.filter(event => useActivation(event) || terminalAttemptWrite(event) || terminalItemWrite(event) || retirementWrite(event))).toEqual([])
    expect(await state(client(), item)).toEqual(before)
  })
})
