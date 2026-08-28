import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

type SQLiteStatement = {
  all<T extends Record<string, unknown> = Record<string, unknown>>(...values: unknown[]): T[]
  get<T extends Record<string, unknown> = Record<string, unknown>>(...values: unknown[]): T | undefined
}

type DatabaseSync = {
  close(): void
  exec(sql: string): void
  prepare(sql: string): SQLiteStatement
}

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSync
}

const cutoverMigration = '20260810000000_add_assessment_execution_cutover'
const migrationsRoot = join(process.cwd(), 'prisma', 'migrations')
const workspaces: string[] = []

const retiredTables = [
  'BaselineAttemptEvent',
  'BaselineAttempt',
  'RepositoryExportReceipt',
  'RepositoryExportJob',
  'ProviderArtifactSnapshot',
  'ProviderPermissionDecision',
  'ProviderRunEvent',
  'ProviderWorkflowRun',
  'ProviderAdapterRegistration',
  'PlanTaskProjection',
  'PlanSyncIssue',
  'PlanRevision',
  'PlanEvent',
  'ValidationDecisionReceipt',
  'ValidationNodePublication',
  'ValidationExtensionReview',
  'ValidationAstPublishOperation',
  'PlanCoordinatorLease',
  'PlanPersonalLayout',
  'PlanOperationMetric',
  'ValidationResourceProposal',
  'CoordinatorFailureReceipt',
  'CoordinatorOperationReceipt',
  'DelegatedCoordinatorConsumption',
  'DelegatedCoordinatorReceipt',
  'DelegatedAuthorizationNonce',
  'DelegatedValidationAstSubmission',
  'AppraiseProjectIdentity',
  'PlanProjection',
]

function createPreCutoverDatabase(): DatabaseSync {
  const workspace = mkdtempSync(join(tmpdir(), 'appraise-assessment-cutover-'))
  workspaces.push(workspace)
  const database = new DatabaseSync(join(workspace, 'legacy.db'))

  for (const migrationName of readdirSync(migrationsRoot).sort()) {
    if (migrationName >= cutoverMigration) break
    database.exec(readFileSync(join(migrationsRoot, migrationName, 'migration.sql'), 'utf8'))
  }

  database.exec('PRAGMA foreign_keys=ON')
  return database
}

function tableColumns(database: DatabaseSync, tableName: string): string[] {
  return database
    .prepare(`PRAGMA table_info("${tableName}")`)
    .all<{ name: string }>()
    .map(column => column.name)
}

function tableExists(database: DatabaseSync, tableName: string): boolean {
  return Boolean(database.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get('table', tableName))
}

function seedLegacyFixture(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO "TargetProject" ("id", "canonicalPath", "displayName", "fingerprint", "updatedAt")
    VALUES ('project-1', '/tmp/assessment-cutover-target', 'Cutover target', 'sha256:target', '2026-08-10T00:00:00.000Z');
    INSERT INTO "Environment" ("id", "name", "baseUrl", "updatedAt", "targetProjectId")
    VALUES ('environment-1', 'Cutover environment', 'https://example.test', '2026-08-10T00:00:00.000Z', 'project-1');
    INSERT INTO "Module" ("id", "name", "updatedAt", "targetProjectId")
    VALUES ('module-1', 'Cutover module', '2026-08-10T00:00:00.000Z', 'project-1');
    INSERT INTO "TestSuite" ("id", "name", "description", "updatedAt", "moduleId", "targetProjectId")
    VALUES ('suite-1', 'Preserved suite', 'legacy suite data', '2026-08-10T00:00:00.000Z', 'module-1', 'project-1');
    INSERT INTO "TestCase" ("id", "title", "description", "updatedAt", "targetProjectId")
    VALUES ('case-1', 'Preserved case', 'legacy case data', '2026-08-10T00:00:00.000Z', 'project-1');
    INSERT INTO "PlanProjection" ("id", "planId", "revision", "lifecycle", "goal", "description", "sourceHash", "planPath", "lastValidProjectedAt", "updatedAt", "targetProjectId")
    VALUES ('projection-1', 'plan-1', 1, 'approved', 'retired plan fixture', 'retired plan fixture', 'sha256:plan', '/tmp/plan.md', '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z', 'project-1');
    INSERT INTO "ProviderAdapterRegistration" ("id", "key", "displayName", "providerKind", "adapterVersion", "capabilitiesJson", "updatedAt")
    VALUES ('provider-1', 'legacy-provider', 'Legacy provider', 'codex', '1', '{}', '2026-08-10T00:00:00.000Z');
    INSERT INTO "DelegatedCoordinatorReceipt" ("id", "parentCoordinatorId", "delegatedCoordinatorId", "targetProjectId", "targetFingerprint", "pathFingerprint", "purpose", "permissionsJson", "prohibitionsJson", "nonce", "receiptJson", "expiresAt")
    VALUES ('delegation-1', 'parent', 'child', 'project-1', 'sha256:target', 'sha256:path', 'legacy delegation', '[]', '[]', 'nonce', '{}', '2026-08-11T00:00:00.000Z');
    INSERT INTO "ValidationAstPublishOperation" ("id", "planId", "planProjectionId", "targetProjectId", "targetFingerprint", "idempotencyKey", "operationHash", "expectedPlanHash", "expectedPlanArtifactHash", "expectedReviewHash", "planHash", "validationHash", "reviewHash", "planContent", "validationContent", "reviewContent", "astId", "astHash", "contextHash", "previewHash", "receiptHash", "projectionHash", "projectionJson", "validationProjectionJson", "updatedAt")
    VALUES ('legacy-publication-1', 'plan-1', 'projection-1', 'project-1', 'sha256:target', 'legacy-publication', 'sha256:operation', 'sha256:plan', 'sha256:artifact', 'sha256:review', 'sha256:plan', 'sha256:validation', 'sha256:review', '{}', '{}', '{}', 'ast-1', 'sha256:ast', 'sha256:context', 'sha256:preview', 'sha256:receipt', 'sha256:projection', '{}', '{}', '2026-08-10T00:00:00.000Z');
    INSERT INTO "ValidationNodePublication" ("id", "planId", "targetProjectId", "validationId", "contentHash", "publishOperationId", "operationHash", "runtimeInputHash", "projectionHash", "publicationHash")
    VALUES ('legacy-node-publication-1', 'plan-1', 'project-1', 'validation-1', 'sha256:validation', 'legacy-publication-1', 'sha256:operation', 'sha256:runtime', 'sha256:projection', 'sha256:publication');
    INSERT INTO "TestRun" ("id", "name", "preparationKey", "runId", "startedAt", "completedAt", "status", "result", "evidenceHealth", "updatedAt", "environmentId", "testWorkersCount", "browserEngine", "logPath", "reportPath", "planId", "targetProjectId")
    VALUES ('run-1', 'Preserved run', 'preparation-1', 'run-key-1', '2026-08-10T00:00:00.000Z', '2026-08-10T00:01:00.000Z', 'COMPLETED', 'PASSED', 'valid', '2026-08-10T00:01:00.000Z', 'environment-1', 2, 'CHROMIUM', '/tmp/run.log', '/tmp/run.json', 'plan-1', 'project-1');
    INSERT INTO "Report" ("id", "name", "description", "reportPath", "updatedAt", "testRunId", "targetProjectId")
    VALUES ('report-1', 'Preserved report', 'legacy report data', '/tmp/run.json', '2026-08-10T00:01:00.000Z', 'run-1', 'project-1');
    INSERT INTO "RuntimeCapsule" ("id", "targetProjectId", "testRunId", "validationHash", "capsuleHash", "manifestHash", "manifestJson", "storagePath", "integrityState", "version", "createdAt", "updatedAt", "publicationId")
    VALUES ('capsule-1', 'project-1', 'run-1', 'sha256:validation', 'sha256:capsule', 'sha256:manifest', '{"fixture":true}', '/tmp/capsule', 'ready', 3, '2026-08-10T00:00:00.000Z', '2026-08-10T00:01:00.000Z', 'legacy-node-publication-1');
    INSERT INTO "QualityPlan" ("id", "targetProjectId", "title", "description", "updatedAt")
    VALUES ('quality-plan-1', 'project-1', 'Preserved quality plan', 'quality data', '2026-08-10T00:00:00.000Z');
    INSERT INTO "QualityPlanRevision" ("id", "targetProjectId", "qualityPlanId", "revision", "status", "contentHash", "sourceSpecification", "requirementGraphJson", "updatedAt")
    VALUES ('quality-revision-1', 'project-1', 'quality-plan-1', 1, 'SCENARIOS_APPROVED', 'sha256:quality-revision', 'quality specification', '{}', '2026-08-10T00:00:00.000Z');
    INSERT INTO "RequirementSnapshot" ("id", "qualityPlanRevisionId", "externalRef", "text", "kind", "contentHash")
    VALUES ('requirement-1', 'quality-revision-1', 'REQ-1', 'Preserved requirement', 'REQUIREMENT', 'sha256:requirement');
    INSERT INTO "QualityObligationRevision" ("id", "qualityPlanRevisionId", "requirementSnapshotId", "title", "intent", "assertionScopeJson", "minimumAssurance", "contentHash")
    VALUES ('obligation-1', 'quality-revision-1', 'requirement-1', 'Preserved obligation', 'assert preservation', '{}', 'STANDARD', 'sha256:obligation');
    INSERT INTO "ValidationVersion" ("id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "canonicalAstJson", "canonicalHash", "scenarioApprovedAt")
    VALUES ('validation-1', 'project-1', 'quality-revision-1', 'validation.identity', 1, 'PUBLISHED', '{}', 'sha256:canonical', '2026-08-10T00:00:00.000Z');
    INSERT INTO "EvaluationSubjectRevision" ("id", "subjectDigest", "subjectKind", "authority", "metadataJson")
    VALUES ('subject-1', 'sha256:subject', 'ARTIFACT', 'fixture', '{}');
    INSERT INTO "Assessment" ("id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "status", "alignment", "observedAssurance", "updatedAt")
    VALUES ('assessment-1', 'project-1', 'quality-plan-1', 'quality-revision-1', 'subject-1', 'DECIDED', 'CURRENT', 'STANDARD', '2026-08-10T00:00:00.000Z');
  `)
}

function addCutoverBindings(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO "QualityValidationPublication" ("id", "targetProjectId", "targetFingerprint", "qualityPlanRevisionId", "validationVersionId", "idempotencyKey", "operationHash", "expectedRevisionHash", "validationHash", "validationContent", "reviewHash", "reviewContent", "astId", "astHash", "contextHash", "previewHash", "receiptHash", "projectionHash", "projectionJson", "validationProjectionJson", "runtimeInputHash", "runtimeInputJson", "createdAt", "updatedAt")
    VALUES ('quality-publication-1', 'project-1', 'sha256:target', 'quality-revision-1', 'validation-1', 'publication-1', 'sha256:quality-operation', 'sha256:quality-revision', 'sha256:validation', '{}', 'sha256:review', '{}', 'ast-2', 'sha256:ast', 'sha256:context', 'sha256:preview', 'sha256:receipt', 'sha256:projection', '{}', '{}', 'sha256:runtime', '{}', '2026-08-10T00:01:00.000Z', '2026-08-10T00:01:00.000Z');
    UPDATE "RuntimeCapsule" SET "qualityPublicationId" = 'quality-publication-1' WHERE "id" = 'capsule-1';
    INSERT INTO "AssessmentRun" ("id", "targetProjectId", "assessmentId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "idempotencyScope", "idempotencyKey", "requestHash", "updatedAt")
    VALUES ('assessment-run-1', 'project-1', 'assessment-1', 'quality-revision-1', 'subject-1', 'assessment', 'assessment-run-1', 'sha256:request', '2026-08-10T00:01:00.000Z');
    INSERT INTO "EvidenceReceipt" ("id", "targetProjectId", "qualityPlanRevisionId", "assessmentId", "validationVersionId", "evaluationSubjectRevisionId", "resultMatrixCell", "assuranceLevel", "outcome", "runtimeInputHash", "environmentSnapshotHash", "dataProvenanceHash", "outputHash", "receiptHash")
    VALUES ('evidence-1', 'project-1', 'quality-revision-1', 'assessment-1', 'validation-1', 'subject-1', 'matrix-1', 'STANDARD', 'PASSED', 'sha256:runtime', 'sha256:environment', 'sha256:data', 'sha256:output', 'sha256:evidence');
    INSERT INTO "EvidenceReceipt" ("id", "targetProjectId", "qualityPlanRevisionId", "assessmentId", "validationVersionId", "evaluationSubjectRevisionId", "resultMatrixCell", "assuranceLevel", "outcome", "runtimeInputHash", "environmentSnapshotHash", "dataProvenanceHash", "outputHash", "receiptHash")
    VALUES ('evidence-retry', 'project-1', 'quality-revision-1', 'assessment-1', 'validation-1', 'subject-1', 'matrix-1', 'STANDARD', 'PASSED', 'sha256:runtime', 'sha256:environment', 'sha256:data-retry', 'sha256:output-retry', 'sha256:evidence-retry');
    INSERT INTO "AssessmentRunBinding" ("id", "assessmentRunId", "validationVersionId", "resultMatrixCell", "testRunId", "runtimeInputHash", "terminalOutcome", "terminalizedAt", "evidenceReceiptId", "updatedAt")
    VALUES ('binding-1', 'assessment-run-1', 'validation-1', 'matrix-1', 'run-1', 'sha256:runtime', 'PASSED', '2026-08-10T00:01:00.000Z', 'evidence-1', '2026-08-10T00:01:00.000Z');
  `)
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true })
})

describe('assessment execution cutover migration', { timeout: 60_000 }, () => {
  it('preserves execution and Quality data while removing retired lifecycle storage', () => {
    const database = createPreCutoverDatabase()
    try {
      seedLegacyFixture(database)
      database.exec(readFileSync(join(migrationsRoot, cutoverMigration, 'migration.sql'), 'utf8'))

      expect(
        database
          .prepare(
            'SELECT "name" || ? || "result" || ? || "evidenceHealth" AS "preserved" FROM "TestRun" WHERE "id" = ?',
          )
          .get('|', '|', 'run-1'),
      ).toEqual({ preserved: 'Preserved run|PASSED|valid' })
      expect(
        database
          .prepare('SELECT "name" || ? || "description" AS "preserved" FROM "Report" WHERE "id" = ?')
          .get('|', 'report-1'),
      ).toEqual({ preserved: 'Preserved report|legacy report data' })
      expect(database.prepare('SELECT "name" FROM "TestSuite" WHERE "id" = ?').get('suite-1')).toEqual({
        name: 'Preserved suite',
      })
      expect(database.prepare('SELECT "title" FROM "TestCase" WHERE "id" = ?').get('case-1')).toEqual({
        title: 'Preserved case',
      })
      expect(database.prepare('SELECT "title" FROM "QualityPlan" WHERE "id" = ?').get('quality-plan-1')).toEqual({
        title: 'Preserved quality plan',
      })
      expect(
        database.prepare('SELECT "title" FROM "QualityObligationRevision" WHERE "id" = ?').get('obligation-1'),
      ).toEqual({ title: 'Preserved obligation' })
      expect(database.prepare('SELECT "status" FROM "Assessment" WHERE "id" = ?').get('assessment-1')).toEqual({
        status: 'DECIDED',
      })

      expect(tableColumns(database, 'TestRun')).not.toContain('planId')
      expect(tableColumns(database, 'RuntimeCapsule')).not.toContain('publicationId')
      expect(tableColumns(database, 'RuntimeCapsule')).toContain('qualityPublicationId')
      expect(
        database
          .prepare('SELECT "validationHash" || ? || "version" AS "preserved" FROM "RuntimeCapsule" WHERE "id" = ?')
          .get('|', 'capsule-1'),
      ).toEqual({ preserved: 'sha256:validation|3' })

      for (const tableName of retiredTables) expect(tableExists(database, tableName)).toBe(false)

      addCutoverBindings(database)
      expect(
        database
          .prepare(
            'SELECT "assessmentRunId" || ? || "validationVersionId" || ? || "testRunId" || ? || "evidenceReceiptId" AS "binding" FROM "AssessmentRunBinding" WHERE "id" = ?',
          )
          .get('|', '|', '|', 'binding-1'),
      ).toEqual({ binding: 'assessment-run-1|validation-1|run-1|evidence-1' })
      expect(
        database.prepare('SELECT "qualityPublicationId" FROM "RuntimeCapsule" WHERE "id" = ?').get('capsule-1'),
      ).toEqual({ qualityPublicationId: 'quality-publication-1' })
      expect(
        database
          .prepare(
            'SELECT COUNT(*) AS "count" FROM "EvidenceReceipt" WHERE "validationVersionId" = ? AND "resultMatrixCell" = ?',
          )
          .get('validation-1', 'matrix-1'),
      ).toEqual({ count: 2 })
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      database.close()
    }
  })
})
