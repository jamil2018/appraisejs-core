-- CreateTable
CREATE TABLE "QualityJourneyCoordinatorHandoff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "ticketHash" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "launchedAt" DATETIME,
    "connectedAt" DATETIME,
    "failedAt" DATETIME,
    "failureCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityJourneyCoordinatorHandoff_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyCoordinatorHandoff_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyCoordinatorHandoff_ticketHash_key" ON "QualityJourneyCoordinatorHandoff"("ticketHash");

-- CreateIndex
CREATE INDEX "QualityJourneyCoordinatorHandoff_journeyId_createdAt_idx" ON "QualityJourneyCoordinatorHandoff"("journeyId", "createdAt");

-- CreateIndex
CREATE INDEX "QualityJourneyCoordinatorHandoff_targetProjectId_status_idx" ON "QualityJourneyCoordinatorHandoff"("targetProjectId", "status");

-- CreateIndex
CREATE INDEX "QualityJourneyCoordinatorHandoff_expiresAt_idx" ON "QualityJourneyCoordinatorHandoff"("expiresAt");
