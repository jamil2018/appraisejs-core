import { describe, expect, it } from 'vitest'
import { runOfflineProviderLifecycle } from '@/test/offline-provider-lifecycle'

describe('complete offline provider role composition (fresh independent SQLite snapshots)', () => {
  it.each(['direct', 'package'] as const)(
    '%s producer reaches all six canonical acceptances without releasing UNKNOWN',
    async mode => {
      const observations = await runOfflineProviderLifecycle(mode)
      expect(observations).toHaveLength(6)
      expect(observations.every(item => item.counts.turns === 1 && item.receipt.runtimeQualified === false)).toBe(true)
    },
    30_000,
  )
})
