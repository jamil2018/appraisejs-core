import type { Readable, Writable } from 'node:stream'
import { TextDecoder } from 'node:util'

export type RpcRequestMethod = 'initialize' | 'thread/start' | 'thread/resume' | 'turn/start' | 'turn/interrupt'
export type RpcTransportOptions = {
  onNotification: (method: string, params: Record<string, unknown>) => void
  onFault: (reason: string) => void
  requestTimeoutMs?: number
  maxFrameBytes?: number
}

export type RpcSenderManifest = Readonly<{
  sealId: string
  transportId: string
  transportIncarnation: string
  issuedRequests: number
  attemptedBytes: number
  allocations: readonly Readonly<{ id: number; state: 'ATTEMPTED' | 'NOT_EMITTED' }>[]
  attempts: readonly Readonly<{ requestId: number | null; start: number; end: number; rawDigest: string }>[]
}>

class RpcTransportError extends Error {
  constructor(readonly reason: string) {
    super(`Private RPC transport: ${reason}`)
    this.name = 'RpcTransportError'
  }
}

type Pending = {
  id: number
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  removeAbort: () => void
}
const METHODS = new Set<string>(['initialize', 'thread/start', 'thread/resume', 'turn/start', 'turn/interrupt'])
const MAX_FRAME_BYTES = 256 * 1024
const MAX_PROTOCOL_BYTES = 8 * 1024 * 1024
const MAX_STDERR_BYTES = 256 * 1024
const MAX_WRITE_BYTES = 2 * 1024 * 1024
const MAX_TIMEOUT_MS = 60_000

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function deadline(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS)
    throw new RpcTransportError('invalid_deadline')
  return value
}

function replyFault(message: Record<string, unknown>): string | undefined {
  const hasResult = Object.hasOwn(message, 'result')
  const hasError = Object.hasOwn(message, 'error')
  if (hasResult === hasError) return 'invalid_reply'
  if (
    hasError &&
    (!record(message.error) || !Number.isSafeInteger(message.error.code) || typeof message.error.message !== 'string')
  )
    return 'invalid_rpc_error'
  if (hasResult && !record(message.result)) return 'invalid_rpc_result'
}

/** Owns bounded, private JSONL streams. No queue, raw stream, payload log or provider approval surface. */
export class RpcTransport {
  #stdin: Writable
  #stdout: Readable
  #stderr: Readable
  #options: RpcTransportOptions
  #maxFrameBytes: number
  #timeoutMs: number
  #open = true
  #reason: string | null = null
  #pending?: Pending
  #writing = false
  #cancelWrite?: (reason: string) => void
  #frame = Buffer.alloc(0)
  #receivedBytes = 0
  #stderrBytes = 0
  #writtenBytes = 0
  #frames = 0
  #requestId = 0
  #decoder = new TextDecoder('utf-8', { fatal: true })

  constructor(streams: { stdin: Writable; stdout: Readable; stderr: Readable }, options: RpcTransportOptions) {
    this.#stdin = streams.stdin
    this.#stdout = streams.stdout
    this.#stderr = streams.stderr
    this.#options = options
    this.#timeoutMs = deadline(options.requestTimeoutMs ?? 5_000)
    this.#maxFrameBytes = options.maxFrameBytes ?? MAX_FRAME_BYTES
    if (!Number.isSafeInteger(this.#maxFrameBytes) || this.#maxFrameBytes < 1 || this.#maxFrameBytes > MAX_FRAME_BYTES)
      throw new RpcTransportError('invalid_frame_limit')
    this.#stdin.on('error', () => this.#fault('stdin_error'))
    this.#stdin.on('close', () => this.#fault('stdin_closed'))
    this.#stdout.on('error', () => this.#fault('stdout_error'))
    this.#stderr.on('error', () => this.#fault('stderr_error'))
    this.#stdout.on('end', () => this.#fault(this.#frame.length ? 'partial_frame_eof' : 'stdout_eof'))
    this.#stdout.on('close', () => this.#fault(this.#frame.length ? 'partial_frame_eof' : 'stdout_closed'))
    this.#stderr.on('end', () => this.#fault('stderr_eof'))
    this.#stderr.on('close', () => this.#fault('stderr_closed'))
    this.#stdout.on('data', (chunk: unknown) => this.#consume(chunk))
    this.#stderr.on('data', (chunk: unknown) => {
      if (!this.#open) return
      if (!Buffer.isBuffer(chunk)) return this.#fault('non_binary_stderr')
      this.#stderrBytes += chunk.length
      if (this.#stderrBytes > MAX_STDERR_BYTES) this.#fault('stderr_limit')
    })
    this.#stdout.resume()
    this.#stderr.resume()
  }

  request(
    method: RpcRequestMethod,
    params: Record<string, unknown>,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    let prepared: { id: number; duration: number; frame: Buffer }
    try {
      prepared = this.#prepareRequest(method, params, timeoutMs, signal)
    } catch (error) {
      return Promise.reject(error)
    }
    const { id, duration, frame } = prepared
    let removeAbort = () => {}
    const response = new Promise<unknown>((resolve, reject) => {
      const onAbort = () => this.#fault('request_aborted')
      removeAbort = () => signal?.removeEventListener('abort', onAbort)
      this.#pending = {
        id,
        resolve,
        reject,
        timer: setTimeout(() => this.#fault('request_timeout'), duration),
        removeAbort,
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
    // The only write starts synchronously here. Drain continuations never resend bytes.
    const write = this.#write(frame, duration)
    return Promise.all([response, write])
      .then(([value]) => value)
      .finally(removeAbort)
  }

  #requestStateError(): RpcTransportError | undefined {
    if (!this.#open) return new RpcTransportError('fenced')
    if (this.#pending || this.#writing) return new RpcTransportError('pending_limit')
  }

  #prepareRequest(method: RpcRequestMethod, params: Record<string, unknown>, timeoutMs?: number, signal?: AbortSignal) {
    const stateError = this.#requestStateError()
    if (stateError) throw stateError
    if (!METHODS.has(method) || !record(params)) throw new RpcTransportError('invalid_request')
    if (signal?.aborted) throw new RpcTransportError('request_aborted')
    const id = ++this.#requestId
    let duration: number
    let frame: Buffer
    try {
      duration = deadline(timeoutMs ?? this.#timeoutMs)
      frame = this.#encode({ id, method, params })
    } catch {
      throw new RpcTransportError('invalid_request')
    }
    // Serialization can invoke caller-owned toJSON hooks. Recheck the gate afterward.
    const changedState = this.#requestStateError()
    if (changedState) throw changedState
    return { id, duration, frame }
  }

  notifyInitialized(): Promise<void> {
    if (!this.#open) return Promise.reject(new RpcTransportError('fenced'))
    if (this.#pending || this.#writing) return Promise.reject(new RpcTransportError('pending_limit'))
    return this.#write(this.#encode({ method: 'initialized' }), this.#timeoutMs)
  }

  fence(reason: string): void {
    if (!this.#open) return
    this.#open = false
    // Reasons are locally selected codes; never retain arbitrary provider/caller text.
    this.#reason = /^[a-z][a-z0-9_]{0,63}$/.test(reason) ? reason : 'fenced'
    this.#stdin.destroy()
    this.#cancelWrite?.(this.#reason)
    if (this.#pending) {
      const pending = this.#pending
      this.#pending = undefined
      clearTimeout(pending.timer)
      pending.removeAbort()
      pending.reject(new RpcTransportError(this.#reason))
    }
    this.#frame = Buffer.alloc(0)
    this.#stdout.destroy()
    this.#stderr.destroy()
  }

  snapshot() {
    return {
      status: this.#open ? ('open' as const) : ('fenced' as const),
      reason: this.#reason,
      pendingRequests: this.#pending ? 1 : 0,
      writing: this.#writing,
      receivedBytes: this.#receivedBytes,
      discardedStderrBytes: this.#stderrBytes,
      writtenBytes: this.#writtenBytes,
      receivedFrames: this.#frames,
      issuedRequests: this.#requestId,
    }
  }

  #fault(reason: string): void {
    if (!this.#open) return
    this.fence(reason)
    try {
      this.#options.onFault(reason)
    } catch {
      /* A consumer cannot reopen transport or escape stream handlers. */
    }
  }

  #encode(value: Record<string, unknown>): Buffer {
    const frame = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8')
    if (frame.length - 1 > this.#maxFrameBytes) throw new RpcTransportError('outbound_frame_limit')
    return frame
  }

  #write(frame: Buffer, duration: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.#open || this.#writing) return reject(new RpcTransportError('fenced_or_busy'))
      if (this.#writtenBytes + frame.length > MAX_WRITE_BYTES) {
        this.#fault('write_limit')
        return reject(new RpcTransportError('write_limit'))
      }
      this.#writing = true
      let callbackDone = false
      let drainDone = false
      let returned = false
      let settled = false
      const cleanup = () => {
        clearTimeout(timer)
        this.#stdin.off('drain', onDrain)
        this.#cancelWrite = undefined
        this.#writing = false
      }
      const finish = (error?: Error) => {
        if (settled || (!error && (!returned || !callbackDone || !drainDone))) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolve()
      }
      const onDrain = () => {
        drainDone = true
        finish()
      }
      const timer = setTimeout(() => this.#fault('write_timeout'), duration)
      this.#cancelWrite = reason => finish(new RpcTransportError(reason))
      this.#stdin.on('drain', onDrain)
      try {
        // Gate checked at the actual I/O point; no awaited or scheduled sender exists.
        if (!this.#open) return finish(new RpcTransportError('fenced'))
        this.#writtenBytes += frame.length
        const accepted = this.#stdin.write(frame, error => {
          if (error) {
            this.#fault('write_callback_error')
            finish(new RpcTransportError('write_callback_error'))
          } else {
            callbackDone = true
            finish()
          }
        })
        returned = true
        if (accepted) drainDone = true
        finish()
      } catch {
        this.#fault('write_error')
        finish(new RpcTransportError('write_error'))
      }
    })
  }

  #consume(chunk: unknown): void {
    if (!this.#open) return
    if (!Buffer.isBuffer(chunk)) return this.#fault('non_binary_stdout')
    this.#receivedBytes += chunk.length
    if (this.#receivedBytes > MAX_PROTOCOL_BYTES) return this.#fault('protocol_byte_limit')
    let offset = 0
    while (offset < chunk.length && this.#open) {
      const newline = chunk.indexOf(10, offset)
      const end = newline < 0 ? chunk.length : newline
      const length = end - offset
      if (this.#frame.length + length > this.#maxFrameBytes) return this.#fault('frame_limit')
      this.#frame = Buffer.concat([this.#frame, chunk.subarray(offset, end)])
      if (newline < 0) return
      const frame = this.#frame
      this.#frame = Buffer.alloc(0)
      this.#handleFrame(frame)
      offset = end + 1
    }
  }

  #handleFrame(frame: Buffer): void {
    let message: unknown
    try {
      message = JSON.parse(this.#decoder.decode(frame))
    } catch {
      return this.#fault('invalid_json_utf8')
    }
    if (!record(message) || ('jsonrpc' in message && message.jsonrpc !== '2.0')) return this.#fault('invalid_envelope')
    this.#frames++
    if ('method' in message) this.#handleNotification(message)
    else this.#handleReply(message)
  }

  #handleNotification(message: Record<string, unknown>): void {
    if ('id' in message) return this.#fault('unexpected_rpc_request')
    if (
      typeof message.method !== 'string' ||
      !message.method.length ||
      !record(message.params) ||
      'result' in message ||
      'error' in message
    )
      return this.#fault('invalid_notification')
    try {
      this.#options.onNotification(message.method, message.params)
    } catch {
      this.#fault('notification_rejected')
    }
  }

  #handleReply(message: Record<string, unknown>): void {
    const pending = this.#pending
    if (!pending || message.id !== pending.id) return this.#fault('reply_correlation')
    const invalid = replyFault(message)
    if (invalid) return this.#fault(invalid)
    this.#pending = undefined
    clearTimeout(pending.timer)
    if (Object.hasOwn(message, 'error')) {
      pending.reject(new RpcTransportError('rpc_error'))
      this.#fault('rpc_error')
    } else pending.resolve(message.result)
  }
}
