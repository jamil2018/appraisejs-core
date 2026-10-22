// Complete pure source fault proofs against explicitly synthetic JSON protocol records.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  sourceFaultPublicationReady,
  validateSourceFaultReferenceProof,
  validateSourceCleanupReadyProof,
  validateSourceReserveControlledProof,
  validateSourceFaultRawRows,
  validateSourceFaultObservation,
} from './source-custody-ipc-fault.mjs'
const inputs = JSON.parse(readFileSync(new URL('./source-custody-fault-proof-fixtures.json', import.meta.url)))
const fixture = selector => structuredClone(inputs[selector])
const validate = input => validateSourceFaultObservation(input.observed, input.identity, input.armed, input.receipt)
for (const selector of Object.keys(inputs)) {
  test(selector + ' actual full proof preserves original return and common reference object', () => {
    const input = fixture(selector)
    assert.equal(
      validateSourceFaultReferenceProof(input.observed, input.identity, input.armed, input.receipt),
      input.observed.rows,
    )
    assert.equal(validate(input), input.observed)
    if (selector === 'ipc-cleanup-ready') validateSourceCleanupReadyProof(input.observed, input.observed.rows)
    else {
      validateSourceReserveControlledProof(input.observed, input.observed.rows)
      validateSourceFaultRawRows(input.observed)
    }
  })
  for (const container of ['observed', 'armed', 'receipt', 'rows']) {
    const value =
      container === 'receipt'
        ? inputs[selector].receipt.value
        : container === 'rows'
          ? inputs[selector].observed.rows
          : inputs[selector][container]
    for (const key of Object.keys(value)) {
      test(selector + ' complete proof refuses missing ' + container + '.' + key, () => {
        const input = fixture(selector),
          target =
            container === 'receipt'
              ? input.receipt.value
              : container === 'rows'
                ? input.observed.rows
                : input[container]
        delete target[key]
        assert.throws(() => validate(input))
      })
    }
  }
  for (const [before, after] of [
    ['waiter', 'invoked'],
    ['invoked', 'lost'],
    ['lost', 'actualEvent'],
    ['actualEvent', 'receipt'],
    ['receipt', 'release'],
    ['release', 'gateObserved'],
    ['gateObserved', 'entered'],
    ['entered', 'fenced'],
  ]) {
    test(selector + ' refuses causal release edge ' + before + '<' + after, () => {
      const input = fixture(selector)
      input.observed.rows[before] = input.observed.rows[after]
      assert.throws(() => validate(input))
    })
  }
  for (const key of [
    'pid',
    'nonce',
    'faultSelector',
    selector === 'ipc-cleanup-ready' ? 'selectedLabel' : 'selected',
  ]) {
    test(selector + ' refuses foreign observed/armed/receipt identity ' + key, () => {
      for (const container of ['observed', 'armed', 'receipt']) {
        const input = fixture(selector),
          target = container === 'receipt' ? input.receipt.value : input[container]
        target[key] = 'foreign'
        assert.throws(() => validate(input))
      }
    })
  }
  for (const [key, value] of [
    ['originalCaptured', false],
    ['firstCause', false],
    ['passiveIncomplete', true],
    ['cleanupRequests', 1],
    ['fixtureAdmissionsAfterFailure', 1],
    ['fixtureReferencesAfterFailure', 1],
    ['receiptDigest', 'foreign'],
  ]) {
    test(selector + ' refuses complete evidence obligation ' + key, () => {
      const input = fixture(selector)
      input.observed[key] = value
      assert.throws(() => validate(input))
    })
  }
  test(selector + ' readiness keeps original one-shot/common gates and each selected obligation', () => {
    const input = fixture(selector),
      rows = input.observed.rows
    rows.published = false
    assert.equal(sourceFaultPublicationReady(selector, rows), true)
    const blocked = { published: true, invalid: 'incomplete', fenced: 0, release: 0, gateObserved: 0 }
    for (const [key, value] of Object.entries(blocked))
      assert.equal(sourceFaultPublicationReady(selector, { ...rows, [key]: value }), false)
    const obligations =
      selector === 'ipc-cleanup-ready'
        ? ['readyFulfilled']
        : ['callbackFulfilled', 'suppressed', 'controlledFulfilled', 'outerFulfilled', 'rootFulfilled', 'sameValue']
    for (const key of obligations) assert.equal(sourceFaultPublicationReady(selector, { ...rows, [key]: false }), false)
    if (selector === 'ipc-reserve-controlled')
      assert.equal(sourceFaultPublicationReady(selector, { ...rows, postRawCount: 5 }), false)
  })
}
test('actual complete cleanup proof refuses raw continuation and missing ready fulfillment', () => {
  const input = fixture('ipc-cleanup-ready')
  input.observed.postFailureRaw.push({})
  input.observed.rows.postRawCount = 1
  assert.throws(() => validate(input))
  assert.throws(() => validateSourceCleanupReadyProof(input.observed, input.observed.rows))
  input.observed.postFailureRaw.length = 0
  input.observed.rows.postRawCount = 0
  input.observed.rows.readyFulfilled = false
  assert.throws(() => validate(input))
})
for (const key of [
  'callbackFulfilled',
  'suppressed',
  'controlledFulfilled',
  'outerFulfilled',
  'rootFulfilled',
  'sameValue',
]) {
  test('actual complete reserve proof refuses causal obligation ' + key, () => {
    const input = fixture('ipc-reserve-controlled')
    input.observed.rows[key] = false
    assert.throws(() => validate(input))
    assert.throws(() => validateSourceReserveControlledProof(input.observed, input.observed.rows))
  })
}
for (const count of [5, 6, 7, 8]) {
  test('actual reserve complete proof preserves original raw count bound ' + count, () => {
    const input = fixture('ipc-reserve-controlled'),
      rows = input.observed.postFailureRaw
    while (rows.length < count) rows.push({ ...rows[0], passiveCell: rows.length })
    rows.length = count
    input.observed.rows.postRawCount = count
    if (count === 6 || count === 7) assert.equal(validate(input), input.observed)
    else assert.throws(() => validate(input))
  })
}
const rawMutations = [
  ['admission', 99],
  ['phase', 'foreign'],
  ['genuineTx', false],
  ['failedAtEntry', false],
  ['failedAtCapture', false],
  ['passiveCell', -1],
  ['passiveCell', 2048],
  ['passiveCell', 0.5],
]
for (const [key, value] of rawMutations) {
  test('actual original raw-row binding refuses ' + key + '=' + value, () => {
    const input = fixture('ipc-reserve-controlled')
    input.observed.postFailureRaw[0][key] = value
    assert.throws(() => validateSourceFaultRawRows(input.observed))
    assert.throws(() => validate(input))
  })
}
for (const key of Object.keys(inputs['ipc-reserve-controlled'].observed.postFailureRaw[0])) {
  test('actual raw-row binding refuses missing own field ' + key, () => {
    const input = fixture('ipc-reserve-controlled')
    delete input.observed.postFailureRaw[0][key]
    assert.throws(() => validateSourceFaultRawRows(input.observed))
  })
}
test('fixed proof/readiness refuses foreign selectors while preserving existing non-authority descriptive fields', () => {
  assert.throws(() =>
    sourceFaultPublicationReady('foreign', { published: false, fenced: 1, release: 1, gateObserved: 1 }),
  )
  const input = fixture('ipc-reserve-controlled')
  input.observed.claim = 'OTHER_DESCRIPTOR'
  input.observed.postFailureRaw[0].site = 'ORIGINAL_UNCHECKED_LABEL'
  assert.equal(validate(input), input.observed)
})
