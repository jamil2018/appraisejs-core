import { createHash } from 'node:crypto'
import { casePolicy, canonical } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'

const sha = value => createHash('sha256').update(value).digest('hex')
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const MAX_ARGUMENT_BYTES = 16 * 1024
const MAX_RESULT_BYTES = 32 * 1024
const SETUP_METHODS = new Set(['initialize', 'notifications/initialized', 'tools/list', 'ping'])
const copyBounded = (value, maximum) => {
  const body = canonical(value)
  if (Buffer.byteLength(body) > maximum) throw new Error('audit value ceiling exceeded')
  return { value: JSON.parse(body), sha256: sha(body), bytes: Buffer.byteLength(body) }
}
const strict = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|')

// This facade observes an already scoped MCP transport. It owns no network,
// process, authority negotiation or capability/config capture.
export class ScopedTransportAudit {
  constructor({ caseId, expectedCalls, journal }) {
    const policy = casePolicy(caseId)
    if (policy.phase !== 'T2' && policy.phase !== 'T3') throw new Error('phase case required')
    if (
      !Array.isArray(expectedCalls) ||
      expectedCalls.length > policy.limits.scopedCalls ||
      !journal ||
      typeof journal.reserve !== 'function' ||
      typeof journal.acknowledge !== 'function'
    )
      throw new Error('reviewed audit plan and journal required')
    const ids = new Set()
    for (const call of expectedCalls) {
      if (
        !strict(call, ['callId', 'name', 'argumentsSha256']) ||
        !ID.test(call.callId) ||
        !ID.test(call.name) ||
        !/^[a-f0-9]{64}$/.test(call.argumentsSha256) ||
        ids.has(call.callId)
      )
        throw new Error('invalid audit plan')
      ids.add(call.callId)
    }
    this.caseId = caseId
    this.expectedCalls = structuredClone(expectedCalls)
    this.journal = journal
    this.calls = []
    this.pending = new Map()
    this.rpcIds = new Set()
    this.passthroughIds = new Set()
    this.fenced = false
    this.logicalAttempts = 0
    this.noDispatch = null
  }
  _unknown(reason = 'PROTOCOL') {
    this.fenced = true
    try {
      this.journal.markUnknown(reason)
    } catch {
      /* local fence still prevents resend */
    }
    throw new Error(`scoped transport UNKNOWN: ${reason}`)
  }
  _send(message) {
    if (this.fenced) throw new Error('audit fenced')
    if (!message || typeof message !== 'object' || Array.isArray(message)) this._unknown()
    if (message.method !== 'tools/call') {
      if (!SETUP_METHODS.has(message.method)) this._unknown()
      if (message.id !== undefined && typeof message.method === 'string') {
        if (
          (typeof message.id !== 'string' && typeof message.id !== 'number') ||
          this.rpcIds.has(message.id) ||
          this.passthroughIds.has(message.id)
        )
          this._unknown()
        this.passthroughIds.add(message.id)
      }
      return
    }
    const plan = this.expectedCalls[this.calls.length]
    if (
      !plan ||
      !strict(message.params, ['name', 'arguments']) ||
      !(
        (typeof message.id === 'string' && ID.test(message.id)) ||
        (Number.isSafeInteger(message.id) && message.id >= 0)
      ) ||
      this.rpcIds.has(message.id) ||
      message.params.name !== plan.name ||
      this.pending.size
    )
      this._unknown()
    let args
    try {
      args = copyBounded(message.params.arguments, MAX_ARGUMENT_BYTES)
    } catch {
      this._unknown('BUDGET')
    }
    if (args.sha256 !== plan.argumentsSha256) this._unknown()
    this.rpcIds.add(message.id)
    const entry = {
      callId: plan.callId,
      rpcId: message.id,
      name: plan.name,
      arguments: args.value,
      argumentsSha256: args.sha256,
      argumentsBytes: args.bytes,
      result: null,
      resultSha256: null,
      resultBytes: null,
    }
    try {
      this.journal.reserve('scopedCalls', plan.callId)
    } catch {
      this._unknown('BUDGET')
    }
    this.pending.set(message.id, entry)
    this.calls.push(entry)
    this.logicalAttempts++
  }
  _receive(message) {
    if (this.fenced) throw new Error('audit fenced')
    if (!message || typeof message !== 'object' || Array.isArray(message)) this._unknown()
    if (message.id === undefined) {
      if (message.method !== undefined) this._unknown()
      return
    }
    if (this.passthroughIds.has(message.id)) {
      this.passthroughIds.delete(message.id)
      return
    }
    const entry = this.pending.get(message.id)
    if (
      !entry ||
      Object.hasOwn(message, 'error') ||
      !Object.hasOwn(message, 'result') ||
      Object.hasOwn(message, 'method')
    )
      this._unknown()
    let result
    try {
      result = copyBounded(message.result, MAX_RESULT_BYTES)
    } catch {
      this._unknown('BUDGET')
    }
    entry.result = result.value
    entry.resultSha256 = result.sha256
    entry.resultBytes = result.bytes
    try {
      this.journal.acknowledge(entry.callId)
    } catch {
      this._unknown('ACK_LOST')
    }
    this.pending.delete(message.id)
  }
  observeRequest(message) {
    return this._send(message)
  }
  observeResponse(message) {
    return this._receive(message)
  }
  wrap(transport) {
    if (
      !transport ||
      typeof transport.send !== 'function' ||
      typeof transport.start !== 'function' ||
      typeof transport.close !== 'function'
    )
      throw new Error('transport interface incomplete')
    let receiver = null
    const facade = {
      start: async () => {
        if (this.fenced) throw new Error('audit fenced')
        return transport.start()
      },
      send: async message => {
        this._send(message)
        try {
          return await transport.send(message)
        } catch {
          this._unknown('ACK_LOST')
        }
      },
      close: async () => transport.close(),
      set onmessage(handler) {
        receiver = handler
      },
      get onmessage() {
        return receiver
      },
    }
    transport.onmessage = message => {
      this._receive(message)
      if (receiver) receiver(message)
    }
    return facade
  }
  recordNoDispatch({ operationName, registryVersion }) {
    const item = casePolicy(this.caseId)
    if (
      this.fenced ||
      item.script?.kind !== 'unregistered-analyzer-operation' ||
      this.logicalAttempts ||
      this.calls.length ||
      this.pending.size ||
      this.noDispatch ||
      !ID.test(operationName) ||
      item.script.operations[0]?.toolName !== operationName ||
      typeof registryVersion !== 'string' ||
      !ID.test(registryVersion)
    )
      this._unknown()
    this.logicalAttempts = 1
    this.noDispatch = {
      class: 'NO_MCP_DISPATCH',
      logicalAttempts: 1,
      scopedDispatchCount: 0,
      operationName,
      registryVersion,
    }
    return structuredClone(this.noDispatch)
  }
  finish() {
    if (
      this.fenced ||
      this.pending.size ||
      this.passthroughIds.size ||
      this.calls.length !== this.expectedCalls.length ||
      (casePolicy(this.caseId).script?.kind === 'unregistered-analyzer-operation' && !this.noDispatch) ||
      (this.noDispatch && this.calls.length)
    )
      this._unknown('ACK_LOST')
    return this.snapshot()
  }
  snapshot() {
    return structuredClone({
      caseId: this.caseId,
      calls: this.calls,
      logicalAttempts: this.logicalAttempts,
      scopedDispatchCount: this.calls.length,
      pending: this.pending.size,
      noDispatch: this.noDispatch,
      fenced: this.fenced,
    })
  }
}
