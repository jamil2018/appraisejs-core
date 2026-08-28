import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

type Statement = {
  get<T extends Record<string, unknown> = Record<string, unknown>>(...values: unknown[]): T | undefined
}
type DatabaseSync = { close(): void; exec(sql: string): void; prepare(sql: string): Statement }

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSync
}

const cutoverMigration = '20260822090000_remote_evaluation_scope_v1'
const unifiedPreflightMigration = '20260822100000_unified_assessment_preflight_v2'
const canonicalCapsuleResetMigration = '20260819090000_canonical_capsule_target_cutover'
const migrationsRoot = join(process.cwd(), 'prisma', 'migrations')
const workspaces: string[] = []

function databaseBeforeRemoteScopeMigration() {
  const workspace = mkdtempSync(join(tmpdir(), 'appraise-remote-scope-upgrade-'))
  workspaces.push(workspace)
  const database = new DatabaseSync(join(workspace, 'pre-cutover.db'))
  for (const migration of readdirSync(migrationsRoot).sort()) {
    if (migration >= cutoverMigration) break
    database.exec(readFileSync(join(migrationsRoot, migration, 'migration.sql'), 'utf8'))
  }
  database.exec('PRAGMA foreign_keys=ON')
  return database
}

function databaseBeforeUnifiedPreflightMigration() {
  const workspace = mkdtempSync(join(tmpdir(), 'appraise-unified-preflight-upgrade-'))
  workspaces.push(workspace)
  const database = new DatabaseSync(join(workspace, 'preflight-v1.db'))
  for (const migration of readdirSync(migrationsRoot).sort()) {
    if (migration >= unifiedPreflightMigration) break
    database.exec(readFileSync(join(migrationsRoot, migration, 'migration.sql'), 'utf8'))
  }
  database.exec('PRAGMA foreign_keys=ON')
  return database
}

function databaseBeforeCanonicalCapsuleReset() {
  const workspace = mkdtempSync(join(tmpdir(), 'appraise-canonical-reset-'))
  workspaces.push(workspace)
  const database = new DatabaseSync(join(workspace, 'pre-reset.db'))
  for (const migration of readdirSync(migrationsRoot).sort()) {
    if (migration >= canonicalCapsuleResetMigration) break
    database.exec(readFileSync(join(migrationsRoot, migration, 'migration.sql'), 'utf8'))
  }
  database.exec('PRAGMA foreign_keys=ON')
  return database
}

function seedPreCutoverAssessment(database: DatabaseSync) {
  database.exec(`
    INSERT INTO "TargetProject" ("id", "kind", "canonicalIdentity", "normalizedRemoteOrigin", "displayName", "fingerprint", "updatedAt")
    VALUES ('target-1', 'REMOTE_BLACK_BOX', 'remote:https://www.saucedemo.com', 'https://www.saucedemo.com', 'Sauce Demo', 'sha256:target', '2026-08-22T00:00:00.000Z');
    INSERT INTO "QualityPlan" ("id", "targetProjectId", "title", "description", "updatedAt")
    VALUES ('plan-1', 'target-1', 'Remote scope upgrade', 'legacy fixture', '2026-08-22T00:00:00.000Z');
    INSERT INTO "QualityPlanRevision" ("id", "targetProjectId", "qualityPlanId", "revision", "status", "contentHash", "sourceSpecification", "requirementGraphJson", "updatedAt")
    VALUES ('revision-1', 'target-1', 'plan-1', 1, 'SCENARIOS_APPROVED', 'sha256:revision', '{}', '{}', '2026-08-22T00:00:00.000Z');
    INSERT INTO "EvaluationSubjectRevision" ("id", "subjectDigest", "subjectKind", "authority", "metadataJson")
    VALUES ('subject-1', 'sha256:subject', 'ARTIFACT', 'legacy-fixture', '{}');
    INSERT INTO "ValidationVersion" ("id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "canonicalAstJson", "canonicalHash")
    VALUES ('validation-1', 'target-1', 'revision-1', 'legacy validation', 1, 'PUBLISHED', '{}', 'sha256:validation');
    INSERT INTO "Assessment" ("id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "status", "alignment", "lineageId", "generation", "updatedAt")
    VALUES ('root-1', 'target-1', 'plan-1', 'revision-1', 'subject-1', 'DECIDED', 'CURRENT', 'root-1', 0, '2026-08-22T00:00:00.000Z');
    INSERT INTO "Assessment" ("id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "status", "alignment", "lineageId", "generation", "supersedesAssessmentId", "successorIdempotencyKey", "successorRequestHash", "updatedAt")
    VALUES ('successor-1', 'target-1', 'plan-1', 'revision-1', 'subject-1', 'READY', 'CURRENT', 'root-1', 1, 'root-1', 'legacy-successor', 'sha256:successor', '2026-08-22T00:00:00.000Z');
    INSERT INTO "Environment" ("id", "name", "baseUrl", "targetProjectId", "updatedAt")
    VALUES ('environment-1', 'Sauce Demo', 'https://www.saucedemo.com', 'target-1', '2026-08-22T00:00:00.000Z');
    INSERT INTO "TestRun" ("id", "name", "runId", "status", "result", "intent", "evidenceHealth", "environmentId", "targetProjectId", "updatedAt")
    VALUES ('test-run-1', 'post-cutover run', 'run-1', 'COMPLETED', 'PASSED', 'ASSESSMENT', 'valid', 'environment-1', 'target-1', '2026-08-22T00:00:00.000Z');
    INSERT INTO "AssessmentRun" ("id", "targetProjectId", "assessmentId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "idempotencyScope", "idempotencyKey", "requestHash", "status", "version", "updatedAt")
    VALUES ('assessment-run-1', 'target-1', 'root-1', 'revision-1', 'subject-1', 'scope-1', 'run-key-1', 'sha256:run-request', 'COMPLETED', 3, '2026-08-22T00:00:00.000Z');
    INSERT INTO "EvidenceReceipt" ("id", "targetProjectId", "qualityPlanRevisionId", "assessmentId", "validationVersionId", "evaluationSubjectRevisionId", "resultMatrixCell", "assuranceLevel", "outcome", "runtimeInputHash", "environmentSnapshotHash", "dataProvenanceHash", "outputHash", "receiptHash")
    VALUES ('receipt-1', 'target-1', 'revision-1', 'root-1', 'validation-1', 'subject-1', 'CHROMIUM:environment-1', 'STANDARD', 'PASSED', 'sha256:runtime', 'sha256:environment', 'sha256:provenance', 'sha256:output', 'sha256:receipt');
    INSERT INTO "AssessmentRunBinding" ("id", "assessmentRunId", "validationVersionId", "resultMatrixCell", "testRunId", "runtimeInputHash", "terminalOutcome", "terminalizedAt", "evidenceReceiptId", "version", "updatedAt")
    VALUES ('binding-1', 'assessment-run-1', 'validation-1', 'CHROMIUM:environment-1', 'test-run-1', 'sha256:runtime', 'PASSED', '2026-08-22T00:00:00.000Z', 'receipt-1', 2, '2026-08-22T00:00:00.000Z');
    INSERT INTO "TestRun" ("id", "name", "runId", "status", "result", "intent", "evidenceHealth", "environmentId", "targetProjectId", "updatedAt")
    VALUES ('test-run-2', 'successor replay run', 'run-2', 'COMPLETED', 'PASSED', 'ASSESSMENT', 'valid', 'environment-1', 'target-1', '2026-08-22T00:00:00.000Z');
    INSERT INTO "AssessmentRun" ("id", "targetProjectId", "assessmentId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "idempotencyScope", "idempotencyKey", "requestHash", "status", "version", "updatedAt")
    VALUES ('assessment-run-2', 'target-1', 'successor-1', 'revision-1', 'subject-1', 'scope-2', 'run-key-2', 'sha256:run-request-2', 'COMPLETED', 4, '2026-08-22T00:00:00.000Z');
    INSERT INTO "EvidenceReceipt" ("id", "targetProjectId", "qualityPlanRevisionId", "assessmentId", "validationVersionId", "evaluationSubjectRevisionId", "resultMatrixCell", "assuranceLevel", "outcome", "runtimeInputHash", "environmentSnapshotHash", "dataProvenanceHash", "outputHash", "receiptHash")
    VALUES ('receipt-2', 'target-1', 'revision-1', 'successor-1', 'validation-1', 'subject-1', 'CHROMIUM:environment-1', 'STANDARD', 'PASSED', 'sha256:runtime', 'sha256:environment', 'sha256:provenance-successor', 'sha256:output', 'sha256:receipt-successor');
    INSERT INTO "AssessmentRunBinding" ("id", "assessmentRunId", "validationVersionId", "resultMatrixCell", "testRunId", "runtimeInputHash", "terminalOutcome", "terminalizedAt", "evidenceReceiptId", "version", "updatedAt")
    VALUES ('binding-2', 'assessment-run-2', 'validation-1', 'CHROMIUM:environment-1', 'test-run-2', 'sha256:runtime', 'PASSED', '2026-08-22T00:00:00.000Z', 'receipt-2', 4, '2026-08-22T00:00:00.000Z');
    INSERT INTO "AssessmentDecision" ("id", "assessmentId", "decision", "rationale", "decidedBy", "decisionHash")
    VALUES ('decision-1', 'root-1', 'ACCEPTED', 'legacy decision is preserved', 'migration fixture', 'sha256:decision');
  `)
}

function seedPreV2Publication(
  database: DatabaseSync,
  values: {
    id: string
    targetProjectId: string
    targetFingerprint: string
    qualityPlanRevisionId: string
    validationVersionId: string
  },
) {
  database.exec(`
    INSERT INTO "QualityValidationPublication" (
      "id", "targetProjectId", "targetFingerprint", "qualityPlanRevisionId", "validationVersionId", "idempotencyKey", "operationHash",
      "expectedRevisionHash", "validationHash", "validationContent", "reviewHash", "reviewContent", "astId", "astHash", "contextHash",
      "previewHash", "receiptHash", "projectionHash", "projectionJson", "validationProjectionJson", "runtimeInputHash", "runtimeInputJson", "updatedAt"
    ) VALUES (
      '${values.id}', '${values.targetProjectId}', '${values.targetFingerprint}', '${values.qualityPlanRevisionId}', '${values.validationVersionId}', '${values.id}', 'sha256:${values.id}',
      'sha256:revision', 'sha256:validation', '{}', 'sha256:review', '{}', 'ast-${values.id}', 'sha256:ast', 'sha256:context',
      'sha256:preview', 'sha256:receipt', 'sha256:projection', '{}', '{}', 'sha256:runtime', '{}', '2026-08-22T00:00:00.000Z'
    );
  `)
}

function seedPreV2IndependentPublicationRun(
  database: DatabaseSync,
  values: { testRunId: string; testRunStatus: 'RUNNING' | 'COMPLETED'; attemptState: 'RUNNING' | 'COMPLETED' },
) {
  seedPreV2Publication(database, {
    id: 'publication-independent',
    targetProjectId: 'target-1',
    targetFingerprint: 'sha256:target',
    qualityPlanRevisionId: 'revision-1',
    validationVersionId: 'validation-1',
  })
  database.exec(`
    INSERT INTO "TestRun" ("id", "name", "runId", "status", "result", "intent", "evidenceHealth", "environmentId", "targetProjectId", "updatedAt")
    VALUES ('${values.testRunId}', 'independent publication run', '${values.testRunId}:run', '${values.testRunStatus}', 'PENDING', 'INDEPENDENT', 'invalid_missing_report', 'environment-1', 'target-1', '2026-08-22T00:00:00.000Z');
    INSERT INTO "RuntimeCapsule" ("id", "targetProjectId", "testRunId", "validationHash", "qualityPublicationId", "capsuleHash", "manifestHash", "manifestJson", "storagePath", "integrityState", "updatedAt")
    VALUES ('capsule-independent', 'target-1', '${values.testRunId}', 'sha256:validation', 'publication-independent', 'sha256:capsule', 'sha256:manifest', '{}', '/tmp/capsule-independent', 'ready', '2026-08-22T00:00:00.000Z');
    INSERT INTO "RuntimeCapsuleExecutionAttempt" ("id", "testRunId", "capsuleId", "receiptHash", "preflightResultJson", "preflightResultHash", "preflightCheckedAt", "state", "ownerToken", "updatedAt")
    VALUES ('attempt-independent', '${values.testRunId}', 'capsule-independent', 'sha256:attempt-receipt', '{}', 'sha256:attempt-preflight', '2026-08-22T00:00:00.000Z', '${values.attemptState}', 'attempt-owner', '2026-08-22T00:00:00.000Z');
  `)
}

function seedPreCapsuleLocalManagedPublicationRun(
  database: DatabaseSync,
  values: { testRunStatus: 'QUEUED' | 'COMPLETED'; assessmentRunStatus: 'PREPARED' | 'COMPLETED' },
) {
  database.exec(`
    INSERT INTO "TargetProject" ("id", "kind", "canonicalIdentity", "canonicalPath", "displayName", "fingerprint", "updatedAt")
    VALUES ('local-target', 'LOCAL_WORKSPACE', 'path:/tmp/v1-local-publication', '/tmp/v1-local-publication', 'Local v1 fixture', 'sha256:local-target', '2026-08-22T00:00:00.000Z');
    INSERT INTO "QualityPlan" ("id", "targetProjectId", "title", "description", "updatedAt")
    VALUES ('local-plan', 'local-target', 'Local v1 publication', 'migration fixture', '2026-08-22T00:00:00.000Z');
    INSERT INTO "QualityPlanRevision" ("id", "targetProjectId", "qualityPlanId", "revision", "status", "contentHash", "sourceSpecification", "requirementGraphJson", "updatedAt")
    VALUES ('local-revision', 'local-target', 'local-plan', 1, 'SCENARIOS_APPROVED', 'sha256:local-revision', '{}', '{}', '2026-08-22T00:00:00.000Z');
    INSERT INTO "ValidationVersion" ("id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "canonicalAstJson", "canonicalHash")
    VALUES ('local-validation', 'local-target', 'local-revision', 'local validation', 1, 'PUBLISHED', '{}', 'sha256:local-validation');
    INSERT INTO "EvaluationSubjectRevision" ("id", "subjectDigest", "subjectKind", "authority", "metadataJson")
    VALUES ('local-subject', 'sha256:local-subject', 'ARTIFACT', 'migration-fixture', '{}');
    INSERT INTO "Assessment" ("id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "status", "alignment", "lineageId", "generation", "updatedAt")
    VALUES ('local-assessment', 'local-target', 'local-plan', 'local-revision', 'local-subject', 'READY', 'CURRENT', 'local-assessment', 0, '2026-08-22T00:00:00.000Z');
    INSERT INTO "Environment" ("id", "name", "baseUrl", "targetProjectId", "updatedAt")
    VALUES ('local-environment', 'Local fixture', 'http://localhost:3000', 'local-target', '2026-08-22T00:00:00.000Z');
  `)
  seedPreV2Publication(database, {
    id: 'local-publication',
    targetProjectId: 'local-target',
    targetFingerprint: 'sha256:local-target',
    qualityPlanRevisionId: 'local-revision',
    validationVersionId: 'local-validation',
  })
  database.exec(`
    INSERT INTO "TestRun" ("id", "name", "runId", "status", "result", "intent", "evidenceHealth", "environmentId", "targetProjectId", "updatedAt")
    VALUES ('local-pre-capsule-run', 'local pre-capsule publication', 'local-pre-capsule-run-id', '${values.testRunStatus}', 'PENDING', 'ASSESSMENT', 'invalid_missing_report', 'local-environment', 'local-target', '2026-08-22T00:00:00.000Z');
    INSERT INTO "AssessmentRun" ("id", "targetProjectId", "assessmentId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "idempotencyScope", "idempotencyKey", "requestHash", "status", "version", "updatedAt")
    VALUES ('local-pre-capsule-assessment-run', 'local-target', 'local-assessment', 'local-revision', 'local-subject', 'local-pre-capsule', 'local-pre-capsule-key', 'sha256:local-pre-capsule', '${values.assessmentRunStatus}', 1, '2026-08-22T00:00:00.000Z');
    INSERT INTO "AssessmentRunBinding" ("id", "assessmentRunId", "validationVersionId", "resultMatrixCell", "testRunId", "runtimeInputHash", "version", "updatedAt")
    VALUES ('local-pre-capsule-binding', 'local-pre-capsule-assessment-run', 'local-validation', 'CHROMIUM:local-environment', 'local-pre-capsule-run', 'sha256:runtime', 1, '2026-08-22T00:00:00.000Z');
  `)
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true })
})

describe('remote evaluation scope migration upgrade', { timeout: 60_000 }, () => {
  it('reconciles a PREPARED v1 parent with terminal pre-execution failure before retiring its READY assessment', async () => {
    const database = databaseBeforeUnifiedPreflightMigration()
    try {
      seedPreCutoverAssessment(database)
      database.exec(`
        INSERT INTO "EvaluationSubjectRevision" ("id", "subjectDigest", "subjectKind", "authority", "metadataJson")
        VALUES ('remote-v1-subject', 'sha256:remote-v1', 'REMOTE_EVALUATION_SCOPE', 'appraisejs:remote-evaluation-scope:v1', '{}');
        INSERT INTO "RemoteEvaluationScopeBinding" (
          "id", "evaluationSubjectRevisionId", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "environmentId", "scopeHash", "targetFingerprint", "designHash", "revisionContentHash", "validationBindingsHash", "realizationPreflightHash", "runtimePolicyHash", "securityPolicyHash", "evidencePolicyHash", "canonicalScopeJson", "validationBindingsJson", "environmentSnapshotHash", "environmentSnapshotJson", "environmentScopeVersion", "environmentUpdatedAt"
        ) VALUES (
          'remote-v1-binding', 'remote-v1-subject', 'target-1', 'plan-1', 'revision-1', 'environment-1', 'sha256:v1-scope', 'sha256:target', 'sha256:design', 'sha256:revision', 'sha256:bindings', 'sha256:preflight', 'sha256:runtime', 'sha256:security', 'sha256:evidence', '{}', '[]', 'sha256:environment', '{}', 1, '2026-08-22T00:00:00.000Z'
        );
        INSERT INTO "Assessment" ("id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "status", "alignment", "lineageId", "generation", "updatedAt")
        VALUES ('remote-ready', 'target-1', 'plan-1', 'revision-1', 'remote-v1-subject', 'READY', 'CURRENT', 'remote-ready', 0, '2026-08-22T00:00:00.000Z');
        INSERT INTO "TestRun" ("id", "name", "runId", "status", "result", "intent", "evidenceHealth", "environmentId", "targetProjectId", "updatedAt")
        VALUES ('remote-terminal-child', 'terminal child', 'remote-child', 'COMPLETED', 'FAILED', 'ASSESSMENT', 'valid', 'environment-1', 'target-1', '2026-08-22T00:00:00.000Z');
        INSERT INTO "AssessmentRun" ("id", "targetProjectId", "assessmentId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "idempotencyScope", "idempotencyKey", "requestHash", "status", "version", "updatedAt")
        VALUES ('remote-prepared-parent', 'target-1', 'remote-ready', 'revision-1', 'remote-v1-subject', 'remote-v1', 'remote-v1-key', 'sha256:remote-v1', 'PREPARED', 1, '2026-08-22T00:00:00.000Z');
        INSERT INTO "AssessmentRunBinding" ("id", "assessmentRunId", "validationVersionId", "resultMatrixCell", "testRunId", "runtimeInputHash", "version", "updatedAt")
        VALUES ('remote-child-binding', 'remote-prepared-parent', 'validation-1', 'CHROMIUM:environment-1', 'remote-terminal-child', 'sha256:runtime', 1, '2026-08-22T00:00:00.000Z');
      `)
      database.exec(readFileSync(join(migrationsRoot, unifiedPreflightMigration, 'migration.sql'), 'utf8'))
      expect(
        database.prepare('SELECT "status" FROM "AssessmentRun" WHERE "id" = ?').get('remote-prepared-parent'),
      ).toEqual({
        status: 'COMPLETED',
      })
      expect(database.prepare('SELECT "status" FROM "Assessment" WHERE "id" = ?').get('remote-ready')).toEqual({
        status: 'STALE',
      })
      // The migration retires the runnable scope, not the historical failed
      // child. Later schema migrations add executable-generation authority;
      // this v2 fixture intentionally remains scoped to its own migration.
      expect(
        database
          .prepare('SELECT "status", "result", "intent" FROM "TestRun" WHERE "id" = ?')
          .get('remote-terminal-child'),
      ).toEqual({
        status: 'COMPLETED',
        result: 'FAILED',
        intent: 'ASSESSMENT',
      })
    } finally {
      database.close()
    }
  })

  it('aborts rather than retiring a v1 scope with ambiguous active PREPARED execution', () => {
    const database = databaseBeforeUnifiedPreflightMigration()
    try {
      seedPreCutoverAssessment(database)
      database.exec(`
        INSERT INTO "EvaluationSubjectRevision" ("id", "subjectDigest", "subjectKind", "authority", "metadataJson")
        VALUES ('active-remote-v1', 'sha256:active-remote-v1', 'REMOTE_EVALUATION_SCOPE', 'appraisejs:remote-evaluation-scope:v1', '{}');
        INSERT INTO "Assessment" ("id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "status", "alignment", "lineageId", "generation", "updatedAt")
        VALUES ('active-remote-assessment', 'target-1', 'plan-1', 'revision-1', 'active-remote-v1', 'RUNNING', 'CURRENT', 'active-remote-assessment', 0, '2026-08-22T00:00:00.000Z');
        INSERT INTO "AssessmentRun" ("id", "targetProjectId", "assessmentId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "idempotencyScope", "idempotencyKey", "requestHash", "status", "version", "updatedAt")
        VALUES ('active-remote-run', 'target-1', 'active-remote-assessment', 'revision-1', 'active-remote-v1', 'active-v1', 'active-v1-key', 'sha256:active', 'PREPARED', 1, '2026-08-22T00:00:00.000Z');
      `)
      expect(() =>
        database.exec(readFileSync(join(migrationsRoot, unifiedPreflightMigration, 'migration.sql'), 'utf8')),
      ).toThrow(/CHECK constraint failed/)
      expect(
        database.prepare('SELECT "status" FROM "Assessment" WHERE "id" = ?').get('active-remote-assessment'),
      ).toEqual({
        status: 'RUNNING',
      })
    } finally {
      database.close()
    }
  })

  it('aborts before retiring a local managed publication with a queued binding before capsule materialization', () => {
    const database = databaseBeforeUnifiedPreflightMigration()
    try {
      seedPreCutoverAssessment(database)
      seedPreCapsuleLocalManagedPublicationRun(database, {
        testRunStatus: 'QUEUED',
        assessmentRunStatus: 'PREPARED',
      })

      expect(() =>
        database.exec(readFileSync(join(migrationsRoot, unifiedPreflightMigration, 'migration.sql'), 'utf8')),
      ).toThrow(/CHECK constraint failed/)
      expect(
        database.prepare('SELECT "status" FROM "AssessmentRun" WHERE "id" = ?').get('local-pre-capsule-assessment-run'),
      ).toEqual({ status: 'PREPARED' })
      expect(database.prepare('SELECT "status" FROM "TestRun" WHERE "id" = ?').get('local-pre-capsule-run')).toEqual({
        status: 'QUEUED',
      })
      expect(
        database
          .prepare(
            'SELECT "sql" FROM sqlite_master WHERE "type" = \'table\' AND "name" = \'QualityValidationPublication\'',
          )
          .get(),
      ).toEqual(expect.objectContaining({ sql: expect.not.stringContaining('preflightAlgorithmVersion') }))
    } finally {
      database.close()
    }
  })

  it('conservatively aborts an active independent run before capsule materialization when v1 publications exist', () => {
    const database = databaseBeforeUnifiedPreflightMigration()
    try {
      seedPreCutoverAssessment(database)
      seedPreV2Publication(database, {
        id: 'publication-independent-pre-capsule',
        targetProjectId: 'target-1',
        targetFingerprint: 'sha256:target',
        qualityPlanRevisionId: 'revision-1',
        validationVersionId: 'validation-1',
      })
      database.exec(`
        INSERT INTO "TestRun" ("id", "name", "preparationKey", "runId", "status", "result", "intent", "evidenceHealth", "environmentId", "targetProjectId", "updatedAt")
        VALUES ('independent-queued-no-capsule', 'independent pre-capsule run', 'opaque-v1-preparation-key', 'independent-queued-no-capsule-id', 'QUEUED', 'PENDING', 'INDEPENDENT', 'invalid_missing_report', 'environment-1', 'target-1', '2026-08-22T00:00:00.000Z');
      `)

      expect(() =>
        database.exec(readFileSync(join(migrationsRoot, unifiedPreflightMigration, 'migration.sql'), 'utf8')),
      ).toThrow(/CHECK constraint failed/)
      expect(
        database
          .prepare('SELECT "status", "preparationKey" FROM "TestRun" WHERE "id" = ?')
          .get('independent-queued-no-capsule'),
      ).toEqual({ status: 'QUEUED', preparationKey: 'opaque-v1-preparation-key' })
    } finally {
      database.close()
    }
  })

  it('aborts before retiring a v1 publication with an active independent capsule execution', () => {
    const database = databaseBeforeUnifiedPreflightMigration()
    try {
      seedPreCutoverAssessment(database)
      seedPreV2IndependentPublicationRun(database, {
        testRunId: 'independent-running',
        testRunStatus: 'RUNNING',
        attemptState: 'RUNNING',
      })

      expect(() =>
        database.exec(readFileSync(join(migrationsRoot, unifiedPreflightMigration, 'migration.sql'), 'utf8')),
      ).toThrow(/CHECK constraint failed/)

      expect(database.prepare('SELECT "status" FROM "TestRun" WHERE "id" = ?').get('independent-running')).toEqual({
        status: 'RUNNING',
      })
      expect(
        database
          .prepare(
            'SELECT "sql" FROM sqlite_master WHERE "type" = \'table\' AND "name" = \'QualityValidationPublication\'',
          )
          .get(),
      ).toEqual(expect.objectContaining({ sql: expect.not.stringContaining('preflightAlgorithmVersion') }))
    } finally {
      database.close()
    }
  })

  it('retires a terminal local pre-capsule managed publication when no run remains active', () => {
    const database = databaseBeforeUnifiedPreflightMigration()
    try {
      seedPreCutoverAssessment(database)
      seedPreCapsuleLocalManagedPublicationRun(database, {
        testRunStatus: 'COMPLETED',
        assessmentRunStatus: 'COMPLETED',
      })

      database.exec(readFileSync(join(migrationsRoot, unifiedPreflightMigration, 'migration.sql'), 'utf8'))

      expect(
        database
          .prepare('SELECT "preflightDisposition" FROM "QualityValidationPublication" WHERE "id" = ?')
          .get('local-publication'),
      ).toEqual({ preflightDisposition: 'RETIRED_UNSUPPORTED' })
      expect(
        database.prepare('SELECT "status" FROM "AssessmentRun" WHERE "id" = ?').get('local-pre-capsule-assessment-run'),
      ).toEqual({ status: 'COMPLETED' })
      expect(database.prepare('SELECT "status" FROM "TestRun" WHERE "id" = ?').get('local-pre-capsule-run')).toEqual({
        status: 'COMPLETED',
      })
    } finally {
      database.close()
    }
  })

  it('retires a terminal sealed independent publication without orphaning an active run', () => {
    const database = databaseBeforeUnifiedPreflightMigration()
    try {
      seedPreCutoverAssessment(database)
      seedPreV2IndependentPublicationRun(database, {
        testRunId: 'independent-terminal',
        testRunStatus: 'COMPLETED',
        attemptState: 'COMPLETED',
      })

      database.exec(readFileSync(join(migrationsRoot, unifiedPreflightMigration, 'migration.sql'), 'utf8'))

      expect(
        database
          .prepare(
            'SELECT "preflightAlgorithmVersion", "preflightAuthority", "preflightDisposition" FROM "QualityValidationPublication" WHERE "id" = ?',
          )
          .get('publication-independent'),
      ).toEqual({
        preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v1',
        preflightAuthority: 'appraisejs:quality-validation-publication:v1',
        preflightDisposition: 'RETIRED_UNSUPPORTED',
      })
      expect(database.prepare('SELECT "status" FROM "TestRun" WHERE "id" = ?').get('independent-terminal')).toEqual({
        status: 'COMPLETED',
      })
      expect(
        database
          .prepare(
            `SELECT COUNT(*) AS "count"
             FROM "QualityValidationPublication" publication
             JOIN "RuntimeCapsule" capsule ON capsule."qualityPublicationId" = publication."id"
             JOIN "TestRun" tr ON tr."id" = capsule."testRunId"
             WHERE publication."preflightDisposition" = 'RETIRED_UNSUPPORTED'
               AND tr."status" NOT IN ('COMPLETED', 'CANCELLED')`,
          )
          .get(),
      ).toEqual({ count: 0 })
    } finally {
      database.close()
    }
  })

  it('keeps the documented 20260819090000 clean reset semantics deliberately destructive', () => {
    const database = databaseBeforeCanonicalCapsuleReset()
    try {
      database.exec(`
        INSERT INTO "TargetProject" ("id", "canonicalPath", "displayName", "fingerprint", "updatedAt")
        VALUES ('reset-target', '/tmp/reset-target', 'Reset fixture', 'sha256:reset-target', '2026-08-19T00:00:00.000Z');
      `)
      database.exec(readFileSync(join(migrationsRoot, canonicalCapsuleResetMigration, 'migration.sql'), 'utf8'))
      expect(database.prepare('SELECT COUNT(*) AS "count" FROM "TargetProject"').get()).toEqual({ count: 0 })
    } finally {
      database.close()
    }
  })

  it('backfills legacy roots without relabeling decided history or successor rows, and reserves the root scope', () => {
    const database = databaseBeforeRemoteScopeMigration()
    try {
      seedPreCutoverAssessment(database)
      database.exec(readFileSync(join(migrationsRoot, cutoverMigration, 'migration.sql'), 'utf8'))

      expect(
        database
          .prepare(
            'SELECT "status", "rootIdempotencyKey", "rootRequestHash", "rootScopeReservationHash" FROM "Assessment" WHERE "id" = ?',
          )
          .get('root-1'),
      ).toEqual({
        status: 'DECIDED',
        rootIdempotencyKey: 'legacy-root:root-1',
        rootRequestHash: 'legacy-root-request:root-1',
        rootScopeReservationHash: 'legacy-root-scope:target-1:revision-1:subject-1:root-1',
      })
      expect(
        database
          .prepare(
            'SELECT "supersedesAssessmentId", "rootIdempotencyKey", "rootScopeReservationHash" FROM "Assessment" WHERE "id" = ?',
          )
          .get('successor-1'),
      ).toEqual({ supersedesAssessmentId: 'root-1', rootIdempotencyKey: null, rootScopeReservationHash: null })

      expect(
        database
          .prepare(
            'SELECT "assessmentId", "validationVersionId", "outcome", "environmentSnapshotHash" FROM "EvidenceReceipt" WHERE "id" = ?',
          )
          .get('receipt-1'),
      ).toEqual({
        assessmentId: 'root-1',
        validationVersionId: 'validation-1',
        outcome: 'PASSED',
        environmentSnapshotHash: 'sha256:environment',
      })
      expect(
        database
          .prepare('SELECT "assessmentId", "decision", "decisionHash" FROM "AssessmentDecision" WHERE "id" = ?')
          .get('decision-1'),
      ).toEqual({ assessmentId: 'root-1', decision: 'ACCEPTED', decisionHash: 'sha256:decision' })
      expect(
        database
          .prepare(
            'SELECT "assessmentId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "status", "version" FROM "AssessmentRun" WHERE "id" = ?',
          )
          .get('assessment-run-1'),
      ).toEqual({
        assessmentId: 'root-1',
        qualityPlanRevisionId: 'revision-1',
        evaluationSubjectRevisionId: 'subject-1',
        status: 'COMPLETED',
        version: 3,
      })
      expect(
        database
          .prepare(
            'SELECT "testRunId", "evidenceReceiptId", "terminalOutcome", "version" FROM "AssessmentRunBinding" WHERE "id" = ?',
          )
          .get('binding-1'),
      ).toEqual({ testRunId: 'test-run-1', evidenceReceiptId: 'receipt-1', terminalOutcome: 'PASSED', version: 2 })
      // Exact reconciliation replay retains the original receipt/binding. A
      // byte-identical runtime result in a successor run remains isolated by
      // its distinct Assessment/AssessmentRun provenance instead of merging
      // into the root receipt.
      expect(
        database
          .prepare('SELECT "assessmentId", "receiptHash", "dataProvenanceHash" FROM "EvidenceReceipt" WHERE "id" = ?')
          .get('receipt-1'),
      ).toEqual({ assessmentId: 'root-1', receiptHash: 'sha256:receipt', dataProvenanceHash: 'sha256:provenance' })
      expect(
        database
          .prepare('SELECT "assessmentId", "receiptHash", "dataProvenanceHash" FROM "EvidenceReceipt" WHERE "id" = ?')
          .get('receipt-2'),
      ).toEqual({
        assessmentId: 'successor-1',
        receiptHash: 'sha256:receipt-successor',
        dataProvenanceHash: 'sha256:provenance-successor',
      })
      expect(
        database
          .prepare(
            'SELECT "assessmentRunId", "testRunId", "evidenceReceiptId" FROM "AssessmentRunBinding" WHERE "id" = ?',
          )
          .get('binding-2'),
      ).toEqual({ assessmentRunId: 'assessment-run-2', testRunId: 'test-run-2', evidenceReceiptId: 'receipt-2' })
      expect(
        database
          .prepare('SELECT "status", "result", "intent", "environmentId" FROM "TestRun" WHERE "id" = ?')
          .get('test-run-1'),
      ).toEqual({ status: 'COMPLETED', result: 'PASSED', intent: 'ASSESSMENT', environmentId: 'environment-1' })
      // A legacy remote descriptor is historical only.  The additive
      // migration must not relabel it or invent a remote-scope binding.
      expect(
        database
          .prepare('SELECT "subjectKind", "authority" FROM "EvaluationSubjectRevision" WHERE "id" = ?')
          .get('subject-1'),
      ).toEqual({
        subjectKind: 'ARTIFACT',
        authority: 'legacy-fixture',
      })
      expect(database.prepare('SELECT COUNT(*) AS "count" FROM "RemoteEvaluationScopeBinding"').get()).toEqual({
        count: 0,
      })

      expect(() =>
        database.exec(`
          INSERT INTO "Assessment" ("id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "status", "alignment", "lineageId", "generation", "rootIdempotencyKey", "rootRequestHash", "rootScopeReservationHash", "updatedAt")
          VALUES ('duplicate-root', 'target-1', 'plan-1', 'revision-1', 'subject-1', 'CREATED', 'CURRENT', 'duplicate-root', 0, 'new-root-key', 'sha256:new', 'legacy-root-scope:target-1:revision-1:subject-1:root-1', '2026-08-22T00:00:00.000Z');
        `),
      ).toThrow(/UNIQUE constraint failed/)
      expect(database.prepare('PRAGMA foreign_key_check').get()).toBeUndefined()
    } finally {
      database.close()
    }
  })
})
