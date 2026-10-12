import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { chromium } from 'playwright'
import {
  captureQualityJourneyDiscoveryBrowserReceipt,
  clearQualityJourneyDiscoveryBrowserSessionsForTest,
  getQualityJourneyDiscoveryBrowserSession,
  startQualityJourneyDiscoveryBrowserSession,
  type DiscoveryBrowserRuntime,
} from '@/services/coordinator/quality-journey-discovery-browser-service'
import { discoveryAuthTransitPolicyHash } from '@/lib/quality-journey/discovery-auth-transit-policy'
import { ownedBrowserLedgerFixture } from './owned-browser-ledger-fixture'

const sessionScope = {
  journeyId: 'c233-restart-journey',
  targetProjectId: 'c233-restart-target',
  discoveryRevisionId: 'c233-restart-revision',
}

type OwnerMessage = { phase: 'GRACEFUL_SHUTDOWN' }
type ObserverMessage = {
  phase: 'VERIFY_OLD_SCOPE'
  scope: typeof sessionScope & { sessionId: string }
}

type OwnerResult =
  | { phase: 'OWNER_READY'; scope: typeof sessionScope & { sessionId: string }; browserPid: number }
  | { phase: 'GRACEFUL_CLEANUP_COMPLETE'; browserPid: number; browserProcess: 'CLOSED' }
  | { phase: 'OWNER_FAILED'; code: 'INITIALIZATION_FAILED' | 'CLEANUP_FAILED' }
type ObserverResult =
  | { phase: 'OLD_SCOPE_REJECTED'; lookup: 'NOT_FOUND'; capture: 'NOT_FOUND' }
  | { phase: 'OBSERVER_FAILED'; code: 'OLD_SCOPE_WAS_AVAILABLE' | 'UNEXPECTED_LOOKUP_FAILURE' }

function send(message: OwnerResult | ObserverResult) {
  process.send?.(message)
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

async function waitForBrowserExit(pid: number, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return true
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  return !processIsAlive(pid)
}

async function closeServer(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
}

function frozenDb(baseUrl: string) {
  const environmentId = 'c233-restart-environment'
  const binding = {
    environmentId,
    targetOrigin: new URL(baseUrl).origin,
    scopeVersion: 1,
    discoveryAuthTransitPolicyJson: null,
    discoveryAuthTransitPolicyHash: discoveryAuthTransitPolicyHash(null),
  }
  return {
    ...ownedBrowserLedgerFixture(),
    qualityJourney: {
      findFirst: async () => ({
        id: sessionScope.journeyId,
        stage: 'DISCOVERY',
        status: 'ACTIVE',
        activeDiscoveryRevisionId: sessionScope.discoveryRevisionId,
        activeCycleId: 'c233-restart-cycle',
      }),
      updateMany: async () => ({ count: 1 }),
    },
    qualityJourneyDiscoveryRevision: {
      findFirst: async () => ({
        id: sessionScope.discoveryRevisionId,
        journeyId: sessionScope.journeyId,
        targetProjectId: sessionScope.targetProjectId,
        cycleId: 'c233-restart-cycle',
        scoutWorkItemId: 'c233-restart-work-item',
        scoutScopeJson: JSON.stringify({
          environmentIds: [environmentId],
          routes: ['/checkout'],
          environmentBindings: [binding],
        }),
      }),
    },
    environment: {
      findFirst: async () => ({
        id: environmentId,
        targetProjectId: sessionScope.targetProjectId,
        baseUrl,
        scopeVersion: 1,
        discoveryAuthTransitPolicyJson: null,
      }),
    },
  }
}

function realChromiumRuntime(onBrowserPid: (pid: number) => void): DiscoveryBrowserRuntime {
  return {
    async launch() {
      const server = await chromium.launchServer({ headless: true })
      const pid = server.process()?.pid
      if (!pid) {
        await server.close()
        throw new Error('Chromium launch server did not expose its process identifier.')
      }
      onBrowserPid(pid)
      const browser = await chromium.connect(server.wsEndpoint())
      return {
        async newContext(options) {
          const context = await browser.newContext(options)
          return {
            newPage: async () => {
              const page = await context.newPage()
              return {
                goto: (url, options) => page.goto(url, options),
                url: () => page.url(),
                mainFrame: () => page.mainFrame(),
                title: () => page.title(),
                on: (event, listener) => page.on(event as never, listener as never),
                isClosed: () => page.isClosed(),
                close: () => page.close(),
              }
            },
            route: (pattern, handler) => context.route(pattern, route => handler(route as never)),
            routeWebSocket: (pattern, handler) => context.routeWebSocket(pattern, route => handler(route as never)),
            on: (event, listener) => context.on(event as never, listener as never),
            close: () => context.close(),
          }
        },
        isConnected: () => browser.isConnected(),
        on: (event, listener) => browser.on(event as never, listener as never),
        async close() {
          await Promise.allSettled([browser.close(), server.close()])
        },
      }
    },
  }
}

async function runOwner() {
  let browserPid: number | undefined
  const checkout = createServer((_request, response) => {
    response.writeHead(200)
    response.end()
  })
  try {
    await new Promise<void>((resolve, reject) => {
      checkout.once('error', reject)
      checkout.listen(0, '127.0.0.1', () => resolve())
    })
    const address = checkout.address() as AddressInfo | null
    if (!address) throw new Error('Synthetic checkout fixture did not bind.')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const runtime = realChromiumRuntime(pid => {
      browserPid = pid
    })
    const session = await startQualityJourneyDiscoveryBrowserSession(
      {
        ...sessionScope,
        workItemId: 'c233-restart-work-item',
        environmentId: 'c233-restart-environment',
        routeId: '/checkout',
        accessMode: 'ANONYMOUS',
        ttlSeconds: 30,
      },
      frozenDb(baseUrl) as never,
      runtime,
    )
    if (!browserPid) throw new Error('Chromium process identifier was unavailable after session startup.')
    send({ phase: 'OWNER_READY', scope: { ...sessionScope, sessionId: session.id }, browserPid })

    await new Promise<void>(resolve => {
      const onMessage = (message: OwnerMessage) => {
        if (message?.phase !== 'GRACEFUL_SHUTDOWN') return
        process.off('message', onMessage)
        resolve()
      }
      process.on('message', onMessage)
    })
    await clearQualityJourneyDiscoveryBrowserSessionsForTest()
    if (!(await waitForBrowserExit(browserPid))) {
      send({ phase: 'OWNER_FAILED', code: 'CLEANUP_FAILED' })
      return
    }
    send({ phase: 'GRACEFUL_CLEANUP_COMPLETE', browserPid, browserProcess: 'CLOSED' })
  } catch {
    send({ phase: 'OWNER_FAILED', code: 'INITIALIZATION_FAILED' })
  } finally {
    await clearQualityJourneyDiscoveryBrowserSessionsForTest()
    if (checkout.listening) await closeServer(checkout).catch(() => undefined)
    process.disconnect?.()
  }
}

function notFound(error: unknown) {
  return (error as { code?: unknown })?.code === 'NOT_FOUND'
}

async function runFreshObserver() {
  await new Promise<void>(resolve => {
    const onMessage = async (message: ObserverMessage) => {
      if (message?.phase !== 'VERIFY_OLD_SCOPE') return
      process.off('message', onMessage)
      try {
        const lookup = await getQualityJourneyDiscoveryBrowserSession(message.scope)
          .then(() => 'AVAILABLE' as const)
          .catch(error => (notFound(error) ? ('NOT_FOUND' as const) : ('FAILED' as const)))
        const capture = await captureQualityJourneyDiscoveryBrowserReceipt({
          ...message.scope,
          snapshotId: `c233-restart-${randomUUID()}`,
        })
          .then(() => 'AVAILABLE' as const)
          .catch(error => (notFound(error) ? ('NOT_FOUND' as const) : ('FAILED' as const)))
        if (lookup === 'NOT_FOUND' && capture === 'NOT_FOUND') send({ phase: 'OLD_SCOPE_REJECTED', lookup, capture })
        else if (lookup === 'AVAILABLE' || capture === 'AVAILABLE')
          send({ phase: 'OBSERVER_FAILED', code: 'OLD_SCOPE_WAS_AVAILABLE' })
        else send({ phase: 'OBSERVER_FAILED', code: 'UNEXPECTED_LOOKUP_FAILURE' })
      } finally {
        process.disconnect?.()
        resolve()
      }
    }
    process.on('message', onMessage)
  })
}

if (process.argv[2] === 'fresh-observer') void runFreshObserver()
else void runOwner()
