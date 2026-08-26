-- REMOTE_EVALUATION_SCOPE is an Appraise-owned identity for the approved
-- evaluation scope only. It must never be interpreted as remote content or a
-- deployment attestation.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_EvaluationSubjectRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectDigest" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_EvaluationSubjectRevision" ("id", "subjectDigest", "subjectKind", "authority", "metadataJson", "createdAt")
SELECT "id", "subjectDigest", "subjectKind", "authority", "metadataJson", "createdAt" FROM "EvaluationSubjectRevision";
DROP TABLE "EvaluationSubjectRevision";
ALTER TABLE "new_EvaluationSubjectRevision" RENAME TO "EvaluationSubjectRevision";
CREATE UNIQUE INDEX "EvaluationSubjectRevision_subjectDigest_key" ON "EvaluationSubjectRevision"("subjectDigest");

ALTER TABLE "Assessment" ADD COLUMN "rootIdempotencyKey" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "rootRequestHash" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "rootScopeReservationHash" TEXT;
-- Preserve legacy roots as immutable reservations without changing decided
-- history or successor lineage. The id suffix keeps historical duplicate
-- roots representable; the service additionally checks the old tuple before
-- allowing a new root, so a duplicate cannot be recreated.
UPDATE "Assessment"
SET
  "rootIdempotencyKey" = 'legacy-root:' || "id",
  "rootRequestHash" = 'legacy-root-request:' || "id",
  "rootScopeReservationHash" = 'legacy-root-scope:' || "targetProjectId" || ':' || "qualityPlanRevisionId" || ':' || "evaluationSubjectRevisionId" || ':' || "id"
WHERE "supersedesAssessmentId" IS NULL;
CREATE UNIQUE INDEX "Assessment_targetProjectId_rootIdempotencyKey_key" ON "Assessment"("targetProjectId", "rootIdempotencyKey");
CREATE UNIQUE INDEX "Assessment_targetProjectId_rootScopeReservationHash_key" ON "Assessment"("targetProjectId", "rootScopeReservationHash");

ALTER TABLE "TestRun" ADD COLUMN "environmentSnapshotHash" TEXT;
ALTER TABLE "TestRun" ADD COLUMN "environmentSnapshotJson" TEXT;
ALTER TABLE "TestRun" ADD COLUMN "environmentSnapshotVersion" INTEGER;

-- updatedAt precision is provider-dependent. Remote scope guards use this
-- explicit value as their optimistic-concurrency token instead.
ALTER TABLE "Environment" ADD COLUMN "scopeVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "RemoteEvaluationScopeBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evaluationSubjectRevisionId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "qualityPlanId" TEXT NOT NULL,
    "qualityPlanRevisionId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "scopeHash" TEXT NOT NULL,
    "targetFingerprint" TEXT NOT NULL,
    "designHash" TEXT NOT NULL,
    "revisionContentHash" TEXT NOT NULL,
    "validationBindingsHash" TEXT NOT NULL,
    "realizationPreflightHash" TEXT NOT NULL,
    "runtimePolicyHash" TEXT NOT NULL,
    "securityPolicyHash" TEXT NOT NULL,
    "evidencePolicyHash" TEXT NOT NULL,
    "canonicalScopeJson" TEXT NOT NULL,
    "validationBindingsJson" TEXT NOT NULL,
    "environmentSnapshotHash" TEXT NOT NULL,
    "environmentSnapshotJson" TEXT NOT NULL,
    "environmentScopeVersion" INTEGER NOT NULL,
    "environmentUpdatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RemoteEvaluationScopeBinding_evaluationSubjectRevisionId_fkey" FOREIGN KEY ("evaluationSubjectRevisionId") REFERENCES "EvaluationSubjectRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RemoteEvaluationScopeBinding_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RemoteEvaluationScopeBinding_evaluationSubjectRevisionId_key" ON "RemoteEvaluationScopeBinding"("evaluationSubjectRevisionId");
CREATE UNIQUE INDEX "RemoteEvaluationScopeBinding_targetProjectId_scopeHash_key" ON "RemoteEvaluationScopeBinding"("targetProjectId", "scopeHash");
CREATE INDEX "RemoteEvaluationScopeBinding_targetProjectId_qualityPlanRevisionId_idx" ON "RemoteEvaluationScopeBinding"("targetProjectId", "qualityPlanRevisionId");

CREATE TABLE "RemoteEvaluationScopeIssuance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "evaluationSubjectRevisionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RemoteEvaluationScopeIssuance_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RemoteEvaluationScopeIssuance_evaluationSubjectRevisionId_fkey" FOREIGN KEY ("evaluationSubjectRevisionId") REFERENCES "EvaluationSubjectRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RemoteEvaluationScopeIssuance_targetProjectId_idempotencyKey_key" ON "RemoteEvaluationScopeIssuance"("targetProjectId", "idempotencyKey");
CREATE INDEX "RemoteEvaluationScopeIssuance_targetProjectId_evaluationSubjectRevisionId_idx" ON "RemoteEvaluationScopeIssuance"("targetProjectId", "evaluationSubjectRevisionId");

-- Legacy remotely-targeted descriptor Assessments intentionally have no new
-- binding. The service gate marks them stale/non-runnable on first lifecycle
-- access; historical decisions and receipts are preserved unchanged.
PRAGMA foreign_keys=ON;
