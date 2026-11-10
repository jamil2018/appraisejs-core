// Actual inert gate/filesystem mechanism only. No owner, client, database or controller entry is executed.
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createIpcFaultGate, publishIpcFaultArtifact } from './custody-fixture-ipc-fault.ts'
import { createFixtureAdmission } from './custody-fixture-admission.ts'
import { validateWindow, validateLatch, validateFence } from './custody-ipc-fault-controller.mjs'

const identity = { case: 'ipc-loss-before-postcallback-sql', pid: 1234, nonce: '00000000-0000-0000-0000-000000000000' }
function fixture() {
  const workspace = mkdtempSync(path.join(tmpdir(), 'custody-inert-ipc-gate-'))
  const retained = [],
    failures = []
  let connected = true
  const admission = createFixtureAdmission(
    retained,
    () => connected,
    (error, phase) => failures.push({ error, phase }),
  )
  const gate = admission.admitActual('original-inert-deferred', () => createIpcFaultGate(workspace))
  admission.keepActual('actual-inert-gate-promise', gate.promise)
  // Opaque ordinary objects/functions exercise fixture bookkeeping, never product/client authority.
  const actual = { callback: () => {}, client: {}, gate, outer: new Promise(() => {}), restore: () => {}, source: {} }
  admission.keepActual('actual-six-inert-references', actual)
  const referenceIds = {}
  for (const [role, value] of Object.entries(actual)) {
    admission.keepActual(role, value)
    const records = admission.diagnostics().operationReferences
    referenceIds[role] = records.at(-1).id
  }
  admission.admitActual('preregistered-observer', () => gate.observe(() => admission.unexpectedFailure))
  const window = Object.freeze({
    ...identity,
    version: 1,
    type: 'ipc-fault-window',
    sequence: 3,
    phase: 'IPC_FAULT_GATE_PENDING',
    nextFixtureOperation: 'POST_CALLBACK_SOURCE_STATE_READ',
    windowId: 'a'.repeat(64),
    admissionCount: admission.referenceSummary().operations,
    referenceIds,
  })
  gate.arm(window)
  admission.assertActive(window.phase)
  return {
    workspace,
    gate,
    admission,
    retained,
    actual,
    window,
    failures,
    disconnect() {
      connected = false
      const error = new Error('Unexpected supervisor disconnect; owner retained')
      admission.fail(error, 'supervisor-disconnect')
      return admission.unexpectedFailure
    },
    release(value = { ...identity, version: 1, windowId: window.windowId }) {
      writeFileSync(path.join(workspace, 'ipc-fault-release.json'), JSON.stringify(value), { flag: 'wx' })
    },
  }
}

test('real original deferred resolves after FAILED from exact one-shot release and preserves first cause', async () => {
  const f = fixture()
  try {
    const original = f.gate.promise
    assert.equal(original, f.gate.promise)
    assert.ok(f.retained.includes(original))
    validateWindow(f.window, identity)
    const first = f.disconnect()
    const receipt = {
      ...identity,
      version: 1,
      type: 'failure-retained',
      classification: 'UNEXPECTED_FIXTURE_FAILURE',
      phase: first.phase,
      operationPhase: first.operationPhase,
      referenceSummary: f.admission.referenceSummary(),
    }
    validateLatch(receipt, f.window)
    f.release()
    const value = await Promise.race([
      original,
      delay(500).then(() => {
        throw new Error('Inert test deadline')
      }),
    ])
    assert.equal(value, f.gate.snapshot().observedRelease)
    const count = f.admission.referenceSummary().operations
    assert.throws(
      () => f.admission.afterActual('POST_CALLBACK_SOURCE_STATE_READ', value),
      error => error === first.error,
    )
    assert.equal(f.admission.unexpectedFailure, first)
    assert.equal(f.admission.referenceSummary().operations, count)
    for (const [role, id] of Object.entries(f.window.referenceIds))
      assert.equal(f.admission.diagnostics().operationReferences.find(record => record.id === id).value, f.actual[role])
    const fence = {
      ...identity,
      version: 1,
      type: 'ipc-fault-fenced',
      windowId: f.window.windowId,
      site: 'POST_CALLBACK_SOURCE_STATE_READ',
      firstCauseIdentityPreserved: first.error === f.admission.unexpectedFailure.error,
      failurePhase: first.phase,
      admissionCount: count,
      referenceIds: f.window.referenceIds,
    }
    validateFence(fence, f.window, receipt)
    assert.equal(f.gate.snapshot().settled, true)
    assert.equal(f.gate.snapshot().refused, false)
  } finally {
    rmSync(f.workspace, { recursive: true })
  }
})

test('missing release keeps actual deferred pending without adding admissions or retained references', async () => {
  const f = fixture()
  try {
    f.disconnect()
    const before = f.admission.referenceSummary()
    await delay(35)
    assert.deepEqual(f.admission.referenceSummary(), before)
    assert.equal(f.gate.snapshot().settled, false)
    assert.equal(f.gate.snapshot().refused, false)
  } finally {
    rmSync(f.workspace, { recursive: true })
  }
})

test('foreign release permanently refuses the exact gate with no fallback or first-cause replacement', async () => {
  const f = fixture()
  try {
    const first = f.disconnect(),
      before = f.admission.referenceSummary()
    f.release({ ...identity, version: 1, windowId: 'b'.repeat(64) })
    await delay(35)
    assert.equal(f.gate.snapshot().refused, true)
    assert.equal(f.gate.snapshot().settled, false)
    assert.ok(f.gate.snapshot().observerError instanceof Error)
    assert.equal(f.admission.unexpectedFailure, first)
    assert.deepEqual(f.admission.referenceSummary(), before)
    assert.throws(() => f.release(), { code: 'EEXIST' })
  } finally {
    rmSync(f.workspace, { recursive: true })
  }
})

test('release before actual failure is not later healed by IPC loss', async () => {
  const f = fixture()
  try {
    f.release()
    await delay(35)
    assert.equal(f.gate.snapshot().refused, true)
    f.disconnect()
    await delay(20)
    assert.equal(f.gate.snapshot().settled, false)
    assert.equal(f.failures.length, 1)
  } finally {
    rmSync(f.workspace, { recursive: true })
  }
})

test('partial, oversized and symlink release artifacts never resolve a failed gate', async () => {
  for (const kind of ['partial', 'oversized', 'symlink']) {
    const f = fixture()
    try {
      f.disconnect()
      const filename = path.join(f.workspace, 'ipc-fault-release.json')
      if (kind === 'partial') writeFileSync(filename, '{')
      else if (kind === 'oversized') writeFileSync(filename, ' '.repeat(4097))
      else {
        writeFileSync(
          path.join(f.workspace, 'ordinary.json'),
          JSON.stringify({ ...identity, version: 1, windowId: f.window.windowId }),
        )
        symlinkSync(path.join(f.workspace, 'ordinary.json'), filename)
      }
      await delay(35)
      assert.equal(f.gate.snapshot().settled, false)
      assert.equal(f.gate.snapshot().refused, true)
    } finally {
      rmSync(f.workspace, { recursive: true })
    }
  }
})

test('atomic window/fence publication preserves exact bounded objects and refuses overwrite', () => {
  const f = fixture()
  try {
    publishIpcFaultArtifact(f.workspace, 'ipc-fault-window.json', f.window)
    const filename = path.join(f.workspace, 'ipc-fault-window.json')
    assert.deepEqual(JSON.parse(readFileSync(filename, 'utf8')), f.window)
    assert.equal(statSync(filename).nlink, 2) // immutable staged and fixed published evidence both retained
    assert.throws(() => publishIpcFaultArtifact(f.workspace, 'ipc-fault-window.json', f.window), { code: 'EEXIST' })
    assert.throws(() =>
      publishIpcFaultArtifact(f.workspace, 'ipc-fault-fence.json', { ...f.window, extra: 'x'.repeat(16384) }),
    )
  } finally {
    rmSync(f.workspace, { recursive: true })
  }
})
