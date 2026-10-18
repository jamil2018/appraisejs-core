/** Offline, finite Code Mode wire codec. This module performs no I/O or dispatch. */
import { createHash } from 'node:crypto'

const operations = new Set([
  'quality_journey_analysis_get',
  'quality_journey_external_analyzer_analysis_submit_v1',
  'quality_journey_discovery_get',
  'quality_journey_external_scout_target_observation_submit_v1',
  'operation_search',
  'quality_journey_external_resource_explorer_resolution_submit_v1',
  'quality_journey_scenarios_get',
  'quality_journey_external_scenarios_submit_v1',
  'quality_journey_external_automator_materialize_v1',
  'quality_journey_triage_get',
  'quality_journey_triage_evidence_read',
  'quality_journey_external_triage_submit_v1',
])
const absent = new Set([
  'quality_journey_analysis_answer',
  'quality_journey_analysis_decide',
  'quality_journey_command_submit',
  'quality_journey_execution_start',
  'quality_journey_external_work_claim_v1',
  'quality_journey_get',
])
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exact = (value, keys) => record(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const fail = reason => {
  throw new Error(`M02_CODEC_${reason}`)
}
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical)
  if (!record(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonical(value[key])]),
  )
}
export const digest = value =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')

const issuedPlans = new WeakMap()

export const CODEC_SOURCE = Object.freeze({
  commit: '4ebc485ca321243727539187169425fcf972f2c4',
  nestedResultPath: 'codex-rs/tools/src/tool_output.rs',
  nestedResultSha256: '559741bf52f2bea40e91dcb59b6cd3ecb668017ae2e89f9ca16c697d54a57d1c',
  nestedResultEvidence: 'PUBLIC_SOURCE_READ_TO_STDOUT_NO_CACHE_WRITE',
  projection: 'SERIALIZED_MCP_CALL_TOOL_RESULT_WITHOUT_TOP_LEVEL_META',
  installedBinarySourceProvenance: 'UNATTESTED',
})

function boundedJson(value, maxBytes = 48 * 1024) {
  const seen = new Set()
  const inspect = (item, depth = 0) => {
    if (depth > 16) fail('JSON_DEPTH')
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return
    if (typeof item === 'number' && Number.isFinite(item)) return
    if (typeof item !== 'object' || seen.has(item)) fail('INVALID_JSON')
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      fail('JSON_PROTOTYPE')
    seen.add(item)
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (Array.isArray(item) && key === 'length') continue
      if (!('value' in descriptor) || ['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key))
        fail('JSON_PROPERTY')
      inspect(descriptor.value, depth + 1)
    }
    seen.delete(item)
  }
  inspect(value)
  let text
  try {
    text = JSON.stringify(value)
  } catch {
    fail('INVALID_JSON')
  }
  if (typeof text !== 'string' || Buffer.byteLength(text) > maxBytes) fail('JSON_BOUND')
  const parsed = JSON.parse(text)
  if (digest(parsed) !== digest(value)) fail('LOSSY_JSON')
  return text
}

/** Generator validates only a finite logical operation; role/schema authority is a separate gate. */
export function prepareCodeModeCall({ caseId, index, operation, args, rejection = false }) {
  if (!/^(B0[1-6]|B07-A(?:0[1-9]|1[0-4])|B07-D01|B07-T01)$/.test(caseId ?? '')) fail('CASE')
  if (!Number.isSafeInteger(index) || index < 0 || index > 2) fail('INDEX')
  if (!record(args)) fail('ARGUMENT_SHAPE')
  if (!(rejection ? absent : operations).has(operation)) fail('OPERATION')
  if (rejection && (!/^B07-A(?:09|1[0-4])$/.test(caseId) || index !== 0)) fail('REJECTION_CASE')
  if (rejection && [...absent][Number(caseId.slice(-2)) - 9] !== operation) fail('REJECTION_OPERATION')
  const argsJson = boundedJson(args)
  const callId = `m02_${caseId.replaceAll('-', '_')}_${index}`
  const name = `mcp__appraise_m02__${operation}`
  const envelope = { schema: 'appraise.m02-code-mode-envelope/v1', caseId, index, callId, operation }
  // No tool search, dynamic eval, extra call, retry, wait, console, filesystem or network API.
  // Names and arguments are JSON literals; user-controlled characters cannot become JavaScript.
  const script = [
    '// @exec: {"yield_time_ms": 10000, "max_output_tokens": 10000}',
    `const name = ${JSON.stringify(name)};`,
    'if (!Array.isArray(ALL_TOOLS) || ALL_TOOLS.length > 4096) throw new Error("M02_REGISTRY_BOUND");',
    'const entries = ALL_TOOLS.filter(item => item.name === name);',
    ...(rejection
      ? [
          'if (entries.length !== 0 || typeof tools[name] !== "undefined") throw new Error("M02_UNEXPECTED_ROUTE");',
          // Registry absence is observed without pretending a nonexistent tool was dispatched.
          `text(JSON.stringify({...${JSON.stringify(envelope)}, disposition:"CODE_MODE_REGISTRY_ABSENT", result:null}));`,
        ]
      : [
          'if (entries.length !== 1 || typeof tools[name] !== "function") throw new Error("M02_ROUTE_UNAVAILABLE");',
          `const result = await tools[name](${argsJson});`,
          `text(JSON.stringify({...${JSON.stringify(envelope)}, disposition:"MCP_RESULT", result}));`,
        ]),
  ].join('\n')
  const planned = Object.freeze({
    status: 'OFFLINE_SCRIPT_PREPARED',
    caseId,
    index,
    callId,
    operation,
    normalizedName: name,
    argumentsHash: digest(args),
    script,
    scriptSha256: createHash('sha256').update(script).digest('hex'),
    rejection,
    runtimeQualified: false,
    item: Object.freeze({
      type: 'custom_tool_call',
      name: 'exec',
      namespace: 'functions',
      call_id: callId,
      input: script,
    }),
  })
  issuedPlans.set(planned, digest(planned))
  return planned
}

/** Exact text-only framing for the reviewed completed Code Mode output; no lossy joins. */
export function decodeCodeModeContinuation({ input, planned, audit }) {
  if (!Array.isArray(input) || input.length > 256 || !planned || planned.runtimeQualified !== false) fail('INPUT')
  if (issuedPlans.get(planned) !== digest(planned)) fail('UNISSUED_OR_CHANGED_PLAN')
  const matches = input.filter(item => item?.type === 'custom_tool_call_output' && item.call_id === planned.callId)
  if (matches.length !== 1) fail('OUTER_CORRELATION')
  const item = matches[0]
  if (!Object.keys(item).every(key => ['type', 'call_id', 'output', 'id', 'name'].includes(key))) fail('OUTPUT_FIELDS')
  if (item.name !== undefined && item.name !== null && item.name !== 'exec') fail('OUTPUT_NAME')
  if (!Array.isArray(item.output) || item.output.length !== 2) fail('OUTPUT_CONTENT')
  const [header, payload] = item.output
  if (![header, payload].every(part => exact(part, ['type', 'text']) && part.type === 'input_text'))
    fail('OUTPUT_MEDIA')
  const simple = /^Script completed\nWall time \d+\.\d seconds\nOutput:\n$/
  const measured =
    /^Script completed\nWall time \d+\.\d{3} seconds \(code-mode \d+\.\d{3} seconds; overhead -?\d+\.\d{3} seconds\)\nOutput:\n$/
  if (!simple.test(header.text) && !measured.test(header.text)) fail('NOT_COMPLETED_OR_BAD_HEADER')
  if (Buffer.byteLength(payload.text) > 64 * 1024) fail('RESULT_BOUND')
  let envelope
  try {
    envelope = JSON.parse(payload.text)
  } catch {
    fail('RESULT_JSON')
  }
  if (!exact(envelope, ['schema', 'caseId', 'index', 'callId', 'operation', 'disposition', 'result'])) fail('ENVELOPE')
  if (
    envelope.schema !== 'appraise.m02-code-mode-envelope/v1' ||
    ['caseId', 'index', 'callId', 'operation'].some(key => envelope[key] !== planned[key])
  )
    fail('ENVELOPE_CORRELATION')
  if (!Array.isArray(audit)) fail('AUDIT_REQUIRED')
  if (planned.rejection) {
    if (audit.length !== 0 || envelope.disposition !== 'CODE_MODE_REGISTRY_ABSENT' || envelope.result !== null)
      fail('ABSENCE_DISPATCHED')
    return Object.freeze({
      status: 'NO_MCP_DISPATCH',
      firstLayer: 'CODE_MODE_REGISTRY_ABSENT',
      logicalAttempts: 1,
      scopedDispatches: 0,
      endpointError: 'NOT_OBSERVED',
    })
  }
  if (audit.length !== 1 || envelope.disposition !== 'MCP_RESULT') fail('SCOPED_AUDIT_COUNT')
  const observed = audit[0]
  if (
    observed.callId !== planned.callId ||
    observed.normalizedName !== planned.normalizedName ||
    !(
      (typeof observed.id === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(observed.id)) ||
      (Number.isSafeInteger(observed.id) && observed.id >= 0)
    ) ||
    observed.operation !== planned.operation ||
    observed.argumentsHash !== planned.argumentsHash ||
    observed.complete !== true ||
    !record(observed.result)
  )
    fail('SCOPED_AUDIT_CORRELATION')
  const projection = { ...observed.result }
  delete projection._meta
  if (digest(projection) !== digest(envelope.result)) fail('NESTED_RESULT_MISMATCH')
  return Object.freeze({
    status: 'RESULT_CORRELATED',
    logicalAttempts: 1,
    scopedDispatches: 1,
    result: envelope.result,
    resultHash: digest(envelope.result),
    evidenceClass: 'SCOPED_AUDIT_CORRELATION_REQUIRES_CANONICAL_OUTCOME',
  })
}
