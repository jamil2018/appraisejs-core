CREATE TABLE "AssessmentPreparation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "qualityPlanId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "expectedDesignHash" TEXT NOT NULL,
  "phase" TEXT NOT NULL DEFAULT 'VALIDATING',
  "receiptJson" TEXT NOT NULL DEFAULT '{}',
  "failureJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AssessmentPreparation_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssessmentPreparation_targetProjectId_idempotencyKey_key" ON "AssessmentPreparation"("targetProjectId", "idempotencyKey");
CREATE INDEX "AssessmentPreparation_targetProjectId_phase_idx" ON "AssessmentPreparation"("targetProjectId", "phase");
