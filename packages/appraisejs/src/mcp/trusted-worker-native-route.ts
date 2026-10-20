import { createHash } from 'node:crypto'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js'

import {
  externalWorkerTools,
  type ExternalWorkerRole,
  type createExternalWorkerGateway,
} from './external-worker-gateway.js'
import type { ExternalWorkerAdvertisedProfile } from './external-worker-server.js'
import {
  NativeDescriptorCollector,
  type DescriptorRequest,
  type TrustedDescriptorContext,
} from './native-descriptor-capture.js'

type Profile = ReturnType<typeof createExternalWorkerGateway>['profile']
type JsonObject = Record<string, unknown>
const digestPattern = /^sha256:[a-f0-9]{64}$/
const identifier = /^[A-Za-z0-9._:-]{1,200}$/
const maxResultBytes = 256 * 1024
const rejectedAuthorityFields = [
  'target',
  'targetProjectId',
  'journeyId',
  'assignmentGeneration',
  'coordinatorGeneration',
  'assignmentSecret',
  'leaseId',
  'principal',
] as const
const rejectedAbsentOperations = [
  'quality_journey_analysis_answer',
  'quality_journey_analysis_decide',
  'quality_journey_command_submit',
  'quality_journey_execution_start',
  'quality_journey_external_work_claim_v1',
  'quality_journey_get',
] as const
const rejectionSelectors = [
  'A01',
  'A02',
  'A03',
  'A04',
  'A05',
  'A06',
  'A07',
  'A08',
  'A09',
  'A10',
  'A11',
  'A12',
  'A13',
  'A14',
  'D01',
  'T01',
] as const
export type TrustedRejectionSelector = (typeof rejectionSelectors)[number]

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new Error('Non-JSON value')
    return encoded
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stable((value as JsonObject)[key])}`)
    .join(',')}}`
}
const hash = (value: unknown) => `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`
const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const blocked = (reason: string) =>
  Object.freeze({
    status: 'BLOCKED' as const,
    reason,
    runtimeQualified: false as const,
    dispatchAllowed: false as const,
  })

/** A wrapper is a reviewed protocol assertion, never inferred from a generic executor name. */
export type TrustedWrapperCodec = Readonly<{
  version: 'M02_TRUSTED_WRAPPER_V1'
  provenance: 'OFFLINE_SYNTHETIC' | 'CAPTURED_REVIEWED'
  semantics: string
  codecDigest: string
  /** Exact absent methods the reviewed wrapper can convey to its scoped MCP child. */
  rejectionProbeOperations?: readonly string[]
  /** This callback must be supplied by the trusted supervisor from the reviewed codec. */
  encode: (input: Readonly<{ operation: string; innerCallId: string; arguments: JsonObject }>) => unknown
  decodeInput: (outerArguments: unknown) => Readonly<{ operation: string; innerCallId: string; arguments: JsonObject }>
  decode: (outerResult: unknown) => Readonly<{ operation: string; innerCallId: string; result: unknown }>
  /** Required for custom grammar; function descriptors are also checked against their actual schema. */
  validateOuter?: (encoded: unknown) => boolean
}>
export type TrustedNativeRoute = Readonly<{
  operation: string
  nativeName: string
  descriptorHash: string
  mode: 'DIRECT_MCP' | 'REVIEWED_WRAPPER'
  wrapper?: TrustedWrapperCodec
}>
export type TrustedRouteInput = Readonly<{
  request: DescriptorRequest
  context: TrustedDescriptorContext
  profile: Profile
  advertisedProfile: ExternalWorkerAdvertisedProfile
  /** Exact result of this endpoint's SDK tools/list, supplied by the offline harness. */
  sdkListedTools: readonly Readonly<{ name: string; inputSchema: unknown }>[]
  mcpServerName: string
  routes: readonly TrustedNativeRoute[]
  /** Fixed per-case ceilings. This version models one outer invocation per inner operation. */
  limits: Readonly<{ outerCalls: number; innerCalls: number; resultBytes: number }>
}>
export type PreparedTrustedRoute = Readonly<{
  status: 'PREPARED_NOT_RUNTIME_QUALIFIED'
  version: 'M02_TRUSTED_NATIVE_ROUTE_V1'
  role: ExternalWorkerRole
  profileDigest: string
  advertisedProfileDigest: string
  requestByteHash: string
  containerHash: string
  descriptorHash: string
  provenance: Readonly<TrustedDescriptorContext & { attestation: 'SUPPLIED_NOT_ATTESTED' }>
  routes: readonly Readonly<
    Omit<TrustedNativeRoute, 'wrapper'> & {
      wrapper?: Readonly<
        Omit<TrustedWrapperCodec, 'encode' | 'decodeInput' | 'decode' | 'validateOuter'> & {
          implementationHash: string
        }
      >
    }
  >[]
  limits: Readonly<{ outerCalls: number; innerCalls: number; resultBytes: number }>
  runtimeQualified: false
  dispatchAllowed: false
}>

/** Pure route preparation. The returned receipt does not grant a dispatch or claim host isolation. */
export function prepareTrustedWorkerNativeRoute(
  input: TrustedRouteInput,
): PreparedTrustedRoute | ReturnType<typeof blocked> {
  try {
    const capture = new NativeDescriptorCollector().capture(input.request, input.context)
    if (capture.status !== 'CAPTURED') return blocked(`CAPTURE_${capture.reason}`)
    const profile = structuredClone(input.profile)
    const advertised = structuredClone(input.advertisedProfile)
    const routes = [...input.routes]
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(input.mcpServerName)) return blocked('INVALID_SERVER_BINDING')
    const expected = externalWorkerTools[profile.role]
    if (
      !expected ||
      profile.resources.length !== 0 ||
      profile.tools.length !== expected.length ||
      new Set(profile.tools.map(tool => tool.name)).size !== expected.length ||
      !expected.every(name => profile.tools.some(tool => tool.name === name))
    )
      return blocked('INVALID_ROLE_PROFILE')
    if (
      hash({ role: profile.role, tools: profile.tools, resources: [] }) !== profile.profileDigest ||
      profile.tools.some(tool => hash(tool.inputSchema) !== tool.workerSchemaHash)
    )
      return blocked('PROFILE_HASH_MISMATCH')
    if (
      advertised.gatewayProfileDigest !== profile.profileDigest ||
      advertised.tools.length !== expected.length ||
      new Set(advertised.tools.map(tool => tool.name)).size !== expected.length ||
      !expected.every(name => advertised.tools.some(tool => tool.name === name)) ||
      hash({ gatewayProfileDigest: advertised.gatewayProfileDigest, tools: advertised.tools }) !==
        advertised.profileDigest ||
      advertised.tools.some(tool => hash(tool.inputSchema) !== tool.schemaHash)
    )
      return blocked('ADVERTISED_PROFILE_MISMATCH')
    if (
      input.sdkListedTools.length !== expected.length ||
      new Set(input.sdkListedTools.map(tool => tool.name)).size !== expected.length ||
      !input.sdkListedTools.every(listed =>
        advertised.tools.some(tool => tool.name === listed.name && tool.schemaHash === hash(listed.inputSchema)),
      )
    )
      return blocked('SDK_LIST_MISMATCH')
    if (
      !Number.isInteger(input.limits.outerCalls) ||
      input.limits.outerCalls < 1 ||
      input.limits.outerCalls > 64 ||
      !Number.isInteger(input.limits.innerCalls) ||
      input.limits.innerCalls < 1 ||
      input.limits.innerCalls > 16 ||
      input.limits.innerCalls > input.limits.outerCalls ||
      !Number.isInteger(input.limits.resultBytes) ||
      input.limits.resultBytes < 1 ||
      input.limits.resultBytes > maxResultBytes
    )
      return blocked('INVALID_LIMITS')
    if (routes.length !== expected.length || new Set(routes.map(route => route.operation)).size !== expected.length)
      return blocked('INCOMPLETE_OPERATION_MAP')
    const nativeNames = new Set(capture.callables.map(callable => callable.name))
    const output: PreparedTrustedRoute['routes'][number][] = []
    for (const route of routes) {
      if (!expected.includes(route.operation as never)) return blocked('CROSS_ROLE_OPERATION')
      const callable = capture.callables.find(item => item.name === route.nativeName)
      if (!callable || callable.descriptorHash !== route.descriptorHash) return blocked('DESCRIPTOR_MISMATCH')
      if (route.mode === 'DIRECT_MCP') {
        if (route.wrapper !== undefined || callable.type !== 'function') return blocked('INVALID_DIRECT_ROUTE')
        if (
          route.nativeName !== route.operation &&
          route.nativeName !== `mcp__${input.mcpServerName}__${route.operation}`
        )
          return blocked('UNSUPPORTED_DIRECT_ROUTE')
        const descriptor = isObject(callable.descriptor.function) ? callable.descriptor.function : callable.descriptor
        if (hash(descriptor.parameters) !== advertised.tools.find(tool => tool.name === route.operation)?.schemaHash)
          return blocked('NATIVE_SCHEMA_MISMATCH')
      } else if (route.mode === 'REVIEWED_WRAPPER') {
        const codec = route.wrapper
        if (
          !codec ||
          codec.version !== 'M02_TRUSTED_WRAPPER_V1' ||
          !['OFFLINE_SYNTHETIC', 'CAPTURED_REVIEWED'].includes(codec.provenance) ||
          !codec.semantics.trim() ||
          codec.semantics.length > 4000 ||
          !digestPattern.test(codec.codecDigest) ||
          (codec.rejectionProbeOperations !== undefined &&
            (new Set(codec.rejectionProbeOperations).size !== codec.rejectionProbeOperations.length ||
              codec.rejectionProbeOperations.some(name => !rejectedAbsentOperations.includes(name as never)))) ||
          typeof codec.encode !== 'function' ||
          typeof codec.decodeInput !== 'function' ||
          typeof codec.decode !== 'function' ||
          (callable.type === 'custom' && typeof codec.validateOuter !== 'function')
        )
          return blocked('INCOMPLETE_WRAPPER_CODEC')
      } else return blocked('UNKNOWN_ROUTE_MODE')
      output.push({
        operation: route.operation,
        nativeName: route.nativeName,
        descriptorHash: route.descriptorHash,
        mode: route.mode,
        ...(route.wrapper
          ? {
              wrapper: {
                version: route.wrapper.version,
                provenance: route.wrapper.provenance,
                semantics: route.wrapper.semantics,
                codecDigest: route.wrapper.codecDigest,
                ...(route.wrapper.rejectionProbeOperations
                  ? { rejectionProbeOperations: Object.freeze([...route.wrapper.rejectionProbeOperations]) }
                  : {}),
                // Local drift check only; function source does not attest a native provider implementation.
                implementationHash: hash({
                  encode: String(route.wrapper.encode),
                  decodeInput: String(route.wrapper.decodeInput),
                  decode: String(route.wrapper.decode),
                  validateOuter: route.wrapper.validateOuter ? String(route.wrapper.validateOuter) : null,
                }),
              },
            }
          : {}),
      })
    }
    if (output.some(route => !nativeNames.has(route.nativeName))) return blocked('UNKNOWN_NATIVE_TOOL')
    return Object.freeze({
      status: 'PREPARED_NOT_RUNTIME_QUALIFIED',
      version: 'M02_TRUSTED_NATIVE_ROUTE_V1',
      role: profile.role,
      profileDigest: profile.profileDigest,
      advertisedProfileDigest: advertised.profileDigest,
      requestByteHash: capture.requestByteHash,
      containerHash: capture.containerHash,
      descriptorHash: capture.descriptorHash,
      provenance: capture.provenance,
      routes: Object.freeze(output.map(route => Object.freeze(route))),
      limits: Object.freeze({ ...input.limits }),
      runtimeQualified: false,
      dispatchAllowed: false,
    })
  } catch {
    return blocked('INVALID_ROUTE_INPUT')
  }
}

export type ConstructedTrustedCall = Readonly<{
  status: 'CONSTRUCTED_NOT_DISPATCHED'
  operation: string
  nativeName: string
  outerCallId: string
  innerCallId: string
  innerArgumentsHash: string
  outerArguments: unknown
  outerArgumentsHash: string
  outerCallCeiling: number
  innerCallCeiling: number
}>

/** Construct one reviewed call and validate its inner and outer input against the SDK-advertised contracts. */
export function constructTrustedWorkerNativeCall(
  input: Readonly<{
    routeInput: TrustedRouteInput
    prepared: PreparedTrustedRoute
    operation: string
    innerCallId: string
    outerCallId: string
    arguments: JsonObject
  }>,
): ConstructedTrustedCall | ReturnType<typeof blocked> {
  try {
    const current = prepareTrustedWorkerNativeRoute(input.routeInput)
    if (current.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED' || hash(current) !== hash(input.prepared))
      return blocked('STALE_ROUTE')
    if (!identifier.test(input.innerCallId) || !identifier.test(input.outerCallId)) return blocked('INVALID_CALL_ID')
    const route = input.routeInput.routes.find(item => item.operation === input.operation)
    if (!route) return blocked('CROSS_ROLE_OPERATION')
    const advertisedTool = input.routeInput.advertisedProfile.tools.find(tool => tool.name === input.operation)
    if (!advertisedTool) return blocked('CROSS_ROLE_OPERATION')
    const provider = new AjvJsonSchemaValidator()
    const inner = provider.getValidator(advertisedTool.inputSchema as never)(input.arguments)
    if (!inner.valid || hash(inner.data) !== hash(input.arguments)) return blocked('INNER_SCHEMA_MISMATCH')
    const capture = new NativeDescriptorCollector().capture(input.routeInput.request, input.routeInput.context)
    if (capture.status !== 'CAPTURED') return blocked('STALE_ROUTE')
    const callable = capture.callables.find(item => item.name === route.nativeName)
    if (!callable) return blocked('STALE_ROUTE')
    const outer =
      route.mode === 'DIRECT_MCP'
        ? structuredClone(input.arguments)
        : route.wrapper?.encode(
            Object.freeze({
              operation: input.operation,
              innerCallId: input.innerCallId,
              arguments: structuredClone(input.arguments),
            }),
          )
    if (outer === undefined || Buffer.byteLength(stable(outer)) > maxResultBytes)
      return blocked('INVALID_OUTER_ARGUMENTS')
    if (callable.type === 'function') {
      const descriptor = isObject(callable.descriptor.function) ? callable.descriptor.function : callable.descriptor
      const validation = provider.getValidator(descriptor.parameters as never)(outer)
      if (!validation.valid || hash(validation.data) !== hash(outer)) return blocked('OUTER_SCHEMA_MISMATCH')
    } else if (!route.wrapper?.validateOuter?.(outer)) return blocked('OUTER_GRAMMAR_MISMATCH')
    if (route.mode === 'REVIEWED_WRAPPER') {
      const decoded = route.wrapper!.decodeInput(outer)
      if (
        decoded.operation !== input.operation ||
        decoded.innerCallId !== input.innerCallId ||
        hash(decoded.arguments) !== hash(input.arguments)
      )
        return blocked('WRAPPER_INPUT_CORRELATION_MISMATCH')
    }
    return Object.freeze({
      status: 'CONSTRUCTED_NOT_DISPATCHED',
      operation: input.operation,
      nativeName: route.nativeName,
      outerCallId: input.outerCallId,
      innerCallId: input.innerCallId,
      innerArgumentsHash: hash(input.arguments),
      outerArguments: outer,
      outerArgumentsHash: hash(outer),
      outerCallCeiling: current.limits.outerCalls,
      innerCallCeiling: current.limits.innerCalls,
    })
  } catch {
    return blocked('INVALID_CALL_CONSTRUCTION')
  }
}

export type ConstructedTrustedRejectionProbe = Readonly<{
  status: 'CONSTRUCTED_REJECTION_NOT_DISPATCHED'
  selector: TrustedRejectionSelector
  intendedLayer: 'SDK_ARGUMENT_SCHEMA' | 'SDK_UNREGISTERED_TOOL' | 'GATEWAY_RESULT_BINDING' | 'FROZEN_READ_KEY'
  role: ExternalWorkerRole
  operation: string
  nativeName: string
  outerCallId: string
  innerCallId: string
  innerArguments: JsonObject
  innerArgumentsHash: string
  outerArguments: unknown
  outerArgumentsHash: string
  outerCallCeiling: number
  innerCallCeiling: number
  runtimeQualified: false
  dispatchAllowed: false
}>

/**
 * Construct only the sixteen approved negative selectors. A direct descriptor that
 * cannot carry the deliberately invalid input is reported as unreachable; this
 * never weakens ordinary call construction or registers a forbidden operation.
 */
export function constructTrustedWorkerRejectionProbe(
  input: Readonly<{
    routeInput: TrustedRouteInput
    prepared: PreparedTrustedRoute
    selector: TrustedRejectionSelector
    outerCallId: string
    innerCallId: string
    baselineArguments?: JsonObject
    /** Exact hash of the separately reviewed positive-control arguments. */
    baselineArgumentsHash?: string
  }>,
): ConstructedTrustedRejectionProbe | ReturnType<typeof blocked> {
  try {
    const current = prepareTrustedWorkerNativeRoute(input.routeInput)
    if (current.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED' || hash(current) !== hash(input.prepared))
      return blocked('STALE_ROUTE')
    if (!identifier.test(input.innerCallId) || !identifier.test(input.outerCallId)) return blocked('INVALID_CALL_ID')
    const index = rejectionSelectors.indexOf(input.selector)
    if (index < 0) return blocked('UNKNOWN_REJECTION_SELECTOR')
    const role: ExternalWorkerRole =
      index < 14 ? 'REQUIREMENT_ANALYZER' : index === 14 ? 'TEST_SCENARIO_DESIGNER' : 'TRIAGER'
    if (current.role !== role) return blocked('SELECTOR_ROLE_MISMATCH')
    const isAbsent = index >= 8 && index < 14
    const operation = isAbsent
      ? rejectedAbsentOperations[index - 8]
      : index < 8
        ? 'quality_journey_external_analyzer_analysis_submit_v1'
        : index === 14
          ? 'quality_journey_external_scenarios_submit_v1'
          : 'quality_journey_triage_evidence_read'
    const intendedLayer: ConstructedTrustedRejectionProbe['intendedLayer'] = isAbsent
      ? 'SDK_UNREGISTERED_TOOL'
      : index < 8
        ? 'SDK_ARGUMENT_SCHEMA'
        : index === 14
          ? 'GATEWAY_RESULT_BINDING'
          : 'FROZEN_READ_KEY'
    const provider = new AjvJsonSchemaValidator()
    let argumentsValue: JsonObject
    if (isAbsent) {
      if (input.baselineArguments !== undefined || input.baselineArgumentsHash !== undefined)
        return blocked('UNRELATED_PROBE_INPUT')
      argumentsValue = {}
    } else {
      if (!isObject(input.baselineArguments)) return blocked('MISSING_POSITIVE_CONTROL')
      if (
        !digestPattern.test(input.baselineArgumentsHash ?? '') ||
        hash(input.baselineArguments) !== input.baselineArgumentsHash
      )
        return blocked('POSITIVE_CONTROL_HASH_MISMATCH')
      const advertisedTool = input.routeInput.advertisedProfile.tools.find(tool => tool.name === operation)
      if (!advertisedTool) return blocked('SELECTOR_ROLE_MISMATCH')
      const validation = provider.getValidator(advertisedTool.inputSchema as never)(input.baselineArguments)
      if (!validation.valid || hash(validation.data) !== hash(input.baselineArguments))
        return blocked('INVALID_POSITIVE_CONTROL')
      argumentsValue = structuredClone(input.baselineArguments)
      if (index < 8) {
        const field = rejectedAuthorityFields[index]
        if (Object.prototype.hasOwnProperty.call(argumentsValue, field)) return blocked('UNRELATED_PROBE_INPUT')
        argumentsValue[field] = 'forged'
        const invalid = provider.getValidator(advertisedTool.inputSchema as never)(argumentsValue)
        if (invalid.valid) return blocked('PROBE_DID_NOT_REJECT_SCHEMA')
      } else if (index === 14) {
        if (!isObject(argumentsValue.result) || argumentsValue.result.role !== 'TEST_SCENARIO_DESIGNER')
          return blocked('INVALID_POSITIVE_CONTROL')
        argumentsValue.result = { ...argumentsValue.result, role: 'AUTOMATOR' }
      } else {
        if (
          typeof argumentsValue.receiptId !== 'string' ||
          argumentsValue.receiptId === 'foreign' ||
          argumentsValue.artifactKind !== 'log' ||
          argumentsValue.offset !== 0 ||
          argumentsValue.limit !== 4096 ||
          Object.keys(argumentsValue).length !== 4
        )
          return blocked('INVALID_POSITIVE_CONTROL')
        argumentsValue.receiptId = 'foreign'
      }
      if (index >= 14) {
        const mutated = provider.getValidator(advertisedTool.inputSchema as never)(argumentsValue)
        if (!mutated.valid || hash(mutated.data) !== hash(argumentsValue))
          return blocked('PROBE_DID_NOT_REACH_INTENDED_LAYER')
      }
    }
    let route = input.routeInput.routes.find(item => item.operation === operation)
    if (isAbsent) {
      const candidates = input.routeInput.routes.filter(
        item => item.mode === 'REVIEWED_WRAPPER' && item.wrapper?.rejectionProbeOperations?.includes(operation),
      )
      const names = new Set(
        candidates.map(item =>
          hash({
            name: item.nativeName,
            codecDigest: item.wrapper?.codecDigest,
            encode: String(item.wrapper?.encode),
            decodeInput: String(item.wrapper?.decodeInput),
          }),
        ),
      )
      if (candidates.length === 0 || names.size !== 1) return blocked('UNREACHABLE_NATIVE_ROUTE')
      route = candidates[0]
    }
    if (!route) return blocked('UNREACHABLE_NATIVE_ROUTE')
    const capture = new NativeDescriptorCollector().capture(input.routeInput.request, input.routeInput.context)
    if (capture.status !== 'CAPTURED') return blocked('STALE_ROUTE')
    const callable = capture.callables.find(item => item.name === route.nativeName)
    if (!callable || callable.descriptorHash !== route.descriptorHash) return blocked('STALE_ROUTE')
    const outer =
      route.mode === 'DIRECT_MCP'
        ? structuredClone(argumentsValue)
        : route.wrapper?.encode(
            Object.freeze({ operation, innerCallId: input.innerCallId, arguments: structuredClone(argumentsValue) }),
          )
    if (outer === undefined || Buffer.byteLength(stable(outer)) > maxResultBytes)
      return blocked('INVALID_OUTER_ARGUMENTS')
    if (callable.type === 'function') {
      const descriptor = isObject(callable.descriptor.function) ? callable.descriptor.function : callable.descriptor
      const validation = provider.getValidator(descriptor.parameters as never)(outer)
      if (!validation.valid || hash(validation.data) !== hash(outer)) return blocked('UNREACHABLE_NATIVE_ROUTE')
    } else if (!route.wrapper?.validateOuter?.(outer)) return blocked('UNREACHABLE_NATIVE_ROUTE')
    if (route.mode === 'REVIEWED_WRAPPER') {
      const decoded = route.wrapper!.decodeInput(outer)
      if (
        decoded.operation !== operation ||
        decoded.innerCallId !== input.innerCallId ||
        hash(decoded.arguments) !== hash(argumentsValue)
      )
        return blocked('WRAPPER_INPUT_CORRELATION_MISMATCH')
    }
    return Object.freeze({
      status: 'CONSTRUCTED_REJECTION_NOT_DISPATCHED',
      selector: input.selector,
      intendedLayer,
      role,
      operation,
      nativeName: route.nativeName,
      outerCallId: input.outerCallId,
      innerCallId: input.innerCallId,
      innerArguments: argumentsValue,
      innerArgumentsHash: hash(argumentsValue),
      outerArguments: outer,
      outerArgumentsHash: hash(outer),
      outerCallCeiling: current.limits.outerCalls,
      innerCallCeiling: current.limits.innerCalls,
      runtimeQualified: false,
      dispatchAllowed: false,
    })
  } catch {
    return blocked('INVALID_REJECTION_PROBE')
  }
}

/** Correlate supplied transcript evidence; this is an offline check, not runtime attestation. */
export function correlateTrustedWorkerNativeCalls(
  prepared: PreparedTrustedRoute,
  routeInput: TrustedRouteInput,
  constructed: readonly ConstructedTrustedCall[],
  calls: readonly Readonly<{
    outerCallId: string
    innerCallId: string
    operation: string
    nativeName: string
    innerArgumentsHash: string
    outerArgumentsHash: string
    outerResult: unknown
    innerResult: unknown
  }>[],
) {
  try {
    const current = prepareTrustedWorkerNativeRoute(routeInput)
    if (current.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED' || hash(current) !== hash(prepared))
      return blocked('STALE_ROUTE')
    if (
      prepared.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED' ||
      calls.length !== constructed.length ||
      calls.length > prepared.limits.outerCalls
    )
      return blocked('OUTER_CALL_LIMIT')
    const outerIds = new Set<string>()
    const innerIds = new Set<string>()
    let bytes = 0
    for (const [index, call] of calls.entries()) {
      const intended = constructed[index]
      if (
        intended.status !== 'CONSTRUCTED_NOT_DISPATCHED' ||
        hash(intended.outerArguments) !== intended.outerArgumentsHash ||
        intended.outerCallId !== call.outerCallId ||
        intended.innerCallId !== call.innerCallId ||
        intended.operation !== call.operation ||
        intended.nativeName !== call.nativeName ||
        intended.innerArgumentsHash !== call.innerArgumentsHash ||
        intended.outerArgumentsHash !== call.outerArgumentsHash
      )
        return blocked('CALL_CORRELATION_MISMATCH')
      const route = prepared.routes.find(item => item.operation === call.operation)
      if (!route || route.nativeName !== call.nativeName) return blocked('CROSS_ROLE_OPERATION')
      const codec = routeInput.routes.find(item => item.operation === call.operation)?.wrapper
      if (route.mode === 'DIRECT_MCP') {
        if (hash(call.outerResult) !== hash(call.innerResult)) return blocked('RESULT_CORRELATION_MISMATCH')
      } else {
        if (!codec) return blocked('INCOMPLETE_WRAPPER_CODEC')
        const decoded = codec.decode(call.outerResult)
        if (
          decoded.operation !== call.operation ||
          decoded.innerCallId !== call.innerCallId ||
          hash(decoded.result) !== hash(call.innerResult)
        )
          return blocked('RESULT_CORRELATION_MISMATCH')
      }
      if (
        !identifier.test(call.outerCallId) ||
        !identifier.test(call.innerCallId) ||
        outerIds.has(call.outerCallId) ||
        innerIds.has(call.innerCallId)
      )
        return blocked('DUPLICATE_OR_INVALID_CALL_ID')
      if (!digestPattern.test(call.innerArgumentsHash) || !digestPattern.test(call.outerArgumentsHash))
        return blocked('INVALID_ARGUMENT_HASH')
      outerIds.add(call.outerCallId)
      innerIds.add(call.innerCallId)
      bytes += Buffer.byteLength(stable(call.outerResult)) + Buffer.byteLength(stable(call.innerResult))
      if (bytes > prepared.limits.resultBytes) return blocked('RESULT_LIMIT')
    }
    if (innerIds.size > prepared.limits.innerCalls) return blocked('INNER_CALL_LIMIT')
    return Object.freeze({
      status: 'CORRELATED_OFFLINE_ONLY' as const,
      outerCalls: outerIds.size,
      innerCalls: innerIds.size,
      resultBytes: bytes,
      runtimeQualified: false as const,
      dispatchAllowed: false as const,
    })
  } catch {
    return blocked('INVALID_CORRELATION')
  }
}
