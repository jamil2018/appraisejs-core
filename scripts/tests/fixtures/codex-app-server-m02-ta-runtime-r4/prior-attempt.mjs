/** Read-only binding to the retained, failed p1 attempt. No reopen, recovery, or retry. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

export const PRIOR_ROOT = '/private/tmp/appraise-m02-ta-descriptors-p1'
export const PRIOR_JOURNAL = join(PRIOR_ROOT, 'supervisor/journal/journal.jsonl')
export const PRIOR_JOURNAL_SHA = '00784593918012207cd76763ceecb7e5ce1aae91790a7d89a3dda21fad1c30ff'
export const PRIOR_TERMINAL_HASH = '6ccd152391b72c8e1ce61800a66028d0d8b7ae8098815a8f258a9e6c78c3c5ef'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = () => {
  throw new Error('retained prior T1 UNKNOWN proof changed')
}

export function verifyPriorAttempt(io = fs) {
  const dirs = [PRIOR_ROOT, join(PRIOR_ROOT, 'supervisor'), join(PRIOR_ROOT, 'supervisor/journal')]
  const stats = dirs.map(path => io.lstatSync(path))
  if (
    stats.some(
      stat =>
        !stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700,
    )
  )
    fail()
  const initial = io.lstatSync(PRIOR_JOURNAL)
  if (
    !initial.isFile() ||
    initial.isSymbolicLink() ||
    initial.uid !== process.getuid() ||
    (initial.mode & 0o777) !== 0o600 ||
    initial.size > 256 * 1024
  )
    fail()
  const fd = io.openSync(PRIOR_JOURNAL, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  let bytes
  try {
    const opened = io.fstatSync(fd)
    if (opened.dev !== initial.dev || opened.ino !== initial.ino || opened.size !== initial.size) fail()
    bytes = io.readFileSync(fd)
  } finally {
    io.closeSync(fd)
  }
  if (sha(bytes) !== PRIOR_JOURNAL_SHA || !bytes.toString('utf8').endsWith('\n')) fail()
  const lines = bytes.toString('utf8').trimEnd().split('\n')
  if (lines.length !== 2) fail()
  const records = lines.map(line => JSON.parse(line))
  let previous = '0'.repeat(64)
  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    if (
      record.seq !== index + 1 ||
      record.previous !== previous ||
      record.hash !== sha(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
    )
      fail()
    previous = record.hash
  }
  const [init, terminal] = records.map(record => record.event)
  if (
    init.type !== 'init' ||
    terminal.type !== 'unknown' ||
    terminal.reason !== 'T1-runtime-ambiguity' ||
    records[1].hash !== PRIOR_TERMINAL_HASH ||
    init.retention?.earliestPossibleProviderIntentAt !== '2026-10-15T18:54:08.422Z' ||
    init.retention?.unresolvedDecisionDueAt !== '2026-10-22T18:54:08.422Z' ||
    init.rootIdentity?.dev !== stats[2].dev ||
    init.rootIdentity?.ino !== stats[2].ino ||
    !Array.isArray(init.parentIdentities) ||
    init.parentIdentities.length !== 2 ||
    init.parentIdentities?.some(
      (identity, index) => identity.dev !== stats[index].dev || identity.ino !== stats[index].ino,
    ) ||
    init.fileIdentity?.dev !== initial.dev ||
    init.fileIdentity?.ino !== initial.ino
  )
    fail()
  const after = io.lstatSync(PRIOR_JOURNAL)
  if (after.dev !== initial.dev || after.ino !== initial.ino || after.size !== initial.size) fail()
  for (let index = 0; index < dirs.length; index++) {
    const state = io.lstatSync(dirs[index])
    if (state.dev !== stats[index].dev || state.ino !== stats[index].ino || state.isSymbolicLink()) fail()
  }
  return Object.freeze({
    journalSha256: PRIOR_JOURNAL_SHA,
    terminalHash: PRIOR_TERMINAL_HASH,
    eventCount: 2,
    status: 'UNKNOWN',
  })
}
