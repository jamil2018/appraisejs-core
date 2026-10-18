/** One fresh B14 allocation; the entire historical R35 allocation remains retained without refunds. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'
import { R35_COUNTS } from './r35-evidence.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const RETAINED_R35_CEILINGS = Object.freeze({
  codexStarts: 132,
  mcpStarts: 132,
  threadStarts: 132,
  turnStarts: 127,
  providerRequests: 315,
  scopedCalls: 177,
  workspaceActions: 2,
  permissionReplies: 6,
  listenerStarts: 135,
  controlWrites: 522,
  outerCalls: 189,
  canonicalRequests: 966,
  sourceCapacity: 338,
})

export function singleB14Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  const original = ORIGINAL_POLICY.cases.find(item => item.id === 'B14')
  if (
    POLICY.cases.length !== 1 ||
    cases.length !== 1 ||
    cases[0].id !== 'B14' ||
    !isDeepStrictEqual(cases[0], original)
  )
    throw new Error('R36 single B14 membership or per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 2) throw new Error('R36 B14 source allocation drift')
  return Object.freeze(result)
}

export function singleB14RecoveryBudget(previous, actualR35) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R35_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 136 ||
    actualR35?.casesCompleted !== 0 ||
    actualR35.status !== 'UNKNOWN' ||
    actualR35.failedCase !== 'B14' ||
    actualR35.nativeEmptyDenialStatus !== 'EMPTY_PERMISSION_DENIAL_CORRELATED' ||
    actualR35.grants !== 0 ||
    actualR35.cleanup !== 'UNKNOWN' ||
    actualR35.failedCaseCleanup !== 'UNKNOWN' ||
    actualR35.manifestFileSha256 !== 'c10543b9b04fbd086ef07ad6b269d3bf4add36b991dd1f7aeefc63ff2245a41f' ||
    actualR35.sourceCapacityReserved !== 2 ||
    actualR35.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(actualR35.pending, []) ||
    !isDeepStrictEqual(actualR35.consumed, R35_COUNTS)
  )
    throw new Error('R36 retained allocation or actual R35 evidence drift')
  const budget = structuredClone(previous)
  const fresh = singleB14Maximum()
  budget.historicalR35Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR35NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR35CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR35Unknown = {
    ...actualR35.consumed,
    sourceCapacity: actualR35.sourceCapacityReserved,
    casesCompleted: 0,
    cleanup: actualR35.cleanup,
    failedCase: 'B14',
    failedCaseCleanup: 'UNKNOWN',
    fullT2Qualification: false,
    nativeEmptyDenialStatus: 'EMPTY_PERMISSION_DENIAL_CORRELATED',
    grants: 0,
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R35. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R35_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R36 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r35ActualAddedAgainToRetainedAllocation = false
  budget.r31UnrunT3SourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  budget.freshScope = 'ONE_B14_WORKING_PROBE_ONLY'
  budget.fullT2Qualification = false
  return budget
}
