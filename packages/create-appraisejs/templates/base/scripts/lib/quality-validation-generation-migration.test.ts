import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

type Statement = {
  get<T extends Record<string, unknown> = Record<string, unknown>>(...values: unknown[]): T | undefined
  all<T extends Record<string, unknown> = Record<string, unknown>>(...values: unknown[]): T[]
}
type DatabaseSync = { close(): void; exec(sql: string): void; prepare(sql: string): Statement }

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSync
}

const generationMigration = '20260824120000_quality_validation_generation_v3'
const qualityOperatingSystemMigration = '20260826000000_add_quality_operating_system_foundation'
const migrationsRoot = join(process.cwd(), 'prisma', 'migrations')
const workspaces: string[] = []

function databaseBeforeGenerationMigration() {
  const workspace = mkdtempSync(join(tmpdir(), 'appraise-generation-upgrade-'))
  workspaces.push(workspace)
  const database = new DatabaseSync(join(workspace, 'v2.db'))
  for (const migration of readdirSync(migrationsRoot).sort()) {
    if (migration >= generationMigration) break
    database.exec(readFileSync(join(migrationsRoot, migration, 'migration.sql'), 'utf8'))
  }
  database.exec('PRAGMA foreign_keys=ON')
  return { database, path: join(workspace, 'v2.db') }
}

function applyGenerationMigration(database: DatabaseSync) {
  database.exec(readFileSync(join(migrationsRoot, generationMigration, 'migration.sql'), 'utf8'))
}

function applyQualityOperatingSystemMigration(database: DatabaseSync) {
  for (const migration of readdirSync(migrationsRoot).sort()) {
    if (migration <= generationMigration || migration >= qualityOperatingSystemMigration) continue
    database.exec(readFileSync(join(migrationsRoot, migration, 'migration.sql'), 'utf8'))
  }
  database.exec(readFileSync(join(migrationsRoot, qualityOperatingSystemMigration, 'migration.sql'), 'utf8'))
}

function seedLegacyPublication(
  database: DatabaseSync,
  values: { id?: string; versionId?: string; status?: string } = {},
) {
  const id = values.id ?? 'publication-1'
  const versionId = values.versionId ?? 'validation-1'
  const status = values.status ?? 'PUBLISHED'
  database.exec(`
    INSERT INTO "TargetProject" ("id", "kind", "canonicalIdentity", "canonicalPath", "displayName", "fingerprint", "updatedAt")
    VALUES ('target-1', 'LOCAL_WORKSPACE', 'path:/tmp/generation-fixture', '/tmp/generation-fixture', 'Generation fixture', 'sha256:target', '2026-08-24T00:00:00.000Z');
    INSERT INTO "QualityPlan" ("id", "targetProjectId", "title", "description", "updatedAt")
    VALUES ('plan-1', 'target-1', 'Generation plan', 'fixture', '2026-08-24T00:00:00.000Z');
    INSERT INTO "QualityPlanRevision" ("id", "targetProjectId", "qualityPlanId", "revision", "status", "contentHash", "sourceSpecification", "requirementGraphJson", "updatedAt")
    VALUES ('revision-1', 'target-1', 'plan-1', 1, 'PUBLISHED', 'sha256:revision', '{}', '{}', '2026-08-24T00:00:00.000Z');
    INSERT INTO "ValidationVersion" ("id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "canonicalAstJson", "canonicalHash", "realizationJson", "realizationHash", "compilationHash")
    VALUES ('${versionId}', 'target-1', 'revision-1', '${versionId}', 1, '${status}', '{"stable":true}', 'sha256:validation', '{"legacy":true}', 'sha256:realization', 'sha256:compilation');
    INSERT INTO "QualityValidationPublication" (
      "id", "targetProjectId", "targetFingerprint", "qualityPlanRevisionId", "validationVersionId", "idempotencyKey", "operationHash", "phase",
      "preflightAlgorithmVersion", "preflightAuthority", "scopeIntentHash", "realizationIntentHash", "preflightHash", "preflightDisposition",
      "expectedRevisionHash", "validationHash", "validationContent", "reviewHash", "reviewContent", "astId", "astHash", "contextHash", "previewHash",
      "receiptHash", "projectionHash", "projectionJson", "validationProjectionJson", "runtimeInputHash", "runtimeInputJson", "failure", "createdAt", "updatedAt"
    ) VALUES (
      '${id}', 'target-1', 'sha256:target', 'revision-1', '${versionId}', 'legacy-command-key', 'sha256:operation', 'review_ready',
      'appraise.quality-assessment-preflight/v1', 'appraisejs:quality-validation-publication:v1', 'sha256:scope', 'sha256:realization-intent', 'sha256:preflight', 'RETIRED_UNSUPPORTED',
      'sha256:revision', 'sha256:validation', '{"stable":true}', 'sha256:review', '{"review":true}', 'ast-1', 'sha256:ast', 'sha256:context', 'sha256:preview',
      'sha256:receipt', 'sha256:projection', '{"projection":true}', '{"validation":true}', 'sha256:runtime', '{"runtime":true}', NULL, '2026-08-24T00:00:00.000Z', '2026-08-24T00:00:00.000Z'
    );
  `)
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true })
})

describe('quality validation generation v3 migration', () => {
  it('preserves every legacy publication byte and creates a retired generation without an active selector', () => {
    const { database } = databaseBeforeGenerationMigration()
    try {
      seedLegacyPublication(database)
      const before = database
        .prepare('SELECT * FROM "QualityValidationPublication" WHERE "id" = ?')
        .get('publication-1')
      applyGenerationMigration(database)
      expect(
        database.prepare('SELECT * FROM "QualityValidationPublication" WHERE "id" = ?').get('publication-1'),
      ).toMatchObject(before!)
      expect(
        database
          .prepare(
            'SELECT "id", "generationKey", "disposition" FROM "QualityValidationGeneration" WHERE "validationVersionId" = ?',
          )
          .get('validation-1'),
      ).toEqual({
        id: 'legacy:v1:generation:publication-1',
        generationKey: 'legacy:v1:generation:publication-1',
        disposition: 'RETIRED_UNSUPPORTED',
      })
      expect(
        database.prepare('SELECT "activeGenerationId" FROM "ValidationVersion" WHERE "id" = ?').get('validation-1'),
      ).toEqual({ activeGenerationId: null })
      expect(database.prepare('PRAGMA foreign_key_check').get()).toBeUndefined()
    } finally {
      database.close()
    }
  })

  it('rejects an active selector from another validation version and artifact rewrites', () => {
    const { database } = databaseBeforeGenerationMigration()
    try {
      seedLegacyPublication(database)
      applyGenerationMigration(database)
      database.exec(`
        INSERT INTO "ValidationVersion" ("id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "canonicalAstJson", "canonicalHash")
        VALUES ('validation-2', 'target-1', 'revision-1', 'validation-2', 2, 'DESIGNED', '{}', 'sha256:validation-2');
        INSERT INTO "QualityValidationGeneration" (
          "id", "generationKey", "targetProjectId", "qualityPlanRevisionId", "validationVersionId", "artifactSchemaVersion",
          "preflightAlgorithmVersion", "preflightAuthority", "scopeIntentHash", "realizationIntentHash", "preflightHash",
          "canonicalRealizationJson", "realizationHash", "compilationHash", "assuranceLevel", "disposition"
        ) VALUES ('generation-2', 'sha256:generation-2', 'target-1', 'revision-1', 'validation-2', 'v3', 'v2', 'authority', 'sha256:scope', 'sha256:intent', 'sha256:preflight', '{}', 'sha256:realization', 'sha256:compilation', 'STANDARD', 'ACTIVE');
      `)
      expect(() =>
        database.exec(
          'UPDATE "ValidationVersion" SET "activeGenerationId" = \'generation-2\' WHERE "id" = \'validation-1\'',
        ),
      ).toThrow(/FOREIGN KEY constraint failed/)
      const activeSelectorForeignKeys = database.prepare('PRAGMA foreign_key_list("ValidationVersion")').all()
      const checkpointForeignKeys = database
        .prepare('PRAGMA foreign_key_list("AssessmentRunPublicationCheckpoint")')
        .all()
      expect(activeSelectorForeignKeys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: 'QualityValidationGeneration', from: 'activeGenerationId', to: 'id' }),
          expect.objectContaining({ table: 'QualityValidationGeneration', from: 'id', to: 'validationVersionId' }),
        ]),
      )
      expect(checkpointForeignKeys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: 'ValidationVersion', from: 'validationVersionId', to: 'id' }),
        ]),
      )
      expect(() =>
        database.exec(
          'UPDATE "QualityValidationGeneration" SET "disposition" = \'ACTIVE\' WHERE "id" = \'legacy:v1:generation:publication-1\'',
        ),
      ).toThrow(/immutable/)
    } finally {
      database.close()
    }
  })

  it('rebuilds managed binding and evidence tables with durable composite publication foreign keys and guards', () => {
    const { database } = databaseBeforeGenerationMigration()
    try {
      seedLegacyPublication(database)
      applyGenerationMigration(database)
      const bindingForeignKeys = database.prepare('PRAGMA foreign_key_list("AssessmentRunBinding")').all()
      const evidenceForeignKeys = database.prepare('PRAGMA foreign_key_list("EvidenceReceipt")').all()
      expect(bindingForeignKeys.map(key => key.table)).toEqual(
        expect.arrayContaining([
          'AssessmentRunPublicationCheckpoint',
          'QualityValidationPublication',
          'QualityValidationGeneration',
          'EvidenceReceipt',
        ]),
      )
      expect(evidenceForeignKeys.map(key => key.table)).toEqual(
        expect.arrayContaining(['QualityValidationPublication', 'QualityValidationGeneration']),
      )
      const triggers = database
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN ('AssessmentRunBinding_publication_tuple_update', 'EvidenceReceipt_publication_tuple_update')",
        )
        .all<{ name: string; sql: string }>()
      expect(triggers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'AssessmentRunBinding_publication_tuple_update',
            sql: expect.stringContaining('IS NOT OLD."generationId"'),
          }),
          expect.objectContaining({
            name: 'EvidenceReceipt_publication_tuple_update',
            sql: expect.stringContaining('p."runtimeInputHash" = NEW."runtimeInputHash"'),
          }),
        ]),
      )
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      database.close()
    }
  })

  it('aborts a partial published legacy state rather than inventing a generation', () => {
    const { database } = databaseBeforeGenerationMigration()
    try {
      database.exec(`
        INSERT INTO "TargetProject" ("id", "kind", "canonicalIdentity", "canonicalPath", "displayName", "fingerprint", "updatedAt")
        VALUES ('target-partial', 'LOCAL_WORKSPACE', 'path:/tmp/partial', '/tmp/partial', 'Partial fixture', 'sha256:target', '2026-08-24T00:00:00.000Z');
        INSERT INTO "QualityPlan" ("id", "targetProjectId", "title", "updatedAt") VALUES ('plan-partial', 'target-partial', 'Partial', '2026-08-24T00:00:00.000Z');
        INSERT INTO "QualityPlanRevision" ("id", "targetProjectId", "qualityPlanId", "revision", "status", "contentHash", "sourceSpecification", "requirementGraphJson", "updatedAt") VALUES ('revision-partial', 'target-partial', 'plan-partial', 1, 'PUBLISHED', 'sha256:revision', '{}', '{}', '2026-08-24T00:00:00.000Z');
        INSERT INTO "ValidationVersion" ("id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "canonicalAstJson", "canonicalHash") VALUES ('validation-partial', 'target-partial', 'revision-partial', 'Partial', 1, 'PUBLISHED', '{}', 'sha256:validation');
      `)
      expect(() => applyGenerationMigration(database)).toThrow(/CHECK constraint failed/)
      expect(
        database
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'QualityValidationGeneration'")
          .get(),
      ).toBeUndefined()
    } finally {
      database.close()
    }
  })

  it('allows exactly one of two real Prisma clients to win the null-active-generation CAS', async () => {
    const { database, path } = databaseBeforeGenerationMigration()
    const first = new PrismaClient({ datasources: { db: { url: `file:${path}` } } })
    const second = new PrismaClient({ datasources: { db: { url: `file:${path}` } } })
    try {
      seedLegacyPublication(database)
      applyGenerationMigration(database)
      applyQualityOperatingSystemMigration(database)
      database.exec(`
        INSERT INTO "QualityPlan" ("id", "targetProjectId", "title", "updatedAt")
        VALUES ('plan-1', 'target-1', 'Generation CAS plan', CURRENT_TIMESTAMP);
        INSERT INTO "QualityPlanRevision" ("id", "targetProjectId", "qualityPlanId", "revision", "status", "contentHash", "sourceSpecification", "requirementGraphJson", "updatedAt")
        VALUES ('revision-1', 'target-1', 'plan-1', 1, 'PUBLISHED', 'sha256:revision-cas', '{}', '{}', CURRENT_TIMESTAMP);
        INSERT INTO "RequirementAnalysisRevision" ("id", "targetProjectId", "qualityPlanRevisionId", "revision", "status", "decision", "analysisJson", "provenanceJson", "analysisHash")
        VALUES ('analysis-1', 'target-1', 'revision-1', 1, 'APPROVED', 'APPROVED', '{}', '{}', 'sha256:analysis-cas');
        INSERT INTO "ValidationDesignRevision" ("id", "targetProjectId", "qualityPlanRevisionId", "requirementAnalysisRevisionId", "revision", "status", "decision", "strategyJson", "scenarioPortfolioJson", "provenanceJson", "designHash")
        VALUES ('design-1', 'target-1', 'revision-1', 'analysis-1', 1, 'APPROVED', 'APPROVED', '{}', '{}', '{}', 'sha256:design-cas');
        INSERT INTO "ValidationVersion" ("id", "targetProjectId", "qualityPlanRevisionId", "validationDesignRevisionId", "validationIdentity", "version", "status", "canonicalAstJson", "canonicalHash")
        VALUES ('validation-1', 'target-1', 'revision-1', 'design-1', 'Validation CAS', 1, 'DESIGNED', '{}', 'sha256:validation-cas');
        INSERT INTO "QualityValidationGeneration" (
          "id", "generationKey", "targetProjectId", "qualityPlanRevisionId", "validationVersionId", "artifactSchemaVersion",
          "preflightAlgorithmVersion", "preflightAuthority", "scopeIntentHash", "realizationIntentHash", "preflightHash",
          "canonicalRealizationJson", "realizationHash", "compilationHash", "assuranceLevel", "disposition"
        ) VALUES ('generation-candidate', 'sha256:generation-candidate', 'target-1', 'revision-1', 'validation-1', 'v3', 'v2', 'authority', 'sha256:scope', 'sha256:intent', 'sha256:preflight', '{}', 'sha256:realization', 'sha256:compilation', 'STANDARD', 'ACTIVE');
      `)
      const [left, right] = await Promise.all([
        first.validationVersion.updateMany({
          where: { id: 'validation-1', activeGenerationId: null },
          data: { activeGenerationId: 'generation-candidate' },
        }),
        second.validationVersion.updateMany({
          where: { id: 'validation-1', activeGenerationId: null },
          data: { activeGenerationId: 'generation-candidate' },
        }),
      ])
      expect([left.count, right.count].sort()).toEqual([0, 1])
      expect(await first.validationVersion.findUniqueOrThrow({ where: { id: 'validation-1' } })).toMatchObject({
        activeGenerationId: 'generation-candidate',
      })
    } finally {
      await first.$disconnect()
      await second.$disconnect()
      database.close()
    }
  })
})
