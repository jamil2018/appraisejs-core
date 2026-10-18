import { createHash } from 'node:crypto'
import { createGatewayFixture } from '../../../../scripts/tests/fixtures/codex-app-server-m02/gateway-fixture.mjs'
import { describe, expect, it } from 'vitest'
import { externalWorkerTools, type ExternalWorkerRole } from './external-worker-gateway.js'
import { prepareExternalWorkerNativeMapping } from './external-worker-native-mapping.js'
import { NativeDescriptorCollector, type TrustedDescriptorContext } from './native-descriptor-capture.js'

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
    .join(',')}}`
}
const hash = (value: unknown) => `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`
const sha = `sha256:${'a'.repeat(64)}`
const context: TrustedDescriptorContext = {
  binarySha256: sha,
  platform: 'synthetic-test-platform',
  configSha256: sha,
  schemaSha256: sha,
  runId: 'run-1',
  requestId: 'request-1',
  threadId: 'thread-1',
  turnId: 'turn-1',
}
function fixture(role: ExternalWorkerRole = 'REQUIREMENT_ANALYZER') {
  const inputSchema = { type: 'object', properties: {}, additionalProperties: false }
  const tools = externalWorkerTools[role].map(name => ({
    name,
    inputSchema,
    canonicalSchemaHash: hash(inputSchema),
    workerSchemaHash: hash(inputSchema),
  }))
  const profile = { role, tools, resources: [] as never[], profileDigest: hash({ role, tools, resources: [] }) }
  const advertisedSubject = {
    gatewayProfileDigest: profile.profileDigest,
    tools: tools.map(tool => ({
      name: tool.name,
      inputSchema: structuredClone(tool.inputSchema),
      schemaHash: tool.workerSchemaHash,
    })),
  }
  const advertisedProfile = { ...advertisedSubject, profileDigest: hash(advertisedSubject) }
  const body = {
    tools: tools.map(tool => ({
      type: 'function',
      name: `mcp__worker__${tool.name}`,
      parameters: structuredClone(tool.inputSchema),
    })),
  }
  const request = {
    method: 'POST',
    path: '/v1/responses',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify(body)),
  }
  const capture = new NativeDescriptorCollector().capture(request, context)
  if (capture.status !== 'CAPTURED') throw new Error(capture.reason)
  const routes = capture.callables.map((callable, i) => ({
    nativeName: callable.name,
    operation: tools[i].name,
    descriptorHash: callable.descriptorHash,
  }))
  return {
    body,
    request,
    context: structuredClone(context),
    routes,
    profile,
    advertisedProfile,
    mcpServerName: 'worker',
  }
}
const updateBody = (h: ReturnType<typeof fixture>) => {
  h.request.body = Buffer.from(JSON.stringify(h.body))
}

describe('M02 exact direct native mapping preparation', () => {
  for (const role of Object.keys(externalWorkerTools) as ExternalWorkerRole[])
    it(`${role}: exact direct tools remain preparation, never dispatch authority`, () => {
      const h = fixture(role)
      const result = prepareExternalWorkerNativeMapping(h)
      expect(result.status).toBe('PREPARED_NOT_RUNTIME_QUALIFIED')
      expect(result.runtimeQualified).toBe(false)
      expect(result.dispatchAllowed).toBe(false)
      if (result.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED') throw new Error(result.reason)
      expect(result.provenance.attestation).toBe('SUPPLIED_NOT_ATTESTED')
      h.routes[0].nativeName = 'changed'
      expect(result.routes[0].nativeName).not.toBe('changed')
      expect(Object.isFrozen(result.routes[0])).toBe(true)
    })
  it('rejects generic evaluator or collaboration mappings even when schemas and descriptor hashes match', () => {
    for (const name of ['functions.exec', 'collaboration.spawn_agent', 'evaluate', 'shell']) {
      const h = fixture()
      h.body.tools[0].name = name
      updateBody(h)
      const capture = new NativeDescriptorCollector().capture(h.request, context)
      if (capture.status !== 'CAPTURED') throw new Error(capture.reason)
      h.routes[0] = { ...h.routes[0], nativeName: name, descriptorHash: capture.callables[0].descriptorHash }
      expect(prepareExternalWorkerNativeMapping(h)).toMatchObject({
        status: 'BLOCKED',
        reason: 'UNSUPPORTED_SCOPED_ROUTE',
        dispatchAllowed: false,
      })
    }
  })
  it('rejects empty/partial mappings, extra tools, duplicate operations and cross-role routes', () => {
    const h = fixture()
    h.routes.pop()
    expect(prepareExternalWorkerNativeMapping(h).status).toBe('BLOCKED')
    const h2 = fixture()
    h2.routes[1].operation = h2.routes[0].operation
    expect(prepareExternalWorkerNativeMapping(h2)).toMatchObject({ reason: 'INVALID_OPERATION_MAP' })
    const h3 = fixture()
    h3.routes[0].operation = 'quality_journey_execution_start'
    expect(prepareExternalWorkerNativeMapping(h3)).toMatchObject({ reason: 'INVALID_OPERATION_MAP' })
    const h4 = fixture()
    h4.body.tools.push({
      type: 'function',
      name: 'other',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    })
    updateBody(h4)
    expect(prepareExternalWorkerNativeMapping(h4)).toMatchObject({ reason: 'CALLABLE_SET_MISMATCH' })
  })
  it('rejects descriptor/schema drift and a forged role-profile digest', () => {
    const h = fixture()
    h.body.tools[0].parameters.additionalProperties = true
    updateBody(h)
    expect(prepareExternalWorkerNativeMapping(h)).toMatchObject({ reason: 'DESCRIPTOR_MISMATCH' })
    const capture = new NativeDescriptorCollector().capture(h.request, context)
    if (capture.status !== 'CAPTURED') throw new Error(capture.reason)
    h.routes[0].descriptorHash = capture.callables[0].descriptorHash
    expect(prepareExternalWorkerNativeMapping(h)).toMatchObject({ reason: 'ARGUMENT_SCHEMA_MISMATCH' })
    const h2 = fixture()
    h2.profile.profileDigest = `sha256:${'0'.repeat(64)}`
    expect(prepareExternalWorkerNativeMapping(h2)).toMatchObject({ reason: 'PROFILE_HASH_MISMATCH' })
  })
  it('does not promote name-only old manifests, auth headers or fake context to an executable mapping', () => {
    const h = fixture()
    h.request.body = Buffer.from(JSON.stringify({ tools: [{ type: 'function', name: h.routes[0].nativeName }] }))
    expect(prepareExternalWorkerNativeMapping(h)).toMatchObject({ status: 'BLOCKED' })
    const h2 = fixture()
    Object.assign(h2.request.headers, { Authorization: 'synthetic-not-a-secret' })
    expect(prepareExternalWorkerNativeMapping(h2)).toMatchObject({ status: 'BLOCKED' })
    const h3 = fixture()
    h3.context = { ...h3.context, binarySha256: 'not-a-digest' }
    expect(prepareExternalWorkerNativeMapping(h3)).toMatchObject({
      reason: 'CAPTURE_INVALID_CONTEXT',
      dispatchAllowed: false,
    })
  })
})

it('composes with actual accepted gateway profiles for all six roles', () => {
  for (const role of Object.keys(externalWorkerTools) as ExternalWorkerRole[]) {
    const actual = createGatewayFixture(role).profile
    const h = fixture(role)
    h.profile = actual
    const subject = {
      gatewayProfileDigest: actual.profileDigest,
      tools: actual.tools.map(
        (tool: { name: string; inputSchema: Record<string, unknown>; workerSchemaHash: string }) => ({
          name: tool.name,
          inputSchema: structuredClone(tool.inputSchema),
          schemaHash: tool.workerSchemaHash,
        }),
      ),
    }
    h.advertisedProfile = { ...subject, profileDigest: hash(subject) } as typeof h.advertisedProfile
    h.body.tools = actual.tools.map((tool: { name: string; inputSchema: Record<string, unknown> }) => ({
      type: 'function',
      name: `mcp__worker__${tool.name}`,
      parameters: structuredClone(tool.inputSchema),
    })) as typeof h.body.tools
    updateBody(h)
    const capture = new NativeDescriptorCollector().capture(h.request, context)
    if (capture.status !== 'CAPTURED') throw new Error(capture.reason)
    h.routes = capture.callables.map((callable, i) => ({
      nativeName: callable.name,
      operation: actual.tools[i].name,
      descriptorHash: callable.descriptorHash,
    }))
    expect(prepareExternalWorkerNativeMapping(h)).toMatchObject({
      status: 'PREPARED_NOT_RUNTIME_QUALIFIED',
      dispatchAllowed: false,
    })
  }
})

it('rejects detached or changed advertised schema profiles', () => {
  const h = fixture()
  h.advertisedProfile.gatewayProfileDigest = 'changed'
  expect(prepareExternalWorkerNativeMapping(h)).toMatchObject({ reason: 'ADVERTISED_PROFILE_MISMATCH' })
  const h2 = fixture()
  h2.advertisedProfile.tools[0].inputSchema.additionalProperties = true
  expect(prepareExternalWorkerNativeMapping(h2)).toMatchObject({ reason: 'ADVERTISED_PROFILE_MISMATCH' })
})
