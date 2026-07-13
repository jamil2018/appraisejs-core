CREATE TABLE "DelegatedCoordinatorReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "parentCoordinatorId" TEXT NOT NULL,
  "delegatedCoordinatorId" TEXT NOT NULL,
  "targetProjectId" TEXT,
  "targetFingerprint" TEXT NOT NULL,
  "pathFingerprint" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "permissionsJson" TEXT NOT NULL,
  "prohibitionsJson" TEXT NOT NULL,
  "briefOrPlanHash" TEXT,
  "nonce" TEXT NOT NULL,
  "receiptJson" TEXT NOT NULL,
  "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  "revokedAt" DATETIME,
  "revokedBy" TEXT,
  "revocationReason" TEXT,
  CONSTRAINT "DelegatedCoordinatorReceipt_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DelegatedCoordinatorReceipt_nonce_key" ON "DelegatedCoordinatorReceipt"("nonce");
CREATE INDEX "DelegatedCoordinatorReceipt_delegatedCoordinatorId_expiresAt_idx" ON "DelegatedCoordinatorReceipt"("delegatedCoordinatorId", "expiresAt");
CREATE INDEX "DelegatedCoordinatorReceipt_targetFingerprint_expiresAt_idx" ON "DelegatedCoordinatorReceipt"("targetFingerprint", "expiresAt");

CREATE TABLE "DelegatedCoordinatorConsumption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "receiptId" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "consumedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DelegatedCoordinatorConsumption_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "DelegatedCoordinatorReceipt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DelegatedCoordinatorConsumption_receiptId_permission_operationKey_key" ON "DelegatedCoordinatorConsumption"("receiptId", "permission", "operationKey");
CREATE INDEX "DelegatedCoordinatorConsumption_receiptId_consumedAt_idx" ON "DelegatedCoordinatorConsumption"("receiptId", "consumedAt");
