'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Bot, CheckCircle2, CircleAlert, ExternalLink, Power, RefreshCw, Settings2 } from 'lucide-react'

import { probeProviderAction, updateProviderAction } from '@/actions/settings/provider-agent-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export type CodingAgentRegistration = {
  key: string
  displayName: string
  providerKind: string
  enabled: boolean
  executablePath: string | null
  detectedVersion: string | null
  probeStatus: string
  probeMessage: string | null
  lastProbedAt: Date | string | null
  defaultProfile: string | null
  defaultModel: string | null
  launchEnabled: boolean
  launchable: boolean
  settings?: { setupMessage?: string; launchableWhenProbed?: boolean }
}

function statusVariant(status: string) {
  if (status === 'installed') return 'border-emerald-500/50 text-emerald-300'
  if (status === 'missing' || status === 'error') return 'border-red-500/50 text-red-300'
  return 'border-zinc-500/50 text-zinc-300'
}

// fallow-ignore-next-line complexity
function AgentCard({ provider }: { provider: CodingAgentRegistration }) {
  const { refresh } = useRouter()
  const [executablePath, setExecutablePath] = useState(provider.executablePath ?? '')
  const [defaultProfile, setDefaultProfile] = useState(provider.defaultProfile ?? '')
  const [defaultModel, setDefaultModel] = useState(provider.defaultModel ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function runAction(action: 'probe' | 'save' | 'toggle') {
    setMessage(null)
    startTransition(async () => {
      const response =
        action === 'probe'
          ? await probeProviderAction({ providerKey: provider.key })
          : await updateProviderAction({
              providerKey: provider.key,
              executablePath,
              defaultProfile,
              defaultModel,
              enabled: action === 'toggle' ? !provider.enabled : provider.enabled,
              launchEnabled: action === 'toggle' ? !provider.enabled : provider.launchEnabled,
            })
      if (!response.success) {
        setMessage(response.error ?? 'Provider action failed.')
        return
      }
      refresh()
    })
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{provider.displayName}</h3>
            {provider.launchable ? (
              <Badge variant="outline" className="gap-1 border-emerald-500/50 text-emerald-300">
                <CheckCircle2 className="size-3" />
                Launchable
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{provider.settings?.setupMessage}</p>
        </div>
        <Badge variant="outline" className={`shrink-0 ${statusVariant(provider.probeStatus)}`}>
          {provider.probeStatus.replaceAll('_', ' ')}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`${provider.key}-executable`}>Executable</Label>
          <Input
            id={`${provider.key}-executable`}
            value={executablePath}
            onChange={event => setExecutablePath(event.target.value)}
            placeholder={provider.key}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${provider.key}-profile`}>Profile</Label>
          <Input
            id={`${provider.key}-profile`}
            value={defaultProfile}
            onChange={event => setDefaultProfile(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${provider.key}-model`}>Model</Label>
          <Input
            id={`${provider.key}-model`}
            value={defaultModel}
            onChange={event => setDefaultModel(event.target.value)}
          />
        </div>
      </div>

      {provider.probeMessage ? <p className="mt-3 text-xs text-muted-foreground">{provider.probeMessage}</p> : null}
      {message ? <p className="mt-3 text-sm text-destructive">{message}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="outline" size="sm" onClick={() => runAction('probe')} disabled={isPending}>
              <RefreshCw className={isPending ? 'size-4 animate-spin' : 'size-4'} />
              Probe
            </Button>
          </TooltipTrigger>
          <TooltipContent>Checks the local provider executable without storing credentials.</TooltipContent>
        </Tooltip>
        <Button type="button" variant="outline" size="sm" onClick={() => runAction('save')} disabled={isPending}>
          <Settings2 className="size-4" />
          Save
        </Button>
        <Button
          type="button"
          variant={provider.enabled ? 'secondary' : 'default'}
          size="sm"
          onClick={() => runAction('toggle')}
          disabled={isPending}
        >
          <Power className="size-4" />
          {provider.enabled ? 'Disable' : 'Enable'}
        </Button>
      </div>
    </div>
  )
}

export function SettingsCodingAgentsPanel({ providers }: { providers: CodingAgentRegistration[] }) {
  return (
    <TooltipProvider>
      <Card className="border-zinc-600/10 bg-zinc-600/10 shadow-none">
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <CardTitle className="flex items-center gap-2 text-primary">
            <Bot className="size-5" />
            Coding Agents
          </CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/provider-runs">
              <ExternalLink className="size-4" />
              Provider Runs
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {providers.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 p-4 text-sm text-muted-foreground">
              No built-in coding agents are registered.
            </div>
          ) : (
            providers.map(provider => <AgentCard key={provider.key} provider={provider} />)
          )}
          <div className="flex items-start gap-2 rounded-lg border border-zinc-800 p-3 text-xs text-muted-foreground">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            Provider authentication stays in each CLI or environment. Appraise stores registration preferences only.
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
