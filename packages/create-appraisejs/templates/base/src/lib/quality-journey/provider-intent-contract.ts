import {
  inspectRpcTransportOwner,
  inspectRpcTransportSeal,
  type RpcTransportOwner,
  type RpcTransportSeal,
  type RpcDeliveryWatermark,
} from './codex-app-server/rpc-transport'
import { randomUUID } from 'node:crypto'
import { ServiceError } from '@/services/shared/errors'

/** Frozen M00 D05. These are persisted limits, not transport qualification. */
export const providerIntentPolicy = Object.freeze({
  version: 'APP_SERVER_D05_V1',
  model: 'gpt-6.1-sol',
  reasoning: 'medium',
  hubCapacity: 1,
  leaseSeconds: 120,
  heartbeatSeconds: 40,
  acknowledgementSeconds: 60,
  turnSeconds: 900,
  maxTurns: 3,
  maxAttempts: 3,
  unresolvedRetentionSeconds: 604800,
  terminalRetentionSeconds: 86400,
})

/** Only trusted internal adapters may supply operational observations. */
export const trustedProviderArm: unique symbol = Symbol('trusted committed provider arm')
export const trustedProviderObservation: unique symbol = Symbol('trusted provider observation')
export const trustedProviderReconciliation: unique symbol = Symbol('trusted provider reconciliation')

export type ProviderSendIdentity = Readonly<{
  runId: string
  intentId: string
  sendBoundaryId: string
  claimEpoch: number
}>
declare const permitBrand: unique symbol
export type ProviderSendPermit = ProviderSendIdentity & { readonly [permitBrand]: true }
declare const disabledBrand: unique symbol
export type ProviderSenderDisabled = ProviderSendIdentity & { readonly [disabledBrand]: true }
export type ProviderReconciliationIdentity = ProviderSendIdentity &
  Readonly<{
    providerNamespace: string
    configurationDigest: string
    transportId: string
    transportIncarnation: string
    threadId: string | null
    turnId: string | null
  }>
declare const excludedBrand: unique symbol
export type ProviderSenderExcluded = { readonly [excludedBrand]: true }
export type ProviderSenderExclusionRecord = ProviderReconciliationIdentity &
  Readonly<{
    senderEvidenceId: string
    finalWatermark: RpcDeliveryWatermark
  }>
type Sender = {
  identity: ProviderSendIdentity
  consumed: boolean
  disabled: boolean
  transport?: { owner: RpcTransportOwner; providerNamespace: string; configurationDigest: string }
  exclusion?: ProviderSenderExcluded
}
const exclusions = new WeakMap<object, ProviderSenderExclusionRecord>()
const permits = new WeakMap<object, Sender>()
const senderBoundaries = new Set<string>()
const disabledProofs = new WeakMap<object, Sender>()

/** Internal service constructor. Never reconstruct a permit from durable rows. */
export function createProviderSendPermit(
  identity: ProviderSendIdentity,
  capability: typeof trustedProviderArm,
): ProviderSendPermit {
  if (capability !== trustedProviderArm)
    throw new ServiceError('Trusted committed arm capability is required.', 'UNAUTHORIZED')
  if (senderBoundaries.has(identity.sendBoundaryId))
    throw new ServiceError('Provider send boundary already has an original sender.', 'CONFLICT')
  senderBoundaries.add(identity.sendBoundaryId)
  const permit = Object.freeze({
    runId: identity.runId,
    intentId: identity.intentId,
    sendBoundaryId: identity.sendBoundaryId,
    claimEpoch: identity.claimEpoch,
  }) as ProviderSendPermit
  permits.set(permit, { identity: permit, consumed: false, disabled: false })
  return permit
}

/** Verify the exact in-memory owner on every write, including pre-turn handshake. */
export function assertProviderSendPermitOwned(permit: ProviderSendPermit): void {
  const sender = permits.get(permit)
  if (!sender || sender.disabled)
    throw new ServiceError('Original provider sender is unavailable or disabled.', 'CONFLICT')
}

/** Consume immediately before the simulated sink. No provider callback is accepted here. */
export function consumeProviderSendPermit(permit: ProviderSendPermit): ProviderSendIdentity {
  const sender = permits.get(permit)
  if (!sender || sender.consumed || sender.disabled)
    throw new ServiceError('Provider send permit is unavailable or already consumed.', 'CONFLICT')
  sender.consumed = true
  return sender.identity
}

/** Revoke a paused sender before releasing its slot. Restart cannot recreate this proof. */
export function disableProviderSendPermit(
  permit: ProviderSendPermit,
  capability: typeof trustedProviderReconciliation,
): ProviderSenderDisabled {
  if (capability !== trustedProviderReconciliation)
    throw new ServiceError('Trusted provider reconciliation capability is required.', 'UNAUTHORIZED')
  const sender = permits.get(permit)
  if (!sender) throw new ServiceError('Original provider sender is unavailable.', 'CONFLICT')
  if (sender.consumed)
    throw new ServiceError('Consumed provider sender requires qualified transport reconciliation.', 'CONFLICT')
  sender.disabled = true
  const proof = Object.freeze({ ...sender.identity }) as ProviderSenderDisabled
  disabledProofs.set(proof, sender)
  return proof
}

export function assertProviderSenderDisabled(proof: ProviderSenderDisabled, identity: ProviderSendIdentity) {
  const sender = disabledProofs.get(proof)
  if (
    !sender?.disabled ||
    sender.identity.runId !== identity.runId ||
    sender.identity.intentId !== identity.intentId ||
    sender.identity.sendBoundaryId !== identity.sendBoundaryId ||
    sender.identity.claimEpoch !== identity.claimEpoch
  )
    throw new ServiceError('Exact original provider sender must be disabled before release.', 'CONFLICT')
}

/** Bind the original owner once, before any handshake. No durable row can reconstruct it. */
export function bindProviderSendPermitTransport(
  permit: ProviderSendPermit,
  owner: RpcTransportOwner,
  binding: { providerNamespace: string; configurationDigest: string },
): void {
  assertProviderSendPermitOwned(permit)
  const sender = permits.get(permit)!
  if (sender.consumed || sender.transport)
    throw new ServiceError('Original provider transport is already bound or consumed.', 'CONFLICT')
  inspectRpcTransportOwner(owner)
  sender.transport = Object.freeze({
    owner,
    providerNamespace: binding.providerNamespace,
    configurationDigest: binding.configurationDigest,
  })
}

/** Trusted original binding lookup only; neither consumes nor reconstructs a permit. */
export function inspectProviderSendPermitTransport(permit: ProviderSendPermit): Readonly<{
  owner: RpcTransportOwner
  providerNamespace: string
  configurationDigest: string
  identity: ProviderSendIdentity
}> {
  assertProviderSendPermitOwned(permit)
  const sender = permits.get(permit)!
  if (!sender.transport) throw new ServiceError('Original provider transport is not bound.', 'CONFLICT')
  return Object.freeze({ ...sender.transport, identity: sender.identity })
}

/** The original owned transport has already synchronously fenced its only write gate. */
export function sealConsumedProviderSender(
  permit: ProviderSendPermit,
  seal: RpcTransportSeal,
  native: { threadId: string | null; turnId: string | null },
): ProviderSenderExcluded {
  const sender = permits.get(permit)
  const transport = inspectRpcTransportSeal(seal)
  if (!sender?.consumed || !sender.transport || sender.transport.owner !== transport.owner)
    throw new ServiceError('Exact consumed provider sender and original transport are required.', 'CONFLICT')
  // Mutate the ORIGINAL WeakMap entry, not a copied permit. This never reopens.
  sender.disabled = true
  if (!sender.exclusion) {
    sender.exclusion = Object.freeze({}) as ProviderSenderExcluded
    exclusions.set(
      sender.exclusion,
      Object.freeze({
        ...sender.identity,
        providerNamespace: sender.transport.providerNamespace,
        configurationDigest: sender.transport.configurationDigest,
        transportId: transport.transportId,
        transportIncarnation: transport.transportIncarnation,
        threadId: native.threadId,
        turnId: native.turnId,
        senderEvidenceId: `sender_${randomUUID()}`,
        finalWatermark: Object.freeze({
          issuedRequests: transport.issuedRequests,
          writtenBytes: transport.writtenBytes,
        }),
      }),
    )
  }
  return sender.exclusion
}

export function inspectProviderSenderExcluded(proof: ProviderSenderExcluded): ProviderSenderExclusionRecord {
  const record = exclusions.get(proof)
  if (!record) throw new ServiceError('Exact original provider sender exclusion is required.', 'CONFLICT')
  return record
}
