import { describe, expect, it } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { CoordinatorRequestError } from './coordinator-call.js'
import { mcpContractForServer, registerAppraiseOperations, withStructuredCoordinatorErrors } from './registry.js'

describe('MCP tool registration', () => {
  it('exposes Quality Design and Assessment as the public lifecycle surface', () => {
    const server = new McpServer({ name: 'contract-test', version: '0.0.0' })
    const request = async () => ({})
    const api = {
      request,
      listTargetProjects: async () => [],
      readLocatorGraphVisual: request,
      listOperationCategories: async () => ({}),
      listProviders: async () => [],
      listProviderRuns: async () => [],
      project: { canonicalProjectPath: '/tmp/appraise-contract-test' },
    } as never

    const definitions = registerAppraiseOperations({
      server,
      api,
      options: { cwd: '/tmp/appraise-contract-test', baseUrl: 'http://127.0.0.1:3000', coordinatorId: 'test' },
      readSnapshot: async () => ({}) as never,
    })

    expect(mcpContractForServer(server)).toBe(definitions)
    const names = new Set(definitions.map(definition => definition.name))

    expect([...names]).toEqual(
      expect.arrayContaining([
        'requirements_submit_source',
        'requirements_analyze',
        'requirements_approve',
        'validation_design_propose',
        'validation_design_approve',
        'validation_reuse_resolve',
        'validation_compile',
        'target_discovery_session_start',
        'target_discovery_locator_publish',
        'assessment_create',
        'assessment_run',
        'assessment_decide',
        'workflow-quality-design',
        'workflow-assessment',
      ]),
    )
  })

  it('embeds the exact coordinator failure envelope in every registered tool error', async () => {
    const handler = withStructuredCoordinatorErrors(async () => {
      throw new CoordinatorRequestError(409, undefined, {
        schema: 'appraise.error/v1',
        errorId: '11111111-1111-4111-8111-111111111111',
        occurredAt: '2026-08-07T00:00:00.000Z',
        classification: 'state_conflict',
        code: 'state_conflict',
        message: 'Loopback origin is reserved.',
        httpStatus: 409,
        operation: { name: 'target-projects' },
        operationOutcome: 'not_committed',
        targetOutcome: 'not_evaluated',
        retry: {
          safe: true,
          strategy: 'read_state_then_retry',
          nextAction: { tool: 'coordinator_error_recovery', reason: 'Repropose with the suggested base URL.' },
        },
        details: { constraint: 'loopback_origin' },
      })
    })

    const result = (await handler()) as { isError: boolean; content: Array<{ type: string; text: string }> }

    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      schema: 'appraise.error/v1',
      errorId: '11111111-1111-4111-8111-111111111111',
      occurredAt: '2026-08-07T00:00:00.000Z',
      classification: 'state_conflict',
      code: 'state_conflict',
      message: 'Loopback origin is reserved.',
      httpStatus: 409,
      operation: { name: 'target-projects' },
      operationOutcome: 'not_committed',
      targetOutcome: 'not_evaluated',
      retry: {
        safe: true,
        strategy: 'read_state_then_retry',
        nextAction: { tool: 'coordinator_error_recovery', reason: 'Repropose with the suggested base URL.' },
      },
      details: {
        constraint: 'loopback_origin',
      },
    })
  })

  it('does not expose unknown internal errors as coordinator envelopes', async () => {
    const handler = withStructuredCoordinatorErrors(async () => {
      throw new Error('private internal detail')
    })

    await expect(handler()).rejects.toThrow('private internal detail')
  })
})
