import type { Prisma, PrismaClient, TargetProject } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), initialize: vi.fn(), fs: vi.fn(), git: vi.fn() }))
vi.mock('@/config/db-config', () => ({ default: new Proxy({}, {
  get() { throw new Error('Production root DB carrier must not execute in deletion unit tests') },
}) }))
vi.mock('@/services/coordinator/quality-journey-shared-resource-guard-service', () => ({
  prepareSharedResourceMutationInTransaction: mocks.prepare,
  initializeNewTargetSharedResourceCoverage: mocks.initialize,
}))
vi.mock('node:fs', () => ({ existsSync: mocks.fs, promises: new Proxy({}, { get: () => mocks.fs }) }))
vi.mock('node:child_process', () => ({ execFile: mocks.git }))

import { deleteTargetProject } from './target-project-service'

// Inert callback/ordering tests only. These delegates never represent SQLite,
// real rollback/cascades or SDK/provider qualification.
const targetProjectId = 'target-delete'
const sample = new Date('2026-10-25T00:00:00.000Z')
const modelNames = [
  'targetProject', 'module', 'locatorGroup', 'locator', 'testSuite', 'testCase', 'templateTestCase', 'environment', 'tag',
  'testCaseStep', 'templateTestCaseStep', 'testCaseStepParameter', 'templateTestCaseStepParameter',
  'testCaseFlowBlock', 'templateTestCaseFlowBlock', 'testCaseFlowBlockNode', 'templateTestCaseFlowBlockNode',
  'conflictResolution', 'testCaseMetrics', 'testSuiteMetrics', 'dashboardMetrics', 'projectResourceOwnership', 'projectResourceImport',
  'review', 'linkedJiraTicket', 'testRunTestCase', 'reportTestCase', 'testRun',
  'qualityJourneyAutomationMaterialization', 'qualityJourneyAutomationTargetBinding', 'qualityJourneyLocatorEnsureReceipt',
  'qualityJourneyExecutionCycle', 'collaborationEntityMap', 'collaborationEnvironmentMapping',
  'qualityJourney', 'qualityJourneyOwnedBrowser', 'qualityJourneyDraft', 'qualityJourneyCoordinatorSession',
  'qualityJourneyWorkAttemptSessionBinding', 'qualityJourneyCoordinatorHandoff', 'qualityJourneyArtifact',
  'qualityJourneyAnalysisRevision', 'qualityJourneyDiscoveryRevision', 'qualityJourneyScenarioPortfolioRevision',
  'qualityJourneyPreparedRuntimeCapsule', 'qualityJourneyExecutionConsent', 'qualityJourneyExecutionRerunProposal',
  'qualityJourneyCommand', 'qualityJourneyEvent', 'qualityJourneyWorkItem', 'qualityJourneyWorkAuthorization',
  'qualityJourneyExternalWorkClaimReceipt', 'qualityJourneyExternalSubmissionAcceptance', 'qualityJourneyBlocker',
  'qualityJourneyArtifactLink', 'agentPreflightReceipt', 'runtimeCapsule', 'runtimeCapsuleBlob', 'runtimeCapsuleLease',
  'report', 'collaborationBinding', 'qualityJourneyProviderRun', 'qualityJourneyE2CampaignPolicy',
  'qualityJourneyE2OperationPreparation', 'qualityJourneyE2Retirement', 'qualityJourneyE2ActorCustody',
  'qualityJourneyE2Grant', 'qualityJourneyWakeIntent', 'qualityJourneySharedResourceUse', 'qualityJourneySharedResourceClaim',
  'qualityJourneySharedResourceCoverage', 'qualityJourneySharedResourceGuard',
] as const
type Model = typeof modelNames[number]
type IdList = { in: string[] }
type Relation = { some: { id: string } }
type Where = {
  targetProjectId?: string; id?: string | IdList; parentId?: IdList; moduleId?: IdList; locatorGroupId?: IdList;
  TestSuite?: Relation; testCases?: Relation; testSuites?: Relation; tags?: Relation;
  testCaseId?: IdList; templateTestCaseId?: IdList; flowBlockId?: IdList;
  entityType?: string; entityId?: IdList; OR?: Where[];
}
type Query = { where?: Where; select?: Record<string, boolean>; take?: number }
type Row = { id: string; [field: string]: unknown }
type Delegate = { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> }
let tx: Record<Model, Delegate>, calls: string[], prepared: boolean, rows: Partial<Record<Model, Row[]>>
let transaction: ReturnType<typeof vi.fn>, client: PrismaClient
const target = { id: targetProjectId, displayName: 'Synthetic deletion target', kind: 'LOCAL_WORKSPACE',
  canonicalIdentity: 'path:/synthetic-only', canonicalPath: '/synthetic-only', normalizedRemoteOrigin: null,
  description: null, packageName: null, packageManager: null, packageJson: null, fingerprint: 'synthetic-only',
  createdAt: sample, updatedAt: sample, lastDetectedAt: sample } satisfies TargetProject
function projected(row: Row, select?: Record<string, boolean>) {
  return Object.fromEntries((select ? Object.keys(select).filter(key => select[key]) : Object.keys(row)).map(key => {
    if (!Object.hasOwn(row, key)) throw new Error(`Fixture omitted selected field: ${key}`)
    const value = row[key]
    return [key, value instanceof Date ? new Date(value.getTime()) : value]
  }))
}
function read(model: Model, method: string) {
  if (prepared) throw new Error(`Unexpected post-preparation authoring read: ${model}.${method}`)
  calls.push(`read:${model}.${method}`)
}
function scopedRows(model: Model, query: Query): Row[] {
  const where = query.where ?? {}, available = rows[model] ?? []
  const { targetProjectId: scope, parentId, moduleId, locatorGroupId, TestSuite, testCases, testSuites,
    tags, id, testCaseId, templateTestCaseId, flowBlockId, OR } = where
  const has = (values: readonly string[], value: unknown) => typeof value === 'string' && values.includes(value)
  const related = (row: Row, field: string, selected: string) => {
    const value = row[field]
    return Array.isArray(value) && value.includes(selected)
  }
  if (scope) return available.filter(row => row.targetProjectId === scope)
  if (model === 'module' && parentId) return available.filter(row => has(parentId.in, row.parentId))
  if ((model === 'locatorGroup' || model === 'testSuite') && moduleId) return available.filter(row => has(moduleId.in, row.moduleId))
  if (model === 'locator' && locatorGroupId) return available.filter(row => has(locatorGroupId.in, row.locatorGroupId))
  if (model === 'testCase' && TestSuite) return available.filter(row => related(row, 'suiteIds', TestSuite.some.id))
  if (model === 'testSuite' && testCases) return available.filter(row => related(row, 'caseIds', testCases.some.id))
  if (model === 'tag' && testSuites) return available.filter(row => related(row, 'suiteIds', testSuites.some.id))
  if (model === 'tag' && testCases) return available.filter(row => related(row, 'caseIds', testCases.some.id))
  if ((model === 'testSuite' || model === 'testCase') && tags) return available.filter(row => related(row, 'tagIds', tags.some.id))
  if (id && typeof id !== 'string') return available.filter(row => has(id.in, row.id))
  if (testCaseId) return available.filter(row => has(testCaseId.in, row.testCaseId))
  if (templateTestCaseId) return available.filter(row => has(templateTestCaseId.in, row.templateTestCaseId))
  if (flowBlockId) return available.filter(row => has(flowBlockId.in, row.flowBlockId))
  // Explicit OR query fixtures supply all matching own/incoming rows. They do
  // not target-filter incoming edges or synthesize absent selected fields.
  if (model === 'projectResourceOwnership' && OR) return available.filter(row =>
    row.targetProjectId === targetProjectId || OR.some(clause =>
      clause.entityType === row.entityType && clause.entityId && has(clause.entityId.in, row.entityId)))
  if (OR) return available
  return []
}
function noWrites() {
  expect(mocks.prepare).not.toHaveBeenCalled()
  expect(calls.some(call => call.startsWith('write:'))).toBe(false)
  expect(calls).toContain('rollback-signal')
}
function populate() {
  const owned = { targetProjectId, archivedAt: null, collaborationManaged: false }
  rows.module = [{ id: 'module-parent', ...owned, parentId: null }, { id: 'module-leaf', ...owned, parentId: 'module-parent', archivedAt: sample, collaborationManaged: true }]
  rows.locatorGroup = [{ id: 'group', ...owned, moduleId: 'module-leaf' }]
  rows.locator = [{ id: 'locator', ...owned, locatorGroupId: 'group', archivedAt: sample, collaborationManaged: true }]
  rows.testSuite = [{ id: 'suite', ...owned, moduleId: 'module-leaf', caseIds: ['case'], tagIds: ['tag'] }]
  rows.testCase = [{ id: 'case', ...owned, suiteIds: ['suite'], tagIds: ['tag'], archivedAt: sample, collaborationManaged: true }]
  rows.templateTestCase = [{ id: 'template', ...owned }]
  rows.environment = [{ id: 'environment', ...owned }]
  rows.tag = [{ id: 'tag', ...owned, suiteIds: ['suite'], caseIds: ['case'] }]
  rows.testCaseStep = [{ id: 'step', testCaseId: 'case' }]
  rows.templateTestCaseStep = [{ id: 'template-step', templateTestCaseId: 'template' }]
  rows.testCaseStepParameter = [{ id: 'parameter', testCaseStepId: 'step', locatorId: 'locator' }]
  rows.templateTestCaseStepParameter = [{ id: 'template-parameter', testCaseStepId: 'template-step', locatorId: 'locator', defaultLocatorId: 'locator' }]
  rows.testCaseFlowBlock = [{ id: 'block', testCaseId: 'case' }]
  rows.templateTestCaseFlowBlock = [{ id: 'template-block', templateTestCaseId: 'template' }]
  rows.testCaseFlowBlockNode = [{ id: 'node', flowBlockId: 'block' }]
  rows.templateTestCaseFlowBlockNode = [{ id: 'template-node', flowBlockId: 'template-block' }]
  rows.conflictResolution = [{ id: 'conflict', entityType: 'LOCATOR', entityId: 'locator', conflictingEntityId: null }]
  rows.testCaseMetrics = [{ id: 'case-metrics', ...owned, testCaseId: 'case' }]
  rows.testSuiteMetrics = [{ id: 'suite-metrics', ...owned, testSuiteId: 'suite' }]
  rows.dashboardMetrics = [{ id: 'dashboard-metrics', ...owned }]
  rows.projectResourceOwnership = [{ id: 'ownership', targetProjectId, entityType: 'locator', entityId: 'locator', scope: 'project' }]
  rows.projectResourceImport = [{ id: 'import', sourceOwnershipId: 'ownership', destinationProjectId: targetProjectId, sharingMode: 'copy' }]
}
beforeEach(() => {
  vi.resetAllMocks()
  calls = []; prepared = false; rows = {}
  mocks.fs.mockImplementation(() => { throw new Error('Unexpected filesystem access') })
  mocks.git.mockImplementation(() => { throw new Error('Unexpected Git/process call') })
  mocks.initialize.mockImplementation(() => { throw new Error('Deletion must not initialize coverage') })
  tx = Object.fromEntries(modelNames.map(model => [model, {
    findMany: vi.fn(async (query: Query) => { read(model, 'findMany'); return scopedRows(model, query).map(row => projected(row, query.select)) }),
    findFirst: vi.fn(async () => { read(model, 'findFirst'); return null }),
    findUnique: vi.fn(async () => { read(model, 'findUnique'); return null }),
    deleteMany: vi.fn(async ({ where }: Query) => {
      if (!prepared) throw new Error(`Write before complete batch: ${model}`)
      if (model.startsWith('qualityJourney') || ['testRun', 'report', 'review', 'linkedJiraTicket', 'runtimeCapsule', 'runtimeCapsuleBlob', 'runtimeCapsuleLease'].includes(model))
        throw new Error(`Retained model must not be erased: ${model}`)
      calls.push(`write:${model}:${JSON.stringify(where)}`)
      const selected = where?.id
      if (!selected) throw new Error('Fixture deletion omitted its exact id set')
      return { count: typeof selected === 'string' ? 1 : selected.in.length }
    }),
  }])) as Record<Model, Delegate>
  tx.targetProject.findUnique.mockImplementation(async () => { read('targetProject', 'findUnique'); return { ...target } })
  mocks.prepare.mockImplementation(async () => { calls.push('prepare'); prepared = true })
  transaction = vi.fn(async (callback: (value: Prisma.TransactionClient) => Promise<unknown>) => {
    prepared = false
    calls.push('begin')
    try { const result = await callback(tx as unknown as Prisma.TransactionClient); calls.push('commit-signal'); return result }
    catch (error) { calls.push('rollback-signal'); throw error }
  })
  client = new Proxy({}, { get(_target, key) {
    if (key === '$transaction') return transaction
    throw new Error(`Unexpected root client operation: ${String(key)}`)
  } }) as PrismaClient
})

describe('Target deletion exact owner effects', () => {
  it('deletes an empty target through one supported owner with an empty batch and retained coverage', async () => {
    await expect(deleteTargetProject(targetProjectId, client)).resolves.toEqual(target)
    expect(transaction).toHaveBeenCalledOnce()
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, { existing: [], newRoots: [], deleted: [] })
    expect(calls.filter(call => call.startsWith('write:'))).toEqual([`write:targetProject:${JSON.stringify({ id: targetProjectId })}`])
    expect(mocks.initialize).not.toHaveBeenCalled()
    expect(mocks.fs).not.toHaveBeenCalled()
    expect(mocks.git).not.toHaveBeenCalled()
  })

  it('prepares the complete five-kind archived and managed closure before metadata child metrics root and target deletes', async () => {
    populate()
    await expect(deleteTargetProject(targetProjectId, client)).resolves.toEqual(target)
    const expected = [
      { kind: 'LOCATOR', resourceId: 'locator' }, { kind: 'LOCATOR_GROUP', resourceId: 'group' },
      { kind: 'MODULE', resourceId: 'module-leaf' }, { kind: 'MODULE', resourceId: 'module-parent' },
      { kind: 'TEST_CASE', resourceId: 'case' }, { kind: 'TEST_SUITE', resourceId: 'suite' },
    ]
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, { existing: expected, newRoots: [], deleted: expected })
    expect(calls.filter(call => call.startsWith('write:')).map(call => call.split(':')[1])).toEqual([
      'projectResourceImport', 'projectResourceOwnership', 'testCaseStepParameter', 'templateTestCaseStepParameter',
      'testCaseFlowBlockNode', 'templateTestCaseFlowBlockNode', 'testCaseStep', 'templateTestCaseStep',
      'testCaseFlowBlock', 'templateTestCaseFlowBlock', 'testCaseMetrics', 'testSuiteMetrics', 'dashboardMetrics',
      'testCase', 'templateTestCase', 'testSuite', 'conflictResolution', 'locator', 'locatorGroup',
      'module', 'module', 'environment', 'tag', 'targetProject',
    ])
    expect(tx.module.deleteMany.mock.calls.map(([query]) => query.where.id)).toEqual(['module-leaf', 'module-parent'])
    expect(tx.module.findMany.mock.calls[0][0].where).toEqual({ targetProjectId })
    expect(tx.locator.findMany.mock.calls[0][0].where).toEqual({ targetProjectId })
    expect(tx.testCase.findMany.mock.calls[0][0].where).toEqual({ targetProjectId })
    expect(calls.indexOf('prepare')).toBeLessThan(calls.findIndex(call => call.startsWith('write:')))
    expect(calls.slice(calls.indexOf('prepare') + 1).some(call => call.startsWith('read:'))).toBe(false)
    expect(tx.qualityJourneySharedResourceCoverage.deleteMany).not.toHaveBeenCalled()
    expect(tx.qualityJourneySharedResourceGuard.deleteMany).not.toHaveBeenCalled()
    expect(tx.qualityJourneySharedResourceUse.deleteMany).not.toHaveBeenCalled()
    expect(tx.qualityJourneySharedResourceClaim.deleteMany).not.toHaveBeenCalled()
  })

  it('keeps a foreign source ownership target and root read-only while removing only this target destination import', async () => {
    rows.projectResourceOwnership = [{ id: 'foreign-ownership', targetProjectId: 'foreign-target', entityType: 'module', entityId: 'foreign-module', scope: 'global_library' }]
    rows.projectResourceImport = [{ id: 'own-import', sourceOwnershipId: 'foreign-ownership', destinationProjectId: targetProjectId, sharingMode: 'immutable_reference' }]
    rows.targetProject = [{ id: 'foreign-target' }]
    tx.module.findFirst.mockImplementation(async (query: Query) => {
      read('module', 'findFirst')
      expect(query.where).toEqual({ id: 'foreign-module' })
      return projected({ id: 'foreign-module', targetProjectId: 'foreign-target' }, query.select)
    })
    await expect(deleteTargetProject(targetProjectId, client)).resolves.toEqual(target)
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, { existing: [], newRoots: [], deleted: [] })
    expect(tx.projectResourceImport.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: { in: ['own-import'] } } })
    expect(tx.projectResourceOwnership.deleteMany).not.toHaveBeenCalled()
    expect(tx.module.deleteMany).not.toHaveBeenCalled()
    expect(rows.projectResourceOwnership![0]?.targetProjectId).toBe('foreign-target')
  })

  it('refuses a foreign destination import before preparation instead of erasing it with its source ownership', async () => {
    populate()
    rows.projectResourceImport![0]!.destinationProjectId = 'foreign-target'
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
    expect(rows.projectResourceImport![0]!.destinationProjectId).toBe('foreign-target')
  })

  it('refuses unknown or global-only own ownership classes before preparation', async () => {
    populate()
    rows.projectResourceOwnership![0]!.entityType = 'step-definition'
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
    expect(mocks.prepare).not.toHaveBeenCalled()
  })

  it('refuses missing source ownership and source resources without removing destination imports', async () => {
    rows.projectResourceImport = [{ id: 'own-import', sourceOwnershipId: 'missing-source', destinationProjectId: targetProjectId, sharingMode: 'copy' }]
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
    rows.projectResourceOwnership = [{ id: 'missing-source', targetProjectId: 'foreign-target', entityType: 'locator', entityId: 'missing-locator', scope: 'global_library' }]
    rows.targetProject = [{ id: 'foreign-target' }]
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.locator.findFirst).toHaveBeenCalledWith({ where: { id: 'missing-locator' }, select: { id: true, targetProjectId: true } })
    noWrites()
  })

  it('refuses a foreign ownership record that points at an owned physical root', async () => {
    populate()
    rows.projectResourceOwnership![0]!.targetProjectId = 'foreign-target'
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
  })

  it('refuses a foreign incoming Module child before any cascade or guard preparation', async () => {
    populate()
    rows.module!.push({ id: 'foreign-child', parentId: 'module-parent', targetProjectId: 'foreign-target' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.module.findMany.mock.calls[1][0].where).toEqual({ parentId: { in: ['module-leaf', 'module-parent'] } })
    noWrites()
  })

  it('refuses a cyclic Module hierarchy before planning direct leaf deletes', async () => {
    populate()
    rows.module![0]!.parentId = 'module-leaf'
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
  })

  it('refuses a foreign incoming Group or Suite under an owned Module', async () => {
    populate()
    rows.locatorGroup!.push({ id: 'foreign-group', moduleId: 'module-leaf', targetProjectId: 'foreign-target' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
    rows.locatorGroup!.pop()
    rows.testSuite!.push({ id: 'foreign-suite', moduleId: 'module-leaf', targetProjectId: 'foreign-target' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
  })

  it('refuses foreign incoming Locators and foreign old Group endpoints without target-filtering them', async () => {
    populate()
    rows.locator!.push({ id: 'foreign-locator', locatorGroupId: 'group', targetProjectId: 'foreign-target' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
    rows.locator!.pop()
    rows.locator![0]!.locatorGroupId = 'foreign-group'
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
  })

  it('refuses foreign Case and Suite endpoints on both directions of the membership join', async () => {
    populate()
    rows.testCase!.push({ id: 'foreign-case', targetProjectId: 'foreign-target', suiteIds: ['suite'] })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
    rows.testCase!.pop()
    rows.testSuite!.push({ id: 'foreign-suite', targetProjectId: 'foreign-target', moduleId: 'foreign-module', caseIds: ['case'] })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
  })

  it('refuses foreign Tag references from owned Cases and owned Tags referencing foreign Suites', async () => {
    populate()
    rows.tag!.push({ id: 'foreign-tag', targetProjectId: 'foreign-target', caseIds: ['case'] })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
    rows.tag!.pop()
    rows.testSuite!.push({ id: 'foreign-suite', targetProjectId: 'foreign-target', moduleId: 'foreign-module', tagIds: ['tag'] })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
  })

  it('refuses foreign incoming Case parameters and foreign outgoing Locator endpoints', async () => {
    populate()
    rows.testCaseStepParameter!.push({ id: 'foreign-parameter', testCaseStepId: 'foreign-step', locatorId: 'locator' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
    rows.testCaseStepParameter!.pop()
    rows.testCaseStepParameter![0]!.locatorId = 'foreign-locator'
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
  })

  it('refuses foreign incoming template default Locator effects and mismatched template parameter endpoints', async () => {
    populate()
    rows.templateTestCaseStepParameter!.push({ id: 'foreign-template-parameter', testCaseStepId: 'foreign-template-step', locatorId: null, defaultLocatorId: 'locator' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
    rows.templateTestCaseStepParameter!.pop()
    rows.templateTestCaseStepParameter![0]!.defaultLocatorId = 'foreign-default-locator'
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
  })

  it('refuses ConflictResolution metadata when either Locator endpoint is outside the physical root set', async () => {
    populate()
    rows.conflictResolution![0]!.conflictingEntityId = 'foreign-locator'
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
    rows.conflictResolution![0]!.conflictingEntityId = 'locator'
    rows.conflictResolution![0]!.entityId = 'foreign-locator'
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
  })

  it('refuses foreign or mismatched nonsemantic metrics before deleting any projection', async () => {
    populate()
    rows.testCaseMetrics![0]!.targetProjectId = 'foreign-target'
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
    rows.testCaseMetrics![0]!.targetProjectId = targetProjectId
    rows.testCaseMetrics![0]!.testCaseId = 'foreign-case'
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    noWrites()
  })

  it('refuses retained reviews Jira and report Case scalar history before preparation', async () => {
    populate()
    tx.review.findFirst.mockResolvedValue({ id: 'review-history' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    tx.review.findFirst.mockResolvedValue(null)
    tx.linkedJiraTicket.findFirst.mockResolvedValue({ id: 'jira-history' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    tx.linkedJiraTicket.findFirst.mockResolvedValue(null)
    tx.reportTestCase.findFirst.mockResolvedValue({ id: 'foreign-report-history', testCaseId: 'case' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })

  it('refuses retained runs capsules blobs leases and preflight receipts before any erasure', async () => {
    populate()
    tx.testRun.findFirst.mockImplementation(async (query: Query) => query.where?.OR ? { id: 'foreign-run-on-own-environment' } : null)
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    expect(tx.testRun.findFirst.mock.calls.some(([query]) => JSON.stringify(query.where) === JSON.stringify({ OR: [{ targetProjectId }, { environmentId: { in: ['environment'] } }] }))).toBe(true)
    tx.testRun.findFirst.mockResolvedValue(null)
    tx.runtimeCapsule.findFirst.mockResolvedValue({ id: 'capsule-history' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    tx.runtimeCapsule.findFirst.mockResolvedValue(null)
    tx.runtimeCapsuleBlob.findFirst.mockResolvedValue({ id: 'blob-history' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    tx.runtimeCapsuleBlob.findFirst.mockResolvedValue(null)
    tx.runtimeCapsuleLease.findFirst.mockResolvedValue({ id: 'lease-history' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    tx.runtimeCapsuleLease.findFirst.mockResolvedValue(null)
    tx.agentPreflightReceipt.findFirst.mockResolvedValue({ id: 'preflight-history' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })

  it('refuses historical Suite membership references rather than applying their cascade or SET NULL', async () => {
    populate()
    tx.testRunTestCase.findFirst.mockResolvedValue({ id: 'run-case-history', testSuiteId: 'suite' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.testRunTestCase.findFirst.mock.calls[0][0].where).toEqual({ OR: [
      { testCaseId: { in: ['case'] } }, { testSuiteId: { in: ['suite'] } },
    ] })
    noWrites()
  })

  it('refuses Journey Draft Handoff and Collaboration target lineage before deleting ownership', async () => {
    populate()
    tx.qualityJourney.findFirst.mockResolvedValue({ id: 'journey-history' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    tx.qualityJourney.findFirst.mockResolvedValue(null)
    tx.qualityJourneyDraft.findFirst.mockResolvedValue({ id: 'draft-history' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    tx.qualityJourneyDraft.findFirst.mockResolvedValue(null)
    tx.qualityJourneyCoordinatorHandoff.findFirst.mockResolvedValue({ id: 'handoff-history' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    tx.qualityJourneyCoordinatorHandoff.findFirst.mockResolvedValue(null)
    tx.collaborationBinding.findFirst.mockResolvedValue({ id: 'collaboration-history' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })

  it('refuses foreign bare materialization binding ensure and collaboration references without deleting their rows', async () => {
    populate()
    tx.qualityJourneyAutomationMaterialization.findFirst.mockResolvedValue({ id: 'foreign-materialization' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    expect(tx.qualityJourneyAutomationMaterialization.findFirst.mock.calls[0][0].where).toEqual({ OR: [
      { targetProjectId }, { suiteId: { in: ['suite'] } }, { testCaseId: { in: ['case'] } },
    ] })
    tx.qualityJourneyAutomationMaterialization.findFirst.mockResolvedValue(null)
    tx.qualityJourneyAutomationTargetBinding.findFirst.mockResolvedValue({ id: 'foreign-target-binding' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    tx.qualityJourneyAutomationTargetBinding.findFirst.mockResolvedValue(null)
    tx.qualityJourneyLocatorEnsureReceipt.findFirst.mockResolvedValue({ id: 'foreign-ensure' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    expect(tx.qualityJourneyLocatorEnsureReceipt.findFirst.mock.calls[0][0].where).toEqual({ OR: [
      { targetProjectId }, { moduleId: { in: ['module-leaf', 'module-parent'] } },
      { locatorGroupId: { in: ['group'] } }, { locatorId: { in: ['locator'] } },
    ] })
    tx.qualityJourneyLocatorEnsureReceipt.findFirst.mockResolvedValue(null)
    tx.collaborationEntityMap.findFirst.mockResolvedValue({ id: 'foreign-collaboration-map' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })

  it('refuses active retained Uses and Claims even for a target with no authored roots', async () => {
    tx.qualityJourneySharedResourceUse.findFirst.mockResolvedValue({ id: 'active-use' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    tx.qualityJourneySharedResourceUse.findFirst.mockResolvedValue(null)
    tx.qualityJourneySharedResourceClaim.findFirst.mockResolvedValue({ id: 'active-claim' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })

  it('refuses examined row sentinel and total five-kind key overflow before preparation', async () => {
    tx.module.findMany.mockResolvedValueOnce(Array.from({ length: 65_537 }, (_, index) => ({ id: `module-${index}`, targetProjectId, parentId: null })))
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    rows.module = Array.from({ length: 4097 }, (_, index) => ({ id: `module-${index}`, targetProjectId, parentId: null }))
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })

  it('refuses missing projected relationship fields and duplicate root identities before preparation', async () => {
    rows.module = [{ id: 'module', targetProjectId }]
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toThrow('Fixture omitted selected field: parentId'); noWrites()
    rows.module = [{ id: 'module', targetProjectId, parentId: null }, { id: 'module', targetProjectId, parentId: null }]
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })

  it('validates the immutable id before awaiting and resolves a missing target only inside its owner', async () => {
    await expect(deleteTargetProject('', client)).rejects.toMatchObject({ statusCode: 400 })
    expect(transaction).not.toHaveBeenCalled()
    tx.targetProject.findUnique.mockResolvedValue(null)
    await expect(deleteTargetProject('missing-target', client)).rejects.toMatchObject({ statusCode: 404 })
    expect(transaction).toHaveBeenCalledOnce()
    expect(tx.targetProject.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: 'missing-target' } })
    noWrites()
  })

  it('fails closed for a client without an owning transaction or an incomplete transaction capability', async () => {
    await expect(deleteTargetProject(targetProjectId, {} as PrismaClient)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.prepare).not.toHaveBeenCalled()
    const incomplete = { $transaction: vi.fn(async callback => callback({ targetProject: { findUnique: async () => ({ ...target }) } })) } as unknown as PrismaClient
    await expect(deleteTargetProject(targetProjectId, incomplete)).rejects.toThrow()
    expect(mocks.prepare).not.toHaveBeenCalled()
  })

  it('propagates exact guard failure without writes retries or coverage initialization', async () => {
    populate()
    const failure = new Error('synthetic guard refusal')
    mocks.prepare.mockRejectedValue(failure)
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toBe(failure)
    expect(mocks.prepare).toHaveBeenCalledOnce()
    expect(transaction).toHaveBeenCalledOnce()
    expect(calls.some(call => call.startsWith('write:'))).toBe(false)
    expect(calls.at(-1)).toBe('rollback-signal')
    expect(mocks.initialize).not.toHaveBeenCalled()
  })

  it('propagates a child deletion failure through the same owner without reaching later roots', async () => {
    populate()
    const failure = new Error('synthetic parameter deletion failure')
    tx.testCaseStepParameter.deleteMany.mockRejectedValue(failure)
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toBe(failure)
    expect(transaction).toHaveBeenCalledOnce()
    expect(mocks.prepare).toHaveBeenCalledOnce()
    expect(tx.testCase.deleteMany).not.toHaveBeenCalled()
    expect(tx.targetProject.deleteMany).not.toHaveBeenCalled()
    expect(calls.at(-1)).toBe('rollback-signal')
  })

  it('rejects a direct Module count mismatch without relaxing for parent cascades', async () => {
    populate()
    tx.module.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.module.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: 'module-leaf', targetProjectId } })
    expect(tx.targetProject.deleteMany).not.toHaveBeenCalled()
    expect(calls.at(-1)).toBe('rollback-signal')
  })

  it('rejects the final Target count mismatch and propagates final delete failures without retry', async () => {
    tx.targetProject.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    expect(calls.at(-1)).toBe('rollback-signal')
    const failure = new Error('synthetic final target delete failure')
    tx.targetProject.deleteMany.mockRejectedValueOnce(failure)
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toBe(failure)
    expect(transaction).toHaveBeenCalledTimes(2)
    expect(calls.at(-1)).toBe('rollback-signal')
  })

  it('rejects a mismatched canonical Target row inside the owner without collecting effects', async () => {
    tx.targetProject.findUnique.mockResolvedValue({ ...target, id: 'foreign-target' })
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.module.findMany).not.toHaveBeenCalled()
    noWrites()
  })

  it('waits for the owning transaction commit before returning the original Target record', async () => {
    let release!: () => void, entered!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const reached = new Promise<void>(resolve => { entered = resolve })
    transaction.mockImplementationOnce(async (callback: (value: Prisma.TransactionClient) => Promise<unknown>) => {
      calls.push('begin')
      const result = await callback(tx as unknown as Prisma.TransactionClient)
      entered()
      await held
      calls.push('commit-signal')
      return result
    })
    let returned = false
    const pending = deleteTargetProject(targetProjectId, client).then(result => { returned = true; return result })
    await reached
    expect(returned).toBe(false)
    expect(calls).not.toContain('commit-signal')
    release()
    await expect(pending).resolves.toEqual(target)
    expect(calls.at(-1)).toBe('commit-signal')
  })

  it('refuses an owned Tag referenced by a foreign retained run before any join cleanup', async () => {
    populate()
    tx.testRun.findFirst.mockImplementation(async (query: Query) => query.where?.tags ? { id: 'foreign-run-history' } : null)
    await expect(deleteTargetProject(targetProjectId, client)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.testRun.findFirst).toHaveBeenCalledExactlyOnceWith({ where: { tags: { some: { id: 'tag' } } }, select: { id: true } })
    noWrites()
  })

})
