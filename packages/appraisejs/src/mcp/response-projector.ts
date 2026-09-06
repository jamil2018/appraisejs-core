import { z } from 'zod'

const responseModeEnum = z
  .enum(['summary', 'decisionOnly', 'evidenceOnly', 'blockersOnly', 'linksOnly', 'full'])
  .describe(
    'Response projection: summary (compact default), decisionOnly (decision hash/status/counts), evidenceOnly, blockersOnly, linksOnly, or full (largest payload).',
  )
export const responseModeSchema = responseModeEnum.default('summary')

const MCP_RESPONSE_TOKEN_BUDGETS = {
  diagnostic: 1000,
  journeyMutation: 1500,
} as const

function measureMcpResponse(value: unknown) {
  const json = JSON.stringify(value)
  return { bytes: Buffer.byteLength(json, 'utf8'), estimatedTokens: Math.ceil(Buffer.byteLength(json, 'utf8') / 4) }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function commonJourneyResponse(payload: Record<string, unknown>) {
  return {
    operationOutcome: payload.operationOutcome,
    status: payload.status,
    journeyId: payload.journeyId,
    cycleId: payload.cycleId,
    idempotent: payload.idempotent,
    hashes: payload.hashes,
    nextRecommendedAction: payload.nextRecommendedAction,
    nextRequiredAgentBehavior: payload.nextRequiredAgentBehavior,
  }
}

function project(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
  const payload = record(value)
  if (!payload || responseMode === 'full') return value
  const common = commonJourneyResponse(payload)
  switch (responseMode) {
    case 'decisionOnly':
      return {
        ...common,
        targetOutcome: payload.targetOutcome,
        readiness: payload.readiness,
        decisions: payload.decisions,
      }
    case 'evidenceOnly':
      return { ...common, evidence: payload.evidence, receipts: payload.receipts, counts: payload.counts }
    case 'blockersOnly':
      return { ...common, blockers: payload.blockers, warnings: payload.warnings }
    case 'linksOnly':
      return { ...common, links: payload.links, browserUrl: payload.browserUrl }
    default:
      return {
        ...common,
        ready: payload.ready,
        blockers: payload.blockers,
        warnings: payload.warnings,
        links: payload.links,
      }
  }
}

export function applyResponseMode(value: unknown, responseMode: z.infer<typeof responseModeSchema>) {
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
