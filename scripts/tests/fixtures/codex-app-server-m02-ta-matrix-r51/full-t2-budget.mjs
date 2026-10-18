/** Fresh full24 maximum after the consumed R48 UNKNOWN; retained allocations are never refunded or added twice. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'
import { R48_COUNTS, R48_MANIFEST_FILE_SHA256 } from './r48-evidence.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export { R48_MANIFEST_FILE_SHA256 }
export const RETAINED_R48_CEILINGS = Object.freeze({
  codexStarts: 230,
  mcpStarts: 230,
  threadStarts: 230,
  turnStarts: 221,
  providerRequests: 551,
  scopedCalls: 314,
  workspaceActions: 2,
  permissionReplies: 11,
  listenerStarts: 233,
  controlWrites: 914,
  outerCalls: 331,
  canonicalRequests: 1710,
  sourceCapacity: 574,
})
const PROSPECTIVE_CEILINGS = Object.freeze({
  codexStarts: 254,
  mcpStarts: 254,
  threadStarts: 254,
  turnStarts: 244,
  providerRequests: 609,
  scopedCalls: 348,
  workspaceActions: 2,
  permissionReplies: 12,
  listenerStarts: 257,
  controlWrites: 1010,
  outerCalls: 366,
  canonicalRequests: 1894,
  sourceCapacity: 632,
})
export function fullT2Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T2')
  if (POLICY.cases.length !== 24 || cases.length !== 24 || !isDeepStrictEqual(cases, original))
    throw new Error('R51 full T2 membership or per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (
    result.sourceCapacity !== 58 ||
    result.listenerStarts !== 24 ||
    result.controlWrites !== 96 ||
    result.codexStarts !== 24 ||
    result.mcpStarts !== 24 ||
    result.threadStarts !== 24 ||
    result.turnStarts !== 23 ||
    result.providerRequests !== 58 ||
    result.scopedCalls !== 34 ||
    result.workspaceActions !== 0 ||
    result.permissionReplies !== 1 ||
    result.outerCalls !== 35 ||
    result.canonicalRequests !== 184 ||
    result.helperStarts !== 0 ||
    result.auditRequests !== 68
  )
    throw new Error('R51 full T2 allocation drift')
  return Object.freeze(result)
}

export function fullT2RecoveryBudget(previous, actualR48) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R48_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 234 ||
    actualR48?.status !== 'UNKNOWN' ||
    actualR48.casesCompleted !== 0 ||
    actualR48.failedCase !== 'B01' ||
    !isDeepStrictEqual(actualR48.completedCases, []) ||
    actualR48.manifestFileSha256 !== R48_MANIFEST_FILE_SHA256 ||
    actualR48.sourceCapacityReserved !== 4 ||
    actualR48.actualSourceHostCount !== 'UNATTESTED' ||
    actualR48.fullT2Qualification !== false ||
    actualR48.runtimeQualified !== false ||
    actualR48.cleanup !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    actualR48.failedCaseCleanup !== 'UNKNOWN' ||
    actualR48.globalCleanup !== 'UNKNOWN' ||
    actualR48.journalUnknownFenceObserved !== true ||
    actualR48.journalTerminalCheckpointObserved !== false ||
    actualR48.ownedStopObserved !== true ||
    actualR48.ownedStopEstablishesCleanup !== false ||
    actualR48.journalRecords !== 17 ||
    actualR48.reservations !== 7 ||
    actualR48.acknowledgements !== 5 ||
    !isDeepStrictEqual(actualR48.pending, [
      { id: 'B01-codex-mcp', kind: 'mcpStarts' },
      { id: 'B01-thread-start', kind: 'threadStarts' },
    ]) ||
    !isDeepStrictEqual(actualR48.consumed, R48_COUNTS)
  )
    throw new Error('R51 retained allocation or actual R48 drift')
  const budget = structuredClone(previous),
    fresh = fullT2Maximum()
  if (!isDeepStrictEqual(previous.newT2Maximum, fresh)) throw new Error('R51 prior full24 maximum drift')
  budget.historicalR48Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR48NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR48CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR48Unknown = {
    ...actualR48.consumed,
    sourceCapacity: 4,
    status: 'UNKNOWN',
    casesCompleted: 0,
    completedCases: [],
    failedCase: 'B01',
    cleanup: actualR48.cleanup,
    failedCaseCleanup: 'UNKNOWN',
    globalCleanup: 'UNKNOWN',
    pending: structuredClone(actualR48.pending),
    journalRecords: 17,
    reservations: 7,
    acknowledgements: 5,
    journalUnknownFenceObserved: true,
    journalTerminalCheckpointObserved: false,
    ownedStopIntentObserved: true,
    ownedStopObserved: true,
    ownedStopEstablishesCleanup: false,
    fullT2Qualification: false,
    actualSourceHostCount: 'UNATTESTED',
    protocolCategory: 'UNCLASSIFIED_PROTOCOL',
    protocolPhase: 'ready',
    protocolPendingKind: 'thread/start',
  }
  // R48's entire prospective allocation is already retained. Keep its actual reservations separate.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R48_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R51 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  if (
    !isDeepStrictEqual(budget.cumulativeWholeCampaignCeilings, PROSPECTIVE_CEILINGS) ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 258
  )
    throw new Error('R51 cumulative allocation drift')
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r48ActualAddedAgainToRetainedAllocation = false
  budget.r47UnrunSourceAddsAllocation = false
  budget.r49UnrunSourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = true
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  budget.freshScope = 'ONE_FULL_24_T2_INVOCATION'
  budget.fullT2Qualification = false
  return budget
}
