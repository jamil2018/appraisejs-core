import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs'

/** Task-process emergency boundary. The only process operation is an original captured IPC disconnect. */
export function createC0TaskLifetime(options: {
  caseMs: number
  evidencePath: string
  disconnectOriginal: () => boolean
}) {
  if (!Number.isSafeInteger(options.caseMs) || options.caseMs < 1 || options.caseMs > 900_000)
    throw new Error('C0 case deadline refused')
  const disconnectOriginal = options.disconnectOriginal
  const timer = setTimeout(() => {
    try {
      const descriptor = openSync(options.evidencePath, 'wx', 0o600)
      try {
        writeSync(
          descriptor,
          JSON.stringify({
            version: 'm13-c0-hard-deadline/v1',
            outcome: 'UNKNOWN',
            consumed: true,
            nextCasePermitted: false,
          }) + '\n',
        )
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
    } finally {
      try {
        disconnectOriginal()
      } finally {
        process.exit(2)
      }
    }
  }, options.caseMs)
  return Object.freeze({
    finish() {
      clearTimeout(timer)
    },
  })
}
