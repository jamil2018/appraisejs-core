import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'

import {
  P0_R2D_MODEL,
  createRequestInterlock,
  consumeReleasedCall,
  collectBoundedBody,
  registerReleasedCalls,
  evaluateInterlockResults,
  loadCanonicalProfile,
  projectResponsesTools,
  validateArgumentsCanonical,
  validateBufferedSse,
  validateResponseRequest,
} from '../lib/p0-r2d-interlock-experiment.mjs'

const schema = {
  additionalProperties: false,
  properties: { value: { type: 'string' } },
  required: ['value'],
  type: 'object',
}
const profile = {
  contractDigest: 'sha256:fixture-profile',
  tools: [
    { name: 'canonical_tool', inputSchema: schema },
    { name: 'second_tool', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  ],
}
const expectedTools = projectResponsesTools(profile)
const goodBody = Buffer.from(JSON.stringify({ model: P0_R2D_MODEL, tools: expectedTools }, null, 2))
const headers = { authorization: 'Bearer fake', 'content-type': 'application/json' }
function authority() {
  return {
    attemptId: 'a',
    configSha256: 'c',
    executableSha256: 'e',
    expiresAt: Date.now() + 60_000,
    processIdentity: 'p',
    profileDigest: profile.contractDigest,
    protocol: 'responses/v1',
    threadId: 't',
    turnId: 'u',
  }
}
function request(overrides = {}) {
  return { body: goodBody, headers, method: 'POST', url: '/v1/responses', ...overrides }
}
const call = {
  type: 'function_call',
  call_id: 'call-1',
  id: 'fc-1',
  name: 'canonical_tool',
  arguments: '{"value":"ok"}',
}
function frame(event, data = {}) {
  return `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`
}
function complete(output = [call]) {
  return frame('response.completed', { response: { id: 'r', status: 'completed', output } })
}
function stream(output = [call]) {
  return Buffer.from(
    frame('response.created', { response: { id: 'r', status: 'in_progress', output: [] } }) + complete(output),
  )
}
const validateArguments = async (name, args) =>
  name === 'canonical_tool' && z.object({ value: z.string() }).strict().safeParse(args).success
async function check(body, overrides = {}) {
  return validateBufferedSse({ body, profile, binding: authority(), validateArguments, ...overrides })
}

test('canonical Requirement Analyzer projection and validation use the actual registry', async () => {
  const actual = await loadCanonicalProfile()
  assert.deepEqual(
    actual.tools.map(tool => tool.name),
    ['quality_journey_analysis_get', 'quality_journey_analysis_submit'],
  )
  assert.equal(await validateArgumentsCanonical(actual.tools[0].name, {}, actual.contractDigest), true)
  assert.equal(await validateArgumentsCanonical(actual.tools[0].name, [], actual.contractDigest), false)
})

for (const [name, tools] of [
  ['missing', []],
  ['extra', [...expectedTools, { ...expectedTools[0], name: 'extra' }]],
  ['reordered', [...expectedTools].reverse()],
  ['duplicate', [expectedTools[0], expectedTools[0]]],
  ['schema drift', [{ ...expectedTools[0], parameters: { type: 'string' } }, expectedTools[1]]],
  ['strictness drift', [{ ...expectedTools[0], strict: !expectedTools[0].strict }, expectedTools[1]]],
])
  test(`request ${name} is rejected before upstream invocation`, async () => {
    let forwards = 0
    const gate = createRequestInterlock({
      authority: authority(),
      expectedTools,
      upstream: async () => {
        forwards++
        return {}
      },
    })
    const result = await gate(request({ body: Buffer.from(JSON.stringify({ model: P0_R2D_MODEL, tools })) }))
    assert.equal(result.reason, 'tools_rejected')
    assert.equal(forwards, 0)
  })

for (const [reason, overrides] of [
  ['method_rejected', { method: 'GET' }],
  ['path_rejected', { url: '/v1/other' }],
  ['authorization_rejected', { headers: { ...headers, authorization: '' } }],
  ['content_type_rejected', { headers: { ...headers, 'content-type': 'text/plain' } }],
  ['json_rejected', { body: Buffer.from('{bad') }],
  ['model_rejected', { body: Buffer.from(JSON.stringify({ model: 'other', tools: expectedTools })) }],
])
  test(`${reason} occurs before upstream invocation`, async () => {
    let forwards = 0
    const gate = createRequestInterlock({
      authority: authority(),
      expectedTools,
      upstream: async () => {
        forwards++
        return {}
      },
    })
    assert.equal((await gate(request(overrides))).reason, reason)
    assert.equal(forwards, 0)
  })

test('gate preserves whitespace and caller-buffer mutations cannot alter the released copy; retries fail closed', async () => {
  const input = Buffer.from(goodBody)
  let received
  let forwards = 0
  const gate = createRequestInterlock({
    authority: authority(),
    expectedTools,
    upstream: async value => {
      forwards++
      input.fill(0)
      received = Buffer.from(value.body)
      return {}
    },
  })
  const accepted = await gate(request({ body: input }))
  assert.equal(accepted.accepted, true)
  assert.deepEqual(received, goodBody)
  assert.notDeepEqual(received, Buffer.from(JSON.stringify(JSON.parse(goodBody))))
  assert.deepEqual(accepted.upstreamBody, goodBody)
  assert.equal((await gate(request())).reason, 'replayed_request_binding')
  assert.equal(forwards, 1)
  assert.ok(accepted.binding.requestId)
})

for (const field of ['attemptId', 'threadId', 'turnId', 'processIdentity', 'executableSha256', 'configSha256'])
  test(`missing ${field} cannot create a release authority`, () => {
    assert.throws(() =>
      createRequestInterlock({ authority: { ...authority(), [field]: '' }, expectedTools, upstream: async () => ({}) }),
    )
  })

test('authority and expected tools are snapshotted before callers can mutate them', async () => {
  const mutable = authority()
  const tools = structuredClone(expectedTools)
  const gate = createRequestInterlock({ authority: mutable, expectedTools: tools, upstream: async () => ({}) })
  mutable.attemptId = 'other'
  mutable.threadId = 'other'
  mutable.turnId = 'other'
  tools.reverse()
  const result = await gate(request())
  assert.equal(result.accepted, true)
  assert.equal(result.binding.attemptId, 'a')
  assert.equal(result.binding.threadId, 't')
  assert.equal(result.binding.turnId, 'u')
})

test('expired authority is refused before any release', () => {
  assert.throws(() =>
    createRequestInterlock({ authority: { ...authority(), expiresAt: 0 }, expectedTools, upstream: async () => ({}) }),
  )
})

test('valid bounded SSE is accepted after fragmented chunks are completely collected', async () => {
  const body = stream()
  const fragments = [body.subarray(0, 7), body.subarray(7, 31), body.subarray(31)]
  const result = await check(Buffer.concat(fragments))
  assert.equal(result.accepted, true)
  assert.deepEqual(result.calls, [call])
  assert.equal((await check(fragments[0])).accepted, false)
})

for (const [reason, body] of [
  ['malformed_sse', Buffer.from('event: response.created\ndata: {bad\n\n')],
  ['unsupported_sse_event', Buffer.from(frame('unknown.event'))],
  ['sse_event_type_mismatch', Buffer.from(frame('response.created', { type: 'response.completed' }))],
  ['partial_sse', Buffer.from(frame('response.created', { response: { id: 'r', output: [] } }))],
  ['event_after_completed', Buffer.from(complete([]) + complete([]))],
  ['unsupported_output_item', stream([{ type: 'web_search_call' }])],
  ['forbidden_function_call', stream([{ ...call, name: 'unknown' }])],
  ['malformed_function_call', stream([{ ...call, call_id: '' }])],
  ['malformed_function_arguments', stream([{ ...call, arguments: '{bad' }])],
  ['invalid_function_arguments', stream([{ ...call, arguments: '{}' }])],
  [
    'replayed_call_id',
    Buffer.from(
      frame('response.output_item.added', { item: call }) + complete([{ ...call, arguments: '{"value":"changed"}' }]),
    ),
  ],
])
  test(`response ${reason} is rejected for its intended reason`, async () => {
    const result = await check(body)
    assert.equal(result.accepted, false)
    assert.equal(result.reason, reason)
  })

test('expired or mismatched response profile is rejected before parsing or argument validation', async () => {
  for (const invalid of [
    { ...authority(), expiresAt: 0 },
    { ...authority(), profileDigest: 'other' },
  ]) {
    let validations = 0
    const result = await check(stream(), {
      binding: invalid,
      validateArguments: async () => {
        validations++
        return true
      },
    })
    assert.equal(result.reason, 'stale_response_binding')
    assert.equal(validations, 0)
  }
})

test('empty and oversized response buffers fail closed', async () => {
  assert.equal((await check(Buffer.alloc(0))).reason, 'sse_size_rejected')
  assert.equal((await check(stream(), { maxBytes: 1 })).reason, 'sse_size_rejected')
})

test('a valid request is accepted by the pinned policy', () => {
  assert.equal(validateResponseRequest({ ...request(), expectedTools }).accepted, true)
})

for (const [label, overrides, boundOverride, reason] of [
  ['cross-thread', { threadId: 'other' }, {}, 'callback_scope_mismatch'],
  ['stale-turn', { turnId: 'other' }, {}, 'callback_scope_mismatch'],
  ['cross-attempt', {}, { attemptId: 'other' }, 'callback_binding_mismatch'],
  ['wrong-profile', {}, { profileDigest: 'other' }, 'callback_binding_mismatch'],
  ['expired', {}, { expiresAt: 0 }, 'callback_binding_mismatch'],
  ['unknown-call', { callId: 'unknown' }, {}, 'callback_not_released'],
  ['wrong-tool', { tool: 'second_tool' }, {}, 'callback_not_released'],
  ['wrong-arguments', { arguments: { value: 'changed' } }, {}, 'callback_not_released'],
  ['namespace', { namespace: 'ambient' }, {}, 'callback_not_released'],
])
  test(`callback ${label} cannot consume an effect grant`, () => {
    const trusted = authority()
    const releasedCalls = new Map([[call.call_id, call]])
    const params = {
      threadId: 't',
      turnId: 'u',
      callId: call.call_id,
      tool: call.name,
      arguments: { value: 'ok' },
      ...overrides,
    }
    const result = consumeReleasedCall({
      params,
      releasedCalls,
      authority: trusted,
      binding: { ...trusted, ...boundOverride },
    })
    assert.equal(result.reason, reason)
    assert.equal(releasedCalls.size, 1)
  })

test('callback grant is consumed synchronously and identical replay cannot invoke a second effect', () => {
  const trusted = authority()
  const releasedCalls = new Map([[call.call_id, call]])
  const input = {
    params: { threadId: 't', turnId: 'u', callId: call.call_id, tool: call.name, arguments: { value: 'ok' } },
    releasedCalls,
    authority: trusted,
    binding: trusted,
  }
  let effects = 0
  if (consumeReleasedCall(input).accepted) effects++
  if (consumeReleasedCall(input).accepted) effects++
  assert.equal(effects, 1)
  assert.equal(releasedCalls.size, 0)
})

test('qualification cannot substitute an unrelated failure for either intended live denial', () => {
  const common = {
    error: null,
    cleanup: { confirmed: true, survivingProcessCount: 0 },
    canary: { denied: true },
    resolved: { mcpNames: [] },
    requestRejections: [],
    responseRejections: [],
    forwardedRequests: [],
    brokerReceiptDigests: [],
    requestDiagnostics: [],
  }
  const sameBytes = {
    gateRequestSha256: 'same',
    upstreamRequestSha256: 'same',
    gateByteLength: 1,
    upstreamByteLength: 1,
  }
  const receipts = [
    {
      result: {
        ...common,
        arm: 'allowed',
        dispatchCount: 1,
        upstreamCount: 2,
        forwardedRequests: [sameBytes, sameBytes],
        brokerReceiptDigests: ['receipt'],
      },
    },
    {
      result: {
        ...common,
        arm: 'request-rejection',
        dispatchCount: 0,
        upstreamCount: 0,
        requestRejections: ['tools_rejected'],
        requestDiagnostics: [projectResponsesTools(profile)],
      },
    },
    {
      result: {
        ...common,
        arm: 'response-rejection',
        dispatchCount: 0,
        upstreamCount: 1,
        forwardedRequests: [sameBytes],
        responseRejections: ['forbidden_function_call'],
      },
    },
  ]
  assert.equal(evaluateInterlockResults(receipts, profile).qualified, true)
  for (const [index, field, value] of [
    [1, 'requestRejections', ['stale_request_authority']],
    [1, 'requestDiagnostics', []],
    [2, 'responseRejections', ['forwarded_request_bytes_changed']],
    [2, 'responseRejections', ['sse_size_rejected']],
    [0, 'brokerReceiptDigests', []],
  ]) {
    const changed = structuredClone(receipts)
    changed[index].result[field] = value
    assert.equal(evaluateInterlockResults(changed, profile).qualified, false)
  }
})

test('callback with missing binding cannot invoke an effect', () => {
  assert.equal(
    consumeReleasedCall({ params: {}, authority: authority(), binding: null, releasedCalls: new Map() }).accepted,
    false,
  )
})

test('canonical submission validation retains string constraints lost by the provider wire codec', async () => {
  const actual = await loadCanonicalProfile()
  const tool = actual.tools.find(tool => tool.name === 'quality_journey_analysis_submit')
  function example(schema) {
    if (schema.type === 'object')
      return Object.fromEntries((schema.required ?? []).map(key => [key, example(schema.properties[key])]))
    if (schema.type === 'array') return Array.from({ length: schema.minItems ?? 0 }, () => example(schema.items))
    if (schema.type === 'boolean') return false
    if (schema.type === 'string') return 'x'
    throw new Error(`Unhandled canonical fixture type ${schema.type}`)
  }
  const value = example(tool.inputSchema)
  assert.equal(await validateArgumentsCanonical(tool.name, value, actual.contractDigest), true)
  assert.equal(
    await validateArgumentsCanonical(tool.name, { ...value, idempotencyKey: 'x'.repeat(201) }, actual.contractDigest),
    false,
  )
  assert.equal(
    await validateArgumentsCanonical(tool.name, { ...value, idempotencyKey: '#' }, actual.contractDigest),
    false,
  )
})

test('calls omitted from completed output and mismatched response identities cannot be released', async () => {
  const orphan = Buffer.from(frame('response.output_item.added', { item: call }) + complete([]))
  assert.equal((await check(orphan)).reason, 'incomplete_response_calls')
  const mismatched = Buffer.from(frame('response.created', { response: { id: 'other', output: [] } }) + complete())
  assert.equal((await check(mismatched)).reason, 'response_identity_mismatch')
  assert.equal((await check(stream([call, call]))).reason, 'replayed_call_id')
})

test('collection enforces its limit before buffering further upstream chunks', async () => {
  let reads = 0
  async function* oversized() {
    reads++
    yield Buffer.alloc(8)
    reads++
    yield Buffer.alloc(8)
    reads++
    yield Buffer.alloc(8)
  }
  await assert.rejects(collectBoundedBody(oversized(), 12), /body_size_limit/)
  assert.equal(reads, 2)
  async function* valid() {
    yield Buffer.from('ab')
    yield Buffer.from('cd')
  }
  assert.equal((await collectBoundedBody(valid(), 4)).toString(), 'abcd')
})

test('released calls retain originating binding and cannot be reissued in a later response', () => {
  const binding = { ...authority(), requestId: 'first' }
  const later = { ...binding, requestId: 'second' }
  const releasedCalls = new Map()
  const seenCallIds = new Set()
  assert.equal(registerReleasedCalls({ calls: [call], binding, releasedCalls, seenCallIds }).accepted, true)
  const params = { threadId: 't', turnId: 'u', callId: call.call_id, tool: call.name, arguments: { value: 'ok' } }
  assert.equal(consumeReleasedCall({ params, authority: binding, binding: later, releasedCalls }).accepted, false)
  assert.equal(consumeReleasedCall({ params, authority: binding, binding, releasedCalls }).accepted, true)
  assert.equal(
    registerReleasedCalls({ calls: [call], binding: later, releasedCalls, seenCallIds }).reason,
    'replayed_response_call',
  )
  assert.equal(releasedCalls.size, 0)
})
