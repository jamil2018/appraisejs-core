PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QualityJourneyAutomationRequestReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "workItemId" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "ownerTokenHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "resultJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyAutomationRequestReceipt_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAutomationRequestReceipt_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAutomationRequestReceipt_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_QualityJourneyAutomationRequestReceipt" ("id", "journeyId", "workItemId", "attemptId", "ownerTokenHash", "idempotencyKey", "requestHash", "status", "resultJson", "createdAt")
SELECT "id", "journeyId", "workItemId", "attemptId", "ownerTokenHash", "idempotencyKey", "requestHash", "status", "resultJson", "createdAt"
FROM "QualityJourneyAutomationRequestReceipt";
DROP TABLE "QualityJourneyAutomationRequestReceipt";
ALTER TABLE "new_QualityJourneyAutomationRequestReceipt" RENAME TO "QualityJourneyAutomationRequestReceipt";
CREATE UNIQUE INDEX "QualityJourneyAutomationRequestReceipt_journeyId_idempotencyKey_key" ON "QualityJourneyAutomationRequestReceipt"("journeyId", "idempotencyKey");
CREATE INDEX "QualityJourneyAutomationRequestReceipt_attemptId_idx" ON "QualityJourneyAutomationRequestReceipt"("attemptId");
CREATE TRIGGER "QualityJourneyAutomationRequestReceipt_immutable_update" BEFORE UPDATE ON "QualityJourneyAutomationRequestReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator request receipts are immutable'); END;
CREATE TRIGGER "QualityJourneyAutomationRequestReceipt_immutable_delete" BEFORE DELETE ON "QualityJourneyAutomationRequestReceipt" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator request receipts are append-only'); END;
PRAGMA foreign_keys=ON;
