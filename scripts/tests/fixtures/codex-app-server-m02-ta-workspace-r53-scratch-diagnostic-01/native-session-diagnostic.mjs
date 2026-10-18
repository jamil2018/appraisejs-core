/** Closed in-memory observations only. No raw errors, output, identities, capture or I/O retained. */
export const NATIVE_SESSION_DIAGNOSTIC_STAGES = Object.freeze([
  'IDLE',
  'REQUEST_GUARD',
  'ACTIVE_CORRELATION',
  'BODY_CORRELATION',
  'DESCRIPTOR',
  'TRANSCRIPT',
  'INITIAL_INPUT',
  'SCRATCH_PREPARED',
  'OUTPUT_CORRELATION',
  'OUTPUT_BOUND',
  'SCRATCH_PROOF',
  'SCRATCH_PROOF_PROVENANCE',
  'NATIVE_RESULT',
  'WORKSPACE_RECEIPT',
  'ACTIVE_INPUT',
  'SSE_BUILD',
  'WORKSPACE_RESERVATION',
  'OUTER_RESERVATION',
  'WORKSPACE_ACK',
  'RESPONSE_RECEIPT',
  'RESPONSE_READY',
  'RESPONSE_ACK',
  'WAIT_CONTINUATION',
  'COMPLETED',
])
export const NATIVE_SESSION_ROUTE_REASONS = Object.freeze([
  'CASE_OR_BODY',
  'STALE_SEAL',
  'PROVENANCE',
  'TUPLE',
  'INCOMPLETE_CAPTURE',
  'LITE_CONTAINER_VARIANT',
  'EXECUTOR_CONTRACT',
  'EXECUTOR_SEMANTICS_DRIFT',
  'NATIVE_DESCRIPTOR_DRIFT',
  'CAPTURE_OR_VALIDATION_FAILED',
])
// Each literal below comes from the current session, native-plan, owned-scratch or R30 transcript source.
// Exact lookup is deliberate: arbitrary prefixes, Error.name, stack and cause never classify a failure.
const directoryErrorReasons = ['PHASE_ROOT', 'CASES_ROOT', 'CASE_ROOT', 'WORKSPACE', 'SCRATCH_PARENT'].flatMap(role =>
  ['DEVICE', 'INODE', 'OWNER', 'MODE', 'LINK_COUNT', 'KIND_OR_OWNERSHIP_PREDICATE'].map(component => [
    `scratch proof DIRECTORY_IDENTITY_CHANGED_${role}_${component}`,
    `SCRATCH_DIRECTORY_${role}_${component}`,
  ]),
)
const errorReasons = Object.freeze(
  [
    ['T3 native session PORTS_OR_BINDING', 'SESSION_PORTS_OR_BINDING'],
    ['T3 native session ASYNC_RECEIPT_WRITER_UNSUPPORTED', 'SESSION_ASYNC_RECEIPT_WRITER_UNSUPPORTED'],
    ['T3 native session BUDGET_ACK_OR_FENCED_NO_RESEND', 'SESSION_BUDGET_ACK_OR_FENCED_NO_RESEND'],
    ['T3 native session ACTIVE_CORRELATION', 'SESSION_ACTIVE_CORRELATION'],
    ['T3 native session BODY_BYTES_MISMATCH', 'SESSION_BODY_BYTES_MISMATCH'],
    ['T3 native session DESCRIPTOR_UNKNOWN', 'SESSION_DESCRIPTOR_UNKNOWN'],
    ['T3 native session INITIAL_INPUT_BOUND', 'SESSION_INITIAL_INPUT_BOUND'],
    ['T3 native session TOKEN_NOT_PREPARED', 'SESSION_TOKEN_NOT_PREPARED'],
    ['T3 native session CONTINUATION_ABSENT', 'SESSION_CONTINUATION_ABSENT'],
    ['T3 native session OUTPUT_BOUND', 'SESSION_OUTPUT_BOUND'],
    ['T3 native session PROOF_NOT_ISSUED', 'SESSION_PROOF_NOT_ISSUED'],
    ['T3 native session RESULT_OR_OWNED_BYTES_MISMATCH', 'SESSION_RESULT_OR_OWNED_BYTES_MISMATCH'],
    ['T3 native session ACTIVE_INPUT_CHANGED', 'SESSION_ACTIVE_INPUT_CHANGED'],
    ['T3 native session SSE_BOUND', 'SESSION_SSE_BOUND'],
    ['T3 native session DUPLICATE_OR_FENCED_RESPONSE_ACK', 'SESSION_DUPLICATE_OR_FENCED_RESPONSE_ACK'],
    ['M02_NATIVE_PLAN_CASE', 'PLAN_CASE'],
    ['M02_NATIVE_PLAN_UNISSUED_OR_CHANGED_PLAN', 'PLAN_UNISSUED_OR_CHANGED_PLAN'],
    ['M02_NATIVE_PLAN_EXTRA_OR_MISSING_CONTINUATION', 'PLAN_EXTRA_OR_MISSING_CONTINUATION'],
    ['M02_NATIVE_PLAN_OUTER_CORRELATION', 'PLAN_OUTER_CORRELATION'],
    ['M02_NATIVE_PLAN_OUTPUT_FIELDS', 'PLAN_OUTPUT_FIELDS'],
    ['M02_NATIVE_PLAN_OUTPUT_CONTENT', 'PLAN_OUTPUT_CONTENT'],
    ['M02_NATIVE_PLAN_INCOMPLETE_OR_TRUNCATED', 'PLAN_INCOMPLETE_OR_TRUNCATED'],
    ['M02_NATIVE_PLAN_OUTPUT_TEXT', 'PLAN_OUTPUT_TEXT'],
    ['M02_NATIVE_PLAN_RESULT_BOUND', 'PLAN_RESULT_BOUND'],
    ['M02_NATIVE_PLAN_ENVELOPE', 'PLAN_ENVELOPE'],
    ['M02_NATIVE_PLAN_WORKSPACE_EVIDENCE', 'PLAN_WORKSPACE_EVIDENCE'],
    ['M02_NATIVE_PLAN_COMMAND_RESULT_SHAPE', 'PLAN_COMMAND_RESULT_SHAPE'],
    ['M02_NATIVE_PLAN_COMMAND_RESULT_FIELDS', 'PLAN_COMMAND_RESULT_FIELDS'],
    ['M02_NATIVE_PLAN_COMMAND_EXIT_NOT_ZERO', 'PLAN_COMMAND_EXIT_NOT_ZERO'],
    ['M02_NATIVE_PLAN_COMMAND_DURATION', 'PLAN_COMMAND_DURATION'],
    ['M02_NATIVE_PLAN_COMMAND_TOKEN_COUNT', 'PLAN_COMMAND_TOKEN_COUNT'],
    ['M02_NATIVE_PLAN_COMMAND_OUTPUT', 'PLAN_COMMAND_OUTPUT'],
    ['M02_NATIVE_PLAN_PATCH_RESULT_PROJECTION', 'PLAN_PATCH_RESULT_PROJECTION'],
    ['scratch proof INEXACT_METADATA', 'SCRATCH_INEXACT_METADATA'],
    ['scratch proof ANCHOR_CLOSE_UNCERTAIN', 'SCRATCH_ANCHOR_CLOSE_UNCERTAIN'],
    ['scratch proof ACTIVE_CASE_PORT_REQUIRED', 'SCRATCH_ACTIVE_CASE_PORT_REQUIRED'],
    ['scratch proof FILESYSTEM_PORT_REQUIRED', 'SCRATCH_FILESYSTEM_PORT_REQUIRED'],
    ['scratch proof FOREIGN_ACTIVE_CASE', 'SCRATCH_FOREIGN_ACTIVE_CASE'],
    ['scratch proof DIRECTORY_IDENTITY_CHANGED', 'SCRATCH_DIRECTORY_IDENTITY_CHANGED'],
    ['scratch proof CASE_OR_MANIFEST_INVALID', 'SCRATCH_CASE_OR_MANIFEST_INVALID'],
    ['scratch proof PREPARATION_ALREADY_ATTEMPTED', 'SCRATCH_PREPARATION_ALREADY_ATTEMPTED'],
    ['scratch proof DIRECTORY_NOT_OWNED', 'SCRATCH_DIRECTORY_NOT_OWNED'],
    ['scratch proof SCRATCH_ALREADY_EXISTS', 'SCRATCH_ALREADY_EXISTS'],
    ['scratch proof UNISSUED_OR_CONSUMED_TOKEN', 'SCRATCH_UNISSUED_OR_CONSUMED_TOKEN'],
    ['scratch proof TOKEN_BINDING_MISMATCH', 'SCRATCH_TOKEN_BINDING_MISMATCH'],
    ['scratch proof SCRATCH_FILE_NOT_OWNED', 'SCRATCH_FILE_NOT_OWNED'],
    ['scratch proof SCRATCH_FILE_IDENTITY_CHANGED', 'SCRATCH_FILE_IDENTITY_CHANGED'],
    ['scratch proof SCRATCH_BYTES_EXCEEDED', 'SCRATCH_BYTES_EXCEEDED'],
    ['scratch proof SCRATCH_BYTES_MISMATCH', 'SCRATCH_BYTES_MISMATCH'],
    ['provider transcript bound', 'TRANSCRIPT_BOUND'],
    ['invalid provider transcript item', 'TRANSCRIPT_ITEM_INVALID'],
    ['foreign provider tool transcript item', 'TRANSCRIPT_FOREIGN_TOOL'],
    ['unscheduled provider tool transcript item', 'TRANSCRIPT_UNSCHEDULED_TOOL'],
    ['issued provider call drift', 'TRANSCRIPT_CALL_DRIFT'],
    ['provider output transcript drift', 'TRANSCRIPT_OUTPUT_DRIFT'],
    ['prior provider output changed', 'TRANSCRIPT_PRIOR_OUTPUT_CHANGED'],
    ['current provider continuation absent', 'TRANSCRIPT_CONTINUATION_ABSENT'],
    ['provider tool item before issuance', 'TRANSCRIPT_BEFORE_ISSUANCE'],
    ...directoryErrorReasons,
  ].map(row => Object.freeze(row)),
)
export const NATIVE_SESSION_DIAGNOSTIC_REASONS = Object.freeze([
  'NONE',
  'UNKNOWN',
  ...NATIVE_SESSION_ROUTE_REASONS.map(reason => `ROUTE_${reason}`),
  ...errorReasons.map(([, reason]) => reason),
])
const stages = new Set(NATIVE_SESSION_DIAGNOSTIC_STAGES)
const reasons = new Set(NATIVE_SESSION_DIAGNOSTIC_REASONS)
const routeReasons = new Map(NATIVE_SESSION_ROUTE_REASONS.map(reason => [reason, `ROUTE_${reason}`]))
const exactErrors = new Map(errorReasons)

function ownData(value, key) {
  try {
    const descriptor = value && Object.getOwnPropertyDescriptor(value, key)
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : null
  } catch {
    return null
  }
}

export function classifyNativeSessionError(error) {
  const message = ownData(error, 'message')
  return typeof message === 'string' && message.length <= 256 ? (exactErrors.get(message) ?? 'UNKNOWN') : 'UNKNOWN'
}

export function validateNativeSessionDiagnostic(value) {
  try {
    const fields = value && Object.getOwnPropertyDescriptors(value)
    if (
      !fields ||
      Reflect.ownKeys(fields).length !== 2 ||
      !Object.hasOwn(fields, 'stage') ||
      !Object.hasOwn(fields, 'reason') ||
      !Object.hasOwn(fields.stage, 'value') ||
      !Object.hasOwn(fields.reason, 'value') ||
      !fields.stage.enumerable ||
      !fields.reason.enumerable ||
      !stages.has(fields.stage.value) ||
      !reasons.has(fields.reason.value)
    )
      throw new Error('invalid')
    return Object.freeze({ stage: fields.stage.value, reason: fields.reason.value })
  } catch {
    throw new Error('T3 native session diagnostic contract')
  }
}

/** First failure wins. Diagnostic operations have no throwing callbacks and never retain their inputs. */
export function createNativeSessionDiagnostic() {
  let stage = 'IDLE'
  let reason = 'NONE'
  return Object.freeze({
    mark(value) {
      if (reason === 'NONE' && stages.has(value)) stage = value
    },
    recordError(error) {
      if (reason === 'NONE') reason = classifyNativeSessionError(error)
    },
    recordGateFailure(gate) {
      if (reason === 'NONE') reason = routeReasons.get(ownData(gate, 'reason')) ?? 'UNKNOWN'
    },
    snapshot: () => Object.freeze({ stage, reason }),
  })
}
