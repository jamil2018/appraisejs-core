import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestCaseFromInput, deleteTestCasesByIds, getTestCaseByIdOrThrow, listTestCases, updateTestCaseFromInput,
} from './test-case-service'
import { prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { computeStepReferenceHash, type StepDefinition } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

const { root, tx } = vi.hoisted(() => {
  const delegates = () => ({ findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() })
  const client = () => ({ testCase: delegates(), testSuite: delegates(), module: delegates(), tag: delegates(),
    stepDefinition: delegates(), testCaseStep: delegates(), testCaseStepParameter: delegates(), locator: delegates(),
    testCaseFlowBlock: delegates(), testCaseFlowBlockNode: delegates(), testCaseMetrics: delegates(),
    testRunTestCase: delegates(), review: delegates(), linkedJiraTicket: delegates(), reportTestCase: delegates(),
    qualityJourneyAutomationMaterialization: delegates(), qualityJourneyAutomationTargetBinding: delegates() })
  return { root: { ...client(), $transaction: vi.fn() }, tx: client() }
})
vi.mock('@/config/db-config', () => ({ default: root }))
vi.mock('@prisma/client', () => ({
  TagType: { IDENTIFIER: 'IDENTIFIER', FILTER: 'FILTER' },
  StepParameterType: { NUMBER: 'NUMBER', STRING: 'STRING', DATE: 'DATE', BOOLEAN: 'BOOLEAN', LOCATOR: 'LOCATOR' },
  StepIcon: { MOUSE: 'MOUSE', NAVIGATION: 'NAVIGATION', INPUT: 'INPUT', DOWNLOAD: 'DOWNLOAD', API: 'API', STORE: 'STORE',
    FORMAT: 'FORMAT', DATA: 'DATA', UPLOAD: 'UPLOAD', WAIT: 'WAIT', VALIDATION: 'VALIDATION', DEBUG: 'DEBUG' },
}))
vi.mock('@/lib/test-case-utils', () => ({ generateUniqueTestCaseIdentifier: () => 'tc_fixture' }))
vi.mock('@/services/coordinator/quality-journey-shared-resource-guard-service', () => ({
  prepareSharedResourceMutationInTransaction: vi.fn(),
}))

type Row = Record<string, unknown>
const project = 'project-1'
const prepare = vi.mocked(prepareSharedResourceMutationInTransaction)
// Synthetic metadata for the real pure definition reader/persistence helpers; no execution handler or issuer.
const definition: StepDefinition = {
  schemaVersion: '1', identity: { id: 'fixture.case', version: '1', status: 'ready' },
  provenance: { creationMethod: 'human-form', createdBy: 'unit fixture', reviewedBy: 'synthetic unit fixture', createdAt: '2026-10-24T00:00:00.000Z' },
  intent: { title: 'Fixture case', description: 'Fixture metadata', capabilities: ['fixture.case'], searchTerms: [], examples: ['Fixture'] },
  inputs: [{ name: 'payload', label: 'Payload', description: 'Fixture input', type: 'json', required: true, examples: [], aliases: [] }],
  outputs: [], human: { signature: 'Given fixture {payload}', keywordCompatibility: ['Given'],
    parameterBindings: [{ placeholder: 'payload', input: 'payload' }], groupId: 'fixture' },
  agent: { summary: 'Fixture', usageGuidance: 'Unit metadata only', examples: [{ intent: 'Fixture', inputs: { payload: { retained: true } } }] },
  execution: { kind: 'operation', handlerId: 'fixture.case', handlerVersion: '1', runtime: 'node' }, lifecycle: {},
}
const caseRow = (id = 'case-1', extra: Row = {}) => ({ id, targetProjectId: project, archivedAt: null, collaborationManaged: false, ...extra })
const suiteRow = (id = 'suite-1', extra: Row = {}) => ({ id, targetProjectId: project, moduleId: 'module-1', archivedAt: null, ...extra })
const tagRow = (id = 'tag-1', extra: Row = {}) => ({ id, targetProjectId: project, name: 'filter', tagExpression: '@filter', type: 'FILTER', archivedAt: null, ...extra })
const input = () => ({ title: 'Authored case', description: 'Description', testSuiteIds: ['suite-1'], tagIds: ['tag-1'],
  steps: [{ gherkinStep: 'Given fixture payload', label: 'Fixture', icon: 'MOUSE' as const, nodeId: 'flow-node', order: 0,
    parameters: [{ name: 'payload', value: 'before', type: 'STRING' as const, order: 0 }],
    invocation: { step: { id: definition.identity.id, version: definition.identity.version, definitionHash: computeStepReferenceHash(definition) },
      inputs: { payload: { retained: true } } } }], flowBlocks: [{ id: 'new-block', name: 'Block', nodeIds: ['flow-node'] }],
})
let cases: Row[], suppliedSuites: Row[], oldSuites: Row[], suppliedTags: Row[], oldTags: Row[], modules: Row[]
let steps: Row[], parameters: Row[], locators: Row[], blocks: Row[], nodes: Row[], metrics: Row[], events: string[]
function projection(row: Row, select: Record<string, unknown>): Row {
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, selection]) => {
    if (!Object.hasOwn(row, key)) throw new Error(`Fixture omitted selected field: ${key}`)
    const field = row[key]
    if (typeof selection === 'object' && selection !== null) {
      const nested = selection as { select: Record<string, unknown>; take?: number }
      if (!Array.isArray(field)) throw new Error(`Fixture expected selected relation: ${key}`)
      return [key, field.slice(0, nested.take).map(value => projection(value as Row, nested.select))]
    }
    return [key, structuredClone(field)]
  }))
}
function selected(rows: Row[], query: { select: Record<string, unknown>; take?: number }) {
  return rows.slice(0, query.take).map(row => projection(row, query.select))
}
function noWrites() {
  expect(prepare).not.toHaveBeenCalled()
  for (const delegate of Object.values(tx)) {
    expect(delegate.create).not.toHaveBeenCalled(); expect(delegate.update).not.toHaveBeenCalled()
    expect(delegate.deleteMany).not.toHaveBeenCalled()
  }
}
function identifier(extra: Row = {}) {
  return tagRow('identifier-old', { name: 'tc_old', tagExpression: '@tc_old', type: 'IDENTIFIER',
    testCases: [caseRow()], testSuites: [], testRuns: [], ...extra })
}
beforeEach(() => {
  vi.resetAllMocks()
  events = []; cases = [caseRow()]; suppliedSuites = [suiteRow()]; oldSuites = [suiteRow('suite-old')]
  suppliedTags = [tagRow()]; oldTags = [identifier()]; modules = [{ id: 'module-1', targetProjectId: project }]
  steps = [{ id: 'step-old', testCaseId: 'case-1' }]
  parameters = [{ id: 'parameter-old', testCaseStepId: 'step-old', locatorId: 'locator-old' }]
  locators = [{ id: 'locator-old', targetProjectId: project }]
  blocks = [{ id: 'block-old', testCaseId: 'case-1' }]; nodes = [{ id: 'node-old', flowBlockId: 'block-old' }]; metrics = []
  for (const name of Object.keys(tx) as Array<keyof typeof tx>) {
    for (const method of Object.values(root[name])) method.mockImplementation(() => { throw new Error('Unexpected root delegate') })
  }
  root.$transaction.mockImplementation(async callback => {
    events.push('tx')
    try { const result = await callback(tx); events.push('commit'); return result }
    catch (error) { events.push('rollback'); throw error }
  })
  tx.testCase.findFirst.mockImplementation(async query => {
    const row = cases.find(value => value.id === query.where.id)
    return row ? projection(row, query.select) : null
  })
  tx.testCase.findMany.mockImplementation(async query => selected(cases.filter(row => query.where.id.in.includes(row.id)), query))
  tx.testSuite.findMany.mockImplementation(async query => selected(query.where.id
    ? suppliedSuites.filter(row => query.where.id.in.includes(row.id)) : oldSuites, query))
  tx.module.findMany.mockImplementation(async query => selected(modules.filter(row => query.where.id.in.includes(row.id)), query))
  tx.tag.findMany.mockImplementation(async query => selected(query.where.id
    ? suppliedTags.filter(row => query.where.id.in.includes(row.id)) : oldTags, query))
  tx.tag.findFirst.mockImplementation(async query => {
    const row = oldTags.find(value => value.id === query.where.id)
    return row ? projection(row, query.select) : null
  })
  tx.stepDefinition.findMany.mockImplementation(async query => {
    expect(query.where.OR).toEqual([{ id: 'fixture.case', version: '1', status: 'ready' }])
    return [{ definitionJson: JSON.stringify(definition) }]
  })
  tx.testCaseStep.findMany.mockImplementation(async query => selected(steps, query))
  tx.testCaseStepParameter.findMany.mockImplementation(async query => selected(parameters, query))
  tx.locator.findMany.mockImplementation(async query => selected(locators, query))
  tx.testCaseFlowBlock.findMany.mockImplementation(async query => selected(blocks, query))
  tx.testCaseFlowBlockNode.findMany.mockImplementation(async query => selected(nodes, query))
  tx.testCaseMetrics.findMany.mockImplementation(async query => selected(metrics, query))
  for (const delegate of [tx.testRunTestCase, tx.review, tx.linkedJiraTicket, tx.reportTestCase,
    tx.qualityJourneyAutomationMaterialization, tx.qualityJourneyAutomationTargetBinding]) delegate.findFirst.mockResolvedValue(null)
  prepare.mockImplementation(async () => { events.push('prepare') })
  tx.tag.create.mockImplementation(async query => { events.push('identifier'); return { id: 'identifier-new', ...structuredClone(query.data) } })
  tx.testCase.create.mockImplementation(async query => { events.push('case-create'); return { ...structuredClone(query.data) } })
  tx.testCase.update.mockImplementation(async query => { events.push('case-update'); return { id: query.where.id, ...structuredClone(query.data) } })
  tx.testCase.deleteMany.mockImplementation(async () => { events.push('case-delete'); return { count: 1 } })
  tx.tag.deleteMany.mockImplementation(async () => { events.push('tag-delete'); return { count: 1 } })
  for (const [delegate, name] of [[tx.testCaseStepParameter, 'parameters'], [tx.testCaseStep, 'steps'], [tx.testCaseFlowBlock, 'blocks']] as const)
    delegate.deleteMany.mockImplementation(async () => { events.push(name); return { count: 1 } })
})

describe('createTestCaseFromInput mutation boundary', () => {
  it('does not create identifier tags or test cases for an invalid Step Invocation', async () => {
    const value = input(); value.steps[0].invocation = {} as never
    await expect(createTestCaseFromInput(value, project)).rejects.toThrow()
    noWrites(); expect(root.$transaction).toHaveBeenCalledTimes(1)
  })
  it('prepares supplied Suite membership and the fresh Case before identifier or nested writes using the original transaction', async () => {
    const result = await createTestCaseFromInput(input(), project)
    expect(result.id).toMatch(/^[a-f0-9-]{36}$/)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, project, {
      existing: [{ kind: 'TEST_SUITE', resourceId: 'suite-1' }], newRoots: [{ kind: 'TEST_CASE', resourceId: result.id }], deleted: [],
    })
    expect(tx.stepDefinition.findMany).toHaveBeenCalledTimes(1); expect(root.stepDefinition.findMany).not.toHaveBeenCalled()
    expect(events).toEqual(['tx', 'prepare', 'identifier', 'case-create', 'commit'])
    const data = tx.testCase.create.mock.calls[0][0].data
    expect(data.TestSuite).toEqual({ connect: [{ id: 'suite-1' }] })
    expect(data.steps.create[0].parameters.create[0]).not.toHaveProperty('locatorId')
  })
  it('reserves only a fresh Case when no Suite membership is supplied', async () => {
    const value = input(); value.testSuiteIds = []; suppliedSuites = []
    const result = await createTestCaseFromInput(value, project)
    expect(prepare).toHaveBeenCalledWith(tx, project, { existing: [], newRoots: [{ kind: 'TEST_CASE', resourceId: result.id }], deleted: [] })
  })
  it('snapshots complete nested inputs and membership before the first asynchronous query', async () => {
    const value = input()
    tx.testSuite.findMany.mockImplementationOnce(async query => {
      value.title = 'Changed'; value.testSuiteIds[0] = 'foreign'; value.tagIds[0] = 'foreign'
      value.steps[0].parameters[0].value = 'changed'; value.steps[0].invocation.inputs.payload.retained = false
      value.flowBlocks[0].nodeIds[0] = 'changed'; return selected([suiteRow()], query)
    })
    const result = await createTestCaseFromInput(value, project)
    const data = tx.testCase.create.mock.calls[0][0].data
    expect(result.title).toBe('Authored case'); expect(data.TestSuite.connect).toEqual([{ id: 'suite-1' }])
    expect(data.steps.create[0].parameters.create[0].value).toBe('before')
    expect(JSON.parse(data.steps.create[0].invocationJson).inputs.payload).toEqual({ retained: true })
    expect(data.flowBlocks.create[0].nodes.create).toEqual([{ flowNodeId: 'flow-node' }])
  })
  it('refuses missing foreign or archived supplied Suite endpoints before any preparation', async () => {
    for (const rows of [[], [suiteRow('suite-1', { targetProjectId: 'foreign' })], [suiteRow('suite-1', { archivedAt: new Date() })]]) {
      suppliedSuites = rows; await expect(createTestCaseFromInput(input(), project)).rejects.toThrow(); noWrites()
    }
  })
  it('refuses foreign Suite Module endpoints and archived or foreign supplied Tags before identifier creation', async () => {
    modules = [{ id: 'module-1', targetProjectId: 'foreign' }]
    await expect(createTestCaseFromInput(input(), project)).rejects.toThrow(); noWrites()
    modules = [{ id: 'module-1', targetProjectId: project }]
    for (const extra of [{ archivedAt: new Date() }, { targetProjectId: 'foreign' }]) {
      suppliedTags = [tagRow('tag-1', extra)]; await expect(createTestCaseFromInput(input(), project)).rejects.toThrow(); noWrites()
    }
  })
  it('refuses duplicate or excessive membership IDs before opening a transaction', async () => {
    const value = input(); value.testSuiteIds = ['suite-1', 'suite-1']
    await expect(createTestCaseFromInput(value, project)).rejects.toThrow()
    value.testSuiteIds = Array.from({ length: 4097 }, (_, index) => `suite-${index}`)
    await expect(createTestCaseFromInput(value, project)).rejects.toThrow(); expect(root.$transaction).not.toHaveBeenCalled()
  })
  it('rejects a mismatched exact definition through the transaction reader before preparing', async () => {
    const value = input(); value.steps[0].invocation.step.definitionHash = `sha256:${'0'.repeat(64)}`
    await expect(createTestCaseFromInput(value, project)).rejects.toMatchObject({ statusCode: 400 })
    noWrites(); expect(tx.stepDefinition.findMany).toHaveBeenCalledTimes(1)
  })
  it('propagates preparation refusal before the first identifier writer without retry', async () => {
    prepare.mockRejectedValue(new Error('guard refused'))
    await expect(createTestCaseFromInput(input(), project)).rejects.toThrow('guard refused')
    expect(tx.tag.create).not.toHaveBeenCalled(); expect(tx.testCase.create).not.toHaveBeenCalled(); expect(root.$transaction).toHaveBeenCalledTimes(1)
  })
  it('propagates identifier and final Case failures through the same owning transaction', async () => {
    tx.tag.create.mockRejectedValueOnce(new Error('identifier fault'))
    await expect(createTestCaseFromInput(input(), project)).rejects.toThrow('identifier fault')
    expect(tx.testCase.create).not.toHaveBeenCalled()
    tx.testCase.create.mockRejectedValueOnce(new Error('case fault'))
    await expect(createTestCaseFromInput(input(), project)).rejects.toThrow('case fault')
    expect(events.filter(value => value === 'rollback')).toHaveLength(2); expect(root.$transaction).toHaveBeenCalledTimes(2)
  })
})

describe('updateTestCaseFromInput', () => {
  it('guards only the Case before exact child replacement and retains validation-only Suite membership', async () => {
    await updateTestCaseFromInput(input(), 'case-1', project)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, project, { existing: [{ kind: 'TEST_CASE', resourceId: 'case-1' }], newRoots: [], deleted: [] })
    expect(tx.stepDefinition.findMany).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['tx', 'prepare', 'parameters', 'steps', 'blocks', 'case-update', 'commit'])
    const data = tx.testCase.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('TestSuite'); expect(data.tags.set).toEqual([{ id: 'identifier-old' }, { id: 'tag-1' }])
    expect(tx.testCaseStep.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['step-old'] }, testCaseId: { in: ['case-1'] } } })
  })
  it('keeps archived old Suite Tag and Locator relationships in read-only validation', async () => {
    oldSuites = [suiteRow('suite-old', { archivedAt: new Date() })]
    oldTags = [identifier({ archivedAt: new Date() })]; locators = [{ id: 'locator-old', targetProjectId: project, archivedAt: new Date() }]
    await updateTestCaseFromInput(input(), 'case-1', project)
    expect(tx.testCase.update.mock.calls[0][0].data.tags.set).toEqual([{ id: 'tag-1' }]); expect(prepare.mock.calls[0][2].existing).toEqual([{ kind: 'TEST_CASE', resourceId: 'case-1' }])
    expect(tx.testSuite.findMany.mock.calls[1][0].where).toEqual({ testCases: { some: { id: { in: ['case-1'] } } } })
  })
  it('snapshots update child payloads before the edited Case lookup awaits', async () => {
    const value = input()
    tx.testCase.findFirst.mockImplementationOnce(async query => {
      value.steps[0].parameters[0].value = 'changed'; value.flowBlocks[0].name = 'Changed'; value.testSuiteIds[0] = 'changed'
      return projection(caseRow(), query.select)
    })
    await updateTestCaseFromInput(value, 'case-1', project)
    const data = tx.testCase.update.mock.calls[0][0].data
    expect(data.steps.create[0].parameters.create[0].value).toBe('before'); expect(data.flowBlocks.create[0].name).toBe('Block')
  })
  it('refuses missing foreign or archived edited Cases with the existing not-found outcome', async () => {
    for (const rows of [[], [caseRow('case-1', { targetProjectId: 'foreign' })], [caseRow('case-1', { archivedAt: new Date() })]]) {
      cases = rows; await expect(updateTestCaseFromInput(input(), 'case-1', project)).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 }); noWrites()
    }
  })
  it('refuses foreign old Suite and Tag endpoints without hiding them behind target filters', async () => {
    oldSuites = [suiteRow('suite-old', { targetProjectId: 'foreign' })]
    await expect(updateTestCaseFromInput(input(), 'case-1', project)).rejects.toThrow(); noWrites()
    oldSuites = [suiteRow('suite-old')]; oldTags = [identifier({ targetProjectId: 'foreign' })]
    await expect(updateTestCaseFromInput(input(), 'case-1', project)).rejects.toThrow(); noWrites()
  })
  it('refuses missing or foreign old Locator references before removing Case parameters', async () => {
    for (const rows of [[], [{ id: 'locator-old', targetProjectId: 'foreign' }]]) {
      locators = rows; await expect(updateTestCaseFromInput(input(), 'case-1', project)).rejects.toThrow(); noWrites()
    }
  })
  it('refuses missing or foreign old Suite Modules without guarding read-only parent endpoints', async () => {
    oldSuites = [suiteRow('suite-old', { moduleId: 'module-old' })]
    await expect(updateTestCaseFromInput(input(), 'case-1', project)).rejects.toThrow(); noWrites()
    modules.push({ id: 'module-old', targetProjectId: 'foreign' })
    await expect(updateTestCaseFromInput(input(), 'case-1', project)).rejects.toThrow(); noWrites()
  })
  it('refuses malformed child ownership at every selected step parameter block and node boundary', async () => {
    const originals = { steps, parameters, blocks, nodes }
    for (const broken of ['step', 'parameter', 'block', 'node']) {
      steps = originals.steps; parameters = originals.parameters; blocks = originals.blocks; nodes = originals.nodes
      if (broken === 'step') steps = [{ id: 'step-old', testCaseId: 'foreign-case' }]
      if (broken === 'parameter') parameters = [{ id: 'parameter-old', testCaseStepId: 'foreign-step', locatorId: null }]
      if (broken === 'block') blocks = [{ id: 'block-old', testCaseId: 'foreign-case' }]
      if (broken === 'node') nodes = [{ id: 'node-old', flowBlockId: 'foreign-block' }]
      await expect(updateTestCaseFromInput(input(), 'case-1', project)).rejects.toThrow(); noWrites()
    }
  })
  it('propagates guard or child deletion failure without a final update or nested retry', async () => {
    prepare.mockRejectedValueOnce(new Error('guard refused'))
    await expect(updateTestCaseFromInput(input(), 'case-1', project)).rejects.toThrow('guard refused')
    expect(tx.testCaseStepParameter.deleteMany).not.toHaveBeenCalled()
    tx.testCaseStepParameter.deleteMany.mockRejectedValueOnce(new Error('child fault'))
    await expect(updateTestCaseFromInput(input(), 'case-1', project)).rejects.toThrow('child fault')
    expect(tx.testCase.update).not.toHaveBeenCalled(); expect(root.$transaction).toHaveBeenCalledTimes(2)
  })
  it('propagates a final update fault after the actual callback child writes as a rollback signal', async () => {
    tx.testCase.update.mockRejectedValueOnce(new Error('update fault'))
    await expect(updateTestCaseFromInput(input(), 'case-1', project)).rejects.toThrow('update fault')
    expect(events).toEqual(['tx', 'prepare', 'parameters', 'steps', 'blocks', 'rollback'])
    expect(root.$transaction).toHaveBeenCalledTimes(1)
  })
})

describe('deleteTestCasesByIds', () => {
  it('does not destructively delete collaboration-managed test cases', async () => {
    cases = [caseRow('case-1', { collaborationManaged: true, archivedAt: new Date() })]
    await expect(deleteTestCasesByIds(['case-1'], project)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })
  it('keeps empty requests transaction-free and archived unmanaged Cases write-free', async () => {
    await deleteTestCasesByIds([], project); expect(root.$transaction).not.toHaveBeenCalled()
    cases = [caseRow('case-1', { archivedAt: new Date() })]
    await deleteTestCasesByIds(['case-1'], project); noWrites(); expect(tx.testCaseStep.findMany).not.toHaveBeenCalled()
  })
  it('deduplicates requests guards old archived Suite membership and tombstones only the deleted active Case', async () => {
    cases = [caseRow(), caseRow('archived', { archivedAt: new Date() })]; oldSuites = [suiteRow('suite-old', { archivedAt: new Date() })]
    await deleteTestCasesByIds(['case-1', 'archived', 'case-1'], project)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, project, { existing: [{ kind: 'TEST_CASE', resourceId: 'case-1' }, { kind: 'TEST_SUITE', resourceId: 'suite-old' }], newRoots: [], deleted: [{ kind: 'TEST_CASE', resourceId: 'case-1' }] })
    expect(tx.testCase.deleteMany.mock.calls[0][0].where.id.in).toEqual(['case-1'])
    expect(events.indexOf('prepare')).toBeLessThan(events.indexOf('parameters'))
    expect(tx.testRunTestCase.deleteMany).not.toHaveBeenCalled(); expect(tx.review.deleteMany).not.toHaveBeenCalled(); expect(tx.linkedJiraTicket.deleteMany).not.toHaveBeenCalled()
  })
  it('refuses mixed missing or foreign requested IDs before accepting an active subset', async () => {
    await expect(deleteTestCasesByIds(['case-1', 'missing'], project)).rejects.toThrow(); noWrites()
    cases = [caseRow('case-1', { targetProjectId: 'foreign' })]
    await expect(deleteTestCasesByIds(['case-1'], project)).rejects.toThrow(); noWrites()
  })
  it('snapshots delete IDs before the first asynchronous seed read', async () => {
    const ids = ['case-1']
    tx.testCase.findMany.mockImplementationOnce(async query => { ids[0] = 'foreign'; return selected([caseRow()], query) })
    await deleteTestCasesByIds(ids, project); expect(tx.testCase.deleteMany.mock.calls[0][0].where.id.in).toEqual(['case-1'])
  })
  it('refuses incoming run review and Jira history before any guard or child writer', async () => {
    for (const delegate of [tx.testRunTestCase, tx.review, tx.linkedJiraTicket]) {
      delegate.findFirst.mockResolvedValueOnce({ id: 'history' })
      await expect(deleteTestCasesByIds(['case-1'], project)).rejects.toMatchObject({ details: { reason: 'HISTORICAL_CASE_REFERENCE' } }); noWrites()
    }
  })
  it('refuses report and bare Journey Case identities without erasing historical rows', async () => {
    for (const delegate of [tx.reportTestCase, tx.qualityJourneyAutomationMaterialization, tx.qualityJourneyAutomationTargetBinding]) {
      delegate.findFirst.mockResolvedValueOnce({ id: 'history' })
      await expect(deleteTestCasesByIds(['case-1'], project)).rejects.toThrow(); noWrites()
    }
  })
  it('validates a nonsemantic metrics cascade without adding a projection guard', async () => {
    metrics = [{ id: 'metrics-1', testCaseId: 'case-1', targetProjectId: project }]
    await deleteTestCasesByIds(['case-1'], project)
    expect(tx.testCaseMetrics.deleteMany).not.toHaveBeenCalled()
    expect(prepare.mock.calls[0][2].existing).toEqual([{ kind: 'TEST_CASE', resourceId: 'case-1' }, { kind: 'TEST_SUITE', resourceId: 'suite-old' }])
  })
  it('refuses foreign metrics before any Case or identifier deletion', async () => {
    metrics = [{ id: 'metrics-1', testCaseId: 'case-1', targetProjectId: 'foreign' }]
    await expect(deleteTestCasesByIds(['case-1'], project)).rejects.toThrow(); noWrites()
  })
  it('cleans only an exact orphan Case identifier after Case removal in the same owner', async () => {
    await deleteTestCasesByIds(['case-1'], project)
    expect(events).toEqual(['tx', 'prepare', 'parameters', 'steps', 'blocks', 'case-delete', 'tag-delete', 'commit'])
    expect(tx.tag.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['identifier-old'] }, targetProjectId: project,
      type: 'IDENTIFIER', name: { startsWith: 'tc_' }, testCases: { none: {} }, testSuites: { none: {} }, testRuns: { none: {} } } })
  })
  it('retains identifier Tags referenced by surviving Cases Suites or historical runs', async () => {
    for (const extra of [{ testCases: [caseRow('survivor')] }, { testSuites: [suiteRow('survivor')] }, { testRuns: [{ id: 'run-1', targetProjectId: project }] }]) {
      oldTags = [identifier(extra)]; await deleteTestCasesByIds(['case-1'], project); expect(tx.tag.deleteMany).not.toHaveBeenCalled()
    }
  })
  it('refuses foreign incoming identifier references before the first writer', async () => {
    oldTags = [identifier({ testRuns: [{ id: 'run-foreign', targetProjectId: 'foreign' }] })]
    await expect(deleteTestCasesByIds(['case-1'], project)).rejects.toThrow(); noWrites()
  })
  it('skips orphan cleanup and propagates a direct Case deletion count mismatch', async () => {
    tx.testCase.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(deleteTestCasesByIds(['case-1'], project)).rejects.toMatchObject({ details: { reason: 'DELETE_COUNT' } })
    expect(tx.tag.deleteMany).not.toHaveBeenCalled(); expect(events.at(-1)).toBe('rollback'); expect(root.$transaction).toHaveBeenCalledTimes(1)
  })
  it('signals rollback if identifier cleanup is not exact after the Case write', async () => {
    tx.tag.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(deleteTestCasesByIds(['case-1'], project)).rejects.toMatchObject({ details: { reason: 'IDENTIFIER_DELETE_COUNT' } })
    expect(tx.testCase.deleteMany).toHaveBeenCalledTimes(1); expect(events.at(-1)).toBe('rollback')
  })
  it('refuses examined-row and aggregate resource overflows before preparation', async () => {
    steps = Array.from({ length: 65537 }, (_, index) => ({ id: `step-${index}`, testCaseId: 'case-1' }))
    await expect(deleteTestCasesByIds(['case-1'], project)).rejects.toThrow(); noWrites()
    steps = []; parameters = []; blocks = []; nodes = []
    oldSuites = Array.from({ length: 4096 }, (_, index) => suiteRow(`suite-${index}`))
    await expect(deleteTestCasesByIds(['case-1'], project)).rejects.toMatchObject({ details: { reason: 'RESOURCE_BOUND' } }); noWrites()
  })
})

describe('TestCase inspection', () => {
  it('preserves root list and scoped get projections without owning a mutation transaction', async () => {
    root.testCase.findMany.mockResolvedValueOnce([]); await expect(listTestCases(project)).resolves.toEqual([])
    root.testCase.findFirst.mockResolvedValueOnce({ id: 'case-1', TestSuite: [{ id: 'suite-1' }], tags: [{ id: 'tag-1' }] })
    await expect(getTestCaseByIdOrThrow('case-1', project)).resolves.toMatchObject({ testSuiteIds: ['suite-1'], tagIds: ['tag-1'] })
    expect(root.$transaction).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled()
  })
})
