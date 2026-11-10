// Source-owned evidence and handlers; import performs no IO or lifetime allocation.
import assert from 'node:assert/strict'
import { appendFileSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createSourceCaseRuntime, createSourceFailureReporter } from './source-custody-guard.mjs'
import { withVerifiedPacketClient } from './source-custody-client-binding.mjs'
import { createSourceIpcFault, sourceIpcFaultReportError } from './source-custody-ipc-fault.mjs'

function ownerControl({ identity, directory, retained, connected, send, fault }, report) {
  const control = createSourceCaseRuntime({ connected, report, failed: state => failureReport(state) })
  retained.control = control
  const failureReport = createSourceFailureReporter({
    identity,
    write: result => {
      writeFileSync(path.join(directory, 'failure-latched.json'), JSON.stringify(result) + '\n', { flag: 'wx' })
      if (identity.faultSelector) {
        fault()?.reportError()
        throw new Error(sourceIpcFaultReportError)
      }
    },
    connected,
    send,
    sendFailure: error => control.fail(error),
  })
  return control
}
export function createOrdinarySourceOwnerEvidence(options) {
  let events = 0,
    bytes = 0
  const control = ownerControl(options, normalEvent)
  function normalEvent(kind, data) {
    assert(events < 96)
    const { pid, selected, nonce } = options.identity
    const line = JSON.stringify({
      sequence: events + 1,
      pid,
      selected,
      nonce,
      phase: control.runtime.phase,
      kind,
      ...data,
    })
    assert(Buffer.byteLength(line) <= 16384)
    assert(bytes + Buffer.byteLength(line) <= 128 * 1024)
    appendFileSync(path.join(options.directory, 'owner-events.jsonl'), line + '\n')
    events++
    bytes += Buffer.byteLength(line)
  }
  return control
}
export function createCleanupSourceOwnerEvidence(options) {
  let events = 0,
    bytes = 0
  const control = ownerControl(options, normalEvent)
  function normalEvent(kind, data = {}) {
    assert(events < 96, 'Event cap')
    const { pid, nonce } = options.identity
    const line = JSON.stringify({ sequence: events + 1, pid, nonce, phase: control.runtime.phase, kind, ...data })
    assert(Buffer.byteLength(line) <= 8192, 'Event byte cap')
    assert(bytes + Buffer.byteLength(line) <= 96 * 1024, 'Total evidence cap')
    appendFileSync(path.join(options.directory, 'owner-events.jsonl'), line + '\n')
    events++
    bytes += Buffer.byteLength(line)
  }
  return control
}
function boundFault({ identity, control, directory, emitter, connected, disconnect }) {
  const fault = createSourceIpcFault({ control, identity, directory, emitter, connected, disconnect })
  return fault
}
export function bindOrdinarySourceOwnerFault(options, manifest) {
  const { selected, faultSelector } = options.identity
  assert.equal(!!faultSelector, !!manifest.sourceIpcFaultOnly)
  if (!faultSelector) return undefined
  assert.equal(faultSelector, 'ipc-reserve-controlled')
  assert.equal(selected, faultSelector)
  assert.equal(manifest.faultReportAfterReceiptThrows, true)
  return boundFault(options)
}
export function bindCleanupSourceOwnerFault(options, manifest) {
  const { selectedLabel, faultSelector } = options.identity
  assert.equal(!!faultSelector, !!manifest.sourceIpcFaultOnly)
  if (!faultSelector) return undefined
  assert.equal(faultSelector, 'ipc-cleanup-ready')
  assert.equal(selectedLabel, 'canonical')
  assert.equal(manifest.faultReportAfterReceiptThrows, true)
  return boundFault(options)
}
export function createOrdinarySourceKnownClosedHandlers({
  runtime,
  fail,
  state,
  lifetime,
  clearLifetime,
  disconnect,
  terminal,
}) {
  function disconnected() {
    if (runtime.failed) return
    if (state.knownClosed && state.acknowledged) clearLifetime(lifetime)
    else terminal.disconnected()
  }
  function message(message) {
    if (terminal.started || message?.type === 'ACK_EXPECTED_RETENTION') {
      terminal.receive(message)
      return
    }
    try {
      runtime.assertActive()
      assert(message?.type === 'ACK_KNOWN_CLOSED' && state.knownClosed && !state.acknowledged, 'Unexpected closure ACK')
      state.acknowledged = true
      runtime.assertActive()
      disconnect()
      if (runtime.failed) return
    } catch (error) {
      fail(error)
    }
  }
  return { disconnected, message }
}
export function createCleanupSourceKnownClosedHandlers({ runtime, fail, state, lifetime, clearLifetime, disconnect }) {
  function disconnected() {
    if (runtime.failed) return
    if (state.knownClosed && state.acknowledged) clearLifetime(lifetime)
    else fail(new Error('IPC disconnected without acknowledged full known cleanup'))
  }
  function message(message) {
    try {
      runtime.assertActive()
      assert(message?.type === 'ACK_KNOWN_CLOSED' && state.knownClosed && !state.acknowledged, 'Unexpected IPC ACK')
      state.acknowledged = true
      runtime.assertActive()
      disconnect()
      // The required channel was intentionally closed; only the pure failure read applies now.
      if (runtime.failed) return
    } catch (error) {
      fail(error)
    }
  }
  return { disconnected, message }
}

// Whole shared bootstrap: the fixed family still selects its distinct evidence caps and fault grammar.
function ownerBootstrap(options, evidence, bind) {
  const { identity, directory, retained, emitter } = options
  let fault
  const connected = () => emitter.connected === true
  const control = evidence({
    identity,
    directory,
    retained,
    connected,
    send: (result, callback) => emitter.send(result, callback),
    fault: () => fault,
  })
  function bindFault(manifest) {
    fault = bind(
      { identity, control, directory, retained, emitter, connected, disconnect: () => emitter.disconnect() },
      manifest,
    )
    if (identity.faultSelector) retained.fault = fault
    return fault
  }
  return Object.freeze({
    control,
    runtime: control.runtime,
    bindFault,
    get fault() {
      return fault
    },
    beginStage(packet, phase, importOriginal) {
      const clientManifest = JSON.parse(readFileSync(path.join(packet, 'manifest.json')))
      bindFault(clientManifest)
      const actual = control.runtime.keep(
        control.runtime.begin(phase, 'auxiliary'),
        withVerifiedPacketClient(clientManifest, packet, importOriginal),
      )
      return { packet, clientManifest, actual }
    },
  })
}
export function createOrdinarySourceOwnerBootstrap(options) {
  return ownerBootstrap(options, createOrdinarySourceOwnerEvidence, bindOrdinarySourceOwnerFault)
}
export function createCleanupSourceOwnerBootstrap(options) {
  return ownerBootstrap(options, createCleanupSourceOwnerEvidence, bindCleanupSourceOwnerFault)
}
