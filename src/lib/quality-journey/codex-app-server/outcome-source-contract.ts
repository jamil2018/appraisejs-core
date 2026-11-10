import { createHash } from 'node:crypto'
import type { ProviderReconciliationIdentity } from '../provider-intent-contract'

export const outcomeSourceBounds = Object.freeze({
  envelopeBytes: 64 * 1024,
  allocations: 64,
  frames: 256,
  effects: 256,
  depth: 16,
  queries: 8,
  journalBytes: 1024 * 1024,
  journalRecords: 1024,
})
export const outcomeActivationRoutes = Object.freeze([
  'child',
  'auth',
  'network',
  'tool',
  'helper',
  'daemon',
  'inherited_descriptor',
] as const)
export type OutcomeActivationRoute = (typeof outcomeActivationRoutes)[number]
/** Candidate has no ports for any route. Reservation is evidence of possible activation, never permission. */
export const outcomeEffectRouteInventory = Object.freeze(
  outcomeActivationRoutes.map(route =>
    Object.freeze({
      route,
      owner: 'synthetic_custodian',
      enforcement: 'NO_PORT' as const,
      terminalOwner: 'UNAVAILABLE' as const,
    }),
  ),
)
export type OutcomeCustodyState = 'PREACTIVATION' | 'MAY_HAVE_ACTIVATED' | 'CLOSED' | 'UNKNOWN'
export class OutcomeSourceUnknownError extends Error {
  constructor(readonly reason: string) {
    super(`Outcome source UNKNOWN: ${reason}`)
    this.name = 'OutcomeSourceUnknownError'
  }
}
export const outcomeDigest = (value: string | Uint8Array) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`
export const outcomeSourceProtocolDigest = outcomeDigest('M06_OUTCOME_SOURCE_V1:synthetic:preactivation-only:03')
export const outcomeSourceQualificationDigest = outcomeDigest('SYNTHETIC_REPOSITORY:UNQUALIFIED_NATIVE:03')
/** Normalize SQLite's actual integer scalar without coercing text, fractions or unsafe values. */
export function outcomeSafeInteger(value: unknown, maximum: number): number {
  if (typeof value !== 'number' && typeof value !== 'bigint') throw new OutcomeSourceUnknownError('integer_type')
  if (typeof value === 'bigint' && (value < BigInt(0) || value > BigInt(maximum)))
    throw new OutcomeSourceUnknownError('integer_bound')
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0 || result > maximum)
    throw new OutcomeSourceUnknownError('integer_bound')
  return result
}
export type OutcomeCleanupState = 'UNREQUESTED' | 'QUEUED' | 'ADMITTED' | 'FULFILLED' | 'REJECTED' | 'RETAINED_BLOCKED'
/** One original cleanup layer. It never adopts a parent completion or retries an admitted method. */
export class OutcomeCleanupCell<T = unknown> {
  #state: OutcomeCleanupState = 'UNREQUESTED'
  #promise?: Promise<T>
  #resolve?: (value: T) => void
  #reject?: (error: unknown) => void
  #operation?: Promise<T>
  #error?: unknown
  get state(): OutcomeCleanupState {
    return this.#state
  }
  /** Observe a published completion without requesting, changing state or resolving it. */
  get publishedPromise(): Promise<T> | undefined {
    return this.#promise
  }
  get operation(): Promise<T> | undefined {
    return this.#operation
  }
  get error(): unknown {
    return this.#error
  }
  request(blocked: boolean): Promise<T> {
    if (!this.#promise) {
      this.#promise = new Promise<T>((resolve, reject) => {
        this.#resolve = resolve
        this.#reject = reject
      })
      void this.#promise.catch(() => {})
      this.#state = blocked ? 'RETAINED_BLOCKED' : 'QUEUED'
    } else if (blocked && this.#state === 'QUEUED') this.#state = 'RETAINED_BLOCKED'
    return this.#promise
  }
  admit(invoke: () => Promise<T>, settled: (rejected: boolean, error?: unknown) => void): void {
    if (this.#state !== 'QUEUED') return
    this.#state = 'ADMITTED' // The stable own promise already exists before synchronous descent.
    const reject = (error: unknown) => {
      this.#state = 'REJECTED'
      this.#error = error
      try {
        settled(true, error)
      } finally {
        this.#reject!(error)
      }
    }
    try {
      this.#operation = invoke()
      const observation = this.#operation.then(value => {
        this.#state = 'FULFILLED'
        try {
          settled(false)
        } catch (error) {
          reject(error)
          return
        }
        this.#resolve!(value)
      }, reject)
      void observation.catch(() => {})
    } catch (error) {
      reject(error)
    }
  }
}
export type OutcomeRequestPin = Readonly<{
  intentId: string
  observationKey: string
  requestHash: string
  receiptJson: string
}>
/** Pure immutable request data only; it never creates live source or database authority. */
export function captureOutcomeRequestPin(
  intentId: string,
  observationKey: unknown,
  suppliedHash: unknown,
  derivedHash: string,
  receiptJson: string,
): OutcomeRequestPin {
  if (
    typeof observationKey !== 'string' ||
    !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(observationKey) ||
    typeof suppliedHash !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(suppliedHash) ||
    suppliedHash !== derivedHash ||
    Buffer.byteLength(receiptJson) > outcomeSourceBounds.envelopeBytes
  )
    throw new OutcomeSourceUnknownError('request_pin')
  return Object.freeze({ intentId, observationKey, requestHash: derivedHash, receiptJson })
}
export function outcomeRequestPinMatches(pin: OutcomeRequestPin, result: OutcomeRequestPin): boolean {
  return (
    pin.intentId === result.intentId &&
    pin.observationKey === result.observationKey &&
    pin.requestHash === result.requestHash &&
    pin.receiptJson === result.receiptJson
  )
}
export function canonicalOutcomeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0))
      throw new OutcomeSourceUnknownError('number')
    if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null)
      throw new OutcomeSourceUnknownError('value')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalOutcomeJson).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalOutcomeJson((value as Record<string, unknown>)[key])}`)
    .join(',')}}`
}
export function assertOutcomeIdentity(identity: ProviderReconciliationIdentity): void {
  const ids = [
    identity.runId,
    identity.intentId,
    identity.sendBoundaryId,
    identity.providerNamespace,
    identity.transportId,
    identity.transportIncarnation,
  ]
  if (
    !ids.every(id => typeof id === 'string' && /^[a-zA-Z0-9_.:/-]{1,200}$/.test(id)) ||
    !identity.providerNamespace.startsWith('synthetic:') ||
    !/^sha256:[a-f0-9]{64}$/.test(identity.configurationDigest) ||
    !Number.isSafeInteger(identity.claimEpoch) ||
    identity.claimEpoch < 1 ||
    identity.threadId !== null ||
    identity.turnId !== null
  )
    throw new OutcomeSourceUnknownError('identity')
}
