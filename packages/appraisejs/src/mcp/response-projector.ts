import { z } from 'zod'

export const responseModeSchema = z
  .enum(['summary', 'evidenceOnly', 'blockersOnly', 'linksOnly', 'full'])
  .default('summary')

export const MCP_RESPONSE_TOKEN_BUDGETS = {
  diagnostic: 1000,
  qualityMutation: 1500,
  assessmentMutation: 1500,
} as const

export function measureMcpResponse(value: unknown) {
  const json = JSON.stringify(value)
  return { bytes: Buffer.byteLength(json, 'utf8'), estimatedTokens: Math.ceil(Buffer.byteLength(json, 'utf8') / 4) }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function project(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  if (responseMode === 'full') return value
  const payload = record(value)
  if (!payload) return value
  const common = {
    status: payload.status,
    qualityPlanId: payload.qualityPlanId,
    revisionId: payload.revisionId,
    preparationId: payload.preparationId,
    phase: payload.phase,
    environment: payload.environment,
    publication: payload.publication,
    assessment: payload.assessment,
    assessmentRun: payload.assessmentRun,
    hashes: payload.hashes,
    assessmentId: payload.assessmentId,
    assessmentRunId: payload.assessmentRunId,
    validationVersionId: payload.validationVersionId,
    evidenceSetHash: payload.evidenceSetHash,
    nextRecommendedAction: payload.nextRecommendedAction,
    nextRequiredAgentBehavior: payload.nextRequiredAgentBehavior,
  }
  if (responseMode === 'linksOnly') return { ...common, links: payload.links, browserUrl: payload.browserUrl }
  if (responseMode === 'blockersOnly') return { ...common, blockers: payload.blockers, warnings: payload.warnings }
  if (responseMode === 'evidenceOnly')
    return {
      ...common,
      evidence: payload.evidence,
      receipts: payload.receipts,
      counts: payload.counts,
      hashes: payload.hashes,
    }
  return {
    ...common,
    ready: payload.ready,
    blockers: payload.blockers,
    warnings: payload.warnings,
    links: payload.links,
  }
}

export function applyResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  return project(value, responseMode)
}

export function applyLifecycleResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  return project(value, responseMode)
}

export function applyAuthoringResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  return project(value, responseMode)
}

export function applyCapsuleDiagnosticMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  if (responseMode === 'full') return value
  const diagnostic = record(value)
  if (!diagnostic) return value
  const preflight = record(diagnostic.preflight)
  if (responseMode === 'blockersOnly')
    return {
      schemaVersion: diagnostic.schemaVersion,
      blockers: diagnostic.blockers,
      failureOutput: preflight?.failureOutput,
      nextRecoveryAction: diagnostic.nextRecoveryAction,
    }
  if (responseMode === 'evidenceOnly')
    return { schemaVersion: diagnostic.schemaVersion, run: diagnostic.run, evidence: diagnostic.evidence }
  if (responseMode === 'linksOnly') {
    const evidence = record(diagnostic.evidence)
    return { schemaVersion: diagnostic.schemaVersion, runId: record(diagnostic.run)?.runId, links: evidence?.links }
  }
  return project(value, responseMode)
}
