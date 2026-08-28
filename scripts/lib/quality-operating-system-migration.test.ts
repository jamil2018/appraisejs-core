import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

type Statement = {
  get<T extends Record<string, unknown> = Record<string, unknown>>(...values: unknown[]): T | undefined
  all<T extends Record<string, unknown> = Record<string, unknown>>(...values: unknown[]): T[]
}
type DatabaseSync = { close(): void; exec(sql: string): void; prepare(sql: string): Statement }

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSync
}

const qualityOperatingSystemMigration = '20260826000000_add_quality_operating_system_foundation'
const migrationsRoot = join(process.cwd(), 'prisma', 'migrations')
const workspaces: string[] = []

function createDatabase(beforeMigration?: string) {
  const workspace = mkdtempSync(join(tmpdir(), 'appraise-quality-os-upgrade-'))
  workspaces.push(workspace)
  const database = new DatabaseSync(join(workspace, 'quality-os.db'))
  for (const migration of readdirSync(migrationsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()) {
    if (beforeMigration && migration >= beforeMigration) break
    database.exec(readFileSync(join(migrationsRoot, migration, 'migration.sql'), 'utf8'))
  }
  database.exec('PRAGMA foreign_keys=ON')
  return database
}

function applyQualityOperatingSystemMigration(database: DatabaseSync) {
  database.exec(readFileSync(join(migrationsRoot, qualityOperatingSystemMigration, 'migration.sql'), 'utf8'))
}

function seedPreMergeHead(database: DatabaseSync) {
  database.exec(`
    INSERT INTO "TargetProject" ("id", "kind", "canonicalIdentity", "canonicalPath", "displayName", "fingerprint", "updatedAt")
    VALUES ('target-preserved', 'LOCAL_WORKSPACE', 'path:/tmp/quality-os-upgrade', '/tmp/quality-os-upgrade', 'Preserved target', 'sha256:target-preserved', '2026-08-25T00:00:00.000Z');
    INSERT INTO "Environment" ("id", "name", "baseUrl", "credentialState", "targetProjectId", "updatedAt")
    VALUES ('environment-preserved', 'Preserved environment', 'https://example.test', 'NONE', 'target-preserved', '2026-08-25T00:00:00.000Z');
    INSERT INTO "TestRun" ("id", "name", "runId", "status", "result", "intent", "evidenceHealth", "environmentId", "targetProjectId", "updatedAt")
    VALUES ('run-preserved', 'Independent history', 'run-preserved-id', 'COMPLETED', 'PASSED', 'INDEPENDENT', 'valid', 'environment-preserved', 'target-preserved', '2026-08-25T00:00:00.000Z');
    INSERT INTO "Report" ("id", "name", "testRunId", "targetProjectId", "updatedAt")
    VALUES ('report-preserved', 'Independent report', 'run-preserved', 'target-preserved', '2026-08-25T00:00:00.000Z');
    INSERT INTO "QualityPlan" ("id", "targetProjectId", "title", "updatedAt")
    VALUES ('plan-cut', 'target-preserved', 'Provisional plan', '2026-08-25T00:00:00.000Z');
    INSERT INTO "QualityPlanRevision" ("id", "targetProjectId", "qualityPlanId", "revision", "status", "contentHash", "sourceSpecification", "requirementGraphJson", "updatedAt")
    VALUES ('revision-cut', 'target-preserved', 'plan-cut', 1, 'PUBLISHED', 'sha256:revision-cut', '{}', '{}', '2026-08-25T00:00:00.000Z');
    INSERT INTO "RequirementSnapshot" ("id", "qualityPlanRevisionId", "text", "kind", "contentHash")
    VALUES ('snapshot-cut', 'revision-cut', 'A provisional requirement', 'EXPLICIT', 'sha256:snapshot-cut');
    INSERT INTO "QualityObligationRevision" ("id", "qualityPlanRevisionId", "requirementSnapshotId", "title", "intent", "assertionScopeJson", "minimumAssurance", "contentHash")
    VALUES ('obligation-cut', 'revision-cut', 'snapshot-cut', 'Provisional obligation', 'prove it', '{}', 'STANDARD', 'sha256:obligation-cut');
    INSERT INTO "ValidationVersion" ("id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "canonicalAstJson", "canonicalHash")
    VALUES ('validation-cut', 'target-preserved', 'revision-cut', 'Provisional validation', 1, 'PUBLISHED', '{}', 'sha256:validation-cut');
    INSERT INTO "QualityValidationGeneration" (
      "id", "generationKey", "targetProjectId", "qualityPlanRevisionId", "validationVersionId", "artifactSchemaVersion",
      "preflightAlgorithmVersion", "preflightAuthority", "scopeIntentHash", "realizationIntentHash", "preflightHash",
      "canonicalRealizationJson", "realizationHash", "compilationHash", "assuranceLevel", "disposition"
    ) VALUES (
      'generation-cut', 'generation-cut', 'target-preserved', 'revision-cut', 'validation-cut', 'v3',
      'preflight-v3', 'authority-v3', 'sha256:scope', 'sha256:intent', 'sha256:preflight',
      '{}', 'sha256:realization', 'sha256:compilation', 'STANDARD', 'ACTIVE'
    );
    INSERT INTO "QualityValidationPublication" (
      "id", "generationId", "targetProjectId", "targetFingerprint", "qualityPlanRevisionId", "validationVersionId", "operationHash",
      "expectedRevisionHash", "validationHash", "validationContent", "reviewHash", "reviewContent", "astId", "astHash", "contextHash",
      "previewHash", "receiptHash", "projectionHash", "projectionJson", "validationProjectionJson", "runtimeInputHash", "runtimeInputJson", "updatedAt"
    ) VALUES (
      'publication-cut', 'generation-cut', 'target-preserved', 'sha256:target-preserved', 'revision-cut', 'validation-cut', 'sha256:operation-cut',
      'sha256:revision-cut', 'sha256:validation-cut', '{}', 'sha256:review-cut', '{}', 'ast-cut', 'sha256:ast-cut', 'sha256:context-cut',
      'sha256:preview-cut', 'sha256:receipt-cut', 'sha256:projection-cut', '{}', '{}', 'sha256:runtime-cut', '{}', '2026-08-25T00:00:00.000Z'
    );
    INSERT INTO "RuntimeCapsule" ("id", "targetProjectId", "testRunId", "validationHash", "qualityPublicationId", "capsuleHash", "manifestHash", "manifestJson", "storagePath", "integrityState", "updatedAt")
    VALUES ('capsule-preserved', 'target-preserved', 'run-preserved', 'sha256:validation-cut', 'publication-cut', 'sha256:capsule', 'sha256:manifest', '{}', '/tmp/capsule-preserved', 'ready', '2026-08-25T00:00:00.000Z');
  `)
}

function seedPostCutoverLineage(database: DatabaseSync) {
  database.exec(`
    INSERT INTO "QualityPlan" ("id", "targetProjectId", "title", "updatedAt")
    VALUES ('plan-fresh', 'target-preserved', 'Fresh plan', CURRENT_TIMESTAMP);
    INSERT INTO "QualityPlanRevision" ("id", "targetProjectId", "qualityPlanId", "revision", "status", "contentHash", "sourceSpecification", "requirementGraphJson", "updatedAt")
    VALUES ('revision-fresh', 'target-preserved', 'plan-fresh', 1, 'PUBLISHED', 'sha256:revision-fresh', '{}', '{}', CURRENT_TIMESTAMP);
    INSERT INTO "RequirementAnalysisRevision" ("id", "targetProjectId", "qualityPlanRevisionId", "revision", "status", "decision", "analysisJson", "provenanceJson", "analysisHash")
    VALUES ('analysis-fresh', 'target-preserved', 'revision-fresh', 1, 'APPROVED', 'APPROVED', '{}', '{}', 'sha256:analysis-fresh');
    INSERT INTO "ValidationDesignRevision" ("id", "targetProjectId", "qualityPlanRevisionId", "requirementAnalysisRevisionId", "revision", "status", "decision", "strategyJson", "scenarioPortfolioJson", "provenanceJson", "designHash")
    VALUES ('design-fresh', 'target-preserved', 'revision-fresh', 'analysis-fresh', 1, 'APPROVED', 'APPROVED', '{}', '{}', '{}', 'sha256:design-fresh');
    INSERT INTO "ValidationVersion" ("id", "targetProjectId", "qualityPlanRevisionId", "validationDesignRevisionId", "validationIdentity", "version", "status", "canonicalAstJson", "canonicalHash")
    VALUES ('validation-fresh', 'target-preserved', 'revision-fresh', 'design-fresh', 'Fresh validation', 1, 'DESIGNED', '{}', 'sha256:validation-fresh');
    INSERT INTO "QualityValidationGeneration" (
      "id", "generationKey", "targetProjectId", "qualityPlanRevisionId", "validationVersionId", "artifactSchemaVersion",
      "preflightAlgorithmVersion", "preflightAuthority", "scopeIntentHash", "realizationIntentHash", "preflightHash",
      "canonicalRealizationJson", "realizationHash", "compilationHash", "assuranceLevel"
    ) VALUES (
      'generation-fresh', 'generation-fresh', 'target-preserved', 'revision-fresh', 'validation-fresh', 'v3',
      'preflight-v3', 'authority-v3', 'sha256:scope-fresh', 'sha256:intent-fresh', 'sha256:preflight-fresh',
      '{}', 'sha256:realization-fresh', 'sha256:compilation-fresh', 'STANDARD'
    );
  `)
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true })
})

describe('quality operating system migration', { timeout: 60_000 }, () => {
  it('applies to a blank ordered migration history', () => {
    const database = createDatabase()
    try {
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(database.prepare('PRAGMA table_info("ValidationVersion")').all()).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'validationDesignRevisionId' })]),
      )
    } finally {
      database.close()
    }
  })

  it('cleanly cuts provisional v3 history while preserving product records and restoring v3 immutability', () => {
    const database = createDatabase(qualityOperatingSystemMigration)
    try {
      seedPreMergeHead(database)
      applyQualityOperatingSystemMigration(database)

      expect(
        database.prepare(`SELECT "executionConsentMode" FROM "TargetProject" WHERE "id" = 'target-preserved'`).get(),
      ).toEqual({ executionConsentMode: 'ALWAYS_ASK' })
      expect(
        database
          .prepare(
            `SELECT count(*) AS count FROM "Environment" WHERE "id" = 'environment-preserved'
             UNION ALL SELECT count(*) FROM "TestRun" WHERE "id" = 'run-preserved'
             UNION ALL SELECT count(*) FROM "Report" WHERE "id" = 'report-preserved'
             UNION ALL SELECT count(*) FROM "RuntimeCapsule" WHERE "id" = 'capsule-preserved' AND "qualityPublicationId" IS NULL`,
          )
          .all(),
      ).toEqual([{ count: 1 }, { count: 1 }, { count: 1 }, { count: 1 }])
      expect(
        database
          .prepare(
            `SELECT count(*) AS count FROM "QualityPlan"
             UNION ALL SELECT count(*) FROM "ValidationVersion"
             UNION ALL SELECT count(*) FROM "QualityValidationGeneration"
             UNION ALL SELECT count(*) FROM "QualityValidationPublication"`,
          )
          .all(),
      ).toEqual([{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }])

      const validationColumns = database.prepare('PRAGMA table_info("ValidationVersion")').all()
      expect(validationColumns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'validationDesignRevisionId' }),
          expect.objectContaining({ name: 'activeGenerationId' }),
          expect.objectContaining({ name: 'scenarioApprovalHash' }),
        ]),
      )
      expect(database.prepare('PRAGMA foreign_key_list("ValidationVersion")').all()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: 'ValidationDesignRevision', from: 'validationDesignRevisionId' }),
        ]),
      )
      expect(
        database
          .prepare(
            `SELECT "name" FROM sqlite_master
             WHERE "type" = 'trigger'
               AND "name" IN (
                 'QualityValidationGeneration_no_update',
                 'QualityValidationGeneration_no_delete',
                 'QualityValidationPublication_no_delete',
                 'AssessmentRunPublicationCheckpoint_no_delete'
               )
             ORDER BY "name"`,
          )
          .all(),
      ).toEqual([
        { name: 'AssessmentRunPublicationCheckpoint_no_delete' },
        { name: 'QualityValidationGeneration_no_delete' },
        { name: 'QualityValidationGeneration_no_update' },
        { name: 'QualityValidationPublication_no_delete' },
      ])

      seedPostCutoverLineage(database)
      expect(() =>
        database.exec(
          `INSERT INTO "ValidationVersion" ("id", "targetProjectId", "qualityPlanRevisionId", "validationDesignRevisionId", "validationIdentity", "version", "status", "canonicalAstJson", "canonicalHash")
           VALUES ('validation-invalid-design', 'target-preserved', 'revision-fresh', 'missing-design', 'Invalid design', 2, 'DESIGNED', '{}', 'sha256:invalid-design')`,
        ),
      ).toThrow(/FOREIGN KEY constraint failed/)
      expect(() =>
        database.exec(
          `UPDATE "QualityValidationGeneration" SET "disposition" = 'RETIRED' WHERE "id" = 'generation-fresh'`,
        ),
      ).toThrow(/immutable/)
      expect(() => database.exec(`DELETE FROM "QualityValidationGeneration" WHERE "id" = 'generation-fresh'`)).toThrow(
        /immutable/,
      )
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      database.close()
    }
  })
})
