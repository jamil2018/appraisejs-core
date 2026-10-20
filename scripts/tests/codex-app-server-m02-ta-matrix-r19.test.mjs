import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { createSyntheticSession } from './fixtures/codex-app-server-m02-ta-continuation-r18/synthetic-session.mjs'
import { createMatrixScriptSession as frozenSession } from './fixtures/codex-app-server-m02-ta-continuation-r18/script-session.mjs'
import { createMatrixScriptSession as instrumentedSession } from './fixtures/codex-app-server-m02-ta-matrix-r19/script-session.mjs'
import { createNativePorts } from './fixtures/codex-app-server-m02-ta-matrix-r19/runtime-effects.mjs'
import { createTrustedLauncher } from './fixtures/codex-app-server-m02-ta-matrix-r19/launcher.mjs'
import { createProviderFailureRecorder } from './fixtures/codex-app-server-m02-ta-matrix-r19/provider-failure.mjs'
import { verifyConsumedR17 } from './fixtures/codex-app-server-m02-ta-matrix-r19/prior-evidence.mjs'
import { buildR19CanonicalBytes } from './fixtures/codex-app-server-m02-ta-matrix-r19/canonical-build.mjs'
import { prepareR19MatrixManifest } from './fixtures/codex-app-server-m02-ta-matrix-r19/manifest.mjs'
import { POLICY, ROOT, PRIOR_ROOT, digest } from './fixtures/codex-app-server-m02-ta-matrix-r19/policy.mjs'
import {
  dispatchMatrixEntrypoint,
  reviewedHostEnvironment,
} from './fixtures/codex-app-server-m02-ta-matrix-r19/entrypoint.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')

test('p4 UNKNOWN evidence remains read-only and p5 canonical relocation is one literal and reversible', async () => {
  const prior = await verifyConsumedR17()
  assert.equal(prior.status, 'PRIOR_P1_P2_P3_P4_UNKNOWN_PRESERVED')
  assert.equal(prior.manifest.artifacts.length, 6470)
  assert.deepEqual(prior.p4.consumed, { providerRequests: 2, outerCalls: 1, sourceCapacity: 4 })
  assert.equal(fs.existsSync(ROOT), false)
  const canonical = await buildR19CanonicalBytes()
  assert.equal(canonical.originalSha256, '8d03c8156ce171c63135c57b716ee5b3e6b679cf3dc18005d87f0fa45eed1893')
  assert.equal(canonical.relocation.count, 1)
  assert.equal(canonical.bytes.toString('utf8').includes(PRIOR_ROOT), false)
  assert.equal(canonical.bytes.toString('utf8').includes(ROOT), true)
})

test('pure R19 manifest rehashes the accepted R17 closure and has one active backend and scoped entry', async () => {
  const prepared = await prepareR19MatrixManifest()
  const manifest = prepared.manifest
  assert.equal(prepared.runtimeEligible, false)
  assert.equal(manifest.root, ROOT)
  assert.equal(manifest.cases.length, 24)
  assert.equal(manifest.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length, 1)
  assert.equal(manifest.artifacts.filter(item => item.purpose === 'scoped-mcp-entry').length, 1)
  assert.equal(
    manifest.artifacts.filter(
      item => item.sha256 === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ).length,
    16,
  )
  assert.equal(manifest.recoveryBudget.cumulativeWholeCampaignCeilings.providerRequests, 66)
  assert.equal(manifest.recoveryBudget.cumulativeWholeCampaignCeilings.listenerStarts, 31)
  assert.equal(manifest.recoveryBudget.combinedListenerAllocationCeilingIncludingR16, 32)
  assert.equal(manifest.futureInvocation.requestedHostToolMode, 'exec_command sandbox_permissions=require_escalated')
  assert.equal(manifest.futureInvocation.workdir, '/Users/jamil/Personal Projects/appraisejs')
  assert.equal(manifest.futureInvocation.noAutomaticT2T3, true)
  assert.deepEqual(manifest.futureInvocation.priorUnknownsRequired, ['p1', 'p2', 'p3', 'p4'])
  assert.equal(fs.existsSync(ROOT), false)
})

test('R19 entrypoint requires exact host, review, decision and retained p4 UNKNOWN before fake run', async () => {
  const repo = process.cwd()
  const entry = path.join(repo, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r19/entrypoint.mjs')
  const buildManifest = path.join(repo, '.appraisejs/m02-ta-matrix-build-r19/manifest.json')
  const sourceSha256 = sha(fs.readFileSync(entry))
  const prepared = { ...(await prepareR19MatrixManifest()), manifestFileSha256: 'a'.repeat(64) }
  const makeApproval = candidate => {
    const prefix = [
      '/usr/bin/env',
      '-i',
      'PATH=/usr/bin:/bin',
      'LANG=C',
      '/opt/homebrew/Cellar/node/26.11.0/bin/node',
      entry,
      '--run',
      buildManifest,
      candidate.manifestDigest,
      candidate.manifestFileSha256,
    ]
    const review = {
      schema: 'appraise.m02-ta-t2-r19-exact-review/v1',
      reviewer: '/root/continuation_review',
      verdict: 'ACCEPT_ONE_FIXED_T2_R19_INVOCATION',
      runtimeVerdict: 'NOT_RUN',
      exactInvocationPrefix: prefix,
      manifest: {
        path: buildManifest,
        fileSha256: candidate.manifestFileSha256,
        manifestDigest: candidate.manifestDigest,
        phase: 'T2',
        root: ROOT,
        cases: candidate.manifest.cases,
      },
      entrypointSha256: sourceSha256,
      recoveryProposalSha256: candidate.manifest.recoveryProposalSha256,
      requestedHostToolMode: 'exec_command sandbox_permissions=require_escalated',
      workdir: repo,
      noAutomaticT2T3: true,
      priorP1P2P3P4UnknownPreserved: true,
      preflightEvidence: candidate.manifest.preflightEvidence,
    }
    const reviewSha = sha(Buffer.from(JSON.stringify(review)))
    const decision = {
      schema: 'appraise.m02-ta-t2-r19-recovery-user-decision/v1',
      verdict: 'APPROVE_ONE_FIXED_T2_R19_RECOVERY',
      scope: 'ONE_NEW_FULL_T2_P5_INVOCATION_NO_RESUME',
      evidenceClass: 'VISIBLE_HOST_CONVERSATION_DECISION_TRANSCRIBED_NOT_CRYPTOGRAPHIC_ATTESTATION',
      manifestDigest: candidate.manifestDigest,
      manifestFileSha256: candidate.manifestFileSha256,
      exactReviewSha256: reviewSha,
      proposal: {
        path: candidate.manifest.recoveryProposalPath,
        sha256: candidate.manifest.recoveryProposalSha256,
      },
      exactInvocationPrefix: [...prefix, reviewSha],
      priorP1P2P3P4UnknownPreserved: true,
      requestedHostToolMode: 'exec_command sandbox_permissions=require_escalated',
      workdir: repo,
      noAutomaticT2T3: true,
      preflightEvidence: candidate.manifest.preflightEvidence,
      cumulativeWholeCampaignCeilings: candidate.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
    }
    return {
      review,
      decision,
      reviewSha,
      decisionSha: sha(Buffer.from(JSON.stringify(decision))),
      args: [
        '--run',
        buildManifest,
        candidate.manifestDigest,
        candidate.manifestFileSha256,
        reviewSha,
        sha(Buffer.from(JSON.stringify(decision))),
      ],
    }
  }
  assert.equal(reviewedHostEnvironment({ PATH: '/usr/bin:/bin', LANG: 'C' }), true)
  assert.equal(reviewedHostEnvironment({ PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/private' }), false)
  assert.equal(
    reviewedHostEnvironment({ PATH: '/usr/bin:/bin', LANG: 'C', __CF_USER_TEXT_ENCODING: '0x1:0x2:0x3' }),
    true,
  )
  const approval = makeApproval(prepared)
  const counts = { host: 0, prior: 0, addon: 0, run: 0 }
  const ports = {
    environment: { PATH: '/usr/bin:/bin', LANG: 'C' },
    execPath: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    programPath: entry,
    cwd: repo,
    verify: async () => prepared,
    sourceSha256: async () => sourceSha256,
    readReview: async () => ({ receipt: approval.review, sha256: approval.reviewSha }),
    readDecision: async () => ({ receipt: approval.decision, sha256: approval.decisionSha }),
    verifyHostFile: async () => {
      counts.host++
    },
    verifyPrior: async options => {
      counts.prior++
      return verifyConsumedR17(options)
    },
    loadAddon: async () => {
      counts.addon++
      return { identity() {}, listDirectChildren() {}, directChildMetadata() {} }
    },
    run: async ({ verifyExactReview, observerOs }) => {
      counts.run++
      assert.equal(typeof observerOs.identity, 'function')
      assert.equal(
        await verifyExactReview({ manifestDigest: prepared.manifestDigest, manifest: prepared.manifest }),
        true,
      )
      return { status: 'FAKE_PORTS_ONLY' }
    },
  }
  for (const override of [
    { environment: { PATH: '/usr/bin:/bin', LANG: 'C', HOME: '/private' } },
    { cwd: '/private/tmp' },
  ]) {
    await assert.rejects(
      dispatchMatrixEntrypoint(approval.args, { ...ports, ...override }),
      /host invocation environment changed/,
    )
  }
  await assert.rejects(
    dispatchMatrixEntrypoint(approval.args, {
      ...ports,
      readReview: async () => {
        throw new Error('offline exact review absent')
      },
    }),
    /offline exact review absent/,
  )
  await assert.rejects(
    dispatchMatrixEntrypoint(approval.args, {
      ...ports,
      readReview: async () => ({ receipt: approval.review, sha256: '0'.repeat(64) }),
    }),
    /independent exact R19 review absent or changed/,
  )
  await assert.rejects(
    dispatchMatrixEntrypoint(approval.args, {
      ...ports,
      readDecision: async () => {
        throw new Error('offline user decision absent')
      },
    }),
    /offline user decision absent/,
  )
  await assert.rejects(
    dispatchMatrixEntrypoint(approval.args, {
      ...ports,
      readDecision: async () => ({ receipt: approval.decision, sha256: '0'.repeat(64) }),
    }),
    /explicit R19 user decision absent or changed/,
  )
  const wrongReview = { ...approval.review, priorP1P2P3P4UnknownPreserved: false }
  await assert.rejects(
    dispatchMatrixEntrypoint(approval.args, {
      ...ports,
      readReview: async () => ({ receipt: wrongReview, sha256: approval.reviewSha }),
    }),
    /independent exact R19 review absent or changed/,
  )
  const wrongDecision = structuredClone(approval.decision)
  wrongDecision.cumulativeWholeCampaignCeilings.listenerStarts++
  await assert.rejects(
    dispatchMatrixEntrypoint(approval.args, {
      ...ports,
      readDecision: async () => ({ receipt: wrongDecision, sha256: approval.decisionSha }),
    }),
    /explicit R19 user decision absent or changed/,
  )
  assert.deepEqual(counts, { host: 0, prior: 0, addon: 0, run: 0 })
  const changedManifest = structuredClone(prepared.manifest)
  changedManifest.priorEvidence.p4.status = 'SUCCESS'
  const changedPrepared = { ...prepared, manifest: changedManifest, manifestDigest: digest(changedManifest) }
  const changedApproval = makeApproval(changedPrepared)
  await assert.rejects(
    dispatchMatrixEntrypoint(changedApproval.args, {
      ...ports,
      verify: async () => changedPrepared,
      readReview: async () => ({ receipt: changedApproval.review, sha256: changedApproval.reviewSha }),
      readDecision: async () => ({ receipt: changedApproval.decision, sha256: changedApproval.decisionSha }),
    }),
    /prepared manifest, source, or command drift/,
  )
  assert.deepEqual(counts, { host: 0, prior: 0, addon: 0, run: 0 })
  await assert.rejects(
    dispatchMatrixEntrypoint(approval.args, {
      ...ports,
      verifyPrior: async () => {
        counts.prior++
        throw new Error('p4 read-only guard refused')
      },
    }),
    /p4 read-only guard refused/,
  )
  assert.deepEqual(counts, { host: 1, prior: 1, addon: 0, run: 0 })
  const result = await dispatchMatrixEntrypoint(approval.args, ports)
  assert.equal(result.status, 'FAKE_PORTS_ONLY')
  assert.deepEqual(counts, { host: 2, prior: 2, addon: 1, run: 1 })
  assert.equal(fs.existsSync(ROOT), false)
})

async function sessionTrace({ caseId, createSession, compact = false, result = undefined }) {
  const stages = []
  const fixture = createSyntheticSession({
    caseId,
    createSession:
      createSession === instrumentedSession
        ? options => createSession({ ...options, onStage: stage => stages.push(stage) })
        : createSession,
  })
  const responses = [fixture.requestAndAck()]
  for (const plan of fixture.session.plans) {
    await fixture.executeCurrent(result === undefined ? {} : { result })
    const input = compact && plan.index > 0 ? [fixture.transcript[0], fixture.transcript.at(-1)] : fixture.transcript
    responses.push(fixture.requestAndAck(input))
  }
  return {
    bodies: responses.map(response => response.body),
    receipts: responses.map(response => response.receipt),
    reservations: fixture.reservations,
    acknowledgements: fixture.acknowledgements,
    completions: fixture.completions,
    snapshot: fixture.session.snapshot(),
    stages,
  }
}

test('R19 instrumented session preserves R18 cumulative, compact and returned-error behavior', async () => {
  for (const caseId of ['B01', 'B03', 'B07-A09']) {
    for (const compact of [false, true]) {
      const options = { caseId, compact }
      const frozen = await sessionTrace({ ...options, createSession: frozenSession })
      const revised = await sessionTrace({ ...options, createSession: instrumentedSession })
      assert.deepEqual(revised.bodies, frozen.bodies, `${caseId}:${compact}`)
      assert.deepEqual(revised.receipts, frozen.receipts, `${caseId}:${compact}`)
      assert.deepEqual(revised.reservations, frozen.reservations, `${caseId}:${compact}`)
      assert.deepEqual(revised.acknowledgements, frozen.acknowledgements, `${caseId}:${compact}`)
      assert.deepEqual(revised.completions, frozen.completions, `${caseId}:${compact}`)
      assert.equal(revised.snapshot.completed, frozen.snapshot.completed)
      assert.ok(revised.stages.includes('DESCRIPTOR_GATE'))
      assert.ok(revised.stages.includes('RESPONSE_RECEIPT_WRITE'))
    }
  }
  const error = { content: [{ type: 'text', text: 'synthetic error' }], isError: true }
  const frozen = await sessionTrace({ caseId: 'B01', createSession: frozenSession, result: error })
  const revised = await sessionTrace({ caseId: 'B01', createSession: instrumentedSession, result: error })
  assert.deepEqual(revised.bodies, frozen.bodies)
  assert.deepEqual(revised.receipts, frozen.receipts)
})

test('R19 stage callback failure cannot change a successful session response', async () => {
  const fixture = createSyntheticSession({
    createSession: options =>
      instrumentedSession({
        ...options,
        onStage: () => {
          throw new Error('synthetic marker failure')
        },
      }),
  })
  fixture.requestAndAck()
  for (const plan of fixture.session.plans) {
    await fixture.executeCurrent()
    const response = fixture.requestAndAck()
    assert.equal(response.receipt.decodedStatus, 'RESULT_CORRELATED', plan.callId)
  }
  assert.equal(fixture.session.snapshot().completed, true)
})

test('R19 refusal paths preserve R18 fence and no-resend behavior', async () => {
  const variants = {
    malformed: input => {
      input.at(-1).output[1].text = '{'
    },
    foreign: input => {
      input.at(-1).call_id = 'foreign'
    },
    duplicate: input => {
      input.push(structuredClone(input.at(-1)))
    },
    failedHeader: input => {
      input.at(-1).output[0].text = 'Script failed\nWall time 0.1 seconds\nOutput:\n'
    },
    yielded: input => {
      input.at(-1).output[0].text = 'Script running with cell ID 1\nOutput:\n'
    },
    priorMutation: input => {
      input[2].output[1].text = '{}'
    },
    reordered: input => {
      ;[input[1], input[3]] = [input[3], input[1]]
    },
  }
  for (const [label, mutate] of Object.entries(variants)) {
    const snapshots = []
    for (const createSession of [frozenSession, instrumentedSession]) {
      const fixture = createSyntheticSession({
        caseId: 'B03',
        createSession:
          createSession === instrumentedSession
            ? options => instrumentedSession({ ...options, onStage: () => {} })
            : frozenSession,
      })
      fixture.requestAndAck()
      await fixture.executeCurrent()
      fixture.requestAndAck()
      await fixture.executeCurrent()
      const input = structuredClone(fixture.transcript)
      mutate(input)
      assert.throws(() => fixture.request(input), undefined, `${label}:${createSession.name}`)
      assert.throws(() => fixture.request(fixture.transcript), /no resend/, label)
      snapshots.push({
        fenced: fixture.session.snapshot().fenced,
        requestIndex: fixture.session.snapshot().requestIndex,
        reservations: fixture.reservations.length,
        receipts: fixture.receipts.length,
      })
    }
    assert.deepEqual(snapshots[1], snapshots[0], label)
    assert.deepEqual(snapshots[1], { fenced: true, requestIndex: 2, reservations: 2, receipts: 3 }, label)
  }
  for (const createSession of [frozenSession, instrumentedSession]) {
    const fixture = createSyntheticSession({
      createSession:
        createSession === instrumentedSession
          ? options => instrumentedSession({ ...options, onStage: () => {} })
          : frozenSession,
    })
    fixture.request()
    await fixture.executeCurrent()
    assert.throws(() => fixture.request(), /no resend/)
    assert.equal(fixture.reservations.length, 1)
  }
})

test('session failure markers identify each accepted R18-derived boundary without retaining thrown data', async () => {
  const cases = [
    {
      stage: 'DESCRIPTOR_GATE',
      exercise: async fixture => {
        const input = structuredClone(fixture.transcript)
        input[0].id = 'foreign-descriptor'
        assert.throws(() => fixture.request(input))
      },
    },
    {
      stage: 'TRANSCRIPT_GATE',
      exercise: async fixture => {
        fixture.requestAndAck()
        await fixture.executeCurrent()
        const input = structuredClone(fixture.transcript)
        input.at(-1).call_id = 'foreign'
        assert.throws(() => fixture.request(input))
      },
    },
    {
      stage: 'AUDIT_SNAPSHOT',
      exercise: async fixture => {
        fixture.auditSession.snapshot = () => {
          throw new Error('private audit data')
        }
        assert.throws(() => fixture.request())
      },
    },
    {
      stage: 'CONTINUATION_DECODER',
      exercise: async fixture => {
        fixture.requestAndAck()
        await fixture.executeCurrent()
        const input = structuredClone(fixture.transcript)
        input.at(-1).output[0].text = 'Script failed\nWall time 0.1 seconds\nOutput:\n'
        assert.throws(() => fixture.request(input))
      },
    },
    {
      stage: 'AUDIT_COMPLETION',
      exercise: async fixture => {
        fixture.requestAndAck()
        await fixture.executeCurrent()
        fixture.auditSession.complete = () => {
          throw new Error('private audit data')
        }
        assert.throws(() => fixture.request())
      },
    },
    {
      stage: 'NEXT_OUTER_RESERVATION',
      exercise: async fixture => {
        fixture.journal.reserve = () => {
          throw new Error('private journal data')
        }
        assert.throws(() => fixture.request())
      },
    },
    {
      stage: 'RESPONSE_RECEIPT_WRITE',
      override: options => ({
        ...options,
        writeReceipt: (name, receipt) => {
          if (name === 'provider-response-1') throw new Error('private receipt data')
          options.writeReceipt(name, receipt)
        },
      }),
      exercise: async fixture => {
        assert.throws(() => fixture.request())
      },
    },
  ]
  for (const scenario of cases) {
    const stages = []
    const fixture = createSyntheticSession({
      createSession: options =>
        instrumentedSession({
          ...(scenario.override?.(options) ?? options),
          onStage: stage => stages.push(stage),
        }),
    })
    await scenario.exercise(fixture)
    assert.equal(stages.at(-1), scenario.stage)
    assert.equal(JSON.stringify(stages).includes('private'), false)
  }
})

async function fakeListenerScenario({ kind, markStage = null }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm02-r19-listener-'))
  fs.chmodSync(root, 0o700)
  let secretGetterReads = 0
  const secretError = {}
  for (const key of ['message', 'stack', 'body']) {
    Object.defineProperty(secretError, key, {
      get() {
        secretGetterReads++
        throw new Error('secret getter accessed')
      },
    })
  }
  const state = {
    activeCase: 'B01',
    current: 'B01',
    counts: { providerRequests: 0 },
    ids: [],
    pending: [],
    fenced: false,
  }
  const journal = { snapshot: () => structuredClone(state) }
  let handler
  const server = new EventEmitter()
  server.listen = (_port, _host, callback) => callback()
  server.address = () => ({ address: '127.0.0.1', port: 43123 })
  server.close = callback => callback()
  const manifest = {
    phase: 'T2',
    root,
    cases: ['B01'],
    artifacts: [{ purpose: 'interpreter', path: process.execPath, sha256: 'a'.repeat(64) }],
  }
  const prepared = { manifest, manifestDigest: digest(manifest), blockers: [] }
  const io = {
    fs: fsp,
    fileDigest: async () => 'a'.repeat(64),
    tuple: async () => ({
      platform: POLICY.executable.platform,
      arch: POLICY.executable.arch,
      osBuild: POLICY.executable.osBuild,
      nodeExecutable: process.execPath,
      nodeMajor: POLICY.executable.nodeMajor,
    }),
    createServer: callback => {
      handler = callback
      return server
    },
  }
  const reserve = (kind, id) => {
    state.ids.push(id)
    state.pending.push({ caseId: 'B01', kind, id })
    state.counts[kind] = (state.counts[kind] ?? 0) + 1
  }
  const acknowledge = id => {
    state.pending = state.pending.filter(item => item.id !== id)
  }
  try {
    const stat = fs.lstatSync(root)
    const ports = createNativePorts({
      prepared,
      precreatedRootIdentity: { dev: stat.dev, ino: stat.ino },
      io,
      authorize: async () => true,
      withReservation: async (kind, id, effect) => {
        reserve(kind, id)
        const value = await effect()
        acknowledge(id)
        return value
      },
      consumeReservation: () => true,
      recordRecovery: async () => {},
      onUncertain: async () => {
        state.fenced = true
      },
    })
    await ports.startProvider({
      id: 'B01-listener',
      caseId: 'B01',
      createDiagnostic: () => createProviderFailureRecorder({ caseId: 'B01', journal, root }),
      request: async ({ markStage: mark }) => {
        if (markStage) mark(markStage)
        if (kind === 'providerGate') throw new Error('synthetic private message')
        if (kind === 'invalidResponse') return { status: 201, headers: {}, body: 'x' }
        return { status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'synthetic' }
      },
      canonicalRequest: async () => ({ ok: true }),
      auditRequest: async () => ({ status: 'ACKNOWLEDGED' }),
      auditCapability: 'a'.repeat(43),
    })
    const incoming = Object.assign(new EventEmitter(), {
      method: 'POST',
      url: kind === 'route' ? '/wrong' : '/v1/responses',
      headers: { 'content-type': 'application/json' },
      async *[Symbol.asyncIterator]() {
        if (kind === 'read') throw new Error('synthetic private body')
        if (kind === 'secretBody') throw secretError
        if (kind === 'utf8') yield Buffer.from([0xff])
        else if (kind === 'json') yield Buffer.from('{')
        else yield Buffer.from('{}')
      },
    })
    const outgoing = Object.assign(new EventEmitter(), {
      headersSent: false,
      writableEnded: false,
      writeHead(status) {
        this.status = status
        this.headersSent = true
      },
      end(body) {
        this.body = body
        this.writableEnded = true
        this.emit(kind === 'responseClose' ? 'close' : 'finish')
      },
      destroy() {
        this.destroyed = true
      },
    })
    await handler(incoming, outgoing)
    const file = path.join(root, 'cases/B01/supervisor/provider-failure.json')
    const receipt = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
    return { receipt, state, outgoing, fileExists: fs.existsSync(file), secretGetterReads }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

test('fake listener records fixed pre-reservation, pending, and acknowledged failure stages', async () => {
  for (const [kind, stage, requestState] of [
    ['route', 'LISTENER_ROUTE_HEADER', 'PRE_RESERVATION'],
    ['read', 'BODY_READ_LIMIT', 'RESERVED_PENDING'],
    ['utf8', 'UTF8_DECODE', 'RESERVED_PENDING'],
    ['json', 'JSON_PARSE', 'RESERVED_PENDING'],
    ['providerGate', 'TRANSCRIPT_GATE', 'RESERVED_PENDING'],
    ['invalidResponse', 'HTTP_RESPONSE_VALIDATION_WRITE', 'RESERVED_PENDING'],
    ['responseClose', 'HTTP_RESPONSE_VALIDATION_WRITE', 'RESERVED_ACKNOWLEDGED'],
  ]) {
    const observed = await fakeListenerScenario({ kind, markStage: kind === 'providerGate' ? stage : null })
    assert.equal(observed.receipt?.stage, stage, kind)
    assert.equal(observed.receipt?.requestState, requestState, kind)
    assert.equal(observed.receipt?.requestIndex, kind === 'route' ? null : 1, kind)
    assert.equal(observed.state.fenced, true, kind)
    assert.equal(observed.state.counts.providerRequests, kind === 'route' ? 0 : 1, kind)
  }
  const success = await fakeListenerScenario({ kind: 'success' })
  assert.equal(success.fileExists, false)
  assert.equal(success.state.fenced, false)
})

test('composed body failure never evaluates secret-bearing error getters or schedules another action', async () => {
  const observed = await fakeListenerScenario({ kind: 'secretBody' })
  assert.equal(observed.secretGetterReads, 0)
  assert.equal(observed.receipt.stage, 'BODY_READ_LIMIT')
  assert.equal(observed.receipt.requestState, 'RESERVED_PENDING')
  assert.equal(observed.receipt.requestIndex, 1)
  assert.equal(observed.state.fenced, true)
  assert.equal(observed.state.counts.providerRequests, 1)
  assert.equal(observed.state.counts.outerCalls ?? 0, 0)
  assert.equal(observed.state.pending.length, 1)
  assert.equal(observed.state.pending[0].kind, 'providerRequests')
  assert.equal(JSON.stringify(observed.receipt).includes('secret'), false)
})

async function launcherScenario(kind) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm02-r19-launcher-'))
  fs.chmodSync(root, 0o700)
  const state = {
    activeCase: null,
    current: null,
    counts: { providerRequests: 0 },
    ids: [],
    pending: [],
    fenced: false,
  }
  const journal = {
    snapshot: () => structuredClone(state),
    begin: async caseId => {
      state.activeCase = caseId
      state.current = caseId
    },
    reserve: async (kind, id) => {
      state.ids.push(id)
      state.pending.push({ caseId: state.activeCase, kind, id })
      state.counts[kind] = (state.counts[kind] ?? 0) + 1
    },
    acknowledge: async id => {
      state.pending = state.pending.filter(item => item.id !== id)
    },
    markUnknown: async () => {
      state.fenced = true
    },
  }
  let handler
  const server = new EventEmitter()
  server.listen = (_port, _host, callback) => callback()
  server.address = () => ({ address: '127.0.0.1', port: 43124 })
  server.close = callback => callback()
  const artifacts = [
    { purpose: 'interpreter', path: process.execPath, sha256: 'a'.repeat(64) },
    { purpose: 'scoped-mcp-entry', path: process.execPath, sha256: 'a'.repeat(64) },
  ]
  const manifest = { phase: 'T2', root, cases: ['B01'], artifacts }
  const prepared = { manifest, manifestDigest: digest(manifest), blockers: [] }
  const io = {
    fs: fsp,
    fileDigest: async () => 'a'.repeat(64),
    tuple: async () => ({
      platform: POLICY.executable.platform,
      arch: POLICY.executable.arch,
      osBuild: POLICY.executable.osBuild,
      nodeExecutable: process.execPath,
      nodeMajor: POLICY.executable.nodeMajor,
    }),
    createServer: callback => {
      handler = callback
      return server
    },
  }
  try {
    const stat = fs.lstatSync(root)
    const launcher = createTrustedLauncher({
      prepared,
      journal,
      io,
      precreatedRootIdentity: { dev: stat.dev, ino: stat.ino },
      authorize: async () => true,
      createObserver: async () => ({
        spawn: async () => {
          throw new Error('child must not start')
        },
      }),
      createPorts: options => {
        const ports = createNativePorts(options)
        return {
          ...ports,
          startProvider: async args => {
            await ports.startProvider(args)
            const incoming = Object.assign(new EventEmitter(), {
              method: kind === 'route' ? 'GET' : 'POST',
              url: kind === 'route' ? '/unplanned' : '/v1/responses',
              headers: { 'content-type': 'application/json' },
              async *[Symbol.asyncIterator]() {
                yield Buffer.from('{}')
              },
            })
            const outgoing = Object.assign(new EventEmitter(), {
              headersSent: false,
              writableEnded: false,
              writeHead(status) {
                this.status = status
                this.headersSent = true
              },
              end() {
                this.writableEnded = true
                this.emit('finish')
              },
              destroy() {
                this.destroyed = true
              },
            })
            await handler(incoming, outgoing)
            throw new Error('fixture stops before any child preparation')
          },
        }
      },
    })
    await assert.rejects(
      launcher.startCase({
        caseId: 'B01',
        request: async () => ({ status: 200, headers: {}, body: '{}' }),
        auditSession: { observe: async () => ({ status: 'ACKNOWLEDGED' }) },
        canonicalBridge: {
          handle: async () => ({ ok: true }),
          bootstrapConfig: () => ({}),
          auditCapability: () => 'a'.repeat(43),
        },
      }),
      /fixture stops/,
    )
    const receipt = JSON.parse(fs.readFileSync(path.join(root, 'cases/B01/supervisor/provider-failure.json'), 'utf8'))
    return { receipt, state }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

test('launcher composes real disposable diagnostic writer through fake listener and HTTP ports', async () => {
  for (const [kind, stage, requestState, providerRequests] of [
    ['route', 'LISTENER_ROUTE_HEADER', 'PRE_RESERVATION', 0],
    ['binding', 'PROVIDER_BINDING', 'RESERVED_PENDING', 1],
  ]) {
    const { receipt, state } = await launcherScenario(kind)
    assert.equal(receipt.stage, stage)
    assert.equal(receipt.requestState, requestState)
    assert.equal(state.fenced, true)
    assert.equal(state.counts.providerRequests, providerRequests)
    assert.equal(state.counts.listenerStarts, 1)
  }
})
