import { describe, expect, it, vi } from 'vitest'
import {
  coordinatorAcknowledgement,
  coordinatorAcknowledgementSchema,
  coordinatorAuthorizationHandoffFromDetails,
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

  it('accepts a bounded committed execution-consent handoff', () => {
    const consentId = '5a9fb98f-8912-44a9-b843-30fb19dd6129'
    const expectedExecutionManifestHash = `sha256:${'e'.repeat(64)}`
    expect(
      coordinatorErrorEnvelopeSchema.parse({
        schema: 'appraise.error/v1',
        errorId: '11111111-1111-4111-8111-111111111111',
        occurredAt: '2026-08-26T00:00:00.000Z',
        classification: 'state_conflict',
        code: 'CONFLICT',
        message: 'Explicit execution consent is required.',
        httpStatus: 409,
        operation: { name: 'quality/assessment-runs', idempotencyKey: 'consent-key' },
        operationOutcome: 'committed',
        durableState: 'execution_consent_request_committed',
        targetOutcome: 'not_evaluated',
        executionConsent: {
          assessmentId: 'assessment-1',
          consentId,
          expectedExecutionManifestHash,
          consentRequestCreated: true,
          nextAction: {
            tool: 'execution_consent_decide',
            arguments: { assessmentId: 'assessment-1', consentId, expectedExecutionManifestHash },
            reason: 'Decide the committed consent request.',
          },
        },
        retry: { safe: false, strategy: 'read_state_then_retry' },
      }),
    ).toMatchObject({ durableState: 'execution_consent_request_committed' })
  })

  it('creates the authorization handoff from only the stable request identity', () => {
    const handoff = coordinatorAuthorizationHandoffFromDetails({
      requestId: '5a9fb98f-8912-44a9-b843-30fb19dd6129',
      requestHash: `sha256:${'e'.repeat(64)}`,
      expiresAt: '2026-08-24T12:00:00.000Z',
      password: 'must-not-project',
      grant: 'must-not-project',
    })
    expect(handoff).toMatchObject({
      executionRequestId: '5a9fb98f-8912-44a9-b843-30fb19dd6129',
      expectedRequestHash: `sha256:${'e'.repeat(64)}`,
      authorizationRequestCreated: true,
      nextAction: { tool: 'assessment_prepare_run' },
    })
    expect(JSON.stringify(handoff)).not.toContain('must-not-project')
    expect(
      coordinatorAuthorizationHandoffFromDetails({
        requestId: 'not-a-uuid',
        requestHash: `sha256:${'e'.repeat(64)}`,
        expiresAt: '2026-08-24T12:00:00.000Z',
      }),
    ).toBeUndefined()
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
