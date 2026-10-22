// Fixed fixture envelopes only. No lifecycle, process, client or database authority.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import path from 'node:path'

const finalPhase = 'OWNER_HANDOFF_SEND_CALLBACK_COMMITTED'
const receiptKeys =
  'case,expectedFixtureSha256,handoffSequence,nonce,ownerScript,phase,pid,terminalSequence,terminalType,type,version'

export function encodeServiceTerminalAck(scope) {
  const acknowledgement = { type: 'terminal-ack', ...scope }
  decodeServiceTerminalAck(acknowledgement, scope)
  assert.ok(Buffer.byteLength(JSON.stringify(acknowledgement)) <= 4096)
  return acknowledgement
}

export function decodeServiceTerminalAck(raw, scope) {
  if (!raw || typeof raw !== 'object') throw new Error('Unexpected fixture terminal acknowledgement')
  if (
    Object.keys(raw).sort().join(',') !== 'case,expectedFixtureSha256,nonce,pid,terminalSequence,terminalType,type' ||
    raw.type !== 'terminal-ack' ||
    raw.case !== scope.case ||
    raw.pid !== scope.pid ||
    raw.nonce !== scope.nonce ||
    raw.terminalType !== scope.terminalType ||
    raw.terminalSequence !== scope.terminalSequence ||
    raw.expectedFixtureSha256 !== scope.expectedFixtureSha256
  )
    throw new Error('Fixture terminal acknowledgement does not match original owner result')
  return raw
}

export function decodeServiceTerminalHandoff(raw, scope) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Object.keys(raw).sort().join(',') !==
      'case,expectedFixtureSha256,nonce,pid,sequence,terminalSequence,terminalType,type' ||
    raw.type !== 'terminal-handoff' ||
    raw.case !== scope.case ||
    raw.pid !== scope.pid ||
    raw.nonce !== scope.nonce ||
    raw.terminalType !== scope.terminalType ||
    raw.terminalSequence !== scope.terminalSequence ||
    raw.expectedFixtureSha256 !== scope.expectedFixtureSha256 ||
    !Number.isSafeInteger(raw.sequence) ||
    Number(raw.sequence) <= scope.terminalSequence
  )
    throw new Error('Original sent handoff does not match terminal callback scope')
  return raw
}

export function assertServiceCallbackReceipt(commit, failure, scope) {
  if (failure !== undefined) {
    assert.ok(failure && typeof failure === 'object', 'Malformed owner failure receipt')
    const value = failure
    assert.equal(value.version, 1, 'Malformed owner failure version')
    assert.equal(value.type, 'failure-retained')
    assert.equal(value.classification, 'UNEXPECTED_FIXTURE_FAILURE')
    for (const key of ['case', 'pid', 'nonce']) assert.equal(value[key], scope[key], 'Foreign owner failure receipt')
    for (const key of ['phase', 'operationPhase', 'message']) assert.equal(typeof value[key], 'string')
    assert.ok(value.referenceSummary && typeof value.referenceSummary === 'object')
    throw new Error(`Owner first failure has terminal precedence: ${String(value.phase)}: ${String(value.message)}`)
  }
  assert.ok(commit && typeof commit === 'object', 'Missing owner callback-commit receipt; terminal remains UNKNOWN')
  const value = commit
  assert.equal(Object.keys(value).sort().join(','), receiptKeys, 'Malformed callback-commit receipt fields')
  assert.equal(value.version, 1)
  assert.equal(value.type, 'owner-terminal-callback-commit')
  assert.equal(value.phase, finalPhase)
  assert.ok(scope.terminalType === 'case-retained' || scope.terminalType === 'case-known-closed')
  assert.ok(Number.isSafeInteger(scope.pid) && scope.pid > 0)
  assert.ok(Number.isSafeInteger(scope.terminalSequence) && scope.terminalSequence > 0)
  assert.ok(Number.isSafeInteger(scope.handoffSequence) && scope.handoffSequence > scope.terminalSequence)
  assert.ok(path.isAbsolute(scope.ownerScript))
  assert.match(scope.nonce, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.match(scope.expectedFixtureSha256, /^[0-9a-f]{64}$/)
  for (const key of Object.keys(scope)) assert.equal(value[key], scope[key], `Foreign callback-commit ${key}`)
  return value
}

const retainedMessageKeys = ['type', 'nonce', 'pid', 'selected', 'resultDigest', 'resultBytes']
const retainedTupleKeys = ['nonce', 'pid', 'selected', 'resultDigest']
function exactKeys(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected evidence object')
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), 'Unexpected evidence fields')
}
function matchTuple(value, expected) {
  for (const key of retainedTupleKeys) assert.equal(value[key], expected[key], 'Terminal tuple mismatch: ' + key)
}
export function createSourceRetentionBinding(identity, resultBytes) {
  assert.equal(typeof resultBytes, 'string')
  const canonical = JSON.stringify({
    nonce: identity.nonce,
    pid: identity.pid,
    selected: identity.selected,
    resultBytes,
  })
  return Object.freeze({ ...identity, resultDigest: createHash('sha256').update(canonical).digest('hex'), resultBytes })
}
function boundedMessage(message) {
  assert(Buffer.byteLength(JSON.stringify(message)) <= 32768, 'Terminal IPC byte cap')
  return message
}
export function decodeSourceRetentionResult(binding) {
  const result = JSON.parse(binding.resultBytes)
  assert.equal(result.status, 'EXPECTED_RETENTION_LIVENESS_UNVERIFIED')
  for (const key of ['nonce', 'pid', 'selected']) assert.equal(result[key], binding[key])
  return result
}
function checkRetainedMessage(message, type, identity) {
  boundedMessage(message)
  exactKeys(message, retainedMessageKeys)
  assert.equal(message.type, type)
  const binding = createSourceRetentionBinding(identity, message.resultBytes)
  matchTuple(message, binding)
  decodeSourceRetentionResult(binding)
  return binding
}

export function decodeSourceRetentionPreliminary(raw, scope) {
  return checkRetainedMessage(raw, 'EXPECTED_RETENTION_PRELIMINARY', scope)
}

export function decodeSourceRetentionHandoff(raw, scope) {
  return checkRetainedMessage(raw, 'EXPECTED_RETENTION_HANDOFF', scope)
}

export function encodeSourceRetentionPreliminary(binding) {
  return boundedMessage({ type: 'EXPECTED_RETENTION_PRELIMINARY', ...binding })
}

export function decodeSourceRetentionAck(message, binding) {
  exactKeys(message, ['type', ...retainedTupleKeys])
  assert.equal(message.type, 'ACK_EXPECTED_RETENTION')
  matchTuple(message, binding)
  return message
}

export function encodeSourceRetentionHandoff(binding) {
  return boundedMessage({ type: 'EXPECTED_RETENTION_HANDOFF', ...binding })
}

export function encodeSourceRetentionCallbackCommit(binding) {
  const { nonce, pid, selected, resultDigest } = binding
  const receipt = {
    version: 1,
    type: 'OWNER_RETENTION_CALLBACK_COMMIT',
    nonce,
    pid,
    selected,
    resultDigest,
    successCallbackObserved: true,
  }
  const bytes = JSON.stringify(receipt) + '\n'
  assert(Buffer.byteLength(bytes) <= 4096)
  return bytes
}

export function decodeSourceRetentionCallbackCommit(receipt, binding) {
  exactKeys(receipt, ['version', 'type', ...retainedTupleKeys, 'successCallbackObserved'])
  assert.equal(receipt.version, 1)
  assert.equal(receipt.type, 'OWNER_RETENTION_CALLBACK_COMMIT')
  assert.equal(receipt.successCallbackObserved, true)
  matchTuple(receipt, binding)
  return receipt
}

export function decodeSourceOwnerFailure(message, identity) {
  boundedMessage(message)
  const required = [
    'status',
    'pid',
    'selected',
    'nonce',
    'phase',
    'actualPromisesRetained',
    'passiveReferencesRetained',
    'originalCaptured',
    'error',
  ]
  exactKeys(message, Object.hasOwn(message, 'admission') ? [...required, 'admission'] : required)
  assert.equal(message.status, 'FAIL_RETENTION_REQUESTED_LIVENESS_UNVERIFIED')
  for (const key of ['nonce', 'pid', 'selected']) assert.equal(message[key], identity[key])
  for (const key of ['phase', 'error']) assert.equal(typeof message[key], 'string')
  for (const key of ['actualPromisesRetained', 'passiveReferencesRetained'])
    assert(Number.isSafeInteger(message[key]) && message[key] >= 0)
  assert.equal(typeof message.originalCaptured, 'boolean')
  return message
}

export function assertSourceRetentionHandoffMatch(final, binding) {
  matchTuple(final, binding)
  assert.equal(final.resultBytes, binding.resultBytes)
}
