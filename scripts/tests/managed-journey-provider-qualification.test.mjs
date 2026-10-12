import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  canonicalSchemaHash,
  evaluatePreTurnQualification,
  sanitizeStartupReceipt,
} from '../lib/managed-journey-provider-qualification.mjs'

const requiredMcpServer = 'appraise-quality-journey'
const launchIdentity = {
  configurationHash: 'a'.repeat(64),
  executableHash: 'b'.repeat(64),
  protocolHash: 'c'.repeat(64),
  launchNonce: 'launch-fixture-1',
  processId: '4242',
  processStartTime: '2026-09-10T00:00:00.000Z',
}
const boundaryEvidence = {
  activePermissionProfile: { id: 'read-only' },
  instructionSources: [],
  runtimeWorkspaceRoots: [],
  sandbox: { type: 'readOnly', networkAccess: false },
}
const tools = [
  tool('artifact_read', {
    type: 'object',
    properties: { artifactId: { type: 'string' } },
    required: ['artifactId'],
    additionalProperties: false,
  }),
  tool('artifact_propose', {
    type: 'object',
    properties: { body: { type: 'string' } },
    required: ['body'],
    additionalProperties: false,
  }),
]
const expectedManifest = { boundaryEvidence, launchIdentity, requiredMcpServer, tools }

test('B0-003 rejects empty tools, null boundaries, and a caller-supplied inventory Boolean', () => {
  const result = evaluatePreTurnQualification({
    requiredMcpServer,
    mcpServers: [{ name: requiredMcpServer, tools: {} }],
    threadStartResponse: {
      activePermissionProfile: null,
      instructionSources: null,
      runtimeWorkspaceRoots: null,
      sandbox: null,
    },
    sentMethods: [],
    authoritativeNativeToolInventory: true,
  })

  assert.equal(result.qualified, false)
  assert.equal(result.mayStartTurn, false)
  assertKinds(result, [
    'caller_inventory_authority_rejected',
    'expected_manifest_unavailable',
    'tool_inventory_empty',
    'boundary_evidence_missing',
    'native_tool_inventory_unavailable',
    'manifest_provenance_unavailable',
  ])
})

test('synthetic checker fixture accepts an exact launch-bound manifest with trusted test verification', () => {
  const result = qualifyFixture()

  assert.equal(result.qualified, true)
  assert.equal(result.mayStartTurn, true)
  assert.deepEqual(result.findings, [])
  assert.deepEqual(result.observedMcpNames, [requiredMcpServer])
})

test('missing, duplicate, ambient, unhealthy, and incomplete MCP observations fail closed', () => {
  const cases = [
    {
      kind: 'required_mcp_missing',
      change: fixture => {
        fixture.observation.mcpServers = []
      },
    },
    {
      kind: 'duplicate_mcp_server',
      change: fixture => {
        fixture.observation.mcpServers.push(structuredClone(fixture.observation.mcpServers[0]))
      },
    },
    {
      kind: 'unexpected_mcp_servers',
      change: fixture => {
        fixture.observation.mcpServers.push({ name: 'ambient-server', status: 'ready', health: 'healthy', tools: [] })
      },
    },
    {
      kind: 'required_mcp_not_ready',
      change: fixture => {
        fixture.observation.mcpServers[0].status = 'starting'
      },
    },
    {
      kind: 'required_tools_missing',
      change: fixture => {
        fixture.observation.mcpServers[0].tools.pop()
      },
    },
  ]

  for (const { kind, change } of cases) {
    const fixture = makeFixture()
    change(fixture)
    assert.equal(runFixture(fixture).qualified, false, kind)
    assertKinds(runFixture(fixture), [kind])
  }
})

test('untrusted server substitution cannot redefine the required MCP identity', () => {
  const fixture = makeFixture()
  fixture.observation.mcpServers[0].name = 'ambient-server'

  const result = runFixture(fixture)
  assert.equal(result.qualified, false)
  assertKinds(result, ['required_mcp_missing', 'unexpected_mcp_servers'])
})

test('missing and semantically invalid boundary evidence fails closed', () => {
  for (const field of ['activePermissionProfile', 'instructionSources', 'runtimeWorkspaceRoots', 'sandbox']) {
    const fixture = makeFixture()
    fixture.observation.threadStartResponse[field] = null
    const result = runFixture(fixture)
    assert.equal(result.qualified, false, field)
    assertKinds(result, ['boundary_evidence_missing'])
  }

  const cases = [
    ['activePermissionProfile', { id: '' }, 'permission_profile_invalid'],
    ['instructionSources', [42], 'instruction_sources_invalid'],
    ['runtimeWorkspaceRoots', [null], 'workspace_roots_invalid'],
    ['sandbox', { type: 'readOnly' }, 'sandbox_evidence_invalid'],
  ]
  for (const [field, value, kind] of cases) {
    const fixture = makeFixture()
    fixture.observation.threadStartResponse[field] = value
    const result = runFixture(fixture)
    assert.equal(result.qualified, false, field)
    assertKinds(result, [kind])
  }
})

test('empty, missing, extra, duplicate, and reordered effective tools fail closed', () => {
  const cases = [
    {
      kind: 'tool_inventory_empty',
      change: fixture => {
        fixture.observation.effectiveManifestEvidence.tools = []
      },
    },
    {
      kind: 'required_tools_missing',
      change: fixture => {
        fixture.observation.effectiveManifestEvidence.tools.pop()
      },
    },
    {
      kind: 'unexpected_tools',
      change: fixture => {
        fixture.observation.effectiveManifestEvidence.tools.push(
          tool('unexpected', { type: 'object', additionalProperties: false }),
        )
      },
    },
    {
      kind: 'duplicate_tool',
      change: fixture => {
        fixture.observation.effectiveManifestEvidence.tools.push(
          structuredClone(fixture.observation.effectiveManifestEvidence.tools[0]),
        )
      },
    },
    {
      kind: 'tool_order_mismatch',
      change: fixture => {
        fixture.observation.effectiveManifestEvidence.tools.reverse()
      },
    },
  ]

  for (const { kind, change } of cases) {
    const fixture = makeFixture()
    change(fixture)
    const result = runFixture(fixture)
    assert.equal(result.qualified, false, kind)
    assertKinds(result, [kind])
  }
})

test('tool origin, canonical schema, and declared schema-hash tampering fails closed', () => {
  const originFixture = makeFixture()
  originFixture.observation.effectiveManifestEvidence.tools[0].origin = 'native'
  assertKinds(runFixture(originFixture), ['tool_origin_mismatch'])

  const schemaFixture = makeFixture()
  schemaFixture.observation.effectiveManifestEvidence.tools[0].inputSchema.required = []
  assertKinds(runFixture(schemaFixture), ['tool_schema_hash_mismatch', 'tool_schema_mismatch'])

  const hashFixture = makeFixture()
  hashFixture.observation.effectiveManifestEvidence.tools[0].schemaHash = 'd'.repeat(64)
  assertKinds(runFixture(hashFixture), ['tool_schema_hash_mismatch', 'tool_schema_mismatch'])
})

test('launch identity must match the trusted expectation in both receipt and effective manifest', () => {
  const receiptFixture = makeFixture()
  receiptFixture.observation.threadStartResponse.launchIdentity.launchNonce = 'different-launch'
  assertKinds(runFixture(receiptFixture), ['launch_identity_mismatch'])

  const manifestFixture = makeFixture()
  manifestFixture.observation.effectiveManifestEvidence.launchIdentity.launchNonce = 'different-launch'
  assertKinds(runFixture(manifestFixture), ['launch_identity_mismatch'])
})

test('adapter-authored evidence cannot replace trusted exact-subject provenance verification', () => {
  const fixture = makeFixture()
  const withoutVerifier = evaluatePreTurnQualification(fixture.observation, {
    expectedManifest: fixture.trusted.expectedManifest,
  })
  assertKinds(withoutVerifier, ['manifest_provenance_unavailable'])

  fixture.trusted.verifyManifestProvenance = ({ subjectHash, launchIdentityHash }) => ({
    verified: true,
    subjectHash: `adapter-${subjectHash}`,
    launchIdentityHash,
    provenanceId: 'adapter-self-claim',
  })
  assertKinds(runFixture(fixture), ['manifest_provenance_unverified'])
})

test('post-verification mutation and premature turn/start fail closed', () => {
  const mutationFixture = makeFixture()
  mutationFixture.trusted.verifyManifestProvenance = ({ subject, subjectHash, launchIdentityHash }) => {
    subject.effectiveManifestEvidence.tools[0].name = 'mutated-after-hash'
    return { verified: true, subjectHash, launchIdentityHash, provenanceId: 'trusted-test-verifier' }
  }
  assertKinds(runFixture(mutationFixture), ['manifest_evidence_mutated'])

  const turnFixture = makeFixture()
  turnFixture.observation.sentMethods.push('turn/start')
  assertKinds(runFixture(turnFixture), ['turn_started_before_qualification'])
})

test('the sanitized receipt hashes provider thread identity', () => {
  const fixture = makeFixture()
  const receipt = sanitizeStartupReceipt({
    executable: '/fixture/codex',
    executableHash: 'exe-hash',
    protocolHash: 'protocol-hash',
    response: fixture.observation.threadStartResponse,
  })

  assert.equal(receipt.threadIdHash.length, 64)
  assert.equal(JSON.stringify(receipt).includes('thread-secret-id'), false)
})

function tool(name, inputSchema) {
  return {
    name,
    origin: `mcp:${requiredMcpServer}`,
    inputSchema,
    schemaHash: canonicalSchemaHash(inputSchema),
  }
}

function makeFixture() {
  const observation = {
    mcpServers: [
      {
        name: requiredMcpServer,
        status: 'ready',
        health: 'healthy',
        tools: structuredClone(tools),
      },
    ],
    threadStartResponse: {
      ...structuredClone(boundaryEvidence),
      launchIdentity: structuredClone(launchIdentity),
      thread: { id: 'thread-secret-id' },
    },
    sentMethods: ['initialize', 'initialized', 'thread/start', 'mcpServerStatus/list'],
    effectiveManifestEvidence: {
      launchIdentity: structuredClone(launchIdentity),
      tools: structuredClone(tools),
    },
    manifestProvenance: {
      kind: 'synthetic-checker-evidence',
      provenanceId: 'synthetic-checker-fixture-1',
    },
  }
  const trusted = {
    expectedManifest: structuredClone(expectedManifest),
    verifyManifestProvenance: ({ manifestProvenance, subjectHash, launchIdentityHash }) => {
      assert.equal(manifestProvenance.kind, 'synthetic-checker-evidence')
      return {
        verified: true,
        subjectHash,
        launchIdentityHash,
        provenanceId: manifestProvenance.provenanceId,
      }
    },
  }
  return { observation, trusted }
}

function runFixture(fixture) {
  return evaluatePreTurnQualification(fixture.observation, fixture.trusted)
}

function qualifyFixture() {
  return runFixture(makeFixture())
}

function assertKinds(result, expectedKinds) {
  const kinds = result.findings.map(finding => finding.kind)
  for (const expectedKind of expectedKinds) {
    assert.equal(kinds.includes(expectedKind), true, `${expectedKind} missing from ${kinds.join(', ')}`)
  }
}
