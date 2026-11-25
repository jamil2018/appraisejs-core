'use client'

import {
  beginClaudeCodeConnection,
  disconnectClaudeCodeConnection,
  readClaudeCodeConnection,
} from '@/actions/provider-connection/claude-actions'
import type { ClaudeCodeConnectionStatus } from '@/services/provider-connection/claude-code-connection-service'

import { NativeProviderSettings } from './native-provider-settings'

const description: Record<ClaudeCodeConnectionStatus['state'], string> = {
  unavailable: 'Install Claude Code to connect this local app.',
  disconnected: 'Connect Claude Code for project lookups in chat.',
  authorizing: 'Continue in the Anthropic sign-in page. Appraise will check the connection when you return.',
  connected: 'Connected. Open a project chat to review and send a Claude Code lookup.',
  failed: 'Claude Code could not finish sign-in. Try again.',
}

export function ClaudeCodeSettings({ initialStatus }: { initialStatus: ClaudeCodeConnectionStatus }) {
  return (
    <NativeProviderSettings
      initialStatus={initialStatus}
      name="Claude Code"
      description={description}
      setup={{ href: 'https://code.claude.com/docs/en/setup', label: 'Install Claude Code' }}
      read={readClaudeCodeConnection}
      connect={beginClaudeCodeConnection}
      disconnect={disconnectClaudeCodeConnection}
    />
  )
}
