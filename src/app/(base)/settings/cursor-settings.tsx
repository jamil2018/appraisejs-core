'use client'

import {
  beginCursorConnection,
  disconnectCursorConnection,
  readCursorConnection,
} from '@/actions/provider-connection/cursor-actions'
import type { CursorConnectionStatus } from '@/services/provider-connection/cursor-connection-service'

import { NativeProviderSettings } from './native-provider-settings'

const description: Record<CursorConnectionStatus['state'], string> = {
  unavailable: 'Set up a verified Cursor CLI bundle on this Mac to connect.',
  disconnected: 'Connect Cursor for project lookups in chat.',
  authorizing: 'Continue in the Cursor sign-in page. Appraise will check the connection when you return.',
  connected: 'Connected. Open a project chat to review and send a Cursor lookup.',
  failed: 'Cursor could not finish sign-in. Try again.',
}

export function CursorSettings({ initialStatus }: { initialStatus: CursorConnectionStatus }) {
  return (
    <NativeProviderSettings
      initialStatus={initialStatus}
      name="Cursor"
      description={description}
      setup={{ href: 'https://cursor.com/docs/cli/installation', label: 'Cursor CLI installation guide' }}
      read={readCursorConnection}
      connect={beginCursorConnection}
      disconnect={disconnectCursorConnection}
    />
  )
}
