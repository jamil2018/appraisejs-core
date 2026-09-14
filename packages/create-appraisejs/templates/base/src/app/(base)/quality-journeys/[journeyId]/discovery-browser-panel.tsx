'use client'

import { ExternalLink, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

import {
  captureQualityJourneyDiscoveryBrowserReceiptAction,
  confirmQualityJourneyDiscoveryBrowserAccessAction,
  logoutQualityJourneyDiscoveryBrowserAction,
  markQualityJourneyDiscoveryBrowserMissingAccessAction,
  replaceQualityJourneyDiscoveryBrowserContextAction,
  revokeQualityJourneyDiscoveryBrowserAction,
  startQualityJourneyDiscoveryBrowserAction,
} from '../quality-journey-discovery-browser-actions'

type SessionView = {
  id: string
  state: string
  discoveryRevisionId: string
  accessMode: 'ANONYMOUS' | 'AUTHENTICATED_INTENT'
  environmentId: string
  routeId: string
  currentUrl: string
  expiresAt: string | Date
  authFlowId?: string
}

type ReceiptView = { artifactId: string; contentHash: string; observationFacts: string[] }

function data(response: { success?: boolean; data?: unknown }) {
  return response.success && response.data && typeof response.data === 'object'
    ? (response.data as Record<string, unknown>)
    : null
}

function sessionFrom(response: { success?: boolean; data?: unknown }): SessionView | null {
  const value = data(response)
  return value && typeof value.id === 'string' && typeof value.state === 'string' ? (value as SessionView) : null
}

// fallow-ignore-next-line complexity -- one panel intentionally owns the complete ephemeral-session control surface.
export function DiscoveryBrowserPanel({
  journeyId,
  discovery,
}: {
  journeyId: string
  discovery: {
    id: string
    workItemId: string
    environments: Array<{ id: string; name: string }>
    routes: string[]
    authFlows?: Array<{ environmentId: string; flowId: string }>
  } | null
}) {
  const [session, setSession] = useState<SessionView | null>(null)
  const [receipt, setReceipt] = useState<ReceiptView | null>(null)
  const [accessMode, setAccessMode] = useState<'ANONYMOUS' | 'AUTHENTICATED_INTENT'>('ANONYMOUS')
  const [environmentId, setEnvironmentId] = useState(discovery?.environments[0]?.id ?? '')
  const [routeId, setRouteId] = useState(discovery?.routes[0] ?? '')
  const availableAuthFlows = discovery?.authFlows?.filter(flow => flow.environmentId === environmentId) ?? []
  const [authFlowId, setAuthFlowId] = useState(availableAuthFlows[0]?.flowId ?? '')
  const [pending, startTransition] = useTransition()

  if (!discovery) return null
  const binding = session ? { sessionId: session.id, journeyId, discoveryRevisionId: discovery.id } : null
  const terminal = session && ['MISSING_ACCESS', 'EXPIRED', 'LOGGED_OUT', 'REVOKED', 'CLOSED'].includes(session.state)

  const run = (effect: () => Promise<{ success?: boolean; error?: string; data?: unknown }>) =>
    startTransition(async () => {
      const response = await effect()
      const nextSession = sessionFrom(response)
      if (nextSession) setSession(nextSession)
      if (!response.success)
        toast({ title: 'Discovery browser action failed', description: response.error, variant: 'destructive' })
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
          Scoped discovery browser
        </CardTitle>
        <CardDescription>
          Appraise opens an ephemeral target-bound browser. Enter passwords, SSO challenges and MFA only in that
          browser; Appraise actions never accept them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!session ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="discovery-environment">Environment</Label>
              <select
                id="discovery-environment"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={environmentId}
                onChange={event => {
                  setEnvironmentId(event.target.value)
                  setAuthFlowId(
                    discovery.authFlows?.find(flow => flow.environmentId === event.target.value)?.flowId ?? '',
                  )
                }}
              >
                {discovery.environments.map(environment => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name}
                  </option>
                ))}
              </select>
            </div>
            {accessMode === 'AUTHENTICATED_INTENT' ? (
              <div className="space-y-1 md:col-span-3">
                <Label htmlFor="discovery-auth-flow">Authorized sign-in flow</Label>
                <select
                  id="discovery-auth-flow"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={authFlowId}
                  onChange={event => setAuthFlowId(event.target.value)}
                >
                  {availableAuthFlows.map(flow => (
                    <option key={flow.flowId} value={flow.flowId}>
                      {flow.flowId}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="discovery-route">Frozen route</Label>
              <select
                id="discovery-route"
                className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm"
                value={routeId}
                onChange={event => setRouteId(event.target.value)}
              >
                {discovery.routes.map(route => (
                  <option key={route} value={route}>
                    {route}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="discovery-access">Access</Label>
              <select
                id="discovery-access"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={accessMode}
                onChange={event => setAccessMode(event.target.value as typeof accessMode)}
              >
                <option value="ANONYMOUS">Anonymous</option>
                <option value="AUTHENTICATED_INTENT">Human sign-in required</option>
              </select>
            </div>
            <Button
              className="md:col-span-3"
              disabled={pending || !environmentId || !routeId || (accessMode === 'AUTHENTICATED_INTENT' && !authFlowId)}
              onClick={() =>
                run(() =>
                  startQualityJourneyDiscoveryBrowserAction({
                    journeyId,
                    discoveryRevisionId: discovery.id,
                    workItemId: discovery.workItemId,
                    environmentId,
                    routeId,
                    accessMode,
                    ...(accessMode === 'AUTHENTICATED_INTENT' ? { authFlowId } : {}),
                  }),
                )
              }
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" />
              ) : (
                <ExternalLink aria-hidden="true" className="mr-2 size-4" />
              )}
              Open scoped browser
            </Button>
          </div>
        ) : (
          <section className="space-y-4" aria-label="Discovery browser session status">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{session.state.replaceAll('_', ' ')}</Badge>
              <span className="text-xs text-muted-foreground">{session.currentUrl}</span>
            </div>
            {session.accessMode === 'AUTHENTICATED_INTENT' && session.state === 'ACTIVE' ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.05] p-3 text-sm">
                Complete sign-in and MFA directly in the opened target browser. Then confirm only that the scoped page
                is accessible; this does not prove a natural-person identity or expose credentials to Appraise.
                <Button
                  className="mt-3"
                  disabled={pending}
                  onClick={() => run(() => confirmQualityJourneyDiscoveryBrowserAccessAction(binding!))}
                >
                  I can access the scoped page
                </Button>
              </div>
            ) : null}
            {!terminal ? (
              <>
                <Button
                  disabled={
                    pending || (session.accessMode === 'AUTHENTICATED_INTENT' && session.state !== 'ACCESS_CONFIRMED')
                  }
                  onClick={() =>
                    startTransition(async () => {
                      const response = await captureQualityJourneyDiscoveryBrowserReceiptAction({
                        ...binding!,
                        snapshotId: `discovery-snapshot:${crypto.randomUUID()}`,
                      })
                      const value = data(response)
                      const recorded = value?.receipt
                      if (
                        response.success &&
                        typeof value?.artifactId === 'string' &&
                        typeof value.contentHash === 'string' &&
                        recorded &&
                        typeof recorded === 'object' &&
                        Array.isArray((recorded as Record<string, unknown>).observationFacts)
                      )
                        setReceipt({
                          artifactId: value.artifactId,
                          contentHash: value.contentHash,
                          observationFacts: (recorded as { observationFacts: string[] }).observationFacts,
                        })
                      else
                        toast({
                          title: 'Receipt was not recorded',
                          description: response.error,
                          variant: 'destructive',
                        })
                    })
                  }
                >
                  Record Appraise browser receipt
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => markQualityJourneyDiscoveryBrowserMissingAccessAction(binding!))}
                  >
                    Record missing access
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => replaceQualityJourneyDiscoveryBrowserContextAction(binding!))}
                  >
                    Replace context
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => logoutQualityJourneyDiscoveryBrowserAction(binding!))}
                  >
                    Log out and close
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={pending}
                    onClick={() => run(() => revokeQualityJourneyDiscoveryBrowserAction(binding!))}
                  >
                    Revoke
                  </Button>
                </div>
              </>
            ) : null}
            {terminal ? (
              <Button variant="outline" disabled={pending} onClick={() => setSession(null)}>
                Start a fresh session
              </Button>
            ) : null}
          </section>
        )}
        {receipt ? (
          <section className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.05] p-3 text-sm" role="status">
            <p className="font-medium">Appraise browser receipt recorded</p>
            <p className="mt-1 text-muted-foreground">
              Use this exact descriptor in the Scout observation bundle. A host screenshot or browser note cannot
              replace it.
            </p>
            <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(receipt, null, 2)}</pre>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}
