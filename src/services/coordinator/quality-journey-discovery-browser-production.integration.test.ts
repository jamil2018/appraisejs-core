import { afterEach, describe, expect, it } from 'vitest'
import { access } from 'node:fs/promises'
import {
  armQualityJourneyDiscoveryBrowserHumanReturn,
  assertDiscoveryBrowserReceiptAdmission,
  captureQualityJourneyDiscoveryBrowserReceipt,
  clearQualityJourneyDiscoveryBrowserSessionsForTest,
  confirmQualityJourneyDiscoveryBrowserAccess,
  getQualityJourneyDiscoveryBrowserSession,
  revokeQualityJourneyDiscoveryBrowserSession,
  startQualityJourneyDiscoveryBrowserSession,
} from './quality-journey-discovery-browser-service'
import { createQualityJourneyDiscoveryBrowserRuntime } from './quality-journey-discovery-browser-runtime'
import { launchDiscoveryBrowserTransport } from './quality-journey-discovery-browser-transport'
import { productionFixtureClient, productionFixtureServers, productionScope } from '@/test/c233-production-fixture'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  await clearQualityJourneyDiscoveryBrowserSessionsForTest()
  for (const close of cleanup.splice(0).reverse()) await close()
})

describe('owned discovery browser transport', () => {
  it('releases its process and profile after pipe loss before runtime registration', async () => {
    const transport = await launchDiscoveryBrowserTransport(true)
    cleanup.push(transport.close)
    const profileDirectory = transport.profileDirectory
    transport.breakPipe()
    await expect
      .poll(async () =>
        access(profileDirectory).then(
          () => false,
          () => true,
        ),
      )
      .toBe(true)
    expect(transport.isConnected()).toBe(false)
  })
})

async function fixture(
  headless: boolean,
  configure?: (servers: Awaited<ReturnType<typeof productionFixtureServers>>) => void,
  delayWebSocketObservation = false,
) {
  const servers = await productionFixtureServers()
  cleanup.push(servers.close)
  configure?.(servers)
  const client = productionFixtureClient(servers.targetOrigin, servers.policy)
  let transport!: Awaited<ReturnType<typeof launchDiscoveryBrowserTransport>>
  let seedSession = ''
  const targetTypes: string[] = []
  const attachmentPauses: boolean[] = []
  const redirectPauses: Array<{ requestId: string; networkId?: string; responseStatusCode?: number; path?: string }> =
    []
  let holdRedirectContinuations = false
  const pendingRedirectContinuations: Array<() => void> = []
  const trace: string[] = []
  const runtime = createQualityJourneyDiscoveryBrowserRuntime({
    headless,
    transportFactory: async () => {
      transport = await launchDiscoveryBrowserTransport(headless)
      cleanup.push(transport.close)
      // Disposable fixture certificates only; never configured by the production default.
      await transport.send('Security.setIgnoreCertificateErrors', { ignore: true })
      return {
        ...transport,
        async send<T>(method: string, params?: object, sessionId?: string): Promise<T> {
          trace.push(method)
          try {
            if (method === 'Fetch.continueResponse' && holdRedirectContinuations)
              await new Promise<void>(resolve => pendingRedirectContinuations.push(resolve))
            const result = await transport.send<T>(method, params, sessionId)
            if (method === 'Page.getFrameTree') {
              const walk = (tree: { frame: { url: string; securityOrigin?: string }; childFrames?: unknown[] }) => {
                const origin = tree.frame.securityOrigin
                trace.push(
                  `frame-origin:${origin === servers.targetOrigin ? 'target' : origin === servers.idpOrigin ? 'idp' : origin === '' ? 'empty' : origin === undefined ? 'missing' : 'opaque-or-other'}`,
                )
                for (const child of tree.childFrames ?? []) walk(child as typeof tree)
              }
              walk((result as { frameTree: Parameters<typeof walk>[0] }).frameTree)
            }
            return result
          } catch (error) {
            trace.push(`FAILED:${method}`)
            throw error
          }
        },
        events(handler) {
          transport.events(event => {
            if (
              [
                'Target.attachedToTarget',
                'Target.detachedFromTarget',
                'Fetch.requestPaused',
                'Page.frameNavigated',
              ].includes(event.method)
            )
              trace.push(event.method)
            if (event.method === 'Fetch.requestPaused') {
              const requestId = event.params.requestId
              const networkId = event.params.networkId
              const responseStatusCode = event.params.responseStatusCode
              const requestUrl = (event.params.request as { url?: unknown } | undefined)?.url
              let path: string | undefined
              if (typeof requestUrl === 'string') {
                try {
                  path = new URL(requestUrl).pathname
                } catch {
                  path = undefined
                }
              }
              if (typeof requestId === 'string')
                redirectPauses.push({
                  requestId,
                  ...(typeof networkId === 'string' ? { networkId } : {}),
                  ...(typeof responseStatusCode === 'number' ? { responseStatusCode } : {}),
                  ...(path ? { path } : {}),
                })
            }
            if (event.method === 'Target.attachedToTarget') {
              targetTypes.push(String((event.params.targetInfo as { type: string }).type))
              attachmentPauses.push(event.params.waitingForDebugger === true)
              if (!seedSession) seedSession = String(event.params.sessionId)
            }
            if (
              delayWebSocketObservation &&
              (event.method === 'Network.webSocketCreated' || event.method === 'Runtime.bindingCalled')
            ) {
              const timer = setTimeout(() => handler(event), 300)
              cleanup.push(async () => clearTimeout(timer))
            } else handler(event)
          })
        },
      }
    },
  })
  const session = await startQualityJourneyDiscoveryBrowserSession(
    {
      ...productionScope,
      workItemId: 'work-1',
      environmentId: 'environment-1',
      routeId: '/checkout',
      accessMode: 'AUTHENTICATED_INTENT',
      authFlowId: 'test-login',
    },
    client as never,
    runtime,
  ).catch(error => {
    throw new Error(`Fixture startup failed: ${trace.join(', ')}`, { cause: error })
  })
  const identity = { ...productionScope, sessionId: session.id }
  const evaluate = async (expression: string) => {
    const result = await transport.send<{ result: { value?: unknown } }>(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      seedSession,
    )
    return result.result.value
  }
  const navigate = async (url: string) => {
    await transport.send('Page.navigate', { url }, seedSession)
    await expect.poll(() => evaluate('location.href')).toBe(url)
  }
  return {
    servers,
    client,
    session,
    identity,
    evaluate,
    navigate,
    transport,
    targetTypes,
    attachmentPauses,
    redirectPauses,
    holdRedirectContinuations: () => {
      holdRedirectContinuations = true
    },
    releaseRedirectContinuations: () => {
      holdRedirectContinuations = false
      for (const release of pendingRedirectContinuations.splice(0)) release()
    },
    trace,
  }
}

describe.each([true, false])('production discovery CDP adapter (headless=%s)', headless => {
  it('does not close on a real conditional 304 subresource response', async () => {
    const f = await fixture(headless)
    expect(await f.evaluate('fetch("/cache.css").then(response => response.text())')).toBe(
      'body { color: rgb(1, 2, 3) }',
    )
    await f.evaluate(
      'fetch("/cache.css", { headers: { "If-None-Match": "\\"synthetic-cache\\"" } }).then(response => response.status).catch(() => 0)',
    )
    await expect
      .poll(() => f.redirectPauses.some(pause => pause.path === '/cache.css' && pause.responseStatusCode === 304))
      .toBe(true)
    expect((await getQualityJourneyDiscoveryBrowserSession(f.identity)).state).toBe('ACTIVE')
  })

  it.each(['plain', 'gzip', 'chunked'] as const)(
    'preserves %s document bytes, original CSP and duplicate cookies without body collection',
    async encoding => {
      const f = await fixture(headless, servers => {
        servers.setHtml('<h1>Synthetic Ω canary</h1><script>window.mustRemainBlocked=true</script>')
        servers.setDocumentTransport(encoding, "script-src 'none'")
      })
      expect(await f.evaluate('document.querySelector("h1").textContent')).toBe('Synthetic Ω canary')
      expect(await f.evaluate('window.mustRemainBlocked === undefined')).toBe(true)
      await f.evaluate('fetch("/checkout").then(response => response.text()).then(() => true)')
      const latest = f.servers.hits.at(-1)!
      expect(latest.cookie).toContain('doc-one=1')
      expect(latest.cookie).toContain('doc-two=2')
      expect(f.trace).not.toContain('Fetch.getResponseBody')
      expect(f.trace).not.toContain('Fetch.takeResponseBodyAsStream')
    },
  )

  it.each([301, 302, 303, 307, 308])(
    'preserves native %s transit with canonical policy and synthetic cookies/body',
    async status => {
      const f = await fixture(headless)
      f.servers.setRedirect(status)
      await f.navigate(`${f.servers.idpOrigin}/login`)
      await f.evaluate(`const form=document.createElement('form'); form.method='POST'; form.action='/login';
      const input=document.createElement('input'); input.name='synthetic'; input.value='known-value';
      form.append(input); document.body.append(form); form.submit(); true`)
      await expect.poll(() => f.servers.hits.some(hit => hit.path === '/secure')).toBe(true)
      const secure = f.servers.hits.find(hit => hit.path === '/secure')!
      expect(secure.method).toBe(status <= 303 ? 'GET' : 'POST')
      expect(secure.body).toBe(status <= 303 ? '' : 'synthetic=known-value')
      expect(secure.cookie).toContain('synthetic=adapter')
      await expect.poll(() => f.evaluate('location.pathname')).toBe('/secure')
      expect((await getQualityJourneyDiscoveryBrowserSession(f.identity)).state).toBe('ACTIVE')
    },
  )

  it('correlates overlapping synthetic image redirects by stable network identity', async () => {
    const f = await fixture(headless)
    f.holdRedirectContinuations()
    try {
      await f.evaluate(
        `for (const path of ['/image-redirect-a', '/image-redirect-b', '/image-independent']) { const image=document.createElement('img'); image.src=path; document.body.append(image); } true`,
      )
      await expect.poll(() => f.servers.hits.filter(hit => hit.path.startsWith('/image-redirect-')).length).toBe(2)
      await expect.poll(() => f.redirectPauses.filter(pause => pause.responseStatusCode === 302).length).toBe(2)
      const redirectedResponses = f.redirectPauses.filter(pause => pause.responseStatusCode === 302)
      expect(new Set(redirectedResponses.map(pause => pause.networkId))).toHaveLength(2)
      for (const response of redirectedResponses) {
        expect(response.networkId).toEqual(expect.any(String))
        expect(
          f.redirectPauses.find(
            pause => pause.requestId === response.requestId && pause.responseStatusCode === undefined,
          )?.networkId,
        ).toBe(response.networkId)
      }
      expect(f.redirectPauses.filter(pause => pause.path === '/image-independent')).not.toHaveLength(0)
      expect(f.servers.hits.some(hit => hit.path.startsWith('/image-final-'))).toBe(false)
    } finally {
      f.releaseRedirectContinuations()
    }
    await expect.poll(() => f.servers.hits.filter(hit => hit.path.startsWith('/image-final-')).length).toBe(2)
    expect((await getQualityJourneyDiscoveryBrowserSession(f.identity)).state).toBe('ACTIVE')
  })

  it('denies a forbidden redirect hop before contact', async () => {
    const f = await fixture(headless)
    f.servers.setRedirect(303, true)
    await f.navigate(`${f.servers.idpOrigin}/login`)
    await f
      .evaluate(
        `const form=document.createElement('form'); form.method='POST'; form.action='/login';
      document.body.append(form); form.submit(); true`,
      )
      .catch(() => undefined)
    await expect.poll(async () => (await getQualityJourneyDiscoveryBrowserSession(f.identity)).state).not.toBe('ACTIVE')
    expect(f.servers.hits.some(hit => hit.path === '/secure')).toBe(true)
    expect(f.servers.hits.some(hit => hit.path === '/denied')).toBe(false)
  })

  it('retains explicit human return, frozen policy freshness and bounded receipt content', async () => {
    const f = await fixture(headless)
    await f.navigate(`${f.servers.idpOrigin}/login`)
    await expect(confirmQualityJourneyDiscoveryBrowserAccess(f.identity, f.client as never)).rejects.toThrow()
    const armed = await armQualityJourneyDiscoveryBrowserHumanReturn(f.identity, f.client as never)
    await f.navigate(armed.returnUrl)
    await expect
      .poll(async () => {
        try {
          return (await confirmQualityJourneyDiscoveryBrowserAccess(f.identity, f.client as never)).state
        } catch {
          return 'WAITING'
        }
      })
      .toBe('ACCESS_CONFIRMED')
    const captured = await captureQualityJourneyDiscoveryBrowserReceipt(
      { ...f.identity, snapshotId: 'snapshot-1' },
      f.client as never,
    )
    expect(captured.receipt.humanReturn?.targetUrlHash).toBeDefined()
    expect(JSON.stringify(captured)).not.toContain(f.servers.idpOrigin)
    await expect(
      assertDiscoveryBrowserReceiptAdmission(
        {
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
        },
        {
          id: 'revision-1',
          journeyId: 'journey-1',
          targetProjectId: 'target-1',
          cycleId: 'cycle-1',
          scoutWorkItemId: 'work-1',
        },
        f.client as never,
      ),
    ).resolves.toBeUndefined()
    f.client.environmentScope.scopeVersion++
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt({ ...f.identity, snapshotId: 'snapshot-2' }, f.client as never),
    ).rejects.toThrow()
    expect(f.client.artifacts.size).toBe(1)
  })

  it.each(['window', 'link', 'form'])('denies %s popup before its first request', async kind => {
    const f = await fixture(headless)
    const url = JSON.stringify(`${f.servers.idpOrigin}/denied`)
    const script =
      kind === 'window'
        ? `window.open(${url}); true`
        : kind === 'link'
          ? `const a=document.createElement('a'); a.href=${url}; a.target='_blank'; document.body.append(a); a.click(); true`
          : `const form=document.createElement('form'); form.action=${url}; form.target='_blank'; document.body.append(form); form.submit(); true`
    await f.evaluate(script).catch(() => undefined)
    await expect.poll(async () => (await getQualityJourneyDiscoveryBrowserSession(f.identity)).state).not.toBe('ACTIVE')
    expect(f.servers.hits.some(hit => hit.path.startsWith('/denied'))).toBe(false)
  })

  it('blocks service-worker registration before fetching the worker script', async () => {
    const f = await fixture(headless)
    await f.navigate(`${f.servers.idpOrigin}/login`)
    expect(
      await f.evaluate(`navigator.serviceWorker.register('/worker.js').then(()=>'registered', ()=>'blocked')`),
    ).toBe('blocked')
    expect(
      f.servers.hits.some(hit => ['/worker.js', '/denied'].includes(hit.path)),
      f.trace.join(', '),
    ).toBe(false)
    expect((await getQualityJourneyDiscoveryBrowserSession(f.identity)).state).toBe('ACTIVE')
  })

  it.each(['direct', 'prototype', 'reflect', 'bound', 'binding', 'blank-frame', 'srcdoc', 'nested-frame'])(
    'blocks %s WebSocket attempts without relying on fast revocation',
    async vector => {
      const f = await fixture(headless, undefined, true)
      await f.navigate(`${f.servers.idpOrigin}/login`)
      const url = JSON.stringify(f.servers.idpOrigin.replace('https:', 'wss:') + '/socket')
      const scripts: Record<string, string> = {
        direct: `new WebSocket(${url})`,
        prototype: `new WebSocket.prototype.constructor(${url})`,
        reflect: `Reflect.construct(WebSocket, [${url}])`,
        bound: `const Alias=WebSocket.bind(null,${url}); new Alias()`,
        binding: `globalThis.__appraiseDiscoveryWebSocketDenied=()=>{}; new WebSocket(${url})`,
        'blank-frame': `const frame=document.createElement('iframe'); document.body.append(frame); new frame.contentWindow.WebSocket(${url})`,
        srcdoc: `const frame=document.createElement('iframe'); frame.srcdoc=${JSON.stringify(`<script>new WebSocket(${url})</script>`)}; document.body.append(frame)`,
        'nested-frame': `const a=document.createElement('iframe'); document.body.append(a); const b=a.contentDocument.createElement('iframe'); a.contentDocument.body.append(b); new b.contentWindow.WebSocket(${url})`,
      }
      await f.evaluate(`setTimeout(() => {${scripts[vector]}}, 0); true`).catch(() => undefined)
      await expect
        .poll(async () => (await getQualityJourneyDiscoveryBrowserSession(f.identity)).state)
        .not.toBe('ACTIVE')
      expect(f.servers.upgrades()).toBe(0)
    },
  )

  it.each(['classic', 'module', 'shared', 'service', 'blob', 'data'])(
    'rejects %s worker execution even when its first network effect is policy-allowed',
    async kind => {
      const f = await fixture(headless)
      await f.navigate(`${f.servers.idpOrigin}/login`)
      const scripts: Record<string, string> = {
        classic: `new Worker.prototype.constructor('/worker.js')`,
        module: `new Worker.prototype.constructor('/worker.js', {type:'module'})`,
        shared: `new SharedWorker('/worker.js')`,
        service: `ServiceWorkerContainer.prototype.register.call(navigator.serviceWorker, '/worker.js').catch(()=>{})`,
        blob: `new Worker.prototype.constructor(URL.createObjectURL(new Blob(['fetch("${f.servers.idpOrigin}/secure")'], {type:'application/javascript'})))`,
        data: `new Worker.prototype.constructor('data:text/javascript,fetch(${JSON.stringify(f.servers.idpOrigin + '/secure')})')`,
      }
      await f.evaluate(`setTimeout(() => {${scripts[kind]}}, 0); true`).catch(() => undefined)
      await expect
        .poll(async () => (await getQualityJourneyDiscoveryBrowserSession(f.identity)).state)
        .not.toBe('ACTIVE')
      expect(
        f.servers.hits.some(hit => ['/secure', '/denied'].includes(hit.path)),
        f.trace.join(', '),
      ).toBe(false)
      expect(f.servers.hits.filter(hit => hit.path === '/worker.js').length).toBeLessThanOrEqual(1)
      expect(f.targetTypes).toContain(
        kind === 'shared' ? 'shared_worker' : kind === 'service' ? 'service_worker' : 'worker',
      )
      expect(f.attachmentPauses.every(Boolean)).toBe(true)
      expect(f.trace.filter(command => command === 'Runtime.runIfWaitingForDebugger')).toHaveLength(1)
      await f.transport.close()
      await expect(access(f.transport.profileDirectory)).rejects.toThrow()
    },
    15_000,
  )

  it.each(['classic', 'shared', 'service'])('denies an unauthorized %s worker script before contact', async kind => {
    const f = await fixture(headless)
    await f.navigate(`${f.servers.idpOrigin}/login`)
    const script =
      kind === 'classic'
        ? `new Worker.prototype.constructor('/denied')`
        : kind === 'shared'
          ? `new SharedWorker('/denied')`
          : `ServiceWorkerContainer.prototype.register.call(navigator.serviceWorker, '/denied').catch(()=>{})`
    await f.evaluate(`setTimeout(()=>{${script}},0); true`).catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(f.servers.hits.some(hit => hit.path === '/denied')).toBe(false)
  })

  it('fences a paused response on revocation and rejects later receipt capture', async () => {
    const f = await fixture(headless)
    await f.navigate(`${f.servers.idpOrigin}/login`)
    f.servers.hold()
    await f.evaluate(`location.href='/slow'; true`).catch(() => undefined)
    await expect.poll(() => f.servers.hits.some(hit => hit.path === '/slow')).toBe(true)
    await revokeQualityJourneyDiscoveryBrowserSession(f.identity)
    f.servers.release()
    expect((await getQualityJourneyDiscoveryBrowserSession(f.identity)).state).toBe('REVOKED')
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt({ ...f.identity, snapshotId: 'late' }, f.client as never),
    ).rejects.toThrow()
  })

  it('contains same-process subframe requests using their committed source origin', async () => {
    const f = await fixture(headless)
    await f.evaluate(
      `const frame=document.createElement('iframe'); frame.src='/checkout'; document.body.append(frame); true`,
    )
    await expect
      .poll(() => f.evaluate('document.querySelector("iframe")?.contentDocument?.querySelector("h1")?.textContent'))
      .toBe('Checkout')
    const before = f.servers.hits.length
    await f.evaluate(
      `document.querySelector('iframe').contentWindow.fetch(${JSON.stringify(f.servers.idpOrigin + '/secure')}).catch(()=>{}); true`,
    )
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(f.servers.hits.slice(before).some(hit => hit.path === '/secure')).toBe(false)
    expect(f.targetTypes).toEqual(['page'])
    expect((await getQualityJourneyDiscoveryBrowserSession(f.identity)).state).toBe('ACTIVE')
  })

  it('guards cross-origin OOPIF traffic without granting main-frame return authority', async () => {
    const f = await fixture(headless)
    f.servers.setProviderHtml(
      '<h1>Provider frame</h1><script>if(location.pathname==="/login") fetch("/secure")</script>',
    )
    await f.evaluate(
      `const frame=document.createElement('iframe'); frame.src='/checkout'; document.body.append(frame); true`,
    )
    await expect
      .poll(() => f.evaluate('document.querySelector("iframe")?.contentDocument?.querySelector("h1")?.textContent'))
      .toBe('Checkout')
    await f.evaluate(`document.querySelector('iframe').src=${JSON.stringify(f.servers.idpOrigin + '/login')}; true`)
    await expect
      .poll(() => f.servers.hits.some(hit => hit.path === '/secure'))
      .toBe(true)
      .catch(error => {
        throw new Error(
          `OOPIF trace: ${f.trace.join(', ')}; types:${f.targetTypes}; paths:${f.servers.hits.map(hit => hit.path)}`,
          { cause: error },
        )
      })
    if (!headless) expect(f.targetTypes).toContain('iframe')
    expect(await f.evaluate('location.href')).toBe(`${f.servers.targetOrigin}/checkout`)
    await expect(armQualityJourneyDiscoveryBrowserHumanReturn(f.identity, f.client as never)).rejects.toThrow()
    await expect(confirmQualityJourneyDiscoveryBrowserAccess(f.identity, f.client as never)).rejects.toThrow()
  })

  it.each(['sandbox', 'data', 'unknown'])('denies IdP contact from an opaque or provisional %s child', async kind => {
    const f = await fixture(headless)
    const destination = `${f.servers.idpOrigin}/login`
    const script =
      kind === 'data'
        ? `const frame=document.createElement('iframe'); frame.src=${JSON.stringify('data:text/html,<script>location=' + JSON.stringify(destination) + '</script>')}; document.body.append(frame); true`
        : `const frame=document.createElement('iframe'); ${kind === 'sandbox' ? "frame.sandbox='allow-scripts';" : ''} frame.src=${JSON.stringify(destination)}; document.body.append(frame); true`
    await f.evaluate(script).catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(f.servers.hits.some(hit => hit.path === '/login')).toBe(false)
    await expect(confirmQualityJourneyDiscoveryBrowserAccess(f.identity, f.client as never)).rejects.toThrow()
  })

  it('denies downloads and removes the owned profile on terminal closure', async () => {
    const f = await fixture(headless)
    await f.navigate(`${f.servers.idpOrigin}/login`)
    await f.evaluate(`location.href='/download'; true`).catch(() => undefined)
    await expect.poll(async () => (await getQualityJourneyDiscoveryBrowserSession(f.identity)).state).not.toBe('ACTIVE')
    await f.transport.close()
    await expect(access(f.transport.profileDirectory)).rejects.toThrow()
    expect(f.servers.hits.some(hit => hit.path === '/download')).toBe(true)
  })

  it('closes on pipe loss with an in-flight response and rejects stale capture', async () => {
    const f = await fixture(headless)
    await f.navigate(`${f.servers.idpOrigin}/login`)
    f.servers.hold()
    await f.evaluate(`location.href='/slow'; true`).catch(() => undefined)
    await expect.poll(() => f.servers.hits.some(hit => hit.path === '/slow')).toBe(true)
    f.transport.breakPipe()
    await expect.poll(async () => (await getQualityJourneyDiscoveryBrowserSession(f.identity)).state).not.toBe('ACTIVE')
    f.servers.release()
    await f.transport.close()
    await expect(access(f.transport.profileDirectory)).rejects.toThrow()
    await expect(
      captureQualityJourneyDiscoveryBrowserReceipt({ ...f.identity, snapshotId: 'lost' }, f.client as never),
    ).rejects.toThrow()
  })
})
