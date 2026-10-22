import assert from 'node:assert/strict'
import { openSync, readSync, closeSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  createSourceRetentionBinding as resultBinding,
  decodeSourceRetentionResult as expectedResult,
  decodeSourceRetentionPreliminary,
  decodeSourceRetentionHandoff,
  encodeSourceRetentionPreliminary,
  decodeSourceRetentionAck,
  encodeSourceRetentionHandoff,
  encodeSourceRetentionCallbackCommit,
  decodeSourceRetentionCallbackCommit,
  decodeSourceOwnerFailure as checkOwnerFailure,
  assertSourceRetentionHandoffMatch,
} from '../fixture-terminal-codecs.mjs'
// Inert synchronous fixture controller: importing this module starts no work.
// The static capture derivation is bound separately in the successor packet.
export const sourceCaptureBudget = Object.freeze({ passive: 2048, admissions: 256, references: 128 })
export function createSourceCaseRuntime({ connected, report, failed: onFailure, budget = sourceCaptureBudget }) {
  const admissions = new Array(budget.admissions)
  const passive = new Array(budget.passive)
  const passiveOrigins = new Array(budget.passive)
  const passiveSites = new Array(budget.passive)
  const references = new Map()
  const stop = new Error('SOURCE_FIXTURE_FAILED')
  const state = {
    failed: false,
    error: undefined,
    decisive: undefined,
    current: undefined,
    orphan: undefined,
    orphanFilled: false,
    admissions,
    passive,
    passiveOrigins,
    passiveSites,
    references,
    admissionCount: 0,
    passiveCount: 0,
    incomplete: false,
  }
  let origin,
    sequence = 0
  function fail(error) {
    if (state.failed) return
    state.failed = true
    state.error = error
    state.decisive = state.current
    try {
      onFailure?.(state)
    } catch {}
  }
  function assertActive() {
    if (!state.failed && !connected()) fail(new Error('Required source IPC channel disconnected'))
    if (state.failed) throw stop
  }
  function begin(phase, kind = 'actual') {
    assertActive()
    if (state.admissionCount >= admissions.length) {
      fail(new Error('Source admission capacity exhausted'))
      throw stop
    }
    const admission = { id: ++sequence, phase, kind, filled: false, original: undefined }
    admissions[state.admissionCount++] = admission
    if (kind === 'actual') {
      state.current = admission
      origin = admission
    }
    return admission
  }
  function retainOrphan(original) {
    if (state.orphanFilled) return
    state.orphan = original
    state.orphanFilled = true
  }
  function keep(admission, original) {
    // This pre-admitted record is filled even if the original call latched failure synchronously.
    if (!admission.filled) {
      admission.original = original
      admission.filled = true
    } else if (admission.original !== original) {
      retainOrphan(original)
      fail(new Error('Original admission filled twice'))
    }
    assertActive()
    return original
  }
  function retain(name, original) {
    // Store before any fallible normal accounting. A new overflow value has its own reserved slot.
    if (references.has(name) || references.size < budget.references) references.set(name, original)
    else {
      retainOrphan(original)
      fail(new Error('Source named reference capacity exhausted'))
    }
    assertActive()
  }
  function capture(original, admission, site) {
    // No assertions, report calls, thenable assimilation or normal work on this passive path.
    const index = state.passiveCount
    if (admission && index < passive.length) {
      passive[index] = original
      passiveOrigins[index] = admission
      passiveSites[index] = site
      state.passiveCount = index + 1
      return
    }
    retainOrphan(original)
    state.incomplete = true
    fail(new Error(admission ? 'Passive capture capacity exhausted' : 'Missing passive admission origin'))
  }
  const observation = Object.freeze({
    origin: () => origin,
    capture,
    fail,
    eligible: () => !state.failed && connected(),
  })
  const runtime = {
    assertActive,
    begin,
    keep,
    retain,
    observation,
    get failed() {
      return state.failed
    },
    get phase() {
      return state.current?.phase ?? 'START'
    },
    event(kind, fields = {}) {
      assertActive()
      try {
        report(kind, fields)
      } catch (error) {
        fail(error)
        throw stop
      }
    },
  }
  return { runtime, observation, state, fail }
}

// Each fallible failure-evidence action is isolated from the first-cause latch.
function bestEffort(action) {
  try {
    action()
  } catch {}
}
function failurePhase(state) {
  return {
    phase: state.decisive?.phase ?? 'START',
    admission: state.decisive?.id,
    actualPromisesRetained: state.admissionCount,
    passiveReferencesRetained: state.passiveCount,
  }
}
function originalCaptured(state) {
  return Boolean(state.decisive?.filled)
}
function failureMessage(error) {
  try {
    return String(error?.message ?? error).slice(0, 2000)
  } catch {
    return 'UNREPORTABLE_ERROR'
  }
}
export function createSourceFailureReporter({ identity, write, connected, send, sendFailure }) {
  let reported = false
  return function reportFailure(state) {
    if (reported) return
    reported = true
    const result = {
      status: 'FAIL_RETENTION_REQUESTED_LIVENESS_UNVERIFIED',
      ...identity,
      ...failurePhase(state),
      originalCaptured: originalCaptured(state),
      error: failureMessage(state.error),
    }
    bestEffort(() => write(result))
    bestEffort(() => {
      if (connected())
        send(result, error => {
          if (error) sendFailure(error)
        })
    })
  }
}
export function registerSourceFailureHandlers(emitter, fail) {
  for (const name of ['uncaughtException', 'unhandledRejection', 'error']) emitter.on(name, fail)
}

const callbackCommitName = 'owner-retention-callback-commit.json'
function readTerminalEvidence(directory, name, limit, optional = false) {
  let fd
  try {
    fd = openSync(path.join(directory, name), 'r')
  } catch (error) {
    if (optional && error.code === 'ENOENT') return undefined
    throw error
  }
  try {
    const bytes = Buffer.alloc(limit + 1)
    let count = 0
    while (count <= limit) {
      const read = readSync(fd, bytes, count, bytes.length - count, null)
      if (read === 0) break
      count += read
    }
    assert(count <= limit, 'Terminal evidence byte cap')
    const json = bytes.subarray(0, count).toString('utf8')
    const value = JSON.parse(json)
    assert.equal(json.trimEnd(), JSON.stringify(value), 'Noncanonical or ambiguous terminal evidence JSON')
    return value
  } finally {
    closeSync(fd)
  }
}
function publishSourceCallbackCommit(directory, binding) {
  const bytes = encodeSourceRetentionCallbackCommit(binding)
  writeFileSync(path.join(directory, callbackCommitName), bytes, { flag: 'wx' })
}
function readSourceCallbackCommit(directory, binding) {
  const receipt = readTerminalEvidence(directory, callbackCommitName, 4096)
  return decodeSourceRetentionCallbackCommit(receipt, binding)
}
function reconcileSourceOwnerFailure(directory, identity) {
  const failure = readTerminalEvidence(directory, 'failure-latched.json', 16384, true)
  if (failure === undefined) return
  checkOwnerFailure(failure, identity)
  throw new Error('Observed owner first failure: ' + failure.error)
}
export function createSourceRetainedOwner({ runtime, fail, identity, directory, send, disconnect }) {
  let state = 'IDLE',
    binding
  function abort(error) {
    fail(error)
  }
  function start(result) {
    try {
      runtime.assertActive()
      assert.equal(state, 'IDLE', 'One retained result only')
      runtime.retain('retainedTerminalResult', result)
      binding = resultBinding(identity, JSON.stringify(result))
      expectedResult(binding)
      const message = encodeSourceRetentionPreliminary(binding)
      runtime.retain('retainedTerminalBinding', binding)
      state = 'WAIT_RETENTION_ACK'
      send(message, error => {
        if (error) abort(error)
      })
    } catch (error) {
      abort(error)
    }
  }
  function receive(message) {
    try {
      runtime.assertActive()
      assert.equal(state, 'WAIT_RETENTION_ACK', 'Unexpected retention ACK state')
      decodeSourceRetentionAck(message, binding)
      const handoff = encodeSourceRetentionHandoff(binding)
      state = 'HANDOFF_SENDING'
      send(handoff, completeHandoff)
    } catch (error) {
      abort(error)
    }
  }
  function completeHandoff(error) {
    if (error) {
      abort(error)
      return
    }
    try {
      runtime.assertActive()
      assert.equal(state, 'HANDOFF_SENDING', 'Unexpected final callback state')
      publishSourceCallbackCommit(directory, binding)
      state = 'CALLBACK_COMMITTED'
      runtime.assertActive()
      assert.equal(state, 'CALLBACK_COMMITTED')
      state = 'INTENTIONAL_RETENTION_DISCONNECT'
      disconnect()
      // No connected-channel guard is legal after intentional closure.
      if (runtime.failed) return
    } catch (error) {
      abort(error)
    }
  }
  function disconnected() {
    if (runtime.failed) return
    if (state === 'INTENTIONAL_RETENTION_DISCONNECT') state = 'DISCONNECTED'
    else abort(new Error('IPC disconnected before callback-committed retention handoff'))
  }
  return {
    start,
    receive,
    disconnected,
    get started() {
      return state !== 'IDLE'
    },
    get state() {
      return state
    },
  }
}
export function createSourceRetainedSupervisor({ identity, directory, send, failure }) {
  let state = 'IDLE',
    binding,
    firstFailure,
    failed = false,
    disconnected = false
  function abort(error) {
    if (failed) return
    failed = true
    firstFailure = error
    state = 'FAILED'
    try {
      failure(error)
    } catch {}
  }
  function active() {
    if (failed) throw firstFailure
    assert.notEqual(state, 'COMPLETED')
  }
  function receive(message) {
    try {
      active()
      if (message?.status === 'FAIL_RETENTION_REQUESTED_LIVENESS_UNVERIFIED') {
        checkOwnerFailure(message, identity)
        throw new Error('Owner failure notification: ' + message.error)
      }
      if (state === 'IDLE') {
        binding = decodeSourceRetentionPreliminary(message, identity)
        state = 'PENDING_RETENTION'
        const { nonce, pid, selected, resultDigest } = binding
        send({ type: 'ACK_EXPECTED_RETENTION', nonce, pid, selected, resultDigest }, error => {
          if (error) abort(error)
        })
        return
      }
      assert.equal(state, 'PENDING_RETENTION', 'Unexpected retained handoff state')
      const final = decodeSourceRetentionHandoff(message, identity)
      assertSourceRetentionHandoffMatch(final, binding)
      state = 'HANDOFF_RECEIVED'
    } catch (error) {
      abort(error)
    }
  }
  function observeDisconnect() {
    try {
      active()
      assert.equal(state, 'HANDOFF_RECEIVED', 'Early or duplicate owner disconnect')
      assert.equal(disconnected, false, 'One owner disconnect only')
      disconnected = true
    } catch (error) {
      abort(error)
    }
  }
  function complete(publish) {
    try {
      active()
      assert.equal(state, 'HANDOFF_RECEIVED')
      assert(disconnected, 'Actual original owner disconnect required')
      const result = expectedResult(binding)
      readSourceCallbackCommit(directory, binding)
      active()
      reconcileSourceOwnerFailure(directory, identity)
      active()
      publish(result) // Final failure reconciliation immediately precedes one-shot publication.
      active()
      state = 'COMPLETED'
      return result
    } catch (error) {
      abort(error)
      throw firstFailure
    }
  }
  return {
    receive,
    observeDisconnect,
    complete,
    abort,
    get failed() {
      return failed
    },
    get firstFailure() {
      return firstFailure
    },
    get result() {
      active()
      return expectedResult(binding)
    },
    get state() {
      return state
    },
  }
}
export function assertSourceKnownClosedExit(known, code, signal) {
  assert(known && code === 0 && signal === null, 'Unexpected owner death is not retention')
}
