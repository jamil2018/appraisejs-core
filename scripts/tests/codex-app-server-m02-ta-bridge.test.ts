import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { Client } from '../../packages/appraisejs/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'
import { InMemoryTransport } from '../../packages/appraisejs/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js'

import {
  createCanonicalAcceptanceFixture,
  canonicalOperations,
} from './fixtures/codex-app-server-m02-ta/canonical-fixture'
import { canonicalPacket } from './fixtures/codex-app-server-m02-ta/canonical-packets'
import {
  createCanonicalSupervisorBridge,
  createLazyCanonicalSupervisorBridge,
} from './fixtures/codex-app-server-m02-ta/canonical-bridge'
import {
  createTrustedWorkerBridgeClient,
  createTrustedWorkerBridgeEndpoint,
  createLoopbackTrustedWorkerExchange,
} from '../../packages/appraisejs/src/mcp/trusted-worker-bridge'

const fixtures: Array<Awaited<ReturnType<typeof createCanonicalAcceptanceFixture>>> = []
const sessions: Array<{
  client: Client
  server: Awaited<ReturnType<typeof createTrustedWorkerBridgeEndpoint>>['server']
}> = []
afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await session.client.close()
    await session.server.close()
  }
  for (const fixture of fixtures.splice(0)) await fixture.close()
})

async function setup(role: keyof typeof canonicalOperations, options: { dropRequestReply?: boolean } = {}) {
  const fixture = await createCanonicalAcceptanceFixture(role)
  fixtures.push(fixture)
  const caseId = `case-${role.toLowerCase()}`
  const capability = `synthetic-capability-${'x'.repeat(32)}`
  const unknown: string[] = []
  const supervisor = createCanonicalSupervisorBridge({
    fixture,
    caseId,
    capability,
    onUnknown: reason => {
      unknown.push(reason)
    },
  })
  const actions: string[] = []
  const bridgeClient = createTrustedWorkerBridgeClient({
    caseId,
    capability,
    exchange: async request => {
      actions.push(request.action)
      const reply = await supervisor.handle(request)
      if (options.dropRequestReply && request.action === 'request') throw new Error('Synthetic HTTP response lost.')
      return reply
    },
  })
  const endpoint = await createTrustedWorkerBridgeEndpoint(bridgeClient)
  const client = new Client({ name: 'm02-ta-bridge-test', version: '0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await endpoint.server.connect(serverTransport)
  await client.connect(clientTransport)
  sessions.push({ client, server: endpoint.server })
  return { fixture, supervisor, bridgeClient, endpoint, client, actions, unknown, caseId, capability }
}

test('all six SDK role endpoints cross the child bridge into independent canonical SQLite acceptance', async () => {
  for (const role of Object.keys(canonicalOperations) as Array<keyof typeof canonicalOperations>) {
    const h = await setup(role)
    const packet = canonicalPacket(role, h.fixture.gateway.binding)
    const tools = await h.client.listTools()
    assert.equal(tools.tools.at(-1)?.name, h.fixture.gateway.submitTool)
    const result = await h.client.callTool({ name: h.fixture.gateway.submitTool, arguments: packet })
    assert.notEqual(result.isError, true)
    assert.equal(await h.fixture.client.qualityJourneyExternalSubmissionAcceptance.count(), 1)
    assert.equal(await h.fixture.client.qualityJourneyArtifact.count(), 1)
    assert.deepEqual(h.actions, ['bootstrap', 'bindProfile', 'authorize', 'request', 'readAcceptance', 'authorize'])
    assert.deepEqual(h.unknown, [])
  }
})

test('foreign capability, malformed action, duplicate ID and wrong response correlation fail closed', async () => {
  const h = await setup('REQUIREMENT_ANALYZER')
  const request = {
    caseId: h.caseId,
    capability: h.capability,
    requestId: 'one',
    action: 'authorize',
    payload: { binding: h.fixture.gateway.binding, stage: 'before_io' },
  }
  assert.deepEqual(await h.supervisor.handle({ ...request, capability: 'x'.repeat(32) }), {
    requestId: 'one',
    ok: false,
    code: 'INVALID',
  })
  assert.deepEqual(await h.supervisor.handle({ ...request, action: 'unknown' }), {
    requestId: 'one',
    ok: false,
    code: 'INVALID',
  })
  assert.deepEqual(await h.supervisor.handle(request), { requestId: 'one', ok: true, value: { authorized: true } })
  assert.deepEqual(await h.supervisor.handle(request), { requestId: 'one', ok: false, code: 'INVALID' })
  const badClient = createTrustedWorkerBridgeClient({
    caseId: h.caseId,
    capability: h.capability,
    exchange: async requestValue => ({ requestId: `${requestValue.requestId}-wrong`, ok: true, value: {} }),
  })
  await assert.rejects(badClient.call('bootstrap', {}), /response invalid/)
  await assert.rejects(badClient.call('bootstrap', {}), /remains unknown/)
  assert.throws(() => createLoopbackTrustedWorkerExchange('https://example.test/m02/canonical'), /fixed loopback/)
  assert.throws(() => createLoopbackTrustedWorkerExchange('http://127.0.0.1:1000/m02/other'), /fixed loopback/)
})

test('lost acknowledgement marks shared UNKNOWN, fences the bridge and never resends', async () => {
  const h = await setup('SCOUT')
  h.fixture.gateway.loseNextAcknowledgement()
  const packet = canonicalPacket('SCOUT', h.fixture.gateway.binding)
  const result = await h.client.callTool({ name: h.fixture.gateway.submitTool, arguments: packet })
  assert.equal(result.isError, true)
  assert.deepEqual(h.unknown, ['request'])
  assert.equal(h.supervisor.fenced, true)
  assert.equal(h.fixture.counts.effects, 1)
  assert.equal(
    (await h.fixture.readPersistedAcceptance({ idempotencyKey: String(packet.idempotencyKey) })).outcome.artifactId
      .length > 0,
    true,
  )
  assert.equal(h.actions.filter(action => action === 'request').length, 1)
  const correlation = h.supervisor.lastSubmissionCorrelation
  assert.ok(correlation)
  assert.equal(correlation.toolName, h.fixture.gateway.submitTool)
  assert.equal(correlation.idempotencyKey, packet.idempotencyKey)
  await assert.rejects(
    h.supervisor.reconcileSubmission({ requestId: 'wrong-request-id' }),
    /correlation is unavailable/,
  )
  const recovered = await h.supervisor.reconcileSubmission({ requestId: correlation.requestId })
  assert.equal(recovered.outcome, 'ACCEPTED')
  assert.ok(recovered.receiptId)
  assert.equal(h.supervisor.fenced, true)
  assert.equal(h.fixture.counts.effects, 1)
  const second = await h.client.callTool({ name: h.fixture.gateway.submitTool, arguments: packet })
  assert.equal(second.isError, true)
  assert.equal(h.actions.filter(action => action === 'request').length, 1)
})

test('supervisor reconciles the original request after HTTP reply loss without replaying the child call', async () => {
  const h = await setup('AUTOMATOR', { dropRequestReply: true })
  const packet = canonicalPacket('AUTOMATOR', h.fixture.gateway.binding)
  const result = await h.client.callTool({ name: h.fixture.gateway.submitTool, arguments: packet })
  assert.equal(result.isError, true)
  assert.equal(h.fixture.counts.effects, 1)
  assert.equal(h.actions.filter(action => action === 'request').length, 1)
  const correlation = h.supervisor.lastSubmissionCorrelation
  assert.ok(correlation)
  await assert.rejects(
    h.supervisor.reconcileSubmission({ requestId: `${correlation.requestId}-other` }),
    /correlation is unavailable/,
  )
  const recovered = await h.supervisor.reconcileSubmission({ requestId: correlation.requestId })
  assert.equal(recovered.outcome, 'ACCEPTED')
  assert.equal(h.fixture.counts.effects, 1)
  const second = await h.client.callTool({ name: h.fixture.gateway.submitTool, arguments: packet })
  assert.equal(second.isError, true)
  assert.equal(h.actions.filter(action => action === 'request').length, 1)
})

test('required failure entry returns before reading bootstrap or constructing a server', async () => {
  const { runScopedWorkerEntry } = await import('./fixtures/codex-app-server-m02-ta/scoped-worker-entry.mjs')
  await assert.rejects(runScopedWorkerEntry({ args: [], bootstrapPath: '/missing' }), /flag is required/)
  assert.deepEqual(
    await runScopedWorkerEntry({
      args: ['--m02-ta-scoped-worker', '--m02-ta-required-failure'],
      bootstrapPath: '/missing',
    }),
    { requiredFailure: true },
  )
})

test('runtime workspace option rejects paths outside exact owned supervisor ancestry', async () => {
  await assert.rejects(
    createCanonicalAcceptanceFixture('TRIAGER', {
      workspace: '/private/tmp/unrelated/cases/case-a/supervisor',
      cleanupOnClose: false,
    }),
  )
  await assert.rejects(
    createCanonicalAcceptanceFixture('TRIAGER', {
      workspace: '/private/tmp/appraise-m02-ta-matrix-p1/cases/../case-a/supervisor',
      cleanupOnClose: false,
    }),
  )
  const lazy = createLazyCanonicalSupervisorBridge({
    role: 'TRIAGER',
    workspace: '/private/tmp/unrelated/cases/case-a/supervisor',
    caseId: 'case-a',
    onUnknown: () => {},
  })
  const config = lazy.bootstrapConfig('http://127.0.0.1:32100/m02/canonical')
  assert.equal(config.schema, 'appraise.m02-ta-bridge-bootstrap/v1')
  assert.equal(config.caseId, 'case-a')
  assert.ok(config.capability.length >= 32)
  await lazy.close()
})
