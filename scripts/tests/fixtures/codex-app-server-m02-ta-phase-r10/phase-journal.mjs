import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { POLICY, POLICY_DIGEST } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { PHASE_OUTER_POLICY, outerMaximum, auditRequestMaximum } from './phase-outer-policy.mjs'

const FILE = 'phase-journal.jsonl'
const MAX_BYTES = 512 * 1024
const ZERO = '0'.repeat(64)
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const EFFECT_KINDS = new Set([...Object.keys(POLICY.aggregate), 'outerCalls', 'auditRequests'])
const sha = value => createHash('sha256').update(value).digest('hex')
const clone = value => structuredClone(value)
const casesFor = phase => {
  if (phase !== 'T2' && phase !== 'T3') throw new Error('unsupported phase')
  return POLICY.cases.filter(item => item.phase === phase)
}
const ownDirectory = directory => {
  const stat = fs.lstatSync(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700)
    throw new Error('journal directory identity or mode changed')
  return stat
}
const ownFile = stat =>
  stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600
const exactTime = value =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value

// These are source-level ceilings. They do not attest the host's actual process count.
export function conservativeHostBudget(caseId) {
  const item = casesFor('T2')
    .concat(casesFor('T3'))
    .find(entry => entry.id === caseId)
  if (!item) throw new Error('unknown phase case')
  const outerExec = outerMaximum(item)
  return Object.freeze({
    sourceMaximum: item.id === 'P00' ? 0 : 1 + outerExec,
    codexStartMaximum: 1,
    outerExecMaximum: outerExec,
    prewarm: false,
    wait: false,
    terminate: false,
    retry: false,
    actualHostCountAttested: false,
  })
}

function initial(phase, directory, fileStat, directoryStat) {
  return {
    phase,
    policyDigest: POLICY_DIGEST,
    directoryIdentity: { dev: directoryStat.dev, ino: directoryStat.ino },
    fileIdentity: { dev: fileStat.dev, ino: fileStat.ino },
    cases: casesFor(phase).map(item => item.id),
    index: 0,
    current: null,
    startedAt: null,
    caseStartedAt: null,
    pending: [],
    ids: [],
    counts: {},
    sourceHostCapacity: {},
    completed: [],
    recovery: [],
    unknown: false,
    reason: null,
    directory,
  }
}

function apply(state, event) {
  const item = casesFor(state.phase)[state.index]
  if (event.type === 'begin') {
    const expectedCapacity = conservativeHostBudget(item?.id).sourceMaximum
    const allocatedCapacity = Object.values(state.sourceHostCapacity).reduce((sum, value) => sum + value, 0)
    if (
      state.unknown ||
      state.current ||
      item?.id !== event.caseId ||
      !exactTime(event.at) ||
      event.sourceHostCapacity !== expectedCapacity ||
      event.evidenceClass !== 'SOURCE_BOUND_CAPACITY_RESERVED' ||
      allocatedCapacity + event.sourceHostCapacity > 62
    )
      throw new Error('case order invalid')
    state.current = item.id
    state.caseStartedAt = event.at
    state.sourceHostCapacity[item.id] = event.sourceHostCapacity
    state.counts[item.id] = Object.fromEntries([...EFFECT_KINDS].map(kind => [kind, 0]))
  } else if (event.type === 'reserve') {
    if (
      state.unknown ||
      !state.current ||
      !ID.test(event.id) ||
      state.ids.includes(event.id) ||
      !EFFECT_KINDS.has(event.kind)
    )
      throw new Error('reservation invalid')
    const ceiling =
      event.kind === 'outerCalls'
        ? conservativeHostBudget(item.id).outerExecMaximum
        : event.kind === 'auditRequests'
          ? auditRequestMaximum(item)
          : item.limits[event.kind]
    if (state.counts[item.id][event.kind] >= ceiling) throw new Error('case ceiling exceeded')
    const aggregate =
      event.kind === 'outerCalls'
        ? PHASE_OUTER_POLICY.aggregateMaximum
        : event.kind === 'auditRequests'
          ? PHASE_OUTER_POLICY.auditRequestsAggregateMaximum
          : POLICY.aggregate[event.kind]
    const used = Object.values(state.counts).reduce((n, counts) => n + counts[event.kind], 0)
    if (used >= aggregate) throw new Error('aggregate ceiling exceeded')
    state.ids.push(event.id)
    state.pending.push({ caseId: item.id, kind: event.kind, id: event.id })
    state.counts[item.id][event.kind]++
  } else if (event.type === 'ack') {
    const index = state.pending.findIndex(entry => entry.id === event.id && entry.caseId === state.current)
    if (state.unknown || index < 0) throw new Error('acknowledgement has no reservation')
    state.pending.splice(index, 1)
  } else if (event.type === 'finish') {
    if (
      state.unknown ||
      !item ||
      state.current !== item.id ||
      state.pending.length ||
      event.outcome !== item.expected ||
      event.cleanupKnown !== true ||
      (event.caseWitnessSha256 !== undefined && !/^[a-f0-9]{64}$/.test(event.caseWitnessSha256)) ||
      !exactTime(event.at)
    )
      throw new Error('case cannot finish')
    if (item.id !== 'P00' && state.counts[item.id].turnStarts !== 1) throw new Error('turn not reserved')
    if (item.id === 'P00' && (state.counts[item.id].turnStarts || state.counts[item.id].providerRequests))
      throw new Error('P00 effects forbidden')
    state.completed.push({
      caseId: item.id,
      outcome: event.outcome,
      at: event.at,
      ...(event.caseWitnessSha256 ? { caseWitnessSha256: event.caseWitnessSha256 } : {}),
    })
    state.current = null
    state.caseStartedAt = null
    state.index++
  } else if (event.type === 'unknown') {
    if (
      state.unknown ||
      !exactTime(event.at) ||
      ![
        'AMBIGUOUS_EFFECT',
        'ACK_LOST',
        'RECOVERY',
        'REVOKED',
        'DEADLINE',
        'PROTOCOL',
        'BUDGET',
        'ERROR',
        'YIELD',
        'CLEANUP',
      ].includes(event.reason)
    )
      throw new Error('invalid unknown fence')
    state.unknown = true
    state.reason = event.reason
  } else if (event.type === 'recovery') {
    if (
      !state.unknown ||
      !ID.test(event.id) ||
      !['owned-stop-intent', 'owned-stop-observed'].includes(event.action) ||
      state.recovery.length >= state.cases.length * 2 ||
      state.recovery.some(entry => entry.id === event.id)
    )
      throw new Error('invalid recovery record')
    state.recovery.push({ id: event.id, action: event.action })
  } else if (event.type === 'checkpoint') {
    if (state.unknown || state.pending.length) throw new Error('uncertain checkpoint')
  } else throw new Error('unknown journal event')
}

export class DurablePhaseJournal {
  constructor(directory, fd, fileStat, directoryStat, state, seq, previous, bytes) {
    Object.assign(this, { directory, fd, fileStat, directoryStat, state, seq, previous, bytes, closed: false })
    this._writeSync = fs.writeSync
    this._fsyncSync = fs.fsyncSync
    this._now = Date.now
  }
  static create({ directory, phase }) {
    casesFor(phase)
    if (!path.isAbsolute(directory)) throw new Error('absolute private directory required')
    const directoryStat = ownDirectory(directory)
    const file = path.join(directory, FILE)
    const fd = fs.openSync(
      file,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW,
      0o600,
    )
    try {
      fs.fsyncSync(fd)
      const dirfd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
      try {
        fs.fsyncSync(dirfd)
      } finally {
        fs.closeSync(dirfd)
      }
      const fileStat = fs.fstatSync(fd)
      const state = initial(phase, directory, fileStat, directoryStat)
      const journal = new DurablePhaseJournal(directory, fd, fileStat, directoryStat, state, 0, ZERO, 0)
      journal._append({
        type: 'init',
        phase,
        policyDigest: POLICY_DIGEST,
        startedAt: new Date().toISOString(),
        directoryIdentity: state.directoryIdentity,
        fileIdentity: state.fileIdentity,
      })
      return journal
    } catch (error) {
      fs.closeSync(fd)
      throw error
    }
  }
  static open({ directory, phase }) {
    casesFor(phase)
    if (!path.isAbsolute(directory)) throw new Error('absolute private directory required')
    const directoryStat = ownDirectory(directory)
    const stat = fs.lstatSync(path.join(directory, FILE))
    if (!ownFile(stat)) throw new Error('journal file identity or mode changed')
    const fd = fs.openSync(path.join(directory, FILE), fs.constants.O_RDWR | fs.constants.O_NOFOLLOW)
    try {
      const fileStat = fs.fstatSync(fd)
      if (!ownFile(fileStat) || fileStat.dev !== stat.dev || fileStat.ino !== stat.ino || fileStat.size > MAX_BYTES)
        throw new Error('journal file changed')
      const data = fs.readFileSync(fd, 'utf8')
      let state = initial(phase, directory, fileStat, directoryStat),
        seq = 0,
        previous = ZERO,
        corrupt = false,
        last = null
      const lines = data.split('\n')
      const partialTail = Boolean(lines.pop())
      for (const line of lines) {
        if (corrupt) break
        try {
          const record = JSON.parse(line)
          const body = JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event })
          if (record.seq !== seq + 1 || record.previous !== previous || record.hash !== sha(body))
            throw new Error('chain invalid')
          if (seq === 0) {
            if (
              record.event.type !== 'init' ||
              record.event.phase !== phase ||
              record.event.policyDigest !== POLICY_DIGEST ||
              !exactTime(record.event.startedAt) ||
              record.event.directoryIdentity?.dev !== directoryStat.dev ||
              record.event.directoryIdentity?.ino !== directoryStat.ino ||
              record.event.fileIdentity?.dev !== fileStat.dev ||
              record.event.fileIdentity?.ino !== fileStat.ino
            )
              throw new Error('init mismatch')
            state.startedAt = record.event.startedAt
          } else apply(state, record.event)
          seq++
          previous = record.hash
          last = record.event.type
        } catch {
          corrupt = true
        }
      }
      corrupt ||= partialTail
      if (!seq) throw new Error('journal init absent')
      if (
        corrupt ||
        (!state.unknown &&
          (state.pending.length ||
            (last !== 'checkpoint' && last !== 'unknown' && last !== 'recovery') ||
            state.current ||
            state.completed.length))
      ) {
        state.unknown = true
        state.reason = corrupt ? 'CORRUPT' : state.pending.length ? 'ACK_LOST' : 'RECOVERY'
      }
      const journal = new DurablePhaseJournal(
        directory,
        fd,
        fileStat,
        directoryStat,
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
    const dir = ownDirectory(this.directory)
    const file = fs.lstatSync(path.join(this.directory, FILE))
    const opened = fs.fstatSync(this.fd)
    if (
      dir.dev !== this.directoryStat.dev ||
      dir.ino !== this.directoryStat.ino ||
      !ownFile(file) ||
      file.dev !== this.fileStat.dev ||
      file.ino !== this.fileStat.ino ||
      opened.dev !== file.dev ||
      opened.ino !== file.ino ||
      opened.size !== this.bytes
    )
      throw new Error('journal identity or length changed')
  }
  _append(event) {
    if (this.corrupt || this.flushUncertain || (this.state.unknown && event.type !== 'recovery'))
      throw new Error('journal fenced')
    this._identity()
    const next = clone(this.state)
    if (event.type !== 'init') apply(next, event)
    const seq = this.seq + 1
    const body = JSON.stringify({ seq, previous: this.previous, event })
    const hash = sha(body)
    const line = Buffer.from(JSON.stringify({ seq, previous: this.previous, event, hash }) + '\n')
    if (this.bytes + line.length > MAX_BYTES) throw new Error('journal size ceiling exceeded')
    try {
      let offset = 0
      while (offset < line.length) {
        const n = this._writeSync(this.fd, line, offset, line.length - offset, this.bytes + offset)
        if (!Number.isSafeInteger(n) || n <= 0 || n > line.length - offset) throw new Error('journal short write')
        offset += n
      }
      this._fsyncSync(this.fd)
    } catch (error) {
      this.state.unknown = true
      this.state.reason = 'UNCERTAIN_FLUSH'
      this.flushUncertain = true
      throw error
    }
    this.state = next
    if (event.type === 'init') this.state.startedAt = event.startedAt
    this.seq = seq
    this.previous = hash
    this.bytes += line.length
    return this.snapshot()
  }
  _deadline() {
    const now = this._now()
    if (
      now - Date.parse(this.state.startedAt) > POLICY.deadlineMs[this.state.phase] ||
      (this.state.caseStartedAt && now - Date.parse(this.state.caseStartedAt) > POLICY.deadlineMs.case)
    ) {
      this.markUnknown('DEADLINE')
      throw new Error('phase or case deadline exceeded; UNKNOWN')
    }
  }
  begin(caseId) {
    this._deadline()
    return this._append({
      type: 'begin',
      caseId,
      at: new Date().toISOString(),
      sourceHostCapacity: conservativeHostBudget(caseId).sourceMaximum,
      evidenceClass: 'SOURCE_BOUND_CAPACITY_RESERVED',
    })
  }
  reserve(kind, id) {
    this._deadline()
    return this._append({ type: 'reserve', kind, id })
  }
  acknowledge(id) {
    return this._append({ type: 'ack', id })
  }
  finish({ outcome, cleanupKnown, caseWitnessSha256 }) {
    this._deadline()
    return this._append({
      type: 'finish',
      outcome,
      cleanupKnown,
      at: new Date().toISOString(),
      ...(caseWitnessSha256 === undefined ? {} : { caseWitnessSha256 }),
    })
  }
  markUnknown(reason) {
    return this._append({ type: 'unknown', reason, at: new Date().toISOString() })
  }
  recordRecovery({ id, action }) {
    return this._append({ type: 'recovery', id, action })
  }
  snapshot() {
    return clone({ ...this.state, seq: this.seq, bytes: this.bytes, fenced: this.state.unknown })
  }
  closeAndVerifyTerminal() {
    this.close()
    try {
      if (
        this.state.unknown ||
        this.flushUncertain ||
        this.state.current ||
        this.state.pending.length ||
        this.state.completed.length !== this.state.cases.length
      )
        throw new Error('terminal journal incomplete or uncertain')
      const directory = ownDirectory(this.directory)
      if (directory.dev !== this.directoryStat.dev || directory.ino !== this.directoryStat.ino)
        throw new Error('terminal journal directory replaced')
      const file = path.join(this.directory, FILE)
      const before = fs.lstatSync(file)
      if (
        !ownFile(before) ||
        before.nlink !== 1 ||
        before.dev !== this.fileStat.dev ||
        before.ino !== this.fileStat.ino ||
        before.size !== this.bytes ||
        before.size > MAX_BYTES
      )
        throw new Error('terminal journal identity changed')
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
      try {
        const held = fs.fstatSync(fd)
        if (held.dev !== before.dev || held.ino !== before.ino || held.size !== before.size)
          throw new Error('terminal journal opened identity changed')
        const bytes = fs.readFileSync(fd)
        const after = fs.lstatSync(file)
        if (
          bytes.length !== this.bytes ||
          [fs.fstatSync(fd), after].some(
            stat =>
              stat.dev !== before.dev ||
              stat.ino !== before.ino ||
              stat.size !== before.size ||
              stat.mtimeMs !== before.mtimeMs,
          )
        )
          throw new Error('terminal journal changed during read')
        const text = bytes.toString('utf8')
        if (!text.endsWith('\n')) throw new Error('terminal journal partial line')
        const records = text
          .slice(0, -1)
          .split('\n')
          .map(line => JSON.parse(line))
        let previous = ZERO
        const replay = initial(this.state.phase, this.directory, this.fileStat, this.directoryStat)
        for (const [index, record] of records.entries()) {
          if (
            record.seq !== index + 1 ||
            record.previous !== previous ||
            record.hash !== sha(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
          )
            throw new Error('terminal journal chain changed')
          if (index === 0) {
            if (
              record.event.type !== 'init' ||
              record.event.phase !== this.state.phase ||
              record.event.policyDigest !== POLICY_DIGEST ||
              !exactTime(record.event.startedAt) ||
              JSON.stringify(record.event.directoryIdentity) !== JSON.stringify(replay.directoryIdentity) ||
              JSON.stringify(record.event.fileIdentity) !== JSON.stringify(replay.fileIdentity)
            )
              throw new Error('terminal journal init changed')
            replay.startedAt = record.event.startedAt
          } else apply(replay, record.event)
          previous = record.hash
        }
        if (
          records.length !== this.seq ||
          previous !== this.previous ||
          records.at(-1)?.event.type !== 'checkpoint' ||
          JSON.stringify(replay) !== JSON.stringify(this.state)
        )
          throw new Error('terminal journal checkpoint not durably matched')
        return Object.freeze({
          status: 'CLOSED_TERMINAL_CHECKPOINT_VERIFIED',
          seq: this.seq,
          terminalHash: previous,
          fileSha256: sha(bytes),
          snapshot: this.snapshot(),
        })
      } finally {
        fs.closeSync(fd)
      }
    } catch (error) {
      this.state.unknown = true
      this.state.reason = 'UNCERTAIN_CLOSE'
      throw error
    }
  }
  close() {
    if (this.closed) return
    try {
      if (!this.state.unknown && this.state.pending.length && !this.corrupt)
        this._append({ type: 'unknown', reason: 'ACK_LOST', at: new Date().toISOString() })
      else if (!this.state.unknown && !this.corrupt) this._append({ type: 'checkpoint' })
    } catch {
      this.state.unknown = true
      this.state.reason = 'UNCERTAIN_CLOSE'
    } finally {
      fs.closeSync(this.fd)
      this.closed = true
    }
  }
}
