import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { enumerateDatabaseMigrations, verifiedDatabaseMigrations } from './lib/migration-inventory.mjs'

const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--check') {
  console.log(`Verified ${verifiedDatabaseMigrations(process.cwd()).length} canonical migration entries.`)
} else if (args.length === 1 && args[0] === '--write') {
  const migrations = enumerateDatabaseMigrations(process.cwd())
  writeFileSync(
    path.resolve('prisma/migration-inventory.json'),
    `${JSON.stringify({ schemaVersion: 1, migrations }, null, 2)}\n`,
  )
  console.log(`Authored ${migrations.length} migration entries; review SQL and inventory together.`)
} else {
  throw new Error('Usage: update-migration-inventory.mjs --check | --write (explicit migration authoring only)')
}
