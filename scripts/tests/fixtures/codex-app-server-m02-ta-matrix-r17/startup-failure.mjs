/** Fixed, sanitized and fsynced pre-Codex failure witness. Error text is never serialized. */
import fs from 'node:fs'
import { ROOT } from './policy.mjs'

const STAGES = new Set(['MODULE_STAGE_OR_IMPORT', 'FIRST_CASE_START'])
const CODE = new Set(['ENOENT', 'EACCES', 'EPERM', 'EEXIST', 'EIO'])

export function startupErrorClass(error) {
  if (CODE.has(error?.code)) return error.code
  if (error instanceof TypeError) return 'TYPE_ERROR'
  if (error instanceof SyntaxError) return 'SYNTAX_ERROR'
  return 'OTHER_ERROR'
}

export function writeStartupFailure({ stage, error, io = fs, root = ROOT } = {}) {
  if (!STAGES.has(stage) || root !== ROOT) throw new Error('startup witness contract')
  const state = io.lstatSync(root)
  if (
    !state.isDirectory() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o700
  )
    throw new Error('startup witness root identity')
  const bytes = Buffer.from(
    `${JSON.stringify({
      schema: 'appraise.m02-ta-matrix-r17-startup-failure/v1',
      stage,
      errorClass: startupErrorClass(error),
      evidenceClass: 'TRUSTED_SUPERVISOR_SANITIZED_EXCEPTION_CLASS',
      rawExceptionRetained: false,
    })}\n`,
  )
  const file = `${root}/startup-failure.json`
  const fd = io.openSync(
    file,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    io.writeFileSync(fd, bytes)
    io.fsyncSync(fd)
  } finally {
    io.closeSync(fd)
  }
  const dirfd = io.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    io.fsyncSync(dirfd)
  } finally {
    io.closeSync(dirfd)
  }
  return Object.freeze({ stage, errorClass: startupErrorClass(error), bytes: bytes.length })
}
