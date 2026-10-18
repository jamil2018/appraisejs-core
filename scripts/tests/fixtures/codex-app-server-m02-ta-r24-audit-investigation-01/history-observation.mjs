/** Fixed private R24 history observation. Never returns raw text, names, errors or payload values. */
import fs from 'node:fs'
import path from 'node:path'
import { parseStrictJson } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { prepareCodeModeCall } from '../codex-app-server-m02-ta-codec-r10/codec.mjs'
import { classifyOutputObservation } from '../codex-app-server-m02-ta-matrix-r24/continuation-diagnostic.mjs'

export const FIXED_HISTORY =
  '/private/tmp/appraise-m02-ta-matrix-p10/cases/B01/codex/sessions/2026/10/17/rollout-2026-10-17T17-02-47-01a14987-514a-7602-8230-99e03a495526.jsonl'
const MAX = 1024 * 1024
const plan = prepareCodeModeCall({ caseId: 'B01', index: 0, operation: 'quality_journey_analysis_get', args: {} })
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const shape = value =>
  value === null
    ? 'NULL'
    : Array.isArray(value)
      ? 'ARRAY'
      : object(value)
        ? 'OBJECT'
        : typeof value === 'string'
          ? 'STRING'
          : ['boolean', 'number'].includes(typeof value)
            ? 'SCALAR'
            : 'UNAVAILABLE'
const count = n => (n === 0 ? 'ZERO' : n === 1 ? 'ONE' : 'MULTIPLE')

export function observeR24History(source) {
  const result = {
    schema: 'appraise.m02-r24-private-history-observation/v1',
    evidenceClass: 'RETAINED_PRIVATE_HISTORY_NOT_PROVIDER_REQUEST_ATTESTATION',
    status: 'REFUSED',
    calls: 'ZERO',
    outputs: 'ZERO',
    scriptCorrelation: 'UNAVAILABLE',
    outputShape: 'UNAVAILABLE',
    outputStatus: 'OTHER',
    scriptFailureMarker: 'OTHER',
    envelopeCorrelation: 'UNAVAILABLE',
    resultShape: 'UNAVAILABLE',
    isError: 'UNAVAILABLE',
    contentShape: 'UNAVAILABLE',
    structuredContent: 'UNAVAILABLE',
  }
  try {
    if (typeof source !== 'string' || Buffer.byteLength(source) > MAX || !source.endsWith('\n')) return result
    const lines = source.slice(0, -1).split('\n')
    if (lines.length > 4096) return result
    const records = lines.map(line => parseStrictJson(line))
    const items = records.filter(row => row?.type === 'response_item').map(row => row.payload)
    const calls = items.filter(item => item?.type === 'custom_tool_call' && item.call_id === plan.callId)
    const outputs = items.filter(item => item?.type === 'custom_tool_call_output' && item.call_id === plan.callId)
    result.calls = count(calls.length)
    result.outputs = count(outputs.length)
    if (calls.length !== 1 || outputs.length !== 1) return result
    const call = calls[0]
    result.scriptCorrelation =
      call.input === plan.script && call.name === 'exec'
        ? call.namespace === 'functions'
          ? 'EXACT'
          : call.namespace === undefined
            ? 'EXACT_SCRIPT_NAMESPACE_ABSENT'
            : 'OTHER'
        : 'OTHER'
    if (!['EXACT', 'EXACT_SCRIPT_NAMESPACE_ABSENT'].includes(result.scriptCorrelation)) return result
    result.status = 'OBSERVED'
    const output = outputs[0].output
    result.outputShape = shape(output)
    const observed = classifyOutputObservation(output)
    result.outputStatus = observed.status
    result.scriptFailureMarker = observed.scriptMarker
    if (
      !Array.isArray(output) ||
      output.length !== 2 ||
      !output.every(x => object(x) && x.type === 'input_text' && typeof x.text === 'string') ||
      Buffer.byteLength(output[1].text) > 65536
    )
      return result
    const envelope = parseStrictJson(output[1].text)
    const keys = 'callId,caseId,disposition,index,operation,result,schema'
    const exact =
      object(envelope) &&
      Object.keys(envelope).sort().join(',') === keys &&
      envelope.schema === 'appraise.m02-code-mode-envelope/v1' &&
      envelope.caseId === 'B01' &&
      envelope.index === 0 &&
      envelope.callId === plan.callId &&
      envelope.operation === plan.operation &&
      envelope.disposition === 'MCP_RESULT'
    result.envelopeCorrelation = exact ? 'EXACT' : 'OTHER'
    if (!exact) return result
    const nested = envelope.result
    result.resultShape = shape(nested)
    if (!object(nested)) return result
    result.isError = !Object.hasOwn(nested, 'isError')
      ? 'ABSENT'
      : nested.isError === true
        ? 'TRUE'
        : nested.isError === false
          ? 'FALSE'
          : 'INVALID'
    result.contentShape = !Object.hasOwn(nested, 'content')
      ? 'ABSENT'
      : !Array.isArray(nested.content)
        ? 'INVALID'
        : nested.content.length === 0
          ? 'EMPTY'
          : nested.content.every(x => object(x) && x.type === 'text' && typeof x.text === 'string')
            ? 'TEXT_ONLY'
            : 'OTHER'
    result.structuredContent = Object.hasOwn(nested, 'structuredContent') ? 'PRESENT' : 'ABSENT'
    return result
  } catch {
    return { ...result, status: 'REFUSED' }
  }
}

function readWithIO(io) {
  const root = '/private/tmp/appraise-m02-ta-matrix-p10'
  for (let dir = path.dirname(FIXED_HISTORY); ; dir = path.dirname(dir)) {
    const s = io.lstatSync(dir)
    if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid() || (s.mode & 0o777) !== 0o700)
      throw new Error('HISTORY_IDENTITY_REFUSED')
    if (dir === root) break
    if (dir === path.dirname(dir)) throw new Error('HISTORY_ANCESTRY_REFUSED')
  }
  const before = io.lstatSync(FIXED_HISTORY)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    (before.mode & 0o777) !== 0o600 ||
    before.nlink !== 1 ||
    before.size > MAX
  )
    throw new Error('HISTORY_IDENTITY_REFUSED')
  const same = s => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(k => s[k] === before[k])
  const fd = io.openSync(FIXED_HISTORY, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    if (!same(io.fstatSync(fd))) throw new Error('HISTORY_IDENTITY_REFUSED')
    const bytes = io.readFileSync(fd)
    if (bytes.length !== before.size || !same(io.fstatSync(fd)) || !same(io.lstatSync(FIXED_HISTORY)))
      throw new Error('HISTORY_IDENTITY_REFUSED')
    return observeR24History(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('HISTORY_OBSERVATION_REFUSED')
  } finally {
    io.closeSync(fd)
  }
}

/** Test IO is injectable; the actual fixed read supplies no overrides and grants no runtime authority. */
export function readFixedR24History(io = fs) {
  try {
    return readWithIO(io)
  } catch {
    throw new Error('HISTORY_OBSERVATION_REFUSED')
  }
}
