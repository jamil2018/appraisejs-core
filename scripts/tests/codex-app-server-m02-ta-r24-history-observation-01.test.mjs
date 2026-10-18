import { externalEffectAttempts } from './fixtures/codex-app-server-m02-ta-matrix-r23-composed/no-external-effects.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  observeR24History,
  readFixedR24History,
  FIXED_HISTORY,
} from './fixtures/codex-app-server-m02-ta-r24-audit-investigation-01/history-observation.mjs'
import { prepareCodeModeCall } from './fixtures/codex-app-server-m02-ta-codec-r10/codec.mjs'

const plan = prepareCodeModeCall({ caseId: 'B01', index: 0, operation: 'quality_journey_analysis_get', args: {} })
function history(result, transform = items => items) {
  const payload = {
    schema: 'appraise.m02-code-mode-envelope/v1',
    caseId: 'B01',
    index: 0,
    callId: plan.callId,
    operation: plan.operation,
    disposition: 'MCP_RESULT',
    result,
  }
  const items = [
    { ...plan.item, input: plan.script },
    {
      type: 'custom_tool_call_output',
      call_id: plan.callId,
      output: [
        { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
        { type: 'input_text', text: JSON.stringify(payload) },
      ],
    },
  ]
  return (
    transform(items)
      .map(payload => JSON.stringify({ type: 'response_item', payload }))
      .join('\n') + '\n'
  )
}

test('fixed categories classify correlated result without returning synthetic secret/error text', () => {
  const secret = 'SYNTHETIC_PROVIDER_ACCOUNT_AUTH_SENTINEL'
  const result = observeR24History(history({ content: [{ type: 'text', text: secret }], isError: true }))
  assert.equal(result.status, 'OBSERVED')
  assert.equal(result.outputStatus, 'COMPLETED')
  assert.equal(result.envelopeCorrelation, 'EXACT')
  assert.equal(result.isError, 'TRUE')
  assert.equal(result.contentShape, 'TEXT_ONLY')
  assert.equal(JSON.stringify(result).includes(secret), false)
  assert.deepEqual(externalEffectAttempts, [])
})

test('unmatched, duplicate, foreign-script and malformed histories remain refused', () => {
  for (const source of [
    '',
    '{}',
    '{"type":1,"type":2}\n',
    'x'.repeat(1024 * 1024 + 1),
    history({}, items => [...items, items[1]]),
    history({}, items => items.slice(1)),
    history({}, items => {
      items[0].input = 'foreign'
      return items
    }),
  ])
    assert.equal(observeR24History(source).status, 'REFUSED')
})

test('unknown containers and nested shapes remain fixed observations rather than acceptance', () => {
  for (const [nested, expected] of [
    [null, 'NULL'],
    [[], 'ARRAY'],
    ['sentinel', 'STRING'],
    [true, 'SCALAR'],
  ]) {
    const result = observeR24History(history(nested))
    assert.equal(result.resultShape, expected)
    assert.equal(result.isError, 'UNAVAILABLE')
  }
  const result = observeR24History(
    history({}, items => {
      items[1].output = 'SYNTHETIC_SECRET'
      return items
    }),
  )
  assert.equal(result.outputShape, 'STRING')
  assert.equal(result.envelopeCorrelation, 'UNAVAILABLE')
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_SECRET'), false)
})

test('every injected IO failure including ancestry, open, read and close has a fixed safe error', () => {
  const secret = 'SYNTHETIC_AUTH_PATH_ERROR_SENTINEL'
  const bytes = Buffer.from(history({ content: [], isError: false }))
  const file = {
    uid: process.getuid(),
    mode: 0o100600,
    nlink: 1,
    size: bytes.length,
    dev: 1,
    ino: 2,
    mtimeMs: 3,
    isFile: () => true,
    isSymbolicLink: () => false,
  }
  const directory = { uid: process.getuid(), mode: 0o40700, isDirectory: () => true, isSymbolicLink: () => false }
  const fake = () => ({
    lstatSync: path => (path === FIXED_HISTORY ? file : directory),
    openSync: () => 99,
    fstatSync: () => file,
    readFileSync: () => bytes,
    closeSync() {},
  })
  assert.equal(readFixedR24History(fake()).status, 'OBSERVED')
  for (const method of ['lstatSync', 'openSync', 'fstatSync', 'readFileSync', 'closeSync']) {
    const io = fake()
    io[method] = () => {
      throw new Error(secret)
    }
    assert.throws(
      () => readFixedR24History(io),
      error => {
        assert.equal(error.message, 'HISTORY_OBSERVATION_REFUSED')
        assert.equal(String(error).includes(secret), false)
        return true
      },
    )
  }
  assert.deepEqual(externalEffectAttempts, [])
})
