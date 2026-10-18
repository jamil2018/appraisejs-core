/** One fresh A06 allocation; the entire historical R32 allocation remains retained without refunds. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-matrix-r32/policy.mjs'
import { R32_COUNTS } from './r32-evidence.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const RETAINED_R32_CEILINGS = Object.freeze({
  codexStarts: 106,
  mcpStarts: 106,
  threadStarts: 106,
  turnStarts: 102,
  providerRequests: 253,
  scopedCalls: 142,
  workspaceActions: 2,
  permissionReplies: 4,
  listenerStarts: 109,
  controlWrites: 418,
  outerCalls: 152,
  canonicalRequests: 774,
  sourceCapacity: 276,
})

export function fullT2Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  const original = ORIGINAL_POLICY.cases.find(item => item.id === 'B07-A06')
  if (
    POLICY.cases.length !== 1 ||
    cases.length !== 1 ||
    cases[0].id !== 'B07-A06' ||
    !isDeepStrictEqual(cases[0], original)
  )
    throw new Error('R33 single A06 membership or per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 2) throw new Error('R33 A06 source allocation drift')
  return Object.freeze(result)
}

export function fullT2RecoveryBudget(previous, actualR32) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R32_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 110 ||
    actualR32?.casesCompleted !== 11 ||
    actualR32.status !== 'UNKNOWN' ||
    actualR32.failedCase !== 'B07-A06' ||
    actualR32.failedCaseCleanup !== 'UNKNOWN' ||
    actualR32.cleanup !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    actualR32.sourceCapacityReserved !== 36 ||
    actualR32.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(actualR32.pending, []) ||
    !isDeepStrictEqual(actualR32.consumed, R32_COUNTS)
  )
    throw new Error('R33 retained allocation or actual R32 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT2Maximum()
  budget.historicalR32Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR32NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR32CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR32Unknown = {
    ...actualR32.consumed,
    sourceCapacity: actualR32.sourceCapacityReserved,
    casesCompleted: 11,
    cleanup: actualR32.cleanup,
    failedCase: 'B07-A06',
    failedCaseCleanup: 'UNKNOWN',
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R32. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R32_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R33 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r32ActualAddedAgainToRetainedAllocation = false
  budget.r33DiagnosticOnlyNotFullT2Qualification = true
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
