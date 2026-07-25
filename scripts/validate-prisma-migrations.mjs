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
    if (migration === '20260725190000_add_step_block_migration_ledger') {
      execFileSync('sqlite3', [databasePath], {
        input: `
          INSERT INTO "StepDefinitionDraft" ("id", "proposedStepId", "proposedVersion", "draftJson", "draftHash", "createdAt", "updatedAt")
          VALUES ('legacy-composition-draft', 'legacy.composition.draft', '1', '{"execution":{"kind":"composition","steps":[{"step":{"id":"legacy.child","version":"1"},"inputs":{}}]}}', 'sha256:legacy-draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
          INSERT INTO "StepDefinition" ("id", "version", "status", "title", "description", "definitionJson", "definitionHash", "humanProjectionHash", "agentContractHash", "executionHash", "provenanceJson", "createdAt")
          VALUES ('legacy.composition.ready', '1', 'ready', 'Legacy composition', 'Legacy composition', '{"execution":{"kind":"composition","steps":[{"step":{"id":"legacy.child","version":"1"},"inputs":{}}]}}', 'sha256:legacy-definition', 'sha256:legacy-human', 'sha256:legacy-agent', 'sha256:legacy-execution', '{}', CURRENT_TIMESTAMP);
          INSERT INTO "StepHumanProjection" ("stepId", "stepVersion", "signature", "groupId", "projectionJson", "projectionHash")
          VALUES ('legacy.composition.ready', '1', 'legacy composition migration fixture', 'migration', '{}', 'sha256:legacy-human');
          INSERT INTO "StepExecutionBinding" ("stepId", "stepVersion", "kind", "bindingJson", "bindingHash")
          VALUES ('legacy.composition.ready', '1', 'composition', '{"kind":"composition","steps":[{"step":{"id":"legacy.child","version":"1"},"inputs":{}}]}', 'sha256:legacy-execution');
          INSERT INTO "StepPublicationReceipt" ("stepId", "stepVersion", "receiptJson", "receiptHash", "registryManifestHash", "conformanceRunId", "reviewAuthority", "publishedAt")
          VALUES ('legacy.composition.ready', '1', '{}', 'sha256:legacy-receipt', 'sha256:legacy-manifest', 'legacy-fixture', 'migration-test', CURRENT_TIMESTAMP);
        `,
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
  const legacyCompositions = execFileSync(
    'sqlite3',
    [
      databasePath,
      `SELECT
        (SELECT count(*) FROM StepDefinitionDraft WHERE id = 'legacy-composition-draft') +
        (SELECT count(*) FROM StepDefinition WHERE id = 'legacy.composition.ready');`,
    ],
    { encoding: 'utf8' },
  ).trim()
  if (legacyCompositions !== '0') {
    throw new Error(`Legacy pre-hash compositions survived the exact-reference migration: ${legacyCompositions}`)
  }

  execFileSync('sqlite3', [databasePath, 'PRAGMA foreign_key_check;'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log(
    `Applied ${migrations.length} migrations and verified populated legacy credential and composition removal.`,
  )
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
