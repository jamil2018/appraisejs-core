import { externalEffectAttempts } from './fixtures/codex-app-server-m02-ta-matrix-r23-composed/no-external-effects.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareCodeModeCall, digest } from './fixtures/codex-app-server-m02-ta-codec-r10/codec.mjs'
import { decodeWithOfflineDiagnostic } from './fixtures/codex-app-server-m02-ta-r23-investigation-01/diagnostic.mjs'

function fixture() {
  const planned = prepareCodeModeCall({ caseId: 'B01', index: 0, operation: 'quality_journey_analysis_get', args: {} })
  const result = { content: [{ type: 'text', text: '{"synthetic":true}' }] }
  const envelope = {
    schema: 'appraise.m02-code-mode-envelope/v1',
    caseId: 'B01',
    index: 0,
    callId: planned.callId,
    operation: planned.operation,
    disposition: 'MCP_RESULT',
    result,
  }
  return {
    planned,
    input: [
      {
        type: 'custom_tool_call_output',
        call_id: planned.callId,
        output: [
          { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
          { type: 'input_text', text: JSON.stringify(envelope) },
        ],
      },
    ],
    audit: [
      {
        callId: planned.callId,
        normalizedName: planned.normalizedName,
        id: 'synthetic-rpc',
        operation: planned.operation,
        argumentsHash: digest({}),
        complete: true,
        result,
      },
    ],
  }
}
const scenarios = [
  [
    'PLAN',
    value => {
      value.planned = { ...value.planned }
    },
  ],
  [
    'OUTER_CORRELATION',
    value => {
      value.input[0].call_id = 'foreign'
    },
  ],
  [
    'OUTPUT_SHAPE',
    value => {
      value.input[0].output = 'sensitive-untrusted-text'
    },
  ],
  [
    'COMPLETION_HEADER',
    value => {
      value.input[0].output[0].text = 'sensitive-untrusted-text'
    },
  ],
  [
    'ENVELOPE',
    value => {
      value.input[0].output[1].text = 'sensitive-untrusted-text'
    },
  ],
  [
    'AUDIT',
    value => {
      value.audit = []
    },
  ],
  [
    'NESTED_RESULT',
    value => {
      value.audit[0].result = {}
    },
  ],
]
for (const [category, mutate] of scenarios)
  test(`offline diagnostic emits only fixed ${category} and preserves refusal`, () => {
    const value = fixture(),
      observed = []
    mutate(value)
    let original
    assert.throws(
      () => decodeWithOfflineDiagnostic(value, receipt => observed.push(receipt)),
      error => {
        original = error
        return error.message.startsWith('M02_CODEC_')
      },
    )
    assert.deepEqual(observed, [
      { schema: 'appraise.m02-offline-continuation-diagnostic/v1', component: 'R10_CODEC', category },
    ])
    assert.throws(
      () =>
        decodeWithOfflineDiagnostic(value, () => {
          throw new Error('untrusted callback')
        }),
      error => error.message === original.message,
    )
    assert.equal(JSON.stringify(observed).includes('sensitive-untrusted-text'), false)
  })
test('valid result stays accepted with zero diagnostic callbacks; top-level MCP _meta is projected out', () => {
  const value = fixture()
  value.audit[0].result._meta = { syntheticPrivateMetadata: true }
  assert.equal(
    decodeWithOfflineDiagnostic(value, () => assert.fail('unexpected diagnostic')).status,
    'RESULT_CORRELATED',
  )
  assert.deepEqual(externalEffectAttempts, [])
})
