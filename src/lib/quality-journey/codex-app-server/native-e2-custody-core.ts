import {
  canonicalE2Json,
  e2EnvelopeDigest,
  isE2Digest,
  isE2Id,
  parseE2FiniteEnvelope,
  type E2FiniteEnvelope,
} from '../provider-grant-contract'
import { e2PrivateNonceDigest, isE2PrivateNonce } from './native-e2-private-protocol'

/**
 * Factory-scoped inert custody algorithm for source-closed fixture tests. No production authority or installer is exported.
 * Injected transactions and constructors belong only to this core instance. Its tokens cannot join the
 * private production owner domain; no product registry imports this factory.
 */
const ownerBrand: unique symbol = Symbol('original-e2-owner')
const commandBrand: unique symbol = Symbol('committed-e2-observation')
type E2CoreOwner = Readonly<{ [ownerBrand]: true }>
export type E2CoreObservation = Readonly<{ [commandBrand]: true }>

export type E2InertReceipt = Readonly<{
  operationId: string
  requestDigest: string
  envelopeDigest: string
  commitReceiptDigest: string
}>
export type E2InertGrantCandidate =
  | Readonly<{ status: 'AFFIRMATIVE'; receipt: E2InertReceipt }>
  | Readonly<{ status: 'READ_ONLY_RECEIPT'; receipt: E2InertReceipt }>
  | Readonly<{ status: 'RETIREMENT_COMMITTED'; receiptDigest: string }>
  | Readonly<{ status: 'REFUSED'; reason: string }>
  | Readonly<{ status: 'UNKNOWN_NO_DISPATCH' }>

export type E2GrantRequest<Tx> = Readonly<{
  envelope: E2FiniteEnvelope
  requestDigest: string
  issueE2GrantInTx: (tx: Tx, request: E2GrantRequest<Tx>) => Promise<E2InertGrantCandidate>
}>
export type E2TransactionOwner<Tx> = Readonly<{
  $transaction: <T>(callback: (tx: Tx) => Promise<T>) => Promise<T>
}>
type E2CoreResult =
  | Readonly<{ status: 'COMMIT_OBSERVED'; observation: E2CoreObservation; receipt: E2InertReceipt }>
  | Readonly<{ status: 'READ_ONLY_RECEIPT'; receipt: E2InertReceipt }>
  | Readonly<{ status: 'RETIREMENT_COMMITTED'; receiptDigest: string }>
  | Readonly<{ status: 'REFUSED'; reason: string }>
  | Readonly<{ status: 'UNKNOWN_NO_DISPATCH' }>

type Flight = {
  readonly request: object
  readonly issuer: unknown
  readonly operationId: string
  readonly requestDigest: string
  readonly envelopeDigest: string
  readonly envelope: E2FiniteEnvelope
  consumed: boolean
}
type OwnerState = {
  readonly runId: string
  readonly intentId: string
  readonly sourceTupleDigest: string
  readonly prospectiveNonce: string
  readonly prospectiveNonceDigest: string
  readonly flights: Map<string, Flight>
  readonly spent: Map<string, Readonly<{
    requestDigest: string
    envelopeDigest: string
    result: Exclude<E2CoreResult, { status: 'COMMIT_OBSERVED' }>
    receipt?: E2InertReceipt
  }>>
}
type ObservationState = {
  readonly owner: E2CoreOwner
  readonly envelope: E2FiniteEnvelope
  readonly receipt: E2InertReceipt
  consumed: boolean
}
type ParentCustody = {
  readonly owner: E2CoreOwner
  readonly fd3: object
  readonly fd4: object
  readonly prospectiveNonceDigest: string
  readonly sourceTupleDigest: string
}

export type E2ReturnedChild = object & { readonly stdio: readonly unknown[] }
type E2SpawnResult<Child extends E2ReturnedChild> =
  | Readonly<{ status: 'FIXTURE_CONSTRUCTOR_RETURNED'; child: Child }>
  | Readonly<{ status: 'FIXTURE_CONSTRUCTOR_UNKNOWN' }>
  | Readonly<{ status: 'REFUSED' }>


export function createInertE2CustodyCore() {
const owners = new WeakMap<object, OwnerState>()
const commands = new WeakMap<object, ObservationState>()
const childCustody = new WeakMap<object, ParentCustody>()
const commitProofs = new WeakSet<object>()
const isPlain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const exact = (value: unknown, fields: readonly string[]): value is Record<string, unknown> =>
  isPlain(value) && Object.keys(value).length === fields.length && Object.keys(value).every(key => fields.includes(key))
const unknown = (): E2CoreResult => ({ status: 'UNKNOWN_NO_DISPATCH' })

/** The caller supplies a fresh 128-bit nonce before native-start admission; only its digest leaves this custody. */
function createOwner(input: Readonly<{
  runId: string
  intentId: string
  sourceTupleDigest: string
  prospectiveNonce: string
}>): E2CoreOwner {
  if (!isPlain(input) || !exact(input, ['runId', 'intentId', 'sourceTupleDigest', 'prospectiveNonce']) ||
    !isE2Digest(input.sourceTupleDigest) || !isE2PrivateNonce(input.prospectiveNonce) ||
    !isE2Id(input.runId) || !isE2Id(input.intentId))
    throw new Error('E2 owner identity refused')
  const owner = Object.freeze({ [ownerBrand]: true as const })
  owners.set(owner, {
    runId: input.runId,
    intentId: input.intentId,
    sourceTupleDigest: input.sourceTupleDigest,
    prospectiveNonce: input.prospectiveNonce,
    prospectiveNonceDigest: e2PrivateNonceDigest(input.prospectiveNonce),
    flights: new Map(),
    spent: new Map(),
  })
  return owner
}

function parseReceipt(value: unknown, flight: Flight): E2InertReceipt | null {
  if (!exact(value, ['operationId', 'requestDigest', 'envelopeDigest', 'commitReceiptDigest']) ||
    value.operationId !== flight.operationId || value.requestDigest !== flight.requestDigest ||
    value.envelopeDigest !== flight.envelopeDigest || !isE2Digest(value.commitReceiptDigest)) return null
  return Object.freeze({
    operationId: value.operationId,
    requestDigest: value.requestDigest,
    envelopeDigest: value.envelopeDigest,
    commitReceiptDigest: value.commitReceiptDigest,
  }) as E2InertReceipt
}

function installAfterCommit(owner: E2CoreOwner, flight: Flight, proof: object,
  receipt: E2InertReceipt): E2CoreObservation | null {
  const state = owners.get(owner)
  if (!commitProofs.delete(proof) || !state || state.flights.get(flight.operationId) !== flight ||
    flight.consumed || flight.requestDigest !== receipt.requestDigest ||
    flight.envelopeDigest !== receipt.envelopeDigest) return null
  flight.consumed = true
  const observation = Object.freeze({ [commandBrand]: true as const })
  commands.set(observation, { owner, envelope: flight.envelope, receipt, consumed: false })
  return observation
}

/**
 * Sole owner-facing grant entry. Callback success is inert: only affirmative fulfillment of the actual outer
 * transaction promise, preserving the callback's exact result object and original flight, can install a observation.
 * Any rejection, ambiguous reply, copied result, or replay burns the operation locally without a retry.
 */
async function observeOriginalTransaction<Tx>(owner: E2CoreOwner, prisma: E2TransactionOwner<Tx>,
  request: E2GrantRequest<Tx>): Promise<E2CoreResult> {
  const state = owners.get(owner)
  if (!state || !exact(request, ['envelope', 'requestDigest', 'issueE2GrantInTx']) ||
    typeof request.issueE2GrantInTx !== 'function' ||
    !isE2Digest(request.requestDigest)) return { status: 'REFUSED', reason: 'INVALID_REQUEST' }
  let envelope: E2FiniteEnvelope
  let digest: string
  try {
    envelope = parseE2FiniteEnvelope(request.envelope)
    digest = e2EnvelopeDigest(envelope)
  } catch {
    return { status: 'REFUSED', reason: 'INVALID_ENVELOPE' }
  }
  const operationId = envelope.operationId
  if (envelope.runId !== state.runId || envelope.intentId !== state.intentId ||
    envelope.sourceTupleDigest !== state.sourceTupleDigest)
    return { status: 'REFUSED', reason: 'FOREIGN_OWNER' }
  const prior = state.spent.get(operationId)
  if (prior) {
    if (prior.requestDigest !== request.requestDigest || prior.envelopeDigest !== digest)
      return { status: 'REFUSED', reason: 'DUPLICATE_MISMATCH' }
    return prior.receipt ? { status: 'READ_ONLY_RECEIPT', receipt: prior.receipt } : prior.result
  }
  if (state.flights.has(operationId)) return { status: 'REFUSED', reason: 'DUPLICATE_IN_FLIGHT' }
  const snapshot = Object.freeze(JSON.parse(canonicalE2Json(envelope))) as E2FiniteEnvelope
  const issuer = request.issueE2GrantInTx
  const flight: Flight = { request, issuer, operationId,
    requestDigest: request.requestDigest,
    envelopeDigest: digest, envelope: snapshot, consumed: false }
  state.flights.set(operationId, flight)
  let callbackResult: E2InertGrantCandidate | undefined
  let callbackFinished = false
  let result: E2CoreResult = unknown()
  try {
    const outerResult = await prisma.$transaction(async tx => {
      const candidate = await issuer(tx, request)
      if (isPlain(candidate)) {
        if ('receipt' in candidate && isPlain(candidate.receipt)) Object.freeze(candidate.receipt)
        Object.freeze(candidate)
      }
      callbackResult = candidate
      callbackFinished = true
      return candidate
    })
    if (!callbackFinished || outerResult !== callbackResult || state.flights.get(operationId) !== flight ||
      flight.request !== request || flight.issuer !== issuer || request.issueE2GrantInTx !== issuer ||
      request.requestDigest !== flight.requestDigest ||
      e2EnvelopeDigest(request.envelope) !== flight.envelopeDigest || !isPlain(outerResult)) return result
    if (exact(outerResult, ['status', 'receipt']) && outerResult.status === 'AFFIRMATIVE') {
      const receipt = parseReceipt(outerResult.receipt, flight)
      if (!receipt) return result
      const proof = Object.freeze({})
      commitProofs.add(proof)
      const observation = installAfterCommit(owner, flight, proof, receipt)
      if (!observation) return result
      result = { status: 'COMMIT_OBSERVED', observation, receipt }
    } else if (exact(outerResult, ['status', 'receipt']) && outerResult.status === 'READ_ONLY_RECEIPT') {
      const receipt = parseReceipt(outerResult.receipt, flight)
      if (!receipt) return result
      result = { status: 'READ_ONLY_RECEIPT', receipt }
    } else if (exact(outerResult, ['status', 'receiptDigest']) &&
      outerResult.status === 'RETIREMENT_COMMITTED' && isE2Digest(outerResult.receiptDigest)) {
      result = { status: 'RETIREMENT_COMMITTED', receiptDigest: outerResult.receiptDigest }
    } else if (exact(outerResult, ['status', 'reason']) && outerResult.status === 'REFUSED' &&
      typeof outerResult.reason === 'string' && /^[A-Z_]{1,64}$/.test(outerResult.reason)) {
      result = { status: 'REFUSED', reason: outerResult.reason }
    } else if (exact(outerResult, ['status']) && outerResult.status === 'UNKNOWN_NO_DISPATCH') {
      result = unknown()
    }
    return result
  } catch {
    return unknown()
  } finally {
    flight.consumed = true
    state.flights.delete(operationId)
    state.spent.set(operationId, { requestDigest: flight.requestDigest,
      envelopeDigest: flight.envelopeDigest,
      result: result.status === 'COMMIT_OBSERVED' ? { status: 'READ_ONLY_RECEIPT', receipt: result.receipt } : result,
      ...(result.status === 'COMMIT_OBSERVED' || result.status === 'READ_ONLY_RECEIPT' ? { receipt: result.receipt } : {}),
    })
  }
}

/** Consumes the native-start observation before exactly one injected constructor call. No child is started here. */
async function constructAfterObservation<Child extends E2ReturnedChild>(owner: E2CoreOwner,
  observation: E2CoreObservation,
  construct: (input: Readonly<{ envelope: E2FiniteEnvelope; commitReceiptDigest: string;
    prospectiveNonceDigest: string }>) => Promise<Child> | Child): Promise<E2SpawnResult<Child>> {
  const state = owners.get(owner)
  const grant = commands.get(observation)
  if (!state || !grant || grant.owner !== owner || grant.consumed || grant.envelope.kind !== 'NATIVE_START')
    return { status: 'REFUSED' }
  grant.consumed = true
  try {
    const child = await construct(Object.freeze({ envelope: grant.envelope,
      commitReceiptDigest: grant.receipt.commitReceiptDigest,
      prospectiveNonceDigest: state.prospectiveNonceDigest }))
    if (!child || typeof child !== 'object' || !Array.isArray(child.stdio))
      return { status: 'FIXTURE_CONSTRUCTOR_UNKNOWN' }
    const fd3 = child.stdio[3]
    const fd4 = child.stdio[4]
    if (!fd3 || typeof fd3 !== 'object' || !fd4 || typeof fd4 !== 'object' || fd3 === fd4 ||
      childCustody.has(child)) return { status: 'FIXTURE_CONSTRUCTOR_UNKNOWN' }
    childCustody.set(child, { owner, fd3, fd4,
      prospectiveNonceDigest: state.prospectiveNonceDigest, sourceTupleDigest: state.sourceTupleDigest })
    return { status: 'FIXTURE_CONSTRUCTOR_RETURNED', child }
  } catch {
    return { status: 'FIXTURE_CONSTRUCTOR_UNKNOWN' }
  }
}


return Object.freeze({ createOwner, observeOriginalTransaction, constructAfterObservation })
}
