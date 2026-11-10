import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureTestSuiteIdentifierTags, getOrCreateTestSuiteIdentifierTagId } from './test-suite-identifier-service'
import { prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'

const { root, tx } = vi.hoisted(() => {
  const delegates = () => ({ findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() })
  return {
    root: { $transaction: vi.fn(), testSuite: delegates(), tag: delegates() },
    tx: { testSuite: delegates(), tag: delegates(), module: delegates(), testCase: delegates() },
  }
})
vi.mock('@/config/db-config', () => ({ default: root }))
vi.mock('@prisma/client', () => ({ TagType: { IDENTIFIER: 'IDENTIFIER', FILTER: 'FILTER' } }))
vi.mock('@/lib/test-suite-utils', () => ({ generateUniqueTestSuiteIdentifier: () => 'ts_new' }))
vi.mock('@/services/coordinator/quality-journey-shared-resource-guard-service', () => ({
  prepareSharedResourceMutationInTransaction: vi.fn(),
}))
const project = 'project-1'
const prepare = vi.mocked(prepareSharedResourceMutationInTransaction)
const suite = (id: string, extra = {}) => ({ id, targetProjectId: project, moduleId: 'module-1', archivedAt: null, ...extra })
const identifier = { id: 'identifier-old', targetProjectId: project, name: 'ts_old', tagExpression: '@ts_old', type: 'IDENTIFIER' }
let rows: ReturnType<typeof suite>[]
let tags: Record<string, unknown>[]
let events: string[]
function projectRow(row: Record<string, unknown>, select: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => {
    if (!Object.hasOwn(row, key)) throw new Error(`Fixture omitted selected field: ${key}`)
    const field = row[key]
    return [key, field instanceof Date ? new Date(field.getTime()) : field]
  }))
}
function noWrite() {
  expect(prepare).not.toHaveBeenCalled()
  expect(tx.tag.create).not.toHaveBeenCalled()
  expect(tx.testSuite.update).not.toHaveBeenCalled()
}
beforeEach(() => {
  vi.resetAllMocks(); rows = [suite('suite-1')]; tags = []; events = []
  root.$transaction.mockImplementation(async work => {
    events.push('begin')
    try { const result = await work(tx); events.push('commit'); return result }
    catch (error) { events.push('rollback-signal'); throw error }
  })
  for (const model of [root.testSuite, root.tag])
    for (const method of Object.values(model)) method.mockImplementation(() => { throw new Error('Unexpected root-client operation') })
  tx.testSuite.findMany.mockImplementation(async ({ select }) => rows.map(row => projectRow(row, select)))
  tx.tag.findMany.mockImplementation(async ({ select }) => tags.map(row => projectRow(row, select)))
  tx.module.findFirst.mockImplementation(async ({ where, select }) =>
    projectRow({ id: where.id, targetProjectId: project }, select))
  tx.testCase.findMany.mockResolvedValue([])
  prepare.mockImplementation(async () => { events.push('prepare') })
  tx.tag.create.mockImplementation(async () => {
    events.push('tag-create')
    return { id: `new-identifier-${tx.tag.create.mock.calls.length}` }
  })
  tx.testSuite.update.mockImplementation(async () => { events.push('suite-update'); return { id: 'suite-1' } })
})

describe('ensureTestSuiteIdentifierTags', () => {
  it('prepares one whole Suite batch before repairing identifiers in the original transaction', async () => {
    rows = [suite('suite-2'), suite('suite-1')]
    await ensureTestSuiteIdentifierTags(['suite-2', 'suite-1'], project)
    expect(prepare).toHaveBeenCalledWith(tx, project, {
      existing: [{ kind: 'TEST_SUITE', resourceId: 'suite-1' }, { kind: 'TEST_SUITE', resourceId: 'suite-2' }],
      newRoots: [], deleted: [],
    })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['begin', 'prepare', 'tag-create', 'suite-update', 'tag-create', 'suite-update', 'commit'])
    expect(tx.testSuite.update.mock.calls.map(call => call[0])).toEqual([
      { where: { id: 'suite-1' }, data: { tags: { connect: { id: 'new-identifier-1' } } } },
      { where: { id: 'suite-2' }, data: { tags: { connect: { id: 'new-identifier-2' } } } },
    ])
  })
  it('keeps an existing identifier a write-free read without invoking the guard', async () => {
    tags = [{ ...identifier }]
    await ensureTestSuiteIdentifierTags(['suite-1'], project)
    noWrite()
    expect(tx.module.findFirst).not.toHaveBeenCalled()
  })
  it('repairs only missing identifiers while existing identifiers remain outside the mutation batch', async () => {
    rows = [suite('suite-1'), suite('suite-2')]
    tx.tag.findMany.mockImplementation(async ({ where }) => where.testSuites.some.id === 'suite-1' ? [{ ...identifier }] : [])
    await ensureTestSuiteIdentifierTags(undefined, project)
    expect(prepare.mock.calls[0][2].existing).toEqual([{ kind: 'TEST_SUITE', resourceId: 'suite-2' }])
    expect(tx.tag.create).toHaveBeenCalledTimes(1)
    expect(tx.testSuite.findMany.mock.calls[0][0].where).toEqual({ targetProjectId: project, archivedAt: null })
  })
  it('snapshots explicit IDs before the first asynchronous read and deduplicates repeated seeds', async () => {
    const ids = ['suite-1', 'suite-1']
    const pending = ensureTestSuiteIdentifierTags(ids, project)
    ids.push('missing')
    await pending
    expect(tx.testSuite.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['suite-1'] } })
    expect(tx.testSuite.update).toHaveBeenCalledTimes(1)
  })
  it('retains explicit archived Suites without creating or connecting Tags', async () => {
    rows = [suite('suite-1', { archivedAt: new Date() })]
    await ensureTestSuiteIdentifierTags(['suite-1'], project)
    noWrite()
  })
  it('keeps an empty explicit request transaction-free', async () => {
    await ensureTestSuiteIdentifierTags([], project)
    expect(root.$transaction).not.toHaveBeenCalled()
  })
  it('refuses foreign explicit Suite rows before any repair writer', async () => {
    rows = [suite('suite-1', { targetProjectId: 'foreign' })]
    await expect(ensureTestSuiteIdentifierTags(['suite-1'], project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
    expect(tx.testSuite.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['suite-1'] } })
  })
  it('refuses an absent requested Suite without committing a partial earlier repair', async () => {
    await expect(ensureTestSuiteIdentifierTags(['suite-1', 'missing'], project)).rejects.toMatchObject({ statusCode: 404 })
    noWrite()
    expect(events.at(-1)).toBe('rollback-signal')
  })
  it('refuses a foreign incoming Tag before accepting an apparent identifier', async () => {
    tags = [{ ...identifier, targetProjectId: 'foreign' }]
    await expect(ensureTestSuiteIdentifierTags(['suite-1'], project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
    expect(tx.tag.findMany.mock.calls[0][0].where).toEqual({ testSuites: { some: { id: 'suite-1' } } })
  })
  it('refuses a foreign structural Module without guarding that read-only endpoint', async () => {
    tx.module.findFirst.mockResolvedValue({ id: 'module-1', targetProjectId: 'foreign' })
    await expect(ensureTestSuiteIdentifierTags(['suite-1'], project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
  })
  it('validates unfiltered membership endpoints without adding unchanged Case keys to a tag repair', async () => {
    tx.testCase.findMany.mockResolvedValue([{ id: 'archived-case', targetProjectId: project }])
    await ensureTestSuiteIdentifierTags(['suite-1'], project)
    expect(tx.testCase.findMany.mock.calls[0][0].where).toEqual({ TestSuite: { some: { id: 'suite-1' } } })
    expect(prepare.mock.calls[0][2].existing).toEqual([{ kind: 'TEST_SUITE', resourceId: 'suite-1' }])
  })
  it('refuses a foreign existing member before writing a missing identifier', async () => {
    tx.testCase.findMany.mockResolvedValue([{ id: 'foreign-case', targetProjectId: 'foreign' }])
    await expect(ensureTestSuiteIdentifierTags(['suite-1'], project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
  })
  it('bounds Suite discovery instead of repairing a truncated list', async () => {
    rows = Array.from({ length: 4097 }, (_, i) => suite(`suite-${i}`))
    await expect(ensureTestSuiteIdentifierTags(undefined, project)).rejects.toMatchObject({ statusCode: 409 })
    noWrite()
  })
  it('refuses invalid IDs before opening a transaction', async () => {
    await expect(ensureTestSuiteIdentifierTags([''], project)).rejects.toMatchObject({ statusCode: 409 })
    expect(root.$transaction).not.toHaveBeenCalled()
  })
  it('propagates guard refusal before creating or linking identifier Tags', async () => {
    prepare.mockRejectedValue(new Error('guard-fault'))
    await expect(ensureTestSuiteIdentifierTags(['suite-1'], project)).rejects.toThrow('guard-fault')
    expect(tx.tag.create).not.toHaveBeenCalled(); expect(tx.testSuite.update).not.toHaveBeenCalled()
    expect(root.$transaction).toHaveBeenCalledTimes(1)
  })
  it('signals rollback when a later identifier link fails without retry or detached writes', async () => {
    tx.testSuite.update.mockRejectedValue(new Error('link-fault'))
    await expect(ensureTestSuiteIdentifierTags(['suite-1'], project)).rejects.toThrow('link-fault')
    expect(events).toEqual(['begin', 'prepare', 'tag-create', 'rollback-signal'])
    expect(root.$transaction).toHaveBeenCalledTimes(1)
  })
})

describe('getOrCreateTestSuiteIdentifierTagId', () => {
  it('returns an existing identifier without a second root read or any write', async () => {
    tags = [{ ...identifier }]
    await expect(getOrCreateTestSuiteIdentifierTagId('suite-1', project)).resolves.toBe('identifier-old')
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    noWrite()
  })
  it('returns the newly created identifier from the same owning transaction', async () => {
    await expect(getOrCreateTestSuiteIdentifierTagId('suite-1', project)).resolves.toBe('new-identifier-1')
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['begin', 'prepare', 'tag-create', 'suite-update', 'commit'])
  })
})
