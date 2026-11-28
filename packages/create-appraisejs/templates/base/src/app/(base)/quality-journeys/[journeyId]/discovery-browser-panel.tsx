'use client'

import type { AnonymousDiscoveryCaptureStatus } from '@/services/coordinator/app-managed-discovery-capture'
import type { ManagedScoutEvidenceReviewView } from '@/services/coordinator/app-managed-discovery-evidence'
import { ExternalLink, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { StatusBadge } from '@/components/ui/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

import {
  authorizeQualityJourneyDiscoveryBrowserExactReturnAction,
  captureQualityJourneyDiscoveryBrowserReceiptAction,
  closeQualityJourneyDiscoveryBrowserAction,
  confirmQualityJourneyDiscoveryBrowserAccessAction,
  logoutQualityJourneyDiscoveryBrowserAction,
  markQualityJourneyDiscoveryBrowserMissingAccessAction,
  replaceQualityJourneyDiscoveryBrowserContextAction,
  revokeQualityJourneyDiscoveryBrowserAction,
  reconnectQualityJourneyDiscoveryBrowserAction,
  sealManagedScoutEvidenceReviewAction,
  startQualityJourneyDiscoveryBrowserAction,
} from '../quality-journey-discovery-browser-actions'

type SessionView = {
  id: string
  state: string
  discoveryRevisionId: string
  accessMode: 'ANONYMOUS' | 'AUTHENTICATED_INTENT'
  environmentId: string
  routeId: string
  currentUrl: string | null
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

export function DiscoveryBrowserPanel({
  journeyId,
  discovery,
  automaticStatus,
  managedReview,
}: {
  journeyId: string
  automaticStatus?: AnonymousDiscoveryCaptureStatus
  managedReview?: ManagedScoutEvidenceReviewView | null
  discovery: {
    id: string
    workItemId: string
    environments: Array<{ id: string; name: string }>
    routes: string[]
    authFlows?: Array<{ environmentId: string; flowId: string }>
  } | null
}) {
  const router = useRouter()
  const [session, setSession] = useState<SessionView | null>(null)
  const [receipt, setReceipt] = useState<ReceiptView | null>(null)
  const [returnCommitted, setReturnCommitted] = useState(false)
  const [accessMode, setAccessMode] = useState<'ANONYMOUS' | 'AUTHENTICATED_INTENT'>('ANONYMOUS')
  const [environmentId, setEnvironmentId] = useState(discovery?.environments[0]?.id ?? '')
  const [routeId, setRouteId] = useState(discovery?.routes[0] ?? '')
  const availableAuthFlows = discovery?.authFlows?.filter(flow => flow.environmentId === environmentId) ?? []
  const [authFlowId, setAuthFlowId] = useState(availableAuthFlows[0]?.flowId ?? '')
  const [pending, startTransition] = useTransition()

  if (!discovery || automaticStatus === 'EVIDENCE_AVAILABLE' || automaticStatus === 'INACTIVE') return null
  if (automaticStatus === 'READY' || automaticStatus === 'INSPECTING') return null
  if (automaticStatus === 'RECOVERY_REQUIRED')
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Target inspection stopped before cleanup was confirmed. Use the Journey recovery controls to inspect the
        recorded browser; a new capture is blocked.
      </p>
    )
  const binding = session ? { sessionId: session.id, journeyId, discoveryRevisionId: discovery.id } : null
  const terminal = session && ['MISSING_ACCESS', 'EXPIRED', 'LOGGED_OUT', 'REVOKED', 'CLOSED'].includes(session.state)

  const closeInspectedBrowser = () =>
    startTransition(async () => {
      if (session && !terminal) {
        const response = await closeQualityJourneyDiscoveryBrowserAction(binding!)
        if (!response.success) {
          toast({ title: 'Browser could not be closed', description: response.error, variant: 'destructive' })
          return
        }
      }
      setSession(null)
      setReceipt(null)
      setReturnCommitted(false)
      router.refresh()
    })

  const continueWithInspectedPages = () =>
    startTransition(async () => {
      if (!managedReview?.reviewHash) return
      const response = await sealManagedScoutEvidenceReviewAction({
        journeyId,
        discoveryRevisionId: managedReview.discoveryRevisionId,
        reviewHash: managedReview.reviewHash,
      })
      if (response.success) router.refresh()
      else
        toast({
          title: 'Inspected pages could not be continued',
          description: response.error,
          variant: 'destructive',
        })
    })

  const run = (effect: () => Promise<{ success?: boolean; error?: string; data?: unknown }>) =>
    startTransition(async () => {
      const response = await effect()
      const nextSession = sessionFrom(response)
      if (nextSession) {
        setSession(nextSession)
        if (nextSession.accessMode === 'AUTHENTICATED_INTENT' && nextSession.currentUrl) setReturnCommitted(true)
      }
      if (!response.success)
        toast({ title: 'Discovery browser action failed', description: response.error, variant: 'destructive' })
    })

  const authorizeReturn = () =>
    startTransition(async () => {
      const response = await authorizeQualityJourneyDiscoveryBrowserExactReturnAction(binding!)
      const value = data(response)
      const committedSession = value?.session
      if (
        response.success &&
        value?.return === 'RETURN_COMMITTED' &&
        committedSession &&
        typeof committedSession === 'object'
      ) {
        setSession(committedSession as SessionView)
        setReturnCommitted(true)
      } else
        toast({
          title: 'Exact return did not complete',
          description: response.error,
          variant: 'destructive',
        })
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-5 text-info" />
          Inspect the target app
        </CardTitle>
        <CardDescription>
          {managedReview
            ? 'Inspect each page in the target browser, then review the saved pages before Appraise continues.'
            : 'Choose the page to inspect, or complete the authorized sign-in in the target browser. Appraise continues automatically after the page is captured.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!session ? (
          <div className="grid gap-3 md:grid-cols-3">
            {discovery.environments.length === 1 ? (
              <p className="text-sm">{discovery.environments[0]?.name}</p>
            ) : (
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
            )}
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
            {discovery.routes.length === 1 ? (
              <p className="text-sm">{discovery.routes[0]}</p>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="discovery-route">Page</Label>
                <select
                  id="discovery-route"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm"
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
            )}
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
              onClick={() => {
                setReturnCommitted(false)
                run(() =>
                  startQualityJourneyDiscoveryBrowserAction({
                    journeyId,
                    discoveryRevisionId: discovery.id,
                    workItemId: discovery.workItemId,
                    environmentId,
                    routeId,
                    accessMode,
                    ...(accessMode === 'AUTHENTICATED_INTENT' ? { authFlowId } : {}),
                    ...(accessMode === 'AUTHENTICATED_INTENT' ? { ttlSeconds: 900 } : {}),
                  }),
                )
              }}
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="mr-2 size-4 animate-spin" />
              ) : (
                <ExternalLink aria-hidden="true" className="mr-2 size-4" />
              )}
              Open target app
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() =>
                  reconnectQualityJourneyDiscoveryBrowserAction({ journeyId, discoveryRevisionId: discovery.id }),
                )
              }
            >
              Reconnect to open browser
            </Button>
          </div>
        ) : (
          <section className="space-y-4" aria-label="Discovery browser session status">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={session.state.replaceAll('_', ' ')}
                tone={
                  session.state === 'ACCESS_CONFIRMED'
                    ? 'success'
                    : ['MISSING_ACCESS', 'EXPIRED', 'LOGGED_OUT', 'CONTEXT_REPLACED'].includes(session.state)
                      ? 'warning'
                      : session.state === 'ACTIVE'
                        ? 'info'
                        : 'neutral'
                }
              />
              {session.currentUrl && <span className="text-xs text-muted-foreground">{session.currentUrl}</span>}
            </div>
            {session.accessMode === 'AUTHENTICATED_INTENT' && session.state === 'ACTIVE' ? (
              <div className="rounded-lg border border-warning-border bg-warning-surface p-3 text-sm">
                Complete sign-in and MFA directly in the opened target browser. Appraise never accepts those values.
                {!returnCommitted ? (
                  <>
                    <p className="mt-2">
                      After the provider has reached its approved success page, authorize the one exact return below.
                    </p>
                    <Button className="mt-3" disabled={pending} onClick={authorizeReturn}>
                      Authorize exact return
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="mt-2">
                      Appraise completed the exact return in the owned browser. Confirm access only after you see the
                      protected page there.
                    </p>
                    <Button
                      className="mt-3"
                      disabled={pending}
                      onClick={() => run(() => confirmQualityJourneyDiscoveryBrowserAccessAction(binding!))}
                    >
                      I can access the protected scoped page
                    </Button>
                  </>
                )}
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
                      ) {
                        setReceipt({
                          artifactId: value.artifactId,
                          contentHash: value.contentHash,
                          observationFacts: (recorded as { observationFacts: string[] }).observationFacts,
                        })
                        if (managedReview) router.refresh()
                      } else
                        toast({
                          title: 'Receipt was not recorded',
                          description: response.error,
                          variant: 'destructive',
                        })
                    })
                  }
                >
                  Save page inspection
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
                    onClick={() => {
                      setReturnCommitted(false)
                      run(() => replaceQualityJourneyDiscoveryBrowserContextAction(binding!))
                    }}
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
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setSession(null)
                  setReturnCommitted(false)
                }}
              >
                Start a fresh session
              </Button>
            ) : null}
          </section>
        )}
        {managedReview ? (
          <section className="space-y-3 rounded-lg border border-border p-4" aria-label="Inspected pages review">
            <div className="space-y-1">
              <h3 className="font-medium">Inspected pages</h3>
              <p className="text-sm text-muted-foreground">
                {managedReview.pages.length
                  ? 'These saved page inspections are the exact evidence Appraise will use to continue Discovery.'
                  : 'No page inspections have been saved for this Discovery revision.'}
              </p>
            </div>
            {managedReview.pages.length ? (
              <ol className="space-y-2">
                {managedReview.pages.map(page => {
                  const environment = discovery.environments.find(item => item.id === page.environmentId)
                  return (
                    <li key={page.artifactId} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                      <span className="block break-all font-mono">{page.routeId}</span>
                      <span className="text-muted-foreground">
                        Environment: {environment ? `${environment.name} (${page.environmentId})` : page.environmentId}
                      </span>
                      <span className="block break-all text-xs text-muted-foreground">Receipt: {page.artifactId}</span>
                    </li>
                  )
                })}
              </ol>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {managedReview.reviewHash ? (
                <Button disabled={pending || Boolean(session && !terminal)} onClick={continueWithInspectedPages}>
                  Continue with inspected pages
                </Button>
              ) : null}
              {session && (
                <Button variant="outline" disabled={pending} onClick={closeInspectedBrowser}>
                  {session && !terminal ? 'Close browser and inspect another page' : 'Inspect another page'}
                </Button>
              )}
            </div>
            {!session && managedReview.pages.length ? (
              <p className="text-xs text-muted-foreground">
                Choose another page above and open the target app. Reconnect to an open browser before starting a new
                session.
              </p>
            ) : null}
            {session && !terminal && managedReview.reviewHash ? (
              <p className="text-xs text-muted-foreground">Close the inspected browser before continuing.</p>
            ) : null}
          </section>
        ) : null}
        {receipt ? (
          <section className="rounded-lg border border-success-border bg-success-surface p-3 text-sm" role="status">
            <p className="font-medium text-success">Page inspection saved</p>
            <details>
              <summary className="cursor-pointer text-xs">Inspection details</summary>
              <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(receipt, null, 2)}</pre>
            </details>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}
