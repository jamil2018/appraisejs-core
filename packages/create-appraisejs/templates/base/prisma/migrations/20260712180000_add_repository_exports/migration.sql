CREATE TABLE "RepositoryExportJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "publishOperationId" TEXT NOT NULL,
  "validationHash" TEXT NOT NULL,
  "destinationPath" TEXT NOT NULL,
  "policy" TEXT NOT NULL DEFAULT 'disabled',
  "state" TEXT NOT NULL DEFAULT 'queued',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL,
  "manifestHash" TEXT,
  "manifestJson" TEXT,
  "conflictJson" TEXT,
  "failureCode" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "completedAt" DATETIME,
  CONSTRAINT "RepositoryExportJob_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RepositoryExportJob_publishOperationId_fkey" FOREIGN KEY ("publishOperationId") REFERENCES "ValidationAstPublishOperation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RepositoryExportJob_idempotencyKey_key" ON "RepositoryExportJob"("idempotencyKey");
CREATE UNIQUE INDEX "RepositoryExportJob_targetProjectId_validationHash_destinationPath_key" ON "RepositoryExportJob"("targetProjectId", "validationHash", "destinationPath");
CREATE INDEX "RepositoryExportJob_state_updatedAt_idx" ON "RepositoryExportJob"("state", "updatedAt");
CREATE INDEX "RepositoryExportJob_targetProjectId_validationHash_idx" ON "RepositoryExportJob"("targetProjectId", "validationHash");

CREATE TABLE "RepositoryExportReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "validationHash" TEXT NOT NULL,
  "manifestHash" TEXT NOT NULL,
  "destinationPath" TEXT NOT NULL,
  "receiptJson" TEXT NOT NULL,
  "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepositoryExportReceipt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "RepositoryExportJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RepositoryExportReceipt_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RepositoryExportReceipt_jobId_key" ON "RepositoryExportReceipt"("jobId");
CREATE UNIQUE INDEX "RepositoryExportReceipt_targetProjectId_validationHash_destinationPath_key" ON "RepositoryExportReceipt"("targetProjectId", "validationHash", "destinationPath");
CREATE INDEX "RepositoryExportReceipt_targetProjectId_validationHash_idx" ON "RepositoryExportReceipt"("targetProjectId", "validationHash");
