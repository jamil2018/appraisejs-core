import assert from 'node:assert/strict'
import test from 'node:test'
import { retainDiagnosticFailure } from './fixture-diagnostic-failures.mjs'

test('secondary collector retains original objects up to the caller existing bound', () => {
  const errors = [],
    original = new Error('original')
  retainDiagnosticFailure(errors, original, 2)
  retainDiagnosticFailure(errors, undefined, 2)
  retainDiagnosticFailure(errors, 'overflow', 2)
  assert.equal(errors[0], original)
  assert.deepEqual(errors, [original, undefined])
})

test('failed length, push and frozen storage remain nonthrowing without changing first cause', () => {
  const cause = new Error('first'),
    state = { cause }
  for (const errors of [
    Object.freeze([]),
    {
      get length() {
        throw new Error('length')
      },
    },
    {
      length: 0,
      push() {
        throw new Error('push')
      },
    },
  ]) {
    assert.doesNotThrow(() => retainDiagnosticFailure(errors, cause, 32))
    assert.equal(state.cause, cause)
  }
})
