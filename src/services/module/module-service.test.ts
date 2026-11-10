import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import { sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import type { SharedModuleMutationEffects } from '@/services/coordinator/quality-journey-shared-resource-module-mutation-effects-service'
import { collectSharedModuleMutationEffectsInTransaction } from '@/services/coordinator/quality-journey-shared-resource-module-mutation-effects-service'
import { prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { createModule, deleteModules, getModuleByIdOrThrow, listModules, updateModule } from './module-service'

const { tx, root } = vi.hoisted(() => {
  const delegates = () => ({
    findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn(),
  })
  return {
    tx: { module: delegates(), testRunTestCase: { findFirst: vi.fn() } },
    root: { module: delegates(), $transaction: vi.fn() },
  }
})

vi.mock('@/config/db-config', () => ({ default: root }))
vi.mock('@/services/coordinator/quality-journey-shared-resource-module-mutation-effects-service', () => ({
  collectSharedModuleMutationEffectsInTransaction: vi.fn(),
}))
vi.mock('@/services/coordinator/quality-journey-shared-resource-guard-service', () => ({
  prepareSharedResourceMutationInTransaction: vi.fn(),
}))

const targetProjectId = 'project-1'
const collect = vi.mocked(collectSharedModuleMutationEffectsInTransaction)
const prepare = vi.mocked(prepareSharedResourceMutationInTransaction)
const moduleRow = (id: string, parentId: string | null = null, extra = {}) => ({
  id, parentId, targetProjectId, archivedAt: null as Date | null, collaborationManaged: false, ...extra,
})
type ModuleRow = ReturnType<typeof moduleRow>
let rows: Map<string, ModuleRow>
let events: string[]
let effects: SharedModuleMutationEffects

function setEffects(moduleIds = ['module-1', 'child-1'], suites = ['suite-1']) {
  effects = {
    moduleIds, locatorGroupIds: ['group-1'], locatorIds: ['locator-1'], testSuiteIds: suites,
    testCaseIds: ['connected-case', 'dependent-case'],
    existing: [
      ...moduleIds.map(resourceId => ({ kind: 'MODULE' as const, resourceId })),
      { kind: 'LOCATOR_GROUP', resourceId: 'group-1' }, { kind: 'LOCATOR', resourceId: 'locator-1' },
      ...suites.map(resourceId => ({ kind: 'TEST_SUITE' as const, resourceId })),
      { kind: 'TEST_CASE', resourceId: 'connected-case' }, { kind: 'TEST_CASE', resourceId: 'dependent-case' },
    ],
  }
}

function expectNoPreparationOrWrite() {
  expect(prepare).not.toHaveBeenCalled()
  expect(tx.module.update).not.toHaveBeenCalled()
  expect(tx.module.deleteMany).not.toHaveBeenCalled()
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  events = []
  rows = new Map([
    ['module-1', moduleRow('module-1')], ['child-1', moduleRow('child-1', 'module-1')],
    ['parent-1', moduleRow('parent-1')],
  ])
  setEffects()
  root.$transaction.mockImplementation(async callback => {
    events.push('begin')
    try {
      const result = await callback(tx)
      events.push('commit')
      return result
    } catch (error) {
      events.push('rollback-signal')
      throw error
    }
  })
  for (const method of [root.module.findFirst, root.module.findMany, root.module.create,
    root.module.update, root.module.deleteMany]) {
    method.mockImplementation(() => { throw new Error('Unexpected root-client operation inside owner') })
  }
  tx.module.findFirst.mockImplementation(async ({ where }) => {
    events.push(`read:${where.id}`)
    return rows.get(where.id) ?? null
  })
  tx.module.findMany.mockImplementation(async ({ where }) => {
    events.push('read-many')
    return where.id.in.map((id: string) => rows.get(id)).filter(Boolean)
  })
  collect.mockImplementation(async () => { events.push('collect'); return effects })
  prepare.mockImplementation(async () => { events.push('prepare') })
  tx.module.create.mockImplementation(async ({ data }) => { events.push('create'); return data })
  tx.module.update.mockImplementation(async ({ data }) => { events.push('update'); return { id: 'module-1', ...data } })
  tx.module.deleteMany.mockImplementation(async ({ where }) => {
    events.push('delete'); return { count: where.id.in.length }
  })
  tx.testRunTestCase.findFirst.mockResolvedValue(null)
})

describe('getModuleByIdOrThrow', () => {
  it('throws NOT_FOUND when module missing', async () => {
    root.module.findFirst.mockResolvedValue(null)
    await expect(getModuleByIdOrThrow('missing', targetProjectId)).rejects.toMatchObject({
      message: 'Module not found', statusCode: 404,
    })
  })
})

describe('createModule', () => {
  it('creates a fresh root identity with its guard in the owning tx', async () => {
    const result = await createModule({ name: 'Checkout', parentId: ROOT_MODULE_UUID }, targetProjectId)
    expect(result).toEqual({ id: expect.any(String), name: 'Checkout', targetProjectId, parentId: null })
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, {
      existing: [], newRoots: [{ kind: 'MODULE', resourceId: result.id }], deleted: [],
    })
    expect(tx.module.create).toHaveBeenCalledExactlyOnceWith({ data: result })
    expect(tx.module.findFirst).not.toHaveBeenCalled()
    expect(collect).not.toHaveBeenCalled()
    expect(events).toEqual(['begin', 'prepare', 'create', 'commit'])
    expect(root.module.create).not.toHaveBeenCalled()
  })

  it('keeps the existing active-parent create validation inside tx', async () => {
    await createModule({ name: 'Checkout', parentId: 'parent-1' }, targetProjectId)
    expect(tx.module.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'parent-1', targetProjectId, archivedAt: null }, select: { id: true },
    })
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(tx.module.create.mock.invocationCallOrder[0])
  })

  it('does not create when preparation refuses', async () => {
    prepare.mockRejectedValueOnce(new Error('coverage refused'))
    await expect(createModule({ name: 'Checkout', parentId: ROOT_MODULE_UUID }, targetProjectId))
      .rejects.toThrow('coverage refused')
    expect(tx.module.create).not.toHaveBeenCalled()
    expect(events.at(-1)).toBe('rollback-signal')
  })
})

describe('updateModule', () => {
  it('preserves missing-id validation without opening a transaction', async () => {
    await expect(updateModule(undefined, { name: 'Checkout' }, targetProjectId)).rejects.toMatchObject({
      code: 'VALIDATION', statusCode: 400,
    })
    expect(root.$transaction).not.toHaveBeenCalled()
  })

  it.each(['missing', 'foreign', 'archived'])('refuses the %s edited module as NOT_FOUND', async variant => {
    if (variant === 'missing') rows.delete('module-1')
    if (variant === 'foreign') rows.set('module-1', moduleRow('module-1', null, { targetProjectId: 'foreign' }))
    if (variant === 'archived') rows.set('module-1', moduleRow('module-1', null, { archivedAt: new Date(0) }))
    await expect(updateModule('module-1', { name: 'Checkout' }, targetProjectId))
      .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
    expect(collect).not.toHaveBeenCalled()
    expectNoPreparationOrWrite()
  })

  it('collects exact old effects and prepares once before update in the same tx with a read-only new parent', async () => {
    await expect(updateModule('module-1', { name: 'Checkout', parentId: 'parent-1' }, targetProjectId))
      .resolves.toEqual({ id: 'module-1', name: 'Checkout', parentId: 'parent-1' })
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(collect).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, ['module-1'])
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, {
      existing: effects.existing, newRoots: [], deleted: [],
    })
    expect(prepare.mock.calls[0][2].existing).not.toContainEqual({ kind: 'MODULE', resourceId: 'parent-1' })
    expect(tx.module.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'module-1' }, data: { name: 'Checkout', parentId: 'parent-1' },
    })
    expect(events).toEqual(['begin', 'read:module-1', 'collect', 'read:parent-1', 'prepare', 'update', 'commit'])
  })

  it('normalizes the root sentinel without a proposed-parent lookup', async () => {
    await updateModule('module-1', { name: 'Checkout', parentId: ROOT_MODULE_UUID }, targetProjectId)
    expect(tx.module.update).toHaveBeenCalledWith({
      where: { id: 'module-1' }, data: { name: 'Checkout', parentId: null },
    })
    expect(tx.module.findFirst).toHaveBeenCalledTimes(1)
  })

  it.each([
    { label: 'omitted', parent: {} }, { label: 'undefined', parent: { parentId: undefined } },
  ])('retains the old parent for $label parent', async ({ parent }) => {
    rows.set('module-1', moduleRow('module-1', 'old-parent'))
    await updateModule('module-1', { name: 'Checkout', ...parent }, targetProjectId)
    expect(tx.module.update).toHaveBeenCalledWith({
      where: { id: 'module-1' }, data: { name: 'Checkout', parentId: 'old-parent' },
    })
    expect(tx.module.findFirst).toHaveBeenCalledTimes(1)
  })

  it('guards a same-value update', async () => {
    await updateModule('module-1', { name: 'Checkout' }, targetProjectId)
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(tx.module.update).toHaveBeenCalledTimes(1)
  })

  it('snapshots update values before the first asynchronous read', async () => {
    const entered = deferred()
    const resume = deferred()
    tx.module.findFirst.mockImplementationOnce(async () => {
      entered.resolve(); await resume.promise; return rows.get('module-1')
    })
    const value = { name: 'Checkout', parentId: ROOT_MODULE_UUID }
    const pending = updateModule('module-1', value, targetProjectId)
    await entered.promise
    value.name = 'Changed'; value.parentId = 'parent-1'
    resume.resolve()
    await pending
    expect(tx.module.update).toHaveBeenCalledWith({
      where: { id: 'module-1' }, data: { name: 'Checkout', parentId: null },
    })
  })

  it.each(['module-1', 'child-1'])('refuses self or descendant proposed parent %s before preparation', async parentId => {
    await expect(updateModule('module-1', { name: 'Checkout', parentId }, targetProjectId))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(tx.module.findFirst).toHaveBeenCalledTimes(1)
    expectNoPreparationOrWrite()
  })

  it.each(['missing', 'foreign', 'archived', 'wrong-identity', 'malformed-endpoint'])
    ('refuses a %s direct parent using an unfiltered identity read', async variant => {
      if (variant === 'missing') rows.delete('parent-1')
      if (variant === 'foreign') rows.set('parent-1', moduleRow('parent-1', null, { targetProjectId: 'foreign' }))
      if (variant === 'archived') rows.set('parent-1', moduleRow('parent-1', null, { archivedAt: new Date(0) }))
      if (variant === 'wrong-identity') rows.set('parent-1', moduleRow('wrong-id'))
      if (variant === 'malformed-endpoint') rows.set('parent-1', moduleRow('parent-1', ''))
      await expect(updateModule('module-1', { name: 'Checkout', parentId: 'parent-1' }, targetProjectId))
        .rejects.toMatchObject({ code: 'VALIDATION', statusCode: 400 })
      expect(tx.module.findFirst).toHaveBeenLastCalledWith({
        where: { id: 'parent-1' }, select: {
          id: true, targetProjectId: true, parentId: true, archivedAt: true, collaborationManaged: true,
        },
      })
      expectNoPreparationOrWrite()
    })

  it('refuses a malformed supplied parent without an undefined-ID lookup', async () => {
    await expect(updateModule('module-1', { name: 'Checkout', parentId: '' }, targetProjectId))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(tx.module.findFirst).toHaveBeenCalledTimes(1)
    expectNoPreparationOrWrite()
  })

  it.each(['cycle', 'edited-ancestor', 'missing', 'foreign', 'malformed-endpoint'])
    ('refuses a %s new parent ancestry before preparation', async variant => {
      rows.set('parent-1', moduleRow('parent-1', 'ancestor-1'))
      if (variant === 'cycle') rows.set('ancestor-1', moduleRow('ancestor-1', 'parent-1'))
      if (variant === 'edited-ancestor') rows.set('ancestor-1', moduleRow('ancestor-1', 'module-1'))
      if (variant === 'foreign') rows.set('ancestor-1', moduleRow('ancestor-1', null, { targetProjectId: 'foreign' }))
      if (variant === 'malformed-endpoint') rows.set('ancestor-1', moduleRow('ancestor-1', ''))
      await expect(updateModule('module-1', { name: 'Checkout', parentId: 'parent-1' }, targetProjectId)).rejects.toThrow()
      expectNoPreparationOrWrite()
    })

  it('allows archived ancestors above the active direct parent without adding their keys', async () => {
    rows.set('parent-1', moduleRow('parent-1', 'ancestor-1'))
    rows.set('ancestor-1', moduleRow('ancestor-1', null, { archivedAt: new Date(0) }))
    await updateModule('module-1', { name: 'Checkout', parentId: 'parent-1' }, targetProjectId)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, {
      existing: effects.existing, newRoots: [], deleted: [],
    })
  })

  it.each([4096, 4097])('bounds new ancestry at 4096 distinct ancestors: %i', async count => {
    for (let index = 0; index < count; index++) {
      rows.set(`ancestor-${index}`, moduleRow(`ancestor-${index}`, index + 1 < count ? `ancestor-${index + 1}` : null))
    }
    const pending = updateModule('module-1', { name: 'Checkout', parentId: 'ancestor-0' }, targetProjectId)
    if (count === 4096) {
      await pending
      expect(prepare).toHaveBeenCalledTimes(1)
    } else {
      await expect(pending).rejects.toMatchObject({ statusCode: 409 })
      expect(tx.module.findFirst).toHaveBeenCalledTimes(4097)
      expectNoPreparationOrWrite()
    }
  })

  it.each(['collector', 'guard', 'write'])('propagates %s failure through the owning transaction', async stage => {
    const failure = new Error(`${stage} refused`)
    if (stage === 'collector') collect.mockRejectedValueOnce(failure)
    if (stage === 'guard') prepare.mockRejectedValueOnce(failure)
    if (stage === 'write') tx.module.update.mockRejectedValueOnce(failure)
    await expect(updateModule('module-1', { name: 'Checkout' }, targetProjectId)).rejects.toBe(failure)
    if (stage !== 'write') expect(tx.module.update).not.toHaveBeenCalled()
    expect(events.at(-1)).toBe('rollback-signal')
    expect(events).not.toContain('commit')
  })
})

describe('deleteModules', () => {
  it('keeps empty input a transaction-free no-op', async () => {
    await deleteModules([], targetProjectId)
    expect(root.$transaction).not.toHaveBeenCalled()
    expectNoPreparationOrWrite()
  })

  it.each([
    { label: 'invalid', ids: [''] },
    { label: 'unbounded', ids: Array.from({ length: sharedResourceBounds.keys + 1 }, () => 'module-1') },
  ])('refuses $label requested IDs before reads', async ({ ids }) => {
    await expect(deleteModules(ids, targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    expect(root.$transaction).not.toHaveBeenCalled()
    expectNoPreparationOrWrite()
  })

  it('checks exact unfiltered requested scope and deduplicates overlapping seeds before one whole batch and root delete', async () => {
    await deleteModules(['child-1', 'module-1', 'child-1'], targetProjectId)
    expect(root.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.module.findMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ['child-1', 'module-1'] } }, select: {
        id: true, targetProjectId: true, parentId: true, archivedAt: true, collaborationManaged: true,
      }, orderBy: { id: 'asc' }, take: 3,
    })
    expect(collect).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, ['child-1', 'module-1'])
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, {
      existing: effects.existing, newRoots: [], deleted: effects.existing.filter(key => key.kind !== 'TEST_CASE'),
    })
    expect(tx.module.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ['module-1'] }, targetProjectId, archivedAt: null, collaborationManaged: false },
    })
    expect(events).toEqual(['begin', 'read-many', 'collect', 'read-many', 'prepare', 'delete', 'commit'])
    expect(root.module.deleteMany).not.toHaveBeenCalled()
  })

  it('keeps connected and locator-dependent Cases existing-only while tombstoning all physical resource kinds', async () => {
    rows.set('child-1', moduleRow('child-1', 'module-1', { archivedAt: new Date(0) }))
    await deleteModules(['module-1'], targetProjectId)
    const batch = prepare.mock.calls[0][2]
    expect(batch.existing).toEqual(effects.existing)
    expect(batch.deleted).toEqual([
      { kind: 'MODULE', resourceId: 'module-1' }, { kind: 'MODULE', resourceId: 'child-1' },
      { kind: 'LOCATOR_GROUP', resourceId: 'group-1' }, { kind: 'LOCATOR', resourceId: 'locator-1' },
      { kind: 'TEST_SUITE', resourceId: 'suite-1' },
    ])
    expect(batch.newRoots).toEqual([])
  })

  it.each(['missing', 'foreign'])('refuses mixed active and %s requested scope instead of deleting a subset', async variant => {
    if (variant === 'foreign') rows.set('other', moduleRow('other', null, { targetProjectId: 'foreign' }))
    await expect(deleteModules(['module-1', 'other'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    expect(collect).not.toHaveBeenCalled()
    expectNoPreparationOrWrite()
  })

  it('keeps requested archived unmanaged modules write-free', async () => {
    rows.set('module-1', moduleRow('module-1', null, { archivedAt: new Date(0) }))
    await deleteModules(['module-1'], targetProjectId)
    expect(collect).not.toHaveBeenCalled()
    expectNoPreparationOrWrite()
  })

  it('excludes an archived unmanaged requested seed while retaining active deletion scope', async () => {
    rows.set('archived', moduleRow('archived', null, { archivedAt: new Date(0) }))
    await deleteModules(['archived', 'module-1'], targetProjectId)
    expect(collect).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, ['module-1'])
    expect(tx.module.deleteMany.mock.calls[0][0].where.id.in).toEqual(['module-1'])
  })

  it.each([
    { label: 'active', archivedAt: null }, { label: 'archived', archivedAt: new Date(0) },
  ])('refuses requested managed modules: $label', async ({ archivedAt }) => {
    rows.set('module-1', moduleRow('module-1', null, { collaborationManaged: true, archivedAt }))
    await expect(deleteModules(['module-1'], targetProjectId)).rejects.toMatchObject({
      message: 'Collaboration-managed modules must be archived, not deleted.', statusCode: 409,
    })
    expect(collect).not.toHaveBeenCalled()
    expectNoPreparationOrWrite()
  })

  it.each([
    { label: 'active', archivedAt: null }, { label: 'archived', archivedAt: new Date(0) },
  ])('refuses managed physical descendants: $label', async ({ archivedAt }) => {
    rows.set('child-1', moduleRow('child-1', 'module-1', { collaborationManaged: true, archivedAt }))
    await expect(deleteModules(['module-1'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    expectNoPreparationOrWrite()
  })

  it('refuses any incoming run association with no target, status or archive filtering before preparation', async () => {
    setEffects(['module-1', 'child-1'], ['active-suite', 'archived-suite'])
    tx.testRunTestCase.findFirst.mockResolvedValueOnce({ id: 'historical-link' })
    await expect(deleteModules(['module-1'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.testRunTestCase.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { testSuiteId: { in: ['active-suite', 'archived-suite'] } }, select: { id: true },
    })
    expectNoPreparationOrWrite()
  })

  it('does not query history for an empty affected Suite set', async () => {
    setEffects(['module-1', 'child-1'], [])
    await deleteModules(['module-1'], targetProjectId)
    expect(tx.testRunTestCase.findFirst).not.toHaveBeenCalled()
    expect(tx.module.deleteMany).toHaveBeenCalledTimes(1)
  })

  it.each(['missing', 'duplicate', 'foreign', 'malformed-parent', 'unexpected'])
    ('refuses %s physical Module metadata before preparation', async variant => {
      const physical = [moduleRow('module-1'), moduleRow('child-1', 'module-1')]
      if (variant === 'missing') physical.pop()
      if (variant === 'duplicate') physical[1] = moduleRow('module-1')
      if (variant === 'foreign') physical[1] = moduleRow('child-1', 'module-1', { targetProjectId: 'foreign' })
      if (variant === 'malformed-parent') physical[1] = moduleRow('child-1', '')
      if (variant === 'unexpected') physical[1] = moduleRow('unexpected')
      tx.module.findMany.mockResolvedValueOnce([moduleRow('module-1')]).mockResolvedValueOnce(physical)
      await expect(deleteModules(['module-1'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
      expectNoPreparationOrWrite()
    })

  it('snapshots requested IDs before the first asynchronous read', async () => {
    const entered = deferred()
    const resume = deferred()
    tx.module.findMany.mockImplementationOnce(async () => {
      entered.resolve(); await resume.promise; return [moduleRow('module-1')]
    })
    const ids = ['module-1']
    const pending = deleteModules(ids, targetProjectId)
    await entered.promise
    ids[0] = 'parent-1'; ids.push('child-1')
    resume.resolve()
    await pending
    expect(collect).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, ['module-1'])
    expect(tx.module.deleteMany.mock.calls[0][0].where.id.in).toEqual(['module-1'])
  })

  it.each([0, 2])('signals rollback for a root-delete count mismatch of %i after preparation', async count => {
    tx.module.deleteMany.mockResolvedValueOnce({ count })
    await expect(deleteModules(['module-1', 'child-1'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(tx.module.deleteMany).toHaveBeenCalledTimes(1)
    expect(events.at(-1)).toBe('rollback-signal')
    expect(events).not.toContain('commit')
  })

  it.each(['collector', 'guard', 'write'])('propagates %s deletion failure through the owning transaction', async stage => {
    const failure = new Error(`${stage} refused`)
    if (stage === 'collector') collect.mockRejectedValueOnce(failure)
    if (stage === 'guard') prepare.mockRejectedValueOnce(failure)
    if (stage === 'write') tx.module.deleteMany.mockRejectedValueOnce(failure)
    await expect(deleteModules(['module-1'], targetProjectId)).rejects.toBe(failure)
    if (stage !== 'write') expect(tx.module.deleteMany).not.toHaveBeenCalled()
    expect(events.at(-1)).toBe('rollback-signal')
    expect(events).not.toContain('commit')
  })
})

describe('listModules', () => {
  it('excludes archived modules from active authoring', async () => {
    root.module.findMany.mockResolvedValue([])
    await listModules(targetProjectId)
    expect(root.module.findMany).toHaveBeenCalledWith({
      where: { targetProjectId, archivedAt: null }, include: { parent: { select: { name: true } } },
    })
  })
})
