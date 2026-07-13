CREATE TABLE "ValidationResourceProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "proposalHash" TEXT NOT NULL,
    "proposalJson" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValidationResourceProposal_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ValidationResourceProposal_planId_idempotencyKey_key" ON "ValidationResourceProposal"("planId", "idempotencyKey");
CREATE UNIQUE INDEX "ValidationResourceProposal_targetProjectId_proposalHash_key" ON "ValidationResourceProposal"("targetProjectId", "proposalHash");
CREATE INDEX "ValidationResourceProposal_targetProjectId_createdAt_idx" ON "ValidationResourceProposal"("targetProjectId", "createdAt");
