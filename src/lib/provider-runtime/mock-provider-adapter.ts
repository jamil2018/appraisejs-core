import type { ProviderAdapter } from './provider-adapter'
import { planningOnlyCapabilitySnapshot } from './provider-adapter'

const mockPlanningProviderAdapter: ProviderAdapter = {
  key: 'mock-planning',
  displayName: 'Mock Planning Provider',
  providerKind: 'mock',
  adapterVersion: 'phase-1',
  capabilities: planningOnlyCapabilitySnapshot,
  async launch(input) {
    return {
      status: 'completed',
      providerSessionId: `mock-session-${input.runId}`,
      providerThreadId: `mock-thread-${input.runId}`,
      events: [
        {
          type: 'provider_run_started',
          payload: {
            targetProjectPath: input.targetProjectPath,
            lifecyclePhase: input.lifecyclePhase,
            mcpInjected: Boolean(input.mcpEndpoint),
          },
        },
        {
          type: 'provider_event_streamed',
          stream:
            'Mock provider accepted a planning-only run. Appraise remains the authority for plan review and approval.',
          payload: { channel: 'stdout' },
        },
        {
          type: 'provider_permission_requested',
          payload: {
            requestId: `mock-read-${input.runId}`,
            requestedScope: 'workspace:read',
            riskTier: 'low',
            reason: 'Inspect target files before drafting or revising a plan.',
          },
        },
        {
          type: 'provider_run_completed',
          payload: {
            exitCode: 0,
            lifecycleAuthority: 'appraise',
            nextGate: 'plan_review_ready',
          },
        },
      ],
    }
  },
  async cancel() {
    return [
      {
        type: 'provider_run_cancelled',
        payload: { termination: 'graceful', lifecycleAuthority: 'appraise' },
      },
    ]
  },
}

export const providerAdapters = [mockPlanningProviderAdapter]

export function getProviderAdapter(key: string) {
  return providerAdapters.find(adapter => adapter.key === key)
}
