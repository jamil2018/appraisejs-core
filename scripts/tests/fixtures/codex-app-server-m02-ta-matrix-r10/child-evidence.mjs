/** Read one owned child self-report from the exact fresh T2 case root. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { POLICY, casePolicy } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { parseStrictJson } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'

export async function readMatrixChildReceipt(caseId, name, io = fs) {
  if (casePolicy(caseId).phase !== 'T2' || !['mcp-startup.json', 'mcp-exit.json'].includes(name))
    throw new Error('child receipt path contract')
  const root = POLICY.roots.T2
  const parents = [root, join(root, 'cases'), join(root, 'cases', caseId), join(root, 'cases', caseId, 'supervisor')]
  for (const parent of parents) {
    const state = await io.lstat(parent)
    if (
      !state.isDirectory() ||
      state.isSymbolicLink() ||
      state.uid !== process.getuid() ||
      (state.mode & 0o777) !== 0o700
    )
      throw new Error('child receipt parent identity')
  }
  const file = join(parents.at(-1), name)
  const entry = await io.lstat(file)
  if (
    !entry.isFile() ||
    entry.isSymbolicLink() ||
    entry.uid !== process.getuid() ||
    (entry.mode & 0o777) !== 0o600 ||
    entry.nlink !== 1 ||
    entry.size < 2 ||
    entry.size > 4096
  )
    throw new Error('child receipt file identity')
  const handle = await io.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = await handle.stat()
    if (opened.dev !== entry.dev || opened.ino !== entry.ino || opened.size !== entry.size)
      throw new Error('child receipt replaced before read')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    if (
      after.dev !== entry.dev ||
      after.ino !== entry.ino ||
      after.size !== entry.size ||
      after.mtimeMs !== entry.mtimeMs ||
      bytes.length !== entry.size ||
      bytes.at(-1) !== 10
    )
      throw new Error('child receipt changed during read')
    const value = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, -1)))
    return Object.freeze(value)
  } finally {
    await handle.close()
  }
}
