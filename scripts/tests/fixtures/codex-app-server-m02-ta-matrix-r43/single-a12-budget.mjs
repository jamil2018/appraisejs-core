/** One fresh A12 diagnostic allocation; the entire historical R41 allocation remains retained without refunds. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'
import { R41_COUNTS } from './r41-evidence.mjs'
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

export function singleA12Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T2')
  const original = ORIGINAL_POLICY.cases.find(item => item.id === 'B07-A12')
  if (
    POLICY.cases.length !== 1 ||
    cases.length !== 1 ||
    cases[0].id !== 'B07-A12' ||
    !isDeepStrictEqual(cases[0], original)
  )
    throw new Error('R43 single A12 membership or original per-case limits drift')
  const result = { cases: cases.length }
  for (const item of cases) {
    for (const [kind, count] of Object.entries(item.limits)) result[kind] = (result[kind] ?? 0) + count
    result.outerCalls = (result.outerCalls ?? 0) + outerMaximum(item)
    result.auditRequests = (result.auditRequests ?? 0) + auditRequestMaximum(item)
    result.sourceCapacity = (result.sourceCapacity ?? 0) + conservativeHostBudget(item.id).sourceMaximum
  }
  if (result.sourceCapacity !== 2) throw new Error('R43 A12 source allocation drift')
  return Object.freeze(result)
}

export function singleA12RecoveryBudget(previous, actualR41) {
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R41_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 185 ||
    actualR41?.casesCompleted !== 17 ||
    actualR41.status !== 'UNKNOWN' ||
    actualR41.failedCase !== 'B07-A12' ||
    actualR41.cleanup !== 'UNKNOWN' ||
    actualR41.failedCaseCleanup !== 'UNKNOWN' ||
    actualR41.failureStage !== 'GIT_READINESS' ||
    actualR41.failureReason !== 'GIT_READINESS_UNREVIEWED_CHILD_PATH' ||
    actualR41.manifestFileSha256 !== R41_MANIFEST_FILE_SHA256 ||
    actualR41.sourceCapacityReserved !== 48 ||
    actualR41.actualSourceHostCount !== 'UNATTESTED' ||
    actualR41.actualUnreviewedChildPath !== 'UNKNOWN' ||
    actualR41.childPaths?.overflow !== true ||
    actualR41.fullT2Qualification !== false ||
    !isDeepStrictEqual(actualR41.pending, []) ||
    !isDeepStrictEqual(actualR41.consumed, R41_COUNTS)
  )
    throw new Error('R43 retained allocation or actual R41 evidence drift')
  const budget = structuredClone(previous)
  const fresh = singleA12Maximum()
  budget.historicalR41Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR41NewT2Maximum = structuredClone(previous.newT2Maximum)
  budget.historicalR41CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR41Unknown = {
    ...actualR41.consumed,
    sourceCapacity: actualR41.sourceCapacityReserved,
    casesCompleted: 17,
    cleanup: actualR41.cleanup,
    failedCase: 'B07-A12',
    failedCaseCleanup: 'UNKNOWN',
    failureStage: actualR41.failureStage,
    failureReason: actualR41.failureReason,
    actualUnreviewedChildPath: 'UNKNOWN',
    childPathDiagnosticOverflow: true,
    fullT2Qualification: false,
    actualSourceHostCount: 'UNATTESTED',
  }
  // The historical allocation already covers R41. Its actual delta is retained separately, never added twice.
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R41_CEILINGS).map(([kind, count]) => {
      if (!Number.isSafeInteger(fresh[kind]) || fresh[kind] < 0) throw new Error('R43 fresh allocation kind missing')
      return [kind, count + fresh[kind]]
    }),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 =
    previous.combinedListenerAllocationCeilingIncludingR16 + fresh.listenerStarts
  budget.newT2Maximum = { ...fresh }
  budget.historicalAllocationsRefunded = false
  budget.r41ActualAddedAgainToRetainedAllocation = false
  budget.r31UnrunT3SourceAddsAllocation = false
  budget.r39UnrunSourceAddsAllocation = false
  budget.r40UnrunSourceAddsAllocation = false
  budget.r42UnrunSourceAddsAllocation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  budget.freshScope = 'ONE_A12_DIAGNOSTIC_PROBE_ONLY'
  budget.successfulProbeCannotQualifyFullT2OrMergePrefixes = true
  budget.fullT2Qualification = false
  return budget
}
