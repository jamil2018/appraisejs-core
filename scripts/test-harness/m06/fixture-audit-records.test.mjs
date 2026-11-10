import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { publishFixtureAuditRecord, readFixtureAuditRecord } from './fixture-audit-records.mjs'

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'm06-audit-inert-'))
  t.after(() => rmSync(directory, { recursive: true }))
  return directory
}

test('actual audit publisher preserves exact pretty2/newline bytes and exclusive existing record', t => {
  const directory = fixture(t),
    value = { x: ['é', null] },
    filename = path.join(directory, 'audit.json')
  publishFixtureAuditRecord(directory, 'audit.json', value)
  const bytes = JSON.stringify(value, null, 2) + '\n'
  assert.equal(readFileSync(filename, 'utf8'), bytes)
  assert.deepEqual(readFixtureAuditRecord(filename), value)
  assert.throws(() => publishFixtureAuditRecord(directory, 'audit.json', {}), { code: 'EEXIST' })
  assert.equal(readFileSync(filename, 'utf8'), bytes)
  publishFixtureAuditRecord(directory, 'undefined.json', undefined)
  assert.equal(readFileSync(path.join(directory, 'undefined.json'), 'utf8'), 'undefined\n')
})

test('read, serialization and filesystem errors propagate without creating fallback records', t => {
  const directory = fixture(t),
    cyclic = {}
  cyclic.self = cyclic
  assert.throws(() => readFixtureAuditRecord(path.join(directory, 'absent')), { code: 'ENOENT' })
  writeFileSync(path.join(directory, 'invalid'), '{')
  assert.throws(() => readFixtureAuditRecord(path.join(directory, 'invalid')), SyntaxError)
  assert.throws(() => publishFixtureAuditRecord(directory, 'cyclic', cyclic), TypeError)
  assert.equal(existsSync(path.join(directory, 'cyclic')), false)
  assert.throws(() => publishFixtureAuditRecord(directory, {}, cyclic), { code: 'ERR_INVALID_ARG_TYPE' })
  assert.throws(() => publishFixtureAuditRecord(path.join(directory, 'absent'), 'record', {}), { code: 'ENOENT' })
  assert.throws(() => publishFixtureAuditRecord(path.join(directory, 'invalid'), 'record', {}), { code: 'ENOTDIR' })
})
