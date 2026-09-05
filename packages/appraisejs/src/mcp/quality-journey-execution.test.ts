import { describe, expect, it, vi } from 'vitest'
import { registerQualityJourneyExecutionOperations, executionStartInput } from './domains/quality-journey-execution.js'
import type { McpRegistryContext } from './registry.js'

function harness() {
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>()
  const request = vi.fn().mockResolvedValue({ ok: true })
  registerQualityJourneyExecutionOperations({
    server: {
      registerTool: (name: string, _config: unknown, handler: (input: unknown) => Promise<unknown>) =>
        handlers.set(name, handler),
    },
    api: { request },
  } as unknown as McpRegistryContext)
  return { handlers, request }
}
const start = {
  target: 'target-1',
  journeyId: 'journey-1',
  preparedRuntimeCapsuleIds: ['prepared-1'],
  environmentId: 'environment-1',
  expectedStateHash: `sha256:${'a'.repeat(64)}`,
  idempotencyKey: 'start-1',
}

describe('Journey execution MCP authority', () => {
  it('forwards a bounded execution request and defaults the browser', async () => {
    const { handlers, request } = harness()
    await handlers.get('quality_journey_execution_start')!(start)
    expect(request).toHaveBeenCalledWith('quality/journeys/journey-1/execution/start', {
      method: 'POST',
      body: JSON.stringify({
        target: 'target-1',
        expectedStateHash: start.expectedStateHash,
        idempotencyKey: 'start-1',
        environmentId: 'environment-1',
        browserEngine: 'CHROMIUM',
        preparedRuntimeCapsuleIds: ['prepared-1'],
      }),
    })
  })
  it.each([
    { ...start, preparedRuntimeCapsuleIds: [] },
    { ...start, preparedRuntimeCapsuleIds: ['prepared-1', 'prepared-1'] },
    { ...start, actor: 'USER' },
    { ...start, grantSource: 'UI' },
    { ...start, targetProjectId: 'forged' },
  ])('rejects invalid or self-authorizing input before I/O', async input => {
    const { handlers, request } = harness()
    expect(executionStartInput.safeParse(input).success).toBe(false)
    await expect(handlers.get('quality_journey_execution_start')!(input)).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })
  it('exposes no consent-grant or rerun-approval capability', () => {
    expect([...harness().handlers.keys()]).toEqual([
      'quality_journey_execution_get',
      'quality_journey_execution_start',
      'quality_journey_execution_cancel',
      'quality_journey_execution_reconcile',
      'quality_journey_rerun_propose',
      'quality_journey_rerun_start',
    ])
  })
})
