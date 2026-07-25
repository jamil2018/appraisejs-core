import type { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'

import { canonicalStepDefinitionJson } from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

const eventSchema = z
  .object({
    surface: z.enum(['human', 'agent', 'runtime']),
    outcome: z.enum([
      'query_no_match',
      'query_match',
      'selection_selected',
      'selection_rejected',
      'draft_created',
      'validation_failed',
      'validation_passed',
      'valid_ast',
      'reviewed',
      'published',
      'runtime_ready',
      'runtime_blocked',
    ]),
    step: z.object({ id: z.string().max(200), version: z.string().max(40) }).optional(),
    // Opaque, bounded linkage identifiers only. Do not put search text, user
    // identifiers, prompts, inputs, or runtime data in telemetry.
    correlationId: z
      .string()
      .regex(/^[a-zA-Z0-9._:-]{1,100}$/)
      .optional(),
    planId: z
      .string()
      .regex(/^[a-zA-Z0-9._:-]{1,200}$/)
      .optional(),
    // Never accept search text, prompts, inputs, or execution data. These are
    // deliberately bounded counters and closed-vocabulary reasons only.
    payload: z
      .object({
        candidateCount: z.number().int().min(0).max(100).optional(),
        reason: z
          .enum(['no_match', 'unusable_result', 'parameter_mismatch', 'overlap', 'runtime_readiness'])
          .optional(),
      })
      .strict()
      .default({}),
  })
  .strict()

export type StepDefinitionTelemetryEvent = z.infer<typeof eventSchema>

export async function recordStepDefinitionTelemetry(
  database: PrismaClient | Prisma.TransactionClient,
  input: StepDefinitionTelemetryEvent,
) {
  const event = eventSchema.parse(input)
  // Lightweight unit-test clients omit unrelated delegates; real Prisma
  // clients always persist the validated event.
  const telemetry = database.stepDefinitionTelemetryEvent
  if (!telemetry?.create) return
  await telemetry.create({
    data: {
      surface: event.surface,
      outcome: event.outcome,
      stepId: event.step?.id,
      stepVersion: event.step?.version,
      correlationId: event.correlationId,
      planId: event.planId,
      payloadJson: canonicalStepDefinitionJson(event.payload),
    },
  })
}

/** Resolves lifecycle linkage from an authoritative persisted search receipt.
 * Plans without an agent receipt use a stable opaque plan correlation so the
 * human funnel remains measurable without retaining user input. */
export async function telemetryContextForPlan(database: PrismaClient | Prisma.TransactionClient, planId: string) {
  // Some focused coordinator tests intentionally expose only the delegates
  // they exercise. Production Prisma clients always provide this delegate.
  const receipts = database.stepDefinitionSearchReceipt
  if (!receipts?.findFirst) return { planId, correlationId: `plan:${planId}` }
  const receipt = await receipts.findFirst({
    where: { planId },
    orderBy: { searchedAt: 'desc' },
    select: { correlationId: true },
  })
  return { planId, correlationId: receipt?.correlationId ?? `plan:${planId}` }
}

// The coordinator's internal metrics reader is intentionally exported for completion evidence assembly.
export async function readStepDefinitionTelemetry(
  database: PrismaClient,
  input: { planId?: string; correlationId?: string; since?: Date } = {},
) {
  const where = {
    ...(input.planId ? { planId: input.planId } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.since ? { createdAt: { gte: input.since } } : {}),
  }
  const rows = await database.stepDefinitionTelemetryEvent.groupBy({
    by: ['surface', 'outcome'],
    where,
    _count: { _all: true },
  })
  const events = await database.stepDefinitionTelemetryEvent.findMany({
    where,
    select: { correlationId: true, outcome: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 2_000,
  })
  const funnels = new Map<string, Set<string>>()
  const draftStartedAt = new Map<string, Date>()
  const reviewDurationsMs: number[] = []
  for (const event of events) {
    if (!event.correlationId) continue
    const outcomes = funnels.get(event.correlationId) ?? new Set<string>()
    outcomes.add(event.outcome)
    funnels.set(event.correlationId, outcomes)
    if (event.outcome === 'draft_created') draftStartedAt.set(event.correlationId, event.createdAt)
    if (event.outcome === 'reviewed') {
      const draftAt = draftStartedAt.get(event.correlationId)
      if (draftAt) reviewDurationsMs.push(event.createdAt.getTime() - draftAt.getTime())
    }
  }
  const countTransitions = (from: string, to: string) =>
    [...funnels.values()].filter(outcomes => outcomes.has(from) && outcomes.has(to)).length
  return {
    counts: rows.map(row => ({ surface: row.surface, outcome: row.outcome, count: row._count._all })),
    funnels: {
      discoveryToSelection: countTransitions('query_match', 'selection_selected'),
      selectionToValidAst: countTransitions('selection_selected', 'valid_ast'),
      draftToReady: countTransitions('draft_created', 'published'),
      retries: [...funnels.values()].filter(
        outcomes => outcomes.has('validation_failed') && outcomes.has('validation_passed'),
      ).length,
      humanReviewCount: [...funnels.values()].filter(outcomes => outcomes.has('reviewed')).length,
      averageHumanReviewMs:
        reviewDurationsMs.length === 0
          ? null
          : Math.round(reviewDurationsMs.reduce((total, value) => total + value, 0) / reviewDurationsMs.length),
    },
    sampledEvents: events.length,
  }
}
