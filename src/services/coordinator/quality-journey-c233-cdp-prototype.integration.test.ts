import { createServer, type Server, type IncomingMessage } from 'node:http'
import { createServer as createSecureServer } from 'node:https'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'

// Synthetic, single-page experiment only. This is not a DiscoveryBrowserRuntime and
// must not grant EVERY_HOP qualification to the production context-wide broker.
type RequestFacts = { url: string; method: string; resourceType: string }
type PausedRequest = {
  requestId: string
  request: { url: string; method: string }
  resourceType: string
}

async function interceptPage(
  page: Page,
  allow: (request: RequestFacts) => boolean,
  budget = 16,
  beforeContinue?: (facts: RequestFacts) => Promise<void>,
) {
  const session = await page.context().newCDPSession(page)
  const decisions: Array<RequestFacts & { allowed: boolean }> = []
  let terminal = false
  let remaining = budget
  let finishClosed: () => void = () => undefined
  const closed = new Promise<void>(resolve => {
    finishClosed = resolve
  })
  let closing: Promise<void> | undefined
  const fence = () => {
    terminal = true
    closing ??= page
      .context()
      .close()
      .catch(() => undefined)
      .then(finishClosed)
    return closing
  }
  const handle = async (event: PausedRequest) => {
    // Deliberately do not retain event.request headers, postData, cookies or bodies.
    const facts = { url: event.request.url, method: event.request.method, resourceType: event.resourceType }
    try {
      const allowed = !terminal && remaining-- > 0 && allow(facts)
      decisions.push({ ...facts, allowed })
      if (!allowed) {
        terminal = true
        await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' })
        await fence()
        return
      }
      await beforeContinue?.(facts)
      if (terminal) return
      await session.send('Fetch.continueRequest', { requestId: event.requestId })
    } catch {
      await fence()
    }
  }
  session.on('Fetch.requestPaused', event => {
    void handle(event)
  })
  session.on('close', () => {
    void fence()
  })
  await session.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  return { session, decisions, closed, revoke: fence }
}

type Hit = { path: string; method: string; cookie: string; body: string }
const cleanup: Array<() => Promise<unknown>> = []

afterEach(async () => {
  for (const close of cleanup.reverse()) await close()
  cleanup.length = 0
})

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close(error => (error ? reject(error) : resolve()))
      }),
  )
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected loopback listener')
  return `http://127.0.0.1:${address.port}`
}

// Only synthetic fixture servers call this; never capture human browser inputs.
async function readSyntheticHit(request: IncomingMessage): Promise<Hit> {
  let body = ''
  for await (const chunk of request) body += chunk.toString()
  return {
    path: new URL(request.url ?? '/', 'http://fixture.invalid').pathname,
    method: request.method ?? '',
    cookie: request.headers.cookie ?? '',
    body,
  }
}

async function fixture(status = 302, mode: 'success' | 'denied' | 'loop' = 'success') {
  const hits: Hit[] = []
  let deniedHits = 0
  const deniedOrigin = await listen(
    createServer((_request, response) => {
      deniedHits++
      response.end('Denied destination was contacted')
    }),
  )
  const origin = await listen(
    createServer(async (request, response) => {
      const hit = await readSyntheticHit(request)
      hits.push(hit)
      const pathname = hit.path
      if (pathname === '/checkout') {
        response.setHeader('Content-Type', 'text/html')
        response.end(
          '<link rel="icon" href="data:,"><form method="POST" action="/login"><input name="fixture" value="synthetic-only"><button>Sign in</button></form>',
        )
      } else if (pathname === '/login') {
        response.writeHead(status, {
          Location: '/secure',
          'Set-Cookie': 'synthetic=fixture; HttpOnly; SameSite=Lax; Path=/',
        })
        response.end()
      } else if (pathname === '/secure' && mode === 'denied') {
        response.writeHead(302, { Location: `${deniedOrigin}/denied` })
        response.end()
      } else if (pathname === '/secure' && mode === 'loop') {
        response.writeHead(302, { Location: '/secure' })
        response.end()
      } else {
        response.setHeader('Content-Type', 'text/html')
        response.end('<link rel="icon" href="data:,"><h1>Signed in</h1>')
      }
    }),
  )
  const browser: Browser = await chromium.launch({ headless: true })
  cleanup.push(() => browser.close())
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false })
  const page = await context.newPage()
  const allow = (facts: RequestFacts) => {
    const url = new URL(facts.url)
    return (
      url.origin === origin &&
      ['/checkout', '/login', '/secure'].includes(url.pathname) &&
      ['GET', 'POST'].includes(facts.method) &&
      facts.resourceType === 'Document'
    )
  }
  return { page, origin, hits, allow, deniedOrigin, deniedHits: () => deniedHits }
}

describe('C2.3.3 test-only CDP native redirect experiment', () => {
  it.each([301, 302, 303, 307, 308])(
    'intercepts POST %i follow-up before sending and preserves native cookies/methods',
    async status => {
      const f = await fixture(status)
      const probe = await interceptPage(f.page, f.allow)
      await f.page.goto(`${f.origin}/checkout`)
      await f.page.getByRole('button', { name: 'Sign in' }).click()
      await f.page.waitForURL(`${f.origin}/secure`)
      expect(await f.page.locator('h1').textContent()).toBe('Signed in')
      const method = status === 307 || status === 308 ? 'POST' : 'GET'
      expect(f.hits).toEqual([
        { path: '/checkout', method: 'GET', cookie: '', body: '' },
        { path: '/login', method: 'POST', cookie: '', body: 'fixture=synthetic-only' },
        {
          path: '/secure',
          method,
          cookie: 'synthetic=fixture',
          body: method === 'POST' ? 'fixture=synthetic-only' : '',
        },
      ])
      expect(
        probe.decisions.map(({ url, method, allowed }) => ({ path: new URL(url).pathname, method, allowed })),
      ).toEqual([
        { path: '/checkout', method: 'GET', allowed: true },
        { path: '/login', method: 'POST', allowed: true },
        { path: '/secure', method, allowed: true },
      ])
    },
  )

  it('preserves a Secure HttpOnly cookie through a cross-origin HTTPS login redirect', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'appraise-c233-cdp-'))
    cleanup.push(() => rm(directory, { recursive: true, force: true }))
    const keyPath = join(directory, 'key.pem')
    const certPath = join(directory, 'cert.pem')
    await promisify(execFile)('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=synthetic-cdp-fixture',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ])
    let secureCookie = ''
    const idpOrigin = (
      await listen(
        createSecureServer(
          {
            key: await readFile(keyPath),
            cert: await readFile(certPath),
          },
          (request, response) => {
            if (request.url === '/login' && request.method === 'POST') {
              response.writeHead(303, {
                Location: '/secure',
                'Set-Cookie': 'synthetic=tls; Secure; HttpOnly; SameSite=Lax; Path=/',
              })
              response.end()
            } else {
              secureCookie = request.headers.cookie ?? ''
              response.setHeader('Content-Type', 'text/html')
              response.end('<link rel="icon" href="data:,"><h1>HTTPS success</h1>')
            }
          },
        ),
      )
    ).replace('http:', 'https:')
    const targetOrigin = await listen(
      createServer((_request, response) => {
        response.setHeader('Content-Type', 'text/html')
        response.end(
          `<link rel="icon" href="data:,"><form method="POST" action="${idpOrigin}/login"><button>Sign in</button></form>`,
        )
      }),
    )
    const browser = await chromium.launch({ headless: true })
    cleanup.push(() => browser.close())
    // Self-signed certificate exception is confined to this synthetic test.
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      serviceWorkers: 'block',
      acceptDownloads: false,
    })
    const page = await context.newPage()
    const probe = await interceptPage(
      page,
      facts =>
        facts.resourceType === 'Document' &&
        ((facts.url === `${targetOrigin}/checkout` && facts.method === 'GET') ||
          (facts.url === `${idpOrigin}/login` && facts.method === 'POST') ||
          (facts.url === `${idpOrigin}/secure` && facts.method === 'GET')),
    )
    await page.goto(`${targetOrigin}/checkout`)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(`${idpOrigin}/secure`)
    expect(await page.locator('h1').textContent()).toBe('HTTPS success')
    expect(secureCookie).toBe('synthetic=tls')
    expect(probe.decisions.map(facts => facts.url)).toEqual([
      `${targetOrigin}/checkout`,
      `${idpOrigin}/login`,
      `${idpOrigin}/secure`,
    ])
    expect(probe.decisions.every(facts => facts.allowed)).toBe(true)
  })

  it('blocks the second redirect hop before a different origin receives any request', async () => {
    const f = await fixture(302, 'denied')
    const probe = await interceptPage(f.page, f.allow)
    await f.page.goto(`${f.origin}/checkout`)
    await f.page
      .getByRole('button', { name: 'Sign in' })
      .click()
      .catch(() => undefined)
    await probe.closed
    expect(f.hits.map(hit => hit.path)).toEqual(['/checkout', '/login', '/secure'])
    expect(f.deniedHits()).toBe(0)
    expect(probe.decisions.at(-1)).toMatchObject({ allowed: false, method: 'GET' })
    expect(new URL(probe.decisions.at(-1)!.url).pathname).toBe('/denied')
    expect(f.page.isClosed()).toBe(true)
  })

  it('rechecks redirect method against policy before a preserved POST can reach its destination', async () => {
    const f = await fixture(307)
    const probe = await interceptPage(
      f.page,
      facts => f.allow(facts) && !(new URL(facts.url).pathname === '/secure' && facts.method === 'POST'),
    )
    await f.page.goto(`${f.origin}/checkout`)
    await f.page
      .getByRole('button', { name: 'Sign in' })
      .click()
      .catch(() => undefined)
    await probe.closed
    expect(f.hits.map(hit => hit.path)).toEqual(['/checkout', '/login'])
    expect(probe.decisions.at(-1)).toMatchObject({ method: 'POST', allowed: false })
  })

  it('terminates a redirect loop at the request budget before the next send', async () => {
    const f = await fixture(302, 'loop')
    const probe = await interceptPage(f.page, f.allow, 5)
    await f.page.goto(`${f.origin}/checkout`)
    await f.page
      .getByRole('button', { name: 'Sign in' })
      .click()
      .catch(() => undefined)
    await probe.closed
    expect(f.hits).toHaveLength(5)
    expect(probe.decisions).toHaveLength(6)
    expect(probe.decisions.at(-1)?.allowed).toBe(false)
  })

  it('fences a policy exception before the paused request is sent', async () => {
    const f = await fixture()
    const probe = await interceptPage(f.page, () => {
      throw new Error('Synthetic policy failure')
    })
    await f.page.goto(`${f.origin}/checkout`).catch(() => undefined)
    await probe.closed
    expect(f.hits).toHaveLength(0)
    expect(f.page.isClosed()).toBe(true)
  })

  it('revokes a paused redirect without waiting for a pending CDP detach', async () => {
    const f = await fixture()
    let markPaused: () => void = () => undefined
    const paused = new Promise<void>(resolve => {
      markPaused = resolve
    })
    let release: () => void = () => undefined
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    const probe = await interceptPage(f.page, f.allow, 16, async facts => {
      if (new URL(facts.url).pathname === '/secure') {
        markPaused()
        await held
      }
    })
    await f.page.goto(`${f.origin}/checkout`)
    const click = f.page
      .getByRole('button', { name: 'Sign in' })
      .click()
      .catch(() => undefined)
    try {
      await paused
      expect(f.hits.map(hit => hit.path)).toEqual(['/checkout', '/login'])
      // Playwright detach can wait on Runtime.runIfWaitingForDebugger while a
      // navigation is paused. Explicit revocation must close the context first.
      const detach = probe.session.detach().catch(() => undefined)
      await probe.revoke()
      await detach
      await probe.closed
      expect(f.hits.map(hit => hit.path)).toEqual(['/checkout', '/login'])
    } finally {
      release()
      await click
    }
  })

  it('records the integration blocker: a page-bound gate misses a popup initial request', async () => {
    const f = await fixture()
    const probe = await interceptPage(f.page, f.allow)
    await f.page.goto(`${f.origin}/checkout`)
    const popupCreated = f.page.waitForEvent('popup')
    await f.page.evaluate(url => {
      window.open(url)
    }, `${f.deniedOrigin}/popup`)
    const popup = await popupCreated
    await popup.waitForLoadState('domcontentloaded')
    // This is an expected counterexample, NOT a containment pass. A production
    // backend must intercept or prohibit the initial popup request before contact.
    expect(f.deniedHits()).toBeGreaterThanOrEqual(1)
    expect(probe.decisions.some(facts => facts.url.startsWith(f.deniedOrigin))).toBe(false)
    expect(f.page.isClosed()).toBe(false)
  })

  it('closes the context after CDP detach while idle', async () => {
    const f = await fixture()
    const probe = await interceptPage(f.page, f.allow)
    await f.page.goto(`${f.origin}/checkout`)
    await probe.session.detach()
    await probe.closed
    expect(f.page.isClosed()).toBe(true)
    expect(f.hits.map(hit => hit.path)).toEqual(['/checkout'])
  })
})
