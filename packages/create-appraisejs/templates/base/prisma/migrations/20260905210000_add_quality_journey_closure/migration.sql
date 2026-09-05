CREATE TABLE "QualityJourneyClosure" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "reportRevisionId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "reportHash" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "closureJson" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "closedAt" DATETIME NOT NULL,
  CONSTRAINT "QualityJourneyClosure_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyClosure_reportRevisionId_fkey" FOREIGN KEY ("reportRevisionId") REFERENCES "QualityJourneyTriageReport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyClosure_journeyId_key" ON "QualityJourneyClosure"("journeyId");
CREATE UNIQUE INDEX "QualityJourneyClosure_reportRevisionId_key" ON "QualityJourneyClosure"("reportRevisionId");

CREATE TRIGGER "QualityJourneyClosure_immutable_update" BEFORE UPDATE ON "QualityJourneyClosure"
BEGIN SELECT RAISE(ABORT, 'Quality Journey closure receipts are immutable'); END;
CREATE TRIGGER "QualityJourneyClosure_immutable_delete" BEFORE DELETE ON "QualityJourneyClosure"
BEGIN SELECT RAISE(ABORT, 'Quality Journey closure receipts are immutable'); END;
