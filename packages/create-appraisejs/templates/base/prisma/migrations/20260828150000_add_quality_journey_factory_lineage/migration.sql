CREATE TABLE "QualityJourneyWorkAuthorization" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "workItemId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "roleContractDigest" TEXT NOT NULL,
  "capabilityProfileId" TEXT NOT NULL,
  "capabilityProfileHash" TEXT NOT NULL,
  "authorizationJson" TEXT NOT NULL,
  "authorizationHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyWorkAuthorization_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyWorkAuthorization_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyWorkAuthorization_workItemId_key" ON "QualityJourneyWorkAuthorization"("workItemId");
CREATE INDEX "QualityJourneyWorkAuthorization_targetProjectId_role_idx" ON "QualityJourneyWorkAuthorization"("targetProjectId", "role");
CREATE INDEX "QualityJourneyWorkAuthorization_journeyId_workItemId_idx" ON "QualityJourneyWorkAuthorization"("journeyId", "workItemId");

ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "authorizationId" TEXT REFERENCES "QualityJourneyWorkAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "assignmentId" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "assignmentJson" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "assignmentHash" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "spawnRequestId" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "spawnRequestJson" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "spawnRequestHash" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "spawnReceiptId" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "spawnReceiptJson" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "spawnReceiptHash" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "replacesAttemptId" TEXT REFERENCES "QualityJourneyWorkAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_assignmentId_key" ON "QualityJourneyWorkAttempt"("assignmentId");
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_spawnRequestId_key" ON "QualityJourneyWorkAttempt"("spawnRequestId");
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_spawnReceiptId_key" ON "QualityJourneyWorkAttempt"("spawnReceiptId");
CREATE INDEX "QualityJourneyWorkAttempt_authorizationId_attempt_idx" ON "QualityJourneyWorkAttempt"("authorizationId", "attempt");
CREATE INDEX "QualityJourneyWorkAttempt_replacesAttemptId_idx" ON "QualityJourneyWorkAttempt"("replacesAttemptId");

CREATE TRIGGER "QualityJourneyWorkAuthorization_no_update" BEFORE UPDATE ON "QualityJourneyWorkAuthorization" BEGIN SELECT RAISE(ABORT, 'QualityJourneyWorkAuthorization is immutable'); END;
CREATE TRIGGER "QualityJourneyWorkAuthorization_no_delete" BEFORE DELETE ON "QualityJourneyWorkAuthorization" BEGIN SELECT RAISE(ABORT, 'QualityJourneyWorkAuthorization is immutable'); END;
CREATE TRIGGER "QualityJourneyWorkAttempt_assignment_no_change"
BEFORE UPDATE OF "authorizationId", "assignmentId", "assignmentJson", "assignmentHash", "spawnRequestId", "spawnRequestJson", "spawnRequestHash", "replacesAttemptId" ON "QualityJourneyWorkAttempt"
WHEN OLD."assignmentId" IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'QualityJourneyWorkAttempt assignment lineage is immutable'); END;
CREATE TRIGGER "QualityJourneyWorkAttempt_receipt_no_change"
BEFORE UPDATE OF "spawnReceiptId", "spawnReceiptJson", "spawnReceiptHash" ON "QualityJourneyWorkAttempt"
WHEN OLD."spawnReceiptId" IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'QualityJourneyWorkAttempt spawn receipt is immutable'); END;
