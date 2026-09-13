import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertDiscoveryBrowserReceiptAdmission,
  captureQualityJourneyDiscoveryBrowserReceipt,
  clearQualityJourneyDiscoveryBrowserSessionsForTest,
  confirmQualityJourneyDiscoveryBrowserAccess,
  markQualityJourneyDiscoveryBrowserMissingAccess,
  getQualityJourneyDiscoveryBrowserSession,
  logoutQualityJourneyDiscoveryBrowserSession,
  replaceQualityJourneyDiscoveryBrowserContext,
  revokeQualityJourneyDiscoveryBrowserSession,
  startQualityJourneyDiscoveryBrowserSession,
  type DiscoveryBrowserRuntime,
} from './quality-journey-discovery-browser-service'

function browserRuntime(title = 'Checkout', onClose = () => undefined): DiscoveryBrowserRuntime {
  let url = 'about:blank'
  return {
    async launch() {
      return {
        async newContext() {
          return {
            route: async () => undefined,
            routeWebSocket: async () => undefined,
            async newPage() {
              return {
                async goto(next) {
                  url = next
                },
                url: () => url,
                title: async () => title,
                on: () => undefined,
                close: async () => undefined,
              }
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
  const environmentId = options.environmentId ?? 'environment-1'
  const baseUrl = options.baseUrl ?? 'https://example.test'
  return {
    artifacts,
    blockerUpdates,
    authority,
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
        }),
      }),
    },
    environment: {
      findFirst: async () => ({ id: environmentId, baseUrl, targetProjectId: 'target-1' }),
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
    const session = await startQualityJourneyDiscoveryBrowserSession(
      {
        ...scope,
        workItemId: 'work-1',
        environmentId: 'environment-1',
        routeId: '/checkout',
        accessMode: 'AUTHENTICATED_INTENT',
      },
      db as never,
      browserRuntime(),
    )
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...scope, sessionId: session.id, snapshotId: 'snapshot-1' },
        db as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await confirmQualityJourneyDiscoveryBrowserAccess({ ...scope, sessionId: session.id }, db as never)
    expect(db.blockerUpdates).toEqual([
      expect.objectContaining({
        where: expect.objectContaining({
          id: expect.stringMatching(/^qjdb_blocker_/),
          reasonCode: 'DISCOVERY_MISSING_ACCESS',
        }),
      }),
    ])
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

  it('invalidates expired, logged-out, revoked, and replaced contexts', async () => {
    const db = client()
    const input = {
      ...scope,
      workItemId: 'work-1',
      environmentId: 'environment-1',
      routeId: '/checkout',
      accessMode: 'AUTHENTICATED_INTENT' as const,
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
                return {
                  async goto(next) {
                    url = next
                  },
                  url: () => url,
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
    await startQualityJourneyDiscoveryBrowserSession(
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
      fetch: async () => ({ headers: () => ({ location: 'https://attacker.test/redirected' }) }),
      fulfill,
    })
    expect(redirectAbort).toHaveBeenCalledOnce()
    expect(fulfill).not.toHaveBeenCalled()

    const closeSocket = vi.fn()
    await webSocketHandler?.({ url: () => 'wss://attacker.test/socket', close: closeSocket })
    expect(closeSocket).toHaveBeenCalledWith({ code: 1008, reason: 'Journey browser policy denied WebSocket' })
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
