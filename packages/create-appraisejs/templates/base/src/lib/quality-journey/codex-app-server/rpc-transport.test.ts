import { PassThrough, Writable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RpcTransport, type RpcTransportOptions } from './rpc-transport'

const transports: RpcTransport[] = []
afterEach(() => {
  for (const transport of transports.splice(0)) transport.fence('test_cleanup')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function harness(options: Partial<RpcTransportOptions> = {}, holdWrites = false) {
  const writes: Buffer[] = []
  const callbacks: Array<(error?: Error | null) => void> = []
  const stdin = new Writable({
    highWaterMark: holdWrites ? 1 : 16_384,
    write(chunk: Buffer, _encoding, callback) {
      writes.push(Buffer.from(chunk))
      if (holdWrites) callbacks.push(callback)
      else callback()
    },
  })
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const onFault = vi.fn()
  const onNotification = vi.fn()
  const transport = new RpcTransport({ stdin, stdout, stderr }, { onFault, onNotification, ...options })
  transports.push(transport)
  return { transport, stdin, stdout, stderr, writes, callbacks, onFault, onNotification }
}
const jsonl = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`)

async function initialized(h: ReturnType<typeof harness>) {
  const request = h.transport.request('initialize', {})
  h.stdout.write(jsonl({ id: 1, result: { ready: true } }))
  await request
}

describe('private bounded RPC transport', () => {
  it('writes synchronously and decodes UTF8 split inside a code point with coalesced notification frames', async () => {
    const h = harness()
    const response = h.transport.request('initialize', {})
    expect(h.writes).toHaveLength(1)
    expect(JSON.parse(h.writes[0].toString())).toEqual({ id: 1, method: 'initialize', params: {} })
    const frame = jsonl({ id: 1, result: { text: 'a🙂é' } })
    const split = frame.indexOf(Buffer.from('🙂')) + 2
    h.stdout.write(frame.subarray(0, split))
    h.stdout.write(Buffer.concat([frame.subarray(split), jsonl({ method: 'turn/completed', params: { done: true } })]))
    await expect(response).resolves.toEqual({ text: 'a🙂é' })
    expect(h.onNotification).toHaveBeenCalledWith('turn/completed', { done: true })
    expect(h.transport.snapshot()).toMatchObject({ receivedFrames: 2, pendingRequests: 0, status: 'open' })
    expect(JSON.stringify(h.transport.snapshot())).not.toContain('🙂')
  })

  it('has one pending request and no queued request or approval method', async () => {
    const h = harness()
    const response = h.transport.request('initialize', {})
    await expect(h.transport.request('thread/start', {})).rejects.toMatchObject({ reason: 'pending_limit' })
    expect(h.writes).toHaveLength(1)
    h.stdout.write(jsonl({ id: 1, result: {} }))
    await response
    // The runtime allowlist protects JavaScript callers as well as typed callers.
    await expect(h.transport.request('approve' as 'initialize', {})).rejects.toMatchObject({
      reason: 'invalid_request',
    })
    expect(h.writes).toHaveLength(1)
  })

  it.each([
    ['malformed JSON', Buffer.from('{bad\n'), 'invalid_json_utf8'],
    ['invalid UTF8', Buffer.from([0x7b, 0xff, 0x7d, 10]), 'invalid_json_utf8'],
    ['array envelope', jsonl([]), 'invalid_envelope'],
    ['wrong protocol version', jsonl({ jsonrpc: '1.0', id: 1, result: {} }), 'invalid_envelope'],
    ['unknown reply', jsonl({ id: 99, result: {} }), 'reply_correlation'],
    ['string correlation', jsonl({ id: '1', result: {} }), 'reply_correlation'],
    ['error plus result', jsonl({ id: 1, error: { code: -1, message: 'raw' }, result: {} }), 'invalid_reply'],
    ['no error or result', jsonl({ id: 1 }), 'invalid_reply'],
    ['null result', jsonl({ id: 1, result: null }), 'invalid_rpc_result'],
    ['array result', jsonl({ id: 1, result: [] }), 'invalid_rpc_result'],
    ['bad error', jsonl({ id: 1, error: { code: 'bad', message: 'raw' } }), 'invalid_rpc_error'],
    [
      'unexpected RPC',
      jsonl({ id: 'approval', method: 'item/commandExecution/requestApproval', params: {} }),
      'unexpected_rpc_request',
    ],
    ['invalid notification params', jsonl({ method: 'turn/completed', params: [] }), 'invalid_notification'],
  ])('fences on %s and never sends another frame', async (_name, frame, reason) => {
    const h = harness()
    const response = h.transport.request('initialize', {})
    const rejected = expect(response).rejects.toBeInstanceOf(Error)
    h.stdout.write(frame)
    await rejected
    expect(h.transport.snapshot()).toMatchObject({ status: 'fenced', reason, pendingRequests: 0 })
    expect(h.onFault).toHaveBeenCalledExactlyOnceWith(reason)
    expect(h.onNotification).not.toHaveBeenCalled()
    await expect(h.transport.notifyInitialized()).rejects.toMatchObject({ reason: 'fenced' })
    expect(h.writes).toHaveLength(1)
    expect(JSON.stringify(h.transport.snapshot())).not.toContain('raw')
  })

  it('rejects valid RPC errors without exposing their text or data', async () => {
    const h = harness()
    const response = h.transport.request('initialize', {})
    h.stdout.write(
      jsonl({ id: 1, error: { code: -1, message: 'sensitive provider text', data: { secret: 'private' } } }),
    )
    await expect(response).rejects.toMatchObject({ reason: 'rpc_error' })
    expect(h.onFault).toHaveBeenCalledExactlyOnceWith('rpc_error')
    expect(JSON.stringify(h.transport.snapshot())).not.toMatch(/sensitive|secret|private/)
  })

  it('allows supervisor notification validation to fence callback failures', () => {
    const h = harness({
      onNotification: () => {
        throw new Error('foreign turn payload')
      },
    })
    h.stdout.write(jsonl({ method: 'turn/completed', params: { threadId: 'foreign' } }))
    expect(h.transport.snapshot()).toMatchObject({ status: 'fenced', reason: 'notification_rejected' })
  })

  it('enforces inbound and outbound frame limits before writing or retaining excess data', async () => {
    const h = harness({ maxFrameBytes: 64 })
    await expect(h.transport.request('initialize', { text: 'x'.repeat(100) })).rejects.toMatchObject({
      reason: 'invalid_request',
    })
    expect(h.writes).toHaveLength(0)
    h.stdout.write(Buffer.alloc(65, 120))
    expect(h.transport.snapshot()).toMatchObject({ reason: 'frame_limit' })
    const hardLimit = harness()
    hardLimit.stdout.write(Buffer.alloc(256 * 1024 + 1, 120))
    expect(hardLimit.transport.snapshot()).toMatchObject({ reason: 'frame_limit' })
  })

  it('bounds a stream of many small valid frames by total bytes', () => {
    const h = harness()
    const frame = jsonl({ method: 'delta', params: { text: 'x'.repeat(4_000) } })
    const batch = Buffer.concat(Array.from({ length: 10 }, () => frame))
    for (let index = 0; index < 220 && h.transport.snapshot().status === 'open'; index++) h.stdout.write(batch)
    expect(h.transport.snapshot()).toMatchObject({ status: 'fenced', reason: 'protocol_byte_limit' })
    expect(h.transport.snapshot().receivedFrames).toBeGreaterThan(1_000)
    expect(h.transport.snapshot().receivedBytes).toBeLessThan(8 * 1024 * 1024 + batch.length)
  })

  it('discards stderr without notification/log payload retention and fences at its cap', () => {
    const h = harness()
    h.stderr.write(Buffer.alloc(256 * 1024, 120))
    expect(h.transport.snapshot()).toMatchObject({ status: 'open', discardedStderrBytes: 256 * 1024 })
    h.stderr.write(Buffer.from('x'))
    expect(h.transport.snapshot()).toMatchObject({ status: 'fenced', reason: 'stderr_limit' })
    expect(h.onNotification).not.toHaveBeenCalled()
  })

  it('bounds aggregate outbound bytes across individually valid requests', async () => {
    const h = harness()
    for (let id = 1; id <= 8; id++) {
      const response = h.transport.request('initialize', { text: 'x'.repeat(240 * 1024) })
      h.stdout.write(jsonl({ id, result: {} }))
      await response
    }
    await expect(h.transport.request('initialize', { text: 'x'.repeat(240 * 1024) })).rejects.toMatchObject({
      reason: 'write_limit',
    })
    expect(h.writes).toHaveLength(8)
    expect(h.transport.snapshot()).toMatchObject({ status: 'fenced', reason: 'write_limit' })
    expect(h.transport.snapshot().writtenBytes).toBeLessThanOrEqual(2 * 1024 * 1024)
  })

  it.each(['stdout', 'stderr', 'stdin'] as const)('fences on %s errors', async stream => {
    const h = harness()
    const response = h.transport.request('initialize', {})
    const rejected = expect(response).rejects.toBeInstanceOf(Error)
    h[stream].destroy(new Error('private raw stream error'))
    await rejected
    expect(h.transport.snapshot()).toMatchObject({ reason: `${stream}_error` })
  })

  it.each([false, true])('rejects EOF with partial frame=%s', async partial => {
    const h = harness()
    const response = h.transport.request('initialize', {})
    const rejected = expect(response).rejects.toBeInstanceOf(Error)
    h.stdout.end(partial ? '{"id":1' : undefined)
    await rejected
    expect(h.transport.snapshot()).toMatchObject({ reason: partial ? 'partial_frame_eof' : 'stdout_eof' })
  })

  it('waits for the write callback and drain without resending even after an early reply', async () => {
    const h = harness({}, true)
    let settled = false
    const response = h.transport.request('initialize', {}).then(value => {
      settled = true
      return value
    })
    h.stdout.write(jsonl({ id: 1, result: {} }))
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(h.transport.snapshot().writing).toBe(true)
    await expect(h.transport.request('thread/start', {})).rejects.toMatchObject({ reason: 'pending_limit' })
    expect(h.writes).toHaveLength(1)
    h.callbacks[0]()
    await response
    h.stdin.emit('drain')
    expect(h.writes).toHaveLength(1)
    expect(h.transport.snapshot().writing).toBe(false)
  })

  it('fails a partial write callback without retaining its raw error or resending', async () => {
    const h = harness({}, true)
    const response = h.transport.request('initialize', {})
    const rejected = expect(response).rejects.toBeInstanceOf(Error)
    h.callbacks[0](new Error('private write failure'))
    await rejected
    expect(h.transport.snapshot()).toMatchObject({ status: 'fenced', reason: 'write_callback_error' })
    expect(h.writes).toHaveLength(1)
  })

  it.each([false, true])('bounds acknowledgement/backpressure waiting held=%s', async held => {
    vi.useFakeTimers()
    const h = harness({ requestTimeoutMs: 25 }, held)
    const response = h.transport.request('initialize', {})
    const rejected = expect(response).rejects.toBeInstanceOf(Error)
    await vi.advanceTimersByTimeAsync(26)
    await rejected
    expect(h.transport.snapshot()).toMatchObject({
      status: 'fenced',
      reason: 'request_timeout',
      pendingRequests: 0,
      writing: false,
    })
    expect(h.writes).toHaveLength(1)
  })

  it('bounds initialized-notification drain time with no queued resend', async () => {
    vi.useFakeTimers()
    const h = harness({ requestTimeoutMs: 25 }, true)
    const write = h.transport.notifyInitialized()
    const rejected = expect(write).rejects.toBeInstanceOf(Error)
    await vi.advanceTimersByTimeAsync(26)
    await rejected
    expect(h.transport.snapshot()).toMatchObject({ reason: 'write_timeout', writing: false })
    expect(h.writes).toHaveLength(1)
  })

  it('bounds the remaining write wait even when the reply arrived before drain', async () => {
    vi.useFakeTimers()
    const h = harness({ requestTimeoutMs: 25 }, true)
    const response = h.transport.request('initialize', {})
    const rejected = expect(response).rejects.toMatchObject({ reason: 'write_timeout' })
    h.stdout.write(jsonl({ id: 1, result: {} }))
    await vi.advanceTimersByTimeAsync(26)
    await rejected
    expect(h.writes).toHaveLength(1)
  })

  it('keeps abort effective after an early reply while write drain remains outstanding', async () => {
    const h = harness({}, true)
    const controller = new AbortController()
    const response = h.transport.request('initialize', {}, undefined, controller.signal)
    h.stdout.write(jsonl({ id: 1, result: {} }))
    controller.abort()
    await expect(response).rejects.toMatchObject({ reason: 'request_aborted' })
    expect(h.writes).toHaveLength(1)
  })

  it('fences a synchronous write exception without a resend', async () => {
    const h = harness()
    const write = vi.spyOn(h.stdin, 'write').mockImplementation(() => {
      throw new Error('private write exception')
    })
    await expect(h.transport.request('initialize', {})).rejects.toMatchObject({ reason: 'write_error' })
    expect(h.transport.snapshot()).toMatchObject({ reason: 'write_error' })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('aborts outstanding requests and prevents pre-aborted request writes', async () => {
    const h = harness()
    const preAborted = new AbortController()
    preAborted.abort()
    await expect(h.transport.request('initialize', {}, undefined, preAborted.signal)).rejects.toMatchObject({
      reason: 'request_aborted',
    })
    expect(h.writes).toHaveLength(0)
    const controller = new AbortController()
    const response = h.transport.request('initialize', {}, undefined, controller.signal)
    controller.abort()
    await expect(response).rejects.toMatchObject({ reason: 'request_aborted' })
    expect(h.transport.snapshot()).toMatchObject({ reason: 'request_aborted' })
  })

  it('synchronously fences and rejects an already queued delayed sender with zero writes', async () => {
    const h = harness()
    const delayedSender = Promise.resolve().then(() => h.transport.request('turn/start', {}))
    h.transport.fence('authority_revoked')
    expect(h.stdin.destroyed).toBe(true)
    await expect(delayedSender).rejects.toMatchObject({ reason: 'fenced' })
    expect(h.writes).toHaveLength(0)
    expect(h.transport.snapshot()).toMatchObject({ reason: 'authority_revoked' })
  })

  it('fences an in-flight write and leaves delayed drain/callbacks unable to resend', async () => {
    const h = harness({}, true)
    const response = h.transport.request('turn/start', {})
    h.transport.fence('cancelled')
    const stopped = h.transport.snapshot()
    expect(stopped).toMatchObject({ status: 'fenced', writing: false, pendingRequests: 0 })
    h.stdin.emit('drain')
    h.callbacks[0]()
    await expect(response).rejects.toBeInstanceOf(Error)
    expect(h.writes).toHaveLength(1)
  })

  it('sends initialized only through its dedicated bounded notification entry point', async () => {
    const h = harness()
    await initialized(h)
    await h.transport.notifyInitialized()
    expect(JSON.parse(h.writes[1].toString())).toEqual({ method: 'initialized' })
  })
})
