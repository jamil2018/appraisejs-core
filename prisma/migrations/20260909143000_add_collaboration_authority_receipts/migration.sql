-- One-action collaboration authority handoffs retain only token hashes.
CREATE TABLE "CollaborationAuthorityReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "bindingId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "operationId" TEXT,
  "policyVersion" INTEGER NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "trustedPrincipalId" TEXT NOT NULL,
  "provenance" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "invalidatedAt" DATETIME,
  "consumedAt" DATETIME,
  "resultJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollaborationAuthorityReceipt_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CollaborationBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CollaborationAuthorityReceipt_tokenHash_key" ON "CollaborationAuthorityReceipt"("tokenHash");
CREATE INDEX "CollaborationAuthorityReceipt_bindingId_action_operationId_expiresAt_idx"
  ON "CollaborationAuthorityReceipt"("bindingId", "action", "operationId", "expiresAt");
