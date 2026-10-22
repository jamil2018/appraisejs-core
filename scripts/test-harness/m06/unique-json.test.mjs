import assert from 'node:assert/strict'
import test from 'node:test'
import { parseUniqueJson } from './unique-json.mjs'

test('actual parser preserves valid JSON scalars, Unicode, nesting and key-like strings', () => {
  for (const value of [null, true, 42, 'é', ['"x":', { x: 1 }], { a: [{ a: 2 }], b: '{}[]' }]) {
    const text = JSON.stringify(value)
    assert.deepEqual(parseUniqueJson(text), JSON.parse(text))
  }
})

test('actual parser refuses duplicate and escaped-equivalent keys at every nesting level', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '[{"x":{"é":1,"é":2}}]'])
    assert.throws(() => parseUniqueJson(text), /Duplicate JSON field/)
  for (const text of ['{', '{"a":}', '[1,]', 'undefined', '{"a":1} extra'])
    assert.throws(() => parseUniqueJson(text), SyntaxError)
})
