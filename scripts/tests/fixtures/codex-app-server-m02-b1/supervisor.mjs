import { JsonLines, line, runtimeUnavailable } from './framing.mjs'

// A simulated peer only. write is injected; there is no file descriptor or process factory.
export class OfflineSupervisor {
  #write
  #journal
  #clock
  #pending = null
  #used = new Set()
  #started
  #thread = null
  #turn = null
  #phase = 'new'
  #fenced = false
  #busy = false
  #caseId
  #frames = new JsonLines()
  #lastTime
  constructor({ write, journal, clock, caseId = 'B01' }) {
    if (typeof write !== 'function' || typeof clock !== 'function' || !journal)
      throw new Error('injected dependencies required')
    if (!/^B(0[1-9]|1[0-4])$|^P00$/.test(caseId)) throw new Error('case binding')
    this.#caseId = caseId
    this.#write = write
    this.#journal = journal
    this.#clock = clock
    this.#started = clock()
    this.#lastTime = this.#started
  }
  snapshot() {
    return {
      phase: this.#phase,
      fenced: this.#fenced,
      pending: this.#pending?.id ?? null,
      thread: this.#thread,
      turn: this.#turn,
      runtimeExecutionAllowed: false,
    }
  }
  launch() {
    runtimeUnavailable()
  }
  async #stop() {
    this.#fenced = true
    try {
      await this.#journal.markUnknown()
    } catch {
      /* reservation and uncertainty are retained by journal */
    }
    throw new Error('supervisor fenced: UNKNOWN; never resend')
  }
  async #check() {
    if (this.#journal.snapshot().fenced) this.#fenced = true
    if (this.#fenced) throw new Error('supervisor fenced')
    const now = this.#clock()
    if (!Number.isFinite(now) || now < this.#lastTime || now - this.#started >= 60000) await this.#stop()
    this.#lastTime = now
  }
  async #emit(frame) {
    const bytes = line(frame)
    const written = await this.#write(bytes)
    if (written !== bytes.length) throw new Error('partial write')
  }
  async request(method, params, id) {
    await this.#check()
    if (this.#busy || this.#pending) return this.#stop()
    this.#busy = true
    try {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id) || this.#used.has(id))
        throw new Error('request identity')
      if (method === 'initialize') {
        if (this.#phase !== 'new' || params !== undefined) throw new Error('initialize ordering')
      } else if (method === 'thread/start') {
        if (this.#phase !== 'ready' || params !== undefined) throw new Error('thread ordering')
      } else if (method === 'turn/start') {
        if (
          this.#caseId === 'P00' ||
          this.#phase !== 'thread' ||
          Object.keys(params ?? {}).join() !== 'threadId' ||
          params.threadId !== this.#thread
        )
          throw new Error('turn binding')
      } else throw new Error('unsupported method')
      this.#used.add(id)
      this.#pending = { id, method }
      if (method !== 'initialize')
        await this.#journal.reserve(method === 'thread/start' ? 'threadStarts' : 'turnStarts', id)
      await this.#check()
      await this.#emit({ id, method, ...(params ? { params } : {}) })
      return id
    } catch {
      return this.#stop()
    } finally {
      this.#busy = false
    }
  }
  async feed(bytes) {
    await this.#check()
    if (this.#busy) return this.#stop()
    this.#busy = true
    try {
      for (const frame of this.#frames.feed(bytes)) {
        if ('id' in frame) {
          const pending = this.#pending
          if (!pending || frame.id !== pending.id || 'method' in frame || 'result' in frame === 'error' in frame)
            throw new Error('reply correlation')
          if ('error' in frame) throw new Error('required-MCP or RPC failure')
          const result = frame.result
          if (this.#fenced) throw new Error('run fenced during reply')
          if (pending.method === 'initialize') {
            if (typeof result?.userAgent !== 'string' || result.userAgent.length > 200)
              throw new Error('initialize result')
            await this.#emit({ method: 'initialized' })
            this.#phase = 'ready'
          } else if (pending.method === 'thread/start') {
            if (!/^[A-Za-z0-9_-]{1,80}$/.test(result?.thread?.id ?? '')) throw new Error('thread identity')
            await this.#journal.acknowledge(pending.id)
            this.#thread = result.thread.id
            this.#phase = 'thread'
          } else {
            if (!/^[A-Za-z0-9_-]{1,80}$/.test(result?.turn?.id ?? '')) throw new Error('turn identity')
            await this.#journal.acknowledge(pending.id)
            this.#turn = result.turn.id
            this.#phase = 'turn'
          }
          this.#pending = null
        } else {
          if (
            frame.method !== 'turn/completed' ||
            this.#phase !== 'turn' ||
            frame.params?.threadId !== this.#thread ||
            frame.params?.turn?.id !== this.#turn ||
            frame.params?.turn?.status !== 'completed'
          )
            throw new Error('notification correlation or unexpected request')
          this.#phase = 'terminal'
        }
      }
    } catch {
      return this.#stop()
    } finally {
      this.#busy = false
    }
  }
  async eof() {
    return this.#stop()
  }
  async tick() {
    await this.#check()
  }
}
