import { z } from 'zod'

import type { OwnedChildCleanupReceipt } from './owned-child'

const bindingSchema = z
  .object({
    candidateTree: z.string().regex(/^[a-f0-9]{40}$/),
    executableSha256: z.string().regex(/^[a-f0-9]{64}$/),
    configurationDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    readinessContractDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict()
const serverId = z.string().regex(/^[A-Za-z0-9._-]{1,80}$/)
const timeout = z.number().int().min(1).max(60_000)
const optionsSchema = z
  .object({
    binding: bindingSchema,
    requiredMcpIds: z.array(serverId).min(1).max(16),
    initializationTimeoutMs: timeout,
    requiredMcpTimeoutMs: timeout,
    cleanupTimeoutMs: timeout,
  })
  .strict()
  .refine(value => new Set(value.requiredMcpIds).size === value.requiredMcpIds.length)
  .refine(value => value.initializationTimeoutMs + value.requiredMcpTimeoutMs + value.cleanupTimeoutMs <= 90_000)
const initializeSchema = z.object({ status: z.literal('INITIALIZED'), binding: bindingSchema }).strict()
const requiredMcpSchema = z
  .object({
    status: z.enum(['READY', 'UNAVAILABLE', 'UNSUPPORTED']),
    servers: z.array(z.object({ id: serverId, status: z.enum(['READY', 'UNAVAILABLE']) }).strict()).max(16),
  })
  .strict()

function parseInput<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown) {
  try {
    return schema.safeParse(value) as z.SafeParseReturnType<z.input<Schema>, z.output<Schema>>
  } catch {
    // Untrusted semantic objects can have throwing accessors; never publish their error payload.
    return null
  }
}

export type ReadinessBinding = Readonly<z.infer<typeof bindingSchema>>
export type ReadinessOptions = Readonly<{
  binding: ReadinessBinding
  requiredMcpIds: readonly string[]
  initializationTimeoutMs: number
  requiredMcpTimeoutMs: number
  cleanupTimeoutMs: number
}>
export type OfflineReadinessPort = Readonly<{
  provenance: 'OFFLINE_FAKE_PORT'
  initialize(signal: AbortSignal): Promise<unknown>
  inspectRequiredMcp(signal: AbortSignal): Promise<unknown>
  fence(): void
  stop(): Promise<OwnedChildCleanupReceipt>
}>
export type OfflineReadinessReason =
  | 'NONE'
  | 'CANCELLED'
  | 'INITIALIZATION_REJECTED'
  | 'INITIALIZATION_INVALID'
  | 'BINDING_MISMATCH'
  | 'INITIALIZATION_TIMEOUT'
  | 'MCP_REJECTED'
  | 'MCP_INVALID'
  | 'MCP_UNAVAILABLE'
  | 'MCP_UNSUPPORTED'
  | 'MCP_TIMEOUT'
  | 'FENCE_FAILED'
  | 'CLEANUP_REJECTED'
  | 'CLEANUP_TIMEOUT'
  | 'CLEANUP_UNCERTAIN'
  | 'CLEANUP_CONTRADICTORY'
export type OfflineReadinessState = 'IDLE' | 'INITIALIZING' | 'CHECKING_MCP' | 'FENCING' | 'STOPPING' | 'FINALIZED'
export type OfflineCleanupFacts = Readonly<{
  status: 'stopped' | 'uncertain' | null
  groupExitObserved: boolean | null
  privateRootRemoved: boolean | null
  privateRootRetained: boolean | null
}>
export type OfflineReadinessReceipt = Readonly<{
  provenance: 'OFFLINE_FAKE_PORT'
  runtimeQualified: false
  observedNativeTuple: null
  binding: ReadinessBinding
  requiredMcpIds: readonly string[]
  outcome: 'OFFLINE_CONTRACT_SATISFIED' | 'REFUSED' | 'UNKNOWN'
  reason: OfflineReadinessReason
  initializationComplete: boolean
  requiredMcpComplete: boolean
  fenceOutcome: 'NOT_ATTEMPTED' | 'SUCCEEDED' | 'UNKNOWN'
  cleanup: OfflineCleanupFacts
}>
export type OfflineReadinessSnapshot = Readonly<{
  state: OfflineReadinessState
  admissionClosed: boolean
  reason: OfflineReadinessReason
  initializationComplete: boolean
  requiredMcpComplete: boolean
}>

/** Copies semantic input only. No launcher, configuration, credential or native observation is admitted. */
export function captureOfflineReadiness(options: ReadinessOptions, port: OfflineReadinessPort) {
  const parsed = parseInput(optionsSchema, options)
  if (!parsed?.success) throw new Error('Invalid offline readiness options')
  let original: OfflineReadinessPort
  try {
    if (!port || typeof port !== 'object') throw new Error()
    const keys = ['provenance', 'initialize', 'inspectRequiredMcp', 'fence', 'stop']
    const descriptors = Object.getOwnPropertyDescriptors(port)
    if (
      Reflect.ownKeys(descriptors).length !== keys.length ||
      keys.some(key => !descriptors[key] || !('value' in descriptors[key]))
    )
      throw new Error()
    original = Object.fromEntries(keys.map(key => [key, descriptors[key].value])) as OfflineReadinessPort
    if (
      original.provenance !== 'OFFLINE_FAKE_PORT' ||
      [original.initialize, original.inspectRequiredMcp, original.fence, original.stop].some(
        operation => typeof operation !== 'function',
      )
    )
      throw new Error()
  } catch {
    throw new Error('Invalid offline readiness port')
  }
  const { initialize, inspectRequiredMcp, fence, stop } = original
  const capturedOptions = Object.freeze({
    ...parsed.data,
    binding: Object.freeze(parsed.data.binding),
    requiredMcpIds: Object.freeze([...parsed.data.requiredMcpIds].sort()),
  })
  return Object.freeze({ options: capturedOptions, initialize, inspectRequiredMcp, fence, stop })
}

export function validateOfflineInitialization(value: unknown, binding: ReadinessBinding): OfflineReadinessReason {
  const result = parseInput(initializeSchema, value)
  if (!result?.success) return 'INITIALIZATION_INVALID'
  return Object.keys(binding).every(
    key => result.data.binding[key as keyof ReadinessBinding] === binding[key as keyof ReadinessBinding],
  )
    ? 'NONE'
    : 'BINDING_MISMATCH'
}

export function validateOfflineRequiredMcp(value: unknown, requiredIds: readonly string[]): OfflineReadinessReason {
  const result = parseInput(requiredMcpSchema, value)
  if (!result?.success) return 'MCP_INVALID'
  const { status, servers } = result.data
  const ids = servers.map(server => server.id)
  if (
    ids.length !== requiredIds.length ||
    new Set(ids).size !== ids.length ||
    ids.some(id => !requiredIds.includes(id))
  )
    return 'MCP_INVALID'
  if (status === 'UNSUPPORTED') return 'MCP_UNSUPPORTED'
  return status === 'UNAVAILABLE' || servers.some(server => server.status === 'UNAVAILABLE')
    ? 'MCP_UNAVAILABLE'
    : 'NONE'
}
