// Fixed non-DB evidence policies. Parsing and protocol decisions remain with each caller.
import assert from 'node:assert/strict'
import * as fs from 'node:fs'

function openEvidence(filename, io) {
  try {
    return io.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

function readDescriptor(fd, limit, io, message) {
  const before = io.fstatSync(fd)
  assert.ok(before.isFile() && before.nlink === 1 && before.size > 0 && before.size <= limit, message)
  const buffer = Buffer.alloc(limit + 1)
  const length = io.readSync(fd, buffer, 0, buffer.length, 0)
  return { before, bytes: buffer.subarray(0, length), length }
}

export function readTerminalEvidenceFile(filename, limit, io = fs) {
  const fd = openEvidence(filename, io)
  if (fd === undefined) return undefined
  try {
    const evidence = readDescriptor(fd, limit, io, 'Ambiguous terminal evidence file')
    assert.ok(evidence.length === evidence.before.size && evidence.length <= limit)
    const after = io.fstatSync(fd)
    assert.equal(after.size, evidence.before.size)
    assert.equal(after.mtimeMs, evidence.before.mtimeMs)
    return { ...evidence, after }
  } finally {
    io.closeSync(fd)
  }
}

export function readReleaseEvidenceFile(filename, limit, io = fs) {
  const fd = openEvidence(filename, io)
  if (fd === undefined) return undefined
  try {
    const evidence = readDescriptor(fd, limit, io)
    const after = io.fstatSync(fd)
    const actual = io.lstatSync(filename)
    assert.equal(actual.isSymbolicLink(), false)
    for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
      assert.equal(evidence.before[field], after[field])
      assert.equal(after[field], actual[field])
    }
    assert.ok(evidence.length === evidence.before.size && evidence.length <= limit)
    return { ...evidence, after, actual }
  } finally {
    io.closeSync(fd)
  }
}
