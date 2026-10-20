/** Fresh full T2 allocation; the entire historical R37 allocation remains retained without refunds. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'
import { R37_COUNTS } from './r37-evidence.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const R37_MANIFEST_FILE_SHA256 = '02731361b8beaabd6ca4cec43c2a7e190ac0f42eeb0e07e0094717eb86142bf0'
export const RETAINED_R37_CEILINGS = Object.freeze({
  codexStarts: 157,
  mcpStarts: 157,
  threadStarts: 157,
  turnStarts: 151,
  providerRequests: 375,
  scopedCalls: 211,
  workspaceActions: 2,
  permissionReplies: 8,
  listenerStarts: 160,
  controlWrites: 622,
  outerCalls: 225,
  canonicalRequests: 1152,
  sourceCapacity: 398,
})

export function fullT2Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T2')
  if (POLICY.cases.length !== 24 || cases.length !== 24 || !isDeepStrictEqual(cases, original))
    throw new Error('R39 full T2 membership or per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 58) throw new Error('R39 full T2 source allocation drift')
  return Object.freeze(result)
}

export function fullT2RecoveryBudget(previous, actualR37) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R37_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 161 ||
    actualR37?.casesCompleted !== 20 ||
    actualR37.status !== 'UNKNOWN' ||
    actualR37.failedCase !== 'B07-D01' ||
    actualR37.cleanup !== 'UNKNOWN' ||
    actualR37.failedCaseCleanup !== 'UNKNOWN' ||
    actualR37.failureStage !== 'GIT_READINESS' ||
    actualR37.failureReason !== 'GIT_READINESS_CASE_BUDGET_EXHAUSTED' ||
    actualR37.manifestFileSha256 !== R37_MANIFEST_FILE_SHA256 ||
    actualR37.sourceCapacityReserved !== 54 ||
    actualR37.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(actualR37.pending, []) ||
    !isDeepStrictEqual(actualR37.consumed, R37_COUNTS)
  )
    throw new Error('R39 retained allocation or actual R37 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT2Maximum()
  budget.historicalR37Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR37NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR37CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR37Unknown = {
    ...actualR37.consumed,
    sourceCapacity: actualR37.sourceCapacityReserved,
    casesCompleted: 20,
    cleanup: actualR37.cleanup,
    failedCase: 'B07-D01',
    failedCaseCleanup: 'UNKNOWN',
    failureStage: actualR37.failureStage,
    failureReason: actualR37.failureReason,
    fullT2Qualification: false,
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R37. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R37_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R39 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r37ActualAddedAgainToRetainedAllocation = false
  budget.r31UnrunT3SourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  budget.freshScope = 'ONE_FULL_24_T2_INVOCATION'
  budget.fullT2Qualification = false
  return budget
}
