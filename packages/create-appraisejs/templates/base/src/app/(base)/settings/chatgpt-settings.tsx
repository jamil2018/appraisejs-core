'use client'

import { ArrowUpRight } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'

import {
  beginChatGptConnection,
  cancelChatGptConnection,
  disconnectChatGptConnection,
  readChatGptConnection,
  readChatGptProfiles,
} from '@/actions/provider-connection/chatgpt-actions'
import { Button, buttonVariants } from '@/components/ui/button'
import type { ChatGptProfile, ChatGptSettingsStatus } from '@/services/provider-connection/chatgpt-connection-service'

const description: Record<ChatGptSettingsStatus['state'], string> = {
  disconnected: 'Connect an eligible ChatGPT account for this local installation.',
  'awaiting-consent': 'Continue in your browser to review access in ChatGPT.',
  starting: 'Preparing a local sign-in.',
  verifying: 'Checking the connection.',
  connected: 'Authorized. ChatGPT conversation runtime qualification is pending.',
  expired: 'ChatGPT access needs renewal. Sign in again to reconnect.',
  'plan-permission-required': 'ChatGPT plan access was not granted. Review permissions when you reconnect.',
  denied: 'Sign-in was cancelled in ChatGPT.',
  'timed-out': 'The sign-in window expired. Start again from Appraise.',
  failed: 'Appraise could not complete the connection. Try again.',
  unavailable: 'Private credential storage is unavailable on this installation.',
}

function awaitingProvider(state: ChatGptSettingsStatus['state']) {
  return state === 'awaiting-consent' || state === 'verifying' || state === 'starting'
}

export function ChatGptSettings({
  initialStatus,
  profiles: initialProfiles,
}: {
  initialStatus: ChatGptSettingsStatus
  profiles: ChatGptProfile[]
}) {
  const [status, setStatus] = useState(initialStatus)
  const [profiles, setProfiles] = useState(initialProfiles)
  const [busy, startTransition] = useTransition()
  const [actionError, setActionError] = useState(false)
  const waiting = awaitingProvider(status.state)

  useEffect(() => {
    if (!waiting || busy) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const current = await readChatGptConnection()
        const stillWaiting = awaitingProvider(current.state)
        const updated = stillWaiting ? undefined : await readChatGptProfiles()
        if (!active) return
        setStatus(current)
        if (stillWaiting) timer = setTimeout(poll, 1800)
        if (updated) setProfiles(updated)
      } catch {
        if (active) setActionError(true)
      }
    }
    timer = setTimeout(poll, 1800)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [waiting, busy])

  function act(action: () => Promise<ChatGptSettingsStatus>) {
    setActionError(false)
    startTransition(async () => {
      try {
        const updated = await action()
        setStatus(updated)
        if (!awaitingProvider(updated.state)) setProfiles(await readChatGptProfiles())
      } catch {
        setActionError(true)
      }
    })
  }

  return (
    <div className="space-y-3 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="font-medium">ChatGPT</p>
          <p className="text-xs leading-5 text-muted-foreground" role="status">
            {actionError ? 'Couldn’t check the connection. Refresh Settings and try again.' : description[status.state]}
            {'account' in status && status.account && <span className="block">{status.account}</span>}
          </p>
        </div>
        <ChatGptControls status={status} busy={busy} act={act} />
      </div>
      {!waiting && profiles.length > 0 && (
        <details className="text-xs">
          <summary className="app-focus w-fit cursor-pointer rounded-md text-muted-foreground">
            ChatGPT accounts
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {profiles.map(profile => (
              <Button
                key={profile.key}
                size="sm"
                variant="outline"
                disabled={busy || profile.selected}
                onClick={() => act(() => beginChatGptConnection(profile.key))}
              >
                {profile.label}
                {profile.selected && ' · Selected'}
              </Button>
            ))}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => beginChatGptConnection('new'))}>
              Add account
            </Button>
          </div>
        </details>
      )}
    </div>
  )
}

function ChatGptControls({
  status,
  busy,
  act,
}: {
  status: ChatGptSettingsStatus
  busy: boolean
  act: (action: () => Promise<ChatGptSettingsStatus>) => void
}) {
  switch (status.state) {
    case 'awaiting-consent':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <a
            className={buttonVariants({ size: 'sm' })}
            href={status.authorizationUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-oai-siwc-button
          >
            Continue with ChatGPT <ArrowUpRight aria-hidden="true" />
          </a>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(cancelChatGptConnection)}>
            Cancel
          </Button>
        </div>
      )
    case 'connected':
      return (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(disconnectChatGptConnection)}>
          Disconnect locally
        </Button>
      )
    case 'starting':
    case 'verifying':
    case 'unavailable':
      return null
    default:
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(beginChatGptConnection)}>
            {status.state === 'plan-permission-required' ? 'Review ChatGPT permissions' : 'Connect ChatGPT'}
          </Button>
          {status.state !== 'disconnected' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(disconnectChatGptConnection)}>
              Clear local connection
            </Button>
          )}
        </div>
      )
  }
}
