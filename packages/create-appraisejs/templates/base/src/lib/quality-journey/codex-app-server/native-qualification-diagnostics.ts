import {
  type BigIntStats,
  constants,
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  realpathSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'

const nativeDiagnosticStages = [
  'CASE_START',
  'SOURCE_ARMED',
  'ENDPOINT_CREATE',
  'PLAN_VERIFY',
  'ROOT_CREATE',
  'PRIVATE_CONFIG',
  'ACQUISITION',
  'STREAM_CAPTURE',
  'RPC_TRANSPORT',
  'CHILD_REGISTER',
  'OUTCOME_ATTACH',
  'CHILD_CLAIM',
  'OWNER_MATCH',
  'PERMIT_BIND',
  'INITIALIZE_REQUEST',
  'INITIALIZE_VALIDATE',
  'INITIALIZED_NOTIFY',
  'CONFIG_REQUEST',
  'CONFIG_VALIDATE',
  'THREAD_REQUEST',
  'THREAD_VALIDATE',
  'MCP_REQUEST',
  'MCP_VALIDATE',
  'TURN_REQUEST',
  'CASE_FAILURE',
  'CLEANUP',
  'CASE_CLOSE',
  'PASSIVE_PROTOCOL_REPLY',
  'PASSIVE_PROTOCOL_FRAME',
  'PASSIVE_PROTOCOL_ACCOUNT_UPDATED',
  'PASSIVE_PROTOCOL_REMOTE_STATUS',
  'PASSIVE_PROTOCOL_MCP_STARTUP',
  'PASSIVE_PROTOCOL_OTHER',
  'PASSIVE_OUTCOME_ACCOUNT_UPDATED',
  'PASSIVE_OUTCOME_REMOTE_STATUS',
  'PASSIVE_OUTCOME_MCP_STARTUP',
  'PASSIVE_OUTCOME_OTHER',
  'PASSIVE_STREAM',
  'PASSIVE_PRECLAIM',
] as const
export type NativeDiagnosticStage = (typeof nativeDiagnosticStages)[number]
type NativeDiagnosticStatus = 'ENTERED' | 'SETTLED' | 'ACCEPTED' | 'REFUSED' | 'TIMED_OUT' | 'UNKNOWN' | 'CLOSED'
export type NativeSourceNotificationRefusal =
  | 'NOTIFICATION_AFTER_CLEANUP'
  | 'NOTIFICATION_AFTER_CANDIDATE'
  | 'NOTIFICATION_LIMIT_EXCEEDED'
  | 'REMOTE_STATUS_NOT_DISABLED'
  | 'REMOTE_ENVIRONMENT_PRESENT'
  | 'REMOTE_STATUS_LIMIT_EXCEEDED'
  | 'THREAD_SCOPE_MISMATCH'
  | 'TURN_SCOPE_MISMATCH'
  | 'UNCLASSIFIED_NOTIFICATION'
  | 'SOURCE_NOTIFICATION_REFUSED'
type NativeDiagnosticReason =
  | NativeSourceNotificationRefusal
  | 'PROTOCOL_REFUSED'
  | 'OUTCOME_OBSERVER_REFUSED'
  | 'STREAM_PARSE_OR_IO_REFUSED'
  | 'PRECLAIM_CAPTURE_LIMIT'
  | 'NONE'
  | 'BOUNDARY_REFUSED'
  | 'OWNED_STARTUP_REFUSED'
  | 'ACQUISITION_DEADLINE'
  | 'REQUEST_REJECTED'
  | 'VALIDATION_REFUSED'
  | 'PASSIVE_CAPTURE_REFUSED'
  | 'CHILD_FAULT'
  | 'CLEANUP_UNCERTAIN'
  | 'DIAGNOSTIC_UNAVAILABLE'
export type NativeDiagnosticObserver = Readonly<{
  record(stage: NativeDiagnosticStage, status: NativeDiagnosticStatus, reason?: NativeDiagnosticReason): boolean
  failed(): boolean
  onFailure(fence: () => void): void
}>
const requests = new Set<NativeDiagnosticStage>([
  'INITIALIZE_REQUEST',
  'INITIALIZED_NOTIFY',
  'CONFIG_REQUEST',
  'THREAD_REQUEST',
  'MCP_REQUEST',
  'TURN_REQUEST',
])
const validations = new Set<NativeDiagnosticStage>([
  'INITIALIZE_VALIDATE',
  'CONFIG_VALIDATE',
  'THREAD_VALIDATE',
  'MCP_VALIDATE',
])
const passiveReasons = new Map<NativeDiagnosticStage, readonly NativeDiagnosticReason[]>([
  ['PASSIVE_PROTOCOL_REPLY', ['PROTOCOL_REFUSED']],
  ['PASSIVE_PROTOCOL_FRAME', ['PROTOCOL_REFUSED']],
  ['PASSIVE_PROTOCOL_ACCOUNT_UPDATED', ['PROTOCOL_REFUSED']],
  ['PASSIVE_PROTOCOL_REMOTE_STATUS', ['PROTOCOL_REFUSED']],
  ['PASSIVE_PROTOCOL_MCP_STARTUP', ['PROTOCOL_REFUSED']],
  ['PASSIVE_PROTOCOL_OTHER', ['PROTOCOL_REFUSED']],
  ['PASSIVE_STREAM', ['STREAM_PARSE_OR_IO_REFUSED']],
  ['PASSIVE_PRECLAIM', ['PRECLAIM_CAPTURE_LIMIT']],
])
const commonOutcomeReasons: readonly NativeDiagnosticReason[] = [
  'OUTCOME_OBSERVER_REFUSED',
  'NOTIFICATION_AFTER_CLEANUP',
  'NOTIFICATION_AFTER_CANDIDATE',
  'NOTIFICATION_LIMIT_EXCEEDED',
  'SOURCE_NOTIFICATION_REFUSED',
]
const scopedOutcomeReasons: readonly NativeDiagnosticReason[] = ['THREAD_SCOPE_MISMATCH', 'TURN_SCOPE_MISMATCH']
passiveReasons.set('PASSIVE_OUTCOME_ACCOUNT_UPDATED', [
  ...commonOutcomeReasons,
  ...scopedOutcomeReasons,
  'UNCLASSIFIED_NOTIFICATION',
])
passiveReasons.set('PASSIVE_OUTCOME_REMOTE_STATUS', [
  ...commonOutcomeReasons,
  'REMOTE_STATUS_NOT_DISABLED',
  'REMOTE_ENVIRONMENT_PRESENT',
  'REMOTE_STATUS_LIMIT_EXCEEDED',
])
passiveReasons.set('PASSIVE_OUTCOME_MCP_STARTUP', [...commonOutcomeReasons, ...scopedOutcomeReasons])
passiveReasons.set('PASSIVE_OUTCOME_OTHER', [
  ...commonOutcomeReasons,
  ...scopedOutcomeReasons,
  'UNCLASSIFIED_NOTIFICATION',
])

type DiagnosticPair = readonly [NativeDiagnosticStatus, NativeDiagnosticReason]
const closePairs: readonly DiagnosticPair[] = [
  ['ACCEPTED', 'NONE'],
  ['UNKNOWN', 'DIAGNOSTIC_UNAVAILABLE'],
]
const failurePairs: readonly DiagnosticPair[] = [
  ['UNKNOWN', 'BOUNDARY_REFUSED'],
  ['UNKNOWN', 'DIAGNOSTIC_UNAVAILABLE'],
]
const cleanupPairs: readonly DiagnosticPair[] = [
  ['SETTLED', 'NONE'],
  ['UNKNOWN', 'CLEANUP_UNCERTAIN'],
]
function matchesDiagnosticPair(
  status: NativeDiagnosticStatus,
  reason: NativeDiagnosticReason,
  pairs: readonly DiagnosticPair[],
) {
  return pairs.some(([allowedStatus, allowedReason]) => status === allowedStatus && reason === allowedReason)
}
function validDiagnosticRefusal(stage: NativeDiagnosticStage, reason: NativeDiagnosticReason) {
  switch (reason) {
    case 'BOUNDARY_REFUSED':
      return true
    case 'OWNED_STARTUP_REFUSED':
      return stage === 'ACQUISITION'
    case 'REQUEST_REJECTED':
      return requests.has(stage)
    case 'VALIDATION_REFUSED':
      return validations.has(stage)
    default:
      return false
  }
}
function validOperationDiagnostic(
  stage: NativeDiagnosticStage,
  status: NativeDiagnosticStatus,
  reason: NativeDiagnosticReason,
) {
  switch (status) {
    case 'UNKNOWN':
      return reason === 'CHILD_FAULT' || reason === 'PASSIVE_CAPTURE_REFUSED'
    case 'TIMED_OUT':
      return stage === 'ACQUISITION' && reason === 'ACQUISITION_DEADLINE'
    case 'REFUSED':
      return validDiagnosticRefusal(stage, reason)
    default:
      if (reason !== 'NONE') return false
      if (validations.has(stage)) return status === 'ACCEPTED'
      return status === 'SETTLED' || status === 'ACCEPTED'
  }
}
/** Closed projection only. It never accepts an exception, transport snapshot or producer payload. */
function validNativeDiagnostic(
  stage: NativeDiagnosticStage,
  status: NativeDiagnosticStatus,
  reason: NativeDiagnosticReason,
): boolean {
  if (!(nativeDiagnosticStages as readonly string[]).includes(stage)) return false
  const passive = passiveReasons.get(stage)
  if (passive) return status === 'REFUSED' && passive.includes(reason)
  if (stage === 'CASE_CLOSE') return matchesDiagnosticPair(status, reason, closePairs)
  if (stage === 'CASE_FAILURE') return matchesDiagnosticPair(status, reason, failurePairs)
  if (status === 'ENTERED') return reason === 'NONE'
  if (stage === 'CLEANUP') return matchesDiagnosticPair(status, reason, cleanupPairs)
  return validOperationDiagnostic(stage, status, reason)
}
function sameDiagnosticIdentity(current: BigIntStats, original: BigIntStats) {
  return current.dev === original.dev && current.ino === original.ino
}
function originalDiagnosticDirectory(current: BigIntStats, original: BigIntStats) {
  return current.isDirectory() && !current.isSymbolicLink() && sameDiagnosticIdentity(current, original)
}
function originalDiagnosticRegularFile(current: BigIntStats, original: BigIntStats) {
  return current.isFile() && !current.isSymbolicLink() && sameDiagnosticIdentity(current, original)
}
function privateDiagnosticMetadata(current: BigIntStats) {
  return (current.mode & BigInt(0o777)) === BigInt(0o600) && current.nlink === BigInt(1)
}

/** Original runner descriptor only; this object has no native or physical effect authority. */
export function createNativeQualificationDiagnostics(directory: string, freshRoot: string) {
  if (!path.isAbsolute(directory) || !path.isAbsolute(freshRoot)) throw new Error('Native diagnostic directory refused')
  const suppliedParent = lstatSync(directory, { bigint: true })
  if (!suppliedParent.isDirectory() || suppliedParent.isSymbolicLink())
    throw new Error('Native diagnostic directory refused')
  // Canonicalize existing ancestors before comparing placement; /var may alias /private/var on macOS.
  directory = realpathSync(directory)
  const canonicalFreshRoot = path.join(realpathSync(path.dirname(freshRoot)), path.basename(freshRoot))
  const relative = path.relative(canonicalFreshRoot, directory)
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)))
    throw new Error('Native diagnostic directory refused')
  const parent = lstatSync(directory, { bigint: true })
  const filename = path.join(directory, 'c1-acquisition-diagnostics.jsonl')
  const fd = openSync(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  const original = fstatSync(fd, { bigint: true })
  let sequence = 0,
    bytes = 0,
    failed = false,
    closed = false
  const fences: Array<() => void> = []
  function identity() {
    const currentParent = lstatSync(directory, { bigint: true }),
      current = lstatSync(filename, { bigint: true }),
      descriptor = fstatSync(fd, { bigint: true })
    if (
      !originalDiagnosticDirectory(currentParent, parent) ||
      !originalDiagnosticRegularFile(current, original) ||
      !sameDiagnosticIdentity(descriptor, original) ||
      !privateDiagnosticMetadata(current)
    )
      throw new Error('Native diagnostic identity refused')
  }
  function append(
    stage: NativeDiagnosticStage,
    status: NativeDiagnosticStatus,
    reason: NativeDiagnosticReason,
    terminal = false,
  ) {
    if (closed || !validNativeDiagnostic(stage, status, reason)) throw new Error('Native diagnostic projection refused')
    const row =
      JSON.stringify({ version: 'M13_C1_DIAGNOSTIC_V1', sequence: sequence + 1, stage, status, reason }) + '\n'
    const length = Buffer.byteLength(row)
    // Two final rows, each at most 256 bytes, remain available after normal observations.
    if (sequence >= (terminal ? 128 : 126) || bytes + length > (terminal ? 32768 : 32768 - 512))
      throw new Error('Native diagnostic bound refused')
    identity()
    if (writeSync(fd, row) !== length) throw new Error('Native diagnostic write refused')
    // A full write consumes its row/bytes even if the following flush fails.
    sequence++
    bytes += length
    fsyncSync(fd)
  }
  function fail() {
    if (failed) return
    failed = true
    for (const fence of fences.splice(0)) {
      try {
        fence()
      } catch {
        /* Existing cleanup remains the owner. */
      }
    }
    try {
      append('CASE_FAILURE', 'UNKNOWN', 'DIAGNOSTIC_UNAVAILABLE', true)
    } catch {
      /* Incomplete prefix remains UNKNOWN. */
    }
  }
  const observer: NativeDiagnosticObserver = Object.freeze({
    record(stage, status, reason = 'NONE') {
      if (failed || closed) return false
      try {
        append(stage, status, reason)
        return true
      } catch {
        fail()
        return false
      }
    },
    failed: () => failed,
    onFailure(fence) {
      if (failed) {
        try {
          fence()
        } catch {
          /* No new authority. */
        }
      } else if (!closed) {
        if (fences.length >= 8) fail()
        else fences.push(fence)
      }
    },
  })
  return Object.freeze({
    observer,
    close() {
      if (closed) return
      try {
        append('CASE_CLOSE', failed ? 'UNKNOWN' : 'ACCEPTED', failed ? 'DIAGNOSTIC_UNAVAILABLE' : 'NONE', true)
      } catch {
        fail()
      }
      closed = true
      try {
        closeSync(fd)
      } catch {
        fail()
      }
      fences.length = 0
    },
  })
}

export function requireNativeDiagnostic(
  observer: NativeDiagnosticObserver | undefined,
  stage: NativeDiagnosticStage,
  status: NativeDiagnosticStatus = 'ENTERED',
  reason: NativeDiagnosticReason = 'NONE',
) {
  if (observer && !observer.record(stage, status, reason))
    throw new Error('Native qualification diagnostic unavailable UNKNOWN')
}

/** Only closed method names are mapped; arbitrary transport fault strings never cross this boundary. */
export function nativeDiagnosticRequestStage(
  method: import('./rpc-transport').RpcRequestMethod | 'initialized',
): NativeDiagnosticStage {
  switch (method) {
    case 'initialize':
      return 'INITIALIZE_REQUEST'
    case 'config/read':
      return 'CONFIG_REQUEST'
    case 'thread/start':
      return 'THREAD_REQUEST'
    case 'mcpServerStatus/list':
      return 'MCP_REQUEST'
    case 'turn/start':
      return 'TURN_REQUEST'
    case 'initialized':
      return 'INITIALIZED_NOTIFY'
    default:
      throw new Error('Native diagnostic operation refused')
  }
}

/** Only literal classes are projected; unknown methods are never retained or hashed. */
export function nativePassiveOutcomeStage(method: unknown): NativeDiagnosticStage {
  switch (method) {
    case 'account/updated':
      return 'PASSIVE_OUTCOME_ACCOUNT_UPDATED'
    case 'remoteControl/status/changed':
      return 'PASSIVE_OUTCOME_REMOTE_STATUS'
    case 'mcpServer/startupStatus/updated':
      return 'PASSIVE_OUTCOME_MCP_STARTUP'
    default:
      return 'PASSIVE_OUTCOME_OTHER'
  }
}
function passiveProtocolNotificationStage(method: unknown): NativeDiagnosticStage {
  switch (method) {
    case 'account/updated':
      return 'PASSIVE_PROTOCOL_ACCOUNT_UPDATED'
    case 'remoteControl/status/changed':
      return 'PASSIVE_PROTOCOL_REMOTE_STATUS'
    case 'mcpServer/startupStatus/updated':
      return 'PASSIVE_PROTOCOL_MCP_STARTUP'
    default:
      return 'PASSIVE_PROTOCOL_OTHER'
  }
}
export function nativePassiveProtocolStage(frame: unknown): NativeDiagnosticStage {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return 'PASSIVE_PROTOCOL_FRAME'
  try {
    if (Object.hasOwn(frame, 'id')) return 'PASSIVE_PROTOCOL_REPLY'
    // Parsed JSON has data properties. Accessor-shaped synthetic values stay the opaque frame class.
    const method = Object.getOwnPropertyDescriptor(frame, 'method')?.value
    const params = Object.getOwnPropertyDescriptor(frame, 'params')?.value
    if (typeof method !== 'string' || !params || typeof params !== 'object' || Array.isArray(params))
      return 'PASSIVE_PROTOCOL_FRAME'
    return passiveProtocolNotificationStage(method)
  } catch {
    return 'PASSIVE_PROTOCOL_FRAME'
  }
}
