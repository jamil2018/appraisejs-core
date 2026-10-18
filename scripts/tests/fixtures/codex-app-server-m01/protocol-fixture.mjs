// Disposable qualification client. Not wired into Appraise or a lifecycle authority.
export class ProtocolFixture {
  constructor(write, { timeoutMs = 1000, allowTurnStart = false, maxBytes = 262144 } = {}) {
    this.write = write
    this.timeoutMs = timeoutMs
    this.allowTurnStart = allowTurnStart
    this.maxBytes = maxBytes
    this.pending = new Map()
    this.nextId = 1
    this.buffer = ''
    this.initialized = false
    this.blocker = null
    this.unknownStart = false
    this.threadId = null
    this.turnId = null
    this.events = []
  }

  request(method, params = {}) {
    const denied = this.requestDenial(method)
    if (denied) return Promise.reject(new Error(denied))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.failPending(id, 'ack timeout'), this.timeoutMs)
      this.pending.set(id, { method, params, resolve, reject, timer })
      try {
        this.write({ id, method, params })
      } catch {
        this.failPending(id, 'write outcome unknown')
      }
    })
  }

  requestDenial(method) {
    if (this.blocker || this.unknownStart) return 'fixture blocked; reconcile, never resend'
    if (this.beforeInitialization(method)) return 'initialize first'
    return this.turnStartDenial(method)
  }

  beforeInitialization(method) {
    return method !== 'initialize' && !this.initialized
  }

  turnStartDenial(method) {
    return method === 'turn/start' && !this.allowTurnStart ? 'no-model guard' : null
  }

  failPending(id, reason) {
    const p = this.pending.get(id)
    if (!p) return
    clearTimeout(p.timer)
    this.pending.delete(id)
    if (p.method === 'thread/start' || p.method === 'turn/start') this.unknownStart = true
    this.blocker = reason
    p.reject(new Error(reason))
  }

  close() {
    this.blocker = 'transport closed'
    for (const id of this.pending.keys()) this.failPending(id, 'transport closed')
  }

  feed(chunk) {
    this.buffer += chunk
    if (Buffer.byteLength(this.buffer) > this.maxBytes) return this.close()
    let end
    while ((end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end + 1)
      this.decode(line)
    }
  }

  decode(line) {
    if (!line.trim()) return
    try {
      this.receive(JSON.parse(line))
    } catch {
      this.close()
    }
  }

  receive(frame) {
    if (!isRecord(frame)) return this.close()
    if (isServerRequest(frame)) return this.denyRequest(frame.id)
    if (this.blocker) return
    this.routeFrame(frame)
  }

  routeFrame(frame) {
    if (frame.id !== undefined) this.reply(frame)
    else this.notification(frame)
  }

  denyRequest(id) {
    this.write({ id, error: { code: -32601, message: 'unsupported qualification request' } })
    this.close()
  }

  reply(frame) {
    const p = this.pending.get(frame.id)
    if (!p) return
    if ((frame.error !== undefined) === (frame.result !== undefined))
      return this.failPending(frame.id, 'malformed reply')
    if (frame.error) return this.rejectReply(frame, p)
    this.resolveReply(frame, p)
  }

  rejectReply(frame, p) {
    clearTimeout(p.timer)
    this.pending.delete(frame.id)
    this.blocker = 'rpc rejected'
    p.reject(Object.assign(new Error('rpc rejected'), { rpcError: frame.error }))
  }

  resolveReply(frame, p) {
    if (!isRecord(frame.result)) return this.failPending(frame.id, 'malformed result')
    const error = this.resultError(p, frame.result)
    if (error) return this.failPending(frame.id, error)
    clearTimeout(p.timer)
    this.pending.delete(frame.id)
    p.resolve(frame.result)
  }

  resultError(p, result) {
    const handler = {
      initialize: () => this.initializeResult(result),
      'thread/start': () => this.threadResult(p, result),
      'thread/resume': () => this.threadResult(p, result),
      'turn/start': () => this.turnResult(result),
    }[p.method]
    return handler ? handler() : null
  }

  initializeResult(result) {
    if (typeof result.userAgent !== 'string') return 'missing handshake identity'
    this.initialized = true
    this.write({ method: 'initialized', params: {} })
    return null
  }

  threadResult(p, result) {
    if (!result.thread?.id) return 'missing or mismatched thread'
    return this.captureThread(p, result.thread.id)
  }

  captureThread(p, id) {
    if (p.method === 'thread/resume' && id !== p.params.threadId) return 'missing or mismatched thread'
    this.threadId = id
    return null
  }

  turnResult(result) {
    if (!result.turn?.id) return 'missing turn'
    this.turnId = result.turn.id
    return null
  }

  notification(frame) {
    const p = frame.params
    if (!p || p.threadId !== this.threadId) return
    this.turnNotification(frame.method, p)
  }

  turnNotification(method, p) {
    if (!this.turnId) return
    const turnId = notificationTurnId(p)
    if (turnId !== this.turnId) return
    this.captureEvent(method, p, turnId)
  }

  captureEvent(method, p, turnId) {
    if (!['turn/started', 'turn/completed', 'item/agentMessage/delta'].includes(method)) return
    this.appendEvent({ method, threadId: p.threadId, turnId, status: p.turn?.status ?? null })
  }

  appendEvent(event) {
    if (!this.events.some(e => JSON.stringify(e) === JSON.stringify(event))) this.events.push(event)
  }
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}
function isServerRequest(frame) {
  return typeof frame.method === 'string' && frame.id !== undefined
}

function notificationTurnId(p) {
  return p.turnId ?? p.turn?.id
}
