/** Fresh full T2 allocation derived from accepted per-case limits; no historical allocation is refunded. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const RETAINED_R29_CEILINGS = Object.freeze({
  codexStarts: 58,
  mcpStarts: 58,
  threadStarts: 58,
  turnStarts: 56,
  providerRequests: 137,
  scopedCalls: 74,
  workspaceActions: 2,
  permissionReplies: 2,
  listenerStarts: 61,
  controlWrites: 226,
  outerCalls: 82,
  canonicalRequests: 406,
  sourceCapacity: 160,
})

export function fullT2Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  if (cases.length !== 24 || new Set(cases.map(item => item.id)).size !== 24)
    throw new Error('R30 full T2 membership drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  return Object.freeze(result)
}

export function fullT2RecoveryBudget(previous, actualR29) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R29_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 62 ||
    actualR29?.casesCompleted !== 7 ||
    actualR29.sourceCapacityReserved !== 28
  )
    throw new Error('R30 retained allocation or actual R29 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT2Maximum()
  budget.historicalR29Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR29NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalCombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR29PartialUnknown = {
    ...actualR29.consumed,
    sourceCapacity: actualR29.sourceCapacityReserved,
    casesCompleted: 7,
    cleanup: actualR29.cleanup,
    failedCase: 'B07-A02',
    failedCaseCleanup: 'UNKNOWN',
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R29. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R29_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R30 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r29ActualAddedAgainToRetainedAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
