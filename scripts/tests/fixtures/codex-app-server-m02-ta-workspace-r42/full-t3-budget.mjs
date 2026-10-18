/** Pure T3 allocation arithmetic. Allocation and file evidence do not authorize a native invocation. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const R41_MANIFEST_FILE_SHA256 = 'a70fba8c2eb3ed3dd06cf735f9433c1368075d6aee65b3ca4a8aef6162abe1b2'
export const RETAINED_R41_CEILINGS = Object.freeze({
  codexStarts: 181,
  mcpStarts: 181,
  threadStarts: 181,
  turnStarts: 174,
  providerRequests: 433,
  scopedCalls: 245,
  workspaceActions: 2,
  permissionReplies: 9,
  listenerStarts: 184,
  controlWrites: 718,
  outerCalls: 260,
  canonicalRequests: 1336,
  sourceCapacity: 456,
})
export const DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS = Object.freeze({ N01: 2, N02: 0 })

export function fullT3Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T3')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T3')
  if (cases.map(item => item.id).join(',') !== 'N01,N02' || !isDeepStrictEqual(cases, original))
    throw new Error('R42 full T3 membership or original per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 4 || result.helperStarts !== 2 || result.auditRequests !== 0)
    throw new Error('R42 fresh source or supervisor-helper allocation drift')
  return Object.freeze(result)
}

/**
 * actualR41 is the exact read-only predecessor verifier's result, not an authority token.
 * Required fields: status, casesCompleted, manifestFileSha256, cleanup, pending,
 * sourceCapacityReserved, actualSourceHostCount, and consumed (the complete journal-kind map).
 */
export function fullT3RecoveryBudget(previous, actualR41) {
  const kinds = [...Object.keys(ORIGINAL_POLICY.aggregate), 'outerCalls', 'auditRequests']
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R41_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 185 ||
    actualR41?.status !== 'T2_CASES_COMPLETED_NOT_CONTAINMENT' ||
    actualR41.casesCompleted !== 24 ||
    actualR41.manifestFileSha256 !== R41_MANIFEST_FILE_SHA256 ||
    actualR41.cleanup !== 'ALL24_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    !isDeepStrictEqual(actualR41.pending, []) ||
    actualR41.sourceCapacityReserved !== 58 ||
    actualR41.actualSourceHostCount !== 'UNATTESTED' ||
    !isDeepStrictEqual(Object.keys(actualR41.consumed ?? {}).sort(), [...kinds].sort()) ||
    kinds.some(
      kind =>
        !Number.isSafeInteger(actualR41.consumed[kind]) ||
        actualR41.consumed[kind] < 0 ||
        !Number.isSafeInteger(previous.newT2Maximum?.[kind]) ||
        actualR41.consumed[kind] > previous.newT2Maximum[kind],
    )
  )
    throw new Error('R42 retained R41 allocation or accepted full T2 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT3Maximum()
  budget.historicalR41Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR41NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR41CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR41CompletedT2 = {
    ...structuredClone(actualR41.consumed),
    status: actualR41.status,
    casesCompleted: actualR41.casesCompleted,
    manifestFileSha256: actualR41.manifestFileSha256,
    sourceCapacity: actualR41.sourceCapacityReserved,
    cleanup: actualR41.cleanup,
    pending: [],
    actualSourceHostCount: 'UNATTESTED',
  }
  // R41's entire allocation remains retained; its observed consumption is never added a second time.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R41_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R42 fresh allocation kind missing')
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
  budget.r41ActualAddedAgainToRetainedAllocation = false
  budget.newT3AllocationConsumedByPreparation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
