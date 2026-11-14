import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createAttemptScopedWorkerMcpServer, type AttemptScopedWorkerProfile } from './managed-worker-server.js'

type Gateway = Parameters<typeof createAttemptScopedWorkerMcpServer>[0]['callGateway']
export type ManagedWorkerLoopbackOptions = Readonly<{
  host: '127.0.0.1'
  port: number
  path: string
  capability: string
  capabilityCommitment: string
  profile: AttemptScopedWorkerProfile
  expectedProfileDigest: string
  sealedGrant: string
  callGateway: Gateway
  bodyBytes: number
  httpRequests: number
  toolCalls: number
  requestMs: number
  cleanupMs: number
}>

/** Internal fixed-address transport. No CLI, route or public export registers this endpoint. */
export async function createManagedWorkerLoopbackServer(options: ManagedWorkerLoopbackOptions) {
  const captured = { ...options, profile: structuredClone(options.profile) }
  const {
    host,
    port,
    path,
    capability,
    capabilityCommitment,
    bodyBytes,
    httpRequests,
    toolCalls,
    requestMs,
    cleanupMs,
  } = captured
  const finite = (value: number, max: number) => Number.isSafeInteger(value) && value >= 1 && value <= max
  if (
    host !== '127.0.0.1' ||
    !finite(port, 65535) ||
    port < 1024 ||
    !/^\/appraise-worker\/[a-f0-9]{32}$/.test(path) ||
    !/^[a-f0-9]{64}$/.test(capability) ||
    `sha256:${createHash('sha256').update(capability).digest('hex')}` !== capabilityCommitment ||
    !finite(bodyBytes, 1_048_576) ||
    !finite(httpRequests, 64) ||
    !finite(toolCalls, 16) ||
    !finite(requestMs, 60_000) ||
    !finite(cleanupMs, 60_000)
  )
    throw new Error('Invalid fixed worker loopback plan')
  let fenced = false,
    requests = 0,
    calls = 0,
    inFlight = 0,
    effectUnknown = false
  // Keep original entered gateway Promise identities through endpoint cleanup.
  const gatewayOperations = new Set<Promise<unknown>>()
  const gatewayObservations = new Map<Promise<unknown>, Promise<void>>()
  const httpObservations = new Map<Promise<void>, Promise<void>>()
  const sockets = new Set<Socket>()
  const socketClosures = new Map<Socket, Promise<void>>()
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  })
  const worker = createAttemptScopedWorkerMcpServer({
    profile: captured.profile,
    expectedProfileDigest: captured.expectedProfileDigest,
    sealedGrant: captured.sealedGrant,
    async callGateway(input) {
      if (fenced || ++calls > toolCalls) throw new Error('Worker connector admission fenced')
      inFlight++
      try {
        const operation = captured.callGateway(input)
        if (!(operation instanceof Promise) || gatewayOperations.has(operation)) {
          effectUnknown = true
          throw new Error('Original gateway operation required')
        }
        gatewayOperations.add(operation)
        const observation = operation.then(
          () => undefined,
          () => {
            effectUnknown = true
          },
        )
        gatewayObservations.set(operation, observation)
        return await operation
      } catch (error) {
        // An entered operation may have committed before its original reply was lost.
        effectUnknown = true
        throw error
      } finally {
        inFlight--
      }
    },
  })
  await worker.connect(transport)
  function fence() {
    fenced = true
    if (inFlight) effectUnknown = true
  }
  const expectedAuthorization = Buffer.from(`Bearer ${capability}`)
  function authenticated(request: IncomingMessage) {
    const observed = Buffer.from(request.headers.authorization ?? '')
    return observed.length === expectedAuthorization.length && timingSafeEqual(observed, expectedAuthorization)
  }
  function admit(request: IncomingMessage) {
    if (fenced || ++requests > httpRequests) {
      fence()
      return 503
    }
    if (request.method !== 'POST') return 405
    if (request.url !== path || request.headers.host !== `${host}:${port}` || request.headers.origin !== undefined)
      return 404
    if (!authenticated(request)) return 401
    if (!request.headers['content-type']?.startsWith('application/json')) return 415
    return 0
  }
  async function readMessage(request: IncomingMessage, response: ServerResponse) {
    let length = 0
    const chunks: Buffer[] = []
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk)
      length += bytes.length
      if (length > bodyBytes || fenced) {
        response.writeHead(413).end()
        return null
      }
      chunks.push(bytes)
    }
    return { message: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  }
  async function handle(request: IncomingMessage, response: ServerResponse) {
    const refusal = admit(request)
    if (refusal) {
      response.writeHead(refusal).end()
      request.resume()
      return
    }
    const timer = setTimeout(() => {
      fence()
      response.destroy()
      request.destroy()
    }, requestMs)
    try {
      const parsed = await readMessage(request, response)
      if (!parsed) return
      const { message } = parsed
      if (fenced || Array.isArray(message)) {
        response.writeHead(400).end()
        return
      }
      await transport.handleRequest(request, response, message)
    } catch {
      effectUnknown = true
      if (!response.headersSent && !response.destroyed) response.writeHead(400).end()
    } finally {
      clearTimeout(timer)
    }
  }
  const server = createServer((request, response) => {
    const original = handle(request, response)
    httpObservations.set(
      original,
      original.then(
        () => undefined,
        () => {
          effectUnknown = true
        },
      ),
    )
  })
  server.on('connection', socket => {
    sockets.add(socket)
    socketClosures.set(
      socket,
      new Promise<void>(resolve => {
        socket.once('close', () => {
          sockets.delete(socket)
          resolve()
        })
      }),
    )
    socket.setTimeout(requestMs, () => socket.destroy())
  })
  server.requestTimeout = requestMs
  server.headersTimeout = requestMs
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen({ host, port, exclusive: true }, () => {
        server.off('error', reject)
        resolve()
      })
    })
  } catch (error) {
    fence()
    await worker.close()
    throw error
  }
  let closeFlight: Promise<Readonly<{ closed: boolean; effectUnknown: boolean }>> | undefined
  return Object.freeze({
    fence,
    snapshot: () => Object.freeze({ fenced, requests, calls, inFlight, effectUnknown }),
    close() {
      fence()
      closeFlight ??= new Promise(resolve => {
        let settled = false
        const finish = (closed: boolean) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (!closed) effectUnknown = true
          resolve(Object.freeze({ closed, effectUnknown }))
        }
        const timer = setTimeout(() => {
          for (const socket of sockets) socket.destroy()
          finish(false)
        }, cleanupMs)
        const listenerClosed = new Promise<boolean>(resolveListener => server.close(error => resolveListener(!error)))
        for (const socket of sockets) socket.destroy()
        const workerClosed = worker.close().then(
          () => true,
          () => {
            effectUnknown = true
            return false
          },
        )
        const originalConnectionsJoin = listenerClosed
          .then(() => Promise.all([...socketClosures.values()]))
          .then(() => true)
        const originalHttpJoin = listenerClosed.then(() => Promise.all([...httpObservations.values()])).then(() => true)
        const originalGatewayJoin = Promise.all([...gatewayObservations.values()]).then(() => true)
        void Promise.all([
          listenerClosed,
          workerClosed,
          originalGatewayJoin,
          originalConnectionsJoin,
          originalHttpJoin,
        ]).then(results => finish(results.every(Boolean) && inFlight === 0 && sockets.size === 0))
      })
      return closeFlight
    },
  })
}
