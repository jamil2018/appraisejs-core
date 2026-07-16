import type { SyncScriptId } from '@/lib/sync/sync-registry'

export type PendingComparison = Readonly<{
  family: SyncScriptId
  count: number
  reasons: readonly string[]
}>

export function pendingComparison(family: SyncScriptId, count: number): PendingComparison {
  return Object.freeze({
    family,
    count,
    reasons: Object.freeze(count === 0 ? [] : [`${count} projected ${family} record(s) differ from persisted state.`]),
  })
}

export function aggregatePendingComparisons(comparisons: readonly PendingComparison[]) {
  const counts = Object.fromEntries(comparisons.map(comparison => [comparison.family, comparison.count])) as Record<
    SyncScriptId,
    number
  >
  return { counts, total: comparisons.reduce((sum, comparison) => sum + comparison.count, 0) }
}
