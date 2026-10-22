import assert from 'node:assert/strict'
import test from 'node:test'
import * as fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { readTerminalEvidenceFile, readReleaseEvidenceFile } from './fixture-evidence-read.mjs'

function effects({ before = {}, after = {}, actual = {}, length = 2, throwsAt } = {}) {
  const calls = [],
    sentinel = new Error('original IO failure')
  const metadata = { isFile: () => true, nlink: 1, size: 2, dev: 1, ino: 2, mtimeMs: 3, ctimeMs: 4 }
  let stats = 0
  function record(name) {
    calls.push(name)
    if (throwsAt === name) throw sentinel
  }
  const io = {
    openSync(filename, flags) {
      record('open')
      assert.equal(filename, '/inert/evidence')
      assert.equal(flags, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
      return 7
    },
    fstatSync(fd) {
      assert.equal(fd, 7)
      record(stats ? 'after' : 'before')
      return { ...metadata, ...(stats++ ? after : before) }
    },
    readSync(fd, buffer, offset, size, position) {
      record('read')
      assert.deepEqual([fd, offset, size, position], [7, 0, 5, 0])
      buffer.write('{}')
      return length
    },
    lstatSync() {
      record('lstat')
      return { ...metadata, isSymbolicLink: () => false, ...actual }
    },
    closeSync(fd) {
      assert.equal(fd, 7)
      record('close')
    },
  }
  return { io, calls, sentinel }
}

test('actual reader policies retain distinct metadata checks and exact operation ordering', () => {
  const terminal = effects({ after: { dev: 99, ino: 99, ctimeMs: 99 } })
  assert.equal(readTerminalEvidenceFile('/inert/evidence', 4, terminal.io).bytes.toString(), '{}')
  assert.deepEqual(terminal.calls, ['open', 'before', 'read', 'after', 'close'])
  const release = effects()
  const result = readReleaseEvidenceFile('/inert/evidence', 4, release.io)
  assert.equal(result.before.ino, result.actual.ino)
  assert.deepEqual(release.calls, ['open', 'before', 'read', 'after', 'lstat', 'close'])
  const short = effects({ length: 1 })
  assert.throws(() => readTerminalEvidenceFile('/inert/evidence', 4, short.io))
  assert.deepEqual(short.calls, ['open', 'before', 'read', 'close'])
})

test('every rejected size, link, short-read and changed identity closes the original descriptor', () => {
  for (const reader of [readTerminalEvidenceFile, readReleaseEvidenceFile]) {
    for (const options of [
      { before: { isFile: () => false } },
      { before: { nlink: 2 } },
      { before: { size: 0 } },
      { before: { size: 5 } },
      { length: 1 },
      { length: 5 },
      { after: { size: 3 } },
      { after: { mtimeMs: 99 } },
    ]) {
      const f = effects(options)
      assert.throws(() => reader('/inert/evidence', 4, f.io))
      assert.equal(f.calls.at(-1), 'close')
      assert.equal(f.calls.filter(x => x === 'close').length, 1)
    }
  }
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    for (const where of ['after', 'actual']) {
      const f = effects({ [where]: { [field]: 99 } })
      assert.throws(() => readReleaseEvidenceFile('/inert/evidence', 4, f.io))
      assert.equal(f.calls.at(-1), 'close')
    }
  }
  const symbolic = effects({ actual: { isSymbolicLink: () => true } })
  assert.throws(() => readReleaseEvidenceFile('/inert/evidence', 4, symbolic.io))
})

test('original IO errors propagate, optional ENOENT alone returns undefined, close is never retried', () => {
  for (const reader of [readTerminalEvidenceFile, readReleaseEvidenceFile]) {
    for (const throwsAt of [
      'open',
      'before',
      'read',
      'after',
      'close',
      ...(reader === readReleaseEvidenceFile ? ['lstat'] : []),
    ]) {
      const f = effects({ throwsAt })
      assert.throws(
        () => reader('/inert/evidence', 4, f.io),
        error => error === f.sentinel,
      )
      assert.equal(f.calls.filter(x => x === 'close').length, throwsAt === 'open' ? 0 : 1)
    }
    const f = effects()
    f.io.openSync = () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    }
    assert.equal(reader('/inert/evidence', 4, f.io), undefined)
    assert.deepEqual(f.calls, [])
  }
})

test('real inert files refuse symlinks, hard links and bounds without reading any database', t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'm06-evidence-inert-'))
  t.after(() => fs.rmSync(root, { recursive: true }))
  const file = path.join(root, 'record.json'),
    link = path.join(root, 'symbolic')
  fs.writeFileSync(file, '{}')
  for (const reader of [readTerminalEvidenceFile, readReleaseEvidenceFile]) {
    assert.equal(reader(file, 4).bytes.toString(), '{}')
    assert.throws(() => reader(file, 1))
  }
  fs.symlinkSync(file, link)
  for (const reader of [readTerminalEvidenceFile, readReleaseEvidenceFile]) assert.throws(() => reader(link, 4))
  fs.linkSync(file, path.join(root, 'hard'))
  for (const reader of [readTerminalEvidenceFile, readReleaseEvidenceFile]) assert.throws(() => reader(file, 4))
})
