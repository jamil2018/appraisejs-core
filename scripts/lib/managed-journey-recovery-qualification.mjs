import { createHash } from 'node:crypto'

export function processIdentityMatches(expected, observed) {
  return (
    expected.pid === observed.pid &&
    expected.birthMarker === observed.birthMarker &&
    expected.executableHash === observed.executableHash
  )
}

export function reconcileDispatch({
  faultPoint,
  absenceProven = false,
  processIdentityPersisted = false,
  threadIdPersisted = false,
  turnIdPersisted = false,
  exactConfigurationMatches = false,
  predecessorStopped = false,
}) {
  const handler = recoveryHandlers[faultPoint]
  if (!handler) throw new Error(`Unknown recovery fault point: ${faultPoint}`)
  return handler({
    absenceProven,
    processIdentityPersisted,
    threadIdPersisted,
    turnIdPersisted,
    exactConfigurationMatches,
    predecessorStopped,
  })
}

const choose = (condition, accepted, rejected) => (condition ? accepted : rejected)
const unknownReconcile = { state: 'UNKNOWN', action: 'reconcile_only' }

const recoveryHandlers = {
  'before-spawn': ({ absenceProven }) =>
    choose(absenceProven, { state: 'RETRYABLE', action: 'retry_exact_effect' }, unknownReconcile),
  'after-spawn-before-ready': ({ processIdentityPersisted }) =>
    choose(processIdentityPersisted, { state: 'STARTING', action: 'inspect_bound_process' }, unknownReconcile),
  'thread-start-ack-lost': ({ threadIdPersisted }) =>
    choose(
      threadIdPersisted,
      { state: 'STARTING', action: 'inspect_exact_thread' },
      { state: 'UNKNOWN', action: 'do_not_repeat_thread_start' },
    ),
  'turn-start-ack-lost': ({ turnIdPersisted }) =>
    choose(
      turnIdPersisted,
      { state: 'RUNNING', action: 'inspect_exact_turn' },
      { state: 'UNKNOWN', action: 'do_not_repeat_turn_start' },
    ),
  'same-attempt-resume': ({ threadIdPersisted, exactConfigurationMatches }) =>
    choose(
      threadIdPersisted && exactConfigurationMatches,
      { state: 'READY', action: 'resume_exact_thread' },
      { state: 'UNKNOWN', action: 'refuse_resume' },
    ),
  replacement: ({ predecessorStopped }) =>
    choose(predecessorStopped, { state: 'RETRYABLE', action: 'start_replacement' }, unknownReconcile),
}

export class DeliveryLedger {
  #deliveries = new Map()
  #lastSequence = -1

  ingest(id, payload, sequence = this.#lastSequence + 1) {
    const digest = createHash('sha256').update(canonicalJson(payload)).digest('hex')
    const existing = this.#deliveries.get(id)
    if (existing === digest) return { outcome: 'duplicate', digest }
    if (existing) return { outcome: 'conflict', digest, existingDigest: existing }
    if (sequence <= this.#lastSequence) return { outcome: 'out_of_order', digest }
    this.#deliveries.set(id, digest)
    this.#lastSequence = sequence
    return { outcome: 'accepted', digest }
  }
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value))
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalValue(nested)]),
  )
}

export function classifyLateResult({ authorizedAfterIo, effectOccurred }) {
  return {
    acceptOutput: authorizedAfterIo,
    auditEffect: effectOccurred,
  }
}
