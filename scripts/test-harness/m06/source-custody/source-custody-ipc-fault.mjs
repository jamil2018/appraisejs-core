// Two fixed fault fixtures only. Importing this helper performs no IO or process action.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants, openSync, readSync, closeSync, fstatSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const sourceIpcFaultCases = Object.freeze(['ipc-cleanup-ready', 'ipc-reserve-controlled'])
export const sourceIpcFaultCause = 'Required source IPC channel disconnected'
export const sourceIpcFaultPhase = Object.freeze({
  'ipc-cleanup-ready': 'WARMUP_READY',
  'ipc-reserve-controlled': 'IPC_RESERVE_CONTROLLED',
})
export const sourceIpcFaultReportError = 'CONTROLLED_SOURCE_FAULT_REPORT_AFTER_RECEIPT'
const failureKeys = [
  'status',
  'pid',
  'nonce',
  'faultSelector',
  'phase',
  'admission',
  'actualPromisesRetained',
  'passiveReferencesRetained',
  'originalCaptured',
  'error',
]
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function exactKeys(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort())
}
export function readSourceFaultJson(directory, name) {
  assert(
    ['failure-latched.json', 'fault-armed.json', 'fault-observations.json', 'fault-incomplete.json'].includes(name),
  )
  const fd = openSync(path.join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = fstatSync(fd)
    assert(info.isFile() && info.uid === process.getuid() && info.size <= 16384, 'Owned bounded fault evidence')
    const bytes = Buffer.alloc(16385)
    let count = 0
    while (count < bytes.length) {
      const n = readSync(fd, bytes, count, bytes.length - count, null)
      if (!n) break
      count += n
    }
    assert(count <= 16384)
    const text = bytes.subarray(0, count).toString('utf8'),
      value = JSON.parse(text)
    assert.equal(text, JSON.stringify(value) + '\n', 'Canonical unambiguous fault JSON')
    return { value, digest: hash(text) }
  } finally {
    closeSync(fd)
  }
}
export function validateSourceFaultReceipt(value, identity, admission) {
  const selectedKey = Object.hasOwn(identity, 'selectedLabel') ? 'selectedLabel' : 'selected'
  exactKeys(value, [...failureKeys, selectedKey])
  for (const [key, expected] of Object.entries(identity)) assert.equal(value[key], expected)
  assert.equal(value.status, 'FAIL_RETENTION_REQUESTED_LIVENESS_UNVERIFIED')
  assert.equal(value.phase, sourceIpcFaultPhase[identity.faultSelector])
  assert.equal(value.phase, admission.phase)
  assert.equal(value.admission, admission.id)
  assert.equal(value.originalCaptured, true)
  assert.equal(value.error, sourceIpcFaultCause)
  assert(
    Number.isInteger(value.actualPromisesRetained) &&
      value.actualPromisesRetained > 0 &&
      value.actualPromisesRetained <= 256,
  )
  assert(
    Number.isInteger(value.passiveReferencesRetained) &&
      value.passiveReferencesRetained >= 0 &&
      value.passiveReferencesRetained <= 2048,
  )
  return value
}
export function writeSourceFaultJson(directory, name, value) {
  const text = JSON.stringify(value) + '\n'
  assert(Buffer.byteLength(text) <= 16384, 'Fault evidence byte bound')
  writeFileSync(path.join(directory, name), text, { flag: 'wx' })
}

// Complete selected injection effect stage; fixed preowned cells and original operation references only.
export function injectSourceIpcFault(context) {
  const { control, state, selector, rows, refs, cause, connected, disconnect } = context

  assert(
    !rows.invoked && !rows.invalid && !state.failed && connected() && rows.waiter && rows.cleanupUnrequested,
    'One active pre-waited fault only',
  )
  assert(refs.admission?.filled && refs.admission.original === refs.root && state.current === refs.admission)
  assert.equal(rows.observerRegistrations, selector === 'ipc-cleanup-ready' ? 2 : 4)
  rows.observersAtFault = rows.observerRegistrations
  rows.admissionsAtFault = state.admissionCount
  rows.namedReferencesAtFault = state.references.size
  rows.invoked = ++rows.order
  disconnect() // Real process.disconnect supplied by owner; no synthetic event or connected mutation.
  assert(!connected(), 'Real disconnect must lose the required channel')
  rows.lost = ++rows.order
  control.fail(cause)
  assert(state.error === cause, 'First-cause precedence')
}

export function createSourceIpcFault({
  control,
  identity,
  directory,
  emitter,
  connected,
  disconnect,
  read = name => readSourceFaultJson(directory, name),
  write = (name, value) => writeSourceFaultJson(directory, name, value),
}) {
  const { runtime, state } = control,
    selector = identity.faultSelector
  runtime.assertActive()
  assert(sourceIpcFaultCases.includes(selector))
  const rows = {
    order: 0,
    armed: 0,
    waiter: 0,
    invoked: 0,
    lost: 0,
    actualEvent: 0,
    receipt: 0,
    release: 0,
    gateObserved: 0,
    entered: 0,
    fenced: 0,
    reportError: 0,
    invalid: undefined,
    receiptDigest: undefined,
    observerRegistrations: 0,
    observersAtFault: 0,
    admissionsAtFault: 0,
    namedReferencesAtFault: 0,
    readyFulfilled: false,
    cleanupUnrequested: false,
    callbackFulfilled: false,
    suppressed: false,
    controlledFulfilled: false,
    outerFulfilled: false,
    rootFulfilled: false,
    sameValue: false,
    postRawCount: 0,
    published: false,
  }
  const raw = Array.from({ length: 7 }, () => ({
    original: undefined,
    receiver: undefined,
    order: 0,
    passiveCell: -1,
    site: undefined,
    failedAtEntry: false,
    failedAtCapture: false,
    genuineTx: false,
  }))
  const refs = {
    admission: undefined,
    root: undefined,
    pair: undefined,
    callback: undefined,
    controlled: undefined,
    outer: undefined,
    tx: undefined,
    callbackValue: undefined,
    controlledValue: undefined,
    rootValue: undefined,
    overflow: undefined,
  }
  const cause = new Error(sourceIpcFaultCause)
  const injection = Object.freeze({ control, state, selector, rows, refs, cause, connected, disconnect })
  let release
  const gate = runtime.keep(
    runtime.begin('IPC_FAULT_GATE', 'auxiliary'),
    new Promise(resolve => {
      release = resolve
    }),
  )
  const reserved = Object.fromEntries(
    ['ready', 'controlled', 'outer', 'root'].map(name => [
      name,
      runtime.begin('IPC_FAULT_' + name.toUpperCase() + '_OBSERVER', 'auxiliary'),
    ]),
  )
  function invalid(reason) {
    if (!rows.invalid) {
      try {
        rows.invalid = String(reason).slice(0, 160)
      } catch {
        rows.invalid = 'Unreportable fault evidence error'
      }
    }
    try {
      control.fail(new Error('Source IPC fault incomplete: ' + rows.invalid))
    } catch {}
    try {
      write('fault-incomplete.json', { status: 'SOURCE_IPC_FAULT_INCOMPLETE', ...identity, reason: rows.invalid })
    } catch {}
  }
  function passive(action) {
    try {
      action()
    } catch (error) {
      let reason = 'Unreportable fault evidence error'
      try {
        reason = error?.message ?? reason
      } catch {}
      invalid(reason)
    }
  }
  function originalCell(original, site) {
    const index = state.passiveCount - 1
    assert(
      index >= 0 &&
        state.passive[index] === original &&
        state.passiveOrigins[index] === refs.admission &&
        state.passiveSites[index] === site,
      'Actual filled passive cell and admission required',
    )
    return index
  }
  function retainObserver(name, original) {
    const cell = reserved[name]
    if (!cell.filled) {
      cell.original = original
      cell.filled = true
      rows.observerRegistrations++
    } else {
      refs.overflow ??= original
      invalid('Observer filled twice')
    }
  }
  function observe(name, original, fulfilled) {
    assert(!state.failed && connected(), 'Observer registration must precede failure')
    const observer = original.then(
      value =>
        passive(() => {
          fulfilled(value)
          publish()
        }),
      error =>
        passive(() => {
          refs.overflow ??= error
          invalid(name + ' genuinely rejected')
        }),
    )
    retainObserver(name, observer)
  }
  function summary() {
    return {
      status: 'EXPECTED_SOURCE_IPC_LOSS_RETAINED',
      ...identity,
      phase: refs.admission.phase,
      admission: refs.admission.id,
      originalCaptured: refs.admission.filled && refs.admission.original === refs.root,
      firstCause: state.error === cause && state.error.message === sourceIpcFaultCause,
      receiptDigest: rows.receiptDigest,
      rows: { ...rows, published: true },
      postFailureRaw: raw
        .slice(0, rows.postRawCount)
        .map(({ order, passiveCell, site, failedAtEntry, failedAtCapture, genuineTx }) => ({
          order,
          passiveCell,
          site,
          failedAtEntry,
          failedAtCapture,
          genuineTx,
          admission: refs.admission.id,
          phase: refs.admission.phase,
        })),
      passiveIncomplete: state.incomplete,
      cleanupRequests: 0,
      fixtureAdmissionsAfterFailure: state.admissionCount - rows.admissionsAtFault,
      fixtureReferencesAfterFailure: state.references.size - rows.namedReferencesAtFault,
      claim: 'FIXTURE_FENCED_ALREADY_ADMITTED_PRODUCT_MAY_SETTLE_NOT_QUIESCENCE',
    }
  }
  function publish() {
    if (!sourceFaultPublicationReady(selector, rows)) return
    passive(() => {
      assert(
        !state.incomplete && state.error === cause && rows.receipt < rows.release && rows.actualEvent < rows.release,
      )
      write('fault-observations.json', summary())
      rows.published = true
    })
  }
  runtime.keep(
    runtime.begin('IPC_FAULT_GATE_OBSERVER', 'auxiliary'),
    gate.then(() =>
      passive(() => {
        rows.gateObserved = ++rows.order
        publish()
      }),
    ),
  )
  rows.observerRegistrations++
  function actualDisconnect() {
    passive(() => {
      assert(
        rows.invoked && rows.lost && !rows.actualEvent && !rows.invalid,
        'Unexpected/early/duplicate actual disconnect',
      )
      rows.actualEvent = ++rows.order
      assert(
        state.failed && !state.incomplete && state.error === cause && !connected(),
        'Existing complete first failure latch required',
      )
      const receipt = read('failure-latched.json')
      validateSourceFaultReceipt(receipt.value, identity, refs.admission)
      assert(rows.reportError, 'Selected post-receipt reporting fault required')
      rows.receiptDigest = receipt.digest
      rows.receipt = ++rows.order
      rows.release = ++rows.order
      release() // Only the already-created fixture gate, never cleanup/hold/ACK authority.
    })
  }
  emitter.on('disconnect', actualDisconnect) // Owners install their existing failure listener first.
  function inject() {
    passive(() => injectSourceIpcFault(injection))
  }

  const api = {
    selector,
    gate,
    rows,
    refs,
    arm(admission) {
      runtime.assertActive()
      assert(
        !refs.admission &&
          admission.kind === 'actual' &&
          admission.phase === sourceIpcFaultPhase[selector] &&
          state.current === admission,
      )
      refs.admission = admission
      rows.armed = ++rows.order
      write('fault-armed.json', {
        status: 'ARMED_SOURCE_IPC_FAULT',
        ...identity,
        phase: admission.phase,
        admission: admission.id,
        reportAfterReceiptThrows: true,
      })
    },
    waiter() {
      runtime.assertActive()
      assert(!rows.waiter)
      rows.waiter = ++rows.order
    },
    window(snapshot) {
      runtime.assertActive()
      assert(!snapshot.cleanupPending && !snapshot.finalCloseRequested)
      for (const mint of [snapshot.canonical, snapshot.resolver]) assert(!mint.closeRequested && !mint.cleanupAdmitted)
      rows.cleanupUnrequested = true
    },
    entered() {
      passive(() => {
        assert(state.failed && rows.release)
        rows.entered = ++rows.order
      })
    },
    stopped(error) {
      passive(() => {
        assert(rows.entered && rows.release && state.failed && error?.message === 'SOURCE_FIXTURE_FAILED')
        rows.fenced = ++rows.order
        publish()
      })
    },
    reportError() {
      if (state.failed) rows.reportError = ++rows.order
    },
    observeReady(pair) {
      runtime.assertActive()
      assert(selector === 'ipc-cleanup-ready')
      api.arm(state.current)
      refs.root = pair.ready
      refs.pair = pair
      assert(refs.admission.filled && refs.admission.original === refs.root)
      observe('ready', refs.root, value => {
        refs.rootValue = value
        rows.readyFulfilled = true
        inject()
      })
    },
    rootReturned(original) {
      runtime.assertActive()
      assert(selector === 'ipc-reserve-controlled' && refs.admission.filled && refs.admission.original === original)
      refs.root = original
      observe('root', original, value => {
        refs.rootValue = value
        rows.rootFulfilled = true
      })
    },
    raw(original, admission, receiver, site, failedAtEntry) {
      if (!state.failed || admission !== refs.admission) return
      passive(() => {
        const index = rows.postRawCount
        if (index >= raw.length) {
          refs.overflow ??= original
          invalid('Post-failure raw row capacity')
          return
        }
        const row = raw[index]
        row.original = original
        row.receiver = receiver
        row.order = ++rows.order
        row.site = site
        row.failedAtEntry = failedAtEntry
        row.failedAtCapture = state.failed
        row.genuineTx = receiver === refs.tx
        row.passiveCell = originalCell(original, site)
        rows.postRawCount++
        assert(row.genuineTx && failedAtEntry, 'Actual post-failure callback tx entry required')
      })
    },
    outer(original, admission) {
      if (admission !== refs.admission || selector !== 'ipc-reserve-controlled') return
      passive(() => {
        refs.outer = original
        originalCell(original, 'transaction-outer')
        observe('outer', original, () => {
          rows.outerFulfilled = true
        })
      })
    },
    callbackFulfilled(value, admission) {
      if (admission !== refs.admission) return
      refs.callbackValue = value
      rows.callbackFulfilled = true
    },
    suppressed(value, admission) {
      if (admission !== refs.admission) return
      rows.suppressed = state.failed && value === refs.callbackValue
    },
    controlled(actual, controlled, admission, tx) {
      if (admission !== refs.admission || selector !== 'ipc-reserve-controlled') return
      passive(() => {
        refs.callback = actual
        refs.controlled = controlled
        refs.tx = tx
        assert(typeof tx === 'object' && tx !== null, 'Actual original callback transaction object required')
        assert(typeof actual === 'object' && actual !== null && actual !== controlled)
        assert(
          state.passive.some(
            (value, index) =>
              value === actual &&
              state.passiveOrigins[index] === admission &&
              state.passiveSites[index] === 'transaction-callback',
          ),
          'Original callback passive cell required',
        )
        originalCell(controlled, 'controlled-transaction-callback')
        observe('controlled', controlled, value => {
          refs.controlledValue = value
          rows.controlledFulfilled = true
          rows.sameValue = value === refs.callbackValue
        })
        assert(
          refs.root && admission.filled && admission.original === refs.root && refs.outer,
          'Eager original root and outer must be captured before callback hook',
        )
        inject()
      })
    },
  }
  runtime.retain('sourceIpcFault', api)
  return Object.freeze(api)
}

const sourceFaultReleaseOrder = Object.freeze([
  ['waiter', 'invoked'],
  ['invoked', 'lost'],
  ['lost', 'actualEvent'],
  ['actualEvent', 'receipt'],
  ['receipt', 'release'],
  ['release', 'gateObserved'],
  ['gateObserved', 'entered'],
  ['entered', 'fenced'],
])
const sourceFaultPublicationObligations = Object.freeze({
  'ipc-cleanup-ready': Object.freeze(['readyFulfilled']),
  'ipc-reserve-controlled': Object.freeze([
    'callbackFulfilled',
    'suppressed',
    'controlledFulfilled',
    'outerFulfilled',
    'rootFulfilled',
    'sameValue',
  ]),
})
export function sourceFaultPublicationReady(selector, rows) {
  if (rows.published || rows.invalid || !rows.fenced || !rows.release || !rows.gateObserved) return false
  assert(sourceIpcFaultCases.includes(selector))
  if (!sourceFaultPublicationObligations[selector].every(key => rows[key])) return false
  return selector !== 'ipc-reserve-controlled' || rows.postRawCount >= 6
}

export function validateSourceFaultReferenceProof(value, identity, armed, receipt) {
  exactKeys(value, [
    'status',
    ...Object.keys(identity),
    'phase',
    'admission',
    'originalCaptured',
    'firstCause',
    'receiptDigest',
    'rows',
    'postFailureRaw',
    'passiveIncomplete',
    'cleanupRequests',
    'fixtureAdmissionsAfterFailure',
    'fixtureReferencesAfterFailure',
    'claim',
  ])
  exactKeys(armed, ['status', ...Object.keys(identity), 'phase', 'admission', 'reportAfterReceiptThrows'])
  assert.equal(armed.status, 'ARMED_SOURCE_IPC_FAULT')
  assert.equal(armed.reportAfterReceiptThrows, true)
  for (const [key, expected] of Object.entries(identity)) assert.equal(armed[key], expected)
  for (const [key, expected] of Object.entries(identity)) assert.equal(value[key], expected)
  assert.equal(value.status, 'EXPECTED_SOURCE_IPC_LOSS_RETAINED')
  assert.equal(value.phase, sourceIpcFaultPhase[identity.faultSelector])
  assert.equal(value.admission, armed.admission)
  validateSourceFaultReceipt(receipt.value, identity, { id: armed.admission, phase: armed.phase })
  assert.equal(value.receiptDigest, receipt.digest)
  assert.equal(value.originalCaptured, true)
  assert.equal(value.firstCause, true)
  assert.equal(value.passiveIncomplete, false)
  assert.equal(value.cleanupRequests, 0)
  assert.equal(value.fixtureAdmissionsAfterFailure, 0)
  assert.equal(value.fixtureReferencesAfterFailure, 0)
  const r = value.rows
  exactKeys(r, [
    'order',
    'armed',
    'waiter',
    'invoked',
    'lost',
    'actualEvent',
    'receipt',
    'release',
    'gateObserved',
    'entered',
    'fenced',
    'reportError',
    'receiptDigest',
    'observerRegistrations',
    'observersAtFault',
    'admissionsAtFault',
    'namedReferencesAtFault',
    'readyFulfilled',
    'cleanupUnrequested',
    'callbackFulfilled',
    'suppressed',
    'controlledFulfilled',
    'outerFulfilled',
    'rootFulfilled',
    'sameValue',
    'postRawCount',
    'published',
  ])
  for (const key of [
    'order',
    'armed',
    'waiter',
    'invoked',
    'lost',
    'actualEvent',
    'receipt',
    'release',
    'gateObserved',
    'entered',
    'fenced',
    'reportError',
  ])
    assert(Number.isInteger(r[key]) && r[key] >= 0 && r[key] <= 32)
  assert.equal(r.postRawCount, value.postFailureRaw.length)
  assert.equal(r.observerRegistrations, identity.faultSelector === 'ipc-cleanup-ready' ? 2 : 4)
  assert.equal(r.observersAtFault, r.observerRegistrations)
  assert(
    !r.invalid &&
      r.published &&
      r.cleanupUnrequested &&
      sourceFaultReleaseOrder.every(([before, after]) => r[before] < r[after]) &&
      r.reportError,
  )
  return r
}
export function validateSourceCleanupReadyProof(value, rows) {
  assert(rows.readyFulfilled && value.postFailureRaw.length === 0)
}
export function validateSourceFaultRawRows(value) {
  for (const row of value.postFailureRaw) {
    exactKeys(row, [
      'order',
      'passiveCell',
      'site',
      'failedAtEntry',
      'failedAtCapture',
      'genuineTx',
      'admission',
      'phase',
    ])
    assert(
      row.admission === value.admission &&
        row.phase === value.phase &&
        row.genuineTx &&
        row.failedAtEntry &&
        row.failedAtCapture,
    )
    assert(Number.isInteger(row.passiveCell) && row.passiveCell >= 0 && row.passiveCell < 2048)
  }
}
export function validateSourceReserveControlledProof(value, rows) {
  assert(
    rows.callbackFulfilled &&
      rows.suppressed &&
      rows.controlledFulfilled &&
      rows.outerFulfilled &&
      rows.rootFulfilled &&
      rows.sameValue,
  )
  assert(value.postFailureRaw.length >= 6 && value.postFailureRaw.length <= 7)
  validateSourceFaultRawRows(value)
}
export function validateSourceFaultObservation(value, identity, armed, receipt) {
  const rows = validateSourceFaultReferenceProof(value, identity, armed, receipt)
  if (identity.faultSelector === 'ipc-cleanup-ready') validateSourceCleanupReadyProof(value, rows)
  else validateSourceReserveControlledProof(value, rows)
  return value
}
