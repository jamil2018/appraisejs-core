import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ServiceError } from '@/services/shared/errors'

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  assessmentFindUnique: vi.fn(),
  requestFindFirst: vi.fn(),
  createLocalUiSession: vi.fn(),
  issueLocalUiGrant: vi.fn(),
  revokeLocalUiCredentialExecutionGrant: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('@/config/db-config', () => ({
  default: {
    assessment: { findUnique: mocks.assessmentFindUnique },
    assessmentExecutionRequest: { findFirst: mocks.requestFindFirst },
  },
}))
vi.mock('@/services/coordinator/credential-execution-authorization-service', () => ({
  createLocalUiSession: mocks.createLocalUiSession,
  issueLocalUiGrant: mocks.issueLocalUiGrant,
  revokeLocalUiCredentialExecutionGrant: mocks.revokeLocalUiCredentialExecutionGrant,
}))

import {
  CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER,
  CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_VALUE,
} from '@/lib/credential-execution-authorization-ui'

import * as authorizationRoute from './route'

const { GET, POST } = authorizationRoute

const params = { params: Promise.resolve({ assessmentId: 'assessment-1' }) }
const cookieStore = { get: vi.fn(), set: vi.fn() }
const publicHost = '127.0.0.1:3100'
const originHeaders = {
  origin: `http://${publicHost}`,
  host: publicHost,
  'sec-fetch-site': 'same-origin',
}
const bootstrapHeaders = {
  [CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER]: CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_VALUE,
}
const routeUrl = 'http://localhost:3000/api/assessments/assessment-1/credential-execution-authorization'

describe('credential execution authorization UI route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cookies.mockResolvedValue(cookieStore)
    cookieStore.get.mockImplementation((name: string) =>
      name === 'appraise-active-project' ? { value: 'target-1' } : { value: 'session-token' },
    )
    mocks.assessmentFindUnique.mockResolvedValue({ id: 'assessment-1', targetProjectId: 'target-1' })
    mocks.createLocalUiSession.mockResolvedValue({
      id: 'session-1',
      sessionToken: 'new-session-token',
      csrfToken: 'csrf-token',
      expiresAt: new Date(Date.now() + 60_000),
    })
  })

  it.each([
    ['without Origin or Fetch Metadata', { host: publicHost, ...bootstrapHeaders }],
    ['with an explicit matching Origin and same-site metadata', { ...originHeaders, ...bootstrapHeaders }],
    [
      'with browser navigation Fetch Metadata none',
      { host: publicHost, ...bootstrapHeaders, 'sec-fetch-site': 'none' },
    ],
  ])('allows a same-origin GET session bootstrap %s', async (_label, headers) => {
    const accepted = await GET(new Request(routeUrl, { headers }), params)

    expect(accepted.status).toBe(200)
    expect(mocks.createLocalUiSession).toHaveBeenCalledWith('target-1')
    await expect(accepted.json()).resolves.not.toHaveProperty('sessionToken')
  })

  it('uses the inbound loopback Host as public authority and ignores a spoofed forwarded host', async () => {
    const accepted = await GET(
      new Request(routeUrl, {
        headers: { ...originHeaders, ...bootstrapHeaders, 'x-forwarded-host': 'foreign.test' },
      }),
      params,
    )

    expect(accepted.status).toBe(200)
    expect(mocks.createLocalUiSession).toHaveBeenCalledWith('target-1')
  })

  it.each([
    ['missing bootstrap header', { host: publicHost }, 'CSRF_UI_BOOTSTRAP_INVALID'],
    [
      'wrong bootstrap header',
      { host: publicHost, [CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER]: 'true' },
      'CSRF_UI_BOOTSTRAP_INVALID',
    ],
    [
      'foreign origin with Fetch Metadata none',
      {
        host: publicHost,
        ...bootstrapHeaders,
        origin: 'https://foreign.test',
        'sec-fetch-site': 'none',
      },
      'CSRF_ORIGIN_INVALID',
    ],
    [
      'same-site fetch site',
      { ...originHeaders, ...bootstrapHeaders, 'sec-fetch-site': 'same-site' },
      'CSRF_FETCH_SITE_INVALID',
    ],
    [
      'cross-site fetch site',
      { ...originHeaders, ...bootstrapHeaders, 'sec-fetch-site': 'cross-site' },
      'CSRF_FETCH_SITE_INVALID',
    ],
    [
      'unknown fetch site',
      { ...originHeaders, ...bootstrapHeaders, 'sec-fetch-site': 'same-party' },
      'CSRF_FETCH_SITE_INVALID',
    ],
    ['non-loopback host', { ...originHeaders, ...bootstrapHeaders, host: 'other.test' }, 'CSRF_HOST_INVALID'],
    ['malformed host', { ...originHeaders, ...bootstrapHeaders, host: 'not a host' }, 'CSRF_HOST_INVALID'],
    ['malformed origin', { ...originHeaders, ...bootstrapHeaders, origin: 'not a URL' }, 'CSRF_ORIGIN_INVALID'],
  ])('rejects GET %s as a typed 403', async (_label, headers, code) => {
    const response = await GET(new Request(routeUrl, { headers }), params)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ code, error: code })
    expect(mocks.createLocalUiSession).not.toHaveBeenCalled()
  })

  it.each([
    ['missing bootstrap header', { host: publicHost }, 'CSRF_UI_BOOTSTRAP_INVALID'],
    [
      'wrong bootstrap header',
      { host: publicHost, [CREDENTIAL_AUTHORIZATION_UI_BOOTSTRAP_HEADER]: 'true' },
      'CSRF_UI_BOOTSTRAP_INVALID',
    ],
    [
      'foreign origin with Fetch Metadata none',
      {
        host: publicHost,
        ...bootstrapHeaders,
        origin: 'https://foreign.test',
        'sec-fetch-site': 'none',
      },
      'CSRF_ORIGIN_INVALID',
    ],
    ['malformed origin', { ...originHeaders, ...bootstrapHeaders, origin: 'not a URL' }, 'CSRF_ORIGIN_INVALID'],
    [
      'same-site fetch site',
      { ...originHeaders, ...bootstrapHeaders, 'sec-fetch-site': 'same-site' },
      'CSRF_FETCH_SITE_INVALID',
    ],
    [
      'cross-site fetch site',
      { ...originHeaders, ...bootstrapHeaders, 'sec-fetch-site': 'cross-site' },
      'CSRF_FETCH_SITE_INVALID',
    ],
    [
      'unknown fetch site',
      { ...originHeaders, ...bootstrapHeaders, 'sec-fetch-site': 'same-party' },
      'CSRF_FETCH_SITE_INVALID',
    ],
    ['non-loopback host', { ...originHeaders, ...bootstrapHeaders, host: 'other.test' }, 'CSRF_HOST_INVALID'],
  ])('rejects POST %s as a typed 403', async (_label, headers, code) => {
    const response = await POST(
      new Request(routeUrl, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json', 'x-appraise-csrf': 'csrf-token' },
        body: JSON.stringify({ requestId: 'request-1' }),
      }),
      params,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ code, error: code })
    expect(mocks.issueLocalUiGrant).not.toHaveBeenCalled()
  })

  it.each([
    [
      'foreign active project',
      (name: string) => (name === 'appraise-active-project' ? { value: 'foreign' } : undefined),
    ],
    [
      'missing CSRF header',
      (name: string) => (name === 'appraise-active-project' ? { value: 'target-1' } : { value: 'session-token' }),
    ],
    [
      'missing session cookie',
      (name: string) => (name === 'appraise-active-project' ? { value: 'target-1' } : undefined),
    ],
  ])('returns typed 403 for %s before local UI issuance', async (_label, getCookie) => {
    cookieStore.get.mockImplementation(getCookie)
    const headers =
      _label === 'missing CSRF header'
        ? { host: publicHost, ...bootstrapHeaders, 'sec-fetch-site': 'none', 'content-type': 'application/json' }
        : {
            host: publicHost,
            ...bootstrapHeaders,
            'sec-fetch-site': 'none',
            'content-type': 'application/json',
            'x-appraise-csrf': 'csrf-token',
          }
    const response = await POST(
      new Request(routeUrl, { method: 'POST', headers, body: JSON.stringify({ requestId: 'request-1' }) }),
      params,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      code: 'AUTHORIZATION_UI_SESSION_INVALID',
      error: 'AUTHORIZATION_UI_SESSION_INVALID',
    })
    expect(mocks.issueLocalUiGrant).not.toHaveBeenCalled()
  })

  it('issues a grant with the explicit bootstrap header and browser navigation Fetch Metadata none', async () => {
    mocks.issueLocalUiGrant.mockResolvedValue({ grantId: 'grant-1', requestId: 'request-1' })
    const response = await POST(
      new Request(routeUrl, {
        method: 'POST',
        headers: {
          host: publicHost,
          ...bootstrapHeaders,
          'sec-fetch-site': 'none',
          'content-type': 'application/json',
          'x-appraise-csrf': 'csrf-token',
        },
        body: JSON.stringify({ requestId: 'request-1' }),
      }),
      params,
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ grantId: 'grant-1', requestId: 'request-1' })
    expect(mocks.issueLocalUiGrant).toHaveBeenCalledWith({
      requestId: 'request-1',
      assessmentId: 'assessment-1',
      targetProjectId: 'target-1',
      sessionToken: 'session-token',
      csrfToken: 'csrf-token',
    })
  })

  it('scopes local UI revocation to the active assessment, target, and session with Fetch Metadata none', async () => {
    mocks.revokeLocalUiCredentialExecutionGrant.mockResolvedValue({
      grantId: 'grant-1',
      revokedAt: new Date().toISOString(),
    })
    const response = await POST(
      new Request(routeUrl, {
        method: 'POST',
        headers: {
          host: publicHost,
          ...bootstrapHeaders,
          'sec-fetch-site': 'none',
          'content-type': 'application/json',
          'x-appraise-csrf': 'csrf-token',
        },
        body: JSON.stringify({ revokeGrantId: 'grant-1', reason: 'operator request' }),
      }),
      params,
    )
    expect(response.status).toBe(200)
    expect(mocks.revokeLocalUiCredentialExecutionGrant).toHaveBeenCalledWith({
      grantId: 'grant-1',
      assessmentId: 'assessment-1',
      targetProjectId: 'target-1',
      sessionToken: 'session-token',
      csrfToken: 'csrf-token',
      reason: 'operator request',
    })
  })

  it('rejects a foreign authorization request scope after bootstrap authentication', async () => {
    mocks.issueLocalUiGrant.mockRejectedValueOnce(
      new ServiceError('AUTHORIZATION_REQUEST_SCOPE_INVALID', 'UNAUTHORIZED', 403),
    )
    const response = await POST(
      new Request(routeUrl, {
        method: 'POST',
        headers: {
          host: publicHost,
          ...bootstrapHeaders,
          'content-type': 'application/json',
          'x-appraise-csrf': 'csrf-token',
        },
        body: JSON.stringify({ requestId: 'foreign-request' }),
      }),
      params,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      code: 'AUTHORIZATION_REQUEST_SCOPE_INVALID',
      error: 'AUTHORIZATION_REQUEST_SCOPE_INVALID',
    })
  })

  it('sanitizes unknown route failures as a 500 response', async () => {
    mocks.assessmentFindUnique.mockRejectedValueOnce(new Error('database password leaked'))

    const response = await GET(new Request(routeUrl, { headers: { ...originHeaders, ...bootstrapHeaders } }), params)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      code: 'INTERNAL',
      error: 'Credential authorization request failed.',
    })
  })

  it('does not expose OPTIONS or permissive CORS on the bootstrap route', async () => {
    expect('OPTIONS' in authorizationRoute).toBe(false)
    const response = await GET(new Request(routeUrl, { headers: bootstrapHeaders }), params)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
  })
})
