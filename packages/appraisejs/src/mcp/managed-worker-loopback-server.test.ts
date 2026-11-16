import { createHash } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createManagedWorkerLoopbackServer,
  type ManagedWorkerLoopbackOptions,
  type ManagedWorkerLoopbackRequestContext,
} from './managed-worker-loopback-server.js'

const servers: Awaited<ReturnType<typeof createManagedWorkerLoopbackServer>>[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
})
async function availablePort() {
  const probe = createServer()
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', resolve)
  })
  const address = probe.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  await new Promise<void>(resolve => probe.close(() => resolve()))
  return address.port
}
const hash = (value: unknown) =>
  `sha256:${createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex')}`
async function fixture(extra: Pick<ManagedWorkerLoopbackOptions, 'trustedRequestContext'> = {}) {
  const port = await availablePort(),
    capability = 'a'.repeat(64)
  // Canonical profile's digest requires sorted keys, including each tool.
  const subject = {
    role: 'SCOUT',
    tools: [
      {
        inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
        name: 'quality_journey_discovery_get',
      },
    ],
  }
  const callGateway = vi.fn().mockResolvedValue({ result: { canonical: 'actual-result' }, receipt: { accepted: true } })
  const options = {
    host: '127.0.0.1' as const,
    port,
    path: `/appraise-worker/${'b'.repeat(32)}`,
    capability,
    capabilityCommitment: hash(capability),
    profile: { ...subject, contractDigest: hash(subject) },
    expectedProfileDigest: hash(subject),
    sealedGrant: 'parent-only-sealed-grant',
    callGateway,
    bodyBytes: 4096,
    httpRequests: 32,
    toolCalls: 4,
    requestMs: 2000,
    cleanupMs: 2000,
    ...extra,
  }
  const server = await createManagedWorkerLoopbackServer(options)
  servers.push(server)
  const url = new URL(`http://127.0.0.1:${port}${options.path}`)
  return { options, server, url, callGateway }
}
type RawReply = {
  responseSeen: boolean
  body: string
  information: number
  status?: number
  session?: string
  errorCode?: string
}
async function postOriginal(
  f: Awaited<ReturnType<typeof fixture>>,
  message: unknown,
  session?: string,
  headers: Record<string, string> = {},
): Promise<RawReply> {
  return new Promise(resolve => {
    const body = Buffer.from(JSON.stringify(message))
    let responseSeen = false,
      information = 0,
      settled = false
    const done = (result: RawReply) => {
      if (!settled) {
        settled = true
        resolve(result)
      }
    }
    const request = httpRequest(
      f.url,
      {
        method: 'POST',
        agent: false,
        headers: {
          authorization: `Bearer ${f.options.capability}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'content-length': String(body.length),
          ...(session ? { 'mcp-session-id': session, 'mcp-protocol-version': '2025-03-26' } : {}),
          ...headers,
        },
      },
      response => {
        responseSeen = true
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () =>
          done({
            responseSeen,
            status: response.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
            information,
            session:
              typeof response.headers['mcp-session-id'] === 'string' ? response.headers['mcp-session-id'] : undefined,
          }),
        )
      },
    )
    request.on('information', () => {
      information++
    })
    request.on('error', error =>
      done({ responseSeen, body: '', information, errorCode: (error as NodeJS.ErrnoException).code ?? 'ERROR' }),
    )
    request.setTimeout(1500, () => request.destroy())
    request.end(body)
  })
}
async function initializeOriginal(f: Awaited<ReturnType<typeof fixture>>) {
  const initialized = await postOriginal(f, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'offline-raw-context', version: '1' },
    },
  })
  expect(initialized.status).toBe(200)
  expect(initialized.session).toBeTruthy()
  expect(
    (await postOriginal(f, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, initialized.session))
      .status,
  ).toBe(202)
  return initialized.session!
}
describe('actual SDK fixed loopback transport', () => {
  it('keeps the same original ALS request and drops an accepted synthetic reply with zero HTTP bytes before natural SDK/HTTP settlement', async () => {
    const context = new AsyncLocalStorage<ManagedWorkerLoopbackRequestContext>()
    const f = await fixture({ trustedRequestContext: (original, enter) => context.run(original, enter) })
    const session = await initializeOriginal(f)
    const healthy = await postOriginal(
      f,
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'quality_journey_discovery_get', arguments: {} } },
      session,
    )
    expect(healthy.status).toBe(200)
    expect(healthy.body).toContain('actual-result')
    let accepted = false,
      before: number | undefined,
      after: number | undefined
    let socketClosed!: Promise<void>
    f.callGateway.mockImplementationOnce(async () => {
      const original = context.getStore()
      expect(original?.socket).toBe(original?.request.socket)
      expect(original?.response.socket).toBe(original?.socket)
      expect(original?.originalSocketExclusive()).toBe(true)
      expect(original?.response.headersSent).toBe(false)
      before = original!.socket.bytesWritten
      socketClosed = new Promise(resolve =>
        original!.socket.once('close', () => {
          after = original!.socket.bytesWritten
          resolve()
        }),
      )
      accepted = true // Synthetic accepted marker only; canonical acceptance is covered by the task integration.
      original!.socket.destroy()
      return { result: { canonical: 'accepted-but-never-delivered' }, receipt: { accepted: true } }
    })
    const dropped = await postOriginal(
      f,
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'quality_journey_discovery_get', arguments: {} } },
      session,
    )
    await socketClosed
    expect(accepted).toBe(true)
    expect(dropped).toMatchObject({ responseSeen: false, body: '', information: 0, errorCode: 'ECONNRESET' })
    expect(after).toBe(before)
    expect(f.callGateway).toHaveBeenCalledTimes(2)
    await vi.waitFor(() =>
      expect(f.server.snapshot().originalHandlers).toMatchObject({
        httpEntered: 4,
        httpSettled: 4,
        sdkEntered: 4,
        sdkSettled: 4,
        workerCloseEntered: false,
      }),
    )
    expect(await f.server.close()).toMatchObject({ closed: true })
    expect(f.server.snapshot().originalHandlers).toMatchObject({ workerCloseEntered: true, workerCloseSettled: true })
  })
  it('refuses Expect without sending informational bytes and preserves authentication before the trusted context', async () => {
    const scope = vi.fn((_context: ManagedWorkerLoopbackRequestContext, enter: () => Promise<void>) => enter())
    const f = await fixture({ trustedRequestContext: scope })
    const message = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }
    expect(await postOriginal(f, message, undefined, { expect: '100-continue' })).toMatchObject({
      status: 417,
      information: 0,
    })
    expect(
      await postOriginal(f, message, undefined, { expect: '100-continue', authorization: 'Bearer wrong' }),
    ).toMatchObject({ status: 401, information: 0 })
    expect(scope).not.toHaveBeenCalled()
    expect(f.callGateway).not.toHaveBeenCalled()
  })
  it('refuses a trusted hook that substitutes a completed Promise without entering the real SDK handler', async () => {
    const f = await fixture({ trustedRequestContext: () => Promise.resolve() })
    expect(await postOriginal(f, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).toMatchObject({
      status: 400,
    })
    expect(f.callGateway).not.toHaveBeenCalled()
    expect(f.server.snapshot().originalHandlers).toMatchObject({ sdkEntered: 0, sdkSettled: 0 })
  })
  it('returns the actual gateway result and refuses cross-role, path and capability expansion', async () => {
    const f = await fixture(),
      client = new Client({ name: 'offline-sdk-client', version: '1' })
    try {
      await client.connect(
        new StreamableHTTPClientTransport(f.url, {
          requestInit: { headers: { Authorization: `Bearer ${f.options.capability}` } },
        }),
      )
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['quality_journey_discovery_get'])
      expect(
        (await client.callTool({ name: 'quality_journey_discovery_get', arguments: {} })).structuredContent,
      ).toEqual({ result: { canonical: 'actual-result' }, receipt: { accepted: true } })
      expect(f.callGateway).toHaveBeenCalledExactlyOnceWith({
        sealedGrant: 'parent-only-sealed-grant',
        profileDigest: f.options.expectedProfileDigest,
        toolName: 'quality_journey_discovery_get',
        arguments: {},
      })
      await expect(client.callTool({ name: 'quality_journey_triage_submit', arguments: {} })).rejects.toThrow(
        /not registered/,
      )
      expect(
        (await fetch(f.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status,
      ).toBe(401)
      expect(
        (
          await fetch(new URL('/other', f.url), {
            method: 'POST',
            headers: { authorization: `Bearer ${f.options.capability}`, 'content-type': 'application/json' },
            body: '{}',
          })
        ).status,
      ).toBe(404)
    } finally {
      await client.close()
    }
  })
  it('retains uncertainty when a committed gateway mutation loses its reply before fencing', async () => {
    const f = await fixture(),
      client = new Client({ name: 'offline-lost-gateway-reply', version: '1' })
    let committed = false
    f.callGateway.mockImplementationOnce(async () => {
      committed = true
      throw new Error('Synthetic lost reply after canonical mutation')
    })
    try {
      await client.connect(
        new StreamableHTTPClientTransport(f.url, {
          requestInit: { headers: { Authorization: `Bearer ${f.options.capability}` } },
        }),
      )
      await expect(client.callTool({ name: 'quality_journey_discovery_get', arguments: {} })).rejects.toThrow()
      expect(committed).toBe(true)
      expect(f.server.snapshot()).toMatchObject({ inFlight: 0, effectUnknown: true, fenced: false })
      expect(await f.server.close()).toEqual({ closed: true, effectUnknown: true })
      expect(f.server.snapshot().effectUnknown).toBe(true)
    } finally {
      await client.close()
    }
  })
  it('retains UNKNOWN for original in-flight gateway effects when fencing closes the listener', async () => {
    const actual = StreamableHTTPServerTransport.prototype.handleRequest
    let originalSdkSettled = false
    const originalSdk = vi.spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest').mockImplementation(function (
      this: StreamableHTTPServerTransport,
      request,
      response,
      body,
    ) {
      const operation = actual.call(this, request, response, body)
      if ((body as { method?: string })?.method === 'tools/call')
        void operation.then(
          () => {
            originalSdkSettled = true
          },
          () => {
            originalSdkSettled = true
          },
        )
      return operation
    })
    const f = await fixture(),
      client = new Client({ name: 'offline-pending-sdk-client', version: '1' })
    let resolveGateway!: (value: { result: { canonical: string }; receipt: { accepted: boolean } }) => void
    let entered!: () => void
    const admitted = new Promise<void>(resolve => {
      entered = resolve
    })
    f.callGateway.mockImplementationOnce(async () => {
      entered()
      return new Promise(resolve => {
        resolveGateway = resolve
      })
    })
    try {
      await client.connect(
        new StreamableHTTPClientTransport(f.url, {
          requestInit: { headers: { Authorization: `Bearer ${f.options.capability}` } },
        }),
      )
      const request = client.callTool({ name: 'quality_journey_discovery_get', arguments: {} })
      const rejected = expect(request).rejects.toThrow()
      await admitted
      f.server.fence()
      const originalClose = f.server.close()
      let closeSettled = false
      void originalClose.then(() => {
        closeSettled = true
      })
      await rejected
      await Promise.resolve()
      expect(closeSettled).toBe(false)
      resolveGateway({ result: { canonical: 'late' }, receipt: { accepted: true } })
      // Joining the actual SDK/HTTP handler before worker.close allows its natural settlement; uncertainty remains.
      expect(await originalClose).toEqual({ closed: true, effectUnknown: true })
      expect(originalSdkSettled).toBe(true)
      expect(f.server.snapshot().effectUnknown).toBe(true)
    } finally {
      originalSdk.mockRestore()
      await client.close()
    }
  })
  it('reports unclosed when an original gateway Promise outlives finite SDK cleanup', async () => {
    const f = await fixture(),
      client = new Client({ name: 'offline-unsettled-gateway', version: '1' })
    let entered!: () => void
    const admitted = new Promise<void>(resolve => {
      entered = resolve
    })
    f.callGateway.mockImplementationOnce(() => {
      entered()
      return new Promise(() => {})
    })
    try {
      await client.connect(
        new StreamableHTTPClientTransport(f.url, {
          requestInit: { headers: { Authorization: `Bearer ${f.options.capability}` } },
        }),
      )
      const request = client.callTool({ name: 'quality_journey_discovery_get', arguments: {} })
      const rejected = expect(request).rejects.toThrow()
      await admitted
      expect(await f.server.close()).toEqual({ closed: false, effectUnknown: true })
      await rejected
      expect(f.server.snapshot()).toMatchObject({ inFlight: 1, effectUnknown: true })
    } finally {
      await client.close()
    }
  })
  it.each(['fulfilled', 'rejected'])(
    'joins the original HTTP transport tail %s after actual gateway settlement and listener close',
    async settlement => {
      const actual = StreamableHTTPServerTransport.prototype.handleRequest
      let resolve!: () => void, reject!: (reason: unknown) => void
      const tail = new Promise<void>((done, failed) => {
        resolve = done
        reject = failed
      })
      const spy = vi.spyOn(StreamableHTTPServerTransport.prototype, 'handleRequest').mockImplementation(async function (
        this: StreamableHTTPServerTransport,
        request,
        response,
        body,
      ) {
        await actual.call(this, request, response, body)
        if ((body as { method?: string })?.method === 'tools/call') await tail
      })
      const client = new Client({ name: 'offline-http-tail', version: '1' })
      try {
        const f = await fixture()
        await client.connect(
          new StreamableHTTPClientTransport(f.url, {
            requestInit: { headers: { Authorization: `Bearer ${f.options.capability}` } },
          }),
        )
        await client.callTool({ name: 'quality_journey_discovery_get', arguments: {} })
        expect(f.server.snapshot()).toMatchObject({ inFlight: 0, effectUnknown: false })
        const originalClose = f.server.close()
        let settled = false
        void originalClose.then(() => {
          settled = true
        })
        await expect(fetch(f.url)).rejects.toThrow()
        await new Promise(done => setTimeout(done, 25))
        expect(settled).toBe(false)
        if (settlement === 'fulfilled') resolve()
        else reject(new Error('Lost original transport reply tail'))
        expect(await originalClose).toEqual({ closed: true, effectUnknown: settlement === 'rejected' })
      } finally {
        resolve()
        spy.mockRestore()
        await client.close()
      }
    },
  )
  it('refuses a fixed-port conflict and never selects another port', async () => {
    const f = await fixture()
    await expect(createManagedWorkerLoopbackServer(f.options)).rejects.toMatchObject({ code: 'EADDRINUSE' })
  })
  it('fences synchronously, bounds bodies and closes the original listener', async () => {
    const f = await fixture()
    const response = await fetch(f.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${f.options.capability}`, 'content-type': 'application/json' },
      body: 'x'.repeat(4097),
    })
    expect(response.status).toBe(413)
    f.server.fence()
    expect(f.server.snapshot().fenced).toBe(true)
    const close = f.server.close()
    expect(f.server.close()).toBe(close)
    expect(await close).toMatchObject({ closed: true, effectUnknown: false })
    await expect(fetch(f.url)).rejects.toThrow()
  })
})
