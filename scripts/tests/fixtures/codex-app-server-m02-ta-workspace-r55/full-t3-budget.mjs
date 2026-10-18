/** Pure T3 allocation arithmetic. Allocation and file evidence do not authorize a native invocation. */
import { isDeepStrictEqual } from 'node:util'
import { POLICY } from './policy.mjs'
import { POLICY as ORIGINAL_POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { outerMaximum, auditRequestMaximum } from '../codex-app-server-m02-ta-phase-r10/phase-outer-policy.mjs'
import { conservativeHostBudget } from '../codex-app-server-m02-ta-phase-r10/phase-journal.mjs'

export const R54_MANIFEST_FILE_SHA256 = 'e84c727ad2396ca676fbda13c2698403c962c08dbbe80eca1347ece2f025cd8b'
export const RETAINED_R54_CEILINGS = Object.freeze({
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
export const DEDICATED_TOOL_HELPER_SOURCE_EXPECTATIONS = Object.freeze({ N01: 2, N02: 0 })

export function fullT3Maximum() {
  const cases = POLICY.cases.filter(item => item.phase === 'T3')
  const original = ORIGINAL_POLICY.cases.filter(item => item.phase === 'T3')
  if (cases.map(item => item.id).join(',') !== 'N01,N02' || !isDeepStrictEqual(cases, original))
    throw new Error('R55 full T3 membership or original per-case limits drift')
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
    throw new Error('R55 fresh source or supervisor-helper allocation drift')
  return Object.freeze(result)
}

/** Retain every R54 reservation, including unobserved capacity; actual consumption earns no refunds. */
export function fullT3RecoveryBudget(previous, actualR54) {
  const kinds = [...Object.keys(ORIGINAL_POLICY.aggregate), 'outerCalls', 'auditRequests']
  const pending = [{ id: 'N02-workspace-action', kind: 'workspaceActions' }]
  const expectedConsumed = {
    threadStarts: 2,
    turnStarts: 2,
    providerRequests: 3,
    scopedCalls: 0,
    workspaceActions: 2,
    permissionReplies: 0,
    codexStarts: 2,
    mcpStarts: 2,
    listenerStarts: 2,
    controlWrites: 6,
    canonicalRequests: 4,
    helperStarts: 0,
    outerCalls: 2,
    auditRequests: 0,
  }
  const fresh = fullT3Maximum()
  if (
    !isDeepStrictEqual(previous?.cumulativeWholeCampaignCeilings, RETAINED_R54_CEILINGS) ||
    previous.combinedListenerAllocationCeilingIncludingR16 !== 262 ||
    !isDeepStrictEqual(previous.newT3Maximum, fresh) ||
    previous.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' ||
    Object.hasOwn(previous.cumulativeWholeCampaignCeilings, 'helperStarts') ||
    Object.hasOwn(previous.cumulativeWholeCampaignCeilings, 'auditRequests') ||
    actualR54?.status !== 'UNKNOWN' ||
    actualR54.casesCompleted !== 1 ||
    actualR54.failedCase !== 'N02' ||
    actualR54.waitLocation !== 'WAIT_TERMINAL' ||
    actualR54.manifestFileSha256 !== R54_MANIFEST_FILE_SHA256 ||
    actualR54.cleanup !== 'COMPLETED_CASES_BOUNDED_ONLY_FAILED_OR_GLOBAL_CLEANUP_UNKNOWN' ||
    actualR54.failedCaseCleanup !== 'UNKNOWN' ||
    actualR54.globalCleanup !== 'UNKNOWN' ||
    !isDeepStrictEqual(actualR54.pending, pending) ||
    actualR54.sourceCapacityReserved !== 4 ||
    actualR54.actualSourceHostCount !== 'UNATTESTED' ||
    actualR54.runtimeQualified !== false ||
    actualR54.fullT3Qualification !== false ||
    actualR54.journalRecords !== 60 ||
    actualR54.reservations !== 27 ||
    actualR54.acknowledgements !== 26 ||
    actualR54.journalUnknownFenceObserved !== true ||
    actualR54.journalTerminalCheckpointObserved !== false ||
    actualR54.journalUnknownReason !== 'AMBIGUOUS_EFFECT' ||
    actualR54.completedCases?.length !== 1 ||
    actualR54.completedCases[0].caseId !== 'N01' ||
    actualR54.completedCases[0].caseWitnessSha256 !==
      '588bf78418c92755aefa1e831dc574d9a85d81f5db5083dab74daba846ddbaba' ||
    actualR54.completedCases[0].cleanupKnown !== true ||
    actualR54.protocolFailure?.category !== 'UNKNOWN_REQUEST_OR_NOTIFICATION' ||
    actualR54.protocolFailure.phase !== 'turn' ||
    actualR54.protocolFailure.methodSha256 !== '411738230c49e374897ac082e0534e5567d5c5a6fc28521010c56f4f94ac4e47' ||
    actualR54.protocolFailure.paramsBody !== 'UNKNOWN' ||
    !isDeepStrictEqual(Object.keys(actualR54.consumed ?? {}).sort(), [...kinds].sort()) ||
    !isDeepStrictEqual(actualR54.consumed, expectedConsumed) ||
    kinds.some(kind => !Number.isSafeInteger(fresh[kind]) || actualR54.consumed[kind] > fresh[kind])
  )
    throw new Error('R55 retained R54 allocation or consumed UNKNOWN evidence drift')
  const budget = structuredClone(previous)
  budget.historicalR54Ceilings = structuredClone(previous.cumulativeWholeCampaignCeilings)
  budget.historicalR54NewT3Maximum = structuredClone(previous.newT3Maximum)
  budget.historicalR54NewT3Consumed = structuredClone(previous.newT3Consumed)
  budget.historicalR54CombinedListenerCeilingIncludingR16 = previous.combinedListenerAllocationCeilingIncludingR16
  budget.priorR54Unknown = {
    ...structuredClone(actualR54.consumed),
    status: actualR54.status,
    casesCompleted: 1,
    completedCases: structuredClone(actualR54.completedCases),
    failedCase: 'N02',
    waitLocation: 'WAIT_TERMINAL',
    manifestFileSha256: R54_MANIFEST_FILE_SHA256,
    sourceCapacity: 4,
    cleanup: actualR54.cleanup,
    failedCaseCleanup: 'UNKNOWN',
    globalCleanup: 'UNKNOWN',
    pending: structuredClone(pending),
    journalRecords: 60,
    reservations: 27,
    acknowledgements: 26,
    journalUnknownFenceObserved: true,
    journalUnknownReason: 'AMBIGUOUS_EFFECT',
    journalTerminalCheckpointObserved: false,
    ownedStopIntentObserved: true,
    ownedStopObserved: true,
    ownedStopEstablishesCleanup: false,
    protocolFailure: structuredClone(actualR54.protocolFailure),
    completedCaseCleanup: actualR54.completedCaseCleanup,
    actualSourceHostCount: 'UNATTESTED',
    fullT3Qualification: false,
  }
  budget.cumulativeWholeCampaignCeilings = Object.fromEntries(
    Object.entries(RETAINED_R54_CEILINGS).map(([kind, count]) => [kind, count + fresh[kind]]),
  )
  budget.combinedListenerAllocationCeilingIncludingR16 = 264
  if (
    !isDeepStrictEqual(budget.cumulativeWholeCampaignCeilings, {
      codexStarts: 260,
      mcpStarts: 260,
      threadStarts: 260,
      turnStarts: 250,
      providerRequests: 621,
      scopedCalls: 348,
      workspaceActions: 8,
      permissionReplies: 12,
      listenerStarts: 263,
      controlWrites: 1034,
      outerCalls: 372,
      canonicalRequests: 1906,
      sourceCapacity: 644,
    })
  )
    throw new Error('R55 cumulative T3 ceilings drift')
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
  budget.r54ActualAddedAgainToRetainedAllocation = false
  budget.r55PreparationAddsNativeAllocation = false
  budget.newT3AllocationConsumedByPreparation = false
  budget.actualNativeProcessCountAttested = false
  budget.newInvocationRequiresSeparateExplicitUserDecision = false
  budget.newInvocationRequiresExactReviewAndBoundContinuingAuthority = true
  return budget
}
