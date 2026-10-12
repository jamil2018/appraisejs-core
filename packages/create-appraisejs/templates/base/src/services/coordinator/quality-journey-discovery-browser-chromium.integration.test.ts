import { execFile as execFileCallback } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server as HttpServer, type ServerResponse } from 'node:http'
import { createServer as createSecureServer, type Server as HttpsServer } from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest'
import { chromium, type Browser as PlaywrightBrowser, type Page as PlaywrightPage } from 'playwright'
import {
  authorizeQualityJourneyDiscoveryBrowserExactReturn,
  clearQualityJourneyDiscoveryBrowserSessionsForTest,
  getQualityJourneyDiscoveryBrowserSession,
  startQualityJourneyDiscoveryBrowserSession,
  type DiscoveryBrowserRuntime,
} from './quality-journey-discovery-browser-service'
import { discoveryAuthTransitPolicyHash } from '@/lib/quality-journey/discovery-auth-transit-policy'
import { ownedBrowserLedgerFixture } from '@/test/owned-browser-ledger-fixture'

const execFile = promisify(execFileCallback)
const scope = { journeyId: 'journey-1', targetProjectId: 'target-1', discoveryRevisionId: 'revision-1' }

type LoginResult = { status: 200 | 302 | 303; location: '/denied' | '/login' | '/secure'; setSyntheticCookie?: boolean }
type TestServers = {
  targetUrl: string
  idpUrl: string
  requests: {
    checkout: number
    loginGet: number
    loginPost: number
    secure: number
    denied: number
    secureCookies: string[]
  }
  close(): Promise<void>
}

let certificateDirectory = ''
let certificate = ''
let privateKey = ''

function authPolicy(idpUrl: string) {
  return JSON.stringify({
    schemaVersion: 'appraise.discovery-auth-transit/v1',
    flows: [
      {
        flowId: 'test-login',
        rules: [
          {
            documentOrigin: '$TARGET',
            destinationOrigin: idpUrl,
            path: { match: 'EXACT', value: '/login' },
            methods: ['GET'],
            requestKinds: ['DOCUMENT'],
          },
          {
            documentOrigin: idpUrl,
            destinationOrigin: idpUrl,
            path: { match: 'EXACT', value: '/login' },
            methods: ['GET', 'POST'],
            requestKinds: ['DOCUMENT'],
          },
          {
            documentOrigin: idpUrl,
            destinationOrigin: idpUrl,
            path: { match: 'EXACT', value: '/secure' },
            methods: ['GET'],
            requestKinds: ['DOCUMENT'],
          },
        ],
        returns: [{ fromOrigin: idpUrl, targetPath: '/checkout', methods: ['GET'] }],
      },
    ],
  })
}

function mockClient(baseUrl: string, authPolicyJson: string) {
  const ownedBrowsers = ownedBrowserLedgerFixture()
  const frozenBinding = {
    environmentId: 'environment-1',
    targetOrigin: new URL(baseUrl).origin,
    scopeVersion: 1,
    discoveryAuthTransitPolicyJson: authPolicyJson,
    discoveryAuthTransitPolicyHash: discoveryAuthTransitPolicyHash(authPolicyJson),
  }
  return {
    ...ownedBrowsers,
    qualityJourney: {
      findFirst: async () => ({
        id: 'journey-1',
        stage: 'DISCOVERY',
        status: 'ACTIVE',
        activeDiscoveryRevisionId: 'revision-1',
        activeCycleId: 'cycle-1',
      }),
      updateMany: async () => ({ count: 1 }),
    },
    qualityJourneyDiscoveryRevision: {
      findFirst: async () => ({
        id: 'revision-1',
        journeyId: 'journey-1',
        targetProjectId: 'target-1',
        cycleId: 'cycle-1',
        scoutWorkItemId: 'work-1',
        scoutScopeJson: JSON.stringify({
          environmentIds: ['environment-1'],
          routes: ['/checkout'],
          environmentBindings: [frozenBinding],
        }),
      }),
    },
    environment: {
      findFirst: async () => ({
        id: 'environment-1',
        baseUrl,
        targetProjectId: 'target-1',
        scopeVersion: 1,
        discoveryAuthTransitPolicyJson: authPolicyJson,
      }),
    },
  }
}

function listen(server: HttpServer | HttpsServer) {
  return new Promise<number>((resolve, reject) => {
    const rejectOnce = (error: Error) => reject(error)
    server.once('error', rejectOnce)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectOnce)
      const address = server.address()
      if (!address || typeof address === 'string')
        return reject(new Error('Loopback server did not expose a TCP port.'))
      resolve(address.port)
    })
  })
}

function closeServer(server: HttpServer | HttpsServer) {
  return new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
}

function respondToLoginPost(response: ServerResponse, result: LoginResult | undefined) {
  if (!result) throw new Error('Unexpected additional login submission.')
  response.writeHead(result.status, {
    'content-type': 'text/html',
    ...(result.status === 200 ? {} : { location: result.location }),
    ...(result.setSyntheticCookie
      ? { 'set-cookie': 'synthetic-idp-session=approved; Secure; HttpOnly; SameSite=Lax; Path=/' }
      : {}),
  })
  response.end(
    result.status === 200
      ? '<a id="secure" href="/secure">Continue</a><form method="post" action="/login"><button id="submit">Retry</button></form>'
      : '',
  )
}

async function startServers(loginResults: LoginResult[], redirectSecureToDenied = false): Promise<TestServers> {
  const requests = { checkout: 0, loginGet: 0, loginPost: 0, secure: 0, denied: 0, secureCookies: [] as string[] }
  const remainingResults = [...loginResults]
  let idpUrl = ''
  const idp = createSecureServer({ cert: certificate, key: privateKey }, (request, response) => {
    const route = `${request.method} ${request.url}`
    if (route === 'GET /login') {
      requests.loginGet += 1
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('<form method="post" action="/login"><button id="submit" type="submit">Sign in</button></form>')
      return
    }
    if (route === 'POST /login') {
      requests.loginPost += 1
      respondToLoginPost(response, remainingResults.shift())
      return
    }
    if (route === 'GET /secure') {
      requests.secure += 1
      requests.secureCookies.push(request.headers.cookie ?? '')
      if (redirectSecureToDenied) {
        response.writeHead(302, { location: '/denied' }).end()
        return
      }
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('<h1>Signed in</h1>')
      return
    }
    if (route === 'GET /denied') {
      requests.denied += 1
      response.writeHead(204)
      response.end()
      return
    }
    response.writeHead(404)
    response.end()
  })
  const idpPort = await listen(idp)
  idpUrl = `https://127.0.0.1:${idpPort}`

  const target = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/checkout') {
      requests.checkout += 1
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(`<a id="sign-in" href="${idpUrl}/login">Sign in</a>`)
      return
    }
    response.writeHead(404)
    response.end()
  })
  const targetPort = await listen(target)
  return {
    targetUrl: `http://127.0.0.1:${targetPort}`,
    idpUrl,
    requests,
    async close() {
      await Promise.all([closeServer(target), closeServer(idp)])
    },
  }
}

function realChromiumRuntime(onPage: (page: PlaywrightPage) => void, onBrowser: (browser: PlaywrightBrowser) => void) {
  const runtime: DiscoveryBrowserRuntime = {
    async launch() {
      const browser = await chromium.launch({ headless: true })
      onBrowser(browser)
      return {
        async newContext() {
          const context = await browser.newContext({
            acceptDownloads: false,
            serviceWorkers: 'block',
            ignoreHTTPSErrors: true,
          })
          return {
            async newPage() {
              const page = await context.newPage()
              onPage(page)
              return page as never
            },
            route: (pattern, handler) => context.route(pattern, route => handler(route as never)),
            routeWebSocket: (pattern, handler) => context.routeWebSocket(pattern, route => handler(route as never)),
            on: (event, listener) => context.on(event, listener),
            close: () => context.close(),
            isClosed: () => !browser.isConnected(),
          }
        },
        on: (event, listener) => browser.on(event, listener),
        close: () => browser.close(),
        isConnected: () => browser.isConnected(),
      }
    },
  }
  return runtime
}

async function startSession(servers: TestServers) {
  let page: PlaywrightPage | undefined
  let browser: PlaywrightBrowser | undefined
  const session = await startQualityJourneyDiscoveryBrowserSession(
    {
      ...scope,
      workItemId: 'work-1',
      environmentId: 'environment-1',
      routeId: '/checkout',
      accessMode: 'AUTHENTICATED_INTENT',
      authFlowId: 'test-login',
    },
    mockClient(servers.targetUrl, authPolicy(servers.idpUrl)) as never,
    realChromiumRuntime(
      next => (page = next),
      next => (browser = next),
    ),
  )
  if (!page || !browser) throw new Error('Real Chromium runtime did not create a browser page.')
  await page.waitForURL(`${servers.targetUrl}/checkout`)
  await page.locator('#sign-in').click()
  await page.waitForURL(`${servers.idpUrl}/login`)
  return { session, page, browser }
}

beforeAll(async () => {
  certificateDirectory = await mkdtemp(path.join(os.tmpdir(), 'appraise-c233-cert-'))
  const certificatePath = path.join(certificateDirectory, 'certificate.pem')
  const keyPath = path.join(certificateDirectory, 'key.pem')
  await execFile('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certificatePath,
    '-days',
    '1',
    '-subj',
    `/CN=appraise-c233-${randomUUID()}`,
    '-addext',
    'subjectAltName=IP:127.0.0.1',
  ])
  ;[certificate, privateKey] = await Promise.all([readFile(certificatePath, 'utf8'), readFile(keyPath, 'utf8')])
})

afterEach(async () => {
  await clearQualityJourneyDiscoveryBrowserSessionsForTest()
})

afterAll(async () => {
  if (certificateDirectory) await rm(certificateDirectory, { recursive: true, force: true })
})

describe('Quality Journey discovery browser Chromium containment', () => {
  for (const status of [302, 303] as const) {
    for (const location of ['/login', '/secure'] as const) {
      it(`rejects ${status} to ${location} before Chromium can follow an uninspectable redirect`, async () => {
        const servers = await startServers([{ status, location, setSyntheticCookie: true }])
        try {
          const { page, session } = await startSession(servers)
          await page
            .locator('#submit')
            .click()
            .catch(() => undefined)
          expect(servers.requests).toMatchObject({ loginGet: 1, loginPost: 1, secure: 0 })
          await expect(
            getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
          ).resolves.toMatchObject({ state: 'REVOKED' })
        } finally {
          await servers.close()
        }
      })
    }
  }

  it('preserves synthetic browser cookies across nonredirect POST and separately intercepted navigation', async () => {
    const servers = await startServers([{ status: 200, location: '/secure', setSyntheticCookie: true }])
    try {
      const { page, session } = await startSession(servers)
      await page.locator('#submit').click()
      await page.locator('#secure').click()
      await page.waitForURL(`${servers.idpUrl}/secure`)
      expect(servers.requests).toMatchObject({ loginGet: 1, loginPost: 1, secure: 1 })
      expect(servers.requests.secureCookies).toEqual([expect.stringContaining('synthetic-idp-session=approved')])
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({ state: 'ACTIVE' })
    } finally {
      await servers.close()
    }
  })

  it('uses the existing owned Chromium page for a scoped exact return and resolves only after the main-frame commit', async () => {
    const servers = await startServers([{ status: 200, location: '/secure', setSyntheticCookie: true }])
    try {
      const { page, session } = await startSession(servers)
      await page.locator('#submit').click()
      await page.locator('#secure').click()
      await page.waitForURL(`${servers.idpUrl}/secure`)

      const returned = await authorizeQualityJourneyDiscoveryBrowserExactReturn(
        { ...scope, sessionId: session.id },
        mockClient(servers.targetUrl, authPolicy(servers.idpUrl)) as never,
      )

      expect(returned).toMatchObject({
        return: 'RETURN_COMMITTED',
        session: { state: 'ACTIVE', currentUrl: `${servers.targetUrl}/checkout` },
      })
      expect(returned).not.toHaveProperty('returnUrl')
      expect(JSON.stringify(returned)).not.toContain(servers.idpUrl)
      expect(await page.url()).toBe(`${servers.targetUrl}/checkout`)
      expect(servers.requests).toMatchObject({ checkout: 2, loginGet: 1, loginPost: 1, secure: 1 })
      await expect(
        authorizeQualityJourneyDiscoveryBrowserExactReturn(
          { ...scope, sessionId: session.id },
          mockClient(servers.targetUrl, authPolicy(servers.idpUrl)) as never,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({
        state: 'REVOKED',
      })
    } finally {
      await servers.close()
    }
  })

  it('aborts a denied destination before its loopback server observes a request', async () => {
    const servers = await startServers([])
    try {
      const { page, session } = await startSession(servers)
      await expect(page.goto(`${servers.idpUrl}/denied`)).rejects.toThrow()
      expect(servers.requests.denied).toBe(0)
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({
        state: 'ACTIVE',
      })
    } finally {
      await servers.close()
    }
  })

  it('does not contact an unauthorized second redirect destination after a permitted login POST', async () => {
    const servers = await startServers([{ status: 302, location: '/secure' }], true)
    try {
      const { page, session } = await startSession(servers)
      await page
        .locator('#submit')
        .click()
        .catch(() => undefined)

      expect(servers.requests).toMatchObject({ loginPost: 1, secure: 0, denied: 0 })
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({
        state: 'REVOKED',
      })
    } finally {
      await servers.close()
    }
  })

  it('marks a session closed when its real Chromium page is closed externally', async () => {
    const servers = await startServers([])
    try {
      const { page, session } = await startSession(servers)
      await page.close()
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({
        state: 'CLOSED',
      })
    } finally {
      await servers.close()
    }
  })

  it('marks a session closed when its real Chromium browser disconnects externally', async () => {
    const servers = await startServers([])
    try {
      const { browser, session } = await startSession(servers)
      await browser.close()
      await expect(
        getQualityJourneyDiscoveryBrowserSession({ ...scope, sessionId: session.id }),
      ).resolves.toMatchObject({
        state: 'CLOSED',
      })
    } finally {
      await servers.close()
    }
  })
})
