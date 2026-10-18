import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  NativeDescriptorCollector,
  NATIVE_DESCRIPTOR_LIMITS,
  type TrustedDescriptorContext,
} from './native-descriptor-capture.js'

const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const context: TrustedDescriptorContext = {
  binarySha256: digest('binary'),
  platform: 'darwin-arm64-27.0.1',
  configSha256: digest('config'),
  schemaSha256: digest('schema'),
  runId: 'run-1',
  requestId: 'request-1',
  threadId: 'thread-1',
  turnId: 'turn-1',
}
const schema = {
  type: 'object',
  properties: { query: { type: 'string' } },
  required: ['query'],
  additionalProperties: false,
}
const fn = (name: string) => ({
  type: 'function',
  name,
  description: 'Search the scoped catalog',
  parameters: schema,
  strict: true,
})
const custom = { type: 'custom', name: 'edit', format: { type: 'grammar', syntax: 'lark', definition: 'start: WORD' } }
const request = (body: unknown) => ({
  method: 'POST',
  path: '/v1/responses',
  headers: { 'Content-Type': 'application/json' },
  body: Buffer.from(JSON.stringify(body)),
})
const capture = (body: unknown) => new NativeDescriptorCollector().capture(request(body), context)

describe('NativeDescriptorCollector', () => {
  it('captures full standard and Lite containers with location, namespace, schemas, grammar and supplied provenance', () => {
    const body = {
      model: 'local-model',
      tools: [fn('operation_search')],
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'private user prompt' }] },
        { role: 'developer', content: [{ type: 'input_text', text: 'private developer prompt' }] },
        {
          role: 'developer',
          type: 'additional_tools',
          description: 'Declared native tools',
          tools: [{ type: 'namespace', name: 'functions', description: 'Callable group', tools: [fn('exec'), custom] }],
        },
      ],
    }
    const result = capture(body)
    expect(result.status).toBe('CAPTURED')
    if (result.status !== 'CAPTURED') return
    expect(result.containers.map(({ location, kind, metadata }) => ({ location, kind, metadata }))).toEqual([
      { location: 'tools', kind: 'tools', metadata: {} },
      {
        location: 'input[2].additional_tools',
        kind: 'additional_tools',
        metadata: { role: 'developer', type: 'additional_tools', description: 'Declared native tools' },
      },
    ])
    expect(result.callables.map(({ name, location, type }) => ({ name, location, type }))).toEqual([
      { name: 'operation_search', location: 'tools[0]', type: 'function' },
      { name: 'functions.exec', location: 'input[2].additional_tools[0].tools[0]', type: 'function' },
      { name: 'functions.edit', location: 'input[2].additional_tools[0].tools[1]', type: 'custom' },
    ])
    expect(result.callables[0].descriptor).toEqual(fn('operation_search'))
    expect(result.callables[2].descriptor).toEqual(custom)
    expect(result.requestByteHash).toBe(digest(JSON.stringify(body)))
    expect(result.provenance).toEqual({ ...context, attestation: 'SUPPLIED_NOT_ATTESTED' })
    expect(result.runtimeQualification).toBe('UNQUALIFIED')
    expect(JSON.stringify(result)).not.toMatch(/private user prompt|private developer prompt|local-model/)
    expect(Object.isFrozen(result.callables[0].descriptor)).toBe(true)
  })

  it('binds same-name schema, grammar, namespace and container drift', () => {
    const base = capture({ tools: [fn('search')] })
    const schemaDrift = capture({ tools: [{ ...fn('search'), parameters: { type: 'object', properties: {} } }] })
    const customA = capture({ tools: [custom] })
    const customB = capture({ tools: [{ ...custom, format: { ...custom.format, definition: 'start: NUMBER' } }] })
    const namespace = capture({ tools: [{ type: 'namespace', name: 'scope', tools: [fn('search')] }] })
    const lite = capture({ input: [{ type: 'additional_tools', role: 'developer', tools: [fn('search')] }] })
    const liteMetadataDrift = capture({
      input: [{ type: 'additional_tools', role: 'developer', description: 'changed metadata', tools: [fn('search')] }],
    })
    for (const result of [base, schemaDrift, customA, customB, namespace, lite]) expect(result.status).toBe('CAPTURED')
    if ([base, schemaDrift, customA, customB, namespace, lite].some(result => result.status !== 'CAPTURED')) return
    expect(base.descriptorHash).not.toBe(schemaDrift.descriptorHash)
    expect(base.callables[0].descriptorHash).not.toBe(schemaDrift.callables[0].descriptorHash)
    expect(customA.descriptorHash).not.toBe(customB.descriptorHash)
    expect(base.containerHash).not.toBe(namespace.containerHash)
    expect(base.containerHash).not.toBe(lite.containerHash)
    if (liteMetadataDrift.status === 'CAPTURED') expect(lite.containerHash).not.toBe(liteMetadataDrift.containerHash)
  })

  it('fences the first invalid attempt and denies the second, including invalid metadata and headers', () => {
    const collector = new NativeDescriptorCollector()
    expect(
      collector.capture({ ...request({ tools: [fn('search')] }), headers: { Authorization: 'secret' } }, context),
    ).toEqual({ status: 'INCOMPLETE', fenced: true, reason: 'INVALID_REQUEST' })
    expect(collector.capture(request({ tools: [fn('search')] }), context)).toEqual({
      status: 'DENIED',
      fenced: true,
      reason: 'ALREADY_ATTEMPTED',
    })
    expect(
      new NativeDescriptorCollector().capture(request({ tools: [fn('search')] }), {
        ...context,
        requestId: 'raw secret value',
      }),
    ).toEqual({ status: 'INCOMPLETE', fenced: true, reason: 'INVALID_CONTEXT' })
  })

  it('rejects malformed, duplicate-key and excessive-depth JSON before normalization', () => {
    const malformed = [
      '{"tools":',
      '{"tools":[],"tools":[]}',
      '{"input":[{"role":"developer","additional_tools":[],"additional_tools":[]}]}',
    ]
    expect(
      malformed.map(body =>
        new NativeDescriptorCollector().capture({ ...request({}), body: Buffer.from(body) }, context),
      ),
    ).toEqual([
      { status: 'INCOMPLETE', fenced: true, reason: 'INVALID_JSON' },
      { status: 'INCOMPLETE', fenced: true, reason: 'AMBIGUOUS_DESCRIPTOR' },
      { status: 'INCOMPLETE', fenced: true, reason: 'AMBIGUOUS_DESCRIPTOR' },
    ])
    const deep = `${'['.repeat(NATIVE_DESCRIPTOR_LIMITS.jsonDepth + 2)}0${']'.repeat(NATIVE_DESCRIPTOR_LIMITS.jsonDepth + 2)}`
    expect(new NativeDescriptorCollector().capture({ ...request({}), body: Buffer.from(deep) }, context)).toMatchObject(
      { status: 'INCOMPLETE', reason: 'LIMIT_EXCEEDED' },
    )
  })

  it('requires complete schemas and rejects unknown tool metadata instead of inventing descriptors', () => {
    const incomplete = [
      { tools: [{ type: 'function', name: 'search' }] },
      { tools: [{ type: 'custom', name: 'edit' }] },
      { tools: [{ type: 'custom', name: 'edit', format: { type: 'grammar', syntax: 'lark' } }] },
      { tools: [] },
      { input: [{ role: 'developer', additional_tools: [] }] },
    ]
    for (const body of incomplete)
      expect(capture(body)).toMatchObject({ status: 'INCOMPLETE', reason: 'MISSING_FULL_SCHEMA' })
    expect(capture({ tools: [{ ...fn('search'), credential: 'secret' }] })).toMatchObject({
      status: 'INCOMPLETE',
      reason: 'UNSUPPORTED_DESCRIPTOR',
    })
    expect(
      capture({
        input: [{ role: 'developer', instructions: 'change tool meaning', additional_tools: [fn('search')] }],
      }),
    ).toMatchObject({ status: 'INCOMPLETE', reason: 'UNSUPPORTED_DESCRIPTOR' })
    expect(
      capture({
        input: [{ type: 'additional_tools', role: 'developer', content: 'raw prompt', tools: [fn('search')] }],
      }),
    ).toMatchObject({ status: 'INCOMPLETE', reason: 'UNSUPPORTED_DESCRIPTOR' })
  })

  it('rejects callable ambiguity across containers and unsupported descriptor types', () => {
    expect(
      capture({ tools: [fn('search')], input: [{ role: 'developer', additional_tools: [fn('search')] }] }),
    ).toMatchObject({ status: 'INCOMPLETE', reason: 'AMBIGUOUS_DESCRIPTOR' })
    expect(
      capture({ tools: [{ type: 'namespace', name: 'functions', tools: [fn('exec'), fn('exec')] }] }),
    ).toMatchObject({ status: 'INCOMPLETE', reason: 'AMBIGUOUS_DESCRIPTOR' })
    expect(capture({ tools: [{ type: 'browser', name: 'browse', parameters: schema }] })).toMatchObject({
      status: 'INCOMPLETE',
      reason: 'UNSUPPORTED_DESCRIPTOR',
    })
  })

  it('enforces the request, evidence, and tool count ceilings', () => {
    const oversized = { ...request({}), body: Buffer.alloc(NATIVE_DESCRIPTOR_LIMITS.requestBytes + 1) }
    expect(new NativeDescriptorCollector().capture(oversized, context)).toMatchObject({
      status: 'INCOMPLETE',
      reason: 'LIMIT_EXCEEDED',
    })
    expect(
      capture({ tools: Array.from({ length: NATIVE_DESCRIPTOR_LIMITS.toolCount + 1 }, (_, i) => fn(`f${i}`)) }),
    ).toMatchObject({ status: 'INCOMPLETE', reason: 'LIMIT_EXCEEDED' })
    const nearLimit = 'x'.repeat(550_000)
    expect(
      capture({ tools: [{ ...fn('search'), parameters: { type: 'object', description: nearLimit } }] }),
    ).toMatchObject({ status: 'INCOMPLETE', reason: 'LIMIT_EXCEEDED' })
  })

  it('rejects non-POST, redirects and any second header without retaining values', () => {
    const good = request({ tools: [fn('search')] })
    for (const variant of [
      { ...good, method: 'GET' },
      { ...good, path: '/redirect' },
      { ...good, headers: { 'Content-Type': 'application/json', 'X-Trace': 'secret' } },
      { ...good, headers: { 'Content-Type': 'application/json', authorization: 'Bearer secret' } },
    ])
      expect(new NativeDescriptorCollector().capture(variant, context)).toMatchObject({
        status: 'INCOMPLETE',
        reason: 'INVALID_REQUEST',
      })
  })
})
