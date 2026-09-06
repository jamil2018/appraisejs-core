import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const workspace = mkdtempSync(path.join(tmpdir(), 'appraise-prisma-migrations-'))
const databasePath = path.join(workspace, 'migrations.db')
const migrationsRoot = path.join(process.cwd(), 'prisma', 'migrations')
const journeyAuthorityMigration = '20260906090000_quality_journey_authority'

const retainedSchemaFixture = `
PRAGMA foreign_keys=ON;
INSERT INTO TargetProject(id,canonicalPath,displayName,fingerprint,createdAt,updatedAt,lastDetectedAt) VALUES('preserved-target','/tmp/target','Target','sha256:target',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO Environment(id,name,baseUrl,credentialState,createdAt,updatedAt,targetProjectId) VALUES('preserved-env','Env','https://example.test','NONE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'preserved-target');
INSERT INTO TestRun(id,name,runId,startedAt,status,result,updatedAt,environmentId,browserEngine,targetProjectId,evidenceHealth) VALUES('preserved-run','Run','run-public',CURRENT_TIMESTAMP,'COMPLETED','PASSED',CURRENT_TIMESTAMP,'preserved-env','CHROMIUM','preserved-target','valid');
INSERT INTO Report(id,name,createdAt,updatedAt,testRunId,targetProjectId) VALUES('preserved-report','Report',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'preserved-run','preserved-target');
`

try {
  const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => existsSync(path.join(migrationsRoot, name, 'migration.sql')))
    .sort()

  for (const migration of migrations) {
    if (migration === journeyAuthorityMigration)
      execFileSync('sqlite3', [databasePath], { input: retainedSchemaFixture, stdio: ['pipe', 'pipe', 'pipe'] })
    const migrationPath = path.join(migrationsRoot, migration, 'migration.sql')
    const sql = readFileSync(migrationPath, 'utf8')
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
  const tables = execFileSync(
    'sqlite3',
    [databasePath, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
  for (const required of ['QualityJourney', 'QualityJourneyExecutionTestRun', 'QualityJourneyExecutionEvidenceReceipt'])
    if (!tables.includes(required)) throw new Error(`Journey table ${required} is missing after migration.`)
  for (const removed of ['QualityPlan', 'Assessment', 'AssessmentRun', 'EvidenceReceipt', 'ValidationVersion'])
    if (tables.includes(removed)) throw new Error(`Removed legacy table ${removed} survived migration.`)

  const retainedRows = execFileSync(
    'sqlite3',
    [
      databasePath,
      "SELECT (SELECT count(*) FROM TargetProject WHERE id='preserved-target'), (SELECT count(*) FROM Environment WHERE id='preserved-env'), (SELECT count(*) FROM TestRun WHERE id='preserved-run'), (SELECT count(*) FROM Report WHERE id='preserved-report'), (SELECT intent FROM TestRun WHERE id='preserved-run');",
    ],
    { encoding: 'utf8' },
  ).trim()
  if (retainedRows !== '1|1|1|1|INDEPENDENT')
    throw new Error(`Retained-schema migration rehearsal failed: ${retainedRows || 'no rows returned'}`)

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

  const foreignKeyViolations = execFileSync('sqlite3', [databasePath, 'PRAGMA foreign_key_check;'], {
    encoding: 'utf8',
  }).trim()
  if (foreignKeyViolations) throw new Error(`Foreign-key violations after migration:\n${foreignKeyViolations}`)
  console.log(
    `Applied ${migrations.length} migrations; verified retained-schema data, Journey-only schema, foreign keys, and built-in Step Definition reseed.`,
  )
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
