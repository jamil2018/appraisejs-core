// One fresh standalone OS controller per request. No inner case, client or owner runs in the caller.
import assert from 'node:assert/strict'
import path from 'node:path'
import { readReleaseEvidenceFile } from '../fixture-evidence-read.mjs'
import { publishFixtureAuditRecord } from '../fixture-audit-records.mjs'
import { sourceControllerEffects } from './source-custody-controller-effects.mjs'
const {
  fork,
  randomUUID,
  mkdirSync,
  mkdtempSync,
  setInterval,
  clearInterval,
  process: originalProcess,
} = sourceControllerEffects
const transports = new Map()
const limit = 65536
export function validateSourceTransportResult(value, request, pid) {
  assert(value && typeof value === 'object' && !Array.isArray(value))
  assert.equal(Object.keys(value).sort().join(','), 'controller,nonce,result,selected,status,version')
  assert.equal(value.version, 1)
  assert.equal(value.status, 'SOURCE_CASE_RESULT')
  assert.equal(value.nonce, request.nonce)
  assert.equal(value.selected, request.selected)
  assert(value.controller && typeof value.controller === 'object' && !Array.isArray(value.controller))
  assert.equal(Object.keys(value.controller).sort().join(','), 'execPath,pid,script')
  assert.equal(value.controller.pid, pid)
  assert.equal(value.controller.execPath, request.execPath)
  assert.equal(value.controller.script, request.script)
  assert(value.result && typeof value.result === 'object' && !Array.isArray(value.result))
  assert.equal(
    Object.keys(value.result).sort().join(','),
    'canonicalInputDigest,directory,nonce,ownerPid,selected,status,supervisorPid',
  )
  assert.equal(value.result.selected, request.selected)
  assert.equal(typeof value.result.nonce, 'string')
  assert(value.result.nonce.length > 0)
  for (const key of ['supervisorPid', 'ownerPid'])
    assert(Number.isSafeInteger(value.result[key]) && value.result[key] > 0)
  assert(['KNOWN_OWNER_EXIT0', 'EXPECTED_RETAINED_SUPERVISOR_EXIT'].includes(value.result.status))
  assert(path.isAbsolute(value.result.directory))
  assert.match(value.result.canonicalInputDigest, /^[a-f0-9]{64}$/)
  return value.result
}
export function readSourceTransportRequest(directory, selected, nonce, controllerScript) {
  assert(path.isAbsolute(directory))
  assert(path.isAbsolute(controllerScript), 'Fixed absolute local controller identity required')
  assert.equal(path.basename(controllerScript), 'source-custody-controller.mjs')
  const evidence = readReleaseEvidenceFile(path.join(directory, 'request.json'), limit)
  assert(evidence, 'Own transport request missing')
  const request = JSON.parse(evidence.bytes)
  assert(request && typeof request === 'object' && !Array.isArray(request))
  assert.equal(Object.keys(request).sort().join(','), 'execPath,nonce,script,selected,version')
  assert.equal(request.version, 1)
  assert.equal(request.nonce, nonce)
  assert.equal(request.selected, selected)
  assert.equal(request.script, controllerScript)
  assert.equal(request.execPath, originalProcess.execPath)
  return Object.freeze(request)
}
export function publishSourceTransportResult(request, directory, result, guard) {
  guard.assertActive()
  const envelope = {
    version: 1,
    status: 'SOURCE_CASE_RESULT',
    nonce: request.nonce,
    selected: request.selected,
    controller: { pid: originalProcess.pid, execPath: originalProcess.execPath, script: request.script },
    result,
  }
  validateSourceTransportResult(envelope, request, originalProcess.pid)
  assert(Buffer.byteLength(JSON.stringify(envelope)) + 1 <= limit)
  guard.assertActive()
  publishFixtureAuditRecord(directory, 'result.json', envelope)
  guard.assertActive()
}
export function runSourceCustodyTransport(selected, controllerScript) {
  // Preallocate the original-child/error/exit cells before directory creation or fork.
  const state = Object.seal({
    child: undefined,
    pid: undefined,
    failed: false,
    firstError: undefined,
    unknown: undefined,
    interval: undefined,
    request: undefined,
    directory: undefined,
    exited: false,
  })
  return new Promise((resolve, reject) => {
    function unknown(error) {
      if (!state.failed) {
        state.firstError = error
        state.failed = true
        state.unknown = Object.freeze({ status: 'TRANSPORT_UNKNOWN', directory: state.directory, cause: error })
      }
      reject(state.unknown)
    }
    const onError = error => {
      try {
        unknown(error)
      } catch {}
    }
    const onExit = (code, signal) => {
      try {
        assert(!state.exited, 'One actual original transport exit')
        state.exited = true
        if (state.failed) return
        assert.equal(code, 0, 'Transport requires original controller exit0')
        assert.equal(signal, null)
        const filename = path.join(state.directory, 'result.json')
        const initial = readReleaseEvidenceFile(filename, limit)
        assert(initial, 'Transport result lost; inner outcome UNKNOWN')
        const result = validateSourceTransportResult(JSON.parse(initial.bytes), state.request, state.pid)
        publishFixtureAuditRecord(state.directory, 'controller-exit.json', { pid: state.pid, code, signal })
        const final = readReleaseEvidenceFile(filename, limit)
        assert(final, 'Transport result disappeared')
        assert.deepEqual(final.bytes, initial.bytes)
        for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'])
          assert.equal(final.after[key], initial.after[key])
        if (state.failed) return
        clearInterval(state.interval)
        if (state.failed) return
        resolve(result)
      } catch (error) {
        unknown(error)
      }
    }
    transports.set(state, state)
    try {
      state.interval = setInterval(() => void state.child, 60_000)
      const script = controllerScript
      assert(path.isAbsolute(script), 'Fixed absolute local controller identity required')
      assert.equal(path.basename(script), 'source-custody-controller.mjs')
      const root = path.resolve(path.dirname(script), '../../../..')
      const parent = path.join(root, '.appraisejs/source-custody-transports')
      const nonce = randomUUID()
      mkdirSync(parent, { recursive: true })
      state.directory = mkdtempSync(path.join(parent, 'request-'))
      state.request = Object.freeze({ version: 1, nonce, selected, script, execPath: originalProcess.execPath })
      publishFixtureAuditRecord(state.directory, 'request.json', state.request)
      state.child = fork(script, ['--case', selected, state.directory, nonce], {
        execPath: originalProcess.execPath,
        execArgv: [],
        cwd: root,
        env: { PATH: path.dirname(originalProcess.execPath) + ':/usr/bin:/bin' },
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      })
      state.child.on('error', onError)
      if (state.failed) return
      state.child.once('exit', onExit)
      if (state.failed) return
      state.pid = state.child.pid
      assert(Number.isSafeInteger(state.pid) && state.pid > 0)
      if (state.failed) return
      publishFixtureAuditRecord(state.directory, 'controller-created.json', {
        pid: state.pid,
        nonce,
        selected,
        script,
        execPath: originalProcess.execPath,
      })
      if (state.failed) return
    } catch (error) {
      unknown(error)
    }
  })
}
