-- Phase 4 advisory reuse provenance. These records stay outside Journey authority.
CREATE TABLE "QualityJourneyReuseSeed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "assetPortableId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "sourcePayloadHash" TEXT NOT NULL,
    "sourceRevision" TEXT,
    "contentJson" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyReuseSeed_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "QualityJourneyDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyReuseSeed_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CollaborationBinding" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QualityJourneyReuseSeed_draftId_kind_assetPortableId_sourceVersion_key"
  ON "QualityJourneyReuseSeed"("draftId", "kind", "assetPortableId", "sourceVersion");
CREATE INDEX "QualityJourneyReuseSeed_bindingId_assetPortableId_sourceVersion_idx"
  ON "QualityJourneyReuseSeed"("bindingId", "assetPortableId", "sourceVersion");

ALTER TABLE "QualityJourneyWorkItem" ADD COLUMN "advisoryInputRefsJson" TEXT NOT NULL DEFAULT '[]';

-- A nullable queue key gives SQLite one queued operation per binding without
-- treating accepted/in-flight operations as replaceable queue entries.
ALTER TABLE "CollaborationOperation" ADD COLUMN "queueKey" TEXT;
ALTER TABLE "CollaborationOperation" ADD COLUMN "predecessorId" TEXT;
CREATE UNIQUE INDEX "CollaborationOperation_bindingId_queueKey_key"
  ON "CollaborationOperation"("bindingId", "queueKey");
CREATE INDEX "CollaborationOperation_predecessorId_idx"
  ON "CollaborationOperation"("predecessorId");

ALTER TABLE "CollaborationAttempt" ADD COLUMN "claimTokenHash" TEXT;
ALTER TABLE "CollaborationAttempt" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "CollaborationAttempt" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "CollaborationAttempt" ADD COLUMN "cancelledAt" DATETIME;
CREATE INDEX "CollaborationAttempt_workerId_idx" ON "CollaborationAttempt"("workerId");

ALTER TABLE "CollaborationWorker" ADD COLUMN "capabilitiesHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CollaborationWorker" ADD COLUMN "trustedPrincipalId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CollaborationWorker" ADD COLUMN "provenance" TEXT NOT NULL DEFAULT '';

ALTER TABLE "CollaborationHandoffTicket" ADD COLUMN "invalidatedAt" DATETIME;
ALTER TABLE "CollaborationHandoffTicket" ADD COLUMN "invalidationReason" TEXT;
