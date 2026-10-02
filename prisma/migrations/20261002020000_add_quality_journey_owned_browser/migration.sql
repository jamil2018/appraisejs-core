CREATE TABLE "QualityJourneyOwnedBrowser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "processInstanceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 0,
    "cleanupHistoryJson" TEXT NOT NULL DEFAULT '[]',
    "stopReceiptJson" TEXT,
    "stopReceiptHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityJourneyOwnedBrowser_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QualityJourneyOwnedBrowser_sessionId_key" ON "QualityJourneyOwnedBrowser"("sessionId");
CREATE INDEX "QualityJourneyOwnedBrowser_journeyId_targetProjectId_status_idx" ON "QualityJourneyOwnedBrowser"("journeyId", "targetProjectId", "status");
