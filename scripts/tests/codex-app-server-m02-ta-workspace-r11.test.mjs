import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { POLICY, digest } from './fixtures/codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { loadSealedRouteEvidence } from './fixtures/codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { prepareTrustedCase } from './fixtures/codex-app-server-m02-ta-workspace-r10/composition.mjs'
import { createWorkspaceNativeSession } from './fixtures/codex-app-server-m02-ta-workspace-r11/native-session.mjs'
import {
  prepareWorkspaceManifest,
  selectT3CanonicalPins,
} from './fixtures/codex-app-server-m02-ta-workspace-r11/manifest.mjs'
import { stageMatrixModules } from './fixtures/codex-app-server-m02-ta-matrix-r10/matrix-stage.mjs'
import {
  writeWorkspacePreparation,
  WORKSPACE_BUILD,
  WORKSPACE_MANIFEST,
} from './fixtures/codex-app-server-m02-ta-workspace-r11/preparation.mjs'
import {
  runPreparedT3Workspace,
  verifyWorkspaceCaseCounts,
} from './fixtures/codex-app-server-m02-ta-workspace-r11/workspace-runner.mjs'
import {
  dispatchWorkspaceEntrypoint,
  reviewedHostEnvironment,
} from './fixtures/codex-app-server-m02-ta-workspace-r11/entrypoint.mjs'
import {
  assertR12ActualIdentity,
  T2_INDEX,
  T2_ACTUAL_REVIEW,
} from './fixtures/codex-app-server-m02-ta-workspace-r11/prior-t2.mjs'

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
const native = (caseId, { failProof = false } = {}) => {
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
      if (failProof) throw new Error('owned FD proof failed')
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
  assert.equal(fs.existsSync(T2_INDEX), false)
  assert.equal(fs.existsSync(T2_ACTUAL_REVIEW), false)
  assert.equal(fs.existsSync(POLICY.roots.T3), false)
  await assert.rejects(prepareWorkspaceManifest(), /actual evidence unavailable/)
  assert.equal(fs.existsSync(POLICY.roots.T3), false)
})

test('old p1 UNKNOWN index and review cannot satisfy the R12 p2 T3 admission contract', () => {
  const index = JSON.parse(fs.readFileSync('.appraisejs/m02-ta-t2-r10-execution-evidence-01/index.json'))
  const review = JSON.parse(fs.readFileSync('.appraisejs/m02-t2-r11-execution-review-01.json'))
  assert.throws(
    () =>
      assertR12ActualIdentity({ index, review, manifestDigest: 'a'.repeat(64), manifestFileSha256: 'b'.repeat(64) }),
    /old UNKNOWN/,
  )
})

test('T3 stages only the accepted R10 canonical bytes from R12 history in a disposable directory', async () => {
  const t2 = JSON.parse(fs.readFileSync('.appraisejs/m02-ta-matrix-build-r12/manifest.json')).manifest
  const selected = selectT3CanonicalPins(t2)
  assert.equal(selected.historical.filter(item => item.purpose === 'matrix-canonical-backend').length, 1)
  assert.equal(selected.historical.filter(item => item.purpose === 'historical-t2-r12-canonical-backend').length, 1)
  assert.equal(selected.active.sha256, 'e2c7d99a882465437dd3ea878c85fafc8eaa47ca13578214ad3a2237c3ad5e67')
  const stageSource = fs.readFileSync(
    fileURLToPath(new URL('./fixtures/codex-app-server-m02-ta-matrix-r10/matrix-stage.mjs', import.meta.url)),
    'utf8',
  )
  assert.ok(stageSource.includes('.appraisejs/m02-ta-matrix-build-r10/canonical-bridge.mjs'))
  const root = await fs.promises.mkdtemp('/private/tmp/appraise-m02-t3-canonical-stage-')
  try {
    const staged = await stageMatrixModules({
      prepared: { manifest: { artifacts: selected.historical } },
      phaseRoot: root,
      stageRoot: join(root, 'supervisor'),
      offlineCanonicalBytes: fs.readFileSync(selected.active.path),
    })
    assert.equal(sha(fs.readFileSync(staged.bundlePath)), selected.active.sha256)
    assert.equal(fs.existsSync(POLICY.roots.T3), false)
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true })
  }
})

test('T3 writer refuses absent T2 actual review and creates no output', async () => {
  assert.equal(fs.existsSync(WORKSPACE_BUILD), false)
  await assert.rejects(writeWorkspacePreparation())
  assert.equal(fs.existsSync(WORKSPACE_BUILD), false)
})

test('T3 runner refuses absent exact review before constructing fixed root', async () => {
  const manifest = {
    version: 'appraise.m02-ta-workspace-r11/v1',
    phase: 'T3',
    root: POLICY.roots.T3,
    nativeFileCreationUmask: '0077',
    cases: ['N01', 'N02'],
    ta03: { nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' },
    sourceHostBudget: { nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' },
  }
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
    assert.deepEqual(state.reservations, [
      ['workspaceActions', `${caseId}-workspace-action`],
      ['outerCalls', `${caseId}-outer-1`],
    ])
    assert.equal(state.session.snapshot().workspaceActionPending, true)
    assert.equal(state.session.snapshot().outerPending, true)
    await assert.rejects(state.session.handle(request(caseId, [], 2)), /outer ACK/)
    first.afterWrite()
    assert.deepEqual(state.acks, [`${caseId}-outer-1`])
    const output = continuation(state.session, caseId)
    const second = await state.session.handle(request(caseId, [output], 2))
    assert.equal(second.status, 200)
    assert.equal(state.verifies, 1)
    assert.equal(state.session.snapshot().completed, true)
    assert.equal(state.session.snapshot().workspaceActionPending, false)
    assert.deepEqual(state.acks, [`${caseId}-outer-1`, `${caseId}-workspace-action`])
    assert.equal(state.session.snapshot().nativeStatus, 'FIXED_WORKSPACE_EFFECT_CORRELATED')
    assert.equal(state.entries.filter(item => item.name === 'workspace-proof').length, 1)
    assert.equal(
      state.entries.find(item => item.name === 'workspace-proof').value.nativeScratchHelperInventory,
      'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
    )
    assert.equal(
      state.entries.some(item => JSON.stringify(item).includes('M02-TA-')),
      false,
    )
    second.afterWrite()
    await assert.rejects(state.session.handle(request(caseId, [output], 3)), /budget/)
  })

test('failed owned workspace proof leaves the durable action intent pending and sends no terminal SSE', async () => {
  const state = native('N01', { failProof: true })
  const first = await state.session.handle(request('N01', [], 1))
  first.afterWrite()
  await assert.rejects(
    state.session.handle(request('N01', [continuation(state.session, 'N01')], 2)),
    /owned FD proof failed/,
  )
  assert.equal(state.session.snapshot().workspaceActionPending, true)
  assert.equal(state.session.snapshot().completed, false)
  assert.deepEqual(state.acks, ['N01-outer-1'])
  assert.equal(
    state.entries.some(item => item.name === 'provider-response-2'),
    false,
  )
})

test('T3 case completion requires two scoped-worker startup canonical requests and one workspace action', () => {
  const counts = {
    threadStarts: 1,
    turnStarts: 1,
    providerRequests: 2,
    outerCalls: 1,
    workspaceActions: 1,
    scopedCalls: 0,
    auditRequests: 0,
    canonicalRequests: 2,
    permissionReplies: 0,
  }
  assert.equal(POLICY.cases.find(item => item.id === 'N01').limits.canonicalRequests, 2)
  assert.equal(verifyWorkspaceCaseCounts(counts), true)
  assert.equal(verifyWorkspaceCaseCounts({ ...counts, canonicalRequests: 0 }), false)
  assert.equal(verifyWorkspaceCaseCounts({ ...counts, workspaceActions: 0 }), false)
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

test('R11 host environment accepts only bounded macOS text metadata', () => {
  assert.equal(reviewedHostEnvironment({ PATH: '/usr/bin:/bin', LANG: 'C' }), true)
  assert.equal(
    reviewedHostEnvironment({ PATH: '/usr/bin:/bin', LANG: 'C', __CF_USER_TEXT_ENCODING: '0x1F7:0x0:0x0' }),
    true,
  )
  for (const environment of [
    { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/private/tmp' },
    { PATH: '/usr/bin:/bin', LANG: 'C', __CF_USER_TEXT_ENCODING: 'malformed' },
    { PATH: '/usr/bin:/bin', LANG: 'C', __CF_USER_TEXT_ENCODING: '0x1:0x2:0x3', USER: 'extra' },
  ])
    assert.equal(reviewedHostEnvironment(environment), false)
})

test('R11 exact command gate keeps two T3 cases and zero canonical or audit requests', async () => {
  const entry = fileURLToPath(
    new URL('./fixtures/codex-app-server-m02-ta-workspace-r11/entrypoint.mjs', import.meta.url),
  )
  const manifestFile = WORKSPACE_MANIFEST
  const entryHash = sha(fs.readFileSync(entry))
  const manifest = {
    version: 'appraise.m02-ta-workspace-r11/v1',
    phase: 'T3',
    root: POLICY.roots.T3,
    cases: ['N01', 'N02'],
    blockers: [],
    artifacts: [{ path: entry, sha256: entryHash }],
    ta03: {
      proposalSha256: '1'.repeat(64),
      approvalRecordSha256: '2'.repeat(64),
      nativeScratchHelperInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
    },
    predecessor: {
      t2ActualReviewSha256: '3'.repeat(64),
      t2R12ExactReviewSha256: '6'.repeat(64),
      t2R12UserDecisionSha256: '7'.repeat(64),
      t2R12RecoveryProposalSha256: '8'.repeat(64),
    },
  }
  const prepared = {
    manifest,
    manifestDigest: digest(manifest),
    manifestFileSha256: '4'.repeat(64),
    seal: {},
    blockers: [],
  }
  const reviewSha = '5'.repeat(64)
  const review = {
    schema: 'appraise.m02-ta-t3-r11-exact-review/v1',
    reviewer: '/root/r6_exact_review',
    verdict: 'ACCEPT_ONE_FIXED_T3_R11_INVOCATION',
    runtimeVerdict: 'NOT_RUN',
    exactInvocationPrefix: [
      '/usr/bin/env',
      '-i',
      'PATH=/usr/bin:/bin',
      'LANG=C',
      '/opt/homebrew/Cellar/node/26.11.0/bin/node',
      entry,
      '--run',
      manifestFile,
      prepared.manifestDigest,
      prepared.manifestFileSha256,
    ],
    manifest: {
      path: manifestFile,
      fileSha256: prepared.manifestFileSha256,
      manifestDigest: prepared.manifestDigest,
      phase: 'T3',
      root: POLICY.roots.T3,
      cases: ['N01', 'N02'],
    },
    entrypointSha256: entryHash,
    ta03ProposalSha256: manifest.ta03.proposalSha256,
    ta03ApprovalRecordSha256: manifest.ta03.approvalRecordSha256,
    t2ActualReviewSha256: manifest.predecessor.t2ActualReviewSha256,
    t2R12ExactReviewSha256: manifest.predecessor.t2R12ExactReviewSha256,
    t2R12UserDecisionSha256: manifest.predecessor.t2R12UserDecisionSha256,
    t2R12RecoveryProposalSha256: manifest.predecessor.t2R12RecoveryProposalSha256,
  }
  const action = (authorize, name, id) =>
    authorize({ action: name, id, manifestDigest: prepared.manifestDigest, manifest })
  const args = ['--run', manifestFile, prepared.manifestDigest, prepared.manifestFileSha256, reviewSha]
  let addonLoads = 0
  const ports = {
    environment: { PATH: '/usr/bin:/bin', LANG: 'C', __CF_USER_TEXT_ENCODING: '0x1:0x2:0x3' },
    execPath: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    programPath: entry,
    verify: async () => prepared,
    readReview: async () => ({ receipt: review, sha256: reviewSha }),
    verifyHostFile: async () => ({ uid: 502 }),
    loadAddon: async () => {
      addonLoads++
      return { identity() {}, listDirectChildren() {}, directChildMetadata() {} }
    },
    run: async ({ authorize, verifyExactReview }) => {
      assert.equal(await verifyExactReview({ manifestDigest: prepared.manifestDigest, manifest }), true)
      assert.equal(await action(authorize, 'owned-loopback-listener', 'N02-listener'), false)
      assert.equal(await action(authorize, 'owned-loopback-listener', 'N01-listener'), true)
      assert.equal(await action(authorize, 'canonical-ipc-request', 'N01-listener-canonical-1'), false)
      assert.equal(await action(authorize, 'scoped-audit-request', 'N01-listener-audit-1'), false)
      assert.equal(await action(authorize, 'scripted-provider-request', 'N01-listener-request-1'), true)
      assert.equal(await action(authorize, 'scripted-provider-request', 'N01-listener-request-2'), true)
      assert.equal(await action(authorize, 'scripted-provider-request', 'N01-listener-request-3'), false)
      assert.equal(await action(authorize, 'owned-stop', 'N01-stop'), true)
      assert.equal(await action(authorize, 'owned-loopback-listener', 'N02-listener'), true)
      assert.equal(await action(authorize, 'scripted-provider-request', 'N02-listener-request-1'), true)
      assert.equal(await action(authorize, 'owned-stop', 'N02-stop'), true)
      return { status: 'FAKE_ONLY' }
    },
  }
  await assert.rejects(
    dispatchWorkspaceEntrypoint(args, {
      ...ports,
      verifyHostFile: async () => {
        throw new Error('installed UID drift')
      },
    }),
    /installed UID drift/,
  )
  assert.equal(addonLoads, 0)
  const result = await dispatchWorkspaceEntrypoint(args, ports)
  assert.equal(result.status, 'FAKE_ONLY')
  assert.equal(addonLoads, 1)
  assert.equal(fs.existsSync(POLICY.roots.T3), false)
})
