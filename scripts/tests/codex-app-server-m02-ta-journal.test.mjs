import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DurableTrustedJournal } from './fixtures/codex-app-server-m02-ta/journal.mjs'
import { POLICY } from './fixtures/codex-app-server-m02-ta/policy.mjs'

const outerCeilings = Object.fromEntries(
  POLICY.cases.map(item => [item.id, item.limits.scopedCalls || (item.phase === 'T3' ? 1 : 0)]),
)
const eraseKnown = journal => {
  const root = journal.root
  assert.equal(journal.snapshot().unknown, false)
  journal.close()
  fs.rmSync(root, { recursive: true, force: true })
}

test('fsynced reservations survive reopen but active-case dispatch cannot resume', () => {
  let journal = DurableTrustedJournal.create({ outerCeilings })
  const root = journal.root
  assert.equal(fs.statSync(root).mode & 0o777, 0o700)
  assert.equal(fs.statSync(path.join(root, 'journal.jsonl')).mode & 0o777, 0o600)
  journal.begin('T1')
  journal.reserve('threadStarts', 'thread-1')
  journal.acknowledge('thread-1')
  assert.throws(() => journal.reserve('outerCalls', 'outer-1'), /ceiling/)
  assert.throws(() => journal.reserve('threadStarts', 'thread-2'), /ceiling/)
  journal.close()
  journal = DurableTrustedJournal.open(root)
  assert.equal(journal.snapshot().counts.threadStarts, 1)
  assert.equal(journal.snapshot().unknown, false)
  assert.equal(journal.snapshot().fenced, true)
  assert.equal(journal.snapshot().reason, 'restart-not-authorized')
  assert.throws(() => journal.finish({ outcome: 'capture', cleanupKnown: true }), /restart not authorized/)
  journal.close()
})

test('between-case reopen is inspection-only and preserves consumed counters', () => {
  let journal = DurableTrustedJournal.create()
  journal.begin('T1')
  journal.reserve('threadStarts', 'thread-1')
  journal.acknowledge('thread-1')
  journal.finish({ outcome: 'capture', cleanupKnown: true })
  const root = journal.root
  journal.close()
  journal = DurableTrustedJournal.open(root)
  assert.equal(journal.snapshot().index, 1)
  assert.equal(journal.snapshot().counts.threadStarts, 1)
  assert.equal(journal.snapshot().fenced, true)
  assert.equal(journal.snapshot().unknown, false)
  assert.throws(() => journal.begin('B01'), /restart not authorized/)
  journal.close()
})

test('pending reservation on reopen fences the full campaign without replay', () => {
  const journal = DurableTrustedJournal.create()
  journal.begin('T1')
  journal.reserve('providerRequests', 'possibly-sent')
  const root = journal.root
  journal.close()
  const reopened = DurableTrustedJournal.open(root)
  assert.equal(reopened.snapshot().unknown, true)
  assert.equal(reopened.snapshot().counts.providerRequests, 1)
  assert.throws(() => reopened.acknowledge('possibly-sent'), /fenced unknown/)
  assert.throws(() => reopened.finish({ outcome: 'capture', cleanupKnown: true }), /fenced unknown/)
  reopened.close()
})

test('a partial crash tail is detected and never truncated or extended', () => {
  const journal = DurableTrustedJournal.create()
  const root = journal.root
  journal.close()
  const file = path.join(root, 'journal.jsonl')
  fs.appendFileSync(file, '{"seq":2')
  const length = fs.statSync(file).size
  const reopened = DurableTrustedJournal.open(root)
  assert.equal(reopened.snapshot().unknown, true)
  assert.match(reopened.snapshot().reason, /partial/)
  assert.throws(() => reopened.begin('T1'), /read-only/)
  assert.throws(() => reopened.recordRecovery({ id: 'stop-1', action: 'owned-stop-intent' }), /read-only/)
  assert.equal(fs.statSync(file).size, length)
  reopened.close()
})

test('a replaced file is refused before the next reservation', () => {
  const journal = DurableTrustedJournal.create()
  const file = path.join(journal.root, 'journal.jsonl')
  const moved = path.join(journal.root, 'old-journal')
  fs.renameSync(file, moved)
  fs.copyFileSync(moved, file)
  fs.chmodSync(file, 0o600)
  assert.throws(() => journal.begin('T1'), /identity/)
  journal.close()
})

test('outer calls are blocked without a reviewed per-case ceiling', () => {
  const journal = DurableTrustedJournal.create()
  journal.begin('T1')
  journal.finish({ outcome: 'capture', cleanupKnown: true })
  journal.begin('B01')
  assert.throws(() => journal.reserve('outerCalls', 'outer-1'), /blocked/)
  eraseKnown(journal)
})

test('expected outcomes require correlated acknowledgement and known cleanup', () => {
  const journal = DurableTrustedJournal.create()
  journal.begin('T1')
  assert.throws(() => journal.finish({ outcome: 'accepted', cleanupKnown: true }), /cannot finish/)
  assert.throws(() => journal.finish({ outcome: 'capture', cleanupKnown: false }), /cannot finish/)
  journal.finish({ outcome: 'capture', cleanupKnown: true })
  journal.begin('B01')
  assert.throws(() => journal.finish({ outcome: 'accepted', cleanupKnown: true }), /acknowledged/)
  journal.reserve('scopedCalls', 'call-1')
  assert.throws(() => journal.finish({ outcome: 'accepted', cleanupKnown: true }), /cannot finish/)
  journal.acknowledge('call-1')
  journal.finish({ outcome: 'accepted', cleanupKnown: true })
  eraseKnown(journal)
})

test('reopen refuses a same-content replacement with a new inode', () => {
  const journal = DurableTrustedJournal.create()
  const root = journal.root
  const file = path.join(root, 'journal.jsonl')
  journal.close()
  fs.renameSync(file, path.join(root, 'original-journal'))
  fs.copyFileSync(path.join(root, 'original-journal'), file)
  fs.chmodSync(file, 0o600)
  assert.throws(() => DurableTrustedJournal.open(root), /initialization missing or corrupt/)
})

test('zero-byte write and fsync failure consume attempted reservations and fence', () => {
  for (const failure of ['zero-write', 'fsync']) {
    const journal = DurableTrustedJournal.create()
    journal.begin('T1')
    if (failure === 'zero-write') journal._writeSync = () => 0
    else
      journal._fsyncSync = () => {
        throw new Error('injected fsync failure')
      }
    assert.throws(
      () => journal.reserve('providerRequests', `request-${failure}`),
      /did not advance|injected fsync failure/,
    )
    assert.equal(journal.snapshot().counts.providerRequests, 1)
    assert.equal(journal.snapshot().fenced, true)
    assert.throws(() => journal.reserve('providerRequests', 'retry'), /read-only/)
    assert.throws(
      () => journal.recordRecovery({ id: 'stop-after-flush-failure', action: 'owned-stop-intent' }),
      /read-only/,
    )
    journal.close()
  }
})

test('reopen without a clean-close checkpoint stays fenced', () => {
  const journal = DurableTrustedJournal.create()
  const concurrent = DurableTrustedJournal.open(journal.root)
  assert.equal(concurrent.snapshot().fenced, true)
  assert.equal(concurrent.snapshot().reason, 'missing-clean-close-checkpoint')
  concurrent.close()
  journal.close()
})

test('outer ceilings cannot exceed the reviewed per-case tool actions', () => {
  for (const [id, excess] of [
    ['T1', 1],
    ['B01', 4],
    ['B07-A01', 2],
    ['P00', 1],
    ['B14', 1],
    ['N01', 2],
  ]) {
    assert.throws(
      () => DurableTrustedJournal.create({ outerCeilings: { ...outerCeilings, [id]: excess } }),
      /invalid outer-call ceiling/,
      id,
    )
  }
})

test('reviewed outer calls can be reserved only in an eligible active case', () => {
  const journal = DurableTrustedJournal.create({ outerCeilings })
  journal.begin('T1')
  assert.throws(() => journal.reserve('outerCalls', 'descriptor-call'), /ceiling/)
  journal.finish({ outcome: 'capture', cleanupKnown: true })
  journal.begin('B01')
  journal.reserve('outerCalls', 'scoped-wrapper-call')
  journal.acknowledge('scoped-wrapper-call')
  assert.equal(journal.snapshot().caseCounts.B01.outerCalls, 1)
  eraseKnown(journal)
})

test('owned-stop recovery records remain durable after UNKNOWN without acknowledging an intent', () => {
  let journal = DurableTrustedJournal.create()
  journal.begin('T1')
  journal.reserve('codexStarts', 'codex-start-1')
  journal.markUnknown('lost-start-ack')
  const before = journal.snapshot()
  journal.recordRecovery({ id: 'codex-stop-intent-1', action: 'owned-stop-intent' })
  journal.recordRecovery({ id: 'codex-stop-observed-1', action: 'owned-stop-observed' })
  assert.throws(() => journal.recordRecovery({ id: 'codex-stop-intent-1', action: 'owned-stop-intent' }), /duplicate/)
  assert.throws(() => journal.recordRecovery({ id: 'invalid-action', action: 'signal-pid' }), /unknown recovery action/)
  const root = journal.root
  journal.close()
  journal = DurableTrustedJournal.open(root)
  const after = journal.snapshot()
  assert.equal(after.fenced, true)
  assert.equal(after.unknown, true)
  assert.equal(after.current, before.current)
  assert.equal(after.index, before.index)
  assert.deepEqual(after.counts, before.counts)
  assert.deepEqual(after.pending, before.pending)
  assert.deepEqual(after.recovery, [
    { id: 'codex-stop-intent-1', action: 'owned-stop-intent' },
    { id: 'codex-stop-observed-1', action: 'owned-stop-observed' },
  ])
  assert.throws(() => journal.acknowledge('codex-start-1'), /fenced unknown/)
  assert.throws(() => journal.begin('B01'), /fenced unknown/)
  journal.close()
})

test('recovery-fenced reopen permits only bounded owned-stop records', () => {
  let journal = DurableTrustedJournal.create()
  journal.begin('T1')
  journal.finish({ outcome: 'capture', cleanupKnown: true })
  const root = journal.root
  journal.close()
  journal = DurableTrustedJournal.open(root)
  assert.equal(journal.snapshot().unknown, false)
  for (let i = 0; i < POLICY.cases.length * 2; i++)
    journal.recordRecovery({ id: `owned-stop-${i}`, action: 'owned-stop-intent' })
  assert.throws(() => journal.recordRecovery({ id: 'owned-stop-over-limit', action: 'owned-stop-intent' }), /ceiling/)
  journal.close()
  journal = DurableTrustedJournal.open(root)
  assert.equal(journal.snapshot().unknown, false)
  assert.equal(journal.snapshot().fenced, true)
  assert.equal(journal.snapshot().recovery.length, POLICY.cases.length * 2)
  assert.throws(() => journal.begin('B01'), /restart not authorized/)
  journal.close()
})
