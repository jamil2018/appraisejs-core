import { createHash } from 'node:crypto'

/** Pure, one-attempt inspection of a trusted collector's already received request bytes. */
export const NATIVE_DESCRIPTOR_LIMITS = Object.freeze({
  requestBytes: 1024 * 1024,
  evidenceBytes: 1024 * 1024,
  metadataBytes: 64 * 1024,
  jsonDepth: 32,
  descriptorDepth: 24,
  toolCount: 256,
})

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type NativeToolDescriptor = { [key: string]: Json }
export type DescriptorContainer = Readonly<{
  location: string
  kind: 'tools' | 'additional_tools'
  /** Only descriptor-container metadata is retained. Prompt/content fields are excluded. */
  metadata: Readonly<{ role?: 'developer'; type?: string; description?: string; name?: string }>
  tools: readonly NativeToolDescriptor[]
}>
export type CapturedCallable = Readonly<{
  name: string
  type: 'function' | 'custom'
  location: string
  descriptorHash: string
  descriptor: NativeToolDescriptor
}>
export type TrustedDescriptorContext = Readonly<{
  binarySha256: string
  platform: string
  configSha256: string
  schemaSha256: string
  runId: string
  requestId: string
  threadId: string
  turnId: string
}>
export type DescriptorRequest = Readonly<{
  method: string
  path: string
  headers: Readonly<Record<string, string>>
  body: Buffer
}>
export type DescriptorCapture = Readonly<{
  status: 'CAPTURED'
  fenced: true
  requestByteHash: string
  containerHash: string
  descriptorHash: string
  containers: readonly DescriptorContainer[]
  callables: readonly CapturedCallable[]
  provenance: Readonly<TrustedDescriptorContext & { attestation: 'SUPPLIED_NOT_ATTESTED' }>
  runtimeQualification: 'UNQUALIFIED'
}>
export type DescriptorCaptureFailure = Readonly<{
  status: 'INCOMPLETE' | 'DENIED'
  fenced: true
  reason:
    | 'ALREADY_ATTEMPTED'
    | 'INVALID_CONTEXT'
    | 'INVALID_REQUEST'
    | 'INVALID_JSON'
    | 'UNSUPPORTED_DESCRIPTOR'
    | 'AMBIGUOUS_DESCRIPTOR'
    | 'MISSING_FULL_SCHEMA'
    | 'LIMIT_EXCEEDED'
}>
export type DescriptorCaptureResult = DescriptorCapture | DescriptorCaptureFailure

class CaptureError extends Error {
  constructor(readonly reason: DescriptorCaptureFailure['reason']) {
    super(reason)
  }
}
function fail(reason: DescriptorCaptureFailure['reason']): never {
  throw new CaptureError(reason)
}
const hashBytes = (bytes: Buffer | string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)

function canonical(value: Json): Json {
  if (Array.isArray(value)) return value.map(canonical)
  if (!record(value)) return value
  const output: { [key: string]: Json } = Object.create(null)
  for (const key of Object.keys(value).sort()) output[key] = canonical(value[key] as Json)
  return output
}
const hashValue = (value: Json) => hashBytes(JSON.stringify(canonical(value)))

/** Scan before JSON.parse so duplicate object keys and excessive nesting cannot be normalized away. */
function inspectJsonLexically(source: string): void {
  let at = 0
  const white = () => {
    while (/\s/.test(source[at] ?? '') && at < source.length) at++
  }
  const string = (): string => {
    const start = at++
    while (at < source.length) {
      if (source[at] === '\\') {
        at += 2
      } else if (source[at++] === '"') {
        return JSON.parse(source.slice(start, at)) as string
      }
    }
    return fail('INVALID_JSON')
  }
  const value = (depth: number): void => {
    if (depth > NATIVE_DESCRIPTOR_LIMITS.jsonDepth) fail('LIMIT_EXCEEDED')
    white()
    if (source[at] === '{') {
      at++
      const keys = new Set<string>()
      white()
      if (source[at] === '}') {
        at++
        return
      }
      while (at < source.length) {
        white()
        if (source[at] !== '"') fail('INVALID_JSON')
        const key = string()
        if (keys.has(key)) fail('AMBIGUOUS_DESCRIPTOR')
        keys.add(key)
        white()
        if (source[at++] !== ':') fail('INVALID_JSON')
        value(depth + 1)
        white()
        const next = source[at++]
        if (next === '}') return
        if (next !== ',') fail('INVALID_JSON')
      }
    } else if (source[at] === '[') {
      at++
      white()
      if (source[at] === ']') {
        at++
        return
      }
      while (at < source.length) {
        value(depth + 1)
        white()
        const next = source[at++]
        if (next === ']') return
        if (next !== ',') fail('INVALID_JSON')
      }
    } else if (source[at] === '"') {
      string()
      return
    } else {
      const start = at
      while (at < source.length && !/[\s,\]}]/.test(source[at])) at++
      if (start === at) fail('INVALID_JSON')
      return
    }
    fail('INVALID_JSON')
  }
  value(0)
  white()
  if (at !== source.length) fail('INVALID_JSON')
}

function validateContext(value: unknown): TrustedDescriptorContext {
  if (!record(value)) fail('INVALID_CONTEXT')
  const fields = [
    'binarySha256',
    'platform',
    'configSha256',
    'schemaSha256',
    'runId',
    'requestId',
    'threadId',
    'turnId',
  ]
  if (Object.keys(value).length !== fields.length || fields.some(field => !own(value, field))) fail('INVALID_CONTEXT')
  for (const field of fields) {
    const entry = value[field]
    if (typeof entry !== 'string' || entry.length > 200) fail('INVALID_CONTEXT')
    if (field.endsWith('Sha256')) {
      if (!/^sha256:[a-f0-9]{64}$/.test(entry)) fail('INVALID_CONTEXT')
    } else if (!/^[A-Za-z0-9._:+/@-]{1,200}$/.test(entry)) fail('INVALID_CONTEXT')
  }
  if (Buffer.byteLength(JSON.stringify(value)) > NATIVE_DESCRIPTOR_LIMITS.metadataBytes) fail('LIMIT_EXCEEDED')
  return value as TrustedDescriptorContext
}

function validateRequest(value: unknown): Buffer {
  if (!record(value) || value.method !== 'POST' || value.path !== '/v1/responses' || !Buffer.isBuffer(value.body))
    fail('INVALID_REQUEST')
  if (Object.keys(value).length !== 4 || ['method', 'path', 'headers', 'body'].some(key => !own(value, key)))
    fail('INVALID_REQUEST')
  const headers = value.headers
  if (!record(headers)) fail('INVALID_REQUEST')
  if (Object.getPrototypeOf(headers) !== Object.prototype && Object.getPrototypeOf(headers) !== null)
    fail('INVALID_REQUEST')
  const entries = Object.entries(Object.getOwnPropertyDescriptors(headers))
  if (entries.length !== 1) fail('INVALID_REQUEST')
  const [name, descriptor] = entries[0]
  if (name.toLowerCase() !== 'content-type' || !own(descriptor, 'value') || descriptor.value !== 'application/json')
    fail('INVALID_REQUEST')
  if (value.body.length > NATIVE_DESCRIPTOR_LIMITS.requestBytes) fail('LIMIT_EXCEEDED')
  return value.body
}

function validateJson(value: unknown, depth = 0): void {
  if (depth > NATIVE_DESCRIPTOR_LIMITS.descriptorDepth) fail('LIMIT_EXCEEDED')
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) {
    for (const child of value) validateJson(child, depth + 1)
    return
  }
  if (!record(value)) fail('UNSUPPORTED_DESCRIPTOR')
  for (const [key, child] of Object.entries(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') fail('UNSUPPORTED_DESCRIPTOR')
    validateJson(child, depth + 1)
  }
}

const descriptorFields = new Set([
  'type',
  'name',
  'description',
  'parameters',
  'strict',
  'format',
  'tools',
  'functions',
  'function',
])
function validateDescriptor(value: unknown): NativeToolDescriptor {
  if (!record(value)) fail('UNSUPPORTED_DESCRIPTOR')
  if (Object.keys(value).some(key => !descriptorFields.has(key))) fail('UNSUPPORTED_DESCRIPTOR')
  validateJson(value)
  const type = value.type
  if (type !== 'function' && type !== 'custom' && type !== 'namespace') fail('UNSUPPORTED_DESCRIPTOR')
  if (own(value, 'description') && (typeof value.description !== 'string' || value.description.length > 65536))
    fail('UNSUPPORTED_DESCRIPTOR')
  if (type === 'function') {
    const nested = value.function
    const named = nested === undefined ? value : nested
    if (!record(named) || typeof named.name !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(named.name))
      fail('MISSING_FULL_SCHEMA')
    if (!record(named.parameters) || named.parameters.type !== 'object') fail('MISSING_FULL_SCHEMA')
    if (nested !== undefined && (own(value, 'name') || own(value, 'parameters'))) fail('AMBIGUOUS_DESCRIPTOR')
    if (own(named, 'strict') && typeof named.strict !== 'boolean') fail('UNSUPPORTED_DESCRIPTOR')
    if (own(named, 'description') && (typeof named.description !== 'string' || named.description.length > 65536))
      fail('UNSUPPORTED_DESCRIPTOR')
    if (nested !== undefined && own(value, 'strict')) fail('UNSUPPORTED_DESCRIPTOR')
    if (
      nested !== undefined &&
      Object.keys(named).some(key => !['name', 'description', 'parameters', 'strict'].includes(key))
    )
      fail('UNSUPPORTED_DESCRIPTOR')
    if (own(value, 'format') || own(value, 'tools') || own(value, 'functions')) fail('UNSUPPORTED_DESCRIPTOR')
  } else if (type === 'custom') {
    const format = value.format
    if (typeof value.name !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(value.name) || !record(format))
      fail('MISSING_FULL_SCHEMA')
    if (format.type !== 'grammar' && format.type !== 'text') fail('UNSUPPORTED_DESCRIPTOR')
    if (
      format.type === 'grammar' &&
      (typeof format.syntax !== 'string' ||
        !format.syntax ||
        typeof format.definition !== 'string' ||
        !format.definition)
    )
      fail('MISSING_FULL_SCHEMA')
    if (
      Object.keys(format).some(key =>
        format.type === 'grammar' ? !['type', 'syntax', 'definition'].includes(key) : key !== 'type',
      )
    )
      fail('UNSUPPORTED_DESCRIPTOR')
    if (
      own(value, 'parameters') ||
      own(value, 'tools') ||
      own(value, 'functions') ||
      own(value, 'function') ||
      own(value, 'strict')
    )
      fail('UNSUPPORTED_DESCRIPTOR')
  } else {
    if (typeof value.name !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(value.name)) fail('MISSING_FULL_SCHEMA')
    if (own(value, 'tools') === own(value, 'functions')) fail('AMBIGUOUS_DESCRIPTOR')
    const children = own(value, 'tools') ? value.tools : value.functions
    if (!Array.isArray(children) || children.length === 0) fail('MISSING_FULL_SCHEMA')
    if (own(value, 'parameters') || own(value, 'format') || own(value, 'function') || own(value, 'strict'))
      fail('UNSUPPORTED_DESCRIPTOR')
  }
  return value as NativeToolDescriptor
}

function freezeTree(value: Json): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeTree(child)
    Object.freeze(value)
  }
}

export class NativeDescriptorCollector {
  #attempted = false

  capture(request: DescriptorRequest, trustedContext: TrustedDescriptorContext): DescriptorCaptureResult {
    if (this.#attempted) return { status: 'DENIED', fenced: true, reason: 'ALREADY_ATTEMPTED' }
    this.#attempted = true
    try {
      const context = validateContext(trustedContext)
      const body = validateRequest(request)
      let source: string
      try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(body)
        inspectJsonLexically(source)
      } catch (error) {
        if (error instanceof CaptureError) throw error
        return fail('INVALID_JSON')
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(source)
      } catch {
        return fail('INVALID_JSON')
      }
      if (!record(parsed)) fail('INVALID_JSON')
      const containers: DescriptorContainer[] = []
      if (own(parsed, 'tools')) {
        if (!Array.isArray(parsed.tools)) fail('MISSING_FULL_SCHEMA')
        containers.push({
          location: 'tools',
          kind: 'tools',
          metadata: {},
          tools: parsed.tools as NativeToolDescriptor[],
        })
      }
      if (own(parsed, 'input')) {
        if (!Array.isArray(parsed.input)) fail('INVALID_JSON')
        parsed.input.forEach((item, index) => {
          if (!record(item)) return
          const observedLite = item.type === 'additional_tools'
          const inlineLite = own(item, 'additional_tools')
          if (!observedLite && !inlineLite) return
          if (observedLite && inlineLite) fail('AMBIGUOUS_DESCRIPTOR')
          const tools = observedLite ? item.tools : item.additional_tools
          if (item.role !== 'developer' || !Array.isArray(tools)) fail('UNSUPPORTED_DESCRIPTOR')
          const allowed = observedLite
            ? ['role', 'type', 'description', 'name', 'tools']
            : ['role', 'type', 'description', 'name', 'additional_tools']
          if (Object.keys(item).some(key => !allowed.includes(key))) fail('UNSUPPORTED_DESCRIPTOR')
          if (own(item, 'type') && (typeof item.type !== 'string' || item.type.length > 100))
            fail('UNSUPPORTED_DESCRIPTOR')
          for (const key of ['description', 'name'])
            if (own(item, key) && (typeof item[key] !== 'string' || item[key].length > 65536))
              fail('UNSUPPORTED_DESCRIPTOR')
          containers.push({
            location: `input[${index}].additional_tools`,
            kind: 'additional_tools',
            metadata: {
              role: 'developer',
              ...(own(item, 'type') ? { type: item.type as string } : {}),
              ...(own(item, 'description') ? { description: item.description as string } : {}),
              ...(own(item, 'name') ? { name: item.name as string } : {}),
            },
            tools: tools as NativeToolDescriptor[],
          })
        })
      }
      if (containers.length === 0 || containers.some(container => container.tools.length === 0))
        fail('MISSING_FULL_SCHEMA')
      const callables: CapturedCallable[] = []
      const names = new Set<string>()
      let count = 0
      const visit = (tool: unknown, location: string, prefix: string, depth: number): void => {
        if (depth > NATIVE_DESCRIPTOR_LIMITS.descriptorDepth || ++count > NATIVE_DESCRIPTOR_LIMITS.toolCount)
          fail('LIMIT_EXCEEDED')
        const descriptor = validateDescriptor(tool)
        const type = descriptor.type
        const name =
          type === 'function' && record(descriptor.function)
            ? (descriptor.function.name as string)
            : (descriptor.name as string)
        if (prefix && name.includes('.')) fail('AMBIGUOUS_DESCRIPTOR')
        const fullName = `${prefix}${name}`
        if (type === 'namespace') {
          const children = (own(descriptor, 'tools') ? descriptor.tools : descriptor.functions) as unknown[]
          children.forEach((child, index) =>
            visit(
              child,
              `${location}.${own(descriptor, 'tools') ? 'tools' : 'functions'}[${index}]`,
              `${fullName}.`,
              depth + 1,
            ),
          )
        } else {
          if (names.has(fullName)) fail('AMBIGUOUS_DESCRIPTOR')
          names.add(fullName)
          callables.push({
            name: fullName,
            type: type as 'function' | 'custom',
            location,
            descriptorHash: hashValue(descriptor),
            descriptor,
          })
        }
      }
      for (const container of containers)
        container.tools.forEach((tool, index) => visit(tool, `${container.location}[${index}]`, '', 0))
      if (callables.length === 0) fail('MISSING_FULL_SCHEMA')
      const containerHash = hashValue(containers as unknown as Json)
      const descriptorHash = hashValue(
        callables.map(({ name, type, location, descriptorHash }) => ({ name, type, location, descriptorHash })) as Json,
      )
      const provenance = { ...context, attestation: 'SUPPLIED_NOT_ATTESTED' as const }
      if (
        Buffer.byteLength(
          JSON.stringify({
            provenance,
            containers: containers.map(({ location, kind, metadata }) => ({ location, kind, metadata })),
          }),
        ) > NATIVE_DESCRIPTOR_LIMITS.metadataBytes
      )
        fail('LIMIT_EXCEEDED')
      const output: DescriptorCapture = {
        status: 'CAPTURED',
        fenced: true,
        requestByteHash: hashBytes(body),
        containerHash,
        descriptorHash,
        containers,
        callables,
        provenance,
        runtimeQualification: 'UNQUALIFIED',
      }
      if (Buffer.byteLength(JSON.stringify(output)) > NATIVE_DESCRIPTOR_LIMITS.evidenceBytes) fail('LIMIT_EXCEEDED')
      for (const container of containers) {
        freezeTree(container.tools as Json)
        Object.freeze(container.metadata)
        Object.freeze(container)
      }
      for (const callable of callables) Object.freeze(callable)
      Object.freeze(containers)
      Object.freeze(callables)
      Object.freeze(provenance)
      return Object.freeze(output)
    } catch (error) {
      return {
        status: 'INCOMPLETE',
        fenced: true,
        reason: error instanceof CaptureError ? error.reason : 'INVALID_REQUEST',
      }
    }
  }
}
