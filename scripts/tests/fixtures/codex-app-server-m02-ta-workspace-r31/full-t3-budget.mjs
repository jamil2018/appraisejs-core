/** Pure T3 allocation arithmetic. Allocation and file evidence do not authorize a native invocation. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const R34_MANIFEST_FILE_SHA256 = '9ddda98294918b30a2bec4778f2e9d292eb06ca550a0b7c2a86c79a3c862b131'
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
export const DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS = Object.freeze({ N01: 2, N02: 0 })

export function fullT3Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T3')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T3')
  if (cases.map(item => item.id).join(',') !== 'N01,N02' || !isDeepStrictEqual(cases, original))
    throw new Error('R31 full T3 membership or original per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 4 || result.helperStarts !== 2 || result.auditRequests !== 0)
    throw new Error('R31 fresh source or supervisor-helper allocation drift')
  return Object.freeze(result)
}

/**
 * actualR34 is the exact read-only predecessor verifier's result, not an authority token.
 * Required fields: status, casesCompleted, manifestFileSha256, cleanup, pending,
 * sourceCapacityReserved, actualSourceHostCount, and consumed (the complete journal-kind map).
 */
export function fullT3RecoveryBudget(previous, actualR34) {
  const kinds = [...Object.keys(ORIGINAL_POLICY.aggregate), 'outerCalls', 'auditRequests']
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R34_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 135 ||
    actualR34?.status !== 'T2_CASES_COMPLETED' ||
    actualR34.casesCompleted !== 24 ||
    actualR34.manifestFileSha256 !== R34_MANIFEST_FILE_SHA256 ||
    actualR34.cleanup !== 'ALL_24_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    !isDeepStrictEqual(actualR34.pending, []) ||
    actualR34.sourceCapacityReserved !== 58 ||
    actualR34.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(Object.keys(actualR34.consumed ?? {}).sort(), [...kinds].sort()) ||
    kinds.some(
      kind =>
        !Number.isSafeInteger(actualR34.consumed[kind]) ||
        actualR34.consumed[kind] < 0 ||
        !Number.isSafeInteger(previous.newT2Maximum?.[kind]) ||
        actualR34.consumed[kind] > previous.newT2Maximum[kind],
    )
  )
    throw new Error('R31 retained R34 allocation or accepted full T2 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT3Maximum()
  budget.historicalR34Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR34NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR34CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR34CompletedT2 = {
    ...structuredClone(actualR34.consumed),
    status: actualR34.status,
    casesCompleted: actualR34.casesCompleted,
    manifestFileSha256: actualR34.manifestFileSha256,
    sourceCapacity: actualR34.sourceCapacityReserved,
    cleanup: actualR34.cleanup,
    pending: [],
    actualSourceHostCount: 'UNATTESTED',
  }
  // R34's entire allocation remains retained; its observed consumption is never added a second time.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R34_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R31 fresh allocation kind missing')
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
  budget.r34ActualAddedAgainToRetainedAllocation = false
  budget.newT3AllocationConsumedByPreparation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
