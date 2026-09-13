import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { ServiceError } from '@/services/shared/errors'

import { coordinatorErrorContext, responseError } from './route'

describe('Journey-only coordinator boundary', () => {
  it('reports collaboration schema and permission failures as pre-effect outcomes', async () => {
    const validation = responseError(new ServiceError('request is malformed', 'VALIDATION', 400), {
      operation: 'collaboration/execute',
      target: 'target-1',
      operationId: 'operation-1',
    })
    const permission = responseError(new ServiceError('permission is denied', 'UNAUTHORIZED', 403), {
      operation: 'collaboration/decide',
      target: 'target-1',
      operationId: 'operation-1',
    })
    await expect(validation.json()).resolves.toMatchObject({
      operationOutcome: 'not_started',
      targetOutcome: 'not_committed',
      retry: { safe: false, strategy: 'do_not_retry' },
    })
    await expect(permission.json()).resolves.toMatchObject({
      operationOutcome: 'not_started',
      targetOutcome: 'not_committed',
      retry: { safe: false, strategy: 'do_not_retry' },
    })
  })

  it('reports an unknown outcome only after an explicit external-effect signal', async () => {
    const response = responseError(new ServiceError('remote response was lost', 'INTERNAL', 500), {
      operation: 'collaboration/execute',
      target: 'target-1',
      operationId: 'operation-1',
      idempotencyKey: 'execute-1',
      effectStarted: true,
    })
    await expect(response.json()).resolves.toMatchObject({
      schema: 'appraise.error/v1',
      operationOutcome: 'unknown',
      retry: {
        safe: true,
        strategy: 'read_state_then_retry',
        nextAction: {
          tool: 'collaboration_get',
          arguments: { target: 'target-1', operationId: 'operation-1' },
        },
      },
    })
  })

  it('does not infer an effect from a collaboration endpoint name', async () => {
    const response = responseError(new ServiceError('remote response was lost', 'INTERNAL', 500), {
      operation: 'collaboration/prepare',
      target: 'target-1',
      operationId: 'operation-1',
    })
    await expect(response.json()).resolves.toMatchObject({
      operationOutcome: 'not_started',
      targetOutcome: 'not_committed',
      retry: { safe: false, strategy: 'do_not_retry' },
    })
  })

  it('offers an exact read-only external outcome recovery only for an ambiguous specialized submission', async () => {
    const request = new Request('http://127.0.0.1:3000/api/internal/coordinator/quality/journeys/journey-1/analysis', {
      method: 'POST',
    })
    const body = {
      target: 'target-1',
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      assignmentId: 'assignment-1',
      assignmentGeneration: 1,
      leaseId: 'lease-1',
      assignmentSecret: 'a'.repeat(32),
      idempotencyKey: 'submission-1',
    }
    const context = coordinatorErrorContext(
      request,
      ['quality', 'journeys', 'journey-1', 'analysis', 'external-submissions'],
      body,
    )
    const ambiguous = responseError(new ServiceError('result transport failed', 'INTERNAL', 500), context)
    const ambiguousPayload = await ambiguous.json()
    expect(ambiguousPayload).toMatchObject({
      operationOutcome: 'unknown',
      retry: {
        safe: true,
        strategy: 'read_state_then_retry',
        nextAction: {
          tool: 'quality_journey_external_work_outcome_get_v1',
          arguments: {
            target: 'target-1',
            journeyId: 'journey-1',
            role: 'REQUIREMENT_ANALYZER',
            operation: 'ANALYSIS_SUBMIT',
            workItemId: 'work-1',
            attemptId: 'attempt-1',
            assignmentId: 'assignment-1',
            assignmentGeneration: 1,
            leaseId: 'lease-1',
            idempotencyKey: 'submission-1',
          },
        },
      },
    })
    expect(
      (ambiguousPayload as { retry: { nextAction: { arguments: unknown } } }).retry.nextAction.arguments,
    ).not.toHaveProperty('assignmentSecret')

    const invalid = responseError(new ServiceError('invalid charter', 'VALIDATION', 400), context)
    await expect(invalid.json()).resolves.toMatchObject({
      operationOutcome: 'not_started',
      targetOutcome: 'not_committed',
      retry: { safe: false, strategy: 'do_not_retry' },
    })
  })

  it('exposes Journey locator routing and no removed quality domains', async () => {
    const source = await fs.readFile(path.join(__dirname, 'route.ts'), 'utf8')
    expect(source).toContain("operation[1] === 'journeys'")
    expect(source).toContain('journeyId')
    expect(source).not.toContain("operation[1] === 'plans'")
    expect(source).not.toContain("operation[1] === 'assessments'")
    expect(source).not.toContain("operation[1] === 'methodologies'")
    expect(source).not.toContain('compatibilityResponse')
  })
})
