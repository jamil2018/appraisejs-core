import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

const migrationSql = readFileSync(
  path.join(process.cwd(), 'prisma/migrations/20260807110000_add_workflow_reliability_receipts/migration.sql'),
  'utf8',
)

function sqlite(databasePath, input) {
  return execFileSync('sqlite3', [databasePath], { input, encoding: 'utf8' }).trim()
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`
}

function legacyDatabase() {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'appraise-workflow-reliability-migration-'))
  const databasePath = path.join(workspace, 'legacy.db')
  sqlite(
    databasePath,
    `
      PRAGMA foreign_keys = ON;
      CREATE TABLE "PlanProjection" ("id" TEXT NOT NULL PRIMARY KEY, "planId" TEXT NOT NULL UNIQUE);
      CREATE TABLE "TargetProject" ("id" TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE "ValidationAstPublishOperation" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "planId" TEXT NOT NULL,
        "targetProjectId" TEXT NOT NULL,
        "operationHash" TEXT NOT NULL,
        "runtimeInputHash" TEXT,
        "projectionHash" TEXT NOT NULL,
        "validationProjectionJson" TEXT,
        "phase" TEXT NOT NULL
      );
      CREATE TABLE "PlanEvent" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "planProjectionId" TEXT NOT NULL,
        "publishOperationId" TEXT,
        "validationId" TEXT,
        "sequence" INTEGER NOT NULL,
        "type" TEXT NOT NULL,
        "payloadJson" TEXT,
        "createdAt" DATETIME NOT NULL,
        FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection"("id") ON DELETE CASCADE,
        FOREIGN KEY ("publishOperationId") REFERENCES "ValidationAstPublishOperation"("id") ON DELETE RESTRICT
      );
      CREATE TABLE "RuntimeCapsule" ("id" TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE "BaselineAttempt" ("id" TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE "PlanOperationMetric" ("id" TEXT NOT NULL PRIMARY KEY);
    `,
  )
  return { databasePath, workspace }
}

function seedOperation(
  databasePath,
  {
    id,
    operationHash,
    runtimeInputHash = 'runtime-one',
    validationProjectionJson = JSON.stringify({
      validations: [
        { id: 'node-one', astProvenance: { schemaVersion: '2', publishOperationId: id } },
      ],
    }),
  },
) {
  sqlite(
    databasePath,
    `
      INSERT OR IGNORE INTO "PlanProjection" ("id", "planId") VALUES ('projection-one', 'plan-one');
      INSERT OR IGNORE INTO "TargetProject" ("id") VALUES ('target-one');
      INSERT INTO "ValidationAstPublishOperation" (
        "id", "planId", "targetProjectId", "operationHash", "runtimeInputHash", "projectionHash", "validationProjectionJson", "phase"
      ) VALUES ('${id}', 'plan-one', 'target-one', '${operationHash}', '${runtimeInputHash}', 'projection-one', ${sqlLiteral(validationProjectionJson)}, 'review_ready');
    `,
  )
}

function seedDecision(databasePath, { id, operationId, operationHash, validationId, contentHash, payload }) {
  const exactPayload =
    payload ??
    JSON.stringify({
      validationId,
      decision: 'approved',
      contentHash: contentHash ?? `content-${validationId}`,
      decidedBy: 'reviewer',
      decidedAt: '2026-08-07T12:00:00.000Z',
      operationHash,
    })
  sqlite(
    databasePath,
    `
      INSERT INTO "PlanEvent" (
        "id", "planProjectionId", "publishOperationId", "validationId", "sequence", "type", "payloadJson", "createdAt"
      ) VALUES (
        '${id}', 'projection-one', '${operationId}', '${validationId}',
        (SELECT count(*) + 1 FROM "PlanEvent"), 'validation_node_decided', ${sqlLiteral(exactPayload)}, '2026-08-07T12:00:00.000Z'
      );
    `,
  )
}

function applyMigration(databasePath) {
  const database = new DatabaseSync(databasePath)
  database.exec('BEGIN')
  try {
    database.exec(migrationSql)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    return error
  } finally {
    database.close()
  }
  return undefined
}

function tableExists(databasePath, tableName) {
  return sqlite(databasePath, `SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = '${tableName}';`)
}

function withLegacyDatabase(run) {
  const fixture = legacyDatabase()
  try {
    run(fixture.databasePath)
  } finally {
    rmSync(fixture.workspace, { recursive: true, force: true })
  }
}

test('workflow reliability migration creates the clean schema with nullable legacy bindings', () => {
  withLegacyDatabase(databasePath => {
    assert.equal(applyMigration(databasePath), undefined)
    for (const tableName of [
      'ValidationNodePublication',
      'ValidationDecisionReceipt',
      'CoordinatorFailureReceipt',
      'CoordinatorOperationReceipt',
    ])
      assert.equal(tableExists(databasePath, tableName), '1')
    assert.equal(
      sqlite(databasePath, `SELECT "notnull" FROM pragma_table_info('RuntimeCapsule') WHERE name = 'publicationId';`),
      '0',
    )
    assert.equal(
      sqlite(
        databasePath,
        `SELECT count(*) FROM pragma_table_info('PlanOperationMetric') WHERE name IN ('estimatedTokens', 'responseMode', 'retryCause', 'classification', 'operationOutcome');`,
      ),
      '5',
    )
  })
})

test('workflow reliability migration backfills exact decision history', () => {
  withLegacyDatabase(databasePath => {
    seedOperation(databasePath, { id: 'operation-one', operationHash: 'operation-hash-one' })
    seedDecision(databasePath, {
      id: 'event-one',
      operationId: 'operation-one',
      operationHash: 'operation-hash-one',
      validationId: 'node-one',
      contentHash: 'content-one',
    })
    assert.equal(applyMigration(databasePath), undefined)
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "planId" || '|' || "targetProjectId" || '|' || "validationId" || '|' || "contentHash" || '|' || "operationHash" || '|' || "runtimeInputHash" || '|' || "projectionHash" FROM "ValidationNodePublication";`,
      ),
      'plan-one|target-one|node-one|content-one|operation-hash-one|runtime-one|projection-one',
    )
    assert.equal(
      sqlite(
        databasePath,
        `SELECT "decision" || '|' || "decidedBy" || '|' || "idempotencyKey" FROM "ValidationDecisionReceipt";`,
      ),
      'approved|reviewer|legacy-event:event-one',
    )
  })
})

test('workflow reliability migration fails closed for a review-ready node without reconstructable content identity', () => {
  withLegacyDatabase(databasePath => {
    seedOperation(databasePath, { id: 'operation-one', operationHash: 'operation-hash-one' })
    const error = applyMigration(databasePath)
    assert.ok(error instanceof Error)
    assert.equal(tableExists(databasePath, 'ValidationNodePublication'), '0')
  })
})

test('workflow reliability migration preserves legacy evidence but rejects new unbound evidence', () => {
  withLegacyDatabase(databasePath => {
    sqlite(
      databasePath,
      `INSERT INTO "RuntimeCapsule" ("id") VALUES ('legacy-capsule');
       INSERT INTO "BaselineAttempt" ("id") VALUES ('legacy-attempt');`,
    )
    assert.equal(applyMigration(databasePath), undefined)
    assert.equal(sqlite(databasePath, `SELECT count(*) FROM "RuntimeCapsule" WHERE "publicationId" IS NULL;`), '1')
    assert.equal(sqlite(databasePath, `SELECT count(*) FROM "BaselineAttempt" WHERE "publicationId" IS NULL;`), '1')
    assert.throws(() => sqlite(databasePath, `INSERT INTO "RuntimeCapsule" ("id") VALUES ('new-capsule');`))
    assert.throws(() => sqlite(databasePath, `INSERT INTO "BaselineAttempt" ("id") VALUES ('new-attempt');`))
  })
})

test('workflow reliability migration retains later and sibling node publications', () => {
  withLegacyDatabase(databasePath => {
    seedOperation(databasePath, {
      id: 'operation-one',
      operationHash: 'operation-hash-one',
      validationProjectionJson: JSON.stringify({
        validations: [
          { id: 'node-one', astProvenance: { schemaVersion: '2', publishOperationId: 'operation-one' } },
          { id: 'node-two', astProvenance: { schemaVersion: '2', publishOperationId: 'operation-one' } },
        ],
      }),
    })
    seedDecision(databasePath, {
      id: 'event-one',
      operationId: 'operation-one',
      operationHash: 'operation-hash-one',
      validationId: 'node-one',
    })
    seedDecision(databasePath, {
      id: 'event-two',
      operationId: 'operation-one',
      operationHash: 'operation-hash-one',
      validationId: 'node-two',
    })
    seedOperation(databasePath, {
      id: 'operation-two',
      operationHash: 'operation-hash-two',
      runtimeInputHash: 'runtime-two',
    })
    seedDecision(databasePath, {
      id: 'event-three',
      operationId: 'operation-two',
      operationHash: 'operation-hash-two',
      validationId: 'node-one',
    })
    assert.equal(applyMigration(databasePath), undefined)
    assert.equal(sqlite(databasePath, `SELECT count(*) FROM "ValidationNodePublication";`), '3')
    assert.equal(
      sqlite(databasePath, `SELECT count(*) FROM "ValidationNodePublication" WHERE "validationId" = 'node-one';`),
      '2',
    )
  })
})

test('workflow reliability migration fails closed on a missing publication hash input', () => {
  withLegacyDatabase(databasePath => {
    seedOperation(databasePath, {
      id: 'operation-one',
      operationHash: 'operation-hash-one',
      runtimeInputHash: '',
    })
    seedDecision(databasePath, {
      id: 'event-one',
      operationId: 'operation-one',
      operationHash: 'operation-hash-one',
      validationId: 'node-one',
    })

    assert.notEqual(applyMigration(databasePath), undefined)
    assert.equal(tableExists(databasePath, 'ValidationNodePublication'), '0')
  })
})

test('workflow reliability migration fails closed when AST provenance points at another publication', () => {
  withLegacyDatabase(databasePath => {
    seedOperation(databasePath, {
      id: 'operation-one',
      operationHash: 'operation-hash-one',
      validationProjectionJson: JSON.stringify({
        validations: [
          { id: 'node-one', astProvenance: { schemaVersion: '2', publishOperationId: 'operation-ff' } },
        ],
      }),
    })
    seedDecision(databasePath, {
      id: 'event-one',
      operationId: 'operation-one',
      operationHash: 'operation-hash-one',
      validationId: 'node-one',
    })

    assert.notEqual(applyMigration(databasePath), undefined)
    assert.equal(tableExists(databasePath, 'ValidationNodePublication'), '0')
  })
})

for (const [label, payload] of [
  ['malformed JSON', '{not-json'],
  [
    'mismatched operation hash',
    JSON.stringify({
      validationId: 'node-one',
      decision: 'approved',
      contentHash: 'content-one',
      decidedBy: 'reviewer',
      decidedAt: '2026-08-07T12:00:00.000Z',
      operationHash: 'tampered-hash',
    }),
  ],
]) {
  test(`workflow reliability migration fails closed and rolls back on ${label}`, () => {
    withLegacyDatabase(databasePath => {
      seedOperation(databasePath, { id: 'operation-one', operationHash: 'operation-hash-one' })
      seedDecision(databasePath, {
        id: 'event-one',
        operationId: 'operation-one',
        operationHash: 'operation-hash-one',
        validationId: 'node-one',
        payload,
      })
      assert.notEqual(applyMigration(databasePath), undefined)
      assert.equal(tableExists(databasePath, 'ValidationNodePublication'), '0')
      assert.equal(
        sqlite(databasePath, `SELECT count(*) FROM pragma_table_info('PlanEvent') WHERE name = 'operationEventKey';`),
        '0',
      )
    })
  })
}

test('workflow reliability migration fails closed on duplicate legacy candidates', () => {
  withLegacyDatabase(databasePath => {
    seedOperation(databasePath, { id: 'operation-one', operationHash: 'operation-hash-one' })
    seedDecision(databasePath, {
      id: 'event-one',
      operationId: 'operation-one',
      operationHash: 'operation-hash-one',
      validationId: 'node-one',
    })
    seedDecision(databasePath, {
      id: 'event-two',
      operationId: 'operation-one',
      operationHash: 'operation-hash-one',
      validationId: 'node-one',
    })
    assert.notEqual(applyMigration(databasePath), undefined)
    assert.equal(tableExists(databasePath, 'ValidationNodePublication'), '0')
  })
})
