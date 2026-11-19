import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { test } from 'node:test'
import {
  createOriginalRecoveryReaderFlight,
  finalizeOriginalRecoveryReader,
  retainedRecoveryReaderFlightCount,
} from './recovery-reader-flight.mts'

/** In-memory original-handle double only: no OS process, PID lookup, native provider, network, or signal. */
class OfflineChild extends EventEmitter {
  pid: number | undefined = 123
  stopCalls = 0
  onStop?: () => void
  kill() {
    this.stopCalls++
    this.onStop?.()
    return true
  }
  original() {
    return this as unknown as ChildProcess
  }
}
test('timeout reserves closure time inside the same deadline and finalizes only after original exit AND close', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const original = new OfflineChild(),
      events: string[] = []
    original.onStop = () => {
      events.push('original-stop-request')
      setTimeout(() => {
        events.push('exit')
        original.emit('exit', 0, null)
      }, 3)
      setTimeout(() => {
        events.push('close')
        original.emit('close', 0, null)
      }, 6)
    }
    const flight = createOriginalRecoveryReaderFlight(original.original(), 40)
    const final = finalizeOriginalRecoveryReader(flight, closure => {
      assert.equal(closure.exitObserved, true)
      assert.equal(closure.closeObserved, true)
      events.push('final-integrity')
      return 'CLOSED_TIMEOUT_INTEGRITY_OBSERVED'
    })
    context.mock.timers.tick(30)
    assert.deepEqual(events, ['original-stop-request'])
    context.mock.timers.tick(3)
    await Promise.resolve()
    assert.equal(flight.snapshot().exitObserved, true)
    assert.equal(flight.snapshot().closeObserved, false)
    assert.equal(events.includes('final-integrity'), false)
    context.mock.timers.tick(3)
    assert.equal(await final, 'CLOSED_TIMEOUT_INTEGRITY_OBSERVED')
    assert.deepEqual(events, ['original-stop-request', 'exit', 'close', 'final-integrity'])
    assert.equal(original.stopCalls, 1)
    assert.equal(flight.snapshot().hardDeadlineReached, false)
  } finally {
    context.mock.timers.reset()
  }
})
test('a never-closing original child yields bounded UNKNOWN, retains its exact flight, and never samples final integrity', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const original = new OfflineChild(),
      before = retainedRecoveryReaderFlightCount()
    const flight = createOriginalRecoveryReaderFlight(original.original(), 40)
    let finalChecks = 0,
      originalClosureObserved = false,
      settled = false
    void flight.originalClosure.then(() => {
      originalClosureObserved = true
    })
    const final = finalizeOriginalRecoveryReader(flight, () => {
      finalChecks++
      return 'FORBIDDEN_FINAL_PROOF'
    })
    void final.then(() => {
      settled = true
    })
    context.mock.timers.tick(39)
    await Promise.resolve()
    assert.equal(settled, false)
    assert.equal(original.stopCalls, 1)
    context.mock.timers.tick(1)
    assert.deepEqual(await final, {
      outcome: 'UNKNOWN',
      closureObserved: false,
      finalIntegrityProven: false,
      originalPendingFlightRetained: true,
    })
    assert.equal(finalChecks, 0)
    assert.equal(originalClosureObserved, false)
    assert.equal(flight.originalChild, original.original())
    assert.equal(retainedRecoveryReaderFlightCount(), before + 1)
    flight.requestOriginalStop()
    assert.equal(original.stopCalls, 1)
    assert.equal(flight.snapshot().hardDeadlineReached, true)
  } finally {
    context.mock.timers.reset()
  }
})
test('exit without close is not final evidence and cannot extend the total deadline', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const original = new OfflineChild()
    original.onStop = () => {
      original.emit('exit', 0, null)
    }
    const flight = createOriginalRecoveryReaderFlight(original.original(), 40)
    let finalChecks = 0
    const result = finalizeOriginalRecoveryReader(flight, () => {
      finalChecks++
      return 'FORBIDDEN_FINAL_PROOF'
    })
    context.mock.timers.tick(40)
    assert.equal(((await result) as { outcome: string }).outcome, 'UNKNOWN')
    assert.equal(flight.snapshot().exitObserved, true)
    assert.equal(flight.snapshot().closeObserved, false)
    assert.equal(finalChecks, 0)
  } finally {
    context.mock.timers.reset()
  }
})
test('failed spawn error plus observed close is finite nonstart evidence and retains no raw error', async () => {
  const original = new OfflineChild()
  original.pid = undefined
  const flight = createOriginalRecoveryReaderFlight(original.original(), 100)
  const result = finalizeOriginalRecoveryReader(flight, closure => closure)
  original.emit('error', new Error('PRIVATE_SYNTHETIC_PAYLOAD_MUST_NOT_ESCAPE'))
  original.emit('close', -2, null)
  const observed = await result
  assert.equal(observed.outcome, 'CLOSED')
  assert.equal(JSON.stringify(observed).includes('PRIVATE_SYNTHETIC'), false)
  assert.equal(original.stopCalls, 0)
})
