import './fixtures/codex-app-server-m02-ta-matrix-r23-composed/no-external-effects.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import {
  createOfflineScriptFixture,
  RESULT,
} from './fixtures/codex-app-server-m02-ta-matrix-r23-offline/script-fixture.mjs'
import { POLICY } from './fixtures/codex-app-server-m02-ta-runtime-r9/policy.mjs'
import {
  prepareNativeCase,
  verifyNativeContinuation,
  B14_PROFILE,
} from './fixtures/codex-app-server-m02-ta-native-plans-r10/plans.mjs'
import {
  inspectP00RequiredMcpError,
  verifyP00Completion,
} from './fixtures/codex-app-server-m02-ta-matrix-r10/p00-readiness.mjs'
import { DurablePhaseJournal } from './fixtures/codex-app-server-m02-ta-phase-r10/phase-journal.mjs'
import { createB14NativeSession } from './fixtures/codex-app-server-m02-ta-matrix-r10/native-session.mjs'
import { loadSealedRouteEvidence } from './fixtures/codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import {
  syntheticB14Request,
  syntheticB14Output,
  syntheticB14PermissionEvidence,
} from './fixtures/codex-app-server-m02-ta-matrix-r23-offline/b14-request.mjs'

const T2 = POLICY.cases.filter(item => item.phase === 'T2')
const scripted = T2.filter(item => !['P00', 'B14'].includes(item.id))
const clone = value => structuredClone(value)

function assertScriptEnvelope(output, plan, result) {
  const envelope = JSON.parse(output.output[1].text)
  assert.equal(envelope.schema, 'appraise.m02-code-mode-envelope/v1')
  assert.equal(envelope.caseId, plan.caseId)
  assert.equal(envelope.callId, plan.callId)
  assert.equal(envelope.index, plan.index)
  assert.equal(envelope.operation, plan.operation)
  assert.equal(envelope.disposition, plan.rejection ? 'CODE_MODE_REGISTRY_ABSENT' : 'MCP_RESULT')
  assert.deepEqual(envelope.result, plan.rejection ? null : result)
}

test('r23 offline coverage names each of the 24 T2 cases and real path for all 22 scripted cases', () => {
  assert.equal(T2.length, 24)
  assert.equal(new Set(T2.map(item => item.id)).size, 24)
  assert.equal(scripted.length, 22)
  assert.deepEqual(
    T2.slice(-2).map(item => item.id),
    ['P00', 'B14'],
  )
})

for (const item of scripted) {
  test(`${item.id}: generated script, argument binding, provider continuation, and terminal receipt`, async () => {
    const f = await createOfflineScriptFixture(item.id)
    const expectedSteps = item.script.operations
    assert.deepEqual(
      f.operations.map(operation => operation.operation),
      expectedSteps.map(step => step.toolName),
    )
    assert.equal(f.session.status, 'OFFLINE_PREPARED_NOT_RUNTIME_QUALIFIED')
    assert.equal(f.receipts[0].name, 'script-plan')
    const first = f.requestAndAck()
    assert.equal(first.status, 200)
    assert.equal(first.receipt.decodedStatus, null)
    assert.equal(f.reservations[0].kind, 'outerCalls')
    assert.equal(f.acknowledgements.length, 1)

    for (let index = 0; index < f.session.plans.length; index++) {
      const plan = f.session.plans[index]
      const result =
        item.expected === 'no-effect' && !plan.rejection
          ? {
              content: [{ type: 'text', text: `offline ${item.script.expectedOfflineFirstLayer} refusal` }],
              isError: true,
            }
          : RESULT
      const output = await f.executeCurrent({ result })
      assertScriptEnvelope(output, plan, result)
      if (!plan.rejection) {
        const call = f.calls.at(-1)
        assert.equal(call.callId, plan.callId)
        assert.equal(call.name, expectedSteps[index].toolName)
        assert.deepEqual(JSON.parse(JSON.stringify(call.args)), f.operations[index].args)
      }
      const response = f.requestAndAck()
      assert.equal(response.receipt.decodedStatus, plan.rejection ? 'NO_MCP_DISPATCH' : 'RESULT_CORRELATED')
      assert.equal(response.receipt.requestIndex, index + 2)
      assert.equal(response.receipt.planSha256, f.session.planSha256)
      assert.equal(f.completions.at(-1), plan.callId)
    }
    assert.equal(f.session.snapshot().completed, true)
    assert.equal(f.session.snapshot().fenced, false)
    assert.equal(f.session.snapshot().outerPending, null)
    assert.equal(f.reservations.length, f.session.plans.length)
    assert.equal(f.acknowledgements.length, f.session.plans.length)
    assert.equal(f.receipts.length, f.session.plans.length + 2)
    assert.deepEqual(
      f.receipts.slice(1).map(receipt => receipt.name),
      Array.from({ length: f.session.plans.length + 1 }, (_, index) => `provider-response-${index + 1}`),
    )
    assert.ok(f.stages.includes('DESCRIPTOR_GATE'))
    assert.ok(f.stages.includes('CONTINUATION_DECODER'))
    assert.ok(f.stages.includes('RESPONSE_RECEIPT_WRITE'))
    assert.throws(() => f.request(), /no resend/)
  })
}

test('all 16 negative scripted cases retain their distinct first-layer argument or registry behavior', async () => {
  for (const item of scripted.filter(entry => entry.expected === 'no-effect')) {
    const f = await createOfflineScriptFixture(item.id)
    assert.equal(f.operations.length, 1, item.id)
    const plan = f.session.plans[0]
    if (/^B07-A0[1-8]$/.test(item.id)) {
      assert.equal(f.operations[0].args[item.script.mutation.field], 'forged', item.id)
      assert.equal(plan.rejection, false, item.id)
    } else if (item.id === 'B07-D01') {
      assert.equal(f.operations[0].args.result.role, 'AUTOMATOR')
      assert.equal(plan.rejection, false)
    } else if (item.id === 'B07-T01') {
      assert.equal(f.operations[0].args.receiptId, 'offline-foreign-receipt')
      assert.equal(plan.rejection, false)
    } else {
      assert.equal(plan.rejection, true, item.id)
      assert.equal(f.operations[0].rejection, true, item.id)
    }
  }
})

test('B03 full cumulative transcript and compact current-output projection both complete', async () => {
  for (const compact of [false, true]) {
    const f = await createOfflineScriptFixture('B03')
    f.requestAndAck()
    for (let index = 0; index < f.session.plans.length; index++) {
      const output = await f.executeCurrent()
      const input = compact && index > 0 ? [f.transcript[0], output] : f.transcript
      const response = f.requestAndAck(input)
      assert.equal(response.receipt.decodedStatus, 'RESULT_CORRELATED')
      assert.equal(f.reservations.length, Math.min(index + 2, f.session.plans.length))
    }
    assert.deepEqual(
      f.completions,
      f.session.plans.map(plan => plan.callId),
    )
    assert.equal(f.session.snapshot().completed, true)
  }
})

test('changed earlier output, duplicate output, foreign call, and missing current output fence before next reservation', async () => {
  for (const problem of ['prior-changed', 'duplicate', 'foreign', 'missing']) {
    const f = await createOfflineScriptFixture('B03')
    f.requestAndAck()
    await f.executeCurrent()
    f.requestAndAck()
    await f.executeCurrent()
    const bad = clone(f.transcript)
    if (problem === 'prior-changed') bad[2].output[1].text = '{}'
    if (problem === 'duplicate') bad.push(clone(bad[2]))
    if (problem === 'foreign') bad.at(-1).call_id = 'foreign'
    if (problem === 'missing') bad.pop()
    assert.throws(() => f.request(bad), undefined, problem)
    assert.equal(f.reservations.length, 2, problem)
    assert.equal(f.session.snapshot().fenced, true, problem)
    assert.throws(() => f.request(), /no resend/, problem)
  }
})

test('missing ACK and registry refusal cannot become a second outer reservation', async () => {
  const pending = await createOfflineScriptFixture('B01')
  const response = pending.request()
  assert.equal(pending.session.snapshot().outerPending, 'B01-outer-1')
  assert.throws(() => pending.request(), /no resend/)
  assert.equal(pending.reservations.length, 1)
  response.afterWrite()
  assert.throws(() => response.afterWrite(), /duplicate scripted response ACK/)

  const refused = await createOfflineScriptFixture('B01')
  refused.requestAndAck()
  const emitted = []
  await assert.rejects(
    vm.runInNewContext(
      `(async()=>{${refused.session.plans[0].script}\n})()`,
      {
        ALL_TOOLS: [],
        tools: {},
        text: value => emitted.push(value),
      },
      { timeout: 1000 },
    ),
    /M02_ROUTE_UNAVAILABLE/,
  )
  assert.deepEqual(emitted, [])
  assert.equal(refused.reservations.length, 1)
})

test('P00 source-shaped failure requires zero turn/provider effects and correlated cleanup', () => {
  const error = inspectP00RequiredMcpError({
    code: -32603,
    message: 'error creating thread: required MCP servers failed to initialize: appraise_m02',
  })
  assert.equal(error.accepted, true)
  const counts = Object.fromEntries(Object.keys(POLICY.aggregate).map(kind => [kind, 0]))
  Object.assign(counts, {
    codexStarts: 1,
    mcpStarts: 1,
    threadStarts: 1,
    listenerStarts: 1,
    providerRequests: 0,
    scopedCalls: 0,
    canonicalRequests: 0,
    auditRequests: 0,
    outerCalls: 0,
  })
  const receipt = event => ({
    schema: 'appraise.m02-ta-matrix-child-receipt/v1',
    caseId: 'P00',
    evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
    event,
  })
  const evidence = {
    rpcError: error,
    journal: { activeCase: 'P00', fenced: false, counts },
    startupReceipt: receipt('required-failure-selected'),
    exitReceipt: { ...receipt('node-exit-handler'), exitCode: 1 },
    ownedCodexExit: { exit: { code: 0, signal: null }, close: { code: 0, signal: null } },
  }
  assert.equal(verifyP00Completion(evidence).accepted, true)
  assert.equal(
    verifyP00Completion({ ...evidence, journal: { ...evidence.journal, counts: { ...counts, providerRequests: 1 } } })
      .accepted,
    false,
  )
  assert.equal(verifyP00Completion({ ...evidence, ownedCodexExit: null }).accepted, false)
})

test('B14 generated native script accepts only an evidence-correlated empty denial', async () => {
  const plan = prepareNativeCase('B14')
  const emitted = [],
    calls = []
  const denial = '{"permissions":{"network":null,"file_system":null},"scope":"turn"}'
  await vm.runInNewContext(
    `(async()=>{${plan.script}\n})()`,
    {
      ALL_TOOLS: [{ name: plan.operation }],
      tools: {
        [plan.operation]: async args => {
          calls.push(args)
          return denial
        },
      },
      text: value => emitted.push(value),
    },
    { timeout: 1000 },
  )
  assert.equal(calls.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), plan.argument)
  const output = [
    {
      type: 'custom_tool_call_output',
      call_id: plan.callId,
      output: [
        { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
        { type: 'input_text', text: emitted[0] },
      ],
    },
  ]
  const permissionEvidence = {
    callId: plan.callId,
    requests: 1,
    replies: 1,
    requestResolved: true,
    requestedNetworkEnabled: true,
    threadTurnCorrelated: true,
    reply: B14_PROFILE.reply,
  }
  const checked = verifyNativeContinuation({ plan, input: output, permissionEvidence })
  assert.equal(checked.status, 'EMPTY_PERMISSION_DENIAL_CORRELATED')
  assert.equal(checked.grants, 0)
  assert.equal(checked.runtimeQualified, false)
  assert.throws(
    () => verifyNativeContinuation({ plan, input: output, permissionEvidence: { ...permissionEvidence, replies: 0 } }),
    /PERMISSION_HOST_EVIDENCE/,
  )
})

test('B14 r23 offline descriptor reaches the real two-response native session and terminal ACK', () => {
  const seal = loadSealedRouteEvidence()
  const request = syntheticB14Request(seal)
  const receipts = []
  const reserved = []
  const acknowledged = []
  let evidence = null
  const session = createB14NativeSession({
    seal,
    expectedConfigSha256: request.expectedConfigSha256,
    permissionEvidence: () => evidence,
    writeReceipt: (name, value) => receipts.push({ name, value }),
    journal: {
      reserve: (kind, id) => reserved.push({ kind, id }),
      acknowledge: id => acknowledged.push(id),
    },
  })
  const first = session.handle(request)
  assert.equal(first.status, 200)
  assert.throws(() => session.handle(request), /outer ACK/)
  first.afterWrite()
  evidence = syntheticB14PermissionEvidence(session.plan)
  const body = { ...request.body, input: [...request.body.input, syntheticB14Output(session.plan)] }
  const second = session.handle({ ...request, body, bodyBytes: Buffer.from(JSON.stringify(body)) })
  assert.equal(second.receipt.nativeStatus, 'EMPTY_PERMISSION_DENIAL_CORRELATED')
  assert.match(second.body, /SYNTHETIC_PERMISSION_DENIED/)
  second.afterWrite()
  assert.equal(session.snapshot().completed, true)
  assert.equal(session.snapshot().grants, 0)
  assert.deepEqual(reserved, [{ kind: 'outerCalls', id: 'B14-outer-1' }])
  assert.deepEqual(acknowledged, ['B14-outer-1'])
  assert.deepEqual(
    receipts.map(item => item.name),
    ['script-plan', 'provider-response-1', 'provider-response-2'],
  )
  assert.throws(() => session.handle(request), /no resend/)
})

test('durable T2 case deadline fences and preserves unresolved journal for explicit cleanup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appraise-r23-offline-deadline-'))
  fs.chmodSync(root, 0o700)
  let journal
  try {
    journal = DurablePhaseJournal.create({ directory: root, phase: 'T2' })
    journal.begin('B01')
    journal._now = () => Date.parse(journal.snapshot().caseStartedAt) + POLICY.deadlineMs.case + 1
    assert.throws(() => journal.reserve('providerRequests', 'offline-late-1'), /deadline exceeded/)
    assert.equal(journal.snapshot().reason, 'DEADLINE')
    assert.equal(journal.snapshot().fenced, true)
    assert.equal(journal.snapshot().counts.B01.providerRequests, 0)
    assert.equal(fs.existsSync(path.join(root, 'phase-journal.jsonl')), true)
  } finally {
    journal?.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
