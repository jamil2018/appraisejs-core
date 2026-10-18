import { externalEffectAttempts } from './fixtures/codex-app-server-m02-ta-matrix-r23-composed/no-external-effects.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  observeR24ErrorLiteral,
  readFixedR24ErrorLiteral,
} from './fixtures/codex-app-server-m02-ta-r24-audit-investigation-01/history-error-literal.mjs'
import { FIXED_HISTORY } from './fixtures/codex-app-server-m02-ta-r24-audit-investigation-01/history-observation.mjs'
import { prepareCodeModeCall } from './fixtures/codex-app-server-m02-ta-codec-r10/codec.mjs'

const plan = prepareCodeModeCall({ caseId: 'B01', index: 0, operation: 'quality_journey_analysis_get', args: {} })
function history(text) {
  return (
    [
      { type: 'turn_context', payload: { approval_policy: 'never' } },
      { type: 'response_item', payload: { ...plan.item, input: plan.script } },
      {
        type: 'response_item',
        payload: {
          type: 'custom_tool_call_output',
          call_id: plan.callId,
          output: [
            { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
            {
              type: 'input_text',
              text: JSON.stringify({
                schema: 'appraise.m02-code-mode-envelope/v1',
                caseId: 'B01',
                index: 0,
                callId: plan.callId,
                operation: plan.operation,
                disposition: 'MCP_RESULT',
                result: { content: [{ type: 'text', text }], isError: true },
              }),
            },
          ],
        },
      },
    ]
      .map(x => JSON.stringify(x))
      .join('\n') + '\n'
  )
}
test('only exact static pinned-source literal matches; origin is never asserted', () => {
  const result = observeR24ErrorLiteral(history('MCP tool call requires approval, but approval policy is never'))
  assert.equal(result.errorTextShape, 'POLICY_NEVER_LITERAL')
  assert.equal(result.turnApprovalPolicy, 'NEVER')
  assert.equal(result.errorOrigin, 'UNATTESTED')
  for (const text of [
    'SYNTHETIC_AUTH_ERROR_SECRET',
    'prefix MCP tool call requires approval, but approval policy is never',
    'MCP tool call requires approval, but approval policy is never suffix',
  ]) {
    const observed = observeR24ErrorLiteral(history(text))
    assert.equal(observed.errorTextShape, 'UNCLASSIFIED')
    assert.equal(JSON.stringify(observed).includes(text), false)
  }
  assert.equal(observeR24ErrorLiteral('bad').status, 'REFUSED')
})
test('fixed reader keeps all IO errors sanitized without reading native history', () => {
  const bytes = Buffer.from(history('user cancelled MCP tool call'))
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
  const dir = { uid: process.getuid(), mode: 0o40700, isDirectory: () => true, isSymbolicLink: () => false }
  const fake = () => ({
    lstatSync: p => (p === FIXED_HISTORY ? file : dir),
    openSync: () => 99,
    fstatSync: () => file,
    readFileSync: () => bytes,
    closeSync() {},
  })
  assert.equal(readFixedR24ErrorLiteral(fake()).errorTextShape, 'APPROVAL_ABORT_LITERAL')
  for (const name of ['lstatSync', 'openSync', 'fstatSync', 'readFileSync', 'closeSync']) {
    const io = fake()
    io[name] = () => {
      throw new Error('SYNTHETIC_SECRET')
    }
    assert.throws(
      () => readFixedR24ErrorLiteral(io),
      error => error.message === 'HISTORY_OBSERVATION_REFUSED',
    )
  }
  assert.deepEqual(externalEffectAttempts, [])
})
