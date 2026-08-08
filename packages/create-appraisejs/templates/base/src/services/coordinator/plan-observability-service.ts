import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'

const MAX_METRICS_PER_PLAN = 500

const PHASE_BY_OPERATION_PREFIX: Array<[string, string]> = [
  ['validation', 'validation'],
  ['baseline', 'baseline'],
  ['implementation', 'implementation'],
  ['completion', 'completion'],
  ['events', 'coordination'],
  ['wait', 'coordination'],
]

export function operationPhase(operation: string) {
  const lowered = operation.toLowerCase()
  return PHASE_BY_OPERATION_PREFIX.find(([prefix]) => lowered.includes(prefix))?.[1] ?? 'planning'
}

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function planIdForOperation(operation: string[], body: unknown): string | undefined {
  const record = objectRecord(body)
  const nestedPlan = objectRecord(record.plan)
  const candidates = [operation[0] === 'plans' ? operation[1] : undefined, record.planId, nestedPlan.planId]
  return candidates.find((candidate): candidate is string => typeof candidate === 'string')
}

export async function recordCoordinatorResponseMetric(
  input: { operation: string[]; body: unknown; response: Response; startedAt: number },
  client: PrismaClient = prisma,
) {
  const measuredBody = await input.response.clone().arrayBuffer()
  const responseBytes = measuredBody.byteLength
  const responseText = Buffer.from(measuredBody).toString('utf8')
  let responsePayload: Record<string, unknown> = {}
  try {
    responsePayload = objectRecord(JSON.parse(responseText))
  } catch {
    responsePayload = {}
  }
  const request = objectRecord(input.body)
  return recordPlanOperationMetric(
    {
      planId: planIdForOperation(input.operation, input.body),
      operation: input.operation.join('/') || 'unknown',
      statusCode: input.response.status,
      durationMs: Date.now() - input.startedAt,
      requestBytes: Buffer.byteLength(JSON.stringify(input.body ?? null)),
      responseBytes,
      estimatedTokens: Math.ceil(responseBytes / 4),
      responseMode: typeof request.responseMode === 'string' ? request.responseMode : 'summary',
      retryCause: typeof request.retryCause === 'string' ? request.retryCause : undefined,
      classification:
        typeof responsePayload.classification === 'string' ? responsePayload.classification : undefined,
      operationOutcome:
        typeof responsePayload.operationOutcome === 'string' ? responsePayload.operationOutcome : undefined,
    },
    client,
  )
}

export async function recordPlanOperationMetric(
  input: {
    planId?: string
    operation: string
    statusCode: number
    durationMs: number
    requestBytes: number
    responseBytes: number
    estimatedTokens?: number
    responseMode?: string
    retryCause?: string
    classification?: string
    operationOutcome?: string
  },
  client: PrismaClient = prisma,
) {
  if (!input.planId) return undefined
  const plan = await client.planProjection.findUnique({ where: { planId: input.planId }, select: { id: true } })
  if (!plan) return undefined
  const previous = await client.planOperationMetric.count({
    where: { planProjectionId: plan.id, operation: input.operation },
  })
  const recovery = /(retry|reconcile|cancel|repair|feedback)/i.test(input.operation) || input.statusCode >= 400
  const metric = await client.planOperationMetric.create({
    data: {
      planProjectionId: plan.id,
      phase: operationPhase(input.operation),
      operation: input.operation,
      statusCode: input.statusCode,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      waitMs: /wait/i.test(input.operation) ? Math.max(0, Math.round(input.durationMs)) : 0,
      retryCount: previous,
      requestBytes: input.requestBytes,
      responseBytes: input.responseBytes,
      estimatedTokens: input.estimatedTokens ?? Math.ceil(input.responseBytes / 4),
      responseMode: input.responseMode ?? 'summary',
      retryCause: input.retryCause,
      classification: input.classification,
      operationOutcome: input.operationOutcome,
      recoveryCost: recovery ? Math.max(1, Math.round(input.durationMs)) : 0,
    },
  })
  const stale = await client.planOperationMetric.findMany({
    where: { planProjectionId: plan.id },
    orderBy: { recordedAt: 'desc' },
    skip: MAX_METRICS_PER_PLAN,
    select: { id: true },
  })
  if (stale.length > 0)
    await client.planOperationMetric.deleteMany({ where: { id: { in: stale.map(item => item.id) } } })
  return metric
}

export async function readPlanEfficiencyTelemetry(planId: string, client: PrismaClient = prisma) {
  const metrics = await client.planOperationMetric.findMany({
    where: { plan: { planId } },
    orderBy: { recordedAt: 'desc' },
    take: 100,
  })
  const byPhase = new Map<
    string,
    {
      durationMs: number
      waitMs: number
      retries: number
      toolCalls: number
      responseBytes: number
      recoveryCost: number
      estimatedTokens: number
    }
  >()
  for (const metric of metrics) {
    const phase = byPhase.get(metric.phase) ?? {
      durationMs: 0,
      waitMs: 0,
      retries: 0,
      toolCalls: 0,
      responseBytes: 0,
      recoveryCost: 0,
      estimatedTokens: 0,
    }
    phase.durationMs += metric.durationMs
    phase.waitMs += metric.waitMs
    phase.retries += metric.retryCount > 0 ? 1 : 0
    phase.toolCalls += metric.toolCallCount
    phase.responseBytes += metric.responseBytes
    phase.recoveryCost += metric.recoveryCost
    phase.estimatedTokens += metric.estimatedTokens ?? Math.ceil(metric.responseBytes / 4)
    byPhase.set(metric.phase, phase)
  }
  return { retained: metrics.length, phases: [...byPhase.entries()].map(([phase, totals]) => ({ phase, ...totals })) }
}

export async function recordLifecycleCertification(
  input: { status: 'passed' | 'failed'; matrix: unknown; durationMs: number; gitCommit?: string },
  client: PrismaClient = prisma,
) {
  const matrixJson = JSON.stringify(input.matrix)
  return client.lifecycleCertificationReceipt.create({
    data: {
      schemaVersion: '1',
      status: input.status,
      matrixHash: `sha256:${createHash('sha256').update(matrixJson).digest('hex')}`,
      matrixJson,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      gitCommit: input.gitCommit,
    },
  })
}

export async function readLatestLifecycleCertification(client: PrismaClient = prisma) {
  const receipt = await client.lifecycleCertificationReceipt.findFirst({ orderBy: { recordedAt: 'desc' } })
  return receipt ? { ...receipt, matrix: JSON.parse(receipt.matrixJson) as unknown } : undefined
}
