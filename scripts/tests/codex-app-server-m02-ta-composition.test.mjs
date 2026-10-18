import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { POLICY, digest } from './fixtures/codex-app-server-m02-ta/policy.mjs'
import { DurableTrustedJournal } from './fixtures/codex-app-server-m02-ta/journal.mjs'
import {
  prepareTrustedComposition,
  prepareTrustedCase,
  TrustedCaseCoordinator,
} from './fixtures/codex-app-server-m02-ta/composition.mjs'
import { TrustedAppServerPeer } from './fixtures/codex-app-server-m02-ta/protocol.mjs'
import { createNativePorts } from './fixtures/codex-app-server-m02-ta/runtime-effects.mjs'

const pins = ['codex', 'interpreter', 'supervisor', 'scoped-mcp-entry', 'policy', 'schema'].map(purpose => ({
  purpose,
  path: purpose === 'codex' ? POLICY.executable.path : `/synthetic/${purpose}`,
  sha256: purpose === 'codex' ? POLICY.executable.sha256 : 'a'.repeat(64),
}))
const fakeBridge = {
  handle: async () => ({}),
  bootstrapConfig: url => ({
    schema: 'appraise.m02-ta-bridge-bootstrap/v1',
    caseId: 'T1',
    capability: 'c'.repeat(48),
    url,
  }),
}
const fakeTuple = async () => ({
  platform: 'darwin',
  arch: 'arm64',
  osBuild: '26A434',
  nodeExecutable: '/synthetic/interpreter',
  nodeMajor: 26,
})
const fakeFile = async () => ({ writeFile: async () => {}, sync: async () => {}, close: async () => {} })
const prepared = () => prepareTrustedComposition({ phase: 'T1', artifacts: pins })
const wrap = fn => async () => {
  const journal = DurableTrustedJournal.create()
  try {
    await fn(journal)
  } finally {
    journal.close()
  }
}

test('versioned policy preserves exact matrix totals and frozen role split', () => {
  assert.equal(POLICY.cases.length, 27)
  for (const [kind, value] of Object.entries({
    threadStarts: 27,
    turnStarts: 26,
    providerRequests: 63,
    scopedCalls: 34,
    workspaceActions: 2,
    permissionReplies: 1,
  }))
    assert.equal(POLICY.aggregate[kind], value)
  assert.equal(POLICY.cases.filter(item => item.id.startsWith('B07-')).length, 16)
  assert.equal(POLICY.permissionGrants, 0)
  assert.equal(POLICY.nativeInference, 0)
  assert.equal(POLICY.runtimeAuthority, false)
})
test('actual route/outer contracts are required for T2/T3; flags cannot confer authority', () => {
  const missing = prepareTrustedComposition({ phase: 'T2', artifacts: pins, approved: true })
  assert.equal(missing.runtimeEligible, false)
  assert.match(missing.blockers.join(), /ACTUAL_DESCRIPTORS/)
  assert.deepEqual(
    missing.manifest.outerCeilings,
    Object.fromEntries(
      POLICY.cases.filter(item => item.phase === 'T2').map(item => [item.id, POLICY.outerCalls.ceilings[item.id]]),
    ),
  )
  assert.deepEqual(prepared().blockers, [])
  assert.equal(prepared().runtimeEligible, false)
  assert.throws(
    () => prepareTrustedCase(prepared(), 'B01', { port: 44000, mcpExecutable: '/synthetic/node' }),
    /binding/,
  )
})
test('pure case configuration contains no native auth/ambient MCP and claims no confinement', () => {
  const cfg = prepareTrustedCase(prepared(), 'T1', { port: 44000, mcpExecutable: '/synthetic/node' })
  assert.deepEqual(Object.keys(cfg.env).sort(), ['CODEX_HOME', 'HOME', 'TMPDIR'])
  assert.deepEqual(Object.keys(cfg.config.mcp_servers), ['appraise_m02'])
  assert.equal(cfg.config.model_providers['m02-scripted'].requires_openai_auth, false)
  assert.equal(cfg.config.sandbox_mode, 'workspace-write')
  assert.equal(cfg.containmentQualified, false)
})
test(
  'durable reserve precedes effect; lost acknowledgement stays pending',
  wrap(async journal => {
    const coordinator = new TrustedCaseCoordinator({ journal, clock: () => 100 })
    await coordinator.begin('T1')
    await coordinator.perform('threadStarts', 'thread-1', async () => {
      assert.equal(journal.snapshot().pending[0].id, 'thread-1')
      return { acknowledged: false }
    })
    assert.equal(journal.snapshot().pending.length, 1)
    await assert.rejects(coordinator.complete({ outcome: 'capture', cleanupKnown: true }), /evidence/)
    assert.equal(journal.snapshot().fenced, true)
  }),
)
test(
  'deadline/failed effects fence the campaign before another case',
  wrap(async journal => {
    let clock = 100
    const coordinator = new TrustedCaseCoordinator({ journal, clock: () => clock })
    await coordinator.begin('T1')
    clock += 60_000
    let called = false
    await assert.rejects(
      coordinator.perform('threadStarts', 'late', async () => {
        called = true
      }),
      /fenced/,
    )
    assert.equal(called, false)
    assert.throws(() => journal.begin('B01'), /invalid|fenced/)
  }),
)
test(
  'app-server requests correlate exact replies; completion is not canonical acceptance',
  wrap(async journal => {
    const sent = []
    const coordinator = new TrustedCaseCoordinator({ journal, clock: () => 1 })
    await coordinator.begin('T1')
    const peer = new TrustedAppServerPeer({
      coordinator,
      journal,
      caseId: 'T1',
      write: async bytes => {
        sent.push(JSON.parse(bytes))
        return bytes.length
      },
    })
    await peer.request('initialize', { clientInfo: { name: 'm02', version: '0' } }, 'init')
    assert.equal(journal.snapshot().pending.length, 1)
    await peer.feed(Buffer.from('{"id":"init","result":{"userAgent":"synthetic"}}\n'))
    await peer.request('thread/start', { cwd: '/synthetic' }, 'thread')
    await peer.feed(Buffer.from('{"id":"thread","result":{"thread":{"id":"t"}}}\n'))
    await peer.request('turn/start', { threadId: 't' }, 'turn')
    await peer.feed(Buffer.from('{"id":"turn","result":{"turn":{"id":"u"}}}\n'))
    await peer.feed(
      Buffer.from('{"method":"item/agentMessage/delta","params":{"threadId":"t","turnId":"u","delta":"discard"}}\n'),
    )
    await peer.feed(
      Buffer.from('{"method":"turn/completed","params":{"threadId":"t","turn":{"id":"u","status":"completed"}}}\n'),
    )
    assert.equal(peer.snapshot().phase, 'terminal')
    assert.equal(journal.snapshot().completed.length, 0)
    assert.equal(sent.length, 4)
  }),
)
test(
  'foreign RPC acknowledgement fences without resend',
  wrap(async journal => {
    const coordinator = new TrustedCaseCoordinator({ journal, clock: () => 1 })
    await coordinator.begin('T1')
    const peer = new TrustedAppServerPeer({ coordinator, journal, caseId: 'T1', write: async bytes => bytes.length })
    await peer.request('initialize', {}, 'init')
    await assert.rejects(peer.feed(Buffer.from('{"id":"foreign","result":{}}\n')), /UNKNOWN/)
    assert.equal(journal.snapshot().counts.controlWrites, 1)
    assert.equal(journal.snapshot().unknown, true)
  }),
)
test('native ports require fresh external approval before any injected IO', async () => {
  let effects = 0
  const ports = createNativePorts({
    prepared: prepared(),
    authorize: async () => false,
    withReservation: async () => {
      effects++
    },
    consumeReservation: () => false,
    recordRecovery: async () => {},
    onUncertain: async () => {},
    io: new Proxy(
      {},
      {
        get() {
          effects++
          throw new Error('must not touch IO')
        },
      },
    ),
  })
  await assert.rejects(ports.startProvider({ id: 'listener' }), /NOT_AUTHORIZED/)
  assert.equal(effects, 0)
  assert.throws(() => createNativePorts({ prepared: prepared() }), /verifier/)
})
test('fake-only HTTP capture emits no model/tool response and refuses a second request', async () => {
  let handler,
    reservations = [],
    captures = 0,
    fenced = 0
  const stat = {
    dev: 1,
    ino: 2,
    mode: 0o700,
    uid: process.getuid(),
    isDirectory: () => true,
    isFile: () => true,
    isSymbolicLink: () => false,
  }
  const server = new EventEmitter()
  server.listen = (_port, _host, callback) => callback()
  server.address = () => ({ address: '127.0.0.1', port: 44000 })
  const ports = createNativePorts({
    prepared: prepared(),
    authorize: async () => true,
    withReservation: async (kind, id, action) => {
      reservations.push([kind, id])
      return action()
    },
    consumeReservation: () => false,
    recordRecovery: async () => {},
    onUncertain: async () => {
      fenced++
    },
    io: {
      fs: { lstat: async () => stat, mkdir: async () => {}, open: fakeFile },
      tuple: fakeTuple,
      fileDigest: async path => pins.find(item => item.path === path).sha256,
      createServer: fn => {
        handler = fn
        return server
      },
    },
  })
  await ports.startProvider({
    id: 'listener',
    onCaptured: async () => {
      captures++
      return { status: 'CAPTURED', descriptorHash: `sha256:${'a'.repeat(64)}` }
    },
  })
  const incoming = () =>
    Object.assign(Readable.from([Buffer.from('{"tools":[]}')]), { method: 'POST', url: '/v1/responses', headers: {} })
  const replies = []
  const outgoing = { writeHead: code => replies.push(code), end: bytes => replies.push(bytes) }
  await handler(incoming(), outgoing)
  assert.equal(captures, 1)
  assert.deepEqual(replies, [503, '{"error":"capture complete"}'])
  await handler(incoming(), outgoing)
  assert.equal(captures, 1)
  assert.ok(fenced > 0)
  assert.equal(reservations[0][0], 'listenerStarts')
  assert.equal(ports.snapshot().runtimeAttested, false)
})
test('changed manifest cannot be used by native ports', () => {
  const p = prepared()
  p.manifest.phase = 'T3'
  assert.notEqual(p.manifestDigest, digest(p.manifest))
  assert.throws(
    () =>
      createNativePorts({
        prepared: p,
        authorize() {},
        withReservation() {},
        consumeReservation() {},
        recordRecovery() {},
        onUncertain() {},
      }),
    /changed/,
  )
})

test(
  'a hanging effect times out as UNKNOWN; no replacement is issued',
  wrap(async journal => {
    let timeout
    const coordinator = new TrustedCaseCoordinator({
      journal,
      clock: () => 1,
      schedule: callback => {
        timeout = callback
        return 1
      },
      cancel: () => {},
    })
    await coordinator.begin('T1')
    const pending = coordinator.perform('threadStarts', 'hang', () => new Promise(() => {}))
    while (!timeout) await new Promise(resolve => setImmediate(resolve))
    timeout()
    await assert.rejects(pending, /deadline/)
    assert.equal(journal.snapshot().pending.length, 1)
    assert.equal(journal.snapshot().unknown, true)
    assert.equal(journal.snapshot().counts.threadStarts, 1)
  }),
)

test('offline evidence cannot retain prompts/accounts or manufacture native observations', async () => {
  const { offlineEvidence, providerDisposition } = await import('./fixtures/codex-app-server-m02-ta/evidence.mjs')
  const result = offlineEvidence({
    caseId: 'B01',
    classification: 'accepted-fixture',
    counts: { scopedCalls: 1 },
    hashes: { schema: 'a'.repeat(64) },
  })
  assert.equal(result.runtimeQualified, false)
  assert.throws(
    () => offlineEvidence({ caseId: 'B01', classification: 'accepted-fixture', prompt: 'private' }),
    /field/,
  )
  assert.throws(() => offlineEvidence({ caseId: 'B01', classification: 'os-effect-denied' }), /class/)
  assert.throws(
    () => offlineEvidence({ caseId: 'B01', classification: 'accepted-fixture', correlations: { account: 'private' } }),
    /correlation/,
  )
  assert.equal(providerDisposition({ provider: 'NATIVE', authState: 'MISSING' }).status, 'AUTHENTICATION_REQUIRED')
  assert.equal(providerDisposition({ provider: 'NATIVE', authState: 'CACHED' }).realProviderAllowed, false)
  assert.equal(
    providerDisposition({ provider: 'SCRIPTED_LOCAL', authState: 'NOT_REFERENCED' }).realProviderAllowed,
    false,
  )
})

test(
  'composed fake launcher reserves Codex + MCP before spawn and writes each RPC once',
  wrap(async journal => {
    const { createTrustedLauncher } = await import('./fixtures/codex-app-server-m02-ta/launcher.mjs')
    const writes = []
    const stat = {
      dev: 1,
      ino: 2,
      uid: process.getuid(),
      mode: 0o700,
      isDirectory: () => true,
      isFile: () => true,
      isSymbolicLink: () => false,
    }
    const server = new EventEmitter()
    server.listen = (_port, _host, callback) => callback()
    server.address = () => ({ address: '127.0.0.1', port: 44000 })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = {
      write: (bytes, callback) => {
        writes.push(JSON.parse(bytes))
        callback()
      },
    }
    const launcher = createTrustedLauncher({
      prepared: prepared(),
      journal,
      authorize: async () => true,
      clock: () => 1,
      verifyMcpStartup: async () => true,
      io: {
        fs: { lstat: async () => stat, mkdir: async () => {}, open: fakeFile },
        tuple: fakeTuple,
        fileDigest: async path => pins.find(item => item.path === path).sha256,
        createServer: () => server,
        spawn: () => {
          assert.equal(journal.snapshot().counts.codexStarts, 1)
          assert.equal(journal.snapshot().counts.mcpStarts, 1)
          assert.equal(journal.snapshot().pending.length, 2)
          queueMicrotask(() => child.emit('spawn'))
          return child
        },
      },
    })
    const started = await launcher.startCase({ caseId: 'T1', canonicalBridge: fakeBridge })
    assert.equal(journal.snapshot().pending[0].kind, 'mcpStarts')
    await started.peer.request('initialize', {}, 'init-wire')
    await started.peer.feed(Buffer.from('{"id":"init-wire","result":{"userAgent":"fixture"}}\n'))
    await started.peer.request('thread/start', started.config.threadStartParams, 'thread-wire')
    await started.peer.feed(Buffer.from('{"id":"thread-wire","result":{"thread":{"id":"t"}}}\n'))
    assert.equal(journal.snapshot().counts.threadStarts, 1)
    assert.equal(journal.snapshot().counts.controlWrites, 3)
    assert.equal(journal.snapshot().pending.length, 0)
    assert.equal(writes.length, 3)
    assert.equal(launcher.snapshot().runtimeQualified, false)
  }),
)

test('descriptor capture adapter preserves inspected bytes and accepts actual collector digest format', async () => {
  const { NativeDescriptorCollector } = await import('../../packages/appraisejs/src/mcp/native-descriptor-capture.ts')
  const { createHash } = await import('node:crypto')
  let handler, captured
  const stat = {
    dev: 1,
    ino: 2,
    uid: process.getuid(),
    mode: 0o700,
    isDirectory: () => true,
    isFile: () => true,
    isSymbolicLink: () => false,
  }
  const server = new EventEmitter()
  server.listen = (_port, _host, cb) => cb()
  server.address = () => ({ address: '127.0.0.1', port: 44000 })
  const ports = createNativePorts({
    prepared: prepared(),
    authorize: async () => true,
    withReservation: async (_kind, _id, effect) => effect(),
    consumeReservation: () => false,
    recordRecovery: async () => {},
    onUncertain: async () => {},
    io: {
      fs: { lstat: async () => stat, mkdir: async () => {}, open: fakeFile },
      tuple: fakeTuple,
      fileDigest: async path => pins.find(item => item.path === path).sha256,
      createServer: fn => {
        handler = fn
        return server
      },
    },
  })
  await ports.startProvider({
    id: 'capture-listener',
    onCaptured: request => {
      captured = new NativeDescriptorCollector().capture(request, {
        binarySha256: `sha256:${POLICY.executable.sha256}`,
        platform: 'darwin-arm64',
        configSha256: `sha256:${'b'.repeat(64)}`,
        schemaSha256: `sha256:${POLICY.executable.schemaDigest}`,
        runId: 'fixture',
        requestId: 'request',
        threadId: 't',
        turnId: 'u',
      })
      return captured
    },
  })
  const bytes = Buffer.from(
    '{ "input": [{"role":"user","content":"never persist prompt"}], "tools": [{"type":"function","name":"fixture","parameters":{"type":"object","properties":{}}}]}',
  )
  const incoming = Object.assign(Readable.from([bytes]), { method: 'POST', url: '/v1/responses', headers: {} })
  const response = []
  await handler(incoming, { writeHead: status => response.push(status), end: body => response.push(body) })
  assert.equal(captured.status, 'CAPTURED')
  assert.equal(captured.requestByteHash, `sha256:${createHash('sha256').update(bytes).digest('hex')}`)
  assert.equal(JSON.stringify(captured).includes('never persist prompt'), false)
  assert.equal(response[0], 503)
})

test(
  'native path setup refuses a symlinked case ancestor before any child spawn',
  wrap(async journal => {
    const { createTrustedLauncher } = await import('./fixtures/codex-app-server-m02-ta/launcher.mjs')
    let spawned = 0,
      rootReads = 0
    const stat = {
      dev: 1,
      ino: 2,
      uid: process.getuid(),
      mode: 0o700,
      isDirectory: () => true,
      isFile: () => true,
      isSymbolicLink: () => false,
    }
    const server = new EventEmitter()
    server.listen = (_p, _h, cb) => cb()
    server.address = () => ({ address: '127.0.0.1', port: 44000 })
    const launcher = createTrustedLauncher({
      prepared: prepared(),
      journal,
      authorize: async () => true,
      clock: () => 1,
      io: {
        fs: {
          open: fakeFile,
          mkdir: async () => {},
          lstat: async path => {
            if (path.endsWith('/cases/T1') && ++rootReads > 2) return { ...stat, isSymbolicLink: () => true }
            return stat
          },
        },
        tuple: fakeTuple,
        fileDigest: async path => pins.find(item => item.path === path).sha256,
        createServer: () => server,
        spawn: () => {
          spawned++
          throw new Error('must not spawn')
        },
      },
    })
    await assert.rejects(launcher.startCase({ caseId: 'T1', canonicalBridge: fakeBridge }), /identity/)
    assert.equal(spawned, 0)
    assert.equal(journal.snapshot().unknown, true)
  }),
)

test('scalar review assertions cannot satisfy the linked native route gate', () => {
  const review = {
    evidenceClass: 'ACTUAL_CAPTURE_REVIEWED',
    complete: true,
    descriptorDigest: 'a'.repeat(64),
    routeDigest: 'b'.repeat(64),
    sdkProfileDigest: 'c'.repeat(64),
  }
  const plan = prepareTrustedComposition({ phase: 'T2', artifacts: pins, routeReview: review, outerCeilings: {} })
  assert.match(plan.blockers.join(), /ACTUAL_DESCRIPTORS/)
  assert.match(plan.blockers.join(), /DIFFER_FROM_REVIEWED/)
  assert.equal(
    Object.values(plan.manifest.outerCeilings).reduce((a, b) => a + b, 0),
    34,
  )
})

test('canonical IPC shares the owned listener and never spends provider request slots', async () => {
  let handler,
    listeners = 0
  const kinds = []
  const stat = {
    dev: 1,
    ino: 2,
    uid: process.getuid(),
    mode: 0o700,
    isDirectory: () => true,
    isFile: () => true,
    isSymbolicLink: () => false,
  }
  const server = new EventEmitter()
  server.listen = (_p, _h, cb) => cb()
  server.address = () => ({ address: '127.0.0.1', port: 44000 })
  const ports = createNativePorts({
    prepared: prepared(),
    authorize: async () => true,
    withReservation: async (kind, _id, effect) => {
      kinds.push(kind)
      return effect()
    },
    consumeReservation: () => false,
    recordRecovery: async () => {},
    onUncertain: async () => {},
    io: {
      fs: { lstat: async () => stat, mkdir: async () => {} },
      tuple: fakeTuple,
      fileDigest: async path => pins.find(item => item.path === path).sha256,
      createServer: fn => {
        listeners++
        handler = fn
        return server
      },
    },
  })
  const body = { caseId: 'T1', requestId: 'bridge-1', action: 'bootstrap', capability: 'c'.repeat(48), payload: {} }
  await ports.startProvider({
    id: 'one-listener',
    canonicalRequest: async raw => {
      assert.deepEqual(raw, body)
      return { requestId: raw.requestId, ok: true, value: {} }
    },
  })
  const incoming = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: 'POST',
    url: '/m02/canonical',
    headers: {},
  })
  const response = []
  await handler(incoming, { writeHead: code => response.push(code), end: data => response.push(data) })
  assert.equal(response[0], 200)
  assert.equal(listeners, 1)
  assert.deepEqual(kinds, ['listenerStarts', 'canonicalRequests'])
  assert.equal(POLICY.aggregate.canonicalRequests, 190)
  assert.equal(POLICY.aggregate.providerRequests, 63)
})

test(
  'idle case deadline fences even when no further transport method is called',
  wrap(async journal => {
    let fire,
      stopped = false
    const coordinator = new TrustedCaseCoordinator({
      journal,
      clock: () => 1,
      schedule: fn => {
        fire = fn
        return { unref() {} }
      },
      cancel: () => {},
      onDeadline: () => {
        stopped = true
      },
    })
    await coordinator.begin('T1')
    fire()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(journal.snapshot().unknown, true)
    assert.equal(stopped, true)
  }),
)

test('permission denial correlates numeric zero ID and grants no scope', async () => {
  const reserved = [],
    sent = []
  const state = { activeCase: 'B14', fenced: false }
  const journal = {
    begin: () => {},
    snapshot: () => state,
    reserve: (kind, id) => reserved.push({ kind, id }),
    acknowledge: () => {},
    markUnknown: () => {
      state.fenced = true
    },
  }
  const coordinator = new TrustedCaseCoordinator({ journal, clock: () => 1 })
  await coordinator.begin('B14')
  await coordinator.denyPermission({
    requestId: 0,
    threadId: 't',
    expectedThreadId: 't',
    turnId: 'u',
    expectedTurnId: 'u',
    send: reply => sent.push(reply),
  })
  assert.deepEqual(reserved, [{ kind: 'permissionReplies', id: 'permission-0' }])
  assert.deepEqual(sent, [{ id: 0, result: { permissions: {}, scope: 'turn' } }])
  await assert.rejects(
    coordinator.denyPermission({
      requestId: 'foreign',
      threadId: 'other',
      expectedThreadId: 't',
      turnId: 'u',
      expectedTurnId: 'u',
      send: () => {
        throw new Error('must not send')
      },
    }),
    /unexpected/,
  )
  assert.equal(state.fenced, true)
})
