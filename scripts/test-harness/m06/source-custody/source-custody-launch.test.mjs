// Actual source launch and controller adapters with fixed inert imported effects only.
import assert from 'node:assert/strict'
import { after, mock, test } from 'node:test'
import { EventEmitter } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import * as childProcess from 'node:child_process'
const fixedControllerScript = fileURLToPath(new URL('./source-custody-controller.mjs', import.meta.url))
let active
const fixedEffects = Object.freeze({
  openSync(...args) {
    assert.equal(this, undefined)
    active.trace.push(['open', ...args])
    if (++active.opens === active.failOpen) throw active.openError
    return 40 + active.opens
  },
  closeSync(fd) {
    assert.equal(this, undefined)
    active.trace.push(['close', fd])
    active.onClose?.(fd)
    if (active.closeErrors.has(fd)) throw active.closeErrors.get(fd)
  },
  fork(...args) {
    assert.equal(this, undefined)
    active.trace.push(['fork', ...args])
    if (active.spawnThrows) throw active.spawnError
    return active.makeChild ? active.makeChild(args) : active.child
  },
  spawn(...args) {
    assert.equal(this, undefined)
    active.trace.push(['spawn', ...args])
    if (active.spawnThrows) throw active.spawnError
    return active.makeChild ? active.makeChild(args) : active.child
  },
  setInterval(callback, delay) {
    assert.equal(this, undefined)
    active.interval = { callback, delay }
    active.trace.push(['interval', delay])
    return active.interval
  },
  clearInterval(interval) {
    assert.equal(this, undefined)
    active.trace.push(['clear', interval])
    active.onClear?.(interval)
    if (active.clearThrows) throw active.clearError
  },
})
mock.module(new URL('./source-custody-launch-effects.mjs', import.meta.url).href, {
  exports: { sourceLaunchEffects: fixedEffects },
})
mock.module(new URL('../fixture-audit-records.mjs', import.meta.url).href, {
  exports: {
    readFixtureAuditRecord(filename) {
      return JSON.parse(readFileSync(filename))
    },
    publishFixtureAuditRecord(directory, name, value) {
      active.trace.push(['audit', directory, name, value])
      active.onAudit?.(directory, name, value)
      if (active.auditThrows) throw active.auditError
    },
  },
})
let direct
const directEffects = Object.freeze({
  process: {
    pid: 901,
    execPath: process.execPath,
    version: process.version,
    execArgv: [],
    argv: [],
    set exitCode(value) {
      direct.exitCode = value
    },
    on(name, callback) {
      direct.trace.push(['process-listener', name])
      if (name === direct.registrationFailure) throw direct.registrationError
      direct.process.on(name, callback)
      return this
    },
  },
  setInterval(callback, delay) {
    direct.trace.push(['anchor', delay])
    return { callback }
  },
  clearInterval(interval) {
    direct.trace.push(['clear-anchor'])
    direct.onClear?.()
    return interval
  },
  randomUUID() {
    return 'request-nonce'
  },
  mkdirSync(...args) {
    direct.trace.push(['mkdir', ...args])
  },
  mkdtempSync(...args) {
    direct.trace.push(['mkdtemp', ...args])
    return direct.directory
  },
  fork(...args) {
    direct.trace.push(['transport-fork', ...args])
    direct.onFork?.()
    return direct.child
  },
})
mock.module(new URL('./source-custody-controller-effects.mjs', import.meta.url).href, {
  exports: { sourceControllerEffects: directEffects },
})
mock.module(new URL('./source-custody-client-binding.mjs', import.meta.url).href, {
  exports: {
    withVerifiedPacketClient(manifest, packet, callback) {
      active.trace.push(['verify-stage', manifest, packet])
      return callback()
    },
    verifyPacketClient(manifest, packet) {
      active.trace.push(['verify-client', manifest, packet])
      active.onVerify?.()
    },
  },
})
// The existing direct canonical algorithm is exercised with fixed inert module effects only.
const inertCanonicalRoot = mkdtempSync(path.join(tmpdir(), 'source-inert-canonical-'))
after(() => rmSync(inertCanonicalRoot, { recursive: true }))
mock.module(new URL('./source-custody-client.mjs', import.meta.url).href, { exports: { root: inertCanonicalRoot } })
mock.module(new URL('./build-source-custody.mjs', import.meta.url).href, {
  exports: {
    canonicalInputs() {
      active.trace.push(['canonical-inputs'])
      assert(active.canonical, 'External entry must not select the canonical builder')
      return { digest: active.canonical.digest }
    },
    async buildSourceCustodyPacket(packet) {
      active.trace.push(['canonical-build', packet])
      assert(active.canonical, 'External entry must not generate a client')
      mkdirSync(packet)
    },
  },
})
mock.module('node:child_process', {
  exports: {
    ...childProcess,
    execFileSync(executable, args, options) {
      assert(active.postexit, 'Only an explicitly selected inert postexit observation')
      active.trace.push(['postexit', executable, args, options])
      return active.postexit(executable, args, options)
    },
  },
})
const {
  createSourceLaunchCustody,
  launchSourceChild,
  assertSourceLaunchActive,
  failSourceLaunch,
  publishSourceLaunchFailure,
} = await import('./source-custody-launch.mjs')
const { launch, knownExit, launchSourceOwner, supervisor, runSourceCustodyCase } =
  await import('./source-custody-controller.mjs')
const { createSourceCaseRuntime, createSourceRetainedOwner, createSourceRetainedSupervisor } =
  await import('./source-custody-guard.mjs')
const { observeSourceIpcFaultOwner } = await import('./source-custody-fault-controller.mjs')
function harness() {
  const child = new EventEmitter()
  child.pid = 77
  child.unref = child.disconnect = () => {
    throw new Error('FORBIDDEN_CHILD_EFFECT')
  }
  child.channel = {
    unref() {
      throw new Error('FORBIDDEN_CHANNEL_EFFECT')
    },
  }
  active = {
    child,
    trace: [],
    opens: 0,
    closeErrors: new Map(),
    spawnThrows: false,
    clearThrows: false,
    auditThrows: false,
  }
  active.custody = createSourceLaunchCustody({ directory: '/owned/launch', selected: 'unit', nonce: 'nonce' })
  return active
}
function specification(kind = 'fork-logged') {
  const env = { EXACT: 'preserved' }
  if (kind === 'spawn-ignored')
    return {
      kind,
      execPath: '/original/node',
      argv: ['/original/script', 'a'],
      cwd: '/owned/launch',
      env,
      detached: true,
      stdio: 'ignore',
    }
  return {
    kind,
    script: '/original/script',
    args: ['a'],
    cwd: '/owned/launch',
    env,
    execPath: '/original/node',
    execArgv: [],
    detached: true,
    stdoutPath: '/owned/launch/owner.stdout',
    stderrPath: '/owned/launch/owner.stderr',
  }
}
const records = () => Object.seal({ setup: undefined, owner: undefined, inspector: undefined, supervisor: undefined })
function exitRecord(role, child) {
  return Object.freeze({ kind: 'KNOWN_EXIT0', role, child, code: 0, signal: null })
}
function caught(action) {
  let threw = false,
    error
  try {
    action()
  } catch (actual) {
    threw = true
    error = actual
  }
  assert.equal(threw, true)
  return error
}
function count(h, kind) {
  return h.trace.filter(row => row[0] === kind).length
}
function failedPinned(h, first, role = 'owner') {
  assert.equal(h.custody.failed, true)
  assert.equal(h.custody.firstError, first)
  assert.equal(h.custody.firstRole, role)
  assert.equal(
    caught(() => assertSourceLaunchActive(h.custody)),
    first,
  )
  const before = h.trace.length
  assert.equal(
    caught(() => launchSourceChild(h.custody, 'inspector', specification())),
    first,
  )
  assert.equal(
    caught(() => h.custody.complete(records())),
    first,
  )
  assert.equal(h.trace.length, before)
}
for (const kind of ['fork-logged', 'spawn-logged', 'spawn-ignored']) {
  test(kind + ' returns the exact actual object with original receiver/options and ordered parent closes', () => {
    const h = harness(),
      spec = specification(kind)
    h.onClose = () => assert.equal(h.custody.slots.owner.child, h.child)
    assert.equal(launchSourceChild(h.custody, 'owner', spec), h.child)
    assert.equal(h.custody.slots.owner.specification, spec)
    assert.equal(h.custody.intervalState, 'REFERENCED')
    const invocation = h.trace.find(row => row[0] === (kind === 'fork-logged' ? 'fork' : 'spawn'))
    if (kind === 'fork-logged')
      assert.deepEqual(invocation, [
        'fork',
        spec.script,
        spec.args,
        {
          execPath: spec.execPath,
          execArgv: spec.execArgv,
          cwd: spec.cwd,
          env: spec.env,
          detached: true,
          stdio: ['ignore', 41, 42, 'ipc'],
        },
      ])
    else
      assert.deepEqual(invocation, [
        'spawn',
        spec.execPath,
        kind === 'spawn-ignored' ? spec.argv : [spec.script, ...spec.args],
        {
          cwd: spec.cwd,
          env: spec.env,
          detached: true,
          stdio: kind === 'spawn-ignored' ? 'ignore' : ['ignore', 41, 42],
        },
      ])
    assert.equal(invocation.at(-1).env, spec.env)
    assert.deepEqual(
      h.trace.filter(row => row[0] === 'close'),
      kind === 'spawn-ignored'
        ? []
        : [
            ['close', 41],
            ['close', 42],
          ],
    )
    const actual = records()
    actual.owner = exitRecord('owner', h.child)
    h.custody.complete(actual)
    assert.equal(count(h, 'clear'), 1)
    assert.equal(h.custody.intervalState, 'SUCCESS_RELEASED')
    assert.equal(h.custody.slots.owner.child, h.child)
    assert.throws(() => h.custody.complete(actual))
    assert.throws(() => launchSourceChild(h.custody, 'setup', specification()))
    assert.equal(count(h, 'clear'), 1)
  })
}
for (const descriptors of [[41], [42], [41, 42]]) {
  test('close failures ' + descriptors + ' pin the same original child before either throwing close/report', () => {
    const h = harness(),
      first = new Error('first-close'),
      later = new Error('later-close')
    for (const fd of descriptors) h.closeErrors.set(fd, fd === descriptors[0] ? first : later)
    h.onClose = () => assert.equal(h.custody.slots.owner.child, h.child)
    h.auditThrows = true
    h.auditError = new Error('report')
    h.onAudit = () => {
      assert.equal(h.custody.slots.owner.child, h.child)
      assert.equal(h.custody.firstError, first)
      assert.deepEqual(
        h.trace.filter(row => row[0] === 'close'),
        [
          ['close', 41],
          ['close', 42],
        ],
      )
    }
    assert.equal(
      caught(() => launchSourceChild(h.custody, 'owner', specification())),
      first,
    )
    failedPinned(h, first)
    assert.equal(h.custody.intervalState, 'REFERENCED')
    assert.equal(h.custody.diagnostics.failureFile.error, h.auditError)
    for (const fd of [41, 42])
      assert.equal(
        h.custody.slots.owner[fd === 41 ? 'stdoutClose' : 'stderrClose'],
        descriptors.includes(fd) ? 'UNKNOWN_AFTER_CLOSE_THROW' : 'CLOSED',
      )
    publishSourceLaunchFailure(h.custody, '/owned/launch')
    assert.equal(count(h, 'audit'), 1)
    assert.equal(count(h, 'clear'), 0)
  })
}
test('actually thrown undefined is the immutable first cause before later closes and reports', () => {
  const h = harness()
  h.closeErrors.set(41, undefined)
  h.closeErrors.set(42, new Error('second'))
  h.auditThrows = true
  h.auditError = new Error('report')
  assert.equal(
    caught(() => launchSourceChild(h.custody, 'owner', specification())),
    undefined,
  )
  failedPinned(h, undefined)
  assert.equal(h.custody.firstStage, 'stdout-close')
  assert.equal(h.custody.diagnostics.stdoutClose.filled, true)
  assert.equal(h.custody.diagnostics.stdoutClose.error, undefined)
  assert.equal(h.custody.diagnostics.stderrClose.error.message, 'second')
})
for (const failOpen of [1, 2]) {
  test('open failure ' + failOpen + ' is latched before finite parent closure and never creates a child', () => {
    const h = harness()
    h.failOpen = failOpen
    h.openError = new Error('open')
    h.onClose = () => {
      assert.equal(h.custody.firstError, h.openError)
      assert.equal(h.custody.slots.owner.child, undefined)
    }
    assert.equal(
      caught(() => launchSourceChild(h.custody, 'owner', specification())),
      h.openError,
    )
    failedPinned(h, h.openError)
    assert.equal(count(h, 'fork'), 0)
    assert.deepEqual(
      h.trace.filter(row => row[0] === 'close'),
      failOpen === 1 ? [] : [['close', 41]],
    )
    assert.equal(h.custody.intervalState, 'EMPTY_FAILURE_RELEASED')
    assert.equal(count(h, 'clear'), 1)
  })
}
test('second open plus ambiguous first FD close retains that descriptor and original open error without retry', () => {
  const h = harness()
  h.failOpen = 2
  h.openError = new Error('open')
  h.closeErrors.set(41, new Error('close'))
  assert.equal(
    caught(() => launchSourceChild(h.custody, 'owner', specification())),
    h.openError,
  )
  assert.equal(h.custody.slots.owner.stdoutFD, 41)
  assert.equal(h.custody.slots.owner.stdoutClose, 'UNKNOWN_AFTER_CLOSE_THROW')
  assert.equal(count(h, 'clear'), 0)
  assert.equal(count(h, 'close'), 1)
})
test('synchronous original spawn throw precedes both independent close errors and cannot invent a child', () => {
  const h = harness()
  h.spawnThrows = true
  h.spawnError = new Error('spawn')
  h.closeErrors.set(41, new Error('close1'))
  h.closeErrors.set(42, new Error('close2'))
  assert.equal(
    caught(() => launchSourceChild(h.custody, 'owner', specification('spawn-logged'))),
    h.spawnError,
  )
  assert.equal(h.custody.slots.owner.child, undefined)
  failedPinned(h, h.spawnError)
  assert.deepEqual(
    h.trace.filter(row => row[0] === 'close'),
    [
      ['close', 41],
      ['close', 42],
    ],
  )
  assert.equal(count(h, 'clear'), 0)
})
test('error formatting and later reporter errors never replace the pinned cause or child', () => {
  const h = harness(),
    formatting = new Error('format'),
    report = new Error('report')
  const first = {
    get message() {
      assert.equal(h.custody.slots.owner.child, h.child)
      throw formatting
    },
  }
  launchSourceChild(h.custody, 'owner', specification())
  failSourceLaunch(h.custody, 'owner', 'owner-observation', first)
  h.auditThrows = true
  h.auditError = report
  publishSourceLaunchFailure(h.custody, '/owned/launch')
  failSourceLaunch(h.custody, 'owner', 'failure-reporter', new Error('later'))
  assert.equal(h.custody.diagnostics.failureReporter.error, formatting)
  assert.equal(h.custody.diagnostics.failureFile.error, report)
  failedPinned(h, first)
})
test('context method/slots are fixed own descriptors and completion cannot select another receiver', () => {
  const h = harness(),
    descriptor = Object.getOwnPropertyDescriptor(h.custody, 'complete')
  assert.equal(descriptor.writable, false)
  assert.equal(descriptor.configurable, false)
  assert(Object.isSealed(h.custody))
  assert(Object.isFrozen(h.custody.slots))
  for (const value of Object.values(h.custody.slots)) assert(Object.isSealed(value))
  h.custody.complete.call({}, records())
  assert.equal(h.custody.completed, true)
  assert.equal(h.trace.find(row => row[0] === 'clear')[1], h.interval)
})
for (const terminal of ['SOURCE_RETENTION_CALLBACK_COMMITTED', 'SOURCE_IPC_FAULT_OBSERVATION_VALIDATED']) {
  test('all four original roles complete only together with exact owner retained proof ' + terminal, () => {
    const h = harness(),
      actual = records(),
      children = {}
    for (const role of ['setup', 'owner', 'inspector', 'supervisor']) {
      h.child = new EventEmitter()
      children[role] = h.child
      launchSourceChild(h.custody, role, specification(role === 'owner' ? 'fork-logged' : 'spawn-logged'))
      actual[role] = exitRecord(role, h.child)
    }
    actual.owner = Object.freeze({
      kind: 'VALIDATED_RETAINED_TERMINAL',
      role: 'owner',
      child: children.owner,
      terminal,
      finalReconciled: true,
    })
    assert.equal(count(h, 'clear'), 0)
    h.custody.complete(actual)
    assert.equal(count(h, 'clear'), 1)
    for (const role of Object.keys(children)) assert.equal(h.custody.slots[role].child, children[role])
  })
}
const invalidRecords = [
  [
    'missing',
    actual => {
      actual.owner = undefined
    },
  ],
  [
    'foreign child',
    actual => {
      actual.owner = { ...actual.owner, child: {} }
    },
  ],
  [
    'wrong role',
    actual => {
      actual.owner = { ...actual.owner, role: 'setup' }
    },
  ],
  [
    'extra field',
    actual => {
      actual.owner = { ...actual.owner, extra: true }
    },
  ],
  [
    'missing signal',
    actual => {
      const { signal: unused, ...rest } = actual.owner
      assert.equal(unused, null)
      actual.owner = rest
    },
  ],
  [
    'wrong code',
    actual => {
      actual.owner = { ...actual.owner, code: 1 }
    },
  ],
  [
    'wrong signal',
    actual => {
      actual.owner = { ...actual.owner, signal: 'SIGTERM' }
    },
  ],
  [
    'unused role',
    actual => {
      actual.setup = exitRecord('setup', {})
    },
  ],
  [
    'wrong terminal',
    actual => {
      actual.owner = {
        kind: 'VALIDATED_RETAINED_TERMINAL',
        role: 'owner',
        child: actual.owner.child,
        terminal: 'OTHER',
        finalReconciled: true,
      }
    },
  ],
  [
    'missing final reconciliation',
    actual => {
      actual.owner = {
        kind: 'VALIDATED_RETAINED_TERMINAL',
        role: 'owner',
        child: actual.owner.child,
        terminal: 'SOURCE_RETENTION_CALLBACK_COMMITTED',
        finalReconciled: false,
      }
    },
  ],
]
for (const [name, mutate] of invalidRecords) {
  test('completion refuses ' + name + ' without clearing any interval or permitting successor', () => {
    const h = harness(),
      actual = records()
    launchSourceChild(h.custody, 'owner', specification())
    actual.owner = exitRecord('owner', h.child)
    mutate(actual)
    const first = caught(() => h.custody.complete(actual))
    failedPinned(h, first)
    assert.equal(count(h, 'clear'), 0)
    assert.equal(h.custody.slots.owner.child, h.child)
  })
}
test('incomplete role set cannot partially release after an earlier valid role', () => {
  const h = harness(),
    actual = records()
  launchSourceChild(h.custody, 'setup', specification('spawn-logged'))
  actual.setup = exitRecord('setup', h.child)
  h.child = new EventEmitter()
  launchSourceChild(h.custody, 'owner', specification())
  caught(() => h.custody.complete(actual))
  assert.equal(count(h, 'clear'), 0)
})
test('throwing interval clear keeps the first cause and UNKNOWN release without a retry', () => {
  const h = harness(),
    actual = records()
  launchSourceChild(h.custody, 'owner', specification())
  actual.owner = exitRecord('owner', h.child)
  h.clearThrows = true
  h.clearError = new Error('clear')
  assert.equal(
    caught(() => h.custody.complete(actual)),
    h.clearError,
  )
  failedPinned(h, h.clearError)
  assert.equal(h.custody.intervalState, 'UNKNOWN_AFTER_CLEAR_THROW')
  assert.equal(count(h, 'clear'), 1)
})
test('actual controller logged launch adapter reaches the same custody implementation', () => {
  const h = harness(),
    env = { PATH: '/exact' },
    args = ['packet', 'directory', 'case', 'setup']
  assert.equal(launch(h.custody, '/exact/script', args, '/exact/directory', env, 'setup', false), h.child)
  assert.equal(h.custody.slots.setup.child, h.child)
  assert.equal(h.trace.find(row => row[0] === 'spawn')[3].env, env)
  assert.deepEqual(
    h.trace.filter(row => row[0] === 'open').map(row => row[1]),
    ['/exact/directory/setup.stdout', '/exact/directory/setup.stderr'],
  )
})
test('actual knownExit original callback records the same child after audit and resolves original undefined', async () => {
  const h = harness(),
    actual = records()
  launchSourceChild(h.custody, 'setup', specification('spawn-logged'))
  h.onAudit = (directory, name) => {
    if (name === 'setup-exit.json') assert.equal(actual.setup, undefined)
  }
  const pending = knownExit(h.child, '/owned/launch', 'setup', 1000, { custody: h.custody, records: actual })
  h.child.emit('exit', 0, null)
  assert.equal(await pending, undefined)
  assert.equal(actual.setup.child, h.child)
  assert.equal(actual.setup.code, 0)
  assert.equal(actual.setup.signal, null)
  assert(Object.isFrozen(actual.setup))
  h.custody.complete(actual)
})
for (const fault of ['audit', 'record-construction', 'prior-undefined-failure']) {
  test('actual knownExit ' + fault + ' cannot resolve success, record completion or detach child', async () => {
    const h = harness(),
      actual = records()
    launchSourceChild(h.custody, 'setup', specification('spawn-logged'))
    let first = new Error(fault)
    if (fault === 'audit') {
      h.auditThrows = true
      h.auditError = first
    }
    if (fault === 'record-construction') Object.freeze(actual)
    if (fault === 'prior-undefined-failure') {
      first = undefined
      failSourceLaunch(h.custody, 'setup', 'known-exit', first)
    }
    const pending = knownExit(h.child, '/owned/launch', 'setup', 1000, { custody: h.custody, records: actual })
    const rejected = pending.then(
      () => assert.fail('unexpected success'),
      error => error,
    )
    h.child.emit('exit', 0, null)
    const error = await rejected
    if (fault !== 'record-construction') assert.equal(error, first)
    else assert(error instanceof TypeError)
    assert.equal(h.custody.firstError, error)
    assert.equal(actual.setup, undefined)
    assert.equal(h.custody.slots.setup.child, h.child)
    assert.equal(count(h, 'clear'), 0)
  })
}
// Extract the actual callback-bearing function, preserving its original source body.
function actualObserver(retained = false) {
  const file = new URL('./source-custody-controller.mjs', import.meta.url),
    text = readFileSync(file, 'utf8')
  const parsed = ts.createSourceFile(file.pathname, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const node = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'observeOwner')
  assert(node)
  return vm.runInNewContext("'use strict';(" + node.getText(parsed) + ')', {
    assert,
    Buffer,
    Object,
    setTimeout,
    clearTimeout,
    createSourceRetainedSupervisor: retained
      ? createSourceRetainedSupervisor
      : () => assert.fail('known-exit test must not use retained path'),
    assertSourceKnownClosedExit: (known, code, signal) => assert(known && code === 0 && signal === null),
    assertSourceLaunchActive,
    failSourceLaunch,
    publishSourceLaunchFailure,
    cases: { storage: {}, 'flush-rejection': { retained: true } },
    controllerProcess: { exitCode: 0 },
    detach: () => {
      assert.equal(active.custody.failed, false)
      active.trace.push(['detach'])
    },
    write: (directory, name, value) => {
      active.trace.push(['audit', directory, name, value])
      active.onAudit?.(directory, name, value)
    },
  })
}
test('actual owner exit callback records only its original known-closed child and preserves outcome', async () => {
  const h = harness(),
    actual = records()
  launchSourceChild(h.custody, 'owner', specification())
  h.child.send = () => {}
  const pending = actualObserver()(h.child, '/owned/launch', 'storage', 'nonce', {
    custody: h.custody,
    records: actual,
  })
  h.child.emit('message', { pid: h.child.pid, selected: 'storage', nonce: 'nonce', status: 'KNOWN_CLOSED_SOURCE_CASE' })
  h.child.emit('exit', 0, null)
  assert.equal((await pending).retained, false)
  assert.equal(actual.owner.child, h.child)
  h.custody.complete(actual)
})
test('actual owner exit audit throw pins the child and cause with no record, resolve, or detach', async () => {
  const h = harness(),
    actual = records(),
    first = new Error('owner-exit audit')
  launchSourceChild(h.custody, 'owner', specification())
  h.child.send = () => {}
  h.onAudit = (directory, name) => {
    if (name === 'owner-exit.json') {
      assert.equal(h.custody.slots.owner.child, h.child)
      throw first
    }
  }
  const pending = actualObserver()(h.child, '/owned/launch', 'storage', 'nonce', {
    custody: h.custody,
    records: actual,
  })
  h.child.emit('message', { pid: h.child.pid, selected: 'storage', nonce: 'nonce', status: 'KNOWN_CLOSED_SOURCE_CASE' })
  const rejected = pending.then(
    () => assert.fail('unexpected success'),
    error => error,
  )
  h.child.emit('exit', 0, null)
  assert.equal(await rejected, first)
  assert.equal(actual.owner, undefined)
  assert.equal(h.custody.firstError, first)
  assert.equal(count(h, 'clear'), 0)
})

function retainedObserver(t) {
  const h = harness(),
    actual = records(),
    selected = 'flush-rejection'
  const directory = mkdtempSync(path.join(tmpdir(), 'source-launch-retained-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  launchSourceChild(h.custody, 'owner', specification())
  const acks = [],
    messages = [],
    callbacks = []
  h.child.send = message => acks.push(message)
  const ready = actualObserver(true)(h.child, directory, selected, 'nonce', { custody: h.custody, records: actual })
  let connected = true
  const control = createSourceCaseRuntime({ connected: () => connected, report() {} })
  const owner = createSourceRetainedOwner({
    runtime: control.runtime,
    fail: control.fail,
    identity: { nonce: 'nonce', selected, pid: h.child.pid },
    directory,
    send(message, callback) {
      messages.push(message)
      callbacks.push(callback)
    },
    disconnect() {
      connected = false
      owner.disconnected()
      h.child.emit('disconnect')
    },
  })
  owner.start({ status: 'EXPECTED_RETENTION_LIVENESS_UNVERIFIED', nonce: 'nonce', selected, pid: h.child.pid })
  h.child.emit('message', messages[0])
  owner.receive(acks[0])
  h.child.emit('message', messages[1])
  callbacks[1]()
  return { h, actual, ready }
}
test('actual retained owner callback captures completion only after original final causal proof and publication', async t => {
  const { h, actual, ready } = retainedObserver(t),
    outcome = await ready
  let published = false
  outcome.finalize(() => {
    assert.equal(actual.owner, undefined)
    assert.equal(count(h, 'clear'), 0)
    published = true
  })
  assert.equal(published, true)
  assert.equal(actual.owner.child, h.child)
  assert.equal(actual.owner.terminal, 'SOURCE_RETENTION_CALLBACK_COMMITTED')
  assert.equal(count(h, 'detach'), 1)
  h.custody.complete(actual)
  assert.equal(count(h, 'clear'), 1)
})
for (const failure of ['publication', 'record-construction', 'late-before-publication', 'late-during-publication']) {
  test('actual retained finalize ' + failure + ' pins original cause without record/completion/detach', async t => {
    const { h, actual, ready } = retainedObserver(t),
      outcome = await ready,
      first = new Error(failure)
    if (failure === 'record-construction') Object.freeze(actual)
    if (failure === 'late-before-publication') h.child.emit('error', first)
    const error = caught(() =>
      outcome.finalize(() => {
        if (failure === 'publication') throw first
        if (failure === 'late-during-publication') h.child.emit('error', first)
      }),
    )
    if (failure === 'record-construction') assert.equal(error.name, 'TypeError')
    else assert.equal(error, first)
    assert.equal(h.custody.firstError, error)
    assert.equal(actual.owner, undefined)
    assert.equal(count(h, 'clear'), 0)
    assert.equal(count(h, 'detach'), 0)
  })
}
function faultEvidence(h) {
  const identity = { pid: h.child.pid, nonce: 'nonce', selectedLabel: 'canonical', faultSelector: 'ipc-cleanup-ready' }
  const phase = 'WARMUP_READY',
    admission = 1,
    digest = 'bounded-inert-receipt-digest'
  const armed = { status: 'ARMED_SOURCE_IPC_FAULT', ...identity, phase, admission, reportAfterReceiptThrows: true }
  const receipt = {
    status: 'FAIL_RETENTION_REQUESTED_LIVENESS_UNVERIFIED',
    ...identity,
    phase,
    admission,
    actualPromisesRetained: 1,
    passiveReferencesRetained: 0,
    originalCaptured: true,
    error: 'Required source IPC channel disconnected',
  }
  const rows = {
    order: 11,
    armed: 1,
    waiter: 2,
    invoked: 3,
    lost: 4,
    actualEvent: 5,
    receipt: 6,
    release: 7,
    gateObserved: 8,
    entered: 9,
    fenced: 10,
    reportError: 5,
    receiptDigest: digest,
    observerRegistrations: 2,
    observersAtFault: 2,
    admissionsAtFault: 1,
    namedReferencesAtFault: 1,
    readyFulfilled: true,
    cleanupUnrequested: true,
    callbackFulfilled: false,
    suppressed: false,
    controlledFulfilled: false,
    outerFulfilled: false,
    rootFulfilled: false,
    sameValue: false,
    postRawCount: 0,
    published: true,
  }
  const observed = {
    status: 'EXPECTED_SOURCE_IPC_LOSS_RETAINED',
    ...identity,
    phase,
    admission,
    originalCaptured: true,
    firstCause: true,
    receiptDigest: digest,
    rows,
    postFailureRaw: [],
    passiveIncomplete: false,
    cleanupRequests: 0,
    fixtureAdmissionsAfterFailure: 0,
    fixtureReferencesAfterFailure: 0,
    claim: 'UNIT_SYNTHETIC_PROTOCOL_ONLY',
  }
  return {
    'fault-armed.json': { value: armed, digest: 'armed' },
    'failure-latched.json': { value: receipt, digest },
    'fault-observations.json': { value: observed, digest: 'observed' },
  }
}
function faultObserver() {
  const h = harness(),
    actual = records()
  launchSourceChild(h.custody, 'owner', specification())
  h.child.connected = false
  h.child.exitCode = null
  h.child.signalCode = null
  const evidence = faultEvidence(h)
  const ready = observeSourceIpcFaultOwner(h.child, '/owned/launch', 'ipc-cleanup-ready', 'nonce', {
    launchBoundary: { custody: h.custody, records: actual },
    incomplete: () => false,
    read: name => structuredClone(evidence[name]),
    deadline: 1000,
  })
  h.child.emit('disconnect')
  return { h, actual, evidence, ready }
}
test('actual fault finalize captures record only after final evidence comparison and synchronous publication', async () => {
  const { h, actual, ready } = faultObserver(),
    outcome = await ready
  outcome.finalize(() => {
    assert.equal(actual.owner, undefined)
    assert.equal(count(h, 'clear'), 0)
  })
  assert.equal(actual.owner.child, h.child)
  assert.equal(actual.owner.terminal, 'SOURCE_IPC_FAULT_OBSERVATION_VALIDATED')
  h.custody.complete(actual)
  assert.equal(count(h, 'clear'), 1)
})
for (const failure of ['drift', 'publication', 'record-construction', 'late-owner-exit']) {
  test('actual fault finalize ' + failure + ' cannot manufacture completion or detach', async () => {
    const { h, actual, evidence, ready } = faultObserver(),
      outcome = await ready,
      first = new Error(failure)
    if (failure === 'drift') evidence['fault-observations.json'].value.claim = 'DRIFT'
    if (failure === 'record-construction') Object.freeze(actual)
    if (failure === 'late-owner-exit') h.child.emit('exit', 0, null)
    const error = caught(() =>
      outcome.finalize(() => {
        if (failure === 'publication') throw first
      }),
    )
    if (failure === 'publication') assert.equal(error, first)
    assert.equal(h.custody.firstError, error)
    assert.equal(actual.owner, undefined)
    assert.equal(h.custody.slots.owner.child, h.child)
    assert.equal(count(h, 'clear'), 0)
    assert.equal(count(h, 'detach'), 0)
  })
}

test('an actual returned opaque object is pinned before the required first error-listener property read', () => {
  const h = harness(),
    first = new Error('listener getter')
  const opaque = new Proxy(
    {},
    {
      get(_target, key) {
        assert.equal(h.custody.slots.owner.child, opaque)
        assert.equal(key, 'on')
        throw first
      },
    },
  )
  h.child = opaque
  h.onClose = () => assert.equal(h.custody.slots.owner.child, opaque)
  assert.equal(
    caught(() => launchSourceChild(h.custody, 'owner', specification())),
    first,
  )
  failedPinned(h, first)
  assert.equal(count(h, 'clear'), 0)
})
test('duplicate role refuses before opening or launching again, retaining the first exact child/specification', () => {
  const h = harness(),
    spec = specification()
  launchSourceChild(h.custody, 'owner', spec)
  const opens = count(h, 'open'),
    launches = count(h, 'fork')
  caught(() => launchSourceChild(h.custody, 'owner', specification()))
  assert.equal(count(h, 'open'), opens)
  assert.equal(count(h, 'fork'), launches)
  assert.equal(h.custody.slots.owner.specification, spec)
  assert.equal(h.custody.slots.owner.child, h.child)
  assert.equal(h.custody.firstStage, 'SPECIFICATION')
  assert.equal(count(h, 'clear'), 0)
})
test('ignored-stdio spawn throw opens no FD and releases only its empty context anchor', () => {
  const h = harness()
  h.spawnThrows = true
  h.spawnError = new Error('spawn')
  assert.equal(
    caught(() => launchSourceChild(h.custody, 'supervisor', specification('spawn-ignored'))),
    h.spawnError,
  )
  assert.equal(count(h, 'open'), 0)
  assert.equal(count(h, 'close'), 0)
  assert.equal(h.custody.slots.supervisor.child, undefined)
  assert.equal(h.custody.intervalState, 'EMPTY_FAILURE_RELEASED')
})
test('empty pre-child clear failure retains original open cause and does not retry an ambiguous clear', () => {
  const h = harness()
  h.failOpen = 1
  h.openError = new Error('open')
  h.clearThrows = true
  h.clearError = new Error('clear')
  assert.equal(
    caught(() => launchSourceChild(h.custody, 'owner', specification())),
    h.openError,
  )
  assert.equal(h.custody.firstError, h.openError)
  assert.equal(h.custody.diagnostics.failureReporter.error, h.clearError)
  assert.equal(h.custody.intervalState, 'UNKNOWN_AFTER_CLEAR_THROW')
  publishSourceLaunchFailure(h.custody, '/owned/launch')
  assert.equal(count(h, 'clear'), 1)
})

const { createSourceDirectGuard, runSourceDirectEntry } = await import('./source-custody-direct-entry.mjs')
const {
  runSourceCustodyTransport,
  validateSourceTransportResult,
  publishSourceTransportResult,
  readSourceTransportRequest,
} = await import('./source-custody-transport.mjs')
function directHarness() {
  direct = { process: new EventEmitter(), child: new EventEmitter(), trace: [], directory: '/own/request' }
  direct.child.pid = 901
  for (const effect of ['kill', 'disconnect', 'unref']) direct.child[effect] = () => assert.fail(effect)
  return direct
}
for (const origin of ['stdout-close', 'owner-created']) {
  for (const first of [new Error('original cause'), undefined]) {
    test(
      'actual child error custody survives later asynchronous errors after ' + origin + ' including undefined',
      () => {
        const d = directHarness(),
          h = harness(),
          guard = createSourceDirectGuard()
        guard.bind(h.custody)
        if (origin === 'stdout-close') h.closeErrors.set(41, first)
        const child =
          origin === 'stdout-close'
            ? (caught(() => launchSourceChild(h.custody, 'owner', specification())), h.child)
            : launchSourceChild(h.custody, 'owner', specification())
        if (origin === 'owner-created') {
          failSourceLaunch(h.custody, 'owner', 'supervisor-continuation', first)
          publishSourceLaunchFailure(h.custody, '/own/request')
        }
        assert(child.listenerCount('error') > 0)
        assert.doesNotThrow(() => {
          child.emit('error', new Error('late'))
          child.emit('error', undefined)
        })
        assert.equal(h.custody.firstError, first)
        assert.equal(
          caught(() => guard.complete()),
          first,
        )
        assert.equal(count(h, 'clear'), 0)
        assert.equal(d.trace.filter(row => row[0] === 'clear-anchor').length, 0)
        failedPinned(h, first)
      },
    )
  }
}
for (const first of [new Error('listener registration'), undefined]) {
  test('registration throw retains actual child and the preinstalled direct process guard retains first cause', () => {
    const d = directHarness(),
      h = harness(),
      guard = createSourceDirectGuard()
    guard.bind(h.custody)
    h.child.on = () => {
      assert.equal(h.custody.slots.owner.child, h.child)
      throw first
    }
    assert.equal(
      caught(() => launchSourceChild(h.custody, 'owner', specification())),
      first,
    )
    assert.equal(d.process.listenerCount('uncaughtException'), 1)
    assert.doesNotThrow(() => d.process.emit('uncaughtException', new Error('unhandled subsequent child error')))
    assert.doesNotThrow(() => d.process.emit('unhandledRejection', undefined))
    assert.equal(guard.firstError, first)
    assert.equal(h.custody.firstError, first)
    failedPinned(h, first)
    assert.equal(count(h, 'clear'), 0)
  })
}
for (const event of ['uncaughtException', 'unhandledRejection']) {
  test('direct process registration failure refuses before any operation: ' + event, () => {
    const d = directHarness()
    harness()
    d.registrationFailure = event
    d.registrationError = undefined
    let operations = 0
    const guard = runSourceDirectEntry(() => {
      operations++
    })
    assert.equal(operations, 0)
    assert.equal(guard.failed, true)
    assert.equal(guard.firstError, undefined)
    assert.equal(d.trace.filter(row => row[0] === 'transport-fork').length, 0)
  })
}
test('actual direct bootstrap completes only after its original operation settles and all context proofs', async () => {
  const d = directHarness(),
    h = harness()
  let settle
  const pending = new Promise(resolve => {
    settle = resolve
  })
  const guard = runSourceDirectEntry(current => {
    current.bind(h.custody)
    return pending
  })
  assert.equal(d.trace.filter(row => row[0] === 'clear-anchor').length, 0)
  h.custody.complete(records())
  settle()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(guard.failed, false)
  assert.equal(d.trace.filter(row => row[0] === 'clear-anchor').length, 1)
})
function transportEnvelope(request, pid = 901) {
  return {
    version: 1,
    status: 'SOURCE_CASE_RESULT',
    nonce: request.nonce,
    selected: request.selected,
    controller: { pid, execPath: request.execPath, script: request.script },
    result: {
      selected: request.selected,
      nonce: 'inner-nonce',
      supervisorPid: 50,
      ownerPid: 51,
      status: 'KNOWN_OWNER_EXIT0',
      directory: '/own/attempt',
      canonicalInputDigest: 'a'.repeat(64),
    },
  }
}
async function ownedTransport(action) {
  const directory = mkdtempSync(path.join(tmpdir(), 'source-inert-transport-'))
  try {
    return await action(directory)
  } finally {
    rmSync(directory, { recursive: true })
  }
}
function prepareTransportEffects(d, h, variation, directory, captureRequest) {
  h.onAudit = (_directory, name, value) => {
    if (name === 'request.json') captureRequest(value)
    if (name === 'controller-created.json') {
      assert(d.child.listenerCount('error') > 0)
      if (variation === 'audit-error') throw undefined
    }
    if (name === 'controller-exit.json') {
      if (variation === 'late-error') d.child.emit('error', undefined)
      if (variation === 'result-drift') writeFileSync(path.join(directory, 'result.json'), '{}\n')
    }
  }
  if (variation === 'listener-emits-error') {
    const original = d.child.on
    d.child.on = function (name, callback) {
      Reflect.apply(original, this, [name, callback])
      if (name === 'error') callback(undefined)
      return this
    }
  }
  if (variation === 'registration-error')
    d.child.on = () => {
      throw undefined
    }
}
for (const variation of [
  'ok',
  'lost',
  'foreign-nonce',
  'foreign-pid',
  'foreign-selected',
  'signal',
  'nonzero',
  'late-error',
  'audit-error',
  'registration-error',
  'listener-emits-error',
  'result-drift',
]) {
  test('actual finite standalone transport: ' + variation, async () =>
    ownedTransport(async directory => {
      const d = directHarness(),
        h = harness()
      d.directory = directory
      let request,
        resolved = false
      prepareTransportEffects(d, h, variation, directory, value => {
        request = value
      })
      const promise = runSourceCustodyTransport('storage', fixedControllerScript).then(result => {
        resolved = true
        return result
      })
      const outcome = promise.then(
        value => ({ value }),
        error => ({ error }),
      )
      assert.equal(d.trace.filter(row => row[0] === 'transport-fork').length, 1)
      assert.equal(resolved, false)
      const envelope = transportEnvelope(request)
      if (variation === 'foreign-nonce') envelope.nonce = 'foreign'
      if (variation === 'foreign-pid') envelope.controller.pid++
      if (variation === 'foreign-selected') envelope.selected = 'source-happy'
      if (variation !== 'lost')
        writeFileSync(path.join(directory, 'result.json'), JSON.stringify(envelope) + '\n', { flag: 'wx' })
      assert.equal(resolved, false)
      d.child.emit('exit', variation === 'nonzero' ? 1 : 0, variation === 'signal' ? 'SIGTERM' : null)
      const result = await outcome
      if (variation === 'ok') {
        assert.deepEqual(result.value, envelope.result)
        assert.equal(d.trace.filter(row => row[0] === 'clear-anchor').length, 1)
      } else {
        assert.equal(result.error.status, 'TRANSPORT_UNKNOWN')
        assert.equal(resolved, false)
        assert.equal(d.trace.filter(row => row[0] === 'clear-anchor').length, 0)
      }
      assert.equal(d.trace.filter(row => row[0] === 'transport-fork').length, 1)
    }),
  )
}
for (const mutate of [
  value => {
    value.extra = 1
  },
  value => {
    delete value.controller
  },
  value => {
    value.result.canonicalInputDigest = 'fake'
  },
  value => {
    value.controller.script = '/foreign'
  },
  value => {
    value.result.status = 'UNKNOWN'
  },
]) {
  test('whole actual transport envelope refuses incomplete or foreign result ' + mutate.toString(), () => {
    const request = { nonce: 'n', selected: 'storage', execPath: '/node', script: '/controller' }
    const value = transportEnvelope(request)
    mutate(value)
    assert.throws(() => validateSourceTransportResult(value, request, 901))
  })
}
test('direct result publication checks original process failure before and after exclusive audit', () => {
  const d = directHarness(),
    h = harness(),
    guard = createSourceDirectGuard()
  guard.bind(h.custody)
  const request = { nonce: 'n', selected: 'storage', execPath: process.execPath, script: '/controller' }
  h.onAudit = (_directory, name) => {
    if (name === 'result.json') d.process.emit('uncaughtException', undefined)
  }
  assert.equal(
    caught(() => publishSourceTransportResult(request, '/own/request', transportEnvelope(request).result, guard)),
    undefined,
  )
  assert.equal(guard.failed, true)
  assert.equal(h.custody.firstError, undefined)
  assert.equal(d.trace.filter(row => row[0] === 'clear-anchor').length, 0)
})

for (const first of [new Error('owner-created write'), undefined]) {
  test('actual shared owner descriptor path pins and error-covers before audit throws', () => {
    const d = directHarness(),
      h = harness(),
      guard = createSourceDirectGuard()
    guard.bind(h.custody)
    h.onAudit = (_directory, name) => {
      if (name === 'owner-created.json') throw first
    }
    assert.equal(
      caught(() => launchSourceOwner(h.custody, {}, '/packet', '/owner', ['args'], '/own', {}, 'storage', 'nonce')),
      first,
    )
    assert.equal(h.child.listenerCount('error'), 1)
    assert.doesNotThrow(() => h.child.emit('error', new Error('secondary')))
    assert.equal(h.custody.firstError, first)
    assert.equal(h.custody.slots.owner.child, h.child)
    assert.equal(count(h, 'clear'), 0)
    assert.equal(d.trace.filter(row => row[0] === 'clear-anchor').length, 0)
    assert(h.trace.findIndex(row => row[0] === 'verify-client') < h.trace.findIndex(row => row[0] === 'fork'))
  })
}

const nodeBytes = readFileSync(process.execPath)
const inertExecutable = {
  filename: process.execPath,
  sha256: createHash('sha256').update(nodeBytes).digest('hex'),
  bytes: nodeBytes.length,
}
for (const variation of ['known-exit-storage', 'owner-created-failure']) {
  test('actual complete supervisor with only original effects inert: ' + variation, async () =>
    ownedTransport(async parent => {
      const d = directHarness(),
        h = harness(),
        guard = createSourceDirectGuard(),
        children = []
      const packet = path.join(parent, 'packet'),
        directory = path.join(parent, 'attempt')
      // Owned inert JSON only: no generated client, DB, engine or source packet is run.
      const { mkdirSync } = await import('node:fs')
      mkdirSync(packet)
      writeFileSync(
        path.join(packet, 'manifest.json'),
        JSON.stringify({
          clientReady: true,
          files: [],
          generatedFiles: [],
          packetFiles: [],
          executable: inertExecutable,
          psExecutable: inertExecutable,
          nodeVersion: process.version,
        }),
      )
      h.makeChild = args => {
        const child = new EventEmitter()
        child.pid = 700 + children.length
        child.connected = true
        children.push(child)
        const isOwner = String(args[0]).endsWith('source-custody-owner.mjs')
        child.send = (_message, callback) => {
          callback?.()
          child.connected = false
          child.emit('disconnect')
          queueMicrotask(() => child.emit('exit', 0, null))
        }
        for (const name of ['kill', 'disconnect', 'unref']) child[name] = () => assert.fail('forbidden ' + name)
        queueMicrotask(() => {
          if (isOwner) {
            if (variation === 'owner-created-failure') child.emit('error', new Error('late child error'))
            else
              child.emit('message', {
                pid: child.pid,
                nonce: 'nonce',
                selected: 'storage',
                status: 'KNOWN_CLOSED_SOURCE_CASE',
              })
          } else child.emit('exit', 0, null)
        })
        return child
      }
      const first = new Error('owner audit failed')
      h.onAudit = (_directory, name) => {
        if (name === 'owner-created.json' && variation === 'owner-created-failure') throw first
      }
      if (variation === 'known-exit-storage') {
        await supervisor(packet, directory, 'storage', 'nonce', undefined, guard)
        assert.equal(children.length, 3)
        assert.equal(h.trace.filter(row => row[0] === 'audit' && row[2] === 'supervisor-result.json').length, 1)
        guard.complete()
        assert.equal(d.trace.filter(row => row[0] === 'clear-anchor').length, 1)
      } else {
        await assert.rejects(
          supervisor(packet, directory, 'storage', 'nonce', undefined, guard),
          error => error === first,
        )
        assert.equal(children.length, 2)
        assert.equal(children[1].listenerCount('error'), 1)
        assert.equal(h.trace.filter(row => row[0] === 'audit' && row[2] === 'supervisor-result.json').length, 0)
        assert.equal(d.trace.filter(row => row[0] === 'clear-anchor').length, 0)
        assert.equal(count(h, 'clear'), 0)
      }
    }),
  )
}

for (const first of [undefined, new Error('synchronous child error')]) {
  test('error listener synchronous error is latched before both finite closes and reporting waits for both', () => {
    const h = harness(),
      original = h.child.on
    h.child.on = function (name, callback) {
      assert.equal(h.custody.slots.owner.child, h.child)
      Reflect.apply(original, this, [name, callback])
      callback(first)
      assert.equal(h.custody.firstError, first)
      assert.equal(count(h, 'audit'), 0)
      assert.equal(count(h, 'close'), 0)
      return this
    }
    h.onAudit = () => assert.equal(count(h, 'close'), 2)
    assert.equal(
      caught(() => launchSourceChild(h.custody, 'owner', specification())),
      first,
    )
    assert.equal(count(h, 'close'), 2)
    failedPinned(h, first)
  })
}

test('imported canonical wrapper runs only actual finite transport and installs no process-global handlers', async () =>
  ownedTransport(async directory => {
    const d = directHarness(),
      h = harness()
    d.directory = directory
    let request
    h.onAudit = (_dir, name, value) => {
      if (name === 'request.json') request = value
    }
    const pending = runSourceCustodyCase('storage', '/external-caller-cannot-select-script.mjs')
    const result = transportEnvelope(request)
    writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result) + '\n', { flag: 'wx' })
    assert.equal(d.process.listenerCount('uncaughtException'), 0)
    assert.equal(d.process.listenerCount('unhandledRejection'), 0)
    assert.equal(count(h, 'spawn'), 0)
    assert.equal(count(h, 'fork'), 0)
    assert.equal(d.trace.filter(row => row[0] === 'transport-fork').length, 1)
    assert.equal(d.trace.find(row => row[0] === 'transport-fork')[1], fixedControllerScript)
    assert.equal(request.script, fixedControllerScript)
    d.child.emit('exit', 0, null)
    assert.deepEqual(await pending, result.result)
    await assert.rejects(runSourceCustodyCase('foreign-case'))
    assert.equal(d.trace.filter(row => row[0] === 'transport-fork').length, 1)
  }))
for (const [section, keys] of [
  ['envelope', ['version', 'status', 'nonce', 'selected', 'controller', 'result']],
  ['controller', ['pid', 'execPath', 'script']],
  ['result', ['selected', 'nonce', 'supervisorPid', 'ownerPid', 'status', 'directory', 'canonicalInputDigest']],
]) {
  for (const key of keys)
    test('actual complete transport envelope requires ' + section + '.' + key, () => {
      const request = { nonce: 'n', selected: 'storage', execPath: '/node', script: '/controller' },
        value = transportEnvelope(request)
      delete (section === 'envelope' ? value : value[section])[key]
      assert.throws(() => validateSourceTransportResult(value, request, 901))
    })
}
test('actual direct request reader binds exact owned nonce/case/controller before any case work', async () =>
  ownedTransport(async directory => {
    directHarness()
    const script = new URL('./source-custody-controller.mjs', import.meta.url)
    const { fileURLToPath } = await import('node:url')
    const request = {
      version: 1,
      nonce: 'request-nonce',
      selected: 'storage',
      script: fileURLToPath(script),
      execPath: process.execPath,
    }
    writeFileSync(path.join(directory, 'request.json'), JSON.stringify(request) + '\n', { flag: 'wx' })
    assert.deepEqual(readSourceTransportRequest(directory, 'storage', 'request-nonce', fixedControllerScript), request)
    assert.throws(() => readSourceTransportRequest(directory, 'storage', 'foreign', fixedControllerScript))
    assert.throws(() => readSourceTransportRequest(directory, 'source-happy', 'request-nonce', fixedControllerScript))
    writeFileSync(path.join(directory, 'request.json'), JSON.stringify({ ...request, extra: true }))
    assert.throws(() => readSourceTransportRequest(directory, 'storage', 'request-nonce', fixedControllerScript))
  }))

const { createOrdinarySourceOwnerBootstrap, createCleanupSourceOwnerBootstrap } =
  await import('./source-custody-owner-evidence.mjs')
for (const [create, identity, phase] of [
  [createOrdinarySourceOwnerBootstrap, { pid: 7, selected: 'source-happy', nonce: 'n' }, 'IMPORT'],
  [createCleanupSourceOwnerBootstrap, { pid: 7, selectedLabel: 'canonical', nonce: 'n' }, 'AUX_AWAIT_5705'],
]) {
  test(
    'whole actual verified owner stage bootstrap preserves preflight/fault/admission/actual original import order ' +
      phase,
    async () =>
      ownedTransport(async directory => {
        const h = harness(),
          retained = {},
          emitter = new EventEmitter()
        emitter.connected = true
        emitter.send = () => {}
        emitter.disconnect = () => assert.fail('disconnect')
        const bootstrap = create({ identity, directory, retained, emitter })
        writeFileSync(
          path.join(directory, 'manifest.json'),
          JSON.stringify({ sourceIpcFaultOnly: false, exact: 'original' }),
        )
        const actualStage = {
          get then() {
            assert.fail('stage consumed before original await')
          },
        }
        const prepared = bootstrap.beginStage(directory, phase, () => {
          assert.equal(bootstrap.control.state.admissions[0].phase, phase)
          assert.equal(bootstrap.control.state.admissions[0].kind, 'auxiliary')
          assert.equal(bootstrap.control.state.admissions[0].filled, false)
          const verified = h.trace.find(row => row[0] === 'verify-stage')
          assert.equal(verified[1].exact, 'original')
          assert.equal(verified[2], directory)
          return actualStage
        })
        assert.equal(prepared.packet, directory)
        assert.equal(prepared.clientManifest.exact, 'original')
        assert.equal(bootstrap.fault, undefined)
        assert.equal(prepared.actual, actualStage)
        assert.equal(bootstrap.control.state.admissions[0].original, actualStage)
      }),
  )
}

for (const script of ['relative/source-custody-controller.mjs', '/foreign/other-controller.mjs', undefined]) {
  test(
    'actual transport refuses missing/noncanonical fixed local identity before directory/fork ' + String(script),
    async () => {
      const d = directHarness()
      harness()
      const unknown = await runSourceCustodyTransport('storage', script).then(
        () => assert.fail('foreign script launched'),
        error => error,
      )
      assert.equal(unknown.status, 'TRANSPORT_UNKNOWN')
      assert.equal(d.trace.filter(row => ['transport-fork', 'mkdir', 'mkdtemp'].includes(row[0])).length, 0)
    },
  )
}
test('request authentication rejects a foreign script even with same basename and matching nonce/case', async () =>
  ownedTransport(async directory => {
    directHarness()
    const request = {
      version: 1,
      nonce: 'request-nonce',
      selected: 'storage',
      script: '/foreign/source-custody-controller.mjs',
      execPath: process.execPath,
    }
    writeFileSync(path.join(directory, 'request.json'), JSON.stringify(request) + '\n', { flag: 'wx' })
    assert.throws(() => readSourceTransportRequest(directory, 'storage', 'request-nonce', fixedControllerScript))
  }))

// Actual guarded direct entries, including original canonical admission and awaited shared-stage settlement.
const normalCaseNames = [
  'storage',
  'cleanup-canonical',
  'cleanup-resolver',
  'source-happy',
  'journal-binding',
  'foreign-client',
  'ledger-count',
  'ledger-utf8',
  'ledger-null-utf8',
  'ledger-type',
  'reserve-rejection',
  'flush-rejection',
  'source-finalizer-throw',
  'source-finalizer-async-rejection',
  'source-finalizer-helper-throw',
  'namespace-adoption',
  'late-observer',
  'allocation-overflow',
]
const reviewedCEntry =
  '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m06-work/worktrees/custody-fix/.tmp/m06-source8-template-dependencies1/env-root/a/b/c/d/e/client/index.js'
let entrySequence = 0
async function actualEntry(args) {
  directEffects.process.argv.splice(
    0,
    directEffects.process.argv.length,
    process.execPath,
    fixedControllerScript,
    ...args,
  )
  try {
    await import('./source-custody-controller.mjs?inert-entry=' + ++entrySequence)
    await new Promise(setImmediate)
  } finally {
    directEffects.process.argv.splice(0)
  }
}
function persistInertAudit(h) {
  h.onAudit = (directory, name, value) => {
    assert(realpathSync(directory).startsWith(realpathSync(tmpdir())))
    writeFileSync(path.join(directory, name), JSON.stringify(value) + '\n', { flag: 'wx' })
  }
}
function prepareOuterChild(h, status = 'KNOWN_OWNER_EXIT0', selectedOverride) {
  let launched
  h.makeChild = args => {
    const [execPath, argv, options] = args
    assert.equal(execPath, process.execPath)
    assert.equal(argv[1], '--supervisor')
    const [, , packet, directory, selected, nonce] = argv
    mkdirSync(directory)
    const child = new EventEmitter()
    child.pid = 1001
    for (const name of ['kill', 'disconnect', 'unref']) child[name] = () => assert.fail('forbidden ' + name)
    writeFileSync(
      path.join(directory, 'supervisor-result.json'),
      JSON.stringify({
        selected: selectedOverride ?? selected,
        nonce,
        supervisorPid: child.pid,
        ownerPid: 1002,
        status,
      }) + '\n',
    )
    launched = { child, execPath, argv, options, packet, directory, selected, nonce }
    return child
  }
  return () => launched
}
function externalFixture(parent) {
  parent = realpathSync(parent)
  const packet = path.join(parent, 'packet'),
    reviewPath = path.join(parent, 'review.json')
  mkdirSync(packet)
  const table = normalCaseNames.map(selected => ({
    packet,
    campaign: path.join(parent, selected),
    selected,
    nonce: randomUUID(),
  }))
  const manifest = {
    clientReady: true,
    clientRuntimeSafe: true,
    controllerRuntimeReviewRequired: true,
    clientBinding: {
      origin: 'REVIEWED_RELOCATION',
      physicalReview: { sha256: 'dff065ce5f5f8e3a6407f678a3f782bbd5b6256f018e7db0ca74137c3c4fb609' },
    },
    generatedEntry: reviewedCEntry,
    files: [],
    generatedFiles: [],
    packetFiles: [],
    executable: inertExecutable,
    psExecutable: inertExecutable,
    nodeVersion: process.version,
    canonicalInputDigest: 'e'.repeat(64),
  }
  const review = {
    judgment: 'ACCEPT',
    scope: 'EXACT_SOURCE_REGRESSION8_CONTROLLER_AND_INPUTS',
    controllerExecutionAuthorized: true,
    allowedCases: [...normalCaseNames],
    externalCaseAdmissions: table,
  }
  function publish() {
    const bytes = JSON.stringify(manifest)
    writeFileSync(path.join(packet, 'manifest.json'), bytes)
    review.controllerManifestSha256 = createHash('sha256').update(bytes).digest('hex')
    writeFileSync(reviewPath, JSON.stringify(review))
  }
  publish()
  return {
    packet,
    reviewPath,
    table,
    manifest,
    review,
    publish,
    args(row = table[0]) {
      return ['--external-case', packet, row.campaign, row.selected, row.nonce, reviewPath]
    },
  }
}
async function settleEntry() {
  await new Promise(setImmediate)
}
for (const status of ['KNOWN_OWNER_EXIT0', 'EXPECTED_RETAINED_SUPERVISOR_EXIT']) {
  test('actual guarded external entry uses one original supervisor and exact postexit stage: ' + status, async () =>
    ownedTransport(async parent => {
      const d = directHarness(),
        h = harness(),
        f = externalFixture(parent),
        get = prepareOuterChild(h, status)
      persistInertAudit(h)
      await actualEntry(f.args())
      const launched = get(),
        row = f.table[0]
      assert(launched)
      assert.equal(h.trace.filter(r => r[0] === 'canonical-inputs' || r[0] === 'canonical-build').length, 0)
      assert.deepEqual(launched.argv, [
        path.join(f.packet, 'source-custody-controller.mjs'),
        '--supervisor',
        f.packet,
        path.join(row.campaign, 'attempt'),
        row.selected,
        row.nonce,
        f.reviewPath,
      ])
      assert.equal(launched.options.cwd, row.campaign)
      assert.deepEqual(launched.options.env, { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin' })
      assert.equal(launched.options.detached, true)
      assert.equal(launched.child.listenerCount('error'), 2)
      assert.equal(h.trace.filter(r => r[0] === 'clear').length, 0)
      assert.equal(d.trace.filter(r => r[0] === 'clear-anchor').length, 0)
      const consumed = JSON.parse(readFileSync(path.join(row.campaign, 'campaign.json')))
      assert.equal(consumed.nonce, row.nonce)
      assert.equal(consumed.packet, f.packet)
      assert.equal(consumed.status, 'CONSUMED_SOURCE_EXTERNAL_C_CAMPAIGN_NO_RETRY')
      assert.equal(consumed.packetManifestSha256, f.review.controllerManifestSha256)
      assert.equal(consumed.reviewSha256, createHash('sha256').update(readFileSync(f.reviewPath)).digest('hex'))
      if (status === 'EXPECTED_RETAINED_SUPERVISOR_EXIT') {
        const spawned = { pid: 1002, script: path.join(f.packet, 'source-custody-owner.mjs'), nonce: row.nonce }
        writeFileSync(path.join(launched.directory, 'owner-created.json'), JSON.stringify(spawned))
        h.postexit = (executable, args, options) => {
          assert.equal(executable, '/bin/ps')
          assert.deepEqual(args, ['-p', '1002', '-o', 'pid=,ppid=,stat=,command='])
          assert.equal(options.timeout, 1000)
          assert.equal(options.maxBuffer, 16384)
          assert.deepEqual(JSON.parse(readFileSync(path.join(launched.directory, 'supervisor-exit.json'))), {
            pid: 1001,
            code: 0,
            signal: null,
          })
          return `1002 1 S ${spawned.script} ${row.nonce}\n`
        }
      }
      launched.child.emit('exit', 0, null)
      await settleEntry()
      assert.equal(d.exitCode, undefined)
      assert.equal(d.trace.filter(r => r[0] === 'clear-anchor').length, 1)
      assert.equal(
        h.trace.filter(r => r[0] === 'postexit').length,
        status === 'EXPECTED_RETAINED_SUPERVISOR_EXIT' ? 1 : 0,
      )
      assert.equal(h.trace.filter(r => r[0] === 'clear').length, 1)
    }),
  )
}
for (const failure of ['selected', 'nonzero', 'signal', 'error', 'undefined', 'reporter']) {
  test(
    'actual external original-stage failure stays held without default generation/completion: ' + failure,
    async () =>
      ownedTransport(async parent => {
        const d = directHarness(),
          h = harness(),
          f = externalFixture(parent)
        const get = prepareOuterChild(h, 'KNOWN_OWNER_EXIT0', failure === 'selected' ? 'foreign-case' : undefined)
        persistInertAudit(h)
        await actualEntry(f.args())
        const launched = get(),
          first = failure === 'undefined' ? undefined : new Error('original supervisor failure')
        const audit = h.onAudit
        if (failure === 'reporter')
          h.onAudit = (dir, name, value) => {
            if (name === 'STOP.json') throw new Error('report failed')
            audit(dir, name, value)
          }
        if (failure === 'error' || failure === 'undefined' || failure === 'reporter')
          launched.child.emit('error', first)
        else launched.child.emit('exit', failure === 'nonzero' ? 1 : 0, failure === 'signal' ? 'SIGTERM' : null)
        await settleEntry()
        assert.equal(d.exitCode, 1)
        assert.equal(h.trace.filter(r => r[0] === 'clear').length, 0)
        assert.equal(d.trace.filter(r => r[0] === 'clear-anchor').length, 0)
        assert.equal(h.trace.filter(r => r[0] === 'postexit' || r[0] === 'canonical-build').length, 0)
        assert.equal(h.trace.filter(r => r[0] === 'spawn').length, 1)
        assert.doesNotThrow(() => launched.child.emit('error', new Error('later failure retained')))
        assert(existsSync(f.table[0].campaign))
      }),
  )
}
const externalMutations = {
  'array-selected-row': f => {
    f.table[1].selected = ['storage']
  },
  'eighteen-coerced-storage-identities': f => {
    for (const row of f.table.slice(1)) row.selected = ['storage']
  },
  'foreign-row-case': f => {
    f.table[1].selected = 'foreign-case'
  },
  'null-row': f => {
    f.table[1] = null
  },
  'array-row': f => {
    f.table[1] = []
  },
  'missing-table': f => {
    delete f.review.externalCaseAdmissions
  },
  'short-table': f => {
    f.table.pop()
  },
  'long-table': f => {
    f.table.push({ ...f.table[0] })
  },
  'extra-key': f => {
    f.table[1].extra = true
  },
  'missing-key': f => {
    delete f.table[1].nonce
  },
  'duplicate-case': f => {
    f.table[1].selected = f.table[0].selected
  },
  'duplicate-campaign': f => {
    f.table[1].campaign = f.table[0].campaign
  },
  'duplicate-nonce': f => {
    f.table[1].nonce = f.table[0].nonce
  },
  'foreign-packet': f => {
    f.table[1].packet = '/foreign/packet'
  },
  'malformed-uuid': f => {
    f.table[1].nonce = 'not-a-uuid'
  },
  'wrong-client': f => {
    f.manifest.generatedEntry = '/foreign/client/index.js'
  },
  'unsafe-client': f => {
    f.manifest.clientRuntimeSafe = false
  },
  'generated-client': f => {
    f.manifest.clientBinding.origin = 'OWNED_GENERATION'
  },
  'wrong-physical-review': f => {
    f.manifest.clientBinding.physicalReview.sha256 = '0'.repeat(64)
  },
  'no-review-required': f => {
    f.manifest.controllerRuntimeReviewRequired = false
  },
  'wrong-scope': f => {
    f.review.scope = 'OTHER'
  },
  'not-accepted': f => {
    f.review.judgment = 'REJECT'
  },
  'no-execution': f => {
    f.review.controllerExecutionAuthorized = false
  },
  'unlisted-case': f => {
    f.review.allowedCases = []
  },
  'fault-packet': f => {
    f.manifest.sourceIpcFaultOnly = true
  },
}
for (const [name, mutate] of Object.entries(externalMutations)) {
  test('actual external admission refuses before fresh campaign/fork/default builder: ' + name, async () =>
    ownedTransport(async parent => {
      const d = directHarness(),
        h = harness(),
        f = externalFixture(parent),
        args = f.args()
      mutate(f)
      f.publish()
      await actualEntry(args)
      assert.equal(d.exitCode, 1)
      assert.equal(
        h.trace.filter(r => ['spawn', 'fork', 'canonical-inputs', 'canonical-build'].includes(r[0])).length,
        0,
      )
      assert.equal(existsSync(args[2]), false)
      assert.equal(h.trace.filter(r => r[0] === 'audit').length, 0)
      assert.equal(d.trace.filter(r => r[0] === 'clear-anchor').length, 0)
    }),
  )
}
const externalArgumentMutations = {
  'absent-review': (args, _fixture, parent) => {
    args[5] = path.join(parent, 'absent-review.json')
  },
  'symlink-review': (args, fixture, parent) => {
    const alias = path.join(parent, 'review-link')
    symlinkSync(fixture.reviewPath, alias)
    args[5] = alias
  },
  'symlink-packet': (args, fixture, parent) => {
    const alias = path.join(parent, 'packet-link')
    symlinkSync(fixture.packet, alias)
    args[1] = alias
  },
  'symlink-campaign-parent': (args, _fixture, parent) => {
    const alias = path.join(parent, 'parent-link')
    symlinkSync(realpathSync(parent), alias)
    args[2] = path.join(alias, 'storage')
  },
  'extra-arg': args => args.push('extra'),
  'missing-arg': args => args.pop(),
  'foreign-case': args => {
    args[3] = 'foreign-case'
  },
  'foreign-nonce': args => {
    args[4] = randomUUID()
  },
  'foreign-campaign': (args, _fixture, parent) => {
    args[2] = path.join(parent, 'foreign-campaign')
  },
  'relative-packet': args => {
    args[1] = 'relative/packet'
  },
  'noncanonical-campaign': (args, _fixture, parent) => {
    args[2] = parent + '/x/../storage'
  },
  'existing-campaign': args => mkdirSync(args[2]),
  'manifest-drift': (_args, fixture) =>
    writeFileSync(path.join(fixture.packet, 'manifest.json'), JSON.stringify({ ...fixture.manifest, drift: true })),
}
for (const [failure, mutate] of Object.entries(externalArgumentMutations)) {
  test('actual guarded external input tuple/arity/path refusal creates no campaign: ' + failure, async () =>
    ownedTransport(async parent => {
      const d = directHarness(),
        h = harness(),
        f = externalFixture(parent),
        args = f.args()
      mutate(args, f, parent)
      await actualEntry(args)
      assert.equal(d.exitCode, 1)
      assert.equal(
        h.trace.filter(r => ['spawn', 'fork', 'canonical-inputs', 'canonical-build'].includes(r[0])).length,
        0,
      )
      assert.equal(existsSync(f.table[0].campaign), failure === 'existing-campaign')
      assert.equal(h.trace.filter(r => r[0] === 'audit').length, 0)
    }),
  )
}
for (const failure of [false, 'error', 'undefined', 'reporter']) {
  test(
    'canonical actual try await catch finally retains admission through pending stage and releases after settlement: ' +
      failure,
    async () =>
      ownedTransport(async requestDirectory => {
        const d = directHarness(),
          h = harness(),
          get = prepareOuterChild(h)
        h.canonical = { digest: createHash('sha256').update(randomUUID()).digest('hex') }
        persistInertAudit(h)
        const campaign = path.join(inertCanonicalRoot, '.appraisejs/source-custody-regressions', h.canonical.digest)
        writeFileSync(
          path.join(requestDirectory, 'request.json'),
          JSON.stringify({
            version: 1,
            nonce: 'transport-nonce',
            selected: 'storage',
            script: fixedControllerScript,
            execPath: process.execPath,
          }),
        )
        await actualEntry(['--case', 'storage', requestDirectory, 'transport-nonce'])
        const launched = get(),
          lock = path.join(campaign, 'admission')
        assert(launched)
        assert(existsSync(lock), 'Original admission must remain held while shared-stage exit observation is pending')
        assert(existsSync(path.join(lock, 'owner.json')))
        assert.equal(h.trace.filter(r => r[0] === 'canonical-inputs').length, 1)
        assert.equal(h.trace.filter(r => r[0] === 'canonical-build').length, 1)
        assert.equal(launched.argv.length, 6, 'Canonical supervisor argv remains without review arg')
        assert.equal(d.trace.filter(r => r[0] === 'clear-anchor').length, 0)
        if (failure) {
          const audit = h.onAudit
          if (failure === 'reporter')
            h.onAudit = (dir, name, value) => {
              if (name === 'STOP.json') throw new Error('report failed')
              audit(dir, name, value)
            }
          launched.child.emit('error', failure === 'undefined' ? undefined : new Error('original stage rejection'))
        } else launched.child.emit('exit', 0, null)
        await settleEntry()
        assert.equal(
          existsSync(lock),
          false,
          'Original finally releases own admission only after awaited stage settled',
        )
        assert.equal(d.exitCode, failure ? 1 : undefined)
        assert.equal(d.trace.filter(r => r[0] === 'clear-anchor').length, failure ? 0 : 1)
        assert.equal(h.trace.filter(r => r[0] === 'spawn').length, 1)
        assert.equal(h.trace.filter(r => r[0] === 'postexit').length, 0)
        if (failure) {
          assert.equal(h.trace.filter(r => r[0] === 'audit' && r[2] === 'launch-failure.json').length > 0, true)
          assert.equal(h.trace.filter(r => r[0] === 'clear').length, 0)
        } else {
          const result = JSON.parse(readFileSync(path.join(requestDirectory, 'result.json')))
          assert.equal(result.result.selected, 'storage')
        }
      }),
  )
}

// Private stage is tested from its complete actual source body, with the same fixed original launch/exit effects.
function actualPreparedStage(extra) {
  const text = readFileSync(new URL('./source-custody-controller.mjs', import.meta.url), 'utf8')
  const parsed = ts.createSourceFile('controller.mjs', text, ts.ScriptTarget.ES2017, true, ts.ScriptKind.JS)
  const node = parsed.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'runPreparedSourceCase')
  assert(node)
  return vm.runInNewContext("'use strict';(" + node.getText(parsed) + ')', { assert, path, Object, ...extra })
}
for (const prepared of [
  { mode: 'OTHER' },
  { mode: 'EXTERNAL_REVIEWED', packet: '/packet' },
  { mode: 'CANONICAL', packet: '/packet', reviewPath: '/forbidden' },
]) {
  test(
    'actual private prepared contract refuses unsupported mode or missing/foreign review identity before launch ' +
      JSON.stringify(prepared),
    async () => {
      const stage = actualPreparedStage({ launchSourceChild: () => assert.fail('invalid contract launched') })
      await assert.rejects(
        stage(
          {
            packet: '/packet',
            preparation: '/owned',
            directory: '/attempt',
            selected: 'storage',
            nonce: 'nonce',
            canonicalInputDigest: 'd'.repeat(64),
            ...prepared,
          },
          {},
          {},
        ),
      )
    },
  )
}
for (const missing of ['packet', 'preparation', 'directory', 'selected', 'nonce', 'canonicalInputDigest']) {
  test('actual private prepared identity requires ' + missing + ' before original launch', async () => {
    const prepared = {
      mode: 'CANONICAL',
      packet: '/packet',
      preparation: '/owned',
      directory: '/attempt',
      selected: 'storage',
      nonce: 'nonce',
      canonicalInputDigest: 'd'.repeat(64),
    }
    delete prepared[missing]
    const stage = actualPreparedStage({ launchSourceChild: () => assert.fail('incomplete identity launched') })
    await assert.rejects(stage(prepared, {}, {}), /Complete prepared source-case identity required/)
  })
}
test('actual canonical shared stage retains its original selected-result policy while external rejects foreign selected', async () => {
  const h = harness(),
    actual = records(),
    guard = { assertActive() {} },
    audits = new Map()
  h.onAudit = (_directory, name, value) => audits.set(name, value)
  const stage = actualPreparedStage({
    launchSourceChild,
    knownExit,
    assertSourceLaunchActive,
    controllerProcess: { execPath: process.execPath },
    read: filename =>
      filename.endsWith('supervisor-result.json')
        ? { selected: 'original-foreign-selected', nonce: 'nonce', status: 'KNOWN_OWNER_EXIT0' }
        : audits.get('supervisor-exit.json'),
    write: (_directory, name, value) => {
      assert.equal(value, audits.get(name))
    },
    observeLiveness: () => assert.fail('known-closed case liveness'),
  })
  const pending = stage(
    {
      mode: 'CANONICAL',
      packet: '/packet',
      preparation: '/owned',
      directory: '/attempt',
      selected: 'storage',
      nonce: 'nonce',
      canonicalInputDigest: 'd'.repeat(64),
    },
    { custody: h.custody, records: actual },
    guard,
  )
  assert.equal(count(h, 'clear'), 0)
  h.child.emit('exit', 0, null)
  assert.equal((await pending).selected, 'original-foreign-selected')
  assert.equal(actual.supervisor.child, h.child)
  assert.equal(count(h, 'clear'), 1)
})

// Complete actual private admission grammar, including JSON input coercion vs Set identity.
function actualExternalValidators() {
  const text = readFileSync(new URL('./source-custody-controller.mjs', import.meta.url), 'utf8')
  const parsed = ts.createSourceFile('controller.mjs', text, ts.ScriptTarget.ES2017, true, ts.ScriptKind.JS)
  const constants = parsed.statements
    .filter(
      n =>
        ts.isVariableStatement(n) &&
        n.declarationList.declarations.some(d => ['cases', 'externalNonce'].includes(d.name.getText(parsed))),
    )
    .map(n => n.getText(parsed))
  const functions = parsed.statements
    .filter(
      n =>
        ts.isFunctionDeclaration(n) &&
        ['assertExternalPath', 'validateExternalAdmission', 'validateExternalAdmissions'].includes(n.name?.text),
    )
    .map(n => n.getText(parsed))
  assert.equal(constants.length, 2)
  assert.equal(functions.length, 3)
  return vm.runInNewContext(
    "'use strict';\n" +
      constants.concat(functions).join('\n') +
      '\n({validateExternalAdmission,validateExternalAdmissions})',
    { assert, path, realpathSync, Object, Set },
  )
}
for (const malformed of [false, 'one-array', 'seventeen-distinct-arrays']) {
  test('actual full eighteen-case admission validates primitive case coverage ' + malformed, async () =>
    ownedTransport(async parent => {
      const f = externalFixture(parent),
        validators = actualExternalValidators()
      const rows = JSON.parse(JSON.stringify(f.table))
      if (malformed === 'one-array') rows[1].selected = ['storage']
      if (malformed === 'seventeen-distinct-arrays') for (const row of rows.slice(1)) row.selected = ['storage']
      if (malformed) {
        assert.throws(
          () => validators.validateExternalAdmission(rows[1], f.packet),
          /Primitive external admission case required/,
        )
        assert.throws(
          () => validators.validateExternalAdmissions(rows, rows[0]),
          /Primitive external admission case required/,
        )
      } else {
        assert.equal(validators.validateExternalAdmissions(rows, rows[0]), undefined)
        assert.equal(new Set(rows.map(row => row.selected)).size, 18)
        for (const row of rows) assert.equal(validators.validateExternalAdmission(row, f.packet), undefined)
      }
    }),
  )
}
