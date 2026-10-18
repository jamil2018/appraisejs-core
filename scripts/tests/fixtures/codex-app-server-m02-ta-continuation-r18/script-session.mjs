/** Bounded synthetic T2 provider session; no socket or native process. */
import { casePolicy } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import {
  prepareCodeModeCall,
  decodeCodeModeContinuation,
  digest as codecDigest,
} from '../codex-app-server-m02-ta-codec-r10/codec.mjs'
import { FiniteBufferedResponses, scriptDigest } from '../codex-app-server-m02-ta-phase-r10/responses-sse.mjs'
import { validateMatrixProviderRequest } from '../codex-app-server-m02-ta-matrix-r10/provider-route-gate.mjs'
import { parseStrictJson } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'

const freeze = value => Object.freeze(value)
const inertTypes = new Set(['message', 'reasoning', 'additional_tools'])

/** Validate every tool-like item in the full provider input before any projection. */
export function validateIssuedTranscript(input, planned, currentIndex, priorOutputHashes) {
  if (!Array.isArray(input) || input.length > 256 || !Number.isSafeInteger(currentIndex) || currentIndex < 0)
    throw new Error('provider transcript bound')
  const issued = new Map(planned.slice(0, currentIndex).map((item, index) => [item.callId, { item, index }]))
  const seenCalls = new Set()
  const seenOutputs = new Set()
  let lastIndex = -1
  for (const entry of input) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('invalid provider transcript item')
    if (inertTypes.has(entry.type)) continue
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      !['custom_tool_call', 'custom_tool_call_output'].includes(entry.type)
    )
      throw new Error('foreign provider tool transcript item')
    const found = issued.get(entry.call_id)
    if (!found || found.index < lastIndex) throw new Error('unscheduled provider tool transcript item')
    lastIndex = found.index
    if (entry.type === 'custom_tool_call') {
      if (
        seenCalls.has(entry.call_id) ||
        Object.keys(entry).some(
          key => !['id', 'type', 'call_id', 'name', 'namespace', 'input', 'status'].includes(key),
        ) ||
        entry.name !== 'exec' ||
        entry.namespace !== 'functions' ||
        entry.input !== found.item.script ||
        (entry.id !== undefined && entry.id !== `item-${entry.call_id}`) ||
        (entry.status !== undefined && entry.status !== 'completed')
      )
        throw new Error('issued provider call drift')
      seenCalls.add(entry.call_id)
    } else {
      if (
        seenOutputs.has(entry.call_id) ||
        Object.keys(entry).some(key => !['id', 'type', 'call_id', 'name', 'output'].includes(key)) ||
        (entry.name !== undefined && entry.name !== null && entry.name !== 'exec') ||
        (entry.id !== undefined && (typeof entry.id !== 'string' || entry.id.length > 200))
      )
        throw new Error('provider output transcript drift')
      const hashed = codecDigest(entry.output)
      if (found.index < currentIndex - 1 && priorOutputHashes.get(entry.call_id) !== hashed)
        throw new Error('prior provider output changed')
      seenOutputs.add(entry.call_id)
    }
  }
  if (currentIndex > 0 && !seenOutputs.has(planned[currentIndex - 1].callId))
    throw new Error('current provider continuation absent')
  if (currentIndex === 0 && (seenCalls.size || seenOutputs.size)) throw new Error('provider tool item before issuance')
  return freeze({
    currentOutputSha256:
      currentIndex > 0
        ? codecDigest(
            input.find(
              entry => entry?.type === 'custom_tool_call_output' && entry.call_id === planned[currentIndex - 1].callId,
            ).output,
          )
        : null,
  })
}

function codecAudit(snapshot, planned) {
  if (planned.rejection) {
    if (
      snapshot?.scopedDispatchCount !== 0 ||
      snapshot?.noDispatch?.class !== 'NO_MCP_DISPATCH' ||
      snapshot?.logicalAttempts !== 1
    )
      throw new Error('registry absence not observed')
    return []
  }
  if (snapshot?.pending !== 0 || snapshot?.scopedDispatchCount !== 1 || snapshot?.calls?.length !== 1)
    throw new Error('one completed scoped call required')
  const observed = snapshot.calls[0]
  if (
    observed.callId !== planned.callId ||
    observed.name !== planned.operation ||
    observed.argumentsSha256 !== codecDigest(observed.arguments) ||
    observed.result === null
  )
    throw new Error('scoped audit plan mismatch')
  return [
    {
      callId: planned.callId,
      normalizedName: planned.normalizedName,
      id: observed.rpcId,
      operation: planned.operation,
      argumentsHash: observed.argumentsSha256,
      complete: true,
      result: observed.result,
    },
  ]
}

export function createMatrixScriptSession({
  caseId,
  seal,
  operations,
  auditSession,
  journal,
  writeReceipt,
  terminalText = 'SYNTHETIC_COMPLETE',
}) {
  const item = casePolicy(caseId)
  if (item.phase !== 'T2' || ['P00', 'B14'].includes(caseId)) throw new Error('case has no qualified scripted provider')
  if (
    !auditSession ||
    typeof auditSession.issue !== 'function' ||
    typeof auditSession.snapshot !== 'function' ||
    typeof auditSession.complete !== 'function'
  )
    throw new Error('single active scoped audit required')
  if (typeof writeReceipt !== 'function') throw new Error('durable scripted response receipt writer required')
  if (typeof journal?.reserve !== 'function' || typeof journal?.acknowledge !== 'function')
    throw new Error('durable outer-call journal required')
  if (
    !Array.isArray(operations) ||
    operations.length !== item.script.operations.length ||
    operations.length > item.limits.scopedCalls ||
    operations.some((entry, index) => entry.operation !== item.script.operations[index].toolName)
  )
    throw new Error('exact operation plan required')
  const listed = seal?.profiles?.roles?.find(role => role.role === item.role)?.toolsList?.tools
  if (
    !Array.isArray(listed) ||
    operations.some(entry => entry.rejection !== true && !listed.some(tool => tool.name === entry.operation))
  )
    throw new Error('role profile does not authorize planned operation')
  const planned = operations.map((entry, index) =>
    prepareCodeModeCall({
      caseId,
      index,
      operation: entry.operation,
      args: entry.args,
      rejection: entry.rejection === true,
    }),
  )
  const plan = {
    caseId,
    calls: planned.map(call => ({ callId: call.callId, input: call.script })),
    terminalText,
  }
  const planSha256 = scriptDigest(plan)
  writeReceipt('script-plan', {
    caseId,
    planSha256,
    calls: planned.map(call => ({
      callId: call.callId,
      operation: call.operation,
      argumentsHash: call.argumentsHash,
      scriptSha256: call.scriptSha256,
      rejection: call.rejection,
    })),
  })
  let requestIndex = 0
  let lastGate = null
  let activeAudit = null
  let fullInput = null
  let decoded = null
  let outerPending = null
  const priorOutputHashes = new Map()
  const producer = new FiniteBufferedResponses({
    caseId,
    plan,
    planSha256,
    validateDescriptor: () => lastGate?.status === 'VALIDATED',
    decodeResult: (output, { callId }) => {
      const expected = planned.find(call => call.callId === callId)
      if (!expected || !Array.isArray(fullInput) || !activeAudit) return false
      const exact = fullInput.filter(part => part?.type === 'custom_tool_call_output' && part.call_id === callId)
      if (exact.length !== 1 || exact[0].output !== output) return false
      if (expected.rejection) {
        if (!Array.isArray(output) || output.length !== 2 || typeof output[1]?.text !== 'string') return false
        const envelope = parseStrictJson(output[1].text)
        if (
          Object.keys(envelope).sort().join(',') !== 'callId,caseId,disposition,index,operation,result,schema' ||
          envelope.schema !== 'appraise.m02-code-mode-envelope/v1' ||
          envelope.caseId !== caseId ||
          envelope.index !== expected.index ||
          envelope.callId !== expected.callId ||
          envelope.operation !== expected.operation ||
          envelope.disposition !== 'CODE_MODE_REGISTRY_ABSENT' ||
          envelope.result !== null
        )
          return false
        auditSession.recordNoDispatch(expected)
        activeAudit = auditSession.snapshot()
      }
      decoded = decodeCodeModeContinuation({
        input: fullInput,
        planned: expected,
        audit: codecAudit(activeAudit, expected),
      })
      return decoded.status === (expected.rejection ? 'NO_MCP_DISPATCH' : 'RESULT_CORRELATED')
    },
  })
  return freeze({
    status: 'OFFLINE_PREPARED_NOT_RUNTIME_QUALIFIED',
    caseId,
    plans: freeze([...planned]),
    planSha256,
    handle({ body, bodyBytes, context }) {
      if (
        outerPending ||
        requestIndex >= item.limits.providerRequests ||
        producer.snapshot().fenced ||
        producer.snapshot().completed
      )
        throw new Error('provider budget or terminal; no resend')
      lastGate = validateMatrixProviderRequest({ seal, caseId, bodyBytes, context, parsedBody: body })
      if (lastGate.status !== 'VALIDATED') {
        producer.fail('DESCRIPTOR')
        throw new Error(`provider route UNKNOWN: ${lastGate.reason}`)
      }
      let transcript
      try {
        transcript = validateIssuedTranscript(body.input, planned, requestIndex, priorOutputHashes)
      } catch (error) {
        producer.fail('TRANSCRIPT')
        throw error
      }
      fullInput = body.input
      activeAudit = auditSession.snapshot()
      decoded = null
      // The full transcript has already passed every call, output, and prior-output gate.
      // The finite producer consumes only the one call it most recently issued.
      const currentOutput =
        requestIndex > 0
          ? body.input.find(
              part => part?.type === 'custom_tool_call_output' && part.call_id === planned[requestIndex - 1].callId,
            )
          : null
      const request = {
        input:
          requestIndex === 0
            ? body.input
            : [{ type: currentOutput.type, call_id: currentOutput.call_id, output: currentOutput.output }],
      }
      const response = producer.next({ descriptor: lastGate, request })
      if (response.status !== 'READY') throw new Error(`provider continuation UNKNOWN: ${response.reason}`)
      if (requestIndex > 0) {
        auditSession.complete()
        priorOutputHashes.set(planned[requestIndex - 1].callId, transcript.currentOutputSha256)
      }
      if (planned[requestIndex]) {
        outerPending = `${caseId}-outer-${requestIndex + 1}`
        journal.reserve('outerCalls', outerPending)
        auditSession.issue(planned[requestIndex])
      }
      const receipt = freeze({
        caseId,
        requestIndex: requestIndex + 1,
        responseSha256: response.bodySha256,
        requestByteHash: lastGate.requestByteHash,
        descriptorHash: lastGate.descriptorHash,
        wrapperDescriptorHash: lastGate.wrapperDescriptorHash,
        planSha256,
        decodedStatus: decoded?.status ?? null,
        decodedResultHash: decoded?.resultHash ?? null,
      })
      writeReceipt(`provider-response-${requestIndex + 1}`, receipt)
      requestIndex++
      let writeAcknowledged = false
      return freeze({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: response.body,
        receipt,
        afterWrite: () => {
          if (writeAcknowledged) throw new Error('duplicate scripted response ACK')
          writeAcknowledged = true
          if (!outerPending) return
          const id = outerPending
          journal.acknowledge(id)
          outerPending = null
        },
      })
    },
    snapshot: () => ({
      ...producer.snapshot(),
      planSha256,
      requestIndex,
      outerPending,
      lastGate,
      decodedStatus: decoded?.status ?? null,
    }),
  })
}
