import { createHash, randomUUID } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js'
import { createAttemptScopedWorkerMcpServer, type AttemptScopedWorkerProfile } from './managed-worker-server.js'

type ManagedOfflineCompositionReceipt = Readonly<{
  provenance: 'OFFLINE_SYNTHETIC'
  runtimeQualified: false
  dispatchAllowed: false
  profileDigest: string
  sdkToolsDigest: string
  role: string
  state: 'READY' | 'IN_FLIGHT' | 'FENCED' | 'CLOSED'
  calls: readonly Readonly<{
    callId: string
    toolName: string
    argumentsDigest: string
    outputDigest: string | null
    callbackCount: number
  }>[]
}>
export type TrustedManagedWorkerOfflineOptions = Readonly<{
  provenance: 'OFFLINE_SYNTHETIC'
  profile: AttemptScopedWorkerProfile
  expectedProfileDigest: string
  maxCalls?: number
  maxResultBytes?: number
  timeoutMs?: number
}>
class ManagedOfflineCompositionError extends Error {
  constructor(readonly disposition: 'REFUSED' | 'UNKNOWN') {
    super(`Managed offline composition ${disposition.toLowerCase()}.`)
    this.name = 'ManagedOfflineCompositionError'
  }
}
function refuse(): never {
  throw new ManagedOfflineCompositionError('REFUSED')
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonical((value as Record<string, unknown>)[key])]),
  )
}
function hash(value: unknown) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')}`
}
function copy<T>(value: T, maximum: number): T {
  const encoded = JSON.stringify(value)
  if (encoded === undefined || Buffer.byteLength(encoded) > maximum) refuse()
  return JSON.parse(encoded) as T
}
function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
function within(value: number, maximum: number) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) refuse()
  return value
}
function capture(options: TrustedManagedWorkerOfflineOptions) {
  if (options.provenance !== 'OFFLINE_SYNTHETIC') refuse()
  return {
    profile: freeze(copy(options.profile, 1_048_576)),
    expected: options.expectedProfileDigest,
    maxCalls: within(options.maxCalls ?? 16, 16),
    maxResultBytes: within(options.maxResultBytes ?? 1_048_576, 1_048_576),
    timeoutMs: within(options.timeoutMs ?? 60_000, 60_000),
  }
}
function timed<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ManagedOfflineCompositionError('UNKNOWN')), milliseconds)
    operation.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        reject(new ManagedOfflineCompositionError('UNKNOWN'))
      },
    )
  })
}
type Pending = {
  callId: string
  toolName: string
  argumentsDigest: string
  outputDigest: string | null
  callbackCount: number
  canonical: () => Promise<unknown>
  value?: unknown
}

/** Private in-memory SDK plumbing only. Its opaque callback token is not an Appraise assignment grant. */
async function build(options: TrustedManagedWorkerOfflineOptions) {
  const captured = capture(options)
  const token = `offline-callback-${randomUUID()}`
  let state: ManagedOfflineCompositionReceipt['state'] = 'READY',
    pending: Pending | undefined
  const calls: Array<Omit<Pending, 'canonical' | 'value'>> = []
  let closeFlight: Promise<void> | undefined
  const server = createAttemptScopedWorkerMcpServer({
    profile: captured.profile,
    expectedProfileDigest: captured.expected,
    sealedGrant: token,
    callGateway: async input => {
      const current = pending
      if (
        state !== 'IN_FLIGHT' ||
        !current ||
        current.callbackCount ||
        input.sealedGrant !== token ||
        input.profileDigest !== captured.expected
      )
        refuse()
      if (input.toolName !== current.toolName || hash(input.arguments) !== current.argumentsDigest) refuse()
      current.callbackCount++
      current.value = copy(await current.canonical(), captured.maxResultBytes)
      current.outputDigest = hash(current.value)
      // This receipt correlates local callback bytes only. Root canonical acceptance remains separate.
      return {
        result: current.value,
        receipt: {
          provenance: 'OFFLINE_SYNTHETIC',
          kind: 'CALLBACK_CORRELATION',
          callId: current.callId,
          argumentsDigest: current.argumentsDigest,
          outputDigest: current.outputDigest,
          runtimeQualified: false,
        },
      }
    },
  })
  const client = new Client({ name: 'appraise-managed-offline-composition', version: '1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const close = () => {
    state = 'CLOSED'
    closeFlight ??= Promise.all([client.close(), server.close()]).then(() => undefined)
    return closeFlight
  }
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const listed = await client.listTools()
    const tools = listed.tools.map(tool => ({ name: tool.name, inputSchema: tool.inputSchema }))
    const expected = captured.profile.tools.map(tool => ({ name: tool.name, inputSchema: tool.inputSchema }))
    if (hash(tools) !== hash(expected)) refuse()
    const sdkToolsDigest = hash(tools),
      provider = new AjvJsonSchemaValidator()
    const validators = new Map(tools.map(tool => [tool.name, provider.getValidator(tool.inputSchema as never)]))
    function snapshot(): ManagedOfflineCompositionReceipt {
      return freeze({
        provenance: 'OFFLINE_SYNTHETIC',
        runtimeQualified: false,
        dispatchAllowed: false,
        profileDigest: captured.expected,
        sdkToolsDigest,
        role: captured.profile.role,
        state,
        calls: copy(calls, 1_048_576),
      })
    }
    function admit(toolName: string, args: Record<string, unknown>, canonicalThunk: () => Promise<unknown>) {
      if (state !== 'READY' || calls.length >= captured.maxCalls || typeof canonicalThunk !== 'function') refuse()
      const validation = validators.get(toolName)?.(args)
      if (!validation?.valid || hash(validation.data) !== hash(args)) refuse()
      const current: Pending = {
        callId: `offline-call-${calls.length + 1}`,
        toolName,
        argumentsDigest: hash(args),
        outputDigest: null,
        callbackCount: 0,
        canonical: canonicalThunk,
      }
      state = 'IN_FLIGHT'
      pending = current
      return current
    }
    function matchesCorrelation(value: unknown, current: Pending) {
      const correlation = value as { callId?: unknown; kind?: unknown; outputDigest?: unknown }
      return (
        correlation?.kind === 'CALLBACK_CORRELATION' &&
        correlation.callId === current.callId &&
        correlation.outputDigest === current.outputDigest
      )
    }
    function verify(result: unknown, current: Pending) {
      if (state !== 'IN_FLIGHT' || current.callbackCount !== 1 || !current.outputDigest) refuse()
      const structured = result as { isError?: boolean; structuredContent?: { result?: unknown; receipt?: unknown } }
      if (
        structured.isError ||
        !structured.structuredContent ||
        hash(structured.structuredContent.result) !== current.outputDigest
      )
        refuse()
      if (!matchesCorrelation(structured.structuredContent.receipt, current)) refuse()
      return copy(current.value, captured.maxResultBytes)
    }
    async function exchange(
      toolName: string,
      args: Readonly<Record<string, unknown>>,
      canonicalThunk: () => Promise<unknown>,
    ): Promise<unknown> {
      const argumentsValue = copy(args, captured.maxResultBytes),
        current = admit(toolName, argumentsValue, canonicalThunk)
      try {
        const result = await timed(client.callTool({ name: toolName, arguments: argumentsValue }), captured.timeoutMs)
        const value = verify(result, current)
        state = 'READY'
        return value
      } catch {
        if (state !== 'CLOSED') state = 'FENCED'
        throw new ManagedOfflineCompositionError('UNKNOWN')
      } finally {
        calls.push({
          callId: current.callId,
          toolName: current.toolName,
          argumentsDigest: current.argumentsDigest,
          outputDigest: current.outputDigest,
          callbackCount: current.callbackCount,
        })
        pending = undefined
      }
    }
    return Object.freeze({
      exchange,
      snapshot,
      close,
      managedProfileDigest: captured.expected,
      supportedOperations: Object.freeze(tools.map(tool => tool.name)),
    })
  } catch {
    await close()
    return refuse()
  }
}

export async function createTrustedManagedWorkerOfflineComposition(options: TrustedManagedWorkerOfflineOptions) {
  try {
    return await build(options)
  } catch {
    return refuse()
  }
}
