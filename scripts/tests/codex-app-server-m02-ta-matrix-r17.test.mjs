import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TrustedMatrixAppServerPeer } from './fixtures/codex-app-server-m02-ta-matrix-r17/protocol-p00.mjs'
import { CountedJsonLines } from './fixtures/codex-app-server-m02-ta-matrix-r17/framing.mjs'
import {
  buildMatrixCanonicalBytes,
  HISTORICAL_BUNDLE,
  HISTORICAL_SHA,
} from './fixtures/codex-app-server-m02-ta-matrix-r17/canonical-build.mjs'
import { prepareR17MatrixManifest } from './fixtures/codex-app-server-m02-ta-matrix-r17/manifest.mjs'
import { verifyPriorT2Unknown } from './fixtures/codex-app-server-m02-ta-matrix-r17/prior-evidence.mjs'
import {
  POLICY,
  POLICY_DIGEST,
  PRIOR_ROOT,
  ROOT,
  digest,
} from './fixtures/codex-app-server-m02-ta-matrix-r17/policy.mjs'
import { dispatchMatrixEntrypoint } from './fixtures/codex-app-server-m02-ta-matrix-r17/entrypoint.mjs'
import { MATRIX_BUILD } from './fixtures/codex-app-server-m02-ta-matrix-r17/preparation.mjs'
import { stageMatrixModules } from './fixtures/codex-app-server-m02-ta-matrix-r17/matrix-stage.mjs'
import { prepareTrustedCase } from './fixtures/codex-app-server-m02-ta-matrix-r17/composition.mjs'
import { verifyConsumedPreflights } from './fixtures/codex-app-server-m02-ta-matrix-r17/preflight-evidence.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const HERE = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r17')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const encode = frame => Buffer.from(`${JSON.stringify(frame)}\n`)
const advisory = (rateLimits = { primary: { usedPercent: 11 }, planType: 'plus' }) => ({
  method: 'account/rateLimits/updated',
  params: { rateLimits },
  emittedAtMs: 123,
})

function harness() {
  const pending = [{ kind: 'mcpStarts', id: 'B01-mcp' }]
  const writes = []
  const journalEvents = []
  const diagnostics = []
  let fenced = false
  const journal = {
    snapshot: () => ({
      activeCase: 'B01',
      pending: structuredClone(pending),
      fenced,
      seq: journalEvents.length,
      counts: { outerCalls: journalEvents.filter(item => item === 'reserve:outerCalls').length },
    }),
    acknowledge: async id => {
      const index = pending.findIndex(item => item.id === id)
      if (index < 0) throw new Error('synthetic ACK missing')
      pending.splice(index, 1)
      journalEvents.push(`ack:${id}`)
    },
    reserve: async (kind, id) => {
      pending.push({ kind, id })
      journalEvents.push(`reserve:${kind}`)
    },
    markUnknown: async () => {
      fenced = true
      journalEvents.push('UNKNOWN')
    },
  }
  const coordinator = {
    async perform(kind, id, effect) {
      await journal.reserve(kind, id)
      const result = await effect({ kind, id })
      if (result?.acknowledged !== false) await journal.acknowledge(id)
      return result
    },
  }
  const peer = new TrustedMatrixAppServerPeer({
    coordinator,
    journal,
    caseId: 'B01',
    threadStartParams: { cwd: ROOT },
    verifyMcpStartup: () => true,
    write: async bytes => {
      writes.push(JSON.parse(bytes))
      return bytes.length
    },
    onFailure: async details => diagnostics.push(details),
  })
  const begin = async () => {
    await peer.request('initialize', {}, 'B01-initialize')
    await peer.feed(encode({ id: 'B01-initialize', result: { userAgent: 'synthetic' } }))
    assert.deepEqual(
      writes.map(item => item.method),
      ['initialize', 'initialized', 'thread/start'],
    )
  }
  const thread = async () => {
    await begin()
    await peer.feed(encode({ id: 'B01-thread-start', result: { thread: { id: 'thread-1' } } }))
  }
  const turnPending = async () => {
    await thread()
    await peer.request('turn/start', { threadId: 'thread-1' }, 'B01-turn-start')
  }
  const turn = async () => {
    await turnPending()
    await peer.feed(encode({ id: 'B01-turn-start', result: { turn: { id: 'turn-1' } } }))
  }
  const issueOuter = async () => {
    await journal.reserve('outerCalls', 'B01-outer-1')
    await journal.acknowledge('B01-outer-1')
  }
  return {
    peer,
    journal,
    writes,
    journalEvents,
    diagnostics,
    fenced: () => fenced,
    begin,
    thread,
    turnPending,
    turn,
    issueOuter,
  }
}

test('p1, p2 and p3 remain separate UNKNOWN histories; p4 is absent', async () => {
  const prior = await verifyPriorT2Unknown()
  assert.equal(prior.status, 'PRIOR_P1_P2_P3_UNKNOWN_PRESERVED')
  assert.equal(prior.p1.consumed.listenerStarts, 1)
  assert.deepEqual(prior.p2.consumed, {
    listenerStarts: 1,
    controlWrites: 3,
    codexStarts: 1,
    mcpStarts: 1,
    threadStarts: 1,
    turnStarts: 1,
    providerRequests: 1,
    outerCalls: 1,
    canonicalRequests: 2,
  })
  assert.deepEqual(prior.p3.consumed, { listenerStarts: 1, sourceCapacity: 4 })
  assert.deepEqual(prior.p3.rootIdentity, { dev: 16777230, ino: 68938534 })
  await assert.rejects(fs.lstat(ROOT), { code: 'ENOENT' })
})

test('accepted p3 canonical bundle relocates exactly one root literal and reverses', async () => {
  const prior = await fs.readFile(HISTORICAL_BUNDLE)
  const candidate = await buildMatrixCanonicalBytes()
  assert.equal(sha(prior), HISTORICAL_SHA)
  assert.equal(candidate.relocation.from, PRIOR_ROOT)
  assert.equal(candidate.relocation.to, ROOT)
  assert.equal(candidate.relocation.count, 1)
  assert.equal(sha(Buffer.from(candidate.bytes.toString('utf8').replace(ROOT, PRIOR_ROOT))), HISTORICAL_SHA)
  await assert.rejects(buildMatrixCanonicalBytes({ readFile: async () => Buffer.from('drift') }), /drift/)
})

test('pure R17 manifest pins amended closure, new advisory and cumulative budget without output', async () => {
  const prepared = await prepareR17MatrixManifest()
  const manifest = prepared.manifest
  assert.equal(manifest.root, ROOT)
  assert.equal(manifest.policyDigest, POLICY_DIGEST)
  assert.equal(manifest.policyDigest, digest(POLICY))
  assert.equal(manifest.rootAmendment.from, PRIOR_ROOT)
  assert.equal(manifest.rootAmendment.to, ROOT)
  assert.equal(manifest.cases.length, 24)
  assert.equal(manifest.artifacts.filter(item => item.purpose === 'matrix-canonical-backend').length, 1)
  assert.equal(manifest.artifacts.filter(item => item.purpose === 'scoped-mcp-entry').length, 1)
  assert.equal(manifest.artifacts.filter(item => item.purpose === 'historical-r13-canonical-backend').length, 1)
  assert.equal(manifest.artifacts.filter(item => item.purpose === 'historical-r13-scoped-entry').length, 1)
  assert.equal(
    manifest.artifacts.filter(
      item => item.sha256 === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ).length,
    16,
  )
  assert.equal(manifest.priorEvidence.p3.status, 'UNKNOWN')
  assert.equal(manifest.recoveryBudget.combinedListenerAllocationCeilingIncludingR16, 31)
  assert.deepEqual(manifest.recoveryBudget.standalonePreflightAllocations, {
    r15: { nodeCommands: 1, directories: 1, files: 1, listenerStarts: 0 },
    r16: { nodeCommands: 1, directories: 8, files: 3, listenerStarts: 1 },
  })
  assert.equal(manifest.futureInvocation.requestedHostToolMode, 'exec_command sandbox_permissions=require_escalated')
  assert.equal(manifest.futureInvocation.workdir, REPO)
  assert.equal(manifest.futureInvocation.noAutomaticT2T3, true)
  assert.equal(manifest.preflightEvidence.actualHostMode, 'UNATTESTED')
  assert.equal(manifest.preflightEvidence.diskStatus, 'CANDIDATE_OBSERVATION_PENDING_FINAL_DEADLINE')
  assert.equal(manifest.passiveTelemetryAmendment.priorInventoryDisposition, 'unsupported-fence')
  assert.equal(manifest.passiveTelemetryAmendment.method, 'account/rateLimits/updated')
  assert.equal(manifest.passiveTelemetryAmendment.valuesRetained, false)
  assert.deepEqual(manifest.recoveryBudget.newT2Maximum, {
    cases: 24,
    codexStarts: 24,
    mcpStarts: 24,
    threadStarts: 24,
    turnStarts: 23,
    providerRequests: 58,
    scopedCalls: 34,
    outerCalls: 35,
    listenerStarts: 24,
    controlWrites: 96,
    canonicalRequests: 184,
    sourceCapacity: 58,
  })
  assert.deepEqual(manifest.recoveryBudget.cumulativeWholeCampaignCeilings, {
    codexStarts: 28,
    mcpStarts: 28,
    threadStarts: 28,
    turnStarts: 27,
    providerRequests: 64,
    scopedCalls: 34,
    workspaceActions: 2,
    permissionReplies: 1,
    listenerStarts: 30,
    controlWrites: 112,
    outerCalls: 38,
    canonicalRequests: 192,
    sourceCapacity: 74,
  })
  assert.equal(prepared.runtimeEligible, false)
  assert.equal((await fs.lstat(HERE)).isDirectory(), true)
  await assert.rejects(fs.lstat(MATRIX_BUILD), { code: 'ENOENT' })
  const paths = new Set(manifest.artifacts.map(item => item.path))
  assert.equal(paths.size, manifest.artifacts.length)
  for (const file of (await fs.readdir(HERE)).filter(name => name.endsWith('.mjs'))) {
    const source = await fs.readFile(join(HERE, file), 'utf8')
    for (const match of source.matchAll(/from ['"](\.\.?\/[^'"]+)['"]/g))
      assert.ok(paths.has(resolve(HERE, match[1])), `${file}: import not pinned ${match[1]}`)
  }
})

test('R15 UNKNOWN and R16 CLI completion bind exact retained preflight evidence', async () => {
  const preflight = await verifyConsumedPreflights()
  assert.equal(preflight.status, 'R15_UNKNOWN_R16_CLI_OBSERVED_PERMISSION_CHECK_ONLY')
  assert.equal(preflight.r16ReviewSha256, '9d21bac065f17090783356fd996773c2ac96ea1798461d7bd96401dcfaacc236')
  assert.deepEqual(preflight.r16RootIdentity, { dev: 16777230, ino: 68982623 })
  assert.ok(preflight.pinnedFiles.length >= 14)
})

test('R17 canonical bytes and pinned dependencies stage in a disposable p4-shaped layout', async () => {
  const prepared = await prepareR17MatrixManifest()
  const phaseRoot = await fs.mkdtemp('/private/tmp/appraise-m02-matrix-r17-stage-')
  const stageRoot = join(phaseRoot, 'supervisor')
  const previousDirectory = process.cwd()
  try {
    const staged = await stageMatrixModules({
      prepared,
      stageRoot,
      phaseRoot,
      offlineCanonicalBytes: prepared.canonicalBytes,
    })
    assert.equal(sha(await fs.readFile(staged.bundlePath)), prepared.canonicalSha256)
    assert.ok(staged.copiedFiles > 4700)
    process.chdir(stageRoot)
    const canonical = await import(pathToFileURL(staged.bundlePath).href)
    const fixture = await canonical.createCanonicalAcceptanceFixture('REQUIREMENT_ANALYZER')
    try {
      assert.ok(fixture.client)
      assert.ok(fixture.close)
    } finally {
      await fixture.close()
    }
    const scoped = prepared.manifest.artifacts.find(item => item.purpose === 'scoped-mcp-entry')
    const configured = prepareTrustedCase(prepared, 'B01', { port: 23456, mcpExecutable: scoped.path })
    assert.equal(configured.cwd, join(ROOT, 'cases/B01/workspace'))
    assert.equal(configured.config.features.code_mode_host, true)
  } finally {
    process.chdir(previousDirectory)
    await fs.rm(phaseRoot, { recursive: true, force: true })
  }
})

test('all copied effect-bearing R17 modules bind p4 with no live p3 root fallback', async () => {
  for (const name of [
    'composition',
    'case-receipts',
    'child-evidence',
    'scoped-entry',
    'scoped-worker-entry',
    'protocol-p00',
    'launcher',
    'matrix-runner',
    'matrix-stage',
    'entrypoint',
    'startup-failure',
  ]) {
    const source = await fs.readFile(join(HERE, `${name}.mjs`), 'utf8')
    assert.equal(source.includes(PRIOR_ROOT), false, `${name}: old root literal`)
    for (const match of source.matchAll(/from ['"](\.\.?\/[^'"]+)['"]/g))
      assert.ok((await fs.lstat(resolve(HERE, match[1]))).isFile(), `${name}: missing local import`)
  }
})

test('notification after acknowledged owned turn is value-discarding and does not advance lifecycle', async () => {
  const h = harness()
  await h.turn()
  await h.issueOuter()
  const before = { writes: h.writes.length, events: h.journalEvents.length, state: h.peer.snapshot() }
  const privateValue = 'private-plan-value'
  const frame = advisory({ primary: { usedPercent: 11 }, limitName: privateValue })
  await h.peer.feed(encode(frame))
  assert.deepEqual(h.peer.snapshot(), before.state)
  assert.equal(h.writes.length, before.writes)
  assert.equal(h.journalEvents.length, before.events)
  assert.equal(h.diagnostics.length, 0)
  assert.equal(JSON.stringify(h.peer.snapshot()).includes(privateValue), false)
  await h.peer.feed(
    encode({
      method: 'item/completed',
      params: { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'synthetic-output' } },
    }),
  )
  assert.equal(h.peer.snapshot().phase, 'turn')
  assert.equal(h.writes.length, before.writes)
  await h.peer.feed(
    encode({
      method: 'turn/completed',
      params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } },
    }),
  )
  assert.equal(h.peer.snapshot().phase, 'terminal')
  await h.peer.eof()
})

test('rate-limit notification is fenced outside an acknowledged owned turn', async () => {
  for (const phase of ['new', 'ready', 'thread', 'turn-pending']) {
    const h = harness()
    if (phase === 'ready') await h.begin()
    if (phase === 'thread') await h.thread()
    if (phase === 'turn-pending') await h.turnPending()
    await assert.rejects(h.peer.feed(encode(advisory())), /UNKNOWN/)
    assert.equal(h.fenced(), true)
    assert.equal(h.diagnostics[0].category, 'RATE_LIMIT_ADVISORY_INVALID')
  }
})

test('idful, mixed, malformed, extra and foreign advisory frames retain UNKNOWN fences', async () => {
  const variants = [
    { ...advisory(), id: 'foreign' },
    { ...advisory(), result: {} },
    { ...advisory(), params: { rateLimits: { primary: { usedPercent: '11' } } } },
    { ...advisory(), params: { rateLimits: {}, extra: true } },
    { ...advisory(), params: { rateLimits: { unknownField: true } } },
    { ...advisory(), method: 'account/rateLimits/read' },
    { ...advisory(), params: { rateLimits: { limitName: 'x'.repeat(257) } } },
  ]
  for (const frame of variants) {
    const h = harness()
    await h.turn()
    await h.issueOuter()
    await assert.rejects(h.peer.feed(encode(frame)), /UNKNOWN/)
    assert.equal(h.fenced(), true)
    assert.equal(JSON.stringify(h.diagnostics).includes('x'.repeat(257)), false)
    assert.equal(JSON.stringify(h.peer.snapshot()).includes('plus'), false)
  }
})

test('original full notification bytes count toward shared frame and byte ceilings', async () => {
  const frames = harness()
  await frames.turn()
  for (let n = 0; n < 32; n++) await frames.peer.feed(encode(advisory({ primary: { usedPercent: n } })))
  await assert.rejects(frames.peer.feed(encode(advisory())), /UNKNOWN/)
  assert.equal(frames.diagnostics[0].category, 'TELEMETRY_QUOTA')
  const bytes = harness()
  await bytes.turn()
  const large = advisory({
    limitId: 'a'.repeat(256),
    limitName: 'b'.repeat(256),
    normalModelSlug: 'c'.repeat(256),
    credits: { balance: 'd'.repeat(256), hasCredits: true, unlimited: false },
    individualLimit: { limit: 'e'.repeat(256), remainingPercent: 5, resetsAt: 1, used: 'f'.repeat(256) },
  })
  const fullBytes = encode(large).length
  let accepted = 0
  while ((accepted + 1) * fullBytes <= 16 * 1024 && accepted < 32) {
    await bytes.peer.feed(encode(large))
    accepted++
  }
  assert.ok(accepted < 32)
  await assert.rejects(bytes.peer.feed(encode(large)), /UNKNOWN/)
  assert.equal(bytes.diagnostics[0].category, 'TELEMETRY_QUOTA')
})

test('padded and escaped JSONL cannot shrink the original telemetry quota charge', async () => {
  const padded = harness()
  await padded.turn()
  const small = encode(advisory())
  const padding = Buffer.from(
    `${small
      .toString('utf8')
      .slice(0, -1)
      .replace('{', `{${' '.repeat(17000)}`)}\n`,
  )
  assert.ok(padding.length < 65536)
  assert.ok(encode(JSON.parse(padding.toString('utf8'))).length < 16 * 1024)
  await assert.rejects(padded.peer.feed(padding), /UNKNOWN/)
  assert.equal(padded.diagnostics[0].category, 'TELEMETRY_QUOTA')

  const escaped = harness()
  await escaped.turn()
  const plain = advisory({ limitName: 'a'.repeat(256) })
  const normalized = encode(plain)
  const rawEscaped = Buffer.from(`${JSON.stringify(plain).replace('a'.repeat(256), '\\u0061'.repeat(256))}\n`)
  assert.ok(rawEscaped.length > normalized.length)
  const filler = encode(
    advisory({
      limitId: 'b'.repeat(256),
      limitName: 'c'.repeat(256),
      normalModelSlug: 'd'.repeat(256),
    }),
  )
  let consumed = 0,
    count = 0
  while (consumed + rawEscaped.length <= 16 * 1024 && count < 32) {
    await escaped.peer.feed(filler)
    consumed += filler.length
    count++
  }
  assert.ok(count < 32)
  assert.ok(consumed + normalized.length <= 16 * 1024)
  assert.ok(consumed + rawEscaped.length > 16 * 1024)
  assert.deepEqual(JSON.parse(rawEscaped.toString('utf8')), plain)
  await assert.rejects(escaped.peer.feed(rawEscaped), /UNKNOWN/)
  assert.equal(escaped.diagnostics[0].category, 'TELEMETRY_QUOTA')
})

test('counted JSONL preserves fragmentation and the existing frame/stream limits', () => {
  const counted = new CountedJsonLines()
  const original = Buffer.from(`{  "method" : "warning", "params" : {} }\n`)
  assert.deepEqual(counted.feed(original.subarray(0, 7)), [])
  const items = counted.feed(original.subarray(7))
  assert.equal(items.length, 1)
  assert.equal(items[0].originalByteCount, original.length)
  assert.deepEqual(items[0].frame, { method: 'warning', params: {} })
  counted.eof()
  assert.throws(() => new CountedJsonLines().feed(Buffer.alloc(65537, 32)), /malformed or oversized/)
  assert.throws(() => new CountedJsonLines({ maxTotalBytes: 4 }).feed(original), /malformed or oversized/)
  const frameCap = new CountedJsonLines({ maxFrames: 1 })
  assert.throws(() => frameCap.feed(Buffer.concat([original, original])), /malformed or oversized/)
})

test('runtime entry rejects missing exact new decision before addon or effects', async () => {
  const prepared = { ...(await prepareR17MatrixManifest()), manifestFileSha256: 'a'.repeat(64) }
  let addonLoads = 0
  await assert.rejects(
    dispatchMatrixEntrypoint(
      [
        '--run',
        join(MATRIX_BUILD, 'manifest.json'),
        prepared.manifestDigest,
        prepared.manifestFileSha256,
        'b'.repeat(64),
        'c'.repeat(64),
      ],
      {
        environment: { PATH: '/usr/bin:/bin', LANG: 'C' },
        execPath: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
        programPath: join(HERE, 'entrypoint.mjs'),
        verify: async () => prepared,
        readReview: async () => {
          throw new Error('new exact review absent')
        },
        loadAddon: async () => {
          addonLoads++
          return {}
        },
      },
    ),
    /new exact review absent/,
  )
  assert.equal(addonLoads, 0)
  await assert.rejects(fs.lstat(ROOT), { code: 'ENOENT' })
})

test('changed p3 and R16 evidence is rejected through read-only injected bytes', async () => {
  await assert.rejects(
    verifyPriorT2Unknown({
      readPinned: async file => {
        const bytes = await fs.readFile(file)
        return file.endsWith('/m02-ta-t2-r13-execution-evidence-01/index.json')
          ? Buffer.from(bytes.toString('utf8').replace('UNKNOWN', 'SUCCESS'))
          : bytes
      },
    }),
    /prior p3 pinned evidence drift/,
  )
  await assert.rejects(
    verifyConsumedPreflights({
      readPinned: async file => {
        const bytes = await fs.readFile(file)
        return file.endsWith('/m02-host-preflight-r16-execution-result-01.json')
          ? Buffer.from(
              bytes
                .toString('utf8')
                .replace('OBSERVED_PERMISSION_CHECK_ONLY', 'CANDIDATE_OBSERVATION_PENDING_FINAL_DEADLINE'),
            )
          : bytes
      },
    }),
    /preflight pinned evidence drift/,
  )
})

test('exact review and decision each require host request, workdir, no follow-on and prior UNKNOWN before effects', async () => {
  const prepared = { ...(await prepareR17MatrixManifest()), manifestFileSha256: 'a'.repeat(64) }
  const sourceSha256 = sha(await fs.readFile(join(HERE, 'entrypoint.mjs')))
  const prefix = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    join(HERE, 'entrypoint.mjs'),
    '--run',
    join(MATRIX_BUILD, 'manifest.json'),
    prepared.manifestDigest,
    prepared.manifestFileSha256,
  ]
  const review = {
    schema: 'appraise.m02-ta-t2-r17-exact-review/v1',
    reviewer: '/root/r17_exact_review',
    verdict: 'ACCEPT_ONE_FIXED_T2_R17_INVOCATION',
    runtimeVerdict: 'NOT_RUN',
    exactInvocationPrefix: prefix,
    manifest: {
      path: join(MATRIX_BUILD, 'manifest.json'),
      fileSha256: prepared.manifestFileSha256,
      manifestDigest: prepared.manifestDigest,
      phase: 'T2',
      root: ROOT,
      cases: prepared.manifest.cases,
    },
    entrypointSha256: sourceSha256,
    recoveryProposalSha256: prepared.manifest.recoveryProposalSha256,
    requestedHostToolMode: 'exec_command sandbox_permissions=require_escalated',
    workdir: REPO,
    noAutomaticT2T3: true,
    priorP1P2P3UnknownPreserved: true,
    preflightEvidence: prepared.manifest.preflightEvidence,
  }
  const reviewSha = sha(Buffer.from(JSON.stringify(review)))
  const decision = {
    schema: 'appraise.m02-ta-t2-r17-recovery-user-decision/v1',
    verdict: 'APPROVE_ONE_FIXED_T2_R17_RECOVERY',
    scope: 'ONE_NEW_FULL_T2_P4_INVOCATION_NO_RESUME',
    evidenceClass: 'VISIBLE_HOST_CONVERSATION_DECISION_TRANSCRIBED_NOT_CRYPTOGRAPHIC_ATTESTATION',
    manifestDigest: prepared.manifestDigest,
    manifestFileSha256: prepared.manifestFileSha256,
    exactReviewSha256: reviewSha,
    proposal: { path: prepared.manifest.recoveryProposalPath, sha256: prepared.manifest.recoveryProposalSha256 },
    exactInvocationPrefix: [...prefix, reviewSha],
    requestedHostToolMode: 'exec_command sandbox_permissions=require_escalated',
    workdir: REPO,
    noAutomaticT2T3: true,
    priorP1P2P3UnknownPreserved: true,
    preflightEvidence: prepared.manifest.preflightEvidence,
    cumulativeWholeCampaignCeilings: prepared.manifest.recoveryBudget.cumulativeWholeCampaignCeilings,
  }
  const args = [
    '--run',
    join(MATRIX_BUILD, 'manifest.json'),
    prepared.manifestDigest,
    prepared.manifestFileSha256,
    reviewSha,
    sha(Buffer.from(JSON.stringify(decision))),
  ]
  let effectChecks = 0
  const ports = {
    environment: { PATH: '/usr/bin:/bin', LANG: 'C' },
    execPath: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
    programPath: join(HERE, 'entrypoint.mjs'),
    cwd: REPO,
    verify: async () => prepared,
    sourceSha256: async () => sourceSha256,
    verifyHostFile: async () => {
      effectChecks++
    },
    loadAddon: async () => {
      effectChecks++
      return {}
    },
  }
  for (const key of [
    'requestedHostToolMode',
    'workdir',
    'noAutomaticT2T3',
    'priorP1P2P3UnknownPreserved',
    'preflightEvidence',
  ]) {
    const altered = { ...review }
    delete altered[key]
    await assert.rejects(
      dispatchMatrixEntrypoint(args, {
        ...ports,
        readReview: async () => ({ receipt: altered, sha256: reviewSha }),
        readDecision: async () => ({ receipt: decision, sha256: args[5] }),
      }),
      /independent exact R17 review absent or changed/,
    )
  }
  for (const key of [
    'requestedHostToolMode',
    'workdir',
    'noAutomaticT2T3',
    'priorP1P2P3UnknownPreserved',
    'preflightEvidence',
  ]) {
    const altered = { ...decision }
    delete altered[key]
    await assert.rejects(
      dispatchMatrixEntrypoint(args, {
        ...ports,
        readReview: async () => ({ receipt: review, sha256: reviewSha }),
        readDecision: async () => ({ receipt: altered, sha256: args[5] }),
      }),
      /explicit R17 user decision absent or changed/,
    )
  }
  await assert.rejects(
    dispatchMatrixEntrypoint(args, {
      ...ports,
      cwd: '/private/tmp',
      readReview: async () => ({ receipt: review, sha256: reviewSha }),
      readDecision: async () => ({ receipt: decision, sha256: args[5] }),
    }),
    /host invocation environment changed/,
  )
  assert.equal(effectChecks, 0)
  await assert.rejects(fs.lstat(ROOT), { code: 'ENOENT' })
})
