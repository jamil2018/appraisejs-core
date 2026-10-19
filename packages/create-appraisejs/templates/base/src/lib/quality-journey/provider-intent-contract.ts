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
type Sender = { identity: ProviderSendIdentity; consumed: boolean; disabled: boolean }
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
  const permit = Object.freeze({ ...identity }) as ProviderSendPermit
  permits.set(permit, { identity, consumed: false, disabled: false })
  return permit
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
