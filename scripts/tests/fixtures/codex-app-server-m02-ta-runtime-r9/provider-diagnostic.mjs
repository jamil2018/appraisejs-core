import { createHash } from 'node:crypto'
import { POLICY } from './policy.mjs'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const own = (value, key) => Object.hasOwn(value, key)
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const bad = reason => ({ status: 'REJECTED', reason })

export const PROVIDER_FAILURE_CATEGORIES = Object.freeze([
  'ROUTE_OR_AUTH_HEADER',
  'CONTENT_TYPE_UNSUPPORTED',
  'CONTENT_ENCODING_UNSUPPORTED',
  'BODY_READ_ERROR',
  'BODY_LIMIT_EXCEEDED',
  'UTF8_INVALID',
  'JSON_INVALID',
  'PEER_CORRELATION_MISSING',
  'TUPLE_MISMATCH',
  'COLLECTOR_DENIED',
  'COLLECTOR_INCOMPLETE',
  'DESCRIPTOR_WRITE_FAILED',
  'UNINTERPRETED_WRITE_FAILED',
  'CAPTURE_CONTRACT_INVALID',
])
export const CONTENT_TYPE_CLASSES = Object.freeze(['MISSING', 'JSON', 'JSON_UTF8', 'UNSUPPORTED', 'MALFORMED'])
export const CONTENT_ENCODING_CLASSES = Object.freeze(['ABSENT', 'IDENTITY', 'UNSUPPORTED', 'MALFORMED'])
export const COLLECTOR_REASONS = Object.freeze([
  'ALREADY_ATTEMPTED',
  'INVALID_CONTEXT',
  'INVALID_REQUEST',
  'INVALID_JSON',
  'UNSUPPORTED_DESCRIPTOR',
  'AMBIGUOUS_DESCRIPTOR',
  'MISSING_FULL_SCHEMA',
  'LIMIT_EXCEEDED',
])
export const UNINTERPRETED_OUTCOMES = Object.freeze([
  'RECORDED',
  'NO_RECOGNIZED_CONTAINER',
  'INVALID_UTF8_OR_JSON',
  'DUPLICATE_OR_DEEP_JSON',
  'INVALID_CONTAINER',
  'INVALID_DESCRIPTOR',
  'SENSITIVE_METADATA',
  'LIMIT_EXCEEDED',
  'COLLECTOR_REASON_INELIGIBLE',
  'WRITE_FAILED',
])

/** Return finite classes only. Never expose header names or values in the receipt. */
export function classifyProviderHeaders(headers) {
  const media = headers?.['content-type']
  const encoding = headers?.['content-encoding']
  let contentTypeClass = 'MISSING'
  if (media !== undefined) {
    if (typeof media !== 'string' || media.length > 200) contentTypeClass = 'MALFORMED'
    else {
      const normalized = media.trim().toLowerCase()
      contentTypeClass = /^application\s*\/\s*json$/.test(normalized)
        ? 'JSON'
        : /^application\s*\/\s*json\s*;\s*charset\s*=\s*utf-8$/.test(normalized)
          ? 'JSON_UTF8'
          : 'UNSUPPORTED'
    }
  }
  let contentEncodingClass = 'ABSENT'
  if (encoding !== undefined) {
    if (typeof encoding !== 'string' || encoding.length > 200) contentEncodingClass = 'MALFORMED'
    else contentEncodingClass = encoding.trim().toLowerCase() === 'identity' ? 'IDENTITY' : 'UNSUPPORTED'
  }
  return Object.freeze({
    contentTypeClass,
    contentEncodingClass,
    accepted: ['JSON', 'JSON_UTF8'].includes(contentTypeClass) && ['ABSENT', 'IDENTITY'].includes(contentEncodingClass),
  })
}

/** The five booleans are the entire diagnostic tuple; observed values and hashes are discarded. */
export function inspectObservedTuple(body) {
  const modelPresent = object(body) && own(body, 'model')
  const reasoningObject = object(body?.reasoning)
  const effortPresent = reasoningObject && own(body.reasoning, 'effort')
  const result = Object.freeze({
    modelPresent,
    modelMatches: modelPresent && body.model === POLICY.model,
    reasoningObject,
    effortPresent,
    effortMatches: effortPresent && body.reasoning.effort === POLICY.reasoning,
  })
  return Object.freeze({ ...result, accepted: result.modelMatches && result.effortMatches })
}

function inspectJsonLexically(source) {
  let at = 0
  const white = () => {
    while (at < source.length && /\s/.test(source[at])) at++
  }
  const string = () => {
    const start = at++
    while (at < source.length) {
      if (source[at] === '\\') at += 2
      else if (source[at++] === '"') return JSON.parse(source.slice(start, at))
    }
    throw new Error('invalid string')
  }
  const value = depth => {
    if (depth > 32) throw new Error('depth')
    white()
    if (source[at] === '{') {
      at++
      const keys = new Set()
      white()
      if (source[at] === '}') {
        at++
        return
      }
      while (at < source.length) {
        white()
        if (source[at] !== '"') throw new Error('object key')
        const key = string()
        if (keys.has(key)) throw new Error('duplicate')
        keys.add(key)
        white()
        if (source[at++] !== ':') throw new Error('colon')
        value(depth + 1)
        white()
        const next = source[at++]
        if (next === '}') return
        if (next !== ',') throw new Error('comma')
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
        if (next !== ',') throw new Error('comma')
      }
    } else if (source[at] === '"') {
      string()
      return
    } else {
      const start = at
      while (at < source.length && !/[\s,\]}]/.test(source[at])) at++
      if (at === start) throw new Error('scalar')
      return
    }
    throw new Error('unterminated')
  }
  value(0)
  white()
  if (at !== source.length) throw new Error('trailing')
}

const sensitive =
  /(?:prompt|instruction|message|content|auth|credential|token|secret|password|api[_-]?key|cookie|bearer|oauth|private[_-]?key)/i
const prototype = new Set(['__proto__', 'constructor', 'prototype'])
function inspectTree(value, inParameters = false, depth = 0, parentKey = null) {
  if (depth > 32) return 'LIMIT_EXCEEDED'
  if (Array.isArray(value)) {
    for (const child of value) {
      const problem = inspectTree(child, inParameters, depth + 1, parentKey)
      if (problem) return problem
    }
    return null
  }
  if (!object(value)) return typeof value === 'number' && !Number.isFinite(value) ? 'INVALID_DESCRIPTOR' : null
  for (const [key, child] of Object.entries(value)) {
    if (prototype.has(key)) return 'INVALID_DESCRIPTOR'
    if (!inParameters && sensitive.test(key)) return 'SENSITIVE_METADATA'
    if (depth === 0 && value.type === 'namespace' && ['tools', 'functions'].includes(key)) continue
    const schema = inParameters || (key === 'parameters' && (depth === 0 || (depth === 1 && parentKey === 'function')))
    const problem = inspectTree(child, schema, depth + 1, key)
    if (problem) return problem
  }
  return null
}

/** Diagnostic evidence only: no routing or normal CAPTURED promotion. */
export function extractUninterpretedDescriptorArrays({ requestBytes, collector, provenance }) {
  if (
    collector?.status !== 'INCOMPLETE' ||
    !['MISSING_FULL_SCHEMA', 'UNSUPPORTED_DESCRIPTOR', 'AMBIGUOUS_DESCRIPTOR'].includes(collector.reason)
  )
    return bad('COLLECTOR_REASON_INELIGIBLE')
  if (!Buffer.isBuffer(requestBytes) || requestBytes.length < 1 || requestBytes.length > 1024 * 1024)
    return bad('LIMIT_EXCEEDED')
  let source, body
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(requestBytes)
    body = JSON.parse(source)
  } catch {
    return bad('INVALID_UTF8_OR_JSON')
  }
  try {
    inspectJsonLexically(source)
  } catch {
    return bad('DUPLICATE_OR_DEEP_JSON')
  }
  if (!object(body) || !inspectObservedTuple(body).accepted) return bad('INVALID_CONTAINER')
  const containers = []
  if (own(body, 'tools')) {
    if (!Array.isArray(body.tools) || body.tools.length === 0) return bad('INVALID_CONTAINER')
    containers.push({ location: 'tools', kind: 'tools', tools: body.tools })
  }
  if (own(body, 'input')) {
    if (!Array.isArray(body.input)) return bad('INVALID_CONTAINER')
    for (const [index, item] of body.input.entries()) {
      if (!object(item)) continue
      const typed = item.type === 'additional_tools'
      const inline = own(item, 'additional_tools')
      if (!typed && !inline) continue
      if (typed === inline || item.role !== 'developer') return bad('INVALID_CONTAINER')
      const allowed = typed
        ? ['role', 'type', 'description', 'name', 'tools', 'id']
        : ['role', 'type', 'description', 'name', 'additional_tools']
      if (Object.keys(item).some(key => !allowed.includes(key))) return bad('INVALID_CONTAINER')
      if (
        typed &&
        own(item, 'id') &&
        (typeof item.id !== 'string' ||
          !/^at_[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item.id))
      )
        return bad('INVALID_CONTAINER')
      const tools = typed ? item.tools : item.additional_tools
      if (!Array.isArray(tools) || tools.length === 0) return bad('INVALID_CONTAINER')
      containers.push({
        location: `input[${index}].additional_tools`,
        kind: 'additional_tools',
        ...(typed && own(item, 'id') ? { metadata: { id: item.id } } : {}),
        tools,
      })
    }
  }
  if (!containers.length) return bad('NO_RECOGNIZED_CONTAINER')
  let count = 0
  const visit = (tool, depth) => {
    if (++count > 256 || depth > 24) return 'LIMIT_EXCEEDED'
    if (!object(tool) || typeof tool.type !== 'string' || tool.type.length < 1 || tool.type.length > 100)
      return 'INVALID_DESCRIPTOR'
    const named = object(tool.function) ? tool.function : tool
    if (typeof named.name !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(named.name)) return 'INVALID_DESCRIPTOR'
    const problem = inspectTree(tool)
    if (problem) return problem
    if (tool.type === 'namespace') {
      const children = own(tool, 'tools') ? tool.tools : tool.functions
      if (!Array.isArray(children) || children.length === 0) return 'INVALID_DESCRIPTOR'
      for (const child of children) {
        const nested = visit(child, depth + 1)
        if (nested) return nested
      }
    }
    return null
  }
  for (const container of containers)
    for (const tool of container.tools) {
      const problem = visit(tool, 0)
      if (problem) return bad(problem)
    }
  const evidence = {
    schema: 'appraise.m02-ta-r9-uninterpreted-descriptors/v1',
    status: 'UNINTERPRETED',
    completeness: 'INCOMPLETE',
    routing: 'NOT_ROUTABLE',
    collectorReason: collector.reason,
    provenance,
    containerCount: containers.length,
    descriptorCount: count,
    containers,
    descriptorArraysSha256: hash(JSON.stringify(containers)),
  }
  if (Buffer.byteLength(JSON.stringify(evidence)) > 1024 * 1024) return bad('LIMIT_EXCEEDED')
  return Object.freeze({ status: 'UNINTERPRETED', evidence })
}
