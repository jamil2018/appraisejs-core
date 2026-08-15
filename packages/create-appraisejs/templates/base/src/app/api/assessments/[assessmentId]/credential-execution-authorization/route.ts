import { cookies } from 'next/headers'

import prisma from '@/config/db-config'
import { ACTIVE_PROJECT_COOKIE } from '@/lib/project-scope'
import {
  createLocalUiSession,
  issueLocalUiGrant,
  localUiGrantForSession,
  revokeLocalUiCredentialExecutionGrant,
  validateLocalUiSession,
} from '@/services/coordinator/credential-execution-authorization-service'
import { ServiceError } from '@/services/shared/errors'

export const runtime = 'nodejs'

const SESSION_COOKIE = 'appraise-credential-authorization-session'
const CSRF_COOKIE = 'appraise-credential-authorization-csrf'
const CSRF_HEADER = 'x-appraise-csrf'
const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}
const csrfCookieOptions = { ...sessionCookieOptions, httpOnly: false }

function deny(message: string): never {
  throw new ServiceError(message, 'UNAUTHORIZED', 403)
}

async function assessmentForRoute(assessmentId: string) {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, targetProjectId: true },
  })
  if (!assessment) throw new ServiceError('Assessment not found.', 'NOT_FOUND')
  return assessment
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (!origin || !host || fetchSite !== 'same-origin') deny('CSRF_ORIGIN_INVALID')
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    deny('CSRF_ORIGIN_INVALID')
  }
  if (url.host !== host) deny('CSRF_ORIGIN_INVALID')
}

async function authorizedRouteContext(params: Promise<{ assessmentId: string }>) {
  const { assessmentId } = await params
  const assessment = await assessmentForRoute(assessmentId)
  const store = await cookies()
  if (store.get(ACTIVE_PROJECT_COOKIE)?.value !== assessment.targetProjectId) deny('AUTHORIZATION_UI_SESSION_INVALID')
  return { assessmentId, assessment, store }
}

export async function GET(request: Request, { params }: { params: Promise<{ assessmentId: string }> }) {
  assertSameOrigin(request)
  const { assessmentId, assessment, store } = await authorizedRouteContext(params)
  const existingSessionToken = store.get(SESSION_COOKIE)?.value
  const existingCsrfToken = store.get(CSRF_COOKIE)?.value
  let created: Awaited<ReturnType<typeof createLocalUiSession>>
  if (existingSessionToken && existingCsrfToken) {
    try {
      const session = await validateLocalUiSession({ sessionToken: existingSessionToken, csrfToken: existingCsrfToken })
      if (session.targetProjectId !== assessment.targetProjectId) throw new Error('wrong target')
      created = {
        id: session.id,
        sessionToken: existingSessionToken,
        csrfToken: existingCsrfToken,
        expiresAt: session.expiresAt,
      }
    } catch {
      created = await createLocalUiSession(assessment.targetProjectId)
    }
  } else {
    created = await createLocalUiSession(assessment.targetProjectId)
  }
  store.set(SESSION_COOKIE, created.sessionToken, { ...sessionCookieOptions, expires: created.expiresAt })
  store.set(CSRF_COOKIE, created.csrfToken, { ...csrfCookieOptions, expires: created.expiresAt })
  const requestId = new URL(request.url).searchParams.get('requestId')
  const authorizationRequest = requestId
    ? await prisma.assessmentExecutionRequest.findFirst({
        where: { id: requestId, assessmentId, targetProjectId: assessment.targetProjectId },
        include: { bindings: { select: { slot: true, reference: true } } },
      })
    : null
  if (requestId && !authorizationRequest) throw new ServiceError('Authorization request not found.', 'NOT_FOUND')
  return Response.json(
    {
      csrfToken: created.csrfToken,
      issuerLabel: 'Local Appraise UI session (unauthenticated local possession)',
      expiresAt: created.expiresAt.toISOString(),
      ...(authorizationRequest
        ? {
            request: {
              requestId: authorizationRequest.id,
              requestHash: authorizationRequest.requestHash,
              expiresAt: authorizationRequest.expiresAt.toISOString(),
              credentialBindings: authorizationRequest.bindings,
              grant: await localUiGrantForSession({
                requestId: authorizationRequest.id,
                targetProjectId: assessment.targetProjectId,
                sessionToken: created.sessionToken,
                csrfToken: created.csrfToken,
              }),
            },
          }
        : {}),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request, { params }: { params: Promise<{ assessmentId: string }> }) {
  assertSameOrigin(request)
  const { assessmentId, assessment, store } = await authorizedRouteContext(params)
  const body = (await request.json()) as { requestId?: unknown; revokeGrantId?: unknown; reason?: unknown }
  const sessionToken = store.get(SESSION_COOKIE)?.value
  const csrfToken = request.headers.get(CSRF_HEADER)
  if (!sessionToken || !csrfToken) deny('AUTHORIZATION_UI_SESSION_INVALID')
  if (typeof body.revokeGrantId === 'string') {
    if (typeof body.reason !== 'string' || !body.reason.trim())
      throw new ServiceError('Invalid revocation request.', 'VALIDATION')
    return Response.json(
      await revokeLocalUiCredentialExecutionGrant({
        grantId: body.revokeGrantId,
        assessmentId,
        targetProjectId: assessment.targetProjectId,
        sessionToken,
        csrfToken,
        reason: body.reason,
      }),
    )
  }
  if (typeof body.requestId !== 'string') throw new ServiceError('requestId is required.', 'VALIDATION')
  return Response.json(
    await issueLocalUiGrant({
      requestId: body.requestId,
      assessmentId,
      targetProjectId: assessment.targetProjectId,
      sessionToken,
      csrfToken,
    }),
    { status: 201 },
  )
}
