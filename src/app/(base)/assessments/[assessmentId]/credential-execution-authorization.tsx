'use client'

import { ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER,
  CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_VALUE,
} from '@/lib/credential-execution-authorization-ui'

export type CredentialExecutionAuthorizationRequest = {
  requestId: string
  requestHash: string
  expiresAt: string
  target: { displayName: string; id: string }
  assessmentId: string
  publicationFingerprint: string
  runtimeInputHash: string
  environment: { id: string; name: string; baseUrl: string }
  credentialBindings: Array<{ slot: string; reference: string }>
  grant?: Grant | null
}

type Bootstrap = {
  csrfToken: string
  issuerLabel: string
  expiresAt: string
  request?: {
    requestId: string
    requestHash: string
    expiresAt: string
    credentialBindings: Array<{ slot: string; reference: string }>
    grant?: Grant | null
  }
}

type Grant = { grantId: string; expiresAt: string }

function expirationState(expiresAt: string) {
  return new Date(expiresAt).getTime() <= Date.now()
}

function authorizationMessage(error: unknown) {
  if (!(error instanceof Error)) return 'The authorization request could not be completed.'
  if (error.message.includes('AUTHORIZATION_ALREADY_CONSUMED'))
    return 'This one-use authorization has already been consumed and can no longer be revoked.'
  if (error.message.includes('AUTHORIZATION_EXPIRED'))
    return 'This authorization request has expired. Start a fresh run.'
  if (error.message.includes('AUTHORIZATION_REQUEST_CONFLICT'))
    return 'This request was already authorized by another issuer and cannot be changed here.'
  if (error.message.includes('CSRF_HOST_INVALID'))
    return 'The Appraise address did not match this authorization request. Refresh the page and try again.'
  if (error.message.includes('CSRF_ORIGIN_INVALID'))
    return 'This authorization request must be completed from the active Appraise UI origin. Refresh the page and try again.'
  if (error.message.includes('CSRF_UI_BOOTSTRAP_INVALID'))
    return 'This authorization request needs a fresh Appraise UI session. Refresh the page and try again.'
  if (error.message.includes('CSRF_FETCH_SITE_INVALID'))
    return 'Open this authorization request directly in the active Appraise UI and try again.'
  if (error.message.includes('AUTHORIZATION_UI_SESSION_INVALID'))
    return 'This Appraise UI authorization session is no longer valid. Refresh the page and try again.'
  return error.message || 'The authorization request could not be completed.'
}

type RouteErrorBody = {
  code?: string
  error?: string | { message?: string; code?: string }
  message?: string
}

function routeErrorMessage(body: RouteErrorBody, status: number) {
  if (typeof body.code === 'string' && body.code) return body.code
  if (typeof body.error === 'string' && body.error) return body.error
  if (typeof body.error === 'object' && body.error) {
    if (typeof body.error.code === 'string' && body.error.code) return body.error.code
    if (typeof body.error.message === 'string' && body.error.message) return body.error.message
  }
  if (typeof body.message === 'string' && body.message) return body.message
  return `Request failed (${status})`
}

export async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as {
    code?: string
    error?: string | { message?: string; code?: string }
    message?: string
  }
  if (!response.ok) throw new Error(routeErrorMessage(body, response.status))
  return body as T
}

export function CredentialExecutionAuthorization({
  assessmentId,
  request,
}: {
  assessmentId: string
  request: CredentialExecutionAuthorizationRequest
}) {
  const router = useRouter()
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null)
  const [grant, setGrant] = useState<Grant | null>(request.grant ?? null)
  const [message, setMessage] = useState<string | null>(null)
  const [expired, setExpired] = useState(() => expirationState(request.expiresAt))
  const [isPending, startTransition] = useTransition()
  const endpoint = useMemo(
    () =>
      `/api/assessments/${encodeURIComponent(assessmentId)}/credential-execution-authorization?requestId=${encodeURIComponent(request.requestId)}`,
    [assessmentId, request.requestId],
  )

  useEffect(() => {
    const updateExpiration = () => setExpired(expirationState(request.expiresAt))
    updateExpiration()
    const delay = Math.min(2_147_483_647, Math.max(250, new Date(request.expiresAt).getTime() - Date.now() + 1))
    const timeout = window.setTimeout(updateExpiration, delay)
    return () => window.clearTimeout(timeout)
  }, [request.expiresAt])

  const bootstrapSession = async () => {
    if (bootstrap) return bootstrap
    const next = await responseJson<Bootstrap>(
      await fetch(endpoint, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          [CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER]: CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_VALUE,
        },
      }),
    )
    if (!next.request || next.request.requestHash !== request.requestHash)
      throw new Error('Authorization request binding changed. Refresh and review again.')
    setBootstrap(next)
    if (next.request.grant) setGrant(next.request.grant)
    return next
  }

  const authorize = () =>
    startTransition(async () => {
      setMessage(null)
      try {
        if (expirationState(request.expiresAt)) {
          setExpired(true)
          return
        }
        const session = await bootstrapSession()
        const issued = await responseJson<Grant>(
          await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'x-appraise-csrf': session.csrfToken,
              [CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER]: CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_VALUE,
            },
            body: JSON.stringify({ requestId: request.requestId }),
          }),
        )
        setGrant(issued)
        setMessage('Authorization issued. It is restricted to this exact request and can be used once before expiry.')
      } catch (error) {
        setMessage(authorizationMessage(error))
      }
    })

  const revoke = () =>
    startTransition(async () => {
      if (!grant) return
      setMessage(null)
      try {
        const session = await bootstrapSession()
        await responseJson<{ grantId: string; revokedAt: string }>(
          await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'x-appraise-csrf': session.csrfToken,
              [CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER]: CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_VALUE,
            },
            body: JSON.stringify({
              revokeGrantId: grant.grantId,
              reason: 'Revoked from the local Appraise UI session.',
            }),
          }),
        )
        setGrant(null)
        setMessage('Authorization revoked. A fresh credential-execution request is required before execution.')
        router.refresh()
      } catch (error) {
        setMessage(authorizationMessage(error))
      }
    })

  const copyExecutionHandoff = () =>
    startTransition(async () => {
      if (!grant) return
      try {
        await navigator.clipboard.writeText(
          JSON.stringify({
            executionRequestId: request.requestId,
            authorizationGrantId: grant.grantId,
            expectedRequestHash: request.requestHash,
          }),
        )
        setMessage(
          'Bound execution handoff copied. It is a one-use bearer capability; share it only with the intended execution worker.',
        )
      } catch {
        setMessage('Could not copy the bounded execution handoff. Copy the displayed identifiers manually.')
      }
    })

  return (
    <Card className="border-amber-400/35 bg-amber-400/[0.04]" data-testid="credential-execution-authorization">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck aria-hidden="true" className="size-4 text-amber-200" />
            Credential execution authorization required
          </CardTitle>
          <Badge variant="outline">Pending review</Badge>
        </div>
        <CardDescription>
          Confirm this exact credential-bearing execution scope before a worker may use its environment reference.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTitle>Issuer</AlertTitle>
          <AlertDescription>Local Appraise UI session (unauthenticated local possession)</AlertDescription>
        </Alert>
        <dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
          <ScopeValue label="Target" value={`${request.target.displayName} (${request.target.id})`} />
          <ScopeValue label="Assessment" value={request.assessmentId} />
          <ScopeValue label="Environment" value={`${request.environment.name} (${request.environment.id})`} />
          <ScopeValue label="Base URL" value={request.environment.baseUrl} />
          <ScopeValue label="Publication fingerprint" value={request.publicationFingerprint} />
          <ScopeValue label="Runtime input hash" value={request.runtimeInputHash} />
          <ScopeValue label="Request hash" value={request.requestHash} />
          <ScopeValue label="Expires" value={new Date(request.expiresAt).toLocaleString()} />
        </dl>
        <div className="space-y-2">
          <p className="text-sm font-medium">Credential binding references</p>
          <ul className="space-y-1 rounded-md border border-white/[0.08] p-3 font-mono text-xs text-muted-foreground">
            {request.credentialBindings.map(binding => (
              <li key={`${binding.slot}:${binding.reference}`}>{`${binding.slot} → ${binding.reference}`}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">
          This confirms local possession of this Appraise UI session only. It does not assert an authenticated human
          identity.
        </p>
        <AuthorizationStatus expired={expired} grant={grant} message={message} request={request} />
        <AuthorizationActions
          authorize={authorize}
          copyExecutionHandoff={copyExecutionHandoff}
          expired={expired}
          grant={grant}
          isPending={isPending}
          revoke={revoke}
        />
      </CardContent>
    </Card>
  )
}

function AuthorizationStatus({
  expired,
  message,
  grant,
  request,
}: {
  expired: boolean
  message: string | null
  grant: Grant | null
  request: CredentialExecutionAuthorizationRequest
}) {
  return (
    <>
      {expired && (
        <Alert variant="destructive">
          <AlertTitle>Request expired</AlertTitle>
          <AlertDescription>Start a fresh execution request, then review its new binding.</AlertDescription>
        </Alert>
      )}
      {message && <AuthorizationMessage grant={grant} message={message} />}
      {grant && <IssuedGrant grant={grant} request={request} />}
    </>
  )
}

function AuthorizationMessage({ grant, message }: { grant: Grant | null; message: string }) {
  const successful = message.startsWith('Authorization issued') || message.startsWith('Authorization revoked')
  return (
    <Alert variant={successful ? 'default' : 'destructive'}>
      <AlertTitle>{grant ? 'Authorization issued' : 'Authorization status'}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

function IssuedGrant({ grant, request }: { grant: Grant; request: CredentialExecutionAuthorizationRequest }) {
  return (
    <Alert data-testid="credential-execution-grant-summary">
      <AlertTitle>One-use authorization issued</AlertTitle>
      <AlertDescription className="space-y-2">
        <span className="block">Grant expires {new Date(grant.expiresAt).toLocaleString()}.</span>
        <code className="block break-all">grantId: {grant.grantId}</code>
        <code className="block break-all">requestId: {request.requestId}</code>
        <code className="block break-all">requestHash: {request.requestHash}</code>
        <span className="block text-xs">
          This bounded tuple is a one-use bearer capability. Use it only for this exact Assessment execution and do not
          share it outside the intended execution worker.
        </span>
      </AlertDescription>
    </Alert>
  )
}

function AuthorizationActions({
  expired,
  grant,
  isPending,
  authorize,
  revoke,
  copyExecutionHandoff,
}: {
  expired: boolean
  grant: Grant | null
  isPending: boolean
  authorize: () => void
  revoke: () => void
  copyExecutionHandoff: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={expired || isPending || Boolean(grant)} onClick={authorize} type="button">
        Authorize this credential execution
      </Button>
      <Button disabled={!grant || isPending} onClick={revoke} type="button" variant="outline">
        Revoke authorization
      </Button>
      <Button disabled={!grant || isPending} onClick={copyExecutionHandoff} type="button" variant="outline">
        Copy execution handoff
      </Button>
    </div>
  )
}

function ScopeValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-xs">{value}</dd>
    </div>
  )
}

export { authorizationMessage, expirationState }
