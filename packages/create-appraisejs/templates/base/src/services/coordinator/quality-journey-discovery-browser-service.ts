import { createHash, randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient, QualityJourneyOwnedBrowser } from '@prisma/client'
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
import { createQualityJourneyDiscoveryBrowserRuntime } from './quality-journey-discovery-browser-runtime'
import { assertQualityJourneyMutable } from './quality-journey-terminal'

type Db = PrismaClient | Prisma.TransactionClient

type BrowserFrame = { url(): string; securityOrigin?(): string }
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
  on(
    event: 'framenavigated' | 'websocket' | 'download' | 'popup' | 'close' | 'crash',
    listener: (value: unknown) => void,
  ): void
  isClosed(): boolean
  close(): Promise<void>
}
type BrowserContext = {
  newPage(): Promise<BrowserPage>
  route(pattern: string, handler: (route: BrowserRoute) => Promise<void>): Promise<unknown>
  routeWebSocket(pattern: string, handler: (route: BrowserWebSocketRoute) => Promise<void>): Promise<unknown>
  on(event: 'close', listener: () => void): void
  close(): Promise<void>
}
type Browser = {
  newContext(options?: { acceptDownloads: false; serviceWorkers: 'block' }): Promise<BrowserContext>
  on(event: 'disconnected', listener: () => void): void
  isConnected(): boolean
  close(): Promise<void>
}

export type DiscoveryBrowserRuntime = {
  launch(): Promise<Browser>
  /** Real Playwright fulfillment does not prove interception of a redirect's next hop. */
  redirectInterception?: 'INITIAL_REQUEST_ONLY' | 'EVERY_HOP'
}

const defaultRuntime: DiscoveryBrowserRuntime = createQualityJourneyDiscoveryBrowserRuntime()

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
const startupClosures = new Map<string, StartupClosure>()
const cleanupScopeSchema = z.object({ journeyId: id, targetProjectId: id }).strict()

type CleanupState = 'NOT_REQUESTED' | 'REQUESTED' | 'PENDING' | 'RUNTIME_CLOSE_CONFIRMED' | 'UNKNOWN'
type OwnershipStatus = 'LAUNCHING' | 'LIVE' | 'STOP_REQUESTED' | 'STOP_OBSERVED' | 'UNKNOWN'
type Ownership = { id: string; client: Db; generation: number }
type CleanupReceipt = {
  sessionId: string
  journeyId: string
  targetProjectId: string
  processInstanceId: string
  state: CleanupState
}
type StartupClosure = {
  id: string
  journeyId: string
  targetProjectId: string
  browser: Browser
  context?: BrowserContext
  page?: BrowserPage
  cleanupState: CleanupState
  cleanupPromise?: Promise<CleanupReceipt>
  ownership: Ownership
}

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
  /** Present only while Appraise is awaiting the exact returned main-frame commit. */
  humanReturnCommitWaiter?: HumanReturnCommitWaiter
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
  redirectInterception: 'INITIAL_REQUEST_ONLY' | 'EVERY_HOP'
  cleanupState: CleanupState
  cleanupPromise?: Promise<CleanupReceipt>
  ownership: Ownership
}

type DiscoveryBrowserTerminalCause =
  | 'BROWSER_DISCONNECTED'
  | 'CONTEXT_CLOSED'
  | 'PAGE_CLOSED'
  | 'PAGE_CRASHED'
  | 'REDIRECT_INTERCEPTION_UNAVAILABLE'
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

type HumanReturnCommitWaiter = {
  grantId: string
  resolve(): void
  reject(error: ServiceError): void
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
  | 'redirectInterception'
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
  | 'cleanupState'
  | 'cleanupPromise'
  | 'ownership'
> & { allowedOrigins: string[]; allowedRoutes: string[]; currentUrl: string | null }

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
function callSafely(operation: () => void | Promise<void>) {
  return Promise.resolve().then(operation)
}
function ownershipUpdateData(
  row: QualityJourneyOwnedBrowser,
  status: OwnershipStatus,
  observation: 'RUNTIME_CLOSE_CONFIRMED' | 'NO_RUNTIME_LAUNCHED' = 'RUNTIME_CLOSE_CONFIRMED',
) {
  const observedAt = new Date().toISOString()
  const history = JSON.parse(row.cleanupHistoryJson) as { status: OwnershipStatus; observedAt: string }[]
  history.push({ status, observedAt })
  if (status !== 'STOP_OBSERVED' || row.stopReceiptJson)
    return { status, rowVersion: { increment: 1 }, cleanupHistoryJson: canonical(history) }
  const receipt = {
    schemaVersion: 'appraise.quality-journey-owned-browser-stop/v1',
    sessionId: row.sessionId,
    journeyId: row.journeyId,
    targetProjectId: row.targetProjectId,
    processInstanceId: row.processInstanceId,
    generation: row.generation,
    status,
    observation,
    observedAt,
  }
  return {
    status,
    rowVersion: { increment: 1 },
    cleanupHistoryJson: canonical(history),
    stopReceiptJson: canonical(receipt),
    stopReceiptHash: hash(receipt),
  }
}
async function persistOwnershipStatus(
  ownership: Ownership,
  status: OwnershipStatus,
  scope: { journeyId: string; targetProjectId: string },
  observation?: 'RUNTIME_CLOSE_CONFIRMED' | 'NO_RUNTIME_LAUNCHED',
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await ownership.client.qualityJourneyOwnedBrowser.findUnique({ where: { id: ownership.id } })
    if (!row || row.journeyId !== scope.journeyId || row.targetProjectId !== scope.targetProjectId)
      throw new ServiceError('Discovery browser ownership scope changed.', 'CONFLICT')
    if (status === 'LIVE' && row.status !== 'LAUNCHING')
      throw new ServiceError('Discovery browser launch authority was revoked.', 'CONFLICT')
    if (row.status === 'STOP_OBSERVED') return
    const updated = await ownership.client.qualityJourneyOwnedBrowser.updateMany({
      where: {
        id: row.id,
        journeyId: row.journeyId,
        targetProjectId: row.targetProjectId,
        processInstanceId: row.processInstanceId,
        rowVersion: row.rowVersion,
        status: row.status,
      },
      data: ownershipUpdateData(row, status, observation),
    })
    if (updated.count === 1) return
  }
  throw new ServiceError('Discovery browser ownership changed during cleanup.', 'CONFLICT')
}
async function activeOwnedBrowserRows(scope: { journeyId: string; targetProjectId: string }, client: Db) {
  return client.qualityJourneyOwnedBrowser.findMany({
    where: {
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      status: { in: ['LAUNCHING', 'LIVE', 'STOP_REQUESTED', 'UNKNOWN'] },
    },
  })
}
async function assertDurableOwnershipAllowsStart(
  scope: { journeyId: string; targetProjectId: string },
  client: Db,
  ownId?: string,
) {
  const rows = await activeOwnedBrowserRows(scope, client)
  if (rows.some(row => row.id !== ownId && (row.processInstanceId !== processInstanceId || row.status !== 'LIVE')))
    throw new ServiceError('Prior Discovery browser ownership is unresolved.', 'CONFLICT')
}
async function registerBrowserOwnership(
  request: z.infer<typeof startSchema>,
  sessionId: string,
  client: Db,
  generation = 1,
) {
  const ownership = { id: sessionId, client, generation }
  const register = async (db: Db) => {
    const journey = await db.qualityJourney.findFirst({
      where: { id: request.journeyId, targetProjectId: request.targetProjectId },
    })
    if (!journey) throw new ServiceError('Discovery browser Journey was not found.', 'NOT_FOUND')
    assertQualityJourneyMutable(journey)
    const fenced = await db.qualityJourney.updateMany({
      where: { id: request.journeyId, targetProjectId: request.targetProjectId, status: 'ACTIVE' },
      data: { status: 'ACTIVE' },
    })
    if (fenced.count !== 1) throw new ServiceError('Discovery browser Journey is no longer active.', 'CONFLICT')
    const scope = await loadFrozenScope(request, db)
    await assertDurableOwnershipAllowsStart(request, db)
    await db.qualityJourneyOwnedBrowser.create({
      data: {
        id: sessionId,
        journeyId: request.journeyId,
        targetProjectId: request.targetProjectId,
        processInstanceId,
        sessionId,
        generation,
        status: 'LAUNCHING',
        cleanupHistoryJson: canonical([{ status: 'LAUNCHING', observedAt: new Date().toISOString() }]),
      },
    })
    return scope
  }
  const transactional = client as PrismaClient
  const scope =
    typeof transactional.$transaction === 'function'
      ? await transactional.$transaction(async tx => register(tx))
      : await register(client)
  return { ownership, scope }
}
function setTerminalCause(session: Session, cause: DiscoveryBrowserTerminalCause) {
  if (isLiveSessionState(session.state) && !session.terminalCause) session.terminalCause = cause
}
function cleanupReceipt(session: Session): CleanupReceipt {
  return {
    sessionId: session.id,
    journeyId: session.journeyId,
    targetProjectId: session.targetProjectId,
    processInstanceId: session.processInstanceId,
    state: session.cleanupState,
  }
}
function closeSessionResources(session: Session): Promise<CleanupReceipt> {
  if (session.cleanupPromise) return session.cleanupPromise
  if (session.cleanupState === 'RUNTIME_CLOSE_CONFIRMED') return Promise.resolve(cleanupReceipt(session))
  session.cleanupState = 'REQUESTED'
  if (session.expiryTimer) clearTimeout(session.expiryTimer)
  if (session.humanReturnTimer) clearTimeout(session.humanReturnTimer)
  session.cleanupState = 'PENDING'
  const closing = (async () => {
    try {
      await persistOwnershipStatus(session.ownership, 'STOP_REQUESTED', session)
    } catch {
      // Keep fencing authority and attempt the runtime close even if the ledger is unavailable.
    }
    const results = await Promise.allSettled([
      callSafely(() => session.page.close()),
      callSafely(() => session.context.close()),
      callSafely(() => session.browser.close()),
    ])
    const confirmed = results.every(result => result.status === 'fulfilled')
    try {
      await persistOwnershipStatus(session.ownership, confirmed ? 'STOP_OBSERVED' : 'UNKNOWN', session)
      session.cleanupState = confirmed ? 'RUNTIME_CLOSE_CONFIRMED' : 'UNKNOWN'
    } catch {
      session.cleanupState = 'UNKNOWN'
    }
    return cleanupReceipt(session)
  })()
  session.cleanupPromise = closing
  void closing.then(() => {
    if (session.cleanupPromise === closing) session.cleanupPromise = undefined
  })
  return closing
}
function assertCleanupConfirmed(receipt: CleanupReceipt) {
  if (receipt.state !== 'RUNTIME_CLOSE_CONFIRMED')
    throw new ServiceError('Discovery browser runtime cleanup is unconfirmed.', 'CONFLICT')
}
function assertNoUnresolvedOwnedCleanup(journeyId: string, targetProjectId: string) {
  for (const receipt of ownedCleanupReceipts(journeyId, targetProjectId)) {
    if (receipt.state === 'PENDING' || receipt.state === 'UNKNOWN')
      throw new ServiceError('Prior Discovery browser runtime cleanup is unconfirmed.', 'CONFLICT')
  }
}
function startupCleanupReceipt(startup: StartupClosure): CleanupReceipt {
  return {
    sessionId: startup.id,
    journeyId: startup.journeyId,
    targetProjectId: startup.targetProjectId,
    processInstanceId,
    state: startup.cleanupState,
  }
}
function closeStartupResources(startup: StartupClosure): Promise<CleanupReceipt> {
  if (startup.cleanupPromise) return startup.cleanupPromise
  if (startup.cleanupState === 'RUNTIME_CLOSE_CONFIRMED') return Promise.resolve(startupCleanupReceipt(startup))
  startup.cleanupState = 'PENDING'
  const closing = (async () => {
    try {
      await persistOwnershipStatus(startup.ownership, 'STOP_REQUESTED', startup)
    } catch {
      // Keep fencing authority and attempt the runtime close even if the ledger is unavailable.
    }
    const results = await Promise.allSettled([
      ...(startup.page ? [callSafely(() => startup.page!.close())] : []),
      ...(startup.context ? [callSafely(() => startup.context!.close())] : []),
      callSafely(() => startup.browser.close()),
    ])
    const confirmed = results.every(result => result.status === 'fulfilled')
    try {
      await persistOwnershipStatus(startup.ownership, confirmed ? 'STOP_OBSERVED' : 'UNKNOWN', startup)
      startup.cleanupState = confirmed ? 'RUNTIME_CLOSE_CONFIRMED' : 'UNKNOWN'
    } catch {
      startup.cleanupState = 'UNKNOWN'
    }
    return startupCleanupReceipt(startup)
  })()
  startup.cleanupPromise = closing
  void closing.then(() => {
    if (startup.cleanupPromise === closing) startup.cleanupPromise = undefined
  })
  return closing
}
function ownedCleanupReceipts(journeyId: string, targetProjectId: string) {
  return [
    ...[...sessions.values()]
      .filter(session => session.journeyId === journeyId && session.targetProjectId === targetProjectId)
      .map(cleanupReceipt),
    ...[...startupClosures.values()]
      .filter(startup => startup.journeyId === journeyId && startup.targetProjectId === targetProjectId)
      .map(startupCleanupReceipt),
  ]
}
function browserLivenessCause(session: Session): DiscoveryBrowserTerminalCause | undefined {
  try {
    if (!session.browser.isConnected()) return 'BROWSER_DISCONNECTED'
  } catch {
    return 'BROWSER_DISCONNECTED'
  }
  try {
    if (session.page.isClosed()) return 'PAGE_CLOSED'
  } catch {
    return 'PAGE_CLOSED'
  }
  return undefined
}
function fenceBrowserLiveness(session: Session) {
  const cause = browserLivenessCause(session)
  if (!cause || !isLiveSessionState(session.state)) return false
  setTerminalCause(session, cause)
  const transitioned = beginTerminalSessionTransition(session, 'CLOSED')
  if (transitioned) void closeSessionResources(session)
  return transitioned
}
function closeSessionAfterLivenessLoss(session: Session, cause: DiscoveryBrowserTerminalCause) {
  if (!isLiveSessionState(session.state)) return
  setTerminalCause(session, cause)
  if (beginTerminalSessionTransition(session, 'CLOSED')) void closeSessionResources(session)
}
function isActiveAtAuthorityEpoch(session: Session, authorityEpoch: number) {
  fenceBrowserLiveness(session)
  return isLiveSessionState(session.state) && session.authorityEpoch === authorityEpoch
}
function assertActiveAtAuthorityEpoch(session: Session, authorityEpoch: number) {
  fenceBrowserLiveness(session)
  if (!isLiveSessionState(session.state)) throw stateError(session.state)
  if (session.authorityEpoch !== authorityEpoch)
    throw new ServiceError('Discovery browser authority changed while the operation was in flight.', 'CONFLICT')
}
function reserveSessionOperation(session: Session, kind: SessionOperation['kind']) {
  fenceBrowserLiveness(session)
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
    const frame = request.frame?.()
    const origin = frame?.securityOrigin?.()
    if (origin) return new URL(origin).origin
    return new URL(frame?.url() ?? '').origin
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
  rejectHumanReturnCommitWaiter(session)
  return true
}
async function expireIfNeeded(session: Session) {
  if (session.expiresAt <= new Date() && beginTerminalSessionTransition(session, 'EXPIRED'))
    await closeSessionResources(session)
}
function projection(session: Session): DiscoveryBrowserSession {
  let currentUrl: string | null = null
  if (session.accessMode === 'AUTHENTICATED_INTENT') {
    // Keep provider locations private. Only the committed frozen return target is public.
    if (session.humanReturnGrant?.state === 'RETURNED') currentUrl = session.humanReturnGrant.targetUrl
  } else {
    currentUrl = session.terminalUrl ?? null
  }
  if (session.accessMode === 'ANONYMOUS' && !currentUrl) {
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
    allowedOrigins:
      session.accessMode === 'AUTHENTICATED_INTENT'
        ? session.humanReturnGrant?.state === 'RETURNED'
          ? [session.targetOrigin]
          : []
        : session.humanReturnGrant
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
  fenceBrowserLiveness(session)
  await expireIfNeeded(session)
  fenceBrowserLiveness(session)
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
  assertQualityJourneyMutable(journey)
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
  if (isRedirectResponse(response) && session.redirectInterception !== 'EVERY_HOP')
    return denyRedirectInterceptionUnavailable(session, route)
  if (isRedirectResponse(response)) return denyHumanReturnRequest(session, route, 'REDIRECT_DENIED')
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

function waitForHumanReturnCommit(session: Session, grantId: string) {
  const grant = session.humanReturnGrant
  if (grant?.grantId !== grantId || grant.state === 'RETURNED') return Promise.resolve()
  if (!isLiveSessionState(session.state) || !isActiveHumanReturnGrant(session))
    return Promise.reject(new ServiceError('Discovery browser exact return is no longer available.', 'CONFLICT'))
  if (session.humanReturnCommitWaiter)
    return Promise.reject(new ServiceError('Discovery browser exact return is already in progress.', 'CONFLICT'))
  return new Promise<void>((resolve, reject) => {
    session.humanReturnCommitWaiter = { grantId, resolve, reject }
  })
}

function resolveHumanReturnCommitWaiter(session: Session, grantId: string) {
  const waiter = session.humanReturnCommitWaiter
  if (!waiter || waiter.grantId !== grantId) return
  session.humanReturnCommitWaiter = undefined
  waiter.resolve()
}

function rejectHumanReturnCommitWaiter(session: Session) {
  const waiter = session.humanReturnCommitWaiter
  if (!waiter) return
  session.humanReturnCommitWaiter = undefined
  waiter.reject(new ServiceError('Discovery browser exact return did not commit.', 'CONFLICT'))
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
  if (!location || !isRedirectResponse(response)) return undefined
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
  if (isRedirectResponse(response) && session.redirectInterception !== 'EVERY_HOP')
    return denyRedirectInterceptionUnavailable(session, requestRoute)
  const redirect = authorizedRedirect(response, request, session, kind)
  if (redirect === null) return denyRedirect(session, requestRoute)
  recordPendingMainFrameNavigation(session, request, location, authorityEpoch, redirect)
  await requestRoute.fulfill({ response })
}

function isRedirectResponse(response: BrowserResponse) {
  return response.status() >= 300 && response.status() < 400 && response.status() !== 304
}
function denyRedirectInterceptionUnavailable(session: Session, route: BrowserRoute) {
  setTerminalCause(session, 'REDIRECT_INTERCEPTION_UNAVAILABLE')
  return abortRouteFailClosed(session, route)
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
  session.page.on('framenavigated', frame => {
    void commitMainFrameNavigation(session, frame as BrowserFrame).catch(() =>
      closeSessionAfterLivenessLoss(session, 'ROUTE_OPERATION_FAILED'),
    )
  })
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
  if (ignoreExactDuplicateDuringOrdinaryPendingTransition(session, navigation)) return
  if (consumeCachedDuplicatePendingRequest(session, navigation)) return
  if (!pending && session.pendingMainFrameRequest) return revokeForMainFrameMismatch(session, url)
  if (!pending) return handleNoPendingMainFrameNavigation(session, destination, url)
  if (!destination || !isValidPendingMainFrameCommit(session, pending, destination, url))
    return revokeForMainFrameMismatch(session, url)
  await applyPendingMainFrameCommit(session, pending, destination, url)
}

function ignoreExactDuplicateDuringOrdinaryPendingTransition(session: Session, navigation: MainFrameNavigation) {
  const pending = navigation.pending
  return Boolean(
    pending &&
    !session.humanReturnGrant &&
    isActiveAtAuthorityEpoch(session, pending.authorityEpoch) &&
    !matchesPendingMainFrameDestination(navigation, pending) &&
    isExactCachedDuplicate(session, navigation),
  )
}

function matchesPendingMainFrameDestination(navigation: MainFrameNavigation, pending: MainFrameTransition) {
  return Boolean(navigation.destination && matchesCommittedDestination(navigation.url, navigation.destination, pending))
}

function consumeCachedDuplicatePendingRequest(session: Session, navigation: MainFrameNavigation) {
  const request = session.pendingMainFrameRequest
  if (!request || navigation.pending) return false
  if (!isCurrentGetPendingRequest(session, request)) return false
  if (!isExactCachedDuplicate(session, navigation)) return false
  if (!matchesCachedDuplicateRequest(session, request, navigation)) return false
  session.pendingMainFrameRequest = undefined
  return true
}

function isCurrentGetPendingRequest(session: Session, request: MainFrameTransition) {
  return request.effectiveMethod === 'GET' && isActiveAtAuthorityEpoch(session, request.authorityEpoch)
}

function isExactCachedDuplicate(session: Session, navigation: MainFrameNavigation) {
  return Boolean(
    navigation.destination && isExactDuplicateMainFrameCommit(session, navigation.destination, navigation.url),
  )
}

function matchesCachedDuplicateRequest(
  session: Session,
  request: MainFrameTransition,
  navigation: MainFrameNavigation,
) {
  const destination = navigation.destination!
  return (
    request.destinationUrl === sanitizedUrl(navigation.url) &&
    request.destinationOrigin === destination.origin &&
    request.sourceOrigin === session.mainFrameDocumentOrigin &&
    session.lastAuthorizedMainFrameCommitHash === committedUrlHash(navigation.url)
  )
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
  resolveHumanReturnCommitWaiter(session, grant.grantId)
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
async function revokeSession(
  session: Session,
  state: Extract<DiscoveryBrowserSessionState, 'REVOKED' | 'LOGGED_OUT' | 'CLOSED'>,
  triggeringMainFrameUrl?: string,
) {
  if (beginTerminalSessionTransition(session, state, triggeringMainFrameUrl))
    assertCleanupConfirmed(await closeSessionResources(session))
  else if (session.cleanupState === 'PENDING' || session.cleanupState === 'UNKNOWN')
    assertCleanupConfirmed(await closeSessionResources(session))
}

async function cleanupFailedBrowserStart(
  session: Session | undefined,
  request: z.infer<typeof startSchema>,
  ownership: Ownership,
  browser: Browser,
  context?: BrowserContext,
  page?: BrowserPage,
) {
  if (session) {
    beginTerminalSessionTransition(session, 'CLOSED')
    const receipt = await closeSessionResources(session)
    if (receipt.state === 'UNKNOWN') sessions.set(session.id, session)
    return
  }
  const startup: StartupClosure = {
    id: ownership.id,
    journeyId: request.journeyId,
    targetProjectId: request.targetProjectId,
    browser,
    context,
    page,
    cleanupState: 'REQUESTED',
    ownership,
  }
  startupClosures.set(startup.id, startup)
  await closeStartupResources(startup)
}

/** Starts a one-process, headed, non-persistent browser context. Its strict
 * input deliberately has no credentials, cookies, storage state, URL, or JS. */
export async function startQualityJourneyDiscoveryBrowserSession(
  input: unknown,
  client: Db = prisma,
  runtime: DiscoveryBrowserRuntime = defaultRuntime,
  generation = 1,
) {
  const request = startSchema.parse(input)
  assertNoUnresolvedOwnedCleanup(request.journeyId, request.targetProjectId)
  const sessionId = idFor('session', request.journeyId, request.discoveryRevisionId, request.workItemId, randomUUID())
  const { scope, ownership } = await registerBrowserOwnership(request, sessionId, client, generation)
  try {
    assertNoUnresolvedOwnedCleanup(request.journeyId, request.targetProjectId)
    const journey = await client.qualityJourney.findFirst({
      where: { id: request.journeyId, targetProjectId: request.targetProjectId },
    })
    if (!journey) throw new ServiceError('Discovery browser Journey was not found.', 'NOT_FOUND')
    assertQualityJourneyMutable(journey)
    const row = await client.qualityJourneyOwnedBrowser.findUnique({ where: { id: ownership.id } })
    if (row?.status !== 'LAUNCHING')
      throw new ServiceError('Discovery browser launch authority was revoked.', 'CONFLICT')
  } catch (error) {
    await persistOwnershipStatus(ownership, 'STOP_OBSERVED', request, 'NO_RUNTIME_LAUNCHED').catch(() => undefined)
    throw error
  }
  const browser = await runtime.launch().catch(async () => {
    await persistOwnershipStatus(ownership, 'UNKNOWN', request).catch(() => undefined)
    throw new ServiceError('Discovery browser is unavailable.', 'CONFLICT')
  })
  let context: BrowserContext | undefined
  let page: BrowserPage | undefined
  let session: Session | undefined
  let startupLoss: DiscoveryBrowserTerminalCause | undefined
  const recordLivenessLoss = (cause: DiscoveryBrowserTerminalCause) => {
    if (!session) {
      startupLoss ??= cause
      return
    }
    closeSessionAfterLivenessLoss(session, cause)
  }
  browser.on('disconnected', () => recordLivenessLoss('BROWSER_DISCONNECTED'))
  try {
    if (!browser.isConnected()) recordLivenessLoss('BROWSER_DISCONNECTED')
  } catch {
    recordLivenessLoss('BROWSER_DISCONNECTED')
  }
  try {
    context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' })
    context.on('close', () => recordLivenessLoss('CONTEXT_CLOSED'))
    await wireBrowserContainment(context, () => {
      if (!session) throw new ServiceError('Discovery browser session is not ready.', 'CONFLICT')
      return session
    })
    page = await context.newPage()
    page.on('close', () => recordLivenessLoss('PAGE_CLOSED'))
    page.on('crash', () => recordLivenessLoss('PAGE_CRASHED'))
    try {
      if (page.isClosed()) recordLivenessLoss('PAGE_CLOSED')
    } catch {
      recordLivenessLoss('PAGE_CLOSED')
    }
    session = {
      id: sessionId,
      generation,
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
      redirectInterception: runtime.redirectInterception ?? 'INITIAL_REQUEST_ONLY',
      cleanupState: 'NOT_REQUESTED',
      ownership,
    }
    wirePageContainment(session)
    const assertStartupLiveness = () => {
      const cause = startupLoss ?? browserLivenessCause(session!)
      if (!cause && isLiveSessionState(session!.state)) return
      if (cause) {
        setTerminalCause(session!, cause)
        beginTerminalSessionTransition(session!, 'CLOSED')
      }
      throw new ServiceError('Discovery browser closed while the session was starting.', 'CONFLICT')
    }
    assertStartupLiveness()
    await page.goto(routeUrl(scope.baseUrl, request.routeId), { waitUntil: 'domcontentloaded' })
    assertStartupLiveness()
    if (!allowedRequest(page.url(), 'GET', session, true, 'about:blank', 'DOCUMENT'))
      throw new ServiceError('Discovery browser navigation was rejected.', 'CONFLICT')
    assertStartupLiveness()
    await assertFrozenScopeStillMatchesSession(session, client)
    assertStartupLiveness()
    assertNoUnresolvedOwnedCleanup(request.journeyId, request.targetProjectId)
    await assertDurableOwnershipAllowsStart(request, client, ownership.id)
    await persistOwnershipStatus(ownership, 'LIVE', request)
    sessions.set(session.id, session)
    scheduleExpiry(session)
    return projection(session)
  } catch (error) {
    await cleanupFailedBrowserStart(session, request, ownership, browser, context, page)
    if (error instanceof ServiceError) throw error
    throw new ServiceError('Discovery browser navigation was unavailable.', 'CONFLICT')
  }
}

export async function getQualityJourneyDiscoveryBrowserSession(input: unknown) {
  const request = sessionInputSchema.parse(input)
  return projection(await getLiveSession(request))
}

/** Retained for explicit-return qualification callers. Product UI uses the
 * human-authorized Appraise-executed operation below. Both accept only scoped
 * session identity; neither accepts a caller-selected URL, origin, or route. */
export async function armQualityJourneyDiscoveryBrowserHumanReturn(input: unknown, client: Db = prisma) {
  const request = sessionInputSchema.parse(input)
  const session = await getLiveSession(request)
  const grant = await armHumanReturn(session, client)
  return { session: projection(session), returnUrl: grant.targetUrl }
}

async function armHumanReturn(session: Session, client: Db) {
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
  const grant = { grantId, targetUrl, expiresAt, state: 'ARMED' } as const
  session.humanReturnGrant = grant
  scheduleHumanReturnExpiry(session, grantId)
  return grant
}

/**
 * Applies one human authorization to the existing owned page. The caller names
 * only a scoped live session; the frozen return target remains service-derived.
 */
export async function authorizeQualityJourneyDiscoveryBrowserExactReturn(input: unknown, client: Db = prisma) {
  const request = sessionInputSchema.parse(input)
  const session = await getLiveSession(request)
  let grant: HumanReturnGrant
  try {
    grant = await armHumanReturn(session, client)
  } catch (error) {
    setTerminalCause(session, 'ROUTE_OPERATION_FAILED')
    await revokeSession(session, 'REVOKED')
    throw error
  }
  const committed = waitForHumanReturnCommit(session, grant.grantId)
  // Register a rejection handler before navigation so a synchronous browser-loss
  // event cannot become an unhandled rejection while page.goto is in flight.
  void committed.catch(() => undefined)
  const navigation = Promise.resolve().then(() => session.page.goto(grant.targetUrl, { waitUntil: 'domcontentloaded' }))
  const navigationFailure = navigation.then(
    () => new Promise<never>(() => undefined),
    async () => {
      // A late load failure cannot invalidate an already-proven exact commit.
      // Before that commit, navigation failure must fence the whole session.
      if (session.humanReturnGrant?.grantId === grant.grantId && session.humanReturnGrant.state === 'RETURNED')
        return new Promise<never>(() => undefined)
      setTerminalCause(session, 'ROUTE_OPERATION_FAILED')
      await revokeSession(session, 'REVOKED')
      throw new ServiceError('Discovery browser exact return navigation failed.', 'CONFLICT')
    },
  )
  void navigationFailure.catch(() => undefined)
  try {
    await Promise.race([committed, navigationFailure])
  } catch (error) {
    await committed.catch(() => undefined)
    throw error
  }
  const returned = session.humanReturnGrant
  if (
    !isLiveSessionState(session.state) ||
    returned?.grantId !== grant.grantId ||
    returned.state !== 'RETURNED' ||
    !session.humanReturn
  )
    throw new ServiceError('Discovery browser exact return did not commit.', 'CONFLICT')
  return { return: 'RETURN_COMMITTED' as const, session: projection(session) }
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

/** Process-local runtime close observations. Absence cannot establish that an earlier process left no browser. */
export function getOwnedQualityJourneyDiscoveryBrowserCleanup(input: unknown) {
  const scope = cleanupScopeSchema.parse(input)
  const receipts = ownedCleanupReceipts(scope.journeyId, scope.targetProjectId)
  return { state: receipts.length ? 'SESSIONS_REGISTERED' : 'NONE_REGISTERED', receipts }
}

export async function pauseOwnedQualityJourneyDiscoveryBrowserCleanup(
  input: unknown,
  client: Db = prisma,
  allowedSessionIds?: readonly string[],
) {
  const scope = cleanupScopeSchema.parse(input)
  const allowed = allowedSessionIds ? new Set(allowedSessionIds) : null
  const owned = [...sessions.values()].filter(
    session =>
      session.journeyId === scope.journeyId &&
      session.targetProjectId === scope.targetProjectId &&
      (!allowed || allowed.has(session.id)),
  )
  const startups = [...startupClosures.values()].filter(
    startup =>
      startup.journeyId === scope.journeyId &&
      startup.targetProjectId === scope.targetProjectId &&
      (!allowed || allowed.has(startup.id)),
  )
  const localReceipts = await Promise.all([
    ...owned.map(session => {
      beginTerminalSessionTransition(session, 'CLOSED')
      return closeSessionResources(session)
    }),
    ...startups.map(closeStartupResources),
  ])
  const localIds = new Set(localReceipts.map(receipt => receipt.sessionId))
  const foreignReceipts: CleanupReceipt[] = []
  for (const row of await activeOwnedBrowserRows(scope, client)) {
    if (localIds.has(row.sessionId) || (allowed && !allowed.has(row.sessionId))) continue
    await persistOwnershipStatus({ id: row.id, client, generation: row.generation }, 'UNKNOWN', scope)
    foreignReceipts.push({
      sessionId: row.sessionId,
      journeyId: row.journeyId,
      targetProjectId: row.targetProjectId,
      processInstanceId: row.processInstanceId,
      state: 'UNKNOWN',
    })
  }
  const receipts = [...localReceipts, ...foreignReceipts]
  return {
    state: localReceipts.length
      ? ('SESSIONS_REGISTERED' as const)
      : foreignReceipts.length
        ? ('DURABLE_OWNERSHIP_ONLY' as const)
        : ('NONE_REGISTERED' as const),
    receipts,
  }
}

export async function assertOwnedQualityJourneyDiscoveryBrowserCleanupReconciled(input: unknown, client: Db = prisma) {
  const result = getOwnedQualityJourneyDiscoveryBrowserCleanup(input)
  if (result.receipts.some(receipt => receipt.state !== 'RUNTIME_CLOSE_CONFIRMED'))
    throw new ServiceError('Owned Discovery browser runtime cleanup is unconfirmed.', 'CONFLICT')
  if ((await activeOwnedBrowserRows(cleanupScopeSchema.parse(input), client)).length)
    throw new ServiceError('Durable Discovery browser ownership is unconfirmed.', 'CONFLICT')
  return result
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
  assertCleanupConfirmed(await closeSessionResources(previous))
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
    previous.generation + 1,
  )
  const replacementSession = sessions.get(replacement.id)!
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
  await Promise.all([...startupClosures.values()].map(closeStartupResources))
  sessions.clear()
  startupClosures.clear()
}
