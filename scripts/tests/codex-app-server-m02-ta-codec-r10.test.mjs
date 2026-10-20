import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {
  prepareCodeModeCall,
  decodeCodeModeContinuation,
  digest,
} from './fixtures/codex-app-server-m02-ta-codec-r10/codec.mjs'

const options = { caseId: 'B01', index: 0, operation: 'quality_journey_analysis_get', args: {} }
const result = { content: [{ type: 'text', text: '{"ok":true}' }], structuredContent: { ok: true }, isError: false }
const audit = [
  {
    id: 'native-mcp-request-1',
    callId: 'm02_B01_0',
    normalizedName: 'mcp__appraise_m02__quality_journey_analysis_get',
    operation: options.operation,
    argumentsHash: digest({}),
    complete: true,
    result: { ...result, _meta: { private: true } },
  },
]
const header = 'Script completed\nWall time 0.1 seconds\nOutput:\n'
function continuation(planned, envelopeResult = result, headerText = header) {
  return [
    {
      type: 'custom_tool_call_output',
      call_id: planned.callId,
      output: [
        { type: 'input_text', text: headerText },
        {
          type: 'input_text',
          text: JSON.stringify({
            schema: 'appraise.m02-code-mode-envelope/v1',
            caseId: planned.caseId,
            index: planned.index,
            callId: planned.callId,
            operation: planned.operation,
            disposition: planned.rejection ? 'CODE_MODE_REGISTRY_ABSENT' : 'MCP_RESULT',
            result: envelopeResult,
          }),
        },
      ],
    },
  ]
}
test('script awaits exactly one named mock tool and retains its full result', async () => {
  const planned = prepareCodeModeCall(options)
  const calls = [],
    outputs = []
  const context = vm.createContext({
    ALL_TOOLS: [{ name: planned.normalizedName, description: 'synthetic' }],
    tools: {
      [planned.normalizedName]: async args => {
        calls.push(args)
        return result
      },
    },
    text: value => outputs.push(value),
  })
  await vm.runInContext(`(async()=>{${planned.script}\n})()`, context, { timeout: 1000 })
  assert.equal(calls.length, 1)
  assert.equal(outputs.length, 1)
  assert.deepEqual(JSON.parse(outputs[0]).result, result)
  assert.equal(planned.item.type, 'custom_tool_call')
  assert.equal(planned.item.name, 'exec')
  assert.equal(planned.item.namespace, 'functions')
  assert.equal(decodeCodeModeContinuation({ input: continuation(planned), planned, audit }).status, 'RESULT_CORRELATED')
})
test('argument strings remain data and unavailable routes perform no call', async () => {
  const planned = prepareCodeModeCall({ ...options, args: { text: '"}); tools.bad(); //\n` ${bad}' } })
  let called = 0
  const context = vm.createContext({
    ALL_TOOLS: [],
    tools: {
      bad: () => {
        called++
      },
    },
    text: () => {
      called++
    },
  })
  await assert.rejects(vm.runInContext(`(async()=>{${planned.script}\n})()`, context), /M02_ROUTE_UNAVAILABLE/)
  assert.equal(called, 0)
})
test('registry absence is distinct from an MCP endpoint error', async () => {
  const planned = prepareCodeModeCall({
    caseId: 'B07-A09',
    index: 0,
    operation: 'quality_journey_analysis_answer',
    args: {},
    rejection: true,
  })
  const outputs = []
  await vm.runInNewContext(`(async()=>{${planned.script}\n})()`, {
    ALL_TOOLS: [],
    tools: {},
    text: value => outputs.push(value),
  })
  assert.equal(outputs.length, 1)
  const decoded = decodeCodeModeContinuation({ input: continuation(planned, null), planned, audit: [] })
  assert.equal(decoded.status, 'NO_MCP_DISPATCH')
  assert.equal(decoded.scopedDispatches, 0)
  assert.equal(decoded.endpointError, 'NOT_OBSERVED')
  assert.throws(
    () => decodeCodeModeContinuation({ input: continuation(planned, null), planned, audit }),
    /ABSENCE_DISPATCHED/,
  )
  assert.throws(
    () =>
      prepareCodeModeCall({ caseId: 'B07-A09', index: 0, operation: 'quality_journey_get', args: {}, rejection: true }),
    /REJECTION_OPERATION/,
  )
})
test('every call and nested result must correlate with an independently complete audit', () => {
  const planned = prepareCodeModeCall(options)
  const input = continuation(planned)
  for (const changed of [[], [...input, ...input], [{ ...input[0], call_id: 'foreign' }]])
    assert.throws(() => decodeCodeModeContinuation({ input: changed, planned, audit }), /OUTER_CORRELATION/)
  for (const changed of [
    [],
    [{ ...audit[0], complete: false }],
    [{ ...audit[0], argumentsHash: digest({ forged: true }) }],
    [{ ...audit[0], operation: 'quality_journey_get' }],
  ])
    assert.throws(() => decodeCodeModeContinuation({ input, planned, audit: changed }))
  assert.throws(
    () => decodeCodeModeContinuation({ input: continuation(planned, { ...result, extra: true }), planned, audit }),
    /NESTED_RESULT_MISMATCH/,
  )
})
test('forged plans and foreign audit identities cannot qualify a result', () => {
  const planned = prepareCodeModeCall(options)
  const forged = { ...planned, callId: 'forged', scriptSha256: '0'.repeat(64) }
  assert.throws(() => decodeCodeModeContinuation({ input: continuation(forged), planned: forged, audit }), /UNISSUED/)
  for (const patch of [{ callId: 'foreign' }, { normalizedName: 'foreign' }, { id: null }, { id: '' }, { id: {} }]) {
    assert.throws(
      () => decodeCodeModeContinuation({ input: continuation(planned), planned, audit: [{ ...audit[0], ...patch }] }),
      /SCOPED_AUDIT_CORRELATION/,
    )
  }
})
test('yield, failure, truncation, extra media/text and malformed output fail closed', () => {
  const planned = prepareCodeModeCall(options)
  for (const text of [
    header.replace('completed', 'failed'),
    header.replace('completed', 'running with cell ID 1'),
    `${header}Warning: truncated`,
    header.replace('completed', 'terminated'),
  ])
    assert.throws(
      () => decodeCodeModeContinuation({ input: continuation(planned, result, text), planned, audit }),
      /NOT_COMPLETED/,
    )
  for (const change of [
    input => input[0].output.push({ type: 'input_text', text: 'extra' }),
    input => (input[0].output[1] = { type: 'input_image', image_url: 'synthetic' }),
    input => (input[0].output[1].text = '{'),
    input => (input[0].output = 'lossy joined string'),
  ]) {
    const input = continuation(planned)
    change(input)
    assert.throws(() => decodeCodeModeContinuation({ input, planned, audit }))
  }
})
test('exact measured header permits source-documented small negative overhead', () => {
  const planned = prepareCodeModeCall(options)
  const measured =
    'Script completed\nWall time 0.001 seconds (code-mode 0.002 seconds; overhead -0.001 seconds)\nOutput:\n'
  assert.equal(
    decodeCodeModeContinuation({ input: continuation(planned, result, measured), planned, audit }).status,
    'RESULT_CORRELATED',
  )
})
test('rejects unsupported operations, executable accessors and lossy/non-JSON arguments', () => {
  let executed = false
  const accessor = Object.defineProperty({}, 'bad', {
    enumerable: true,
    get: () => {
      executed = true
    },
  })
  for (const args of [
    accessor,
    { bad: undefined },
    { bad: Infinity },
    { bad: BigInt(1) },
    { toJSON: () => ({}) },
    Object.create({ inherited: true }),
  ])
    assert.throws(() => prepareCodeModeCall({ ...options, args }))
  assert.equal(executed, false)
  assert.throws(() => prepareCodeModeCall({ ...options, operation: 'exec_command' }), /OPERATION/)
  assert.throws(() => prepareCodeModeCall({ ...options, args: { text: 'x'.repeat(50 * 1024) } }), /JSON_BOUND/)
})
