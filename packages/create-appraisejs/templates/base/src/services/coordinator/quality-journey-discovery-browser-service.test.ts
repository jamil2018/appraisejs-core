import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  armQualityJourneyDiscoveryBrowserHumanReturn,
  authorizeQualityJourneyDiscoveryBrowserExactReturn,
  assertDiscoveryBrowserReceiptAdmission,
  captureQualityJourneyDiscoveryBrowserReceipt,
  clearQualityJourneyDiscoveryBrowserSessionsForTest,
  confirmQualityJourneyDiscoveryBrowserAccess,
  markQualityJourneyDiscoveryBrowserMissingAccess,
  getQualityJourneyDiscoveryBrowserSession,
  getOwnedQualityJourneyDiscoveryBrowserCleanup,
  assertOwnedQualityJourneyDiscoveryBrowserCleanupReconciled,
  getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification,
  logoutQualityJourneyDiscoveryBrowserSession,
  replaceQualityJourneyDiscoveryBrowserContext,
  pauseOwnedQualityJourneyDiscoveryBrowserCleanup,
  revokeQualityJourneyDiscoveryBrowserSession,
  startQualityJourneyDiscoveryBrowserSession,
  type DiscoveryBrowserRuntime,
} from './quality-journey-discovery-browser-service'
import { discoveryAuthTransitPolicyHash } from '@/lib/quality-journey/discovery-auth-transit-policy'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ownedBrowserLedgerFixture, type OwnedBrowserRow } from '@/test/owned-browser-ledger-fixture'

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

const repeatedLoginPolicy = JSON.stringify({
  schemaVersion: 'appraise.discovery-auth-transit/v1',
  flows: [
    {
      flowId: 'test-login',
      rules: [
        {
          documentOrigin: '$TARGET',
          destinationOrigin: 'https://idp.example.test',
          path: { match: 'EXACT', value: '/login' },
          methods: ['GET'],
          requestKinds: ['DOCUMENT'],
        },
        {
          documentOrigin: 'https://idp.example.test',
          destinationOrigin: 'https://idp.example.test',
          path: { match: 'EXACT', value: '/login' },
          methods: ['GET', 'POST'],
          requestKinds: ['DOCUMENT'],
        },
        {
          documentOrigin: 'https://idp.example.test',
          destinationOrigin: 'https://idp.example.test',
          path: { match: 'EXACT', value: '/secure' },
          methods: ['GET'],
          requestKinds: ['DOCUMENT'],
        },
      ],
      returns: [{ fromOrigin: 'https://idp.example.test', targetPath: '/checkout', methods: ['GET'] }],
    },
  ],
})

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(next => {
    resolve = next
  })
  return { promise, resolve }
}

function canonicalHash(value: unknown) {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}

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
  onLiveness?: (control: {
    disconnectBrowser: () => void
    silentlyDisconnectBrowser: () => void
    closeContext: () => void
    closePage: () => void
    crashPage: () => void
  }) => void,
  onGoto?: () => void | Promise<void>,
  pageUrl?: () => string,
): DiscoveryBrowserRuntime {
  let url = 'about:blank'
  let frameUrl = 'about:blank'
  let browserConnected = true
  let pageClosed = false
  const browserListeners = new Map<string, () => void>()
  const contextListeners = new Map<string, () => void>()
  return {
    redirectInterception: 'EVERY_HOP',
    async launch() {
      return {
        on: (event, listener) => browserListeners.set(event, listener),
        isConnected: () => browserConnected,
        async newContext() {
          return {
            on: (event, listener) => contextListeners.set(event, listener),
            route: async (_pattern, handler) => onRoute?.(handler as (route: unknown) => Promise<void>),
            routeWebSocket: async () => undefined,
            async newPage() {
              const mainFrame = { url: () => frameUrl }
              const listeners = new Map<string, (value: unknown) => void>()
              const page = {
                async goto(next: string) {
                  url = next
                  frameUrl = next
                  await onGoto?.()
                },
                url: () => pageUrl?.() ?? url,
                mainFrame: () => mainFrame,
                title: async () => title,
                on: (event: string, listener: (value: unknown) => void) => listeners.set(event, listener),
                isClosed: () => pageClosed,
                close: async () => {
                  pageClosed = true
                  listeners.get('close')?.(undefined)
                },
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
              onLiveness?.({
                disconnectBrowser: () => {
                  browserConnected = false
                  browserListeners.get('disconnected')?.()
                },
                silentlyDisconnectBrowser: () => {
                  browserConnected = false
                },
                closeContext: () => {
                  contextListeners.get('close')?.()
                },
                closePage: () => {
                  pageClosed = true
                  listeners.get('close')?.(undefined)
                },
                crashPage: () => listeners.get('crash')?.(undefined),
              })
              return page
            },
            close: async () => {
              contextListeners.get('close')?.()
              return onClose()
            },
          }
        },
        close: async () => {
          browserConnected = false
          browserListeners.get('disconnected')?.()
        },
      }
    },
  }
}

function client(
  options: {
    environmentId?: string
    baseUrl?: string
    scopeEnvironmentIds?: string[]
    authPolicyJson?: string
    ownedBrowsers?: Map<string, OwnedBrowserRow>
    beforeOwnershipFence?: (authority: { status: string }) => void
  } = {},
) {
  const artifacts = new Map<string, { contentHash: string; artifactJson: string }>()
  const ownedBrowsers = options.ownedBrowsers ?? new Map<string, OwnedBrowserRow>()
  const blockerUpdates: unknown[] = []
  const authority = { activeDiscoveryRevisionId: 'revision-1', status: 'ACTIVE' }
  const environmentScope = { scopeVersion: 1, discoveryAuthTransitPolicyJson: options.authPolicyJson ?? authPolicy }
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
    ...ownedBrowserLedgerFixture(ownedBrowsers),
    blockerUpdates,
    authority,
    environmentScope,
    qualityJourney: {
      findFirst: async () => ({
        id: 'journey-1',
        stage: 'DISCOVERY',
        status: authority.status,
        activeDiscoveryRevisionId: authority.activeDiscoveryRevisionId,
        activeCycleId: 'cycle-1',
      }),
      updateMany: async () => {
        options.beforeOwnershipFence?.(authority)
        return { count: authority.status === 'ACTIVE' ? 1 : 0 }
      },
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
const cleanupScope = { journeyId: scope.journeyId, targetProjectId: scope.targetProjectId }

async function sessionAtAuthorizedIdp(
  onLiveness?: Parameters<typeof browserRuntime>[4],
  onGoto?: Parameters<typeof browserRuntime>[5],
) {
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
      onLiveness,
      onGoto,
    ),
  )
  if (!handler || !page) throw new Error('Test browser route was not initialized.')
  const route = (
    url: string,
    method = 'GET',
    status = 200,
    location?: string,
    navigation = true,
    resource = 'document',
  ) => {
    const abort = vi.fn(async () => undefined)
    const fulfill = vi.fn(async () => undefined)
    return {
      route: {
        request: () => ({
          url: () => url,
          method: () => method,
          isNavigationRequest: () => navigation,
          resourceType: () => resource,
          frame: () => page!.mainFrame,
        }),
        abort,
        fetch: async () => ({ headers: () => (location ? { location } : {}), status: () => status }),
        fulfill,
      },
      abort,
      fulfill,
    }
  }
  await handler(route('https://example.test/checkout', 'GET', 302, 'https://idp.example.test/authorize').route)
  await handler(route('https://idp.example.test/authorize').route)
  page.navigate('https://idp.example.test/authorize')
  return { db, handler, page, route, session }
}

async function sessionAtRepeatedProviderLogin() {
  const db = client({ authPolicyJson: repeatedLoginPolicy })
  let handler: ((route: unknown) => Promise<void>) | undefined
  let page:
    | {
        mainFrame: { url(): string }
        navigate: (url: string) => void
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
  if (!handler || !page) throw new Error('Test browser route was not initialized.')
  const route = (url: string, method = 'GET', status = 200, location?: string) => {
    const abort = vi.fn(async () => undefined)
    const fulfill = vi.fn(async () => undefined)
    return {
      route: {
        request: () => ({
          url: () => url,
          method: () => method,
          isNavigationRequest: () => true,
          resourceType: () => 'document',
          frame: () => page!.mainFrame,
        }),
        abort,
        fetch: async () => ({ headers: () => (location ? { location } : {}), status: () => status }),
        fulfill,
      },
      abort,
      fulfill,
    }
  }
  await handler(route('https://example.test/checkout', 'GET', 302, 'https://idp.example.test/login').route)
  await handler(route('https://idp.example.test/login').route)
  page.navigate('https://idp.example.test/login')
  return { db, handler, page, route, session }
}

async function completeHumanReturn(fixture: Awaited<ReturnType<typeof sessionAtAuthorizedIdp>>) {
  const { db, session } = fixture
  await returnToFrozenTarget(fixture)
  await confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: session.id }, db as never)
  return captureQualityJourneyDiscoveryBrowserReceipt(
    { ...scope, sessionId: session.id, snapshotId: `snapshot-${session.id}` },
    db as never,
  )
}

async function returnToFrozenTarget(fixture: Awaited<ReturnType<typeof sessionAtAuthorizedIdp>>) {
  const { db, handler, page, route, session } = fixture
  await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: session.id }, db as never)
  await handler(route('https://example.test/checkout').route)
  page.navigate('https://example.test/checkout')
}

afterEach(clearQualityJourneyDiscoveryBrowserSessionsForTest)

describe('Quality Journey discovery browser service', () => {
  it('rejects pause committed between the Journey read and the registration write fence', async () => {
    const db = client({
      beforeOwnershipFence: authority => {
        authority.status = 'PAUSED'
      },
    })
    const launch = vi.fn()
    await expect(
      startQualityJourneyDiscoveryBrowserSession(
        {
          ...scope,
          workItemId: 'work-1',
          environmentId: 'environment-1',
          routeId: '/checkout',
          accessMode: 'ANONYMOUS',
        },
        db as never,
        { launch },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(db.ownedBrowsers.size).toBe(0)
    expect(launch).not.toHaveBeenCalled()
  })

  it('refuses a fresh launch when an earlier process left durable browser ownership', async () => {
    const ownedBrowsers = new Map<string, OwnedBrowserRow>([
      [
        'prior-session',
        {
          id: 'prior-session',
          journeyId: cleanupScope.journeyId,
          targetProjectId: cleanupScope.targetProjectId,
          processInstanceId: 'prior-process',
          sessionId: 'prior-session',
          generation: 1,
          status: 'LIVE',
          rowVersion: 1,
          cleanupHistoryJson: JSON.stringify([{ status: 'LAUNCHING', observedAt: '2026-10-02T00:00:00.000Z' }]),
        },
      ],
    ])
    const db = client({ ownedBrowsers })
    const launch = vi.fn()
    const input = {
      ...scope,
      workItemId: 'work-1',
      environmentId: 'environment-1',
      routeId: '/checkout',
      accessMode: 'ANONYMOUS' as const,
    }
    await expect(startQualityJourneyDiscoveryBrowserSession(input, db as never, { launch })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(launch).not.toHaveBeenCalled()
    await expect(
      assertOwnedQualityJourneyDiscoveryBrowserCleanupReconciled(cleanupScope, db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const paused = await pauseOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope, db as never)
    expect(paused).toMatchObject({
      state: 'DURABLE_OWNERSHIP_ONLY',
      receipts: [{ sessionId: 'prior-session', state: 'UNKNOWN' }],
    })
    expect(ownedBrowsers.get('prior-session')).toMatchObject({ status: 'UNKNOWN' })
    expect(ownedBrowsers.get('prior-session')).not.toHaveProperty('stopReceiptJson')
    await expect(startQualityJourneyDiscoveryBrowserSession(input, db as never, { launch })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(launch).not.toHaveBeenCalled()
  })

  it('blocks replacement and fresh start until failed browser cleanup is retried', async () => {
    const db = client()
    const input = {
      ...scope,
      workItemId: 'work-1',
      environmentId: 'environment-1',
      routeId: '/checkout',
      accessMode: 'ANONYMOUS' as const,
    }
    let failClose = true
    const runtime: DiscoveryBrowserRuntime = {
      redirectInterception: 'EVERY_HOP',
      async launch() {
        const browser = await browserRuntime().launch()
        const close = browser.close.bind(browser)
        browser.close = async () => {
          if (failClose) throw new Error('secret close detail')
          await close()
        }
        return browser
      },
    }
    const session = await startQualityJourneyDiscoveryBrowserSession(input, db as never, runtime)
    await expect(
      replaceQualityJourneyDiscoveryBrowserContext({ ...scope, sessionId: session.id }, db as never, runtime),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(getOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope)).toMatchObject({
      state: 'SESSIONS_REGISTERED',
      receipts: [{ sessionId: session.id, state: 'UNKNOWN' }],
    })
    expect(JSON.stringify(getOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope))).not.toContain(
      'secret close detail',
    )
    const unknownRow = db.ownedBrowsers.get(session.id)!
    expect(unknownRow.status).toBe('UNKNOWN')
    expect(unknownRow.stopReceiptJson).toBeUndefined()
    await expect(startQualityJourneyDiscoveryBrowserSession(input, db as never, runtime)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    failClose = false
    const paused = await pauseOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope, db as never)
    expect(paused.receipts).toContainEqual(
      expect.objectContaining({ sessionId: session.id, state: 'RUNTIME_CLOSE_CONFIRMED' }),
    )
    const observedRow = db.ownedBrowsers.get(session.id)!
    expect(observedRow.status).toBe('STOP_OBSERVED')
    expect(observedRow.stopReceiptHash).toBe(canonicalHash(JSON.parse(observedRow.stopReceiptJson!)))
    expect(JSON.parse(observedRow.cleanupHistoryJson).map((entry: { status: string }) => entry.status)).toEqual([
      'LAUNCHING',
      'LIVE',
      'STOP_REQUESTED',
      'UNKNOWN',
      'STOP_REQUESTED',
      'STOP_OBSERVED',
    ])
    expect(await assertOwnedQualityJourneyDiscoveryBrowserCleanupReconciled(cleanupScope, db as never)).toEqual(paused)
    await expect(startQualityJourneyDiscoveryBrowserSession(input, db as never, runtime)).resolves.toMatchObject({
      state: 'ACTIVE',
    })
  })

  it('fences every owned session on pause and explicitly reports an empty process registry', async () => {
    const db = client()
    const input = {
      ...scope,
      workItemId: 'work-1',
      environmentId: 'environment-1',
      routeId: '/checkout',
      accessMode: 'ANONYMOUS' as const,
    }
    expect(await pauseOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope, db as never)).toEqual({
      state: 'NONE_REGISTERED',
      receipts: [],
    })
    const first = await startQualityJourneyDiscoveryBrowserSession(input, db as never, browserRuntime())
    const second = await startQualityJourneyDiscoveryBrowserSession(input, db as never, browserRuntime())
    const result = await pauseOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope, db as never)
    expect(result.receipts.map(receipt => receipt.sessionId).sort()).toEqual([first.id, second.id].sort())
    expect(result.receipts.every(receipt => receipt.state === 'RUNTIME_CLOSE_CONFIRMED')).toBe(true)
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: first.id })).resolves.toMatchObject({
      state: 'CLOSED',
    })
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: second.id })).resolves.toMatchObject({
      state: 'CLOSED',
    })
  })

  it('limits an older pause cleanup to its captured browser session IDs', async () => {
    const db = client()
    const input = {
      ...scope,
      workItemId: 'work-1',
      environmentId: 'environment-1',
      routeId: '/checkout',
      accessMode: 'ANONYMOUS' as const,
    }
    const earlier = await startQualityJourneyDiscoveryBrowserSession(input, db as never, browserRuntime())
    const later = await startQualityJourneyDiscoveryBrowserSession(input, db as never, browserRuntime())
    const result = await pauseOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope, db as never, [earlier.id])
    expect(result.receipts.map(receipt => receipt.sessionId)).toEqual([earlier.id])
    expect(db.ownedBrowsers.get(earlier.id)?.status).toBe('STOP_OBSERVED')
    expect(db.ownedBrowsers.get(later.id)?.status).toBe('LIVE')
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: later.id })).resolves.toMatchObject({
      state: 'ACTIVE',
    })
  })

  it('fences liveness loss while its background browser close is pending or rejected', async () => {
    const db = client()
    const input = {
      ...scope,
      workItemId: 'work-1',
      environmentId: 'environment-1',
      routeId: '/checkout',
      accessMode: 'ANONYMOUS' as const,
    }
    let disconnect!: () => void
    let rejectClose!: (error: Error) => void
    let failClose = true
    const runtime: DiscoveryBrowserRuntime = {
      redirectInterception: 'EVERY_HOP',
      async launch() {
        const browser = await browserRuntime('Checkout', undefined, undefined, undefined, control => {
          disconnect = control.disconnectBrowser
        }).launch()
        const close = browser.close.bind(browser)
        browser.close = () =>
          failClose
            ? new Promise<void>((_resolve, reject) => {
                rejectClose = reject
              })
            : close()
        return browser
      },
    }
    const session = await startQualityJourneyDiscoveryBrowserSession(input, db as never, runtime)
    disconnect()
    expect(getOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope).receipts).toContainEqual(
      expect.objectContaining({ sessionId: session.id, state: 'PENDING' }),
    )
    await expect(startQualityJourneyDiscoveryBrowserSession(input, db as never, runtime)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    rejectClose(new Error('secret browser failure'))
    await vi.waitFor(() => {
      expect(getOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope).receipts).toContainEqual(
        expect.objectContaining({ sessionId: session.id, state: 'UNKNOWN' }),
      )
    })
    failClose = false
    await expect(pauseOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope, db as never)).resolves.toMatchObject({
      receipts: [expect.objectContaining({ sessionId: session.id, state: 'RUNTIME_CLOSE_CONFIRMED' })],
    })
  })

  it('retains an unconfirmed startup close before any session was inserted', async () => {
    const db = client()
    const input = {
      ...scope,
      workItemId: 'work-1',
      environmentId: 'environment-1',
      routeId: '/checkout',
      accessMode: 'ANONYMOUS' as const,
    }
    let failClose = true
    const runtime: DiscoveryBrowserRuntime = {
      async launch() {
        const browser = await browserRuntime().launch()
        browser.newContext = async () => {
          throw new Error('context setup failed')
        }
        browser.close = async () => {
          if (failClose) throw new Error('secret startup close failure')
        }
        return browser
      },
    }
    await expect(startQualityJourneyDiscoveryBrowserSession(input, db as never, runtime)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(getOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope).receipts).toContainEqual(
      expect.objectContaining({ state: 'UNKNOWN' }),
    )
    await expect(startQualityJourneyDiscoveryBrowserSession(input, db as never, runtime)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    failClose = false
    expect((await pauseOwnedQualityJourneyDiscoveryBrowserCleanup(cleanupScope, db as never)).receipts).toContainEqual(
      expect.objectContaining({ state: 'RUNTIME_CLOSE_CONFIRMED' }),
    )
  })

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

  it.each([
    [
      'browser disconnect',
      (control: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0]) => control.disconnectBrowser(),
    ],
    [
      'context close',
      (control: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0]) => control.closeContext(),
    ],
    ['page close', (control: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0]) => control.closePage()],
  ] as const)('rejects startup without exposing a session when %s occurs before insertion', async (_name, lose) => {
    const close = vi.fn()
    await expect(
      startQualityJourneyDiscoveryBrowserSession(
        {
          ...scope,
          workItemId: 'work-1',
          environmentId: 'environment-1',
          routeId: '/checkout',
          accessMode: 'ANONYMOUS',
        },
        client() as never,
        browserRuntime('Checkout', close, undefined, undefined, lose),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(close).toHaveBeenCalledOnce()
  })

  it('rejects startup when the page crashes during initial navigation', async () => {
    let liveness: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0] | undefined
    await expect(
      startQualityJourneyDiscoveryBrowserSession(
        {
          ...scope,
          workItemId: 'work-1',
          environmentId: 'environment-1',
          routeId: '/checkout',
          accessMode: 'ANONYMOUS',
        },
        client() as never,
        browserRuntime(
          'Checkout',
          () => undefined,
          undefined,
          undefined,
          control => (liveness = control),
          () => liveness?.crashPage(),
        ),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it.each([
    [
      'page close',
      'PAGE_CLOSED',
      (control: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0]) => control.closePage(),
    ],
    [
      'page crash',
      'PAGE_CRASHED',
      (control: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0]) => control.crashPage(),
    ],
    [
      'context close',
      'CONTEXT_CLOSED',
      (control: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0]) => control.closeContext(),
    ],
    [
      'browser disconnect',
      'BROWSER_DISCONNECTED',
      (control: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0]) => control.disconnectBrowser(),
    ],
  ] as const)('closes authority with the fixed terminal cause when %s occurs', async (_name, cause, lose) => {
    let liveness: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0] | undefined
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      client() as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        undefined,
        undefined,
        control => (liveness = control),
      ),
    )
    lose(liveness!)
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })).resolves.toMatchObject({
      state: 'CLOSED',
    })
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: session.id }),
    ).resolves.toEqual({ terminalCause: cause })
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...scope, sessionId: session.id, snapshotId: `closed-${cause}` },
        client() as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('detects silent browser health loss and preserves the first terminal cause', async () => {
    let liveness: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0] | undefined
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      client() as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        undefined,
        undefined,
        control => (liveness = control),
      ),
    )
    liveness!.silentlyDisconnectBrowser()
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })).resolves.toMatchObject({
      state: 'CLOSED',
    })
    liveness!.crashPage()
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: session.id }),
    ).resolves.toEqual({ terminalCause: 'BROWSER_DISCONNECTED' })
  })

  it('fences a navigation-listener exception with a fixed terminal cause', async () => {
    let throwPageUrl = false
    let page:
      | {
          navigate: (url: string) => void
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
        undefined,
        undefined,
        () => {
          if (throwPageUrl) throw new Error('page URL unavailable')
          return 'https://example.test/checkout'
        },
      ),
    )
    throwPageUrl = true
    page!.navigate('https://example.test/checkout')
    await vi.waitFor(async () => {
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({
        state: 'CLOSED',
      })
    })
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: session.id }),
    ).resolves.toEqual({ terminalCause: 'ROUTE_OPERATION_FAILED' })
  })

  it('fails closed before fulfillment when a runtime cannot intercept every redirect hop', async () => {
    let handler: ((route: unknown) => Promise<void>) | undefined
    let page: { mainFrame: { url(): string } } | undefined
    const runtime = browserRuntime(
      'Checkout',
      () => undefined,
      next => (handler = next),
      next => (page = next),
    )
    runtime.redirectInterception = 'INITIAL_REQUEST_ONLY'
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      client() as never,
      runtime,
    )
    const abort = vi.fn(async () => undefined)
    const fulfill = vi.fn(async () => undefined)
    await handler?.({
      request: () => ({
        url: () => 'https://example.test/checkout',
        method: () => 'GET',
        isNavigationRequest: () => true,
        resourceType: () => 'document',
        frame: () => page!.mainFrame,
      }),
      abort,
      fetch: async () => ({ headers: () => ({ location: 'https://idp.example.test/authorize' }), status: () => 302 }),
      fulfill,
    })
    expect(abort).toHaveBeenCalledOnce()
    expect(fulfill).not.toHaveBeenCalled()
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })).resolves.toMatchObject({
      state: 'REVOKED',
    })
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: session.id }),
    ).resolves.toEqual({ terminalCause: 'REDIRECT_INTERCEPTION_UNAVAILABLE' })
  })

  it('allows a 304 without redirect-hop interception while keeping session authority active', async () => {
    let handler: ((route: unknown) => Promise<void>) | undefined
    let page: { mainFrame: { url(): string } } | undefined
    const runtime = browserRuntime(
      'Checkout',
      () => undefined,
      next => (handler = next),
      next => (page = next),
    )
    runtime.redirectInterception = 'INITIAL_REQUEST_ONLY'
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      client() as never,
      runtime,
    )
    const abort = vi.fn(async () => undefined)
    const fulfill = vi.fn(async () => undefined)
    await handler?.({
      request: () => ({
        url: () => 'https://example.test/checkout',
        method: () => 'GET',
        isNavigationRequest: () => true,
        resourceType: () => 'document',
        frame: () => page!.mainFrame,
      }),
      abort,
      fetch: async () => ({ headers: () => ({}), status: () => 304 }),
      fulfill,
    })
    expect(fulfill).toHaveBeenCalledOnce()
    expect(abort).not.toHaveBeenCalled()
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })).resolves.toMatchObject({
      state: 'ACTIVE',
    })
  })

  it('requires human confirmation for authenticated intent and preserves a missing-access terminal blocker', async () => {
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
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: session.id }, db as never)
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
    await expect(
      markQualityJourneyDiscoveryBrowserMissingAccess({ ...scope, sessionId: session.id }, db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
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

  it('arms exactly one neutral human return and seals only bounded return provenance', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    const { db, handler, page, route, session } = fixture
    await expect(
      armQualityJourneyDiscoveryBrowserHumanReturn(
        { ...scope, sessionId: session.id, returnUrl: 'https://attacker.test/checkout' },
        db as never,
      ),
    ).rejects.toBeTruthy()
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: session.id }, db as never)
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })).resolves.toMatchObject({
      state: 'ACTIVE',
      allowedOrigins: [],
    })
    page.navigateWithPageUrl('about:blank', 'about:blank')
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })).resolves.toMatchObject({
      state: 'ACTIVE',
      allowedOrigins: [],
      currentUrl: null,
    })
    await handler(route('https://example.test/checkout').route)
    page.navigate('https://example.test/checkout')
    await confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: session.id }, db as never)
    const captured = await captureQualityJourneyDiscoveryBrowserReceipt(
      { ...scope, sessionId: session.id, snapshotId: 'human-return' },
      db as never,
    )
    expect(captured.receipt).toMatchObject({
      authTransitOutcome: 'RETURNED_TO_FROZEN_TARGET',
      humanReturn: {
        mechanism: 'EXPLICIT_ONE_SHOT_EXACT_TARGET_V1',
        authorizationId: expect.stringMatching(/^qjdb_human-return_/),
        targetUrlHash: expect.stringMatching(/^sha256:/),
        method: 'GET',
        committedAt: expect.any(String),
      },
    })
    expect(JSON.stringify(captured.receipt)).not.toContain('idp.example.test')
  })

  it('rejects caller-selected return targets before arming the Appraise-executed exact return', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    await expect(
      authorizeQualityJourneyDiscoveryBrowserExactReturn(
        { ...scope, sessionId: fixture.session.id, returnUrl: 'https://attacker.test/checkout' },
        fixture.db as never,
      ),
    ).rejects.toBeTruthy()
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({
      state: 'ACTIVE',
      allowedOrigins: [],
      currentUrl: null,
    })
  })

  it('closes the session when browser loss interrupts the Appraise-executed exact return', async () => {
    let liveness: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0] | undefined
    let returnNavigationStarted = false
    const fixture = await sessionAtAuthorizedIdp(
      control => (liveness = control),
      () => {
        if (returnNavigationStarted) liveness?.closePage()
      },
    )
    returnNavigationStarted = true

    await expect(
      authorizeQualityJourneyDiscoveryBrowserExactReturn(
        { ...scope, sessionId: fixture.session.id },
        fixture.db as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({ state: 'CLOSED' })
  })

  it('rejects the Appraise-executed exact return when its 15-second commit bound expires', async () => {
    vi.useFakeTimers()
    try {
      const fixture = await sessionAtAuthorizedIdp()
      const authorization = authorizeQualityJourneyDiscoveryBrowserExactReturn(
        { ...scope, sessionId: fixture.session.id },
        fixture.db as never,
      )
      const rejected = expect(authorization).rejects.toMatchObject({ code: 'CONFLICT' })
      await vi.advanceTimersByTimeAsync(15_001)
      await rejected
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
      ).resolves.toMatchObject({ state: 'REVOKED' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns after exact main-frame commit when navigation never reaches DOMContentLoaded', async () => {
    let exactReturnStarted = false
    const fixture = await sessionAtAuthorizedIdp(undefined, async () => {
      if (!exactReturnStarted) return
      await fixture.handler(fixture.route('https://example.test/checkout').route)
      fixture.page.navigate('https://example.test/checkout')
      return new Promise<never>(() => undefined)
    })
    exactReturnStarted = true

    await expect(
      authorizeQualityJourneyDiscoveryBrowserExactReturn(
        { ...scope, sessionId: fixture.session.id },
        fixture.db as never,
      ),
    ).resolves.toMatchObject({
      return: 'RETURN_COMMITTED',
      session: {
        state: 'ACTIVE',
        currentUrl: 'https://example.test/checkout',
        allowedOrigins: ['https://example.test'],
      },
    })
  })

  it('fences the session when owned-page navigation rejects before exact main-frame commit', async () => {
    let exactReturnStarted = false
    const fixture = await sessionAtAuthorizedIdp(undefined, () => {
      if (exactReturnStarted) throw new Error('synthetic navigation rejection')
    })
    exactReturnStarted = true

    await expect(
      authorizeQualityJourneyDiscoveryBrowserExactReturn(
        { ...scope, sessionId: fixture.session.id },
        fixture.db as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({ state: 'REVOKED' })
  })

  it("arms only from the selected flow's explicit exact GET return origin, not an intermediary transit origin", async () => {
    const intermediaryOnlyPolicy = JSON.stringify({
      schemaVersion: 'appraise.discovery-auth-transit/v1',
      flows: [
        {
          flowId: 'test-login',
          rules: [
            {
              documentOrigin: '$TARGET',
              destinationOrigin: 'https://idp.example.test',
              path: { match: 'EXACT', value: '/authorize' },
              methods: ['GET'],
              requestKinds: ['DOCUMENT'],
            },
            {
              documentOrigin: 'https://idp.example.test',
              destinationOrigin: 'https://idp-b.example.test',
              path: { match: 'EXACT', value: '/continue' },
              methods: ['GET'],
              requestKinds: ['DOCUMENT'],
            },
          ],
          returns: [{ fromOrigin: 'https://idp.example.test', targetPath: '/checkout', methods: ['GET'] }],
        },
      ],
    })
    const db = client({ authPolicyJson: intermediaryOnlyPolicy })
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
    const route = (url: string, status = 200, location?: string) => ({
      request: () => ({
        url: () => url,
        method: () => 'GET',
        isNavigationRequest: () => true,
        resourceType: () => 'document',
        frame: () => page!.mainFrame,
      }),
      abort: vi.fn(async () => undefined),
      fetch: async () => ({ headers: () => (location ? { location } : {}), status: () => status }),
      fulfill: vi.fn(async () => undefined),
    })
    await handler!(route('https://example.test/checkout', 302, 'https://idp.example.test/authorize'))
    await handler!(route('https://idp.example.test/authorize', 302, 'https://idp-b.example.test/continue'))
    await handler!(route('https://idp-b.example.test/continue'))
    page!.navigate('https://idp-b.example.test/continue')

    await expect(
      armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: session.id }, db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('allows only one concurrent exact human-return request to spend the grant', async () => {
    const { db, handler, route, session } = await sessionAtAuthorizedIdp()
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: session.id }, db as never)
    const first = route('https://example.test/checkout')
    const second = route('https://example.test/checkout')
    await Promise.all([handler(first.route), handler(second.route)])
    expect(first.fulfill.mock.calls.length + second.fulfill.mock.calls.length).toBe(0)
    expect(first.abort.mock.calls.length + second.abort.mock.calls.length).toBe(2)
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })).resolves.toMatchObject({
      state: 'REVOKED',
    })
  })

  it('tolerates only one pre-request neutral frame transition for an armed human return', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never)
    fixture.page.navigateWithPageUrl('about:blank', 'about:blank')
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({ state: 'ACTIVE' })
    fixture.page.navigateWithPageUrl('about:blank', 'about:blank')
    await vi.waitFor(async () => {
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
      ).resolves.toMatchObject({ state: 'REVOKED' })
    })
  })

  it('revokes an armed return on query, method, redirect, or pre-commit subresource traffic', async () => {
    const invalidRequests = [
      (fixture: Awaited<ReturnType<typeof sessionAtAuthorizedIdp>>) =>
        fixture.route('https://example.test/checkout?secret=must-not-pass'),
      (fixture: Awaited<ReturnType<typeof sessionAtAuthorizedIdp>>) =>
        fixture.route('https://example.test/checkout#must-not-pass'),
      (fixture: Awaited<ReturnType<typeof sessionAtAuthorizedIdp>>) =>
        fixture.route('https://operator@localhost@EXAMPLE.test/checkout'),
      (fixture: Awaited<ReturnType<typeof sessionAtAuthorizedIdp>>) =>
        fixture.route('https://example.test/checkout', 'POST'),
      (fixture: Awaited<ReturnType<typeof sessionAtAuthorizedIdp>>) =>
        fixture.route('https://example.test/checkout', 'GET', 302, 'https://example.test/checkout'),
      (fixture: Awaited<ReturnType<typeof sessionAtAuthorizedIdp>>) =>
        fixture.route('https://idp.example.test/authorize'),
      (fixture: Awaited<ReturnType<typeof sessionAtAuthorizedIdp>>) =>
        fixture.route('https://example.test/asset.js', 'GET', 200, undefined, false, 'script'),
    ]
    for (const invalidRequest of invalidRequests) {
      const fixture = await sessionAtAuthorizedIdp()
      await armQualityJourneyDiscoveryBrowserHumanReturn(
        { ...scope, sessionId: fixture.session.id },
        fixture.db as never,
      )
      const attempted = invalidRequest(fixture)
      await fixture.handler(attempted.route)
      expect(attempted.abort).toHaveBeenCalledOnce()
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
      ).resolves.toMatchObject({ state: 'REVOKED' })
    }
  })

  it('classifies a denied human return transiently without producing an admissible receipt', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never)
    await fixture.handler(fixture.route('https://example.test/asset.js', 'GET', 200, undefined, false, 'script').route)
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toEqual({ terminalCause: 'HUMAN_RETURN_DENIED' })

    const session = await getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id })
    expect(session).not.toHaveProperty('terminalCause')
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...scope, sessionId: fixture.session.id, snapshotId: 'denied-human-return' },
        fixture.db as never,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect([...fixture.db.artifacts.values()]).toEqual([])
    await expect(
      assertDiscoveryBrowserReceiptAdmission(
        {
          cycleId: 'cycle-1',
          evidenceReceipts: [{ artifactId: 'terminal-diagnostic', contentHash: canonicalHash({ terminal: true }) }],
          targetSnapshot: { snapshotId: 'denied-human-return' },
          observations: [
            {
              snapshotId: 'denied-human-return',
              routeId: '/checkout',
              environmentId: 'environment-1',
              fact: 'A terminal diagnostic is not receipt evidence.',
              evidenceReceiptIds: ['terminal-diagnostic'],
            },
          ],
        },
        {
          id: 'revision-1',
          journeyId: 'journey-1',
          targetProjectId: 'target-1',
          cycleId: 'cycle-1',
          scoutWorkItemId: 'work-1',
        },
        {
          qualityJourneyArtifact: { findMany: async () => [] },
          qualityJourneyDiscoveryRevision: fixture.db.qualityJourneyDiscoveryRevision,
        } as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    await fixture.handler(fixture.route('https://attacker.test/checkout').route)
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toEqual({ terminalCause: 'HUMAN_RETURN_DENIED' })
  })

  it('classifies an in-flight route fenced by return arming', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    const held = fixture.route('https://idp-b.example.test/continue')
    const fetched = deferred<{ headers(): Record<string, string>; status(): number }>()
    held.route.fetch = vi.fn(() => fetched.promise)
    const processing = fixture.handler(held.route)
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never)
    fetched.resolve({ headers: () => ({}), status: () => 200 })
    await processing
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toEqual({ terminalCause: 'ROUTE_NOT_ACTIVE' })
  })

  it('classifies a main-frame route origin mismatch before revocation', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    await fixture.handler(
      fixture.route('https://idp-b.example.test/continue', 'GET', 302, 'https://example.test/checkout').route,
    )
    await fixture.handler(fixture.route('https://idp-b.example.test/continue').route)
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toEqual({ terminalCause: 'ROUTE_ORIGIN_MISMATCH' })
  })

  it.each([
    ['attacker document', 'https://attacker.test/checkout', true, 'document'],
    ['third-party subresource', 'https://analytics.example.test/pixel.js', false, 'script'],
    ['third-party XHR/fetch', 'https://analytics.example.test/collect', false, 'fetch'],
  ] as const)('aborts an ordinary unarmed %s without mutating authority', async (_name, url, navigation, resource) => {
    const fixture = await sessionAtAuthorizedIdp()
    const denied = fixture.route(url, 'GET', 200, undefined, navigation, resource)
    await fixture.handler(denied.route)
    expect(denied.abort).toHaveBeenCalledOnce()
    expect(denied.fulfill).not.toHaveBeenCalled()
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({
      state: 'ACTIVE',
      allowedOrigins: [],
      currentUrl: null,
    })
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: fixture.session.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const allowed = fixture.route('https://idp-b.example.test/continue')
    await fixture.handler(allowed.route)
    expect(allowed.fulfill).toHaveBeenCalledOnce()
  })

  it('revokes only when an ordinary policy-denial abort fails', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    const denied = fixture.route('https://analytics.example.test/collect', 'GET', 200, undefined, false, 'fetch')
    denied.route.abort.mockRejectedValue(new Error('abort failed'))
    await fixture.handler(denied.route)
    expect(denied.fulfill).not.toHaveBeenCalled()
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({ state: 'REVOKED' })
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toEqual({ terminalCause: 'ROUTE_OPERATION_FAILED' })
  })

  it('does not admit or fence authority when an ordinary policy-denial abort never settles', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    const denied = fixture.route('https://analytics.example.test/collect', 'GET', 200, undefined, false, 'fetch')
    denied.route.abort = vi.fn(() => new Promise<undefined>(() => undefined))
    void fixture.handler(denied.route)
    expect(denied.fulfill).not.toHaveBeenCalled()
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({
      state: 'ACTIVE',
      allowedOrigins: [],
      currentUrl: null,
    })
  })

  it('synchronously revokes an armed human return on an XHR/fetch denial before abort settles', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never)
    const denied = fixture.route('https://analytics.example.test/collect', 'GET', 200, undefined, false, 'fetch')
    denied.route.abort = vi.fn(() => new Promise<undefined>(() => undefined))
    void fixture.handler(denied.route)
    expect(denied.fulfill).not.toHaveBeenCalled()
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({ state: 'REVOKED', allowedOrigins: [] })
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toEqual({ terminalCause: 'HUMAN_RETURN_DENIED' })
  })

  it('classifies a rejected route operation', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    const failing = fixture.route('https://idp-b.example.test/continue')
    failing.route.fetch = vi.fn(async () => Promise.reject(new Error('route transport failed')))
    await fixture.handler(failing.route)
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toEqual({ terminalCause: 'ROUTE_OPERATION_FAILED' })
  })

  it('classifies a denied redirect', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    await fixture.handler(
      fixture.route('https://idp-b.example.test/continue', 'GET', 302, 'https://attacker.test/next').route,
    )
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toEqual({ terminalCause: 'REDIRECT_DENIED' })
  })

  it.each([
    [304, 'ACTIVE', true],
    [302, 'REVOKED', false],
  ] as const)('keeps the exact human return fail-closed classification for %i', async (status, state, fulfilled) => {
    const fixture = await sessionAtAuthorizedIdp()
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never)
    const response = fixture.route('https://example.test/checkout', 'GET', status)
    await fixture.handler(response.route)
    expect(response.fulfill).toHaveBeenCalledTimes(fulfilled ? 1 : 0)
    expect(response.abort).toHaveBeenCalledTimes(fulfilled ? 0 : 1)
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({
      state,
    })
  })

  it('refuses stale, revoked, restarted, and reused human-return grants', async () => {
    const stale = await sessionAtAuthorizedIdp()
    stale.db.environmentScope.scopeVersion += 1
    await expect(
      armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: stale.session.id }, stale.db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    const revoked = await sessionAtAuthorizedIdp()
    await revokeQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: revoked.session.id })
    await expect(
      armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: revoked.session.id }, revoked.db as never),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    const reused = await sessionAtAuthorizedIdp()
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: reused.session.id }, reused.db as never)
    await expect(
      armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: reused.session.id }, reused.db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    const restarted = await sessionAtAuthorizedIdp()
    await clearQualityJourneyDiscoveryBrowserSessionsForTest()
    await expect(
      armQualityJourneyDiscoveryBrowserHumanReturn(
        { ...scope, sessionId: restarted.session.id },
        restarted.db as never,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it.each([
    ['revoke', 'REVOKED'],
    ['logout', 'LOGGED_OUT'],
    ['replacement', 'CONTEXT_REPLACED'],
  ] as const)(
    'does not arm after a concurrent %s invalidates the session authority',
    async (operation, expectedState) => {
      const fixture = await sessionAtAuthorizedIdp()
      const started = deferred()
      const release = deferred()
      const originalFindFirst = fixture.db.environment.findFirst
      fixture.db.environment.findFirst = async () => {
        started.resolve()
        await release.promise
        return originalFindFirst()
      }
      const arming = armQualityJourneyDiscoveryBrowserHumanReturn(
        { ...scope, sessionId: fixture.session.id },
        fixture.db as never,
      )
      await started.promise
      const lifecycle =
        operation === 'revoke'
          ? revokeQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id })
          : operation === 'logout'
            ? logoutQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id })
            : replaceQualityJourneyDiscoveryBrowserContext(
                { ...scope, sessionId: fixture.session.id },
                fixture.db as never,
                browserRuntime(),
              )
      if (operation === 'replacement') {
        await vi.waitFor(async () => {
          await expect(
            getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
          ).resolves.toMatchObject({ state: expectedState })
        })
      } else await lifecycle
      release.resolve()
      await expect(arming).rejects.toMatchObject({ code: operation === 'revoke' ? 'UNAUTHORIZED' : 'CONFLICT' })
      await lifecycle
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
      ).resolves.toMatchObject({ state: expectedState })
    },
  )

  it('revokes rather than committing a pre-arm route whose fetch resolves after the arm epoch', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    const started = deferred()
    const release = deferred()
    const inFlight = fixture.route('https://idp-b.example.test/continue')
    inFlight.route.fetch = async () => {
      started.resolve()
      await release.promise
      return { headers: () => ({}), status: () => 200 }
    }
    const routeProcessing = fixture.handler(inFlight.route)
    await started.promise
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never)
    release.resolve()
    await routeProcessing
    expect(inFlight.abort).toHaveBeenCalledOnce()
    expect(inFlight.fulfill).not.toHaveBeenCalled()
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({ state: 'REVOKED', allowedOrigins: [] })
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...scope, sessionId: fixture.session.id, snapshotId: 'stale-pre-arm-route' },
        fixture.db as never,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('refuses to arm over an uncommitted pre-arm navigation', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    const inFlight = fixture.route('https://idp-b.example.test/continue')
    await fixture.handler(inFlight.route)
    expect(inFlight.fulfill).toHaveBeenCalledOnce()
    await expect(
      armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({ state: 'ACTIVE' })
  })

  it('revokes an unspent human-return grant when its bounded process-local timer expires', async () => {
    vi.useFakeTimers()
    try {
      const fixture = await sessionAtAuthorizedIdp()
      await armQualityJourneyDiscoveryBrowserHumanReturn(
        { ...scope, sessionId: fixture.session.id },
        fixture.db as never,
      )
      await vi.advanceTimersByTimeAsync(15_001)
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
      ).resolves.toMatchObject({ state: 'REVOKED' })
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['grant', 15_001],
    ['session', 300_001],
  ])('revokes a consumed human return when %s expiry wins before main-frame commit', async (_kind, elapsed) => {
    vi.useFakeTimers()
    try {
      const fixture = await sessionAtAuthorizedIdp()
      await armQualityJourneyDiscoveryBrowserHumanReturn(
        { ...scope, sessionId: fixture.session.id },
        fixture.db as never,
      )
      const lateReturn = fixture.route('https://example.test/checkout')
      lateReturn.route.fetch = async () => {
        vi.setSystemTime(Date.now() + elapsed)
        return { headers: () => ({}), status: () => 200 }
      }
      await fixture.handler(lateReturn.route)
      fixture.page.navigate('https://example.test/checkout')
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
      ).resolves.toMatchObject({ state: 'REVOKED' })
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['abort', 'fetch', 'fulfill'] as const)(
    'revokes fail-closed when the human-return route %s operation throws',
    async operation => {
      const fixture = await sessionAtAuthorizedIdp()
      await armQualityJourneyDiscoveryBrowserHumanReturn(
        { ...scope, sessionId: fixture.session.id },
        fixture.db as never,
      )
      const attempted =
        operation === 'abort'
          ? fixture.route('https://attacker.test/checkout')
          : fixture.route('https://example.test/checkout')
      if (operation === 'abort') attempted.route.abort.mockRejectedValue(new Error('abort failed'))
      if (operation === 'fetch') attempted.route.fetch = async () => Promise.reject(new Error('fetch failed'))
      if (operation === 'fulfill') attempted.route.fulfill.mockRejectedValue(new Error('fulfill failed'))

      await expect(fixture.handler(attempted.route)).resolves.toBeUndefined()
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
      ).resolves.toMatchObject({ state: 'REVOKED' })
    },
  )

  it('keeps confirm and capture available during an ordinary unauthorized-route abort', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    await returnToFrozenTarget(fixture)
    const releaseAbort = deferred<undefined>()
    const unauthorized = fixture.route('https://attacker.test/checkout')
    unauthorized.route.abort = vi.fn(() => releaseAbort.promise)
    const processing = fixture.handler(unauthorized.route)
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({
      state: 'ACTIVE',
    })
    await expect(
      confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: fixture.session.id }, fixture.db as never),
    ).resolves.toMatchObject({ state: 'ACCESS_CONFIRMED' })
    releaseAbort.resolve(undefined)
    await processing

    const db = client()
    let handler: ((route: unknown) => Promise<void>) | undefined
    let page: { mainFrame: { url(): string } } | undefined
    const anonymous = await startQualityJourneyDiscoveryBrowserSession(
      {
        ...scope,
        workItemId: 'work-1',
        environmentId: 'environment-1',
        routeId: '/checkout',
        accessMode: 'ANONYMOUS',
      },
      db as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        next => (handler = next),
        next => (page = next),
      ),
    )
    const never = new Promise<undefined>(() => undefined)
    void handler?.({
      request: () => ({
        url: () => 'https://attacker.test/checkout',
        method: () => 'GET',
        isNavigationRequest: () => true,
        resourceType: () => 'document',
        frame: () => page!.mainFrame,
      }),
      abort: () => never,
      fetch: async () => ({ headers: () => ({}), status: () => 200 }),
      fulfill: async () => undefined,
    })
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: anonymous.id }),
    ).resolves.toMatchObject({
      state: 'ACTIVE',
    })
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...scope, sessionId: anonymous.id, snapshotId: 'capture-after-never-abort' },
        db as never,
      ),
    ).resolves.toMatchObject({ receipt: { accessOutcome: 'ACTIVE' } })
    expect([...db.artifacts.values()]).toHaveLength(1)
  })

  it('cannot spend an armed exact-return grant after a never-settling abort has fenced authority', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never)
    const never = new Promise<undefined>(() => undefined)
    const denied = fixture.route('https://attacker.test/checkout')
    denied.route.abort = vi.fn(() => never)
    void fixture.handler(denied.route)
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({
      state: 'REVOKED',
      allowedOrigins: [],
    })
    const exactReturn = fixture.route('https://example.test/checkout')
    exactReturn.route.fetch = vi.fn(async () => ({ headers: () => ({}), status: () => 200 }))
    await fixture.handler(exactReturn.route)
    expect(exactReturn.route.fetch).not.toHaveBeenCalled()
    expect(exactReturn.fulfill).not.toHaveBeenCalled()
    expect(exactReturn.abort).toHaveBeenCalledOnce()
  })

  it.each(['revoke', 'expiry'] as const)(
    'keeps a confirmation durable when %s occurs after its synchronous CAS',
    async lifecycle => {
      if (lifecycle === 'expiry') vi.useFakeTimers()
      try {
        const fixture = await sessionAtAuthorizedIdp()
        await returnToFrozenTarget(fixture)
        const started = deferred()
        const release = deferred()
        fixture.db.qualityJourneyBlocker.updateMany = async () => {
          started.resolve()
          await release.promise
          return { count: 0 }
        }
        const confirmation = confirmQualityJourneyDiscoveryBrowserAccess(
          { ...scope, sessionId: fixture.session.id },
          fixture.db as never,
        )
        await started.promise
        if (lifecycle === 'revoke')
          await revokeQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id })
        else await vi.advanceTimersByTimeAsync(300_001)
        release.resolve()
        await expect(confirmation).resolves.toMatchObject({
          state: lifecycle === 'revoke' ? 'REVOKED' : 'EXPIRED',
        })
        await expect(
          getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
        ).resolves.toMatchObject({ state: lifecycle === 'revoke' ? 'REVOKED' : 'EXPIRED' })
      } finally {
        if (lifecycle === 'expiry') vi.useRealTimers()
      }
    },
  )

  it.each(['revoke', 'expiry', 'missing-access'] as const)(
    'does not resolve the missing-access blocker when %s wins before confirmation CAS',
    async lifecycle => {
      if (lifecycle === 'expiry') vi.useFakeTimers()
      try {
        const fixture = await sessionAtAuthorizedIdp()
        await returnToFrozenTarget(fixture)
        const started = deferred()
        const release = deferred()
        const originalFindFirst = fixture.db.environment.findFirst
        fixture.db.environment.findFirst = async () => {
          started.resolve()
          await release.promise
          return originalFindFirst()
        }
        const confirmation = confirmQualityJourneyDiscoveryBrowserAccess(
          { ...scope, sessionId: fixture.session.id },
          fixture.db as never,
        )
        await started.promise
        if (lifecycle === 'revoke')
          await revokeQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id })
        else if (lifecycle === 'expiry') await vi.advanceTimersByTimeAsync(300_001)
        else
          await markQualityJourneyDiscoveryBrowserMissingAccess(
            { ...scope, sessionId: fixture.session.id },
            fixture.db as never,
          )
        release.resolve()
        await expect(confirmation).rejects.toMatchObject({
          code: lifecycle === 'missing-access' ? 'CONFLICT' : 'UNAUTHORIZED',
        })
        expect(fixture.db.blockerUpdates).toEqual([])
      } finally {
        if (lifecycle === 'expiry') vi.useRealTimers()
      }
    },
  )

  it('does not resolve the blocker when page loss wins while confirmation is paused before its CAS', async () => {
    let liveness: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0] | undefined
    const fixture = await sessionAtAuthorizedIdp(control => (liveness = control))
    await returnToFrozenTarget(fixture)
    const started = deferred()
    const release = deferred()
    const originalFindFirst = fixture.db.environment.findFirst
    fixture.db.environment.findFirst = async () => {
      started.resolve()
      await release.promise
      return originalFindFirst()
    }
    const confirmation = confirmQualityJourneyDiscoveryBrowserAccess(
      { ...scope, sessionId: fixture.session.id },
      fixture.db as never,
    )
    await started.promise
    liveness!.closePage()
    release.resolve()
    await expect(confirmation).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(fixture.db.blockerUpdates).toEqual([])
  })

  it('rejects concurrent missing access after confirmation CAS and revokes if blocker resolution fails', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    await returnToFrozenTarget(fixture)
    const started = deferred()
    const release = deferred()
    fixture.db.qualityJourneyBlocker.updateMany = async () => {
      started.resolve()
      await release.promise
      return { count: 0 }
    }
    const confirmation = confirmQualityJourneyDiscoveryBrowserAccess(
      { ...scope, sessionId: fixture.session.id },
      fixture.db as never,
    )
    await started.promise
    await expect(
      markQualityJourneyDiscoveryBrowserMissingAccess({ ...scope, sessionId: fixture.session.id }, fixture.db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    release.resolve()
    await expect(confirmation).resolves.toMatchObject({ state: 'ACCESS_CONFIRMED' })

    const failed = await sessionAtAuthorizedIdp()
    await returnToFrozenTarget(failed)
    failed.db.qualityJourneyBlocker.updateMany = async () => Promise.reject(new Error('blocker write failed'))
    await expect(
      confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: failed.session.id }, failed.db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: failed.session.id }),
    ).resolves.toMatchObject({
      state: 'REVOKED',
    })
  })

  it.each(['revoke', 'expiry'] as const)(
    'does not persist or return a capture after %s wins during its transaction read',
    async lifecycle => {
      if (lifecycle === 'expiry') vi.useFakeTimers()
      try {
        const db = client()
        const session = await startQualityJourneyDiscoveryBrowserSession(
          {
            ...scope,
            workItemId: 'work-1',
            environmentId: 'environment-1',
            routeId: '/checkout',
            accessMode: 'ANONYMOUS',
          },
          db as never,
          browserRuntime(),
        )
        const started = deferred()
        const release = deferred()
        db.qualityJourneyArtifact.findUnique = async () => {
          started.resolve()
          await release.promise
          return null
        }
        const capture = captureQualityJourneyDiscoveryBrowserReceipt(
          { ...scope, sessionId: session.id, snapshotId: `capture-${lifecycle}` },
          db as never,
        )
        await started.promise
        if (lifecycle === 'revoke')
          await revokeQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })
        else await vi.advanceTimersByTimeAsync(300_001)
        release.resolve()
        await expect(capture).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
        expect([...db.artifacts.values()]).toEqual([])
        await expect(
          getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
        ).resolves.toMatchObject({
          state: lifecycle === 'revoke' ? 'REVOKED' : 'EXPIRED',
        })
      } finally {
        if (lifecycle === 'expiry') vi.useRealTimers()
      }
    },
  )

  it('does not commit a receipt when context loss wins during its transaction read', async () => {
    let liveness: Parameters<NonNullable<Parameters<typeof browserRuntime>[4]>>[0] | undefined
    const db = client()
    const session = await startQualityJourneyDiscoveryBrowserSession(
      { ...scope, workItemId: 'work-1', environmentId: 'environment-1', routeId: '/checkout', accessMode: 'ANONYMOUS' },
      db as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        undefined,
        undefined,
        control => (liveness = control),
      ),
    )
    const started = deferred()
    const release = deferred()
    db.qualityJourneyArtifact.findUnique = async () => {
      started.resolve()
      await release.promise
      return null
    }
    const capture = captureQualityJourneyDiscoveryBrowserReceipt(
      { ...scope, sessionId: session.id, snapshotId: 'capture-context-loss' },
      db as never,
    )
    await started.promise
    liveness!.closeContext()
    release.resolve()
    await expect(capture).rejects.toMatchObject({ code: 'CONFLICT' })
    expect([...db.artifacts.values()]).toEqual([])
  })

  it('makes missing access terminal before its blocker write so an in-flight arm cannot succeed', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    const started = deferred()
    const release = deferred()
    fixture.db.qualityJourneyBlocker.upsert = async () => {
      started.resolve()
      await release.promise
      return undefined
    }
    const missing = markQualityJourneyDiscoveryBrowserMissingAccess(
      { ...scope, sessionId: fixture.session.id },
      fixture.db as never,
    )
    await started.promise
    await expect(
      armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    release.resolve()
    await expect(missing).resolves.toMatchObject({ state: 'MISSING_ACCESS' })
  })

  it('keeps ordinary frozen-target traffic allowed across confirmation and aborts unauthorized traffic without revocation', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    await returnToFrozenTarget(fixture)
    const beforeConfirmation = fixture.route('https://example.test/checkout')
    await fixture.handler(beforeConfirmation.route)
    expect(beforeConfirmation.fulfill).toHaveBeenCalledOnce()

    const fetchStarted = deferred()
    const releaseFetch = deferred()
    const crossingConfirmation = fixture.route('https://example.test/checkout')
    crossingConfirmation.route.fetch = async () => {
      fetchStarted.resolve()
      await releaseFetch.promise
      return { headers: () => ({}), status: () => 200 }
    }
    const inFlight = fixture.handler(crossingConfirmation.route)
    await fetchStarted.promise
    await confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: fixture.session.id }, fixture.db as never)
    releaseFetch.resolve()
    await inFlight
    expect(crossingConfirmation.fulfill).toHaveBeenCalledOnce()

    const afterConfirmation = fixture.route('https://example.test/checkout')
    await fixture.handler(afterConfirmation.route)
    expect(afterConfirmation.fulfill).toHaveBeenCalledOnce()
    const unauthorized = fixture.route('https://attacker.test/checkout')
    await fixture.handler(unauthorized.route)
    expect(unauthorized.abort).toHaveBeenCalledOnce()
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({ state: 'ACCESS_CONFIRMED' })
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
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: session.id }, db as never)
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
      'transaction-close',
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
    expect(returned.fulfill).toHaveBeenCalledOnce()
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
      redirectInterception: 'EVERY_HOP',
      async launch() {
        let url = 'about:blank'
        return {
          on: () => undefined,
          isConnected: () => true,
          async newContext() {
            return {
              on: () => undefined,
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
                  isClosed: () => false,
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

  it('ignores only an empty provisional main-frame event and still fences the next real navigation', async () => {
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
      client() as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        undefined,
        next => (page = next),
      ),
    )
    page?.navigateWithPageUrl('', '')
    await expect(getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id })).resolves.toMatchObject({
      state: 'ACTIVE',
    })
    await expect(
      confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: session.id }, client() as never),
    ).rejects.toBeTruthy()
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...scope, sessionId: session.id, snapshotId: 'empty-provisional' },
        client() as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    page?.navigate('https://attacker.test/checkout')
    await vi.waitFor(async () => {
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({ state: 'REVOKED' })
    })
  })

  it('revokes an unarmed about:blank main-frame event', async () => {
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
      client() as never,
      browserRuntime(
        'Checkout',
        () => undefined,
        undefined,
        next => (page = next),
      ),
    )
    page?.navigateWithPageUrl('about:blank', 'about:blank')
    await vi.waitFor(async () => {
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({ state: 'REVOKED' })
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

  it('clears only a cached exact GET provider-login redirect before the next authorized POST', async () => {
    const fixture = await sessionAtRepeatedProviderLogin()
    const rejected = fixture.route('https://idp.example.test/login', 'POST', 302, '/login')
    await fixture.handler(rejected.route)
    expect(rejected.fulfill).toHaveBeenCalledOnce()

    fixture.page.navigate('https://idp.example.test/login')
    const retry = fixture.route('https://idp.example.test/login', 'POST', 302, '/login')
    await fixture.handler(retry.route)
    expect(retry.abort).not.toHaveBeenCalled()
    expect(retry.fulfill).toHaveBeenCalledOnce()
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({ state: 'ACTIVE' })
  })

  it('commits a same-URL provider-login response instead of treating it as an old-page duplicate', async () => {
    const fixture = await sessionAtRepeatedProviderLogin()
    const login = fixture.route('https://idp.example.test/login')
    await fixture.handler(login.route)
    expect(login.fulfill).toHaveBeenCalledOnce()

    fixture.page.navigate('https://idp.example.test/login')
    await expect(
      armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never),
    ).resolves.toMatchObject({ returnUrl: 'https://example.test/checkout' })
  })

  it('keeps an ordinary pending transition through an exact duplicate provider-login event', async () => {
    const fixture = await sessionAtRepeatedProviderLogin()
    const secure = fixture.route('https://idp.example.test/secure')
    await fixture.handler(secure.route)
    expect(secure.fulfill).toHaveBeenCalledOnce()

    fixture.page.navigate('https://idp.example.test/login')
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({ state: 'ACTIVE', currentUrl: null, allowedOrigins: [] })

    fixture.page.navigate('https://idp.example.test/secure')
    await expect(
      getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
    ).resolves.toMatchObject({ state: 'ACTIVE', currentUrl: null, allowedOrigins: [] })
    await expect(
      armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never),
    ).resolves.toMatchObject({ returnUrl: 'https://example.test/checkout' })
  })

  it('does not ignore a duplicate provider event while a tagged human return commit is pending', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    await armQualityJourneyDiscoveryBrowserHumanReturn({ ...scope, sessionId: fixture.session.id }, fixture.db as never)
    await fixture.handler(fixture.route('https://example.test/checkout').route)

    fixture.page.navigate('https://idp.example.test/authorize')
    await vi.waitFor(async () => {
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
      ).resolves.toMatchObject({ state: 'REVOKED' })
    })
    await expect(
      getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({
        ...scope,
        sessionId: fixture.session.id,
      }),
    ).resolves.toEqual({ terminalCause: 'MAIN_FRAME_MISMATCH' })
  })

  it.each([
    ['path', 'https://idp.example.test/login/other'],
    ['query', 'https://idp.example.test/login?unexpected=1'],
    ['fragment', 'https://idp.example.test/login#unexpected'],
    ['origin', 'https://attacker.test/login'],
  ] as const)(
    'revokes an ordinary pending transition when the duplicate provider-login event changes its %s',
    async (_name, eventUrl) => {
      const fixture = await sessionAtRepeatedProviderLogin()
      await fixture.handler(fixture.route('https://idp.example.test/secure').route)
      fixture.page.navigate(eventUrl)
      await vi.waitFor(async () => {
        await expect(
          getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
        ).resolves.toMatchObject({ state: 'REVOKED' })
      })
      await expect(
        getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({
          ...scope,
          sessionId: fixture.session.id,
        }),
      ).resolves.toEqual({ terminalCause: 'MAIN_FRAME_MISMATCH' })
    },
  )

  it.each([
    ['query', 302, 'https://idp.example.test/login?unexpected=1'],
    ['non-GET redirect', 307, 'https://idp.example.test/login'],
  ] as const)(
    'fails closed instead of clearing a cached duplicate with a %s variant',
    async (_name, status, eventUrl) => {
      const fixture = await sessionAtRepeatedProviderLogin()
      const rejected = fixture.route('https://idp.example.test/login', 'POST', status, '/login')
      await fixture.handler(rejected.route)
      fixture.page.navigate(eventUrl)
      await vi.waitFor(async () => {
        await expect(
          getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: fixture.session.id }),
        ).resolves.toMatchObject({ state: 'REVOKED' })
      })
      await expect(
        getQualityJourneyDiscoveryBrowserTerminalDiagnosticForQualification({
          ...scope,
          sessionId: fixture.session.id,
        }),
      ).resolves.toEqual({ terminalCause: 'MAIN_FRAME_MISMATCH' })
    },
  )

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
      qualityJourneyDiscoveryRevision: db.qualityJourneyDiscoveryRevision,
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

    const wrongScopeReceipt = {
      ...captured.receipt,
      environmentScopeVersion: captured.receipt.environmentScopeVersion + 1,
    }
    const wrongScopeHash = canonicalHash(wrongScopeReceipt)
    const wrongScopeTx = {
      qualityJourneyArtifact: {
        findMany: async () => [
          {
            artifactId: captured.artifactId,
            contentHash: wrongScopeHash,
            artifactJson: JSON.stringify(wrongScopeReceipt),
          },
        ],
      },
      qualityJourneyDiscoveryRevision: db.qualityJourneyDiscoveryRevision,
    }
    await expect(
      assertDiscoveryBrowserReceiptAdmission(
        { ...bundle, evidenceReceipts: [{ artifactId: captured.artifactId, contentHash: wrongScopeHash }] },
        revision,
        wrongScopeTx as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('rejects authenticated receipt provenance tampered after one-shot human return', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    const captured = await completeHumanReturn(fixture)
    const receipt = {
      ...captured.receipt,
      humanReturn: {
        ...captured.receipt.humanReturn!,
        targetUrlHash: `sha256:${'0'.repeat(64)}`,
      },
    }
    const contentHash = canonicalHash(receipt)
    const tx = {
      ...fixture.db,
      qualityJourneyArtifact: {
        findMany: async () => [{ artifactId: captured.artifactId, contentHash, artifactJson: JSON.stringify(receipt) }],
      },
    }
    const bundle = {
      cycleId: 'cycle-1',
      evidenceReceipts: [{ artifactId: captured.artifactId, contentHash }],
      targetSnapshot: { snapshotId: captured.receipt.snapshotId },
      observations: [
        {
          snapshotId: captured.receipt.snapshotId,
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
    await expect(assertDiscoveryBrowserReceiptAdmission(bundle, revision, tx as never)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('rejects an authenticated receipt whose recomputed seal downgrades access to active', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    const captured = await completeHumanReturn(fixture)
    const receipt = { ...captured.receipt, accessOutcome: 'ACTIVE' as const }
    const contentHash = canonicalHash(receipt)
    const tx = {
      ...fixture.db,
      qualityJourneyArtifact: {
        findMany: async () => [{ artifactId: captured.artifactId, contentHash, artifactJson: JSON.stringify(receipt) }],
      },
    }
    const bundle = {
      cycleId: 'cycle-1',
      evidenceReceipts: [{ artifactId: captured.artifactId, contentHash }],
      targetSnapshot: { snapshotId: captured.receipt.snapshotId },
      observations: [
        {
          snapshotId: captured.receipt.snapshotId,
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
    await expect(assertDiscoveryBrowserReceiptAdmission(bundle, revision, tx as never)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('rejects an authenticated receipt whose recomputed seal names a non-frozen target origin', async () => {
    const fixture = await sessionAtAuthorizedIdp()
    const captured = await completeHumanReturn(fixture)
    const receipt = {
      ...captured.receipt,
      url: 'https://attacker.test/checkout',
      humanReturn: {
        ...captured.receipt.humanReturn!,
        targetUrlHash: canonicalHash('https://attacker.test/checkout'),
      },
    }
    const contentHash = canonicalHash(receipt)
    const tx = {
      ...fixture.db,
      qualityJourneyArtifact: {
        findMany: async () => [{ artifactId: captured.artifactId, contentHash, artifactJson: JSON.stringify(receipt) }],
      },
    }
    const bundle = {
      cycleId: 'cycle-1',
      evidenceReceipts: [{ artifactId: captured.artifactId, contentHash }],
      targetSnapshot: { snapshotId: captured.receipt.snapshotId },
      observations: [
        {
          snapshotId: captured.receipt.snapshotId,
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
    await expect(assertDiscoveryBrowserReceiptAdmission(bundle, revision, tx as never)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})
