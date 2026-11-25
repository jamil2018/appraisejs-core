'use client'

import { useEffect, useState, useTransition } from 'react'

import {
  beginClaudeCodeConnection,
  disconnectClaudeCodeConnection,
  readClaudeCodeConnection,
} from '@/actions/provider-connection/claude-actions'
import { Button } from '@/components/ui/button'
import type { ClaudeCodeConnectionStatus } from '@/services/provider-connection/claude-code-connection-service'

const description: Record<ClaudeCodeConnectionStatus['state'], string> = {
  unavailable: 'Install Claude Code to connect this local app.',
  disconnected: 'Connect Claude Code for project lookups in chat.',
  authorizing: 'Continue in the Anthropic sign-in page. Appraise will check the connection when you return.',
  connected: 'Connected. Open a project chat to review and send a Claude Code lookup.',
  failed: 'Claude Code could not finish sign-in. Try again.',
}

export function ClaudeCodeSettings({ initialStatus }: { initialStatus: ClaudeCodeConnectionStatus }) {
  const [status, setStatus] = useState(initialStatus)
  const [busy, startTransition] = useTransition()
  const [actionError, setActionError] = useState(false)

  useEffect(() => {
    if (status.state !== 'authorizing' || busy) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      const updated = await readClaudeCodeConnection().catch(() => undefined)
      if (!active) return
      if (!updated) return setActionError(true)
      setStatus(updated)
      if (updated.state === 'authorizing') timer = setTimeout(poll, 1800)
    }
    timer = setTimeout(poll, 1800)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [status.state, busy])

  function act(action: () => Promise<ClaudeCodeConnectionStatus>) {
    setActionError(false)
    startTransition(async () => {
      try {
        setStatus(await action())
      } catch {
        setActionError(true)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="space-y-0.5">
        <p className="font-medium">Claude Code</p>
        <p className="text-xs leading-5 text-muted-foreground" role="status">
          {actionError
            ? 'Couldn’t check Claude Code. Refresh Settings and try again.'
            : status.message || description[status.state]}
        </p>
        <ClaudeCodeSetupLink state={status.state} />
      </div>
      <ClaudeCodeConnectionControl state={status.state} busy={busy} act={act} />
    </div>
  )
}

function ClaudeCodeSetupLink({ state }: { state: ClaudeCodeConnectionStatus['state'] }) {
  if (state !== 'unavailable') return null
  return (
    <a
      className="app-focus inline-block rounded-md text-xs text-primary underline"
      href="https://code.claude.com/docs/en/setup"
      target="_blank"
      rel="noopener noreferrer"
    >
      Install Claude Code
    </a>
  )
}

function ClaudeCodeConnectionControl({
  state,
  busy,
  act,
}: {
  state: ClaudeCodeConnectionStatus['state']
  busy: boolean
  act: (action: () => Promise<ClaudeCodeConnectionStatus>) => void
}) {
  if (state === 'connected') {
    return (
      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(disconnectClaudeCodeConnection)}>
        Disconnect locally
      </Button>
    )
  }
  if (state !== 'disconnected' && state !== 'failed') return null
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(beginClaudeCodeConnection)}>
      Connect Claude Code
    </Button>
  )
}
