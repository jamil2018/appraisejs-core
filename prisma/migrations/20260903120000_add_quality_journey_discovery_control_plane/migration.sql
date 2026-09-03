ALTER TABLE "QualityJourney" ADD COLUMN "activeDiscoveryRevisionId" TEXT REFERENCES "QualityJourneyDiscoveryRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityJourneyWorkItem" ADD COLUMN "authorizationScopeJson" TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "QualityJourneyDiscoveryRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "analysisRevisionId" TEXT NOT NULL,
  "analysisDecisionId" TEXT NOT NULL,
  "analysisArtifactId" TEXT NOT NULL,
  "analysisRevisionArtifactId" TEXT NOT NULL,
  "analysisRevisionContentHash" TEXT NOT NULL,
  "analysisApprovalArtifactId" TEXT NOT NULL,
  "analysisApprovalContentHash" TEXT NOT NULL,
  "approvedRequirementSetHash" TEXT NOT NULL,
  "environmentRegistryHash" TEXT NOT NULL,
  "locatorRegistryHash" TEXT NOT NULL,
  "resourceRegistryHash" TEXT NOT NULL,
  "stepDefinitionRegistryHash" TEXT NOT NULL,
  "operationRegistryHash" TEXT NOT NULL,
  "scoutScopeJson" TEXT NOT NULL,
  "scoutInputHash" TEXT NOT NULL,
  "resourceScopeJson" TEXT NOT NULL,
  "resourceInputHash" TEXT NOT NULL,
  "scopeHash" TEXT NOT NULL,
  "scoutWorkItemId" TEXT NOT NULL,
  "resourceWorkItemId" TEXT NOT NULL,
  "targetObservationJson" TEXT,
  "targetObservationHash" TEXT,
  "targetObservationIdempotencyKey" TEXT,
  "targetObservationSubmittedAt" DATETIME,
  "resourceResolutionJson" TEXT,
  "resourceResolutionHash" TEXT,
  "resourceResolutionIdempotencyKey" TEXT,
  "resourceResolutionSubmittedAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'COLLECTING',
  "predecessorRevisionId" TEXT,
  "retryIdempotencyKey" TEXT,
  "retryRequestHash" TEXT,
  "rowVersion" INTEGER NOT NULL DEFAULT 0,
  "completionHash" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "invalidatedAt" DATETIME,
  "supersededAt" DATETIME,
  CONSTRAINT "QualityJourneyDiscoveryRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyDiscoveryRevision_analysisRevisionId_fkey" FOREIGN KEY ("analysisRevisionId") REFERENCES "QualityJourneyAnalysisRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyDiscoveryRevision_analysisDecisionId_fkey" FOREIGN KEY ("analysisDecisionId") REFERENCES "QualityJourneyAnalysisDecision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyDiscoveryRevision_scoutWorkItemId_fkey" FOREIGN KEY ("scoutWorkItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyDiscoveryRevision_resourceWorkItemId_fkey" FOREIGN KEY ("resourceWorkItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyDiscoveryRevision_predecessorRevisionId_fkey" FOREIGN KEY ("predecessorRevisionId") REFERENCES "QualityJourneyDiscoveryRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QualityJourney_activeDiscoveryRevisionId_key" ON "QualityJourney"("activeDiscoveryRevisionId");
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_scoutWorkItemId_key" ON "QualityJourneyDiscoveryRevision"("scoutWorkItemId");
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_resourceWorkItemId_key" ON "QualityJourneyDiscoveryRevision"("resourceWorkItemId");
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_journeyId_targetObservationIdempotencyKey_key" ON "QualityJourneyDiscoveryRevision"("journeyId", "targetObservationIdempotencyKey");
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_journeyId_resourceResolutionIdempotencyKey_key" ON "QualityJourneyDiscoveryRevision"("journeyId", "resourceResolutionIdempotencyKey");
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_predecessorRevisionId_key" ON "QualityJourneyDiscoveryRevision"("predecessorRevisionId");
CREATE UNIQUE INDEX "QualityJourneyDiscoveryRevision_journeyId_retryIdempotencyKey_key" ON "QualityJourneyDiscoveryRevision"("journeyId", "retryIdempotencyKey");
CREATE INDEX "QualityJourneyDiscoveryRevision_journeyId_status_idx" ON "QualityJourneyDiscoveryRevision"("journeyId", "status");
CREATE INDEX "QualityJourneyDiscoveryRevision_targetProjectId_createdAt_idx" ON "QualityJourneyDiscoveryRevision"("targetProjectId", "createdAt");
CREATE INDEX "QualityJourneyDiscoveryRevision_analysisRevisionId_idx" ON "QualityJourneyDiscoveryRevision"("analysisRevisionId");

CREATE TRIGGER "QualityJourneyDiscoveryRevision_identity_immutable"
BEFORE UPDATE OF "journeyId", "targetProjectId", "cycleId", "analysisRevisionId", "analysisDecisionId", "analysisArtifactId", "analysisRevisionArtifactId", "analysisRevisionContentHash", "analysisApprovalArtifactId", "analysisApprovalContentHash", "approvedRequirementSetHash", "environmentRegistryHash", "locatorRegistryHash", "resourceRegistryHash", "stepDefinitionRegistryHash", "operationRegistryHash", "scoutScopeJson", "scoutInputHash", "resourceScopeJson", "resourceInputHash", "scopeHash", "scoutWorkItemId", "resourceWorkItemId", "predecessorRevisionId", "retryIdempotencyKey", "retryRequestHash" ON "QualityJourneyDiscoveryRevision"
BEGIN SELECT RAISE(ABORT, 'QualityJourneyDiscoveryRevision authority is immutable'); END;
