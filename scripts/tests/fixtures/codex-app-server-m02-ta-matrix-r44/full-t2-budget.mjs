/** Fresh full T2 allocation; the entire historical R43 allocation remains retained without refunds. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'
import { R43_COUNTS } from './r43-evidence.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const R43_MANIFEST_FILE_SHA256 = 'c8ae4b630f1119e1e15ed1b0111391e936a07645d62d63c867328bf26cebe2dc'
export const RETAINED_R43_CEILINGS = Object.freeze({
  codexStarts: 182,
  mcpStarts: 182,
  threadStarts: 182,
  turnStarts: 175,
  providerRequests: 435,
  scopedCalls: 246,
  workspaceActions: 2,
  permissionReplies: 9,
  listenerStarts: 185,
  controlWrites: 722,
  outerCalls: 261,
  canonicalRequests: 1342,
  sourceCapacity: 458,
})

export function fullT2Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T2')
  if (POLICY.cases.length !== 24 || cases.length !== 24 || !isDeepStrictEqual(cases, original))
    throw new Error('R44 full T2 membership or per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 58) throw new Error('R44 full T2 source allocation drift')
  return Object.freeze(result)
}

export function fullT2RecoveryBudget(previous, actualR43) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R43_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 186 ||
    actualR43?.casesCompleted !== 1 ||
    actualR43.status !== 'A12_DIAGNOSTIC_CASE_COMPLETED_NOT_FULL_T2' ||
    actualR43.failedCase !== null ||
    actualR43.cleanup !== 'A12_BOUNDED_CASE_CLEANUP_ONLY_GLOBAL_INVENTORY_UNATTESTED' ||
    actualR43.manifestFileSha256 !== R43_MANIFEST_FILE_SHA256 ||
    actualR43.sourceCapacityReserved !== 2 ||
    actualR43.actualSourceHostCount !== 'UNATTESTED' ||
    actualR43.fullT2Qualification !== false ||
    actualR43.firstUnreviewedPath !== null ||
    actualR43.nativeContinuationStatus !== 'NO_MCP_DISPATCH' ||
    actualR43.r41HistoricalCause !== 'UNKNOWN' ||
    !isDeepStrictEqual(actualR43.pending, []) ||
    !isDeepStrictEqual(actualR43.consumed, R43_COUNTS)
  )
    throw new Error('R44 retained allocation or actual R43 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT2Maximum()
  budget.historicalR43Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR43NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR43CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR43CompletedA12 = {
    ...actualR43.consumed,
    sourceCapacity: actualR43.sourceCapacityReserved,
    casesCompleted: 1,
    cleanup: actualR43.cleanup,
    failedCase: null,
    firstUnreviewedPath: null,
    nativeContinuationStatus: 'NO_MCP_DISPATCH',
    r41HistoricalCause: 'UNKNOWN',
    fullT2Qualification: false,
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R43. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R43_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R44 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r43ActualAddedAgainToRetainedAllocation = false
  budget.r31UnrunT3SourceAddsAllocation = false
  budget.r39UnrunSourceAddsAllocation = false
  budget.r40UnrunSourceAddsAllocation = false
  budget.r42UnrunSourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  budget.freshScope = 'ONE_FULL_24_T2_INVOCATION'
  budget.fullT2Qualification = false
  return budget
}
