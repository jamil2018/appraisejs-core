import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { ServiceError, type ServiceErrorCode } from '@/services/shared/errors'

import { coordinatorErrorContext, responseError } from './coordinator-error-response'

// Keep envelope coverage isolated from the route's application services and Prisma.
vi.mock('@/services/shared/errors', () => ({
  ServiceError: class ServiceError extends Error {
    readonly code: string
    readonly statusCode: number
    readonly details?: Record<string, unknown>

    constructor(
      message: string,
      code: ServiceErrorCode = 'INTERNAL',
      statusCode?: number,
      details?: Record<string, unknown>,
    ) {
      super(message)
      this.name = 'ServiceError'
      this.code = code
      this.statusCode =
        statusCode ?? { NOT_FOUND: 404, VALIDATION: 400, UNAUTHORIZED: 401, CONFLICT: 409, INTERNAL: 500 }[code] ?? 500
      this.details = details
    }
  },
}))

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

  it('classifies a pre-effect external submission conflict as not started and unsafe to retry', async () => {
    const request = new Request('http://127.0.0.1:3000/api/internal/coordinator/quality/journeys/journey-1/analysis', {
      method: 'POST',
    })
    const context = coordinatorErrorContext(
      request,
      ['quality', 'journeys', 'journey-1', 'analysis', 'external-submissions'],
      {
        target: 'target-1',
        workItemId: 'work-1',
        attemptId: 'attempt-1',
        assignmentId: 'assignment-1',
        assignmentGeneration: 1,
        leaseId: 'lease-1',
        assignmentSecret: 'a'.repeat(32),
        idempotencyKey: 'submission-1',
      },
    )
    const response = responseError(
      new ServiceError('External submission idempotency key conflicts.', 'CONFLICT', 409),
      context,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      operationOutcome: 'not_started',
      retry: { safe: false, strategy: 'do_not_retry' },
    })
  })

  describe('external submission recovery fields', () => {
    const operation = ['quality', 'journeys', 'journey-1', 'analysis', 'external-submissions']
    const request = new Request('http://127.0.0.1:3000/api/internal/coordinator/quality/journeys/journey-1/analysis')
    const validBody = {
      target: 'target-1',
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      assignmentId: 'assignment-1',
      leaseId: 'lease-1',
      assignmentSecret: 'caller-held-secret',
      idempotencyKey: 'submission-1',
      assignmentGeneration: 1,
    }
    const stringFields = [
      'target',
      'workItemId',
      'attemptId',
      'assignmentId',
      'leaseId',
      'assignmentSecret',
      'idempotencyKey',
    ]
    const invalidStrings = [
      { label: 'undefined', value: undefined },
      { label: 'null', value: null },
      { label: 'empty string', value: '' },
      { label: 'number', value: 1 },
      { label: 'boolean', value: true },
      { label: 'object', value: {} },
      { label: 'array', value: [] },
    ]

    it.each([...stringFields, 'assignmentGeneration'])('rejects a missing %s', field => {
      const body: Record<string, unknown> = { ...validBody }
      delete body[field]
      expect(coordinatorErrorContext(request, operation, body)).not.toHaveProperty('externalSubmissionOutcome')
    })

    it.each(stringFields.flatMap(field => invalidStrings.map(invalid => ({ field, ...invalid }))))(
      'rejects $label for $field',
      ({ field, value }) => {
        expect(coordinatorErrorContext(request, operation, { ...validBody, [field]: value })).not.toHaveProperty(
          'externalSubmissionOutcome',
        )
      },
    )

    it.each([undefined, null, '1', 1.5, 0, -1, NaN, Infinity, -Infinity, {}, []])(
      'rejects invalid assignment generation %j',
      assignmentGeneration => {
        expect(coordinatorErrorContext(request, operation, { ...validBody, assignmentGeneration })).not.toHaveProperty(
          'externalSubmissionOutcome',
        )
      },
    )

    it.each([undefined, null, 1, 'body', [], [validBody]])('rejects malformed body %j', body => {
      expect(coordinatorErrorContext(request, operation, body)).not.toHaveProperty('externalSubmissionOutcome')
    })

    it.each(
      [
        [],
        ['quality', 'journeys'],
        ['quality', 'journeys', '', 'analysis', 'external-submissions'],
        ['other', 'journeys', 'journey-1', 'analysis', 'external-submissions'],
        ['quality', 'other', 'journey-1', 'analysis', 'external-submissions'],
        ['quality', 'journeys', 'journey-1', 'analysis', 'unsupported'],
        [...operation, 'unsupported'],
      ].map(unsupportedOperation => ({ unsupportedOperation })),
    )('rejects unsupported operation $unsupportedOperation', ({ unsupportedOperation }) => {
      expect(coordinatorErrorContext(request, unsupportedOperation, validBody)).not.toHaveProperty(
        'externalSubmissionOutcome',
      )
    })

    it.each([
      { suffix: ['analysis', 'external-submissions'], role: 'REQUIREMENT_ANALYZER', submission: 'ANALYSIS_SUBMIT' },
      { suffix: ['discovery', 'external-target-observations'], role: 'SCOUT', submission: 'TARGET_OBSERVATION_SUBMIT' },
      {
        suffix: ['discovery', 'external-resource-resolutions'],
        role: 'RESOURCE_EXPLORER',
        submission: 'RESOURCE_RESOLUTION_SUBMIT',
      },
      {
        suffix: ['scenarios', 'external-submissions'],
        role: 'TEST_SCENARIO_DESIGNER',
        submission: 'SCENARIO_PORTFOLIO_SUBMIT',
      },
      { suffix: ['automation', 'external-materializations'], role: 'AUTOMATOR', submission: 'AUTOMATION_MATERIALIZE' },
      { suffix: ['triage', 'external-submit'], role: 'TRIAGER', submission: 'TRIAGE_REPORT_SUBMIT' },
    ])('preserves the original recovery mapping for $role', ({ suffix, role, submission }) => {
      const context = coordinatorErrorContext(request, ['quality', 'journeys', 'journey-1', ...suffix], {
        ...validBody,
        unselected: 'ignored',
        operation: 'untrusted-operation',
        role: 'untrusted-role',
        journeyId: 'untrusted-journey',
      })
      expect(context.externalSubmissionOutcome).toEqual({
        ...validBody,
        journeyId: 'journey-1',
        role,
        operation: submission,
      })
    })

    it.each([1, Number.MAX_SAFE_INTEGER + 1, 1e100])(
      'preserves whitespace strings and accepted integer generation %j',
      assignmentGeneration => {
        expect(Number.isInteger(assignmentGeneration)).toBe(true)
        const whitespaceFields = Object.fromEntries(stringFields.map(field => [field, ' \t ']))
        const context = coordinatorErrorContext(request, operation, { ...whitespaceFields, assignmentGeneration })
        expect(context.externalSubmissionOutcome).toEqual({
          ...whitespaceFields,
          assignmentGeneration,
          journeyId: 'journey-1',
          role: 'REQUIREMENT_ANALYZER',
          operation: 'ANALYSIS_SUBMIT',
        })
      },
    )
  })

  it('exposes Journey locator routing and no removed quality domains', async () => {
    const source = await fs.readFile(path.join(__dirname, 'route.ts'), 'utf8')
    expect(source.match(/^export (?:async function|const) \w+/gm)).toEqual([
      'export const runtime',
      'export async function GET',
      'export async function POST',
    ])
    expect(source).toContain("operation[1] === 'journeys'")
    expect(source).toContain('journeyId')
    expect(source).not.toContain("operation[1] === 'plans'")
    expect(source).not.toContain("operation[1] === 'assessments'")
    expect(source).not.toContain("operation[1] === 'methodologies'")
    expect(source).not.toContain('compatibilityResponse')
  })
})
