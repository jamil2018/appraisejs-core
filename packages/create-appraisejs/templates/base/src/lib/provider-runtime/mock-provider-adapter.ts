import type { ProviderAdapter, ProviderCapabilitySnapshot, ProviderProbeResult } from './provider-adapter'
import { planningOnlyCapabilitySnapshot } from './provider-adapter'
import { codexProviderAdapter } from './codex-provider-adapter'

const mockPlanningProviderAdapter: ProviderAdapter = {
  key: 'mock-planning',
  displayName: 'Mock Planning Provider',
  providerKind: 'mock',
  adapterVersion: 'phase-1',
  capabilities: planningOnlyCapabilitySnapshot,
  defaultExecutable: 'mock-planning',
  defaultProfile: 'deterministic',
  setupMessage: 'Deterministic local adapter for tests and development.',
  launchableWhenProbed: true,
  async probe(): Promise<ProviderProbeResult> {
    return {
      status: 'installed',
      message: 'Mock planning provider is built in.',
      detectedVersion: 'built-in',
      executablePath: 'mock-planning',
      launchEnabled: true,
    }
  },
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
            mcpInjected: Boolean(input.baseUrl),
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

function createProbeOnlyAdapter(options: {
  key: string
  displayName: string
  providerKind: string
  defaultExecutable: string
  setupMessage: string
}): ProviderAdapter {
  const capabilities: ProviderCapabilitySnapshot = { ...planningOnlyCapabilitySnapshot, launch: false }
  return {
    ...options,
    adapterVersion: 'probe-v1',
    capabilities,
    launchableWhenProbed: false,
    async probe(input = {}) {
      const command = input.executablePath?.trim() || options.defaultExecutable
      return {
        status: 'not_probed',
        message: `${options.displayName} launch support is not enabled in this AppraiseJS build yet. Configure the executable now; launching will remain disabled until an adapter is available.`,
        executablePath: command,
        launchEnabled: false,
      }
    },
    async launch() {
      return {
        status: 'recovery_required',
        events: [
          {
            type: 'provider_run_failed',
            payload: {
              message: `${options.displayName} launch support is not available in this AppraiseJS build.`,
              lifecycleAuthority: 'appraise',
            },
          },
        ],
      }
    },
  }
}

const claudeProviderAdapter = createProbeOnlyAdapter({
  key: 'claude',
  displayName: 'Claude',
  providerKind: 'claude',
  defaultExecutable: 'claude',
  setupMessage: 'Install and sign in to the Claude CLI. Appraise stores no provider secrets.',
})

const cursorProviderAdapter = createProbeOnlyAdapter({
  key: 'cursor',
  displayName: 'Cursor',
  providerKind: 'cursor',
  defaultExecutable: 'cursor',
  setupMessage: 'Install Cursor command-line tooling and authenticate outside Appraise.',
})

export const providerAdapters = [
  codexProviderAdapter,
  claudeProviderAdapter,
  cursorProviderAdapter,
  mockPlanningProviderAdapter,
]

export function getProviderAdapter(key: string) {
  return providerAdapters.find(adapter => adapter.key === key)
}
