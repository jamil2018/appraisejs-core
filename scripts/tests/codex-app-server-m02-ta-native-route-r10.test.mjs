import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSealedRouteEvidence } from './fixtures/codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import {
  PERMISSION_DECLARATION,
  inspectPermissionDeclaration,
  validateNativeVariantRequest,
} from './fixtures/codex-app-server-m02-ta-native-plans-r10/native-route-gate.mjs'

const section = `### \`request_permissions\`\nSynthetic source-contract fixture.\n\nexec tool declaration:\n\`\`\`ts\n${PERMISSION_DECLARATION}\n\`\`\`\n`
function fixture() {
  // Synthetic contract test, not reconstruction/replay of the excluded provider request.
  const seal = loadSealedRouteEvidence()
  const original = seal.capture.callables.find(item => item.name === 'functions.exec').descriptor
  const prefix = original.description.slice(0, original.description.indexOf('\n### '))
  const wrapper = {
    type: 'custom',
    name: 'exec',
    description: prefix + '\n' + section,
    format: structuredClone(original.format),
  }
  const body = {
    model: 'gpt-6.1-sol',
    reasoning: { effort: 'medium' },
    input: [
      {
        role: 'developer',
        type: 'additional_tools',
        id: 'at_00000000-0000-5000-8000-000000000001',
        tools: [{ type: 'namespace', name: 'functions', description: 'Synthetic namespace', tools: [wrapper] }],
      },
    ],
  }
  const context = { ...seal.capture.provenance }
  delete context.attestation
  context.runId = 'm02-native-route-offline'
  context.requestId = 'B14-listener-request-1'
  context.threadId = 'synthetic-thread'
  context.turnId = 'synthetic-turn'
  context.configSha256 = `sha256:${'b'.repeat(64)}`
  return {
    seal,
    caseId: 'B14',
    bodyBytes: Buffer.from(JSON.stringify(body)),
    context,
    expectedConfigSha256: context.configSha256,
    body,
    wrapper,
  }
}
test('full permission declaration matches only the pinned input contract', () => {
  assert.equal(inspectPermissionDeclaration(section).status, 'FULL_DECLARATION_MATCHED')
  for (const text of [
    section + section,
    section.replace('permissions: {', 'permissions?: {'),
    section.replace('enabled?: boolean', 'enabled?: string'),
    section.replace('reason?: string;', 'reason?: string; hidden: string;'),
    'request_permissions is available',
    section + '\n```ts\ndeclare const tools: { request_permissions(other: string): Promise<unknown>; };\n```',
  ])
    assert.equal(inspectPermissionDeclaration(text).status, 'BLOCKED')
})
test('collector-backed synthetic B14 variant captures complete contracts with known executor semantics', () => {
  const input = fixture()
  const gated = validateNativeVariantRequest(input)
  assert.equal(gated.status, 'VALIDATED', gated.reason)
  assert.equal(gated.capture.status, 'CAPTURED')
  assert.equal(gated.capture.provenance.attestation, 'SUPPLIED_NOT_ATTESTED')
  assert.deepEqual(gated.capture.observedTuple, { model: 'gpt-6.1-sol', effort: 'medium' })
  assert.equal(gated.runtimeQualified, false)
  assert.equal(gated.dispatchAllowed, false)
  assert.equal(gated.provenanceEvidence, 'SUPPLIED_NOT_ATTESTED_REQUIRES_ACTIVE_RUNTIME_PIN')
})
test('config, tuple, grammar, duplicate declaration, semantics and incomplete Lite identity drift block', () => {
  for (const mutate of [
    x => {
      x.context.configSha256 = `sha256:${'c'.repeat(64)}`
    },
    x => {
      x.body.model = 'other'
    },
    x => {
      x.wrapper.format = { type: 'text' }
    },
    x => {
      x.wrapper.description += section
    },
    x => {
      x.wrapper.description = section
    },
    x => {
      delete x.body.input[0].id
    },
    x => {
      x.context.attestation = 'SUPPLIED_NOT_ATTESTED'
    },
  ]) {
    const input = fixture()
    mutate(input)
    input.bodyBytes = Buffer.from(JSON.stringify(input.body))
    assert.equal(validateNativeVariantRequest(input).status, 'BLOCKED')
  }
})
