/** Offline provider transcripts with sealed descriptor and fake scoped ports only. */
import vm from 'node:vm'
import { createMatrixScriptSession as createOriginalSession } from '../codex-app-server-m02-ta-matrix-r10/script-session.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { digest } from '../codex-app-server-m02-ta-codec-r10/codec.mjs'

export const RESULT = Object.freeze({ content: [], structuredContent: { offline: true }, isError: false })
const HEADER = 'Script completed\nWall time 0.1 seconds\nOutput:\n'

export function createSyntheticSession({ createSession = createOriginalSession, caseId = 'B01' } = {}) {
  const seal = loadSealedRouteEvidence()
  const steps = POLICY.cases.find(item => item.id === caseId).script.operations
  const operations = steps.map(step => ({
    operation: step.toolName,
    args: {},
    rejection: caseId === 'B07-A09',
  }))
  const reservations = []
  const acknowledgements = []
  const completions = []
  const receipts = []
  let active = null
  let observed = null
  const auditSession = {
    issue(planned) {
      if (active) throw new Error('fake audit already active')
      active = planned
      observed = null
    },
    recordNoDispatch(planned) {
      if (!active?.rejection || planned.callId !== active.callId || observed)
        throw new Error('fake registry absence mismatch')
      observed = 'NO_DISPATCH'
    },
    snapshot() {
      if (!active) return null
      if (!observed) return { pending: 1, scopedDispatchCount: 0, calls: [] }
      if (observed === 'NO_DISPATCH')
        return { pending: 0, scopedDispatchCount: 0, noDispatch: { class: 'NO_MCP_DISPATCH' }, logicalAttempts: 1 }
      return {
        pending: 0,
        scopedDispatchCount: 1,
        calls: [
          {
            callId: active.callId,
            name: active.operation,
            rpcId: `offline-rpc-${active.index}`,
            arguments: {},
            argumentsSha256: digest({}),
            result: observed,
          },
        ],
      }
    },
    complete() {
      if (!active || !observed) throw new Error('fake audit incomplete')
      completions.push(active.callId)
      active = null
      observed = null
    },
    setResult(result) {
      if (!active) throw new Error('fake audit has no issued call')
      observed = result
    },
  }
  const journal = {
    reserve(kind, id) {
      reservations.push({ kind, id })
    },
    acknowledge(id) {
      acknowledgements.push(id)
    },
  }
  const session = createSession({
    caseId,
    seal,
    operations,
    auditSession,
    journal,
    writeReceipt: (name, value) => receipts.push({ name, value }),
  })
  const descriptor = seal.capture.containers[0]
  const bodyBase = {
    model: POLICY.model,
    reasoning: { effort: POLICY.reasoning },
    input: [{ role: 'developer', type: 'additional_tools', id: descriptor.metadata.id, tools: descriptor.tools }],
  }
  const provenance = seal.capture.provenance
  const context = {
    binarySha256: provenance.binarySha256,
    platform: provenance.platform,
    configSha256: provenance.configSha256,
    schemaSha256: provenance.schemaSha256,
    runId: 'a'.repeat(64),
    requestId: `${caseId}-offline-request`,
    threadId: 'offline-thread',
    turnId: 'offline-turn',
  }
  const transcript = [...bodyBase.input]
  const request = (input = transcript) => {
    const body = { ...bodyBase, input }
    return session.handle({ body, bodyBytes: Buffer.from(JSON.stringify(body)), context })
  }
  const requestAndAck = (input = transcript) => {
    const response = request(input)
    response.afterWrite()
    return response
  }
  const executeCurrent = async ({ result = RESULT, header = HEADER, payloadTransform } = {}) => {
    const plan = session.plans[transcript.filter(item => item.type === 'custom_tool_call_output').length]
    if (!plan) throw new Error('no current planned call')
    const emitted = []
    const calls = []
    const context = {
      ALL_TOOLS: plan.rejection ? [] : [{ name: plan.normalizedName }],
      tools: plan.rejection
        ? {}
        : {
            [plan.normalizedName]: async args => {
              calls.push(args)
              return result
            },
          },
      text: value => emitted.push(value),
    }
    await vm.runInNewContext(`(async()=>{${plan.script}\n})()`, context, { timeout: 1000 })
    if (calls.length !== (plan.rejection ? 0 : 1) || emitted.length !== 1)
      throw new Error('fake Code Mode count mismatch')
    if (!plan.rejection) auditSession.setResult(result)
    const payload = payloadTransform ? payloadTransform(emitted[0]) : emitted[0]
    const output = {
      type: 'custom_tool_call_output',
      call_id: plan.callId,
      output: [
        { type: 'input_text', text: header },
        { type: 'input_text', text: payload },
      ],
    }
    transcript.push(plan.item, output)
    return output
  }
  return {
    session,
    auditSession,
    journal,
    reservations,
    acknowledgements,
    completions,
    receipts,
    transcript,
    request,
    requestAndAck,
    executeCurrent,
  }
}
