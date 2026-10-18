/** T1-only, fail-closed classifier for the expected captured-provider 503 notification. */
import { createHash } from 'node:crypto'
import { Transform } from 'node:stream'

const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const MAX_FRAME = 1024 * 1024
const ownId = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value)

export function createT1ErrorAdapter({ afterCapture, onAccepted, onAmbiguous }) {
  if (![afterCapture, onAccepted, onAmbiguous].every(value => typeof value === 'function'))
    throw new Error('T1 error adapter callbacks required')
  let held = Buffer.alloc(0)
  let accepted = null
  const fail = () => {
    onAmbiguous()
    throw new Error('T1 native error notification UNKNOWN')
  }
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        held = Buffer.concat([held, chunk])
        if (held.length > MAX_FRAME * 2) fail()
        for (;;) {
          const index = held.indexOf(10)
          if (index < 0) break
          const line = held.subarray(0, index + 1)
          held = held.subarray(index + 1)
          if (line.length > MAX_FRAME) fail()
          const frame = JSON.parse(line.toString('utf8'))
          if (frame?.method !== 'error') {
            this.push(line)
            continue
          }
          const state = afterCapture()
          const params = frame.params
          const info = params?.error?.codexErrorInfo
          const variant = Object.keys(info ?? {})[0]
          const status = info?.[variant]?.httpStatusCode
          if (
            accepted ||
            Object.hasOwn(frame, 'id') ||
            Object.keys(frame).some(key => !['method', 'params', 'jsonrpc', 'emittedAtMs'].includes(key)) ||
            (Object.hasOwn(frame, 'jsonrpc') && frame.jsonrpc !== '2.0') ||
            (Object.hasOwn(frame, 'emittedAtMs') && !Number.isSafeInteger(frame.emittedAtMs)) ||
            Object.keys(params ?? {})
              .sort()
              .join() !== 'error,threadId,turnId,willRetry' ||
            state?.captured !== true ||
            !ownId(state.threadId) ||
            !ownId(state.turnId) ||
            params?.threadId !== state.threadId ||
            params?.turnId !== state.turnId ||
            params?.willRetry !== false ||
            status !== 503 ||
            !Number.isInteger(status) ||
            Object.keys(info ?? {}).length !== 1 ||
            !['httpConnectionFailed', 'responseStreamDisconnected', 'responseStreamConnectionFailed'].includes(
              variant,
            ) ||
            Object.keys(info[variant] ?? {}).join() !== 'httpStatusCode' ||
            typeof params.error.message !== 'string'
          )
            fail()
          accepted = Object.freeze({
            schema: 'appraise.m02-ta-t1-provider-error/v1',
            caseId: 'T1',
            threadId: state.threadId,
            turnId: state.turnId,
            httpStatusCode: 503,
            willRetry: false,
            notificationSha256: sha(line),
            messageSha256: sha(params.error.message),
          })
          onAccepted(accepted)
        }
        callback()
      } catch (error) {
        try {
          onAmbiguous()
        } catch {}
        callback(error)
      }
    },
    flush(callback) {
      if (held.length) {
        try {
          onAmbiguous()
        } catch {}
        callback(new Error('T1 native frame partial; UNKNOWN'))
      } else callback()
    },
  })
  return Object.freeze({ stream, snapshot: () => accepted })
}
