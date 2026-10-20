import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { createSyntheticSession } from './fixtures/codex-app-server-m02-ta-continuation-r18/synthetic-session.mjs'
import { createMatrixScriptSession as createRevisedSession } from './fixtures/codex-app-server-m02-ta-continuation-r18/script-session.mjs'

const revised = () => createSyntheticSession({ createSession: createRevisedSession })
const clone = value => structuredClone(value)

test('frozen R10/R17 script rejects valid cumulative third request after two outputs', async () => {
  const fixture = createSyntheticSession()
  fixture.requestAndAck()
  await fixture.executeCurrent()
  fixture.requestAndAck()
  await fixture.executeCurrent()
  assert.equal(fixture.transcript.filter(item => item.type === 'custom_tool_call_output').length, 2)
  assert.throws(() => fixture.request(), /CONTINUATION_SHAPE/)
  assert.equal(fixture.session.snapshot().fenced, true)
  assert.equal(fixture.session.snapshot().requestIndex, 2)
  assert.equal(fixture.reservations.length, 2)
})

test('frozen session accepts a full positive second request and preserves scoped result', async () => {
  const fixture = createSyntheticSession()
  fixture.requestAndAck()
  await fixture.executeCurrent()
  const second = fixture.requestAndAck()
  assert.equal(second.status, 200)
  assert.equal(second.receipt.decodedStatus, 'RESULT_CORRELATED')
  assert.equal(fixture.session.snapshot().requestIndex, 2)
  assert.equal(fixture.reservations.length, 2)
})

test('frozen and revised sessions serialize a returned MCP error on request two', async () => {
  for (const createSession of [undefined, createRevisedSession]) {
    const fixture = createSyntheticSession({ createSession })
    fixture.requestAndAck()
    const errorResult = { content: [{ type: 'text', text: 'synthetic endpoint error' }], isError: true }
    const output = await fixture.executeCurrent({ result: errorResult })
    assert.deepEqual(JSON.parse(output.output[1].text).result, errorResult)
    const second = fixture.requestAndAck()
    assert.equal(second.receipt.decodedStatus, 'RESULT_CORRELATED')
    assert.equal(fixture.reservations.length, 2)
  }
})

test('frozen and revised sessions decode registry absence without scoped dispatch', async () => {
  for (const createSession of [undefined, createRevisedSession]) {
    const fixture = createSyntheticSession({ caseId: 'B07-A09', createSession })
    fixture.requestAndAck()
    const output = await fixture.executeCurrent()
    const envelope = JSON.parse(output.output[1].text)
    assert.equal(envelope.disposition, 'CODE_MODE_REGISTRY_ABSENT')
    assert.equal(envelope.result, null)
    const second = fixture.requestAndAck()
    assert.equal(second.receipt.decodedStatus, 'NO_MCP_DISPATCH')
    assert.equal(fixture.reservations.length, 1)
    assert.equal(fixture.completions.length, 1)
    assert.equal(fixture.session.snapshot().completed, true)
  }
})

test('second request with no completed scoped audit fences before another outer reservation', async () => {
  for (const createSession of [undefined, createRevisedSession]) {
    const fixture = createSyntheticSession({ createSession })
    fixture.requestAndAck()
    await fixture.executeCurrent()
    fixture.auditSession.snapshot = () => null
    assert.throws(() => fixture.request(), /RESULT_CODEC/)
    assert.equal(fixture.session.snapshot().fenced, true)
    assert.equal(fixture.session.snapshot().requestIndex, 1)
    assert.equal(fixture.reservations.length, 1)
  }
})

test('refused registry emits no result or second response reservation', async () => {
  const fixture = createSyntheticSession()
  fixture.requestAndAck()
  const output = []
  const script = fixture.session.plans[0].script
  await assert.rejects(
    vm.runInNewContext(
      `(async()=>{${script}\n})()`,
      {
        ALL_TOOLS: [],
        tools: {},
        text: value => output.push(value),
      },
      { timeout: 1000 },
    ),
    /M02_ROUTE_UNAVAILABLE/,
  )
  assert.deepEqual(output, [])
  assert.equal(fixture.session.snapshot().requestIndex, 1)
  assert.equal(fixture.reservations.length, 1)
})

test('revised session accepts two- and three-call cumulative transcripts through terminal response', async () => {
  for (const caseId of ['B01', 'B03']) {
    const fixture = createSyntheticSession({ createSession: createRevisedSession, caseId })
    fixture.requestAndAck()
    const retained = []
    for (const plan of fixture.session.plans) {
      const output = await fixture.executeCurrent()
      assert.equal(output.call_id, plan.callId)
      const response = fixture.requestAndAck()
      assert.equal(response.receipt.decodedStatus, 'RESULT_CORRELATED')
      retained.push(JSON.stringify(output))
      assert.deepEqual(
        fixture.transcript.filter(item => item.type === 'custom_tool_call_output').map(JSON.stringify),
        retained,
      )
    }
    assert.equal(fixture.session.snapshot().completed, true)
    assert.equal(fixture.session.snapshot().requestIndex, fixture.session.plans.length + 1)
    assert.equal(fixture.reservations.length, fixture.session.plans.length)
    assert.equal(fixture.acknowledgements.length, fixture.session.plans.length)
    assert.equal(fixture.receipts.length, fixture.session.plans.length + 2)
  }
})

test('B03 accepts compact later requests containing only the current issued output', async () => {
  const fixture = createSyntheticSession({ createSession: createRevisedSession, caseId: 'B03' })
  fixture.requestAndAck()
  await fixture.executeCurrent()
  fixture.requestAndAck()
  await fixture.executeCurrent()
  const secondOutput = fixture.transcript.at(-1)
  const third = fixture.requestAndAck([fixture.transcript[0], secondOutput])
  assert.equal(third.receipt.decodedStatus, 'RESULT_CORRELATED')
  assert.equal(fixture.session.snapshot().requestIndex, 3)
  await fixture.executeCurrent()
  const thirdOutput = fixture.transcript.at(-1)
  const terminal = fixture.requestAndAck([fixture.transcript[0], thirdOutput])
  assert.equal(terminal.receipt.decodedStatus, 'RESULT_CORRELATED')
  assert.equal(fixture.session.snapshot().completed, true)
  assert.equal(fixture.session.snapshot().requestIndex, 4)
  assert.deepEqual(
    fixture.completions,
    fixture.session.plans.map(plan => plan.callId),
  )
  assert.equal(fixture.reservations.length, 3)
  assert.equal(fixture.acknowledgements.length, 3)
  assert.equal(fixture.receipts.length, 5)
  assert.throws(() => fixture.request(), /no resend/)
})

test('frozen and revised second requests reject malformed, foreign and duplicate outputs before reserving the next call', async () => {
  const variants = {
    malformed(input) {
      input.at(-1).output[1].text = '{'
    },
    foreign(input) {
      input.at(-1).call_id = 'foreign'
    },
    duplicate(input) {
      input.push(clone(input.at(-1)))
    },
    errorHeader(input) {
      input.at(-1).output[0].text = 'Script failed\nWall time 0.1 seconds\nOutput:\n'
    },
    yielded(input) {
      input.at(-1).output[0].text = 'Script running with cell ID 1\nOutput:\n'
    },
  }
  for (const createSession of [undefined, createRevisedSession]) {
    for (const [label, mutate] of Object.entries(variants)) {
      const fixture = createSyntheticSession({ createSession })
      fixture.requestAndAck()
      await fixture.executeCurrent()
      const input = clone(fixture.transcript)
      mutate(input)
      assert.throws(() => fixture.request(input), undefined, label)
      assert.equal(fixture.session.snapshot().requestIndex, 1, label)
      assert.equal(fixture.reservations.length, 1, label)
      if (createSession === createRevisedSession) {
        assert.equal(fixture.session.snapshot().fenced, true, label)
        assert.throws(() => fixture.request(fixture.transcript), /no resend/, label)
        assert.equal(fixture.reservations.length, 1, label)
      }
    }
  }
})

test('revised cumulative transcript rejects changed prior output, reordered calls and missing audit', async () => {
  for (const problem of ['priorMutation', 'reordered', 'missingAudit']) {
    const fixture = revised()
    fixture.requestAndAck()
    await fixture.executeCurrent()
    fixture.requestAndAck()
    await fixture.executeCurrent()
    const input = clone(fixture.transcript)
    if (problem === 'priorMutation') input[2].output[1].text = '{}'
    if (problem === 'reordered') [input[1], input[3]] = [input[3], input[1]]
    if (problem === 'missingAudit') fixture.auditSession.snapshot = () => null
    assert.throws(() => fixture.request(input), undefined, problem)
    assert.equal(fixture.session.snapshot().requestIndex, 2, problem)
    assert.equal(fixture.reservations.length, 2, problem)
    assert.equal(fixture.session.snapshot().fenced, true, problem)
    assert.throws(() => fixture.request(fixture.transcript), /no resend/, problem)
    assert.equal(fixture.reservations.length, 2, problem)
  }
})

test('three-call transcript fences mutation, duplication and reorder of earlier output before reservation', async () => {
  for (const problem of ['priorMutation', 'priorDuplicate', 'reordered']) {
    const fixture = createSyntheticSession({ createSession: createRevisedSession, caseId: 'B03' })
    fixture.requestAndAck()
    await fixture.executeCurrent()
    fixture.requestAndAck()
    await fixture.executeCurrent()
    fixture.requestAndAck()
    await fixture.executeCurrent()
    const input = clone(fixture.transcript)
    if (problem === 'priorMutation') input[2].output[1].text = '{}'
    if (problem === 'priorDuplicate') input.push(clone(input[2]))
    if (problem === 'reordered') [input[1], input[3]] = [input[3], input[1]]
    assert.throws(() => fixture.request(input), undefined, problem)
    assert.equal(fixture.session.snapshot().requestIndex, 3, problem)
    assert.equal(fixture.reservations.length, 3, problem)
    assert.equal(fixture.session.snapshot().fenced, true, problem)
    assert.throws(() => fixture.request(fixture.transcript), /no resend/, problem)
    assert.equal(fixture.reservations.length, 3, problem)
  }
})

test('a response without ACK cannot open another provider request', async () => {
  const fixture = revised()
  fixture.request()
  await fixture.executeCurrent()
  assert.throws(() => fixture.request(), /no resend/)
  assert.equal(fixture.reservations.length, 1)
  assert.equal(fixture.session.snapshot().requestIndex, 1)
})

test('frozen rejected transcript can be retried, while R18 fences the same request', async () => {
  for (const [createSession, expectedFenced] of [
    [undefined, false],
    [createRevisedSession, true],
  ]) {
    const fixture = createSyntheticSession({ createSession })
    fixture.requestAndAck()
    await fixture.executeCurrent()
    const badInput = clone(fixture.transcript)
    badInput.at(-1).call_id = 'foreign'
    assert.throws(() => fixture.request(badInput), /unscheduled provider tool transcript item/)
    assert.equal(fixture.session.snapshot().fenced, expectedFenced)
    if (expectedFenced) {
      assert.throws(() => fixture.request(fixture.transcript), /no resend/)
      assert.equal(fixture.session.snapshot().requestIndex, 1)
      assert.equal(fixture.reservations.length, 1)
      assert.equal(fixture.receipts.length, 2)
      assert.deepEqual(fixture.completions, [])
    } else {
      const retry = fixture.request(fixture.transcript)
      assert.equal(retry.receipt.requestIndex, 2)
      assert.equal(fixture.reservations.length, 2)
    }
  }
})
