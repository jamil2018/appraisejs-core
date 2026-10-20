/** One fresh B14 allocation; the entire historical R34 allocation remains retained without refunds. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'
import { R34_COUNTS } from './r34-evidence.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const RETAINED_R34_CEILINGS = Object.freeze({
  codexStarts: 131,
  mcpStarts: 131,
  threadStarts: 131,
  turnStarts: 126,
  providerRequests: 313,
  scopedCalls: 177,
  workspaceActions: 2,
  permissionReplies: 5,
  listenerStarts: 134,
  controlWrites: 518,
  outerCalls: 188,
  canonicalRequests: 964,
  sourceCapacity: 336,
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
    throw new Error('R35 single B14 membership or per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 2) throw new Error('R35 B14 source allocation drift')
  return Object.freeze(result)
}

export function singleB14RecoveryBudget(previous, actualR34) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R34_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 135 ||
    actualR34?.casesCompleted !== 23 ||
    actualR34.status !== 'UNKNOWN' ||
    actualR34.failedCase !== 'B14' ||
    actualR34.cleanup !== 'UNKNOWN' ||
    actualR34.failedCaseCleanup !== 'UNKNOWN' ||
    actualR34.manifestFileSha256 !== '9ddda98294918b30a2bec4778f2e9d292eb06ca550a0b7c2a86c79a3c862b131' ||
    actualR34.sourceCapacityReserved !== 58 ||
    actualR34.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(actualR34.pending, []) ||
    !isDeepStrictEqual(actualR34.consumed, R34_COUNTS)
  )
    throw new Error('R35 retained allocation or actual R34 evidence drift')
  const budget = structuredClone(previous)
  const fresh = singleB14Maximum()
  budget.historicalR34Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR34NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR34CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR34Unknown = {
    ...actualR34.consumed,
    sourceCapacity: actualR34.sourceCapacityReserved,
    casesCompleted: 23,
    cleanup: actualR34.cleanup,
    failedCase: 'B14',
    failedCaseCleanup: 'UNKNOWN',
    fullT2Qualification: false,
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R34. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R34_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R35 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r34ActualAddedAgainToRetainedAllocation = false
  budget.r31UnrunT3SourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  budget.freshScope = 'ONE_B14_WORKING_PROBE_ONLY'
  budget.fullT2Qualification = false
  return budget
}
