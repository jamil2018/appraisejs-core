import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  composeDynamicToolsLaunch,
  DYNAMIC_TOOL_NAME,
  DYNAMIC_TOOL_SCHEMA,
  evaluateExperimentResults,
  evaluateDispatch,
  sha256,
  summarizeResponsesRequest,
} from '../lib/p0-r2c-dynamic-tools-experiment.mjs'

test('composition isolates an empty and one strict dynamic tool arm', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'p0-r2c-test-'))
  const empty = composeDynamicToolsLaunch({ executable: '/fixture/codex', port: 1234, arm: 'empty', root })
  const one = composeDynamicToolsLaunch({ executable: '/fixture/codex', port: 1234, arm: 'one-strict' })
  assert.deepEqual(empty.threadStartParams.dynamicTools, [])
  assert.deepEqual(one.dynamicTools[0].inputSchema, DYNAMIC_TOOL_SCHEMA)
  assert.equal(one.dynamicTools[0].name, DYNAMIC_TOOL_NAME)
  assert.equal(one.environment.OPENAI_API_KEY, undefined)
  assert.match(one.configText, /shell_tool = false/)
  assert.match(one.configText, /experimental_request_user_input/)
})

test('request summaries retain hashes and schema identity but not authorization values', () => {
  const raw = JSON.stringify({
    tools: [{ name: DYNAMIC_TOOL_NAME, type: 'function', inputSchema: DYNAMIC_TOOL_SCHEMA }],
  })
  const receipt = summarizeResponsesRequest(raw, { authorization: 'Bearer do-not-retain' })
  assert.equal(receipt.authorization.scheme, 'Bearer')
  assert.equal(JSON.stringify(receipt).includes('do-not-retain'), false)
  assert.equal(receipt.bodySha256, sha256(raw))
  assert.equal(receipt.parseValid, true)
  assert.equal(receipt.toolsFieldPresent, true)
  assert.equal(receipt.toolsArrayValid, true)
  assert.equal(receipt.tools[0].schemaHash.length, 64)
})

test('request summaries distinguish invalid JSON and missing or non-array tool fields from an empty manifest', () => {
  for (const raw of ['not-json', '{}', '{"tools":null}']) {
    const receipt = summarizeResponsesRequest(raw)
    assert.equal(receipt.tools.length, 0)
    assert.equal(receipt.toolsArrayValid, false)
  }
  assert.equal(summarizeResponsesRequest('not-json').parseValid, false)
  assert.equal(summarizeResponsesRequest('{}').toolsFieldPresent, false)
  assert.equal(summarizeResponsesRequest('{"tools":null}').toolsFieldPresent, true)
})

test('dispatch permits only a fresh same-thread strict call and rejects abuse cases', () => {
  const base = {
    arguments: { probe: 'ok' },
    callId: 'call-1',
    threadId: 'thread-a',
    tool: DYNAMIC_TOOL_NAME,
    turnId: 'turn-a',
  }
  const seen = new Set()
  assert.equal(
    evaluateDispatch(base, { expectedThreadId: 'thread-a', expectedTurnId: 'turn-a', seenCallIds: seen }).outcome,
    'allowed_synthetic_dispatch',
  )
  assert.equal(
    evaluateDispatch(base, { expectedThreadId: 'thread-a', expectedTurnId: 'turn-a', seenCallIds: seen }).outcome,
    'rejected_replay',
  )
  assert.equal(
    evaluateDispatch(
      { ...base, callId: 'call-2', tool: 'unknown' },
      { expectedThreadId: 'thread-a', expectedTurnId: 'turn-a' },
    ).outcome,
    'rejected_unknown_tool',
  )
  assert.equal(
    evaluateDispatch(
      { ...base, callId: 'call-3', arguments: {} },
      { expectedThreadId: 'thread-a', expectedTurnId: 'turn-a' },
    ).outcome,
    'rejected_malformed_arguments',
  )
  assert.equal(
    evaluateDispatch(
      { ...base, callId: 'call-4', threadId: 'thread-b' },
      { expectedThreadId: 'thread-a', expectedTurnId: 'turn-a' },
    ).outcome,
    'rejected_cross_thread',
  )
  assert.equal(
    evaluateDispatch(
      { ...base, callId: 'call-5', turnId: 'turn-b' },
      { expectedThreadId: 'thread-a', expectedTurnId: 'turn-a' },
    ).outcome,
    'rejected_stale_turn',
  )
  assert.equal(
    evaluateDispatch({ ...base, callId: undefined }, { expectedThreadId: 'thread-a', expectedTurnId: 'turn-a' })
      .outcome,
    'rejected_invalid_call_id',
  )
  assert.equal(
    evaluateDispatch({ ...base, callId: '' }, { expectedThreadId: 'thread-a', expectedTurnId: 'turn-a' }).outcome,
    'rejected_invalid_call_id',
  )
})

test('experiment verdict fails closed on every semantic acceptance violation', () => {
  const valid = validResults()
  assert.deepEqual(evaluateExperimentResults(valid), { qualified: true, findings: [] })
  const cases = [
    result => result.pop(),
    result => (result[0].cleanup.confirmed = false),
    result => (result[0].requests[0].parseValid = false),
    result => (result[0].requests[0].toolsFieldPresent = false),
    result => (result[0].requests[0].toolsArrayValid = false),
    result => result[0].requests[0].toolNames.push('native_tool'),
    result => result[0].resolved.mcpNames.push('ambient'),
    result => (result[0].resolved.webSearch = 'enabled'),
    result => (result[1].dispatches = []),
    result => result[1].requests[1].toolNames.push('native_tool'),
    result => (result[1].requests[1].tools[0].schemaHash = 'drift'),
    result => (result[1].requests[1].tools[0].definitionSha256 = 'drift'),
    result => (result[1].requests[0].authorization.present = false),
  ]
  for (const mutate of cases) {
    const result = structuredClone(valid)
    mutate(result)
    assert.equal(evaluateExperimentResults(result).qualified, false)
  }
})

function validResults() {
  const tool = {
    definitionSha256: 'definition',
    name: DYNAMIC_TOOL_NAME,
    origin: 'function',
    schemaHash: sha256(JSON.stringify(DYNAMIC_TOOL_SCHEMA)),
  }
  const request = tools => ({
    authorization: { present: true, scheme: 'Bearer' },
    parseValid: true,
    toolNames: tools.map(entry => entry.name),
    tools,
    toolsArrayValid: true,
    toolsFieldPresent: true,
  })
  const common = arm => ({
    arm,
    cleanup: { confirmed: true, survivingProcessCount: 0 },
    error: null,
    resolved: { featureDigest: 'feature', mcpNames: [], webSearch: 'disabled' },
  })
  return [
    { ...common('empty'), dispatches: [], requestCount: 1, requests: [request([])] },
    {
      ...common('one-strict'),
      dispatches: [
        {
          method: 'item/tool/call',
          outcome: 'allowed_synthetic_dispatch',
          received: { namespace: null, tool: DYNAMIC_TOOL_NAME },
        },
      ],
      requestCount: 2,
      requests: [request([tool]), request([structuredClone(tool)])],
    },
  ]
}
