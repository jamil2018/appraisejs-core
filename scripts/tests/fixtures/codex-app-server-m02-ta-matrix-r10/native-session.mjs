/** B14 asking-only native route; no request is sent by importing this module. */
import { createHash } from 'node:crypto'
import { prepareNativeCase, verifyNativeContinuation } from '../codex-app-server-m02-ta-native-plans-r10/plans.mjs'
import { validateNativeVariantRequest } from '../codex-app-server-m02-ta-native-plans-r10/native-route-gate.mjs'
import { makeCustomToolEvents, makeTerminalEvents } from '../codex-app-server-m02-ta-phase-r10/responses-sse.mjs'
import { validateIssuedTranscript } from './script-session.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const encode = events => {
  const body = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  if (Buffer.byteLength(body) > 64 * 1024) throw new Error('B14 SSE byte ceiling')
  return body
}

export function createB14NativeSession({ seal, expectedConfigSha256, permissionEvidence, writeReceipt, journal }) {
  if (
    typeof permissionEvidence !== 'function' ||
    typeof writeReceipt !== 'function' ||
    typeof journal?.reserve !== 'function' ||
    typeof journal?.acknowledge !== 'function'
  )
    throw new Error('B14 runtime evidence ports required')
  const plan = prepareNativeCase('B14')
  writeReceipt('script-plan', {
    caseId: 'B14',
    callId: plan.callId,
    operation: plan.operation,
    scriptSha256: plan.scriptSha256,
    grants: 0,
  })
  let index = 0
  let completed = false
  let lastGate = null
  let nativeResult = null
  let outerPending = false
  const outputHashes = new Map()
  return Object.freeze({
    status: 'OFFLINE_PREPARED_NOT_RUNTIME_QUALIFIED',
    plan,
    handle({ body, bodyBytes, context }) {
      if (outerPending || completed || index >= 2 || !Buffer.isBuffer(bodyBytes))
        throw new Error('B14 provider budget or outer ACK; no resend')
      const gate = validateNativeVariantRequest({ seal, caseId: 'B14', bodyBytes, context, expectedConfigSha256 })
      if (gate.status !== 'VALIDATED') throw new Error(`B14 descriptor UNKNOWN: ${gate.reason}`)
      lastGate = gate
      const transcript = validateIssuedTranscript(body?.input, [plan], index, outputHashes)
      let events
      if (index === 0) {
        events = makeCustomToolEvents({ responseId: 'B14-response-1', callId: plan.callId, input: plan.script })
        journal.reserve('outerCalls', 'B14-outer-1')
        outerPending = true
      } else {
        const outputs = body.input.filter(
          item => item?.type === 'custom_tool_call_output' && item.call_id === plan.callId,
        )
        if (outputs.length !== 1) throw new Error('B14 continuation absent')
        nativeResult = verifyNativeContinuation({ plan, input: outputs, permissionEvidence: permissionEvidence() })
        if (nativeResult.status !== 'EMPTY_PERMISSION_DENIAL_CORRELATED' || nativeResult.grants !== 0)
          throw new Error('B14 grant or denial mismatch')
        outputHashes.set(plan.callId, transcript.currentOutputSha256)
        events = makeTerminalEvents({ responseId: 'B14-response-2', text: 'SYNTHETIC_PERMISSION_DENIED' })
        completed = true
      }
      const response = encode(events)
      const receipt = Object.freeze({
        caseId: 'B14',
        requestIndex: index + 1,
        requestByteHash: gate.capture.requestByteHash,
        descriptorHash: gate.capture.descriptorHash,
        wrapperDescriptorHash: gate.wrapperDescriptorHash,
        responseSha256: sha(response),
        permissionDeclarationHash: gate.declaration.declarationHash,
        nativeStatus: nativeResult?.status ?? null,
        grants: 0,
      })
      writeReceipt(`provider-response-${index + 1}`, receipt)
      index++
      let writeAcknowledged = false
      return Object.freeze({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: response,
        receipt,
        afterWrite() {
          if (writeAcknowledged) throw new Error('duplicate B14 response ACK')
          writeAcknowledged = true
          if (outerPending) {
            journal.acknowledge('B14-outer-1')
            outerPending = false
          }
        },
      })
    },
    snapshot: () =>
      Object.freeze({
        index,
        completed,
        outerPending,
        lastGateStatus: lastGate?.status ?? null,
        nativeStatus: nativeResult?.status ?? null,
        grants: 0,
        runtimeQualified: false,
      }),
  })
}
