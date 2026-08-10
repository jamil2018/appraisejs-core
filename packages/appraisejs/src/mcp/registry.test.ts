import { describe, expect, it } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { CoordinatorRequestError } from './coordinator-call.js'
import { mcpContractForServer, registerAppraiseOperations, withStructuredCoordinatorErrors } from './registry.js'
import { canonicalMcpResourceNames, canonicalMcpToolNames } from './contract.js'

describe('MCP tool registration', () => {
  it('exposes only the canonical Quality Design and Assessment surface', () => {
    const server = new McpServer({ name: 'contract-test', version: '0.0.0' })
    const request = async () => ({})
    const api = {
      request,
      listTargetProjects: async () => [],
      readLocatorGraphVisual: request,
      listOperationCategories: async () => ({}),
      project: { canonicalProjectPath: '/tmp/appraise-contract-test' },
    } as never

    const definitions = registerAppraiseOperations({
      server,
      api,
      options: { cwd: '/tmp/appraise-contract-test', baseUrl: 'http://127.0.0.1:3000', coordinatorId: 'test' },
    })

    expect(mcpContractForServer(server)).toBe(definitions)
    const names = new Set(definitions.map(definition => definition.name))

    expect([...names].sort()).toEqual([...canonicalMcpToolNames, ...canonicalMcpResourceNames].sort())
    expect(definitions.every(definition => definition.annotations)).toBe(true)
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
