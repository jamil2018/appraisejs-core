/** Observational, finite stage cursor. Never acceptance, ACK, or cleanup evidence. */
import fs from 'node:fs'
import { join } from 'node:path'
import { POLICY } from './policy.mjs'

export const STAGE_PROGRESS_POLICY = Object.freeze({
  file: 'stage-progress.jsonl',
  maxBytes: 65536,
  maxRecords: 336,
  fsync: false,
  evidenceClass: 'OBSERVATIONAL_PREFIX_NOT_DURABILITY_OR_ACCEPTANCE',
})
export const STAGES = Object.freeze([
  'NEXT_CASE_ENTER',
  'ADMISSION_RECHECK_ENTER',
  'ADMISSION_RECHECK_RETURN',
  'RECURSIVE_HISTORY_ENTER',
  'RECURSIVE_HISTORY_RETURN',
  'ADMISSION_FINAL_RECHECK_ENTER',
  'ADMISSION_FINAL_RECHECK_RETURN',
  'ADMISSION_READY',
  'CASE_BEGIN_ENTER',
  'CASE_BEGIN_RETURN',
  'CASE_COMPLETE_ENTER',
  'CASE_FINISH_APPEND_ENTER',
  'CASE_FINISH_APPEND_RETURN',
  'CASE_COMPLETE_RETURN',
])
const CASES = Object.freeze(POLICY.cases.map(item => item.id))
const fail = () => {
  throw new Error('STAGE_PROGRESS_UNCERTAIN')
}

export function validateStageProgress(bytes, { requireComplete = false } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length > STAGE_PROGRESS_POLICY.maxBytes) fail()
  const text = bytes.toString('utf8')
  if (!Buffer.from(text).equals(bytes) || (text && !text.endsWith('\n'))) fail()
  let rows
  try {
    rows = text
      ? text
          .slice(0, -1)
          .split('\n')
          .map(line => JSON.parse(line))
      : []
  } catch {
    fail()
  }
  if (rows.length > STAGE_PROGRESS_POLICY.maxRecords) fail()
  for (const [index, row] of rows.entries()) {
    if (
      Object.keys(row).join(',') !== 'seq,caseId,stage' ||
      row.seq !== index + 1 ||
      row.caseId !== CASES[Math.floor(index / STAGES.length)] ||
      row.stage !== STAGES[index % STAGES.length]
    )
      fail()
  }
  if (requireComplete && rows.length !== CASES.length * STAGES.length) fail()
  return Object.freeze({
    records: rows.length,
    complete: rows.length === STAGE_PROGRESS_POLICY.maxRecords,
    last: rows.at(-1) ?? null,
    evidenceClass: STAGE_PROGRESS_POLICY.evidenceClass,
  })
}

export function createStageProgress({ directory, io = fs }) {
  const root = io.lstatSync(directory)
  if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid() || (root.mode & 0o7777) !== 0o700)
    fail()
  const file = join(directory, STAGE_PROGRESS_POLICY.file)
  const fd = io.openSync(
    file,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  const original = io.fstatSync(fd)
  let records = 0,
    bytes = 0,
    closed = false
  const check = () => {
    const dir = io.lstatSync(directory),
      named = io.lstatSync(file),
      opened = io.fstatSync(fd)
    if (
      closed ||
      !dir.isDirectory() ||
      dir.isSymbolicLink() ||
      dir.dev !== root.dev ||
      dir.ino !== root.ino ||
      dir.uid !== root.uid ||
      (dir.mode & 0o7777) !== 0o700 ||
      [named, opened].some(
        x =>
          !x.isFile() ||
          x.isSymbolicLink() ||
          x.uid !== process.getuid() ||
          (x.mode & 0o7777) !== 0o600 ||
          x.nlink !== 1 ||
          x.dev !== original.dev ||
          x.ino !== original.ino ||
          x.size !== bytes,
      )
    )
      fail()
  }
  try {
    check()
  } catch (error) {
    io.closeSync(fd)
    throw error
  }
  return Object.freeze({
    record(caseId, stage) {
      check()
      if (
        records >= STAGE_PROGRESS_POLICY.maxRecords ||
        caseId !== CASES[Math.floor(records / STAGES.length)] ||
        stage !== STAGES[records % STAGES.length]
      )
        fail()
      const line = Buffer.from(JSON.stringify({ seq: records + 1, caseId, stage }) + '\n')
      if (
        bytes + line.length > STAGE_PROGRESS_POLICY.maxBytes ||
        io.writeSync(fd, line, 0, line.length, bytes) !== line.length
      )
        fail()
      bytes += line.length
      records++
      check()
    },
    close() {
      if (!closed) {
        try {
          check()
        } finally {
          closed = true
          io.closeSync(fd)
        }
      }
    },
  })
}
