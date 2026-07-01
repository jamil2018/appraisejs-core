export type ProviderCapabilitySnapshot = {
  launch: boolean
  streamEvents: boolean
  resumeSession: boolean
  continueRun: boolean
  cancelRun: boolean
  structuredOutput: boolean
  permissionCallbacks: boolean
  mcpInjection: boolean
  workspaceSandbox: boolean
  backgroundRun: boolean
  logReplay: boolean
}

export type ProviderRunStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'failed'
  | 'completed'
  | 'recovery_required'

export type ProviderEventType =
  | 'provider_run_started'
  | 'provider_event_streamed'
  | 'provider_permission_requested'
  | 'provider_artifact_changed'
  | 'provider_run_paused'
  | 'provider_run_failed'
  | 'provider_run_cancelled'
  | 'provider_run_completed'

export type NormalizedProviderEvent = {
  type: ProviderEventType
  payload?: Record<string, unknown>
  stream?: string
}

export type ProviderLaunchInput = {
  runId: string
  targetProjectPath: string
  hubProjectPath: string
  launchPrompt: string
  appraiseInstructions: string
  lifecyclePhase: string
  baseUrl?: string
  executablePath?: string | null
  providerProfile?: string | null
  providerModel?: string | null
  settings?: Record<string, unknown> | null
}

export type ProviderLaunchResult = {
  status: ProviderRunStatus
  providerSessionId?: string
  providerThreadId?: string
  providerProcessId?: string
  events: NormalizedProviderEvent[]
}

export type ProviderProbeInput = {
  executablePath?: string | null
}

export type ProviderProbeResult = {
  status: 'installed' | 'missing' | 'error' | 'not_probed'
  message: string
  detectedVersion?: string
  executablePath?: string
  launchEnabled: boolean
}

export type ProviderAdapter = {
  key: string
  displayName: string
  providerKind: string
  adapterVersion: string
  capabilities: ProviderCapabilitySnapshot
  defaultExecutable: string
  defaultProfile?: string
  defaultModel?: string
  setupMessage: string
  launchableWhenProbed: boolean
  probe(input?: ProviderProbeInput): Promise<ProviderProbeResult>
  launch(input: ProviderLaunchInput): Promise<ProviderLaunchResult>
  cancel?(input: { runId: string; providerProcessId?: string | null }): Promise<NormalizedProviderEvent[]>
}

export const planningOnlyCapabilitySnapshot: ProviderCapabilitySnapshot = {
  launch: true,
  streamEvents: true,
  resumeSession: false,
  continueRun: false,
  cancelRun: true,
  structuredOutput: true,
  permissionCallbacks: true,
  mcpInjection: true,
  workspaceSandbox: true,
  backgroundRun: false,
  logReplay: true,
}
