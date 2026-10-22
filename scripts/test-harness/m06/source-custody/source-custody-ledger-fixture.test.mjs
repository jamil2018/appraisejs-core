// Actual inert data-population helper; fake DB records calls and never opens SQLite.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { corruptLedger } from './source-custody-ledger-fixture.mjs'

const sql = [
  'DROP TABLE QualityJourneyProviderSourceLedgerRecord; CREATE TABLE QualityJourneyProviderSourceLedgerRecord(sourceId,sequence,previousHead,head,kind,dataJson,byteCount)',
  'INSERT INTO QualityJourneyProviderSourceLedgerRecord VALUES(?,?,?,?,?,?,?)',
]
function recorder(throwAt, error) {
  const calls = []
  const record = (operation, args) => {
    calls.push([operation, ...args])
    if (calls.length === throwAt) throw error
  }
  return {
    calls,
    db: {
      exec(...args) {
        record('exec', args)
      },
      prepare(...args) {
        record('prepare', args)
        return { run: (...values) => record('run', values) }
      },
    },
  }
}
const initialTrace = () => [
  ['exec', sql[0]],
  ['prepare', sql[1]],
]
test('ledger count preserves all 1025 rows and sequence endpoints', () => {
  const { db, calls } = recorder()
  assert.equal(corruptLedger(db, 'ledger-count'), undefined)
  assert.deepEqual(calls, [
    ...initialTrace(),
    ...Array.from({ length: 1025 }, (_, i) => ['run', 'corrupt', i + 1, 'p', 'h', 'CREATED', '{}', 1]),
  ])
})
for (const selected of ['ledger-utf8', 'ledger-null-utf8']) {
  test(selected + ' preserves the complete Unicode value and null policy', () => {
    const { db, calls } = recorder()
    corruptLedger(db, selected)
    assert.deepEqual(calls, [
      ...initialTrace(),
      ['run', 'corrupt', 1, selected === 'ledger-null-utf8' ? null : 'p', 'h', 'CREATED', 'é'.repeat(600_000), 1],
    ])
    assert.equal(calls[2][6].length, 600_000)
    assert.equal(Buffer.byteLength(calls[2][6]), 1_200_000)
  })
}
test('ledger type preserves the actual typed byte value', () => {
  const { db, calls } = recorder()
  corruptLedger(db, 'ledger-type')
  assert.deepEqual(calls, [...initialTrace(), ['run', 'corrupt', 1, new Uint8Array([0, 1]), 'h', 'CREATED', '{}', 1]])
  assert(calls[2][3] instanceof Uint8Array)
})
test('unknown selector throws only after the original exec and prepare', () => {
  const { db, calls } = recorder()
  assert.throws(() => corruptLedger(db, 'foreign'), { message: 'Unknown malformed ledger fixture' })
  assert.deepEqual(calls, initialTrace())
})
for (const [operation, position] of [
  ['exec', 1],
  ['prepare', 2],
  ['run', 3],
  ['later run', 4],
]) {
  test(operation + ' exception retains the original cause and stops immediately', () => {
    const first = new Error(operation),
      { db, calls } = recorder(position, first)
    assert.throws(
      () => corruptLedger(db, 'ledger-count'),
      error => error === first,
    )
    assert.equal(calls.length, position)
    assert.deepEqual(calls.slice(0, Math.min(position, 2)), initialTrace().slice(0, Math.min(position, 2)))
    if (position > 2)
      assert.deepEqual(
        calls.slice(2),
        [1, 2].slice(0, position - 2).map(n => ['run', 'corrupt', n, 'p', 'h', 'CREATED', '{}', 1]),
      )
  })
}
