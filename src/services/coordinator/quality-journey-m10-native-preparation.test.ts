import { existsSync } from 'node:fs'
import { chmod, mkdtemp, realpath, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { addManagedProviderAssignment, createProviderFixture } from '@/test/quality-journey-provider-fixture'
import { createM10DiscoveryMetadataRuntime, prepareM10AutomationFixture } from '@/test/m10-journey-fixture'

type Controls = NonNullable<Parameters<typeof prepareM10AutomationFixture>[1]>
type Owned = Parameters<NonNullable<Controls['onFixtureOwned']>>[0]
async function removeSynthetic(owned: Owned | undefined) {
  if (!owned) return
  await owned.client.$disconnect()
  await rm(owned.workspace, { recursive: true, force: true })
}

describe('disposable native qualification preparation boundaries, without native effects', () => {
  it.each([undefined, 900] as const)(
    'uses the canonical default or exact qualification lease=%s without changing default request shape',
    async qualificationLeaseSeconds => {
      const before = Date.now()
      const f = await createProviderFixture(
        qualificationLeaseSeconds === undefined ? {} : { qualificationLeaseSeconds },
      )
      try {
        const after = Date.now(),
          seconds = qualificationLeaseSeconds ?? 120
        const actual = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
          where: { id: f.binding.attemptId },
        })
        expect(actual.leaseExpiresAt.getTime()).toBeGreaterThanOrEqual(before + seconds * 1000)
        expect(actual.leaseExpiresAt.getTime()).toBeLessThanOrEqual(after + seconds * 1000)
        expect(actual.heartbeatSeconds).toBe(seconds / 3)
        expect(Object.hasOwn(f.claimRequest, 'leaseSeconds')).toBe(qualificationLeaseSeconds !== undefined)
        if (qualificationLeaseSeconds !== undefined) expect(f.claimRequest.leaseSeconds).toBe(900)
      } finally {
        await f.cleanup()
      }
    },
  )

  it('pins the qualification lease before asynchronous workspace preparation', async () => {
    const options: NonNullable<Parameters<typeof createProviderFixture>[0]> = { qualificationLeaseSeconds: 900 }
    const original = createProviderFixture(options)
    options.qualificationLeaseSeconds = undefined
    const f = await original
    try {
      expect(f.claimRequest.leaseSeconds).toBe(900)
      expect(f.claimed.attempt.heartbeatSeconds).toBe(300)
    } finally {
      await f.cleanup()
    }
  })

  it('rejects invalid qualification leases before creating a workspace, claiming or taking ownership', async () => {
    const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'appraise-m13-invalid-lease-')))
    await chmod(parent, 0o700)
    const onFixtureOwned = vi.fn(),
      dispatch = vi.fn()
    const client = new Proxy(
      {},
      {
        get() {
          throw new Error('Canonical client must not be accessed for an invalid qualification lease')
        },
      },
    ) as Parameters<typeof addManagedProviderAssignment>[0]
    try {
      const before = await readdir(parent)
      for (const invalid of [0, 120, 899, 901, NaN, Infinity, null, '900']) {
        const qualificationLeaseSeconds = invalid as 900
        await expect(createProviderFixture({ workspaceParent: parent, qualificationLeaseSeconds })).rejects.toThrow(
          'exactly 900 seconds or absent',
        )
        await expect(
          prepareM10AutomationFixture(undefined, {
            workspaceParent: parent,
            qualificationLeaseSeconds,
            onFixtureOwned,
            dispatch,
          }),
        ).rejects.toThrow('exactly 900 seconds or absent')
        await expect(
          addManagedProviderAssignment(client, 'unused-target', 'invalid', qualificationLeaseSeconds),
        ).rejects.toThrow('exactly 900 seconds or absent')
      }
      expect(await readdir(parent)).toEqual(before)
      expect(onFixtureOwned).not.toHaveBeenCalled()
      expect(dispatch).not.toHaveBeenCalled()
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('uses the opt-in 900-second canonical lease for every later M10 role without native or browser effects', async () => {
    const before = Date.now(),
      roles: string[] = []
    const f = await prepareM10AutomationFixture(undefined, {
      qualificationLeaseSeconds: 900,
      serialDiscoveryAdmissions: true,
      discoveryRuntime: createM10DiscoveryMetadataRuntime(),
      async dispatch(event) {
        const actual = await event.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
          where: { id: event.binding.attemptId },
        })
        expect(actual.leaseExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 900000)
        expect(actual.leaseExpiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 900000)
        expect(actual.heartbeatSeconds).toBe(300)
        roles.push(event.binding.role)
        return event.directInvoke()
      },
    })
    try {
      expect(roles).toEqual([
        'REQUIREMENT_ANALYZER',
        'SCOUT',
        'RESOURCE_EXPLORER',
        'TEST_SCENARIO_DESIGNER',
        'AUTOMATOR',
      ])
    } finally {
      await f.cleanup()
    }
  })

  it('keeps the original database in an explicitly selected persistent private parent', async () => {
    const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'appraise-m13-private-parent-')))
    await chmod(parent, 0o700)
    let owned: Owned | undefined
    const pause = new Error('Offline persistent checkpoint')
    try {
      await expect(
        prepareM10AutomationFixture(undefined, {
          workspaceParent: parent,
          preserveOnFailure: true,
          dispatch: event => event.directInvoke(),
          onFixtureOwned: original => {
            owned = original
          },
          beforeDiscoveryBrowser: async () => {
            throw pause
          },
        }),
      ).rejects.toBe(pause)
      expect(path.dirname(owned!.workspace)).toBe(parent)
      expect(existsSync(owned!.databasePath)).toBe(true)
    } finally {
      await removeSynthetic(owned)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('refuses an unsafe explicit workspace parent without silently falling back', async () => {
    const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'appraise-m13-public-parent-')))
    await chmod(parent, 0o755)
    const onFixtureOwned = vi.fn()
    try {
      await expect(
        prepareM10AutomationFixture(undefined, {
          workspaceParent: parent,
          dispatch: event => event.directInvoke(),
          onFixtureOwned,
        }),
      ).rejects.toThrow('private fixture workspace parent')
      expect(onFixtureOwned).not.toHaveBeenCalled()
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('pauses before any browser or Discovery admission and preserves the original database on request', async () => {
    let owned: Owned | undefined
    const pause = new Error('Offline fixture browser boundary')
    try {
      await expect(
        prepareM10AutomationFixture(undefined, {
          dispatch: event => event.directInvoke(),
          onFixtureOwned: original => {
            owned = original
          },
          preserveOnFailure: true,
          async beforeDiscoveryBrowser(scope) {
            expect(scope.client).toBe(owned!.client)
            expect(await scope.client.qualityJourneyOwnedBrowser.count()).toBe(0)
            const scout = await scope.client.qualityJourneyWorkItem.findUniqueOrThrow({
              where: { id: scope.workItemId },
            })
            expect(scout.currentAttempt).toBe(0)
            throw pause
          },
        }),
      ).rejects.toBe(pause)
      expect(existsSync(owned!.databasePath)).toBe(true)
      expect(await owned!.client.qualityJourney.count()).toBe(1)
    } finally {
      await removeSynthetic(owned)
    }
  })

  it('retains the original default cleanup behavior when preservation is not selected', async () => {
    let owned: Owned | undefined
    const pause = new Error('Offline default cleanup boundary')
    try {
      await expect(
        prepareM10AutomationFixture(undefined, {
          dispatch: event => event.directInvoke(),
          onFixtureOwned: original => {
            owned = original
          },
          beforeDiscoveryBrowser: async () => {
            throw pause
          },
        }),
      ).rejects.toBe(pause)
      expect(existsSync(owned!.databasePath)).toBe(false)
    } finally {
      await removeSynthetic(owned)
    }
  })

  it('uses only the explicitly supplied runtime after the browser gate', async () => {
    let owned: Owned | undefined
    const order: string[] = []
    const refused = new Error('No actual browser is launched by this test')
    const launch = vi.fn(async () => {
      order.push('launch')
      throw refused
    })
    try {
      await expect(
        prepareM10AutomationFixture(undefined, {
          dispatch: event => event.directInvoke(),
          onFixtureOwned: original => {
            owned = original
          },
          beforeDiscoveryBrowser: async () => {
            order.push('gate')
          },
          discoveryRuntime: { launch },
          preserveOnFailure: true,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', message: 'Discovery browser is unavailable.' })
      expect(order).toEqual(['gate', 'launch'])
      expect(launch).toHaveBeenCalledTimes(1)
      expect(existsSync(owned!.databasePath)).toBe(true)
    } finally {
      await removeSynthetic(owned)
    }
  })

  it('blocks Scout admission when original browser cleanup remains unknown', async () => {
    let owned: Owned | undefined
    const runtime = createM10DiscoveryMetadataRuntime()
    const originalLaunch = runtime.launch.bind(runtime)
    const roles: string[] = []
    try {
      await expect(
        prepareM10AutomationFixture(undefined, {
          dispatch: event => {
            roles.push(event.binding.role)
            return event.directInvoke()
          },
          onFixtureOwned: original => {
            owned = original
          },
          preserveOnFailure: true,
          requireObservedDiscoveryCleanup: true,
          discoveryRuntime: {
            ...runtime,
            async launch() {
              const original = await originalLaunch()
              return {
                ...original,
                async close() {
                  throw new Error('Synthetic unobserved metadata-runtime close')
                },
              }
            },
          },
        }),
      ).rejects.toThrow('Discovery browser runtime cleanup is unconfirmed.')
      expect(roles).toEqual(['REQUIREMENT_ANALYZER'])
      expect(await owned!.client.qualityJourneyOwnedBrowser.count({ where: { status: 'UNKNOWN' } })).toBe(1)
      expect(existsSync(owned!.databasePath)).toBe(true)
    } finally {
      await removeSynthetic(owned)
    }
  })

  it.each([false, true])('keeps Explorer unclaimed during Scout only for explicit serial mode=%s', async serial => {
    let owned: Owned | undefined
    let scoutObserved = false
    const f = await prepareM10AutomationFixture(undefined, {
      onFixtureOwned: original => {
        owned = original
      },
      serialDiscoveryAdmissions: serial,
      requireObservedDiscoveryCleanup: serial,
      async dispatch(event) {
        if (event.binding.role === 'SCOUT') {
          scoutObserved = true
          const explorer = await event.client.qualityJourneyWorkItem.findFirstOrThrow({
            where: { journeyId: event.binding.journeyId, role: 'RESOURCE_EXPLORER' },
          })
          expect(explorer.currentAttempt).toBe(serial ? 0 : 1)
        }
        return event.directInvoke()
      },
    })
    try {
      expect(scoutObserved).toBe(true)
      const explorer = await f.client.qualityJourneyWorkItem.findFirstOrThrow({
        where: { journeyId: f.scope.journeyId, role: 'RESOURCE_EXPLORER' },
      })
      expect(explorer.currentAttempt).toBe(1)
      expect(owned!.client).toBe(f.client)
    } finally {
      await f.cleanup()
    }
  })
})
