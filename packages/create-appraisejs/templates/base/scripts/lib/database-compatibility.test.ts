import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { assertDatabaseCompatibility, databaseCompatibilityUrl } from './database-compatibility.mjs'
import { assertDatabaseMigrationParity, enumerateDatabaseMigrations } from './migration-inventory.mjs'

const workspaces: string[] = []
const producerRoot = process.cwd()
afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cwd => fs.rm(cwd, { recursive: true, force: true })))
})

async function fixture() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-storage-compatibility-'))
  workspaces.push(cwd)
  const root = path.join(cwd, 'prisma', 'migrations')
  await fs.mkdir(path.join(root, '001'), { recursive: true })
  await fs.mkdir(path.join(root, '002'), { recursive: true })
  for (const name of ['001', '002']) await fs.writeFile(path.join(root, name, 'migration.sql'), `-- ${name}`)
  await fs.writeFile(
    path.join(cwd, 'prisma', 'migration-inventory.json'),
    JSON.stringify({
      schemaVersion: 1,
      migrations: enumerateDatabaseMigrations(cwd),
    }),
  )
  const databasePath = path.join(cwd, 'prisma', 'fixture.db')
  const sql = (source: string) => execFileSync('sqlite3', [databasePath, source], { encoding: 'utf8' })
  const checksum = (name: string) => createHash('sha256').update(`-- ${name}`).digest('hex')
  const add = (name: string, finished = true, rolledBack = false, hash = checksum(name)) =>
    sql(
      `INSERT INTO _prisma_migrations VALUES('${name}','${hash}',${finished ? "'2026-10-03'" : 'NULL'},${rolledBack ? "'2026-10-03'" : 'NULL'});`,
    )
  const initialize = () =>
    sql(
      "CREATE TABLE _prisma_migrations(migration_name TEXT, checksum TEXT, finished_at TEXT, rolled_back_at TEXT); CREATE TABLE retained(id TEXT, payload TEXT); INSERT INTO retained VALUES('journey','sealed-fixture');",
    )
  return { cwd, databasePath, sql, add, initialize, options: { cwd, env: { DATABASE_URL: 'file:./fixture.db' } } }
}

async function damageInstallation(cwd: string, damage: string) {
  const root = path.join(cwd, 'prisma', 'migrations')
  if (damage === 'missing-sql') await fs.rm(path.join(root, '002', 'migration.sql'))
  if (damage === 'deleted-directory') await fs.rm(path.join(root, '002'), { recursive: true })
  if (damage === 'changed-sql') await fs.writeFile(path.join(root, '002', 'migration.sql'), '-- changed')
  if (damage === 'extra-directory') {
    await fs.mkdir(path.join(root, '003'))
    await fs.writeFile(path.join(root, '003', 'migration.sql'), '-- extra')
  }
  if (damage === 'symlink-sql') {
    await fs.rm(path.join(root, '002', 'migration.sql'))
    await fs.symlink('../001/migration.sql', path.join(root, '002', 'migration.sql'))
  }
  if (damage === 'missing-inventory') await fs.rm(path.join(cwd, 'prisma', 'migration-inventory.json'))
}

describe('storage compatibility refusal before mutation', () => {
  it('checks prepared or packed migrations against the independent producer inventory', async () => {
    const f = await fixture()
    const expected = enumerateDatabaseMigrations(f.cwd)
    expect(() => assertDatabaseMigrationParity(f.cwd, expected)).not.toThrow()
    await fs.rm(path.join(f.cwd, 'prisma', 'migrations', '002'), { recursive: true })
    expect(() => assertDatabaseMigrationParity(f.cwd, expected)).toThrow('Installation integrity failure')
    await fs.writeFile(
      path.join(f.cwd, 'prisma', 'migration-inventory.json'),
      JSON.stringify({ schemaVersion: 1, migrations: enumerateDatabaseMigrations(f.cwd) }),
    )
    expect(() => assertDatabaseMigrationParity(f.cwd, expected)).toThrow('differs from canonical source')
  })
  it.each(['missing-sql', 'deleted-directory', 'changed-sql', 'extra-directory', 'symlink-sql', 'missing-inventory'])(
    'refuses %s installation before storage observation or mutation',
    async damage => {
      const f = await fixture()
      f.initialize()
      f.add('001')
      // Missing unapplied input must not disappear and make the remaining ledger compatible.
      if (damage !== 'missing-sql' && damage !== 'deleted-directory') f.add('002')
      const before = await fs.readFile(f.databasePath)
      await damageInstallation(f.cwd, damage)
      for (const allowPending of [false, true]) {
        await expect(assertDatabaseCompatibility({ ...f.options, allowPending })).rejects.toThrow(
          'Installation integrity failure',
        )
      }
      expect(await fs.readFile(f.databasePath)).toEqual(before)
      for (const script of ['migrate-compatible.mjs', 'start-local.mjs']) {
        const result = spawnSync(process.execPath, [path.join(producerRoot, 'scripts', script), 'start'], {
          cwd: f.cwd,
          env: { ...process.env, DATABASE_URL: `file:${f.databasePath}` },
          encoding: 'utf8',
        })
        expect(result.status).toBe(1)
        expect(result.stderr).toContain('Installation integrity failure')
        expect(await fs.readFile(f.databasePath)).toEqual(before)
      }
      await fs.rm(f.databasePath)
      await expect(assertDatabaseCompatibility({ ...f.options, allowPending: true })).rejects.toThrow(
        'Installation integrity failure',
      )
      await expect(fs.stat(f.databasePath)).rejects.toMatchObject({ code: 'ENOENT' })
    },
  )
  it('allows absent storage only for explicit upgrades and never creates it during inspection', async () => {
    const f = await fixture()
    await expect(assertDatabaseCompatibility(f.options)).rejects.toThrow('Database is missing')
    expect(await assertDatabaseCompatibility({ ...f.options, allowPending: true })).toEqual({
      status: 'NEW_DATABASE',
      pending: 2,
    })
    await expect(fs.stat(f.databasePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('allows a known prefix for upgrade, requires complete history for serving, and reopens current storage', async () => {
    const f = await fixture()
    f.initialize()
    f.add('001')
    await expect(assertDatabaseCompatibility(f.options)).rejects.toThrow('Storage upgrade required')
    expect(await assertDatabaseCompatibility({ ...f.options, allowPending: true })).toEqual({
      status: 'UPGRADE_REQUIRED',
      pending: 1,
    })
    f.add('002')
    expect(await assertDatabaseCompatibility(f.options)).toEqual({ status: 'COMPATIBLE', pending: 0 })
    expect(await assertDatabaseCompatibility(f.options)).toEqual({ status: 'COMPATIBLE', pending: 0 })
    expect(f.sql('SELECT payload FROM retained;').trim()).toBe('sealed-fixture')
  })

  it.each(['future', 'checksum', 'unfinished', 'gap', 'duplicate', 'untracked'])(
    'refuses %s storage without changing database bytes',
    async kind => {
      const f = await fixture()
      f.initialize()
      if (kind === 'untracked') f.sql('DROP TABLE _prisma_migrations;')
      else if (kind === 'gap') f.add('002')
      else {
        f.add('001', kind !== 'unfinished', false, kind === 'checksum' ? 'changed' : undefined)
        if (kind === 'future') f.add('999', true, false, 'future')
        if (kind === 'duplicate') f.add('001')
      }
      const before = await fs.readFile(f.databasePath)
      await expect(assertDatabaseCompatibility({ ...f.options, allowPending: true })).rejects.toThrow()
      await expect(assertDatabaseCompatibility(f.options)).rejects.toThrow()
      expect(await fs.readFile(f.databasePath)).toEqual(before)
      expect(f.sql('SELECT payload FROM retained;').trim()).toBe('sealed-fixture')
    },
  )

  it('permits a known rolled-back attempt followed by its completed migration', async () => {
    const f = await fixture()
    f.initialize()
    f.add('001', false, true)
    f.add('001')
    f.add('002')
    expect(await assertDatabaseCompatibility(f.options)).toMatchObject({ status: 'COMPATIBLE' })
  })

  it.each(['migrate-compatible.mjs', 'start-local.mjs'])(
    'blocks the real %s entry point before readiness or migration writes',
    async script => {
      const f = await fixture()
      f.initialize()
      f.add('001')
      f.add('999', true, false, 'future')
      const before = await fs.readFile(f.databasePath)
      const result = spawnSync(process.execPath, [path.join(producerRoot, 'scripts', script), 'start'], {
        cwd: f.cwd,
        env: { ...process.env, DATABASE_URL: `file:${f.databasePath}` },
        encoding: 'utf8',
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Downgrade refused')
      expect(await fs.readFile(f.databasePath)).toEqual(before)
      expect(await fs.readdir(f.cwd)).toEqual(['prisma'])
    },
  )

  it('resolves project env paths without consulting the user database', async () => {
    const f = await fixture()
    await fs.writeFile(path.join(f.cwd, '.env'), 'DATABASE_URL="file:./fixture.db"\n')
    expect(databaseCompatibilityUrl(f.cwd, {}).databasePath).toBe(f.databasePath)
    expect(() => databaseCompatibilityUrl(f.cwd, { DATABASE_URL: 'postgres://unsupported' })).toThrow('SQLite')
  })
})
