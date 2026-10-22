// Source fixture launch custody only. Import allocates no timer, child or registry entry.
import assert from 'node:assert/strict'
import { publishFixtureAuditRecord } from '../fixture-audit-records.mjs'
import { sourceLaunchEffects } from './source-custody-launch-effects.mjs'
const { fork, spawn, openSync, closeSync, setInterval, clearInterval } = sourceLaunchEffects

const roles = Object.freeze(['setup', 'owner', 'inspector', 'supervisor'])
const registry = new Map()
const cell = () => Object.seal({ filled: false, error: undefined })
function slot() {
  return Object.seal({
    status: 'UNUSED',
    specification: undefined,
    operation: undefined,
    stdoutFD: undefined,
    stderrFD: undefined,
    stdoutClose: 'NOT_OPENED',
    stderrClose: 'NOT_OPENED',
    child: undefined,
    launched: false,
    onError: undefined,
  })
}
function diagnostic(target, error) {
  if (target.filled) return
  target.error = error
  target.filled = true
}
export function createSourceLaunchCustody(identity) {
  const custody = {
    identity: Object.freeze({ ...identity }),
    slots: Object.freeze({ setup: slot(), owner: slot(), inspector: slot(), supervisor: slot() }),
    failed: false,
    firstError: undefined,
    firstRole: undefined,
    firstStage: undefined,
    currentRole: undefined,
    interval: undefined,
    intervalState: 'NOT_CREATED',
    completed: false,
    failurePublicationAttempted: false,
    diagnostics: Object.freeze({
      stdoutClose: cell(),
      stderrClose: cell(),
      failureFile: cell(),
      failureReporter: cell(),
    }),
  }
  for (const name of ['identity', 'slots', 'diagnostics']) Object.defineProperty(custody, name, { writable: false })
  Object.defineProperty(custody, 'complete', {
    value: records => complete(custody, records),
    writable: false,
    configurable: false,
  })
  for (const role of roles) {
    custody.slots[role].onError = error => {
      try {
        failSourceLaunch(custody, role, 'child-error', error)
        publishSourceLaunchFailure(custody, custody.identity.directory)
      } catch {}
    }
  }
  Object.seal(custody)
  registry.set(custody, custody)
  custody.interval = setInterval(() => void custody.slots, 60_000)
  custody.intervalState = 'REFERENCED'
  return custody
}
export function assertSourceLaunchActive(custody) {
  assert.equal(registry.get(custody), custody, 'Exact registered source launch context required')
  if (custody.failed) throw custody.firstError
  assert(!custody.completed, 'Source launch context already completed')
}
export function failSourceLaunch(custody, role, stage, error) {
  if (registry.get(custody) !== custody) return
  if (custody.failed) {
    if (stage === 'failure-reporter') diagnostic(custody.diagnostics.failureReporter, error)
    return
  }
  if (!custody.failed) {
    custody.firstError = error
    custody.firstRole = role
    custody.firstStage = stage
    custody.failed = true
  }
}
function closeParent(custody, role, stream) {
  const current = custody.slots[role],
    descriptor = stream + 'FD',
    close = stream + 'Close'
  if (current[close] !== 'OPEN') return
  current[close] = 'ATTEMPTED'
  try {
    closeSync(current[descriptor])
    current[close] = 'CLOSED'
  } catch (error) {
    failSourceLaunch(custody, role, stream + '-close', error)
    current[close] = 'UNKNOWN_AFTER_CLOSE_THROW'
    diagnostic(custody.diagnostics[close], error)
  }
}
function releaseEmptyFailure(custody) {
  if (custody.intervalState !== 'REFERENCED') return
  for (const role of roles) {
    const current = custody.slots[role]
    if (current.child !== undefined) return
    if (![current.stdoutClose, current.stderrClose].every(status => ['NOT_OPENED', 'CLOSED'].includes(status))) return
  }
  custody.intervalState = 'CLEAR_ATTEMPTED'
  try {
    clearInterval(custody.interval)
    custody.intervalState = 'EMPTY_FAILURE_RELEASED'
  } catch (error) {
    custody.intervalState = 'UNKNOWN_AFTER_CLEAR_THROW'
    diagnostic(custody.diagnostics.failureReporter, error)
  }
}
export function launchSourceChild(custody, role, specification) {
  assertSourceLaunchActive(custody)
  assert(roles.includes(role), 'Fixed source launch role required')
  const current = custody.slots[role]
  try {
    assert.equal(current.status, 'UNUSED', 'One launch per source role')
    current.status = 'RESERVED'
    current.specification = specification
    custody.currentRole = role
    current.operation = 'SPECIFICATION'
    assert(['fork-logged', 'spawn-logged', 'spawn-ignored'].includes(specification.kind))
    assert.equal(specification.detached, true)
    if (specification.kind !== 'spawn-ignored') {
      current.operation = 'stdout-open'
      current.stdoutFD = openSync(specification.stdoutPath, 'wx')
      current.stdoutClose = 'OPEN'
      current.operation = 'stderr-open'
      current.stderrFD = openSync(specification.stderrPath, 'wx')
      current.stderrClose = 'OPEN'
    }
    if (specification.kind === 'fork-logged') {
      assert.deepEqual(specification.execArgv, [])
      current.operation = 'fork'
      current.child = fork(specification.script, specification.args, {
        execPath: specification.execPath,
        execArgv: specification.execArgv,
        cwd: specification.cwd,
        env: specification.env,
        detached: true,
        stdio: ['ignore', current.stdoutFD, current.stderrFD, 'ipc'],
      })
    } else if (specification.kind === 'spawn-logged') {
      current.operation = 'spawn'
      current.child = spawn(specification.execPath, [specification.script, ...specification.args], {
        cwd: specification.cwd,
        env: specification.env,
        detached: true,
        stdio: ['ignore', current.stdoutFD, current.stderrFD],
      })
    } else {
      assert.equal(specification.stdio, 'ignore')
      current.operation = 'spawn'
      current.child = spawn(specification.execPath, specification.argv, {
        cwd: specification.cwd,
        env: specification.env,
        detached: true,
        stdio: 'ignore',
      })
    }
    current.operation = 'error-listener'
    current.child.on('error', current.onError)
    current.launched = true
  } catch (error) {
    failSourceLaunch(custody, role, current.status === 'LAUNCHED' ? 'SPECIFICATION' : current.operation, error)
  }
  closeParent(custody, role, 'stdout')
  closeParent(custody, role, 'stderr')
  if (custody.failed) {
    releaseEmptyFailure(custody)
    publishSourceLaunchFailure(custody, custody.identity.directory)
    throw custody.firstError
  }
  current.status = 'LAUNCHED'
  return current.child
}
export function publishSourceLaunchFailure(custody, directory) {
  if (registry.get(custody) !== custody || !custody.failed || custody.failurePublicationAttempted) return
  // A synchronous child/process callback can run during listener registration or a close.
  // The launch stack owns both finite close attempts before any formatting/publication.
  for (const role of roles) {
    const current = custody.slots[role]
    if ([current.stdoutClose, current.stderrClose].some(state => state === 'OPEN' || state === 'ATTEMPTED')) return
  }
  custody.failurePublicationAttempted = true
  releaseEmptyFailure(custody)
  let errorText = 'UNREPORTABLE_ERROR'
  try {
    errorText = String(custody.firstError?.message ?? custody.firstError).slice(0, 2000)
  } catch (error) {
    diagnostic(custody.diagnostics.failureReporter, error)
  }
  try {
    const failedSlot = custody.slots[custody.firstRole]
    publishFixtureAuditRecord(directory, 'launch-failure.json', {
      nonce: custody.identity.nonce,
      selected: custody.identity.selected,
      role: custody.firstRole,
      stage: custody.firstStage,
      actualChildCaptured: failedSlot?.child !== undefined,
      parentFDs: Object.fromEntries(
        roles.map(role => [
          role,
          {
            stdout: custody.slots[role].stdoutClose,
            stderr: custody.slots[role].stderrClose,
          },
        ]),
      ),
      error: errorText,
    })
  } catch (error) {
    diagnostic(custody.diagnostics.failureFile, error)
  }
}
function exactKeys(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort())
}
function validateLifecycle(custody, role, record) {
  const current = custody.slots[role]
  if (current.status === 'UNUSED') {
    assert.equal(record, undefined, 'Unused source role cannot have a lifecycle record')
    return
  }
  assert.equal(current.status, 'LAUNCHED')
  assert.equal(current.launched, true)
  assert.notEqual(current.child, undefined)
  const expectedClose = current.specification.kind === 'spawn-ignored' ? 'NOT_OPENED' : 'CLOSED'
  assert.equal(current.stdoutClose, expectedClose)
  assert.equal(current.stderrClose, expectedClose)
  assert.equal(record?.role, role)
  assert.equal(record.child, current.child, 'Lifecycle must reference exact original child')
  if (record.kind === 'KNOWN_EXIT0') {
    exactKeys(record, ['kind', 'role', 'child', 'code', 'signal'])
    assert.equal(record.code, 0)
    assert.equal(record.signal, null)
    return
  }
  exactKeys(record, ['kind', 'role', 'child', 'terminal', 'finalReconciled'])
  assert.equal(role, 'owner')
  assert.equal(record.kind, 'VALIDATED_RETAINED_TERMINAL')
  assert(['SOURCE_RETENTION_CALLBACK_COMMITTED', 'SOURCE_IPC_FAULT_OBSERVATION_VALIDATED'].includes(record.terminal))
  assert.equal(record.finalReconciled, true)
}
function complete(custody, records) {
  assertSourceLaunchActive(custody)
  try {
    exactKeys(records, roles)
    for (const role of roles) validateLifecycle(custody, role, records[role])
    assert.equal(custody.intervalState, 'REFERENCED')
    custody.intervalState = 'CLEAR_ATTEMPTED'
    clearInterval(custody.interval)
    custody.intervalState = 'SUCCESS_RELEASED'
    custody.completed = true
  } catch (error) {
    failSourceLaunch(custody, custody.currentRole ?? 'supervisor', 'complete', error)
    if (custody.intervalState === 'CLEAR_ATTEMPTED') custody.intervalState = 'UNKNOWN_AFTER_CLEAR_THROW'
    publishSourceLaunchFailure(custody, custody.identity.directory)
    throw custody.firstError
  }
}
