import { inspectManagedCodexPrerequisites } from '@/lib/quality-journey/codex-app-server/managed-analysis-sender'
import { getClaudeCodeConnection } from '@/services/provider-connection/claude-code-connection-service'
import type { ClaudeCodeConnectionStatus } from '@/services/provider-connection/claude-code-connection-service'

import type { ManagedJourneyProvider } from './app-managed-provider-sender'

export type ManagedJourneyProviderReadiness = {
  provider: ManagedJourneyProvider
  ready: boolean
  state: 'ready' | 'sign_in' | 'install' | 'unavailable' | 'check_connection'
  reason: string | null
  actionLabel: string | null
  settingsHref: string
  connectionStatus?: ClaudeCodeConnectionStatus
}

type Scope = { targetProjectId: string; returnTo?: string; stage?: string }

export function managedJourneyReadinessStage(stage: string, activeDiscoveryStatus?: string | null) {
  return stage === 'DISCOVERY' && activeDiscoveryStatus === 'COMPLETED' ? 'SCENARIO_DESIGN' : stage
}

function setupHref(scope: Scope, provider: ManagedJourneyProvider) {
  const params = new URLSearchParams({ provider, project: scope.targetProjectId })
  if (scope.returnTo) params.set('returnTo', scope.returnTo)
  return `/settings/agent-setup?${params}`
}

function view(
  scope: Scope,
  provider: ManagedJourneyProvider,
  state: ManagedJourneyProviderReadiness['state'],
  reason: string | null,
  actionLabel: string | null,
): ManagedJourneyProviderReadiness {
  return { provider, ready: state === 'ready', state, reason, actionLabel, settingsHref: setupHref(scope, provider) }
}

function codexJourneyEnabled(stage?: string) {
  const enabled: Record<string, boolean> = {
    ANALYSIS: process.env.APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED === 'true',
    DISCOVERY: process.env.APPRAISE_LOCAL_CODEX_DISCOVERY_ENABLED === 'true',
    SCENARIO_DESIGN: process.env.APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED === 'true',
    AUTOMATION: process.env.APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED === 'true',
    TRIAGE: process.env.APPRAISE_LOCAL_CODEX_TRIAGE_ENABLED === 'true',
  }
  return stage ? enabled[stage] === true : Object.values(enabled).every(Boolean)
}

export function managedJourneyFullyEnabled(provider: ManagedJourneyProvider) {
  return provider === 'CODEX' ? codexJourneyEnabled() : process.env.APPRAISE_LOCAL_CLAUDE_JOURNEY_ENABLED === 'true'
}

/** Read-only first-use preflight. A role still rechecks its provider before claiming or dispatching work. */
export async function getManagedJourneyReadinessForProvider(
  scope: Scope,
  provider: ManagedJourneyProvider,
): Promise<ManagedJourneyProviderReadiness> {
  if (provider === 'CLAUDE_CODE') {
    if (process.env.APPRAISE_LOCAL_CLAUDE_JOURNEY_ENABLED !== 'true')
      return view(
        scope,
        'CLAUDE_CODE',
        'unavailable',
        'Claude Code is not available for Journeys in this workspace.',
        'See options',
      )
    const connectionStatus = await getClaudeCodeConnection().catch(() => ({ state: 'failed' as const }))
    let result: ManagedJourneyProviderReadiness
    if (connectionStatus.state === 'unavailable')
      result = view(scope, 'CLAUDE_CODE', 'install', 'Claude Code needs setup on this computer.', 'Set up Claude Code')
    else if (connectionStatus.state === 'connected') result = view(scope, 'CLAUDE_CODE', 'ready', null, null)
    else if (connectionStatus.state === 'disconnected' || connectionStatus.state === 'authorizing')
      result = view(scope, 'CLAUDE_CODE', 'sign_in', 'Claude Code needs your sign-in.', 'Sign in to Claude Code')
    else
      result = view(
        scope,
        'CLAUDE_CODE',
        'check_connection',
        'Claude Code needs attention before it can work on Journeys.',
        'Check Claude Code',
      )
    return { ...result, connectionStatus }
  }

  let codexState: ManagedJourneyProviderReadiness['state'] = 'unavailable'
  if (codexJourneyEnabled(scope.stage)) {
    const observed = await inspectManagedCodexPrerequisites().catch(() => ({
      state: 'executable_unavailable' as const,
    }))
    codexState =
      observed.state === 'candidate'
        ? 'ready'
        : observed.state === 'credential_missing'
          ? 'sign_in'
          : observed.state === 'credential_unusable'
            ? 'check_connection'
            : 'install'
  }
  const codex =
    codexState === 'ready'
      ? view(scope, 'CODEX', 'ready', null, null)
      : codexState === 'sign_in'
        ? view(scope, 'CODEX', 'sign_in', 'Codex needs your sign-in.', 'Sign in to Codex')
        : codexState === 'install'
          ? view(
              scope,
              'CODEX',
              'install',
              'Codex needs an updated ChatGPT desktop app on this computer.',
              'Set up Codex',
            )
          : codexState === 'check_connection'
            ? view(
                scope,
                'CODEX',
                'check_connection',
                'Codex needs attention before it can work on Journeys.',
                'Check Codex',
              )
            : view(
                scope,
                'CODEX',
                'unavailable',
                'Codex is not available for Journeys in this workspace.',
                'See options',
              )

  return codex
}

export async function getManagedJourneyProviderReadiness(
  scope: Scope,
): Promise<Record<ManagedJourneyProvider, ManagedJourneyProviderReadiness>> {
  const [CODEX, CLAUDE_CODE] = await Promise.all([
    getManagedJourneyReadinessForProvider(scope, 'CODEX'),
    getManagedJourneyReadinessForProvider(scope, 'CLAUDE_CODE'),
  ])
  return { CODEX, CLAUDE_CODE }
}
