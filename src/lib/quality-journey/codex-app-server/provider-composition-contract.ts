import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import type { OwnedChildCleanupReceipt } from './owned-child'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const id = z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/)
const offlineProviderBindingSchema = z
  .object({
    candidateTree: z.string().regex(/^[a-f0-9]{40}$/),
    configurationDigest: digest,
    protocolDigest: digest,
    roleProfileDigest: digest,
    requiredMcpIds: z
      .array(z.string().regex(/^[A-Za-z0-9._-]{1,80}$/))
      .min(1)
      .max(16),
  })
  .strict()
  .refine(value => new Set(value.requiredMcpIds).size === value.requiredMcpIds.length)
export type OfflineProviderBinding = Readonly<z.infer<typeof offlineProviderBindingSchema>>
export type OfflineProviderCall = Readonly<{ callId: string; toolName: string; arguments: Record<string, unknown> }>
const offlineProviderCompletionSchema = z
  .object({
    threadId: id,
    turnId: id,
    status: z.literal('COMPLETED'),
    calls: z
      .array(z.object({ callId: id, toolName: id, arguments: z.record(z.string(), z.unknown()) }).strict())
      .min(1)
      .max(16),
  })
  .strict()
export type OfflineProviderCompletion = z.infer<typeof offlineProviderCompletionSchema>
export type OfflineProviderPolicy = Readonly<{
  model: string
  effort: string
  approvalPolicy: 'never'
  sandbox: 'read-only'
}>
export type OfflineOwnedProviderPort = Readonly<{
  provenance: 'OFFLINE_FAKE_PORT'
  initialize(signal: AbortSignal): Promise<unknown>
  inspectRequiredMcp(signal: AbortSignal): Promise<unknown>
  startThread(policy: OfflineProviderPolicy, signal: AbortSignal): Promise<unknown>
  startTurn(
    input: Readonly<{ threadId: string; input: readonly Record<string, unknown>[]; model: string; effort: string }>,
    signal: AbortSignal,
  ): Promise<unknown>
  completeTurn(input: Readonly<{ threadId: string; turnId: string }>, signal: AbortSignal): Promise<unknown>
  fence(): void
  stop(): Promise<OwnedChildCleanupReceipt>
}>
export type OfflineRoleDeliveryReceipt = Readonly<{
  accepted: boolean
  operation: string
  idempotencyKey: string
  acceptanceDigest: string | null
}>
export type OfflineRoleDelivery = Readonly<{
  profileDigest: string
  fence(): void
  invoke(call: OfflineProviderCall): Promise<OfflineRoleDeliveryReceipt>
  readCommitted?(call: OfflineProviderCall): Promise<OfflineRoleDeliveryReceipt | null>
}>
export type OfflineProviderTimeouts = Readonly<{
  acquisitionMs: number
  initializationMs: number
  requiredMcpMs: number
  acknowledgementMs: number
  completionMs: number
  cleanupMs: number
}>
const shortTimeout = z.number().int().min(1).max(60_000)
const timeoutSchema = z
  .object({
    acquisitionMs: shortTimeout,
    initializationMs: shortTimeout,
    requiredMcpMs: shortTimeout,
    acknowledgementMs: shortTimeout,
    completionMs: z.number().int().min(1).max(900_000),
    cleanupMs: shortTimeout,
  })
  .strict()
  .refine(value => value.acquisitionMs + value.initializationMs + value.requiredMcpMs + value.cleanupMs <= 90_000)
export type OfflineCompositionReason =
  | 'NONE'
  | 'CANCELLED'
  | 'HUMAN_WAIT'
  | 'AUTHORITY_REFUSED'
  | 'ACQUISITION_FAILED'
  | 'READINESS_REFUSED'
  | 'TIMEOUT'
  | 'BINDING_MISMATCH'
  | 'AMBIGUOUS_ARM'
  | 'SEND_FAILED'
  | 'CORRELATION_MISMATCH'
  | 'DELIVERY_REFUSED'
  | 'CLEANUP_UNCERTAIN'
export type OfflineProviderCompositionReceipt = Readonly<{
  provenance: 'OFFLINE_FAKE_PORT'
  runtimeQualified: false
  observedNativeTuple: null
  outcome: 'ACCEPTED_OFFLINE' | 'REFUSED' | 'PARKED_HUMAN_WAIT' | 'UNKNOWN'
  reason: OfflineCompositionReason
  attemptId: string
  intentId: string | null
  threadId: string | null
  turnId: string | null
  acceptedArtifactDigests: readonly string[]
  cleanup: Readonly<{
    status: 'stopped' | 'uncertain' | null
    groupExitObserved: boolean | null
    privateRootRemoved: boolean | null
    privateRootRetained: boolean | null
  }>
  phasesMs: Readonly<{
    queue: number | null
    humanWait: number | null
    readiness: number | null
    dispatch: number | null
    acceptance: number | null
    cleanup: number | null
  }>
  modelTokens: null
  cost: null
  usageStatus: 'UNQUALIFIED'
}>
export function offlineCompositionDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}
export function captureOfflineProviderBinding(value: OfflineProviderBinding): OfflineProviderBinding {
  const parsed = offlineProviderBindingSchema.parse(value)
  return Object.freeze({
    ...parsed,
    requiredMcpIds: Object.freeze([...parsed.requiredMcpIds].sort()),
  }) as OfflineProviderBinding
}
export function captureOfflineProviderTimeouts(value?: OfflineProviderTimeouts): OfflineProviderTimeouts {
  return Object.freeze(
    timeoutSchema.parse(
      value ?? {
        acquisitionMs: 10_000,
        initializationMs: 20_000,
        requiredMcpMs: 20_000,
        acknowledgementMs: 60_000,
        completionMs: 900_000,
        cleanupMs: 30_000,
      },
    ),
  )
}
export function parseOfflineProviderCompletion(value: unknown): OfflineProviderCompletion {
  if (Buffer.byteLength(canonicalContractJson(value)) > 1_048_576) throw new Error('Invalid offline completion')
  const result = offlineProviderCompletionSchema.parse(value)
  if (new Set(result.calls.map(call => call.callId)).size !== result.calls.length)
    throw new Error('Invalid offline completion')
  return result
}

/** Capture bounded JSON before handing values to another injected capability. */
export function captureOfflineProviderJson<T>(value: T): T {
  try {
    const encoded = canonicalContractJson(value)
    if (Buffer.byteLength(encoded) > 1_048_576) throw new Error()
    const copy = JSON.parse(encoded) as T
    function freeze(item: unknown): void {
      if (!item || typeof item !== 'object') return
      for (const child of Object.values(item)) freeze(child)
      Object.freeze(item)
    }
    freeze(copy)
    return copy
  } catch {
    throw new Error('Invalid offline JSON')
  }
}
