CREATE TABLE "ValidationAstPublishOperation" (
 "id" TEXT NOT NULL PRIMARY KEY, "planId" TEXT NOT NULL, "planProjectionId" TEXT NOT NULL,
 "targetProjectId" TEXT NOT NULL, "targetFingerprint" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
 "operationHash" TEXT NOT NULL,
 "phase" TEXT NOT NULL DEFAULT 'prepared', "expectedPlanHash" TEXT NOT NULL, "expectedPlanArtifactHash" TEXT NOT NULL,
 "expectedValidationHash" TEXT, "expectedReviewHash" TEXT NOT NULL, "planHash" TEXT NOT NULL,
 "validationHash" TEXT NOT NULL, "reviewHash" TEXT NOT NULL, "planContent" TEXT NOT NULL,
 "validationContent" TEXT NOT NULL, "reviewContent" TEXT NOT NULL, "astId" TEXT NOT NULL,
 "astHash" TEXT NOT NULL, "contextHash" TEXT NOT NULL, "previewHash" TEXT NOT NULL,
 "receiptHash" TEXT NOT NULL, "projectionHash" TEXT NOT NULL, "projectionJson" TEXT NOT NULL,
 "validationProjectionJson" TEXT NOT NULL, "failure" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "ValidationAstPublishOperation_planProjectionId_fkey" FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ValidationAstPublishOperation_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ValidationAstPublishOperation_planId_idempotencyKey_key" ON "ValidationAstPublishOperation"("planId", "idempotencyKey");
CREATE UNIQUE INDEX "ValidationAstPublishOperation_operationHash_key" ON "ValidationAstPublishOperation"("operationHash");
CREATE INDEX "ValidationAstPublishOperation_phase_updatedAt_idx" ON "ValidationAstPublishOperation"("phase", "updatedAt");
CREATE INDEX "ValidationAstPublishOperation_planProjectionId_phase_idx" ON "ValidationAstPublishOperation"("planProjectionId", "phase");
CREATE INDEX "ValidationAstPublishOperation_targetProjectId_phase_idx" ON "ValidationAstPublishOperation"("targetProjectId", "phase");
CREATE TABLE "ValidationExtensionReview" (
 "id" TEXT NOT NULL PRIMARY KEY, "operationId" TEXT NOT NULL, "extensionId" TEXT NOT NULL,
 "version" TEXT NOT NULL, "sourceHash" TEXT NOT NULL, "compiledHash" TEXT NOT NULL,
 "artifactHash" TEXT NOT NULL, "artifactJson" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ValidationExtensionReview_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ValidationAstPublishOperation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ValidationExtensionReview_operationId_extensionId_version_key" ON "ValidationExtensionReview"("operationId", "extensionId", "version");
CREATE INDEX "ValidationExtensionReview_artifactHash_idx" ON "ValidationExtensionReview"("artifactHash");
ALTER TABLE "PlanEvent" ADD COLUMN "publishOperationId" TEXT REFERENCES "ValidationAstPublishOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanEvent" ADD COLUMN "validationId" TEXT;
CREATE UNIQUE INDEX "PlanEvent_publishOperationId_type_key" ON "PlanEvent"("publishOperationId", "type");
CREATE UNIQUE INDEX "PlanEvent_publishOperationId_validationId_key" ON "PlanEvent"("publishOperationId", "validationId");
