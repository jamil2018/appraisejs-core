import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOfflineReadinessController } from '@/lib/quality-journey/codex-app-server/readiness-controller'
import type { ReadinessOptions } from '@/lib/quality-journey/codex-app-server/readiness-contract'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import {
  prepareQualityJourneyProviderRun,
  claimQualityJourneyProviderIntent,
  armQualityJourneyProviderIntent,
} from './quality-journey-provider-run-service'

type Fixture = Awaited<ReturnType<typeof createProviderFixture>>
const fixtures: Fixture[] = []
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()))
})
const options: ReadinessOptions = {
  binding: {
    candidateTree: 'a'.repeat(40),
    executableSha256: 'b'.repeat(64),
    configurationDigest: `sha256:${'c'.repeat(64)}`,
    readinessContractDigest: `sha256:${'d'.repeat(64)}`,
  },
  requiredMcpIds: ['synthetic-appraise'],
  initializationTimeoutMs: 100,
  requiredMcpTimeoutMs: 100,
  cleanupTimeoutMs: 100,
}

/** All SQLite tables, including empty ones: no selected-column or selected-model blind spot. */
async function databaseSnapshot(f: Fixture) {
  const tables = await f.client.$queryRaw<{ name: string }[]>`
    SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
  `
  const snapshot: Record<string, string[]> = {}
  for (const { name } of tables) {
    const quoted = `"${name.replaceAll('"', '""')}"`
    const rows = await f.client.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM ${quoted}`)
    snapshot[name] = rows
      .map(row => JSON.stringify(row, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)))
      .sort()
  }
  return snapshot
}

async function antecedent() {
  const f = await createProviderFixture()
  fixtures.push(f)
  // Fresh synthetic antecedents only; no permit is sent/consumed or provider contacted.
  const prepared = await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
  const request = { ...f.binding, intentId: prepared.intent.id, claimOwner: 'offline-readiness-antecedent' }
  const claimed = await claimQualityJourneyProviderIntent(request, f.client)
  await armQualityJourneyProviderIntent({ ...request, claimEpoch: claimed.intent.claimEpoch }, f.client)
  expect(await f.client.qualityJourneyProviderRun.count()).toBeGreaterThan(0)
  expect(await f.client.qualityJourneyProviderDispatchIntent.count()).toBeGreaterThan(0)
  expect(await f.client.qualityJourneyWorkAuthorization.count()).toBeGreaterThan(0)
  return f
}

describe('18. offline readiness leaves migrated canonical SQLite unchanged', () => {
  it.each(['success', 'cancelled', 'uncertain'] as const)(
    '%s preserves every table and original UNKNOWN custody',
    async mode => {
      const f = await antecedent()
      const before = await databaseSnapshot(f)
      const calls: string[] = []
      const initialize = vi.fn(async () => {
        calls.push('initialize')
        return { status: 'INITIALIZED', binding: options.binding }
      })
      const inspectRequiredMcp = vi.fn(async () => {
        calls.push('inspect')
        return { status: 'READY', servers: [{ id: 'synthetic-appraise', status: 'READY' }] }
      })
      const fence = vi.fn(() => {
        calls.push('fence')
      })
      const stop = vi.fn(async () => {
        calls.push('stop')
        return mode === 'uncertain'
          ? {
              status: 'uncertain' as const,
              groupExitObserved: false,
              privateRootRemoved: false,
              privateRootRetained: true,
            }
          : {
              status: 'stopped' as const,
              groupExitObserved: true,
              privateRootRemoved: true,
              privateRootRetained: false,
            }
      })
      const controller = createOfflineReadinessController(options, {
        provenance: 'OFFLINE_FAKE_PORT',
        initialize,
        inspectRequiredMcp,
        fence,
        stop,
      })
      expect(calls).toEqual([])
      const receipt = await (mode === 'cancelled' ? controller.cancel() : controller.run())
      expect(receipt.outcome).toBe(
        mode === 'success' ? 'OFFLINE_CONTRACT_SATISFIED' : mode === 'cancelled' ? 'REFUSED' : 'UNKNOWN',
      )
      expect(receipt.provenance).toBe('OFFLINE_FAKE_PORT')
      expect(receipt.runtimeQualified).toBe(false)
      expect(receipt.observedNativeTuple).toBeNull()
      expect(await controller.run()).toBe(receipt)
      expect(await controller.cancel()).toBe(receipt)
      expect(stop).toHaveBeenCalledTimes(1)
      expect(calls).toEqual(mode === 'cancelled' ? ['fence', 'stop'] : ['initialize', 'inspect', 'fence', 'stop'])
      expect(await databaseSnapshot(f)).toEqual(before)
    },
  )
})
