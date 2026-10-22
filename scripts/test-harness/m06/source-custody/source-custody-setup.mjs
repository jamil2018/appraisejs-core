// Native SQLite exists ONLY in this separate, known-exited setup/inspection PID.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { corruptLedger } from './source-custody-ledger-fixture.mjs'

const [packet, directory, selected, mode] = process.argv.slice(2)
assert.deepEqual(process.execArgv, [])
assert(path.isAbsolute(directory) && path.isAbsolute(packet))
const manifest = JSON.parse(readFileSync(path.join(packet, 'manifest.json')))
const hash = value => createHash('sha256').update(value).digest('hex')
function migrate(db) {
  db.exec('CREATE TABLE _prisma_migrations(id TEXT PRIMARY KEY, checksum TEXT NOT NULL, migration_name TEXT NOT NULL)')
  for (const row of manifest.migrations) {
    const sql = readFileSync(row.filename)
    assert.equal(hash(sql), row.sha256)
    db.exec('BEGIN')
    try {
      db.exec(sql.toString())
      db.prepare('INSERT INTO _prisma_migrations VALUES(?,?,?)').run(
        randomUUID(),
        row.sha256,
        path.basename(path.dirname(row.filename)),
      )
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}
function minimal(db) {
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE QualityJourneyProviderRun(id TEXT PRIMARY KEY); CREATE TABLE QualityJourneyProviderDispatchIntent(id TEXT PRIMARY KEY); CREATE TABLE QualityJourneyProviderObservation(id TEXT PRIMARY KEY); INSERT INTO QualityJourneyProviderRun VALUES('run'); INSERT INTO QualityJourneyProviderDispatchIntent VALUES('intent');",
  )
  const row = manifest.migrations.find(row => row.filename.includes('/20261021000000_add_provider_source_custody/'))
  const sql = readFileSync(row.filename)
  assert.equal(hash(sql), row.sha256)
  db.exec(sql.toString())
}
if (mode === 'inspect') {
  // Supervisor launches this branch ONLY after the actual original owner exit0 latch.
  const db = new DatabaseSync(path.join(directory, 'tested.db'), { readOnly: true })
  const schema = db
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE name LIKE 'provider_source_%' OR name LIKE 'QualityJourneyProviderSource%' ORDER BY name",
    )
    .all()
  assert.equal(schema.length, 14)
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  const count = db.prepare('SELECT count(*) AS count FROM _prisma_migrations').get().count
  assert.equal(count, 93)
  db.close()
  writeFileSync(
    path.join(directory, 'post-exit-inspection.json'),
    JSON.stringify({ pid: process.pid, mode, schemaObjects: schema.length, migrations: count, knownClosed: true }) +
      '\n',
    { flag: 'wx' },
  )
} else {
  assert.equal(mode, 'setup')
  for (const name of ['warmup', 'tested', 'postcontrol']) {
    const filename = path.join(directory, name + '.db')
    assert(!existsSync(filename), 'Never reuse a consumed database')
    const db = new DatabaseSync(filename)
    if (selected === 'storage') migrate(db)
    else minimal(db)
    if (name === 'tested' && selected.startsWith('ledger-')) corruptLedger(db, selected)
    db.close()
  }
  writeFileSync(
    path.join(directory, 'setup-result.json'),
    JSON.stringify({
      pid: process.pid,
      selected,
      execArgv: process.execArgv,
      knownClosed: true,
      schema:
        selected === 'storage'
          ? 'FULL_CANONICAL_93_MIGRATIONS'
          : selected.startsWith('ledger-')
            ? 'MINIMAL_SCHEMA_EXPLICIT_CORRUPT_LEDGER'
            : 'THREE_ID_ONLY_STUBS_PLUS_SOURCE_CUSTODY_MIGRATION',
    }) + '\n',
    { flag: 'wx' },
  )
}
