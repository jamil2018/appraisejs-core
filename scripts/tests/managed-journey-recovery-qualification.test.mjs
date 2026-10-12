import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  classifyLateResult,
  DeliveryLedger,
  processIdentityMatches,
  reconcileDispatch,
} from '../lib/managed-journey-recovery-qualification.mjs'

test('QR-01 retries a pre-spawn effect only after absence proof', () => {
  assert.deepEqual(reconcileDispatch({ faultPoint: 'before-spawn', absenceProven: true }), {
    state: 'RETRYABLE',
    action: 'retry_exact_effect',
  })
  assert.equal(reconcileDispatch({ faultPoint: 'before-spawn', absenceProven: false }).state, 'UNKNOWN')
})

test('QR-02 keeps an unbound spawned process unknown', () => {
  assert.deepEqual(reconcileDispatch({ faultPoint: 'after-spawn-before-ready' }), {
    state: 'UNKNOWN',
    action: 'reconcile_only',
  })
})

test('QR-03 and QR-04 never repeat ambiguous thread or turn creation', () => {
  assert.equal(reconcileDispatch({ faultPoint: 'thread-start-ack-lost' }).action, 'do_not_repeat_thread_start')
  assert.equal(reconcileDispatch({ faultPoint: 'turn-start-ack-lost' }).action, 'do_not_repeat_turn_start')
})

test('QR-05 resumes only the exact persisted thread and configuration', () => {
  assert.equal(
    reconcileDispatch({
      faultPoint: 'same-attempt-resume',
      threadIdPersisted: true,
      exactConfigurationMatches: true,
    }).action,
    'resume_exact_thread',
  )
  assert.equal(
    reconcileDispatch({
      faultPoint: 'same-attempt-resume',
      threadIdPersisted: true,
      exactConfigurationMatches: false,
    }).action,
    'refuse_resume',
  )
})

test('QR-06 observes that a provider may survive stdin transport death', async t => {
  const fixturePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'fixtures/managed-journey-fake-provider.mjs',
  )
  const child = spawn(process.execPath, [fixturePath], { stdio: ['pipe', 'pipe', 'pipe'] })
  t.after(() => child.kill('SIGKILL'))

  const lines = createInterface({ input: child.stdout })
  const [line] = await once(lines, 'line')
  const ready = JSON.parse(line)
  child.stdin.end()
  await new Promise(resolve => setTimeout(resolve, 50))

  assert.equal(ready.method, 'provider/ready')
  assert.equal(child.exitCode, null)
  assert.doesNotThrow(() => process.kill(ready.params.pid, 0))
})

test('QR-07 rejects PID reuse when the birth marker changes', () => {
  const expected = { pid: 123, birthMarker: 'first', executableHash: 'same' }
  const reused = { pid: 123, birthMarker: 'second', executableHash: 'same' }
  assert.equal(processIdentityMatches(expected, reused), false)
})

test('QR-08 audits an occurred effect but rejects output after revocation', () => {
  assert.deepEqual(classifyLateResult({ authorizedAfterIo: false, effectOccurred: true }), {
    acceptOutput: false,
    auditEffect: true,
  })
})

test('QR-09 forbids replacement until predecessor stop is proven', () => {
  assert.equal(reconcileDispatch({ faultPoint: 'replacement' }).action, 'reconcile_only')
  assert.equal(reconcileDispatch({ faultPoint: 'replacement', predecessorStopped: true }).action, 'start_replacement')
})

test('QR-10 deduplicates identical events and rejects identity conflicts', () => {
  const ledger = new DeliveryLedger()
  assert.equal(ledger.ingest('delivery-1', { state: 'running', detail: { a: 1, b: 2 } }, 1).outcome, 'accepted')
  assert.equal(ledger.ingest('delivery-1', { detail: { b: 2, a: 1 }, state: 'running' }, 1).outcome, 'duplicate')
  assert.equal(ledger.ingest('delivery-1', { state: 'finished' }, 1).outcome, 'conflict')
  assert.equal(ledger.ingest('delivery-2', { state: 'queued' }, 0).outcome, 'out_of_order')
})
