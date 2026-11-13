import { constants, type Stats } from 'node:fs'
import { open, lstat, realpath, link, rename, unlink, type FileHandle } from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { AssignmentCustodyError, type AssignmentCredentialStore } from './assignment-credential-custody'

const entryPattern = /^sha256:[a-f0-9]{64}$/
const revision = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
type FileIdentity = { dev: number; ino: number }
const same = (a: FileIdentity, b: FileIdentity) => a.dev === b.dev && a.ino === b.ino
const unavailable = () => new AssignmentCustodyError('STORAGE_UNAVAILABLE')

function assertPrivateRecord(stat: Stats, uid: number) {
  if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.uid !== uid || stat.size > 65536)
    throw unavailable()
}
function assertReadIdentity(before: Stats, after: Stats) {
  if (!same(before, after) || after.isSymbolicLink() || after.size !== before.size) throw unavailable()
}

/** Explicit private root only. Never searches HOME, environment, keychains or provider configuration. */
export async function createAssignmentCredentialFileStore(suppliedRoot: string): Promise<AssignmentCredentialStore> {
  if (!path.isAbsolute(suppliedRoot)) throw unavailable()
  let root: string, original: Stats
  try {
    const supplied = await lstat(suppliedRoot)
    if (supplied.isSymbolicLink()) throw unavailable()
    root = await realpath(suppliedRoot)
    original = await lstat(root)
    if (
      !same(supplied, original) ||
      !original.isDirectory() ||
      (original.mode & 0o777) !== 0o700 ||
      original.uid !== process.getuid?.()
    )
      throw unavailable()
  } catch {
    throw unavailable()
  }
  async function assertRoot() {
    try {
      const now = await lstat(root)
      if (
        !same(now, original) ||
        now.isSymbolicLink() ||
        !now.isDirectory() ||
        (now.mode & 0o777) !== 0o700 ||
        now.uid !== original.uid
      )
        throw unavailable()
    } catch {
      throw unavailable()
    }
  }
  function filename(entryId: string) {
    if (!entryPattern.test(entryId)) throw new AssignmentCustodyError('INVALID')
    return path.join(root, entryId.slice(7) + '.sealed')
  }
  async function readFile(name: string) {
    await assertRoot()
    let handle
    try {
      handle = await open(name, constants.O_RDONLY | constants.O_NOFOLLOW)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await assertRoot()
        return null
      }
      throw unavailable()
    }
    try {
      const stat = await handle.stat()
      assertPrivateRecord(stat, original.uid)
      const buffer = Buffer.alloc(65537)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead > 65536) throw unavailable()
      const value = buffer.subarray(0, bytesRead).toString('utf8'),
        after = await lstat(name)
      await assertRoot()
      assertPrivateRecord(after, original.uid)
      assertReadIdentity(stat, after)
      return { value, revision: revision(value), identity: stat }
    } finally {
      await handle.close()
    }
  }
  async function releaseOwned(name: string, identity: FileIdentity) {
    try {
      await assertRoot()
      const current = await lstat(name)
      if (same(current, identity) && !current.isSymbolicLink()) await unlink(name)
    } catch {
      /* Unproved ownership never authorizes deletion. */
    }
  }
  async function writeTemporary(name: string, value: string) {
    const output = await open(
      name,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    )
    let identity: Stats | undefined
    let failed = false
    try {
      identity = await output.stat()
      await output.writeFile(value, 'utf8')
      await output.sync()
    } catch {
      failed = true
    }
    try {
      await output.close()
    } catch {
      failed = true
    }
    if (failed || !identity) {
      if (identity) await releaseOwned(name, identity)
      throw unavailable()
    }
    return identity
  }

  async function promoteTemporary(
    temporary: string,
    target: string,
    current: FileIdentity | null,
    temporaryIdentity: FileIdentity,
  ) {
    await assertRoot()
    if (current) {
      const now = await lstat(target)
      if (!same(now, current) || now.isSymbolicLink()) throw unavailable()
      await rename(temporary, target)
    } else {
      await link(temporary, target)
      await releaseOwned(temporary, temporaryIdentity)
    }
  }
  async function confirmDurable(target: string, value: string) {
    await assertRoot()
    const persisted = await readFile(target)
    if (!persisted || persisted.revision !== revision(value)) throw unavailable()
    const directory = await open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try {
      if (!same(await directory.stat(), original)) throw unavailable()
      await directory.sync()
    } finally {
      await directory.close()
    }
  }
  async function closeOwnedLock(handle: FileHandle, name: string, identity: FileIdentity | undefined) {
    let closed = true
    try {
      await handle.close()
    } catch {
      closed = false
    }
    if (identity) await releaseOwned(name, identity)
    if (!closed) throw unavailable()
  }
  function assertValueBounds(value: string) {
    if (typeof value !== 'string' || Buffer.byteLength(value) > 65536) throw new AssignmentCustodyError('INVALID')
  }
  async function acquireLock(name: string) {
    try {
      return await open(name, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    } catch {
      throw new AssignmentCustodyError('CONFLICT')
    }
  }
  async function currentIdentityForRevision(target: string, expected: string | null) {
    const current = await readFile(target)
    const currentRevision = current ? current.revision : null
    if (currentRevision !== expected) throw new AssignmentCustodyError('CONFLICT')
    return current ? current.identity : null
  }
  return Object.freeze({
    async read(entryId: string) {
      try {
        const found = await readFile(filename(entryId))
        return found && Object.freeze({ value: found.value, revision: found.revision })
      } catch {
        throw unavailable()
      }
    },
    async compareAndSwap(entryId: string, expectedRevision: string | null, value: string) {
      assertValueBounds(value)
      const target = filename(entryId),
        lockName = target + '.lock',
        temporary = target + '.' + randomUUID() + '.tmp'
      await assertRoot()
      const lock = await acquireLock(lockName)
      let lockIdentity: FileIdentity | undefined
      let temporaryIdentity: FileIdentity | undefined
      try {
        lockIdentity = await lock.stat()
        const current = await currentIdentityForRevision(target, expectedRevision)
        temporaryIdentity = await writeTemporary(temporary, value)
        await promoteTemporary(temporary, target, current, temporaryIdentity)
        await confirmDurable(target, value)
        return revision(value)
      } catch (error) {
        if (error instanceof AssignmentCustodyError) throw error
        throw unavailable()
      } finally {
        if (temporaryIdentity) await releaseOwned(temporary, temporaryIdentity)
        await closeOwnedLock(lock, lockName, lockIdentity)
      }
    },
  })
}
