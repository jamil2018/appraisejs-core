/** Async finite N01/N02 producer. This module neither launches nor qualifies a native route. */
import { createHash } from 'node:crypto'
import { prepareNativeCase, verifyNativeContinuation, NATIVE_CONTRACT_STATUS } from './native-plans.mjs'
import { validateNativeVariantRequest } from '../codex-app-server-m02-ta-native-plans-r10/native-route-gate.mjs'
import { makeCustomToolEvents, makeTerminalEvents } from '../codex-app-server-m02-ta-matrix-r30/finite-responses.mjs'
import { validateIssuedTranscript } from '../codex-app-server-m02-ta-matrix-r30/script-session.mjs'
import { digest } from '../codex-app-server-m02-ta-codec-r10/codec.mjs'
import { parseStrictJson } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { createNativeSessionDiagnostic } from './native-session-diagnostic.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = reason => {
  throw new Error(`T3 native session ${reason}`)
}
const encode = events => {
  const body = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  if (Buffer.byteLength(body) > 64 * 1024) fail('SSE_BOUND')
  return body
}

/**
 * The integration must await handle() and invoke afterWrite() only after the complete SSE write.
 * validateRequest is inspection only: runtime entrypoint authority is a separate reviewed gate.
 * Deliberately does not use synchronous FiniteBufferedResponses.next(): scratch proof awaits owned FDs.
 */
export function createWorkspaceNativeSession({
  caseId,
  seal,
  expectedConfigSha256,
  manifestDigest,
  issuer,
  token,
  writeReceipt,
  journal,
  validateRequest = validateNativeVariantRequest,
}) {
  if (
    !['N01', 'N02'].includes(caseId) ||
    !/^sha256:[a-f0-9]{64}$/.test(expectedConfigSha256 ?? '') ||
    !/^[a-f0-9]{64}$/.test(manifestDigest ?? '') ||
    typeof issuer?.assertPrepared !== 'function' ||
    typeof issuer.verify !== 'function' ||
    typeof issuer.verifyIssuedWorkspaceProof !== 'function' ||
    !token ||
    typeof token !== 'object' ||
    typeof writeReceipt !== 'function' ||
    typeof journal?.reserve !== 'function' ||
    typeof journal.acknowledge !== 'function' ||
    typeof validateRequest !== 'function'
  )
    fail('PORTS_OR_BINDING')
  const plan = prepareNativeCase(caseId)
  const receipt = (name, value) => {
    const result = writeReceipt(name, value)
    if (result && typeof result.then === 'function') fail('ASYNC_RECEIPT_WRITER_UNSUPPORTED')
  }
  receipt('script-plan', {
    caseId,
    callId: plan.callId,
    operation: plan.operation,
    scriptSha256: plan.scriptSha256,
    relativePath: plan.relativePath,
    expectedContentSha256: sha(plan.expectedBytes),
    dedicatedToolHelperSourceExpectation: caseId === 'N01' ? 2 : 0,
    helperExpectationEvidenceClass: 'PINNED_SOURCE_PATTERN_NOT_TOTAL_PROCESS_BOUND_OR_RUNTIME_COUNT',
    nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
    nativeContractStatus: NATIVE_CONTRACT_STATUS,
  })
  let index = 0
  let busy = false
  let fenced = false
  let completed = false
  let responsePending = false
  let outerPending = false
  let workspaceActionPending = false
  let lastGate = null
  let workspaceProof = null
  let nativeResult = null
  let activeThread = null
  let activeTurn = null
  let cumulativeOutputBytes = 0
  const priorHashes = new Map()
  const diagnostic = createNativeSessionDiagnostic()
  return Object.freeze({
    plan,
    async handle({ body, bodyBytes, context }) {
      diagnostic.mark('REQUEST_GUARD')
      if (busy || fenced || responsePending || completed || index >= 2) {
        fenced = true
        try {
          fail('BUDGET_ACK_OR_FENCED_NO_RESEND')
        } catch (error) {
          diagnostic.recordError(error)
          throw error
        }
      }
      busy = true
      try {
        diagnostic.mark('ACTIVE_CORRELATION')
        if (
          !Buffer.isBuffer(bodyBytes) ||
          bodyBytes.length > 1024 * 1024 ||
          context?.runId !== manifestDigest ||
          context.requestId !== `${caseId}-listener-request-${index + 1}` ||
          !/^[A-Za-z0-9._:-]{1,200}$/.test(context.threadId ?? '') ||
          !/^[A-Za-z0-9._:-]{1,200}$/.test(context.turnId ?? '') ||
          (activeThread !== null && context.threadId !== activeThread) ||
          (activeTurn !== null && context.turnId !== activeTurn)
        )
          fail('ACTIVE_CORRELATION')
        diagnostic.mark('BODY_CORRELATION')
        const parsed = parseStrictJson(bodyBytes.toString('utf8'))
        if (digest(parsed) !== digest(body)) fail('BODY_BYTES_MISMATCH')
        diagnostic.mark('DESCRIPTOR')
        const gate = validateRequest({ seal, caseId, bodyBytes, context, expectedConfigSha256 })
        if (gate?.status !== 'VALIDATED') {
          diagnostic.recordGateFailure(gate)
          fail('DESCRIPTOR_UNKNOWN')
        }
        lastGate = gate
        diagnostic.mark('TRANSCRIPT')
        const transcript = validateIssuedTranscript(body?.input, [plan], index, priorHashes)
        const inputHash = digest(body.input)
        const binding = { threadId: context.threadId, turnId: context.turnId, requestId: context.requestId }
        let events
        if (index === 0) {
          diagnostic.mark('INITIAL_INPUT')
          if (body.input.length > 16 || Buffer.byteLength(JSON.stringify(body.input)) > 64 * 1024)
            fail('INITIAL_INPUT_BOUND')
          diagnostic.mark('SCRATCH_PREPARED')
          if ((await issuer.assertPrepared({ token, caseId, manifestDigest })) !== true) fail('TOKEN_NOT_PREPARED')
          diagnostic.mark('SSE_BUILD')
          events = makeCustomToolEvents({ responseId: `${caseId}-response-1`, callId: plan.callId, input: plan.script })
        } else {
          diagnostic.mark('OUTPUT_CORRELATION')
          const outputs = body.input.filter(
            item => item?.type === 'custom_tool_call_output' && item.call_id === plan.callId,
          )
          if (outputs.length !== 1) fail('CONTINUATION_ABSENT')
          diagnostic.mark('OUTPUT_BOUND')
          const outputBytes = Buffer.byteLength(JSON.stringify(outputs[0].output))
          if (outputBytes > 64 * 1024 || cumulativeOutputBytes + outputBytes > 64 * 1024) fail('OUTPUT_BOUND')
          cumulativeOutputBytes += outputBytes
          diagnostic.mark('SCRATCH_PROOF')
          workspaceProof = await issuer.verify({ token, caseId, manifestDigest })
          diagnostic.mark('SCRATCH_PROOF_PROVENANCE')
          if (issuer.verifyIssuedWorkspaceProof(workspaceProof, { caseId, manifestDigest }) !== true)
            fail('PROOF_NOT_ISSUED')
          diagnostic.mark('NATIVE_RESULT')
          nativeResult = verifyNativeContinuation({ plan, input: outputs, workspaceEvidence: workspaceProof })
          if (
            nativeResult.status !== 'FIXED_WORKSPACE_EFFECT_CORRELATED' ||
            nativeResult.calls !== 1 ||
            nativeResult.relativePath !== plan.relativePath ||
            nativeResult.contentSha256 !== workspaceProof.contentSha256
          )
            fail('RESULT_OR_OWNED_BYTES_MISMATCH')
          priorHashes.set(plan.callId, transcript.currentOutputSha256)
          diagnostic.mark('WORKSPACE_RECEIPT')
          receipt('workspace-proof', {
            caseId,
            relativePath: plan.relativePath,
            contentSha256: workspaceProof.contentSha256,
            rootDevice: workspaceProof.rootDevice,
            rootInode: workspaceProof.rootInode,
            scratchInode: workspaceProof.scratchInode,
            evidenceProvenance: workspaceProof.evidenceProvenance,
            nativeStatus: nativeResult.status,
            nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
          })
          diagnostic.mark('SSE_BUILD')
          events = makeTerminalEvents({ responseId: `${caseId}-response-2`, text: 'SYNTHETIC_WORKSPACE_COMPLETE' })
        }
        diagnostic.mark('ACTIVE_INPUT')
        if (
          digest(body.input) !== inputHash ||
          context.threadId !== binding.threadId ||
          context.turnId !== binding.turnId ||
          context.requestId !== binding.requestId ||
          context.runId !== manifestDigest ||
          fenced
        )
          fail('ACTIVE_INPUT_CHANGED')
        diagnostic.mark('SSE_BUILD')
        const response = encode(events)
        if (index === 0) {
          activeThread = binding.threadId
          activeTurn = binding.turnId
          diagnostic.mark('WORKSPACE_RESERVATION')
          journal.reserve('workspaceActions', `${caseId}-workspace-action`)
          workspaceActionPending = true
          diagnostic.mark('OUTER_RESERVATION')
          journal.reserve('outerCalls', `${caseId}-outer-1`)
          outerPending = true
        } else {
          diagnostic.mark('WORKSPACE_ACK')
          journal.acknowledge(`${caseId}-workspace-action`)
          workspaceActionPending = false
        }
        diagnostic.mark('RESPONSE_RECEIPT')
        receipt(`provider-response-${index + 1}`, {
          caseId,
          requestIndex: index + 1,
          requestByteHash: gate.capture.requestByteHash,
          descriptorHash: gate.capture.descriptorHash,
          wrapperDescriptorHash: gate.wrapperDescriptorHash,
          responseSha256: sha(response),
          outerCallId: index === 0 ? plan.callId : null,
          workspaceContentSha256: workspaceProof?.contentSha256 ?? null,
        })
        index++
        responsePending = true
        diagnostic.mark('RESPONSE_READY')
        let acknowledged = false
        return Object.freeze({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: response,
          afterWrite() {
            diagnostic.mark('RESPONSE_ACK')
            if (acknowledged || fenced || !responsePending) {
              fenced = true
              try {
                fail('DUPLICATE_OR_FENCED_RESPONSE_ACK')
              } catch (error) {
                diagnostic.recordError(error)
                throw error
              }
            }
            acknowledged = true
            try {
              if (outerPending) {
                journal.acknowledge(`${caseId}-outer-1`)
                outerPending = false
              }
              responsePending = false
              if (index === 2) completed = true
              diagnostic.mark(index === 2 ? 'COMPLETED' : 'WAIT_CONTINUATION')
            } catch (error) {
              fenced = true
              diagnostic.recordError(error)
              throw error
            }
          },
        })
      } catch (error) {
        fenced = true
        diagnostic.recordError(error)
        throw error
      } finally {
        busy = false
      }
    },
    snapshot: () =>
      Object.freeze({
        caseId,
        index,
        completed,
        fenced,
        responsePending,
        outerPending,
        workspaceActionPending,
        cumulativeOutputBytes,
        lastGateStatus: lastGate?.status ?? null,
        workspaceProofIssued: Boolean(workspaceProof),
        nativeStatus: nativeResult?.status ?? null,
        nativeContractStatus: NATIVE_CONTRACT_STATUS,
        nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
        diagnostic: diagnostic.snapshot(),
        runtimeQualified: false,
      }),
  })
}
