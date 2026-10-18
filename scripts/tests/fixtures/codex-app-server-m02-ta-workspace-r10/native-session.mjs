/** Finite N01/N02 provider session. The trusted issuer reads the owned scratch file. */
import { createHash } from 'node:crypto'
import { prepareNativeCase, verifyNativeContinuation } from '../codex-app-server-m02-ta-native-plans-r10/plans.mjs'
import { validateNativeVariantRequest } from '../codex-app-server-m02-ta-native-plans-r10/native-route-gate.mjs'
import { makeCustomToolEvents, makeTerminalEvents } from '../codex-app-server-m02-ta-phase-r10/responses-sse.mjs'
import { validateIssuedTranscript } from '../codex-app-server-m02-ta-matrix-r10/script-session.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const encode = events => {
  const body = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  if (Buffer.byteLength(body) > 64 * 1024) throw new Error('T3 SSE byte ceiling')
  return body
}

export function createWorkspaceNativeSession({
  caseId,
  seal,
  expectedConfigSha256,
  manifestDigest,
  issuer,
  token,
  writeReceipt,
  journal,
}) {
  if (
    !['N01', 'N02'].includes(caseId) ||
    !/^sha256:[a-f0-9]{64}$/.test(expectedConfigSha256 ?? '') ||
    !/^[a-f0-9]{64}$/.test(manifestDigest ?? '') ||
    typeof issuer?.verify !== 'function' ||
    typeof issuer.verifyIssuedWorkspaceProof !== 'function' ||
    typeof writeReceipt !== 'function' ||
    typeof journal?.reserve !== 'function' ||
    typeof journal.acknowledge !== 'function'
  )
    throw new Error('T3 native session ports missing')
  const plan = prepareNativeCase(caseId)
  writeReceipt('script-plan', {
    caseId,
    callId: plan.callId,
    operation: plan.operation,
    scriptSha256: plan.scriptSha256,
    relativePath: plan.relativePath,
    expectedContentSha256: sha(plan.expectedBytes),
    nativeHelpersSourceMaximum: caseId === 'N01' ? 2 : 0,
  })
  let index = 0
  let completed = false
  let outerPending = false
  let lastGate = null
  let workspaceProof = null
  let nativeResult = null
  const priorHashes = new Map()
  return Object.freeze({
    plan,
    async handle({ body, bodyBytes, context }) {
      if (
        outerPending ||
        completed ||
        index >= 2 ||
        !Buffer.isBuffer(bodyBytes) ||
        context?.runId !== manifestDigest ||
        context.requestId !== `${caseId}-listener-request-${index + 1}` ||
        !/^[A-Za-z0-9._:-]{1,200}$/.test(context.threadId ?? '') ||
        !/^[A-Za-z0-9._:-]{1,200}$/.test(context.turnId ?? '')
      )
        throw new Error('T3 provider budget, active correlation, or outer ACK; no resend')
      const gate = validateNativeVariantRequest({ seal, caseId, bodyBytes, context, expectedConfigSha256 })
      if (gate.status !== 'VALIDATED') throw new Error(`T3 descriptor UNKNOWN: ${gate.reason}`)
      lastGate = gate
      const transcript = validateIssuedTranscript(body?.input, [plan], index, priorHashes)
      let events
      if (index === 0) {
        events = makeCustomToolEvents({ responseId: `${caseId}-response-1`, callId: plan.callId, input: plan.script })
        journal.reserve('outerCalls', `${caseId}-outer-1`)
        outerPending = true
      } else {
        const outputs = body.input.filter(
          item => item?.type === 'custom_tool_call_output' && item.call_id === plan.callId,
        )
        if (outputs.length !== 1) throw new Error('T3 continuation absent')
        workspaceProof = await issuer.verify({ token, caseId, manifestDigest })
        if (issuer.verifyIssuedWorkspaceProof(workspaceProof, { caseId, manifestDigest }) !== true)
          throw new Error('T3 scratch proof not issued by active verifier')
        nativeResult = verifyNativeContinuation({ plan, input: outputs, workspaceEvidence: workspaceProof })
        if (
          nativeResult.status !== 'FIXED_WORKSPACE_EFFECT_CORRELATED' ||
          nativeResult.calls !== 1 ||
          nativeResult.relativePath !== plan.relativePath ||
          nativeResult.contentSha256 !== workspaceProof.contentSha256
        )
          throw new Error('T3 native result or owned bytes mismatch')
        priorHashes.set(plan.callId, transcript.currentOutputSha256)
        writeReceipt('workspace-proof', {
          caseId,
          relativePath: plan.relativePath,
          contentSha256: workspaceProof.contentSha256,
          rootDevice: workspaceProof.rootDevice,
          rootInode: workspaceProof.rootInode,
          scratchInode: workspaceProof.scratchInode,
          evidenceProvenance: workspaceProof.evidenceProvenance,
          nativeStatus: nativeResult.status,
          nativeHelperCountObserved: 'UNKNOWN',
        })
        events = makeTerminalEvents({ responseId: `${caseId}-response-2`, text: 'SYNTHETIC_WORKSPACE_COMPLETE' })
        completed = true
      }
      const response = encode(events)
      writeReceipt(`provider-response-${index + 1}`, {
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
      let acknowledged = false
      return Object.freeze({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: response,
        afterWrite() {
          if (acknowledged) throw new Error('duplicate T3 provider response ACK')
          acknowledged = true
          if (outerPending) {
            journal.acknowledge(`${caseId}-outer-1`)
            outerPending = false
          }
        },
      })
    },
    snapshot: () =>
      Object.freeze({
        caseId,
        index,
        completed,
        outerPending,
        lastGateStatus: lastGate?.status ?? null,
        workspaceProofIssued: Boolean(workspaceProof),
        nativeStatus: nativeResult?.status ?? null,
        runtimeQualified: false,
      }),
  })
}
