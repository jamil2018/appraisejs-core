import { describe, expect, it, vi } from 'vitest'
import { createQualityJourneyDiscoveryBrowserRuntime } from './quality-journey-discovery-browser-runtime'
import type {
  DiscoveryBrowserProtocolEvent,
  DiscoveryBrowserTransport,
} from './quality-journey-discovery-browser-transport'

type Command = { method: string; params: object; sessionId?: string }
type Options = {
  attachment?: Partial<{
    type: string
    subtype: string
    openerId: string
    targetId: string
    browserContextId: string
  }>
  fail?: string
  waitingForDebugger?: boolean
  omitSeedAttachment?: boolean
  lifecycleBeforeNavigateResult?: boolean
  lifecycleLoaderId?: string
  navigateResult?: { frameId?: string; loaderId?: string }
}

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

type CommandHandler = (sessionId?: string) => unknown

function seedAttachment(options: Options): DiscoveryBrowserProtocolEvent {
  const attachment = options.attachment ?? {}
  return {
    method: 'Target.attachedToTarget',
    params: {
      sessionId: 'seed-session',
      waitingForDebugger: options.waitingForDebugger ?? true,
      targetInfo: {
        targetId: attachment.targetId ?? 'seed-target',
        type: attachment.type ?? 'page',
        browserContextId: attachment.browserContextId ?? 'context-1',
        openerId: attachment.openerId,
        subtype: attachment.subtype,
      },
    },
  }
}

function seedTargetReply(options: Options, emit: (event: DiscoveryBrowserProtocolEvent) => void) {
  if (!options.omitSeedAttachment) queueMicrotask(() => emit(seedAttachment(options)))
  return { targetId: 'seed-target' }
}

function navigateReply(options: Options, emit: (event: DiscoveryBrowserProtocolEvent) => void, sessionId?: string) {
  if (options.lifecycleBeforeNavigateResult)
    emit({
      method: 'Page.lifecycleEvent',
      sessionId,
      params: {
        name: 'DOMContentLoaded',
        frameId: 'seed-target',
        loaderId: options.lifecycleLoaderId ?? 'loader-1',
      },
    })
  return options.navigateResult ?? { frameId: 'seed-target', loaderId: 'loader-1' }
}

function frameTreeReply() {
  return {
    frameTree: { frame: { id: 'seed-target', url: 'about:blank', securityOrigin: 'https://example.test' } },
  }
}

function fakeTransport(options: Options = {}) {
  const commands: Command[] = []
  let eventHandler: (event: DiscoveryBrowserProtocolEvent) => void = () => undefined
  let lossHandler: () => void = () => undefined
  let connected = true
  const emit = (event: DiscoveryBrowserProtocolEvent) => eventHandler(event)
  const commandHandlers = new Map<string, CommandHandler>([
    ['Target.createBrowserContext', () => ({ browserContextId: 'context-1' })],
    ['Target.createTarget', () => seedTargetReply(options, emit)],
    ['Page.navigate', sessionId => navigateReply(options, emit, sessionId)],
    ['Page.getFrameTree', frameTreeReply],
  ])
  if (options.fail) commandHandlers.set(options.fail, () => Promise.reject(new Error('synthetic command failure')))
  const transport: DiscoveryBrowserTransport = {
    async send<T>(method: string, params: object = {}, sessionId?: string): Promise<T> {
      commands.push({ method, params, ...(sessionId ? { sessionId } : {}) })
      return ((await commandHandlers.get(method)?.(sessionId)) ?? {}) as T
    },
    events(handler) {
      eventHandler = handler
    },
    lost(handler) {
      lossHandler = handler
    },
    async close() {
      if (!connected) return
      connected = false
      lossHandler()
    },
    exited: Promise.resolve(),
    profileDirectory: '/tmp/adapter-unit',
    breakPipe() {
      connected = false
      lossHandler()
    },
    isConnected: () => connected,
  }
  return { transport, commands, emit }
}

async function admitted(options?: Options) {
  const fixture = fakeTransport(options)
  const runtime = createQualityJourneyDiscoveryBrowserRuntime({ transportFactory: async () => fixture.transport })
  const browser = await runtime.launch()
  const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' })
  const page = await context.newPage()
  return { ...fixture, browser, context, page }
}

type AdmittedFixture = Awaited<ReturnType<typeof admitted>>
type Redirect = {
  requestId: string
  networkId: string
  url: string
  location: string
  frameId?: string
  sessionId?: string
  status?: number
}

async function releaseRedirect(fixture: AdmittedFixture, redirect: Redirect) {
  const frameId = redirect.frameId ?? 'seed-target'
  const sessionId = redirect.sessionId ?? 'seed-session'
  const status = redirect.status ?? 302
  fixture.emit({
    method: 'Fetch.requestPaused',
    sessionId,
    params: {
      requestId: redirect.requestId,
      networkId: redirect.networkId,
      frameId,
      resourceType: 'Document',
      request: { url: redirect.url, method: 'GET' },
    },
  })
  await flush()
  fixture.emit({
    method: 'Fetch.requestPaused',
    sessionId,
    params: {
      requestId: redirect.requestId,
      networkId: redirect.networkId,
      frameId,
      resourceType: 'Document',
      request: { url: redirect.url, method: 'GET' },
      responseStatusCode: status,
      responseHeaders: [{ name: 'location', value: redirect.location }],
    },
  })
  await flush()
}

async function pausedResponseRoute() {
  const fixture = await admitted()
  await fixture.context.route('**/*', async route => {
    await route.fetch({ maxRedirects: 0 })
  })
  fixture.emit({
    method: 'Fetch.requestPaused',
    sessionId: 'seed-session',
    params: {
      requestId: 'request-1',
      frameId: 'seed-target',
      resourceType: 'Document',
      request: { url: 'https://example.test/', method: 'GET' },
    },
  })
  await flush()
  return fixture
}

describe('discovery CDP runtime admission', () => {
  it.each([[{ type: 'page', subtype: 'prerender' }], [{ type: 'worker' }], [{ targetId: 'wrong-seed' }]])(
    'rejects malformed or unadmitted seed metadata before resume',
    async attachment => {
      const fixture = fakeTransport({ attachment })
      const runtime = createQualityJourneyDiscoveryBrowserRuntime({ transportFactory: async () => fixture.transport })
      const browser = await runtime.launch()
      await expect(browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' })).rejects.toThrow()
      expect(fixture.commands.some(command => command.method === 'Runtime.runIfWaitingForDebugger')).toBe(false)
    },
  )

  it('does not resume a target when a mandatory guard command fails', async () => {
    const fixture = fakeTransport({ fail: 'Fetch.enable' })
    const runtime = createQualityJourneyDiscoveryBrowserRuntime({ transportFactory: async () => fixture.transport })
    const browser = await runtime.launch()
    await expect(browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' })).rejects.toThrow()
    expect(fixture.commands.some(command => command.method === 'Runtime.runIfWaitingForDebugger')).toBe(false)
  })

  it.each([
    ['a different browser context', { attachment: { browserContextId: 'context-other' } }],
    ['an unpaused seed target', { waitingForDebugger: false }],
    ['seed opener metadata', { attachment: { openerId: 'popup-target' } }],
  ])('rejects %s before resuming the target', async (_description, options: Options) => {
    const fixture = fakeTransport(options)
    const runtime = createQualityJourneyDiscoveryBrowserRuntime({ transportFactory: async () => fixture.transport })
    const browser = await runtime.launch()
    await expect(browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' })).rejects.toThrow()
    expect(fixture.commands.some(command => command.method === 'Runtime.runIfWaitingForDebugger')).toBe(false)
  })

  it('rejects a subtyped iframe attachment before admitting it to a parent page', async () => {
    const fixture = await admitted()
    fixture.emit({
      method: 'Target.attachedToTarget',
      params: {
        sessionId: 'iframe-session',
        waitingForDebugger: true,
        targetInfo: {
          targetId: 'iframe-target',
          type: 'iframe',
          subtype: 'prerender',
          browserContextId: 'context-1',
        },
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('rejects a request after a committed child frame loses its security origin', async () => {
    const fixture = await admitted()
    let routed = false
    await fixture.context.route('**/*', async () => {
      routed = true
    })
    fixture.emit({
      method: 'Page.frameAttached',
      sessionId: 'seed-session',
      params: { frameId: 'child-frame', parentFrameId: 'seed-target' },
    })
    fixture.emit({
      method: 'Page.frameNavigated',
      sessionId: 'seed-session',
      params: {
        frame: {
          id: 'child-frame',
          parentId: 'seed-target',
          url: 'https://child.example.test/committed',
          securityOrigin: 'https://child.example.test',
        },
      },
    })
    fixture.emit({
      method: 'Page.frameAttached',
      sessionId: 'seed-session',
      params: { frameId: 'child-frame', parentFrameId: 'seed-target' },
    })
    fixture.emit({
      method: 'Page.frameNavigated',
      sessionId: 'seed-session',
      params: {
        frame: { id: 'child-frame', parentId: 'seed-target', url: 'https://child.example.test/replaced' },
      },
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'child-request',
        frameId: 'child-frame',
        resourceType: 'Document',
        request: { url: 'https://child.example.test/replaced', method: 'GET' },
      },
    })
    await flush()
    expect(routed).toBe(false)
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('rejects duplicate target identity synchronously', async () => {
    const fixture = await admitted()
    fixture.emit({
      method: 'Target.attachedToTarget',
      params: {
        sessionId: 'other-session',
        waitingForDebugger: true,
        targetInfo: { targetId: 'seed-target', type: 'page', browserContextId: 'context-1' },
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('rejects a response whose CDP session does not own the paused request', async () => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      await route.fetch({ maxRedirects: 0 })
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/', method: 'GET' },
      },
    })
    await flush()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'other-session',
      params: {
        requestId: 'request-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/', method: 'GET' },
        responseStatusCode: 200,
        responseHeaders: [],
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it.each([
    ['frame', { frameId: 'other-frame' }],
    ['URL', { request: { url: 'https://example.test/other', method: 'GET' } }],
    ['method', { request: { url: 'https://example.test/', method: 'POST' } }],
  ])('rejects a response with a mismatched %s', async (_scope, mismatch) => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      await route.fetch({ maxRedirects: 0 })
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/', method: 'GET' },
      },
    })
    await flush()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/', method: 'GET' },
        responseStatusCode: 200,
        responseHeaders: [],
        ...mismatch,
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it.each(['frameId', 'resourceType', 'url', 'method'])(
    'rejects a response that omits its %s identity',
    async field => {
      const fixture = await pausedResponseRoute()
      const response: Record<string, unknown> = {
        requestId: 'request-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/', method: 'GET' },
        responseStatusCode: 200,
        responseHeaders: [],
      }
      if (field === 'url' || field === 'method') delete (response.request as Record<string, unknown>)[field]
      else delete response[field]
      fixture.emit({ method: 'Fetch.requestPaused', sessionId: 'seed-session', params: response })
      await flush()
      expect(fixture.browser.isConnected()).toBe(false)
    },
  )

  it('rejects a response with a mismatched resource type', async () => {
    const fixture = await pausedResponseRoute()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-1',
        frameId: 'seed-target',
        resourceType: 'XHR',
        request: { url: 'https://example.test/', method: 'GET' },
        responseStatusCode: 200,
        responseHeaders: [],
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it.each([
    ['NaN', Number.NaN],
    ['an out-of-range low status', 99],
    ['an out-of-range high status', 600],
    ['a fractional status', 200.5],
  ])('rejects a response with %s', async (_description, responseStatusCode) => {
    const fixture = await pausedResponseRoute()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/', method: 'GET' },
        responseStatusCode,
        responseHeaders: [],
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it.each([
    ['missing response headers', undefined],
    ['a non-array response headers value', {}],
    ['a malformed response header entry', [{ name: 'location' }]],
  ])('rejects a response with %s', async (_description, responseHeaders) => {
    const fixture = await pausedResponseRoute()
    const params: Record<string, unknown> = {
      requestId: 'request-1',
      frameId: 'seed-target',
      resourceType: 'Document',
      request: { url: 'https://example.test/', method: 'GET' },
      responseStatusCode: 200,
    }
    if (responseHeaders !== undefined) params.responseHeaders = responseHeaders
    fixture.emit({ method: 'Fetch.requestPaused', sessionId: 'seed-session', params })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('rejects a response with duplicate Location headers', async () => {
    const fixture = await pausedResponseRoute()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/', method: 'GET' },
        responseStatusCode: 302,
        responseHeaders: [
          { name: 'location', value: '/first' },
          { name: 'Location', value: '/second' },
        ],
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it.each([
    [200, true],
    [304, true],
    [302, false],
  ])('handles a stylesheet %i without Location while retaining redirect denial', async (status, connected) => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      const response = await route.fetch({ maxRedirects: 0 })
      await route.fulfill({ response })
    })
    const request = {
      requestId: 'stylesheet-request',
      networkId: 'stylesheet-network',
      frameId: 'seed-target',
      resourceType: 'Stylesheet',
      request: { url: 'https://example.test/style.css', method: 'GET' },
    }
    fixture.emit({ method: 'Fetch.requestPaused', sessionId: 'seed-session', params: request })
    await flush()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: { ...request, responseStatusCode: status, responseHeaders: [] },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(connected)
    expect(fixture.commands.some(command => command.method === 'Fetch.continueResponse')).toBe(connected)
  })

  it('rejects a response with a protocol error reason', async () => {
    const fixture = await pausedResponseRoute()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/', method: 'GET' },
        responseStatusCode: 200,
        responseHeaders: [],
        responseErrorReason: 'Failed',
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('does not expose source request bodies or headers through the route facade', async () => {
    const fixture = await admitted()
    let observedRoute: unknown
    let observedRequest: unknown
    const sourceRequest = {
      url: 'https://example.test/',
      method: 'POST',
      get postData() {
        throw new Error('route must not inspect request bodies')
      },
      get headers() {
        throw new Error('route must not inspect request headers')
      },
    }
    await fixture.context.route('**/*', async route => {
      observedRoute = route
      observedRequest = route.request()
      await route.abort()
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'privacy-request',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: sourceRequest,
      },
    })
    await flush()
    expect(observedRequest).toBeDefined()
    expect(observedRequest).not.toHaveProperty('postData')
    expect(observedRequest).not.toHaveProperty('headers')
    const retainedRequest = (observedRoute as { pause?: { request?: object } } | undefined)?.pause?.request
    expect(retainedRequest).not.toHaveProperty('postData')
    expect(retainedRequest).not.toHaveProperty('headers')
  })

  it('requires a redirect successor to provide the released exact lineage', async () => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      const response = await route.fetch({ maxRedirects: 0 })
      await route.fulfill({ response })
    })
    await releaseRedirect(fixture, {
      requestId: 'request-1',
      networkId: 'network-1',
      url: 'https://example.test/a',
      location: '/b',
      status: 303,
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-2',
        networkId: 'network-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/b', method: 'GET' },
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('rejects a redirect response when the request did not provide a stable network identity', async () => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      const response = await route.fetch({ maxRedirects: 0 })
      await route.fulfill({ response })
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'redirect-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/a', method: 'GET' },
      },
    })
    await flush()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'redirect-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/a', method: 'GET' },
        responseStatusCode: 302,
        responseHeaders: [{ name: 'location', value: '/b' }],
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('rejects a response whose network identity differs from its request-stage identity', async () => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      await route.fetch({ maxRedirects: 0 })
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-1',
        networkId: 'network-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/a', method: 'GET' },
      },
    })
    await flush()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-1',
        networkId: 'network-2',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/a', method: 'GET' },
        responseStatusCode: 200,
        responseHeaders: [],
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('rejects a redirect successor that names an unknown predecessor', async () => {
    const fixture = await admitted()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-2',
        redirectedRequestId: 'not-a-predecessor',
        networkId: 'network-unknown',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/b', method: 'GET' },
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('rejects a redirect predecessor reused after its successor consumed it', async () => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      const response = await route.fetch({ maxRedirects: 0 })
      await route.fulfill({ response })
    })
    await releaseRedirect(fixture, {
      requestId: 'request-1',
      networkId: 'network-1',
      url: 'https://example.test/a',
      location: '/b',
      status: 303,
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-2',
        redirectedRequestId: 'request-1',
        networkId: 'network-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/b', method: 'GET' },
      },
    })
    await flush()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-3',
        redirectedRequestId: 'request-1',
        networkId: 'network-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/b', method: 'GET' },
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('allows an unrelated same-frame request with a different network identity, even when its URL matches a successor', async () => {
    const fixture = await admitted()
    let independentRequests = 0
    await fixture.context.route('**/*', async route => {
      if (route.request().url() === 'https://example.test/a') {
        const response = await route.fetch({ maxRedirects: 0 })
        await route.fulfill({ response })
      } else {
        independentRequests++
        await route.abort()
      }
    })
    await releaseRedirect(fixture, {
      requestId: 'redirect-1',
      networkId: 'network-redirect',
      url: 'https://example.test/a',
      location: '/b',
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'independent-1',
        networkId: 'network-independent',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/b', method: 'GET' },
      },
    })
    await flush()
    expect(independentRequests).toBe(1)
    expect(fixture.browser.isConnected()).toBe(true)
  })

  it('consumes multiple pending redirects by exact predecessor identity when successors arrive out of order', async () => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      if (route.request().url() === 'https://example.test/a') {
        const response = await route.fetch({ maxRedirects: 0 })
        await route.fulfill({ response })
      } else await route.abort()
    })
    await releaseRedirect(fixture, {
      requestId: 'redirect-1',
      networkId: 'network-1',
      url: 'https://example.test/a',
      location: '/b',
    })
    await releaseRedirect(fixture, {
      requestId: 'redirect-2',
      networkId: 'network-2',
      url: 'https://example.test/a',
      location: '/b',
    })
    for (const successor of [
      { requestId: 'successor-2', redirectedRequestId: 'redirect-2', networkId: 'network-2' },
      { requestId: 'successor-1', redirectedRequestId: 'redirect-1', networkId: 'network-1' },
    ]) {
      fixture.emit({
        method: 'Fetch.requestPaused',
        sessionId: 'seed-session',
        params: {
          ...successor,
          frameId: 'seed-target',
          resourceType: 'Document',
          request: { url: 'https://example.test/b', method: 'GET' },
        },
      })
      await flush()
    }
    expect(fixture.browser.isConnected()).toBe(true)
  })

  it('rejects a duplicate pending redirect network identity in one CDP session', async () => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      const response = await route.fetch({ maxRedirects: 0 })
      await route.fulfill({ response })
    })
    await releaseRedirect(fixture, {
      requestId: 'redirect-1',
      networkId: 'network-1',
      url: 'https://example.test/a',
      location: '/b',
    })
    await releaseRedirect(fixture, {
      requestId: 'redirect-2',
      networkId: 'network-1',
      url: 'https://example.test/c',
      location: '/d',
    })
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('rejects a same-network successor that omits its predecessor identity', async () => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      const response = await route.fetch({ maxRedirects: 0 })
      await route.fulfill({ response })
    })
    await releaseRedirect(fixture, {
      requestId: 'redirect-1',
      networkId: 'network-1',
      url: 'https://example.test/a',
      location: '/b',
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'successor-1',
        networkId: 'network-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/b', method: 'GET' },
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('rejects a successor whose network identity differs from its exact predecessor', async () => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      const response = await route.fetch({ maxRedirects: 0 })
      await route.fulfill({ response })
    })
    await releaseRedirect(fixture, {
      requestId: 'redirect-1',
      networkId: 'network-1',
      url: 'https://example.test/a',
      location: '/b',
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'successor-1',
        redirectedRequestId: 'redirect-1',
        networkId: 'network-2',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/b', method: 'GET' },
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('rejects a no-network request as ambiguous while a redirect is pending in its target, session, and frame', async () => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      const response = await route.fetch({ maxRedirects: 0 })
      await route.fulfill({ response })
    })
    await releaseRedirect(fixture, {
      requestId: 'redirect-1',
      networkId: 'network-1',
      url: 'https://example.test/a',
      location: '/b',
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'ambiguous-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/b', method: 'GET' },
      },
    })
    await flush()
    expect(fixture.browser.isConnected()).toBe(false)
  })

  it('does not consume an OOPIF redirect from another CDP session with the same network identity', async () => {
    const fixture = await admitted()
    let seedRequests = 0
    await fixture.context.route('**/*', async route => {
      if (route.request().url() === 'https://example.test/a') {
        const response = await route.fetch({ maxRedirects: 0 })
        await route.fulfill({ response })
      } else {
        seedRequests++
        await route.abort()
      }
    })
    fixture.emit({
      method: 'Page.frameAttached',
      sessionId: 'seed-session',
      params: { frameId: 'iframe-target', parentFrameId: 'seed-target' },
    })
    fixture.emit({
      method: 'Target.attachedToTarget',
      params: {
        sessionId: 'iframe-session',
        waitingForDebugger: true,
        targetInfo: { targetId: 'iframe-target', type: 'iframe', browserContextId: 'context-1' },
      },
    })
    await flush()
    fixture.emit({
      method: 'Page.frameNavigated',
      sessionId: 'iframe-session',
      params: {
        frame: {
          id: 'iframe-target',
          parentId: 'seed-target',
          url: 'https://example.test/frame',
          securityOrigin: 'https://example.test',
        },
      },
    })
    await releaseRedirect(fixture, {
      requestId: 'iframe-redirect',
      networkId: 'shared-network-id',
      url: 'https://example.test/a',
      location: '/b',
      frameId: 'iframe-target',
      sessionId: 'iframe-session',
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'seed-independent',
        networkId: 'shared-network-id',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/b', method: 'GET' },
      },
    })
    await flush()
    expect(seedRequests).toBe(1)
    expect(fixture.browser.isConnected()).toBe(true)
  })

  it('rejects seed-context creation when the transport is lost before the seed attaches', async () => {
    vi.useFakeTimers()
    try {
      const fixture = fakeTransport({ omitSeedAttachment: true })
      const runtime = createQualityJourneyDiscoveryBrowserRuntime({ transportFactory: async () => fixture.transport })
      const browser = await runtime.launch()
      let outcome = 'pending'
      void browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' }).then(
        () => (outcome = 'resolved'),
        () => (outcome = 'rejected'),
      )
      await vi.advanceTimersByTimeAsync(0)
      fixture.transport.breakPipe()
      await vi.advanceTimersByTimeAsync(0)
      expect(outcome).toBe('rejected')
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds seed-context creation when the seed target never attaches', async () => {
    vi.useFakeTimers()
    try {
      const fixture = fakeTransport({ omitSeedAttachment: true })
      const runtime = createQualityJourneyDiscoveryBrowserRuntime({ transportFactory: async () => fixture.transport })
      const browser = await runtime.launch()
      let outcome = 'pending'
      void browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' }).then(
        () => (outcome = 'resolved'),
        () => (outcome = 'rejected'),
      )
      await vi.advanceTimersByTimeAsync(15_000)
      expect(outcome).toBe('rejected')
    } finally {
      vi.useRealTimers()
    }
  })

  it('accepts DOMContentLoaded that arrives before Page.navigate returns', async () => {
    vi.useFakeTimers()
    try {
      const fixture = await admitted({ lifecycleBeforeNavigateResult: true })
      let outcome = 'pending'
      void fixture.page.goto('https://example.test/', { waitUntil: 'domcontentloaded' }).then(
        () => (outcome = 'resolved'),
        () => (outcome = 'rejected'),
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(outcome).toBe('resolved')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not complete a navigation from a stale early DOMContentLoaded loader', async () => {
    vi.useFakeTimers()
    try {
      const fixture = await admitted({ lifecycleBeforeNavigateResult: true, lifecycleLoaderId: 'prior-loader' })
      let outcome = 'pending'
      void fixture.page.goto('https://example.test/', { waitUntil: 'domcontentloaded' }).then(
        () => (outcome = 'resolved'),
        () => (outcome = 'rejected'),
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(outcome).toBe('pending')
      fixture.emit({
        method: 'Page.lifecycleEvent',
        sessionId: 'seed-session',
        params: { name: 'DOMContentLoaded', frameId: 'seed-target', loaderId: 'loader-1' },
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(outcome).toBe('resolved')
    } finally {
      vi.useRealTimers()
    }
  })

  it('resolves a same-document navigation without waiting for a lifecycle event', async () => {
    vi.useFakeTimers()
    try {
      const fixture = await admitted({ navigateResult: { frameId: 'seed-target' } })
      let outcome = 'pending'
      void fixture.page.goto('https://example.test/#section', { waitUntil: 'domcontentloaded' }).then(
        () => (outcome = 'resolved'),
        () => (outcome = 'rejected'),
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(outcome).toBe('resolved')
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears a fulfilled response timer instead of closing a healthy browser later', async () => {
    vi.useFakeTimers()
    try {
      const fixture = await admitted()
      await fixture.context.route('**/*', async route => {
        const response = await route.fetch({ maxRedirects: 0 })
        await route.fulfill({ response })
      })
      fixture.emit({
        method: 'Fetch.requestPaused',
        sessionId: 'seed-session',
        params: {
          requestId: 'request-1',
          frameId: 'seed-target',
          resourceType: 'Document',
          request: { url: 'https://example.test/', method: 'GET' },
        },
      })
      await vi.advanceTimersByTimeAsync(1)
      fixture.emit({
        method: 'Fetch.requestPaused',
        sessionId: 'seed-session',
        params: {
          requestId: 'request-1',
          frameId: 'seed-target',
          resourceType: 'Document',
          request: { url: 'https://example.test/', method: 'GET' },
          responseStatusCode: 200,
          responseHeaders: [],
        },
      })
      await vi.advanceTimersByTimeAsync(16_000)
      expect(fixture.browser.isConnected()).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('installs the nonforwarding WebSocket binding before resuming the target without rewriting responses', async () => {
    const fixture = await admitted()
    await fixture.context.route('**/*', async route => {
      const response = await route.fetch({ maxRedirects: 0 })
      await route.fulfill({ response })
    })
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/', method: 'GET' },
      },
    })
    await flush()
    fixture.emit({
      method: 'Fetch.requestPaused',
      sessionId: 'seed-session',
      params: {
        requestId: 'request-1',
        frameId: 'seed-target',
        resourceType: 'Document',
        request: { url: 'https://example.test/', method: 'GET' },
        responseStatusCode: 200,
        responseHeaders: [],
      },
    })
    await flush()
    expect(fixture.commands.some(command => command.method === 'Fetch.fulfillRequest')).toBe(false)
    expect(fixture.commands.find(command => command.method === 'Fetch.continueResponse')?.params).toEqual({
      requestId: 'request-1',
    })
    const methods = fixture.commands.map(command => command.method)
    expect(methods.indexOf('Runtime.enable')).toBeLessThan(methods.indexOf('Runtime.addBinding'))
    expect(methods.indexOf('Runtime.addBinding')).toBeLessThan(methods.indexOf('Page.addScriptToEvaluateOnNewDocument'))
    expect(methods.indexOf('Page.addScriptToEvaluateOnNewDocument')).toBeLessThan(
      methods.indexOf('Runtime.runIfWaitingForDebugger'),
    )
    expect(methods).not.toContain('Network.setBlockedURLs')
  })
})
