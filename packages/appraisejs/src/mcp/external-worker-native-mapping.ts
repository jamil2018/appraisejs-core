import { createHash } from 'node:crypto'
import { externalWorkerTools, type createExternalWorkerGateway } from './external-worker-gateway.js'
import type { ExternalWorkerAdvertisedProfile } from './external-worker-server.js'
import {
  NativeDescriptorCollector,
  type DescriptorRequest,
  type TrustedDescriptorContext,
} from './native-descriptor-capture.js'

type Profile = ReturnType<typeof createExternalWorkerGateway>['profile']
export type ExternalNativeRoute = Readonly<{ nativeName: string; operation: string; descriptorHash: string }>

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
    .join(',')}}`
}
const hash = (value: unknown) => `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`

/**
 * Prepare an exact direct-MCP routing table. This function is not a host verifier,
 * enforcer or dispatch permit: successful results always remain runtime-unqualified.
 */
export function prepareExternalWorkerNativeMapping(input: {
  request: DescriptorRequest
  context: TrustedDescriptorContext
  profile: Profile
  advertisedProfile: ExternalWorkerAdvertisedProfile
  mcpServerName: string
  routes: readonly ExternalNativeRoute[]
}) {
  // Snapshot trusted inputs before inspection; returned routes cannot be rebound by the caller.
  const profile = structuredClone(input.profile)
  const routes = structuredClone(input.routes)
  const advertised = structuredClone(input.advertisedProfile)
  const serverName = input.mcpServerName
  const capture = new NativeDescriptorCollector().capture(input.request, input.context)
  const blocked = (reason: string) =>
    Object.freeze({
      status: 'BLOCKED' as const,
      reason,
      runtimeQualified: false as const,
      dispatchAllowed: false as const,
    })
  if (capture.status !== 'CAPTURED') return blocked(`CAPTURE_${capture.reason}`)
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(serverName)) return blocked('INVALID_SERVER_BINDING')
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
    !advertised ||
    advertised.gatewayProfileDigest !== profile.profileDigest ||
    advertised.tools.length !== expected.length ||
    new Set(advertised.tools.map(tool => tool.name)).size !== expected.length ||
    !expected.every(name => advertised.tools.some(tool => tool.name === name)) ||
    advertised.profileDigest !==
      hash({ gatewayProfileDigest: advertised.gatewayProfileDigest, tools: advertised.tools }) ||
    advertised.tools.some(tool => hash(tool.inputSchema) !== tool.schemaHash)
  )
    return blocked('ADVERTISED_PROFILE_MISMATCH')
  if (routes.length !== expected.length || capture.callables.length !== expected.length)
    return blocked('CALLABLE_SET_MISMATCH')
  const seen = new Set<string>()
  const bound: ExternalNativeRoute[] = []
  for (const route of routes) {
    const tool = profile.tools.find(tool => tool.name === route.operation)
    if (!tool || seen.has(route.operation)) return blocked('INVALID_OPERATION_MAP')
    seen.add(route.operation)
    // Only direct MCP names are supported. A generic evaluator/collaboration alias never becomes a scoped route.
    if (route.nativeName !== route.operation && route.nativeName !== `mcp__${serverName}__${route.operation}`)
      return blocked('UNSUPPORTED_SCOPED_ROUTE')
    const callable = capture.callables.find(callable => callable.name === route.nativeName)
    if (!callable || callable.type !== 'function' || callable.descriptorHash !== route.descriptorHash)
      return blocked('DESCRIPTOR_MISMATCH')
    const nested = callable.descriptor.function
    const descriptor = nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : callable.descriptor
    if (hash(descriptor.parameters) !== advertised.tools.find(candidate => candidate.name === tool.name)?.schemaHash)
      return blocked('ARGUMENT_SCHEMA_MISMATCH')
    bound.push(
      Object.freeze({ nativeName: route.nativeName, operation: route.operation, descriptorHash: route.descriptorHash }),
    )
  }
  return Object.freeze({
    status: 'PREPARED_NOT_RUNTIME_QUALIFIED' as const,
    profileDigest: profile.profileDigest,
    advertisedProfileDigest: advertised.profileDigest,
    containerHash: capture.containerHash,
    descriptorHash: capture.descriptorHash,
    requestByteHash: capture.requestByteHash,
    provenance: capture.provenance,
    routes: Object.freeze(bound),
    runtimeQualified: false as const,
    dispatchAllowed: false as const,
  })
}
