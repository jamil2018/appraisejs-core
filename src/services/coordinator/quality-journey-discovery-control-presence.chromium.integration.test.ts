import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { productionFixtureClient, productionScope } from '@/test/c233-production-fixture'
import {
  captureQualityJourneyDiscoveryBrowserReceipt,
  clearQualityJourneyDiscoveryBrowserSessionsForTest,
  startQualityJourneyDiscoveryBrowserSession,
  type DiscoveryBrowserRuntime,
} from './quality-journey-discovery-browser-service'
import { createQualityJourneyDiscoveryBrowserRuntime } from './quality-journey-discovery-browser-runtime'
import { launchDiscoveryBrowserTransport } from './quality-journey-discovery-browser-transport'
import { discoveryControlPresenceExpression } from './quality-journey-discovery-control-presence'

const servers: Server[] = []
const clients: ReturnType<typeof productionFixtureClient>[] = []
afterEach(async () => {
  try {
    await clearQualityJourneyDiscoveryBrowserSessionsForTest()
    for (const client of clients.splice(0))
      for (const row of client.ownedBrowsers.values()) expect(row.status).toBe('STOP_OBSERVED')
  } finally {
    await Promise.all(
      servers.splice(0).map(
        server =>
          new Promise<void>((resolve, reject) => {
            if (!server.listening) return resolve()
            server.closeAllConnections()
            server.close(error => (error ? reject(error) : resolve()))
          }),
      ),
    )
  }
}, 50000)

async function fixture(replaceDuringCapture = false) {
  const server = createServer((_request, response) =>
    response
      .writeHead(200, { 'content-type': 'text/html' })
      .end(
        '<!doctype html><link rel="icon" href="data:,"><title>PRIVATE_TITLE_CANARY</title><h1>PRIVATE_HEADING_CANARY</h1><form><input type="email" value="PRIVATE_EMAIL_CANARY"><input type="password" value="PRIVATE_PASSWORD_CANARY"><button type="submit">PRIVATE_BUTTON_CANARY</button><input type="text" value="PRIVATE_OTHER_CANARY"></form>',
      ),
  )
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Disposable fixture server unavailable')
  const origin = `http://127.0.0.1:${address.port}`
  const client = productionFixtureClient(
    origin,
    JSON.stringify({ schemaVersion: 'appraise.discovery-auth-transit/v1', flows: [] }),
  )
  clients.push(client)
  let page: { goto(url: string, options: { waitUntil: 'domcontentloaded' }): Promise<unknown> } | undefined
  let replaced = false
  const base = createQualityJourneyDiscoveryBrowserRuntime({
    headless: true,
    transportFactory: async () => {
      const transport = await launchDiscoveryBrowserTransport(true)
      return {
        ...transport,
        async send<T>(method: string, params: object = {}, sessionId?: string): Promise<T> {
          const result = await transport.send<T>(method, params, sessionId)
          if (
            replaceDuringCapture &&
            !replaced &&
            method === 'Runtime.evaluate' &&
            (params as { expression?: string }).expression === discoveryControlPresenceExpression
          ) {
            replaced = true
            await page!.goto(`${origin}/checkout`, { waitUntil: 'domcontentloaded' })
          }
          return result
        },
      }
    },
  })
  const runtime: DiscoveryBrowserRuntime = {
    ...base,
    async launch() {
      const browser = await base.launch()
      return {
        ...browser,
        async newContext(options) {
          const context = await browser.newContext(options)
          return {
            route: context.route.bind(context),
            routeWebSocket: context.routeWebSocket.bind(context),
            on: context.on.bind(context),
            close: context.close.bind(context),
            async newPage() {
              const current = await context.newPage()
              page = current
              return current
            },
          }
        },
      }
    },
  }
  const session = await startQualityJourneyDiscoveryBrowserSession(
    {
      ...productionScope,
      workItemId: 'work-1',
      environmentId: 'environment-1',
      routeId: '/checkout',
      accessMode: 'ANONYMOUS',
    },
    client as never,
    runtime,
  )
  return { client, session, replaced: () => replaced }
}

describe('real Chromium fixed Discovery control-presence receipts', { timeout: 120000 }, () => {
  it('captures real visible control categories without persisting target values or text', async () => {
    const f = await fixture()
    const captured = await captureQualityJourneyDiscoveryBrowserReceipt(
      { ...productionScope, sessionId: f.session.id, snapshotId: 'real-control-presence' },
      f.client as never,
    )
    expect(captured.receipt.observationFacts).toEqual(
      expect.arrayContaining([
        'Appraise observed a visible email input in the captured target document.',
        'Appraise observed a visible password input in the captured target document.',
        'Appraise observed a visible submit control in the captured target document.',
        'Appraise observed a visible heading in the captured target document.',
      ]),
    )
    expect(JSON.stringify(captured)).not.toContain('PRIVATE_')
    expect([...f.client.artifacts.values()].map(artifact => artifact.artifactJson).join()).not.toContain('PRIVATE_')
  })
  it('refuses a genuine same-URL document swap after extraction and publishes no receipt', async () => {
    const f = await fixture(true)
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt(
        { ...productionScope, sessionId: f.session.id, snapshotId: 'replaced-control-presence' },
        f.client as never,
      ),
    ).rejects.toThrow()
    expect(f.replaced()).toBe(true)
    expect(f.client.artifacts.size).toBe(0)
  })
})
