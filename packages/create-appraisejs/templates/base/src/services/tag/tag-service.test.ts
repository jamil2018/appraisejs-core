import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTag, deleteTags, getTagByIdOrThrow, listFilterTags, updateTag } from './tag-service'
import { prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'

const { root, tx } = vi.hoisted(() => {
  const delegates = () => ({ findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() })
  const client = () => ({ tag: delegates(), testCase: delegates(), testSuite: delegates(), module: delegates(), testRun: delegates() })
  return { root: { ...client(), $transaction: vi.fn() }, tx: client() }
})
vi.mock('@/config/db-config', () => ({ default: root }))
vi.mock('@prisma/client', () => ({ TagType: { IDENTIFIER: 'IDENTIFIER', FILTER: 'FILTER' } }))
vi.mock('@/services/coordinator/quality-journey-shared-resource-guard-service', () => ({
  prepareSharedResourceMutationInTransaction: vi.fn(),
}))

type Row = Record<string, unknown>
const project = 'project-1'
const prepare = vi.mocked(prepareSharedResourceMutationInTransaction)
const input = () => ({ name: 'Smoke', tagExpression: '@smoke' })
const tagRow = (id = 'tag-1', extra: Row = {}) => ({ id, targetProjectId: project, archivedAt: null,
  collaborationManaged: false, name: 'Smoke', tagExpression: '@smoke', ...extra })
let tags: Row[], cases: Row[], suites: Row[], modules: Row[], runs: Row[], events: string[]
function projection(row: Row, select: Record<string, unknown>): Row {
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key]) => {
    if (!Object.hasOwn(row, key)) throw new Error(`Fixture omitted selected field: ${key}`)
    return [key, structuredClone(row[key])]
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
const emptyBatch = { existing: [], newRoots: [], deleted: [] }
const parentBatch = { existing: [{ kind: 'TEST_CASE', resourceId: 'case-1' },
  { kind: 'TEST_SUITE', resourceId: 'suite-1' }], newRoots: [], deleted: [] }
beforeEach(() => {
  vi.resetAllMocks()
  tags = [tagRow()]; cases = [{ id: 'case-1', targetProjectId: project }]
  suites = [{ id: 'suite-1', targetProjectId: project, moduleId: 'module-1' }]
  modules = [{ id: 'module-1', targetProjectId: project }]; runs = []; events = []
  for (const name of Object.keys(tx) as Array<keyof typeof tx>)
    for (const method of Object.values(root[name])) method.mockImplementation(() => { throw new Error('Unexpected root delegate') })
  root.$transaction.mockImplementation(async callback => {
    events.push('tx')
    try { const result = await callback(tx); events.push('commit'); return result }
    catch (error) { events.push('rollback'); throw error }
  })
  tx.tag.findFirst.mockImplementation(async query => {
    const row = typeof query.where.id === 'string' ? tags.find(value => value.id === query.where.id) : null
    return row ? projection(row, query.select) : null
  })
  tx.tag.findMany.mockImplementation(async query => selected(tags.filter(row => query.where.id.in.includes(row.id)), query))
  tx.testCase.findMany.mockImplementation(async query => selected(cases, query))
  tx.testSuite.findMany.mockImplementation(async query => selected(suites, query))
  tx.module.findMany.mockImplementation(async query => selected(modules.filter(row => query.where.id.in.includes(row.id)), query))
  tx.testRun.findMany.mockImplementation(async query => selected(runs, query))
  prepare.mockImplementation(async () => { events.push('prepare') })
  tx.tag.create.mockImplementation(async query => { events.push('tag-create'); return { id: 'tag-new', ...structuredClone(query.data) } })
  tx.tag.update.mockImplementation(async query => { events.push('tag-update'); return { id: query.where.id, ...structuredClone(query.data) } })
  tx.tag.deleteMany.mockImplementation(async query => { events.push('tag-delete'); return { count: query.where.id.in.length } })
})

describe('getTagByIdOrThrow', () => {
  it('throws when tag missing', async () => {
    root.tag.findFirst.mockResolvedValue(null)
    await expect(getTagByIdOrThrow('id', project)).rejects.toMatchObject({ message: 'Tag not found', statusCode: 404 })
    expect(root.$transaction).not.toHaveBeenCalled()
  })
  it('preserves root inspection list and get projections without a mutation owner', async () => {
    const rows = [tagRow()]; root.tag.findMany.mockResolvedValue(rows); root.tag.findFirst.mockResolvedValue(rows[0])
    await expect(listFilterTags(project)).resolves.toEqual(rows)
    await expect(getTagByIdOrThrow('tag-1', project)).resolves.toEqual(rows[0])
    expect(root.tag.findMany).toHaveBeenCalledWith({ where: { type: 'FILTER', targetProjectId: project, archivedAt: null } })
    expect(root.tag.findFirst).toHaveBeenCalledWith({ where: { id: 'tag-1', targetProjectId: project, archivedAt: null } })
    expect(root.$transaction).not.toHaveBeenCalled(); noWrites()
  })
})

describe('createTag', () => {
  it('throws when tag name already exists', async () => {
    tx.tag.findFirst.mockResolvedValueOnce({ id: 'tag-other' })
    await expect(createTag(input(), project)).rejects.toMatchObject({ message: expect.stringContaining('tag name'), statusCode: 400 })
    expect(tx.tag.findFirst).toHaveBeenCalledExactlyOnceWith({ where: { name: 'Smoke', targetProjectId: project } }); noWrites()
  })
  it('throws when tag expression already exists', async () => {
    tx.tag.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'tag-other' })
    await expect(createTag(input(), project)).rejects.toMatchObject({ message: expect.stringContaining('tag expression'), statusCode: 400 })
    expect(tx.tag.findFirst).toHaveBeenNthCalledWith(2, { where: { tagExpression: '@smoke', targetProjectId: project } }); noWrites()
  })
  it('creates and returns a tag when tag expression is unique', async () => {
    await expect(createTag(input(), project)).resolves.toEqual({ id: 'tag-new', ...input(), targetProjectId: project })
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, project, emptyBatch)
    expect(tx.tag.create).toHaveBeenCalledWith({ data: { ...input(), targetProjectId: project } })
    expect(tx.testCase.findMany).not.toHaveBeenCalled(); expect(tx.testSuite.findMany).not.toHaveBeenCalled()
    expect(events).toEqual(['tx', 'prepare', 'tag-create', 'commit'])
  })
  it('snapshots the form before the first asynchronous uniqueness read', async () => {
    const value = input()
    tx.tag.findFirst.mockImplementationOnce(async () => { value.name = 'Changed'; value.tagExpression = '@changed'; return null })
    await createTag(value, project)
    expect(tx.tag.findFirst).toHaveBeenNthCalledWith(2, { where: { tagExpression: '@smoke', targetProjectId: project } })
    expect(tx.tag.create).toHaveBeenCalledWith({ data: { name: 'Smoke', tagExpression: '@smoke', targetProjectId: project } })
  })
  it('propagates preparation refusal before the fresh writer without retry', async () => {
    prepare.mockRejectedValue(new Error('preparation refused'))
    await expect(createTag(input(), project)).rejects.toThrow('preparation refused')
    expect(tx.tag.create).not.toHaveBeenCalled(); expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['tx', 'rollback'])
  })
  it('propagates the final create fault through its single owner', async () => {
    tx.tag.create.mockRejectedValue(new Error('create fault'))
    await expect(createTag(input(), project)).rejects.toThrow('create fault')
    expect(root.$transaction).toHaveBeenCalledTimes(1); expect(events).toEqual(['tx', 'prepare', 'rollback'])
  })
})

describe('updateTag', () => {
  it('throws when tag name already exists on another tag', async () => {
    tx.tag.findFirst.mockResolvedValueOnce(tagRow()).mockResolvedValueOnce({ id: 'tag-other' })
    await expect(updateTag('tag-1', { name: 'Regression', tagExpression: '@smoke' }, project))
      .rejects.toMatchObject({ message: expect.stringContaining('tag name'), statusCode: 400 })
    expect(tx.tag.findFirst).toHaveBeenNthCalledWith(2, { where: { name: 'Regression', targetProjectId: project, id: { not: 'tag-1' } } }); noWrites()
  })
  it('throws when tag expression already exists on another tag', async () => {
    tx.tag.findFirst.mockResolvedValueOnce(tagRow()).mockResolvedValueOnce({ id: 'tag-other' })
    await expect(updateTag('tag-1', { name: 'Smoke', tagExpression: '@regression' }, project))
      .rejects.toMatchObject({ message: expect.stringContaining('tag expression'), statusCode: 400 }); noWrites()
  })
  it('updates the tag when the tag expression remains unchanged', async () => {
    const value = { name: 'Smoke Updated', tagExpression: '@smoke' }
    await expect(updateTag('tag-1', value, project)).resolves.toEqual({ id: 'tag-1', ...value })
    expect(tx.tag.findFirst).toHaveBeenCalledTimes(2)
    expect(tx.tag.findFirst).toHaveBeenNthCalledWith(2, { where: { name: value.name, targetProjectId: project, id: { not: 'tag-1' } } })
    expect(tx.tag.update).toHaveBeenCalledWith({ where: { id: 'tag-1' }, data: value })
  })
  it('prepares the complete archived Case and Suite union before its writer in the exact owner', async () => {
    cases = [{ id: 'case-1', targetProjectId: project, archivedAt: new Date() }]
    suites = [{ id: 'suite-1', targetProjectId: project, moduleId: 'module-1', archivedAt: new Date() }]
    modules = [{ id: 'module-1', targetProjectId: project, archivedAt: new Date() }]
    await updateTag('tag-1', input(), project)
    expect(root.$transaction).toHaveBeenCalledTimes(1); expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, project, parentBatch)
    for (const delegate of [tx.testCase, tx.testSuite, tx.testRun])
      expect(delegate.findMany.mock.calls[0][0].where).toEqual({ tags: { some: { id: { in: ['tag-1'] } } } })
    expect(tx.module.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['module-1'] } })
    expect(events).toEqual(['tx', 'prepare', 'tag-update', 'commit'])
  })
  it('keeps an unbound Tag update an empty batch without a fabricated root or neighbor CAS', async () => {
    cases = []; suites = []
    await updateTag('tag-1', input(), project)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, project, emptyBatch)
    expect(tx.module.findMany).not.toHaveBeenCalled()
  })
  it('does not repeat uniqueness reads for unchanged scalar values', async () => {
    await updateTag('tag-1', input(), project)
    expect(tx.tag.findFirst).toHaveBeenCalledTimes(1)
    expect(tx.tag.findFirst.mock.calls[0][0].where).toEqual({ id: 'tag-1' })
  })
  it('preserves required id and exact active current Tag not-found outcomes', async () => {
    await expect(updateTag(undefined, input(), project)).rejects.toMatchObject({ message: 'Tag id is required', statusCode: 400 })
    expect(root.$transaction).not.toHaveBeenCalled()
    for (const rows of [[], [tagRow('tag-1', { targetProjectId: 'foreign' })], [tagRow('tag-1', { archivedAt: new Date() })]]) {
      tags = rows; await expect(updateTag('tag-1', input(), project)).rejects.toMatchObject({ message: 'Tag not found', statusCode: 404 }); noWrites()
    }
  })
  it('refuses foreign incoming Cases and Suites before preparation instead of hiding them', async () => {
    cases = [{ id: 'case-1', targetProjectId: 'foreign' }]
    await expect(updateTag('tag-1', input(), project)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    cases = []; suites = [{ id: 'suite-1', targetProjectId: 'foreign', moduleId: 'module-1' }]
    await expect(updateTag('tag-1', input(), project)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })
  it('refuses missing or foreign Suite Module endpoints while leaving Modules read-only', async () => {
    for (const rows of [[], [{ id: 'module-1', targetProjectId: 'foreign' }]]) {
      modules = rows; await expect(updateTag('tag-1', input(), project)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    }
  })
  it('preserves scoped historical Run links while allowing the Tag display to change', async () => {
    runs = [{ id: 'run-old', targetProjectId: project }]
    await updateTag('tag-1', { name: 'Renamed', tagExpression: '@renamed' }, project)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, project, parentBatch)
    expect(tx.tag.update).toHaveBeenCalledWith({ where: { id: 'tag-1' }, data: { name: 'Renamed', tagExpression: '@renamed' } })
    expect(tx.testRun.update).not.toHaveBeenCalled(); expect(tx.testRun.deleteMany).not.toHaveBeenCalled()
    expect(runs).toEqual([{ id: 'run-old', targetProjectId: project }])
  })
  it('refuses foreign incoming Run endpoints before any scalar write', async () => {
    runs = [{ id: 'run-foreign', targetProjectId: 'foreign' }]
    await expect(updateTag('tag-1', input(), project)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })
  it('snapshots scalar input before the current Tag query awaits', async () => {
    const value = input()
    tx.tag.findFirst.mockImplementationOnce(async query => {
      value.name = 'Changed'; value.tagExpression = '@changed'; return projection(tagRow(), query.select)
    })
    await updateTag('tag-1', value, project)
    expect(tx.tag.update).toHaveBeenCalledWith({ where: { id: 'tag-1' }, data: { name: 'Smoke', tagExpression: '@smoke' } })
  })
  it('propagates claim preparation refusal before the writer without nested transactions or retry', async () => {
    prepare.mockRejectedValue(new Error('claim refused'))
    await expect(updateTag('tag-1', input(), project)).rejects.toThrow('claim refused')
    expect(tx.tag.update).not.toHaveBeenCalled(); expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['tx', 'rollback'])
  })
  it('propagates a final update failure as an owner rollback signal', async () => {
    tx.tag.update.mockRejectedValue(new Error('update fault'))
    await expect(updateTag('tag-1', input(), project)).rejects.toThrow('update fault')
    expect(root.$transaction).toHaveBeenCalledTimes(1); expect(events).toEqual(['tx', 'prepare', 'rollback'])
  })
  it('refuses aggregate Case and Suite resource overflow before preparation', async () => {
    cases = Array.from({ length: 4096 }, (_, index) => ({ id: `case-${index}`, targetProjectId: project }))
    await expect(updateTag('tag-1', input(), project)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })
  it('shares its examined-row budget across seed authored endpoints and incoming Runs', async () => {
    suites = []; runs = Array.from({ length: 65535 }, (_, index) => ({ id: `run-${index}`, targetProjectId: project }))
    await expect(updateTag('tag-1', input(), project)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    expect(tx.testRun.findMany.mock.calls[0][0].take).toBe(65535)
  })
})

describe('deleteTags', () => {
  it('does not destructively delete collaboration-managed tags', async () => {
    for (const archivedAt of [null, new Date()]) {
      tags = [tagRow('tag-1', { collaborationManaged: true, archivedAt })]
      await expect(deleteTags(['tag-1'], project)).rejects.toMatchObject({ message: 'Collaboration-managed tags must be archived, not deleted.', statusCode: 409 }); noWrites()
    }
  })
  it('keeps empty deletion transaction-free and archived unmanaged Tags write-free', async () => {
    await deleteTags([], project); expect(root.$transaction).not.toHaveBeenCalled()
    tags = [tagRow('tag-1', { archivedAt: new Date() })]
    await deleteTags(['tag-1'], project); noWrites(); expect(tx.testCase.findMany).not.toHaveBeenCalled()
  })
  it('requires every exact requested Tag before accepting an active subset', async () => {
    for (const rows of [[tagRow()], [tagRow(), tagRow('tag-2', { targetProjectId: 'foreign' })]]) {
      tags = rows; await expect(deleteTags(['tag-1', 'tag-2'], project)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    }
    expect(tx.tag.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['tag-1', 'tag-2'] } })
  })
  it('deduplicates Tags and prepares only the actual archived Case and Suite union with no root tombstones', async () => {
    tags = [tagRow(), tagRow('tag-2'), tagRow('archived', { archivedAt: new Date() })]
    cases = [{ id: 'case-1', targetProjectId: project, archivedAt: new Date() }]
    suites = [{ id: 'suite-1', targetProjectId: project, moduleId: 'module-1', archivedAt: new Date() }]
    await deleteTags(['tag-1', 'tag-2', 'archived', 'tag-1'], project)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, project, parentBatch)
    expect(tx.tag.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['tag-1', 'tag-2'] }, targetProjectId: project,
      archivedAt: null, collaborationManaged: false } })
    expect(tx.testCase.findMany.mock.calls[0][0].where).toEqual({ tags: { some: { id: { in: ['tag-1', 'tag-2'] } } } })
    expect(events).toEqual(['tx', 'prepare', 'tag-delete', 'commit'])
  })
  it('deletes an unbound active Tag with an empty batch and no invented neighbor', async () => {
    cases = []; suites = []
    await deleteTags(['tag-1'], project)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, project, emptyBatch)
    expect(tx.tag.deleteMany).toHaveBeenCalledTimes(1)
  })
  it('refuses any incoming historical Run before preparation or physical link erasure', async () => {
    runs = [{ id: 'run-old', targetProjectId: project }]
    await expect(deleteTags(['tag-1'], project)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    expect(tx.testRun.findMany.mock.calls[0][0].where).toEqual({ tags: { some: { id: { in: ['tag-1'] } } } })
    expect(tx.testRun.deleteMany).not.toHaveBeenCalled()
  })
  it('refuses foreign incoming endpoints before deleting any selected Tag', async () => {
    cases = [{ id: 'foreign-case', targetProjectId: 'foreign' }]
    await expect(deleteTags(['tag-1'], project)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
    cases = []; suites = []; runs = [{ id: 'foreign-run', targetProjectId: 'foreign' }]
    await expect(deleteTags(['tag-1'], project)).rejects.toMatchObject({ statusCode: 409 }); noWrites()
  })
  it('snapshots requested IDs before the first seed lookup awaits', async () => {
    const ids = ['tag-1']
    tx.tag.findMany.mockImplementationOnce(async query => { ids[0] = 'foreign'; return selected([tagRow()], query) })
    await deleteTags(ids, project)
    expect(tx.tag.deleteMany.mock.calls[0][0].where.id.in).toEqual(['tag-1'])
  })
  it('propagates preparation refusal without retry or a physical writer', async () => {
    prepare.mockRejectedValue(new Error('claim refused'))
    await expect(deleteTags(['tag-1'], project)).rejects.toThrow('claim refused')
    expect(root.$transaction).toHaveBeenCalledTimes(1); expect(tx.tag.deleteMany).not.toHaveBeenCalled()
  })
  it('signals owner rollback when the exact scoped physical deletion count differs', async () => {
    tx.tag.deleteMany.mockResolvedValue({ count: 0 })
    await expect(deleteTags(['tag-1'], project)).rejects.toMatchObject({ statusCode: 409 })
    expect(root.$transaction).toHaveBeenCalledTimes(1); expect(events).toEqual(['tx', 'prepare', 'rollback'])
  })
  it('propagates a final physical delete fault without replaying its owner', async () => {
    tx.tag.deleteMany.mockRejectedValue(new Error('delete fault'))
    await expect(deleteTags(['tag-1'], project)).rejects.toThrow('delete fault')
    expect(root.$transaction).toHaveBeenCalledTimes(1); expect(events).toEqual(['tx', 'prepare', 'rollback'])
  })
  it('rejects malformed and excessive input IDs before opening a transaction', async () => {
    for (const ids of [[''], Array.from({ length: 4097 }, (_, index) => `tag-${index}`)])
      await expect(deleteTags(ids, project)).rejects.toMatchObject({ statusCode: 409 })
    expect(root.$transaction).not.toHaveBeenCalled(); noWrites()
  })
})
