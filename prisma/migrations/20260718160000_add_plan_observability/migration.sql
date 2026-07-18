CREATE TABLE "PlanOperationMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planProjectionId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "waitMs" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "toolCallCount" INTEGER NOT NULL DEFAULT 1,
    "requestBytes" INTEGER NOT NULL,
    "responseBytes" INTEGER NOT NULL,
    "recoveryCost" INTEGER NOT NULL DEFAULT 0,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanOperationMetric_planProjectionId_fkey" FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PlanOperationMetric_planProjectionId_recordedAt_idx" ON "PlanOperationMetric"("planProjectionId", "recordedAt");
CREATE INDEX "PlanOperationMetric_recordedAt_idx" ON "PlanOperationMetric"("recordedAt");

CREATE TABLE "LifecycleCertificationReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemaVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "matrixHash" TEXT NOT NULL,
    "matrixJson" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "gitCommit" TEXT,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "LifecycleCertificationReceipt_recordedAt_idx" ON "LifecycleCertificationReceipt"("recordedAt");
CREATE INDEX "LifecycleCertificationReceipt_status_recordedAt_idx" ON "LifecycleCertificationReceipt"("status", "recordedAt");
