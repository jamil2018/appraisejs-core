import { randomUUID } from 'node:crypto'

import type { McpRegistryContext } from './registry.js'
import type { ExternalWorkerBinding, FrozenWorkerRead, ExternalWorkerAcceptance } from './external-worker-gateway.js'
import { createExternalWorkerMcpServer, type ExternalWorkerAdvertisedProfile } from './external-worker-server.js'

export const trustedWorkerBridgePath = '/m02/canonical'
export const trustedWorkerBridgeMaxBytes = 1024 * 1024
type Action = 'bootstrap' | 'bindProfile' | 'authorize' | 'request' | 'readAcceptance'
type Stage = 'before_io' | 'after_io'

export type TrustedWorkerBridgeRequest = {
  caseId: string
  capability: string
  requestId: string
  action: Action
  payload: unknown
}
export type TrustedWorkerBridgeResponse = {
  requestId: string
  ok: boolean
  value?: unknown
  code?: 'INVALID' | 'FENCED' | 'FAILED'
}
export type TrustedWorkerBridgeExchange = (request: TrustedWorkerBridgeRequest) => Promise<unknown>

const id = /^[A-Za-z0-9._:-]{1,200}$/
const actions = new Set<Action>(['bootstrap', 'bindProfile', 'authorize', 'request', 'readAcceptance'])

function jsonBytes(value: unknown): number {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error('Non-JSON bridge value.')
  return Buffer.byteLength(encoded, 'utf8')
}

function copyBounded<T>(value: T): T {
  if (jsonBytes(value) > trustedWorkerBridgeMaxBytes) throw new Error('Bridge value exceeds bound.')
  return JSON.parse(JSON.stringify(value)) as T
}

function exact(value: unknown, expected: unknown): boolean {
  return canonicalJson(value) === canonicalJson(expected)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error('Non-JSON bridge value.')
  return encoded
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid bridge object.')
  return value as Record<string, unknown>
}

/** One supervisor-owned case. It never creates a listener or child process. */
export function createTrustedWorkerBridgeServer(options: {
  caseId: string
  capability: string
  binding: ExternalWorkerBinding
  frozenReads: readonly FrozenWorkerRead[]
  expectedAdvertisedProfile: ExternalWorkerAdvertisedProfile
  authorize: (binding: Readonly<ExternalWorkerBinding>, stage: Stage) => Promise<void>
  request: (path: string, options?: { method?: string; body?: string }) => Promise<unknown>
  readAcceptance: (input: {
    binding: Readonly<ExternalWorkerBinding>
    toolName: string
    idempotencyKey: string
    requestHash: string
  }) => Promise<ExternalWorkerAcceptance | null>
  onUnknown: (reason: 'request' | 'acceptance' | 'after_io') => Promise<void> | void
  maxRequests?: number
}) {
  if (!id.test(options.caseId) || !/^[A-Za-z0-9_-]{32,200}$/.test(options.capability))
    throw new Error('Invalid trusted bridge case identity.')
  const bootstrap = copyBounded({ binding: options.binding, frozenReads: options.frozenReads })
  const expectedProfile = copyBounded(options.expectedAdvertisedProfile)
  const seen = new Set<string>()
  let bootstrapped = false
  let bound = false
  let fenced = false
  let requestCount = 0
  let scopedCallCount = 0
  let inCall = false
  let callActions = 0
  let didRequest = false
  let didAcceptance = false

  async function unknown(reason: 'request' | 'acceptance' | 'after_io') {
    fenced = true
    try {
      await options.onUnknown(reason)
    } catch {
      /* preserve original ambiguity */
    }
  }

  async function handle(raw: unknown): Promise<TrustedWorkerBridgeResponse> {
    let requestId = 'invalid'
    let action: Action | undefined
    try {
      if (jsonBytes(raw) > trustedWorkerBridgeMaxBytes) throw new Error('Oversize bridge request.')
      const request = record(raw)
      if (typeof request.requestId === 'string' && id.test(request.requestId)) requestId = request.requestId
      if (
        request.caseId !== options.caseId ||
        request.capability !== options.capability ||
        !id.test(requestId) ||
        requestId === 'invalid' ||
        seen.has(requestId) ||
        typeof request.action !== 'string' ||
        !actions.has(request.action as Action) ||
        Object.keys(request).sort().join(',') !== 'action,capability,caseId,payload,requestId'
      )
        throw new Error('Bridge request identity is invalid.')
      seen.add(requestId)
      requestCount++
      if (requestCount > (options.maxRequests ?? 190)) throw new Error('Bridge request ceiling exceeded.')
      action = request.action as Action
      if (fenced) return { requestId, ok: false, code: 'FENCED' }
      const payload = record(request.payload)
      let value: unknown
      switch (action) {
        case 'bootstrap':
          if (bootstrapped || Object.keys(payload).length) throw new Error('Duplicate bridge bootstrap.')
          bootstrapped = true
          value = bootstrap
          break
        case 'bindProfile':
          if (!bootstrapped || bound || !exact(payload, { advertisedProfile: expectedProfile }))
            throw new Error('Bridge advertised profile mismatch.')
          bound = true
          value = { bound: true }
          break
        case 'authorize': {
          if (
            !bound ||
            !exact(payload.binding, options.binding) ||
            (payload.stage !== 'before_io' && payload.stage !== 'after_io')
          )
            throw new Error('Bridge authority scope mismatch.')
          if (payload.stage === 'before_io') {
            if (inCall) throw new Error('Overlapping scoped calls are forbidden.')
            inCall = true
            callActions = 1
            didRequest = false
            didAcceptance = false
            scopedCallCount++
          } else {
            if (!inCall || ++callActions > 4 || (didRequest && !didAcceptance))
              throw new Error('Scoped call action ceiling exceeded.')
          }
          await options.authorize(options.binding, payload.stage)
          if (payload.stage === 'after_io') inCall = false
          value = { authorized: true }
          break
        }
        case 'request': {
          if (
            !bound ||
            !inCall ||
            didRequest ||
            ++callActions > 4 ||
            typeof payload.path !== 'string' ||
            !payload.path.startsWith('quality/journeys/') ||
            !payload.options ||
            typeof payload.options !== 'object'
          )
            throw new Error('Bridge request scope mismatch.')
          const requestOptions = record(payload.options)
          if (
            requestOptions.method !== 'POST' ||
            typeof requestOptions.body !== 'string' ||
            Object.keys(requestOptions).sort().join(',') !== 'body,method'
          )
            throw new Error('Bridge request shape mismatch.')
          didRequest = true
          try {
            value = await options.request(payload.path, requestOptions as { method: string; body: string })
          } catch {
            await unknown('request')
            throw new Error('Canonical request outcome unknown.')
          }
          break
        }
        case 'readAcceptance': {
          if (
            !bound ||
            !inCall ||
            !didRequest ||
            didAcceptance ||
            ++callActions > 4 ||
            !exact(payload.binding, options.binding) ||
            typeof payload.toolName !== 'string' ||
            typeof payload.idempotencyKey !== 'string' ||
            typeof payload.requestHash !== 'string'
          )
            throw new Error('Bridge acceptance scope mismatch.')
          try {
            value = await options.readAcceptance({
              binding: options.binding,
              toolName: payload.toolName,
              idempotencyKey: payload.idempotencyKey,
              requestHash: payload.requestHash,
            })
            didAcceptance = true
          } catch {
            await unknown('acceptance')
            throw new Error('Canonical acceptance unknown.')
          }
          break
        }
      }
      try {
        const response = { requestId, ok: true, value: copyBounded(value) }
        if (jsonBytes(response) > trustedWorkerBridgeMaxBytes) throw new Error('Bridge response exceeds bound.')
        return response
      } catch {
        if (action === 'request' || action === 'readAcceptance') await unknown('acceptance')
        throw new Error('Bridge response could not be serialized within bounds.')
      }
    } catch {
      if (action === 'authorize') {
        const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).payload : null
        if (payload && typeof payload === 'object' && (payload as Record<string, unknown>).stage === 'after_io')
          await unknown('after_io')
      }
      return { requestId, ok: false, code: fenced ? 'FENCED' : 'INVALID' }
    }
  }
  return Object.freeze({
    handle,
    get fenced() {
      return fenced
    },
    get bound() {
      return bound
    },
    get requestCount() {
      return requestCount
    },
    get scopedCallCount() {
      return scopedCallCount
    },
  })
}

/** Child-side request channel. Exchange can be injected for in-memory tests. */
export function createTrustedWorkerBridgeClient(options: {
  caseId: string
  capability: string
  exchange: TrustedWorkerBridgeExchange
  onAmbiguous?: (action: Action) => void
}) {
  if (!id.test(options.caseId) || !/^[A-Za-z0-9_-]{32,200}$/.test(options.capability))
    throw new Error('Invalid trusted bridge case identity.')
  let ambiguous = false
  const markAmbiguous = (action: Action) => {
    ambiguous = true
    options.onAmbiguous?.(action)
  }
  async function call<T>(action: Action, payload: Record<string, unknown>): Promise<T> {
    if (ambiguous) throw new Error('Trusted bridge outcome remains unknown.')
    const request: TrustedWorkerBridgeRequest = {
      caseId: options.caseId,
      capability: options.capability,
      requestId: randomUUID(),
      action,
      payload,
    }
    let raw: unknown
    try {
      raw = await options.exchange(copyBounded(request))
    } catch {
      markAmbiguous(action)
      throw new Error('Trusted bridge response unavailable; outcome may be unknown.')
    }
    try {
      if (jsonBytes(raw) > trustedWorkerBridgeMaxBytes) throw new Error('Oversize response.')
      const response = record(raw)
      if (response.requestId !== request.requestId || typeof response.ok !== 'boolean')
        throw new Error('Bridge correlation mismatch.')
      if (!response.ok) throw new Error('Trusted bridge refused request.')
      return copyBounded(response.value) as T
    } catch {
      markAmbiguous(action)
      throw new Error('Trusted bridge response invalid; outcome may be unknown.')
    }
  }
  return Object.freeze({ call })
}

/** Construct the real SDK endpoint only after bootstrap and profile binding. */
export async function createTrustedWorkerBridgeEndpoint(client: ReturnType<typeof createTrustedWorkerBridgeClient>) {
  const bootstrap = await client.call<{ binding: ExternalWorkerBinding; frozenReads: FrozenWorkerRead[] }>(
    'bootstrap',
    {},
  )
  const endpoint = createExternalWorkerMcpServer({
    context: {
      api: {
        request: (path: string, options?: { method?: string; body?: string }) =>
          client.call('request', { path, options }),
      },
      options: {},
    } as unknown as Omit<McpRegistryContext, 'server'>,
    binding: bootstrap.binding,
    frozenReads: bootstrap.frozenReads,
    authorize: (binding, stage) => client.call('authorize', { binding, stage }),
    readAcceptance: input => client.call('readAcceptance', input),
  })
  await client.call('bindProfile', { advertisedProfile: endpoint.advertisedProfile })
  return endpoint
}

/** Inert until its returned exchange is called; one POST, no redirect or retry. */
export function createLoopbackTrustedWorkerExchange(rawUrl: string): TrustedWorkerBridgeExchange {
  const url = new URL(rawUrl)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== trustedWorkerBridgePath ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Trusted bridge endpoint must be the fixed loopback route.')
  return async request => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(copyBounded(request)),
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok || !response.body) throw new Error('Trusted bridge HTTP response unavailable.')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        total += next.value.byteLength
        if (total > trustedWorkerBridgeMaxBytes) throw new Error('Trusted bridge HTTP response exceeds bound.')
        chunks.push(next.value)
      }
    } finally {
      reader.releaseLock()
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  }
}
