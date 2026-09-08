import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { ServiceError } from '@/services/shared/errors'

import { responseError } from './route'

describe('Journey-only coordinator boundary', () => {
  it('reports a collaboration mutation with an operation id as an unknown durable outcome', async () => {
    const response = responseError(new ServiceError('remote response was lost', 'INTERNAL', 500), {
      operation: 'collaboration/execute',
      target: 'target-1',
      operationId: 'operation-1',
      idempotencyKey: 'execute-1',
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
