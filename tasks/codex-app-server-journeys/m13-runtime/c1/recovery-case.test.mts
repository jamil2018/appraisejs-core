import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { recoveryDigest } from './recovery-read-binding.mts'
import { createOriginalRecoveryCase, recoveryPreparationSchema } from './recovery-case.mts'
import { createNativeQualificationParent } from './native-driver.mts'
import { parseNativeRunCommand } from './native-run.mts'

const hash = `sha256:${'a'.repeat(64)}`
const r1 = 'R1_ACKNOWLEDGED_NATIVE_INTERRUPTION' as const
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture() {
  const start = deferred<unknown>(),
    pause = deferred<{ operationalStatus: string; version: number; stateHash: string; eventId: string }>()
  let completed = false,
    active = true,
    ack = false,
    accepted = false,
    starts = 0,
    cancels = 0
  const events: string[] = []
  const recovery = createOriginalRecoveryCase({
    caseKind: r1,
    startOriginal() {
      starts++
      return start.promise
    },
    observeOriginal: () => ({
      actualAcknowledgementObserved: ack,
      canonicalAcceptanceObserved: accepted,
      originalTurnActive: active,
      completionObserved: completed,
    }),
    fenceAdmission() {
      events.push('fence')
    },
    async readOriginalScope() {
      return { version: 7, stateHash: hash }
    },
    async pauseOriginal() {
      events.push('pause-entered')
      const value = await pause.promise
      events.push('pause-committed')
      return value
    },
    async cancelOriginalAndRetain() {
      cancels++
      events.push('original-cancel')
    },
  })
  return {
    recovery,
    start,
    pause,
    events,
    setAck() {
      ack = true
    },
    accept() {
      accepted = true
    },
    complete() {
      completed = true
      active = false
    },
    stopWithoutCompletion() {
      active = false
    },
    counts: () => ({ starts, cancels }),
  }
}
const pauseInput = { caseKind: r1, expectedVersion: 7, expectedStateHash: hash, idempotencyKey: 'original-pause' }
test('legacy start-ack aliases and authenticated receipt replay refuse before fixture allocation/preparation', async () => {
  const parent = createNativeQualificationParent({ repositoryRoot: '/does-not-exist', evidenceRoot: '/does-not-exist' })
  for (const caseKind of ['R2_LOST_NATIVE_START_ACK', 'AUTHENTICATED_WORKER_RECEIPT_REPLAY']) {
    assert.equal(recoveryPreparationSchema.safeParse({ caseKind }).success, false)
    await assert.rejects(parent.prepareInitialCase({ recoveryCase: { caseKind } } as never))
    assert.equal(parent.snapshot().fixture.currentKind, null)
    assert.equal(parent.snapshot().current, null)
  }
  for (const caseKind of ['R2_NATIVE_START_ACK_LOSS', 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS'])
    assert.equal(recoveryPreparationSchema.safeParse({ caseKind }).success, true)
  assert.equal(parent.snapshot().fixture.currentKind, null)
  assert.throws(() =>
    parseNativeRunCommand(
      JSON.stringify({ op: 'pause-recovery-case', input: { ...pauseInput, assignmentSecret: 'forbidden' } }),
    ),
  )
  assert.throws(() => parseNativeRunCommand(JSON.stringify({ op: 'start-recovery-case', control: {}, retry: true })))
})
test('START_ENTERED is nonblocking, retains original once-only Promise and cannot infer ACK from start intent', async () => {
  const f = fixture()
  assert.deepEqual(f.recovery.start(), {
    phase: 'START_ENTERED',
    acknowledgementObserved: false,
    runtimeQualified: false,
  })
  assert.equal(f.counts().starts, 1)
  assert.equal((await f.recovery.poll()).phase, 'WAITING')
  await assert.rejects(f.recovery.pause(pauseInput), /boundary/)
  assert.throws(() => f.recovery.start(), /already/)
  f.start.resolve({ armed: true, turnStartEntered: true })
  await Promise.resolve()
  assert.equal((await f.recovery.poll()).acknowledgementObserved, false)
  await assert.rejects(f.recovery.pause(pauseInput), /boundary/)
})
test('canonical PAUSED commit precedes original task cancellation and duplicate pause is refused', async () => {
  const f = fixture()
  f.recovery.start()
  f.setAck()
  f.start.resolve({ original: true })
  const boundary = await f.recovery.poll()
  assert.equal(boundary.phase, 'BOUNDARY_OBSERVED')
  const paused = f.recovery.pause(pauseInput)
  assert.deepEqual(f.events, ['fence', 'pause-entered'])
  assert.equal(f.counts().cancels, 0)
  f.pause.resolve({ operationalStatus: 'PAUSED', version: 8, stateHash: hash, eventId: 'pause-original' })
  assert.equal((await paused).phase, 'PAUSED_RETAINED_UNKNOWN')
  assert.deepEqual(f.events, ['fence', 'pause-entered', 'pause-committed', 'original-cancel'])
  await assert.rejects(f.recovery.pause(pauseInput), /boundary/)
  await assert.rejects(f.recovery.poll(), /Finite/)
  assert.equal(f.counts().cancels, 1)
})
test('a synchronous original start failure consumes the start boundary and cannot be retried', () => {
  let calls = 0
  const recovery = createOriginalRecoveryCase({
    caseKind: r1,
    startOriginal() {
      calls++
      throw new Error('synthetic original entry failed')
    },
    observeOriginal: () => ({
      actualAcknowledgementObserved: false,
      canonicalAcceptanceObserved: false,
      originalTurnActive: false,
      completionObserved: false,
    }),
    fenceAdmission() {},
    async readOriginalScope() {
      throw new Error('unreachable')
    },
    async pauseOriginal() {
      throw new Error('unreachable')
    },
    async cancelOriginalAndRetain() {},
  })
  assert.throws(() => recovery.start(), /no retry/)
  assert.throws(() => recovery.start(), /already entered/)
  assert.equal(calls, 1)
  assert.equal(recovery.snapshot().fenced, true)
})
test('lost/stale canonical pause reply permanently fences and performs original emergency cleanup without retry', async () => {
  const f = fixture()
  f.recovery.start()
  f.setAck()
  const result = f.recovery.pause(pauseInput)
  f.pause.reject(new Error('synthetic stale hash or uncertain commit reply'))
  await assert.rejects(result, /PAUSE_COMMIT_UNPROVEN/)
  assert.equal(f.recovery.snapshot().pauseReceipt, null)
  assert.equal(f.recovery.snapshot().fenced, true)
  assert.equal(f.counts().cancels, 1)
  await assert.rejects(f.recovery.pause(pauseInput))
})
test('R1 ACK after completion or inactive supervision cannot qualify an interruption boundary', async () => {
  for (const completed of [true, false]) {
    const f = fixture()
    f.recovery.start()
    f.setAck()
    if (completed) f.complete()
    else f.stopWithoutCompletion()
    await assert.rejects(f.recovery.poll(), /R1_UNQUALIFIED/)
    await assert.rejects(f.recovery.pause(pauseInput), /boundary/)
    assert.equal(f.counts().cancels, 0)
  }
})
test('R1 completion observed while canonical pause settles remains unqualified and still retains original cleanup', async () => {
  const f = fixture()
  f.recovery.start()
  f.setAck()
  const pausing = f.recovery.pause(pauseInput)
  f.complete()
  f.pause.resolve({ operationalStatus: 'PAUSED', version: 8, stateHash: hash, eventId: 'pause-completed-race' })
  const result = await pausing
  assert.equal(result.phase, 'R1_UNQUALIFIED_PAUSED_RETAINED_UNKNOWN')
  assert.equal(result.interruption, 'UNQUALIFIED_COMPLETED_BEFORE_CANCELLATION')
  assert.equal(f.counts().cancels, 1)
  assert.equal(f.recovery.snapshot().cleanupSettled, true)
})
test('acceptance race prevents R1 pause qualification; delayed starts and finite polls do not manufacture ACK', async () => {
  const f = fixture()
  f.recovery.start()
  f.setAck()
  f.accept()
  await assert.rejects(f.recovery.pause(pauseInput), /boundary/)
  let ack = false
  const recovery = createOriginalRecoveryCase({
    caseKind: r1,
    startOriginal: () => new Promise(() => {}),
    observeOriginal: () => ({
      actualAcknowledgementObserved: ack,
      canonicalAcceptanceObserved: false,
      originalTurnActive: true,
      completionObserved: false,
    }),
    fenceAdmission() {},
    async readOriginalScope() {
      return { version: 1, stateHash: hash }
    },
    async pauseOriginal() {
      throw new Error('unreachable')
    },
    async cancelOriginalAndRetain() {},
    pollLimit: 1,
  })
  recovery.start()
  assert.equal((await recovery.poll()).phase, 'WAITING')
  ack = true
  await assert.rejects(recovery.poll(), /Finite/)
})
test('R1 refuses a canonical acceptance missed by the original outward receipt observation', async () => {
  let fenced = false,
    pauses = 0
  const recovery = createOriginalRecoveryCase({
    caseKind: r1,
    startOriginal: async () => ({}),
    observeOriginal: () => ({
      actualAcknowledgementObserved: true,
      canonicalAcceptanceObserved: false,
      originalTurnActive: true,
      completionObserved: false,
    }),
    fenceAdmission() {
      fenced = true
    },
    async readOriginalScope() {
      return { version: 8, stateHash: hash, canonicalAcceptanceObserved: true }
    },
    async pauseOriginal() {
      pauses++
      throw new Error('must not enter')
    },
    async cancelOriginalAndRetain() {},
  })
  recovery.start()
  await assert.rejects(recovery.poll(), /canonical acceptance already observed/)
  await assert.rejects(recovery.pause(pauseInput))
  assert.equal(fenced, true)
  assert.equal(pauses, 0)
})

// Binding hashes retain the original code-unit ordering and explicit undefined behavior.
test('recovery digest preserves original serialization for mixed-case keys and undefined values', () => {
  const bytes = '{"A":1,"a":2,"z":undefined}'
  assert.equal(
    recoveryDigest({ z: undefined, a: 2, A: 1 }),
    `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  )
})
