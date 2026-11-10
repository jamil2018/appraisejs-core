import { readFixtureAuditRecord as read, publishFixtureAuditRecord as write } from '../fixture-audit-records.mjs'
// Authoring only: actual execution requires an independent exact packet/invocation review.
// No product/client imports. The owner hook and combined packet are separately reviewed.
import assert from 'node:assert/strict'
import { fork, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  readSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const self = fileURLToPath(import.meta.url)
const selected = 'ipc-loss-before-postcallback-sql'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export function validateWindow(value, identity) {
  assert.equal(value.type, 'ipc-fault-window')
  for (const key of ['pid', 'nonce', 'case']) assert.equal(value[key], identity[key])
  assert.equal(value.version, 1)
  assert.equal(value.phase, 'IPC_FAULT_GATE_PENDING')
  assert.equal(value.nextFixtureOperation, 'POST_CALLBACK_SOURCE_STATE_READ')
  assert.match(value.windowId, /^[a-f0-9]{64}$/)
  assert.ok(Number.isSafeInteger(value.admissionCount) && value.admissionCount > 0)
  const references = value.referenceIds
  assert.deepEqual(Object.keys(references).sort(), ['callback', 'client', 'gate', 'outer', 'restore', 'source'])
  for (const id of Object.values(references)) assert.ok(Number.isSafeInteger(id) && id > 0)
  assert.equal(new Set(Object.values(references)).size, 6)
  return value
}

export function validateLatch(receipt, window) {
  assert.equal(receipt.version, 1)
  assert.equal(receipt.type, 'failure-retained')
  assert.equal(receipt.classification, 'UNEXPECTED_FIXTURE_FAILURE')
  for (const key of ['pid', 'nonce', 'case']) assert.equal(receipt[key], window[key])
  assert.equal(receipt.phase, 'supervisor-disconnect')
  assert.equal(receipt.operationPhase, window.phase)
  const summary = receipt.referenceSummary
  assert.ok(Number.isSafeInteger(summary.operations) && summary.operations === window.admissionCount)
  assert.ok(Number.isSafeInteger(summary.referenceCount))
  assert.ok(summary.referenceCount >= Math.max(...Object.values(window.referenceIds)))
  return receipt
}

export function validateFence(value, window, receipt) {
  for (const key of ['pid', 'nonce', 'case', 'windowId']) assert.equal(value[key], window[key])
  assert.equal(value.type, 'ipc-fault-fenced')
  assert.equal(value.version, 1)
  assert.equal(value.site, 'POST_CALLBACK_SOURCE_STATE_READ')
  assert.equal(value.firstCauseIdentityPreserved, true)
  assert.equal(value.admissionCount, window.admissionCount)
  assert.equal(value.failurePhase, receipt.phase)
  assert.deepEqual(value.referenceIds, window.referenceIds)
  return value
}

export function validateInvocation(actual, role, review) {
  assert.ok(['--run', '--supervisor'].includes(role))
  const expected = role === '--run' ? review.invocation : review.supervisorInvocation
  assert.equal(expected[2], role)
  assert.deepEqual(actual, expected, 'Actual role/argv differs from the exact reviewed invocation')
}

export function validateLiveness(output, created) {
  assert.ok(Number.isSafeInteger(created.pid) && created.pid > 0)
  assert.ok(Array.isArray(created.spawnargs) && created.spawnargs.length === 6)
  assert.equal(created.spawnargs[1], created.script)
  assert.equal(created.spawnargs.at(-1), created.nonce)
  assert.match(created.nonce, /^[a-f0-9-]{36}$/)
  const match = /^\s*(\d+) ([^\r\n]+)\n?$/.exec(output)
  assert.ok(match, 'Expected one untruncated single-PID command display')
  assert.equal(Number(match[1]), created.pid)
  assert.equal(match[2].trimStart(), created.spawnargs.join(' '))
  // ps flattens argv. Exact display equality is point-in-time identity, not raw argv attestation.
}

export function readBoundedArtifact(filename, maximum = 16384) {
  const descriptor = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = fstatSync(descriptor)
    assert.ok(before.isFile() && before.size <= maximum)
    const bytes = Buffer.alloc(maximum + 1)
    const length = readSync(descriptor, bytes, 0, maximum + 1, 0)
    const after = fstatSync(descriptor)
    const actual = lstatSync(filename)
    assert.ok(!actual.isSymbolicLink())
    for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
      assert.equal(before[field], after[field], 'Artifact changed during bounded read')
      assert.equal(after[field], actual[field], 'Artifact path changed during bounded read')
    }
    assert.ok(length <= maximum && length === before.size, 'Partial or oversized artifact')
    return JSON.parse(bytes.subarray(0, length))
  } finally {
    closeSync(descriptor)
  }
}

export function verify(packet, attempt, reviewPath, role) {
  for (const value of [packet, attempt, reviewPath]) assert.ok(path.isAbsolute(value))
  assert.deepEqual(process.execArgv, [])
  const bytes = readFileSync(path.join(packet, 'manifest.json'))
  const manifest = JSON.parse(bytes)
  const review = read(reviewPath)
  assert.equal(review.judgment, 'ACCEPT')
  assert.equal(review.scope, 'EXACT_SERVICE_IPC_FAULT16K_CONTROLLER_AND_INPUTS')
  assert.equal(review.controllerExecutionAuthorized, true)
  assert.equal(review.manifestSha256, hash(bytes))
  assert.deepEqual(review.allowedCases, [selected])
  assert.equal(review.attemptDirectory, attempt)
  assert.deepEqual(review.invocation, [realpathSync(process.execPath), self, '--run', packet, attempt, reviewPath])
  assert.deepEqual(review.supervisorInvocation, [
    realpathSync(process.execPath),
    self,
    '--supervisor',
    packet,
    attempt,
    reviewPath,
  ])
  validateInvocation(process.argv, role, review)
  assert.equal(manifest.controller.filename, realpathSync(self))
  assert.equal(manifest.executable.filename, realpathSync(process.execPath))
  assert.equal(manifest.nodeVersion, process.version)
  assert.equal(manifest.psExecutable.filename, '/bin/ps')
  assert.equal(manifest.case, selected)
  assert.equal(manifest.migrations, 93)
  const rows = [
    manifest.controller,
    manifest.executable,
    manifest.psExecutable,
    manifest.ownerBundle,
    manifest.nativeScript,
    ...manifest.inputs,
  ]
  for (const row of rows) {
    assert.ok(path.isAbsolute(row.filename))
    const contents = readFileSync(row.filename)
    assert.equal(contents.length, row.bytes)
    assert.equal(hash(contents), row.sha256, 'Bound input changed: ' + row.filename)
  }
  if (role === '--supervisor') {
    assert.ok(process.connected && typeof process.send === 'function', 'Original outer IPC is required')
    const allocation = readBoundedArtifact(path.join(attempt, 'allocation.json'))
    assert.equal(allocation.outerPid, process.ppid)
    assert.equal(allocation.attemptDirectory, attempt)
    assert.equal(allocation.manifestSha256, hash(bytes))
    assert.equal(allocation.case, selected)
    assert.equal(allocation.status, 'CONSUMED_NO_RETRY')
  }
  return manifest
}

function environment(directory) {
  return {
    PATH: path.dirname(process.execPath) + ':/usr/bin:/bin',
    HOME: path.join(directory, 'home'),
    TMPDIR: path.join(directory, 'tmp'),
    NODE_ENV: 'test',
    NO_COLOR: '1',
    DATABASE_URL: `file:${path.join(directory, 'canonical.db')}`,
  }
}

function launch(script, args, cwd, env, directory, label) {
  const logs = ['stdout', 'stderr'].map(name => openSync(path.join(directory, label + '.' + name), 'wx'))
  try {
    return fork(script, args, {
      execPath: process.execPath,
      execArgv: [],
      cwd,
      env,
      detached: true,
      stdio: ['ignore', ...logs, 'ipc'],
    })
  } finally {
    for (const fd of logs) closeSync(fd)
  }
}

function leaveOwnedChild(child) {
  // No explicit disconnect, signal, cleanup or recovery on an unproved window.
  try {
    child.channel?.unref()
  } catch {}
  try {
    child.unref()
  } catch {}
}

export function inspectServiceFaultArtifacts(state, identity, directory, child, complete) {
  if (!state.window || state.done) return
  if (!state.receipt) {
    const filename = path.join(directory, 'owner-failure-latch.json')
    try {
      lstatSync(filename)
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    state.receipt = validateLatch(readBoundedArtifact(filename), state.window)
    write(directory, 'ipc-fault-release.json', { version: 1, ...identity, windowId: state.window.windowId })
    state.released = true
  }
  const filename = path.join(directory, 'ipc-fault-fence.json')
  try {
    lstatSync(filename)
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  const fence = validateFence(readBoundedArtifact(filename), state.window, state.receipt)
  write(directory, 'fault-observation.json', {
    window: state.window,
    receipt: state.receipt,
    fence,
    classification: 'FIXTURE_CONTINUATION_FENCED_EXTERNAL_LIVENESS_UNVERIFIED',
    engineQuiescence: 'UNPROVEN',
    canonicalOutcome: 'UNDETERMINED',
  })
  state.done = true
  complete({ ...identity, script: child.spawnargs[1], windowId: state.window.windowId })
}

export function receiveServiceFaultWindow(message, state, identity, directory, child) {
  if (state.done) return
  assert.ok(++state.messages <= 128)
  assert.ok(Buffer.byteLength(JSON.stringify(message)) <= 16384)
  for (const key of ['pid', 'nonce', 'case']) assert.equal(message[key], identity[key])
  if (message.type === 'failure-retained') throw new Error('Owner failed before controlled IPC window')
  assert.ok(
    !['case-retained', 'case-known-closed', 'terminal-handoff'].includes(message.type),
    'Unexpected normal terminal',
  )
  if (message.type !== 'ipc-fault-window') return
  assert.equal(state.window, undefined)
  assert.equal(state.disconnected, false)
  state.window = validateWindow(message, identity)
  assert.deepEqual(readBoundedArtifact(path.join(directory, 'ipc-fault-window.json')), state.window)
  write(directory, 'supervisor-window.json', state.window)
  assert.ok(child.connected && child.pid === identity.pid)
  state.disconnected = true
  child.disconnect() // One actual disconnect of the original ChildProcess, only at authenticated window.
}

function observeFault(child, directory, nonce) {
  return new Promise((resolve, reject) => {
    const identity = { pid: child.pid, nonce, case: selected }
    const state = {
      window: undefined,
      receipt: undefined,
      done: false,
      disconnected: false,
      released: false,
      messages: 0,
    }
    const deadline = Date.now() + 60000
    function fail(error) {
      if (state.done) return
      state.done = true
      clearInterval(poll)
      try {
        write(directory, 'supervisor-failure.json', { ...identity, message: String(error), released: state.released })
      } catch {}
      leaveOwnedChild(child)
      reject(error)
    }
    function inspectArtifacts() {
      inspectServiceFaultArtifacts(state, identity, directory, child, result => {
        clearInterval(poll)
        leaveOwnedChild(child)
        resolve(result)
      })
    }
    const poll = setInterval(() => {
      try {
        assert.ok(Date.now() < deadline, 'Fault deadline; retain owner, no release fallback or retry')
        inspectArtifacts()
      } catch (error) {
        fail(error)
      }
    }, 10)
    child.once('error', fail)
    child.once('exit', () => fail(new Error('Actual owner exited; retention not established')))
    child.on('message', message => {
      if (state.done) return
      try {
        receiveServiceFaultWindow(message, state, identity, directory, child)
      } catch (error) {
        fail(error)
      }
    })
  })
}

async function supervise(packet, attempt, reviewPath) {
  const manifest = verify(packet, attempt, reviewPath, '--supervisor')
  // Outer creates only supervisor evidence. This workspace is the single consumed owner attempt.
  const directory = path.join(attempt, 'owner')
  mkdirSync(directory)
  for (const name of ['home', 'tmp']) mkdirSync(path.join(directory, name))
  const nonce = randomUUID()
  write(directory, 'attempt.json', { nonce, case: selected, supervisorPid: process.pid, status: 'CONSUMED_NO_RETRY' })
  const args = [selected, directory, manifest.nativeScript.filename, nonce]
  const child = launch(
    manifest.ownerBundle.filename,
    args,
    manifest.worktree,
    environment(directory),
    directory,
    'owner',
  )
  try {
    write(directory, 'owner-created.json', {
      pid: child.pid,
      script: manifest.ownerBundle.filename,
      args,
      nonce,
      spawnargs: child.spawnargs,
    })
    const result = await observeFault(child, directory, nonce)
    write(attempt, 'supervisor-result.json', result)
  } finally {
    leaveOwnedChild(child)
  }
}

async function outer(packet, attempt, reviewPath) {
  const manifest = verify(packet, attempt, reviewPath, '--run')
  mkdirSync(attempt)
  for (const name of ['home', 'tmp']) mkdirSync(path.join(attempt, name))
  write(attempt, 'allocation.json', {
    status: 'CONSUMED_NO_RETRY',
    outerPid: process.pid,
    attemptDirectory: attempt,
    case: selected,
    manifestSha256: hash(readFileSync(path.join(packet, 'manifest.json'))),
  })
  const child = launch(
    self,
    ['--supervisor', packet, attempt, reviewPath],
    attempt,
    environment(attempt),
    attempt,
    'supervisor',
  )
  await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      write(attempt, 'supervisor-exit.json', { pid: child.pid, code, signal })
      if (code === 0 && signal === null) resolve()
      else reject(new Error('Supervisor did not exit0; consumed attempt retained'))
    })
  })
  const result = readBoundedArtifact(path.join(attempt, 'supervisor-result.json'))
  const created = readBoundedArtifact(path.join(attempt, 'owner/owner-created.json'))
  assert.equal(result.pid, created.pid)
  assert.equal(result.nonce, created.nonce)
  assert.equal(result.script, created.script)
  assert.deepEqual(created.spawnargs, [
    manifest.executable.filename,
    manifest.ownerBundle.filename,
    selected,
    path.join(attempt, 'owner'),
    manifest.nativeScript.filename,
    created.nonce,
  ])
  assert.ok(Number.isSafeInteger(result.pid) && result.pid > 0)
  const output = execFileSync(
    manifest.psExecutable.filename,
    ['-ww', '-p', String(result.pid), '-o', 'pid=,command='],
    {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 16384,
    },
  )
  validateLiveness(output, created)
  write(attempt, 'post-supervisor-owner-liveness.json', {
    ...result,
    output,
    status: 'OWNED_OWNER_LIVE_AT_OBSERVATION',
    databaseOutcome: 'UNDETERMINED',
    engineQuiescence: 'UNPROVEN',
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  const [mode, ...args] = process.argv.slice(2)
  try {
    if (mode === '--supervisor') await supervise(...args)
    else {
      assert.equal(mode, '--run')
      await outer(...args)
    }
  } catch (error) {
    process.stderr.write(String(error) + '\n')
    process.exitCode = 1
  }
}
