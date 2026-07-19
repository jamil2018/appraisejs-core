import { describe, expect, it } from 'vitest'

import { CoordinatorRequestError } from './coordinator-call.js'
import { withStructuredCoordinatorErrors } from './registry.js'

describe('MCP tool registration', () => {
  it('preserves structured coordinator recovery details for every registered tool', async () => {
    const handler = withStructuredCoordinatorErrors(async () => {
      throw new CoordinatorRequestError(
        'Loopback origin is reserved.',
        409,
        undefined,
        'CONFLICT',
        undefined,
        'Repropose the environment with the suggested base URL.',
        {
          code: 'ENVIRONMENT_ORIGIN_RESERVED',
          suggestedBaseUrl: 'http://127.0.0.1:4174',
        },
      )
    })

    const result = (await handler()) as { isError: boolean; content: Array<{ type: string; text: string }> }

    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      code: 'CONFLICT',
      message: 'Loopback origin is reserved.',
      status: 409,
      recovery: 'Repropose the environment with the suggested base URL.',
      details: {
        code: 'ENVIRONMENT_ORIGIN_RESERVED',
        suggestedBaseUrl: 'http://127.0.0.1:4174',
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
