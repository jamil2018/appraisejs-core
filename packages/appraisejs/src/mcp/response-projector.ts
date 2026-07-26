import { z } from 'zod'

export const responseModeSchema = z
  .enum(['summary', 'evidenceOnly', 'blockersOnly', 'linksOnly', 'full'])
  .default('summary')

export const MCP_RESPONSE_TOKEN_BUDGETS = {
  diagnostic: 1000,
  planCreation: 2000,
  unchangedWait: 300,
  validationMutation: 1500,
  baselineMutation: 1500,
} as const

export function measureMcpResponse(value: unknown) {
  const json = JSON.stringify(value)
  const repeatedKeys = [...json.matchAll(/"([^"\\]+)":/g)].map(match => match[1])
  const uniqueKeys = new Set(repeatedKeys)
  return {
    bytes: Buffer.byteLength(json, 'utf8'),
    estimatedTokens: Math.ceil(Buffer.byteLength(json, 'utf8') / 4),
    duplicationRatio: repeatedKeys.length === 0 ? 0 : (repeatedKeys.length - uniqueKeys.size) / repeatedKeys.length,
  }
}

export function applyResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  if (responseMode === 'full' || !value || typeof value !== 'object' || Array.isArray(value)) return value
  const payload = value as Record<string, unknown>
  if (responseMode === 'linksOnly') {
    return {
      testRunPageId: payload.testRunPageId,
      executionRunId: payload.executionRunId,
      planId: payload.planId,
      validationId: payload.validationId,
      reportUrl: payload.reportUrl,
      logsUrl: payload.logsUrl,
      nextAllowedAction: payload.nextAllowedAction,
    }
  }
  if (responseMode === 'blockersOnly') {
    return {
      executionRunId: payload.executionRunId,
      evidenceHealth: payload.evidenceHealth,
      blockers: payload.blockers,
      failureSignatures: payload.failureSignatures,
      missingArtifacts: payload.missingArtifacts,
      nextAllowedAction: payload.nextAllowedAction,
    }
  }
  if (responseMode === 'evidenceOnly') {
    return {
      testRunPageId: payload.testRunPageId,
      executionRunId: payload.executionRunId,
      evidenceHealth: payload.evidenceHealth,
      grade: payload.grade,
      counts: payload.counts,
      blockers: payload.blockers,
      failureSignatures: payload.failureSignatures,
      missingArtifacts: payload.missingArtifacts,
      reportUrl: payload.reportUrl,
      logsUrl: payload.logsUrl,
      nextAllowedAction: payload.nextAllowedAction,
    }
  }
  return {
    testRunPageId: payload.testRunPageId,
    executionRunId: payload.executionRunId,
    planId: payload.planId,
    validationId: payload.validationId,
    evidenceHealth: payload.evidenceHealth,
    grade: payload.grade,
    blockers: payload.blockers,
    failureSignatures: payload.failureSignatures,
    reportUrl: payload.reportUrl,
    logsUrl: payload.logsUrl,
    nextAllowedAction: payload.nextAllowedAction,
  }
}

export function applyLifecycleResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  if (responseMode === 'full' || !value || typeof value !== 'object' || Array.isArray(value)) return value
  const payload = value as Record<string, unknown>
  const plan = payload.plan && typeof payload.plan === 'object' ? (payload.plan as Record<string, unknown>) : undefined
  const validation =
    payload.validation && typeof payload.validation === 'object'
      ? (payload.validation as Record<string, unknown>)
      : undefined
  const baselineExecution =
    payload.baselineExecution && typeof payload.baselineExecution === 'object'
      ? (payload.baselineExecution as Record<string, unknown>)
      : undefined
  const activeBaselineAttempts = Array.isArray(baselineExecution?.attempts) ? baselineExecution.attempts : undefined
  const allBaselineAttempts =
    activeBaselineAttempts ?? (Array.isArray(validation?.baselineAttempts) ? validation.baselineAttempts : undefined)
  const allTestRunIds =
    allBaselineAttempts
      ?.map(attempt =>
        attempt && typeof attempt === 'object' ? (attempt as Record<string, unknown>).testRunId : undefined,
      )
      .filter((testRunId): testRunId is string => typeof testRunId === 'string') ?? payload.testRunIds
  const allAttemptIds =
    allBaselineAttempts
      ?.map(attempt => {
        if (!attempt || typeof attempt !== 'object') return undefined
        const item = attempt as Record<string, unknown>
        return item.attemptId ?? item.id
      })
      .filter((attemptId): attemptId is string => typeof attemptId === 'string') ?? undefined
  const implementation =
    payload.implementation && typeof payload.implementation === 'object'
      ? (payload.implementation as Record<string, unknown>)
      : validation?.implementation && typeof validation.implementation === 'object'
        ? (validation.implementation as Record<string, unknown>)
        : payload.taskStates && typeof payload.taskStates === 'object'
          ? payload
          : undefined
  const readiness =
    payload.readiness && typeof payload.readiness === 'object'
      ? (payload.readiness as Record<string, unknown>)
      : undefined
  const rawRuns = Array.isArray(payload.runs)
    ? payload.runs
    : Array.isArray(payload.validationRuns)
      ? payload.validationRuns
      : undefined
  const runs = rawRuns
    ? rawRuns.map(run => {
        const item = run as Record<string, unknown>
        return {
          id: item.id,
          validationId: item.validationId,
          testRunId: item.testRunId,
          status: item.status,
          fresh: item.fresh,
          assurance: item.assurance,
        }
      })
    : undefined
  const taskStates =
    implementation?.taskStates && typeof implementation.taskStates === 'object'
      ? (implementation.taskStates as Record<string, unknown>)
      : undefined
  const baselineAttempts = implementation ? undefined : allBaselineAttempts
  const testRunIds = implementation ? payload.testRunIds : allTestRunIds
  const attemptIds = implementation ? undefined : allAttemptIds
  const completionTasks = Array.isArray(payload.tasks)
    ? payload.tasks.filter(task => task && typeof task === 'object' && !Array.isArray(task))
    : undefined
  const common = {
    planId: payload.planId ?? plan?.planId,
    lifecycle: payload.lifecycle ?? plan?.lifecycle,
    revision: payload.revision ?? plan?.revision,
    contentHash: payload.contentHash ?? payload.validationHash,
    currentValidationHash: payload.currentValidationHash,
    status: payload.status,
    evidenceHash: payload.evidenceHash,
    eventSequence: payload.eventSequence,
    nextAllowedAction: payload.nextAllowedAction,
    nextRecommendedAction: payload.nextRecommendedAction,
    nextRequiredAgentBehavior: payload.nextRequiredAgentBehavior,
  }
  if (responseMode === 'linksOnly')
    return { ...common, links: payload.links, browserUrl: payload.browserUrl, appraiseUrl: payload.appraiseUrl }
  if (responseMode === 'blockersOnly')
    return {
      ...common,
      blockers: payload.blockers ?? readiness?.blockers ?? payload.blockingReasons,
      structuredBlockers: payload.structuredBlockers,
      warnings: payload.warnings,
    }
  if (responseMode === 'evidenceOnly') {
    return {
      ...common,
      attemptId: payload.attemptId ?? attemptIds?.[0],
      attemptIds,
      testRunId: payload.testRunId,
      testRunIds,
      evidence: payload.evidence ?? payload.evidenceSummary ?? baselineAttempts,
      counts: payload.counts,
      manifestPaths: payload.manifestPaths,
    }
  }
  return {
    ...common,
    published: payload.published,
    attemptId: payload.attemptId ?? attemptIds?.[0],
    attemptIds,
    testRunId: payload.testRunId,
    testRunIds,
    reused: payload.reused,
    evidence: payload.evidenceSummary ?? payload.evidence ?? baselineAttempts,
    counts:
      payload.counts ??
      (taskStates
        ? {
            tasks: Object.keys(taskStates).length,
            verifiedTasks: Object.values(taskStates).filter(status => status === 'verified').length,
            validationRuns: Array.isArray(implementation?.validationRuns) ? implementation.validationRuns.length : 0,
          }
        : completionTasks
          ? {
              tasks: completionTasks.length,
              verifiedTasks: completionTasks.filter(task => (task as Record<string, unknown>).status === 'verified')
                .length,
              validationRuns: runs?.length ?? 0,
              blockingRemarks: Array.isArray(payload.blockingRemarks) ? payload.blockingRemarks.length : 0,
              nonBlockingRemarks: Array.isArray(payload.nonBlockingRemarks) ? payload.nonBlockingRemarks.length : 0,
            }
          : undefined),
    runnableTaskIds: payload.runnableTaskIds,
    approvedGroupIds: implementation?.approvedGroupIds,
    taskStates,
    ...(payload.taskStates ? {} : { checkpoint: payload.checkpoint }),
    runs,
    receipt: payload.receipt,
    ready: payload.ready ?? readiness?.ready,
    blockers: payload.blockers ?? readiness?.blockers ?? payload.blockingReasons,
    structuredBlockers: payload.structuredBlockers,
    warnings: payload.warnings,
    manifestPaths: payload.manifestPaths,
    validationArtifactPath: payload.validationArtifactPath,
    links: payload.links,
    browserUrl: payload.browserUrl,
    appraiseUrl: payload.appraiseUrl,
  }
}

export function applyEventResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  if (responseMode === 'full' || !value || typeof value !== 'object' || Array.isArray(value)) return value
  const payload = value as Record<string, unknown>
  const summarizeEvent = (event: unknown) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return event
    const item = event as Record<string, unknown>
    return { sequence: item.sequence, type: item.type }
  }
  return {
    ...payload,
    events: Array.isArray(payload.events) ? payload.events.map(summarizeEvent) : payload.events,
    latestEvent: summarizeEvent(payload.latestEvent),
  }
}

export function applyAuthoringResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  if (responseMode === 'full' || !value || typeof value !== 'object' || Array.isArray(value)) return value
  const payload = value as Record<string, unknown>
  const created =
    payload.created && typeof payload.created === 'object' ? (payload.created as Record<string, unknown>) : undefined
  const reviewReady =
    payload.reviewReady && typeof payload.reviewReady === 'object'
      ? (payload.reviewReady as Record<string, unknown>)
      : undefined
  const resources =
    payload.resources && typeof payload.resources === 'object' && !Array.isArray(payload.resources)
      ? (payload.resources as Record<string, unknown>)
      : undefined
  const plan =
    payload.plan && typeof payload.plan === 'object' && !Array.isArray(payload.plan)
      ? (payload.plan as Record<string, unknown>)
      : undefined
  const authoring =
    payload.authoring && typeof payload.authoring === 'object' && !Array.isArray(payload.authoring)
      ? (payload.authoring as Record<string, unknown>)
      : undefined
  const returnedResourceCounts = resources
    ? Object.fromEntries(
        Object.entries(resources).map(([resourceType, entries]) => [
          resourceType,
          Array.isArray(entries) ? entries.length : 0,
        ]),
      )
    : undefined
  const bindings =
    payload.bindings && typeof payload.bindings === 'object' && !Array.isArray(payload.bindings)
      ? Object.fromEntries(
          Object.entries(payload.bindings as Record<string, unknown>).map(([resourceType, entries]) => [
            resourceType,
            Array.isArray(entries)
              ? entries.map(entry => {
                  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry
                  const binding = entry as Record<string, unknown>
                  return {
                    localKey: binding.localKey,
                    id: binding.id,
                    astRef: binding.astRef,
                    version: binding.version,
                    reference: binding.reference,
                  }
                })
              : entries,
          ]),
        )
      : undefined
  const common = {
    status: payload.status,
    planId: payload.planId ?? reviewReady?.planId ?? created?.planId,
    valid: payload.valid,
    lifecycle: payload.lifecycle ?? reviewReady?.lifecycle ?? created?.lifecycle,
    revision: payload.revision ?? reviewReady?.revision ?? created?.revision,
    planContentHash: payload.planContentHash ?? reviewReady?.planContentHash ?? created?.planContentHash,
    planStateHash: payload.planStateHash ?? reviewReady?.planStateHash ?? created?.planStateHash,
    reviewBindingHash: payload.reviewBindingHash ?? reviewReady?.reviewBindingHash ?? created?.reviewBindingHash,
    candidateHash: payload.candidateHash,
    taskShapeHash: payload.taskShapeHash,
    contextHash: payload.contextHash,
    expectedPlanHash: payload.expectedPlanHash ?? plan?.sourceHash,
    previewHash: payload.previewHash,
    receiptHash: payload.receiptHash,
    projectionHash: payload.projectionHash,
    operationId: payload.operationId ?? payload.id,
    phase: payload.phase,
    blockers: payload.blockers,
    warnings: payload.warnings,
    integrity: payload.integrity,
    nextRecommendedAction: payload.nextRecommendedAction,
    nextRequiredAgentBehavior: payload.nextRequiredAgentBehavior,
  }
  const handoff = {
    goal: payload.goal ?? reviewReady?.goal ?? created?.goal,
    description: payload.description ?? reviewReady?.description ?? created?.description,
    links: payload.links ?? reviewReady?.links ?? created?.links,
    browserUrl: payload.browserUrl ?? reviewReady?.browserUrl,
    appraiseUrl: payload.appraiseUrl ?? reviewReady?.appraiseUrl,
    currentAfterSequence: payload.currentAfterSequence ?? reviewReady?.currentAfterSequence,
    nextAfterSequence: payload.nextAfterSequence ?? reviewReady?.nextAfterSequence,
    recommendedWait: payload.recommendedWait ?? reviewReady?.recommendedWait,
  }
  if (responseMode === 'linksOnly') return { ...common, ...handoff, detailResource: payload.detailResource }
  if (responseMode === 'blockersOnly') return common
  if (responseMode === 'evidenceOnly')
    return { ...common, hashes: payload.hashes, counts: payload.counts, events: payload.events }
  return {
    ...common,
    ...handoff,
    requirementAssessment: payload.requirementAssessment,
    taskDiff: payload.taskDiff,
    targetProject: payload.targetProject,
    bindings,
    resourceProposalContract: authoring?.resourceProposalContract,
    returnedResourceCounts,
    resourceSearchGuidance: resources
      ? 'Use validation_context_read with resourceTypes/query and a small limit, or the preferred step_search and locator_search tools, before requesting full context.'
      : undefined,
  }
}

export function applyCapsuleDiagnosticMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  if (responseMode === 'full' || !value || typeof value !== 'object' || Array.isArray(value)) return value
  const diagnostic = value as Record<string, unknown>
  if (responseMode === 'blockersOnly')
    return {
      schemaVersion: diagnostic.schemaVersion,
      blockers: diagnostic.blockers,
      failureOutput: (diagnostic.preflight as Record<string, unknown> | undefined)?.failureOutput,
      nextRecoveryAction: diagnostic.nextRecoveryAction,
    }
  if (responseMode === 'evidenceOnly')
    return { schemaVersion: diagnostic.schemaVersion, run: diagnostic.run, evidence: diagnostic.evidence }
  if (responseMode === 'linksOnly') {
    const evidence = diagnostic.evidence as Record<string, unknown> | undefined
    return {
      schemaVersion: diagnostic.schemaVersion,
      runId: (diagnostic.run as Record<string, unknown> | undefined)?.runId,
      links: evidence?.links,
      nextRecoveryAction: diagnostic.nextRecoveryAction,
    }
  }
  return {
    schemaVersion: diagnostic.schemaVersion,
    run: diagnostic.run,
    attempt: diagnostic.attempt,
    preflight: diagnostic.preflight,
    blockers: diagnostic.blockers,
    evidence: diagnostic.evidence,
    nextRecoveryAction: diagnostic.nextRecoveryAction,
  }
}
