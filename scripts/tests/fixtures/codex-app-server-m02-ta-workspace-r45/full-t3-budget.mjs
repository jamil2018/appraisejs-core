/** Pure T3 allocation arithmetic. Allocation and file evidence do not authorize a native invocation. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const R44_MANIFEST_FILE_SHA256 = '22095597b02883fb421f42d908a29cb54c49de5174d0857b6d91305dd4c856ff'
export const RETAINED_R44_CEILINGS = Object.freeze({
  codexStarts: 206,
  mcpStarts: 206,
  threadStarts: 206,
  turnStarts: 198,
  providerRequests: 493,
  scopedCalls: 280,
  workspaceActions: 2,
  permissionReplies: 10,
  listenerStarts: 209,
  controlWrites: 818,
  outerCalls: 296,
  canonicalRequests: 1526,
  sourceCapacity: 516,
})
export const DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS = Object.freeze({ N01: 2, N02: 0 })

export function fullT3Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T3')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T3')
  if (cases.map(item => item.id).join(',') !== 'N01,N02' || !isDeepStrictEqual(cases, original))
    throw new Error('R45 full T3 membership or original per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 4 || result.helperStarts !== 2 || result.auditRequests !== 0)
    throw new Error('R45 fresh source or supervisor-helper allocation drift')
  return Object.freeze(result)
}

/**
 * actualR44 is the exact read-only predecessor verifier's result, not an authority token.
 * Required fields: status, casesCompleted, manifestFileSha256, cleanup, pending,
 * sourceCapacityReserved, actualSourceHostCount, and consumed (the complete journal-kind map).
 */
export function fullT3RecoveryBudget(previous, actualR44) {
  const kinds = [...Object.keys(ORIGINAL_POLICY.aggregate), 'outerCalls', 'auditRequests']
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R44_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 210 ||
    actualR44?.status !== 'T2_CASES_COMPLETED_NOT_CONTAINMENT' ||
    actualR44.casesCompleted !== 24 ||
    actualR44.manifestFileSha256 !== R44_MANIFEST_FILE_SHA256 ||
    actualR44.cleanup !== 'ALL24_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    !isDeepStrictEqual(actualR44.pending, []) ||
    actualR44.sourceCapacityReserved !== 58 ||
    actualR44.actualSourceHostCount !== 'UNATTESTED' ||
    actualR44.fullT2Qualification !== true ||
    actualR44.runtimeQualified !== false ||
    !isDeepStrictEqual(Object.keys(actualR44.consumed ?? {}).sort(), [...kinds].sort()) ||
    kinds.some(
      kind =>
        !Number.isSafeInteger(actualR44.consumed[kind]) ||
        actualR44.consumed[kind] < 0 ||
        !Number.isSafeInteger(previous.newT2Maximum?.[kind]) ||
        actualR44.consumed[kind] > previous.newT2Maximum[kind],
    )
  )
    throw new Error('R45 retained R44 allocation or accepted full T2 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT3Maximum()
  budget.historicalR44Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR44NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR44CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR44CompletedT2 = {
    ...structuredClone(actualR44.consumed),
    status: actualR44.status,
    casesCompleted: actualR44.casesCompleted,
    manifestFileSha256: actualR44.manifestFileSha256,
    sourceCapacity: actualR44.sourceCapacityReserved,
    cleanup: actualR44.cleanup,
    pending: [],
    actualSourceHostCount: 'UNATTESTED',
  }
  // R44's entire allocation remains retained; its observed consumption is never added a second time.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R44_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R45 fresh allocation kind missing')
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
  budget.r44ActualAddedAgainToRetainedAllocation = false
  budget.newT3AllocationConsumedByPreparation = false
  budget.r39UnrunSourceAddsAllocation = false
  budget.r40UnrunSourceAddsAllocation = false
  budget.r42UnrunSourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
