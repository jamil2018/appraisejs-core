import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {
  prepareNativeCase,
  verifyNativeContinuation,
  B14_PROFILE,
} from './fixtures/codex-app-server-m02-ta-native-plans-r10/plans.mjs'

function output(plan, result) {
  return [
    {
      type: 'custom_tool_call_output',
      call_id: plan.callId,
      output: [
        { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
        {
          type: 'input_text',
          text: JSON.stringify({
            schema: 'appraise.m02-native-envelope/v1',
            caseId: plan.caseId,
            callId: plan.callId,
            operation: plan.operation,
            result,
          }),
        },
      ],
    },
  ]
}
function workspace(plan) {
  return {
    relativePath: plan.relativePath,
    absentBefore: true,
    ownedRegularSingleLink: true,
    bytes: plan.expectedBytes,
  }
}
function permissions(plan) {
  return {
    callId: plan.callId,
    requests: 1,
    replies: 1,
    requestResolved: true,
    requestedNetworkEnabled: true,
    threadTurnCorrelated: true,
    reply: B14_PROFILE.reply,
  }
}

test('finite native scripts each await exactly one mock tool and emit one envelope', async () => {
  for (const caseId of ['B14', 'N01', 'N02']) {
    const plan = prepareNativeCase(caseId),
      calls = [],
      outputs = []
    const result =
      caseId === 'N02'
        ? {}
        : caseId === 'B14'
          ? '{"permissions":{"network":null,"file_system":null},"scope":"turn"}'
          : { exit_code: 0, wall_time_seconds: 0.01, output: plan.expectedBytes }
    await vm.runInNewContext(`(async()=>{${plan.script}\n})()`, {
      ALL_TOOLS: [{ name: plan.operation }],
      tools: {
        [plan.operation]: async args => {
          calls.push(args)
          return result
        },
      },
      text: value => outputs.push(value),
    })
    assert.equal(calls.length, 1)
    assert.equal(outputs.length, 1)
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), plan.argument)
    assert.equal(plan.item.type, 'custom_tool_call')
    assert.equal(plan.runtimeQualified, false)
  }
})
test('B14 requires a correlated actual empty denial and rejects any permission grant', () => {
  const plan = prepareNativeCase('B14')
  const denied = '{"permissions":{"network":null,"file_system":null},"scope":"turn"}'
  assert.equal(
    verifyNativeContinuation({ plan, input: output(plan, denied), permissionEvidence: permissions(plan) }).grants,
    0,
  )
  for (const result of [
    '{"permissions":{"network":{"enabled":true}},"scope":"turn"}',
    '{"permissions":{},"scope":"session"}',
    '{"permissions":{},"scope":"turn","strict_auto_review":true}',
  ])
    assert.throws(
      () => verifyNativeContinuation({ plan, input: output(plan, result), permissionEvidence: permissions(plan) }),
      /GRANT_OR_UNEXPECTED/,
    )
  for (const patch of [
    { replies: 0 },
    { requests: 2 },
    { requestedNetworkEnabled: false },
    { threadTurnCorrelated: false },
    { requestResolved: false },
    { reply: { permissions: { network: { enabled: true } }, scope: 'turn' } },
  ])
    assert.throws(
      () =>
        verifyNativeContinuation({
          plan,
          input: output(plan, denied),
          permissionEvidence: { ...permissions(plan), ...patch },
        }),
      /PERMISSION_HOST_EVIDENCE/,
    )
})
test('N01 requires exited one-shot result and independent exact workspace bytes', () => {
  const plan = prepareNativeCase('N01')
  const result = { exit_code: 0, wall_time_seconds: 0.01, output: plan.expectedBytes }
  assert.equal(
    verifyNativeContinuation({ plan, input: output(plan, result), workspaceEvidence: workspace(plan) }).status,
    'FIXED_WORKSPACE_EFFECT_CORRELATED',
  )
  for (const patch of [{ exit_code: 1 }, { session_id: 2 }, { original_token_count: 999 }, { output: 'different' }])
    assert.throws(
      () =>
        verifyNativeContinuation({
          plan,
          input: output(plan, { ...result, ...patch }),
          workspaceEvidence: workspace(plan),
        }),
      /COMMAND_NOT_COMPLETED/,
    )
  assert.throws(
    () =>
      verifyNativeContinuation({
        plan,
        input: output(plan, result),
        workspaceEvidence: { ...workspace(plan), absentBefore: false },
      }),
    /WORKSPACE_EVIDENCE/,
  )
  assert.equal(plan.argument.shell, '/bin/sh')
  assert.equal(plan.argument.login, false)
  assert.equal(plan.argument.sandbox_permissions, 'use_default')
})
test('N02 uses source-backed empty Code Mode projection and verifies effect separately', () => {
  const plan = prepareNativeCase('N02')
  assert.equal(
    verifyNativeContinuation({ plan, input: output(plan, {}), workspaceEvidence: workspace(plan) }).status,
    'FIXED_WORKSPACE_EFFECT_CORRELATED',
  )
  assert.throws(
    () => verifyNativeContinuation({ plan, input: output(plan, 'Success'), workspaceEvidence: workspace(plan) }),
    /PATCH_RESULT_PROJECTION/,
  )
  assert.throws(
    () =>
      verifyNativeContinuation({
        plan,
        input: output(plan, {}),
        workspaceEvidence: { ...workspace(plan), bytes: 'unexpected\n' },
      }),
    /WORKSPACE_EVIDENCE/,
  )
})
test('forged plans, duplicates, yield and extra output cannot qualify native effects', () => {
  const plan = prepareNativeCase('N02')
  assert.throws(
    () => verifyNativeContinuation({ plan: { ...plan }, input: output(plan, {}), workspaceEvidence: workspace(plan) }),
    /UNISSUED/,
  )
  const input = output(plan, {})
  assert.throws(
    () => verifyNativeContinuation({ plan, input: [...input, ...input], workspaceEvidence: workspace(plan) }),
    /EXTRA_OR_MISSING_CONTINUATION/,
  )
  input[0].output[0].text = 'Script running with cell ID abc\n'
  assert.throws(() => verifyNativeContinuation({ plan, input, workspaceEvidence: workspace(plan) }), /INCOMPLETE/)
  const duplicate = output(plan, {})
  duplicate[0].output[1].text = duplicate[0].output[1].text.replace('"result":{}', '"result":{},"result":{}')
  assert.throws(
    () => verifyNativeContinuation({ plan, input: duplicate, workspaceEvidence: workspace(plan) }),
    /DUPLICATE_KEY/,
  )
})
test('foreign outer outputs are rejected and supplied evidence never qualifies runtime by itself', () => {
  const plan = prepareNativeCase('N02')
  const input = output(plan, {})
  assert.throws(
    () =>
      verifyNativeContinuation({
        plan,
        input: [...input, { ...input[0], call_id: 'foreign' }],
        workspaceEvidence: workspace(plan),
      }),
    /EXTRA_OR_MISSING_CONTINUATION/,
  )
  const checked = verifyNativeContinuation({ plan, input, workspaceEvidence: workspace(plan) })
  assert.equal(checked.runtimeQualified, false)
  assert.equal(checked.evidenceProvenance, 'SUPPLIED_REQUIRES_TRUSTED_RUNTIME_ISSUER')
})
