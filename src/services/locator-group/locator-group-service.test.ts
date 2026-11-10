import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import { prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import {
  checkLocatorGroupNameUnique, createLocatorGroup, deleteLocatorGroups,
  getLocatorGroupByIdOrThrow, listLocatorGroups, updateLocatorGroup,
} from './locator-group-service'

const { tx, root, KnownRequestError } = vi.hoisted(() => {
  const delegates = () => ({ findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() })
  class KnownRequestError extends Error {
    constructor(message: string, readonly code: string) { super(message) }
  }
  return {
    KnownRequestError,
    tx: {
      locatorGroup: delegates(), locator: delegates(), module: delegates(),
      testCaseStepParameter: delegates(), testCaseStep: delegates(), testCase: delegates(),
      templateTestCaseStepParameter: delegates(), conflictResolution: delegates(),
    },
    root: { locatorGroup: delegates(), locator: delegates(), module: delegates(), $transaction: vi.fn() },
  }
})
vi.mock('@/config/db-config', () => ({ default: root }))
vi.mock('@/services/coordinator/quality-journey-shared-resource-guard-service', () => ({
  prepareSharedResourceMutationInTransaction: vi.fn(),
}))
// Only the public error-constructor identity/code boundary is synthetic. The
// production Prisma import stays intact; this unit suite never constructs a SDK.
vi.mock('@prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: KnownRequestError } }))

const targetProjectId = 'project-1'
const prepare = vi.mocked(prepareSharedResourceMutationInTransaction)
const archivedAt = new Date('2026-10-24T00:00:00.000Z')
const group = (id: string, extra = {}) => ({
  id, name: id === 'group-1' ? 'Old Name' : 'Other', moduleId: 'module-1', targetProjectId,
  archivedAt: null as Date | null, collaborationManaged: false, ...extra,
})
const locator = (id: string, locatorGroupId: string | null, extra = {}) => ({
  id, locatorGroupId, targetProjectId, archivedAt: null as Date | null, ...extra,
})
const moduleRow = (id = 'module-1') => ({ id, targetProjectId, archivedAt: null as Date | null })
type GroupInput = { name: string; moduleId: string; route: string; locators?: string[] }
const value = (extra: Partial<GroupInput> = {}): GroupInput => ({ name: 'New Name', moduleId: 'module-1', route: '/new', ...extra })
let groups: Map<string, ReturnType<typeof group>>
let locators: Map<string, ReturnType<typeof locator>>
let modules: Map<string, ReturnType<typeof moduleRow>>
let events: string[]

function queryRow(row: Record<string, unknown>, select?: Record<string, boolean>) {
  return Object.fromEntries((select ? Object.keys(select).filter(key => select[key]) : Object.keys(row)).map(key => {
    if (!Object.hasOwn(row, key)) throw new Error(`Fixture omitted selected field: ${key}`)
    const field = row[key]
    return [key, field instanceof Date ? new Date(field.getTime()) : field]
  }))
}

function noPreparationOrWrite() {
  expect(prepare).not.toHaveBeenCalled()
  expect(tx.locatorGroup.create).not.toHaveBeenCalled()
  expect(tx.locatorGroup.update).not.toHaveBeenCalled()
  expect(tx.locatorGroup.deleteMany).not.toHaveBeenCalled()
}
function expectedKeys(groupIds = ['group-1'], locatorIds = ['loc-new', 'loc-old']) {
  return [
    ...locatorIds.map(resourceId => ({ kind: 'LOCATOR', resourceId })),
    ...groupIds.map(resourceId => ({ kind: 'LOCATOR_GROUP', resourceId })),
    { kind: 'TEST_CASE', resourceId: 'case-1' },
  ]
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  events = []
  groups = new Map([['group-1', group('group-1')], ['prior-group', group('prior-group')]])
  locators = new Map([
    ['loc-old', locator('loc-old', 'group-1', { collaborationManaged: true })],
    ['loc-new', locator('loc-new', 'prior-group')], ['loc-free', locator('loc-free', null)],
  ])
  modules = new Map([['module-1', moduleRow()]])
  root.$transaction.mockImplementation(async work => {
    events.push('begin')
    try { const result = await work(tx); events.push('commit'); return result }
    catch (error) { events.push('rollback-signal'); throw error }
  })
  for (const model of [root.locatorGroup, root.locator, root.module]) {
    for (const method of Object.values(model)) method.mockImplementation(() => { throw new Error('Unexpected root-client operation') })
  }
  tx.locatorGroup.findFirst.mockImplementation(async ({ where, select }) => {
    events.push('group-read')
    const row = typeof where.id === 'string' ? groups.get(where.id) :
      [...groups.values()].find(row => row.name === where.name && row.id !== where.id?.not)
    return row ? queryRow(row, select) : null
  })
  tx.locatorGroup.findMany.mockImplementation(async ({ where, select }) => {
    events.push('group-scope')
    return where.id.in.flatMap((id: string) => groups.has(id) ? [queryRow(groups.get(id)!, select)] : [])
  })
  tx.module.findFirst.mockImplementation(async ({ where, select }) => {
    events.push('module-read')
    const row = modules.get(where.id)
    return row ? queryRow(row, select) : null
  })
  tx.module.findMany.mockImplementation(async ({ where, select }) =>
    where.id.in.flatMap((id: string) => modules.has(id) ? [queryRow(modules.get(id)!, select)] : []))
  tx.locator.findMany.mockImplementation(async ({ where, select }) => {
    events.push('locator-read')
    return where.id ? where.id.in.flatMap((id: string) => locators.has(id) ? [queryRow(locators.get(id)!, select)] : []) :
      [...locators.values()].filter(row => where.locatorGroupId.in.includes(row.locatorGroupId)).map(row => queryRow(row, select))
  })
  tx.testCaseStepParameter.findMany.mockImplementation(async ({ where }) => {
    events.push('parameter-read')
    return where.locatorId.in.filter((id: string) => id !== 'loc-free').map((id: string) => ({
      id: `param-${id}`, locatorId: id, testCaseStepId: 'step-1',
    }))
  })
  tx.testCaseStep.findMany.mockImplementation(async () => [{ id: 'step-1', testCaseId: 'case-1' }])
  tx.testCase.findMany.mockImplementation(async ({ select }) => [queryRow({ id: 'case-1', targetProjectId, archivedAt }, select)])
  tx.templateTestCaseStepParameter.findMany.mockImplementation(async () => [])
  tx.conflictResolution.findMany.mockImplementation(async () => [])
  prepare.mockImplementation(async () => { events.push('prepare') })
  tx.locatorGroup.create.mockImplementation(async ({ data }) => { events.push('create'); return data })
  tx.locatorGroup.update.mockImplementation(async ({ data }) => { events.push('update'); return { id: 'group-1', ...data } })
  tx.locatorGroup.deleteMany.mockImplementation(async ({ where }) => { events.push('delete'); return { count: where.id.in.length } })
})

describe('getLocatorGroupByIdOrThrow', () => {
  it('throws when locator group is missing', async () => {
    root.locatorGroup.findFirst.mockResolvedValue(null)
    await expect(getLocatorGroupByIdOrThrow('missing', targetProjectId)).rejects.toMatchObject({
      message: 'Locator group not found', statusCode: 404,
    })
  })
})

describe('checkLocatorGroupNameUnique', () => {
  it('returns false when name is taken', async () => {
    root.locatorGroup.findFirst.mockResolvedValue({ id: 'lg1' })
    await expect(checkLocatorGroupNameUnique('Taken', targetProjectId)).resolves.toBe(false)
  })
  it('returns true when name is free', async () => {
    root.locatorGroup.findFirst.mockResolvedValue(null)
    await expect(checkLocatorGroupNameUnique('Free', targetProjectId)).resolves.toBe(true)
  })
})

describe('LocatorGroup inspection', () => {
  it('keeps successful get and list reads scoped without opening a mutation transaction', async () => {
    root.locatorGroup.findFirst.mockResolvedValue(group('group-1'))
    root.locatorGroup.findMany.mockResolvedValue([group('group-1')])
    await expect(getLocatorGroupByIdOrThrow('group-1', targetProjectId)).resolves.toMatchObject({ id: 'group-1' })
    await expect(listLocatorGroups(targetProjectId)).resolves.toHaveLength(1)
    expect(root.locatorGroup.findFirst).toHaveBeenCalledWith({
      where: { id: 'group-1', targetProjectId, archivedAt: null }, include: { module: { select: { name: true } } },
    })
    expect(root.locatorGroup.findMany).toHaveBeenCalledWith({
      where: { targetProjectId, archivedAt: null }, include: { module: { select: { name: true } } },
    })
    expect(root.$transaction).not.toHaveBeenCalled()
  })
})

describe('createLocatorGroup', () => {
  it('creates the group without synchronizing target files', async () => {
    groups.set('prior-group', group('prior-group', { archivedAt, moduleId: 'old-module' }))
    modules.set('old-module', { ...moduleRow('old-module'), archivedAt })
    const created = await createLocatorGroup(value({ locators: ['loc-new'] }), targetProjectId)
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, {
      existing: expectedKeys([], ['loc-new']),
      newRoots: [{ kind: 'LOCATOR_GROUP', resourceId: created.id }], deleted: [],
    })
    expect(events.indexOf('parameter-read')).toBeLessThan(events.indexOf('prepare'))
    expect(prepare.mock.calls[0][2].existing).not.toContainEqual({ kind: 'LOCATOR_GROUP', resourceId: 'prior-group' })
    expect(events.slice(-3)).toEqual(['prepare', 'create', 'commit'])
    expect(tx.locatorGroup.create).toHaveBeenCalledWith({ data: {
      id: created.id, name: 'New Name', moduleId: 'module-1', route: '/new', targetProjectId,
      locators: { connect: [{ id: 'loc-new' }] },
    } })
  })
  it('reserves a fresh UUID guard for an empty connection without guarding the read-only parent', async () => {
    const created = await createLocatorGroup(value({ locators: [] }), targetProjectId)
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, {
      existing: [], newRoots: [{ kind: 'LOCATOR_GROUP', resourceId: created.id }], deleted: [],
    })
    expect(tx.locator.findMany).not.toHaveBeenCalled()
  })
  it('snapshots create scalars and connection IDs before the first asynchronous read', async () => {
    const gate = deferred(), input = value({ locators: ['loc-new'] })
    tx.module.findFirst.mockImplementationOnce(async () => { await gate.promise; return moduleRow() })
    const pending = createLocatorGroup(input, targetProjectId)
    input.name = 'Changed'; input.moduleId = 'foreign'; input.route = '/changed'; input.locators!.push('bad')
    gate.resolve()
    await pending
    expect(tx.locatorGroup.create.mock.calls[0][0].data).toMatchObject({
      name: 'New Name', moduleId: 'module-1', route: '/new', locators: { connect: [{ id: 'loc-new' }] },
    })
  })
  it('requires every incoming Locator to exist in the active requested project', async () => {
    for (const incoming of [null, locator('loc-new', 'prior-group', { targetProjectId: 'foreign' }),
      locator('loc-new', 'prior-group', { archivedAt })]) {
      if (incoming) locators.set('loc-new', incoming); else locators.delete('loc-new')
      await expect(createLocatorGroup(value({ locators: ['loc-new'] }), targetProjectId))
        .rejects.toMatchObject({ statusCode: 400 })
    }
    noPreparationOrWrite()
  })
  it('refuses a foreign supplied Module before preparing any resources', async () => {
    modules.set('module-1', { ...moduleRow(), targetProjectId: 'foreign' })
    await expect(createLocatorGroup(value(), targetProjectId)).rejects.toMatchObject({ statusCode: 400 })
    noPreparationOrWrite()
  })
  it('refuses a duplicate name inside the same owning transaction', async () => {
    groups.set('taken', group('taken', { name: 'New Name' }))
    await expect(createLocatorGroup(value(), targetProjectId)).rejects.toMatchObject({ statusCode: 400 })
    expect(tx.locatorGroup.findFirst).toHaveBeenCalledWith({ where: { name: 'New Name', targetProjectId } })
    noPreparationOrWrite()
  })
  it('maps a final create P2002 to the existing name validation error', async () => {
    tx.locatorGroup.create.mockRejectedValue(new KnownRequestError('fixture collision', 'P2002'))
    await expect(createLocatorGroup(value(), targetProjectId)).rejects.toMatchObject({
      code: 'VALIDATION', message: 'A locator group with this name already exists. Please choose a different name.',
    })
    expect(events.at(-1)).toBe('rollback-signal')
  })
  it('propagates guard refusal through the owning transaction without a create or retry', async () => {
    const fault = new Error('fixture guard failure')
    prepare.mockRejectedValue(fault)
    await expect(createLocatorGroup(value(), targetProjectId)).rejects.toBe(fault)
    expect(tx.locatorGroup.create).not.toHaveBeenCalled()
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(events.at(-1)).toBe('rollback-signal')
  })
})

describe('updateLocatorGroup', () => {
  it('renames the group without updating a locator map file', async () => {
    await updateLocatorGroup('group-1', value({ locators: ['loc-new'] }), targetProjectId)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, {
      existing: expectedKeys(), newRoots: [], deleted: [],
    })
    expect(prepare.mock.calls[0][2].existing).not.toContainEqual({ kind: 'LOCATOR_GROUP', resourceId: 'prior-group' })
    expect(tx.locatorGroup.update).toHaveBeenCalledWith({ where: { id: 'group-1' },
      data: { name: 'New Name', moduleId: 'module-1', route: '/new', locators: { set: [{ id: 'loc-new' }] } },
      include: { module: { select: { name: true } } },
    })
    expect(events.slice(-3)).toEqual(['prepare', 'update', 'commit'])
    expect(root.$transaction).toHaveBeenCalledTimes(1)
  })
  it('guards archived current Locators and dependent Cases when membership is omitted', async () => {
    locators.set('loc-old', locator('loc-old', 'group-1', { archivedAt }))
    await updateLocatorGroup('group-1', value(), targetProjectId)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, {
      existing: expectedKeys(['group-1'], ['loc-old']), newRoots: [], deleted: [],
    })
    expect(tx.locatorGroup.update.mock.calls[0][0].data).not.toHaveProperty('locators')
    expect(tx.locator.findMany.mock.calls[0][0].where).toEqual({ locatorGroupId: { in: ['group-1'] } })
    expect(tx.testCase.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['case-1'] } })
  })
  it('guards detached old Locators and Cases before an explicit empty membership set', async () => {
    await updateLocatorGroup('group-1', value({ locators: [] }), targetProjectId)
    expect(prepare.mock.calls[0][2]).toEqual({ existing: expectedKeys(['group-1'], ['loc-old']), newRoots: [], deleted: [] })
    expect(tx.locatorGroup.update.mock.calls[0][0].data.locators).toEqual({ set: [] })
  })
  it('snapshots update scalars and membership before the first asynchronous read', async () => {
    const gate = deferred(), input = value({ locators: ['loc-new'] })
    tx.locatorGroup.findFirst.mockImplementationOnce(async () => { await gate.promise; return group('group-1') })
    const pending = updateLocatorGroup('group-1', input, targetProjectId)
    input.name = 'Changed'; input.moduleId = 'foreign'; input.route = '/changed'; input.locators!.splice(0)
    gate.resolve()
    await pending
    expect(tx.locatorGroup.update.mock.calls[0][0].data).toMatchObject({
      name: 'New Name', moduleId: 'module-1', route: '/new', locators: { set: [{ id: 'loc-new' }] },
    })
  })
  it('rejects missing IDs and unavailable edited Groups before preparation', async () => {
    await expect(updateLocatorGroup(undefined, value(), targetProjectId)).rejects.toMatchObject({ statusCode: 400 })
    expect(root.$transaction).not.toHaveBeenCalled()
    for (const row of [null, group('group-1', { targetProjectId: 'foreign' }), group('group-1', { archivedAt })]) {
      tx.locatorGroup.findFirst.mockResolvedValueOnce(row)
      await expect(updateLocatorGroup('group-1', value(), targetProjectId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
    noPreparationOrWrite()
  })
  it('checks renamed uniqueness inside the transaction while excluding the edited Group', async () => {
    groups.set('taken', group('taken', { name: 'New Name' }))
    await expect(updateLocatorGroup('group-1', value(), targetProjectId)).rejects.toMatchObject({ statusCode: 400 })
    expect(tx.locatorGroup.findFirst).toHaveBeenLastCalledWith({ where: {
      name: 'New Name', targetProjectId, id: { not: 'group-1' },
    } })
    noPreparationOrWrite()
  })
  it('maps a final update P2002 to the existing name validation error', async () => {
    tx.locatorGroup.update.mockRejectedValue(new KnownRequestError('fixture collision', 'P2002'))
    await expect(updateLocatorGroup('group-1', value(), targetProjectId)).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(events.at(-1)).toBe('rollback-signal')
  })
  it('refuses foreign prior Group and structural Module endpoints instead of hiding them', async () => {
    groups.set('prior-group', group('prior-group', { targetProjectId: 'foreign' }))
    await expect(updateLocatorGroup('group-1', value({ locators: ['loc-new'] }), targetProjectId))
      .rejects.toMatchObject({ statusCode: 409 })
    groups.set('prior-group', group('prior-group', { moduleId: 'missing-module' }))
    await expect(updateLocatorGroup('group-1', value({ locators: ['loc-new'] }), targetProjectId))
      .rejects.toMatchObject({ statusCode: 409 })
    noPreparationOrWrite()
  })
  it('refuses a foreign dependent Case reached through unfiltered parameters and steps', async () => {
    tx.testCase.findMany.mockResolvedValue([{ id: 'case-1', targetProjectId: 'foreign' }])
    await expect(updateLocatorGroup('group-1', value(), targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.testCaseStepParameter.findMany.mock.calls[0][0].where).toEqual({ locatorId: { in: ['loc-old'] } })
    noPreparationOrWrite()
  })
  it('refuses unsupported template and ConflictResolution Locator references before preparation', async () => {
    tx.templateTestCaseStepParameter.findMany.mockResolvedValueOnce([{ id: 'template-ref' }])
    await expect(updateLocatorGroup('group-1', value(), targetProjectId)).rejects.toMatchObject({
      details: { reason: 'TEMPLATE_LOCATOR_DEPENDENCY_UNSUPPORTED' },
    })
    tx.conflictResolution.findMany.mockResolvedValueOnce([{ id: 'conflict-ref' }])
    await expect(updateLocatorGroup('group-1', value(), targetProjectId)).rejects.toMatchObject({
      details: { reason: 'LOCATOR_CONFLICT_DEPENDENCY_UNSUPPORTED' },
    })
    noPreparationOrWrite()
  })
  it('refuses missing step endpoints and malformed Locator parent edges before preparation', async () => {
    tx.testCaseStep.findMany.mockResolvedValueOnce([])
    await expect(updateLocatorGroup('group-1', value(), targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    tx.locator.findMany.mockResolvedValueOnce([locator('loc-old', 'unexpected-group')])
    await expect(updateLocatorGroup('group-1', value(), targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    noPreparationOrWrite()
  })
})

describe('deleteLocatorGroups', () => {
  it('deletes database records without deleting target files', async () => {
    locators.set('loc-old', locator('loc-old', 'group-1', { archivedAt, collaborationManaged: true }))
    const ids = ['group-1', 'group-1'], gate = deferred()
    tx.locatorGroup.findMany.mockImplementationOnce(async () => { await gate.promise; return [group('group-1')] })
    const pending = deleteLocatorGroups(ids, targetProjectId)
    ids.push('late-foreign-id'); gate.resolve()
    await expect(pending).resolves.toEqual(['group-1', 'group-1'])
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, {
      existing: expectedKeys(['group-1'], ['loc-old']), newRoots: [], deleted: [
        { kind: 'LOCATOR_GROUP', resourceId: 'group-1' }, { kind: 'LOCATOR', resourceId: 'loc-old' },
      ],
    })
    expect(tx.locatorGroup.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['group-1'] }, targetProjectId, archivedAt: null, collaborationManaged: false },
    })
    expect(events.slice(-3)).toEqual(['prepare', 'delete', 'commit'])
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.testCase.deleteMany).not.toHaveBeenCalled()
    expect(tx.testCaseStepParameter.update).not.toHaveBeenCalled()
  })
  it('does not destructively delete collaboration-managed locator groups', async () => {
    for (const archive of [null, archivedAt]) {
      groups.set('group-1', group('group-1', { collaborationManaged: true, archivedAt: archive }))
      await expect(deleteLocatorGroups(['group-1'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    }
    noPreparationOrWrite()
  })
  it('retains archived unmanaged requested Groups as a write-free no-op', async () => {
    groups.set('group-1', group('group-1', { archivedAt }))
    await expect(deleteLocatorGroups(['group-1'], targetProjectId)).resolves.toEqual(['group-1'])
    expect(tx.locator.findMany).not.toHaveBeenCalled()
    noPreparationOrWrite()
  })
  it('keeps empty deletion transaction-free and refuses invalid or unbounded requested IDs', async () => {
    await expect(deleteLocatorGroups([], targetProjectId)).resolves.toEqual([])
    await expect(deleteLocatorGroups(['\n'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    await expect(deleteLocatorGroups(Array(sharedResourceBounds.keys + 1).fill('group-1'), targetProjectId))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(root.$transaction).not.toHaveBeenCalled()
    noPreparationOrWrite()
  })
  it('refuses mixed missing or foreign requested scope before selecting active Groups', async () => {
    await expect(deleteLocatorGroups(['group-1', 'missing'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    groups.set('foreign', group('foreign', { targetProjectId: 'foreign' }))
    await expect(deleteLocatorGroups(['group-1', 'foreign'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.locatorGroup.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['group-1', 'missing'] } })
    noPreparationOrWrite()
  })
  it('throws through the owner when the direct Group deletion count is not exact', async () => {
    tx.locatorGroup.deleteMany.mockResolvedValue({ count: 0 })
    await expect(deleteLocatorGroups(['group-1'], targetProjectId)).rejects.toMatchObject({
      details: { reason: 'DELETE_COUNT_MISMATCH' },
    })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(events.at(-1)).toBe('rollback-signal')
  })
  it('propagates final deletion failure after preparation without retrying the transaction', async () => {
    const fault = new Error('fixture write failure')
    tx.locatorGroup.deleteMany.mockRejectedValue(fault)
    await expect(deleteLocatorGroups(['group-1'], targetProjectId)).rejects.toBe(fault)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(events.at(-1)).toBe('rollback-signal')
  })
})

describe('LocatorGroup effect bounds', () => {
  it('refuses query sentinel and aggregate resource overflow before preparation', async () => {
    tx.locator.findMany.mockResolvedValueOnce(Array.from({ length: 65_537 }, (_, i) => locator(`huge-${i}`, 'group-1')))
    await expect(deleteLocatorGroups(['group-1'], targetProjectId)).rejects.toMatchObject({
      details: { reason: 'ROWS_UNBOUNDED' },
    })
    tx.locator.findMany.mockResolvedValueOnce(Array.from({ length: sharedResourceBounds.keys }, (_, i) => locator(`bound-${i}`, null)))
    tx.testCaseStepParameter.findMany.mockResolvedValueOnce([])
    await expect(createLocatorGroup(value({ locators: Array.from({ length: sharedResourceBounds.keys }, (_, i) => `bound-${i}`) }), targetProjectId))
      .rejects.toMatchObject({ details: { reason: 'KEYS_UNBOUNDED' } })
    noPreparationOrWrite()
  })
})
