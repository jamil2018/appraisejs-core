import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { DisposableStore, StorageBlocked, StorageJournal } from './fixtures/codex-app-server-m02-b1/storage.mjs'

test('exclusive owned root and journal use 0700/0600, reserve is persisted before return', async () => {
  const store = await DisposableStore.create()
  try {
    assert.match(store.root, /appraise-m02-b1-offline-/)
    assert.equal((await fs.lstat(store.root)).mode & 0o777, 0o700)
    assert.equal((await fs.lstat(join(store.root, 'journal.json'))).mode & 0o777, 0o600)
    await assert.rejects(
      fs.open(join(store.root, 'journal.json'), constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY),
      { code: 'EEXIST' },
    )
    const reserved = await store.journal.reserve('threadStarts', 'B01-thread-1')
    assert.equal(reserved.counts.threadStarts, 1)
    assert.deepEqual(reserved.pending, ['B01-thread-1'])
    const onDisk = JSON.parse(await fs.readFile(join(store.root, 'journal.json'), 'utf8'))
    assert.equal(onDisk.entries[0].status, 'reserved')
    await store.journal.acknowledge('B01-thread-1')
    assert.deepEqual(store.journal.snapshot().pending, [])
    assert.equal(store.journal.snapshot().entries[0].status, 'acknowledged')
  } finally {
    await store.cleanup()
  }
  await assert.rejects(fs.lstat(store.root), { code: 'ENOENT' })
})

test('per-kind ceilings and duplicate identities fence rather than reset', async () => {
  const store = await DisposableStore.create({ limits: { threadStarts: 1, turnStarts: 0, providerRequests: 0 } })
  try {
    await store.journal.reserve('threadStarts', 'thread-1')
    await assert.rejects(store.journal.reserve('threadStarts', 'thread-1'), StorageBlocked)
    assert.equal(store.journal.snapshot().fenced, true)
    assert.equal(store.journal.snapshot().counts.threadStarts, 1)
    await assert.rejects(store.journal.reserve('turnStarts', 'turn-1'), StorageBlocked)
  } finally {
    await store.cleanup()
  }
})

test('snapshots cannot mutate counts and overlapping operations fence both callers', async () => {
  const store = await DisposableStore.create()
  try {
    const snapshot = store.journal.snapshot()
    snapshot.counts.threadStarts = 99
    snapshot.entries.push({ kind: 'threadStarts', id: 'forged', status: 'acknowledged' })
    assert.equal(store.journal.snapshot().counts.threadStarts, 0)
    assert.equal(store.journal.snapshot().entries.length, 0)
    assert.throws(() => {
      store.root = '/private/tmp/foreign'
    }, TypeError)
    const first = store.journal.reserve('threadStarts', 'thread-1')
    const firstResult = first.then(
      () => 'fulfilled',
      error => error,
    )
    await assert.rejects(store.journal.reserve('providerRequests', 'request-1'), StorageBlocked)
    assert.ok((await firstResult) instanceof StorageBlocked)
    assert.equal(store.journal.snapshot().fenced, true)
    assert.equal(store.journal.snapshot().counts.threadStarts, 1)
    assert.equal(store.journal.snapshot().counts.providerRequests, 0)
  } finally {
    await store.cleanup()
  }
})

for (const cut of ['write', 'file-sync', 'rename', 'directory-sync']) {
  test(`${cut} crash cut consumes memory intent and fences recovery without replay`, async () => {
    let inject = false
    const store = await DisposableStore.create({
      fault: step => {
        if (inject && step === cut) throw new Error(`injected ${cut}`)
      },
    })
    try {
      await store.journal.reserve('threadStarts', 'thread-1')
      inject = true
      await assert.rejects(store.journal.reserve('providerRequests', 'request-1'), StorageBlocked)
      assert.equal(store.journal.snapshot().counts.providerRequests, 1)
      assert.deepEqual(store.journal.snapshot().pending, ['thread-1', 'request-1'])
      assert.equal(store.journal.snapshot().status, 'UNKNOWN')
      inject = false
      const recovered = await StorageJournal.restore(store.root)
      assert.equal(recovered.snapshot().fenced, true)
      assert.equal(recovered.snapshot().recovered, true)
      await assert.rejects(recovered.reserve('providerRequests', 'request-1'), StorageBlocked)
      await assert.rejects(store.journal.acknowledge('thread-1'), StorageBlocked)
    } finally {
      await store.cleanup()
    }
  })
}

test('restored clean journal is fenced because previous send outcome is unknown', async () => {
  const store = await DisposableStore.create()
  try {
    await store.journal.reserve('turnStarts', 'turn-1')
    const recovered = await StorageJournal.restore(store.root)
    assert.equal(recovered.snapshot().counts.turnStarts, 1)
    assert.deepEqual(recovered.snapshot().pending, ['turn-1'])
    await assert.rejects(recovered.acknowledge('turn-1'), StorageBlocked)
    await store.journal.markUnknown()
    assert.equal((await StorageJournal.restore(store.root)).snapshot().status, 'UNKNOWN')
  } finally {
    await store.cleanup()
  }
})

test('restoration rejects oversized or contradictory journal bytes', async () => {
  const store = await DisposableStore.create()
  try {
    const path = join(store.root, 'journal.json')
    const original = await fs.readFile(path)
    await fs.writeFile(path, Buffer.alloc(65 * 1024, 32))
    await assert.rejects(StorageJournal.restore(store.root), StorageBlocked)
    const altered = JSON.parse(original)
    altered.counts.threadStarts = 1
    await fs.writeFile(path, JSON.stringify(altered))
    await assert.rejects(StorageJournal.restore(store.root), StorageBlocked)
  } finally {
    await store.cleanup()
  }
})

test('cleanup refuses a replaced root and does not delete the replacement', async () => {
  const store = await DisposableStore.create()
  const moved = `${store.root}-moved`
  try {
    await fs.rename(store.root, moved)
    await fs.symlink(moved, store.root)
    await assert.rejects(store.cleanup(), StorageBlocked)
    assert.equal((await fs.lstat(store.root)).isSymbolicLink(), true)
    assert.equal((await fs.lstat(join(moved, 'journal.json'))).isFile(), true)
  } finally {
    await fs.unlink(store.root)
    await fs.rename(moved, store.root)
    await store.cleanup()
  }
})
