import type { DiscoveryBrowserRuntime } from './quality-journey-discovery-browser-service'
import {
  launchDiscoveryBrowserTransport,
  type DiscoveryBrowserProtocolEvent,
  type DiscoveryBrowserTransport,
} from './quality-journey-discovery-browser-transport'

type Listener = (value: unknown) => void
type TargetInfo = {
  targetId: string
  type: string
  browserContextId?: string
  openerId?: string
  subtype?: string
}
type Attachment = { sessionId: string; targetInfo: TargetInfo; waitingForDebugger: boolean }
type FrameRecord = { id: string; parentId?: string; url: string; securityOrigin?: string }
type Pause = {
  requestId: string
  redirectedRequestId?: string
  networkId?: string
  frameId?: string
  resourceType?: string
  request: { url?: string; method?: string }
  responseStatusCode?: number
  responseLocation?: string
}
type RoutePause = {
  requestId: string
  networkId?: string
  frameId: string
  resourceType: string
  request: { url: string; method: string }
}
type PendingResponse = {
  promise: Promise<CdpResponse>
  resolve(response: CdpResponse): void
  reject(error: Error): void
  timer: NodeJS.Timeout
}
type ReleasedRedirect = {
  targetId: string
  frameId: string
  sessionId: string
  networkId: string
  url: string
  method: string
}

const autoAttach = { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }
const websocketBinding = '__appraiseDiscoveryWebSocketDenied'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, failed) => {
    resolve = done
    reject = failed
  })
  return { promise, resolve, reject }
}
function isRedirect(status: number) {
  return status >= 300 && status < 400 && status !== 304
}
function frameTreeFrames(tree: unknown, parentId?: string): FrameRecord[] {
  if (!tree || typeof tree !== 'object') return []
  const value = tree as { frame?: { id?: unknown; url?: unknown; securityOrigin?: unknown }; childFrames?: unknown[] }
  if (typeof value.frame?.id !== 'string') return []
  const current = {
    id: value.frame.id,
    parentId,
    url: typeof value.frame.url === 'string' ? value.frame.url : '',
    ...(typeof value.frame.securityOrigin === 'string' ? { securityOrigin: value.frame.securityOrigin } : {}),
  }
  return [current, ...(value.childFrames ?? []).flatMap(child => frameTreeFrames(child, current.id))]
}

function validAttachment(attachment: Attachment, contextId: string) {
  const target = attachment?.targetInfo
  return Boolean(
    attachment?.waitingForDebugger &&
    typeof attachment.sessionId === 'string' &&
    attachment.sessionId &&
    target &&
    typeof target.targetId === 'string' &&
    target.targetId &&
    target.browserContextId === contextId,
  )
}
function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
function validRequestPause(pause: Pause): pause is Pause & RoutePause {
  return [pause.requestId, pause.frameId, pause.resourceType, pause.request?.url, pause.request?.method].every(
    nonemptyString,
  )
}
function validResponseStatus(status: unknown): status is number {
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
}
function responseMetadata(params: Record<string, unknown>) {
  const status = params.responseStatusCode
  if (!validResponseStatus(status)) throw new Error('Discovery browser response status is invalid.')
  if (!Array.isArray(params.responseHeaders)) throw new Error('Discovery browser response headers are unavailable.')
  let location: string | undefined
  for (const header of params.responseHeaders) {
    if (!header || !nonemptyString(header.name) || typeof header.value !== 'string')
      throw new Error('Discovery browser response header shape is invalid.')
    if (header.name.toLowerCase() !== 'location') continue
    if (location !== undefined) throw new Error('Discovery browser response has ambiguous redirect metadata.')
    location = header.value
  }
  return { responseStatusCode: status, responseLocation: location }
}
/** CDP may carry secrets transiently; never retain the raw event across asynchronous work. */
function projectPause(params: Record<string, unknown>): Pause & RoutePause {
  const incoming = params as unknown as Pause
  if (!validRequestPause(incoming)) throw new Error('Discovery browser pause identity is incomplete.')
  if (params.responseErrorReason !== undefined) throw new Error('Discovery browser response failed.')
  if (params.redirectedRequestId !== undefined && !nonemptyString(params.redirectedRequestId))
    throw new Error('Discovery browser redirect predecessor is invalid.')
  if (params.networkId !== undefined && !nonemptyString(params.networkId))
    throw new Error('Discovery browser network identity is invalid.')
  const response = params.responseStatusCode === undefined ? {} : responseMetadata(params)
  return {
    requestId: incoming.requestId,
    frameId: incoming.frameId,
    resourceType: incoming.resourceType,
    request: { url: incoming.request.url, method: incoming.request.method },
    ...(typeof params.redirectedRequestId === 'string' ? { redirectedRequestId: params.redirectedRequestId } : {}),
    ...(typeof params.networkId === 'string' ? { networkId: params.networkId } : {}),
    ...response,
  }
}

class CdpResponse {
  constructor(
    readonly requestId: string,
    readonly statusCode: number,
    readonly location?: string,
  ) {}
  headers(): Record<string, string> {
    return this.location ? { location: this.location } : {}
  }
  status() {
    return this.statusCode
  }
}

class CdpFrame {
  constructor(private readonly record: FrameRecord) {}
  url() {
    return this.record.url
  }
  securityOrigin() {
    return this.record.securityOrigin ?? ''
  }
}

class CdpPage {
  private readonly listeners = new Map<string, Set<Listener>>()
  private readonly frames = new Map<string, { record: FrameRecord; facade: CdpFrame }>()
  private mainFrameId = ''
  private closed = false

  constructor(
    readonly targetId: string,
    readonly sessionId: string,
    private readonly owner: CdpRuntime,
  ) {}

  async goto(url: string, options?: { waitUntil?: 'domcontentloaded' }) {
    if (this.closed) throw new Error('Discovery browser page is closed.')
    const result = await this.owner.send<{ errorText?: string; frameId?: string; loaderId?: string }>(
      'Page.navigate',
      { url },
      this.sessionId,
    )
    if (result.errorText) throw new Error(`Discovery browser navigation failed: ${result.errorText}`)
    if (options?.waitUntil === 'domcontentloaded' && result.loaderId)
      await this.owner.waitForDOMContentLoaded(this.sessionId, result.frameId ?? this.mainFrameId, result.loaderId)
    return undefined
  }
  url() {
    return this.frames.get(this.mainFrameId)?.record.url ?? ''
  }
  mainFrame() {
    const frame = this.frames.get(this.mainFrameId)?.facade
    if (!frame) throw new Error('Discovery browser main frame is unavailable.')
    return frame
  }
  async title() {
    // Content extraction is intentionally absent from the discovery runtime.
    return ''
  }
  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }
  emit(event: string, value: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(value)
  }
  isClosed() {
    return this.closed
  }
  async close() {
    if (this.closed) return
    this.closed = true
    await this.owner.close()
  }
  seedFrames(records: FrameRecord[]) {
    for (const record of records) this.installFrame(record, false)
    this.mainFrameId = records[0]?.id ?? ''
  }
  updateFrame(record: FrameRecord) {
    this.installFrame(record, true)
  }
  removeFrame(frameId: string) {
    this.frames.delete(frameId)
  }
  markClosed() {
    if (this.closed) return
    this.closed = true
    this.emit('close', undefined)
  }
  private installFrame(record: FrameRecord, emit: boolean) {
    const previous = this.frames.get(record.id)
    if (previous) {
      previous.record.url = record.url
      if (record.parentId !== undefined) previous.record.parentId = record.parentId
      previous.record.securityOrigin = record.securityOrigin
      if (emit) this.emit('framenavigated', previous.facade)
      return
    }
    const retainedRecord = { ...record }
    const retained = { record: retainedRecord, facade: new CdpFrame(retainedRecord) }
    this.frames.set(record.id, retained)
    if (!this.mainFrameId) this.mainFrameId = record.id
    if (emit) this.emit('framenavigated', retained.facade)
  }
  hasLiveChildFrame(frameId: string) {
    const frame = this.frames.get(frameId)?.record
    return Boolean(frame?.parentId && this.frames.has(frame.parentId))
  }
  frame(frameId: string) {
    return this.frames.get(frameId)?.facade
  }
}

class CdpRoute {
  private responseWaiter: PendingResponse | undefined
  private response: CdpResponse | undefined
  private settled = false
  constructor(
    private readonly owner: CdpRuntime,
    readonly page: CdpPage,
    readonly sessionId: string,
    readonly targetId: string,
    readonly pause: RoutePause,
  ) {}
  request() {
    const frame = this.page.frame(this.pause.frameId)
    if (!frame) throw new Error('Discovery browser request frame is unavailable.')
    return {
      url: () => this.pause.request.url,
      method: () => this.pause.request.method,
      isNavigationRequest: () => this.pause.resourceType.toLowerCase() === 'document',
      resourceType: () => this.pause.resourceType.toLowerCase(),
      frame: () => frame,
    }
  }
  async abort() {
    if (this.settled) return
    this.settled = true
    this.rejectResponse(new Error('Discovery browser route aborted.'))
    await this.owner.send(
      'Fetch.failRequest',
      { requestId: this.pause.requestId, errorReason: 'BlockedByClient' },
      this.sessionId,
    )
    this.owner.forgetRoute(this.pause.requestId)
  }
  async continue() {
    if (this.settled) return
    this.settled = true
    await this.owner.send('Fetch.continueRequest', { requestId: this.pause.requestId }, this.sessionId)
    this.owner.forgetRoute(this.pause.requestId)
  }
  async fetch(options: { maxRedirects: 0 }) {
    if (options.maxRedirects !== 0 || this.settled) throw new Error('Discovery browser route cannot fetch.')
    if (!this.responseWaiter) {
      const pending = deferred<CdpResponse>()
      this.responseWaiter = {
        promise: pending.promise,
        resolve: pending.resolve,
        reject: pending.reject,
        timer: setTimeout(() => {
          this.rejectResponse(new Error('Discovery browser response pause timed out.'))
          this.owner.terminal(new Error('Discovery browser response pause timed out.'))
        }, 15_000),
      }
      void this.responseWaiter.promise.catch(() => undefined)
    }
    const waiter = this.responseWaiter
    await this.owner.send(
      'Fetch.continueRequest',
      { requestId: this.pause.requestId, interceptResponse: true },
      this.sessionId,
    )
    return waiter.promise
  }
  async fulfill(options: { response: unknown }) {
    if (
      this.settled ||
      !(options.response instanceof CdpResponse) ||
      options.response.requestId !== this.pause.requestId
    )
      throw new Error('Discovery browser response identity mismatch.')
    this.settled = true
    const response = options.response
    if (isRedirect(response.statusCode)) this.owner.releaseRedirect(this.pause.requestId, this)
    await this.owner.send('Fetch.continueResponse', { requestId: this.pause.requestId }, this.sessionId)
    this.owner.forgetRoute(this.pause.requestId)
  }
  receive(response: CdpResponse) {
    this.response = response
    if (!this.responseWaiter) return
    clearTimeout(this.responseWaiter.timer)
    this.responseWaiter.resolve(response)
    this.responseWaiter = undefined
  }
  responseLocation() {
    return this.response?.headers().location
  }
  responseStatus() {
    return this.response?.status() ?? 0
  }
  matchesResponse(pause: Pause, sessionId?: string) {
    return (
      sessionId === this.sessionId &&
      pause.requestId === this.pause.requestId &&
      pause.networkId === this.pause.networkId &&
      pause.frameId === this.pause.frameId &&
      pause.request.url === this.pause.request.url &&
      pause.request.method === this.pause.request.method &&
      pause.resourceType === this.pause.resourceType
    )
  }
  rejectResponse(error: Error) {
    if (!this.responseWaiter) return
    clearTimeout(this.responseWaiter.timer)
    this.responseWaiter.reject(error)
    this.responseWaiter = undefined
  }
  discardResponse() {
    if (!this.responseWaiter) return
    clearTimeout(this.responseWaiter.timer)
    this.responseWaiter.reject(new Error('Discovery browser route was released.'))
    this.responseWaiter = undefined
  }
}

class CdpContext {
  private readonly listeners = new Map<string, Set<Listener>>()
  private routeHandler?: (route: CdpRoute) => Promise<void>
  private websocketHandler?: (route: {
    url(): string
    close(options: { code: number; reason: string }): void
  }) => Promise<void>
  private closed = false
  constructor(
    private readonly owner: CdpRuntime,
    private readonly page: CdpPage,
  ) {}
  async newPage() {
    if (this.closed) throw new Error('Discovery browser context is closed.')
    return this.page
  }
  async route(_pattern: string, handler: (route: CdpRoute) => Promise<void>) {
    this.routeHandler = handler
  }
  async routeWebSocket(
    _pattern: string,
    handler: (route: { url(): string; close(options: { code: number; reason: string }): void }) => Promise<void>,
  ) {
    this.websocketHandler = handler
  }
  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }
  async close() {
    if (this.closed) return
    this.closed = true
    await this.owner.close()
  }
  dispatchRoute(route: CdpRoute) {
    if (!this.routeHandler)
      return this.owner.terminal(new Error('Discovery browser route arrived before containment installation.'))
    void this.routeHandler(route).catch(error => void route.abort().catch(() => this.owner.terminal(error)))
  }
  dispatchWebSocket(url: string) {
    if (!this.websocketHandler)
      return this.owner.terminal(new Error('Discovery browser WebSocket arrived before containment installation.'))
    void this.websocketHandler({ url: () => url, close: () => undefined }).catch(error => this.owner.terminal(error))
  }
  markClosed() {
    if (this.closed) return
    this.closed = true
    for (const listener of this.listeners.get('close') ?? []) listener(undefined)
  }
}

class CdpRuntime {
  private contextId = ''
  private seedTargetId = ''
  private seedReady = deferred<CdpPage>()
  private readonly pendingAttachments: Attachment[] = []
  private readonly pagesBySession = new Map<string, { page: CdpPage; targetId: string }>()
  private readonly pagesByTarget = new Map<string, CdpPage>()
  private readonly routes = new Map<string, CdpRoute>()
  private readonly redirects = new Map<string, ReleasedRedirect>()
  private readonly domReady = new Map<
    string,
    Array<{ frameId: string; loaderId: string; resolve(): void; reject(error: Error): void; timer: NodeJS.Timeout }>
  >()
  private readonly completedDocuments = new Map<string, string>()
  private readonly disconnected = new Set<() => void>()
  private context: CdpContext | undefined
  private terminalState = false

  constructor(private readonly transport: DiscoveryBrowserTransport) {
    void this.seedReady.promise.catch(() => undefined)
    transport.events(event => this.event(event))
    transport.lost(() => this.terminal(new Error('Discovery browser transport lost.')))
  }
  async createContext() {
    const { browserContextId } = await this.send<{ browserContextId: string }>('Target.createBrowserContext', {
      disposeOnDetach: true,
    })
    if (typeof browserContextId !== 'string' || !browserContextId)
      throw new Error('Discovery browser did not create a disposable context.')
    this.contextId = browserContextId
    await this.send('Browser.setDownloadBehavior', { behavior: 'deny', eventsEnabled: true, browserContextId })
    await this.send('Target.setAutoAttach', autoAttach)
    const { targetId } = await this.send<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
      browserContextId,
    })
    if (typeof targetId !== 'string' || !targetId) throw new Error('Discovery browser did not create a seed target.')
    this.seedTargetId = targetId
    for (const attachment of this.pendingAttachments.splice(0)) void this.admitAttachment(attachment)
    const timer = setTimeout(() => this.terminal(new Error('Discovery browser seed admission timed out.')), 10_000)
    try {
      const page = await this.seedReady.promise
      this.context = new CdpContext(this, page)
      return this.context
    } finally {
      clearTimeout(timer)
    }
  }
  browser() {
    return {
      newContext: () => this.createContext(),
      on: (event: string, listener: () => void) => {
        if (event === 'disconnected') this.disconnected.add(listener)
      },
      isConnected: () => !this.terminalState && this.transport.isConnected(),
      close: () => this.close(),
    }
  }
  send<T = Record<string, never>>(method: string, params: object = {}, sessionId?: string) {
    if (this.terminalState) return Promise.reject(new Error('Discovery browser is disconnected.')) as Promise<T>
    return this.transport.send<T>(method, params, sessionId)
  }
  async close() {
    this.disconnect()
    await this.transport.close()
  }
  terminal(error: unknown) {
    if (this.terminalState) return
    this.disconnect()
    void this.transport.close().catch(() => undefined)
    this.seedReady.reject(error instanceof Error ? error : new Error('Discovery browser target admission failed.'))
  }
  forgetRoute(requestId: string) {
    const route = this.routes.get(requestId)
    this.routes.delete(requestId)
    route?.discardResponse()
  }
  targetForSession(sessionId?: string) {
    return sessionId ? this.pagesBySession.get(sessionId)?.targetId : undefined
  }
  releaseRedirect(requestId: string, route: CdpRoute) {
    const location = route.responseLocation()
    const status = route.responseStatus()
    if (!location || !isRedirect(status))
      return this.terminal(new Error('Discovery browser redirect metadata is unavailable.'))
    const networkId = route.pause.networkId
    if (!networkId) return this.terminal(new Error('Discovery browser redirect network identity is unavailable.'))
    if (
      [...this.redirects.values()].some(
        redirect => redirect.sessionId === route.sessionId && redirect.networkId === networkId,
      )
    )
      return this.terminal(new Error('Discovery browser received a duplicate pending redirect network identity.'))
    let url: string
    try {
      url = new URL(location, route.request().url()).toString()
    } catch {
      return this.terminal(new Error('Discovery browser redirect location is invalid.'))
    }
    const sourceMethod = (route.request().method() ?? '').toUpperCase()
    const method =
      status === 303 || ((status === 301 || status === 302) && sourceMethod === 'POST') ? 'GET' : sourceMethod
    this.redirects.set(requestId, {
      targetId: route.targetId,
      frameId: route.pause.frameId,
      sessionId: route.sessionId,
      networkId,
      url,
      method,
    })
  }
  async waitForDOMContentLoaded(sessionId: string, frameId: string, loaderId: string) {
    if (this.terminalState) throw new Error('Discovery browser is disconnected.')
    if (!frameId) throw new Error('Discovery browser navigation omitted a frame.')
    if (this.completedDocuments.get(`${sessionId}:${frameId}`) === loaderId) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Discovery browser navigation timed out before DOMContentLoaded.')),
        15_000,
      )
      const waiters = this.domReady.get(sessionId) ?? []
      waiters.push({ frameId, loaderId, resolve, reject, timer })
      this.domReady.set(sessionId, waiters)
    })
  }
  private readonly eventHandlers: Record<string, (event: DiscoveryBrowserProtocolEvent) => void> = {
    'Target.attachedToTarget': event => {
      const attachment = event.params as unknown as Attachment
      if (!this.seedTargetId) this.pendingAttachments.push(attachment)
      else void this.admitAttachment(attachment)
    },
    'Target.detachedFromTarget': () => this.terminal(new Error('Discovery browser target detached.')),
    'Target.targetCrashed': () => this.terminal(new Error('Discovery browser target crashed.')),
    'Inspector.targetCrashed': () => this.terminal(new Error('Discovery browser target crashed.')),
    'Fetch.requestPaused': event => {
      void this.pause(projectPause(event.params), event.sessionId).catch(error => this.terminal(error))
    },
    'Page.frameNavigated': event => this.frameNavigated(event.params, event.sessionId),
    'Page.frameAttached': event => this.frameAttached(event.params, event.sessionId),
    'Page.frameDetached': event => this.frameDetached(event.params, event.sessionId),
    'Page.lifecycleEvent': event => this.lifecycle(event.params, event.sessionId),
    'Browser.downloadWillBegin': () => this.download(),
    'Network.webSocketCreated': event => this.websocket(event.params, event.sessionId),
    'Runtime.bindingCalled': event => {
      if (event.params.name === websocketBinding)
        this.websocket({ url: String(event.params.payload ?? '') }, event.sessionId)
    },
  }
  private event(event: DiscoveryBrowserProtocolEvent) {
    if (this.terminalState) return
    try {
      this.eventHandlers[event.method]?.(event)
    } catch (error) {
      this.terminal(error)
    }
  }
  private owningPage(attachment: Attachment) {
    const target = attachment.targetInfo
    const isSeed = target.targetId === this.seedTargetId
    if (target.type !== (isSeed ? 'page' : 'iframe') || target.openerId !== undefined || target.subtype !== undefined)
      throw new Error('Discovery browser rejected an unadmitted target.')
    if (isSeed) return new CdpPage(target.targetId, attachment.sessionId, this)
    const owner = [...this.pagesBySession.values()]
      .map(entry => entry.page)
      .find(candidate => candidate.hasLiveChildFrame(target.targetId))
    if (!owner) throw new Error('Discovery browser rejected an OOPIF without a live parent frame.')
    return owner
  }
  private async admitAttachment(attachment: Attachment) {
    try {
      const target = attachment?.targetInfo
      if (!validAttachment(attachment, this.contextId))
        return this.terminal(new Error('Discovery browser received malformed target attachment.'))
      if (this.pagesBySession.has(attachment.sessionId) || this.pagesByTarget.has(target.targetId))
        return this.terminal(new Error('Discovery browser received duplicate target attachment.'))
      const isSeed = target.targetId === this.seedTargetId
      const page = this.owningPage(attachment)
      this.pagesBySession.set(attachment.sessionId, { page, targetId: target.targetId })
      this.pagesByTarget.set(target.targetId, page)
      await this.guardTarget(attachment.sessionId, page)
      if (this.terminalState) return
      if (isSeed) this.seedReady.resolve(page)
    } catch (error) {
      this.terminal(error)
    }
  }
  private async guardTarget(sessionId: string, page: CdpPage) {
    await this.send('Target.setAutoAttach', autoAttach, sessionId)
    await this.send('Page.enable', {}, sessionId)
    await this.send('Network.enable', {}, sessionId)
    await this.send('Network.setBypassServiceWorker', { bypass: true }, sessionId)
    await this.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sessionId)
    await this.send('Runtime.enable', {}, sessionId)
    await this.send('Runtime.addBinding', { name: websocketBinding }, sessionId)
    await this.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `(() => { const notify = globalThis.${websocketBinding}; const denied = () => { try { notify('WEBSOCKET_ATTEMPT'); } catch {} throw new DOMException('WebSocket denied by journey policy', 'SecurityError'); }; class DeniedWebSocket { constructor() { denied(); } } Object.freeze(DeniedWebSocket.prototype); Object.freeze(DeniedWebSocket); Object.defineProperty(globalThis, 'WebSocket', { value: DeniedWebSocket, writable: false, configurable: false }); if ('WebSocketStream' in globalThis) { class DeniedWebSocketStream { constructor() { denied(); } } Object.freeze(DeniedWebSocketStream.prototype); Object.freeze(DeniedWebSocketStream); Object.defineProperty(globalThis, 'WebSocketStream', { value: DeniedWebSocketStream, writable: false, configurable: false }); } try { const serviceWorker = navigator.serviceWorker; const blocked = () => Promise.reject(new DOMException('Service worker denied by journey policy', 'SecurityError')); if (serviceWorker) { try { Object.defineProperty(serviceWorker, 'register', { configurable: true, value: blocked }); } catch { try { serviceWorker.register = blocked; } catch {} } } } catch {} })();`,
      },
      sessionId!,
    )
    await this.send('Page.setLifecycleEventsEnabled', { enabled: true }, sessionId)
    const inventory = await this.send<{ frameTree?: unknown }>('Page.getFrameTree', {}, sessionId)
    const records = frameTreeFrames(inventory.frameTree)
    if (!records.length) throw new Error('Discovery browser target did not provide a frame inventory.')
    if (page.url() === '') page.seedFrames(records)
    else for (const record of records) page.updateFrame(record)
    await this.send('Runtime.runIfWaitingForDebugger', {}, sessionId)
  }
  private requestPage(pause: Pause, sessionId?: string) {
    const page = sessionId ? this.pagesBySession.get(sessionId)?.page : undefined
    if (!page || !validRequestPause(pause) || !page.frame(pause.frameId) || this.routes.has(pause.requestId))
      throw new Error('Discovery browser received an invalid request pause.')
    return { page, pause }
  }
  private async requireFrameOrigin(page: CdpPage, frameId: string, sessionId: string) {
    if (!page.frame(frameId)?.securityOrigin()) await this.refreshFrameInventory(page, sessionId)
    if (!page.frame(frameId)?.securityOrigin())
      throw new Error('Discovery browser request frame has no reported security origin.')
  }
  private async pause(incoming: Pause, sessionId?: string) {
    if (incoming.responseStatusCode !== undefined) return this.receiveResponse(incoming, sessionId)
    const { page, pause } = this.requestPage(incoming, sessionId)
    await this.requireFrameOrigin(page, pause.frameId, sessionId!)
    this.checkRedirectLineage(pause, sessionId)
    if (this.terminalState) return
    const targetId = this.targetForSession(sessionId)
    if (!targetId) return this.terminal(new Error('Discovery browser request target is unavailable.'))
    const route = new CdpRoute(this, page, sessionId!, targetId, {
      requestId: pause.requestId,
      ...(pause.networkId ? { networkId: pause.networkId } : {}),
      frameId: pause.frameId,
      resourceType: pause.resourceType,
      request: { url: pause.request.url, method: pause.request.method },
    })
    this.routes.set(pause.requestId, route)
    if (!this.context) return this.terminal(new Error('Discovery browser context is not ready.'))
    this.context.dispatchRoute(route)
  }
  private receiveResponse(pause: Pause, sessionId?: string) {
    const route = this.routes.get(pause.requestId)
    if (!route || !route.matchesResponse(pause, sessionId))
      return this.terminal(new Error('Discovery browser received an invalid response pause.'))
    route.receive(new CdpResponse(pause.requestId, pause.responseStatusCode!, pause.responseLocation))
  }
  private checkRedirectLineage(pause: Pause & RoutePause, sessionId?: string) {
    if (pause.redirectedRequestId) {
      const predecessor = this.redirects.get(pause.redirectedRequestId)
      if (
        !predecessor ||
        predecessor.targetId !== this.targetForSession(sessionId) ||
        predecessor.frameId !== pause.frameId ||
        predecessor.sessionId !== sessionId ||
        predecessor.networkId !== pause.networkId ||
        predecessor.url !== pause.request.url ||
        predecessor.method !== pause.request.method.toUpperCase()
      )
        return this.terminal(new Error('Discovery browser rejected an unrecognized redirect successor.'))
      this.redirects.delete(pause.redirectedRequestId)
      return
    }
    if (pause.networkId) {
      if (
        this.redirects.size &&
        [...this.redirects.values()].some(
          redirect => redirect.sessionId === sessionId && redirect.networkId === pause.networkId,
        )
      )
        return this.terminal(new Error('Discovery browser redirect successor omitted its lineage.'))
      return
    }
    if (
      [...this.redirects.values()].some(
        redirect =>
          redirect.targetId === this.targetForSession(sessionId) &&
          redirect.sessionId === sessionId &&
          redirect.frameId === pause.frameId,
      )
    )
      return this.terminal(new Error('Discovery browser redirect identity is ambiguous.'))
  }
  private frameNavigated(params: Record<string, unknown>, sessionId?: string) {
    const page = sessionId ? this.pagesBySession.get(sessionId)?.page : undefined
    const frame = params.frame as
      { id?: unknown; parentId?: unknown; url?: unknown; securityOrigin?: unknown } | undefined
    if (!page || typeof frame?.id !== 'string' || typeof frame.url !== 'string')
      return this.terminal(new Error('Discovery browser emitted malformed frame navigation.'))
    page.updateFrame({
      id: frame.id,
      ...(typeof frame.parentId === 'string' ? { parentId: frame.parentId } : {}),
      url: frame.url,
      ...(typeof frame.securityOrigin === 'string' ? { securityOrigin: frame.securityOrigin } : {}),
    })
  }
  private frameAttached(params: Record<string, unknown>, sessionId?: string) {
    const page = sessionId ? this.pagesBySession.get(sessionId)?.page : undefined
    if (!page || typeof params.frameId !== 'string' || typeof params.parentFrameId !== 'string')
      return this.terminal(new Error('Discovery browser emitted malformed frame attachment.'))
    page.updateFrame({
      id: params.frameId,
      parentId: params.parentFrameId,
      url: page.frame(params.frameId)?.url() ?? '',
      securityOrigin: page.frame(params.frameId)?.securityOrigin(),
    })
  }
  private async refreshFrameInventory(page: CdpPage, sessionId: string) {
    const inventory = await this.send<{ frameTree?: unknown }>('Page.getFrameTree', {}, sessionId)
    for (const record of frameTreeFrames(inventory.frameTree)) page.updateFrame(record)
  }
  private frameDetached(params: Record<string, unknown>, sessionId?: string) {
    const page = sessionId ? this.pagesBySession.get(sessionId)?.page : undefined
    if (!page || typeof params.frameId !== 'string')
      return this.terminal(new Error('Discovery browser emitted malformed frame detachment.'))
    // OOPIF swaps retain their identity until the matching iframe target is admitted.
    if (params.reason !== 'swap') {
      page.removeFrame(params.frameId)
      this.completedDocuments.delete(`${sessionId}:${params.frameId}`)
    }
  }
  private lifecycle(params: Record<string, unknown>, sessionId?: string) {
    if (
      params.name !== 'DOMContentLoaded' ||
      !sessionId ||
      typeof params.frameId !== 'string' ||
      typeof params.loaderId !== 'string'
    )
      return
    this.completedDocuments.set(`${sessionId}:${params.frameId}`, params.loaderId)
    const pending = this.domReady.get(sessionId) ?? []
    const matched = pending.filter(item => item.frameId === params.frameId && item.loaderId === params.loaderId)
    this.domReady.set(
      sessionId,
      pending.filter(item => !matched.includes(item)),
    )
    for (const item of matched) {
      clearTimeout(item.timer)
      item.resolve()
    }
  }
  private download() {
    this.pagesByTarget.get(this.seedTargetId)?.emit('download', { cancel: async () => undefined })
  }
  private websocket(params: Record<string, unknown>, sessionId?: string) {
    const page = sessionId ? this.pagesBySession.get(sessionId)?.page : this.pagesByTarget.get(this.seedTargetId)
    if (!page) return this.terminal(new Error('Discovery browser WebSocket lacked an owning page.'))
    this.context?.dispatchWebSocket(typeof params.url === 'string' ? params.url : '')
    page.emit('websocket', undefined)
  }
  private disconnect() {
    if (this.terminalState) return
    this.terminalState = true
    const error = new Error('Discovery browser disconnected.')
    this.seedReady.reject(error)
    this.completedDocuments.clear()
    for (const route of this.routes.values()) route.rejectResponse(error)
    this.routes.clear()
    for (const waiters of this.domReady.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer)
        waiter.reject(error)
      }
    }
    this.domReady.clear()
    for (const listener of this.disconnected) listener()
    this.context?.markClosed()
    for (const { page } of new Map([...this.pagesBySession.values()].map(entry => [entry.page, entry])).values())
      page.markClosed()
  }
}

export function createQualityJourneyDiscoveryBrowserRuntime(
  options: {
    headless?: boolean
    transportFactory?: () => Promise<DiscoveryBrowserTransport>
  } = {},
): DiscoveryBrowserRuntime {
  const { headless = false, transportFactory = () => launchDiscoveryBrowserTransport(headless) } = options
  return {
    redirectInterception: 'EVERY_HOP',
    async launch() {
      const runtime = new CdpRuntime(await transportFactory())
      return runtime.browser()
    },
  }
}
