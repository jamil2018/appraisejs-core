import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs'
import type { NativeOutcomeReviewControl } from '../../../../src/lib/quality-journey/codex-app-server/native-outcome-source'

/** One original parent, with separately frozen native-case/cleanup and review/reconciliation bounds. */
export function createC1TaskLifetime(options: {
  caseMs: number
  cleanupMs: number
  control: NativeOutcomeReviewControl
  hardEvidencePath: string
  cancelModel: () => Promise<unknown>
  revokeOriginal: () => void
  disconnectOriginal: () => boolean
}) {
  if (
    !Number.isSafeInteger(options.caseMs) ||
    options.caseMs < 1 ||
    options.caseMs > 900000 ||
    ![options.cleanupMs, options.control.reviewMs, options.control.reconciliationMs].every(
      ms => Number.isSafeInteger(ms) && ms > 0 && ms <= 300000,
    )
  )
    throw new Error('Frozen C1 task control budget required')
  let finished = false,
    expired = false
  const cancelModel = options.cancelModel,
    revoke = options.revokeOriginal,
    disconnect = options.disconnectOriginal
  const model = setTimeout(() => {
    void cancelModel().catch(() => {})
  }, options.caseMs)
  const hard = setTimeout(
    () => {
      expired = true
      try {
        try {
          revoke()
        } finally {
          const fd = openSync(options.hardEvidencePath, 'wx', 0o600)
          try {
            writeSync(fd, JSON.stringify({ outcome: 'UNKNOWN', consumed: true, nextCasePermitted: false }) + '\n')
            fsyncSync(fd)
          } finally {
            closeSync(fd)
          }
        }
      } finally {
        try {
          disconnect()
        } finally {
          process.exit(2)
        }
      }
    },
    options.caseMs + options.cleanupMs + options.control.reviewMs + options.control.reconciliationMs,
  )
  return Object.freeze({
    expired: () => expired,
    nativeCleanupObserved() {
      clearTimeout(model)
    },
    finish() {
      if (finished) return
      finished = true
      clearTimeout(model)
      clearTimeout(hard)
    },
  })
}
