import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { auditQualityJourneyIntegrity, type JourneyAuditDatabase } from './lib/quality-journey-integrity'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (
    path: string,
    options?: { readOnly: boolean },
  ) => JourneyAuditDatabase & { exec(sql: string): void; close(): void }
}
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--database'))
  throw new Error('Usage: check-quality-journey-integrity.ts [--database <SQLite path>]')
const temporary = args.length ? null : mkdtempSync(join(tmpdir(), 'appraise-journey-audit-'))
const database = new DatabaseSync(temporary ? join(temporary, 'audit.db') : resolve(args[1]!), { readOnly: !temporary })
try {
  if (temporary) {
    const migrations = resolve('prisma/migrations')
    for (const entry of readdirSync(migrations, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name)))
      database.exec(readFileSync(join(migrations, entry.name, 'migration.sql'), 'utf8'))
  }
  const result = auditQualityJourneyIntegrity(database)
  console.log(
    JSON.stringify(
      { ...result, scope: temporary ? 'forward-migrated-clean-database' : 'explicit-read-only-database' },
      null,
      2,
    ),
  )
  if (result.result !== 'PASS') process.exitCode = 1
} finally {
  database.close()
  if (temporary) rmSync(temporary, { recursive: true, force: true })
}
