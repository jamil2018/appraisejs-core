import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createManagedWorkerLoopbackServer } from './managed-worker-loopback-server.js'

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
async function fixture() {
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
  }
  const server = await createManagedWorkerLoopbackServer(options)
  servers.push(server)
  const url = new URL(`http://127.0.0.1:${port}${options.path}`)
  return { options, server, url, callGateway }
}
describe('actual SDK fixed loopback transport', () => {
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
      // The SDK's original HTTP handler can remain pending after its response channel closes.
      // Joining the original gateway alone cannot manufacture full transport cleanup.
      expect(await originalClose).toEqual({ closed: false, effectUnknown: true })
      expect(f.server.snapshot().effectUnknown).toBe(true)
    } finally {
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
