import { describe, expect, it, vi } from 'vitest'
import {
  coordinatorAcknowledgement,
  coordinatorAcknowledgementSchema,
  coordinatorErrorEnvelopeSchema,
  ServiceError,
  serviceErrorToActionResponse,
  unknownErrorToActionResponse,
} from './errors'

describe('coordinator public DTO schemas', () => {
  it('accepts the exact error envelope and rejects legacy keys', () => {
    const base = {
      schema: 'appraise.error/v1',
      errorId: '11111111-1111-4111-8111-111111111111',
      occurredAt: '2026-08-07T00:00:00.000Z',
      classification: 'request_invalid',
      code: 'request_invalid',
      message: 'Request is invalid.',
      httpStatus: 400,
      operation: { name: 'plans' },
      operationOutcome: 'not_started',
      targetOutcome: 'not_evaluated',
      retry: {
        safe: false,
        strategy: 'repair_input_then_retry',
        nextAction: { tool: 'coordinator_error_recovery', reason: 'Correct the request.' },
      },
    }
    expect(coordinatorErrorEnvelopeSchema.parse(base)).toEqual(base)
    expect(coordinatorErrorEnvelopeSchema.safeParse({ ...base, kind: 'appraise.error/v1' }).success).toBe(false)
    expect(coordinatorErrorEnvelopeSchema.safeParse({ ...base, context: {} }).success).toBe(false)
  })

  it('returns the explicit validated acknowledgement DTO', () => {
    expect(coordinatorAcknowledgementSchema.parse(coordinatorAcknowledgement())).toEqual({
      kind: 'appraise.ack/v1',
      ok: true,
    })
  })
})

describe('ServiceError', () => {
  it('uses explicit statusCode when provided', () => {
    const e = new ServiceError('missing', 'NOT_FOUND', 404)
    expect(e.statusCode).toBe(404)
    expect(e.code).toBe('NOT_FOUND')
  })

  it('defaults status from code when omitted', () => {
    expect(new ServiceError('bad', 'VALIDATION').statusCode).toBe(400)
    expect(new ServiceError('gone', 'NOT_FOUND').statusCode).toBe(404)
  })
})

describe('serviceErrorToActionResponse', () => {
  it('maps to ActionResponse shape', () => {
    const r = serviceErrorToActionResponse(new ServiceError('nope', 'VALIDATION', 400))
    expect(r).toEqual({ status: 400, success: false, error: 'nope' })
  })

  it('preserves structured details for UI recovery', () => {
    const r = serviceErrorToActionResponse(
      new ServiceError('blocked', 'CONFLICT', 409, {
        blockerType: 'validation_runtime_preflight',
        missingPaths: ['automation/steps/example.step.ts'],
      }),
    )
    expect(r).toEqual({
      status: 409,
      success: false,
      error: 'blocked',
      details: {
        blockerType: 'validation_runtime_preflight',
        missingPaths: ['automation/steps/example.step.ts'],
      },
    })
  })
})

describe('unknownErrorToActionResponse', () => {
  it('uses Error.message', () => {
    const r = unknownErrorToActionResponse(new Error('db down'))
    expect(r.status).toBe(500)
    expect(r.success).toBe(false)
    expect(r.error).toContain('db down')
  })

  it('logs when logPrefix is set', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    unknownErrorToActionResponse(new Error('x'), '[test]')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
