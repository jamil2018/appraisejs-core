/** Pure T3 allocation arithmetic. Allocation and file evidence do not authorize a native invocation. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const R51_MANIFEST_FILE_SHA256 = '07fa661fa5c229772be13c1b870641064cf13143ed7ca9e9cc5ed8e6118ae2e2'
export const RETAINED_R51_CEILINGS = Object.freeze({
  codexStarts: 254,
  mcpStarts: 254,
  threadStarts: 254,
  turnStarts: 244,
  providerRequests: 609,
  scopedCalls: 348,
  workspaceActions: 2,
  permissionReplies: 12,
  listenerStarts: 257,
  controlWrites: 1010,
  outerCalls: 366,
  canonicalRequests: 1894,
  sourceCapacity: 632,
})
export const DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS = Object.freeze({ N01: 2, N02: 0 })

export function fullT3Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T3')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T3')
  if (cases.map(item => item.id).join(',') !== 'N01,N02' || !isDeepStrictEqual(cases, original))
    throw new Error('R52 full T3 membership or original per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (
    result.sourceCapacity !== 4 ||
    result.helperStarts !== 2 ||
    result.auditRequests !== 0 ||
    result.listenerStarts !== 2 ||
    result.codexStarts !== 2 ||
    result.mcpStarts !== 2 ||
    result.threadStarts !== 2 ||
    result.turnStarts !== 2 ||
    result.providerRequests !== 4 ||
    result.workspaceActions !== 2 ||
    result.controlWrites !== 8 ||
    result.canonicalRequests !== 4 ||
    result.outerCalls !== 2 ||
    result.scopedCalls !== 0 ||
    result.permissionReplies !== 0
  )
    throw new Error('R52 fresh source or supervisor-helper allocation drift')
  return Object.freeze(result)
}

/**
 * actualR51 is the exact read-only predecessor verifier's result, not an authority token.
 * Required fields: status, casesCompleted, manifestFileSha256, cleanup, pending,
 * sourceCapacityReserved, actualSourceHostCount, and consumed (the complete journal-kind map).
 */
export function fullT3RecoveryBudget(previous, actualR51) {
  const kinds = [...Object.keys(ORIGINAL_POLICY.aggregate), 'outerCalls', 'auditRequests']
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R51_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 258 ||
    actualR51?.status !== 'T2_CASES_COMPLETED_NOT_CONTAINMENT' ||
    actualR51.casesCompleted !== 24 ||
    actualR51.manifestFileSha256 !== R51_MANIFEST_FILE_SHA256 ||
    actualR51.cleanup !== 'ALL24_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    !isDeepStrictEqual(actualR51.pending, []) ||
    actualR51.sourceCapacityReserved !== 58 ||
    actualR51.actualSourceHostCount !== 'UNATTESTED' ||
    actualR51.fullT2Qualification !== true ||
    actualR51.runtimeQualified !== false ||
    !isDeepStrictEqual(Object.keys(actualR51.consumed ?? {}).sort(), [...kinds].sort()) ||
    kinds.some(
      kind =>
        !Number.isSafeInteger(actualR51.consumed[kind]) ||
        actualR51.consumed[kind] < 0 ||
        !Number.isSafeInteger(previous.newT2Maximum?.[kind]) ||
        actualR51.consumed[kind] > previous.newT2Maximum[kind],
    )
  )
    throw new Error('R52 retained R51 allocation or accepted full T2 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT3Maximum()
  budget.historicalR51Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR51NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR51CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR51CompletedT2 = {
    ...structuredClone(actualR51.consumed),
    status: actualR51.status,
    casesCompleted: actualR51.casesCompleted,
    manifestFileSha256: actualR51.manifestFileSha256,
    sourceCapacity: actualR51.sourceCapacityReserved,
    cleanup: actualR51.cleanup,
    pending: [],
    actualSourceHostCount: 'UNATTESTED',
  }
  // R51's entire allocation remains retained; its observed consumption is never added a second time.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R51_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R52 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  if (
    !isDeepStrictEqual(budget.cumulativeWholeCampaignCeilings, {
      codexStarts: 256,
      mcpStarts: 256,
      threadStarts: 256,
      turnStarts: 246,
      providerRequests: 613,
      scopedCalls: 348,
      workspaceActions: 4,
      permissionReplies: 12,
      listenerStarts: 259,
      controlWrites: 1018,
      outerCalls: 368,
      canonicalRequests: 1898,
      sourceCapacity: 636,
    }) ||
    budget.combinedListenerAllocationCeilingIncludingR16 !== 260
  )
    throw new Error('R52 cumulative T3 ceilings drift')
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
  budget.r51ActualAddedAgainToRetainedAllocation = false
  budget.newT3AllocationConsumedByPreparation = false
  budget.r39UnrunSourceAddsAllocation = false
  budget.r40UnrunSourceAddsAllocation = false
  budget.r42UnrunSourceAddsAllocation = false
  budget.r45UnrunSourceAddsAllocation = false
  budget.r47UnrunSourceAddsAllocation = false
  budget.r49UnrunSourceAddsAllocation = false
  budget.r50UnrunSourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
