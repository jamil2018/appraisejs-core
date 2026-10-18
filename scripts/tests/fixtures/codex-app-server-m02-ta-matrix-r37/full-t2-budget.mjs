/** Fresh full T2 allocation; the entire historical R36 allocation remains retained without refunds. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'
import { R36_COUNTS } from './r36-evidence.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const R36_MANIFEST_FILE_SHA256 = '6818d63ad2d4e4073b3f0ab679e11d0399a2281a3fa759a7bb3e4d25dd466b10'
export const RETAINED_R36_CEILINGS = Object.freeze({
  codexStarts: 133,
  mcpStarts: 133,
  threadStarts: 133,
  turnStarts: 128,
  providerRequests: 317,
  scopedCalls: 177,
  workspaceActions: 2,
  permissionReplies: 7,
  listenerStarts: 136,
  controlWrites: 526,
  outerCalls: 190,
  canonicalRequests: 968,
  sourceCapacity: 340,
})

export function fullT2Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T2')
  if (POLICY.cases.length !== 24 || cases.length !== 24 || !isDeepStrictEqual(cases, original))
    throw new Error('R37 full T2 membership or per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 58) throw new Error('R37 full T2 source allocation drift')
  return Object.freeze(result)
}

export function fullT2RecoveryBudget(previous, actualR36) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R36_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 137 ||
    actualR36?.casesCompleted !== 1 ||
    actualR36.status !== 'B14_CASE_COMPLETED_NOT_FULL_T2' ||
    actualR36.failedCase !== null ||
    actualR36.cleanup !== 'B14_BOUNDED_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    actualR36.manifestFileSha256 !== R36_MANIFEST_FILE_SHA256 ||
    actualR36.sourceCapacityReserved !== 2 ||
    actualR36.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(actualR36.pending, []) ||
    !isDeepStrictEqual(actualR36.consumed, R36_COUNTS)
  )
    throw new Error('R37 retained allocation or actual R36 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT2Maximum()
  budget.historicalR36Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR36NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR36CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR36CompletedB14 = {
    ...actualR36.consumed,
    sourceCapacity: actualR36.sourceCapacityReserved,
    casesCompleted: 1,
    cleanup: actualR36.cleanup,
    failedCase: null,
    fullT2Qualification: false,
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R36. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R36_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R37 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r36ActualAddedAgainToRetainedAllocation = false
  budget.r31UnrunT3SourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  budget.freshScope = 'ONE_FULL_24_T2_INVOCATION'
  budget.fullT2Qualification = false
  return budget
}
