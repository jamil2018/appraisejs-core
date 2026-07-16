import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const workspace = mkdtempSync(path.join(tmpdir(), 'appraise-prisma-migrations-'))
const databasePath = path.join(workspace, 'migrations.db')
const migrationsRoot = path.join(process.cwd(), 'prisma', 'migrations')

try {
  const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()

  for (const migration of migrations) {
    const migrationPath = path.join(migrationsRoot, migration, 'migration.sql')
    const sql = readFileSync(migrationPath, 'utf8')
    if (migration === '20260716190000_replace_environment_password_with_reference') {
      execFileSync('sqlite3', [databasePath], {
        input: `INSERT INTO "Environment" ("id", "name", "baseUrl", "password", "createdAt", "updatedAt") VALUES ('legacy-env', 'Legacy', 'https://example.test', 'known-fixture-secret-sentinel', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    }
    execFileSync('sqlite3', [databasePath], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] })
  }

  const environmentColumns = execFileSync('sqlite3', [databasePath, 'PRAGMA table_info("Environment");'], {
    encoding: 'utf8',
  })
  if (environmentColumns.split('\n').some(line => line.split('|')[1] === 'password')) {
    throw new Error('Environment.password still exists after the credential-reference migration.')
  }
  const migratedLegacyRow = execFileSync(
    'sqlite3',
    [
      databasePath,
      `SELECT credentialState || '|' || (legacyCredentialDetectedAt IS NOT NULL) FROM Environment WHERE id = 'legacy-env';`,
    ],
    { encoding: 'utf8' },
  ).trim()
  if (migratedLegacyRow !== 'LEGACY_DISABLED|1') {
    throw new Error(`Legacy environment was not disabled and inventoried: ${migratedLegacyRow || 'missing'}`)
  }
  const databaseDump = execFileSync('sqlite3', [databasePath, '.dump Environment'], { encoding: 'utf8' })
  if (databaseDump.includes('known-fixture-secret-sentinel')) {
    throw new Error('Legacy environment credential remained in the migrated database dump.')
  }

  execFileSync('sqlite3', [databasePath, 'PRAGMA foreign_key_check;'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log(`Applied ${migrations.length} migrations and verified populated legacy credential removal.`)
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
