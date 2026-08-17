-- Preserve every historical Assessment as an immutable root, then add a
-- one-to-one successor link for explicit retries. SQLite needs a table rebuild
-- to make the backfilled lineage ID non-null and add the self reference.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Assessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "qualityPlanId" TEXT NOT NULL,
    "qualityPlanRevisionId" TEXT NOT NULL,
    "evaluationSubjectRevisionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "alignment" TEXT NOT NULL DEFAULT 'CURRENT',
    "observedAssurance" TEXT,
    "baselineAssessmentId" TEXT,
    "lineageId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "supersedesAssessmentId" TEXT,
    "supersessionDispositionJson" TEXT,
    "successorIdempotencyKey" TEXT,
    "successorRequestHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assessment_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assessment_qualityPlanId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanId", "targetProjectId") REFERENCES "QualityPlan" ("id", "targetProjectId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assessment_qualityPlanRevisionId_qualityPlanId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "qualityPlanId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "qualityPlanId", "targetProjectId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assessment_evaluationSubjectRevisionId_fkey" FOREIGN KEY ("evaluationSubjectRevisionId") REFERENCES "EvaluationSubjectRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assessment_baselineAssessmentId_targetProjectId_qualityPlanId_qualityPlanRevisionId_fkey" FOREIGN KEY ("baselineAssessmentId", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId") REFERENCES "Assessment" ("id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Assessment_supersedesAssessmentId_fkey" FOREIGN KEY ("supersedesAssessmentId") REFERENCES "Assessment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Assessment" (
    "id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "evaluationSubjectRevisionId",
    "status", "alignment", "observedAssurance", "baselineAssessmentId", "lineageId", "generation",
    "supersedesAssessmentId", "supersessionDispositionJson", "successorIdempotencyKey", "successorRequestHash",
    "createdAt", "updatedAt"
)
SELECT
    "id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId", "evaluationSubjectRevisionId",
    "status", "alignment", "observedAssurance", "baselineAssessmentId", "id", 0,
    NULL, NULL, NULL, NULL,
    "createdAt", "updatedAt"
FROM "Assessment";

DROP TABLE "Assessment";
ALTER TABLE "new_Assessment" RENAME TO "Assessment";

CREATE UNIQUE INDEX "Assessment_id_targetProjectId_key" ON "Assessment"("id", "targetProjectId");
CREATE UNIQUE INDEX "Assessment_id_targetProjectId_qualityPlanRevisionId_key" ON "Assessment"("id", "targetProjectId", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "Assessment_id_targetProjectId_qualityPlanId_qualityPlanRevisionId_key" ON "Assessment"("id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "Assessment_supersedesAssessmentId_key" ON "Assessment"("supersedesAssessmentId");
CREATE UNIQUE INDEX "Assessment_targetProjectId_successorIdempotencyKey_key" ON "Assessment"("targetProjectId", "successorIdempotencyKey");
CREATE INDEX "Assessment_targetProjectId_status_idx" ON "Assessment"("targetProjectId", "status");
CREATE INDEX "Assessment_qualityPlanId_status_idx" ON "Assessment"("qualityPlanId", "status");
CREATE INDEX "Assessment_qualityPlanRevisionId_alignment_idx" ON "Assessment"("qualityPlanRevisionId", "alignment");
CREATE UNIQUE INDEX "Assessment_lineageId_generation_key" ON "Assessment"("lineageId", "generation");

PRAGMA foreign_keys=ON;
