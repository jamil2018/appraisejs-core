import { createHash } from 'node:crypto'
import { z } from 'zod'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { externalWorkerTools, type ExternalWorkerAcceptance } from './external-worker-gateway.js'
import { createExternalWorkerMcpServer } from './external-worker-server.js'
import {
  createTrustedWorkerBridgeClient,
  createTrustedWorkerBridgeEndpoint,
  createTrustedWorkerBridgeServer,
} from './trusted-worker-bridge.js'
import {
  constructTrustedWorkerNativeCall,
  correlateTrustedWorkerNativeCalls,
  prepareTrustedWorkerNativeRoute,
  type ConstructedTrustedCall,
  type PreparedTrustedRoute,
  type TrustedRouteInput,
} from './trusted-worker-native-route.js'

type BridgeOptions = Parameters<typeof createTrustedWorkerBridgeServer>[0]
type Endpoint = ReturnType<typeof createExternalWorkerMcpServer>
type RouteContext = Readonly<
  Pick<Endpoint, 'profile' | 'advertisedProfile'> & {
    sdkListedTools: readonly Readonly<{ name: string; inputSchema: unknown }>[]
  }
>
export type OfflineSyntheticWorkerCaller = Readonly<{
  provenance: 'OFFLINE_SYNTHETIC'
  invoke(
    call: ConstructedTrustedCall,
    dispatch: (operation: string, argumentsValue: Record<string, unknown>) => Promise<CallToolResult>,
  ): Promise<unknown>
}>
export type TrustedWorkerOfflineOptions = Omit<BridgeOptions, 'expectedAdvertisedProfile'> &
  Readonly<{
    provenance: 'OFFLINE_SYNTHETIC'
    route: (context: RouteContext) => TrustedRouteInput
    caller: OfflineSyntheticWorkerCaller
    timeoutMs?: number
  }>
type OfflineWorkerCall = Readonly<{
  operation: string
  arguments: Record<string, unknown>
  outerCallId: string
  innerCallId: string
}>

class OfflineWorkerCompositionError extends Error {
  constructor(readonly disposition: 'REFUSED' | 'UNKNOWN') {
    super(`Offline worker composition ${disposition.toLowerCase()}.`)
    this.name = 'OfflineWorkerCompositionError'
  }
}
function refuse(): never {
  throw new OfflineWorkerCompositionError('REFUSED')
}
const identifier = /^[A-Za-z0-9._:-]{1,200}$/
const digest = /^sha256:[a-f0-9]{64}$/
const jsonLimit = 256 * 1024
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, stable(child)]),
  )
}
function hash(value: unknown) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')}`
}
function boundedCopy<T>(value: T): T {
  const encoded = JSON.stringify(value)
  if (encoded === undefined || Buffer.byteLength(encoded) > jsonLimit) return refuse()
  return JSON.parse(encoded) as T
}
function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(child => freeze(child))
    Object.freeze(value)
  }
  return value
}
function captureRoute(input: TrustedRouteInput): TrustedRouteInput {
  return {
    request: { ...input.request, headers: { ...input.request.headers }, body: Buffer.from(input.request.body) },
    context: { ...input.context },
    profile: boundedCopy(input.profile),
    advertisedProfile: boundedCopy(input.advertisedProfile),
    sdkListedTools: boundedCopy(input.sdkListedTools),
    mcpServerName: input.mcpServerName,
    routes: input.routes.map(route => ({
      ...route,
      ...(route.wrapper ? { wrapper: Object.freeze({ ...route.wrapper }) } : {}),
    })),
    limits: { ...input.limits },
  }
}
function requirePrepared(input: TrustedRouteInput): PreparedTrustedRoute {
  const prepared = prepareTrustedWorkerNativeRoute(input)
  if (prepared.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED') refuse()
  return prepared
}
function timed<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new OfflineWorkerCompositionError('UNKNOWN')), milliseconds)
    operation.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        reject(new OfflineWorkerCompositionError('UNKNOWN'))
      },
    )
  })
}
function acceptedResult(value: CallToolResult, acceptance: ExternalWorkerAcceptance | null) {
  if (!acceptance) return false
  const text = value.content.find(item => item.type === 'text')
  return text?.type === 'text' && hash(JSON.parse(text.text)) === hash(acceptance)
}
const acceptanceSchema = z
  .object({
    receiptId: z.string().regex(identifier),
    assignmentId: z.string().regex(identifier),
    attemptId: z.string().regex(identifier),
    operation: z.string().min(1).max(200),
    idempotencyKey: z.string().regex(identifier),
    requestHash: z.string().regex(digest),
    artifactIds: z.array(z.string().regex(identifier)).min(1).max(1536),
  })
  .strict()
function matchingAcceptance(
  value: ExternalWorkerAcceptance | null,
  binding: BridgeOptions['binding'],
  request: { operation: string; idempotencyKey: string; requestHash: string },
) {
  if (!value) return null
  const parsed = acceptanceSchema.safeParse(value)
  if (!parsed.success) return refuse()
  const subject = { assignmentId: binding.assignmentId, attemptId: binding.attemptId, ...request }
  if (!Object.entries(subject).every(([key, expected]) => parsed.data[key as keyof typeof subject] === expected))
    return refuse()
  if (JSON.stringify(parsed.data).includes(binding.assignmentSecret)) return refuse()
  return freeze(parsed.data)
}

/** Observer settlement never owns admission, cleanup, or the caller's existing deadline. */
function notifyUnknown(observer: BridgeOptions['onUnknown'], reason: Parameters<BridgeOptions['onUnknown']>[0]): void {
  try {
    void Promise.resolve(observer(reason)).catch(() => {
      /* preserve bounded UNKNOWN without raw observer errors */
    })
  } catch {
    /* synchronous observer failure cannot interrupt fencing or original SDK cleanup */
  }
}

/** In-memory composition only. It never grants native dispatch, creates a listener or acquires a provider. */
function captureOptions(options: TrustedWorkerOfflineOptions) {
  const { provenance, caseId, capability, authorize, request, readAcceptance, onUnknown, maxRequests, route } = options
  const timeoutMs = options.timeoutMs ?? 60_000
  const caller = options.caller.invoke
  if (
    provenance !== 'OFFLINE_SYNTHETIC' ||
    options.caller.provenance !== 'OFFLINE_SYNTHETIC' ||
    typeof caller !== 'function' ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60_000
  )
    refuse()
  const binding = boundedCopy(options.binding),
    frozenReads = boundedCopy(options.frozenReads)
  return {
    caseId,
    capability,
    authorize,
    request,
    readAcceptance,
    onUnknown: (reason: Parameters<BridgeOptions['onUnknown']>[0]) => notifyUnknown(onUnknown, reason),
    maxRequests,
    route,
    timeoutMs,
    caller,
    binding,
    frozenReads,
  }
}
async function buildOfflineComposition(options: TrustedWorkerOfflineOptions) {
  const {
    caseId,
    capability,
    authorize,
    request,
    readAcceptance,
    onUnknown,
    maxRequests,
    route,
    timeoutMs,
    caller,
    binding,
    frozenReads,
  } = captureOptions(options)
  let lastAcceptance: ExternalWorkerAcceptance | null = null
  const acceptance = async (input: Parameters<BridgeOptions['readAcceptance']>[0]) => {
    const result = await readAcceptance(input)
    lastAcceptance = boundedCopy(result)
    return result
  }
  const canonical = {
    binding,
    frozenReads,
    authorize,
    readAcceptance: acceptance,
    context: { api: { request }, options: {} } as Parameters<typeof createExternalWorkerMcpServer>[0]['context'],
  }
  const advertised = createExternalWorkerMcpServer(canonical)
  const bridge = createTrustedWorkerBridgeServer({
    caseId,
    capability,
    binding,
    frozenReads,
    authorize,
    request,
    readAcceptance: acceptance,
    onUnknown,
    maxRequests,
    expectedAdvertisedProfile: advertised.advertisedProfile,
  })
  const bridgeClient = createTrustedWorkerBridgeClient({ caseId, capability, exchange: bridge.handle })
  const endpoint = await createTrustedWorkerBridgeEndpoint(bridgeClient)
  const client = new Client({ name: 'appraise-offline-composition', version: '1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  let fenced = false,
    inFlight = false,
    issued = 0,
    resultBytes = 0
  let closeFlight: Promise<void> | undefined
  const ids = new Set<string>()
  const close = () => {
    fenced = true
    closeFlight ??= Promise.all([client.close(), endpoint.server.close(), advertised.server.close()]).then(
      () => undefined,
    )
    return closeFlight
  }
  try {
    await endpoint.server.connect(serverTransport)
    await client.connect(clientTransport)
    const listed = await client.listTools()
    const context = freeze({
      profile: endpoint.profile,
      advertisedProfile: endpoint.advertisedProfile,
      sdkListedTools: boundedCopy(listed.tools),
    })
    const routeInput = captureRoute(route(context))
    if (
      hash(routeInput.profile) !== hash(context.profile) ||
      hash(routeInput.advertisedProfile) !== hash(context.advertisedProfile)
    )
      refuse()
    const prepared = requirePrepared(routeInput)

    function admit(input: OfflineWorkerCall) {
      if (
        fenced ||
        inFlight ||
        issued >= prepared.limits.innerCalls ||
        ids.has(input.outerCallId) ||
        ids.has(input.innerCallId)
      )
        refuse()
      const call = boundedCopy(input)
      const constructed = constructTrustedWorkerNativeCall({ routeInput, prepared, ...call })
      if (constructed.status !== 'CONSTRUCTED_NOT_DISPATCHED' || call.outerCallId === call.innerCallId) refuse()
      ids.add(call.outerCallId)
      ids.add(call.innerCallId)
      issued++
      inFlight = true
      lastAcceptance = null
      return { call, constructed }
    }
    function originalDispatch(call: OfflineWorkerCall, constructed: ConstructedTrustedCall) {
      let dispatched = false,
        innerResult: CallToolResult | undefined
      const dispatch = async (operation: string, argumentsValue: Record<string, unknown>) => {
        if (fenced || dispatched || operation !== call.operation) refuse()
        const candidate = constructTrustedWorkerNativeCall({ routeInput, prepared, ...call, arguments: argumentsValue })
        if (
          candidate.status !== 'CONSTRUCTED_NOT_DISPATCHED' ||
          candidate.innerArgumentsHash !== constructed.innerArgumentsHash
        )
          refuse()
        dispatched = true
        innerResult = (await client.callTool({
          name: operation,
          arguments: boundedCopy(argumentsValue),
        })) as CallToolResult
        return boundedCopy(innerResult)
      }
      return { dispatch, result: () => innerResult }
    }
    function correlateResult(
      constructed: ConstructedTrustedCall,
      outerResult: unknown,
      innerResult: CallToolResult | undefined,
    ) {
      if (fenced || !innerResult || innerResult.isError) throw new Error()
      const correlation = correlateTrustedWorkerNativeCalls(
        prepared,
        routeInput,
        [constructed],
        [{ ...constructed, outerResult, innerResult }],
      )
      if (correlation.status !== 'CORRELATED_OFFLINE_ONLY') throw new Error()
      resultBytes += correlation.resultBytes
      if (resultBytes > prepared.limits.resultBytes) throw new Error()
      return { correlation, innerResult }
    }
    function receipt(
      call: OfflineWorkerCall,
      innerResult: CallToolResult,
      correlation: ReturnType<typeof correlateResult>['correlation'],
    ) {
      const accepted = acceptedResult(innerResult, lastAcceptance)
      if (call.operation.startsWith('quality_journey_external_') && !accepted) throw new Error()
      const witness = accepted ? lastAcceptance : null
      return freeze({
        provenance: 'OFFLINE_SYNTHETIC' as const,
        runtimeQualified: false as const,
        observedNativeTuple: null,
        dispatchAllowed: false as const,
        accepted,
        operation: call.operation,
        idempotencyKey: typeof call.arguments.idempotencyKey === 'string' ? call.arguments.idempotencyKey : null,
        acceptanceDigest: witness ? hash(witness) : null,
        canonicalAcceptance: boundedCopy(witness),
        value: boundedCopy(innerResult),
        correlation,
      })
    }
    async function invoke(input: OfflineWorkerCall) {
      const { call, constructed } = admit(input)
      const original = originalDispatch(call, constructed)
      try {
        const outerResult = await timed(
          Promise.resolve().then(() => caller(constructed, original.dispatch)),
          timeoutMs,
        )
        const result = correlateResult(constructed, outerResult, original.result())
        return receipt(call, result.innerResult, result.correlation)
      } catch {
        fenced = true
        onUnknown('request')
        throw new OfflineWorkerCompositionError('UNKNOWN')
      } finally {
        inFlight = false
      }
    }
    async function readCommittedAcceptance(input: { operation: string; idempotencyKey: string; requestHash: string }) {
      if (
        !externalWorkerTools[binding.role].includes(input.operation as never) ||
        !identifier.test(input.idempotencyKey) ||
        !digest.test(input.requestHash)
      )
        refuse()
      try {
        const value = await timed(
          Promise.resolve().then(() =>
            readAcceptance({
              binding,
              toolName: input.operation,
              idempotencyKey: input.idempotencyKey,
              requestHash: input.requestHash,
            }),
          ),
          timeoutMs,
        )
        return matchingAcceptance(value, binding, input)
      } catch (error) {
        if (error instanceof OfflineWorkerCompositionError) throw error
        throw new OfflineWorkerCompositionError('UNKNOWN')
      }
    }
    return Object.freeze({
      invoke,
      readCommittedAcceptance,
      close,
      externalGatewayProfileDigest: endpoint.profile.profileDigest,
      advertisedProfileDigest: endpoint.advertisedProfile.profileDigest,
      provenance: 'OFFLINE_SYNTHETIC' as const,
      runtimeQualified: false as const,
      dispatchAllowed: false as const,
    })
  } catch {
    await close()
    return refuse()
  }
}

/** A supplied fake caller is code authority, never evidence of native support or permission to dispatch. */
export async function createTrustedWorkerOfflineComposition(options: TrustedWorkerOfflineOptions) {
  try {
    return await buildOfflineComposition(options)
  } catch {
    return refuse()
  }
}
