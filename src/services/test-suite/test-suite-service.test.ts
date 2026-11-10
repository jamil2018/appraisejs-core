import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestSuiteFromInput, deleteTestSuitesByIds, updateTestSuiteFromInput,
  getTestSuiteByIdOrThrow, listTestSuites,
} from './test-suite-service'
import { prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'

const { root, tx } = vi.hoisted(() => {
  const delegates = () => ({ findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() })
  return {
    root: { tag: delegates(), module: delegates(), testCase: delegates(), testSuite: delegates(), $transaction: vi.fn() },
    tx: { tag: delegates(), module: delegates(), testCase: delegates(), testSuite: delegates(), testRunTestCase: delegates() },
  }
})
vi.mock('@/config/db-config', () => ({ default: root }))
vi.mock('@prisma/client', () => ({ TagType: { IDENTIFIER: 'IDENTIFIER', FILTER: 'FILTER' } }))
vi.mock('@/lib/test-suite-identifier-service', () => ({
  ensureTestSuiteIdentifierTags: vi.fn(), getOrCreateTestSuiteIdentifierTagId: vi.fn(),
}))
vi.mock('@/lib/test-suite-utils', () => ({ generateUniqueTestSuiteIdentifier: () => 'ts_new' }))
vi.mock('@/services/coordinator/quality-journey-shared-resource-guard-service', () => ({
  prepareSharedResourceMutationInTransaction: vi.fn(),
}))
import { ensureTestSuiteIdentifierTags, getOrCreateTestSuiteIdentifierTagId } from '@/lib/test-suite-identifier-service'

const project = 'project-1'
const prepare = vi.mocked(prepareSharedResourceMutationInTransaction)
const suite = (id = 'suite-1', extra = {}) => ({ id, targetProjectId: project, moduleId: 'module-1', archivedAt: null, collaborationManaged: false, ...extra })
const caseRow = (id: string, extra = {}) => ({ id, targetProjectId: project, archivedAt: null, ...extra })
const tag = (id = 'identifier-tag', extra = {}) => ({ id, targetProjectId: project, name: 'ts_old', tagExpression: '@ts_old', type: 'IDENTIFIER', archivedAt: null, ...extra })
const value = (extra = {}) => ({ name: 'Login Suite', description: 'Covers login', moduleId: 'module-1', testCases: ['case-new'], tagIds: ['filter-tag'], ...extra })
let suites: Map<string, ReturnType<typeof suite>>
let cases: Map<string, ReturnType<typeof caseRow>>
let tags: Map<string, ReturnType<typeof tag>>
let oldCases: string[]
let oldTags: string[]
let events: string[]
function projectRow(row: Record<string, unknown>, select?: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries((select ? Object.keys(select).filter(key => select[key]) : Object.keys(row)).map(key => {
    if (!Object.hasOwn(row, key)) throw new Error(`Fixture omitted selected field: ${key}`)
    const field = row[key]
    return [key, field instanceof Date ? new Date(field.getTime()) : field]
  }))
}
function noWrite() {
  expect(prepare).not.toHaveBeenCalled()
  expect(tx.tag.create).not.toHaveBeenCalled()
  expect(tx.testSuite.create).not.toHaveBeenCalled()
  expect(tx.testSuite.update).not.toHaveBeenCalled()
  expect(tx.testSuite.deleteMany).not.toHaveBeenCalled()
  expect(tx.tag.deleteMany).not.toHaveBeenCalled()
}
function expectedKeys(caseIds: string[]) {
  return [...caseIds.sort().map(resourceId => ({ kind: 'TEST_CASE', resourceId })), { kind: 'TEST_SUITE', resourceId: 'suite-1' }]
}
beforeEach(() => {
  vi.resetAllMocks()
  events = []; oldCases = ['case-old']; oldTags = ['identifier-tag']
  suites = new Map([['suite-1', suite()]])
  cases = new Map([['case-old', caseRow('case-old')], ['case-new', caseRow('case-new')]])
  tags = new Map([['identifier-tag', tag()], ['filter-tag', tag('filter-tag', { name: 'smoke', tagExpression: '@smoke', type: 'FILTER' })]])
  root.$transaction.mockImplementation(async work => {
    events.push('begin')
    try { const result = await work(tx); events.push('commit'); return result }
    catch (error) { events.push('rollback-signal'); throw error }
  })
  for (const delegate of [root.module, root.tag, root.testCase, root.testSuite])
    for (const method of Object.values(delegate)) method.mockImplementation(() => { throw new Error('Unexpected root-client operation') })
  tx.module.findFirst.mockImplementation(async ({ where, select }) => {
    events.push('module-read')
    return where.id === 'module-1' ? projectRow({ id: 'module-1', targetProjectId: project, archivedAt: null }, select) : null
  })
  tx.testSuite.findFirst.mockImplementation(async ({ where, select }) => {
    const row = suites.get(where.id); return row ? projectRow(row, select) : null
  })
  tx.testSuite.findMany.mockImplementation(async ({ where, select }) =>
    where.id.in.flatMap((id: string) => suites.has(id) ? [projectRow(suites.get(id)!, select)] : []))
  tx.testCase.findMany.mockImplementation(async ({ where, select }) => {
    const ids = where.id?.in ?? oldCases
    return ids.flatMap((id: string) => cases.has(id) ? [projectRow(cases.get(id)!, select)] : [])
  })
  tx.tag.findMany.mockImplementation(async ({ where, select }) =>
    (where.id?.in ?? oldTags).flatMap((id: string) => tags.has(id) ? [projectRow(tags.get(id)!, select)] : []))
  tx.tag.findFirst.mockImplementation(async ({ where }) => {
    const row = tags.get(where.id)
    return row ? { ...row, testSuites: [{ id: 'suite-1', targetProjectId: project }], testCases: [], testRuns: [] } : null
  })
  tx.testRunTestCase.findFirst.mockResolvedValue(null)
  prepare.mockImplementation(async () => { events.push('prepare') })
  tx.tag.create.mockImplementation(async () => { events.push('tag-create'); return { id: 'new-identifier' } })
  tx.testSuite.create.mockImplementation(async ({ data }) => { events.push('suite-create'); return { id: data.id, name: data.name } })
  tx.testSuite.update.mockImplementation(async () => { events.push('suite-update'); return { id: 'suite-1' } })
  tx.testSuite.deleteMany.mockImplementation(async ({ where }) => { events.push('suite-delete'); return { count: where.id.in.length } })
  tx.tag.deleteMany.mockImplementation(async ({ where }) => { events.push('tag-delete'); return { count: where.id.in.length } })
})

describe('createTestSuiteFromInput', () => {
  it('creates a suite with an identifier tag without generating a feature file', async () => {
    const result = await createTestSuiteFromInput(value(), project)
    expect(result).toMatchObject({ name: 'Login Suite' })
    expect(result.id).toMatch(/^[a-f0-9-]{36}$/)
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(prepare).toHaveBeenCalledWith(tx, project, {
      existing: [{ kind: 'TEST_CASE', resourceId: 'case-new' }],
      newRoots: [{ kind: 'TEST_SUITE', resourceId: result.id }], deleted: [],
    })
    expect(events.indexOf('prepare')).toBeLessThan(events.indexOf('tag-create'))
    expect(events.slice(-3)).toEqual(['tag-create', 'suite-create', 'commit'])
    expect(tx.testSuite.create.mock.calls[0][0].data.tags.connect).toEqual([{ id: 'new-identifier' }, { id: 'filter-tag' }])
  })
  it('prepares only the fresh Suite for an empty membership with read-only Module and Tag endpoints', async () => {
    await createTestSuiteFromInput(value({ testCases: [] }), project)
    expect(prepare.mock.calls[0][2]).toMatchObject({ existing: [], deleted: [] })
    expect(prepare.mock.calls[0][2].newRoots).toHaveLength(1)
  })
  it('snapshots create fields and arrays before its first asynchronous read', async () => {
    const input = value()
    const pending = createTestSuiteFromInput(input, project)
    input.name = 'Changed'; input.testCases.push('missing'); input.tagIds.push('missing')
    await pending
    expect(tx.testSuite.create.mock.calls[0][0].data.name).toBe('Login Suite')
    expect(prepare.mock.calls[0][2].existing).toEqual([{ kind: 'TEST_CASE', resourceId: 'case-new' }])
  })
  it('refuses a foreign Module before preparing or creating an identifier', async () => {
    tx.module.findFirst.mockResolvedValue({ id: 'module-1', targetProjectId: 'foreign', archivedAt: null })
    await expect(createTestSuiteFromInput(value(), project)).rejects.toMatchObject({ statusCode: 400 })
    noWrite()
    expect(tx.module.findFirst.mock.calls[0][0].where).toEqual({ id: 'module-1' })
  })
  it('refuses foreign supplied Cases without hiding their scope', async () => {
    cases.set('case-new', caseRow('case-new', { targetProjectId: 'foreign' }))
    await expect(createTestSuiteFromInput(value(), project)).rejects.toMatchObject({ statusCode: 400 })
    noWrite()
    expect(tx.testCase.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['case-new'] } })
  })
  it('refuses an absent supplied Case before preparation', async () => {
    cases.delete('case-new')
    await expect(createTestSuiteFromInput(value(), project)).rejects.toMatchObject({ statusCode: 400 })
    noWrite()
  })
  it('refuses an archived supplied Case before preparation', async () => {
    cases.set('case-new', caseRow('case-new', { archivedAt: new Date() }))
    await expect(createTestSuiteFromInput(value(), project)).rejects.toMatchObject({ statusCode: 400 })
    noWrite()
  })
  it('refuses an archived supplied Tag before preparation', async () => {
    tags.set('filter-tag', tag('filter-tag', { archivedAt: new Date(), type: 'FILTER' }))
    await expect(createTestSuiteFromInput(value(), project)).rejects.toMatchObject({ statusCode: 400 })
    noWrite()
  })
  it('rejects duplicate membership IDs before opening a transaction', async () => {
    await expect(createTestSuiteFromInput(value({ testCases: ['case-new', 'case-new'] }), project)).rejects.toMatchObject({ statusCode: 400 })
    expect(root.$transaction).not.toHaveBeenCalled()
  })
  it('propagates identifier creation failure without a Suite write or retry', async () => {
    tx.tag.create.mockRejectedValue(new Error('tag-fault'))
    await expect(createTestSuiteFromInput(value(), project)).rejects.toThrow('tag-fault')
    expect(tx.testSuite.create).not.toHaveBeenCalled()
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(events.at(-1)).toBe('rollback-signal')
  })
  it('propagates fresh Suite preparation refusal before creating an identifier', async () => {
    prepare.mockRejectedValue(new Error('guard-fault'))
    await expect(createTestSuiteFromInput(value(), project)).rejects.toThrow('guard-fault')
    expect(tx.tag.create).not.toHaveBeenCalled()
    expect(tx.testSuite.create).not.toHaveBeenCalled()
  })
})

describe('updateTestSuiteFromInput', () => {
  it('updates database relationships when the name changes and preserves the identifier tag', async () => {
    await updateTestSuiteFromInput(value({ name: 'New Name' }), 'suite-1', project)
    expect(prepare).toHaveBeenCalledWith(tx, project, { existing: expectedKeys(['case-new', 'case-old']), newRoots: [], deleted: [] })
    expect(tx.testSuite.update.mock.calls[0][0].data).toEqual({
      name: 'New Name', description: 'Covers login', testCases: { set: [{ id: 'case-new' }] },
      tags: { set: [{ id: 'identifier-tag' }, { id: 'filter-tag' }] }, module: { connect: { id: 'module-1' } },
    })
    expect(tx.tag.create).not.toHaveBeenCalled()
    expect(getOrCreateTestSuiteIdentifierTagId).not.toHaveBeenCalled()
    expect(ensureTestSuiteIdentifierTags).not.toHaveBeenCalled()
    expect(root.$transaction).toHaveBeenCalledTimes(1)
  })
  it('guards the Suite alone when Case membership is omitted', async () => {
    await updateTestSuiteFromInput(value({ testCases: undefined }), 'suite-1', project)
    expect(prepare.mock.calls[0][2].existing).toEqual([{ kind: 'TEST_SUITE', resourceId: 'suite-1' }])
    expect(tx.testCase.findMany.mock.calls[0][0].where).toEqual({ TestSuite: { some: { id: { in: ['suite-1'] } } } })
    expect(tx.testSuite.update.mock.calls[0][0].data.testCases).toEqual({ set: undefined })
  })
  it('includes archived old Cases before an explicit empty membership set', async () => {
    cases.set('case-old', caseRow('case-old', { archivedAt: new Date() }))
    await updateTestSuiteFromInput(value({ testCases: [] }), 'suite-1', project)
    expect(prepare.mock.calls[0][2].existing).toEqual(expectedKeys(['case-old']))
    expect(tx.testCase.findMany.mock.calls[0][0].where).toEqual({ TestSuite: { some: { id: { in: ['suite-1'] } } } })
  })
  it('creates a missing identifier only after the one complete owner batch', async () => {
    oldTags = []
    await updateTestSuiteFromInput(value(), 'suite-1', project)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(events.slice(-4)).toEqual(['prepare', 'tag-create', 'suite-update', 'commit'])
    expect(tx.testSuite.update.mock.calls[0][0].data.tags.set[0]).toEqual({ id: 'new-identifier' })
  })
  it('snapshots update fields and membership before asynchronous reads', async () => {
    const input = value()
    const pending = updateTestSuiteFromInput(input, 'suite-1', project)
    input.name = 'Changed'; input.testCases.length = 0
    await pending
    expect(tx.testSuite.update.mock.calls[0][0].data.name).toBe('Login Suite')
    expect(prepare.mock.calls[0][2].existing).toEqual(expectedKeys(['case-new', 'case-old']))
  })
  it('refuses unavailable edited Suites with the existing NOT_FOUND shape', async () => {
    suites.set('suite-1', suite('suite-1', { archivedAt: new Date() }))
    await expect(updateTestSuiteFromInput(value(), 'suite-1', project)).rejects.toMatchObject({ statusCode: 404 })
    noWrite()
  })
  it('refuses a foreign old membership endpoint before preparing', async () => {
    cases.set('case-old', caseRow('case-old', { targetProjectId: 'foreign' }))
    await expect(updateTestSuiteFromInput(value(), 'suite-1', project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
  })
  it('refuses a foreign existing Tag without guarding unrelated Tag parents', async () => {
    tags.set('identifier-tag', tag('identifier-tag', { targetProjectId: 'foreign' }))
    await expect(updateTestSuiteFromInput(value(), 'suite-1', project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
  })
  it('propagates a guard refusal without identifier repair or final write', async () => {
    oldTags = []; prepare.mockRejectedValue(new Error('guard-fault'))
    await expect(updateTestSuiteFromInput(value(), 'suite-1', project)).rejects.toThrow('guard-fault')
    expect(tx.tag.create).not.toHaveBeenCalled(); expect(tx.testSuite.update).not.toHaveBeenCalled()
    expect(events.at(-1)).toBe('rollback-signal')
  })
  it('signals rollback on a final Suite write failure without a nested transaction', async () => {
    tx.testSuite.update.mockRejectedValue(new Error('suite-fault'))
    await expect(updateTestSuiteFromInput(value(), 'suite-1', project)).rejects.toThrow('suite-fault')
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(events.at(-1)).toBe('rollback-signal')
  })
})

describe('deleteTestSuitesByIds', () => {
  it('deletes suites and skips orphan-tag cleanup when no identifier tags', async () => {
    oldTags = []
    await deleteTestSuitesByIds(['suite-1'], project)
    expect(prepare).toHaveBeenCalledWith(tx, project, { existing: expectedKeys(['case-old']), newRoots: [], deleted: [{ kind: 'TEST_SUITE', resourceId: 'suite-1' }] })
    expect(tx.testSuite.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['suite-1'] }, targetProjectId: project, archivedAt: null, collaborationManaged: false } })
    expect(tx.tag.deleteMany).not.toHaveBeenCalled()
  })
  it('does not destructively delete collaboration-managed suites', async () => {
    suites.set('suite-1', suite('suite-1', { collaborationManaged: true, archivedAt: new Date() }))
    await expect(deleteTestSuitesByIds(['suite-1'], project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
  })
  it('keeps empty input transaction-free and archived unmanaged Suites write-free', async () => {
    await deleteTestSuitesByIds([], project)
    expect(root.$transaction).not.toHaveBeenCalled()
    suites.set('suite-1', suite('suite-1', { archivedAt: new Date() }))
    await deleteTestSuitesByIds(['suite-1'], project)
    noWrite()
  })
  it('refuses a mixed missing requested scope instead of deleting a subset', async () => {
    await expect(deleteTestSuitesByIds(['suite-1', 'missing'], project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
    expect(tx.testSuite.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['missing', 'suite-1'] } })
  })
  it('refuses any incoming run association before tombstones or destructive SET NULL', async () => {
    tx.testRunTestCase.findFirst.mockResolvedValue({ id: 'historical-link' })
    await expect(deleteTestSuitesByIds(['suite-1'], project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
    expect(tx.testRunTestCase.findFirst).toHaveBeenCalledWith({ where: { testSuiteId: { in: ['suite-1'] } }, select: { id: true } })
  })
  it('deduplicates requests and keeps archived old Case members LIVE in the batch', async () => {
    oldTags = []; cases.set('case-old', caseRow('case-old', { archivedAt: new Date() }))
    await deleteTestSuitesByIds(['suite-1', 'suite-1'], project)
    expect(prepare.mock.calls[0][2]).toEqual({ existing: expectedKeys(['case-old']), newRoots: [], deleted: [{ kind: 'TEST_SUITE', resourceId: 'suite-1' }] })
  })
  it('cleans only exact unreferenced identifier Tags after Suite deletion in the same transaction', async () => {
    await deleteTestSuitesByIds(['suite-1'], project)
    expect(events.slice(-4)).toEqual(['prepare', 'suite-delete', 'tag-delete', 'commit'])
    expect(tx.tag.deleteMany).toHaveBeenCalledWith({ where: {
      id: { in: ['identifier-tag'] }, targetProjectId: project, type: 'IDENTIFIER', name: { startsWith: 'ts_' },
      testSuites: { none: {} }, testCases: { none: {} }, testRuns: { none: {} },
    } })
    expect(root.$transaction).toHaveBeenCalledTimes(1)
  })
  it('retains identifiers referenced by a historical run', async () => {
    tx.tag.findFirst.mockResolvedValue({ ...tag(), testSuites: [{ id: 'suite-1', targetProjectId: project }], testCases: [], testRuns: [{ id: 'run-1', targetProjectId: project }] })
    await deleteTestSuitesByIds(['suite-1'], project)
    expect(tx.tag.deleteMany).not.toHaveBeenCalled()
  })
  it('retains identifiers shared with a surviving Suite', async () => {
    tx.tag.findFirst.mockResolvedValue({ ...tag(), testSuites: [{ id: 'suite-1', targetProjectId: project }, { id: 'surviving-suite', targetProjectId: project }], testCases: [], testRuns: [] })
    await deleteTestSuitesByIds(['suite-1'], project)
    expect(tx.tag.deleteMany).not.toHaveBeenCalled()
  })
  it('retains identifiers referenced by a surviving Case', async () => {
    tx.tag.findFirst.mockResolvedValue({ ...tag(), testSuites: [{ id: 'suite-1', targetProjectId: project }], testCases: [{ id: 'case-old', targetProjectId: project }], testRuns: [] })
    await deleteTestSuitesByIds(['suite-1'], project)
    expect(tx.tag.deleteMany).not.toHaveBeenCalled()
  })
  it('refuses foreign incoming identifier references before the first writer', async () => {
    tx.tag.findFirst.mockResolvedValue({ ...tag(), testSuites: [{ id: 'suite-1', targetProjectId: project }], testCases: [{ id: 'foreign-case', targetProjectId: 'foreign' }], testRuns: [] })
    await expect(deleteTestSuitesByIds(['suite-1'], project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
  })
  it('signals rollback for a Suite deletion count mismatch and skips identifier cleanup', async () => {
    tx.testSuite.deleteMany.mockResolvedValue({ count: 0 })
    await expect(deleteTestSuitesByIds(['suite-1'], project)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.tag.deleteMany).not.toHaveBeenCalled()
    expect(events.at(-1)).toBe('rollback-signal')
  })
  it('signals rollback when orphan cleanup count is not exact', async () => {
    tx.tag.deleteMany.mockResolvedValue({ count: 0 })
    await expect(deleteTestSuitesByIds(['suite-1'], project)).rejects.toMatchObject({ statusCode: 409 })
    expect(events.at(-1)).toBe('rollback-signal')
  })
  it('bounds the whole Suite and Case key union before preparation', async () => {
    oldTags = []; oldCases = Array.from({ length: 4096 }, (_, i) => `case-${i}`)
    cases = new Map(oldCases.map(id => [id, caseRow(id)]))
    await expect(deleteTestSuitesByIds(['suite-1'], project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
  })
})

describe('TestSuite inspection', () => {
  it('preserves identifier repair entry signatures and scoped read projections', async () => {
    root.testSuite.findMany.mockResolvedValue([])
    root.testSuite.findFirst.mockResolvedValue({ id: 'suite-1' })
    await listTestSuites(project)
    await getTestSuiteByIdOrThrow('suite-1', project)
    expect(vi.mocked(ensureTestSuiteIdentifierTags).mock.calls).toEqual([[undefined, project], [['suite-1'], project]])
    expect(root.$transaction).not.toHaveBeenCalled()
  })
})
