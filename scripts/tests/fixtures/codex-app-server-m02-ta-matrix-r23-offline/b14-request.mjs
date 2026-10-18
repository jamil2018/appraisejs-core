/** Source-contract B14 provider request and scripted output; caller supplies trusted ports. */
import { POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { PERMISSION_DECLARATION } from '../codex-app-server-m02-ta-native-plans-r10/native-route-gate.mjs'
import { B14_PROFILE } from '../codex-app-server-m02-ta-native-plans-r10/plans.mjs'

export const B14_EMPTY_DENIAL = '{"permissions":{"network":null,"file_system":null},"scope":"turn"}'

export function syntheticB14Request(seal) {
  const original = seal.capture.callables.find(item => item.name === 'functions.exec').descriptor
  const prefix = original.description.slice(0, original.description.indexOf('\n### '))
  const wrapper = {
    type: 'custom',
    name: 'exec',
    format: structuredClone(original.format),
    description: `${prefix}\n### \`request_permissions\`\nSynthetic source-contract fixture.\n\nexec tool declaration:\n\`\`\`ts\n${PERMISSION_DECLARATION}\n\`\`\`\n`,
  }
  const body = {
    model: POLICY.model,
    reasoning: { effort: POLICY.reasoning },
    input: [
      {
        role: 'developer',
        type: 'additional_tools',
        id: 'at_00000000-0000-5000-8000-000000000001',
        tools: [{ type: 'namespace', name: 'functions', description: 'Synthetic namespace', tools: [wrapper] }],
      },
    ],
  }
  const context = {
    ...seal.capture.provenance,
    runId: 'm02-native-route-offline',
    requestId: 'B14-listener-request-1',
    threadId: 'synthetic-thread',
    turnId: 'synthetic-turn',
    configSha256: `sha256:${'b'.repeat(64)}`,
  }
  delete context.attestation
  return { body, bodyBytes: Buffer.from(JSON.stringify(body)), context, expectedConfigSha256: context.configSha256 }
}

export function syntheticB14PermissionEvidence(plan) {
  return {
    callId: plan.callId,
    requests: 1,
    replies: 1,
    requestResolved: true,
    requestedNetworkEnabled: true,
    threadTurnCorrelated: true,
    reply: B14_PROFILE.reply,
  }
}

export function syntheticB14Output(plan, result = B14_EMPTY_DENIAL) {
  return {
    type: 'custom_tool_call_output',
    call_id: plan.callId,
    output: [
      { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
      {
        type: 'input_text',
        text: JSON.stringify({
          schema: 'appraise.m02-native-envelope/v1',
          caseId: plan.caseId,
          callId: plan.callId,
          operation: plan.operation,
          result,
        }),
      },
    ],
  }
}
