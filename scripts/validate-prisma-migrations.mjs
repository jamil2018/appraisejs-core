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
    if (migration === '20260821000000_add_quality_operating_system_foundation') {
      execFileSync('sqlite3', [databasePath], {
        input: `
          INSERT INTO "TargetProject" ("id", "kind", "canonicalIdentity", "canonicalPath", "displayName", "fingerprint", "createdAt", "updatedAt", "lastDetectedAt")
          VALUES ('preserved-target', 'LOCAL_WORKSPACE', 'migration-preservation-fixture', '/migration-preservation-fixture', 'Preserved target', 'sha256:preserved-target', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
          INSERT INTO "Environment" ("id", "name", "baseUrl", "credentialState", "createdAt", "updatedAt", "targetProjectId")
          VALUES ('preserved-environment', 'Migration fixture', 'https://example.test', 'NONE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'preserved-target');
          INSERT INTO "TestRun" ("id", "name", "runId", "startedAt", "status", "result", "intent", "evidenceHealth", "updatedAt", "environmentId", "browserEngine", "targetProjectId")
          VALUES ('preserved-run', 'Preserved independent run', 'preserved-run-id', CURRENT_TIMESTAMP, 'COMPLETED', 'PASSED', 'INDEPENDENT', 'valid', CURRENT_TIMESTAMP, 'preserved-environment', 'CHROMIUM', 'preserved-target');
          INSERT INTO "Report" ("id", "name", "createdAt", "updatedAt", "testRunId", "targetProjectId")
          VALUES ('preserved-report', 'Preserved report', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'preserved-run', 'preserved-target');
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
  if (environmentColumns.split('\n').some(line => line.split('|')[1] === 'legacyCredentialDetectedAt'))
    throw new Error('Environment.legacyCredentialDetectedAt survived the capsule-only cutover.')
  const databaseDump = execFileSync('sqlite3', [databasePath, '.dump Environment'], { encoding: 'utf8' })
  if (databaseDump.includes('known-fixture-secret-sentinel')) {
    throw new Error('Legacy environment credential remained in the migrated database dump.')
  }
  const resetRows = execFileSync(
    'sqlite3',
    [
      databasePath,
      `SELECT
        (SELECT count(*) FROM AssessmentRun) +
        (SELECT count(*) FROM EvidenceReceipt) +
        (SELECT count(*) FROM StepDefinition);`,
    ],
    { encoding: 'utf8' },
  ).trim()
  if (resetRows !== '0') throw new Error(`The Quality lifecycle cutover retained incompatible rows: ${resetRows}`)
  const preservedRows = execFileSync(
    'sqlite3',
    [
      databasePath,
      `SELECT
        (SELECT count(*) FROM TargetProject WHERE id = 'preserved-target') +
        (SELECT count(*) FROM Environment WHERE id = 'preserved-environment') +
        (SELECT count(*) FROM TestRun WHERE id = 'preserved-run') +
        (SELECT count(*) FROM Report WHERE id = 'preserved-report');`,
    ],
    { encoding: 'utf8' },
  ).trim()
  if (preservedRows !== '4')
    throw new Error(`The Quality lifecycle cutover lost shared product history: ${preservedRows}`)

  execFileSync('node', ['--import', 'tsx', 'scripts/sync-step-definitions.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${databasePath}`, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const reseededDefinitions = execFileSync('sqlite3', [databasePath, 'SELECT count(*) FROM StepDefinition;'], {
    encoding: 'utf8',
  }).trim()
  if (reseededDefinitions === '0')
    throw new Error('Canonical built-in Step Definitions were not reseeded after cutover.')

  execFileSync('sqlite3', [databasePath, 'PRAGMA foreign_key_check;'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log(
    `Applied ${migrations.length} migrations; verified Quality-state reset, product-history preservation, and built-in Step Definition reseed.`,
  )
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
