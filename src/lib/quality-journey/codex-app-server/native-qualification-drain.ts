import type { Readable } from 'node:stream'
import { TextDecoder } from 'node:util'

/** Passive native drain custody outlives the active sender fence and never delivers canonical callbacks. */
export function createNativeQualificationDrainGuard(
  stdout: Readable,
  stderr: Readable,
  validate: (frame: unknown) => void,
  fault: () => void,
) {
  let frame = Buffer.alloc(0),
    stdoutBytes = 0,
    stderrBytes = 0,
    stdoutEnded = false,
    stderrEnded = false,
    poisoned = false
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let settle!: () => void
  const eof = new Promise<void>(resolve => {
    settle = resolve
  })
  function fail() {
    if (poisoned) return
    poisoned = true
    try {
      fault()
    } catch {
      /* no callback can reopen custody */
    }
  }
  function finish() {
    if (stdoutEnded && stderrEnded) settle()
  }
  function consume(chunk: unknown) {
    if (!Buffer.isBuffer(chunk)) {
      fail()
      return
    }
    stdoutBytes += chunk.length
    if (stdoutBytes > 8 * 1024 * 1024) {
      fail()
      return
    }
    frame = Buffer.concat([frame, chunk])
    let newline: number
    while ((newline = frame.indexOf(10)) !== -1) {
      const line = frame.subarray(0, newline)
      frame = frame.subarray(newline + 1)
      if (line.length > 256 * 1024) {
        fail()
        continue
      }
      try {
        validate(JSON.parse(decoder.decode(line)))
      } catch {
        fail()
      }
    }
    if (frame.length > 256 * 1024) {
      fail()
      frame = Buffer.alloc(0)
    }
  }
  stdout.on('data', consume)
  stderr.on('data', (chunk: unknown) => {
    if (!Buffer.isBuffer(chunk)) {
      fail()
      return
    }
    stderrBytes += chunk.length
    if (stderrBytes > 256 * 1024) fail()
  })
  stdout.on('end', () => {
    stdoutEnded = true
    if (frame.length) fail()
    finish()
  })
  stderr.on('end', () => {
    stderrEnded = true
    finish()
  })
  stdout.on('close', () => {
    if (!stdoutEnded) fail()
    finish()
  })
  stderr.on('close', () => {
    if (!stderrEnded) fail()
    finish()
  })
  stdout.on('error', fail)
  stderr.on('error', fail)
  return Object.freeze({
    snapshot: () => Object.freeze({ stdoutEnded, stderrEnded, poisoned }),
    async wait(timeoutMs: number) {
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        eof,
        new Promise<void>(resolve => {
          timer = setTimeout(resolve, timeoutMs)
        }),
      ])
      if (timer) clearTimeout(timer)
      return stdoutEnded && stderrEnded && !poisoned
    },
  })
}
