import { describe, expect, it, vi } from 'vitest'

import {
  operationPhase,
  planIdForOperation,
  recordCoordinatorResponseMetric,
  recordLifecycleCertification,
  recordPlanOperationMetric,
} from './plan-observability-service'

describe('plan observability', () => {
  it('classifies coordinator operations by lifecycle phase', () => {
    expect(operationPhase('plans/one/baseline/reconcile')).toBe('baseline')
    expect(operationPhase('plans/one/implementation/checkpoint')).toBe('implementation')
    expect(operationPhase('plans')).toBe('planning')
  })

  it('finds plan identities in routes and coordinator bodies', () => {
    expect(planIdForOperation(['plans', 'plan-route'], {})).toBe('plan-route')
    expect(planIdForOperation(['baseline'], { planId: 'plan-body' })).toBe('plan-body')
    expect(planIdForOperation(['plans'], { plan: { planId: 'plan-create' } })).toBe('plan-create')
    expect(planIdForOperation(['heartbeat'], null)).toBeUndefined()
  })

  it('measures the response without consuming the coordinator response', async () => {
    const response = Response.json({ ok: true }, { status: 202 })
    const client = {
      planProjection: { findUnique: vi.fn().mockResolvedValue({ id: 'projection-one' }) },
      planOperationMetric: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    await expect(
      recordCoordinatorResponseMetric(
        {
          operation: ['plans', 'plan-one', 'start'],
          body: { responseMode: 'summary', retryCause: 'reconnect' },
          response,
          startedAt: Date.now() - 10,
        },
        client as never,
      ),
    ).resolves.toMatchObject({
      operation: 'plans/plan-one/start',
      statusCode: 202,
      estimatedTokens: expect.any(Number),
      responseMode: 'summary',
      retryCause: 'reconnect',
    })
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('records bounded retry and recovery cost metrics', async () => {
    const client = {
      planProjection: { findUnique: vi.fn().mockResolvedValue({ id: 'projection-one' }) },
      planOperationMetric: {
        count: vi.fn().mockResolvedValue(2),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
      },
    }
    await expect(
      recordPlanOperationMetric(
        {
          planId: 'plan-one',
          operation: 'baseline_retry',
          statusCode: 409,
          durationMs: 12.4,
          requestBytes: 10,
          responseBytes: 20,
        },
        client as never,
      ),
    ).resolves.toMatchObject({
      retryCount: 2,
      recoveryCost: 12,
      phase: 'baseline',
      estimatedTokens: 5,
      responseMode: 'summary',
    })
  })

  it('content-addresses certification matrices', async () => {
    const client = {
      lifecycleCertificationReceipt: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)) },
    }
    await expect(
      recordLifecycleCertification(
        { status: 'passed', matrix: { greenfield: true }, durationMs: 100 },
        client as never,
      ),
    ).resolves.toMatchObject({ status: 'passed', matrixHash: expect.stringMatching(/^sha256:/) })
  })
})
