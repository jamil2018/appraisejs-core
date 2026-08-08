import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { PlanContractError } from '@/lib/plan-contract'
import { ServiceError } from '@/services/shared/errors'
import { coordinatorError, CoordinatorPostCommitSerializationError, planLinks, zodCoordinatorError } from './contracts'

const context = { operation: 'plans/plan-one/validations/submit', planId: 'plan-one', idempotencyKey: 'secret-key' }

describe('coordinator public error contracts', () => {
  it('builds stable Appraise, browser, and compatibility routes from the configured base URL', () => {
    expect(planLinks('planning-experience', 'http://127.0.0.1:3000/', 'project-one')).toEqual({
      appraise: 'appraise://plans/planning-experience',
      browser: 'http://localhost:3000/plans/planning-experience?project=project-one',
      route: '/plans/planning-experience?project=project-one',
    })
  })

  it('emits the exact versioned request-invalid envelope without legacy keys', () => {
    const result = z.object({ plan: z.object({ title: z.string().min(1) }) }).safeParse({ plan: { title: '' } })
    expect(result.success).toBe(false)
    if (result.success) return

    const response = zodCoordinatorError(result.error, context)
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      schema: 'appraise.error/v1',
      occurredAt: expect.any(String),
      classification: 'request_invalid',
      code: 'request_invalid',
      httpStatus: 400,
      operation: { name: context.operation, planId: 'plan-one', idempotencyKey: 'secret-key' },
      operationOutcome: 'not_started',
      targetOutcome: 'not_evaluated',
      retry: {
        safe: false,
        strategy: 'repair_input_then_retry',
        nextAction: { tool: 'coordinator_error_recovery', reason: expect.any(String) },
      },
    })
    expect(response.body).not.toHaveProperty('error')
    expect(response.body).not.toHaveProperty('kind')
    expect(response.body).not.toHaveProperty('context')
  })

  it.each([
    ['authorization_failure', new ServiceError('private auth detail', 'UNAUTHORIZED'), 'not_started'],
    ['resource_missing', new ServiceError('Missing test run.', 'NOT_FOUND'), 'not_started'],
    ['state_conflict', new ServiceError('Stale revision.', 'CONFLICT'), 'not_committed'],
    [
      'infrastructure_failure',
      new Prisma.PrismaClientKnownRequestError('missing column at /private/db', {
        code: 'P2022',
        clientVersion: 'test',
        meta: { modelName: 'TestRun', column: 'private_column' },
      }),
      'not_started',
    ],
    [
      'appraise_authoring_defect',
      new PlanContractError('invalid-artifact', 'private artifact detail', ['plan', 'title']),
      'not_started',
    ],
    ['appraise_runtime_defect', new Error('private stack and database URL'), 'unknown'],
  ] as const)('maps %s to the public classification and scrubs private details', (classification, error, outcome) => {
    const response = coordinatorError(error, context)
    expect(response.body).toMatchObject({
      schema: 'appraise.error/v1',
      classification,
      code: classification,
      operationOutcome: outcome,
      targetOutcome: 'not_evaluated',
      retry: { nextAction: { tool: 'coordinator_error_recovery', reason: expect.any(String) } },
    })
    expect(JSON.stringify(response.body)).not.toContain('private')
  })

  it('reports committed as the outcome when post-commit response serialization fails', () => {
    const response = coordinatorError(new CoordinatorPostCommitSerializationError(), context)
    expect(response.body).toMatchObject({
      classification: 'appraise_runtime_defect',
      operationOutcome: 'committed',
      retry: { safe: false, strategy: 'do_not_retry' },
    })
  })
})
