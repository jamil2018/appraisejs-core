-- CreateTable
CREATE TABLE "QualityJourneyDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "createIdempotencyKey" TEXT NOT NULL,
    "createRequestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "requirementJson" TEXT NOT NULL DEFAULT '{}',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "predecessorJourneyId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "draftHash" TEXT NOT NULL,
    "confirmationKey" TEXT,
    "confirmationRequestHash" TEXT,
    "confirmedRequirementHash" TEXT,
    "confirmedSourceVersion" INTEGER,
    "confirmedDraftHash" TEXT,
    "confirmedJourneyId" TEXT,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityJourneyDraft_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyDraft_confirmedJourneyId_fkey" FOREIGN KEY ("confirmedJourneyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyDraft_targetProjectId_createIdempotencyKey_key" ON "QualityJourneyDraft"("targetProjectId", "createIdempotencyKey");
CREATE UNIQUE INDEX "QualityJourneyDraft_confirmedJourneyId_key" ON "QualityJourneyDraft"("confirmedJourneyId");
CREATE INDEX "QualityJourneyDraft_targetProjectId_status_updatedAt_idx" ON "QualityJourneyDraft"("targetProjectId", "status", "updatedAt");
