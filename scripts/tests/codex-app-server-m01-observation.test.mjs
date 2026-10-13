// These checks audit saved observations; they do not launch Codex or prove inference access.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
const read = name =>
  JSON.parse(readFileSync(new URL(`../../tasks/codex-app-server-journeys/m01/${name}`, import.meta.url), 'utf8'))
const observation = read('no-model-observation.json')
const schemas = read('schema-pin.json')

test('saved observation uses the pinned tuple and generated schema manifest', () => {
  assert.equal(observation.preparationError, undefined)
  assert.equal(observation.schemaManifestSha256, schemas.manifestSha256)
  assert.equal(observation.actualVersion, observation.pin.version)
  assert.equal(observation.schemaFileCount, schemas.fileCount)
  assert.equal(observation.systemConfigFileAbsent, true)
  assert.equal(observation.disposableStateDeleted, true)
  for (const r of observation.observations) {
    assert.match(r.handshake.userAgent, /0\.162\.0-alpha\.17\.2/)
    assert.equal(r.effectiveProvider, 'm01_offline')
    assert.equal(r.transport.code, 0)
    assert.equal(
      r.transport.sent.some(f => f.method === 'turn/start' || /login|authTokens/.test(f.method ?? '')),
      false,
    )
    assert.equal(r.configLayers.length, 2)
    assert.deepEqual(r.configLayers.find(layer => layer.source.type === 'system').configKeys, [])
  }
})

test('required-MCP failure, idle interruption refusal and injected lost acknowledgement remain explicit', () => {
  const find = name => observation.observations.find(r => r.name === name)
  assert.equal(find('required-mcp').requiredMcpRejected, true)
  assert.match(find('required-mcp').rejection.message, /required MCP servers failed/)
  assert.match(find('idle-interrupt').idleInterruptError.message, /no active turn/)
  assert.equal(find('lost-ack').transport.dropped, 1)
  assert.equal(find('lost-ack').startRequestCount, 1)
  assert.equal(find('lost-ack').unknownStart, true)
  assert.equal(find('lost-ack').automaticResend, false)
  assert.equal(observation.m01Complete, false)
  assert.equal(observation.providerInferenceAuthorized, false)
})

test('no-turn resume refusal is negative evidence, not durable-resume qualification', () => {
  for (const name of ['baseline', 'restart-resume']) {
    const r = observation.observations.find(r => r.name === name)
    assert.match(r.error.rpcError.message, /no rollout found/)
  }
})

test('schema drift from the reference is visible: turnId required; historyMode absent', () => {
  assert.deepEqual(schemas.selectedSurface['v2/TurnInterruptParams.json'].required, ['threadId', 'turnId'])
  assert.equal(schemas.selectedSurface['v2/ThreadStartParams.json'].properties.includes('historyMode'), false)
})

const stream = read('stream-fixture-observation.json')
test('actual binary handles synthetic completion, correlated interruption, requests and restart/resume', () => {
  assert.equal(stream.error, undefined)
  assert.equal(stream.terminal, 'completed')
  assert.equal(stream.resumeMatches, true)
  assert.equal(stream.restartResumeMatches, true)
  assert.equal(stream.interruptAcknowledged, true)
  assert.equal(stream.interruptedStatus, 'interrupted')
  assert.equal(stream.lastTurnStatus, 'interrupted')
  assert.equal(stream.lostTurnAckDropped, 1)
  assert.equal(stream.turnStartCount, 3)
  assert.equal(stream.automaticResend, false)
  assert.deepEqual(stream.deniedServerRequests, [{ method: 'item/tool/call', idType: 'int' }])
  for (const event of stream.correlatedEvents) {
    assert.equal(event.threadId, stream.threadId)
    assert.equal(typeof event.turnId, 'string')
  }
})

test('synthetic local HTTP traffic and experimental schema pin do not qualify native auth or entitlement', async () => {
  const { createHash } = await import('node:crypto')
  const source = readFileSync(new URL('./fixtures/codex-app-server-m01/stream-fixture-probe.py', import.meta.url))
  assert.equal(createHash('sha256').update(source).digest('hex'), stream.sourceSha256)
  assert.equal(stream.pin.binarySha256, observation.pin.sha256)
  assert.equal(stream.experimentalSchemaFileCount, 447)
  assert.match(stream.experimentalSchemaManifestSha256, /^[a-f0-9]{64}$/)
  assert.equal(stream.disposableStateDeleted, true)
  assert.equal(stream.noProviderInference, true)
  assert.equal(stream.providerInferenceAuthorized, false)
  assert.equal(stream.m01Complete, false)
  for (const request of stream.syntheticHttpRequests) {
    assert.equal(request.path, '/v1/responses')
    assert.equal(request.authorizationPresent, false)
  }
})
