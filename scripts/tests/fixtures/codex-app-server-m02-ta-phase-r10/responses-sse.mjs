import { createHash } from 'node:crypto'
import { casePolicy, canonical } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'

const sha = value => createHash('sha256').update(value).digest('hex')
const CALL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const MAX_INPUT = 16 * 1024
const MAX_BODY = 64 * 1024
const MAX_TEXT = 256
const exactKeys = (object, keys) =>
  object &&
  typeof object === 'object' &&
  !Array.isArray(object) &&
  Object.keys(object).sort().join('|') === [...keys].sort().join('|')
const checkedString = (value, maximum) => typeof value === 'string' && Buffer.byteLength(value) <= maximum
const sse = events => {
  const body = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  if (Buffer.byteLength(body) > MAX_BODY) throw new Error('SSE body ceiling exceeded')
  return body
}

export function scriptDigest(plan) {
  return sha(canonical(plan))
}
export function makeCustomToolEvents({ responseId, callId, input }) {
  if (!CALL_ID.test(responseId) || !CALL_ID.test(callId) || !checkedString(input, MAX_INPUT))
    throw new Error('invalid custom-tool event')
  const item = {
    id: `item-${callId}`,
    type: 'custom_tool_call',
    call_id: callId,
    name: 'exec',
    namespace: 'functions',
    input,
    status: 'completed',
  }
  return [
    { type: 'response.created', response: { id: responseId, status: 'in_progress' } },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: responseId, status: 'completed', output: [item] } },
  ]
}
export function makeTerminalEvents({ responseId, text }) {
  if (!CALL_ID.test(responseId) || !checkedString(text, MAX_TEXT)) throw new Error('invalid terminal event')
  const item = {
    id: `item-${responseId}`,
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }],
  }
  return [
    { type: 'response.created', response: { id: responseId, status: 'in_progress' } },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: responseId, status: 'completed', output: [item] } },
  ]
}

// Inert body composer. Its hooks must be bound to separately reviewed, hash-pinned
// descriptor and codec modules by the eventual supervisor. This module never sends HTTP.
export class FiniteBufferedResponses {
  constructor({ caseId, plan, planSha256, validateDescriptor, decodeResult }) {
    this.policy = casePolicy(caseId)
    if (caseId === 'P00') throw new Error('P00 has zero provider requests and zero turns')
    if (caseId === 'B14') throw new Error('B14 current permission route is not qualified')
    if (typeof validateDescriptor !== 'function' || typeof decodeResult !== 'function')
      throw new Error('reviewed hooks required')
    if (
      !exactKeys(plan, ['caseId', 'calls', 'terminalText']) ||
      plan.caseId !== caseId ||
      !Array.isArray(plan.calls) ||
      !checkedString(plan.terminalText, MAX_TEXT)
    )
      throw new Error('invalid pinned script plan')
    const callMaximum = this.policy.limits.scopedCalls || (this.policy.phase === 'T3' ? 1 : 0)
    const scriptedCalls = this.policy.phase === 'T2' ? this.policy.script.operations.length : callMaximum
    if (
      plan.calls.length !== scriptedCalls ||
      plan.calls.length > callMaximum ||
      plan.calls.length + 1 > this.policy.limits.providerRequests
    )
      throw new Error('script does not match case ceilings')
    const ids = new Set()
    for (const call of plan.calls) {
      if (
        !exactKeys(call, ['callId', 'input']) ||
        !CALL_ID.test(call.callId) ||
        !checkedString(call.input, MAX_INPUT) ||
        ids.has(call.callId)
      )
        throw new Error('invalid planned custom call')
      ids.add(call.callId)
    }
    if (!/^[a-f0-9]{64}$/.test(planSha256) || scriptDigest(plan) !== planSha256) throw new Error('script pin mismatch')
    this.plan = structuredClone(plan)
    this.validateDescriptor = validateDescriptor
    this.decodeResult = decodeResult
    this.index = 0
    this.pendingCallId = null
    this.usedCallIds = new Set()
    this.fenced = false
    this.completed = false
    this.receipts = []
  }
  fail(reason = 'UNKNOWN') {
    this.fenced = true
    this.reason = reason
    return { status: 'UNKNOWN', reason }
  }
  next({ descriptor, request }) {
    if (this.fenced || this.completed) throw new Error('script fenced or complete; no resend')
    if (this.index >= this.policy.limits.providerRequests) return this.fail('BUDGET')
    try {
      // Validation precedes all scripted bytes, including terminal responses.
      if (this.validateDescriptor(descriptor) !== true) return this.fail('DESCRIPTOR')
      if (this.pendingCallId === null) {
        if (
          !exactKeys(request, ['input']) ||
          !Array.isArray(request.input) ||
          request.input.length > 16 ||
          Buffer.byteLength(JSON.stringify(request.input)) > MAX_BODY ||
          request.input.some(
            item =>
              item &&
              typeof item === 'object' &&
              ['custom_tool_call_output', 'function_call_output'].includes(item.type),
          )
        )
          return this.fail('UNEXPECTED_CONTINUATION')
      } else {
        if (!exactKeys(request, ['input']) || !Array.isArray(request.input) || request.input.length !== 1)
          return this.fail('CONTINUATION_SHAPE')
        const output = request.input[0]
        if (
          !exactKeys(output, ['type', 'call_id', 'output']) ||
          output.type !== 'custom_tool_call_output' ||
          output.call_id !== this.pendingCallId
        )
          return this.fail('CALL_ID_MISMATCH')
        if (this.usedCallIds.has(output.call_id)) return this.fail('DUPLICATE_OUTPUT')
        if (Buffer.byteLength(JSON.stringify(output.output)) > MAX_BODY) return this.fail('OUTPUT_CEILING')
        if (this.decodeResult(output.output, { caseId: this.policy.id, callId: this.pendingCallId }) !== true)
          return this.fail('RESULT_CODEC')
        this.usedCallIds.add(this.pendingCallId)
        this.pendingCallId = null
      }
      const responseId = `${this.policy.id}-response-${this.index + 1}`
      const call = this.plan.calls[this.index]
      const events = call
        ? makeCustomToolEvents({ responseId, callId: call.callId, input: call.input })
        : makeTerminalEvents({ responseId, text: this.plan.terminalText })
      const body = sse(events)
      if (call) this.pendingCallId = call.callId
      else this.completed = true
      this.index++
      this.receipts.push({ responseIndex: this.index, responseSha256: sha(body), callId: call?.callId ?? null })
      return { status: 'READY', body, bodySha256: sha(body), responseIndex: this.index }
    } catch {
      return this.fail('PRODUCER_ERROR')
    }
  }
  snapshot() {
    return structuredClone({
      caseId: this.policy.id,
      emitted: this.index,
      pendingCallId: this.pendingCallId,
      fenced: this.fenced,
      completed: this.completed,
      receipts: this.receipts,
    })
  }
}
