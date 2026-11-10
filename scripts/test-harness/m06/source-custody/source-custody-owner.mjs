// Ordinary detached lifetime owner. No SQLite or ambient application imports.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { Module } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyPacketClient } from './source-custody-client-binding.mjs'
import { createSourceRetainedOwner, registerSourceFailureHandlers } from './source-custody-guard.mjs'
import {
  createOrdinarySourceOwnerBootstrap,
  createOrdinarySourceKnownClosedHandlers,
} from './source-custody-owner-evidence.mjs'
const [directory, selected, nonce, faultSelector] = process.argv.slice(2)
const retained = {}
const lifetime = setInterval(() => void retained, 60_000)
const closureState = { knownClosed: false, acknowledged: false }
const bootstrap = createOrdinarySourceOwnerBootstrap({
  identity: { pid: process.pid, selected, nonce, ...(faultSelector ? { faultSelector } : {}) },
  directory,
  retained,
  emitter: process,
})
const { control, runtime } = bootstrap

function send(result) {
  runtime.assertActive()
  writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  runtime.assertActive()
  process.send(result, error => {
    if (error) control.fail(error)
  })
}
const retainedTerminal = createSourceRetainedOwner({
  runtime,
  fail: control.fail,
  identity: { nonce, pid: process.pid, selected },
  directory,
  send: (message, callback) => process.send(message, callback),
  disconnect: () => process.disconnect(),
})
retained.terminal = retainedTerminal
registerSourceFailureHandlers(process, control.fail)
const closureHandlers = createOrdinarySourceKnownClosedHandlers({
  runtime,
  fail: control.fail,
  state: closureState,
  lifetime,
  clearLifetime: clearInterval,
  disconnect: () => process.disconnect(),
  terminal: retainedTerminal,
})
process.on('disconnect', closureHandlers.disconnected)
process.on('message', closureHandlers.message)

const originalLoad = Module._load
Module._load = function (request, ...args) {
  if (['node:sqlite', 'sqlite', 'sqlite3', 'better-sqlite3'].includes(request))
    throw new Error('OWNER_NATIVE_DB_IMPORT_FORBIDDEN')
  return Reflect.apply(originalLoad, this, [request, ...args])
}
try {
  runtime.assertActive()
  assert(path.isAbsolute(directory))
  assert.deepEqual(process.execArgv, [])
  assert.equal(process.env.DATABASE_URL, `file:${path.join(directory, 'tested.db')}`)
  runtime.event('ordinary-owner-start', { execArgv: process.execArgv, engineQueryEvents: 'UNAVAILABLE_UNCONFIGURED' })
  const stage = bootstrap.beginStage(
    path.dirname(fileURLToPath(import.meta.url)),
    'IMPORT',
    () => import('./source-custody-cases.ts'),
  )
  const { packet, clientManifest } = stage
  const api = await stage.actual
  runtime.assertActive()
  verifyPacketClient(clientManifest, packet)
  const result = await runtime.keep(
    runtime.begin('CASE', 'auxiliary'),
    bootstrap.fault
      ? api.runSourceIpcFaultCase(directory, runtime, bootstrap.fault)
      : api.runSourceCase(selected, directory, runtime),
  )
  runtime.assertActive()
  verifyPacketClient(clientManifest, packet)
  if (result.retained) {
    const report = {
      status: 'EXPECTED_RETENTION_LIVENESS_UNVERIFIED',
      pid: process.pid,
      selected,
      nonce,
      result,
      actualPromisesRetained: control.state.admissionCount,
      phase: runtime.phase,
    }
    runtime.retain('retainedTerminalReport', report)
    writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
    runtime.assertActive()
    retainedTerminal.start(report)
  } else {
    runtime.assertActive()
    closureState.knownClosed = true
    send({ status: 'KNOWN_CLOSED_SOURCE_CASE', pid: process.pid, selected, nonce, result })
  }
} catch (error) {
  control.fail(error)
  bootstrap.fault?.stopped(error)
}
