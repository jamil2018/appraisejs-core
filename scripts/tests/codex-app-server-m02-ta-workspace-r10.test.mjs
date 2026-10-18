import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { POLICY, digest } from './fixtures/codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { loadSealedRouteEvidence } from './fixtures/codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { prepareTrustedCase } from './fixtures/codex-app-server-m02-ta-workspace-r10/composition.mjs'
import { createWorkspaceNativeSession } from './fixtures/codex-app-server-m02-ta-workspace-r10/native-session.mjs'
import {
  prepareWorkspaceManifest,
  T3_HELPER_BLOCKER,
} from './fixtures/codex-app-server-m02-ta-workspace-r10/manifest.mjs'
import {
  writeWorkspacePreparation,
  WORKSPACE_BUILD,
} from './fixtures/codex-app-server-m02-ta-workspace-r10/preparation.mjs'
import { runPreparedT3Workspace } from './fixtures/codex-app-server-m02-ta-workspace-r10/workspace-runner.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const manifestDigest = 'a'.repeat(64)
const configSha = `sha256:${'b'.repeat(64)}`
const seal = loadSealedRouteEvidence()
const baseContext = caseId => {
  const context = { ...seal.capture.provenance }
  delete context.attestation
  return {
    ...context,
    runId: manifestDigest,
    requestId: `${caseId}-listener-request-1`,
    threadId: `${caseId}-thread`,
    turnId: `${caseId}-turn`,
    configSha256: configSha,
  }
}
const request = (caseId, items, index) => {
  const body = {
    model: POLICY.model,
    reasoning: { effort: POLICY.reasoning },
    input: [
      {
        role: 'developer',
        type: 'additional_tools',
        id: 'at_00000000-0000-5000-8000-000000000001',
        tools: structuredClone(seal.capture.containers[0].tools),
      },
      ...items,
    ],
  }
  return {
    body,
    bodyBytes: Buffer.from(JSON.stringify(body)),
    context: { ...baseContext(caseId), requestId: `${caseId}-listener-request-${index}` },
  }
}
const continuation = (session, caseId) => {
  const plan = session.plan
  const result = caseId === 'N01' ? { exit_code: 0, output: plan.expectedBytes, wall_time_seconds: 0.1 } : {}
  return {
    type: 'custom_tool_call_output',
    call_id: plan.callId,
    output: [
      { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
      {
        type: 'input_text',
        text: JSON.stringify({
          schema: 'appraise.m02-native-envelope/v1',
          caseId,
          callId: plan.callId,
          operation: plan.operation,
          result,
        }),
      },
    ],
  }
}
const native = caseId => {
  const entries = [],
    reservations = [],
    acks = []
  const proof = Object.freeze({
    relativePath: `scratch/${caseId.toLowerCase()}.txt`,
    absentBefore: true,
    ownedRegularSingleLink: true,
    bytes: `M02-TA-${caseId}\n`,
    contentSha256: sha(`M02-TA-${caseId}\n`),
    rootDevice: '1',
    rootInode: '2',
    scratchInode: '3',
    evidenceProvenance: 'OWNED_SCRATCH_FD_READ_V1',
  })
  let verifies = 0
  const issuer = {
    async verify() {
      verifies++
      return proof
    },
    verifyIssuedWorkspaceProof(value) {
      return value === proof
    },
  }
  const session = createWorkspaceNativeSession({
    caseId,
    seal,
    expectedConfigSha256: configSha,
    manifestDigest,
    issuer,
    token: Object.freeze({}),
    writeReceipt: (name, value) => entries.push({ name, value }),
    journal: { reserve: (...args) => reservations.push(args), acknowledge: id => acks.push(id) },
  })
  return {
    session,
    entries,
    reservations,
    acks,
    get verifies() {
      return verifies
    },
  }
}

test('T3 composition retains the required MCP profile and source budget without effects', () => {
  const manifest = { phase: 'T3', root: POLICY.roots.T3, cases: ['N01', 'N02'] }
  const prepared = { manifest, manifestDigest: digest(manifest) }
  const output = prepareTrustedCase(prepared, 'N01', {
    port: 33333,
    mcpExecutable: '/synthetic/node',
    mcpArgs: ['/synthetic/scoped-entry.mjs', '--m02-ta-scoped-worker'],
  })
  assert.equal(output.config.mcp_servers.appraise_m02.required, true)
  assert.equal(output.config.features.code_mode_host, true)
  assert.equal(output.config.features.code_mode_prewarm, false)
  assert.equal(output.config.features.shell_snapshot, false)
  assert.equal(output.config.code_mode.disable_in_process_fallback, true)
  assert.equal(output.config.model, POLICY.model)
  assert.equal(output.config.model_reasoning_effort, POLICY.reasoning)
})

test('T3 preparation cannot advance while independent T2 actual evidence is absent', async () => {
  assert.equal(fs.existsSync(POLICY.roots.T3), false)
  await assert.rejects(prepareWorkspaceManifest())
  assert.equal(fs.existsSync(POLICY.roots.T3), false)
})

test('known N01 helper-observation gap prevents any T3 preparation output', async () => {
  assert.equal(fs.existsSync(WORKSPACE_BUILD), false)
  await assert.rejects(writeWorkspacePreparation(), new RegExp(T3_HELPER_BLOCKER))
  assert.equal(fs.existsSync(WORKSPACE_BUILD), false)
})

test('T3 runner refuses absent exact review before constructing fixed root', async () => {
  const manifest = { phase: 'T3', root: POLICY.roots.T3, nativeFileCreationUmask: '0077', cases: ['N01', 'N02'] }
  await assert.rejects(
    runPreparedT3Workspace({
      prepared: { manifest, manifestDigest: digest(manifest) },
      verifyExactReview: () => false,
      authorize: () => true,
      observerOs: { identity() {} },
    }),
    /exact T3 review absent/,
  )
  assert.equal(fs.existsSync(POLICY.roots.T3), false)
})

for (const caseId of ['N01', 'N02'])
  test(`${caseId} scripted native path requires full capture, one output and owned proof`, async () => {
    const state = native(caseId)
    const first = await state.session.handle(request(caseId, [], 1))
    assert.equal(first.status, 200)
    assert.match(first.body, /response.completed/)
    assert.equal(state.reservations.length, 1)
    assert.equal(state.session.snapshot().outerPending, true)
    await assert.rejects(state.session.handle(request(caseId, [], 2)), /outer ACK/)
    first.afterWrite()
    assert.deepEqual(state.acks, [`${caseId}-outer-1`])
    const output = continuation(state.session, caseId)
    const second = await state.session.handle(request(caseId, [output], 2))
    assert.equal(second.status, 200)
    assert.equal(state.verifies, 1)
    assert.equal(state.session.snapshot().completed, true)
    assert.equal(state.session.snapshot().nativeStatus, 'FIXED_WORKSPACE_EFFECT_CORRELATED')
    assert.equal(state.entries.filter(item => item.name === 'workspace-proof').length, 1)
    assert.equal(
      state.entries.some(item => JSON.stringify(item).includes('M02-TA-')),
      false,
    )
    second.afterWrite()
    await assert.rejects(state.session.handle(request(caseId, [output], 3)), /budget/)
  })

test('foreign transcript and malformed native continuation never consume the workspace verifier', async () => {
  const state = native('N01')
  const first = await state.session.handle(request('N01', [], 1))
  first.afterWrite()
  await assert.rejects(
    state.session.handle(request('N01', [{ type: 'custom_tool_call_output', call_id: 'foreign', output: [] }], 2)),
    /unscheduled/,
  )
  assert.equal(state.verifies, 0)
})
