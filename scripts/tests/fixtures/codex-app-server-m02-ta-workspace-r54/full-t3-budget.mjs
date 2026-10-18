/** Pure T3 allocation arithmetic. Allocation and file evidence do not authorize a native invocation. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const R52_MANIFEST_FILE_SHA256 = '9b55167bce231e3d226043ec2127033cf51e9d71bde4c5b8bb291962841aa128'
export const RETAINED_R52_CEILINGS = Object.freeze({
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
})
export const DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS = Object.freeze({ N01: 2, N02: 0 })

export function fullT3Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T3')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T3')
  if (cases.map(item => item.id).join(',') !== 'N01,N02' || !isDeepStrictEqual(cases, original))
    throw new Error('R54 full T3 membership or original per-case limits drift')
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
    throw new Error('R54 fresh source or supervisor-helper allocation drift')
  return Object.freeze(result)
}

/** Retain every R52 reservation, including unobserved capacity; actual consumption earns no refunds. */
export function fullT3RecoveryBudget(previous, actualR52) {
  const kinds = [...Object.keys(ORIGINAL_POLICY.aggregate), 'outerCalls', 'auditRequests']
  const pending = [
    { id: 'N01-workspace-action', kind: 'workspaceActions' },
    { id: 'N01-listener-request-2', kind: 'providerRequests' },
  ]
  const expectedConsumed = {
    threadStarts: 1,
    turnStarts: 1,
    providerRequests: 2,
    scopedCalls: 0,
    workspaceActions: 1,
    permissionReplies: 0,
    codexStarts: 1,
    mcpStarts: 1,
    listenerStarts: 1,
    controlWrites: 3,
    canonicalRequests: 2,
    helperStarts: 0,
    outerCalls: 1,
    auditRequests: 0,
  }
  const fresh = fullT3Maximum()
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R52_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 260 ||
    !isDeepStrictEqual(previous.newT3Maximum, fresh) ||
    previous.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' ||
    Object.hasOwn(previous.cumulativeWholeCampaignCeilings, 'helperStarts') ||
    Object.hasOwn(previous.cumulativeWholeCampaignCeilings, 'auditRequests') ||
    actualR52?.status !== 'UNKNOWN' ||
    actualR52.casesCompleted !== 0 ||
    actualR52.failedCase !== 'N01' ||
    actualR52.waitLocation !== 'WAIT_TERMINAL' ||
    actualR52.manifestFileSha256 !== R52_MANIFEST_FILE_SHA256 ||
    actualR52.cleanup !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    actualR52.failedCaseCleanup !== 'UNKNOWN' ||
    actualR52.globalCleanup !== 'UNKNOWN' ||
    !isDeepStrictEqual(actualR52.pending, pending) ||
    actualR52.sourceCapacityReserved !== 2 ||
    actualR52.actualSourceHostCount !== 'UNATTESTED' ||
    actualR52.runtimeQualified !== false ||
    actualR52.fullT3Qualification !== false ||
    actualR52.journalRecords !== 31 ||
    actualR52.reservations !== 14 ||
    actualR52.acknowledgements !== 12 ||
    actualR52.journalUnknownFenceObserved !== true ||
    actualR52.journalTerminalCheckpointObserved !== false ||
    actualR52.journalUnknownReason !== 'AMBIGUOUS_EFFECT' ||
    actualR52.failedAnchorField !== 'UNKNOWN' ||
    !isDeepStrictEqual(Object.keys(actualR52.consumed ?? {}).sort(), [...kinds].sort()) ||
    !isDeepStrictEqual(actualR52.consumed, expectedConsumed) ||
    kinds.some(kind => !Number.isSafeInteger(fresh[kind]) || actualR52.consumed[kind] > fresh[kind])
  )
    throw new Error('R54 retained R52 allocation or consumed UNKNOWN evidence drift')
  const budget = structuredClone(previous)
  budget.historicalR52Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR52NewT3Maximum = structuredClone(previous.newT3Maximum)
  budget.historicalR52NewT3Consumed = structuredClone(previous.newT3Consumed)
  budget.historicalR52CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR52Unknown = {
    ...structuredClone(actualR52.consumed),
    status: actualR52.status,
    casesCompleted: 0,
    completedCases: [],
    failedCase: 'N01',
    waitLocation: 'WAIT_TERMINAL',
    manifestFileSha256: R52_MANIFEST_FILE_SHA256,
    sourceCapacity: 2,
    cleanup: actualR52.cleanup,
    failedCaseCleanup: 'UNKNOWN',
    globalCleanup: 'UNKNOWN',
    pending: structuredClone(pending),
    journalRecords: 31,
    reservations: 14,
    acknowledgements: 12,
    journalUnknownFenceObserved: true,
    journalUnknownReason: 'AMBIGUOUS_EFFECT',
    journalTerminalCheckpointObserved: false,
    ownedStopIntentObserved: true,
    ownedStopObserved: true,
    ownedStopEstablishesCleanup: false,
    failedAnchorField: 'UNKNOWN',
    actualSourceHostCount: 'UNATTESTED',
    fullT3Qualification: false,
  }
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R52_CEILINGS).map(([kind, count]) => [kind, count + fresh[kind]]),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 = 262
  if (
    !isDeepStrictEqual(budget.cumulativeWholeCampaignCeilings, {
      codexStarts: 258,
      mcpStarts: 258,
      threadStarts: 258,
      turnStarts: 248,
      providerRequests: 617,
      scopedCalls: 348,
      workspaceActions: 6,
      permissionReplies: 12,
      listenerStarts: 261,
      controlWrites: 1026,
      outerCalls: 370,
      canonicalRequests: 1902,
      sourceCapacity: 640,
    })
  )
    throw new Error('R54 cumulative T3 ceilings drift')
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
  budget.r52ActualAddedAgainToRetainedAllocation = false
  budget.r53DiagnosticOnlyAddsNativeAllocation = false
  budget.newT3AllocationConsumedByPreparation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
