import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, renameSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertProviderSourceDatabaseClient,
  createProviderSourcePrismaClient,
  openProviderSourceDatabase,
  providerSourceDatabaseFor,
  sourceSqliteConstructor,
  type ProviderSourceDatabase,
  type SourceSqliteConnection,
} from './provider-source-database'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
function fresh() {
  const directory = mkdtempSync(path.join(process.env.CUSTODY_STORAGE_EVIDENCE ?? os.tmpdir(), 'custody-storage-'))
  const filename = path.join(directory, 'canonical.db')
  const db = new (sourceSqliteConstructor())(filename)
  cleanups.push(() => db.close())
  return { directory, filename, db }
}
function migrated() {
  const fixture = fresh()
  const run = () =>
    execFileSync(process.execPath, ['e2e/apply-migrations.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${fixture.filename}` },
      stdio: 'pipe',
    })
  run()
  return { ...fixture, migrateAgain: run }
}
function stateFixture() {
  const fixture = fresh()
  fixture.db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE "QualityJourneyProviderRun" (id TEXT PRIMARY KEY);
    CREATE TABLE "QualityJourneyProviderDispatchIntent" (id TEXT PRIMARY KEY);
    CREATE TABLE "QualityJourneyProviderObservation" (id TEXT PRIMARY KEY);
    INSERT INTO "QualityJourneyProviderRun" VALUES ('run');
    INSERT INTO "QualityJourneyProviderDispatchIntent" VALUES ('intent');
  `)
  fixture.db.exec(readFileSync('prisma/migrations/20261021000000_add_provider_source_custody/migration.sql', 'utf8'))
  fixture.db
    .prepare(
      `INSERT INTO "QualityJourneyProviderSourceState"
    (sourceId,sourceIncarnation,providerRunId,intentId,providerNamespace,identityJson,protocolDigest,qualificationDigest,head)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run('source', 'incarnation', 'run', 'intent', 'synthetic:storage', '{}', 'protocol', 'qualification', 'root')
  return fixture
}
function append(db: SourceSqliteConnection) {
  db.prepare(
    `INSERT INTO "QualityJourneyProviderSourceLedgerRecord"
    (sourceId,sequence,previousHead,head,kind,dataJson,byteCount) VALUES (?,?,?,?,?,?,?)`,
  ).run('source', 1, 'root', 'head1', 'CREATED', '{}', 100)
  db.exec(
    `UPDATE "QualityJourneyProviderSourceState" SET sequence=1, head='head1', byteCount=100 WHERE sourceId='source'`,
  )
}

describe('canonical source database storage (no physical release capability)', () => {
  it('applies all real migrations once and preserves the exact source schema on reapply', () => {
    const fixture = migrated()
    const schema = fixture.db
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE name LIKE 'provider_source_%' OR name LIKE 'QualityJourneyProviderSource%' ORDER BY name",
      )
      .all()
    expect(schema.length).toBe(14)
    fixture.migrateAgain()
    expect(
      fixture.db
        .prepare(
          "SELECT name,sql FROM sqlite_master WHERE name LIKE 'provider_source_%' OR name LIKE 'QualityJourneyProviderSource%' ORDER BY name",
        )
        .all(),
    ).toEqual(schema)
    expect(fixture.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('constructs and binds only its exact original real Prisma client and verifies actual durability', async () => {
    const fixture = migrated()
    const { client, ready } = createProviderSourcePrismaClient(`file:${fixture.filename}`)
    cleanups.push(() => client.$disconnect())
    const binding = await ready
    expect(providerSourceDatabaseFor(client)).toBe(binding)
    expect(() => providerSourceDatabaseFor({} as typeof client)).toThrow('source_database_binding')
    expect(() => assertProviderSourceDatabaseClient(binding, {} as typeof client)).toThrow('source_database_binding')
    expect(() => openProviderSourceDatabase({} as ProviderSourceDatabase)).toThrow('source_database_binding')
    const source = openProviderSourceDatabase(binding)
    cleanups.push(() => source.close())
    expect(
      source
        .prepare('PRAGMA database_list')
        .all()
        .find(row => row.name === 'main')?.file,
    ).toBe(fixture.filename)
    expect(source.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    expect(source.prepare('PRAGMA synchronous').get()).toEqual({ synchronous: 2 })
    expect(source.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: 0 })
    expect(source.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' })
  })
  it('refuses unsupported original engine metadata before exposing any source (classifier check only)', async () => {
    const fixture = migrated()
    const { client, ready } = createProviderSourcePrismaClient(`file:${fixture.filename}`)
    cleanups.push(() => client.$disconnect())
    await ready
    // Controlled private metadata fault: no binary engine is launched or qualified.
    const original = client as unknown as { _engine: { name: string } }
    original._engine.name = 'BinaryEngine'
    expect(() => providerSourceDatabaseFor(client)).toThrow('source_prisma_library_engine_required')
    expect(fixture.db.prepare('SELECT count(*) AS count FROM QualityJourneyProviderSourceState').get()).toEqual({
      count: 0,
    })
  })
  it('refuses the actual disabled builtin with the stable capability error before database activity', () => {
    const sourceModule = pathToFileURL(path.resolve('src/lib/quality-journey/provider-source-database.ts')).href
    const output = execFileSync(
      process.execPath,
      [
        '--no-experimental-sqlite',
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `const { sourceSqliteConstructor } = await import(${JSON.stringify(sourceModule)}); try { sourceSqliteConstructor(); process.exitCode = 1 } catch (error) { console.log(error.message) }`,
      ],
      { cwd: process.cwd(), env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8' },
    )
    expect(output.trim()).toBe('source_sqlite_unavailable')
  })
  it('constructs the original client with canonical file identity, including a symlink spelling', async () => {
    const fixture = migrated()
    const alternate = path.join(fixture.directory, 'alias.db')
    symlinkSync(fixture.filename, alternate)
    const { client, ready } = createProviderSourcePrismaClient(`file:${alternate}`)
    cleanups.push(() => client.$disconnect())
    const binding = await ready
    const rows = await client.$queryRawUnsafe<Array<{ name: string; file: string }>>('PRAGMA database_list')
    expect(rows.find(row => row.name === 'main')?.file).toBe(fixture.filename)
    expect(providerSourceDatabaseFor(client)).toBe(binding)
  })
  it('refuses replaced files, unbound clients and unsupported local URLs', async () => {
    const fixture = migrated()
    const { client, ready } = createProviderSourcePrismaClient(`file:${fixture.filename}`)
    cleanups.push(() => client.$disconnect())
    const binding = await ready
    renameSync(fixture.filename, `${fixture.filename}.retained`)
    const replacement = new (sourceSqliteConstructor())(fixture.filename)
    cleanups.push(() => replacement.close())
    expect(() => openProviderSourceDatabase(binding)).toThrow('source_database_replaced')
    for (const url of ['file::memory:', 'file:relative.db', 'https://invalid', `file:${fixture.filename}?mode=memory`])
      expect(() => createProviderSourcePrismaClient(url)).toThrow('source_database_url')
  })
  it('refuses unmigrated files and WAL instead of changing active journal mode', async () => {
    const fixture = fresh()
    const { client, ready } = createProviderSourcePrismaClient(`file:${fixture.filename}`)
    cleanups.push(() => client.$disconnect())
    const binding = await ready
    expect(() => openProviderSourceDatabase(binding)).toThrow('source_database_unmigrated')
    fixture.db.exec('PRAGMA journal_mode = WAL')
    expect(() => openProviderSourceDatabase(binding)).toThrow('source_database_durability')
    expect(fixture.db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' })
  })
  it('rejects immutable binding/range changes, ledger updates/deletes and bad continuity', () => {
    const { db } = stateFixture()
    expect(() => db.exec("UPDATE QualityJourneyProviderSourceState SET providerNamespace='other'")).toThrow(
      'source_binding_immutable',
    )
    expect(() =>
      db.exec(
        "INSERT INTO QualityJourneyProviderSourceLedgerRecord VALUES ('source',2,'root','bad','ALLOCATED','{}',1)",
      ),
    ).toThrow('source_ledger_admission')
    append(db)
    expect(() => db.exec("UPDATE QualityJourneyProviderSourceLedgerRecord SET dataJson='bad'")).toThrow(
      'source_ledger_immutable',
    )
    expect(() => db.exec('DELETE FROM QualityJourneyProviderSourceLedgerRecord')).toThrow('source_ledger_immutable')
    expect(() => db.exec("UPDATE QualityJourneyProviderSourceState SET pendingBatchId='partial'")).toThrow()
    db.exec(
      "UPDATE QualityJourneyProviderSourceState SET lifecycle='SEALED',sealedHead=head,sealedEnvelopeDigest='receipt'",
    )
    expect(() => db.exec("UPDATE QualityJourneyProviderSourceState SET head='lost'")).toThrow('source_range_sealed')
    expect(() =>
      db.exec("INSERT INTO QualityJourneyProviderSourceLedgerRecord VALUES ('source',2,'head1','bad','LATE','{}',1)"),
    ).toThrow('source_ledger_admission')
  })
  it('holds a real SQLite writer barrier against a distinct zero-timeout connection until commit', () => {
    const { db, filename } = stateFixture()
    append(db)
    db.exec(
      "UPDATE QualityJourneyProviderSourceState SET lifecycle='SEALED',sealedHead=head,sealedEnvelopeDigest='receipt'",
    )
    const contender = new (sourceSqliteConstructor())(filename)
    cleanups.push(() => contender.close())
    contender.exec('PRAGMA busy_timeout = 0')
    db.exec('BEGIN')
    expect(
      db
        .prepare(
          "UPDATE QualityJourneyProviderSourceState SET commitFenceVersion=commitFenceVersion+1 WHERE sourceId='source' AND lifecycle='SEALED' AND pendingBatchId IS NULL AND pendingBatchStartHead IS NULL AND pendingBatchRecordAllowance IS NULL AND pendingBatchByteAllowance IS NULL AND pendingBatchRequestDigest IS NULL",
        )
        .run().changes,
    ).toBe(1)
    expect(() => contender.exec("UPDATE QualityJourneyProviderSourceState SET lifecycle='REVOKED'")).toThrow(
      /locked|busy/i,
    )
    expect(
      contender.prepare('SELECT lifecycle,commitFenceVersion FROM QualityJourneyProviderSourceState').get(),
    ).toEqual({ lifecycle: 'SEALED', commitFenceVersion: 0 })
    db.exec('COMMIT')
    expect(
      contender.prepare('SELECT lifecycle,commitFenceVersion FROM QualityJourneyProviderSourceState').get(),
    ).toEqual({ lifecycle: 'SEALED', commitFenceVersion: 1 })
  })
})
