/** Exclusive fsynced, sanitized T2 supervisor receipts. No raw provider or SDK body. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { POLICY, casePolicy } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'

const NAME =
  /^(?:script-plan|provider-response-[1-4]|permission-request|permission-terminal|protocol-failure|case-outcome)$/
const ownDirectory = state =>
  state.isDirectory() && !state.isSymbolicLink() && state.uid === process.getuid() && (state.mode & 0o777) === 0o700

export function writeMatrixCaseReceipt(caseId, name, value, io = fs) {
  if (
    casePolicy(caseId).phase !== 'T2' ||
    !NAME.test(name) ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.caseId !== caseId ||
    ['schema', 'evidenceClass', 'name'].some(key => Object.hasOwn(value, key))
  )
    throw new Error('matrix receipt path or payload contract')
  const root = POLICY.roots.T2
  const parents = [root, join(root, 'cases'), join(root, 'cases', caseId), join(root, 'cases', caseId, 'supervisor')]
  for (const parent of parents)
    if (!ownDirectory(io.lstatSync(parent))) throw new Error('matrix receipt ancestor changed')
  const encoded = JSON.stringify({
    schema: 'appraise.m02-ta-matrix-supervisor-receipt/v1',
    evidenceClass: 'TRUSTED_SUPERVISOR_OBSERVATION',
    name,
    ...value,
  })
  if (
    Buffer.byteLength(encoded) > 16 * 1024 ||
    /"(?:capability|bootstrap|authUrl|rawBody|requestBody|authorization|cookie)"\s*:/.test(encoded)
  )
    throw new Error('matrix receipt privacy or byte ceiling')
  const parent = parents.at(-1)
  const file = join(parent, `${name}.json`)
  const fd = io.openSync(
    file,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    io.writeFileSync(fd, `${encoded}\n`)
    io.fsyncSync(fd)
  } finally {
    io.closeSync(fd)
  }
  const dirfd = io.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    io.fsyncSync(dirfd)
  } finally {
    io.closeSync(dirfd)
  }
  return Object.freeze({
    name,
    bytes: Buffer.byteLength(encoded) + 1,
    sha256: createHash('sha256').update(`${encoded}\n`).digest('hex'),
  })
}
