-- v2 clean cutover for remote evaluation scope/preflight authority.
-- Preserve every v1 byte for audit; execution code rejects v1 rather than
-- silently re-canonicalizing it under a different algorithm.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- A v1 scope or publication with an active execution cannot be retired
-- safely. SQLite only permits RAISE() in triggers, so a temporary CHECK
-- table gives this migration a deterministic all-or-nothing guard. The
-- publication branch intentionally has no target-kind filter: publications
-- can back independent or managed runs for either local or remote targets.
CREATE TEMP TABLE "_appraise_v2_preflight_guard" ("ok" INTEGER NOT NULL CHECK("ok" = 0));
INSERT INTO "_appraise_v2_preflight_guard" ("ok")
SELECT 1
WHERE EXISTS (
  SELECT 1
  FROM "AssessmentRun" ar
  JOIN "EvaluationSubjectRevision" subject ON subject."id" = ar."evaluationSubjectRevisionId"
  LEFT JOIN "AssessmentRunBinding" arb ON arb."assessmentRunId" = ar."id"
  LEFT JOIN "TestRun" tr ON tr."id" = arb."testRunId"
  WHERE subject."subjectKind" = 'REMOTE_EVALUATION_SCOPE'
    AND (
      ar."status" IN ('RUNNING', 'STOP_REQUESTED')
      -- A PREPARED parent with no children is ambiguous: it may be between
      -- reservation and materialization, so leave it for an explicit repair.
      OR (ar."status" = 'PREPARED' AND arb."id" IS NULL)
      OR (arb."id" IS NOT NULL AND tr."status" NOT IN ('COMPLETED', 'CANCELLED'))
      -- A terminal infrastructure failure before materialization/attempt has
      -- no target observation and is safe to retire as not_evaluated. Once a
      -- capsule or attempt exists, however, terminal execution needs its
      -- sealed evidence; abort rather than discarding that obligation.
      OR (
        arb."id" IS NOT NULL
        AND tr."status" IN ('COMPLETED', 'CANCELLED')
        AND arb."evidenceReceiptId" IS NULL
        AND (
          EXISTS (SELECT 1 FROM "RuntimeCapsule" capsule WHERE capsule."testRunId" = tr."id")
          OR EXISTS (SELECT 1 FROM "RuntimeCapsuleExecutionAttempt" attempt WHERE attempt."testRunId" = tr."id")
        )
      )
    )
  UNION ALL
  SELECT 1
  FROM "QualityValidationPublication" publication
  JOIN "RuntimeCapsule" capsule ON capsule."qualityPublicationId" = publication."id"
  JOIN "TestRun" tr ON tr."id" = capsule."testRunId"
  LEFT JOIN "RuntimeCapsuleExecutionAttempt" attempt ON attempt."capsuleId" = capsule."id"
  LEFT JOIN "AssessmentRunBinding" arb ON arb."testRunId" = tr."id"
  LEFT JOIN "AssessmentRun" ar ON ar."id" = arb."assessmentRunId"
  WHERE
    -- A capsule is a durable association to the publication. Do not retire
    -- that publication while its TestRun or execution attempt is live.
    tr."status" NOT IN ('COMPLETED', 'CANCELLED')
    OR attempt."state" IN ('PREPARED', 'STARTING', 'RUNNING')
    -- A managed parent remains active even if one child is terminal. Its
    -- assessment lifecycle must be explicitly repaired, not silently
    -- detached from a retired publication.
    OR ar."status" IN ('PREPARED', 'RUNNING', 'STOP_REQUESTED')
    -- Once a managed capsule/attempt exists, a terminal child still needs a
    -- sealed receipt. Preserve the established pre-execution failure escape:
    -- it has neither capsule nor attempt and therefore cannot reach this
    -- publication-linked branch.
    OR (
      arb."id" IS NOT NULL
      AND tr."status" IN ('COMPLETED', 'CANCELLED')
      AND arb."evidenceReceiptId" IS NULL
    )
  UNION ALL
  SELECT 1
  FROM "QualityValidationPublication" publication
  JOIN "AssessmentRunBinding" arb ON arb."validationVersionId" = publication."validationVersionId"
  JOIN "TestRun" tr ON tr."id" = arb."testRunId"
  JOIN "AssessmentRun" ar ON ar."id" = arb."assessmentRunId"
  WHERE
    -- Before a capsule is created, the binding's published ValidationVersion
    -- is the durable publication association. Do not retire it while the
    -- bound TestRun is still runnable or its parent is actively executing.
    -- A PREPARED parent with an already-terminal pre-execution child remains
    -- the established safe migration case; it has no capsule/attempt and is
    -- reconciled below for remote scope assessments.
    tr."status" NOT IN ('COMPLETED', 'CANCELLED')
    OR ar."status" IN ('RUNNING', 'STOP_REQUESTED')
  UNION ALL
  SELECT 1
  FROM "TestRun" tr
  WHERE tr."intent" = 'INDEPENDENT'
    AND tr."status" NOT IN ('COMPLETED', 'CANCELLED')
    -- Legacy pre-capsule independent rows retain only an opaque preparation
    -- key; it cannot prove whether the run came from a publication or an
    -- authored snapshot. If publications are being retired, fail closed for
    -- every active independent row rather than risk an orphaned published run.
    AND EXISTS (SELECT 1 FROM "QualityValidationPublication")
);
DROP TABLE "_appraise_v2_preflight_guard";

-- A historical PREPARED parent whose every child TestRun is terminal has no
-- runnable work remaining. Reconcile only that precise shape before retiring
-- the enclosing READY Assessment; do not fabricate receipts or outcomes.
UPDATE "AssessmentRun"
SET "status" = 'COMPLETED', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PREPARED'
  AND EXISTS (
    SELECT 1 FROM "EvaluationSubjectRevision" subject
    WHERE subject."id" = "AssessmentRun"."evaluationSubjectRevisionId"
      AND subject."subjectKind" = 'REMOTE_EVALUATION_SCOPE'
  )
  AND EXISTS (SELECT 1 FROM "AssessmentRunBinding" arb WHERE arb."assessmentRunId" = "AssessmentRun"."id")
  AND NOT EXISTS (
    SELECT 1
    FROM "AssessmentRunBinding" arb
    JOIN "TestRun" tr ON tr."id" = arb."testRunId"
    WHERE arb."assessmentRunId" = "AssessmentRun"."id"
      AND tr."status" NOT IN ('COMPLETED', 'CANCELLED')
  );

ALTER TABLE "RemoteEvaluationScopeBinding" ADD COLUMN "scopeSchemaVersion" TEXT NOT NULL DEFAULT 'appraise.remote-evaluation-scope/v1';
ALTER TABLE "RemoteEvaluationScopeBinding" ADD COLUMN "preflightAlgorithmVersion" TEXT NOT NULL DEFAULT 'appraise.quality-assessment-preflight/v1';
ALTER TABLE "RemoteEvaluationScopeBinding" ADD COLUMN "scopeIntentHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RemoteEvaluationScopeBinding" ADD COLUMN "realizationIntentHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RemoteEvaluationScopeBinding" ADD COLUMN "preflightHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RemoteEvaluationScopeBinding" ADD COLUMN "canonicalPreflightJson" TEXT NOT NULL DEFAULT '{}';
CREATE INDEX "RemoteEvaluationScopeBinding_targetProjectId_scopeSchemaVersion_preflightAlgorithmVersion_idx"
  ON "RemoteEvaluationScopeBinding"("targetProjectId", "scopeSchemaVersion", "preflightAlgorithmVersion");

-- Publication bytes are immutable too. Existing publications were produced
-- without a v2 preflight authority, so retain but retire them. New v2 rows
-- are written with all four bound hashes by the publication service.
ALTER TABLE "QualityValidationPublication" ADD COLUMN "preflightAlgorithmVersion" TEXT NOT NULL DEFAULT 'appraise.quality-assessment-preflight/v2';
ALTER TABLE "QualityValidationPublication" ADD COLUMN "preflightAuthority" TEXT NOT NULL DEFAULT 'appraisejs:quality-validation-publication:v2';
ALTER TABLE "QualityValidationPublication" ADD COLUMN "scopeIntentHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QualityValidationPublication" ADD COLUMN "realizationIntentHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QualityValidationPublication" ADD COLUMN "preflightHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QualityValidationPublication" ADD COLUMN "preflightDisposition" TEXT NOT NULL DEFAULT 'ACTIVE';
UPDATE "QualityValidationPublication"
SET
  "preflightAlgorithmVersion" = 'appraise.quality-assessment-preflight/v1',
  "preflightAuthority" = 'appraisejs:quality-validation-publication:v1',
  "preflightDisposition" = 'RETIRED_UNSUPPORTED';
CREATE INDEX "QualityValidationPublication_preflightAlgorithmVersion_preflightDisposition_idx"
  ON "QualityValidationPublication"("preflightAlgorithmVersion", "preflightDisposition");

-- Retire the failed/ready v1 lifecycle only. Historical runs, receipts,
-- subject rows, publication bytes and preparation receipts remain untouched.
-- A parent is terminalized only when every child run is terminal; partial
-- execution is stopped by the guard above.
UPDATE "Assessment"
SET "status" = 'STALE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'READY'
  AND EXISTS (
    SELECT 1
    FROM "EvaluationSubjectRevision" subject
    WHERE subject."id" = "Assessment"."evaluationSubjectRevisionId"
      AND subject."subjectKind" = 'REMOTE_EVALUATION_SCOPE'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "AssessmentRun" ar
    WHERE ar."assessmentId" = "Assessment"."id"
      AND ar."status" IN ('PREPARED', 'RUNNING', 'STOP_REQUESTED')
  );

PRAGMA foreign_keys=ON;
