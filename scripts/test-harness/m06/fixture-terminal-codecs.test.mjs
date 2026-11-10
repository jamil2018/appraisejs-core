import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import {
  encodeServiceTerminalAck,
  decodeServiceTerminalAck,
  decodeServiceTerminalHandoff,
  assertServiceCallbackReceipt,
  decodeSourceRetentionPreliminary,
  decodeSourceRetentionHandoff,
  createSourceRetentionBinding,
  decodeSourceRetentionResult,
  encodeSourceRetentionPreliminary,
  decodeSourceRetentionAck,
  encodeSourceRetentionHandoff,
  encodeSourceRetentionCallbackCommit,
  decodeSourceRetentionCallbackCommit,
  decodeSourceOwnerFailure,
  assertSourceRetentionHandoffMatch,
} from './fixture-terminal-codecs.mjs'

const scope = Object.freeze({
  case: 'inert-case',
  pid: 123,
  nonce: '00000000-0000-0000-0000-000000000000',
  terminalType: 'case-retained',
  terminalSequence: 8,
  expectedFixtureSha256: 'a'.repeat(64),
})
const callbackScope = { ...scope, ownerScript: '/inert/owner.mjs', handoffSequence: 10 }
const callback = {
  version: 1,
  type: 'owner-terminal-callback-commit',
  ...callbackScope,
  phase: 'OWNER_HANDOFF_SEND_CALLBACK_COMMITTED',
}

test('actual service codecs return complete original envelopes and bind every fixed field', () => {
  const ack = encodeServiceTerminalAck(scope),
    handoff = { ...scope, type: 'terminal-handoff', sequence: 10 }
  assert.equal(decodeServiceTerminalAck(ack, scope), ack)
  assert.equal(decodeServiceTerminalHandoff(handoff, scope), handoff)
  assert.equal(assertServiceCallbackReceipt(callback, undefined, callbackScope), callback)
  for (const [value, decode] of [
    [ack, raw => decodeServiceTerminalAck(raw, scope)],
    [handoff, raw => decodeServiceTerminalHandoff(raw, scope)],
    [callback, raw => assertServiceCallbackReceipt(raw, undefined, callbackScope)],
  ]) {
    for (const key of Object.keys(value)) {
      const missing = { ...value }
      delete missing[key]
      assert.throws(() => decode(missing), key)
      assert.throws(() => decode({ ...value, [key]: null }), key)
    }
    for (const raw of [undefined, null, [], {}, { ...value, extra: true }]) assert.throws(() => decode(raw))
  }
  for (const sequence of [8, 7, 1.5, '10', NaN])
    assert.throws(() => decodeServiceTerminalHandoff({ ...handoff, sequence }, scope))
  assert.throws(() => encodeServiceTerminalAck({ ...scope, extra: true }))
  assert.throws(() => encodeServiceTerminalAck({ ...scope, case: 'x'.repeat(4096) }))
})

test('callback receipt keeps failure precedence and original stricter callback scope validation', () => {
  const failure = {
    version: 1,
    type: 'failure-retained',
    classification: 'UNEXPECTED_FIXTURE_FAILURE',
    case: scope.case,
    pid: scope.pid,
    nonce: scope.nonce,
    phase: 'first',
    operationPhase: 'inert',
    message: 'original',
    referenceSummary: {},
  }
  assert.throws(() => assertServiceCallbackReceipt(undefined, failure, callbackScope), /terminal precedence/)
  assert.throws(() => assertServiceCallbackReceipt(callback, { ...failure, pid: 9 }, callbackScope), /Foreign/)
  for (const delta of [
    { pid: 0 },
    { terminalSequence: 0 },
    { handoffSequence: 8 },
    { ownerScript: 'relative' },
    { nonce: 'invalid' },
    { expectedFixtureSha256: 'bad' },
    { terminalType: 'other' },
  ]) {
    const changed = { ...callbackScope, ...delta }
    assert.throws(() => assertServiceCallbackReceipt({ ...callback, ...delta }, undefined, changed))
  }
})

function sourceEnvelope(type) {
  const identity = { nonce: scope.nonce, pid: scope.pid, selected: 'inert-source' }
  const resultBytes = JSON.stringify({ status: 'EXPECTED_RETENTION_LIVENESS_UNVERIFIED', ...identity })
  const canonical = JSON.stringify({ ...identity, resultBytes })
  return {
    identity,
    message: { type, ...identity, resultDigest: createHash('sha256').update(canonical).digest('hex'), resultBytes },
  }
}

test('actual source producer binds original serialized bytes and preserves frozen canonical binding', () => {
  const { identity, message } = sourceEnvelope('EXPECTED_RETENTION_PRELIMINARY')
  const binding = createSourceRetentionBinding(identity, message.resultBytes)
  assert.deepEqual(binding, { ...identity, resultDigest: message.resultDigest, resultBytes: message.resultBytes })
  assert.equal(Object.isFrozen(binding), true)
  for (const value of [null, undefined, 1, {}, Buffer.from('{}')])
    assert.throws(() => createSourceRetentionBinding(identity, value))
  // Parsing deliberately stays at its separate original callsite, after binding construction.
  assert.equal(createSourceRetentionBinding(identity, '{').resultBytes, '{')
})

test('actual source result decoder preserves full parsed result and original status/identity refusal', () => {
  const { identity } = sourceEnvelope('EXPECTED_RETENTION_PRELIMINARY')
  const result = { ...identity, status: 'EXPECTED_RETENTION_LIVENESS_UNVERIFIED', retained: { original: true } }
  const binding = createSourceRetentionBinding(identity, JSON.stringify(result))
  assert.deepEqual(decodeSourceRetentionResult(binding), result)
  for (const field of ['nonce', 'pid', 'selected', 'status']) {
    const changed = { ...result, [field]: null }
    assert.throws(() => decodeSourceRetentionResult(createSourceRetentionBinding(identity, JSON.stringify(changed))))
  }
  assert.throws(() => decodeSourceRetentionResult(createSourceRetentionBinding(identity, '{')), SyntaxError)
})

test('actual source codecs recompute canonical digest and keep source/service families distinct', () => {
  for (const [type, decode] of [
    ['EXPECTED_RETENTION_PRELIMINARY', decodeSourceRetentionPreliminary],
    ['EXPECTED_RETENTION_HANDOFF', decodeSourceRetentionHandoff],
  ]) {
    const { identity, message } = sourceEnvelope(type)
    assert.deepEqual(decode(message, identity), {
      ...identity,
      resultDigest: message.resultDigest,
      resultBytes: message.resultBytes,
    })
    for (const key of Object.keys(message)) {
      const missing = { ...message }
      delete missing[key]
      assert.throws(() => decode(missing, identity), key)
      assert.throws(() => decode({ ...message, [key]: null }, identity), key)
    }
    for (const raw of [
      null,
      [],
      {},
      { ...message, extra: 1 },
      { ...message, type: 'terminal-handoff' },
      { ...message, resultDigest: 'b'.repeat(64) },
      { ...message, resultBytes: '{' },
      { ...message, resultBytes: 'x'.repeat(32769) },
    ])
      assert.throws(() => decode(raw, identity))
    const wrongResult = JSON.stringify({ status: 'other', ...identity })
    const digest = createHash('sha256')
      .update(JSON.stringify({ ...identity, resultBytes: wrongResult }))
      .digest('hex')
    assert.throws(() => decode({ ...message, resultBytes: wrongResult, resultDigest: digest }, identity))
    assert.throws(() => decodeServiceTerminalHandoff(message, scope))
    assert.throws(() => decode(encodeServiceTerminalAck(scope), identity))
  }
})

const sourceTuple = Object.freeze({ nonce: 'n', pid: 7, selected: 'source', resultDigest: 'digest' })
const sourceBinding = Object.freeze({ ...sourceTuple, resultBytes: '{original opaque bytes}' })
const sourceAck = () => ({ type: 'ACK_EXPECTED_RETENTION', ...sourceTuple })
const sourceCommit = () => JSON.parse(encodeSourceRetentionCallbackCommit(sourceTuple))
const sourceFailure = () => ({
  status: 'FAIL_RETENTION_REQUESTED_LIVENESS_UNVERIFIED',
  pid: 7,
  selected: 'source',
  nonce: 'n',
  phase: 'ORIGINAL',
  actualPromisesRetained: 0,
  passiveReferencesRetained: 0,
  originalCaptured: false,
  error: 'original',
})
function caughtCodec(action) {
  try {
    action()
  } catch (error) {
    return error
  }
  assert.fail('expected codec rejection')
}
for (const [name, create, decode] of [
  ['ACK', sourceAck, raw => decodeSourceRetentionAck(raw, sourceTuple)],
  ['callback commit', sourceCommit, raw => decodeSourceRetentionCallbackCommit(raw, sourceTuple)],
  ['owner failure', sourceFailure, raw => decodeSourceOwnerFailure(raw, sourceTuple)],
]) {
  test(name + ' decoder returns the exact original object without clone or freeze', () => {
    const raw = create()
    assert.equal(decode(raw), raw)
    assert.equal(Object.isFrozen(raw), false)
  })
  for (const key of Object.keys(create())) {
    test(name + ' decoder requires own field ' + key, () => {
      const raw = create()
      delete raw[key]
      assert.throws(() => decode(raw))
    })
  }
  for (const raw of [undefined, null, false, 1, 'object', [], {}, { ...create(), extra: true }]) {
    test(name + ' decoder rejects a nonrecord, absent fields or extra own fields: ' + JSON.stringify(raw), () =>
      assert.throws(() => decode(raw)),
    )
  }
}
for (const key of ['nonce', 'pid', 'selected', 'resultDigest']) {
  test('actual ACK and callback commit reject foreign tuple field ' + key, () => {
    assert.throws(
      () => decodeSourceRetentionAck({ ...sourceAck(), [key]: 'foreign' }, sourceTuple),
      new RegExp('Terminal tuple mismatch: ' + key),
    )
    assert.throws(
      () => decodeSourceRetentionCallbackCommit({ ...sourceCommit(), [key]: 'foreign' }, sourceTuple),
      new RegExp('Terminal tuple mismatch: ' + key),
    )
  })
}
for (const [encode, type] of [
  [encodeSourceRetentionPreliminary, 'EXPECTED_RETENTION_PRELIMINARY'],
  [encodeSourceRetentionHandoff, 'EXPECTED_RETENTION_HANDOFF'],
]) {
  test(type + ' encoder preserves insertion order, opaque bytes, spread override and nested references', () => {
    const extra = {},
      binding = { ...sourceBinding, extra }
    const value = encode(binding)
    assert.deepEqual(Object.keys(value), ['type', ...Object.keys(binding)])
    assert.equal(value.type, type)
    assert.equal(value.extra, extra)
    assert.equal(value.resultBytes, sourceBinding.resultBytes)
    assert.equal(Object.isFrozen(value), false)
    assert.equal(encode({ ...binding, type: 'original spread override' }).type, 'original spread override')
  })
  test(type + ' encoder accepts exactly32768 UTF8 bytes and rejects32769 without result validation', () => {
    const empty = { ...sourceBinding, nonce: '' },
      gap = 32768 - Buffer.byteLength(JSON.stringify(encode(empty)))
    const binding = { ...empty, nonce: 'é'.repeat(Math.floor(gap / 2)) + 'x'.repeat(gap % 2) }
    assert.equal(Buffer.byteLength(JSON.stringify(encode(binding))), 32768)
    assert.throws(() => encode({ ...binding, nonce: binding.nonce + 'x' }), /Terminal IPC byte cap/)
  })
}
test('actual ACK remains unbounded and never serializes or strengthens matching tuple primitives', () => {
  const binding = { nonce: 'é'.repeat(40000), pid: 'original nonnumber', selected: null, resultDigest: false }
  const raw = { type: 'ACK_EXPECTED_RETENTION', ...binding }
  Object.defineProperty(raw, 'toJSON', {
    value() {
      assert.fail('ACK serialized')
    },
    enumerable: false,
  })
  assert.equal(decodeSourceRetentionAck(raw, binding), raw)
  assert.throws(() => encodeSourceRetentionPreliminary({ ...binding, resultBytes: '{}' }), /Terminal IPC byte cap/)
  assert.throws(() => decodeSourceRetentionAck({ ...raw, type: 'EXPECTED_RETENTION_HANDOFF' }, binding))
})
test('actual ACK preserves exact-keys then literal then tuple first-rejection order', () => {
  assert.match(
    caughtCodec(() =>
      decodeSourceRetentionAck({ ...sourceAck(), extra: true, type: 'wrong', nonce: 'foreign' }, sourceTuple),
    ).message,
    /Unexpected evidence fields/,
  )
  const wrongType = caughtCodec(() =>
    decodeSourceRetentionAck({ ...sourceAck(), type: 'wrong', nonce: 'foreign' }, sourceTuple),
  )
  assert.equal(wrongType.actual, 'wrong')
  assert.equal(wrongType.expected, 'ACK_EXPECTED_RETENTION')
  assert.match(
    caughtCodec(() => decodeSourceRetentionAck({ ...sourceAck(), nonce: 'foreign', pid: 8 }, sourceTuple)).message,
    /Terminal tuple mismatch: nonce/,
  )
})
test('actual callback encoder preserves exact fields/bytes/newline and4096 UTF8 inclusive limit', () => {
  const bytes = encodeSourceRetentionCallbackCommit(sourceTuple)
  assert.equal(
    bytes,
    JSON.stringify({
      version: 1,
      type: 'OWNER_RETENTION_CALLBACK_COMMIT',
      nonce: 'n',
      pid: 7,
      selected: 'source',
      resultDigest: 'digest',
      successCallbackObserved: true,
    }) + '\n',
  )
  const empty = { ...sourceTuple, nonce: '' },
    gap = 4096 - Buffer.byteLength(encodeSourceRetentionCallbackCommit(empty))
  const binding = { ...empty, nonce: 'é'.repeat(Math.floor(gap / 2)) + 'x'.repeat(gap % 2) }
  assert.equal(Buffer.byteLength(encodeSourceRetentionCallbackCommit(binding)), 4096)
  assert.throws(() => encodeSourceRetentionCallbackCommit({ ...binding, nonce: binding.nonce + 'x' }))
})
test('actual callback decoder has no added cap or serialization and preserves original strict literal order', () => {
  const binding = { ...sourceTuple, nonce: 'é'.repeat(40000) },
    raw = { ...sourceCommit(), nonce: binding.nonce }
  Object.defineProperty(raw, 'toJSON', {
    value() {
      assert.fail('commit decoder serialized')
    },
    enumerable: false,
  })
  assert.equal(decodeSourceRetentionCallbackCommit(raw, binding), raw)
  const wrongVersion = caughtCodec(() =>
    decodeSourceRetentionCallbackCommit(
      { ...sourceCommit(), version: 2, type: 'wrong', successCallbackObserved: false, nonce: 'foreign' },
      sourceTuple,
    ),
  )
  assert.equal(wrongVersion.actual, 2)
  assert.equal(wrongVersion.expected, 1)
  const wrongType = caughtCodec(() =>
    decodeSourceRetentionCallbackCommit(
      { ...sourceCommit(), type: 'wrong', successCallbackObserved: false, nonce: 'foreign' },
      sourceTuple,
    ),
  )
  assert.equal(wrongType.actual, 'wrong')
  assert.equal(wrongType.expected, 'OWNER_RETENTION_CALLBACK_COMMIT')
  const wrongSuccess = caughtCodec(() =>
    decodeSourceRetentionCallbackCommit(
      { ...sourceCommit(), successCallbackObserved: false, nonce: 'foreign' },
      sourceTuple,
    ),
  )
  assert.equal(wrongSuccess.actual, false)
  assert.equal(wrongSuccess.expected, true)
})
for (const admission of [undefined, null, false, 0, '', [], {}, { nested: ['actual'] }]) {
  test('owner failure preserves arbitrary optional admission value ' + JSON.stringify(admission), () => {
    const raw = { ...sourceFailure(), admission }
    assert.equal(decodeSourceOwnerFailure(raw, sourceTuple), raw)
    assert.equal(raw.admission, admission)
  })
}
for (const key of ['actualPromisesRetained', 'passiveReferencesRetained']) {
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '0', null]) {
    test('owner failure rejects invalid ' + key + ' ' + String(value), () =>
      assert.throws(() => decodeSourceOwnerFailure({ ...sourceFailure(), [key]: value }, sourceTuple)),
    )
  }
  test('owner failure accepts inclusive safe integer ' + key, () => {
    const raw = { ...sourceFailure(), [key]: Number.MAX_SAFE_INTEGER }
    assert.equal(decodeSourceOwnerFailure(raw, sourceTuple), raw)
  })
}
for (const key of ['nonce', 'pid', 'selected', 'phase', 'error', 'originalCaptured', 'status']) {
  test('owner failure preserves original field validation ' + key, () =>
    assert.throws(() => decodeSourceOwnerFailure({ ...sourceFailure(), [key]: null }, sourceTuple)),
  )
}
test('owner failure cap is32768 UTF8 inclusive and precedes exact fields/literal/identity/type checks', () => {
  const empty = { ...sourceFailure(), error: '' },
    gap = 32768 - Buffer.byteLength(JSON.stringify(empty))
  const raw = { ...empty, error: 'é'.repeat(Math.floor(gap / 2)) + 'x'.repeat(gap % 2) }
  assert.equal(Buffer.byteLength(JSON.stringify(raw)), 32768)
  assert.equal(decodeSourceOwnerFailure(raw, sourceTuple), raw)
  assert.throws(
    () => decodeSourceOwnerFailure({ ...raw, error: raw.error + 'x' }, sourceTuple),
    /Terminal IPC byte cap/,
  )
  assert.throws(
    () =>
      decodeSourceOwnerFailure(
        { ...raw, extra: true, status: 'wrong', error: raw.error + 'x'.repeat(1000) },
        sourceTuple,
      ),
    /Terminal IPC byte cap/,
  )
  const invalid = { ...sourceFailure(), extra: true, admission: 1n }
  assert.throws(() => decodeSourceOwnerFailure(invalid, sourceTuple), TypeError)
})
test('owner failure keeps serialization, key, status, identity, string, count, boolean assertion order', () => {
  const wrongFields = caughtCodec(() =>
    decodeSourceOwnerFailure({ ...sourceFailure(), extra: true, status: 'wrong' }, sourceTuple),
  )
  assert.match(wrongFields.message, /Unexpected evidence fields/)
  const wrongStatus = caughtCodec(() =>
    decodeSourceOwnerFailure({ ...sourceFailure(), status: 'wrong', nonce: 'foreign' }, sourceTuple),
  )
  assert.equal(wrongStatus.actual, 'wrong')
  assert.equal(wrongStatus.expected, 'FAIL_RETENTION_REQUESTED_LIVENESS_UNVERIFIED')
  const wrongIdentity = caughtCodec(() =>
    decodeSourceOwnerFailure(
      { ...sourceFailure(), nonce: 'foreign', phase: 0, actualPromisesRetained: -1, originalCaptured: 1 },
      sourceTuple,
    ),
  )
  assert.equal(wrongIdentity.actual, 'foreign')
  assert.equal(wrongIdentity.expected, 'n')
  const wrongString = caughtCodec(() =>
    decodeSourceOwnerFailure(
      { ...sourceFailure(), phase: 0, actualPromisesRetained: -1, originalCaptured: 1 },
      sourceTuple,
    ),
  )
  assert.equal(wrongString.actual, 'number')
  assert.equal(wrongString.expected, 'string')
})
test('actual final handoff matcher preserves tuple-before-bytes and does not add envelope/result validation', () => {
  assert.equal(assertSourceRetentionHandoffMatch({ ...sourceBinding, extra: true }, sourceBinding), undefined)
  assert.throws(() => assertSourceRetentionHandoffMatch({ ...sourceBinding, resultBytes: 'different' }, sourceBinding))
  assert.throws(
    () =>
      assertSourceRetentionHandoffMatch(
        { ...sourceBinding, nonce: 'foreign', resultBytes: 'different' },
        sourceBinding,
      ),
    /Terminal tuple mismatch: nonce/,
  )
  const opaque = {
    ...sourceBinding,
    get type() {
      assert.fail('unrelated field read')
    },
    toJSON() {
      assert.fail('matcher serialized')
    },
  }
  assert.equal(assertSourceRetentionHandoffMatch(opaque, sourceBinding), undefined)
})

test('callback encoder reads only the original tuple and performs no binding validation or serialization', () => {
  const binding = {
    ...sourceTuple,
    get extra() {
      assert.fail('unrelated extra read')
    },
    toJSON() {
      assert.fail('binding serialized')
    },
  }
  assert.equal(encodeSourceRetentionCallbackCommit(binding), encodeSourceRetentionCallbackCommit(sourceTuple))
})
test('failure count refusal precedes originalCaptured boolean refusal and boolean remains boolean-only', () => {
  const first = caughtCodec(() =>
    decodeSourceOwnerFailure({ ...sourceFailure(), actualPromisesRetained: -1, originalCaptured: 1 }, sourceTuple),
  )
  assert.equal(first.actual, false)
  assert.equal(first.expected, true)
  const second = caughtCodec(() => decodeSourceOwnerFailure({ ...sourceFailure(), originalCaptured: 1 }, sourceTuple))
  assert.equal(second.actual, 'number')
  assert.equal(second.expected, 'boolean')
})
