import type { ChildProcess } from 'node:child_process'

export type RecoveryReaderClosure = Readonly<{
  outcome: 'CLOSED'
  exitObserved: boolean
  closeObserved: true
  launchErrorObserved: boolean
  code: number | null
  signal: NodeJS.Signals | null
  stopRequested: boolean
}>
type RecoveryReaderUnknown = Readonly<{
  outcome: 'UNKNOWN'
  closureObserved: false
  finalIntegrityProven: false
  originalPendingFlightRetained: true
}>
type Flight = Readonly<{
  originalChild: ChildProcess
  originalClosure: Promise<RecoveryReaderClosure>
  completion: Promise<RecoveryReaderClosure | RecoveryReaderUnknown>
  requestOriginalStop(): void
  snapshot(): Readonly<{
    exitObserved: boolean
    closeObserved: boolean
    stopRequested: boolean
    hardDeadlineReached: boolean
  }>
}>
const retainedUnknownFlights = new Set<Flight>()
export function retainedRecoveryReaderFlightCount() {
  return retainedUnknownFlights.size
}

/** One captured child only. Stop request, exit, and stdio closure are distinct observations. */
export function createOriginalRecoveryReaderFlight(originalChild: ChildProcess, totalMs: number): Flight {
  if (!Number.isSafeInteger(totalMs) || totalMs < 1 || totalMs > 30_000)
    throw new Error('Finite total reader deadline required')
  const reserveMs = Math.min(1000, Math.max(1, Math.floor(totalMs / 4)))
  let exitObserved = false,
    closeObserved = false,
    launchErrorObserved = false,
    stopRequested = false,
    hardDeadlineReached = false
  let code: number | null = null,
    signal: NodeJS.Signals | null = null,
    settled = false
  let resolveClosure!: (value: RecoveryReaderClosure) => void
  let resolveCompletion!: (value: RecoveryReaderClosure | RecoveryReaderUnknown) => void
  const originalClosure = new Promise<RecoveryReaderClosure>(resolve => {
    resolveClosure = resolve
  })
  const completion = new Promise<RecoveryReaderClosure | RecoveryReaderUnknown>(resolve => {
    resolveCompletion = resolve
  })
  function requestOriginalStop() {
    if (stopRequested || closeObserved) return
    stopRequested = true
    try {
      originalChild.kill()
    } catch {
      /* A failed original stop request never proves closure. */
    }
  }
  function observeClosure() {
    // A failed spawn has no process to emit exit; its original error plus close is the nonstart observation.
    if (!closeObserved || !(exitObserved || (launchErrorObserved && originalChild.pid === undefined))) return
    const value: RecoveryReaderClosure = Object.freeze({
      outcome: 'CLOSED',
      exitObserved,
      closeObserved: true,
      launchErrorObserved,
      code,
      signal,
      stopRequested,
    })
    resolveClosure(value)
    if (!settled) {
      settled = true
      clearTimeout(softTimer)
      clearTimeout(hardTimer)
      resolveCompletion(value)
    }
  }
  originalChild.once('exit', (observedCode, observedSignal) => {
    exitObserved = true
    code = observedCode
    signal = observedSignal
    observeClosure()
  })
  originalChild.once('close', (observedCode, observedSignal) => {
    closeObserved = true
    code = observedCode
    signal = observedSignal
    observeClosure()
  })
  originalChild.once('error', () => {
    launchErrorObserved = true
    observeClosure()
  })
  const softTimer = setTimeout(requestOriginalStop, totalMs - reserveMs)
  const hardTimer = setTimeout(() => {
    if (settled) return
    settled = true
    hardDeadlineReached = true
    retainedUnknownFlights.add(flight)
    resolveCompletion(
      Object.freeze({
        outcome: 'UNKNOWN',
        closureObserved: false,
        finalIntegrityProven: false,
        originalPendingFlightRetained: true,
      }),
    )
  }, totalMs)
  const flight: Flight = Object.freeze({
    originalChild,
    originalClosure,
    completion,
    requestOriginalStop,
    snapshot: () => Object.freeze({ exitObserved, closeObserved, stopRequested, hardDeadlineReached }),
  })
  return flight
}

/** Final integrity sampling is legal only after the original exit and close observation. */
export async function finalizeOriginalRecoveryReader<T>(
  flight: Flight,
  afterObservedClosure: (closure: RecoveryReaderClosure) => T | Promise<T>,
) {
  const outcome = await flight.completion
  if (outcome.outcome === 'UNKNOWN') return outcome
  return afterObservedClosure(outcome)
}
