/** Pure T3 allocation arithmetic. Allocation and file evidence do not authorize a native invocation. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
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
export const DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS = Object.freeze({ N01: 2, N02: 0 })

export function fullT3Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T3')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T3')
  if (cases.map(item => item.id).join(',') !== 'N01,N02' || !isDeepStrictEqual(cases, original))
    throw new Error('R38 full T3 membership or original per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 4 || result.helperStarts !== 2 || result.auditRequests !== 0)
    throw new Error('R38 fresh source or supervisor-helper allocation drift')
  return Object.freeze(result)
}

/**
 * actualR37 is the exact read-only predecessor verifier's result, not an authority token.
 * Required fields: status, casesCompleted, manifestFileSha256, cleanup, pending,
 * sourceCapacityReserved, actualSourceHostCount, and consumed (the complete journal-kind map).
 */
export function fullT3RecoveryBudget(previous, actualR37) {
  const kinds = [...Object.keys(ORIGINAL_POLICY.aggregate), 'outerCalls', 'auditRequests']
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R37_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 161 ||
    actualR37?.status !== 'T2_CASES_COMPLETED_NOT_CONTAINMENT' ||
    actualR37.casesCompleted !== 24 ||
    actualR37.manifestFileSha256 !== R37_MANIFEST_FILE_SHA256 ||
    actualR37.cleanup !== 'ALL24_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    !isDeepStrictEqual(actualR37.pending, []) ||
    actualR37.sourceCapacityReserved !== 58 ||
    actualR37.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(Object.keys(actualR37.consumed ?? {}).sort(), [...kinds].sort()) ||
    kinds.some(
      kind =>
        !Number.isSafeInteger(actualR37.consumed[kind]) ||
        actualR37.consumed[kind] < 0 ||
        !Number.isSafeInteger(previous.newT2Maximum?.[kind]) ||
        actualR37.consumed[kind] > previous.newT2Maximum[kind],
    )
  )
    throw new Error('R38 retained R37 allocation or accepted full T2 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT3Maximum()
  budget.historicalR37Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR37NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR37CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR37CompletedT2 = {
    ...structuredClone(actualR37.consumed),
    status: actualR37.status,
    casesCompleted: actualR37.casesCompleted,
    manifestFileSha256: actualR37.manifestFileSha256,
    sourceCapacity: actualR37.sourceCapacityReserved,
    cleanup: actualR37.cleanup,
    pending: [],
    actualSourceHostCount: 'UNATTESTED',
  }
  // R37's entire allocation remains retained; its observed consumption is never added a second time.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R37_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R38 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT3Maximum = { ...fresh }
  budget.newT3Consumed = Object.fromEntries(
    Object.keys(fresh)
      .filter(kind => kind !== 'cases')
      .map(kind => [kind, 0]),
  )
  budget.newT3SupervisorHelperReservationMaximum = fresh.helperStarts
  budget.dedicatedToolHelperSourceExpectations = { ...DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS }
  budget.helperExpectationEvidenceClass = 'PINNED_SOURCE_PATTERN_NOT_TOTAL_PROCESS_BOUND_OR_RUNTIME_COUNT'
  budget.nativeScratchHelperInventory = 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED'
  budget.historicalAllocationsRefunded = false
  budget.r37ActualAddedAgainToRetainedAllocation = false
  budget.newT3AllocationConsumedByPreparation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
