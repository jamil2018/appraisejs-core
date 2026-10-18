/** Fixed selected T2 case late-case observation only; no execution, acceptance, cleanup, or runtime authority. */
import fs from 'node:fs'
import { validateGitReadinessSummary, GIT_READINESS_FAILURE_REASONS } from './git-readiness.mjs'
import { validateChildPathDiagnostics } from './child-path-diagnostic.mjs'
import { validateProcessStateDiagnostic } from './process-state-diagnostic.mjs'
import path from 'node:path'
import { ROOT, POLICY } from './policy.mjs'

export const LATE_CASE_FAILURE_STAGES = Object.freeze([
  'CASE_START',
  'WAIT_TERMINAL',
  'TERMINAL_PHASE_CHECK',
  'PATH_PROFILE_CHECK',
  'GIT_READINESS',
  'HOST_LIVE_CHECK',
  'OWNED_STOP_VERIFY',
  'OWNED_CLOSE_WAIT',
  'CHILD_EXIT_READ',
  'CANONICAL_OUTCOME',
  'CHILD_EXIT_VERIFY',
  'EFFECT_COUNTS',
  'SCRIPT_COMPLETION',
  'EVIDENCE_CONJUNCTION',
  'CASE_WITNESS_WRITE',
  'CANONICAL_CLOSE',
  'CASE_COMMIT',
])
export const LATE_CASE_GATE_FIELDS = Object.freeze([
  'lifecycle',
  'child',
  'canonical',
  'effectCounts',
  'script',
  'pendingEmpty',
  'unfenced',
])
export const LATE_CASE_FAILURE_CODES = Object.freeze([
  'ENOENT',
  'EACCES',
  'EPERM',
  'EEXIST',
  'EIO',
  'EBADF',
  'EINVAL',
  'EISDIR',
  'ENOTDIR',
  'ELOOP',
  'EMFILE',
  'ENFILE',
  'ENOSPC',
  'EROFS',
  'ENOTEMPTY',
  'OWNED_HOST_OBSERVATION_UNKNOWN',
])

// Exact public constants from the frozen observer, R25 runner, and R25 launcher only.
// A match identifies the reported boundary; it cannot attest error origin or a deeper cause.
const reasons = new Map([
  ...GIT_READINESS_FAILURE_REASONS,
  ['owned stop port unavailable', 'OWNED_STOP_PORT_UNAVAILABLE'],
  ['host pin drift', 'HOST_PIN_DRIFT'],
  ['host file metadata rejected', 'HOST_FILE_METADATA_REJECTED'],
  ['host file pin mismatch', 'HOST_FILE_PIN_MISMATCH'],
  ['trusted spawn and host pin ports required', 'OBSERVER_PORTS_REQUIRED'],
  ['bounded OS metadata port required', 'OS_METADATA_PORT_REQUIRED'],
  ['invalid polling limits', 'POLLING_LIMITS_INVALID'],
  ['invalid direct child allowlist', 'DIRECT_CHILD_ALLOWLIST_INVALID'],
  ['host cannot be an other child', 'HOST_CHILD_ALLOWLIST_CONFLICT'],
  ['host pin verification unavailable', 'HOST_PIN_VERIFICATION_UNAVAILABLE'],
  ['owned child event handle missing', 'OWNED_CHILD_EVENT_HANDLE_MISSING'],
  ['live owned child handle and stop port required', 'OWNED_CHILD_NOT_LIVE_OR_STOP_PORT_MISSING'],
  ['owned child identity unavailable or inconsistent', 'OWNED_CHILD_IDENTITY_UNAVAILABLE'],
  ['owned child has unexpected parent', 'OWNED_CHILD_PARENT_MISMATCH'],
  ['owned child exited during binding', 'OWNED_CHILD_EXITED_DURING_BINDING'],
  ['owned child no longer live', 'OWNED_CHILD_NOT_LIVE'],
  ['host poll quota exceeded', 'HOST_POLL_QUOTA_EXCEEDED'],
  ['owned child identity changed', 'OWNED_CHILD_IDENTITY_CHANGED'],
  ['direct child enumeration invalid', 'DIRECT_CHILD_ENUMERATION_INVALID'],
  ['direct child PID invalid', 'DIRECT_CHILD_PID_INVALID'],
  ['direct child parent or identity mismatch', 'DIRECT_CHILD_IDENTITY_MISMATCH'],
  ['duplicate live code mode hosts', 'DUPLICATE_LIVE_HOSTS'],
  ['unreviewed direct child observed', 'UNREVIEWED_DIRECT_CHILD'],
  ['owned child identity changed during observation', 'OWNED_CHILD_IDENTITY_CHANGED_DURING_OBSERVATION'],
  ['second code mode host identity', 'SECOND_HOST_IDENTITY'],
  ['no observed live code mode host', 'LIVE_HOST_NOT_OBSERVED'],
  ['owned stop already requested', 'OWNED_STOP_ALREADY_REQUESTED'],
  ['owned Codex exit and close uncertain', 'OWNED_EXIT_CLOSE_UNCERTAIN'],
  ['live host completion check required before qualified stop', 'LIVE_HOST_COMPLETION_CHECK_MISSING'],
  ['post-stop host identity uncertain', 'POST_STOP_HOST_IDENTITY_UNCERTAIN'],
  ['original code mode host absence uncertain', 'ORIGINAL_HOST_ABSENCE_UNCERTAIN'],
  ['reviewed T2 composition ports missing', 'COMPOSITION_PORTS_MISSING'],
  ['exact T2 review absent', 'EXACT_REVIEW_ABSENT'],
  ['T2 preparation changed after exact review', 'PREPARATION_REVIEW_DRIFT'],
  ['fixed T2 root already exists; no resume', 'ROOT_ALREADY_EXISTS'],
  ['matrix canonical pin absent', 'CANONICAL_PIN_ABSENT'],
  ['private native umask unavailable', 'PRIVATE_UMASK_UNAVAILABLE'],
  ['new T2 root identity', 'ROOT_IDENTITY_INVALID'],
  ['canonical bundle exports missing', 'CANONICAL_EXPORTS_MISSING'],
  ['matrix terminal phase mismatch', 'TERMINAL_PHASE_MISMATCH'],
  ['owned host cleanup uncertain', 'HOST_CLEANUP_UNCERTAIN'],
  ['case evidence incomplete', 'CASE_EVIDENCE_INCOMPLETE'],
  ['case not in approved phase', 'CASE_OUTSIDE_APPROVED_PHASE'],
  ['scoped child entry/interpreter missing', 'SCOPED_CHILD_ENTRY_MISSING'],
  ['canonical bridge composition required', 'CANONICAL_BRIDGE_REQUIRED'],
  ['audit capability binding required', 'AUDIT_CAPABILITY_REQUIRED'],
  ['scoped audit session required', 'SCOPED_AUDIT_REQUIRED'],
  ['owned Code Mode host observer required', 'HOST_OBSERVER_REQUIRED'],
  ['provider request before owned thread and turn correlation', 'PROVIDER_BEFORE_THREAD_TURN_CORRELATION'],
  ['scripted provider route absent before child start', 'PROVIDER_ROUTE_ABSENT'],
  ['owned host observer spawn gate missing', 'HOST_OBSERVER_SPAWN_GATE_MISSING'],
  ['owned host observer missing', 'HOST_OBSERVER_MISSING'],
  ['owned stdio channels missing', 'OWNED_STDIO_MISSING'],
  ['durable phase UNKNOWN', 'DURABLE_PHASE_UNKNOWN'],
  ['owned Codex exit or close unobserved', 'OWNED_EXIT_OR_CLOSE_UNOBSERVED'],
])
export const LATE_CASE_FAILURE_REASONS = Object.freeze([...new Set([...reasons.values(), 'OTHER'])])
const stages = new Set(LATE_CASE_FAILURE_STAGES)
const codes = new Set(LATE_CASE_FAILURE_CODES)
const same = (a, b) => a.dev === b.dev && a.ino === b.ino
const privateDirectory = stat =>
  stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700
const privateFile = stat =>
  stat.isFile() &&
  !stat.isSymbolicLink() &&
  stat.nlink === 1 &&
  stat.uid === process.getuid() &&
  (stat.mode & 0o777) === 0o600

function fixedError(error) {
  const output = { reason: 'OTHER' }
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return output
  const message = Object.getOwnPropertyDescriptor(error, 'message')
  if (message && Object.hasOwn(message, 'value') && typeof message.value === 'string')
    output.reason = reasons.get(message.value) ?? 'OTHER'
  const code = Object.getOwnPropertyDescriptor(error, 'code')
  if (code && Object.hasOwn(code, 'value') && codes.has(code.value)) output.code = code.value
  return output
}

function fixedGates(gates) {
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) throw new Error('late-case gate contract')
  const fields = Object.getOwnPropertyDescriptors(gates)
  if (
    Reflect.ownKeys(fields).length !== LATE_CASE_GATE_FIELDS.length ||
    Object.keys(fields).sort().join(',') !== [...LATE_CASE_GATE_FIELDS].sort().join(',')
  )
    throw new Error('late-case gate contract')
  return Object.fromEntries(
    LATE_CASE_GATE_FIELDS.map(key => {
      const field = fields[key]
      if (!Object.hasOwn(field, 'value') || ![true, false, null].includes(field.value))
        throw new Error('late-case gate contract')
      return [key, field.value === true ? 'PASS' : field.value === false ? 'FAIL' : 'NOT_REACHED']
    }),
  )
}

function checkParents(io, parents) {
  for (const parent of parents) {
    const current = io.lstatSync(parent.directory)
    if (!privateDirectory(current) || !same(current, parent.stat))
      throw new Error('late-case ancestor identity changed')
  }
}

export function writeLateCaseFailure({
  caseId,
  stage,
  error,
  gates,
  childPaths,
  gitReadiness,
  processStates,
  io = fs,
} = {}) {
  if (!POLICY.cases.some(item => item.phase === 'T2' && item.id === caseId)) throw new Error('late-case case contract')
  if (!stages.has(stage)) throw new Error('late-case stage contract')
  const fixed = fixedError(error)
  const bytes = Buffer.from(
    `${JSON.stringify({
      schema: 'appraise.m02-ta-matrix-r48-late-case-failure/v1',
      caseId,
      stage,
      reason: fixed.reason,
      gates: fixedGates(gates),
      childPaths: validateChildPathDiagnostics(childPaths),
      gitReadiness: validateGitReadinessSummary(gitReadiness),
      processStates: validateProcessStateDiagnostic(processStates),
      ...(fixed.code ? { code: fixed.code } : {}),
      evidenceClass: 'TRUSTED_SUPERVISOR_SANITIZED_LATE_CASE_FAILURE',
      rawExceptionRetained: false,
    })}\n`,
  )
  if (bytes.length > 4096) throw new Error('late-case receipt ceiling')
  const directories = [ROOT, path.join(ROOT, 'cases'), path.join(ROOT, 'cases', caseId)]
  directories.push(path.join(directories.at(-1), 'supervisor'))
  const parents = directories.map(directory => {
    const stat = io.lstatSync(directory)
    if (!privateDirectory(stat)) throw new Error('late-case ancestor ownership or mode')
    return { directory, stat }
  })
  checkParents(io, parents)
  const parent = parents.at(-1)
  const file = path.join(parent.directory, 'late-case-failure.json')
  const fd = io.openSync(
    file,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    const opened = io.fstatSync(fd)
    const listed = io.lstatSync(file)
    if (!privateFile(opened) || !privateFile(listed) || !same(opened, listed))
      throw new Error('late-case receipt identity changed')
    checkParents(io, parents)
    io.writeFileSync(fd, bytes)
    io.fsyncSync(fd)
    const after = io.lstatSync(file)
    if (!privateFile(after) || !same(opened, after)) throw new Error('late-case receipt replaced')
  } finally {
    io.closeSync(fd)
  }
  checkParents(io, parents)
  const dirfd = io.openSync(
    parent.directory,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  )
  try {
    const opened = io.fstatSync(dirfd)
    if (!privateDirectory(opened) || !same(opened, parent.stat))
      throw new Error('late-case parent replaced before fsync')
    io.fsyncSync(dirfd)
    checkParents(io, parents)
  } finally {
    io.closeSync(dirfd)
  }
  return Object.freeze({ path: file, bytes: bytes.length, stage, reason: fixed.reason })
}
