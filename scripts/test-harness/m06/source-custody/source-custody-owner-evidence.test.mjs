// Owned non-DB files and actual inert owner evidence/handlers only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createOrdinarySourceOwnerEvidence,
  createOrdinarySourceOwnerBootstrap,
  createCleanupSourceOwnerBootstrap,
  createCleanupSourceOwnerEvidence,
  bindOrdinarySourceOwnerFault,
  bindCleanupSourceOwnerFault,
  createOrdinarySourceKnownClosedHandlers,
} from './source-custody-owner-evidence.mjs'
const families = [
  {
    label: 'ordinary',
    create: createOrdinarySourceOwnerEvidence,
    identity: { pid: 7, selected: 'source-happy', nonce: 'n' },
    lineCap: 16384,
    totalCap: 128 * 1024,
  },
  {
    label: 'cleanup',
    create: createCleanupSourceOwnerEvidence,
    identity: { pid: 7, selectedLabel: 'canonical', nonce: 'n' },
    lineCap: 8192,
    totalCap: 96 * 1024,
  },
]
function fixture(t, family, extra = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'source-owner-evidence-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const retained = {},
    sent = []
  const control = family.create({
    directory,
    retained,
    identity: family.identity,
    connected: () => true,
    send: (result, callback) => sent.push({ result, callback }),
    fault: () => undefined,
    ...extra,
  })
  assert.equal(retained.control, control)
  return { directory, retained, sent, control }
}
function lines(h) {
  return readFileSync(path.join(h.directory, 'owner-events.jsonl'), 'utf8').trimEnd().split('\n')
}
for (const family of families) {
  test(family.label + ' actual event framing preserves field identity/sequence/phase and distinct schema', t => {
    const h = fixture(t, family),
      admission = h.control.runtime.begin('ACTUAL_PHASE')
    h.control.runtime.keep(admission, {})
    h.control.runtime.event('first', { explicit: 1 })
    h.control.runtime.event('second')
    const frames = lines(h).map(line => JSON.parse(line))
    const base = family.label === 'ordinary' ? family.identity : { pid: 7, nonce: 'n' }
    assert.deepEqual(frames, [
      { sequence: 1, ...base, phase: 'ACTUAL_PHASE', kind: 'first', explicit: 1 },
      { sequence: 2, ...base, phase: 'ACTUAL_PHASE', kind: 'second' },
    ])
  })
  test(family.label + ' actual event count bound retains all96 original events and freezes on next attempt', t => {
    const h = fixture(t, family)
    for (let n = 0; n < 96; n++) h.control.runtime.event('count', { n })
    assert.throws(() => h.control.runtime.event('overflow'))
    assert.equal(lines(h).length, 96)
    const first = h.control.state.error
    assert.throws(() => h.control.runtime.event('late'))
    assert.equal(h.control.state.error, first)
    assert.equal(lines(h).length, 96)
    assert.equal(h.sent.length, 1)
  })
  test(family.label + ' actual byte limits count the same UTF8 bytes and never publish an oversized line', t => {
    const h = fixture(t, family)
    assert.throws(() => h.control.runtime.event('oversized', { data: 'é'.repeat(family.lineCap) }))
    assert.equal(existsSync(path.join(h.directory, 'owner-events.jsonl')), false)
    assert.equal(h.control.state.failed, true)
    const total = fixture(t, family)
    let written = 0
    while (!total.control.runtime.failed) {
      try {
        total.control.runtime.event('bounded', { data: 'x'.repeat(7900) })
        written++
      } catch {}
    }
    const published = lines(total)
    assert.equal(published.length, written)
    assert(written < 96)
    assert(published.every(line => Buffer.byteLength(line) <= family.lineCap))
    const bytes = published.reduce((sum, line) => sum + Buffer.byteLength(line), 0)
    assert(bytes <= family.totalCap)
    assert(bytes + Buffer.byteLength(published[0]) > family.totalCap)
  })
  test(family.label + ' failure receipt is durable before selected report throw and original IPC notification', t => {
    let reported = 0
    const identity = {
      ...family.identity,
      faultSelector: family.label === 'ordinary' ? 'ipc-reserve-controlled' : 'ipc-cleanup-ready',
    }
    const h = fixture(t, family, {
      identity,
      fault: () => ({
        reportError() {
          assert.equal(JSON.parse(readFileSync(path.join(h.directory, 'failure-latched.json'))).error, 'first')
          reported++
        },
      }),
    })
    const original = {},
      admission = h.control.runtime.begin('ORIGINAL_PHASE')
    h.control.runtime.keep(admission, original)
    const first = new Error('first')
    h.control.fail(first)
    assert.equal(reported, 1)
    assert.equal(h.sent.length, 1)
    assert.equal(h.sent[0].result.error, 'first')
    assert.equal(h.sent[0].result.originalCaptured, true)
    assert.equal(h.control.state.decisive.original, original)
    assert.equal(h.control.state.error, first)
    h.sent[0].callback(new Error('later send'))
    assert.equal(h.control.state.error, first)
    assert.equal(reported, 1)
  })
}
test('ordinary line limit remains wider than cleanup without sharing its policy', t => {
  const ordinary = fixture(t, families[0]),
    cleanup = fixture(t, families[1])
  ordinary.control.runtime.event('wide', { data: 'x'.repeat(8300) })
  assert.equal(lines(ordinary).length, 1)
  assert.throws(() => cleanup.control.runtime.event('wide', { data: 'x'.repeat(8300) }))
  assert.equal(existsSync(path.join(cleanup.directory, 'owner-events.jsonl')), false)
})
for (const [name, bind, family, selected] of [
  [
    'ordinary',
    bindOrdinarySourceOwnerFault,
    families[0],
    { selected: 'ipc-reserve-controlled', faultSelector: 'ipc-reserve-controlled' },
  ],
  [
    'cleanup',
    bindCleanupSourceOwnerFault,
    families[1],
    { selectedLabel: 'canonical', faultSelector: 'ipc-cleanup-ready' },
  ],
]) {
  test(name + ' actual fixed fault binding preserves identity, existing handler precedence and one original API', t => {
    const h = fixture(t, family),
      emitter = new EventEmitter(),
      firstHandler = () => {}
    emitter.on('disconnect', firstHandler)
    const identity = { pid: 7, nonce: 'n', ...selected }
    const options = {
      identity,
      directory: h.directory,
      control: h.control,
      emitter,
      connected: () => true,
      disconnect() {
        assert.fail('binding must not disconnect')
      },
    }
    const fault = bind(options, { sourceIpcFaultOnly: true, faultReportAfterReceiptThrows: true })
    assert.equal(fault.selector, selected.faultSelector)
    assert.equal(h.control.state.references.get('sourceIpcFault'), fault)
    assert.equal(emitter.listeners('disconnect')[0], firstHandler)
    assert.equal(emitter.listenerCount('disconnect'), 2)
    assert.equal(bind({ ...options, identity: family.identity }, {}), undefined)
    for (const manifest of [{}, { sourceIpcFaultOnly: true, faultReportAfterReceiptThrows: false }])
      assert.throws(() => bind(options, manifest))
    assert.throws(() =>
      bind({ ...options, identity: { ...identity, faultSelector: 'foreign' } }, { sourceIpcFaultOnly: true }),
    )
    assert.throws(() =>
      bind(
        {
          ...options,
          identity: { ...identity, ...(name === 'ordinary' ? { selected: 'foreign' } : { selectedLabel: 'resolver' }) },
        },
        { sourceIpcFaultOnly: true, faultReportAfterReceiptThrows: true },
      ),
    )
  })
}
test('ordinary actual ACK/terminal handlers keep fixed routing and only release already-proven known closure', () => {
  const state = { knownClosed: false, acknowledged: false },
    terminalMessages = [],
    failures = []
  let clears = 0,
    disconnects = 0,
    terminalDisconnects = 0
  const terminal = {
    started: false,
    receive: value => terminalMessages.push(value),
    disconnected: () => terminalDisconnects++,
  }
  const runtime = {
    failed: false,
    assertActive() {
      assert.equal(this.failed, false)
    },
  }
  let handlers
  handlers = createOrdinarySourceKnownClosedHandlers({
    runtime,
    fail: error => failures.push(error),
    state,
    lifetime: 'exact-owner-anchor',
    clearLifetime(anchor) {
      assert.equal(anchor, 'exact-owner-anchor')
      clears++
    },
    disconnect() {
      disconnects++
      handlers.disconnected()
    },
    terminal,
  })
  const retained = { type: 'ACK_EXPECTED_RETENTION' }
  handlers.message(retained)
  assert.equal(terminalMessages[0], retained)
  handlers.disconnected()
  assert.equal(terminalDisconnects, 1)
  assert.equal(clears, 0)
  handlers.message({ type: 'ACK_KNOWN_CLOSED' })
  assert.equal(failures.length, 1)
  state.knownClosed = true
  handlers.message({ type: 'ACK_KNOWN_CLOSED' })
  assert.equal(disconnects, 1)
  assert.equal(clears, 1)
  runtime.failed = true
  handlers.disconnected()
  assert.equal(clears, 1)
})

for (const [family, create] of [
  [families[0], createOrdinarySourceOwnerBootstrap],
  [families[1], createCleanupSourceOwnerBootstrap],
]) {
  test(family.label + ' whole owner bootstrap preserves emitter callbacks and distinct evidence/fault family', t => {
    const directory = mkdtempSync(path.join(tmpdir(), 'source-bootstrap-'))
    t.after(() => rmSync(directory, { recursive: true }))
    const retained = {},
      sent = [],
      emitter = new EventEmitter()
    emitter.connected = true
    emitter.send = function (...args) {
      assert.equal(this, emitter)
      sent.push(args)
    }
    emitter.disconnect = () => assert.fail('no fault disconnect on bootstrap')
    const bootstrap = create(family.identity ? { identity: family.identity, directory, retained, emitter } : {})
    assert.equal(bootstrap.control, retained.control)
    assert.equal(bootstrap.runtime, bootstrap.control.runtime)
    assert.equal(bootstrap.bindFault({ sourceIpcFaultOnly: false }), undefined)
    bootstrap.runtime.event('bootstrap', { actual: true })
    const event = JSON.parse(readFileSync(path.join(directory, 'owner-events.jsonl'), 'utf8'))
    assert.equal(event.pid, 7)
    assert.equal(event.nonce, 'n')
    assert.equal(event.selected, family.label === 'ordinary' ? 'source-happy' : undefined)
    const first = new Error('original')
    bootstrap.control.fail(first)
    assert.equal(sent.length, 1)
    assert.equal(bootstrap.control.state.error, first)
    assert.equal(JSON.parse(readFileSync(path.join(directory, 'failure-latched.json'))).error, 'original')
  })
}
