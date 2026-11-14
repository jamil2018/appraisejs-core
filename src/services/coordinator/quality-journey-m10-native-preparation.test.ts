import { existsSync } from 'node:fs'
import { chmod, mkdtemp, realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { createM10DiscoveryMetadataRuntime, prepareM10AutomationFixture } from '@/test/m10-journey-fixture'

type Controls = NonNullable<Parameters<typeof prepareM10AutomationFixture>[1]>
type Owned = Parameters<NonNullable<Controls['onFixtureOwned']>>[0]
async function removeSynthetic(owned: Owned | undefined) {
  if (!owned) return
  await owned.client.$disconnect()
  await rm(owned.workspace, { recursive: true, force: true })
}

describe('disposable native qualification preparation boundaries, without native effects', () => {
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
