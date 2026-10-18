/** Closed passive presentation validation; no notification value is retained or grants authority. */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const only = (value, fields) => record(value) && Object.keys(value).every(key => fields.includes(key))

export const THREAD_READ_STATE_FAILURE_REASONS = Object.freeze([
  'PEER_PHASE_INVALID',
  'OWNED_THREAD_UNKNOWN',
  'PARAMETER_FIELDS_INVALID',
  'THREAD_MISMATCH',
  'READ_STATE_FIELDS_INVALID',
  'REVISION_INVALID',
  'POSITION_SHAPE_INVALID',
  'POSITION_TYPE_INVALID',
  'POSITION_FIELDS_INVALID',
  'OWNED_TURN_UNKNOWN',
  'TURN_MISMATCH',
])

export function threadReadStateFailure(params, { phase, threadId, turnId }) {
  if (!['thread', 'turn', 'terminal'].includes(phase)) return 'PEER_PHASE_INVALID'
  if (typeof threadId !== 'string' || threadId.length === 0) return 'OWNED_THREAD_UNKNOWN'
  if (!only(params, ['threadId', 'readState'])) return 'PARAMETER_FIELDS_INVALID'
  if (params.threadId !== threadId) return 'THREAD_MISMATCH'
  const readState = params.readState
  if (!only(readState, ['revision', 'firstUnread'])) return 'READ_STATE_FIELDS_INVALID'
  if (
    typeof readState.revision !== 'string' ||
    Buffer.byteLength(readState.revision) === 0 ||
    Buffer.byteLength(readState.revision) > 512
  )
    return 'REVISION_INVALID'
  if (!Object.hasOwn(readState, 'firstUnread') || readState.firstUnread === null) return null
  const position = readState.firstUnread
  if (!record(position)) return 'POSITION_SHAPE_INVALID'
  if (position.type === 'threadStart') {
    if (!only(position, ['type'])) return 'POSITION_FIELDS_INVALID'
    return null
  }
  if (position.type !== 'turn') return 'POSITION_TYPE_INVALID'
  if (!only(position, ['type', 'turnId'])) return 'POSITION_FIELDS_INVALID'
  if (typeof turnId !== 'string' || turnId.length === 0) return 'OWNED_TURN_UNKNOWN'
  if (position.turnId !== turnId) return 'TURN_MISMATCH'
  return null
}
