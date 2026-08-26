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
const migrationsRoot = join(process.cwd(), 'prisma', 'migrations')
const workspaces: string[] = []

function migratedDatabase() {
  const workspace = mkdtempSync(join(tmpdir(), 'appraise-remote-scope-sqlite-'))
  workspaces.push(workspace)
  const database = new DatabaseSync(join(workspace, 'scope.db'))
  for (const migration of readdirSync(migrationsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort())
    database.exec(readFileSync(join(migrationsRoot, migration, 'migration.sql'), 'utf8'))
  database.exec('PRAGMA foreign_keys=ON')
  return database
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) rmSync(workspace, { recursive: true, force: true })
})

describe('remote evaluation scope SQLite contract', () => {
  it('enforces immutable subject binding and target-scoped issuance receipts in a migrated SQLite database', () => {
    const database = migratedDatabase()
    try {
      database.exec(`
        INSERT INTO "TargetProject" ("id", "kind", "canonicalIdentity", "normalizedRemoteOrigin", "displayName", "fingerprint", "updatedAt")
        VALUES ('target-1', 'REMOTE_BLACK_BOX', 'remote:https://www.saucedemo.com', 'https://www.saucedemo.com', 'Sauce Demo', 'sha256:target', '2026-08-22T00:00:00.000Z');
        INSERT INTO "EvaluationSubjectRevision" ("id", "subjectDigest", "subjectKind", "authority", "metadataJson")
        VALUES ('subject-1', 'sha256:scope-subject', 'REMOTE_EVALUATION_SCOPE', 'appraisejs:remote-evaluation-scope:v1', '{"targetContentIdentity":"not_asserted"}');
        INSERT INTO "RemoteEvaluationScopeBinding" (
          "id", "evaluationSubjectRevisionId", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "environmentId", "scopeHash", "targetFingerprint", "designHash", "revisionContentHash", "validationBindingsHash", "realizationPreflightHash", "runtimePolicyHash", "securityPolicyHash", "evidencePolicyHash", "canonicalScopeJson", "validationBindingsJson", "environmentSnapshotHash", "environmentSnapshotJson", "environmentScopeVersion", "environmentUpdatedAt"
        ) VALUES (
          'binding-1', 'subject-1', 'target-1', 'plan-1', 'revision-1', 'environment-1', 'sha256:scope', 'sha256:target', 'sha256:design', 'sha256:revision', 'sha256:bindings', 'sha256:preflight', 'sha256:runtime', 'sha256:security', 'sha256:evidence', '{}', '[]', 'sha256:environment', '{}', 1, '2026-08-22T00:00:00.000Z'
        );
        INSERT INTO "RemoteEvaluationScopeIssuance" ("id", "targetProjectId", "idempotencyKey", "requestHash", "evaluationSubjectRevisionId")
        VALUES ('issuance-1', 'target-1', 'scope-create-1', 'sha256:request', 'subject-1');
      `)
      expect(
        database
          .prepare(
            'SELECT "evaluationSubjectRevisionId", "scopeHash" FROM "RemoteEvaluationScopeBinding" WHERE "id" = ?',
          )
          .get('binding-1'),
      ).toEqual({ evaluationSubjectRevisionId: 'subject-1', scopeHash: 'sha256:scope' })
      expect(() =>
        database.exec(`
          INSERT INTO "RemoteEvaluationScopeIssuance" ("id", "targetProjectId", "idempotencyKey", "requestHash", "evaluationSubjectRevisionId")
          VALUES ('issuance-duplicate', 'target-1', 'scope-create-1', 'sha256:changed', 'subject-1');
        `),
      ).toThrow(/UNIQUE constraint failed/)
      expect(() =>
        database.exec(`
          INSERT INTO "RemoteEvaluationScopeBinding" (
            "id", "evaluationSubjectRevisionId", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "environmentId", "scopeHash", "targetFingerprint", "designHash", "revisionContentHash", "validationBindingsHash", "realizationPreflightHash", "runtimePolicyHash", "securityPolicyHash", "evidencePolicyHash", "canonicalScopeJson", "validationBindingsJson", "environmentSnapshotHash", "environmentSnapshotJson", "environmentScopeVersion", "environmentUpdatedAt"
          ) VALUES (
            'binding-duplicate', 'subject-1', 'target-1', 'plan-1', 'revision-1', 'environment-1', 'sha256:changed', 'sha256:target', 'sha256:design', 'sha256:revision', 'sha256:bindings', 'sha256:preflight', 'sha256:runtime', 'sha256:security', 'sha256:evidence', '{}', '[]', 'sha256:environment', '{}', 1, '2026-08-22T00:00:00.000Z'
          );
        `),
      ).toThrow(/UNIQUE constraint failed/)
      expect(database.prepare('PRAGMA foreign_key_check').get()).toBeUndefined()
    } finally {
      database.close()
    }
  })
})
