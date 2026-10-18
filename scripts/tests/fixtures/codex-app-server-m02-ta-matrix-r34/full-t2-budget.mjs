/** Fresh full T2 allocation; the entire historical R33 allocation remains retained without refunds. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'
import { R33_COUNTS } from './r33-evidence.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const RETAINED_R33_CEILINGS = Object.freeze({
  codexStarts: 107,
  mcpStarts: 107,
  threadStarts: 107,
  turnStarts: 103,
  providerRequests: 255,
  scopedCalls: 143,
  workspaceActions: 2,
  permissionReplies: 4,
  listenerStarts: 110,
  controlWrites: 422,
  outerCalls: 153,
  canonicalRequests: 780,
  sourceCapacity: 278,
})

export function fullT2Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T2')
  if (POLICY.cases.length !== 24 || cases.length !== 24 || !isDeepStrictEqual(cases, original))
    throw new Error('R34 full T2 membership or per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 58) throw new Error('R34 full T2 source allocation drift')
  return Object.freeze(result)
}

export function fullT2RecoveryBudget(previous, actualR33) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R33_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 111 ||
    actualR33?.casesCompleted !== 1 ||
    actualR33.status !== 'A06_MINIMAL_PATH_PROFILE_COMPLETED_NOT_FULL_T2' ||
    actualR33.failedCase !== null ||
    actualR33.cleanup !== 'A06_BOUNDED_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    actualR33.sourceCapacityReserved !== 2 ||
    actualR33.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(actualR33.pending, []) ||
    !isDeepStrictEqual(actualR33.consumed, R33_COUNTS)
  )
    throw new Error('R34 retained allocation or actual R33 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT2Maximum()
  budget.historicalR33Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR33NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR33CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR33CompletedProfile = {
    ...actualR33.consumed,
    sourceCapacity: actualR33.sourceCapacityReserved,
    casesCompleted: 1,
    cleanup: actualR33.cleanup,
    failedCase: null,
    fullT2Qualification: false,
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R33. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R33_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R34 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r33ActualAddedAgainToRetainedAllocation = false
  budget.r31UnrunT3SourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
