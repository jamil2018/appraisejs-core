import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyCollaborationRecords, applyCollaborationRecordsInTransaction } from './materialization-service'
import { planCollaborationMaterialization } from './materialization-plan'
import { executeCollaborationOperation } from './operation-service'
import { collaborationHash } from '../../lib/repository-collaboration/canonical'
import { prepareThreeWayCollaboration } from '../../lib/repository-collaboration/reconciliation'
import { recordKey } from '../../lib/repository-collaboration/graph'
import type { CollaborationRecord } from '../../lib/repository-collaboration/contracts'
import { computeStepReferenceHash, type StepDefinition } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

const { root, tx, permission, prepare, moduleEffects, projection, journal } = vi.hoisted(() => {
  const delegate = () => ({ findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(),
    create: vi.fn(), createMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn(), count: vi.fn() })
  const client = () => ({ module: delegate(), locatorGroup: delegate(), locator: delegate(), tag: delegate(),
    testCase: delegate(), testSuite: delegate(), testRun: delegate(), templateTestCase: delegate(), stepDefinition: delegate(),
    testCaseStep: delegate(), testCaseStepParameter: delegate(), testCaseFlowBlock: delegate(), testCaseFlowBlockNode: delegate(),
    templateTestCaseStep: delegate(), templateTestCaseStepParameter: delegate(), templateTestCaseFlowBlock: delegate(),
    templateTestCaseFlowBlockNode: delegate(), conflictResolution: delegate(), environment: delegate(),
    collaborationEntityMap: delegate(), collaborationEnvironmentMapping: delegate(), collaborationReuseAsset: delegate(),
    collaborationBaseline: delegate(), collaborationOperation: delegate(), collaborationOperationStep: delegate(),
    collaborationOperationArtifact: delegate(), collaborationDecision: delegate() })
  return { root: { ...client(), $transaction: vi.fn() }, tx: client(), permission: vi.fn(), prepare: vi.fn(),
    moduleEffects: vi.fn(), projection: vi.fn(), journal: vi.fn() }
})
vi.mock('@/config/db-config', () => ({ default: root }))
// Keep pure canonical/graph/contracts/reconciliation real, while closing the filesystem/Git barrel.
vi.mock('@/lib/repository-collaboration', async () => ({
  ...await import('../../lib/repository-collaboration/canonical'),
  ...await import('../../lib/repository-collaboration/contracts'),
  ...await import('../../lib/repository-collaboration/graph'),
  ...await import('../../lib/repository-collaboration/reconciliation'),
  buildCollaborationSnapshotFiles: vi.fn(() => { throw new Error('Unexpected filesystem path') }),
  recoverCollaborationSnapshot: vi.fn(() => { throw new Error('Unexpected filesystem path') }),
  installCollaborationSnapshot: vi.fn(() => { throw new Error('Unexpected filesystem path') }),
  observeCollaborationSnapshot: vi.fn(() => { throw new Error('Unexpected filesystem path') }),
  fetchOperationSourceRef: vi.fn(() => { throw new Error('Unexpected Git path') }),
  classifyPinnedReceive: vi.fn(() => { throw new Error('Unexpected Git path') }),
  inspectRepository: vi.fn(() => { throw new Error('Unexpected Git path') }),
  managedReceiveSnapshotWorktreePath: vi.fn(() => { throw new Error('Unexpected Git path') }),
  observeOperationSourceRef: vi.fn(() => { throw new Error('Unexpected Git path') }),
  readCollaborationSnapshotAtCommit: vi.fn(() => { throw new Error('Unexpected Git path') }),
  readCollaborationSnapshot: vi.fn(() => { throw new Error('Unexpected filesystem path') }),
}))
vi.mock('./binding-service', () => ({ requireCollaborationPermission: permission }))
vi.mock('./projection-helpers', () => ({ projectSnapshotInTransaction: projection }))
vi.mock('./collaboration-journal-service', () => ({ appendCollaborationJournalEntry: journal }))
vi.mock('@/services/coordinator/quality-journey-shared-resource-guard-service', () => ({
  prepareSharedResourceMutationInTransaction: prepare,
}))
vi.mock('@/services/coordinator/quality-journey-shared-resource-module-mutation-effects-service', () => ({
  collectSharedModuleMutationEffectsInTransaction: moduleEffects,
}))
vi.mock('./git-operation-service', () => ({ executeCollaborationGitStep: vi.fn(() => { throw new Error('Unexpected Git step') }) }))
vi.mock('./git-mutation-lock-service', () => ({
  acquireCollaborationGitMutationLock: vi.fn(() => { throw new Error('Unexpected external authority path') }), assertCollaborationGitMutationIdentity: vi.fn(() => { throw new Error('Unexpected external authority path') }),
  assertCollaborationGitMutationLock: vi.fn(() => { throw new Error('Unexpected external authority path') }), releaseCollaborationGitMutationLock: vi.fn(() => { throw new Error('Unexpected external authority path') }),
  withCollaborationGitMutationLeaseHeartbeat: vi.fn(() => { throw new Error('Unexpected external authority path') }),
}))
vi.mock('./authority-receipt-service', () => ({ consumeCollaborationAuthorityReceipt: vi.fn(() => { throw new Error('Unexpected external authority path') }) }))
vi.mock('./divergent-reconciliation-service', () => ({ prepareDivergentCollaborationReconciliation: vi.fn(() => { throw new Error('Unexpected external authority path') }) }))

type Row = Record<string, unknown>
const project = 'project-1'
const binding = { id: 'binding-1', targetProjectId: project, portableProjectId: 'portable-project' }
const kindNames = { module: 'MODULE', 'locator-group': 'LOCATOR_GROUP', locator: 'LOCATOR', tag: 'TAG',
  'test-case': 'TEST_CASE', 'test-suite': 'TEST_SUITE', template: 'TEMPLATE',
  'environment-reference': 'ENVIRONMENT_REFERENCE', 'journey-reuse-asset': 'JOURNEY_REUSE_ASSET' } as const
const row = (id: string, extra: Row = {}) => ({ id, targetProjectId: project, archivedAt: null, collaborationManaged: false, ...extra })
const makeRecord = (kind: CollaborationRecord['kind'], portableId: string, payload: unknown, archived = false) => ({
  format: 'appraise.repository-collaboration/v1', portableProjectId: 'portable-project', kind, portableId, version: 1,
  archived, payload,
}) as CollaborationRecord
const moduleRecord = (id = 'module') => makeRecord('module', id, { name: id, parentPortableId: null })
const tagRecord = (id = 'tag') => makeRecord('tag', id, { name: id, expression: '@tag', type: 'FILTER' })
const caseRecord = (id = 'case') => makeRecord('test-case', id, { title: id, description: '', steps: [], flowBlocks: [], tagPortableIds: [] })
const suiteRecord = (ids: string[]) => makeRecord('test-suite', 'suite', { name: 'Suite', description: null,
  modulePortableId: 'module', testCasePortableIds: ids, tagPortableIds: [] })
const request = (records: CollaborationRecord[], adoptedLocalIds?: Map<string, string>) => ({
  bindingId: binding.id, expectedPolicyVersion: 1, repositoryRevision: 'revision-1', records, adoptedLocalIds,
})
let data: Record<string, Row[]>, events: string[], prepared: boolean
function mapping(record: CollaborationRecord, localEntityId: string | null) {
  data.collaborationEntityMap.push({ id: `map-${recordKey(record)}`, bindingId: binding.id,
    kind: kindNames[record.kind], portableId: record.portableId, localEntityId })
}
function projectRow(row: Row, select?: Record<string, unknown>) {
  if (!select) return structuredClone(row)
  return Object.fromEntries(Object.entries(select).filter(([, selected]) => selected).map(([key]) => {
    if (!Object.hasOwn(row, key)) throw new Error(`Fixture omitted selected field: ${key}`)
    return [key, structuredClone(row[key])]
  }))
}
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object') {
      const condition = value as Row
      if (key === 'bindingId_portableId') return matches(row, condition)
      if ('in' in condition) return (condition.in as unknown[]).includes(row[key])
      if ('some' in condition) return Array.isArray(row[key]) && (row[key] as Row[]).some(item => matches(item, condition.some as Row))
      return false
    }
    return row[key] === value
  })
}
function noMaterializationWrites() {
  expect(prepare).not.toHaveBeenCalled()
  for (const model of Object.values(tx)) {
    expect(model.create).not.toHaveBeenCalled(); expect(model.createMany).not.toHaveBeenCalled()
    expect(model.update).not.toHaveBeenCalled(); expect(model.deleteMany).not.toHaveBeenCalled(); expect(model.upsert).not.toHaveBeenCalled()
  }
}
const definition: StepDefinition = { schemaVersion: '1', identity: { id: 'fixture.collaboration', version: '1', status: 'ready' },
  provenance: { creationMethod: 'human-form', createdBy: 'unit fixture', reviewedBy: 'synthetic fixture', createdAt: '2026-10-25T00:00:00.000Z' },
  intent: { title: 'Fixture', description: 'Metadata only', capabilities: ['fixture.collaboration'], searchTerms: [], examples: ['Fixture'] },
  inputs: [], outputs: [], human: { signature: 'Given fixture', keywordCompatibility: ['Given'], parameterBindings: [], groupId: 'fixture' },
  agent: { summary: 'Fixture', usageGuidance: 'Metadata only', examples: [{ intent: 'Fixture', inputs: {} }] },
  execution: { kind: 'operation', handlerId: 'fixture.collaboration', handlerVersion: '1', runtime: 'node' }, lifecycle: {} }
function steppedCase() {
  return makeRecord('test-case', 'case', { title: 'Case', description: '', tagPortableIds: [], steps: [{ portableId: 'step',
    flowNodeId: 'node', order: 0, keyword: 'Given', gherkinStep: 'Given fixture', icon: 'MOUSE', label: 'Fixture',
    invocation: { step: { id: definition.identity.id, version: '1', definitionHash: computeStepReferenceHash(definition) }, inputs: {} },
    parameters: [{ name: 'value', value: 'text', type: 'STRING', order: 0, locatorPortableId: null }] }],
    flowBlocks: [{ portableId: 'block', name: 'Block', order: 0, flowNodeIds: ['node'] }] })
}
beforeEach(() => {
  vi.resetAllMocks(); data = {}; events = []; prepared = false
  for (const name of Object.keys(tx) as Array<keyof typeof tx>) {
    data[name] = []
    for (const method of Object.values(root[name])) method.mockImplementation(() => { throw new Error('Unexpected root delegate') })
    const read = (query: { where?: Row; select?: Row; take?: number } = {}) => {
      if (prepared && !name.startsWith('collaboration')) throw new Error(`Unexpected post-batch authority read: ${name}`)
      return data[name].filter(value => matches(value, query.where ?? {})).slice(0, query.take).map(value => projectRow(value, query.select))
    }
    tx[name].findMany.mockImplementation(async query => read(query))
    tx[name].findUnique.mockImplementation(async query => read(query)[0] ?? null)
    tx[name].findFirst.mockImplementation(async query => read(query)[0] ?? null)
    for (const method of ['create', 'createMany', 'update', 'deleteMany', 'upsert'] as const)
      tx[name][method].mockImplementation(async query => {
        if (!prepared) throw new Error(`Materialization writer before whole batch: ${name}.${method}`)
        events.push(`${name}.${method}`)
        if (method === 'createMany') return { count: query.data.length }
        if (method === 'deleteMany') return { count: 1 }
        return { id: query.where?.id ?? query.data?.id ?? 'synthetic-metadata-id', ...structuredClone(query.data ?? query.create ?? {}) }
      })
  }
  root.$transaction.mockImplementation(async callback => {
    prepared = false; events.push('owner')
    try { const value = await callback(tx); events.push('commit'); return value }
    catch (error) { events.push('rollback'); throw error }
  })
  permission.mockImplementation(async () => ({ binding: structuredClone(binding) }))
  prepare.mockImplementation(async () => { prepared = true; events.push('prepare') })
  moduleEffects.mockResolvedValue({ existing: [], moduleIds: [], locatorGroupIds: [], locatorIds: [], testSuiteIds: [], testCaseIds: [] })
  projection.mockImplementation(async () => { events.push('projection-only-metadata'); return { files: new Map([['manifest.json', '{}']]) } })
  journal.mockImplementation(async (_tx, _id, boundary) => { events.push(`journal:${boundary}`) })
  tx.stepDefinition.findUnique.mockImplementation(async query => {
    if (prepared) throw new Error('Unexpected post-batch definition read')
    return projectRow({ id: definition.identity.id, version: definition.identity.version, status: 'ready',
      definitionJson: JSON.stringify(definition) }, query.select)
  })
})
function configureOperation(records: CollaborationRecord[]) {
  const digest = 'a'.repeat(64)
  const step = { ordinal: 0, kind: 'APPLY_DATABASE', state: 'PENDING', requiredPermission: 'INTEGRATE', prerequisiteDigest: digest }
  const operation = { id: 'operation-1', bindingId: binding.id, binding, version: 1, policyVersion: 1, state: 'READY',
    preparedDigest: digest, acceptedDigest: 'b'.repeat(64), idempotencyKey: 'request-1', intent: 'RECEIVE', sourceRevision: null,
    targetRevision: null, steps: [step], localReadSetHash: collaborationHash([]),
    preparedJson: JSON.stringify({ schema: 'appraise.repository-collaboration.operation/v1', incoming: records, local: [], baselines: [],
      localReadSetHash: collaborationHash([]), prepared: prepareThreeWayCollaboration({ incoming: records, localByKey: new Map(), baselineByKey: new Map() }) }) }
  root.collaborationOperation.findUnique.mockResolvedValue(structuredClone(operation))
  root.collaborationOperationStep.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(step)
  tx.collaborationOperation.findFirst.mockResolvedValue(structuredClone(operation))
  tx.collaborationOperation.findUniqueOrThrow.mockResolvedValue(structuredClone(operation))
  tx.collaborationOperationStep.findFirst.mockResolvedValue(step)
  tx.collaborationDecision.findMany.mockResolvedValue([])
  tx.collaborationOperationStep.count.mockResolvedValue(0)
  tx.collaborationOperation.update.mockImplementation(async () => ({ ...operation, version: 2, state: 'COMPLETED' }))
  return { operationId: operation.id, expectedVersion: 1, preparedDigest: `sha256:${digest}`, idempotencyKey: 'request-1' }
}

describe('Collaboration materialization owner', () => {
  it('prepares one complete batch before its first mapping Tag child or root writer', async () => {
    const records = [tagRecord(), steppedCase()]
    await applyCollaborationRecords(request(records), root as never)
    expect(root.$transaction).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1)
    expect(prepare.mock.calls[0][0]).toBe(tx)
    const batch = prepare.mock.calls[0][2]
    expect(batch.existing).toEqual([]); expect(batch.newRoots).toEqual([{ kind: 'TEST_CASE', resourceId: expect.any(String) }]); expect(batch.deleted).toEqual([])
    expect(events[1]).toBe('prepare')
    expect(events).toContain('tag.create'); expect(events).toContain('testCaseStep.createMany')
    const steps = tx.testCaseStep.createMany.mock.calls[0][0].data
    expect(tx.testCaseStepParameter.createMany.mock.calls[0][0].data[0].testCaseStepId).toBe(steps[0].id)
  })
  it('uses the exact borrowed transaction without opening a nested owner', async () => {
    await applyCollaborationRecordsInTransaction(tx as never, request([tagRecord()]))
    expect(root.$transaction).not.toHaveBeenCalled(); expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, project,
      { existing: [], newRoots: [], deleted: [] })
  })
  it('integrates the operation owner while preserving projection metadata and the before-image journal', async () => {
    const input = configureOperation([tagRecord()])
    await executeCollaborationOperation(input, root as never)
    expect(root.$transaction).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledTimes(1)
    expect(permission.mock.calls.every(call => call[0] === tx)).toBe(true)
    expect(events.indexOf('projection-only-metadata')).toBeLessThan(events.indexOf('prepare'))
    expect(events.indexOf('journal:DATABASE_BEFORE_IMAGE')).toBeLessThan(events.indexOf('prepare'))
    expect(events.indexOf('prepare')).toBeLessThan(events.indexOf('collaborationEntityMap.create'))
  })
  it('snapshots operation request scalars before its first root read awaits', async () => {
    const input = configureOperation([tagRecord()])
    const operation = await root.collaborationOperation.findUnique()
    root.collaborationOperationStep.findFirst.mockReset().mockResolvedValueOnce(null).mockResolvedValueOnce(operation.steps[0])
    root.collaborationOperation.findUnique.mockImplementationOnce(async () => { input.expectedVersion = 99; input.idempotencyKey = 'changed'; return operation })
    await executeCollaborationOperation(input, root as never)
    expect(prepare).toHaveBeenCalledTimes(1)
  })
  it('snapshots records and adoption IDs before the permission read awaits', async () => {
    const tag = tagRecord(), adopted = new Map([[recordKey(tag), 'tag-adopted']]), input = request([tag], adopted)
    permission.mockImplementationOnce(async () => { tag.payload = { name: 'Changed', expression: '@changed', type: 'FILTER' } as never;
      adopted.set(recordKey(tag), 'changed-id'); return { binding } })
    await applyCollaborationRecordsInTransaction(tx as never, input)
    expect(tx.tag.create.mock.calls[0][0].data).toMatchObject({ id: 'tag-adopted', name: 'tag', tagExpression: '@tag' })
  })
  it('snapshots wrapper input even when the transaction callback starts later', async () => {
    const tag = tagRecord(), input = request([tag])
    root.$transaction.mockImplementationOnce(async callback => { input.records.length = 0; return callback(tx) })
    await applyCollaborationRecords(input, root as never)
    expect(tx.tag.create).toHaveBeenCalledTimes(1)
  })
  it('propagates whole-batch claim refusal before every materialization writer without retry', async () => {
    prepare.mockRejectedValue(new Error('claim refused'))
    await expect(applyCollaborationRecords(request([tagRecord()]), root as never)).rejects.toThrow('claim refused')
    expect(tx.collaborationEntityMap.create).not.toHaveBeenCalled(); expect(tx.tag.create).not.toHaveBeenCalled()
    expect(root.$transaction).toHaveBeenCalledTimes(1); expect(events).toEqual(['owner', 'rollback'])
  })
  it('propagates mapping failure without attempting semantic writers', async () => {
    tx.collaborationEntityMap.create.mockRejectedValue(new Error('map fault'))
    await expect(applyCollaborationRecords(request([tagRecord()]), root as never)).rejects.toThrow('map fault')
    expect(tx.tag.create).not.toHaveBeenCalled(); expect(root.$transaction).toHaveBeenCalledTimes(1)
  })
  it('propagates Tag and child failures through the same owning callback', async () => {
    tx.tag.create.mockRejectedValueOnce(new Error('tag fault'))
    await expect(applyCollaborationRecords(request([tagRecord()]), root as never)).rejects.toThrow('tag fault')
    tx.testCaseStep.createMany.mockRejectedValueOnce(new Error('child fault'))
    await expect(applyCollaborationRecords(request([steppedCase()]), root as never)).rejects.toThrow('child fault')
    expect(events.filter(value => value === 'rollback')).toHaveLength(2); expect(root.$transaction).toHaveBeenCalledTimes(2)
  })
  it('propagates final root failure and does not retry its prepared batch', async () => {
    tx.module.create.mockRejectedValue(new Error('root fault'))
    await expect(applyCollaborationRecords(request([moduleRecord()]), root as never)).rejects.toThrow('root fault')
    expect(prepare).toHaveBeenCalledTimes(1); expect(root.$transaction).toHaveBeenCalledTimes(1)
  })
  it('refuses ordinary collisions before mapping creation', async () => {
    data.tag = [row('other', { name: 'tag', type: 'FILTER' })]
    await expect(applyCollaborationRecords(request([tagRecord()]), root as never)).rejects.toThrow('First adoption review is required')
    noMaterializationWrites()
  })
  it('preserves explicit same-target adopted IDs for both unmanaged and managed roots', async () => {
    const record = caseRecord()
    for (const collaborationManaged of [false, true]) {
      data.testCase = [row('adopted', { collaborationManaged, tags: [] })]
      const plan = await planCollaborationMaterialization(tx as never, binding, [record], new Map([[recordKey(record), 'adopted']]), new Date())
      expect(plan.batch).toEqual({ existing: [{ kind: 'TEST_CASE', resourceId: 'adopted' }], newRoots: [], deleted: [] })
    }
    expect(tx.testCase.findFirst).not.toHaveBeenCalled()
  })
  it('classifies an absent adopted root as fresh and propagates retained-identity guard refusal', async () => {
    const record = caseRecord(); prepare.mockRejectedValue(new Error('retained identity'))
    await expect(applyCollaborationRecords(request([record], new Map([[recordKey(record), 'absent-adopted']])), root as never)).rejects.toThrow('retained identity')
    expect(prepare.mock.calls[0][2]).toEqual({ existing: [], newRoots: [{ kind: 'TEST_CASE', resourceId: 'absent-adopted' }], deleted: [] })
    expect(tx.collaborationEntityMap.create).not.toHaveBeenCalled()
  })
  it('refuses foreign and malformed adopted endpoint identities before a writer', async () => {
    const record = caseRecord(); data.testCase = [row('foreign', { targetProjectId: 'foreign-project' })]
    await expect(applyCollaborationRecords(request([record], new Map([[recordKey(record), 'foreign']])), root as never)).rejects.toMatchObject({ statusCode: 409 })
    await expect(applyCollaborationRecords(request([record], new Map([[recordKey(record), '']])), root as never)).rejects.toMatchObject({ statusCode: 409 })
    noMaterializationWrites()
  })
  it('preserves the archive-without-local-identity error before a metadata writer', async () => {
    const record = { ...tagRecord(), archived: true }
    await expect(applyCollaborationRecords(request([record]), root as never)).rejects.toThrow('Missing local identity for tag:tag.')
    noMaterializationWrites()
  })
  it('keeps a mapped missing archived root a semantic no-op without inventing a fresh guard', async () => {
    const record = { ...caseRecord(), archived: true }; mapping(record, 'missing-root')
    await applyCollaborationRecords(request([record]), root as never)
    expect(prepare.mock.calls[0][2]).toEqual({ existing: [], newRoots: [], deleted: [] })
    expect(tx.testCase.create).not.toHaveBeenCalled(); expect(tx.testCase.update).not.toHaveBeenCalled()
  })
  it('combines all five existing domains and fresh roots once in stable order', async () => {
    const record = { ...moduleRecord(), archived: true }; mapping(record, 'module-old')
    data.module = [row('module-old', { parentId: null })]
    moduleEffects.mockResolvedValue({ existing: [{ kind: 'TEST_SUITE', resourceId: 'suite' }, { kind: 'TEST_CASE', resourceId: 'case' },
      { kind: 'LOCATOR_GROUP', resourceId: 'group' }, { kind: 'LOCATOR', resourceId: 'locator' }], moduleIds: ['module-old'] })
    await applyCollaborationRecords(request([record, caseRecord('fresh')]), root as never)
    expect(moduleEffects).toHaveBeenCalledExactlyOnceWith(tx, project, ['module-old'])
    expect(prepare.mock.calls[0][2].existing.map((key: { kind: string }) => key.kind))
      .toEqual(['LOCATOR', 'LOCATOR_GROUP', 'MODULE', 'TEST_CASE', 'TEST_SUITE'])
    expect(prepare.mock.calls[0][2].newRoots).toEqual([{ kind: 'TEST_CASE', resourceId: expect.any(String) }])
    expect(prepare.mock.calls[0][2].deleted).toEqual([])
  })
  it('covers archived Group locators and dependent Cases without guarding its read-only Module', async () => {
    const record = recordGroup(true); mapping(record, 'group-old'); data.locatorGroup = [row('group-old', { moduleId: 'module-old' })]
    data.module = [row('module-old', { parentId: null })]; data.locator = [row('locator-old', { locatorGroupId: 'group-old', archivedAt: new Date() })]
    addDependentCase('locator-old', 'case-outside')
    const plan = await planCollaborationMaterialization(tx as never, binding, [record], undefined, new Date())
    expect(plan.batch.existing).toEqual([{ kind: 'LOCATOR', resourceId: 'locator-old' }, { kind: 'LOCATOR_GROUP', resourceId: 'group-old' },
      { kind: 'TEST_CASE', resourceId: 'case-outside' }])
  })
  it('keeps old and new Locator Groups read-only while covering an existing Locator and its dependent Case', async () => {
    const record = makeRecord('locator', 'locator', { name: 'Locator', value: '#new', locatorGroupPortableId: 'new-group' })
    mapping(record, 'locator-old'); mapping(recordGroup(false, 'new-group'), 'group-new')
    data.locator = [row('locator-old', { locatorGroupId: 'group-old' })]
    data.locatorGroup = [row('group-old', { moduleId: 'module-old' }), row('group-new', { moduleId: 'module-old' })]
    data.module = [row('module-old', { parentId: null })]; addDependentCase('locator-old', 'case-outside')
    const plan = await planCollaborationMaterialization(tx as never, binding, [record], undefined, new Date())
    expect(plan.batch.existing).toEqual([{ kind: 'LOCATOR', resourceId: 'locator-old' }, { kind: 'TEST_CASE', resourceId: 'case-outside' }])
  })
  it('includes archived Case and Suite Tag consumers outside the input without a Tag domain', async () => {
    const record = tagRecord(); mapping(record, 'tag-old'); data.tag = [row('tag-old')]
    data.testCase = [row('outside-case', { archivedAt: new Date(), tags: [{ id: 'tag-old' }] })]
    data.testSuite = [row('outside-suite', { archivedAt: new Date(), moduleId: 'module-old', tags: [{ id: 'tag-old' }] })]
    data.module = [row('module-old', { parentId: null })]
    const plan = await planCollaborationMaterialization(tx as never, binding, [record], undefined, new Date())
    expect(plan.batch).toEqual({ existing: [{ kind: 'TEST_CASE', resourceId: 'outside-case' },
      { kind: 'TEST_SUITE', resourceId: 'outside-suite' }], newRoots: [], deleted: [] })
    expect(tx.testCase.findMany.mock.calls[0][0].where).toEqual({ tags: { some: { id: 'tag-old' } } })
  })
  it('refuses a foreign incoming Tag consumer before any materialization mapping write', async () => {
    const record = tagRecord(); mapping(record, 'tag-old'); data.tag = [row('tag-old')]
    data.testCase = [row('foreign-case', { targetProjectId: 'foreign', tags: [{ id: 'tag-old' }] })]
    await expect(applyCollaborationRecords(request([record]), root as never)).rejects.toMatchObject({ statusCode: 409 }); noMaterializationWrites()
  })
  it('prepares the exact old and new Suite membership union only when the set changes', async () => {
    const record = suiteRecord(['new-case']); mapping(record, 'suite-old'); mapping(moduleRecord(), 'module-old'); mapping(caseRecord('new-case'), 'case-new')
    data.testSuite = [row('suite-old', { moduleId: 'module-old' })]; data.module = [row('module-old', { parentId: null })]
    data.testCase = [row('case-old', { TestSuite: [{ id: 'suite-old' }] }), row('case-new', { TestSuite: [] })]
    const plan = await planCollaborationMaterialization(tx as never, binding, [record], undefined, new Date())
    expect(plan.batch.existing).toEqual([{ kind: 'TEST_CASE', resourceId: 'case-new' }, { kind: 'TEST_CASE', resourceId: 'case-old' },
      { kind: 'TEST_SUITE', resourceId: 'suite-old' }])
  })
  it('does not fabricate Case effects for an unchanged Suite membership', async () => {
    const record = suiteRecord(['same-case']); mapping(record, 'suite-old'); mapping(moduleRecord(), 'module-old'); mapping(caseRecord('same-case'), 'case-old')
    data.testSuite = [row('suite-old', { moduleId: 'module-old' })]; data.module = [row('module-old', { parentId: null })]
    data.testCase = [row('case-old', { TestSuite: [{ id: 'suite-old' }] })]
    const plan = await planCollaborationMaterialization(tx as never, binding, [record], undefined, new Date())
    expect(plan.batch.existing).toEqual([{ kind: 'TEST_SUITE', resourceId: 'suite-old' }])
  })
  it('validates Template default Locator references without a Locator mutation effect', async () => {
    const record = steppedCase(); const template = { ...record, kind: 'template', payload: { ...record.payload, name: 'Template', description: null } } as CollaborationRecord
    delete (template.payload as Row).title
    if (template.kind !== 'template') throw new Error('Fixture kind')
    template.payload.steps[0].parameters[0].locatorPortableId = 'locator'; mapping(makeRecord('locator', 'locator', {}), 'locator-old')
    data.locator = [row('locator-old', { locatorGroupId: null })]
    const plan = await planCollaborationMaterialization(tx as never, binding, [template], undefined, new Date())
    expect(plan.batch).toEqual({ existing: [], newRoots: [], deleted: [] })
  })
  it('refuses malformed old child ownership before preparing a Case replacement', async () => {
    const record = caseRecord(); mapping(record, 'case-old'); data.testCase = [row('case-old', { tags: [] })]
    tx.testCaseStep.findMany.mockResolvedValueOnce([{ id: 'step-old', testCaseId: 'foreign-owner' }])
    await expect(applyCollaborationRecords(request([record]), root as never)).rejects.toMatchObject({ statusCode: 409 }); noMaterializationWrites()
  })
  it('requires every exact Step Definition before a mapping writer', async () => {
    tx.stepDefinition.findUnique.mockResolvedValue(null)
    await expect(applyCollaborationRecords(request([steppedCase()]), root as never)).rejects.toThrow('not ready locally')
    noMaterializationWrites()
  })
  it('refuses conflicting hashes for the same immutable Step Definition reference', async () => {
    const record = steppedCase(); if (record.kind !== 'test-case') throw new Error('Fixture kind')
    const duplicate = structuredClone(record.payload.steps[0]); duplicate.portableId = 'other-step'; duplicate.invocation.step.definitionHash = `sha256:${'0'.repeat(64)}`
    record.payload.steps.push(duplicate)
    await expect(applyCollaborationRecords(request([record]), root as never)).rejects.toThrow('conflicting shared hashes'); noMaterializationWrites()
  })
  it('rejects old Module cycles before maps or semantic branches run', async () => {
    const record = { ...moduleRecord(), archived: true }; mapping(record, 'cycle'); data.module = [row('cycle', { parentId: 'cycle' })]
    await expect(applyCollaborationRecords(request([record]), root as never)).rejects.toMatchObject({ statusCode: 409 }); noMaterializationWrites()
  })
  it('keeps an explicit current Environment mapping metadata-only after the batch', async () => {
    const record = makeRecord('environment-reference', 'environment', { name: 'Environment' })
    data.collaborationEnvironmentMapping = [{ id: 'environment-map', bindingId: binding.id, portableId: 'environment', localEnvironmentId: 'environment-old', localScopeVersion: 2 }]
    data.environment = [row('environment-old', { scopeVersion: 2 })]
    await applyCollaborationRecords(request([record]), root as never)
    expect(prepare.mock.calls[0][2]).toEqual({ existing: [], newRoots: [], deleted: [] })
    expect(tx.collaborationEntityMap.update).toHaveBeenCalledWith({ where: { id: expect.any(String) }, data: { localEntityId: 'environment-old' } })
  })
  it('refuses a stale Environment mapping before materialization writes', async () => {
    const record = makeRecord('environment-reference', 'environment', { name: 'Environment' })
    data.collaborationEnvironmentMapping = [{ id: 'environment-map', bindingId: binding.id, portableId: 'environment', localEnvironmentId: 'environment-old', localScopeVersion: 2 }]
    data.environment = [row('environment-old', { scopeVersion: 3 })]
    await expect(applyCollaborationRecords(request([record]), root as never)).rejects.toThrow('is stale'); noMaterializationWrites()
  })
  it('keeps Journey reuse metadata outside all five semantic domains', async () => {
    const record = makeRecord('journey-reuse-asset', 'asset', { assetKind: 'brief', title: 'Brief', content: {} })
    await applyCollaborationRecords(request([record]), root as never)
    expect(prepare.mock.calls[0][2]).toEqual({ existing: [], newRoots: [], deleted: [] })
    expect(tx.collaborationReuseAsset.upsert).toHaveBeenCalledTimes(1)
  })
  it('refuses aggregate resource overflow before preparation or mapping creation', async () => {
    const records = Array.from({ length: 4097 }, (_, index) => caseRecord(`case-${index}`))
    await expect(applyCollaborationRecords(request(records), root as never)).rejects.toMatchObject({ statusCode: 409 })
    noMaterializationWrites()
  })
  it('preserves the canonical map uniqueness constraint without inventing cross-kind identity policy', async () => {
    const first = caseRecord('first'), second = caseRecord('second')
    await expect(applyCollaborationRecords(request([first, second], new Map([[recordKey(first), 'same'], [recordKey(second), 'same']])), root as never))
      .rejects.toMatchObject({ statusCode: 409 }); noMaterializationWrites()
  })
  it('refuses a foreign old parameter Locator before replacing Case children', async () => {
    const record = caseRecord(); mapping(record, 'case-old'); data.testCase = [row('case-old', { tags: [] })]
    data.testCaseStep = [{ id: 'step-old', testCaseId: 'case-old' }]
    data.testCaseStepParameter = [{ id: 'parameter-old', testCaseStepId: 'step-old', locatorId: 'foreign-locator' }]
    data.locator = [row('foreign-locator', { targetProjectId: 'foreign', locatorGroupId: null })]
    await expect(applyCollaborationRecords(request([record]), root as never)).rejects.toMatchObject({ statusCode: 409 }); noMaterializationWrites()
  })
  it('refuses a foreign incoming Suite Tag consumer even when the input contains no Suite', async () => {
    const record = tagRecord(); mapping(record, 'tag-old'); data.tag = [row('tag-old')]
    data.testSuite = [row('foreign-suite', { targetProjectId: 'foreign', moduleId: 'module-old', tags: [{ id: 'tag-old' }] })]
    await expect(applyCollaborationRecords(request([record]), root as never)).rejects.toMatchObject({ statusCode: 409 }); noMaterializationWrites()
  })
  it('validates archived old Case Suite endpoints without inventing a membership mutation', async () => {
    const record = caseRecord(); mapping(record, 'case-old'); data.testCase = [row('case-old', { tags: [] })]
    data.testSuite = [row('suite-old', { archivedAt: new Date(), moduleId: 'module-old', testCases: [{ id: 'case-old' }] })]
    data.module = [row('module-old', { parentId: null })]
    const plan = await planCollaborationMaterialization(tx as never, binding, [record], undefined, new Date())
    expect(plan.batch.existing).toEqual([{ kind: 'TEST_CASE', resourceId: 'case-old' }])
    expect(tx.testSuite.findMany.mock.calls[0][0].where).toEqual({ testCases: { some: { id: 'case-old' } } })
  })
  it('refuses unsupported incoming Template consumers of a mutated Locator before any writer', async () => {
    const record = makeRecord('locator', 'locator', { name: 'Locator', value: '#value', locatorGroupPortableId: 'group' }, true)
    mapping(record, 'locator-old'); data.locator = [row('locator-old', { locatorGroupId: null })]
    tx.templateTestCaseStepParameter.findFirst.mockResolvedValue({ id: 'unsupported-template-parameter' })
    await expect(applyCollaborationRecords(request([record]), root as never)).rejects.toMatchObject({ statusCode: 409 }); noMaterializationWrites()
  })

  it('refuses the shared examined-row sentinel before accepting a Tag consumer subset', async () => {
    const record = tagRecord(); mapping(record, 'tag-old'); data.tag = [row('tag-old')]
    tx.testCase.findMany.mockResolvedValue(Array.from({ length: 65535 }, (_, index) => row(`case-${index}`)))
    await expect(applyCollaborationRecords(request([record]), root as never)).rejects.toMatchObject({ statusCode: 409 }); noMaterializationWrites()
  })

  it('refuses unknown record kinds instead of falling through to a metadata writer', async () => {
    const record = { ...tagRecord(), kind: 'unsupported-kind' } as never
    await expect(applyCollaborationRecords(request([record]), root as never)).rejects.toMatchObject({ statusCode: 409 }); noMaterializationWrites()
  })

})
function recordGroup(archived = false, id = 'group') {
  return makeRecord('locator-group', id, { name: 'Group', route: '/', modulePortableId: 'module' }, archived)
}
function addDependentCase(locatorId: string, caseId: string) {
  data.testCaseStepParameter.push({ id: 'parameter-old', testCaseStepId: 'step-old', locatorId })
  data.testCaseStep.push({ id: 'step-old', testCaseId: caseId })
  data.testCase.push(row(caseId, { archivedAt: new Date() }))
}
