import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { createMatrixAuditSession } from './fixtures/codex-app-server-m02-ta-matrix-r10/audit-session.mjs'
import { instrumentScopedServerTransport } from './fixtures/codex-app-server-m02-ta-matrix-r10/server-transport-audit.mjs'
import { validateIssuedTranscript } from './fixtures/codex-app-server-m02-ta-matrix-r10/script-session.mjs'
import { POLICY } from './fixtures/codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { prepareMatrixManifest } from './fixtures/codex-app-server-m02-ta-matrix-r10/manifest.mjs'
import { createMatrixScriptSession } from './fixtures/codex-app-server-m02-ta-matrix-r10/script-session.mjs'
import { validateMatrixProviderRequest } from './fixtures/codex-app-server-m02-ta-matrix-r10/provider-route-gate.mjs'
import { loadSealedRouteEvidence } from './fixtures/codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { pathToFileURL } from 'node:url'
import { Client } from '../../packages/appraisejs/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'
import { InMemoryTransport } from '../../packages/appraisejs/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js'
import { stageMatrixModules } from './fixtures/codex-app-server-m02-ta-matrix-r10/matrix-stage.mjs'
import { runPreparedT2Matrix } from './fixtures/codex-app-server-m02-ta-matrix-r10/matrix-runner.mjs'
import { buildMatrixCaseOperations } from './fixtures/codex-app-server-m02-ta-matrix-r10/case-script-plan.mjs'
import {
  createNativePorts,
  emitReviewedResponse,
} from './fixtures/codex-app-server-m02-ta-matrix-r10/runtime-effects.mjs'
import { digest } from './fixtures/codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { createB14NativeSession } from './fixtures/codex-app-server-m02-ta-matrix-r10/native-session.mjs'
import { PERMISSION_DECLARATION } from './fixtures/codex-app-server-m02-ta-native-plans-r10/native-route-gate.mjs'
import { B14_PROFILE } from './fixtures/codex-app-server-m02-ta-native-plans-r10/plans.mjs'
import {
  createP00ProtocolVerifiers,
  inspectP00RequiredMcpError,
  verifyP00Completion,
} from './fixtures/codex-app-server-m02-ta-matrix-r10/p00-readiness.mjs'
import { createB14PermissionEvidence } from './fixtures/codex-app-server-m02-ta-matrix-r10/b14-permission-evidence.mjs'
import { createMatrixJournalAdapter } from './fixtures/codex-app-server-m02-ta-matrix-r10/journal-adapter.mjs'

const sha = text => createHash('sha256').update(text).digest('hex')
const journalStub = () => ({
  reservations: [],
  acknowledgements: [],
  unknown: false,
  reserve(kind, id) {
    this.reservations.push({ kind, id })
  },
  acknowledge(id) {
    this.acknowledgements.push(id)
  },
  markUnknown() {
    this.unknown = true
  },
  snapshot() {
    return { unknown: this.unknown }
  },
})
const planned = Object.freeze({
  caseId: 'B01',
  index: 0,
  callId: 'm02_B01_0',
  operation: 'quality_journey_analysis_get',
  argumentsHash: sha('{}'),
  rejection: false,
})

test('case completion requires a one-use durable witness hash in the journal finish record', () => {
  const writes = []
  const durable = { snapshot: () => ({ current: 'B01' }), reserve() {}, finish: input => writes.push(input) }
  const journal = createMatrixJournalAdapter(durable)
  assert.throws(() => journal.finish({ outcome: 'accepted', cleanupKnown: true }), /witness absent/)
  assert.throws(() => journal.bindCaseWitness({ caseId: 'B02', sha256: 'a'.repeat(64) }), /current-case/)
  journal.bindCaseWitness({ caseId: 'B01', sha256: 'a'.repeat(64) })
  assert.throws(() => journal.bindCaseWitness({ caseId: 'B01', sha256: 'b'.repeat(64) }), /current-case/)
  journal.finish({ outcome: 'accepted', cleanupKnown: true })
  assert.equal(writes[0].caseWitnessSha256, 'a'.repeat(64))
})

function syntheticB14Request(seal) {
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
  return { body, bodyBytes: Buffer.from(JSON.stringify(body)), context }
}

test('P00 accepts only source-shaped correlated required-MCP failure plus child receipts and zero effects', () => {
  const error = {
    code: -32603,
    message: 'error creating thread: required MCP servers failed to initialize: appraise_m02',
  }
  const inspected = inspectP00RequiredMcpError(error)
  assert.equal(inspected.accepted, true)
  const base = {
    schema: 'appraise.m02-ta-matrix-child-receipt/v1',
    caseId: 'P00',
    evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
  }
  const journal = {
    activeCase: 'P00',
    fenced: false,
    counts: {
      codexStarts: 1,
      mcpStarts: 1,
      threadStarts: 1,
      listenerStarts: 1,
      turnStarts: 0,
      providerRequests: 0,
      scopedCalls: 0,
      canonicalRequests: 0,
      auditRequests: 0,
      permissionReplies: 0,
      outerCalls: 0,
    },
  }
  const input = {
    rpcError: inspected,
    journal,
    startupReceipt: { ...base, event: 'required-failure-selected' },
    exitReceipt: { ...base, event: 'node-exit-handler', exitCode: 1 },
    ownedCodexExit: { exit: { code: 0, signal: null }, close: { code: 0, signal: null } },
  }
  assert.equal(verifyP00Completion(input).accepted, true)
  for (const changed of [
    { ...input, journal: { ...journal, counts: { ...journal.counts, providerRequests: 1 } } },
    { ...input, exitReceipt: { ...input.exitReceipt, exitCode: 0 } },
    { ...input, ownedCodexExit: { exit: { code: 0, signal: null }, close: null } },
  ])
    assert.equal(verifyP00Completion(changed).accepted, false)
  for (const bad of [
    { ...error, code: -32601 },
    { ...error, data: {} },
    { ...error, message: error.message.replace('appraise_m02', 'foreign') },
    { ...error, message: `prefix ${error.message}` },
  ])
    assert.equal(inspectP00RequiredMcpError(bad).accepted, false)
})

test('P00 callbacks require selected child failure before source RPC error acknowledgement', async () => {
  const base = {
    schema: 'appraise.m02-ta-matrix-child-receipt/v1',
    caseId: 'P00',
    evidenceClass: 'TRUSTED_CHILD_SELF_REPORT',
  }
  const receipts = {
    'mcp-startup.json': { ...base, event: 'required-failure-selected' },
    'mcp-exit.json': { ...base, event: 'node-exit-handler', exitCode: 1 },
  }
  const journal = {
    snapshot: () => ({
      activeCase: 'P00',
      fenced: false,
      counts: { turnStarts: 0, providerRequests: 0, scopedCalls: 0, canonicalRequests: 0, auditRequests: 0 },
      pending: [{ kind: 'threadStarts', id: 'P00-thread-start' }],
    }),
  }
  const verifiers = createP00ProtocolVerifiers({ journal, readReceipt: async (_caseId, name) => receipts[name] })
  const context = { caseId: 'P00', threadStartId: 'P00-thread-start', failedTelemetryObserved: false }
  assert.equal(await verifiers.verifyRequiredMcpTelemetry({ name: 'appraise_m02', status: 'failed' }, context), true)
  const error = {
    code: -32603,
    message: 'error creating thread: required MCP servers failed to initialize: appraise_m02',
  }
  assert.equal(await verifiers.verifyRequiredMcpFailure(error, context), true)
  assert.equal(verifiers.snapshot().rpcError.accepted, true)
  receipts['mcp-exit.json'] = { ...receipts['mcp-exit.json'], exitCode: 0 }
  assert.equal(await verifiers.verifyRequiredMcpFailure(error, context), false)
})

test('outer response reservation is acknowledged only after owned HTTP finish', async () => {
  for (const event of ['finish', 'close']) {
    const order = []
    const outgoing = Object.assign(new EventEmitter(), {
      writeHead() {
        order.push('headers')
      },
      end() {
        order.push('body')
        this.emit(event)
      },
    })
    const result = {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: 'bounded',
      afterWrite() {
        order.push('ack')
      },
    }
    if (event === 'finish') {
      await emitReviewedResponse(outgoing, result)
      assert.deepEqual(order, ['headers', 'body', 'ack'])
    } else {
      await assert.rejects(emitReviewedResponse(outgoing, result), /before finish/)
      assert.deepEqual(order, ['headers', 'body'])
    }
  }
})

test('B14 asks once through the exact native descriptor, accepts only paired empty denial, then terminates', () => {
  const seal = loadSealedRouteEvidence()
  const request = syntheticB14Request(seal)
  const receipts = []
  const journal = journalStub()
  let permission = null
  const session = createB14NativeSession({
    seal,
    expectedConfigSha256: request.context.configSha256,
    permissionEvidence: () => permission,
    journal,
    writeReceipt: (name, value) => receipts.push({ name, value }),
  })
  const first = session.handle(request)
  assert.equal(first.status, 200)
  assert.match(first.body, /response.output_item.done/)
  assert.throws(() => session.handle(request), /outer ACK/)
  first.afterWrite()
  const plan = session.plan
  const output = [
    { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
    {
      type: 'input_text',
      text: JSON.stringify({
        schema: 'appraise.m02-native-envelope/v1',
        caseId: 'B14',
        callId: plan.callId,
        operation: plan.operation,
        result: '{"permissions":{"network":null,"file_system":null},"scope":"turn"}',
      }),
    },
  ]
  permission = {
    callId: plan.callId,
    requests: 1,
    replies: 1,
    requestResolved: true,
    requestedNetworkEnabled: true,
    threadTurnCorrelated: true,
    reply: B14_PROFILE.reply,
  }
  const nextBody = {
    ...request.body,
    input: [...request.body.input, { type: 'custom_tool_call_output', call_id: plan.callId, output }],
  }
  const second = session.handle({ ...request, body: nextBody, bodyBytes: Buffer.from(JSON.stringify(nextBody)) })
  assert.equal(second.status, 200)
  assert.match(second.body, /SYNTHETIC_PERMISSION_DENIED/)
  second.afterWrite()
  assert.deepEqual(journal.reservations, [{ kind: 'outerCalls', id: 'B14-outer-1' }])
  assert.deepEqual(journal.acknowledgements, ['B14-outer-1'])
  assert.equal(session.snapshot().completed, true)
  assert.deepEqual(
    receipts.map(item => item.name),
    ['script-plan', 'provider-response-1', 'provider-response-2'],
  )
  assert.equal(
    receipts.some(item => JSON.stringify(item).includes('permissions":{"network')),
    false,
  )
  assert.throws(() => session.handle(request), /budget/)
})

test('B14 permission evidence is derived from peer and durable counts before the scripted continuation', async () => {
  const receipts = []
  const state = {
    threadId: 'thread1',
    turnId: 'turn1',
    permissionRequestId: null,
    permissionReplied: false,
    permissionResolved: false,
  }
  const journal = {
    snapshot: () => ({
      activeCase: 'B14',
      fenced: false,
      counts: { providerRequests: 1, permissionReplies: state.permissionReplied ? 1 : 0 },
    }),
  }
  const evidence = createB14PermissionEvidence({
    journal,
    getPeer: () => ({ snapshot: () => state }),
    plan: { caseId: 'B14', callId: 'call1' },
    writeReceipt: async (name, value) => receipts.push({ name, value }),
  })
  const frame = {
    id: 7,
    params: { threadId: 'thread1', turnId: 'turn1', itemId: 'item1', permissions: { network: { enabled: true } } },
  }
  assert.equal(await evidence.verifyRequest(frame, { threadId: 'thread1', turnId: 'turn1' }), true)
  assert.equal(await evidence.verifyRequest(frame, { threadId: 'thread1', turnId: 'turn1' }), false)
  assert.throws(() => evidence.permissionEvidence(), /pair missing/)
  state.permissionRequestId = 7
  state.permissionReplied = true
  state.permissionResolved = true
  assert.equal(evidence.permissionEvidence().replies, 1)
  assert.equal(
    await evidence.verifyTerminal(
      { params: { threadId: 'thread1', turn: { id: 'turn1', status: 'completed' } } },
      { requestId: 7, itemId: 'item1', threadId: 'thread1', turnId: 'turn1' },
    ),
    true,
  )
  assert.deepEqual(
    receipts.map(item => item.name),
    ['permission-request', 'permission-terminal'],
  )
  assert.equal(
    receipts.some(item => JSON.stringify(item).includes('item1')),
    false,
  )
})

test('six real disposable SDK role paths pass the new script, audit and codec gates in memory', async () => {
  const prepared = await prepareMatrixManifest()
  const phaseRoot = await fsp.mkdtemp('/private/tmp/appraise-m02-matrix-stage-')
  const stageRoot = path.join(phaseRoot, 'supervisor')
  const previousDirectory = process.cwd()
  try {
    assert.equal(prepared.manifest.canonicalRelocation.count, 1)
    assert.equal(prepared.canonicalSha256, sha(prepared.canonicalBytes))
    const staged = await stageMatrixModules({
      prepared,
      stageRoot,
      phaseRoot,
      offlineCanonicalBytes: prepared.canonicalBytes,
    })
    assert.equal(sha(await fsp.readFile(staged.bundlePath)), prepared.canonicalSha256)
    assert.ok(staged.copiedFiles > 4700)
    assert.equal((await fsp.readFile(staged.bundlePath, 'utf8')).includes('require3("../../package.json")'), false)
    assert.equal((await fsp.readFile(staged.moduleRoot + '/appraise-package.json', 'utf8')).length > 0, true)
    process.chdir(stageRoot)
    const canonical = await import(pathToFileURL(staged.bundlePath).href)
    await assert.rejects(
      canonical.createCanonicalAcceptanceFixture('REQUIREMENT_ANALYZER', {
        workspace: stageRoot,
        cleanupOnClose: false,
      }),
      /outside an exact case supervisor directory/,
    )
    const seal = loadSealedRouteEvidence()
    const descriptor = seal.capture.containers[0]
    const provenance = seal.capture.provenance
    for (const caseId of ['B01', 'B02', 'B03', 'B04', 'B05', 'B06']) {
      const item = POLICY.cases.find(value => value.id === caseId)
      const fixture = await canonical.createCanonicalAcceptanceFixture(item.role)
      let client, endpoint
      try {
        const capability = `synthetic-capability-${'x'.repeat(32)}`
        const supervisor = canonical.createCanonicalSupervisorBridge({
          fixture,
          caseId,
          capability,
          onUnknown: () => {
            throw new Error('canonical UNKNOWN')
          },
        })
        const bridgeClient = canonical.createTrustedWorkerBridgeClient({
          caseId,
          capability,
          exchange: request => supervisor.handle(request),
        })
        endpoint = await canonical.createTrustedWorkerBridgeEndpoint(bridgeClient)
        client = new Client({ name: 'm02-matrix-six-offline', version: '0' })
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        const journal = journalStub()
        const audit = createMatrixAuditSession({ caseId, journal })
        const audited = instrumentScopedServerTransport({
          transport: serverTransport,
          report: event => audit.observe(event),
          onUnknown: () => {
            throw new Error('scoped audit UNKNOWN')
          },
        })
        await endpoint.server.connect(audited)
        await client.connect(clientTransport)
        const tools = await client.listTools()
        assert.deepEqual(
          tools.tools.map(tool => tool.name),
          seal.profiles.roles.find(role => role.role === item.role).toolsList.tools.map(tool => tool.name),
        )
        const operations = await buildMatrixCaseOperations({
          caseId,
          fixture,
          canonicalPacket: canonical.canonicalPacket,
        })
        const session = createMatrixScriptSession({
          caseId,
          seal,
          operations,
          auditSession: audit,
          journal,
          writeReceipt: () => {},
        })
        const bodyBase = {
          model: POLICY.model,
          reasoning: { effort: POLICY.reasoning },
          input: [{ role: 'developer', type: 'additional_tools', id: descriptor.metadata.id, tools: descriptor.tools }],
        }
        const context = {
          ...provenance,
          runId: 'a'.repeat(64),
          requestId: `${caseId}-listener-request-1`,
          threadId: 'offline-thread',
          turnId: 'offline-turn',
        }
        delete context.attestation
        const respond = body => {
          const response = session.handle({ body, bodyBytes: Buffer.from(JSON.stringify(body)), context })
          response.afterWrite()
          return response
        }
        let response = respond(bodyBase)
        assert.equal(response.status, 200)
        for (const plan of session.plans) {
          const result = await client.callTool({ name: plan.operation, arguments: operations[plan.index].args })
          assert.notEqual(result.isError, true, `${caseId}:${plan.operation}`)
          const output = [
            { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
            {
              type: 'input_text',
              text: JSON.stringify({
                schema: 'appraise.m02-code-mode-envelope/v1',
                caseId,
                index: plan.index,
                callId: plan.callId,
                operation: plan.operation,
                disposition: 'MCP_RESULT',
                result,
              }),
            },
          ]
          response = respond({
            ...bodyBase,
            input: [...bodyBase.input, { type: 'custom_tool_call_output', call_id: plan.callId, output }],
          })
          assert.equal(response.status, 200)
        }
        assert.equal(session.snapshot().completed, true)
        assert.equal(await fixture.client.qualityJourneyExternalSubmissionAcceptance.count(), 1)
        assert.equal(await fixture.client.qualityJourneyArtifact.count(), 1)
      } finally {
        await client?.close()
        await endpoint?.server.close()
        await fixture.close()
      }
    }
  } finally {
    process.chdir(previousDirectory)
    await fsp.rm(phaseRoot, { recursive: true, force: true })
  }
})

test('matrix stage rejects missing package provenance before copying modules and rejects aliased roots', async () => {
  const prepared = await prepareMatrixManifest()
  const phaseRoot = await fsp.mkdtemp('/private/tmp/appraise-m02-matrix-stage-negative-')
  const alias = `${phaseRoot}-alias`
  try {
    const artifacts = prepared.manifest.artifacts.filter(
      item => item.path !== path.join(process.cwd(), 'packages/appraisejs/package.json'),
    )
    await assert.rejects(
      stageMatrixModules({
        prepared: { ...prepared, manifest: { ...prepared.manifest, artifacts } },
        phaseRoot,
        stageRoot: path.join(phaseRoot, 'supervisor'),
        offlineCanonicalBytes: prepared.canonicalBytes,
      }),
      /required staged pin missing/,
    )
    assert.equal(fs.existsSync(path.join(phaseRoot, 'supervisor/modules')), false)
    await fsp.symlink(phaseRoot, alias, 'dir')
    await assert.rejects(
      stageMatrixModules({
        prepared,
        phaseRoot: alias,
        stageRoot: path.join(alias, 'supervisor'),
        offlineCanonicalBytes: prepared.canonicalBytes,
      }),
      /directory identity changed/,
    )
  } finally {
    await fsp.rm(alias, { force: true })
    await fsp.rm(phaseRoot, { recursive: true, force: true })
  }
})

test('matrix composition requires an exact independent review before any fixed-root effect', async () => {
  const prepared = await prepareMatrixManifest()
  assert.equal(fs.existsSync(POLICY.roots.T2), false)
  await assert.rejects(
    runPreparedT2Matrix({
      prepared,
      verifyExactReview: async () => false,
      authorize: async () => true,
      observerOs: { identity: async () => null },
    }),
    /exact T2 review absent/,
  )
  assert.equal(fs.existsSync(POLICY.roots.T2), false)
})

test('parent audit binds one active outer window and separates logical dispatch from HTTP audit count', async () => {
  const journal = journalStub()
  const audit = createMatrixAuditSession({ caseId: 'B01', journal })
  audit.issue(planned)
  assert.equal(
    (await audit.observe({ kind: 'request', id: 7, name: planned.operation, arguments: {} })).status,
    'ACKNOWLEDGED',
  )
  assert.equal(audit.snapshot().pending, 1)
  assert.equal((await audit.observe({ kind: 'result', id: 7, result: { content: [] } })).status, 'ACKNOWLEDGED')
  assert.equal(audit.complete().scopedDispatchCount, 1)
  assert.deepEqual(journal.reservations, [{ kind: 'scopedCalls', id: planned.callId }])
  assert.deepEqual(journal.acknowledgements, [planned.callId])
  assert.equal(audit.status().active, false)
})

test('parent audit fences wrong operation, duplicate native ID, result without request and no active window', async () => {
  for (const event of [
    { kind: 'request', id: 7, name: 'foreign', arguments: {} },
    { kind: 'result', id: 7, result: {} },
    { kind: 'request', id: 7, name: planned.operation, arguments: { extra: true } },
  ]) {
    const journal = journalStub()
    const audit = createMatrixAuditSession({ caseId: 'B01', journal })
    audit.issue(planned)
    await assert.rejects(audit.observe(event), /UNKNOWN/)
    assert.equal(journal.unknown, true)
  }
  const audit = createMatrixAuditSession({ caseId: 'B01', journal: journalStub() })
  await assert.rejects(audit.observe({ kind: 'request', id: 7, name: planned.operation, arguments: {} }), /UNKNOWN/)
  const distinct = createMatrixAuditSession({ caseId: 'B01', journal: journalStub() })
  distinct.issue(planned)
  await distinct.observe({ kind: 'request', id: 7, name: planned.operation, arguments: {} })
  await distinct.observe({ kind: 'result', id: 7, result: { content: [] } })
  distinct.complete()
  distinct.issue({ ...planned, index: 1, callId: 'm02_B01_1' })
  await assert.rejects(distinct.observe({ kind: 'request', id: 7, name: planned.operation, arguments: {} }), /UNKNOWN/)
})

test('server-side SDK guard reports request before dispatch and result before reply', async () => {
  const order = []
  const transport = {
    async start() {},
    async close() {},
    async send() {
      order.push('native-reply')
    },
    onmessage: null,
    onerror: null,
    onclose: null,
  }
  const guard = instrumentScopedServerTransport({
    transport,
    async report(event) {
      order.push(`audit-${event.kind}`)
    },
    onUnknown() {
      order.push('unknown')
    },
  })
  guard.onmessage = () => order.push('sdk-dispatch')
  transport.onmessage({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: planned.operation, arguments: {} },
  })
  await new Promise(resolve => setImmediate(resolve))
  await guard.send({ jsonrpc: '2.0', id: 7, result: { content: [] } })
  assert.deepEqual(order, ['audit-request', 'sdk-dispatch', 'audit-result', 'native-reply'])
  assert.equal(guard.snapshot().pending, 0)
})

test('server guard rejects foreign setup and never forwards after lost audit acknowledgement', async () => {
  const forwarded = []
  const transport = { async start() {}, async close() {}, async send() {}, onmessage: null }
  const guard = instrumentScopedServerTransport({
    transport,
    async report() {
      throw new Error('ACK_LOST')
    },
    onUnknown() {
      forwarded.push('UNKNOWN')
    },
  })
  guard.onmessage = () => forwarded.push('sdk')
  transport.onmessage({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: { name: planned.operation, arguments: {} },
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(forwarded, ['UNKNOWN'])
  assert.equal(guard.snapshot().fenced, true)
  const second = instrumentScopedServerTransport({
    transport: { ...transport, onmessage: null },
    report: async () => {},
    onUnknown() {
      forwarded.push('UNKNOWN')
    },
  })
  second.onmessage = () => forwarded.push('sdk')
  second.snapshot()
  assert.equal(POLICY.cases.filter(item => item.phase === 'T2').length, 24)
})

test('full provider transcript binds only issued scripts and exact prior outputs', () => {
  const plans = [
    { callId: 'a', script: 'issued_a' },
    { callId: 'b', script: 'issued_b' },
  ]
  const first = { type: 'custom_tool_call_output', call_id: 'a', output: [{ type: 'input_text', text: 'A' }] }
  const second = { type: 'custom_tool_call_output', call_id: 'b', output: [{ type: 'input_text', text: 'B' }] }
  const known = new Map([['a', validateIssuedTranscript([first], plans, 1, new Map()).currentOutputSha256]])
  assert.equal(
    validateIssuedTranscript([{ type: 'additional_tools', tools: [] }], plans, 0, new Map()).currentOutputSha256,
    null,
  )
  assert.ok(validateIssuedTranscript([first], plans, 1, new Map()).currentOutputSha256)
  assert.ok(validateIssuedTranscript([first, second], plans, 2, known).currentOutputSha256)
  for (const bad of [
    [{ ...first, call_id: 'foreign' }],
    [first, first],
    [{ type: 'function_call', call_id: 'a' }, first],
    ...[
      'mcp_call',
      'computer_call',
      'local_shell_call',
      'web_search_call',
      'file_search_call',
      'code_interpreter_call',
      'unknown_effect',
      undefined,
    ].map(type => [{ type }, first]),
    [{ type: 'custom_tool_call', call_id: 'a', name: 'exec', namespace: 'functions', input: 'modified' }, first],
  ])
    assert.throws(() => validateIssuedTranscript(bad, plans, 1, new Map()))
  assert.throws(() => validateIssuedTranscript([{ ...first, output: 'changed' }, second], plans, 2, known))
})

test('server guard fences a lost native reply after durable result acknowledgement', async () => {
  const order = []
  const transport = {
    async start() {},
    async close() {},
    onmessage: null,
    async send() {
      order.push('native-send')
      throw new Error('STDIO_ACK_LOST')
    },
  }
  const guard = instrumentScopedServerTransport({
    transport,
    report: async event => {
      order.push(`audit-${event.kind}`)
    },
    onUnknown: () => order.push('UNKNOWN'),
  })
  guard.onmessage = () => order.push('sdk')
  transport.onmessage({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: planned.operation, arguments: {} },
  })
  await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(guard.send({ jsonrpc: '2.0', id: 7, result: { content: [] } }), /STDIO_ACK_LOST/)
  assert.deepEqual(order, ['audit-request', 'sdk', 'audit-result', 'native-send', 'UNKNOWN'])
  assert.equal(guard.snapshot().fenced, true)
  await assert.rejects(guard.send({ jsonrpc: '2.0', id: 7, result: {} }), /fenced/)
})

test('pure matrix manifest pins historical and new closure without creating the fixed T2 root', async () => {
  const before = fs.existsSync(POLICY.roots.T2)
  assert.equal(before, false)
  const prepared = await prepareMatrixManifest()
  assert.equal(prepared.manifest.phase, 'T2')
  assert.equal(prepared.manifest.cases.length, 24)
  assert.ok(prepared.manifest.artifacts.length > 6300)
  assert.equal(
    prepared.manifest.artifacts.find(item => item.purpose === 'scoped-mcp-entry')?.path.endsWith('/scoped-entry.mjs'),
    true,
  )
  assert.equal(prepared.canonicalBytes.length > 100_000, true)
  assert.equal(fs.existsSync(POLICY.roots.T2), false)
  assert.equal(prepared.runtimeEligible, false)
})

test('inert B01 request stream revalidates exact wrapper and correlates two scoped calls before terminal', async () => {
  const seal = loadSealedRouteEvidence()
  const journal = journalStub()
  const audit = createMatrixAuditSession({ caseId: 'B01', journal })
  const receipts = []
  const operations = POLICY.cases
    .find(item => item.id === 'B01')
    .script.operations.map(step => ({
      operation: step.toolName,
      args: {},
      rejection: false,
    }))
  const session = createMatrixScriptSession({
    caseId: 'B01',
    seal,
    operations,
    auditSession: audit,
    journal,
    writeReceipt: (name, value) => receipts.push({ name, value }),
  })
  const descriptor = seal.capture.containers[0]
  const shared = {
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
    requestId: 'B01-listener-request-1',
    threadId: 'thread1',
    turnId: 'turn1',
  }
  const respond = body => {
    const response = session.handle({ body, bodyBytes: Buffer.from(JSON.stringify(body)), context })
    response.afterWrite()
    return response
  }
  const first = respond(shared)
  assert.equal(first.status, 200)
  assert.match(first.body, /response.output_item.done/)
  for (let index = 0; index < 2; index++) {
    const plan = session.plans[index]
    await audit.observe({ kind: 'request', id: index + 1, name: plan.operation, arguments: {} })
    const result = { content: [] }
    await audit.observe({ kind: 'result', id: index + 1, result })
    const envelope = {
      schema: 'appraise.m02-code-mode-envelope/v1',
      caseId: 'B01',
      index,
      callId: plan.callId,
      operation: plan.operation,
      disposition: 'MCP_RESULT',
      result,
    }
    const output = [
      { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
      { type: 'input_text', text: JSON.stringify(envelope) },
    ]
    const next = respond({
      ...shared,
      input: [...shared.input, { type: 'custom_tool_call_output', call_id: plan.callId, output }],
    })
    assert.equal(next.status, 200)
    if (index === 1) assert.match(next.body, /SYNTHETIC_COMPLETE/)
  }
  assert.equal(session.snapshot().completed, true)
  assert.deepEqual(
    journal.acknowledgements.filter(id => id.startsWith('m02_')),
    session.plans.map(plan => plan.callId),
  )
  assert.deepEqual(
    journal.reservations.filter(item => item.kind === 'outerCalls').map(item => item.id),
    ['B01-outer-1', 'B01-outer-2'],
  )
  assert.deepEqual(
    receipts.map(item => item.name),
    ['script-plan', 'provider-response-1', 'provider-response-2', 'provider-response-3'],
  )
  assert.equal(
    receipts.some(item => JSON.stringify(item).includes('Script completed')),
    false,
  )
})

test('B07 registry absence remains a logical attempt with zero MCP dispatch', () => {
  const caseId = 'B07-A09'
  const seal = loadSealedRouteEvidence()
  const journal = journalStub()
  const audit = createMatrixAuditSession({ caseId, journal })
  const operation = POLICY.cases.find(item => item.id === caseId).script.operations[0].toolName
  const session = createMatrixScriptSession({
    caseId,
    seal,
    operations: [{ operation, args: {}, rejection: true }],
    auditSession: audit,
    journal,
    writeReceipt() {},
  })
  const descriptor = seal.capture.containers[0]
  const base = {
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
    requestId: `${caseId}-listener-request-1`,
    threadId: 'thread1',
    turnId: 'turn1',
  }
  const respond = body => {
    const response = session.handle({ body, bodyBytes: Buffer.from(JSON.stringify(body)), context })
    response.afterWrite()
    return response
  }
  respond(base)
  const plan = session.plans[0]
  const envelope = {
    schema: 'appraise.m02-code-mode-envelope/v1',
    caseId,
    index: 0,
    callId: plan.callId,
    operation,
    disposition: 'CODE_MODE_REGISTRY_ABSENT',
    result: null,
  }
  const output = [
    { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
    { type: 'input_text', text: JSON.stringify(envelope) },
  ]
  const final = respond({
    ...base,
    input: [...base.input, { type: 'custom_tool_call_output', call_id: plan.callId, output }],
  })
  assert.match(final.body, /SYNTHETIC_COMPLETE/)
  assert.equal(session.snapshot().decodedStatus, 'NO_MCP_DISPATCH')
  assert.deepEqual(journal.reservations, [{ kind: 'outerCalls', id: `${caseId}-outer-1` }])
  assert.deepEqual(journal.acknowledgements, [`${caseId}-outer-1`])
})

test('actual-byte descriptor gate rejects extra typed-Lite metadata without stripping it', () => {
  const seal = loadSealedRouteEvidence()
  const descriptor = seal.capture.containers[0]
  const provenance = seal.capture.provenance
  const context = {
    binarySha256: provenance.binarySha256,
    platform: provenance.platform,
    configSha256: provenance.configSha256,
    schemaSha256: provenance.schemaSha256,
    runId: 'a'.repeat(64),
    requestId: 'B01-listener-request-1',
    threadId: 'thread1',
    turnId: 'turn1',
  }
  const body = {
    model: POLICY.model,
    reasoning: { effort: POLICY.reasoning },
    input: [
      {
        role: 'developer',
        type: 'additional_tools',
        id: descriptor.metadata.id,
        description: 'unreviewed',
        tools: descriptor.tools,
      },
    ],
  }
  const result = validateMatrixProviderRequest({
    seal,
    caseId: 'B01',
    context,
    bodyBytes: Buffer.from(JSON.stringify(body)),
    parsedBody: body,
  })
  assert.equal(result.status, 'BLOCKED')
  assert.equal(result.reason, 'WRAPPER_OR_DESCRIPTOR_DRIFT')
})

test('same owned listener reserves capability-bound audit separately from provider and canonical requests', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm02-matrix-listener-'))
  fs.chmodSync(root, 0o700)
  let handler
  const server = new EventEmitter()
  server.listen = (_port, _host, callback) => callback()
  server.address = () => ({ address: '127.0.0.1', port: 43123 })
  server.close = callback => callback()
  const reservations = []
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
  let unknown = 0
  try {
    const state = fs.lstatSync(root)
    const ports = createNativePorts({
      prepared,
      precreatedRootIdentity: { dev: state.dev, ino: state.ino },
      io,
      authorize: async () => true,
      withReservation: async (kind, id, effect) => {
        reservations.push({ kind, id })
        return effect()
      },
      consumeReservation: () => true,
      recordRecovery: async () => {},
      onUncertain: async () => {
        unknown++
      },
    })
    const started = await ports.startProvider({
      id: 'B01-listener',
      caseId: 'B01',
      auditCapability: 'a'.repeat(43),
      auditRequest: async event => (event.kind === 'request' ? { status: 'ACKNOWLEDGED' } : null),
      canonicalRequest: async () => ({ ok: false }),
      request: async () => {
        throw new Error('unexpected provider')
      },
    })
    assert.equal(started.port, 43123)
    const incoming = Object.assign(new EventEmitter(), {
      method: 'POST',
      url: '/m02/audit',
      headers: { 'content-type': 'application/json' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(
          JSON.stringify({
            schema: 'appraise.m02-ta-scoped-audit/v1',
            caseId: 'B01',
            capability: 'a'.repeat(43),
            event: { kind: 'request', id: 1, name: 'quality_journey_analysis_get', arguments: {} },
          }),
        )
      },
    })
    const outgoing = Object.assign(new EventEmitter(), {
      writeHead(status, headers) {
        this.status = status
        this.headers = headers
      },
      end(body) {
        this.body = body
        this.emit('finish')
      },
    })
    await handler(incoming, outgoing)
    assert.equal(outgoing.status, 200)
    assert.equal(outgoing.body, '{"status":"ACKNOWLEDGED"}')
    assert.deepEqual(
      reservations.map(item => item.kind),
      ['listenerStarts', 'auditRequests'],
    )
    assert.equal(unknown, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
