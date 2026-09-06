import { describe, expect, it } from 'vitest'

import { ServiceError } from '@/services/shared/errors'

import { ensureTargetLocator, type LocatorEnsureInput } from './locator-ensure-service'

type Row = { id: string; name: string; targetProjectId: string | null }
type Group = Row & { route: string; moduleId: string; module: Row }
type Locator = Row & { value: string; locatorGroupId: string | null }

function clientFixture() {
  const modules = new Map<string, Row>()
  const groups = new Map<string, Group>()
  const locators = new Map<string, Locator>()
  const writes = { modules: 0, groups: 0, locators: 0 }
  const targetProject = { id: 'target-login', fingerprint: `sha256:${'a'.repeat(64)}` }
  const client = {
    qualityJourney: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === 'journey-login' ? { id: 'journey-login', targetProjectId: targetProject.id, targetProject } : null,
    },
    module: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const id = typeof where.id === 'string' ? where.id : undefined
        return (
          [...modules.values()].find(
            row => row.targetProjectId === where.targetProjectId && (id ? row.id === id : row.name === where.name),
          ) ?? null
        )
      },
      create: async ({ data }: { data: Row }) => {
        writes.modules += 1
        if (modules.has(data.id)) throw Object.assign(new Error('unique'), { code: 'P2002' })
        modules.set(data.id, data)
        return data
      },
    },
    locatorGroup: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (typeof where.name === 'string')
          return (
            [...groups.values()].find(
              row => row.targetProjectId === where.targetProjectId && row.name === where.name,
            ) ?? null
          )
        return (
          [...groups.values()].find(row => row.id === where.id && row.targetProjectId === where.targetProjectId) ?? null
        )
      },
      create: async ({ data }: { data: Omit<Group, 'module'> }) => {
        writes.groups += 1
        if (groups.has(data.id)) throw Object.assign(new Error('unique'), { code: 'P2002' })
        const moduleRef = modules.get(data.moduleId)!
        const row = { ...data, module: moduleRef }
        groups.set(data.id, row)
        return row
      },
    },
    locator: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        [...locators.values()].filter(
          row =>
            row.locatorGroupId === where.locatorGroupId &&
            row.targetProjectId === where.targetProjectId &&
            row.name === where.name,
        ),
      create: async ({ data }: { data: Locator }) => {
        writes.locators += 1
        if (locators.has(data.id)) throw Object.assign(new Error('unique'), { code: 'P2002' })
        locators.set(data.id, data)
        return data
      },
    },
    $transaction: async <T>(operation: (transaction: unknown) => Promise<T>) => operation(client),
  }
  return { client, groups, locators, modules, writes, targetProject }
}

const request = {
  journeyId: 'journey-login',
  allowCreate: true,
  group: { mode: 'ensure' as const, name: 'Login', route: '/login', module: { mode: 'ensure' as const, name: 'Auth' } },
  locator: { name: 'Email input', selector: '[data-testid="email"]' },
}

function ensure(fixture: ReturnType<typeof clientFixture>, input: LocatorEnsureInput = request) {
  return ensureTargetLocator(input, fixture.targetProject, fixture.client as never)
}

describe('target-scoped locator ensure', () => {
  it('creates the module, group, and locator closure with a Journey-derived target fingerprint', async () => {
    const fixture = clientFixture()
    const result = await ensure(fixture)

    expect(result).toMatchObject({
      journeyId: 'journey-login',
      targetProjectId: 'target-login',
      targetFingerprint: fixture.targetProject.fingerprint,
      outcome: 'created',
      resources: {
        module: { outcome: 'created' },
        locatorGroup: { outcome: 'created' },
        locator: { outcome: 'created', contentHash: expect.stringMatching(/^sha256:/) },
      },
      selectorVerification: 'pending_runtime',
    })
    expect(fixture.writes).toEqual({ modules: 1, groups: 1, locators: 1 })
  })

  it('replays identically with the exact same IDs and no additional rows', async () => {
    const fixture = clientFixture()
    const first = await ensure(fixture)
    const replay = await ensure(fixture)

    expect(replay).toMatchObject({
      outcome: 'reused',
      resources: { module: { outcome: 'reused' }, locatorGroup: { outcome: 'reused' }, locator: { outcome: 'reused' } },
    })
    expect(replay.resources.module.id).toBe(first.resources.module.id)
    expect(replay.resources.locatorGroup.id).toBe(first.resources.locatorGroup.id)
    expect(replay.resources.locator).toMatchObject({
      id: first.resources.locator.id,
      contentHash: first.resources.locator.contentHash,
    })
    expect(fixture.writes).toEqual({ modules: 1, groups: 1, locators: 1 })
  })

  it('rejects changed selector, route, or module requests without changing the closure', async () => {
    const fixture = clientFixture()
    await ensure(fixture)
    const before = { ...fixture.writes }

    await expect(
      ensure(fixture, { ...request, locator: { ...request.locator, selector: '#email' } }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(ensure(fixture, { ...request, group: { ...request.group, route: '/sign-in' } })).rejects.toMatchObject(
      { code: 'CONFLICT' },
    )
    await expect(
      ensure(fixture, { ...request, group: { ...request.group, module: { mode: 'ensure', name: 'Accounts' } } }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(fixture.writes).toEqual(before)
  })

  it('does not write when creation is disallowed or resource IDs belong to another target', async () => {
    const fixture = clientFixture()
    await expect(ensure(fixture, { ...request, allowCreate: false })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    fixture.modules.set('foreign-module', { id: 'foreign-module', name: 'Auth', targetProjectId: 'target-foreign' })
    await expect(
      ensure(fixture, {
        ...request,
        group: { mode: 'ensure', name: 'Login', route: '/login', module: { mode: 'existing', id: 'foreign-module' } },
      }),
    ).rejects.toBeInstanceOf(ServiceError)
    expect(fixture.writes).toEqual({ modules: 0, groups: 0, locators: 0 })
  })

  it('reuses a target-owned group by ID and creates only its missing locator', async () => {
    const fixture = clientFixture()
    fixture.modules.set('module-auth', { id: 'module-auth', name: 'Auth', targetProjectId: 'target-login' })
    fixture.groups.set('group-login', {
      id: 'group-login',
      name: 'Login',
      route: '/login',
      moduleId: 'module-auth',
      targetProjectId: 'target-login',
      module: fixture.modules.get('module-auth')!,
    })

    const result = await ensure(fixture, { ...request, group: { mode: 'existing', id: 'group-login' } })
    expect(result.resources).toMatchObject({
      module: { id: 'module-auth', outcome: 'reused' },
      locatorGroup: { id: 'group-login', outcome: 'reused' },
      locator: { outcome: 'created' },
    })
  })

  it('rejects a target group whose related module belongs to another target without writing', async () => {
    const fixture = clientFixture()
    const foreignModule = { id: 'module-foreign', name: 'Auth', targetProjectId: 'target-foreign' }
    fixture.modules.set(foreignModule.id, foreignModule)
    fixture.groups.set('group-login', {
      id: 'group-login',
      name: 'Login',
      route: '/login',
      moduleId: foreignModule.id,
      targetProjectId: 'target-login',
      module: foreignModule,
    })

    await expect(ensure(fixture, { ...request, group: { mode: 'existing', id: 'group-login' } })).rejects.toMatchObject(
      { code: 'NOT_FOUND' },
    )
    await expect(ensure(fixture)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(fixture.writes).toEqual({ modules: 0, groups: 0, locators: 0 })
  })

  it('rejects a mismatched transport target before any durable write', async () => {
    const fixture = clientFixture()

    await expect(
      ensureTargetLocator(
        request,
        { id: 'target-foreign', fingerprint: `sha256:${'f'.repeat(64)}` },
        fixture.client as never,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(fixture.writes).toEqual({ modules: 0, groups: 0, locators: 0 })
  })
})
