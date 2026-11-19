import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TextDecoder } from 'node:util'
import Ajv from 'ajv'

export const privateRpcPath = fileURLToPath(import.meta.url)
export function schemaValidator(schemaRoot, files, refuse) {
  const ajv = new Ajv({ allErrors: false, unknownFormats: 'ignore', logger: false })
  const validators = new Map(
    files.map(file => [file, ajv.compile(JSON.parse(readFileSync(join(schemaRoot, file), 'utf8')))]),
  )
  return (name, value) => {
    if (!validators.get(name)?.(value)) refuse(value)
  }
}

/** Private transport mechanics only. Each owner retains its finite protocol and privacy reducer. */
export class FinitePrivateTransport {
  #counts
  #input
  #receive
  #refusal
  #categoryOf
  #truncated
  #pending
  #failure
  #buffer = Buffer.alloc(0)
  #decoder = new TextDecoder('utf-8', { fatal: true })
  #bytes = 0
  #stdoutDone = false
  #stderrDone = false
  #drained
  #settleDrain
  constructor({ stdin, stdout, stderr, validate, event = () => {} }, Refusal, truncated, receive, wire, counts) {
    this.#counts = counts
    const refusal = category => new Refusal(category)
    const categoryOf = error => (error instanceof Refusal ? error.category : 'malformed_frame')
    Object.assign(wire, {
      counts,
      validate,
      event,
      pending: () => this.#pending,
      send: (...args) => this.#send(...args),
      write: frame => this.#input.write(frame),
      resolvePending: result => this.#takePending().resolve(result),
      rejectPending: error => this.#rejectPending(error),
      start: () => {
        stdout.resume()
        stderr.resume()
      },
    })
    this.#input = stdin
    this.#receive = receive
    this.#refusal = refusal
    this.#categoryOf = categoryOf
    this.#truncated = truncated
    this.#drained = new Promise(resolve => {
      this.#settleDrain = resolve
    })
    stdout.on('data', chunk => this.#consume(Buffer.from(chunk)))
    stdout.on('end', () => this.#stdoutEnd())
    stdout.on('close', () => this.#stdoutClose())
    stderr.on('end', () => {
      this.#stderrDone = true
      this.#settle()
    })
    stderr.on('close', () => {
      if (!this.#stderrDone) this.abort('stream_drain_unobserved')
      this.#stderrDone = true
      this.#settle()
    })
    for (const stream of [stdin, stdout, stderr]) stream.on('error', () => this.abort('transport_error'))
    // Stderr is counted without decoding, retaining, hashing, or emitting its bytes.
    stderr.on('data', chunk => this.#countBytes(chunk.length))
  }
  #settle() {
    if (this.#stdoutDone && this.#stderrDone) this.#settleDrain()
  }
  #stdoutEnd() {
    this.#stdoutDone = true
    this.abort(this.#buffer.length ? this.#truncated : 'transport_closed')
    this.#settle()
  }
  #stdoutClose() {
    if (!this.#stdoutDone) this.abort(this.#buffer.length ? this.#truncated : 'stream_drain_unobserved')
    this.#stdoutDone = true
    this.#settle()
  }
  get counts() {
    return { ...this.#counts }
  }
  get failureCategory() {
    return this.#failure?.category
  }
  assertHealthy() {
    if (this.#failure) throw this.#failure
  }
  async waitForDrain() {
    await this.#drained
    if (this.#failure && this.#failure.category !== 'transport_closed') throw this.#failure
    if (this.#buffer.length) throw this.#refusal(this.#truncated)
  }
  abort(category = 'transport_aborted') {
    if (!this.#failure || (this.#failure.category === 'transport_closed' && category !== 'transport_closed'))
      this.#failure = this.#refusal(category)
    if (this.#pending) this.#rejectPending(this.#failure)
  }
  #countBytes(length) {
    this.#bytes += length
    if (this.#bytes > 8 * 1024 * 1024) {
      this.abort('output_limit')
      return false
    }
    return true
  }
  #consume(chunk) {
    if (this.#failure || !this.#countBytes(chunk.length)) return
    this.#buffer = Buffer.concat([this.#buffer, chunk])
    let newline
    while ((newline = this.#buffer.indexOf(10)) !== -1) {
      const frame = this.#buffer.subarray(0, newline)
      this.#buffer = this.#buffer.subarray(newline + 1)
      if (frame.length > 256 * 1024) return this.abort('frame_limit')
      this.#receiveFrame(frame)
      if (this.#failure) return
    }
    if (this.#buffer.length > 256 * 1024) this.abort('frame_limit')
  }
  #receiveFrame(frame) {
    try {
      this.#receive(JSON.parse(this.#decoder.decode(frame)))
    } catch (error) {
      this.abort(this.#categoryOf(error))
    }
  }
  #send(message, metadata, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.abort('phase_timeout'), timeoutMs)
      this.#pending = { ...metadata, id: message.id, resolve, reject, timer }
      this.#input.write(`${JSON.stringify(message)}\n`)
    })
  }
  #takePending() {
    const pending = this.#pending
    this.#pending = undefined
    clearTimeout(pending.timer)
    return pending
  }
  #rejectPending(error) {
    this.#takePending().reject(error)
  }
}
