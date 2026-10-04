import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const { PrismaClient } = createRequire(import.meta.url)('@prisma/client')

/** @param {string} cwd @param {Record<string, string | undefined>} env */
export function databaseCompatibilityUrl(cwd, env = process.env) {
  const envPath = path.join(cwd, '.env')
  const source = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  const match = source.match(/^\s*DATABASE_URL\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\r\n]+))\s*$/m)
  const value = env.DATABASE_URL ?? (match?.[1] ?? match?.[2] ?? match?.[3])?.trim()
  if (!value?.startsWith('file:') || value === 'file::memory:')
    throw new Error('Storage compatibility requires a persisted SQLite file: DATABASE_URL.')
  const [filename, query] = value.slice(5).split('?')
  if (!filename) throw new Error('Storage compatibility requires a SQLite file path.')
  const databasePath = path.isAbsolute(filename) ? filename : path.resolve(cwd, 'prisma', filename)
  return { databasePath, url: `file:${databasePath}${query ? `?${query}` : ''}` }
}

export function knownDatabaseMigrations(cwd) {
  const root = path.join(cwd, 'prisma', 'migrations')
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(path.join(root, entry.name, 'migration.sql')))
    .map(entry => ({
      name: entry.name,
      checksum: createHash('sha256')
        .update(readFileSync(path.join(root, entry.name, 'migration.sql')))
        .digest('hex'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function completedMigrations(rows, known) {
  const completed = new Set()
  for (const row of rows) {
    const migration = known.find(item => item.name === row.migration_name)
    if (!migration || migration.checksum !== row.checksum)
      throw new Error(
        'Incompatible storage: unknown or changed migration. Downgrade refused; preserve data and use the matching newer application.',
      )
    if (row.rolled_back_at) continue
    if (!row.finished_at)
      throw new Error('Unfinished migration: preserve data and reconcile migration history before startup or upgrade.')
    if (completed.has(row.migration_name))
      throw new Error('Ambiguous migration history; preserve data and reconcile before startup.')
    completed.add(row.migration_name)
  }
  return completed
}

function migrationReadiness(known, completed, allowPending) {
  const pending = known.filter(item => !completed.has(item.name))
  const firstPending = known.findIndex(item => !completed.has(item.name))
  if (firstPending >= 0 && known.slice(firstPending).some(item => completed.has(item.name)))
    throw new Error('Non-contiguous migration history; preserve data and reconcile before startup or upgrade.')
  if (pending.length && !allowPending)
    throw new Error(
      'Storage upgrade required. Back up data and run npm run migrate-db with this application before starting.',
    )
  return { status: pending.length ? 'UPGRADE_REQUIRED' : 'COMPATIBLE', pending: pending.length }
}

/**
 * Read-only preflight. It never resets, rolls back, repairs, or adopts unknown storage.
 * @param {{ cwd?: string, env?: Record<string, string | undefined>, allowPending?: boolean }} options
 */
export async function assertDatabaseCompatibility({
  cwd = process.cwd(),
  env = process.env,
  allowPending = false,
} = {}) {
  const { databasePath, url } = databaseCompatibilityUrl(cwd, env)
  const known = knownDatabaseMigrations(cwd)
  if (!existsSync(databasePath)) {
    if (allowPending) return { status: 'NEW_DATABASE', pending: known.length }
    throw new Error('Database is missing. Run npm run migrate-db with the matching application before starting.')
  }
  const client = new PrismaClient({ datasources: { db: { url } } })
  try {
    const tables = await client.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    if (!tables.some(row => row.name === '_prisma_migrations')) {
      if (!tables.length && allowPending) return { status: 'NEW_DATABASE', pending: known.length }
      throw new Error(
        'Storage has no supported migration history. Preserve it and use the matching application; no reset is allowed.',
      )
    }
    const rows = await client.$queryRawUnsafe(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations',
    )
    return migrationReadiness(known, completedMigrations(rows, known), allowPending)
  } finally {
    await client.$disconnect()
  }
}
