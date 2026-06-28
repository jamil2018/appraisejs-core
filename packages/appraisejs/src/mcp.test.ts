import { describe, expect, it } from 'vitest'

import { nextApprovalWaitSequence } from './mcp.js'

describe('MCP approval wait helpers', () => {
  it('advances the long-poll cursor past non-gate events that were already delivered', () => {
    expect(
      nextApprovalWaitSequence(0, [
        { sequence: 1, type: 'plan_graph_processing_started' },
        { sequence: 2, type: 'plan_review_ready' },
      ]),
    ).toBe(2)
  })

  it('preserves the caller cursor when no newer events were delivered', () => {
    expect(nextApprovalWaitSequence(5, [{ sequence: 3, type: 'plan_review_ready' }])).toBe(5)
  })
})
