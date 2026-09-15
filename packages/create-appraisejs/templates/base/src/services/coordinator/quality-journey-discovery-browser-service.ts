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
  /** Incremented before any lifecycle or return-authority change. */
  authorityEpoch: number
  /** A process-local compare-and-swap reservation around an awaited lifecycle mutation. */
  operation?: SessionOperation
  authTransitOutcome?: 'RETURNED_TO_FROZEN_TARGET'
  /** Process-local, one-shot human address-bar return authorization. */
  humanReturnGrant?: HumanReturnGrant
  /** Bounded proof retained only after the exact granted target commit. */
  humanReturn?: HumanReturnProvenance
  humanReturnTimer?: ReturnType<typeof setTimeout>
  /** One neutral pre-request frame transition is tolerated for the exact grant. */
  humanReturnNeutralFrameSeen?: boolean
  /** A validated redirect which the browser has not requested yet. */
  pendingMainFrameRequest?: MainFrameTransition
  /** A validated main-frame response which the browser has not committed yet. */
  pendingMainFrameCommit?: MainFrameTransition
  mainFrameDocumentOrigin: string
  /** Full committed URL hash; transient duplicate-event guard only. */
  lastAuthorizedMainFrameCommitHash?: string
  state: DiscoveryBrowserSessionState
  expiresAt: Date
  expiryTimer?: ReturnType<typeof setTimeout>
  terminalUrl?: string
  /** Transient qualification diagnostic; never projected, persisted, or receipted. */
  terminalCause?: DiscoveryBrowserTerminalCause
  browser: Browser
  context: BrowserContext
  page: BrowserPage
}

type DiscoveryBrowserTerminalCause =
  | 'WEBSOCKET_DENIED'
  | 'DOWNLOAD'
  | 'POPUP'
  | 'MAIN_FRAME_NO_PENDING'
  | 'MAIN_FRAME_MISMATCH'
  | 'USER_REVOKE'
  | 'HUMAN_RETURN_DENIED'
  | 'ROUTE_NOT_ACTIVE'
  | 'ROUTE_ORIGIN_MISMATCH'
  | 'ROUTE_OPERATION_FAILED'
  | 'REDIRECT_DENIED'

type MainFrameTransition = {
  destinationUrl: string
  destinationOrigin: string
  effectiveMethod: string
  sourceOrigin: string
  authorityEpoch: number
  humanReturnGrantId?: string
}

type MainFrameNavigation = {
  url: string
  destination: URL | undefined
  pending: MainFrameTransition | undefined
}

type HumanReturnGrant = {
  grantId: string
  targetUrl: string
  expiresAt: Date
  state: 'ARMED' | 'CONSUMED' | 'RETURNED'
}

type HumanReturnProvenance = {
  mechanism: 'EXPLICIT_ONE_SHOT_EXACT_TARGET_V1'
  authorizationId: string
  targetUrlHash: string
  method: 'GET'
  committedAt: string
}

type SessionOperation = {
  id: string
  kind: 'CONFIRM_ACCESS' | 'CAPTURE_RECEIPT'
  authorityEpoch: number
}

type FrozenEnvironmentBinding = {
  environmentId: string
  targetOrigin: string
  scopeVersion: number
  discoveryAuthTransitPolicyJson: string | null
  discoveryAuthTransitPolicyHash: string
}

type DiscoveryBrowserSession = Omit<
  Session,
  | 'browser'
  | 'context'
  | 'page'
  | 'allowedRoutes'
  | 'expiryTimer'
  | 'humanReturnTimer'
  | 'authFlow'
  | 'humanReturnGrant'
  | 'humanReturn'
  | 'humanReturnNeutralFrameSeen'
  | 'authorityEpoch'
  | 'operation'
  | 'pendingMainFrameRequest'
  | 'pendingMainFrameCommit'
  | 'mainFrameDocumentOrigin'
  | 'lastAuthorizedMainFrameCommitHash'
  | 'terminalCause'
> & { allowedOrigins: string[]; allowedRoutes: string[]; currentUrl: string }

function canonical(value: unknown) {
  return canonicalContractJson(value)
}
function hash(value: unknown) {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`
}
function committedUrlHash(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
function idFor(kind: string, ...parts: string[]) {
  return `qjdb_${kind}_${createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 32)}`
}
function stateError(state: DiscoveryBrowserSessionState): ServiceError {
  const code = state === 'EXPIRED' || state === 'REVOKED' ? 'UNAUTHORIZED' : 'CONFLICT'
  return new ServiceError('Discovery browser session is not available for this operation.', code)
}
function sanitizedUrl(value: string) {
  if (value === 'about:blank') return value
  try {
    const parsed = new URL(value)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return 'about:blank'
  }
}
function mainFrameTransition(
  url: string,
  effectiveMethod: string,
  sourceOrigin: string,
  authorityEpoch: number,
  humanReturnGrantId?: string,
): MainFrameTransition {
  const destination = new URL(url)
  return {
    destinationUrl: sanitizedUrl(url),
    destinationOrigin: destination.origin,
    effectiveMethod: effectiveMethod.toUpperCase(),
    sourceOrigin,
    authorityEpoch,
    ...(humanReturnGrantId ? { humanReturnGrantId } : {}),
  }
}
function invalidateSessionAuthority(session: Session) {
  session.authorityEpoch += 1
  session.operation = undefined
  session.pendingMainFrameRequest = undefined
  session.pendingMainFrameCommit = undefined
}
function isLiveSessionState(state: DiscoveryBrowserSessionState) {
  return state === 'ACTIVE' || state === 'ACCESS_CONFIRMED'
}
function isActiveAtAuthorityEpoch(session: Session, authorityEpoch: number) {
  return isLiveSessionState(session.state) && session.authorityEpoch === authorityEpoch
}
function assertActiveAtAuthorityEpoch(session: Session, authorityEpoch: number) {
  if (!isLiveSessionState(session.state)) throw stateError(session.state)
  if (session.authorityEpoch !== authorityEpoch)
    throw new ServiceError('Discovery browser authority changed while the operation was in flight.', 'CONFLICT')
}
function reserveSessionOperation(session: Session, kind: SessionOperation['kind']) {
  if (!isLiveSessionState(session.state)) throw stateError(session.state)
  if (session.operation)
    throw new ServiceError('Discovery browser lifecycle operation is already in progress.', 'CONFLICT')
  const operation = { id: randomUUID(), kind, authorityEpoch: session.authorityEpoch }
  session.operation = operation
  return operation
}
function assertCurrentSessionOperation(session: Session, operation: SessionOperation) {
  assertActiveAtAuthorityEpoch(session, operation.authorityEpoch)
  if (session.operation?.id !== operation.id)
    throw new ServiceError('Discovery browser lifecycle operation is no longer current.', 'CONFLICT')
}
function releaseSessionOperation(session: Session, operation: SessionOperation) {
  if (session.operation?.id === operation.id) session.operation = undefined
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
    (!session.humanReturnGrant &&
      session.accessMode === 'AUTHENTICATED_INTENT' &&
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
  if (
    session.humanReturnGrant ||
    session.accessMode !== 'AUTHENTICATED_INTENT' ||
    session.state !== 'ACTIVE' ||
    !session.authFlow
  )
    return false
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
  if (session.humanReturnTimer) clearTimeout(session.humanReturnTimer)
  await Promise.allSettled([session.page.close(), session.context.close(), session.browser.close()])
}
function snapshotTerminalUrl(session: Session) {
  try {
    session.terminalUrl = sanitizedUrl(session.page.url())
  } catch {
    session.terminalUrl = 'about:blank'
  }
}
function beginTerminalSessionTransition(
  session: Session,
  state: Exclude<DiscoveryBrowserSessionState, 'ACTIVE' | 'ACCESS_CONFIRMED'>,
  triggeringMainFrameUrl?: string,
) {
  if (!isLiveSessionState(session.state)) return false
  invalidateSessionAuthority(session)
  session.state = state
  snapshotTerminalUrl(session)
  if (triggeringMainFrameUrl) session.terminalUrl = sanitizedUrl(triggeringMainFrameUrl)
  return true
}
async function expireIfNeeded(session: Session) {
  if (session.expiresAt <= new Date() && beginTerminalSessionTransition(session, 'EXPIRED'))
    await closeSessionResources(session)
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
    allowedOrigins: session.humanReturnGrant
      ? session.humanReturnGrant.state === 'RETURNED'
        ? [session.targetOrigin]
        : []
      : [
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
function scheduleExpiry(session: Session) {
  const delay = Math.max(0, session.expiresAt.getTime() - Date.now())
  session.expiryTimer = setTimeout(() => {
    void (async () => {
      if (beginTerminalSessionTransition(session, 'EXPIRED')) await closeSessionResources(session)
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
    environmentBindings?: FrozenEnvironmentBinding[]
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

async function assertFrozenScopeStillMatchesSession(
  session: Session,
  client: Db,
  message = 'Discovery browser environment scope is stale; revalidate before capture.',
) {
  const scope = await loadSessionFrozenScope(session, client)
  if (
    scope.cycleId !== session.cycleId ||
    scope.targetOrigin !== session.targetOrigin ||
    scope.environmentScopeVersion !== session.environmentScopeVersion ||
    scope.authPolicyHash !== session.authPolicyHash ||
    scope.authFlow?.flowId !== session.authFlow?.flowId
  )
    throw new ServiceError(message, 'CONFLICT')
  return scope
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

function humanReturnGrantId(session: Session) {
  return idFor('human-return', session.id, String(session.generation))
}
function mayArmHumanReturnFromCommittedOrigin(session: Session) {
  if (!session.authFlow || session.mainFrameDocumentOrigin === session.targetOrigin) return false
  const target = new URL(routeUrl(session.targetOrigin, session.routeId))
  return matchesReturn(session, session.mainFrameDocumentOrigin, target, 'GET')
}
function isActiveHumanReturnGrant(session: Session) {
  const grant = session.humanReturnGrant
  return grant?.state === 'ARMED' || grant?.state === 'CONSUMED'
}
function isExactHumanReturnRequest(session: Session, request: BrowserRequest, kind: ReturnType<typeof requestKind>) {
  const grant = session.humanReturnGrant
  if (!isArmedHumanReturnGrant(grant) || !isExactHumanReturnDocument(session, request, kind, grant)) return undefined
  // This state change happens before route.fetch() so concurrent route handlers
  // can never each spend the same return grant.
  grant.state = 'CONSUMED'
  return mainFrameTransition(
    grant.targetUrl,
    'GET',
    session.mainFrameDocumentOrigin,
    session.authorityEpoch,
    grant.grantId,
  )
}
function isArmedHumanReturnGrant(grant: HumanReturnGrant | undefined): grant is HumanReturnGrant {
  return Boolean(grant && grant.state === 'ARMED' && grant.expiresAt > new Date())
}
function isExactHumanReturnDocument(
  session: Session,
  request: BrowserRequest,
  kind: ReturnType<typeof requestKind>,
  grant: HumanReturnGrant,
) {
  if (!isMainFrameGetDocument(session, request, kind)) return false
  return isExactCredentialFreeUrl(request.url(), grant.targetUrl)
}
function isMainFrameGetDocument(session: Session, request: BrowserRequest, kind: ReturnType<typeof requestKind>) {
  return (
    request.isNavigationRequest() &&
    kind === 'DOCUMENT' &&
    request.frame() === session.page.mainFrame() &&
    request.method().toUpperCase() === 'GET'
  )
}
function isExactCredentialFreeUrl(value: string, expected: string) {
  try {
    const destination = new URL(value)
    return (
      destination.toString() === expected &&
      !destination.username &&
      !destination.password &&
      !destination.search &&
      !destination.hash
    )
  } catch {
    return false
  }
}
async function denyHumanReturnRequest(
  session: Session,
  route: BrowserRoute,
  cause: Extract<DiscoveryBrowserTerminalCause, 'HUMAN_RETURN_DENIED' | 'REDIRECT_DENIED'> = 'HUMAN_RETURN_DENIED',
) {
  setTerminalCause(session, cause)
  await abortRouteFailClosed(session, route)
}
async function abortRouteFailClosed(session: Session, route: BrowserRoute) {
  // Authority is fenced synchronously. A Playwright abort can reject or never
  // settle while the page closes, but it must never leave this context usable.
  const transitioned = beginTerminalSessionTransition(session, 'REVOKED')
  const routeAbort = Promise.resolve().then(() => route.abort())
  const cleanup = transitioned ? closeSessionResources(session) : Promise.resolve()
  await Promise.allSettled([routeAbort, cleanup])
}
async function handleHumanReturnRoute(
  route: BrowserRoute,
  session: Session,
  kind: ReturnType<typeof requestKind>,
  authorityEpoch: number,
) {
  const transition = isExactHumanReturnRequest(session, route.request(), kind)
  if (!transition) return denyHumanReturnRequest(session, route)
  const response = await route.fetch({ maxRedirects: 0 })
  if (!isActiveAtAuthorityEpoch(session, authorityEpoch)) return denyRouteNotActive(session, route)
  if (response.status() >= 300 && response.status() < 400)
    return denyHumanReturnRequest(session, route, 'REDIRECT_DENIED')
  session.pendingMainFrameCommit = transition
  await route.fulfill({ response })
}
function scheduleHumanReturnExpiry(session: Session, grantId: string) {
  const grant = session.humanReturnGrant
  if (!grant || grant.grantId !== grantId) return
  const delay = Math.max(0, grant.expiresAt.getTime() - Date.now())
  session.humanReturnTimer = setTimeout(() => {
    void (async () => {
      const active = session.humanReturnGrant
      if (active?.grantId !== grantId || active.state === 'RETURNED') return
      await revokeSession(session, 'REVOKED')
    })()
  }, delay)
  session.humanReturnTimer.unref?.()
}

async function wireBrowserContainment(context: BrowserContext, getSession: () => Session) {
  await context.route('**/*', route => handleBrowserRoute(route, getSession()))
  await context.routeWebSocket('**', async socket => {
    const session = getSession()
    socket.close({ code: 1008, reason: 'Journey browser policy denied WebSocket' })
    setTerminalCause(session, 'WEBSOCKET_DENIED')
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
  let redirectUrl: string
  try {
    redirectUrl = new URL(location, request.url()).toString()
  } catch {
    return null
  }
  const sourceOrigin = new URL(request.url()).origin
  return allowedRequest(redirectUrl, effectiveMethod, session, request.isNavigationRequest(), sourceOrigin, kind)
    ? mainFrameTransition(redirectUrl, effectiveMethod, sourceOrigin, session.authorityEpoch)
    : null
}
async function handleBrowserRoute(requestRoute: BrowserRoute, session: Session) {
  try {
    const authorityEpoch = session.authorityEpoch
    const request = requestRoute.request()
    const kind = requestKind(request)
    if (!isActiveAtAuthorityEpoch(session, authorityEpoch)) return denyRouteNotActive(session, requestRoute)
    if (isActiveHumanReturnGrant(session)) {
      await handleHumanReturnRoute(requestRoute, session, kind, authorityEpoch)
      return
    }
    const location = mainFrameRequestOrigin(session, request, kind)
    if (!location) {
      setTerminalCause(session, 'ROUTE_ORIGIN_MISMATCH')
      await abortRouteFailClosed(session, requestRoute)
      return
    }
    if (!isAllowedBrowserRoute(session, request, kind, location)) {
      await denyOrdinaryRoute(requestRoute)
      return
    }
    await fulfillAllowedBrowserRoute(requestRoute, session, request, kind, location, authorityEpoch)
  } catch {
    setTerminalCause(session, 'ROUTE_OPERATION_FAILED')
    await abortRouteFailClosed(session, requestRoute)
  }
}

function denyRouteNotActive(session: Session, route: BrowserRoute) {
  setTerminalCause(session, 'ROUTE_NOT_ACTIVE')
  return abortRouteFailClosed(session, route)
}

async function denyOrdinaryRoute(route: BrowserRoute) {
  await route.abort()
}

function isAllowedBrowserRoute(
  session: Session,
  request: BrowserRequest,
  kind: ReturnType<typeof requestKind>,
  location: Exclude<ReturnType<typeof mainFrameRequestOrigin>, null>,
) {
  return allowedRequest(
    request.url(),
    request.method(),
    session,
    request.isNavigationRequest(),
    location.documentOrigin,
    kind,
  )
}
async function fulfillAllowedBrowserRoute(
  requestRoute: BrowserRoute,
  session: Session,
  request: BrowserRequest,
  kind: ReturnType<typeof requestKind>,
  location: Exclude<ReturnType<typeof mainFrameRequestOrigin>, null>,
  authorityEpoch: number,
) {
  const response = await requestRoute.fetch({ maxRedirects: 0 })
  if (!isActiveAtAuthorityEpoch(session, authorityEpoch)) return denyRouteNotActive(session, requestRoute)
  const redirect = authorizedRedirect(response, request, session, kind)
  if (redirect === null) return denyRedirect(session, requestRoute)
  recordPendingMainFrameNavigation(session, request, location, authorityEpoch, redirect)
  await requestRoute.fulfill({ response })
}

function denyRedirect(session: Session, route: BrowserRoute) {
  setTerminalCause(session, 'REDIRECT_DENIED')
  return abortRouteFailClosed(session, route)
}
function recordPendingMainFrameNavigation(
  session: Session,
  request: BrowserRequest,
  location: Exclude<ReturnType<typeof mainFrameRequestOrigin>, null>,
  authorityEpoch: number,
  redirect: MainFrameTransition | undefined,
) {
  if (!location.mainFrameDocument) return
  if (redirect) session.pendingMainFrameRequest = redirect
  else
    session.pendingMainFrameCommit = mainFrameTransition(
      request.url(),
      request.method(),
      location.documentOrigin,
      authorityEpoch,
    )
}

function wirePageContainment(session: Session) {
  session.page.on('framenavigated', frame => void commitMainFrameNavigation(session, frame as BrowserFrame))
  session.page.on('download', value => {
    const download = value as { cancel?: () => Promise<void> }
    setTerminalCause(session, 'DOWNLOAD')
    void download.cancel?.()
    void revokeSession(session, 'REVOKED')
  })
  session.page.on('popup', value => {
    const popup = value as { close?: () => Promise<void> }
    setTerminalCause(session, 'POPUP')
    void popup.close?.()
    void revokeSession(session, 'REVOKED')
  })
}
async function commitMainFrameNavigation(session: Session, frame: BrowserFrame) {
  if (frame !== session.page.mainFrame()) return
  const navigation = readMainFrameNavigation(session, frame)
  if (!navigation) return
  await commitPendingMainFrameNavigation(session, navigation)
}
function readMainFrameNavigation(session: Session, frame: BrowserFrame): MainFrameNavigation | undefined {
  const frameUrl = frame.url?.()
  const pageUrl = session.page.url()
  if (consumeNeutralHumanReturnFrame(session, frameUrl, pageUrl)) {
    setNeutralMainFrameOrigin(session)
    return undefined
  }
  if (isEmptyProvisionalMainFrameEvent(session, frameUrl, pageUrl)) return
  const url = frameUrl ?? pageUrl
  return { url, destination: parseFrameDestination(url), pending: session.pendingMainFrameCommit }
}
async function commitPendingMainFrameNavigation(session: Session, navigation: MainFrameNavigation) {
  const { url, destination, pending } = navigation
  if (hasUntaggedHumanReturnCommit(session, pending)) return revokeForMainFrameMismatch(session, url)
  if (!pending) return handleNoPendingMainFrameNavigation(session, destination, url)
  if (!destination || !isValidPendingMainFrameCommit(session, pending, destination, url))
    return revokeForMainFrameMismatch(session, url)
  await applyPendingMainFrameCommit(session, pending, destination, url)
}
function setNeutralMainFrameOrigin(session: Session) {
  session.mainFrameDocumentOrigin = 'about:blank'
}
function hasUntaggedHumanReturnCommit(session: Session, pending: MainFrameTransition | undefined) {
  return Boolean(session.humanReturnGrant && (!pending || !pending.humanReturnGrantId))
}
function isValidPendingMainFrameCommit(
  session: Session,
  pending: MainFrameTransition,
  destination: URL | undefined,
  url: string,
) {
  return Boolean(
    destination &&
    matchesCommittedDestination(url, destination, pending) &&
    isActiveAtAuthorityEpoch(session, pending.authorityEpoch),
  )
}
async function applyPendingMainFrameCommit(
  session: Session,
  pending: MainFrameTransition,
  destination: URL,
  url: string,
) {
  session.pendingMainFrameCommit = undefined
  session.mainFrameDocumentOrigin = pending.destinationOrigin
  session.lastAuthorizedMainFrameCommitHash = committedUrlHash(url)
  if (pending.humanReturnGrantId) {
    if (!completeHumanReturn(session, pending, url)) {
      await revokeLateHumanReturnCommit(session, url)
      return
    }
  } else if (isCommittedAuthorizedReturn(session, pending, destination))
    session.authTransitOutcome = 'RETURNED_TO_FROZEN_TARGET'
}
function isEmptyProvisionalMainFrameEvent(session: Session, frameUrl: string | undefined, pageUrl: string) {
  return !session.pendingMainFrameCommit && frameUrl === '' && pageUrl === ''
}
function consumeNeutralHumanReturnFrame(session: Session, frameUrl: string | undefined, pageUrl: string) {
  const grant = session.humanReturnGrant
  if (
    grant?.state !== 'ARMED' ||
    session.humanReturnNeutralFrameSeen ||
    frameUrl !== 'about:blank' ||
    pageUrl !== 'about:blank'
  )
    return false
  session.humanReturnNeutralFrameSeen = true
  return true
}
function completeHumanReturn(session: Session, pending: MainFrameTransition, url: string) {
  const grant = session.humanReturnGrant
  if (
    session.state !== 'ACTIVE' ||
    session.expiresAt <= new Date() ||
    !grant ||
    grant.grantId !== pending.humanReturnGrantId ||
    grant.state !== 'CONSUMED' ||
    grant.expiresAt <= new Date() ||
    grant.targetUrl !== url
  )
    return false
  grant.state = 'RETURNED'
  if (session.humanReturnTimer) clearTimeout(session.humanReturnTimer)
  session.authTransitOutcome = 'RETURNED_TO_FROZEN_TARGET'
  session.humanReturn = {
    mechanism: 'EXPLICIT_ONE_SHOT_EXACT_TARGET_V1',
    authorizationId: grant.grantId,
    targetUrlHash: hash(grant.targetUrl),
    method: 'GET',
    committedAt: new Date().toISOString(),
  }
  return true
}
async function revokeLateHumanReturnCommit(session: Session, triggeringUrl: string) {
  if (beginTerminalSessionTransition(session, 'REVOKED', triggeringUrl)) await closeSessionResources(session)
}
function isExactDuplicateMainFrameCommit(session: Session, destination: URL | undefined, url: string) {
  return Boolean(
    destination &&
    destination.origin === session.mainFrameDocumentOrigin &&
    session.lastAuthorizedMainFrameCommitHash === committedUrlHash(url),
  )
}
async function handleNoPendingMainFrameNavigation(session: Session, destination: URL | undefined, url: string) {
  if (isExactDuplicateMainFrameCommit(session, destination, url)) return
  setTerminalCause(session, 'MAIN_FRAME_NO_PENDING')
  await revokeSession(session, 'REVOKED', url)
}
async function revokeForMainFrameMismatch(session: Session, triggeringUrl: string) {
  setTerminalCause(session, 'MAIN_FRAME_MISMATCH')
  await revokeSession(session, 'REVOKED', triggeringUrl)
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
function hasValidHumanReturnReceiptProvenance(receipt: DiscoveryBrowserReceipt) {
  return Boolean(
    receipt.humanReturn &&
    hasExactReceiptTargetUrl(receipt) &&
    hasExpectedHumanReturnGrant(receipt) &&
    receipt.humanReturn.targetUrlHash === hash(receipt.url) &&
    receipt.humanReturn.method === 'GET' &&
    receipt.humanReturn.committedAt <= receipt.capturedAt,
  )
}
function hasExactReceiptTargetUrl(receipt: DiscoveryBrowserReceipt) {
  try {
    const target = new URL(receipt.url)
    return !target.username && !target.password && !target.search && !target.hash && target.pathname === receipt.routeId
  } catch {
    return false
  }
}
function hasExpectedHumanReturnGrant(receipt: DiscoveryBrowserReceipt) {
  return (
    receipt.humanReturn?.mechanism === 'EXPLICIT_ONE_SHOT_EXACT_TARGET_V1' &&
    receipt.humanReturn.authorizationId === idFor('human-return', receipt.sessionId, String(receipt.sessionGeneration))
  )
}
function hasExactFrozenReceiptTarget(receipt: DiscoveryBrowserReceipt, binding: { targetOrigin: string }) {
  try {
    const url = new URL(receipt.url)
    return (
      url.origin === binding.targetOrigin &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === receipt.routeId
    )
  } catch {
    return false
  }
}
function hasSelectedFrozenAuthFlow(binding: FrozenEnvironmentBinding, authFlowId: string) {
  if (!binding.discoveryAuthTransitPolicyJson) return false
  try {
    return parseDiscoveryAuthTransitPolicy(
      JSON.parse(binding.discoveryAuthTransitPolicyJson),
      binding.targetOrigin,
    ).flows.some(flow => flow.flowId === authFlowId)
  } catch {
    return false
  }
}
function setTerminalCause(session: Session, cause: DiscoveryBrowserTerminalCause) {
  if ((session.state === 'ACTIVE' || session.state === 'ACCESS_CONFIRMED') && !session.terminalCause)
    session.terminalCause = cause
}
async function revokeSession(
  session: Session,
  state: Extract<DiscoveryBrowserSessionState, 'REVOKED' | 'LOGGED_OUT' | 'CLOSED'>,
  triggeringMainFrameUrl?: string,
) {
  if (beginTerminalSessionTransition(session, state, triggeringMainFrameUrl)) await closeSessionResources(session)
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
      authorityEpoch: 1,
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

/**
 * Arms one process-local, one-shot address-bar return to the frozen target.
 * Its input is deliberately only the existing scoped session identity: callers
 * cannot nominate a URL, origin, or route.
 */
export async function armQualityJourneyDiscoveryBrowserHumanReturn(input: unknown, client: Db = prisma) {
  const request = sessionInputSchema.parse(input)
  const session = await getLiveSession(request)
  if (session.state !== 'ACTIVE' || session.accessMode !== 'AUTHENTICATED_INTENT') throw stateError(session.state)
  if (session.operation)
    throw new ServiceError('Discovery browser lifecycle operation is already in progress.', 'CONFLICT')
  const authorityEpoch = session.authorityEpoch
  const scope = await assertFrozenScopeStillMatchesSession(
    session,
    client,
    'Discovery browser scope is no longer current.',
  )
  assertActiveAtAuthorityEpoch(session, authorityEpoch)
  if (session.pendingMainFrameRequest || session.pendingMainFrameCommit)
    throw new ServiceError(
      'Discovery browser navigation is still in flight; retry from a fresh scoped session.',
      'CONFLICT',
    )
  if (session.humanReturnGrant || session.humanReturn)
    throw new ServiceError('The human return grant was already used or armed.', 'CONFLICT')
  if (!mayArmHumanReturnFromCommittedOrigin(session))
    throw new ServiceError(
      'Human return may be armed only from a committed origin with an exact selected-flow GET return rule.',
      'CONFLICT',
    )
  if (session.operation)
    throw new ServiceError('Discovery browser lifecycle operation is already in progress.', 'CONFLICT')
  const targetUrl = routeUrl(scope.baseUrl, session.routeId)
  const expiresAt = new Date(Math.min(session.expiresAt.getTime(), Date.now() + 15_000))
  if (expiresAt <= new Date()) throw stateError('EXPIRED')
  const grantId = humanReturnGrantId(session)
  invalidateSessionAuthority(session)
  session.humanReturnGrant = { grantId, targetUrl, expiresAt, state: 'ARMED' }
  scheduleHumanReturnExpiry(session, grantId)
  return { session: projection(session), returnUrl: targetUrl }
}

/** Test/qualification-only in-process terminal diagnostic. It is deliberately
 * unavailable while a session is live and excluded from all public projections. */
export async function getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification(input: unknown) {
  const request = sessionInputSchema.parse(input)
  const session = await getLiveSession(request)
  if (session.state === 'ACTIVE' || session.state === 'ACCESS_CONFIRMED')
    throw new ServiceError('Terminal diagnostic is available only after a session becomes inactive.', 'CONFLICT')
  return { terminalCause: session.terminalCause }
}

/** This records that the local human says access is available. It deliberately
 * makes no claim about who they are or what their identity provider attested. */
export async function confirmQualityJourneyDiscoveryBrowserAccess(input: unknown, client: Db = prisma) {
  const request = sessionInputSchema.parse(input)
  const session = await getLiveSession(request)
  if (session.state !== 'ACTIVE' || session.accessMode !== 'AUTHENTICATED_INTENT') throw stateError(session.state)
  const operation = reserveSessionOperation(session, 'CONFIRM_ACCESS')
  try {
    await assertFrozenScopeStillMatchesSession(session, client, 'Discovery browser scope is no longer current.')
    assertCurrentSessionOperation(session, operation)
    assertAuthenticatedReturnAtFrozenTarget(session)
    commitConfirmedAccess(session, operation)
    try {
      await resolveMissingAccessBlocker(session, client)
    } catch {
      await revokeSession(session, 'REVOKED')
      throw new ServiceError('Discovery browser access confirmation could not resolve its blocker.', 'CONFLICT')
    }
    return projection(session)
  } finally {
    releaseSessionOperation(session, operation)
  }
}

function commitConfirmedAccess(session: Session, operation: SessionOperation) {
  assertCurrentSessionOperation(session, operation)
  session.state = 'ACCESS_CONFIRMED'
  releaseSessionOperation(session, operation)
}

function assertAuthenticatedReturnAtFrozenTarget(session: Session) {
  let current: URL
  try {
    current = new URL(session.page.url())
  } catch {
    throw new ServiceError(
      'Authenticated Discovery must return through the authorized flow to the frozen target route.',
      'CONFLICT',
    )
  }
  if (
    current.origin !== session.targetOrigin ||
    current.pathname !== session.routeId ||
    current.search ||
    current.hash ||
    session.authTransitOutcome !== 'RETURNED_TO_FROZEN_TARGET' ||
    !session.humanReturn
  )
    throw new ServiceError(
      'Authenticated Discovery must return through the authorized flow to the frozen target route.',
      'CONFLICT',
    )
}

function missingAccessBlockerId(session: Session) {
  return idFor('blocker', session.journeyId, session.discoveryRevisionId, session.environmentId, session.routeId)
}

async function resolveMissingAccessBlocker(session: Session, client: Db) {
  await client.qualityJourneyBlocker.updateMany({
    where: {
      id: missingAccessBlockerId(session),
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
}

export async function markQualityJourneyDiscoveryBrowserMissingAccess(input: unknown, client: Db = prisma) {
  const request = missingAccessSchema.parse(input)
  const session = await getLiveSession(request)
  if (session.state !== 'ACTIVE') throw stateError(session.state)
  if (!beginTerminalSessionTransition(session, 'MISSING_ACCESS')) throw stateError(session.state)
  try {
    await client.qualityJourneyBlocker.upsert({
      where: { id: missingAccessBlockerId(session) },
      create: {
        id: missingAccessBlockerId(session),
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
    return projection(session)
  } finally {
    await closeSessionResources(session)
  }
}

function assertCaptureAllowed(session: Session) {
  const captureAllowed = isLiveSessionState(session.state) || session.state === 'MISSING_ACCESS'
  if (!captureAllowed) throw stateError(session.state)
  if (session.accessMode !== 'AUTHENTICATED_INTENT') return
  if (session.state !== 'ACCESS_CONFIRMED')
    throw new ServiceError('Human confirmation is required before authenticated discovery capture.', 'CONFLICT')
  if (session.authTransitOutcome !== 'RETURNED_TO_FROZEN_TARGET' || !session.humanReturn)
    throw new ServiceError(
      'Authenticated Discovery must complete the one-shot human return before capture.',
      'CONFLICT',
    )
}

function captureTargetUrl(session: Session) {
  const rawCurrentUrl = session.page.url()
  let parsed: URL
  try {
    parsed = new URL(rawCurrentUrl)
  } catch {
    throw new ServiceError('Discovery browser capture is outside the permitted target.', 'CONFLICT')
  }
  if (parsed.origin !== session.targetOrigin || parsed.pathname !== session.routeId || parsed.search || parsed.hash)
    throw new ServiceError('Discovery browser capture is outside the permitted target.', 'CONFLICT')
  return sanitizedUrl(rawCurrentUrl)
}

function captureAccessOutcome(session: Session) {
  if (session.state === 'ACCESS_CONFIRMED') return 'ACCESS_CONFIRMED' as const
  if (session.state === 'MISSING_ACCESS') return 'MISSING_ACCESS' as const
  if (session.state === 'ACTIVE') return 'ACTIVE' as const
  throw stateError(session.state)
}

function buildDiscoveryBrowserReceipt(
  session: Session,
  snapshotId: string,
  currentUrl: string,
  accessOutcome: 'ACTIVE' | 'ACCESS_CONFIRMED' | 'MISSING_ACCESS',
) {
  const artifactId = idFor('receipt', session.id, String(session.generation), snapshotId)
  const observationFacts = [
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
    snapshotId,
    accessMode: session.accessMode,
    ...(session.authFlowId
      ? {
          authFlowId: session.authFlowId,
          authPolicyHash: session.authPolicyHash,
          authTransitOutcome: 'RETURNED_TO_FROZEN_TARGET' as const,
          humanReturn: session.humanReturn,
        }
      : {}),
    accessOutcome,
    capturedAt: new Date().toISOString(),
    url: currentUrl,
    title: '[not persisted]',
    observationFacts,
    observationFactsHash: hash(observationFacts),
    note: 'Human-confirmed browser access records local access only; it does not identify a natural person or attest IdP identity.',
  })
  return { artifactId, receipt, contentHash: hash(receipt) }
}

function assertCaptureOperationCurrent(session: Session, operation?: SessionOperation) {
  if (operation) return assertCurrentSessionOperation(session, operation)
  if (session.state !== 'MISSING_ACCESS') throw stateError(session.state)
}

async function persistDiscoveryBrowserReceipt(
  session: Session,
  request: z.infer<typeof captureSchema>,
  currentUrl: string,
  operation: SessionOperation | undefined,
  client: Db,
) {
  return withTransaction(client, async tx => {
    await assertFrozenScopeStillMatchesSession(session, tx)
    assertCaptureOperationCurrent(session, operation)
    const captured = buildDiscoveryBrowserReceipt(
      session,
      request.snapshotId,
      currentUrl,
      captureAccessOutcome(session),
    )
    const identityKey = `discovery-browser-receipt:${session.id}:${session.generation}:${request.snapshotId}`
    const existing = await tx.qualityJourneyArtifact.findUnique({
      where: { journeyId_identityKey: { journeyId: session.journeyId, identityKey } },
    })
    assertCaptureOperationCurrent(session, operation)
    if (existing) {
      if (existing.contentHash !== captured.contentHash || existing.artifactJson !== canonical(captured.receipt))
        throw new ServiceError('Discovery browser receipt identity conflicts.', 'CONFLICT')
    } else {
      await tx.qualityJourneyArtifact.create({
        data: {
          id: idFor('artifact', session.journeyId, captured.artifactId),
          identityKey,
          journeyId: session.journeyId,
          targetProjectId: session.targetProjectId,
          cycleId: session.cycleId,
          kind: discoveryBrowserReceiptKind,
          artifactId: captured.artifactId,
          contentHash: captured.contentHash,
          artifactJson: canonical(captured.receipt),
        },
      })
      assertCaptureOperationCurrent(session, operation)
    }
    return captured
  })
}

export async function captureQualityJourneyDiscoveryBrowserReceipt(input: unknown, client: Db = prisma) {
  const request = captureSchema.parse(input)
  const session = await getLiveSession(request)
  assertCaptureAllowed(session)
  const operation = isLiveSessionState(session.state) ? reserveSessionOperation(session, 'CAPTURE_RECEIPT') : undefined
  try {
    const currentUrl = captureTargetUrl(session)
    return await persistDiscoveryBrowserReceipt(session, request, currentUrl, operation, client)
  } finally {
    if (operation) releaseSessionOperation(session, operation)
  }
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
  setTerminalCause(session, 'USER_REVOKE')
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
  if (!isLiveSessionState(previous.state)) throw stateError(previous.state)
  if (!beginTerminalSessionTransition(previous, 'CONTEXT_REPLACED')) throw stateError(previous.state)
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
  const activeRevision = await tx.qualityJourneyDiscoveryRevision.findFirst({
    where: {
      id: revision.id,
      journeyId: revision.journeyId,
      targetProjectId: revision.targetProjectId,
      cycleId: revision.cycleId,
      scoutWorkItemId: revision.scoutWorkItemId,
    },
  })
  let environmentBindings: FrozenEnvironmentBinding[] | undefined
  try {
    environmentBindings = activeRevision
      ? (JSON.parse(activeRevision.scoutScopeJson) as { environmentBindings?: FrozenEnvironmentBinding[] })
          .environmentBindings
      : undefined
  } catch {
    throw new ServiceError('Scout evidence receipt has invalid frozen discovery scope.', 'CONFLICT')
  }
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
      !hasAdmissibleReceiptAccessOutcome(receipt)
    )
      throw new ServiceError('Scout evidence receipt is outside the exact discovery browser scope.', 'CONFLICT')
    const binding = environmentBindings?.find(value => value.environmentId === receipt.environmentId)
    if (
      !binding ||
      receipt.environmentScopeVersion !== binding.scopeVersion ||
      !hasExactFrozenReceiptTarget(receipt, binding)
    )
      throw new ServiceError('Scout evidence receipt has stale environment or target provenance.', 'CONFLICT')
    if (receipt.accessMode === 'AUTHENTICATED_INTENT') {
      if (
        receipt.authPolicyHash !== binding.discoveryAuthTransitPolicyHash ||
        !receipt.authFlowId ||
        !hasSelectedFrozenAuthFlow(binding, receipt.authFlowId)
      )
        throw new ServiceError('Authenticated Scout evidence receipt has stale transit-policy provenance.', 'CONFLICT')
      if (!hasValidHumanReturnReceiptProvenance(receipt))
        throw new ServiceError(
          'Authenticated Scout evidence receipt lacks valid one-shot human-return provenance.',
          'CONFLICT',
        )
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

function hasAdmissibleReceiptAccessOutcome(receipt: DiscoveryBrowserReceipt) {
  if (receipt.accessOutcome === 'MISSING_ACCESS') return false
  return receipt.accessMode !== 'AUTHENTICATED_INTENT' || receipt.accessOutcome === 'ACCESS_CONFIRMED'
}

export async function clearQualityJourneyDiscoveryBrowserSessionsForTest() {
  await Promise.all([...sessions.values()].map(closeSessionResources))
  sessions.clear()
}
