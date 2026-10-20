/** Additive exact installed-owner adaptation; accepted observer mechanics remain untouched. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import {
  PINNED_CODE_MODE_HOST,
  createOwnedHostObserver,
} from '../codex-app-server-m02-ta-owned-host-observer/observer.mjs'

export const R11_INSTALLED_HOST_FILE = Object.freeze({
  ...PINNED_CODE_MODE_HOST,
  uid: 502,
  mode: 0o755,
  nlink: 1,
  dev: 16777230,
  ino: 68546160,
  size: 65610016,
  evidenceClass: 'INSTALLED_FILE_METADATA_AND_BYTES_NOT_PROCESS_IMAGE_ATTESTATION',
})
const same = (a, b) =>
  ['uid', 'mode', 'nlink', 'dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])

/** FD/no-follow byte pin with exact installed UID and mode, independent of supervisor UID. */
export async function verifyR11HostFile({ fileSystem = fs } = {}) {
  const pin = R11_INSTALLED_HOST_FILE
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
    throw new Error('installed Code Mode host metadata drift')
  const handle = await fileSystem.open(pin.path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (!same(before, held)) throw new Error('installed Code Mode host replaced before read')
    const bytes = await handle.readFile()
    const afterHeld = await handle.stat()
    const afterPath = await fileSystem.lstat(pin.path)
    if (
      !same(before, afterHeld) ||
      !same(before, afterPath) ||
      bytes.length !== pin.size ||
      createHash('sha256').update(bytes).digest('hex') !== pin.sha256
    )
      throw new Error('installed Code Mode host bytes or metadata drift')
    return Object.freeze({
      path: pin.path,
      sha256: pin.sha256,
      uid: pin.uid,
      mode: pin.mode,
      nlink: pin.nlink,
      dev: pin.dev,
      ino: pin.ino,
      evidenceClass: pin.evidenceClass,
      processImageAttested: false,
    })
  } finally {
    await handle.close()
  }
}

export function createR11OwnedHostObserver({ spawnOwnedCodex, allowedDirectChildPaths, os }) {
  return createOwnedHostObserver({
    spawnOwnedCodex,
    allowedDirectChildPaths,
    os,
    verifyHostPin: () => verifyR11HostFile(),
  })
}
