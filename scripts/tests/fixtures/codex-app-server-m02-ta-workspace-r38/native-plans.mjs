/** Relocated finite N01/N02 plans; no I/O, launch, grant or runtime qualification. */
import { createHash } from 'node:crypto'
import { parseStrictJson } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'

const plans = new WeakMap()
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const fail = reason => {
  throw new Error(`M02_NATIVE_PLAN_${reason}`)
}
export const NATIVE_PINS = Object.freeze({
  shell: Object.freeze({ path: '/bin/sh', sha256: '84ca7f9b83021621e16059a1c7850df72a462d879e8239d566236ca6ddd00953' }),
  sandboxLauncher: Object.freeze({
    path: '/usr/bin/sandbox-exec',
    sha256: '58839ef01b4eef8aac0d2aa8f9d1c074ae45aafe3533965b030672450064acc8',
  }),
})
export function prepareNativeCase(caseId) {
  if (!['N01', 'N02'].includes(caseId)) fail('CASE')
  const operation = caseId === 'N01' ? 'exec_command' : 'apply_patch'
  const callId = `m02_${caseId}_0`
  const workspace = `/private/tmp/appraise-m02-ta-workspace-p2/cases/${caseId}/workspace`
  const relativePath = caseId === 'N01' ? 'scratch/n01.txt' : 'scratch/n02.txt'
  const expectedBytes = caseId === 'N01' ? 'M02-TA-N01\n' : 'M02-TA-N02\n'
  const argument =
    caseId === 'N01'
      ? {
          cmd: "printf 'M02-TA-N01\\n' > scratch/n01.txt && IFS= read -r value < scratch/n01.txt && test \"$value\" = 'M02-TA-N01' && printf '%s\\n' \"$value\"",
          workdir: workspace,
          shell: '/bin/sh',
          login: false,
          tty: false,
          yield_time_ms: 10000,
          max_output_tokens: 128,
          sandbox_permissions: 'use_default',
        }
      : '*** Begin Patch\n*** Add File: scratch/n02.txt\n+M02-TA-N02\n*** End Patch'
  const envelope = { schema: 'appraise.m02-native-envelope/v1', caseId, callId, operation }
  const script = [
    '// @exec: {"yield_time_ms": 10000, "max_output_tokens": 10000}',
    `const name = ${JSON.stringify(operation)};`,
    'if (!Array.isArray(ALL_TOOLS) || ALL_TOOLS.length > 4096 || ALL_TOOLS.filter(item => item.name === name).length !== 1 || typeof tools[name] !== "function") throw new Error("M02_NATIVE_ROUTE_UNAVAILABLE");',
    `const result = await tools[name](${JSON.stringify(argument)});`,
    `text(JSON.stringify({...${JSON.stringify(envelope)},result}));`,
  ].join('\n')
  const plan = Object.freeze({
    caseId,
    callId,
    operation,
    argument: typeof argument === 'string' ? argument : Object.freeze(argument),
    script,
    scriptSha256: createHash('sha256').update(script).digest('hex'),
    relativePath,
    expectedBytes,
    runtimeQualified: false,
    item: Object.freeze({
      type: 'custom_tool_call',
      name: 'exec',
      namespace: 'functions',
      call_id: callId,
      input: script,
    }),
  })
  plans.set(plan, hash(plan))
  return plan
}

/**
 * Conditional offline check. The caller validates the full provider transcript before passing
 * its single current output, and independently establishes supplied evidence provenance.
 */
export function verifyNativeContinuation({ plan, input, workspaceEvidence = null }) {
  if (!plan || plans.get(plan) !== hash(plan)) fail('UNISSUED_OR_CHANGED_PLAN')
  if (!Array.isArray(input) || input.length !== 1) fail('EXTRA_OR_MISSING_CONTINUATION')
  const outputs = input.filter(item => item?.type === 'custom_tool_call_output' && item.call_id === plan.callId)
  if (outputs.length !== 1) fail('OUTER_CORRELATION')
  const output = outputs[0]
  if (
    !Object.keys(output).every(key => ['type', 'call_id', 'output', 'id', 'name'].includes(key)) ||
    (output.name != null && output.name !== 'exec')
  )
    fail('OUTPUT_FIELDS')
  if (
    !Array.isArray(output.output) ||
    output.output.length !== 2 ||
    !output.output.every(
      item => record(item) && Object.keys(item).sort().join() === 'text,type' && item.type === 'input_text',
    )
  )
    fail('OUTPUT_CONTENT')
  const [header, body] = output.output
  if (
    !/^Script completed\nWall time (?:\d+\.\d seconds|\d+\.\d{3} seconds \(code-mode \d+\.\d{3} seconds; overhead -?\d+\.\d{3} seconds\))\nOutput:\n$/.test(
      header.text,
    )
  )
    fail('INCOMPLETE_OR_TRUNCATED')
  if (typeof header.text !== 'string' || typeof body.text !== 'string') fail('OUTPUT_TEXT')
  if (Buffer.byteLength(body.text) > 16384) fail('RESULT_BOUND')
  const envelope = parseStrictJson(body.text)
  if (
    !record(envelope) ||
    Object.keys(envelope).sort().join() !== 'callId,caseId,operation,result,schema' ||
    envelope.schema !== 'appraise.m02-native-envelope/v1' ||
    ['caseId', 'callId', 'operation'].some(key => envelope[key] !== plan[key])
  )
    fail('ENVELOPE')
  if (
    !workspaceEvidence ||
    workspaceEvidence.relativePath !== plan.relativePath ||
    workspaceEvidence.absentBefore !== true ||
    workspaceEvidence.ownedRegularSingleLink !== true ||
    workspaceEvidence.bytes !== plan.expectedBytes
  )
    fail('WORKSPACE_EVIDENCE')
  if (plan.caseId === 'N01') {
    const result = envelope.result
    if (!record(result)) fail('COMMAND_RESULT_SHAPE')
    if (
      !Object.keys(result).every(key =>
        ['chunk_id', 'wall_time_seconds', 'exit_code', 'original_token_count', 'output'].includes(key),
      )
    )
      fail('COMMAND_RESULT_FIELDS')
    if (result.exit_code !== 0) fail('COMMAND_EXIT_NOT_ZERO')
    if (!Number.isFinite(result.wall_time_seconds) || result.wall_time_seconds < 0) fail('COMMAND_DURATION')
    // The pinned normal exec_command path always supplies Some(count), even for untruncated output.
    if (!Number.isSafeInteger(result.original_token_count) || result.original_token_count < 0)
      fail('COMMAND_TOKEN_COUNT')
    if (result.output !== plan.expectedBytes) fail('COMMAND_OUTPUT')
  } else if (!record(envelope.result) || Object.keys(envelope.result).length !== 0) fail('PATCH_RESULT_PROJECTION')
  return Object.freeze({
    status: 'FIXED_WORKSPACE_EFFECT_CORRELATED',
    calls: 1,
    relativePath: plan.relativePath,
    contentSha256: createHash('sha256').update(plan.expectedBytes).digest('hex'),
    runtimeQualified: false,
    evidenceProvenance: 'SUPPLIED_REQUIRES_TRUSTED_RUNTIME_ISSUER',
  })
}

export const NATIVE_SOURCE_LIMITS = Object.freeze({
  providerRequests: 2,
  outerCalls: 1,
  workspaceActions: 1,
  scopedCalls: 0,
  auditRequests: 0,
  retries: 0,
  additionalSessions: 0,
})
export const NATIVE_CONTRACT_STATUS = 'UNQUALIFIED_REQUIRES_PINNED_HANDLER_CONTRACT_AND_ACTUAL_RUNTIME_EVIDENCE'
