import { createHash, randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  discoveryAuthTransitPathMatches,
  discoveryAuthTransitPolicyHash,
  parseDiscoveryAuthTransitPolicy,
  resolveDiscoveryAuthTransitOrigin,
  type DiscoveryAuthTransitPolicy,
} from '@/lib/quality-journey/discovery-auth-transit-policy'
import {
  discoveryBrowserReceiptIssuer,
  discoveryBrowserReceiptKind,
  discoveryBrowserReceiptSchema,
  discoveryBrowserVerificationStrength,
  type DiscoveryBrowserReceipt,
  type DiscoveryBrowserSessionState,
  qualityJourneyIdentifierSchema,
} from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'

type Db = PrismaClient | Prisma.TransactionClient

type BrowserFrame = { url(): string }
type BrowserRequest = {
  url(): string
  method(): string
  isNavigationRequest(): boolean
  resourceType(): string
  frame(): BrowserFrame
}
type BrowserResponse = { headers(): Record<string, string>; status(): number }
type BrowserRoute = {
  request(): BrowserRequest
  abort(): Promise<void>
  continue(): Promise<void>
  fetch(options: { maxRedirects: 0 }): Promise<BrowserResponse>
  fulfill(options: { response: BrowserResponse }): Promise<void>
}
type BrowserWebSocketRoute = { url(): string; close(options: { code: number; reason: string }): void }
type BrowserPage = {
  goto(url: string, options?: { waitUntil?: 'domcontentloaded' }): Promise<unknown>
  url(): string
  mainFrame(): BrowserFrame
  title(): Promise<string>
  on(event: 'framenavigated' | 'websocket' | 'download' | 'popup', listener: (value: unknown) => void): void
  close(): Promise<void>
}
type BrowserContext = {
  newPage(): Promise<BrowserPage>
  route(pattern: string, handler: (route: BrowserRoute) => Promise<void>): Promise<unknown>
  routeWebSocket(pattern: string, handler: (route: BrowserWebSocketRoute) => Promise<void>): Promise<unknown>
  close(): Promise<void>
}
type Browser = {
  newContext(options?: { acceptDownloads: false; serviceWorkers: 'block' }): Promise<BrowserContext>
  close(): Promise<void>
}

export type DiscoveryBrowserRuntime = { launch(): Promise<Browser> }

const defaultRuntime: DiscoveryBrowserRuntime = {
  async launch() {
    const { chromium } = await import('playwright')
    // Browser state is deliberately non-persistent and only ever exists in this
    // headed process. Neither a storage state nor a browser profile is accepted.
    const browser = await chromium.launch({ headless: false })
    return {
      async newContext() {
        const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' })
        return {
          newPage: () => context.newPage(),
          route: (pattern, handler) => context.route(pattern, route => handler(route as unknown as BrowserRoute)),
          routeWebSocket: (pattern, handler) =>
            context.routeWebSocket(pattern, route => handler(route as unknown as BrowserWebSocketRoute)),
          close: () => context.close(),
        }
      },
      close: () => browser.close(),
    }
  },
}

const id = qualityJourneyIdentifierSchema
const routeId = z.string().trim().min(1).max(2_000).regex(/^\//)
const startSchema = z
  .object({
    journeyId: id,
    targetProjectId: id,
    discoveryRevisionId: id,
    workItemId: id,
    environmentId: id,
    routeId,
    accessMode: z.enum(['ANONYMOUS', 'AUTHENTICATED_INTENT']),
    authFlowId: z.string().trim().min(1).max(128).optional(),
    ttlSeconds: z.number().int().min(30).max(900).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.accessMode === 'AUTHENTICATED_INTENT' && !value.authFlowId)
      context.addIssue({
        code: 'custom',
        path: ['authFlowId'],
        message: 'Authenticated discovery requires an authorized flow.',
      })
    if (value.accessMode === 'ANONYMOUS' && value.authFlowId)
      context.addIssue({
        code: 'custom',
        path: ['authFlowId'],
        message: 'Anonymous discovery cannot select an auth flow.',
      })
  })
const sessionInputSchema = z
  .object({ sessionId: id, journeyId: id, targetProjectId: id, discoveryRevisionId: id })
  .strict()
const captureSchema = sessionInputSchema.extend({ snapshotId: id }).strict()
const missingAccessSchema = sessionInputSchema

const processInstanceId = `qjdb_process_${randomUUID().replaceAll('-', '')}`
const sessions = new Map<string, Session>()

type Session = {
  id: string
  generation: number
  processInstanceId: string
  journeyId: string
  targetProjectId: string
  cycleId: string
  discoveryRevisionId: string
  workItemId: string
  environmentId: string
  routeId: string
  targetOrigin: string
  allowedRoutes: string[]
  accessMode: 'ANONYMOUS' | 'AUTHENTICATED_INTENT'
  environmentScopeVersion: number
  authFlowId?: string
  authPolicyHash?: string
  authFlow?: DiscoveryAuthTransitPolicy['flows'][number]
  authTransitOutcome?: 'RETURNED_TO_FROZEN_TARGET'
  /** A validated redirect which the browser has not requested yet. */
  pendingMainFrameRequest?: MainFrameTransition
  /** A validated main-frame response which the browser has not committed yet. */
  pendingMainFrameCommit?: MainFrameTransition
  mainFrameDocumentOrigin: string
  state: DiscoveryBrowserSessionState
  expiresAt: Date
  expiryTimer?: ReturnType<typeof setTimeout>
  terminalUrl?: string
  browser: Browser
  context: BrowserContext
  page: BrowserPage
}

type MainFrameTransition = {
  destinationUrl: string
  destinationOrigin: string
  effectiveMethod: string
  sourceOrigin: string
}

type DiscoveryBrowserSession = Omit<
  Session,
  | 'browser'
  | 'context'
  | 'page'
  | 'allowedRoutes'
  | 'expiryTimer'
  | 'authFlow'
  | 'pendingMainFrameRequest'
  | 'pendingMainFrameCommit'
  | 'mainFrameDocumentOrigin'
> & { allowedOrigins: string[]; allowedRoutes: string[]; currentUrl: string }

function canonical(value: unknown) {
  return canonicalContractJson(value)
}
function hash(value: unknown) {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`
}
function idFor(kind: string, ...parts: string[]) {
  return `qjdb_${kind}_${createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 32)}`
}
function stateError(state: DiscoveryBrowserSessionState): ServiceError {
  const code = state === 'EXPIRED' || state === 'REVOKED' ? 'UNAUTHORIZED' : 'CONFLICT'
  return new ServiceError('Discovery browser session is not available for this operation.', code)
}
function sanitizedUrl(value: string) {
  try {
    const parsed = new URL(value)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return 'about:blank'
  }
}
function mainFrameTransition(url: string, effectiveMethod: string, sourceOrigin: string): MainFrameTransition {
  const destination = new URL(url)
  return {
    destinationUrl: sanitizedUrl(url),
    destinationOrigin: destination.origin,
    effectiveMethod: effectiveMethod.toUpperCase(),
    sourceOrigin,
  }
}
function matchesMainFrameTransition(request: BrowserRequest, transition: MainFrameTransition) {
  return (
    sanitizedUrl(request.url()) === transition.destinationUrl &&
    new URL(request.url()).origin === transition.destinationOrigin &&
    request.method().toUpperCase() === transition.effectiveMethod
  )
}
async function withTransaction<T>(client: Db, effect: (tx: Prisma.TransactionClient) => Promise<T>) {
  if ('$transaction' in client && typeof client.$transaction === 'function') return client.$transaction(effect)
  return effect(client)
}
function routeUrl(baseUrl: string, route: string) {
  const base = new URL(baseUrl)
  if (base.username || base.password || base.search || base.hash)
    throw new ServiceError('Discovery target is invalid.', 'CONFLICT')
  const resolved = new URL(route, base)
  if (resolved.origin !== base.origin || resolved.pathname !== route || resolved.search || resolved.hash)
    throw new ServiceError('Discovery route is outside the frozen target scope.', 'CONFLICT')
  return resolved.toString()
}
function requestKind(request: BrowserRequest) {
  if (request.isNavigationRequest()) return 'DOCUMENT' as const
  return ['xhr', 'fetch'].includes(request.resourceType?.().toLowerCase() ?? '')
    ? ('XHR_FETCH' as const)
    : ('SUBRESOURCE' as const)
}
function requestDocumentOrigin(request: BrowserRequest) {
  try {
    return new URL(request.frame?.().url() ?? '').origin
  } catch {
    return 'about:blank'
  }
}
function isTargetRoute(url: URL, session: Session) {
  return url.origin === session.targetOrigin && url.pathname === session.routeId && !url.search && !url.hash
}
function matchesReturn(session: Session, documentOrigin: string, destination: URL, method: string) {
  return Boolean(
    session.authFlow?.returns.some(
      rule =>
        rule.fromOrigin === documentOrigin &&
        rule.targetPath === destination.pathname &&
        rule.methods.includes(method as 'GET' | 'POST'),
    ),
  )
}
function redirectMethod(status: number, requestMethod: string) {
  const method = requestMethod.toUpperCase()
  if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) return 'GET'
  if (status === 301 || status === 302 || status === 307 || status === 308) return method
  return null
}
function allowedRequest(
  url: string,
  method: string,
  session: Session,
  navigation = false,
  documentOrigin = 'about:blank',
  kind: 'DOCUMENT' | 'SUBRESOURCE' | 'XHR_FETCH' = navigation ? 'DOCUMENT' : 'SUBRESOURCE',
) {
  const normalizedMethod = method.toUpperCase()
  if (!isAllowedDiscoveryMethod(normalizedMethod, navigation, session)) return false
  try {
    const parsed = new URL(url)
    return isTargetRoute(parsed, session)
      ? allowsTargetRequest(parsed, normalizedMethod, session, navigation, documentOrigin)
      : allowsAuthTransitRequest(parsed, normalizedMethod, session, documentOrigin, kind)
  } catch {
    return false
  }
}
function isAllowedDiscoveryMethod(method: string, navigation: boolean, session: Session) {
  return (
    ['GET', 'HEAD'].includes(method) ||
    (method === 'POST' && navigation && session.accessMode === 'AUTHENTICATED_INTENT' && session.state === 'ACTIVE')
  )
}
function allowsTargetRequest(
  destination: URL,
  method: string,
  session: Session,
  navigation: boolean,
  documentOrigin: string,
) {
  return (
    (documentOrigin === 'about:blank' && navigation && method === 'GET') ||
    documentOrigin === session.targetOrigin ||
    (session.accessMode === 'AUTHENTICATED_INTENT' &&
      navigation &&
      matchesReturn(session, documentOrigin, destination, method))
  )
}
function allowsAuthTransitRequest(
  destination: URL,
  method: string,
  session: Session,
  documentOrigin: string,
  kind: 'DOCUMENT' | 'SUBRESOURCE' | 'XHR_FETCH',
) {
  if (session.accessMode !== 'AUTHENTICATED_INTENT' || session.state !== 'ACTIVE' || !session.authFlow) return false
  return session.authFlow.rules.some(
    rule =>
      resolveDiscoveryAuthTransitOrigin(rule.documentOrigin, session.targetOrigin) === documentOrigin &&
      resolveDiscoveryAuthTransitOrigin(rule.destinationOrigin, session.targetOrigin) === destination.origin &&
      discoveryAuthTransitPathMatches(rule.path, destination.pathname) &&
      rule.methods.includes(method as 'GET' | 'HEAD' | 'POST') &&
      rule.requestKinds.includes(kind),
  )
}
async function closeSessionResources(session: Session) {
  if (session.expiryTimer) clearTimeout(session.expiryTimer)
  await Promise.allSettled([session.page.close(), session.context.close(), session.browser.close()])
}
async function expireIfNeeded(session: Session) {
  if (session.state === 'ACTIVE' || session.state === 'ACCESS_CONFIRMED') {
    if (session.expiresAt <= new Date()) {
      session.state = 'EXPIRED'
      await closeSessionResources(session)
    }
  }
}
function projection(session: Session): DiscoveryBrowserSession {
  let currentUrl = session.terminalUrl
  if (!currentUrl) {
    try {
      currentUrl = sanitizedUrl(session.page.url())
    } catch {
      currentUrl = 'about:blank'
    }
  }
  return {
    id: session.id,
    generation: session.generation,
    processInstanceId: session.processInstanceId,
    journeyId: session.journeyId,
    targetProjectId: session.targetProjectId,
    cycleId: session.cycleId,
    discoveryRevisionId: session.discoveryRevisionId,
    workItemId: session.workItemId,
    environmentId: session.environmentId,
    routeId: session.routeId,
    targetOrigin: session.targetOrigin,
    allowedOrigins: [
      session.targetOrigin,
      ...(session.authFlow
        ? [
            ...new Set(
              session.authFlow.rules
                .flatMap(rule => [rule.documentOrigin, rule.destinationOrigin])
                .filter(origin => origin !== '$TARGET'),
            ),
          ]
        : []),
    ],
    allowedRoutes: [...session.allowedRoutes],
    accessMode: session.accessMode,
    environmentScopeVersion: session.environmentScopeVersion,
    ...(session.authFlowId ? { authFlowId: session.authFlowId, authPolicyHash: session.authPolicyHash } : {}),
    state: session.state,
    expiresAt: session.expiresAt,
    currentUrl,
  }
}
async function getLiveSession(input: z.infer<typeof sessionInputSchema>) {
  const session = sessions.get(input.sessionId)
  if (!session || session.processInstanceId !== processInstanceId)
    throw new ServiceError('Discovery browser session was not found in this process.', 'NOT_FOUND')
  if (
    session.journeyId !== input.journeyId ||
    session.targetProjectId !== input.targetProjectId ||
    session.discoveryRevisionId !== input.discoveryRevisionId
  )
    throw new ServiceError('Discovery browser session does not match the requested Journey scope.', 'UNAUTHORIZED')
  await expireIfNeeded(session)
  return session
}
async function terminalSnapshot(session: Session) {
  try {
    session.terminalUrl = sanitizedUrl(session.page.url())
  } catch {
    session.terminalUrl = 'about:blank'
  }
}

function scheduleExpiry(session: Session) {
  const delay = Math.max(0, session.expiresAt.getTime() - Date.now())
  session.expiryTimer = setTimeout(() => {
    void (async () => {
      if (session.state !== 'ACTIVE' && session.state !== 'ACCESS_CONFIRMED') return
      await terminalSnapshot(session)
      session.state = 'EXPIRED'
      await closeSessionResources(session)
    })()
  }, delay)
  session.expiryTimer.unref?.()
}

// fallow-ignore-next-line complexity -- exact scope validation is intentionally kept at this trust boundary.
async function loadFrozenScope(
  input: z.infer<typeof startSchema>,
  db: Db,
): Promise<{
  cycleId: string
  targetOrigin: string
  allowedRoutes: string[]
  baseUrl: string
  environmentScopeVersion: number
  authFlow?: DiscoveryAuthTransitPolicy['flows'][number]
  authPolicyHash?: string
}> {
  const [journey, revision, environment] = await Promise.all([
    db.qualityJourney.findFirst({ where: { id: input.journeyId, targetProjectId: input.targetProjectId } }),
    db.qualityJourneyDiscoveryRevision.findFirst({
      where: { id: input.discoveryRevisionId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    }),
    db.environment.findFirst({ where: { id: input.environmentId, targetProjectId: input.targetProjectId } }),
  ])
  if (!journey || !revision || !environment)
    throw new ServiceError('Discovery browser scope was not found.', 'NOT_FOUND')
  if (
    journey.activeDiscoveryRevisionId !== revision.id ||
    journey.activeCycleId !== revision.cycleId ||
    revision.scoutWorkItemId !== input.workItemId
  )
    throw new ServiceError('Discovery browser scope is no longer current.', 'CONFLICT')
  const scope = JSON.parse(revision.scoutScopeJson) as {
    environmentIds?: string[]
    routes?: string[]
    environmentBindings?: Array<{
      environmentId: string
      targetOrigin: string
      scopeVersion: number
      discoveryAuthTransitPolicyJson: string | null
      discoveryAuthTransitPolicyHash: string
    }>
  }
  const frozen = scope.environmentBindings?.find(binding => binding.environmentId === input.environmentId)
  if (!scope.environmentIds?.includes(input.environmentId) || !scope.routes?.includes(input.routeId) || !frozen)
    throw new ServiceError('Discovery browser scope exceeds the frozen Scout authorization.', 'CONFLICT')
  const selectedOrigin = new URL(environment.baseUrl).origin
  if (
    frozen.targetOrigin !== selectedOrigin ||
    frozen.scopeVersion !== environment.scopeVersion ||
    frozen.discoveryAuthTransitPolicyJson !== environment.discoveryAuthTransitPolicyJson ||
    frozen.discoveryAuthTransitPolicyHash !== discoveryAuthTransitPolicyHash(environment.discoveryAuthTransitPolicyJson)
  )
    throw new ServiceError(
      'Discovery browser environment scope is stale; revalidate before using this revision.',
      'CONFLICT',
    )
  let authFlow: DiscoveryAuthTransitPolicy['flows'][number] | undefined
  if (input.accessMode === 'AUTHENTICATED_INTENT') {
    if (!frozen.discoveryAuthTransitPolicyJson)
      throw new ServiceError('No Discovery sign-in flow is authorized.', 'CONFLICT')
    const policy = parseDiscoveryAuthTransitPolicy(JSON.parse(frozen.discoveryAuthTransitPolicyJson), selectedOrigin)
    authFlow = policy.flows.find(flow => flow.flowId === input.authFlowId)
    if (!authFlow) throw new ServiceError('The selected Discovery sign-in flow is not authorized.', 'CONFLICT')
  }
  return {
    cycleId: revision.cycleId,
    targetOrigin: selectedOrigin,
    allowedRoutes: [...scope.routes].sort(),
    baseUrl: environment.baseUrl,
    environmentScopeVersion: frozen.scopeVersion,
    authFlow,
    authPolicyHash: input.accessMode === 'AUTHENTICATED_INTENT' ? frozen.discoveryAuthTransitPolicyHash : undefined,
  }
}

async function assertFrozenScopeStillMatchesSession(session: Session, client: Db) {
  const scope = await loadSessionFrozenScope(session, client)
  if (
    scope.cycleId !== session.cycleId ||
    scope.targetOrigin !== session.targetOrigin ||
    scope.environmentScopeVersion !== session.environmentScopeVersion ||
    scope.authPolicyHash !== session.authPolicyHash ||
    scope.authFlow?.flowId !== session.authFlow?.flowId
  )
    throw new ServiceError('Discovery browser environment scope is stale; revalidate before capture.', 'CONFLICT')
}
function sessionScopeInput(session: Session): z.infer<typeof startSchema> {
  return {
    journeyId: session.journeyId,
    targetProjectId: session.targetProjectId,
    discoveryRevisionId: session.discoveryRevisionId,
    workItemId: session.workItemId,
    environmentId: session.environmentId,
    routeId: session.routeId,
    accessMode: session.accessMode,
    ...(session.authFlowId ? { authFlowId: session.authFlowId } : {}),
  }
}
function loadSessionFrozenScope(session: Session, client: Db) {
  return loadFrozenScope(sessionScopeInput(session), client)
}

async function wireBrowserContainment(context: BrowserContext, getSession: () => Session) {
  await context.route('**/*', route => handleBrowserRoute(route, getSession()))
  await context.routeWebSocket('**', async socket => {
    const session = getSession()
    socket.close({ code: 1008, reason: 'Journey browser policy denied WebSocket' })
    await revokeSession(session, 'REVOKED')
  })
}

function mainFrameRequestOrigin(session: Session, request: BrowserRequest, kind: ReturnType<typeof requestKind>) {
  const mainFrameDocument =
    request.isNavigationRequest() && kind === 'DOCUMENT' && request.frame?.() === session.page.mainFrame()
  if (!mainFrameDocument) return { mainFrameDocument, documentOrigin: requestDocumentOrigin(request) }
  const pending = session.pendingMainFrameRequest
  if (!pending) return { mainFrameDocument, documentOrigin: session.mainFrameDocumentOrigin }
  if (!matchesMainFrameTransition(request, pending)) return null
  session.pendingMainFrameRequest = undefined
  return { mainFrameDocument, documentOrigin: pending.sourceOrigin }
}
function authorizedRedirect(
  response: BrowserResponse,
  request: BrowserRequest,
  session: Session,
  kind: ReturnType<typeof requestKind>,
) {
  const location = response.headers().location
  if (!location || response.status() < 300 || response.status() >= 400) return undefined
  const effectiveMethod = redirectMethod(response.status(), request.method())
  if (!effectiveMethod) return null
  const redirectUrl = new URL(location, request.url()).toString()
  const sourceOrigin = new URL(request.url()).origin
  return allowedRequest(redirectUrl, effectiveMethod, session, request.isNavigationRequest(), sourceOrigin, kind)
    ? mainFrameTransition(redirectUrl, effectiveMethod, sourceOrigin)
    : null
}
async function handleBrowserRoute(requestRoute: BrowserRoute, session: Session) {
  const request = requestRoute.request()
  const kind = requestKind(request)
  const location = mainFrameRequestOrigin(session, request, kind)
  if (
    !location ||
    !allowedRequest(
      request.url(),
      request.method(),
      session,
      request.isNavigationRequest(),
      location.documentOrigin,
      kind,
    )
  ) {
    await requestRoute.abort()
    return
  }
  const response = await requestRoute.fetch({ maxRedirects: 0 })
  const redirect = authorizedRedirect(response, request, session, kind)
  if (redirect === null) {
    await requestRoute.abort()
    return
  }
  if (redirect && location.mainFrameDocument) session.pendingMainFrameRequest = redirect
  if (!redirect && location.mainFrameDocument)
    session.pendingMainFrameCommit = mainFrameTransition(request.url(), request.method(), location.documentOrigin)
  await requestRoute.fulfill({ response })
}

function wirePageContainment(session: Session) {
  session.page.on('framenavigated', frame => void commitMainFrameNavigation(session, frame as BrowserFrame))
  session.page.on('download', value => {
    const download = value as { cancel?: () => Promise<void> }
    void download.cancel?.()
    void revokeSession(session, 'REVOKED')
  })
  session.page.on('popup', value => {
    const popup = value as { close?: () => Promise<void> }
    void popup.close?.()
    void revokeSession(session, 'REVOKED')
  })
}
async function commitMainFrameNavigation(session: Session, frame: BrowserFrame) {
  if (frame !== session.page.mainFrame()) return
  const url = frame.url?.() ?? session.page.url()
  const destination = parseFrameDestination(url)
  const pending = session.pendingMainFrameCommit
  if (!destination || !pending || !matchesCommittedDestination(url, destination, pending)) {
    await revokeSession(session, 'REVOKED')
    return
  }
  session.pendingMainFrameCommit = undefined
  session.mainFrameDocumentOrigin = pending.destinationOrigin
  if (isCommittedAuthorizedReturn(session, pending, destination))
    session.authTransitOutcome = 'RETURNED_TO_FROZEN_TARGET'
}
function parseFrameDestination(url: string) {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}
function matchesCommittedDestination(url: string, destination: URL, pending: MainFrameTransition) {
  return sanitizedUrl(url) === pending.destinationUrl && destination.origin === pending.destinationOrigin
}
function isCommittedAuthorizedReturn(session: Session, pending: MainFrameTransition, destination: URL) {
  return (
    session.accessMode === 'AUTHENTICATED_INTENT' &&
    isTargetRoute(destination, session) &&
    matchesReturn(session, pending.sourceOrigin, destination, pending.effectiveMethod)
  )
}
async function revokeSession(
  session: Session,
  state: Extract<DiscoveryBrowserSessionState, 'REVOKED' | 'LOGGED_OUT' | 'CLOSED'>,
) {
  if (session.state === 'ACTIVE' || session.state === 'ACCESS_CONFIRMED') {
    await terminalSnapshot(session)
    session.state = state
    await closeSessionResources(session)
  }
}

/** Starts a one-process, headed, non-persistent browser context. Its strict
 * input deliberately has no credentials, cookies, storage state, URL, or JS. */
export async function startQualityJourneyDiscoveryBrowserSession(
  input: unknown,
  client: Db = prisma,
  runtime: DiscoveryBrowserRuntime = defaultRuntime,
) {
  const request = startSchema.parse(input)
  const scope = await loadFrozenScope(request, client)
  const browser = await runtime.launch().catch(() => {
    throw new ServiceError('Discovery browser is unavailable.', 'CONFLICT')
  })
  let context: BrowserContext | undefined
  let page: BrowserPage | undefined
  try {
    context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' })
    await wireBrowserContainment(context, () => {
      return session
    })
    page = await context.newPage()
    const session: Session = {
      id: idFor('session', request.journeyId, request.discoveryRevisionId, request.workItemId, randomUUID()),
      generation: 1,
      processInstanceId,
      journeyId: request.journeyId,
      targetProjectId: request.targetProjectId,
      cycleId: scope.cycleId,
      discoveryRevisionId: request.discoveryRevisionId,
      workItemId: request.workItemId,
      environmentId: request.environmentId,
      routeId: request.routeId,
      targetOrigin: scope.targetOrigin,
      allowedRoutes: scope.allowedRoutes,
      accessMode: request.accessMode,
      environmentScopeVersion: scope.environmentScopeVersion,
      authFlowId: request.authFlowId,
      authPolicyHash: scope.authPolicyHash,
      authFlow: scope.authFlow,
      mainFrameDocumentOrigin: 'about:blank',
      state: 'ACTIVE',
      expiresAt: new Date(Date.now() + (request.ttlSeconds ?? 300) * 1_000),
      browser,
      context,
      page,
    }
    wirePageContainment(session)
    await page.goto(routeUrl(scope.baseUrl, request.routeId), { waitUntil: 'domcontentloaded' })
    if (!allowedRequest(page.url(), 'GET', session, true, 'about:blank', 'DOCUMENT'))
      throw new ServiceError('Discovery browser navigation was rejected.', 'CONFLICT')
    sessions.set(session.id, session)
    scheduleExpiry(session)
    return projection(session)
  } catch (error) {
    await Promise.allSettled([page?.close(), context?.close(), browser.close()].filter(Boolean) as Promise<void>[])
    if (error instanceof ServiceError) throw error
    throw new ServiceError('Discovery browser navigation was unavailable.', 'CONFLICT')
  }
}

export async function getQualityJourneyDiscoveryBrowserSession(input: unknown) {
  const request = sessionInputSchema.parse(input)
  return projection(await getLiveSession(request))
}

/** This records that the local human says access is available. It deliberately
 * makes no claim about who they are or what their identity provider attested. */
export async function confirmQualityJourneyDiscoveryBrowserAccess(input: unknown, client: Db = prisma) {
  const request = sessionInputSchema.parse(input)
  const session = await getLiveSession(request)
  if (session.state !== 'ACTIVE' || session.accessMode !== 'AUTHENTICATED_INTENT') throw stateError(session.state)
  const scope = await loadSessionFrozenScope(session, client)
  if (
    scope.cycleId !== session.cycleId ||
    scope.targetOrigin !== session.targetOrigin ||
    scope.environmentScopeVersion !== session.environmentScopeVersion ||
    scope.authPolicyHash !== session.authPolicyHash
  )
    throw new ServiceError('Discovery browser scope is no longer current.', 'CONFLICT')
  const current = new URL(session.page.url())
  if (
    current.origin !== session.targetOrigin ||
    current.pathname !== session.routeId ||
    current.search ||
    current.hash ||
    session.authTransitOutcome !== 'RETURNED_TO_FROZEN_TARGET'
  )
    throw new ServiceError(
      'Authenticated Discovery must return through the authorized flow to the frozen target route.',
      'CONFLICT',
    )
  const blockerId = idFor(
    'blocker',
    session.journeyId,
    session.discoveryRevisionId,
    session.environmentId,
    session.routeId,
  )
  await client.qualityJourneyBlocker.updateMany({
    where: {
      id: blockerId,
      journeyId: session.journeyId,
      targetProjectId: session.targetProjectId,
      reasonCode: 'DISCOVERY_MISSING_ACCESS',
      status: 'ACTIVE',
    },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolutionJson: canonical({
        discoveryRevisionId: session.discoveryRevisionId,
        sessionId: session.id,
        resolution: 'Human confirmed access in a fresh scoped Appraise browser context.',
      }),
    },
  })
  session.state = 'ACCESS_CONFIRMED'
  return projection(session)
}

export async function markQualityJourneyDiscoveryBrowserMissingAccess(input: unknown, client: Db = prisma) {
  const request = missingAccessSchema.parse(input)
  const session = await getLiveSession(request)
  if (session.state !== 'ACTIVE' && session.state !== 'ACCESS_CONFIRMED') throw stateError(session.state)
  await terminalSnapshot(session)
  const blockerId = idFor(
    'blocker',
    session.journeyId,
    session.discoveryRevisionId,
    session.environmentId,
    session.routeId,
  )
  await client.qualityJourneyBlocker.upsert({
    where: { id: blockerId },
    create: {
      id: blockerId,
      journeyId: session.journeyId,
      targetProjectId: session.targetProjectId,
      reasonCode: 'DISCOVERY_MISSING_ACCESS',
      summary: 'The required account does not have access to the scoped discovery route.',
      evidenceJson: canonical({
        issuer: discoveryBrowserReceiptIssuer,
        sessionId: session.id,
        discoveryRevisionId: session.discoveryRevisionId,
        environmentId: session.environmentId,
        routeId: session.routeId,
        observedAt: new Date().toISOString(),
      }),
      responsibleActor: 'HUMAN',
      affectedNodeIdsJson: canonical([session.workItemId]),
      requiredResolution: 'Obtain access, then confirm it in a fresh scoped Appraise browser session.',
      safeResumeCommand: 'quality_journey_discovery_retry',
    },
    update: {
      summary: 'The required account does not have access to the scoped discovery route.',
      status: 'ACTIVE',
      resolvedAt: null,
      resolutionJson: null,
    },
  })
  session.state = 'MISSING_ACCESS'
  await closeSessionResources(session)
  return projection(session)
}

// fallow-ignore-next-line complexity -- capture keeps validation, derivation, and immutable persistence visibly atomic.
export async function captureQualityJourneyDiscoveryBrowserReceipt(input: unknown, client: Db = prisma) {
  const request = captureSchema.parse(input)
  const session = await getLiveSession(request)
  const captureAllowed =
    session.state === 'ACTIVE' || session.state === 'ACCESS_CONFIRMED' || session.state === 'MISSING_ACCESS'
  if (!captureAllowed) throw stateError(session.state)
  if (session.accessMode === 'AUTHENTICATED_INTENT' && session.state === 'ACTIVE')
    throw new ServiceError('Human confirmation is required before authenticated discovery capture.', 'CONFLICT')
  const rawCurrentUrl = session.page.url()
  const currentUrl = sanitizedUrl(rawCurrentUrl)
  let parsed: URL
  try {
    parsed = new URL(rawCurrentUrl)
  } catch {
    throw new ServiceError('Discovery browser capture is outside the permitted target.', 'CONFLICT')
  }
  if (parsed.origin !== session.targetOrigin || parsed.pathname !== session.routeId || parsed.search || parsed.hash)
    throw new ServiceError('Discovery browser capture is outside the permitted target.', 'CONFLICT')
  if (session.accessMode === 'AUTHENTICATED_INTENT' && session.authTransitOutcome !== 'RETURNED_TO_FROZEN_TARGET')
    throw new ServiceError(
      'Authenticated Discovery must return through the authorized flow before capture.',
      'CONFLICT',
    )
  return withTransaction(client, async tx => {
    await assertFrozenScopeStillMatchesSession(session, tx)
    const artifactId = idFor('receipt', session.id, String(session.generation), request.snapshotId)
    const accessOutcome = session.state === 'ACCESS_CONFIRMED' ? 'ACCESS_CONFIRMED' : session.state
    const title = '[not persisted]'
    const facts = [
      `Appraise loaded ${session.routeId} at ${currentUrl}.`,
      'Appraise intentionally did not collect target-controlled page title content.',
      `Appraise observed access outcome ${accessOutcome}.`,
    ]
    const receipt = discoveryBrowserReceiptSchema.parse({
      schemaVersion: 'appraise.discovery-browser-receipt/v1',
      issuer: discoveryBrowserReceiptIssuer,
      verificationStrength: discoveryBrowserVerificationStrength,
      artifactId,
      sessionId: session.id,
      sessionGeneration: session.generation,
      processInstanceId: session.processInstanceId,
      journeyId: session.journeyId,
      targetProjectId: session.targetProjectId,
      cycleId: session.cycleId,
      discoveryRevisionId: session.discoveryRevisionId,
      workItemId: session.workItemId,
      environmentId: session.environmentId,
      environmentScopeVersion: session.environmentScopeVersion,
      routeId: session.routeId,
      snapshotId: request.snapshotId,
      accessMode: session.accessMode,
      ...(session.authFlowId
        ? {
            authFlowId: session.authFlowId,
            authPolicyHash: session.authPolicyHash,
            authTransitOutcome: 'RETURNED_TO_FROZEN_TARGET' as const,
          }
        : {}),
      accessOutcome,
      capturedAt: new Date().toISOString(),
      url: currentUrl,
      title,
      observationFacts: facts,
      observationFactsHash: hash(facts),
      note: 'Human-confirmed browser access records local access only; it does not identify a natural person or attest IdP identity.',
    })
    const contentHash = hash(receipt)
    const identityKey = `discovery-browser-receipt:${session.id}:${session.generation}:${request.snapshotId}`
    const existing = await tx.qualityJourneyArtifact.findUnique({
      where: { journeyId_identityKey: { journeyId: session.journeyId, identityKey } },
    })
    if (existing) {
      if (existing.contentHash !== contentHash || existing.artifactJson !== canonical(receipt))
        throw new ServiceError('Discovery browser receipt identity conflicts.', 'CONFLICT')
    } else {
      await tx.qualityJourneyArtifact.create({
        data: {
          id: idFor('artifact', session.journeyId, artifactId),
          identityKey,
          journeyId: session.journeyId,
          targetProjectId: session.targetProjectId,
          cycleId: session.cycleId,
          kind: discoveryBrowserReceiptKind,
          artifactId,
          contentHash,
          artifactJson: canonical(receipt),
        },
      })
    }
    return { artifactId, contentHash, receipt }
  })
}

export async function logoutQualityJourneyDiscoveryBrowserSession(input: unknown) {
  const request = sessionInputSchema.parse(input)
  const session = await getLiveSession(request)
  await revokeSession(session, 'LOGGED_OUT')
  return projection(session)
}
export async function revokeQualityJourneyDiscoveryBrowserSession(input: unknown) {
  const request = sessionInputSchema.parse(input)
  const session = await getLiveSession(request)
  await revokeSession(session, 'REVOKED')
  return projection(session)
}
export async function closeQualityJourneyDiscoveryBrowserSession(input: unknown) {
  const request = sessionInputSchema.parse(input)
  const session = await getLiveSession(request)
  await revokeSession(session, 'CLOSED')
  return projection(session)
}

export async function replaceQualityJourneyDiscoveryBrowserContext(
  input: unknown,
  client: Db = prisma,
  runtime: DiscoveryBrowserRuntime = defaultRuntime,
) {
  const request = sessionInputSchema.parse(input)
  const previous = await getLiveSession(request)
  if (previous.state !== 'ACTIVE' && previous.state !== 'ACCESS_CONFIRMED') throw stateError(previous.state)
  await terminalSnapshot(previous)
  previous.state = 'CONTEXT_REPLACED'
  await closeSessionResources(previous)
  const replacement = await startQualityJourneyDiscoveryBrowserSession(
    {
      journeyId: previous.journeyId,
      targetProjectId: previous.targetProjectId,
      discoveryRevisionId: previous.discoveryRevisionId,
      workItemId: previous.workItemId,
      environmentId: previous.environmentId,
      routeId: previous.routeId,
      accessMode: previous.accessMode,
      ...(previous.authFlowId ? { authFlowId: previous.authFlowId } : {}),
      ttlSeconds: Math.max(30, Math.floor((previous.expiresAt.getTime() - Date.now()) / 1_000)),
    },
    client,
    runtime,
  )
  const replacementSession = sessions.get(replacement.id)!
  replacementSession.generation = previous.generation + 1
  return replacementSession ? projection(replacementSession) : replacement
}

/** Transaction-local admission used by Scout submission. Host screenshots,
 * arbitrary artifacts, and stale/mismatched browser receipts never qualify. */
// fallow-ignore-next-line complexity -- every receipt binding is checked together at the admission boundary.
export async function assertDiscoveryBrowserReceiptAdmission(
  bundle: {
    cycleId: string
    evidenceReceipts: Array<{ artifactId: string; contentHash: string }>
    targetSnapshot: { snapshotId: string }
    observations: Array<{
      snapshotId: string
      routeId: string
      environmentId: string
      fact: string
      evidenceReceiptIds: string[]
    }>
  },
  revision: { id: string; journeyId: string; targetProjectId: string; cycleId: string; scoutWorkItemId: string },
  tx: Prisma.TransactionClient,
) {
  const descriptors = new Map(bundle.evidenceReceipts.map(receipt => [receipt.artifactId, receipt]))
  const used = new Set(bundle.observations.flatMap(observation => observation.evidenceReceiptIds))
  if (used.size !== descriptors.size || [...descriptors.keys()].some(id => !used.has(id)))
    throw new ServiceError('Scout evidence must contain only referenced Appraise browser receipts.', 'CONFLICT')
  const artifacts = await tx.qualityJourneyArtifact.findMany({
    where: {
      journeyId: revision.journeyId,
      targetProjectId: revision.targetProjectId,
      cycleId: revision.cycleId,
      kind: discoveryBrowserReceiptKind,
      artifactId: { in: [...descriptors.keys()] },
    },
  })
  if (artifacts.length !== descriptors.size)
    throw new ServiceError('Scout evidence receipt is not an Appraise browser receipt.', 'CONFLICT')
  const receipts = new Map<string, DiscoveryBrowserReceipt>()
  for (const artifact of artifacts) {
    const descriptor = descriptors.get(artifact.artifactId)
    if (!descriptor || descriptor.contentHash !== artifact.contentHash)
      throw new ServiceError('Scout evidence receipt hash does not match the immutable artifact.', 'CONFLICT')
    let receipt: DiscoveryBrowserReceipt
    try {
      receipt = discoveryBrowserReceiptSchema.parse(JSON.parse(artifact.artifactJson))
    } catch {
      throw new ServiceError('Scout evidence receipt has invalid Appraise browser provenance.', 'CONFLICT')
    }
    if (
      receipt.issuer !== discoveryBrowserReceiptIssuer ||
      receipt.verificationStrength !== discoveryBrowserVerificationStrength ||
      receipt.artifactId !== artifact.artifactId ||
      artifact.contentHash !== hash(receipt) ||
      receipt.journeyId !== revision.journeyId ||
      receipt.targetProjectId !== revision.targetProjectId ||
      receipt.cycleId !== revision.cycleId ||
      receipt.discoveryRevisionId !== revision.id ||
      receipt.workItemId !== revision.scoutWorkItemId ||
      receipt.observationFactsHash !== hash(receipt.observationFacts) ||
      receipt.accessOutcome === 'MISSING_ACCESS'
    )
      throw new ServiceError('Scout evidence receipt is outside the exact discovery browser scope.', 'CONFLICT')
    if (receipt.accessMode === 'AUTHENTICATED_INTENT') {
      const activeRevision = await tx.qualityJourneyDiscoveryRevision.findFirst({ where: { id: revision.id } })
      const scope = activeRevision
        ? (JSON.parse(activeRevision.scoutScopeJson) as {
            environmentBindings?: Array<{
              environmentId: string
              scopeVersion: number
              discoveryAuthTransitPolicyJson: string | null
              discoveryAuthTransitPolicyHash: string
            }>
          })
        : null
      const binding = scope?.environmentBindings?.find(value => value.environmentId === receipt.environmentId)
      if (
        !binding ||
        receipt.environmentScopeVersion !== binding.scopeVersion ||
        receipt.authPolicyHash !== binding.discoveryAuthTransitPolicyHash ||
        !receipt.authFlowId ||
        !binding.discoveryAuthTransitPolicyJson ||
        !parseDiscoveryAuthTransitPolicy(
          JSON.parse(binding.discoveryAuthTransitPolicyJson),
          receipt.url.startsWith('http') ? new URL(receipt.url).origin : '',
        ).flows.some(flow => flow.flowId === receipt.authFlowId)
      )
        throw new ServiceError('Authenticated Scout evidence receipt has stale transit-policy provenance.', 'CONFLICT')
    }
    receipts.set(receipt.artifactId, receipt)
  }
  for (const observation of bundle.observations) {
    for (const receiptId of observation.evidenceReceiptIds) {
      const receipt = receipts.get(receiptId)
      if (
        !receipt ||
        observation.snapshotId !== bundle.targetSnapshot.snapshotId ||
        receipt.snapshotId !== observation.snapshotId ||
        receipt.routeId !== observation.routeId ||
        receipt.environmentId !== observation.environmentId ||
        !receipt.observationFacts.includes(observation.fact)
      )
        throw new ServiceError('Scout evidence receipt does not bind the observation snapshot and scope.', 'CONFLICT')
    }
  }
}

export async function clearQualityJourneyDiscoveryBrowserSessionsForTest() {
  await Promise.all([...sessions.values()].map(closeSessionResources))
  sessions.clear()
}
