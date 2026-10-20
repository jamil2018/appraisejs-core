/** Offline-only ports for exercising the real r24 script session and generated Code Mode text. */
import vm from 'node:vm'
import { createMatrixScriptSession } from '../codex-app-server-m02-ta-matrix-r24/script-session.mjs'
import { buildMatrixCaseOperations } from '../codex-app-server-m02-ta-matrix-r10/case-script-plan.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { POLICY, casePolicy } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { digest } from '../codex-app-server-m02-ta-codec-r10/codec.mjs'

const HEADER = 'Script completed\nWall time 0.1 seconds\nOutput:\n'
export const RESULT = Object.freeze({ content: [], structuredContent: { offline: true }, isError: false })

export async function createOfflineScriptFixture(caseId) {
  const item = casePolicy(caseId)
  const seal = loadSealedRouteEvidence()
  const fixture = {
    gateway: {
      binding: { caseId, offline: true },
      frozenReads: item.script.operations.map(step => ({ toolName: step.toolName, arguments: {} })),
    },
    seedForeignTriageReceipt: async () => ({ foreignReceiptId: 'offline-foreign-receipt' }),
  }
  const operations = await buildMatrixCaseOperations({
    caseId,
    fixture,
    canonicalPacket: (role, binding) => ({ role, binding, result: { role } }),
  })
  const reservations = []
  const acknowledgements = []
  const completions = []
  const receipts = []
  const stages = []
  const calls = []
  let active = null
  let observed = null
  const auditSession = {
    issue(plan) {
      if (active) throw new Error('offline audit already active')
      active = plan
      observed = null
    },
    recordNoDispatch(plan) {
      if (active?.callId !== plan.callId || !plan.rejection || observed)
        throw new Error('offline registry absence mismatch')
      observed = 'NO_DISPATCH'
    },
    snapshot() {
      if (!active) return null
      if (observed === 'NO_DISPATCH')
        return { pending: 0, scopedDispatchCount: 0, noDispatch: { class: 'NO_MCP_DISPATCH' }, logicalAttempts: 1 }
      if (!observed) return { pending: 1, scopedDispatchCount: 0, calls: [] }
      return {
        pending: 0,
        scopedDispatchCount: 1,
        calls: [
          {
            callId: active.callId,
            name: active.operation,
            rpcId: `offline-rpc-${active.index}`,
            arguments: operations[active.index].args,
            argumentsSha256: digest(operations[active.index].args),
            result: observed,
          },
        ],
      }
    },
    complete() {
      if (!active || !observed) throw new Error('offline audit incomplete')
      completions.push(active.callId)
      active = null
      observed = null
    },
    setResult(result) {
      if (!active || observed) throw new Error('offline audit not pending')
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
  const session = createMatrixScriptSession({
    caseId,
    seal,
    operations,
    auditSession,
    journal,
    writeReceipt: (name, value) => receipts.push({ name, value }),
    onStage: stage => stages.push(stage),
  })
  const descriptor = seal.capture.containers[0]
  const input = [{ role: 'developer', type: 'additional_tools', id: descriptor.metadata.id, tools: descriptor.tools }]
  const context = {
    binarySha256: seal.capture.provenance.binarySha256,
    platform: seal.capture.provenance.platform,
    configSha256: seal.capture.provenance.configSha256,
    schemaSha256: seal.capture.provenance.schemaSha256,
    runId: 'a'.repeat(64),
    requestId: `${caseId}-offline-request`,
    threadId: 'offline-thread',
    turnId: 'offline-turn',
  }
  const transcript = [...input]
  const request = (given = transcript, overrides = {}) => {
    const body = { model: POLICY.model, reasoning: { effort: POLICY.reasoning }, input: given }
    return session.handle({ body, bodyBytes: Buffer.from(JSON.stringify(body)), context: { ...context, ...overrides } })
  }
  const executeCurrent = async ({ result = RESULT, registryAbsent = false, transform } = {}) => {
    const plan = session.plans[transcript.filter(entry => entry.type === 'custom_tool_call_output').length]
    if (!plan) throw new Error('no pending script')
    const emitted = []
    const invocation = []
    const tools =
      plan.rejection || registryAbsent
        ? {}
        : {
            [plan.normalizedName]: async args => {
              invocation.push(args)
              calls.push({ callId: plan.callId, name: plan.operation, args })
              return result
            },
          }
    const registry = plan.rejection || registryAbsent ? [] : [{ name: plan.normalizedName }]
    await vm.runInNewContext(
      `(async()=>{${plan.script}\n})()`,
      {
        ALL_TOOLS: registry,
        tools,
        text: value => emitted.push(value),
      },
      { timeout: 1000 },
    )
    if (invocation.length !== (plan.rejection ? 0 : 1) || emitted.length !== 1)
      throw new Error('offline Code Mode emission mismatch')
    if (!plan.rejection) auditSession.setResult(result)
    const output = {
      type: 'custom_tool_call_output',
      call_id: plan.callId,
      output: [
        { type: 'input_text', text: HEADER },
        { type: 'input_text', text: transform ? transform(emitted[0]) : emitted[0] },
      ],
    }
    transcript.push(plan.item, output)
    return output
  }
  return {
    item,
    operations,
    session,
    auditSession,
    reservations,
    acknowledgements,
    completions,
    receipts,
    stages,
    calls,
    transcript,
    request,
    executeCurrent,
    requestAndAck(input = transcript) {
      const response = request(input)
      response.afterWrite()
      return response
    },
  }
}
