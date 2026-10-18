/** Fresh full T2 allocation derived from accepted per-case limits; no historical allocation is refunded. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const RETAINED_R28_CEILINGS = Object.freeze({
  codexStarts: 34,
  mcpStarts: 34,
  threadStarts: 34,
  turnStarts: 33,
  providerRequests: 79,
  scopedCalls: 40,
  workspaceActions: 2,
  permissionReplies: 1,
  listenerStarts: 37,
  controlWrites: 130,
  outerCalls: 47,
  canonicalRequests: 222,
  sourceCapacity: 102,
})

export function fullT2Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  if (cases.length !== 24 || new Set(cases.map(item => item.id)).size !== 24)
    throw new Error('R29 full T2 membership drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  return Object.freeze(result)
}

export function fullT2RecoveryBudget(previous, actualR28) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R28_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 38 ||
    actualR28?.casesCompleted !== 1 ||
    actualR28.sourceCapacityReserved !== 4
  )
    throw new Error('R29 retained allocation or actual R28 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT2Maximum()
  budget.historicalR28Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR28NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalCombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR28Accepted = {
    ...actualR28.consumed,
    sourceCapacity: actualR28.sourceCapacityReserved,
    casesCompleted: 1,
    cleanup: actualR28.cleanup,
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R28. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R28_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R29 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r28ActualAddedAgainToRetainedAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
