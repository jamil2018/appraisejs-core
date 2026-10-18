import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  PINNED_CODE_MODE_HOST,
  verifyPinnedHostBinary,
} from './fixtures/codex-app-server-m02-ta-owned-host-observer/observer.mjs'
import {
  R11_INSTALLED_HOST_FILE,
  verifyR11HostFile,
} from './fixtures/codex-app-server-m02-ta-owned-host-observer-r11/observer.mjs'

test('file-only installed host metadata reproduces the old owner rejection and new exact pin', async () => {
  const stat = await fs.lstat(R11_INSTALLED_HOST_FILE.path)
  assert.equal(stat.uid, 502)
  assert.equal(stat.mode & 0o7777, 0o755)
  assert.equal(stat.nlink, 1)
  assert.notEqual(stat.uid, process.getuid())
  await assert.rejects(verifyPinnedHostBinary(), /host file metadata rejected/)
  const pinned = await verifyR11HostFile()
  assert.equal(pinned.path, PINNED_CODE_MODE_HOST.path)
  assert.equal(pinned.sha256, PINNED_CODE_MODE_HOST.sha256)
  assert.equal(pinned.uid, 502)
  assert.equal(pinned.processImageAttested, false)
})

test('wrong owner, mode, inode and content reject without a spawn', async () => {
  for (const mutate of [
    state => ({ ...state, uid: process.getuid() }),
    state => ({ ...state, mode: (state.mode & ~0o7777) | 0o775 }),
    state => ({ ...state, ino: state.ino + 1 }),
    state => ({ ...state, nlink: 2 }),
  ]) {
    const fake = {
      ...fs,
      async lstat(path) {
        return mutate(await fs.lstat(path))
      },
    }
    await assert.rejects(verifyR11HostFile({ fileSystem: fake }))
  }
  const fake = {
    ...fs,
    async open(path, flags) {
      const handle = await fs.open(path, flags)
      return {
        stat: () => handle.stat(),
        close: () => handle.close(),
        readFile: async () => Buffer.from('wrong host bytes'),
      }
    },
  }
  await assert.rejects(verifyR11HostFile({ fileSystem: fake }), /bytes or metadata drift/)
})
