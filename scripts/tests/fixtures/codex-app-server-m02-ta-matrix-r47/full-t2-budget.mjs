/** Fresh full T2 allocation; the entire historical R44 allocation remains retained without refunds. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'
import { R44_COUNTS } from './r44-evidence.mjs'
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

export function fullT2Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T2')
  if (POLICY.cases.length !== 24 || cases.length !== 24 || !isDeepStrictEqual(cases, original))
    throw new Error('R47 full T2 membership or per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (
    result.sourceCapacity !== 58 ||
    result.listenerStarts !== 24 ||
    result.controlWrites !== 96 ||
    result.codexStarts !== 24 ||
    result.mcpStarts !== 24 ||
    result.threadStarts !== 24 ||
    result.turnStarts !== 23 ||
    result.providerRequests !== 58 ||
    result.scopedCalls !== 34 ||
    result.workspaceActions !== 0 ||
    result.permissionReplies !== 1 ||
    result.outerCalls !== 35 ||
    result.canonicalRequests !== 184
  )
    throw new Error('R47 full T2 allocation drift')
  return Object.freeze(result)
}

export function fullT2RecoveryBudget(previous, actualR44) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R44_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 210 ||
    actualR44?.casesCompleted !== 4 ||
    actualR44.status !== 'UNKNOWN' ||
    actualR44.failedCase !== null ||
    actualR44.cleanup !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    actualR44.manifestFileSha256 !== R44_MANIFEST_FILE_SHA256 ||
    actualR44.sourceCapacityReserved !== 16 ||
    actualR44.actualSourceHostCount !== 'UNATTESTED' ||
    actualR44.fullT2Qualification !== false ||
    actualR44.waitLocation !== 'UNKNOWN' ||
    actualR44.globalCleanup !== 'UNKNOWN' ||
    actualR44.journalUnknownFenceObserved !== false ||
    actualR44.journalTerminalCheckpointObserved !== false ||
    !isDeepStrictEqual(
      actualR44.completedCases?.map(row => row.caseId),
      ['B01', 'B02', 'B03', 'B04'],
    ) ||
    actualR44.completedCases.some(row => row.outcome !== 'accepted' || row.cleanupKnown !== true) ||
    !isDeepStrictEqual(actualR44.pending, []) ||
    !isDeepStrictEqual(actualR44.consumed, R44_COUNTS)
  )
    throw new Error('R47 retained allocation or actual R44 evidence drift')
  const budget = structuredClone(previous)
  const fresh = fullT2Maximum()
  budget.historicalR44Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR44NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR44CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR44CompletedPrefix = {
    ...actualR44.consumed,
    sourceCapacity: actualR44.sourceCapacityReserved,
    status: 'UNKNOWN',
    casesCompleted: 4,
    completedCases: structuredClone(actualR44.completedCases),
    cleanup: actualR44.cleanup,
    failedCase: null,
    waitLocation: 'UNKNOWN',
    globalCleanup: 'UNKNOWN',
    journalUnknownFenceObserved: false,
    journalTerminalCheckpointObserved: false,
    fullT2Qualification: false,
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R44. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R44_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R47 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r44ActualAddedAgainToRetainedAllocation = false
  budget.r31UnrunT3SourceAddsAllocation = false
  budget.r39UnrunSourceAddsAllocation = false
  budget.r40UnrunSourceAddsAllocation = false
  budget.r42UnrunSourceAddsAllocation = false
  budget.r45UnrunSourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  budget.freshScope = 'ONE_FULL_24_T2_INVOCATION'
  budget.fullT2Qualification = false
  return budget
}
