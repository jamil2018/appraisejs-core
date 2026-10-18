import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { POLICY, POLICY_DIGEST } from './policy.mjs'

const PREFIX = 'appraise-m02-ta-offline-'
const FILE = 'journal.jsonl'
const MAX_BYTES = 256 * 1024
const MAX_RECOVERY_RECORDS = POLICY.cases.length * 2
const ZERO = '0'.repeat(64)
const KINDS = Object.keys(POLICY.aggregate)
const hash = value => createHash('sha256').update(value).digest('hex')
const own = stat =>
  stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600
const copy = value => structuredClone(value)

function validateOuter(outerCeilings) {
  if (outerCeilings === undefined) return Object.fromEntries(POLICY.cases.map(item => [item.id, null]))
  if (
    !outerCeilings ||
    typeof outerCeilings !== 'object' ||
    Array.isArray(outerCeilings) ||
    Object.keys(outerCeilings).length !== POLICY.cases.length
  )
    throw new Error('exact outer-call ceilings required')
  for (const item of POLICY.cases) {
    const value = outerCeilings[item.id]
    const maximum = item.limits.scopedCalls || (item.phase === 'T3' ? 1 : 0)
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > maximum))
      throw new Error(`invalid outer-call ceiling: ${item.id}`)
  }
  return copy(outerCeilings)
}
function assertRoot(root) {
  const absolute = path.resolve(root)
  if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith(PREFIX))
    throw new Error('not an owned offline journal root')
  const stat = fs.lstatSync(absolute)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700)
    throw new Error('journal root identity or mode changed')
  return { absolute, stat }
}
function blank(outerCeilings) {
  return {
    policyDigest: POLICY_DIGEST,
    outerCeilings,
    index: 0,
    current: null,
    unknown: false,
    recoveryFenced: false,
    reason: null,
    counts: Object.fromEntries([...KINDS, 'outerCalls'].map(kind => [kind, 0])),
    caseCounts: {},
    ids: [],
    pending: [],
    acknowledged: [],
    completed: [],
    recovery: [],
  }
}
function apply(state, event) {
  if (event.type === 'begin') {
    if (state.unknown || state.current || POLICY.cases[state.index]?.id !== event.caseId)
      throw new Error('journal sequence invalid')
    state.current = event.caseId
    state.caseCounts[event.caseId] = Object.fromEntries([...KINDS, 'outerCalls'].map(kind => [kind, 0]))
  } else if (event.type === 'reserve') {
    if (!state.current || state.unknown || state.ids.includes(event.id)) throw new Error('journal reservation invalid')
    if (![...KINDS, 'outerCalls'].includes(event.kind)) throw new Error('unknown reservation kind')
    const item = POLICY.cases[state.index]
    const limit = event.kind === 'outerCalls' ? state.outerCeilings[item.id] : item.limits[event.kind]
    const aggregate =
      event.kind === 'outerCalls'
        ? Object.values(state.outerCeilings).reduce((sum, n) => sum + (n ?? 0), 0)
        : POLICY.aggregate[event.kind]
    if (limit === null || state.caseCounts[item.id][event.kind] >= limit || state.counts[event.kind] >= aggregate)
      throw new Error('reservation ceiling exceeded or blocked')
    state.ids.push(event.id)
    state.pending.push({ id: event.id, kind: event.kind, caseId: item.id })
    state.counts[event.kind]++
    state.caseCounts[item.id][event.kind]++
  } else if (event.type === 'ack') {
    const at = state.pending.findIndex(entry => entry.id === event.id && entry.caseId === state.current)
    if (state.unknown || at < 0) throw new Error('acknowledgement has no current reservation')
    state.acknowledged.push(state.pending.splice(at, 1)[0])
  } else if (event.type === 'finish') {
    const item = POLICY.cases[state.index]
    if (
      state.unknown ||
      state.current !== item?.id ||
      state.pending.length ||
      event.cleanupKnown !== true ||
      event.outcome !== item.expected
    )
      throw new Error('case cannot finish')
    const ack = kind => state.acknowledged.some(entry => entry.caseId === item.id && entry.kind === kind)
    if (
      (item.limits.scopedCalls > 0 && !ack('scopedCalls')) ||
      (item.expected === 'permission-denied' && !ack('permissionReplies')) ||
      (item.expected === 'workspace-effect' && !ack('workspaceActions'))
    )
      throw new Error('missing correlated acknowledged effect')
    state.completed.push({ caseId: item.id, outcome: event.outcome })
    state.current = null
    state.index++
  } else if (event.type === 'checkpoint') {
    if (state.unknown || state.pending.length) throw new Error('cannot checkpoint uncertain journal')
  } else if (event.type === 'recovery') {
    if (!(state.unknown || state.recoveryFenced || state.current || state.completed.length))
      throw new Error('recovery requires a fenced or started campaign')
    if (!['owned-stop-intent', 'owned-stop-observed'].includes(event.action)) throw new Error('unknown recovery action')
    if (typeof event.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(event.id))
      throw new Error('invalid recovery correlation id')
    if (
      state.recovery.length >= MAX_RECOVERY_RECORDS ||
      state.ids.includes(event.id) ||
      state.recovery.some(entry => entry.id === event.id)
    )
      throw new Error('recovery record ceiling or duplicate id')
    state.recovery.push({ id: event.id, action: event.action })
  } else if (event.type === 'unknown') {
    state.unknown = true
    state.reason = event.reason
  } else throw new Error('unknown journal record')
}

export class DurableTrustedJournal {
  constructor(root, rootStat, fd, fileStat, state, seq, previous, bytes) {
    Object.assign(this, { root, rootStat, fd, fileStat, state, seq, previous, bytes, closed: false })
    this._writeSync = fs.writeSync
    this._fsyncSync = fs.fsyncSync
  }
  static create({ outerCeilings } = {}) {
    const ceilings = validateOuter(outerCeilings)
    const root = fs.mkdtempSync(path.join(os.tmpdir(), PREFIX))
    fs.chmodSync(root, 0o700)
    const rootStat = assertRoot(root).stat
    let fd
    try {
      fd = fs.openSync(
        path.join(root, FILE),
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW,
        0o600,
      )
      fs.fsyncSync(fd)
      const dir = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
      try {
        fs.fsyncSync(dir)
      } finally {
        fs.closeSync(dir)
      }
      const journal = new DurableTrustedJournal(root, rootStat, fd, fs.fstatSync(fd), blank(ceilings), 0, ZERO, 0)
      journal._append({
        type: 'init',
        policyDigest: POLICY_DIGEST,
        outerCeilings: ceilings,
        rootIdentity: { dev: rootStat.dev, ino: rootStat.ino },
        fileIdentity: { dev: journal.fileStat.dev, ino: journal.fileStat.ino },
      })
      return journal
    } catch (error) {
      if (fd !== undefined) fs.closeSync(fd)
      throw error
    }
  }
  static open(root) {
    const checked = assertRoot(root)
    const file = path.join(checked.absolute, FILE)
    const stat = fs.lstatSync(file)
    if (!own(stat)) throw new Error('journal file identity or mode changed')
    const fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW)
    try {
      const opened = fs.fstatSync(fd)
      if (!own(opened) || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size > MAX_BYTES)
        throw new Error('journal file replaced or oversized')
      const data = fs.readFileSync(fd, 'utf8')
      const lines = data.split('\n')
      const tail = lines.pop()
      let state,
        previous = ZERO,
        seq = 0,
        corrupt = false,
        lastType = null
      for (const line of lines) {
        if (corrupt) break
        try {
          const record = JSON.parse(line)
          const body = JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event })
          if (record.seq !== seq + 1 || record.previous !== previous || record.hash !== hash(body))
            throw new Error('hash chain invalid')
          if (seq === 0) {
            if (
              record.event.type !== 'init' ||
              record.event.policyDigest !== POLICY_DIGEST ||
              record.event.rootIdentity?.dev !== checked.stat.dev ||
              record.event.rootIdentity?.ino !== checked.stat.ino ||
              record.event.fileIdentity?.dev !== opened.dev ||
              record.event.fileIdentity?.ino !== opened.ino
            )
              throw new Error('policy or journal identity mismatch')
            state = blank(validateOuter(record.event.outerCeilings))
          } else apply(state, record.event)
          previous = record.hash
          lastType = record.event.type
          seq++
        } catch {
          corrupt = true
        }
      }
      corrupt ||= Boolean(tail)
      if (!state) throw new Error('journal initialization missing or corrupt')
      const recoveryTail = lastType === 'recovery' && (state.unknown || state.current || state.completed.length > 0)
      if (corrupt || state.pending.length || (lastType !== 'checkpoint' && !recoveryTail)) {
        state.unknown = true
        state.reason = corrupt
          ? 'corrupt-or-partial-record'
          : state.pending.length
            ? 'unacknowledged-reservation-on-reopen'
            : 'missing-clean-close-checkpoint'
      }
      if (!state.unknown && state.index < POLICY.cases.length && (state.current || state.completed.length)) {
        state.recoveryFenced = true
        state.reason = 'restart-not-authorized'
      }
      const journal = new DurableTrustedJournal(
        checked.absolute,
        checked.stat,
        fd,
        opened,
        state,
        seq,
        previous,
        Buffer.byteLength(data),
      )
      journal.corrupt = corrupt
      return journal
    } catch (error) {
      fs.closeSync(fd)
      throw error
    }
  }
  _identity() {
    if (this.closed) throw new Error('journal closed')
    const root = assertRoot(this.root).stat
    const file = fs.lstatSync(path.join(this.root, FILE))
    const descriptor = fs.fstatSync(this.fd)
    if (
      root.dev !== this.rootStat.dev ||
      root.ino !== this.rootStat.ino ||
      !own(file) ||
      file.dev !== this.fileStat.dev ||
      file.ino !== this.fileStat.ino ||
      descriptor.dev !== file.dev ||
      descriptor.ino !== file.ino ||
      descriptor.size !== this.bytes
    )
      throw new Error('journal identity or length changed')
  }
  _append(event) {
    if (this.corrupt) throw new Error('corrupt journal is read-only')
    if (this.flushUncertain) throw new Error('uncertain journal flush is read-only')
    if (event.type !== 'recovery') {
      if (this.state.unknown) throw new Error('journal fenced unknown')
      if (this.state.recoveryFenced) throw new Error('campaign restart not authorized')
    }
    this._identity()
    const next = copy(this.state)
    if (event.type !== 'init') apply(next, event)
    const seq = this.seq + 1
    const body = JSON.stringify({ seq, previous: this.previous, event })
    const digest = hash(body)
    const line = Buffer.from(JSON.stringify({ seq, previous: this.previous, event, hash: digest }) + '\n')
    if (this.bytes + line.length > MAX_BYTES) throw new Error('journal size ceiling exceeded')
    try {
      let written = 0
      while (written < line.length) {
        const count = this._writeSync(this.fd, line, written, line.length - written, this.bytes + written)
        if (!Number.isSafeInteger(count) || count <= 0 || count > line.length - written)
          throw new Error('journal write did not advance')
        written += count
      }
      this._fsyncSync(this.fd)
    } catch (error) {
      this.state = next
      this.state.unknown = true
      this.state.reason = 'uncertain-journal-flush'
      this.flushUncertain = true
      throw error
    }
    this.state = next
    this.bytes += line.length
    this.previous = digest
    this.seq = seq
    return this.snapshot()
  }
  begin(caseId) {
    return this._append({ type: 'begin', caseId })
  }
  reserve(kind, id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id))
      throw new Error('invalid correlation id')
    return this._append({ type: 'reserve', kind, id })
  }
  acknowledge(id) {
    return this._append({ type: 'ack', id })
  }
  finish({ outcome, cleanupKnown } = {}) {
    return this._append({ type: 'finish', outcome, cleanupKnown })
  }
  markUnknown(reason = 'ambiguous-effect') {
    return this._append({ type: 'unknown', reason: String(reason).slice(0, 128) })
  }
  recordRecovery({ id, action } = {}) {
    if (!(this.state.unknown || this.state.recoveryFenced)) throw new Error('recovery requires fenced journal')
    return this._append({ type: 'recovery', id, action })
  }
  snapshot() {
    return copy({
      root: this.root,
      ...this.state,
      activeCase: this.state.current,
      fenced: this.state.unknown || this.state.recoveryFenced,
      seq: this.seq,
      bytes: this.bytes,
    })
  }
  close() {
    if (this.closed) return
    try {
      if (!this.state.unknown && !this.state.recoveryFenced && !this.state.pending.length && !this.corrupt)
        this._append({ type: 'checkpoint' })
    } catch {
      this.state.unknown = true
      this.state.reason = 'uncertain-clean-close'
    } finally {
      fs.closeSync(this.fd)
      this.closed = true
    }
  }
}
