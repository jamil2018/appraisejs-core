import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const refusal = () =>
  new Error(
    'Installation integrity failure: restore the matching application migration files and inventory. Preserve storage; no reset or downgrade is allowed.',
  )

/** Enumerate authoring input strictly; verification must use the independent inventory. */
export function enumerateDatabaseMigrations(cwd) {
  const root = path.join(cwd, 'prisma', 'migrations')
  try {
    const entries = readdirSync(root, { withFileTypes: true })
    if (entries.some(entry => entry.isSymbolicLink())) throw refusal()
    const migrations = entries
      .filter(entry => entry.isDirectory())
      .map(entry => {
        const sql = path.join(root, entry.name, 'migration.sql')
        if (!lstatSync(sql).isFile()) throw refusal()
        return { name: entry.name, checksum: createHash('sha256').update(readFileSync(sql)).digest('hex') }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    if (!migrations.length) throw refusal()
    return migrations
  } catch {
    throw refusal()
  }
}

/** Validate an installed tree against the separately shipped canonical authoring artifact. */
export function verifiedDatabaseMigrations(cwd) {
  try {
    const file = path.join(cwd, 'prisma', 'migration-inventory.json')
    if (!lstatSync(file).isFile()) throw refusal()
    const expected = JSON.parse(readFileSync(file, 'utf8'))
    const actual = enumerateDatabaseMigrations(cwd)
    if (expected.schemaVersion !== 1 || JSON.stringify(expected.migrations) !== JSON.stringify(actual)) throw refusal()
    return actual
  } catch {
    throw refusal()
  }
}

/** Compare installed files to the producer inventory even if their own inventory was altered. */
export function assertDatabaseMigrationParity(cwd, expected) {
  if (JSON.stringify(verifiedDatabaseMigrations(cwd)) !== JSON.stringify(expected))
    throw new Error('Package migration inventory differs from canonical source.')
}
