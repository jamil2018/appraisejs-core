/** Sanitized, single-attempt T2 failure receipt bound to the owned journal. */
import fs from 'node:fs'
import path from 'node:path'
import { POLICY, casePolicy } from './policy.mjs'

export const FAILURE_STAGES = Object.freeze([
  'LISTENER_ROUTE_HEADER',
  'BODY_READ_LIMIT',
  'UTF8_DECODE',
  'JSON_PARSE',
  'PROVIDER_BINDING',
  'DESCRIPTOR_GATE',
  'TRANSCRIPT_GATE',
  'AUDIT_SNAPSHOT',
  'CONTINUATION_DECODER',
  'AUDIT_COMPLETION',
  'NEXT_OUTER_RESERVATION',
  'RESPONSE_RECEIPT_WRITE',
  'HTTP_RESPONSE_VALIDATION_WRITE',
  'OTHER',
])
export const FAILURE_CLASSES = Object.freeze([
  'TRUSTED_BOUNDARY_FAILURE',
  'TRUSTED_GATE_REFUSAL',
  'TRUSTED_IO_FAILURE',
  'TRUSTED_AUDIT_FAILURE',
  'REGISTRY_ABSENCE',
  'DISPATCHED_MCP_ERROR',
  'OTHER',
])

const stages = new Set(FAILURE_STAGES)
const classes = new Set(FAILURE_CLASSES)
const ownDirectory = stat =>
  stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700
const ownFile = stat =>
  stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600
const same = (a, b) => a.dev === b.dev && a.ino === b.ino

function captureParents(io, root, caseId) {
  const parents = [root, path.join(root, 'cases'), path.join(root, 'cases', caseId)]
  parents.push(path.join(parents.at(-1), 'supervisor'))
  return parents.map(directory => {
    const stat = io.lstatSync(directory)
    if (!ownDirectory(stat)) throw new Error('provider failure ancestor ownership or mode')
    return { directory, stat }
  })
}

function checkParents(io, parents) {
  for (const parent of parents) {
    const current = io.lstatSync(parent.directory)
    if (!ownDirectory(current) || !same(current, parent.stat))
      throw new Error('provider failure ancestor identity changed')
  }
}

function providerCount(snapshot, caseId) {
  requireActive(snapshot, caseId)
  const count = snapshot?.counts?.providerRequests
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('provider failure journal count unavailable')
  return count
}

function requireActive(snapshot, caseId) {
  if (snapshot?.activeCase !== caseId || snapshot?.current !== caseId)
    throw new Error('provider failure active case mismatch')
}

function requestState(snapshot, caseId, index) {
  const id = `${caseId}-listener-request-${index}`
  if (!Array.isArray(snapshot.ids) || !Array.isArray(snapshot.pending) || !snapshot.ids.includes(id))
    throw new Error('provider failure reservation absent')
  const pending = snapshot.pending.filter(item => item.id === id)
  if (pending.length > 1 || pending.some(item => item.caseId !== caseId || item.kind !== 'providerRequests'))
    throw new Error('provider failure reservation state ambiguous')
  // Matrix journal snapshots retain IDs and pending rows; an ACK removes its pending row.
  return pending.length === 1 ? 'RESERVED_PENDING' : 'RESERVED_ACKNOWLEDGED'
}

function writeReceipt(io, parents, receipt) {
  checkParents(io, parents)
  const parent = parents.at(-1).directory
  const file = path.join(parent, 'provider-failure.json')
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
  const fd = io.openSync(
    file,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    const opened = io.fstatSync(fd)
    const listed = io.lstatSync(file)
    if (!ownFile(opened) || !ownFile(listed) || !same(opened, listed))
      throw new Error('provider failure file identity changed')
    checkParents(io, parents)
    io.writeFileSync(fd, bytes)
    io.fsyncSync(fd)
    const after = io.lstatSync(file)
    if (!ownFile(after) || !same(opened, after)) throw new Error('provider failure file replaced')
  } finally {
    io.closeSync(fd)
  }
  checkParents(io, parents)
  const dirfd = io.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    const opened = io.fstatSync(dirfd)
    if (!ownDirectory(opened) || !same(opened, parents.at(-1).stat))
      throw new Error('provider failure parent replaced before fsync')
    io.fsyncSync(dirfd)
    checkParents(io, parents)
  } finally {
    io.closeSync(dirfd)
  }
  return Object.freeze({ path: file, bytes: bytes.length })
}

export function createProviderFailureRecorder({ caseId, journal, root = POLICY.roots.T2, io = fs } = {}) {
  if (casePolicy(caseId).phase !== 'T2' || typeof journal?.snapshot !== 'function' || !path.isAbsolute(root))
    throw new Error('provider failure recorder contract')
  const parents = captureParents(io, root, caseId)
  const contexts = new WeakMap()
  let attempted = false

  function metadata(context) {
    const state = contexts.get(context)
    if (!state) throw new Error('provider failure foreign context')
    return state
  }

  function beginPreReservation() {
    if (attempted) throw new Error('provider failure already attempted')
    const snapshot = journal.snapshot()
    requireActive(snapshot, caseId)
    if (snapshot.fenced) throw new Error('provider failure pre-reservation fenced')
    const count = providerCount(snapshot, caseId)
    const ceiling = casePolicy(caseId).limits.providerRequests
    if (count > ceiling || !Array.isArray(snapshot.ids)) throw new Error('provider failure count invalid')
    const nextId = `${caseId}-listener-request-${count + 1}`
    if (snapshot.ids.includes(nextId)) throw new Error('provider failure next reservation already exists')
    const context = Object.freeze({})
    contexts.set(context, { kind: 'pre', count, stage: 'OTHER', bound: false })
    return context
  }

  function bindRequest(preContext, requestIndex) {
    const pre = metadata(preContext)
    if (pre.kind !== 'pre' || pre.bound || attempted) throw new Error('provider failure pre-context already bound')
    const ceiling = casePolicy(caseId).limits.providerRequests
    if (
      !Number.isSafeInteger(requestIndex) ||
      requestIndex <= 0 ||
      requestIndex > ceiling ||
      requestIndex !== pre.count + 1
    )
      throw new Error('provider failure request index mismatch')
    const snapshot = journal.snapshot()
    requireActive(snapshot, caseId)
    if (snapshot.fenced || providerCount(snapshot, caseId) !== requestIndex)
      throw new Error('provider failure latest request mismatch')
    requestState(snapshot, caseId, requestIndex)
    pre.bound = true
    const context = Object.freeze({})
    contexts.set(context, { kind: 'request', index: requestIndex, stage: pre.stage })
    return context
  }

  function mark(context, fixedStage) {
    const state = metadata(context)
    if (attempted || (state.kind === 'pre' && state.bound) || !stages.has(fixedStage))
      throw new Error('provider failure stage contract')
    state.stage = fixedStage
  }

  function record(context, fixedFailureClass) {
    const state = metadata(context)
    if (attempted || (state.kind === 'pre' && state.bound) || !classes.has(fixedFailureClass))
      throw new Error('provider failure record contract')
    // One attempt only, including uncertain write/fsync failures. The caller owns fencing and stop.
    attempted = true
    const snapshot = journal.snapshot()
    requireActive(snapshot, caseId)
    const count = providerCount(snapshot, caseId)
    let requestIndex = null
    let requestStatus = 'PRE_RESERVATION'
    if (state.kind === 'pre') {
      if (
        count !== state.count ||
        !Array.isArray(snapshot.ids) ||
        snapshot.ids.includes(`${caseId}-listener-request-${count + 1}`)
      )
        throw new Error('provider failure pre-reservation correlation changed')
    } else {
      requestIndex = state.index
      if (count !== requestIndex) throw new Error('provider failure latest request changed')
      requestStatus = requestState(snapshot, caseId, requestIndex)
    }
    return writeReceipt(io, parents, {
      schema: 'appraise.m02-ta-matrix-r19-provider-failure/v1',
      caseId,
      requestIndex,
      requestState: requestStatus,
      stage: state.stage,
      failureClass: fixedFailureClass,
      evidenceClass: 'TRUSTED_SUPERVISOR_SANITIZED_FAILURE',
      authority: 'DIAGNOSTIC_ONLY_NO_EFFECT_AUTHORITY',
    })
  }

  return Object.freeze({ beginPreReservation, bindRequest, mark, record })
}
