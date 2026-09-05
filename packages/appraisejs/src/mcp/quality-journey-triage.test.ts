import { describe, expect, it, vi } from 'vitest'

import {
  registerQualityJourneyTriageOperations,
  triageEvidenceReadInput,
  triagePrepareInput,
} from './domains/quality-journey-triage.js'
import type { McpRegistryContext } from './registry.js'

function harness() {
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>()
  const request = vi.fn().mockResolvedValue({ ok: true })
  registerQualityJourneyTriageOperations({
    server: {
      registerTool: (name: string, _config: unknown, handler: (input: unknown) => Promise<unknown>) =>
        handlers.set(name, handler),
    },
    api: { request },
  } as unknown as McpRegistryContext)
  return { handlers, request }
}

describe('Journey triage MCP authority', () => {
  it('prepares only an exact execution cycle', async () => {
    const { handlers, request } = harness()
    await handlers.get('quality_journey_triage_prepare')!({
      target: 'target-1',
      journeyId: 'journey-1',
      executionCycleId: 'execution-1',
    })
    expect(request).toHaveBeenCalledWith('quality/journeys/journey-1/triage/prepare', {
      method: 'POST',
      body: JSON.stringify({ target: 'target-1', executionCycleId: 'execution-1' }),
    })
  })
  it('does not expose local report-review or remediation decisions', () => {
    expect([...harness().handlers.keys()]).toEqual([
      'quality_journey_triage_get',
      'quality_journey_triage_evidence_read',
      'quality_journey_triage_prepare',
      'quality_journey_triage_submit',
    ])
  })
  it('reads only a bounded receipt artifact without a caller target ID or path', async () => {
    const { handlers, request } = harness()
    await handlers.get('quality_journey_triage_evidence_read')!({
      target: 'target-1',
      journeyId: 'journey-1',
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      leaseId: 'lease-1',
      ownerToken: 'owner-token',
      receiptId: 'receipt-1',
      artifactKind: 'log',
      offset: 4,
      limit: 12,
    })
    expect(request).toHaveBeenCalledWith('quality/journeys/journey-1/triage/evidence', {
      method: 'POST',
      body: JSON.stringify({
        target: 'target-1',
        workItemId: 'work-1',
        attemptId: 'attempt-1',
        leaseId: 'lease-1',
        ownerToken: 'owner-token',
        receiptId: 'receipt-1',
        artifactKind: 'log',
        offset: 4,
        limit: 12,
      }),
    })
    expect(
      triageEvidenceReadInput.safeParse({
        target: 'target-1',
        journeyId: 'journey-1',
        workItemId: 'work-1',
        attemptId: 'attempt-1',
        leaseId: 'lease-1',
        ownerToken: 'owner-token',
        receiptId: 'receipt-1',
        artifactKind: 'log',
        targetProjectId: 'forged',
      }).success,
    ).toBe(false)
  })
  it.each([{ targetProjectId: 'forged' }, { actor: 'USER' }, { feedbackScope: 'FULL_REPORT' }])(
    'rejects caller authority before I/O',
    async injected => {
      const { handlers, request } = harness()
      expect(
        triagePrepareInput.safeParse({
          target: 'target-1',
          journeyId: 'journey-1',
          executionCycleId: 'execution-1',
          ...injected,
        }).success,
      ).toBe(false)
      await expect(
        handlers.get('quality_journey_triage_prepare')!({
          target: 'target-1',
          journeyId: 'journey-1',
          executionCycleId: 'execution-1',
          ...injected,
        }),
      ).rejects.toThrow()
      expect(request).not.toHaveBeenCalled()
    },
  )
})
