import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertDiscoveryBrowserReceiptAdmission,
  captureQualityJourneyDiscoveryBrowserReceipt,
  clearQualityJourneyDiscoveryBrowserSessionsForTest,
  confirmQualityJourneyDiscoveryBrowserAccess,
  markQualityJourneyDiscoveryBrowserMissingAccess,
  getQualityJourneyDiscoveryBrowserSession,
  getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification,
  logoutQualityJourneyDiscoveryBrowserSession,
  replaceQualityJourneyDiscoveryBrowserContext,
  revokeQualityJourneyDiscoveryBrowserSession,
  startQualityJourneyDiscoveryBrowserSession,
  type DiscoveryBrowserRuntime,
} from './quality-journey-discovery-browser-service'
import { discoveryAuthTransitPolicyHash } from '@/lib/quality-journey/discovery-auth-transit-policy'

const authPolicy = JSON.stringify({
  schemaVersion: 'appraise.discovery-auth-transit/v1',
  flows: [
    {
      flowId: 'test-login',
      rules: [
        {
          documentOrigin: '$TARGET',
          destinationOrigin: 'https://idp.example.test',
          path: { match: 'EXACT', value: '/authorize' },
          methods: ['GET', 'POST'],
          requestKinds: ['DOCUMENT'],
        },
        {
          documentOrigin: 'https://idp.example.test',
          destinationOrigin: 'https://idp-b.example.test',
          path: { match: 'EXACT', value: '/continue' },
          methods: ['GET', 'POST'],
          requestKinds: ['DOCUMENT'],
        },
      ],
      returns: [
        { fromOrigin: 'https://idp.example.test', targetPath: '/checkout', methods: ['GET', 'POST'] },
        { fromOrigin: 'https://idp-b.example.test', targetPath: '/checkout', methods: ['GET', 'POST'] },
      ],
    },
  ],
})

function browserRuntime(
  title = 'Checkout',
  onClose = () => undefined,
  onRoute?: (handler: (route: unknown) => Promise<void>) => void,
  onPage?: (page: {
    mainFrame: { url(): string }
    navigate: (url: string) => void
    navigateWithPageUrl: (frameUrl: string, pageUrl: string) => void
    navigateSubframe: (url: string) => void
  }) => void,
): DiscoveryBrowserRuntime {
  let url = 'about:blank'
  let frameUrl = 'about:blank'
  return {
    async launch() {
      return {
        async newContext() {
          return {
            route: async (_pattern, handler) => onRoute?.(handler as (route: unknown) => Promise<void>),
            routeWebSocket: async () => undefined,
            async newPage() {
              const mainFrame = { url: () => frameUrl }
              const listeners = new Map<string, (value: unknown) => void>()
              const page = {
                async goto(next: string) {
                  url = next
                  frameUrl = next
                },
                url: () => url,
                mainFrame: () => mainFrame,
                title: async () => title,
                on: (event: string, listener: (value: unknown) => void) => listeners.set(event, listener),
                close: async () => undefined,
              }
              onPage?.({
                mainFrame,
                navigate: (next: string) => {
                  url = next
                  frameUrl = next
                  listeners.get('framenavigated')?.(mainFrame)
                },
                navigateWithPageUrl: (nextFrameUrl: string, nextPageUrl: string) => {
                  frameUrl = nextFrameUrl
                  url = nextPageUrl
                  listeners.get('framenavigated')?.(mainFrame)
                },
                navigateSubframe: (next: string) => listeners.get('framenavigated')?.({ url: () => next }),
              })
              return page
            },
            close: async () => onClose(),
          }
        },
        close: async () => undefined,
      }
    },
  }
}

function client(options: { environmentId?: string; baseUrl?: string; scopeEnvironmentIds?: string[] } = {}) {
  const artifacts = new Map<string, { contentHash: string; artifactJson: string }>()
  const blockerUpdates: unknown[] = []
  const authority = { activeDiscoveryRevisionId: 'revision-1' }
  const environmentScope = { scopeVersion: 1, discoveryAuthTransitPolicyJson: authPolicy }
  const environmentId = options.environmentId ?? 'environment-1'
  const baseUrl = options.baseUrl ?? 'https://example.test'
  const frozenBinding = {
    environmentId,
    targetOrigin: new URL(baseUrl).origin,
    scopeVersion: environmentScope.scopeVersion,
    discoveryAuthTransitPolicyJson: environmentScope.discoveryAuthTransitPolicyJson,
    discoveryAuthTransitPolicyHash: discoveryAuthTransitPolicyHash(environmentScope.discoveryAuthTransitPolicyJson),
  }
  return {
    artifacts,
    blockerUpdates,
    authority,
    environmentScope,
    qualityJourney: {
      findFirst: async () => ({
        id: 'journey-1',
        activeDiscoveryRevisionId: authority.activeDiscoveryRevisionId,
        activeCycleId: 'cycle-1',
      }),
    },
    qualityJourneyDiscoveryRevision: {
      findFirst: async () => ({
        id: 'revision-1',
        journeyId: 'journey-1',
        targetProjectId: 'target-1',
        cycleId: 'cycle-1',
        scoutWorkItemId: 'work-1',
        scoutScopeJson: JSON.stringify({
          environmentIds: options.scopeEnvironmentIds ?? ['environment-1'],
          routes: ['/checkout'],
          environmentBindings: [frozenBinding],
        }),
      }),
    },
    environment: {
      findFirst: async () => ({
        id: environmentId,
        baseUrl,
        targetProjectId: 'target-1',
        scopeVersion: environmentScope.scopeVersion,
        discoveryAuthTransitPolicyJson: environmentScope.discoveryAuthTransitPolicyJson,
      }),
    },
    qualityJourneyArtifact: {
      findUnique: async ({ where }: { where: { journeyId_identityKey: { identityKey: string } } }) =>
        artifacts.get(where.journeyId_identityKey.identityKey) ?? null,
      create: async ({ data }: { data: { identityKey: string; contentHash: string; artifactJson: string } }) => {
        artifacts.set(data.identityKey, data)
        return data
      },
    },
    qualityJourneyBlocker: {
      updateMany: async (input: unknown) => {
        blockerUpdates.push(input)
        return { count: 0 }
      },
      upsert: async ({ create }: { create: unknown }) => create,
    },
  }
}

const scope = { journeyId: 'journey-1', targetProjectId: 'target-1', discoveryRevisionId: 'revision-1' }

afterEach(clearQualityJourneyDiscoveryBrowserSessionsForTest)

describe('Quality Journey discovery browser service', () => {
  it('captures an anonymous Appraise-owned receipt without persisting secret canaries', async () => {
    const db = client()
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      db as never,
      browserRuntime('correct-horse-battery-staple'),
    )
    const captured = await captureQualityJourneyDiscoveryBrowserReceipt(
      { ...scope, sessionId: session.id, snapshotId: 'snapshot-1' },
      db as never,
    )
    expect(captured.receipt).toMatchObject({ accessOutcome: 'ACTIVE', url: 'https://example.test/checkout' })
    expect(captured.receipt).not.toHaveProperty('terminalCause')
    expect(JSON.stringify(captured)).not.toContain('correct-horse-battery-staple')
    expect([...db.artifacts.values()].map(value => value.artifactJson).join()).not.toContain(
      'correct-horse-battery-staple',
    )
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        {
          ...scope,
          journeyId: 'foreign-journey',
          sessionId: session.id,
          snapshotId: 'snapshot-2',
        },
        db as never,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('requires human confirmation for authenticated intent and preserves a missing-access terminal receipt', async () => {
    const db = client()
    let handler: ((route: unknown) => Promise<void>) | undefined
    let page:
      | {
          mainFrame: { url(): string }
          navigate: (url: string) => void
          navigateWithPageUrl: (frameUrl: string, pageUrl: string) => void
          navigateSubframe: (url: string) => void
        }
      | undefined
    const session = await startQualityJourneyDiscoveryBrowserSession(
      {
        ...scope,
        workItemId: 'work-1',
        environmentId: 'environment-1',
        routeId: '/checkout',
        accessMode: 'AUTHENTICATED_INTENT',
        authFlowId: 'test-login',
      },
      db as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        next => {
          handler = next
        },
        next => {
          page = next
        },
      ),
    )
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...scope, sessionId: session.id, snapshotId: 'snapshot-1' },
        db as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const route = (url: string, method = 'GET', status = 200, location?: string) => ({
      request: () => ({
        url: () => url,
        method: () => method,
        isNavigationRequest: () => true,
        resourceType: () => 'document',
        frame: () => page!.mainFrame,
      }),
      abort: async () => undefined,
      fetch: async () => ({ headers: () => (location ? { location } : {}), status: () => status }),
      fulfill: async () => undefined,
    })
    await handler?.(route('https://example.test/checkout', 'GET', 302, 'https://idp.example.test/authorize'))
    await handler?.(route('https://idp.example.test/authorize'))
    page?.navigate('https://idp.example.test/authorize')
    await handler?.({
      request: () => ({
        url: () => 'https://example.test/checkout',
        method: () => 'GET',
        isNavigationRequest: () => true,
        resourceType: () => 'document',
        frame: () => page!.mainFrame,
      }),
      abort: async () => undefined,
      fetch: async () => ({ headers: () => ({}), status: () => 200 }),
      fulfill: async () => undefined,
    })
    page?.navigateSubframe('https://example.test/checkout')
    await expect(
      confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: session.id }, db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    page?.navigate('https://example.test/checkout')
    await confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: session.id }, db as never)
    expect(db.blockerUpdates).toEqual([
      expect.objectContaining({
        where: expect.objectContaining({
          id: expect.stringMatching(/^qjdb_blocker_/),
          reasonCode: 'DISCOVERY_MISSING_ACCESS',
        }),
      }),
    ])
    db.environmentScope.scopeVersion += 1
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...scope, sessionId: session.id, snapshotId: 'snapshot-stale-environment' },
        db as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    db.environmentScope.scopeVersion -= 1
    await markQualityJourneyDiscoveryBrowserMissingAccess({ ...scope, sessionId: session.id }, db as never)
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...scope, sessionId: session.id, snapshotId: 'snapshot-1' },
        db as never,
      ),
    ).resolves.toMatchObject({ receipt: { accessOutcome: 'MISSING_ACCESS' } })
    await expect(
      markQualityJourneyDiscoveryBrowserMissingAccess(
        { ...scope, sessionId: session.id, reason: 'correct-horse-battery-staple' },
        db as never,
      ),
    ).rejects.toBeTruthy()
  })

  it('rejects credentials and browser storage from the public start input', async () => {
    await expect(
      startQualityJourneyDiscoveryBrowserSession(
        {
          ...scope,
          workItemId: 'work-1',
          environmentId: 'environment-1',
          routeId: '/checkout',
          accessMode: 'ANONYMOUS',
          cookies: 'C2.3_SECRET_CANARY',
        },
        client() as never,
        browserRuntime(),
      ),
    ).rejects.toBeTruthy()
  })

  it('commits an exact multi-IdP chain and preserves an authorized POST redirect method', async () => {
    const db = client()
    let handler: ((route: unknown) => Promise<void>) | undefined
    let page:
      | {
          mainFrame: { url(): string }
          navigate: (url: string) => void
          navigateWithPageUrl: (frameUrl: string, pageUrl: string) => void
          navigateSubframe: (url: string) => void
        }
      | undefined
    const session = await startQualityJourneyDiscoveryBrowserSession(
      {
        ...scope,
        workItemId: 'work-1',
        environmentId: 'environment-1',
        routeId: '/checkout',
        accessMode: 'AUTHENTICATED_INTENT',
        authFlowId: 'test-login',
      },
      db as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        next => (handler = next),
        next => (page = next),
      ),
    )
    const route = (url: string, method: string, status: number, location?: string) => ({
      request: () => ({
        url: () => url,
        method: () => method,
        isNavigationRequest: () => true,
        resourceType: () => 'document',
        frame: () => page!.mainFrame,
      }),
      abort: vi.fn(async () => undefined),
      fetch: async () => ({ headers: () => (location ? { location } : {}), status: () => status }),
      fulfill: vi.fn(async () => undefined),
    })
    await handler?.(route('https://example.test/checkout', 'GET', 200))
    page?.navigate('https://example.test/checkout')
    await handler?.(route('https://example.test/checkout', 'POST', 307, 'https://idp.example.test/authorize'))
    await handler?.(route('https://idp.example.test/authorize', 'POST', 302, 'https://idp-b.example.test/continue'))
    await handler?.(route('https://idp-b.example.test/continue', 'GET', 200))
    page?.navigate('https://idp-b.example.test/continue')
    await handler?.(route('https://example.test/checkout', 'GET', 200))
    page?.navigate('https://example.test/checkout')
    await expect(
      confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: session.id }, db as never),
    ).resolves.toBeTruthy()
  })

  it('keeps capture freshness validation and immutable receipt persistence in one transaction', async () => {
    const base = client()
    const calls: string[] = []
    const tx = {
      ...base,
      environment: {
        findFirst: async (...args: unknown[]) => {
          calls.push('fresh-environment-read')
          return base.environment.findFirst(...(args as []))
        },
      },
      qualityJourneyArtifact: {
        findUnique: async (...args: unknown[]) => {
          calls.push('receipt-find')
          return base.qualityJourneyArtifact.findUnique(args[0] as never)
        },
        create: async (...args: unknown[]) => {
          calls.push('receipt-create')
          return base.qualityJourneyArtifact.create(args[0] as never)
        },
      },
    }
    const db = {
      ...base,
      $transaction: async (effect: (current: typeof tx) => Promise<unknown>) => {
        calls.push('transaction-open')
        const result = await effect(tx)
        calls.push('transaction-close')
        return result
      },
    }
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      db as never,
      browserRuntime(),
    )
    await captureQualityJourneyDiscoveryBrowserReceipt(
      { ...scope, sessionId: session.id, snapshotId: 'transactional' },
      db as never,
    )
    expect(calls).toEqual([
      'transaction-open',
      'fresh-environment-read',
      'receipt-find',
      'receipt-create',
      'transaction-close',
    ])
  })

  it('invalidates expired, logged-out, revoked, and replaced contexts', async () => {
    const db = client()
    const input = {
      ...scope,
      workItemId: 'work-1',
      environmentId: 'environment-1',
      routeId: '/checkout',
      accessMode: 'AUTHENTICATED_INTENT' as const,
      authFlowId: 'test-login',
    }
    const loggedOut = await startQualityJourneyDiscoveryBrowserSession(input, db as never, browserRuntime())
    await logoutQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: loggedOut.id })
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...scope, sessionId: loggedOut.id, snapshotId: 'snapshot-logout' },
        db as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    const revoked = await startQualityJourneyDiscoveryBrowserSession(input, db as never, browserRuntime())
    await revokeQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: revoked.id })
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: revoked.id })).resolves.toMatchObject({
      state: 'REVOKED',
    })

    const original = await startQualityJourneyDiscoveryBrowserSession(input, db as never, browserRuntime())
    const replacement = await replaceQualityJourneyDiscoveryBrowserContext(
      { ...scope, sessionId: original.id },
      db as never,
      browserRuntime(),
    )
    expect(replacement).toMatchObject({ generation: 2, state: 'ACTIVE' })
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...scope, sessionId: original.id, snapshotId: 'snapshot-old-context' },
        db as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    vi.useFakeTimers()
    try {
      const close = vi.fn()
      const expired = await startQualityJourneyDiscoveryBrowserSession(
        { ...input, ttlSeconds: 30 },
        db as never,
        browserRuntime('Checkout', close),
      )
      await vi.advanceTimersByTimeAsync(30_000)
      expect(close).toHaveBeenCalledOnce()
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: expired.id }),
      ).resolves.toMatchObject({ state: 'EXPIRED' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('binds the session to only the selected environment origin', async () => {
    const db = client({
      environmentId: 'environment-2',
      baseUrl: 'https://selected.example.test',
      scopeEnvironmentIds: ['environment-1', 'environment-2'],
    })
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-2', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      db as never,
      browserRuntime(),
    )
    expect(session.allowedOrigins).toEqual(['https://selected.example.test'])
    expect(session.currentUrl).toBe('https://selected.example.test/checkout')
  })

  it('cannot confirm access after the active discovery revision changes', async () => {
    const db = client()
    const session = await startQualityJourneyDiscoveryBrowserSession(
      {
        ...scope,
        workItemId: 'work-1',
        environmentId: 'environment-1',
        routeId: '/checkout',
        accessMode: 'AUTHENTICATED_INTENT',
        authFlowId: 'test-login',
      },
      db as never,
      browserRuntime(),
    )
    db.authority.activeDiscoveryRevisionId = 'revision-2'
    await expect(
      confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: session.id }, db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(db.blockerUpdates).toEqual([])
  })

  it('allows only a frozen target-to-IdP-to-target document flow and fences an environment change', async () => {
    let handler: ((route: unknown) => Promise<void>) | undefined
    const db = client()
    const session = await startQualityJourneyDiscoveryBrowserSession(
      {
        ...scope,
        workItemId: 'work-1',
        environmentId: 'environment-1',
        routeId: '/checkout',
        accessMode: 'AUTHENTICATED_INTENT',
        authFlowId: 'test-login',
      },
      db as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        next => {
          handler = next
        },
      ),
    )
    const request = (url: string, frameUrl: string, method = 'GET') => ({
      request: () => ({
        url: () => url,
        method: () => method,
        isNavigationRequest: () => true,
        resourceType: () => 'document',
        frame: () => ({ url: () => frameUrl }),
      }),
      abort: vi.fn(async () => undefined),
      fetch: async () => ({ headers: () => ({}), status: () => 200 }),
      fulfill: vi.fn(async () => undefined),
    })
    const idp = request('https://idp.example.test/authorize', 'https://example.test/checkout')
    await handler?.(idp)
    expect(idp.abort).not.toHaveBeenCalled()
    expect(idp.fulfill).toHaveBeenCalledOnce()
    const pathConfusion = request('https://idp.example.test/authorize/extra', 'https://example.test/checkout')
    await handler?.(pathConfusion)
    expect(pathConfusion.abort).toHaveBeenCalledOnce()
    const returned = request('https://example.test/checkout', 'https://idp.example.test/authorize', 'POST')
    await handler?.(returned)
    expect(returned.abort).not.toHaveBeenCalled()
    db.environmentScope.scopeVersion += 1
    await expect(
      confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: session.id }, db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('installs containment at context scope before popup or page requests', async () => {
    let handler: ((route: unknown) => Promise<void>) | undefined
    let webSocketHandler: ((route: unknown) => Promise<void>) | undefined
    const installationOrder: string[] = []
    const runtime: DiscoveryBrowserRuntime = {
      async launch() {
        let url = 'about:blank'
        return {
          async newContext() {
            return {
              async route(_pattern, nextHandler) {
                installationOrder.push('http')
                handler = nextHandler as typeof handler
              },
              async routeWebSocket(_pattern, nextHandler) {
                installationOrder.push('websocket')
                webSocketHandler = nextHandler as typeof webSocketHandler
              },
              async newPage() {
                installationOrder.push('page')
                const mainFrame = { url: () => url }
                return {
                  async goto(next) {
                    url = next
                  },
                  url: () => url,
                  mainFrame: () => mainFrame,
                  title: async () => 'Checkout',
                  on: () => undefined,
                  close: async () => undefined,
                }
              },
              close: async () => undefined,
            }
          },
          close: async () => undefined,
        }
      },
    }
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      client() as never,
      runtime,
    )
    const abort = vi.fn(async () => undefined)
    const proceed = vi.fn(async () => undefined)
    await handler?.({
      request: () => ({
        url: () => 'https://attacker.test/checkout',
        method: () => 'GET',
        isNavigationRequest: () => true,
      }),
      abort,
      continue: proceed,
    })
    expect(abort).toHaveBeenCalledOnce()
    expect(proceed).not.toHaveBeenCalled()
    expect(installationOrder).toEqual(['http', 'websocket', 'page'])

    const redirectAbort = vi.fn(async () => undefined)
    const fulfill = vi.fn(async () => undefined)
    await handler?.({
      request: () => ({
        url: () => 'https://example.test/checkout',
        method: () => 'GET',
        isNavigationRequest: () => true,
      }),
      abort: redirectAbort,
      continue: vi.fn(async () => undefined),
      fetch: async () => ({ headers: () => ({ location: 'https://attacker.test/redirected' }), status: () => 302 }),
      fulfill,
    })
    expect(redirectAbort).toHaveBeenCalledOnce()
    expect(fulfill).not.toHaveBeenCalled()

    const closeSocket = vi.fn()
    await webSocketHandler?.({ url: () => 'wss://attacker.test/socket', close: closeSocket })
    expect(closeSocket).toHaveBeenCalledWith({ code: 1008, reason: 'Journey browser policy denied WebSocket' })
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })).resolves.toMatchObject({
      state: 'REVOKED',
    })
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: session.id }),
    ).resolves.toEqual({ terminalCause: 'WEBSOCKET_DENIED' })
    expect(session).not.toHaveProperty('terminalCause')
  })

  it('reports a main-frame mismatch only through the transient qualification diagnostic', async () => {
    let handler: ((route: unknown) => Promise<void>) | undefined
    let page:
      | {
          mainFrame: { url(): string }
          navigate: (url: string) => void
          navigateWithPageUrl: (frameUrl: string, pageUrl: string) => void
          navigateSubframe: (url: string) => void
        }
      | undefined
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      client() as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        next => {
          handler = next
        },
        next => {
          page = next
        },
      ),
    )
    await handler?.({
      request: () => ({
        url: () => 'https://example.test/checkout',
        method: () => 'GET',
        isNavigationRequest: () => true,
        resourceType: () => 'document',
        frame: () => page!.mainFrame,
      }),
      abort: async () => undefined,
      fetch: async () => ({ headers: () => ({}), status: () => 200 }),
      fulfill: async () => undefined,
    })
    page?.navigateWithPageUrl('https://attacker.test/checkout?secret=C2.3_SECRET#fragment', '')
    await vi.waitFor(async () => {
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({
        state: 'REVOKED',
      })
    })
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: session.id }),
    ).resolves.toEqual({ terminalCause: 'MAIN_FRAME_MISMATCH' })
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })).resolves.toMatchObject({
      currentUrl: 'https://attacker.test/checkout',
    })
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
    ).resolves.not.toMatchObject({
      currentUrl: expect.stringContaining('C2.3_SECRET'),
    })
  })

  it('preserves only the triggering origin and path for a no-pending main-frame revoke', async () => {
    let page:
      | {
          mainFrame: { url(): string }
          navigate: (url: string) => void
          navigateWithPageUrl: (frameUrl: string, pageUrl: string) => void
          navigateSubframe: (url: string) => void
        }
      | undefined
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      client() as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        undefined,
        next => (page = next),
      ),
    )
    page?.navigateWithPageUrl('https://attacker.test/checkout?secret=C2.3_NO_PENDING#fragment', '')
    await vi.waitFor(async () => {
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({ state: 'REVOKED', currentUrl: 'https://attacker.test/checkout' })
    })
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: session.id }),
    ).resolves.toEqual({ terminalCause: 'MAIN_FRAME_NO_PENDING' })
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
    ).resolves.not.toMatchObject({
      currentUrl: expect.stringContaining('C2.3_NO_PENDING'),
    })
  })

  it('tolerates only an exact duplicate committed main-frame event', async () => {
    let handler: ((route: unknown) => Promise<void>) | undefined
    let page:
      | { mainFrame: { url(): string }; navigate: (url: string) => void; navigateSubframe: (url: string) => void }
      | undefined
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      client() as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        next => (handler = next),
        next => (page = next),
      ),
    )
    await handler?.({
      request: () => ({
        url: () => 'https://example.test/checkout',
        method: () => 'GET',
        isNavigationRequest: () => true,
        resourceType: () => 'document',
        frame: () => page!.mainFrame,
      }),
      abort: async () => undefined,
      fetch: async () => ({ headers: () => ({}), status: () => 200 }),
      fulfill: async () => undefined,
    })
    page?.navigate('https://example.test/checkout')
    page?.navigate('https://example.test/checkout')
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })).resolves.toMatchObject({
      state: 'ACTIVE',
    })
    page?.navigate('https://example.test/checkout/other')
    await vi.waitFor(async () => {
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({ state: 'REVOKED' })
    })
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: session.id }),
    ).resolves.toEqual({ terminalCause: 'MAIN_FRAME_NO_PENDING' })
  })

  it('uses the effective redirect method and ignores Location on non-redirect responses', async () => {
    const redirect = async (status: number) => {
      let handler: ((route: unknown) => Promise<void>) | undefined
      await startQualityJourneyDiscoveryBrowserSession(
        {
          ...scope,
          workItemId: 'work-1',
          environmentId: 'environment-1',
          routeId: '/checkout',
          accessMode: 'AUTHENTICATED_INTENT',
          authFlowId: 'test-login',
        },
        client() as never,
        browserRuntime(
          'Checkout',
          () => undefined,
          next => {
            handler = next
          },
        ),
      )
      const abort = vi.fn(async () => undefined)
      const fulfill = vi.fn(async () => undefined)
      await handler?.({
        request: () => ({
          url: () => 'https://example.test/checkout',
          method: () => 'POST',
          isNavigationRequest: () => true,
          resourceType: () => 'document',
          frame: () => ({ url: () => 'https://example.test/checkout' }),
        }),
        abort,
        fetch: async () => ({
          headers: () => ({ location: 'https://idp.example.test/authorize' }),
          status: () => status,
        }),
        fulfill,
      })
      return { abort, fulfill }
    }
    for (const status of [301, 302, 303]) {
      const result = await redirect(status)
      expect(result.abort).not.toHaveBeenCalled()
      expect(result.fulfill).toHaveBeenCalledOnce()
    }
    for (const status of [307, 308]) {
      const result = await redirect(status)
      expect(result.abort).not.toHaveBeenCalled()
      expect(result.fulfill).toHaveBeenCalledOnce()
    }

    let handler: ((route: unknown) => Promise<void>) | undefined
    await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      client() as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        next => {
          handler = next
        },
      ),
    )
    const abort = vi.fn(async () => undefined)
    const fulfill = vi.fn(async () => undefined)
    await handler?.({
      request: () => ({
        url: () => 'https://example.test/checkout',
        method: () => 'GET',
        isNavigationRequest: () => true,
        resourceType: () => 'document',
        frame: () => ({ url: () => 'https://example.test/checkout' }),
      }),
      abort,
      fetch: async () => ({ headers: () => ({ location: 'https://attacker.test/ignored' }), status: () => 200 }),
      fulfill,
    })
    expect(abort).not.toHaveBeenCalled()
    expect(fulfill).toHaveBeenCalledOnce()
  })

  it('admits only an exact issuer receipt and rejects hash or supplemental descriptors', async () => {
    const db = client()
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      db as never,
      browserRuntime(),
    )
    const captured = await captureQualityJourneyDiscoveryBrowserReceipt(
      { ...scope, sessionId: session.id, snapshotId: 'snapshot-1' },
      db as never,
    )
    const tx = {
      qualityJourneyArtifact: {
        findMany: async () => [
          {
            artifactId: captured.artifactId,
            contentHash: captured.contentHash,
            artifactJson: JSON.stringify(captured.receipt),
          },
        ],
      },
    }
    const bundle = {
      cycleId: 'cycle-1',
      evidenceReceipts: [{ artifactId: captured.artifactId, contentHash: captured.contentHash }],
      targetSnapshot: { snapshotId: 'snapshot-1' },
      observations: [
        {
          snapshotId: 'snapshot-1',
          routeId: '/checkout',
          environmentId: 'environment-1',
          fact: captured.receipt.observationFacts[0],
          evidenceReceiptIds: [captured.artifactId],
        },
      ],
    }
    const revision = {
      id: 'revision-1',
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      cycleId: 'cycle-1',
      scoutWorkItemId: 'work-1',
    }
    await expect(assertDiscoveryBrowserReceiptAdmission(bundle, revision, tx as never)).resolves.toBeUndefined()
    await expect(
      assertDiscoveryBrowserReceiptAdmission(
        { ...bundle, evidenceReceipts: [{ artifactId: captured.artifactId, contentHash: 'sha256:0'.padEnd(71, '0') }] },
        revision,
        tx as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      assertDiscoveryBrowserReceiptAdmission(
        {
          ...bundle,
          evidenceReceipts: [
            ...bundle.evidenceReceipts,
            { artifactId: 'host-browser-observation', contentHash: captured.contentHash },
          ],
        },
        revision,
        tx as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
