/** R16 filesystem adapter; production entry supplies only the fixed p2 instance. */
import fs from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { PREFLIGHT } from '../codex-app-server-m02-ta-host-preflight-r14/policy.mjs'
import { createOwnedLoopbackAdapter } from '../codex-app-server-m02-ta-host-preflight-r14/runner.mjs'

export const R16_ROOT = '/private/tmp/appraise-m02-ta-host-preflight-p2'

function systemPlist(fsOps) {
  const before = fsOps.lstatSync(PREFLIGHT.plist)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    (before.mode & 0o022) !== 0 ||
    before.size < 1 ||
    before.size > 65536
  )
    throw new Error('system plist identity')
  const fd = fsOps.openSync(PREFLIGHT.plist, fsOps.constants.O_RDONLY | fsOps.constants.O_NOFOLLOW)
  try {
    const held = fsOps.fstatSync(fd)
    if (held.dev !== before.dev || held.ino !== before.ino || held.size !== before.size)
      throw new Error('system plist changed before read')
    const bytes = fsOps.readFileSync(fd)
    const after = fsOps.fstatSync(fd)
    if (
      bytes.length !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size
    )
      throw new Error('system plist changed during read')
    return bytes.toString('utf8')
  } finally {
    fsOps.closeSync(fd)
  }
}

export function createHostPreflightFilesystemIo({
  root = R16_ROOT,
  fsOps = fs,
  readPlist,
  makeListener = createOwnedLoopbackAdapter,
  now = Date.now,
} = {}) {
  if (!isAbsolute(root) || typeof makeListener !== 'function') throw new Error('unreviewed R16 filesystem port')
  const ownedDirectories = new Map()
  const fixedFile = (parent, name) => join(parent, name)
  const syncDirectory = directory => {
    const fd = fsOps.openSync(
      directory,
      fsOps.constants.O_RDONLY | fsOps.constants.O_DIRECTORY | fsOps.constants.O_NOFOLLOW,
    )
    try {
      fsOps.fsyncSync(fd)
    } finally {
      fsOps.closeSync(fd)
    }
  }
  const stableRoot = directory => {
    const state = fsOps.lstatSync(directory)
    if (
      !state.isDirectory() ||
      state.isSymbolicLink() ||
      state.uid !== process.getuid() ||
      (state.mode & 0o777) !== 0o700
    )
      throw new Error('owned preflight directory identity')
    const identity = { dev: state.dev, ino: state.ino }
    const expected = ownedDirectories.get(directory)
    if (expected && (expected.dev !== identity.dev || expected.ino !== identity.ino))
      throw new Error('owned preflight directory replaced')
    return identity
  }
  const exclusiveWrite = (parent, name, bytes) => {
    stableRoot(parent)
    const fd = fsOps.openSync(
      fixedFile(parent, name),
      fsOps.constants.O_CREAT | fsOps.constants.O_EXCL | fsOps.constants.O_WRONLY | fsOps.constants.O_NOFOLLOW,
      0o600,
    )
    try {
      fsOps.writeFileSync(fd, bytes)
      fsOps.fsyncSync(fd)
    } finally {
      fsOps.closeSync(fd)
    }
    syncDirectory(parent)
  }
  const stableMarkerRead = parent => {
    const path = fixedFile(parent, 'synthetic.txt')
    const before = fsOps.lstatSync(path)
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.uid !== process.getuid() ||
      before.nlink !== 1 ||
      (before.mode & 0o777) !== 0o600 ||
      before.size !== Buffer.byteLength(PREFLIGHT.syntheticBytes)
    )
      throw new Error('synthetic file identity')
    const fd = fsOps.openSync(path, fsOps.constants.O_RDONLY | fsOps.constants.O_NOFOLLOW)
    try {
      const held = fsOps.fstatSync(fd)
      if (held.dev !== before.dev || held.ino !== before.ino || held.size !== before.size)
        throw new Error('synthetic file changed before read')
      const bytes = fsOps.readFileSync(fd)
      const after = fsOps.fstatSync(fd)
      if (
        bytes.length !== before.size ||
        after.dev !== before.dev ||
        after.ino !== before.ino ||
        after.size !== before.size
      )
        throw new Error('synthetic file changed during read')
      return bytes
    } finally {
      fsOps.closeSync(fd)
    }
  }

  return Object.freeze({
    now,
    readPlist: async () => (readPlist ? await readPlist() : systemPlist(fsOps)),
    async createRoot() {
      if (fsOps.existsSync(root)) throw Object.assign(new Error('one-shot root exists'), { code: 'EEXIST' })
      process.umask(0o077)
      if (process.umask() !== 0o077) throw new Error('private umask unavailable')
      fsOps.mkdirSync(root, { mode: 0o700 })
      let identity
      try {
        identity = stableRoot(root)
        ownedDirectories.set(root, identity)
        syncDirectory(dirname(root))
        syncDirectory(root)
        return identity
      } catch (error) {
        error.rootCreated = true
        error.rootIdentity = identity ?? null
        throw error
      }
    },
    async createDirectory(relative, index) {
      if (index < 1 || PREFLIGHT.directories[index] !== relative) throw new Error('unreviewed directory')
      stableRoot(root)
      const parent = dirname(relative)
      const parentPath = parent === '.' ? root : join(root, parent)
      const parentState = fsOps.lstatSync(parentPath)
      if (
        !parentState.isDirectory() ||
        parentState.isSymbolicLink() ||
        parentState.uid !== process.getuid() ||
        (parentState.mode & 0o777) !== 0o700
      )
        throw new Error('directory parent identity')
      stableRoot(parentPath)
      const directory = join(root, relative)
      fsOps.mkdirSync(directory, { mode: 0o700 })
      const state = fsOps.lstatSync(directory)
      if (
        !state.isDirectory() ||
        state.isSymbolicLink() ||
        state.uid !== process.getuid() ||
        (state.mode & 0o777) !== 0o700
      )
        throw new Error('new directory identity')
      ownedDirectories.set(directory, { dev: state.dev, ino: state.ino })
      syncDirectory(parentPath)
      syncDirectory(directory)
    },
    async write(name, bytes) {
      if (!['synthetic.txt', 'listener-intent.json', 'result.json'].includes(name)) throw new Error('unreviewed file')
      stableRoot(root)
      const parent = name === 'synthetic.txt' ? join(root, 'cases/B01/workspace') : root
      exclusiveWrite(parent, name, bytes)
    },
    async read(name) {
      if (name !== 'synthetic.txt') throw new Error('unreviewed read')
      stableRoot(root)
      const parent = join(root, 'cases/B01/workspace')
      stableRoot(parent)
      return stableMarkerRead(parent)
    },
    makeListener,
    async withDeadline(promise, remainingMs) {
      if (remainingMs <= 0) throw Object.assign(new Error('deadline'), { code: 'ETIMEDOUT' })
      let timer
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Object.assign(new Error('deadline'), { code: 'ETIMEDOUT' })), remainingMs)
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    },
  })
}

export const productionHostPreflightIo = createHostPreflightFilesystemIo()
