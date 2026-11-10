import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { collectSharedModuleMutationEffectsInTransaction } from './quality-journey-shared-resource-module-mutation-effects-service'

const project = 'project-one'
type Module = { id: string; targetProjectId: string; parentId: string | null; archivedAt?: Date | null }
type Root = { id: string; targetProjectId: string; archivedAt?: Date | null }
type InQuery<Field extends string> = { where: Record<Field, { in: readonly string[] }> }
type ModuleQuery = { where: { parentId?: { in: readonly string[] }; id?: string | { in: readonly string[] } } }
type CaseQuery = { where: { id?: { in: readonly string[] }; TestSuite?: { some: { id: { in: readonly string[] } } } } }
type Data = {
  modules: Module[]
  groups: (Root & { moduleId: string })[]
  locators: (Root & { locatorGroupId: string | null })[]
  suites: (Root & { moduleId: string })[]
  cases: (Root & { suites: string[] })[]
  parameters: { id: string; locatorId: string | null; testCaseStepId: string }[]
  steps: { id: string; testCaseId: string }[]
}
const moduleRow = (id: string, parentId: string | null = null): Module => ({ id, parentId, targetProjectId: project })
const root = (id: string): Root => ({ id, targetProjectId: project })

function setup(input: Partial<Data> = {}) {
  const data: Data = { modules: [moduleRow('module')], groups: [], locators: [], suites: [], cases: [],
    parameters: [], steps: [], ...input }
  const write = vi.fn(() => { throw new Error('Collector attempted a write') })
  const tx = {
    targetProject: { findUnique: vi.fn(async () => ({ id: project })) },
    module: { findMany: vi.fn(async ({ where }: ModuleQuery) => data.modules.filter(row =>
      where.parentId ? row.parentId !== null && where.parentId.in.includes(row.parentId) :
        typeof where.id === 'string' ? row.id === where.id : where.id!.in.includes(row.id))), update: write },
    locatorGroup: { findMany: vi.fn(async ({ where }: InQuery<'moduleId'>) => data.groups.filter(row => where.moduleId.in.includes(row.moduleId))) },
    locator: { findMany: vi.fn(async ({ where }: InQuery<'locatorGroupId'>) => data.locators.filter(row => row.locatorGroupId !== null && where.locatorGroupId.in.includes(row.locatorGroupId))) },
    testSuite: { findMany: vi.fn(async ({ where }: InQuery<'moduleId'>) => data.suites.filter(row => where.moduleId.in.includes(row.moduleId))) },
    testCase: { findMany: vi.fn(async ({ where }: CaseQuery) => data.cases.filter(row => where.id ?
      where.id.in.includes(row.id) : row.suites.some(id => where.TestSuite!.some.id.in.includes(id)))) },
    testCaseStepParameter: { findMany: vi.fn(async ({ where }: InQuery<'locatorId'>) => data.parameters.filter(row => row.locatorId !== null && where.locatorId.in.includes(row.locatorId))) },
    testCaseStep: { findMany: vi.fn(async ({ where }: InQuery<'id'>) => data.steps.filter(row => where.id.in.includes(row.id))) },
    templateTestCaseStepParameter: { findMany: vi.fn(async (_query: { where: unknown }) => [] as { id: string }[]) },
    conflictResolution: { findMany: vi.fn(async (_query: { where: unknown }) => [] as { id: string }[]) },
    qualityJourneySharedResourceCoverage: { updateMany: write },
    qualityJourneySharedResourceGuard: { updateMany: write, create: write },
    qualityJourneySharedResourceClaim: { create: write },
    qualityJourneySharedResourceUse: { create: write },
    $executeRaw: write,
  }
  const collect = (ids: readonly string[] = ['module'], target = project) =>
    collectSharedModuleMutationEffectsInTransaction(tx as unknown as Prisma.TransactionClient, target, ids)
  return { tx, data, write, collect }
}

function withLocator(): Partial<Data> {
  return {
    groups: [{ ...root('group'), moduleId: 'module' }],
    locators: [{ ...root('locator'), locatorGroupId: 'group' }],
  }
}

describe('collectSharedModuleMutationEffectsInTransaction', () => {
  it('collects the archived subtree and incoming Cases, deduplicates and sorts without guarding read-only ancestors', async () => {
    const archivedAt = new Date('2026-10-24T00:00:00Z')
    const { tx, write, collect } = setup({
      modules: [moduleRow('ancestor'), moduleRow('module', 'ancestor'),
        { ...moduleRow('child', 'module'), archivedAt }],
      groups: [{ ...root('group'), moduleId: 'child', archivedAt }],
      locators: [{ ...root('locator'), locatorGroupId: 'group', archivedAt }],
      suites: [{ ...root('suite'), moduleId: 'child', archivedAt }],
      cases: [{ ...root('case-z'), suites: ['suite'], archivedAt }, { ...root('case-a'), suites: [] }],
      parameters: [{ id: 'parameter-z', locatorId: 'locator', testCaseStepId: 'step-z' },
        { id: 'parameter-a', locatorId: 'locator', testCaseStepId: 'step-a' }],
      steps: [{ id: 'step-z', testCaseId: 'case-z' }, { id: 'step-a', testCaseId: 'case-a' }],
    })
    const result = await collect(['module', 'module'])
    expect(result).toEqual({
      existing: [
        { kind: 'LOCATOR', resourceId: 'locator' }, { kind: 'LOCATOR_GROUP', resourceId: 'group' },
        { kind: 'MODULE', resourceId: 'child' }, { kind: 'MODULE', resourceId: 'module' },
        { kind: 'TEST_CASE', resourceId: 'case-a' }, { kind: 'TEST_CASE', resourceId: 'case-z' },
        { kind: 'TEST_SUITE', resourceId: 'suite' },
      ],
      moduleIds: ['child', 'module'], locatorGroupIds: ['group'], locatorIds: ['locator'],
      testSuiteIds: ['suite'], testCaseIds: ['case-a', 'case-z'],
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.existing)).toBe(true)
    expect(write).not.toHaveBeenCalled()
    expect(tx.module.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['module'] } }, orderBy: { id: 'asc' }, take: 65_536,
    }))
    const calls = [tx.module.findMany.mock.calls, tx.locatorGroup.findMany.mock.calls,
      tx.locator.findMany.mock.calls, tx.testSuite.findMany.mock.calls, tx.testCase.findMany.mock.calls,
      tx.testCaseStepParameter.findMany.mock.calls, tx.testCaseStep.findMany.mock.calls,
      tx.templateTestCaseStepParameter.findMany.mock.calls, tx.conflictResolution.findMany.mock.calls]
    for (const queryCalls of calls) {
      for (const [query] of queryCalls) {
        expect(query).toMatchObject({ orderBy: { id: 'asc' } })
        expect(query).toHaveProperty('take')
        expect(query.where).not.toHaveProperty('targetProjectId')
        expect(query.where).not.toHaveProperty('archivedAt')
      }
    }
  })

  it('traverses multiple descendant levels once when requested subtrees overlap', async () => {
    const { collect } = setup({ modules: [moduleRow('module'), moduleRow('child', 'module'),
      moduleRow('grandchild', 'child'), moduleRow('unrelated')] })
    const result = await collect(['module', 'child'])
    expect(result.moduleIds).toEqual(['child', 'grandchild', 'module'])
    expect(result.existing).toEqual(result.moduleIds.map(resourceId => ({ kind: 'MODULE', resourceId })))
  })

  it('snapshots requested IDs before the first await and handles an empty closure read-only', async () => {
    const { collect, tx, write } = setup()
    const requested = ['module']
    const pending = collect(requested)
    requested[0] = 'replacement'
    expect((await pending).moduleIds).toEqual(['module'])
    const empty = await collect([])
    expect(empty.existing).toEqual([])
    expect(write).not.toHaveBeenCalled()
    expect(tx.module.findMany.mock.calls[0]?.[0].where).toEqual({ id: { in: ['module'] } })
  })

  it.each([
    { modules: [] },
    { modules: [{ ...moduleRow('module'), targetProjectId: 'foreign' }] },
    { modules: [moduleRow('module', 'missing')] },
    { modules: [moduleRow('module', 'parent'), { ...moduleRow('parent'), targetProjectId: 'foreign' }] },
  ])('refuses missing or foreign exact seeds and ancestry: %j', async data => {
    const { collect, write } = setup(data)
    await expect(collect()).rejects.toMatchObject({ details: { reason: 'RESOURCE_MISSING_OR_FOREIGN' } })
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    { modules: [moduleRow('module', 'module')] },
    { modules: [moduleRow('module', 'child'), moduleRow('child', 'module')] },
  ])('refuses ancestry cycles', async ({ modules }) => {
    const { collect } = setup({ modules })
    await expect(collect()).rejects.toMatchObject({ details: { reason: 'MODULE_ANCESTRY_CYCLE' } })
  })

  it('does not hide a foreign descendant through project filtering', async () => {
    const { collect, tx } = setup({ modules: [moduleRow('module'),
      { ...moduleRow('child', 'module'), targetProjectId: 'foreign' }] })
    await expect(collect()).rejects.toMatchObject({ details: { reason: 'RESOURCE_MISSING_OR_FOREIGN' } })
    expect(tx.module.findMany.mock.calls[1]?.[0].where).toEqual({ parentId: { in: ['module'] } })
  })

  it('refuses a partially existing request instead of accepting its local subset', async () => {
    await expect(setup().collect(['module', 'missing'])).rejects.toMatchObject({
      details: { reason: 'RESOURCE_MISSING_OR_FOREIGN' },
    })
  })

  it('refuses a returned relationship outside the enumerated subtree', async () => {
    const { collect, tx } = setup()
    tx.locatorGroup.findMany.mockResolvedValueOnce([{ ...root('group'), moduleId: 'unrelated' }])
    await expect(collect()).rejects.toMatchObject({ details: { reason: 'RELATION_ENDPOINT' } })
  })

  it.each(['group', 'locator', 'suite', 'suite-case', 'parameter-case'])('refuses foreign incoming %s endpoints', async endpoint => {
    const data: Partial<Data> = {
      ...withLocator(), suites: [{ ...root('suite'), moduleId: 'module' }],
      cases: [{ ...root('case'), suites: endpoint === 'suite-case' ? ['suite'] : [] }],
      parameters: [{ id: 'parameter', locatorId: 'locator', testCaseStepId: 'step' }],
      steps: [{ id: 'step', testCaseId: 'case' }],
    }
    if (endpoint === 'group') data.groups![0]!.targetProjectId = 'foreign'
    if (endpoint === 'locator') data.locators![0]!.targetProjectId = 'foreign'
    if (endpoint === 'suite') data.suites![0]!.targetProjectId = 'foreign'
    if (endpoint.endsWith('case')) data.cases![0]!.targetProjectId = 'foreign'
    await expect(setup(data).collect()).rejects.toMatchObject({ details: { reason: 'RESOURCE_MISSING_OR_FOREIGN' } })
  })

  it('refuses a missing incoming Step or Case endpoint', async () => {
    const input = { ...withLocator(), parameters: [{ id: 'parameter', locatorId: 'locator', testCaseStepId: 'missing' }] }
    await expect(setup(input).collect()).rejects.toMatchObject({ details: { reason: 'RESOURCE_MISSING_OR_FOREIGN' } })
    await expect(setup({ ...input, steps: [{ id: 'missing', testCaseId: 'missing-case' }] }).collect())
      .rejects.toMatchObject({ details: { reason: 'RESOURCE_MISSING_OR_FOREIGN' } })
  })

  it('refuses an unsupported template dependency and examines both explicit locator fields', async () => {
    const { collect, tx } = setup(withLocator())
    tx.templateTestCaseStepParameter.findMany.mockResolvedValueOnce([{ id: 'template-parameter' }])
    await expect(collect()).rejects.toMatchObject({ details: { reason: 'TEMPLATE_LOCATOR_DEPENDENCY_UNSUPPORTED' } })
    expect(tx.templateTestCaseStepParameter.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ defaultLocatorId: { in: ['locator'] } }, { locatorId: { in: ['locator'] } }] },
    }))
  })

  it('refuses unsupported incoming locator conflicts', async () => {
    const { collect, tx } = setup(withLocator())
    tx.conflictResolution.findMany.mockResolvedValueOnce([{ id: 'conflict' }])
    await expect(collect()).rejects.toMatchObject({ details: { reason: 'LOCATOR_CONFLICT_DEPENDENCY_UNSUPPORTED' } })
  })

  it('refuses key overflow before reading any additional descendant edge', async () => {
    const { collect, tx } = setup({ modules: [moduleRow('module'),
      ...Array.from({ length: 4096 }, (_, index) => moduleRow(`child-${index}`, 'module'))] })
    await expect(collect()).rejects.toMatchObject({ details: { reason: 'KEYS_UNBOUNDED' } })
    expect(tx.module.findMany).toHaveBeenCalledTimes(2)
  })

  it('uses the remaining row budget plus one and refuses an overflowing query result', async () => {
    const { collect, tx } = setup()
    tx.locatorGroup.findMany.mockResolvedValueOnce(Array.from({ length: 65_535 }, (_, index) =>
      ({ ...root(`group-${index}`), moduleId: 'module' })))
    await expect(collect()).rejects.toMatchObject({ details: { reason: 'ROWS_UNBOUNDED' } })
    expect(tx.locatorGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 65_535 }))
    expect(tx.locator.findMany).not.toHaveBeenCalled()
  })

  it('rejects invalid requests and a missing target without any resource write', async () => {
    const { collect, tx, write } = setup()
    await expect(collect([''])).rejects.toMatchObject({ details: { reason: 'REQUEST_SCOPE_OR_BOUNDS' } })
    await expect(collect(new Array<string>(1))).rejects.toMatchObject({ details: { reason: 'REQUEST_SCOPE_OR_BOUNDS' } })
    await expect(collect(Array.from({ length: 4097 }, () => 'module')))
      .rejects.toMatchObject({ details: { reason: 'REQUEST_SCOPE_OR_BOUNDS' } })
    await expect(collect(['module'], '')).rejects.toMatchObject({ details: { reason: 'REQUEST_SCOPE_OR_BOUNDS' } })
    tx.targetProject.findUnique.mockResolvedValueOnce(null as unknown as { id: string })
    await expect(collect()).rejects.toMatchObject({ details: { reason: 'TARGET_MISSING' } })
    expect(write).not.toHaveBeenCalled()
  })
})
