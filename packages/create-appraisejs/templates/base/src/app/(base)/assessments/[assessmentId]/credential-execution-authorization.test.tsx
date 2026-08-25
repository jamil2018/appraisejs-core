// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CredentialExecutionAuthorization,
  authorizationMessage,
  expirationState,
  responseJson,
} from './credential-execution-authorization'
import {
  CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER,
  CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_VALUE,
} from '@/lib/credential-execution-authorization-ui'

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

const request = {
  requestId: 'request-1',
  requestHash: 'sha256:request',
  expiresAt: '2030-01-01T00:00:00.000Z',
  target: { displayName: 'Demo target', id: 'target-1' },
  assessmentId: 'assessment-1',
  publicationFingerprint: 'sha256:publication',
  runtimeInputHash: 'sha256:runtime',
  environment: { id: 'environment-1', name: 'Demo', baseUrl: 'https://demo.example.test' },
  credentialBindings: [{ slot: 'login:password', reference: 'env:DEMO_PASSWORD' }],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('CredentialExecutionAuthorization', () => {
  it('shows the exact pending scope and issues a same-origin CSRF-protected grant without exposing a session token', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          csrfToken: 'csrf-token',
          issuerLabel: 'Local Appraise UI session (unauthenticated local possession)',
          expiresAt: request.expiresAt,
          request: {
            requestId: request.requestId,
            requestHash: request.requestHash,
            expiresAt: request.expiresAt,
            credentialBindings: request.credentialBindings,
          },
        }),
      )
      .mockResolvedValueOnce(json({ grantId: 'grant-1', expiresAt: request.expiresAt }, 201))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()

    render(<CredentialExecutionAuthorization assessmentId="assessment-1" request={request} />)

    expect(screen.getByText('Local Appraise UI session (unauthenticated local possession)')).toBeInTheDocument()
    expect(screen.getByText('sha256:request')).toBeInTheDocument()
    expect(screen.getByText('login:password → env:DEMO_PASSWORD')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Authorize this credential execution' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch.mock.calls[0][0]).toContain('requestId=request-1')
    expect(fetch.mock.calls[0][1]).toMatchObject({
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { [CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER]: CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_VALUE },
    })
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      headers: expect.objectContaining({
        'x-appraise-csrf': 'csrf-token',
        [CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER]: CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_VALUE,
      }),
    })
    expect(fetch.mock.calls[1][1].body).toBe(JSON.stringify({ requestId: 'request-1' }))
    expect(JSON.stringify(fetch.mock.calls)).not.toContain('sessionToken')
    expect(screen.getByText(/Authorization issued\. It is restricted/)).toBeInTheDocument()
  })

  it('reports a consumed one-use authorization and does not imply it can be revoked', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          csrfToken: 'csrf-token',
          issuerLabel: 'Local Appraise UI session (unauthenticated local possession)',
          expiresAt: request.expiresAt,
          request: {
            requestId: request.requestId,
            requestHash: request.requestHash,
            expiresAt: request.expiresAt,
            credentialBindings: [],
          },
        }),
      )
      .mockResolvedValueOnce(json({ grantId: 'grant-1', expiresAt: request.expiresAt }, 201))
      .mockResolvedValueOnce(json({ error: { code: 'AUTHORIZATION_ALREADY_CONSUMED' } }, 409))
    vi.stubGlobal('fetch', fetch)
    const user = userEvent.setup()
    render(<CredentialExecutionAuthorization assessmentId="assessment-1" request={request} />)

    await user.click(screen.getByRole('button', { name: 'Authorize this credential execution' }))
    await screen.findByText(/Authorization issued\. It is restricted/)
    await user.click(screen.getByRole('button', { name: 'Revoke authorization' }))

    expect(await screen.findByText(/already been consumed and can no longer be revoked/)).toBeInTheDocument()
    expect(fetch.mock.calls[2][1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        [CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER]: CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_VALUE,
      }),
    })
  })

  it('renders an expired request as unavailable', () => {
    render(
      <CredentialExecutionAuthorization
        assessmentId="assessment-1"
        request={{ ...request, expiresAt: '2020-01-01T00:00:00.000Z' }}
      />,
    )

    expect(screen.getByText('Request expired')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Authorize this credential execution' })).toBeDisabled()
  })
})

describe('credential authorization helpers', () => {
  it('recognizes expiry and maps replay, expiry, and provenance response codes to clear UI messages', () => {
    expect(expirationState('2020-01-01T00:00:00.000Z')).toBe(true)
    expect(authorizationMessage(new Error('AUTHORIZATION_EXPIRED'))).toMatch(/expired/)
    expect(authorizationMessage(new Error('AUTHORIZATION_REQUEST_CONFLICT'))).toMatch(/another issuer/)
    expect(authorizationMessage(new Error('CSRF_HOST_INVALID'))).toMatch(/Appraise address did not match/)
    expect(authorizationMessage(new Error('CSRF_UI_BOOTSTRAP_INVALID'))).toMatch(/fresh Appraise UI session/)
    expect(authorizationMessage(new Error('CSRF_FETCH_SITE_INVALID'))).toMatch(
      /Open this authorization request directly/,
    )
    expect(authorizationMessage(new Error('CSRF_ORIGIN_INVALID'))).toMatch(/active Appraise UI origin/)
  })

  it('retains a typed string route denial as a failed UI request', async () => {
    await expect(
      responseJson(json({ code: 'CSRF_ORIGIN_INVALID', error: 'CSRF_ORIGIN_INVALID' }, 403)),
    ).rejects.toThrow('CSRF_ORIGIN_INVALID')
    await expect(responseJson(json({ error: { code: 'AUTHORIZATION_EXPIRED' } }, 403))).rejects.toThrow(
      'AUTHORIZATION_EXPIRED',
    )
  })
})
