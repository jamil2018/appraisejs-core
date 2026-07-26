CREATE TABLE "StepDefinitionSearchReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "indexHash" TEXT NOT NULL,
  "candidateReferencesJson" TEXT NOT NULL,
  "planId" TEXT,
  "correlationId" TEXT NOT NULL,
  "searchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL
);
CREATE INDEX "StepDefinitionSearchReceipt_expiresAt_idx" ON "StepDefinitionSearchReceipt"("expiresAt");
CREATE INDEX "StepDefinitionSearchReceipt_planId_correlationId_idx" ON "StepDefinitionSearchReceipt"("planId", "correlationId");
