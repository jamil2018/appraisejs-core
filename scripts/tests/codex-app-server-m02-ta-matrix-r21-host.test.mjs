import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import test from 'node:test'
import {
  R21_INSTALLED_HOST_FILE,
  createR21OwnedHostObserver,
  verifyR21HostFile,
} from './fixtures/codex-app-server-m02-ta-matrix-r21/host-file.mjs'

function fakeFileSystem({ mutateBefore, mutateHeld, mutateAfterHeld, mutateAfterPath, mutateBytes } = {}) {
  const pin = R21_INSTALLED_HOST_FILE
  const base = {
    uid: pin.uid,
    mode: pin.mode,
    nlink: pin.nlink,
    dev: pin.dev,
    ino: pin.ino,
    size: pin.size,
    mtimeMs: 1,
    ctimeMs: 1,
    isFile: () => true,
    isSymbolicLink: () => false,
  }
  let pathReads = 0
  let fdReads = 0
  let opened = false
  let closed = false
  let flags
  return {
    get opened() {
      return opened
    },
    get closed() {
      return closed
    },
    get flags() {
      return flags
    },
    async lstat(file) {
      assert.equal(file, pin.path)
      return { ...base, ...(pathReads++ === 0 ? mutateBefore : mutateAfterPath) }
    },
    async open(file, receivedFlags) {
      assert.equal(file, pin.path)
      opened = true
      flags = receivedFlags
      return {
        async stat() {
          return { ...base, ...(fdReads++ === 0 ? mutateHeld : mutateAfterHeld) }
        },
        async readFile() {
          return mutateBytes ?? fs.readFile(pin.path)
        },
        async close() {
          closed = true
        },
      }
    },
  }
}

test('R21 installed-file verifier accepts exact observed device and retains no-follow FD checks', async () => {
  const fileSystem = fakeFileSystem()
  const result = await verifyR21HostFile({ fileSystem })
  assert.equal(result.dev, 16777233)
  assert.equal(result.processImageAttested, false)
  assert.equal(fileSystem.opened, true)
  assert.equal(fileSystem.closed, true)
  assert.notEqual(fileSystem.flags & constants.O_NOFOLLOW, 0)
  assert.equal(typeof createR21OwnedHostObserver, 'function')
})

test('every installed metadata pin rejects drift before opening', async () => {
  for (const field of ['uid', 'mode', 'nlink', 'dev', 'ino', 'size']) {
    const pin = R21_INSTALLED_HOST_FILE
    const fileSystem = fakeFileSystem({ mutateBefore: { [field]: pin[field] + 1 } })
    await assert.rejects(verifyR21HostFile({ fileSystem }), /metadata drift/)
    assert.equal(fileSystem.opened, false, field)
  }
  for (const mutateBefore of [{ isFile: () => false }, { isSymbolicLink: () => true }]) {
    await assert.rejects(verifyR21HostFile({ fileSystem: fakeFileSystem({ mutateBefore }) }), /metadata drift/)
  }
})

test('held and path identity races and byte changes fail closed', async () => {
  const beforeRead = fakeFileSystem({ mutateHeld: { ino: R21_INSTALLED_HOST_FILE.ino + 1 } })
  await assert.rejects(verifyR21HostFile({ fileSystem: beforeRead }), /replaced before read/)
  assert.equal(beforeRead.closed, true)
  for (const mutation of [
    { mutateAfterHeld: { dev: R21_INSTALLED_HOST_FILE.dev + 1 } },
    { mutateAfterPath: { mtimeMs: 2 } },
    { mutateBytes: Buffer.from('changed') },
  ]) {
    const fileSystem = fakeFileSystem(mutation)
    await assert.rejects(verifyR21HostFile({ fileSystem }), /bytes or metadata drift/)
    assert.equal(fileSystem.closed, true)
  }
})
