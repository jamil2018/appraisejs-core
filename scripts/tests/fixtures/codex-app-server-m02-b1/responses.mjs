import { createHash } from 'node:crypto'
import { ScriptedResponses, manifestFingerprint } from '../codex-app-server-m02/gateway-fixture.mjs'
import { JsonLines, runtimeUnavailable } from './framing.mjs'

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(k => [k, canonical(value[k])]),
    )
  return value
}
const hash = value =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
function completeManifest(body) {
  manifestFingerprint(body)
  return hash({
    ...(Object.hasOwn(body, 'tools') ? { tools: body.tools } : {}),
    additionalTools: (body.input ?? [])
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item?.type === 'additional_tools'),
  })
}

// Offline synthetic wire subset. Native schemas/routing are intentionally NOT qualified.
export class NativeRoutes {
  #expected
  #allowed
  constructor(manifest, scopedNames) {
    this.#expected = { ...manifestFingerprint(manifest), completeHash: completeManifest(manifest) }
    this.#allowed = new Set(scopedNames)
  }
  inspect(manifest, mapping) {
    const actual = manifestFingerprint(manifest)
    if (
      completeManifest(manifest) !== this.#expected.completeHash ||
      actual.descriptorHash !== this.#expected.descriptorHash ||
      !mapping ||
      Object.keys(mapping).sort().join() !== actual.names.join()
    )
      throw new Error('native route drift or incomplete map')
    for (const name of actual.names) {
      if (!this.#allowed.has(mapping[name]) || /(^|\.)(exec|evaluate|spawn|shell|collaboration)(\.|$)/i.test(name))
        throw new Error('prohibited native bridge')
    }
    return {
      descriptorHash: actual.descriptorHash,
      wireRoute: 'UNQUALIFIED',
      containmentQualified: false,
      mappingPreparedOnly: true,
    }
  }
  authorize() {
    runtimeUnavailable()
  }
}

export class OfflineResponses {
  #script
  #journal
  #busy = false
  #fenced = false
  #requests = 0
  #responseBytes = 0
  #manifestHash
  constructor({ script, manifest, maxRequests, journal }) {
    this.#script = new ScriptedResponses(script, manifest, maxRequests)
    this.#journal = journal
    this.#manifestHash = completeManifest(manifest)
  }
  listen() {
    runtimeUnavailable()
  }
  snapshot() {
    return {
      requests: this.#requests,
      fenced: this.#fenced,
      responseBytes: this.#responseBytes,
      runtimeExecutionAllowed: false,
    }
  }
  async exchange({ method, path, headers, body, previousOutput }) {
    if (this.#busy || this.#fenced) {
      this.#fenced = true
      try {
        await this.#journal.markUnknown()
      } catch {
        /* shared run remains fenced */
      }
      throw new Error('provider fenced')
    }
    this.#busy = true
    try {
      if (
        method !== 'POST' ||
        path !== '/v1/responses' ||
        !headers ||
        Object.keys(headers).length !== 1 ||
        Object.entries(headers).some(
          ([key, value]) => key.toLowerCase() !== 'content-type' || value !== 'application/json',
        )
      )
        throw new Error('endpoint/header rejected')
      if (!Buffer.isBuffer(body) || body.length > 65536) throw new Error('request bytes limit')
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.keys(value).some(k => !['model', 'tools', 'input', 'stream', 'store'].includes(k)) ||
        value.model !== 'offline-fixture' ||
        value.stream !== true ||
        value.store !== false
      )
        throw new Error('synthetic request schema')
      if (
        'input' in value &&
        (!Array.isArray(value.input) || value.input.some(i => i?.type !== 'additional_tools' || i.role !== 'developer'))
      )
        throw new Error('unreviewed input schema')
      if (completeManifest(value) !== this.#manifestHash) throw new Error('full container drift')
      await this.#journal.reserve('providerRequests', `provider-${this.#requests + 1}`)
      if (this.#fenced) throw new Error('run fenced during reservation')
      this.#requests++
      const events = this.#script.next({ manifestBody: value, route: 'OFFLINE_SYNTHETIC', previousOutput })
      const data = Buffer.from(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''))
      this.#responseBytes += data.length
      if (data.length > 65536 || this.#responseBytes > 1048576) throw new Error('response stream limit')
      // Acknowledges simulated provider processing, NOT actual socket delivery.
      await this.#journal.acknowledge(`provider-${this.#requests}`)
      if (this.#fenced || this.#journal.snapshot().fenced) throw new Error('run fenced during acknowledgement')
      return data
    } catch {
      this.#fenced = true
      try {
        await this.#journal.markUnknown()
      } catch {
        /* retain uncertainty */
      }
      throw new Error('provider blocked: UNKNOWN; no retries')
    } finally {
      this.#busy = false
    }
  }
}

export class ResponseStream {
  #buffer = Buffer.alloc(0)
  #parser = new JsonLines({ maxFrameBytes: 65536, maxTotalBytes: 1048576, maxFrames: 64 })
  #state = 'new'
  #responseId = null
  #item = null
  #fenced = false
  #total = 0
  #expected
  #index = 0
  constructor({ manifest, expectedEvents }) {
    const names = new Set(manifestFingerprint(manifest).names)
    if (!Array.isArray(expectedEvents) || ![1, 3].includes(expectedEvents.length))
      throw new Error('expected event binding required')
    for (const event of expectedEvents) {
      const items = event.item ? [event.item] : (event.response?.output ?? [])
      for (const item of items)
        if (!names.has(item.name) || /(^|\.)(exec|evaluate|spawn|shell|collaboration)(\.|$)/i.test(item.name))
          throw new Error('unscoped event binding')
    }
    this.#expected = expectedEvents.map(hash)
  }
  feed(chunk) {
    if (this.#fenced) throw new Error('response stream fenced')
    try {
      if (!Buffer.isBuffer(chunk) || (this.#total += chunk.length) > 1048576) throw new Error('stream limit')
      this.#buffer = Buffer.concat([this.#buffer, chunk])
      const events = []
      let end
      while ((end = this.#buffer.indexOf('\n\n')) >= 0) {
        const block = this.#buffer.subarray(0, end)
        if (block.length > 65536 || !block.subarray(0, 6).equals(Buffer.from('data: '))) throw new Error('SSE shape')
        const frames = this.#parser.feed(Buffer.concat([block.subarray(6), Buffer.from('\n')]))
        if (frames.length !== 1) throw new Error('event shape')
        const event = frames[0]
        if (hash(event) !== this.#expected[this.#index++]) throw new Error('event/script drift')
        if (
          event.type === 'response.created' &&
          this.#state === 'new' &&
          /^synthetic-response-\d+$/.test(event.response?.id ?? '') &&
          event.response.status === 'in_progress'
        ) {
          this.#responseId = event.response.id
          this.#state = 'open'
        } else if (
          event.type === 'response.output_item.done' &&
          this.#state === 'open' &&
          event.output_index === 0 &&
          event.item?.type === 'function_call' &&
          /^synthetic-call-\d+$/.test(event.item.call_id ?? '') &&
          event.item.id === event.item.call_id &&
          event.item.status === 'completed' &&
          typeof event.item.name === 'string' &&
          typeof event.item.arguments === 'string'
        ) {
          this.#state = 'item'
          this.#item = structuredClone(event.item)
        } else if (
          event.type === 'response.completed' &&
          event.response?.status === 'completed' &&
          Array.isArray(event.response.output) &&
          ((this.#state === 'new' && event.response.id === 'synthetic-end' && event.response.output.length === 0) ||
            (this.#state === 'item' &&
              event.response.id === this.#responseId &&
              JSON.stringify(event.response.output) === JSON.stringify([this.#item])))
        ) {
          this.#state = 'completed'
        } else throw new Error('event order/correlation/schema')
        events.push(event)
        this.#buffer = this.#buffer.subarray(end + 2)
      }
      if (this.#buffer.length > 65536) throw new Error('partial stream limit')
      return events
    } catch {
      this.#fenced = true
      throw new Error('response stream UNKNOWN')
    }
  }
  eof() {
    this.#fenced = true
    if (this.#buffer.length || this.#state !== 'completed' || this.#index !== this.#expected.length)
      throw new Error('response EOF UNKNOWN')
  }
}
