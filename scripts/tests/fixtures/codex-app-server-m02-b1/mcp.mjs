import { createGatewayFixture } from '../codex-app-server-m02/gateway-fixture.mjs'
import { JsonLines, line, runtimeUnavailable } from './framing.mjs'

// In-memory wire adapter around the accepted synthetic gateway. No stdin/server child.
export class OfflineMcp {
  #fixture
  #journal
  #phase = 'new'
  #used = new Set()
  #busy = false
  #fenced = false
  #frames = new JsonLines()
  constructor({ caseId, role, assignmentId = 'assignment-1', journal }) {
    const roles = [
      'REQUIREMENT_ANALYZER',
      'SCOUT',
      'RESOURCE_EXPLORER',
      'TEST_SCENARIO_DESIGNER',
      'AUTOMATOR',
      'TRIAGER',
    ]
    const expected = /^B0[1-6]$/.test(caseId) ? roles[Number(caseId.slice(1)) - 1] : 'REQUIREMENT_ANALYZER'
    if (!/^B(0[1-9]|1[0-4])$|^P00$/.test(caseId) || expected !== role || assignmentId !== 'assignment-1')
      throw new Error('immutable synthetic binding')
    if (!journal || typeof journal.markUnknown !== 'function' || typeof journal.snapshot !== 'function')
      throw new Error('shared journal required')
    this.#journal = journal
    this.#fixture = createGatewayFixture(role)
    this.binding = Object.freeze({ caseId, role, assignmentId })
    Object.defineProperty(this, 'binding', { writable: false })
  }
  launch() {
    runtimeUnavailable()
  }
  manifest() {
    return structuredClone(this.#fixture.profile.tools.map(t => ({ name: t.name, inputSchema: t.inputSchema })))
  }
  script() {
    return structuredClone(this.#fixture.logicalScript)
  }
  snapshot() {
    return { ...this.#fixture.snapshot(), fenced: this.#fenced, phase: this.#phase }
  }
  async feed(bytes) {
    if (this.#journal.snapshot().fenced) this.#fenced = true
    if (this.#fenced || this.#busy) {
      this.#fenced = true
      try {
        await this.#journal.markUnknown()
      } catch {
        /* shared run already fenced */
      }
      throw new Error('MCP fenced')
    }
    this.#busy = true
    try {
      const replies = []
      for (const frame of this.#frames.feed(bytes)) {
        if (this.#journal.snapshot().fenced) throw new Error('shared run fenced')
        if (
          frame.jsonrpc !== '2.0' ||
          typeof frame.method !== 'string' ||
          Object.keys(frame).some(k => !['jsonrpc', 'id', 'method', 'params'].includes(k))
        )
          throw new Error('MCP envelope')
        if (frame.method === 'notifications/initialized') {
          if (this.#phase !== 'initializing' || 'id' in frame || 'params' in frame)
            throw new Error('MCP initialization')
          this.#phase = 'ready'
          continue
        }
        if (
          (!Number.isSafeInteger(frame.id) || frame.id < 0) &&
          (typeof frame.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(frame.id))
        )
          throw new Error('MCP id')
        if (this.#used.has(frame.id) || this.#used.size >= 64) throw new Error('MCP duplicate or limit')
        this.#used.add(frame.id)
        if (frame.method === 'initialize') {
          if (this.#phase !== 'new' || 'params' in frame) throw new Error('MCP initialization')
          this.#phase = 'initializing'
        } else if (this.#phase !== 'ready') throw new Error('MCP not ready')
        if (!['initialize', 'tools/list', 'tools/call'].includes(frame.method)) {
          replies.push(
            line({ jsonrpc: '2.0', id: frame.id, error: { code: -32601, message: 'unregistered offline method' } }),
          )
          this.#fenced = true
          await this.#journal.markUnknown()
          break
        }
        if (frame.method === 'tools/call') {
          if (
            !frame.params ||
            Object.keys(frame.params).sort().join() !== 'arguments,name' ||
            typeof frame.params.name !== 'string' ||
            !frame.params.arguments ||
            typeof frame.params.arguments !== 'object' ||
            Array.isArray(frame.params.arguments)
          )
            throw new Error('MCP call shape')
        } else if ('params' in frame) throw new Error('unexpected params')
        const reply = await this.#fixture.mcpFrame(frame)
        if (this.#fenced || this.#journal.snapshot().fenced) throw new Error('run fenced during handler')
        if (reply.id !== frame.id || reply.jsonrpc !== '2.0' || 'result' in reply === 'error' in reply)
          throw new Error('MCP response envelope')
        replies.push(line(reply))
        if ('error' in reply || reply.result?.isError === true) {
          this.#fenced = true
          await this.#journal.markUnknown()
          break
        }
      }
      return Buffer.concat(replies)
    } catch {
      this.#fenced = true
      try {
        await this.#journal.markUnknown()
      } catch {
        /* shared run remains fenced */
      }
      throw new Error('MCP adapter blocked; no fallback')
    } finally {
      this.#busy = false
    }
  }
  async eof() {
    this.#fenced = true
    await this.#journal.markUnknown()
    this.#frames.eof()
  }
}

export class EmptyDenial {
  #used = false
  #caseId
  #binding
  constructor(caseId, binding) {
    this.#caseId = caseId
    this.#binding = Object.freeze({ ...binding })
  }
  reply(frame) {
    if (this.#used) throw new Error('denial already fenced')
    this.#used = true
    if (!frame || typeof frame.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(frame.id)) throw new Error('denial id')
    if (
      this.#caseId === 'B14' &&
      frame.method === 'item/permissions/requestApproval' &&
      Object.keys(this.#binding).sort().join() === 'itemId,threadId,turnId' &&
      Object.entries(this.#binding).every(
        ([key, value]) =>
          typeof value === 'string' && value.length <= 80 && value.length > 0 && frame.params?.[key] === value,
      )
    )
      return { id: frame.id, result: { permissions: {}, scope: 'turn' } }
    return { id: frame.id, error: { code: -32601, message: 'unsupported request' } }
  }
}
