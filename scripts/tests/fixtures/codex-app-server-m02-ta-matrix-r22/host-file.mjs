/** TA04's one-device installed-file successor. This does not attest a process image. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import { createOwnedHostObserver } from '../codex-app-server-m02-ta-owned-host-observer/observer.mjs'
import { R11_INSTALLED_HOST_FILE } from '../codex-app-server-m02-ta-owned-host-observer-r11/observer.mjs'

export const R22_INSTALLED_HOST_FILE = Object.freeze({ ...R11_INSTALLED_HOST_FILE, dev: 16777233 })
const same = (a, b) =>
  ['uid', 'mode', 'nlink', 'dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])

export async function verifyR22HostFile({ fileSystem = fs } = {}) {
  const pin = R22_INSTALLED_HOST_FILE
  const before = await fileSystem.lstat(pin.path)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== pin.uid ||
    (before.mode & 0o7777) !== pin.mode ||
    before.nlink !== pin.nlink ||
    before.dev !== pin.dev ||
    before.ino !== pin.ino ||
    before.size !== pin.size
  )
    throw new Error('R22 installed Code Mode host metadata drift')
  const handle = await fileSystem.open(pin.path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!same(before, await handle.stat())) throw new Error('R22 installed host replaced before read')
    const bytes = await handle.readFile()
    if (
      !same(before, await handle.stat()) ||
      !same(before, await fileSystem.lstat(pin.path)) ||
      bytes.length !== pin.size ||
      createHash('sha256').update(bytes).digest('hex') !== pin.sha256
    )
      throw new Error('R22 installed host bytes or metadata drift')
    return Object.freeze({
      path: pin.path,
      sha256: pin.sha256,
      uid: pin.uid,
      mode: pin.mode,
      nlink: pin.nlink,
      dev: pin.dev,
      ino: pin.ino,
      size: pin.size,
      evidenceClass: pin.evidenceClass,
      processImageAttested: false,
    })
  } finally {
    await handle.close()
  }
}

export function createR22OwnedHostObserver({ spawnOwnedCodex, allowedDirectChildPaths, os }) {
  return createOwnedHostObserver({
    spawnOwnedCodex,
    allowedDirectChildPaths,
    os,
    verifyHostPin: () => verifyR22HostFile(),
  })
}
