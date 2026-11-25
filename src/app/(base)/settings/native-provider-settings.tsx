'use client'

import { useEffect, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'

export type NativeProviderStatus = {
  state: 'unavailable' | 'disconnected' | 'authorizing' | 'connected' | 'failed'
  message?: string
  requiresDisconnect?: true
}

type SettingsProps<T extends NativeProviderStatus> = {
  initialStatus: T
  name: string
  description: Record<NativeProviderStatus['state'], string>
  setup: { href: string; label: string }
  read: () => Promise<T>
  connect: () => Promise<T>
  disconnect: () => Promise<T>
}

function useNativeProviderStatus<T extends NativeProviderStatus>(props: SettingsProps<T>) {
  const { read } = props
  const [status, setStatus] = useState(props.initialStatus)
  const [busy, startTransition] = useTransition()
  const [actionError, setActionError] = useState(false)

  useEffect(() => {
    if (status.state !== 'authorizing' || busy) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      const updated = await read().catch(() => undefined)
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
  }, [status.state, busy, read])

  function act(action: () => Promise<T>) {
    setActionError(false)
    startTransition(async () => {
      try {
        setStatus(await action())
      } catch {
        setActionError(true)
      }
    })
  }

  return { status, busy, actionError, act }
}

function SetupLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="app-focus inline-block rounded-md text-xs text-primary underline"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </a>
  )
}

const connectableStates = new Set<NativeProviderStatus['state']>(['disconnected', 'failed'])

function ConnectionControl<T extends NativeProviderStatus>({
  status,
  busy,
  act,
  connect,
  disconnect,
  name,
}: Pick<SettingsProps<T>, 'connect' | 'disconnect' | 'name'> & {
  status: T
  busy: boolean
  act: (action: () => Promise<T>) => void
}) {
  if (status.state === 'connected' || status.requiresDisconnect) {
    return (
      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(disconnect)}>
        Disconnect locally
      </Button>
    )
  }
  if (!connectableStates.has(status.state)) return null
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(connect)}>
      Connect {name}
    </Button>
  )
}

export function NativeProviderSettings<T extends NativeProviderStatus>(props: SettingsProps<T>) {
  const { status, busy, actionError, act } = useNativeProviderStatus(props)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="space-y-0.5">
        <p className="font-medium">{props.name}</p>
        <p className="text-xs leading-5 text-muted-foreground" role="status">
          {actionError
            ? `Couldn’t check ${props.name}. Refresh Settings and try again.`
            : status.message || props.description[status.state]}
        </p>
        {status.state === 'unavailable' && <SetupLink {...props.setup} />}
      </div>
      <ConnectionControl
        status={status}
        busy={busy}
        act={act}
        connect={props.connect}
        disconnect={props.disconnect}
        name={props.name}
      />
    </div>
  )
}
