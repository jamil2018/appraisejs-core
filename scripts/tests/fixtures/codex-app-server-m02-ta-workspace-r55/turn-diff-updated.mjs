/** Exact passive N02 notification classification. Diff contents never leave this call. */
export const TURN_DIFF_LIMITS = Object.freeze({ frames: 32, diffBytes: 16384, totalFrameBytes: 65536 })
export const TURN_DIFF_FAILURE_REASONS = Object.freeze([
  'CASE_OR_PHASE_INVALID',
  'OWNED_IDENTITIES_UNKNOWN',
  'ACTIVE_CASE_MISMATCH',
  'ACTION_NOT_ISSUED',
  'PARAMETER_FIELDS_INVALID',
  'THREAD_MISMATCH',
  'TURN_MISMATCH',
  'DIFF_INVALID',
  'FRAME_QUOTA',
])
export function turnDiffUpdatedFailure(params, state, originalByteCount) {
  if (state.caseId !== 'N02' || state.phase !== 'turn') return 'CASE_OR_PHASE_INVALID'
  if (
    [state.threadId, state.turnId].some(value => typeof value !== 'string' || value.length === 0 || value.length > 200)
  )
    return 'OWNED_IDENTITIES_UNKNOWN'
  if (state.activeCaseId !== 'N02') return 'ACTIVE_CASE_MISMATCH'
  if (state.workspaceActions !== 1 || state.outerCalls !== 1) return 'ACTION_NOT_ISSUED'
  if (
    !params ||
    typeof params !== 'object' ||
    Array.isArray(params) ||
    Object.keys(params).sort().join(',') !== 'diff,threadId,turnId'
  )
    return 'PARAMETER_FIELDS_INVALID'
  if (params.threadId !== state.threadId) return 'THREAD_MISMATCH'
  if (params.turnId !== state.turnId) return 'TURN_MISMATCH'
  if (typeof params.diff !== 'string' || Buffer.byteLength(params.diff) > TURN_DIFF_LIMITS.diffBytes)
    return 'DIFF_INVALID'
  if (
    !Number.isSafeInteger(state.frames) ||
    state.frames < 0 ||
    state.frames >= TURN_DIFF_LIMITS.frames ||
    !Number.isSafeInteger(state.bytes) ||
    state.bytes < 0 ||
    !Number.isSafeInteger(originalByteCount) ||
    originalByteCount <= 0 ||
    state.bytes + originalByteCount > TURN_DIFF_LIMITS.totalFrameBytes
  )
    return 'FRAME_QUOTA'
  return null
}
