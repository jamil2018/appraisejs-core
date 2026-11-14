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
] as const
export type NativeDiagnosticStage = (typeof nativeDiagnosticStages)[number]
type NativeDiagnosticStatus = 'ENTERED' | 'SETTLED' | 'ACCEPTED' | 'REFUSED' | 'TIMED_OUT' | 'UNKNOWN' | 'CLOSED'
type NativeDiagnosticReason =
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
