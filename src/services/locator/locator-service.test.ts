import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/services/shared/errors'
import { sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import { createLocatorGroup } from '@/services/locator-group/locator-group-service'
import { prepareSharedResourceMutationInTransaction } from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import type { SavePickedLocatorRequest } from '@/types/locator-picker'
import { deleteLocators, detectAndCreateConflicts, getLocatorByIdOrThrow, listLocators, savePickedLocatorFromRequest } from './locator-service'

const { root, tx, sessions } = vi.hoisted(() => {
  const delegates = () => ({ findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() })
  return {
    root: { locator: delegates(), conflictResolution: delegates(), $transaction: vi.fn() },
    tx: { locator: delegates(), locatorGroup: delegates(), module: delegates(), testCaseStepParameter: delegates(),
      testCaseStep: delegates(), testCase: delegates(), templateTestCaseStepParameter: delegates(), conflictResolution: delegates() },
    sessions: { getSession: vi.fn(), markSaving: vi.fn(), markReadyAfterSave: vi.fn() },
  }
})
vi.mock('@/config/db-config', () => ({ default: root }))
vi.mock('@/lib/locator-picker/session-manager', () => ({ locatorPickerSessionManager: sessions }))
vi.mock('@/services/locator-group/locator-group-service', () => ({ createLocatorGroup: vi.fn() }))
vi.mock('@/services/coordinator/quality-journey-shared-resource-guard-service', () => ({ prepareSharedResourceMutationInTransaction: vi.fn() }))

const targetProjectId = 'project-1'
const prepare = vi.mocked(prepareSharedResourceMutationInTransaction), createGroup = vi.mocked(createLocatorGroup)
const archivedAt = new Date('2026-10-24T00:00:00.000Z')
const locatorRow = (id: string, extra = {}) => ({ id, targetProjectId, name: `Old ${id}`, value: '#old',
  locatorGroupId: 'group-1' as string | null, archivedAt: null as Date | null, collaborationManaged: false, ...extra })
const groupRow = (id: string, extra = {}) => ({ id, targetProjectId, name: id === 'group-1' ? 'Original' : 'Chosen',
  route: id === 'group-1' ? '/old' : '/chosen', moduleId: id === 'group-1' ? 'module-1' : 'module-2', archivedAt: null as Date | null, ...extra })
const moduleRow = (id: string, extra = {}) => ({ id, targetProjectId,
  parentId: id === 'module-2' ? 'module-1' as string | null : null, archivedAt: null as Date | null, ...extra })
const input = (extra: Partial<SavePickedLocatorRequest> = {}): SavePickedLocatorRequest => ({ sessionId: 'session-1',
  locatorName: 'button', selector: 'css=#new', resolutionMode: 'existing', existingLocatorGroupId: 'group-2', ...extra })
let locators: Map<string, ReturnType<typeof locatorRow>>
let groups: Map<string, ReturnType<typeof groupRow>>
let modules: Map<string, ReturnType<typeof moduleRow>>
let events: string[]
function queryRow(row: Record<string, unknown>, select?: Record<string, boolean>) {
  return Object.fromEntries((select ? Object.keys(select).filter(key => select[key]) : Object.keys(row)).map(key => {
    if (!Object.hasOwn(row, key)) throw new Error(`Fixture omitted selected field: ${key}`)
    const field = row[key]
    return [key, field instanceof Date ? new Date(field.getTime()) : field]
  }))
}
function noMutation() {
  expect(prepare).not.toHaveBeenCalled()
  expect(tx.locator.create).not.toHaveBeenCalled()
  expect(tx.locator.update).not.toHaveBeenCalled()
  expect(tx.locator.deleteMany).not.toHaveBeenCalled()
}
function existingKeys(ids = ['loc-1']) {
  return [...ids.map(resourceId => ({ kind: 'LOCATOR', resourceId })), { kind: 'TEST_CASE', resourceId: 'case-1' }]
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
async function badObservation(observation: Record<string, unknown>) {
  sessions.getSession.mockResolvedValue({ pickedLocator: { selector: 'css=.checkout-button', matchCount: 1, ...observation } })
  await expect(savePickedLocatorFromRequest(input({ selector: 'css=.checkout-button' }), targetProjectId))
    .resolves.toMatchObject({ kind: 'error', status: 400 })
  noMutation()
  expect(sessions.markReadyAfterSave).toHaveBeenCalledOnce()
}

beforeEach(() => {
  vi.resetAllMocks()
  events = []
  locators = new Map(['loc-1', 'loc-2', 'loc-3'].map(id => [id, locatorRow(id)]))
  groups = new Map(['group-1', 'group-2'].map(id => [id, groupRow(id)]))
  modules = new Map(['module-1', 'module-2'].map(id => [id, moduleRow(id)]))
  for (const model of [root.locator, root.conflictResolution])
    for (const method of Object.values(model)) method.mockImplementation(() => { throw new Error('Unexpected root DB operation') })
  root.$transaction.mockImplementation(async callback => {
    events.push('begin')
    try { const result = await callback(tx); events.push('commit'); return result }
    catch (error) { events.push('rollback-signal'); throw error }
  })
  sessions.getSession.mockResolvedValue(null)
  sessions.markSaving.mockImplementation(async () => { events.push('saving') })
  sessions.markReadyAfterSave.mockImplementation(async () => { events.push('ready') })
  tx.locator.findFirst.mockImplementation(async ({ where, select }) => {
    events.push('locator-read')
    const row = typeof where.id === 'string' ? locators.get(where.id) : [...locators.values()].find(item =>
      item.locatorGroupId === where.locatorGroupId && item.name === where.name && item.archivedAt === null && item.id !== where.id?.not)
    return row ? queryRow(row, select) : null
  })
  tx.locator.findMany.mockImplementation(async ({ where, select }) =>
    where.id.in.flatMap((id: string) => locators.has(id) ? [queryRow(locators.get(id)!, select)] : []))
  tx.locatorGroup.findFirst.mockImplementation(async ({ where, select }) => {
    const row = groups.get(where.id)
    return row ? queryRow(row, select) : null
  })
  tx.locatorGroup.findMany.mockImplementation(async ({ where, select }) =>
    where.id.in.flatMap((id: string) => groups.has(id) ? [queryRow(groups.get(id)!, select)] : []))
  tx.module.findFirst.mockImplementation(async ({ where, select }) => {
    const row = modules.get(where.id)
    return row ? queryRow(row, select) : null
  })
  tx.module.findMany.mockImplementation(async ({ where, select }) =>
    where.id.in.flatMap((id: string) => modules.has(id) ? [queryRow(modules.get(id)!, select)] : []))
  tx.testCaseStepParameter.findMany.mockImplementation(async ({ where }) => {
    events.push('parameter-read')
    return where.locatorId.in.map((id: string) => ({ id: `parameter-${id}`, locatorId: id, testCaseStepId: 'step-1' }))
  })
  tx.testCaseStep.findMany.mockImplementation(async () => [{ id: 'step-1', testCaseId: 'case-1' }])
  tx.testCase.findMany.mockImplementation(async ({ select }) => [queryRow({ id: 'case-1', targetProjectId, archivedAt }, select)])
  tx.templateTestCaseStepParameter.findMany.mockImplementation(async () => [])
  tx.conflictResolution.findMany.mockImplementation(async () => [])
  prepare.mockImplementation(async () => { events.push('prepare') })
  tx.locator.create.mockImplementation(async ({ data }) => { events.push('create'); return { ...data } })
  tx.locator.update.mockImplementation(async ({ where, data }) => { events.push('update'); return { id: where.id, ...data } })
  tx.locator.deleteMany.mockImplementation(async ({ where }) => { events.push('delete'); return { count: where.id.in.length } })
  createGroup.mockImplementation(async value => {
    events.push('group-prepare')
    const created = groupRow('new-group', { name: value.name, route: value.route, moduleId: value.moduleId })
    groups.set(created.id, created)
    events.push('group-commit')
    return { ...created } as never
  })
})

describe('detectAndCreateConflicts', () => {
  it('returns 0 when no other locators in group', async () => {
    root.locator.findMany.mockResolvedValue([])
    await expect(detectAndCreateConflicts('loc-1', 'btn', '//x', 'group-1')).resolves.toBe(0)
    expect(root.conflictResolution.create).not.toHaveBeenCalled()
    expect(root.$transaction).not.toHaveBeenCalled()
  })
})

describe('Locator inspection', () => {
  it('retains root list and scoped get inspection without mutation transactions', async () => {
    root.locator.findMany.mockResolvedValue([locatorRow('loc-1')])
    root.locator.findFirst.mockResolvedValueOnce(locatorRow('loc-1')).mockResolvedValueOnce(null)
    await expect(listLocators(targetProjectId)).resolves.toHaveLength(1)
    await expect(getLocatorByIdOrThrow('loc-1', targetProjectId)).resolves.toMatchObject({ id: 'loc-1' })
    await expect(getLocatorByIdOrThrow('missing', targetProjectId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(root.locator.findMany.mock.calls[0][0].where).toEqual({ targetProjectId, archivedAt: null })
    expect(root.$transaction).not.toHaveBeenCalled()
  })
})

describe('deleteLocators', () => {
  it('deletes locators without synchronizing target files', async () => {
    await expect(deleteLocators(['loc-3', 'loc-1', 'loc-2', 'loc-1'], targetProjectId)).resolves.toEqual({ count: 3 })
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, {
      existing: existingKeys(['loc-1', 'loc-2', 'loc-3']), newRoots: [], deleted: ['loc-1', 'loc-2', 'loc-3'].map(resourceId => ({ kind: 'LOCATOR', resourceId })),
    })
    expect(tx.locator.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['loc-1', 'loc-2', 'loc-3'] }, targetProjectId, archivedAt: null, collaborationManaged: false } })
    expect(events).toEqual(['begin', 'parameter-read', 'prepare', 'delete', 'commit'])
    expect(root.$transaction).toHaveBeenCalledOnce()
  })
  it('does not destructively delete collaboration-managed locators', async () => {
    for (const archive of [null, archivedAt]) {
      locators.set('loc-1', locatorRow('loc-1', { collaborationManaged: true, archivedAt: archive }))
      await expect(deleteLocators(['loc-1'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    }
    noMutation()
  })
  it('keeps empty deletion transaction-free and archived unmanaged Locators write-free', async () => {
    await expect(deleteLocators([], targetProjectId)).resolves.toEqual({ count: 0 })
    expect(root.$transaction).not.toHaveBeenCalled()
    locators.set('loc-1', locatorRow('loc-1', { archivedAt }))
    await expect(deleteLocators(['loc-1'], targetProjectId)).resolves.toEqual({ count: 0 })
    expect(tx.locatorGroup.findMany).not.toHaveBeenCalled()
    noMutation()
  })
  it('rejects invalid bounds and mixed missing or foreign requested scope before any preparation', async () => {
    await expect(deleteLocators(['\n'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    await expect(deleteLocators(Array(sharedResourceBounds.keys + 1).fill('loc-1'), targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    expect(root.$transaction).not.toHaveBeenCalled()
    await expect(deleteLocators(['loc-1', 'missing'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    locators.set('foreign', locatorRow('foreign', { targetProjectId: 'foreign' }))
    await expect(deleteLocators(['loc-1', 'foreign'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.locator.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['loc-1', 'missing'] } })
    noMutation()
  })
  it('guards archived dependent Cases while permitting a nullable old Group endpoint', async () => {
    locators.set('loc-1', locatorRow('loc-1', { locatorGroupId: null }))
    await deleteLocators(['loc-1'], targetProjectId)
    expect(prepare.mock.calls[0][2]).toEqual({ existing: existingKeys(), newRoots: [], deleted: [{ kind: 'LOCATOR', resourceId: 'loc-1' }] })
    expect(tx.testCase.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['case-1'] } })
    expect(tx.testCase.deleteMany).not.toHaveBeenCalled()
  })
  it('refuses unsupported template and ConflictResolution references before destruction', async () => {
    tx.templateTestCaseStepParameter.findMany.mockResolvedValueOnce([{ id: 'template-ref' }])
    await expect(deleteLocators(['loc-1'], targetProjectId)).rejects.toMatchObject({ details: { reason: 'TEMPLATE_LOCATOR_DEPENDENCY_UNSUPPORTED' } })
    tx.conflictResolution.findMany.mockResolvedValueOnce([{ id: 'conflict-ref' }])
    await expect(deleteLocators(['loc-1'], targetProjectId)).rejects.toMatchObject({ details: { reason: 'LOCATOR_CONFLICT_DEPENDENCY_UNSUPPORTED' } })
    noMutation()
  })
  it('refuses missing or foreign old Groups and Module ancestry endpoints without hiding them', async () => {
    groups.delete('group-1')
    await expect(deleteLocators(['loc-1'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    groups.set('group-1', groupRow('group-1', { targetProjectId: 'foreign' }))
    await expect(deleteLocators(['loc-1'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    groups.set('group-1', groupRow('group-1')); modules.delete('module-1')
    await expect(deleteLocators(['loc-1'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    modules.set('module-1', moduleRow('module-1', { targetProjectId: 'foreign' }))
    await expect(deleteLocators(['loc-1'], targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    noMutation()
  })
  it('rolls back by propagating a count mismatch or final write failure without retry', async () => {
    tx.locator.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(deleteLocators(['loc-1'], targetProjectId)).rejects.toMatchObject({ details: { reason: 'DELETE_COUNT_MISMATCH' } })
    const fault = new Error('fixture deletion failure')
    tx.locator.deleteMany.mockRejectedValueOnce(fault)
    await expect(deleteLocators(['loc-1'], targetProjectId)).rejects.toBe(fault)
    expect(root.$transaction).toHaveBeenCalledTimes(2)
    expect(events.filter(event => event === 'rollback-signal')).toHaveLength(2)
  })
  it('snapshots requested IDs before the first asynchronous query', async () => {
    const gate = deferred(), ids = ['loc-1']
    tx.locator.findMany.mockImplementationOnce(async () => { await gate.promise; return [locatorRow('loc-1')] })
    const pending = deleteLocators(ids, targetProjectId)
    ids.push('foreign'); gate.resolve()
    await expect(pending).resolves.toEqual({ count: 1 })
    expect(tx.locator.deleteMany.mock.calls[0][0].where.id.in).toEqual(['loc-1'])
  })
})

describe('savePickedLocatorFromRequest', () => {
  it('does not persist an ambiguous selector returned by the picker companion', async () => {
    sessions.getSession.mockResolvedValue({ pickedLocator: { selector: 'css=.checkout-button', matchCount: 2 } })
    await expect(savePickedLocatorFromRequest(input({ selector: 'css=.checkout-button' }), targetProjectId)).resolves.toEqual({
      kind: 'error', status: 400, message: 'The picker selector was not verified as exactly one live match. Pick again or enter a manual selector.',
    })
    noMutation()
    expect(sessions.markSaving).toHaveBeenCalledWith('session-1')
    expect(sessions.markReadyAfterSave).toHaveBeenCalledWith('session-1')
  })
  it('does not persist a picker selector with a mismatched fingerprint', async () => {
    await badObservation({ selectorFingerprint: 'sha256:wrong', checkedAt: new Date().toISOString(), checkedUrl: 'https://example.com' })
  })
  it('does not persist a picker selector with a stale observation', async () => {
    await badObservation({ selectorFingerprint: 'sha256:306a95eb66d5327e766bcc5a281b21559b9deda8fd491d209499d40d62183a78', checkedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(), checkedUrl: 'https://example.com' })
  })
  it('does not persist a picker selector with a future observation', async () => {
    await badObservation({ selectorFingerprint: 'sha256:306a95eb66d5327e766bcc5a281b21559b9deda8fd491d209499d40d62183a78', checkedAt: new Date(Date.now() + 60 * 1000).toISOString(), checkedUrl: 'https://example.com' })
  })
  it('reserves only a fresh Locator root while Group and Module endpoints stay read-only', async () => {
    const result = await savePickedLocatorFromRequest(input({ locatorName: '  button  ', selector: '  css=#new  ' }), targetProjectId)
    expect(result).toMatchObject({ kind: 'success', locatorName: 'button', selector: 'css=#new', locatorGroupId: 'group-2', route: '/chosen', moduleId: 'module-2', wasUpdate: false })
    if (result.kind !== 'success') throw new Error('Expected fixture save')
    expect(result.locatorId).toMatch(/^[0-9a-f-]{36}$/)
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, { existing: [], newRoots: [{ kind: 'LOCATOR', resourceId: result.locatorId }], deleted: [] })
    expect(tx.testCaseStepParameter.findMany).not.toHaveBeenCalled()
    expect(events.slice(-4)).toEqual(['prepare', 'create', 'commit', 'ready'])
    expect(createGroup).not.toHaveBeenCalled()
  })
  it('guards the edited Locator and dependent Case for a same-Group scalar update', async () => {
    groups.set('group-1', groupRow('group-1', { archivedAt: null }))
    modules.set('module-1', moduleRow('module-1', { archivedAt }))
    await expect(savePickedLocatorFromRequest(input({ locatorId: 'loc-1', existingLocatorGroupId: 'group-1' }), targetProjectId)).resolves.toMatchObject({ kind: 'success', wasUpdate: true, message: 'Locator updated successfully.' })
    expect(prepare).toHaveBeenCalledExactlyOnceWith(tx, targetProjectId, { existing: existingKeys(), newRoots: [], deleted: [] })
    expect(tx.locator.findFirst.mock.calls[1][0].where.id).toEqual({ not: 'loc-1' })
    expect(root.locator.findFirst).not.toHaveBeenCalled()
    expect(events.slice(-4)).toEqual(['prepare', 'update', 'commit', 'ready'])
  })
  it('guards Locator and Case edge effects for a Group move without guarding either Group', async () => {
    groups.set('group-1', groupRow('group-1', { archivedAt }))
    await savePickedLocatorFromRequest(input({ locatorId: 'loc-1' }), targetProjectId)
    expect(tx.locatorGroup.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['group-1', 'group-2'] } })
    expect(prepare.mock.calls[0][2]).toEqual({ existing: existingKeys(), newRoots: [], deleted: [] })
    expect(tx.locator.update).toHaveBeenCalledWith({ where: { id: 'loc-1' }, data: { name: 'button', value: 'css=#new', locatorGroupId: 'group-2', targetProjectId } })
  })
  it('snapshots the parsed request before session lookup awaits', async () => {
    const gate = deferred(), request = input()
    sessions.getSession.mockImplementationOnce(async () => { await gate.promise; return null })
    const pending = savePickedLocatorFromRequest(request, targetProjectId)
    request.locatorName = 'Changed'; request.selector = 'wrong'; request.existingLocatorGroupId = 'foreign'; request.resolutionMode = 'create'
    gate.resolve(); await pending
    expect(tx.locator.create.mock.calls[0][0].data).toMatchObject({ name: 'button', value: 'css=#new', locatorGroupId: 'group-2' })
    expect(createGroup).not.toHaveBeenCalled()
  })
  it('preserves duplicate-name picker outcomes before preparation and marks the session ready', async () => {
    locators.set('duplicate', locatorRow('duplicate', { name: 'button', locatorGroupId: 'group-2' }))
    await expect(savePickedLocatorFromRequest(input(), targetProjectId)).resolves.toEqual({ kind: 'error', status: 400, message: 'A locator named "button" already exists in Chosen.' })
    noMutation()
    expect(sessions.markReadyAfterSave).toHaveBeenCalledOnce()
  })
  it('refuses unavailable edited Locators and selected Groups inside the final owner', async () => {
    await expect(savePickedLocatorFromRequest(input({ locatorId: 'missing' }), targetProjectId)).resolves.toMatchObject({ kind: 'error', status: 404 })
    for (const group of [null, groupRow('group-2', { targetProjectId: 'foreign' }), groupRow('group-2', { archivedAt })]) {
      tx.locatorGroup.findFirst.mockResolvedValueOnce(group)
      await expect(savePickedLocatorFromRequest(input(), targetProjectId)).resolves.toMatchObject({ kind: 'error', status: 404 })
    }
    noMutation()
  })
  it('refuses foreign dependent Cases and cyclic Module ancestry before the final write', async () => {
    tx.testCase.findMany.mockResolvedValueOnce([{ id: 'case-1', targetProjectId: 'foreign' }])
    await expect(savePickedLocatorFromRequest(input({ locatorId: 'loc-1' }), targetProjectId)).rejects.toMatchObject({ statusCode: 409 })
    modules.set('module-1', moduleRow('module-1', { parentId: 'module-2' }))
    await expect(savePickedLocatorFromRequest(input({ locatorId: 'loc-1' }), targetProjectId)).rejects.toMatchObject({ details: { reason: 'MODULE_ANCESTRY_CYCLE' } })
    noMutation()
  })
  it('commits new Group preparation separately before the final Locator owner and normalizes its route', async () => {
    root.locator.findFirst.mockResolvedValue({ locatorGroupId: 'group-1' })
    await expect(savePickedLocatorFromRequest(input({ locatorId: 'loc-1', resolutionMode: 'create', newLocatorGroupName: '  Created  ', moduleId: 'module-1', route: 'https://example.test//checkout' }), targetProjectId))
      .resolves.toMatchObject({ kind: 'success', locatorGroupId: 'new-group', locatorGroupName: 'Created', route: '/checkout', wasUpdate: true })
    expect(createGroup).toHaveBeenCalledExactlyOnceWith({ name: 'Created', moduleId: 'module-1', route: '/checkout', locators: [] }, targetProjectId)
    expect(events.indexOf('group-commit')).toBeLessThan(events.indexOf('begin'))
    expect(root.$transaction).toHaveBeenCalledOnce()
    expect(prepare.mock.calls[0][2].existing).toEqual(existingKeys())
  })
  it('does not create a Group when the advisory create-mode edited-Locator precheck is already missing', async () => {
    root.locator.findFirst.mockResolvedValue(null)
    await expect(savePickedLocatorFromRequest(input({ locatorId: 'missing', resolutionMode: 'create', newLocatorGroupName: 'Created', moduleId: 'module-1' }), targetProjectId))
      .resolves.toEqual({ kind: 'error', status: 404, message: 'The locator you are editing no longer exists.' })
    expect(createGroup).not.toHaveBeenCalled()
    expect(root.$transaction).not.toHaveBeenCalled()
    noMutation()
  })
  it('refuses a vanished edited Locator during final revalidation despite a successful advisory precheck', async () => {
    root.locator.findFirst.mockResolvedValue({ locatorGroupId: 'group-1' })
    locators.delete('loc-1')
    await expect(savePickedLocatorFromRequest(input({ locatorId: 'loc-1', resolutionMode: 'create', newLocatorGroupName: 'Created', moduleId: 'module-1' }), targetProjectId))
      .resolves.toMatchObject({ kind: 'error', status: 404 })
    expect(createGroup).toHaveBeenCalledOnce()
    expect(groups.has('new-group')).toBe(true)
    expect(root.$transaction).toHaveBeenCalledOnce()
    noMutation()
  })
  it('maps public Group validation to existing Module and duplicate-Group picker errors', async () => {
    createGroup.mockRejectedValueOnce(new ServiceError('Locator group relationships must belong to the active project', 'VALIDATION', 400))
    await expect(savePickedLocatorFromRequest(input({ resolutionMode: 'create', newLocatorGroupName: 'Created', moduleId: 'module-1' }), targetProjectId))
      .resolves.toEqual({ kind: 'error', status: 404, message: 'The selected module no longer exists in the active project.' })
    createGroup.mockRejectedValueOnce(new ServiceError('A locator group with this name already exists. Please choose a different name.', 'VALIDATION', 400))
    await expect(savePickedLocatorFromRequest(input({ resolutionMode: 'create', newLocatorGroupName: 'Created', moduleId: 'module-1' }), targetProjectId))
      .resolves.toEqual({ kind: 'error', status: 400, message: 'A locator group with this name already exists. Choose a different name.' })
    expect(root.$transaction).not.toHaveBeenCalled()
    noMutation()
  })
  it('propagates guard and final write failures without retry while restoring session readiness', async () => {
    const guardFault = new Error('fixture guard failure'), writeFault = new Error('fixture save failure')
    prepare.mockRejectedValueOnce(guardFault)
    await expect(savePickedLocatorFromRequest(input({ locatorId: 'loc-1' }), targetProjectId)).rejects.toBe(guardFault)
    expect(tx.locator.update).not.toHaveBeenCalled()
    tx.locator.update.mockRejectedValueOnce(writeFault)
    await expect(savePickedLocatorFromRequest(input({ locatorId: 'loc-1' }), targetProjectId)).rejects.toBe(writeFault)
    expect(root.$transaction).toHaveBeenCalledTimes(2)
    expect(sessions.markReadyAfterSave).toHaveBeenCalledTimes(2)
    expect(events.filter(event => event === 'rollback-signal')).toHaveLength(2)
  })
})

describe('Locator effect bounds', () => {
  it('refuses examined-row sentinel and aggregate key overflow before preparation', async () => {
    tx.testCaseStepParameter.findMany.mockResolvedValueOnce(Array.from({ length: 65_537 }, (_, i) => ({ id: `parameter-${i}`, locatorId: 'loc-1', testCaseStepId: 'step-1' })))
    await expect(deleteLocators(['loc-1'], targetProjectId)).rejects.toMatchObject({ details: { reason: 'ROWS_UNBOUNDED' } })
    const ids = Array.from({ length: sharedResourceBounds.keys }, (_, i) => `bound-${i}`)
    locators = new Map(ids.map(id => [id, locatorRow(id, { locatorGroupId: null })]))
    await expect(deleteLocators(ids, targetProjectId)).rejects.toMatchObject({ details: { reason: 'KEYS_UNBOUNDED' } })
    noMutation()
  })
})
