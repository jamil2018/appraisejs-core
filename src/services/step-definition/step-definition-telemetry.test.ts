import { describe, expect, it, vi } from 'vitest'

import { readStepDefinitionTelemetry, recordStepDefinitionTelemetry } from './step-definition-telemetry'

describe('Step Definition telemetry', () => {
  it('accepts only bounded privacy-safe lifecycle payloads', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'event-1' })
    const database = { stepDefinitionTelemetryEvent: { create } }

    await recordStepDefinitionTelemetry(database as never, {
      surface: 'agent',
      outcome: 'selection_selected',
      correlationId: 'receipt:1',
      planId: 'plan-1',
      payload: { candidateCount: 3 },
    })

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correlationId: 'receipt:1',
        planId: 'plan-1',
        payloadJson: '{"candidateCount":3}',
      }),
    })
    await expect(
      recordStepDefinitionTelemetry(database as never, {
        surface: 'agent',
        outcome: 'selection_selected',
        payload: { query: 'password=secret' } as never,
      }),
    ).rejects.toThrow()
  })

  it('reports lifecycle funnels without exposing event payloads or identifiers', async () => {
    const at = (seconds: number) => new Date(`2026-01-01T00:00:${String(seconds).padStart(2, '0')}.000Z`)
    const events = [
      { correlationId: 'first', outcome: 'query_match', createdAt: at(0) },
      { correlationId: 'first', outcome: 'selection_selected', createdAt: at(1) },
      { correlationId: 'first', outcome: 'valid_ast', createdAt: at(2) },
      { correlationId: 'first', outcome: 'draft_created', createdAt: at(3) },
      { correlationId: 'first', outcome: 'reviewed', createdAt: at(8) },
      { correlationId: 'first', outcome: 'published', createdAt: at(9) },
      { correlationId: 'second', outcome: 'validation_failed', createdAt: at(0) },
      { correlationId: 'second', outcome: 'validation_passed', createdAt: at(1) },
    ]
    const database = {
      stepDefinitionTelemetryEvent: {
        groupBy: vi.fn().mockResolvedValue([{ surface: 'agent', outcome: 'query_match', _count: { _all: 1 } }]),
        findMany: vi.fn().mockResolvedValue(events),
      },
    }

    await expect(readStepDefinitionTelemetry(database as never)).resolves.toEqual({
      counts: [{ surface: 'agent', outcome: 'query_match', count: 1 }],
      funnels: {
        discoveryToSelection: 1,
        selectionToValidAst: 1,
        draftToReady: 1,
        retries: 1,
        humanReviewCount: 1,
        averageHumanReviewMs: 5_000,
      },
      sampledEvents: 8,
    })
    expect(database.stepDefinitionTelemetryEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { correlationId: true, outcome: true, createdAt: true }, take: 2_000 }),
    )
  })
})
