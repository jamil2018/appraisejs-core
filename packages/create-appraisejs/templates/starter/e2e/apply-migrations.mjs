import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

function sqlitePathFromDatabaseUrl(value) {
  if (!value?.startsWith('file:')) {
    throw new Error(`E2E SQLite setup expects a file: DATABASE_URL, received ${value || '<empty>'}`)
  }

  const sqlitePath = value.replace(/^file:/, '')
  return isAbsolute(sqlitePath) ? sqlitePath : resolve(process.cwd(), 'prisma', sqlitePath)
}

const databaseUrl = process.env.DATABASE_URL ?? 'file:./e2e.db'
const databasePath = sqlitePathFromDatabaseUrl(databaseUrl)
const migrationsDir = resolve(process.cwd(), 'prisma', 'migrations')
const db = new DatabaseSync(databasePath)

db.exec(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
  );
`)

const appliedRows = db.prepare('SELECT migration_name FROM "_prisma_migrations"').all()
const appliedMigrations = new Set(appliedRows.map(row => row.migration_name))
const insertMigration = db.prepare(`
  INSERT INTO "_prisma_migrations" (
    id,
    checksum,
    finished_at,
    migration_name,
    logs,
    rolled_back_at,
    applied_steps_count
  ) VALUES (?, ?, current_timestamp, ?, NULL, NULL, 1)
`)

const migrationNames = readdirSync(migrationsDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()

for (const migrationName of migrationNames) {
  if (appliedMigrations.has(migrationName)) {
    continue
  }

  const migrationPath = join(migrationsDir, migrationName, 'migration.sql')
  if (!existsSync(migrationPath)) {
    continue
  }

  const sql = readFileSync(migrationPath, 'utf8')
  const checksum = createHash('sha256').update(sql).digest('hex')

  db.exec('BEGIN')
  try {
    db.exec(sql)
    insertMigration.run(randomUUID(), checksum, migrationName)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

db.close()
