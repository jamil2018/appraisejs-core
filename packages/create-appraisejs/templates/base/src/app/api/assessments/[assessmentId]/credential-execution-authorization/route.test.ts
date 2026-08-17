import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { GET, POST } from './route'

const params = { params: Promise.resolve({ assessmentId: 'assessment-1' }) }
const cookieStore = { get: vi.fn(), set: vi.fn() }
const originHeaders = {
  origin: 'https://appraise.test',
  host: 'appraise.test',
  'sec-fetch-site': 'same-origin',
}

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

  it('requires same-origin browser context before minting a UI session', async () => {
    await expect(
      GET(new Request('https://appraise.test/api/assessments/assessment-1/credential-execution-authorization'), params),
    ).rejects.toThrow('CSRF_ORIGIN_INVALID')
    expect(mocks.createLocalUiSession).not.toHaveBeenCalled()

    const accepted = await GET(
      new Request('https://appraise.test/api/assessments/assessment-1/credential-execution-authorization', {
        headers: originHeaders,
      }),
      params,
    )
    expect(accepted.status).toBe(200)
    expect(mocks.createLocalUiSession).toHaveBeenCalledWith('target-1')
    await expect(accepted.json()).resolves.not.toHaveProperty('sessionToken')
  })

  it('requires the active target cookie and CSRF token before local UI issuance', async () => {
    cookieStore.get.mockImplementation((name: string) =>
      name === 'appraise-active-project' ? { value: 'foreign' } : undefined,
    )
    await expect(
      POST(
        new Request('https://appraise.test/api/assessments/assessment-1/credential-execution-authorization', {
          method: 'POST',
          headers: { ...originHeaders, 'content-type': 'application/json', 'x-appraise-csrf': 'csrf-token' },
          body: JSON.stringify({ requestId: 'request-1' }),
        }),
        params,
      ),
    ).rejects.toThrow('AUTHORIZATION_UI_SESSION_INVALID')
    expect(mocks.issueLocalUiGrant).not.toHaveBeenCalled()
  })

  it('scopes local UI revocation to the active assessment, target, and session', async () => {
    mocks.revokeLocalUiCredentialExecutionGrant.mockResolvedValue({
      grantId: 'grant-1',
      revokedAt: new Date().toISOString(),
    })
    const response = await POST(
      new Request('https://appraise.test/api/assessments/assessment-1/credential-execution-authorization', {
        method: 'POST',
        headers: { ...originHeaders, 'content-type': 'application/json', 'x-appraise-csrf': 'csrf-token' },
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
})
