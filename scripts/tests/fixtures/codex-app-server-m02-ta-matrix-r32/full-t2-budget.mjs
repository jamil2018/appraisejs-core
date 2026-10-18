/** Fresh full T2 allocation derived from accepted per-case limits; no historical allocation is refunded. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const RETAINED_R30_CEILINGS = Object.freeze({
  codexStarts: 82,
  mcpStarts: 82,
  threadStarts: 82,
  turnStarts: 79,
  providerRequests: 195,
  scopedCalls: 108,
  workspaceActions: 2,
  permissionReplies: 3,
  listenerStarts: 85,
  controlWrites: 322,
  outerCalls: 117,
  canonicalRequests: 590,
  sourceCapacity: 218,
})

export function fullT2Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  if (cases.length !== 24 || new Set(cases.map(item => item.id)).size !== 24)
    throw new Error('R32 full T2 membership drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  return Object.freeze(result)
}

export function fullT2RecoveryBudget(previous, actualR30) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R30_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 86 ||
    actualR30?.casesCompleted !== 0 ||
    actualR30.sourceCapacityReserved !== 4
  )
    throw new Error('R32 retained allocation or actual R30 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT2Maximum()
  budget.historicalR30Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR30NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR30CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR30Unknown = {
    ...actualR30.consumed,
    sourceCapacity: actualR30.sourceCapacityReserved,
    casesCompleted: 0,
    cleanup: actualR30.cleanup,
    failedCase: 'B01',
    failedCaseCleanup: 'UNKNOWN',
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R30. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R30_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R32 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r30ActualAddedAgainToRetainedAllocation = false
  budget.r31UnrunT3SourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
