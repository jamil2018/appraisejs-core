ALTER TABLE "QualityJourney" ADD COLUMN "activeScenarioPortfolioRevisionId" TEXT REFERENCES "QualityJourneyScenarioPortfolioRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QualityJourneyScenarioPortfolioRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "discoveryRevisionId" TEXT NOT NULL,
  "discoveryCompletionHash" TEXT NOT NULL,
  "predecessorPortfolioRevisionId" TEXT,
  "artifactRecordId" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "artifactRevisionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "behavioralIntentHash" TEXT NOT NULL,
  "enrichmentHash" TEXT NOT NULL,
  "layoutHash" TEXT NOT NULL,
  "submissionIdempotencyKey" TEXT NOT NULL,
  "submissionHash" TEXT NOT NULL,
  "submittedWorkItemId" TEXT NOT NULL,
  "submittedAttemptId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "reviewHash" TEXT,
  "approvedIntentHash" TEXT,
  "approvedCoverageHash" TEXT,
  "decisionSetHash" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" DATETIME,
  "supersededAt" DATETIME,
  CONSTRAINT "QualityJourneyScenarioPortfolioRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyScenarioPortfolioRevision_discoveryRevisionId_fkey" FOREIGN KEY ("discoveryRevisionId") REFERENCES "QualityJourneyDiscoveryRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyScenarioPortfolioRevision_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyScenarioPortfolioRevision_submittedWorkItemId_fkey" FOREIGN KEY ("submittedWorkItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyScenarioPortfolioRevision_submittedAttemptId_fkey" FOREIGN KEY ("submittedAttemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyScenarioPortfolioRevision_predecessorPortfolioRevisionId_fkey" FOREIGN KEY ("predecessorPortfolioRevisionId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourney_activeScenarioPortfolioRevisionId_key" ON "QualityJourney"("activeScenarioPortfolioRevisionId");
CREATE UNIQUE INDEX "QualityJourneyScenarioPortfolioRevision_artifactRecordId_key" ON "QualityJourneyScenarioPortfolioRevision"("artifactRecordId");
CREATE UNIQUE INDEX "QualityJourneyScenarioPortfolioRevision_journeyId_artifactRevisionId_key" ON "QualityJourneyScenarioPortfolioRevision"("journeyId", "artifactRevisionId");
CREATE UNIQUE INDEX "QualityJourneyScenarioPortfolioRevision_journeyId_revision_key" ON "QualityJourneyScenarioPortfolioRevision"("journeyId", "revision");
CREATE UNIQUE INDEX "QualityJourneyScenarioPortfolioRevision_journeyId_submissionIdempotencyKey_key" ON "QualityJourneyScenarioPortfolioRevision"("journeyId", "submissionIdempotencyKey");
CREATE UNIQUE INDEX "QualityJourneyScenarioPortfolioRevision_predecessorPortfolioRevisionId_key" ON "QualityJourneyScenarioPortfolioRevision"("predecessorPortfolioRevisionId");
CREATE INDEX "QualityJourneyScenarioPortfolioRevision_journeyId_status_idx" ON "QualityJourneyScenarioPortfolioRevision"("journeyId", "status");
CREATE INDEX "QualityJourneyScenarioPortfolioRevision_targetProjectId_createdAt_idx" ON "QualityJourneyScenarioPortfolioRevision"("targetProjectId", "createdAt");
CREATE INDEX "QualityJourneyScenarioPortfolioRevision_discoveryRevisionId_idx" ON "QualityJourneyScenarioPortfolioRevision"("discoveryRevisionId");

CREATE TABLE "QualityJourneyScenarioRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "portfolioRevisionId" TEXT NOT NULL,
  "stableScenarioId" TEXT NOT NULL,
  "scenarioRevisionId" TEXT NOT NULL,
  "behavioralIntentJson" TEXT NOT NULL,
  "behavioralIntentHash" TEXT NOT NULL,
  "enrichmentJson" TEXT NOT NULL,
  "enrichmentHash" TEXT NOT NULL,
  "layoutJson" TEXT NOT NULL,
  "layoutHash" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyScenarioRevision_portfolioRevisionId_fkey" FOREIGN KEY ("portfolioRevisionId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyScenarioRevision_portfolioRevisionId_scenarioRevisionId_key" ON "QualityJourneyScenarioRevision"("portfolioRevisionId", "scenarioRevisionId");
CREATE UNIQUE INDEX "QualityJourneyScenarioRevision_portfolioRevisionId_stableScenarioId_key" ON "QualityJourneyScenarioRevision"("portfolioRevisionId", "stableScenarioId");
CREATE UNIQUE INDEX "QualityJourneyScenarioRevision_scenarioRevisionId_key" ON "QualityJourneyScenarioRevision"("scenarioRevisionId");
CREATE INDEX "QualityJourneyScenarioRevision_stableScenarioId_idx" ON "QualityJourneyScenarioRevision"("stableScenarioId");

CREATE TABLE "QualityJourneyScenarioDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "portfolioRevisionId" TEXT NOT NULL,
  "scenarioRevisionId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "feedback" TEXT,
  "actor" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "carriedFromDecisionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyScenarioDecision_portfolioRevisionId_fkey" FOREIGN KEY ("portfolioRevisionId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyScenarioDecision_scenarioRevisionId_fkey" FOREIGN KEY ("scenarioRevisionId") REFERENCES "QualityJourneyScenarioRevision" ("scenarioRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyScenarioDecision_carriedFromDecisionId_fkey" FOREIGN KEY ("carriedFromDecisionId") REFERENCES "QualityJourneyScenarioDecision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyScenarioDecision_portfolioRevisionId_scenarioRevisionId_key" ON "QualityJourneyScenarioDecision"("portfolioRevisionId", "scenarioRevisionId");
CREATE UNIQUE INDEX "QualityJourneyScenarioDecision_portfolioRevisionId_idempotencyKey_key" ON "QualityJourneyScenarioDecision"("portfolioRevisionId", "idempotencyKey");
CREATE INDEX "QualityJourneyScenarioDecision_portfolioRevisionId_decision_idx" ON "QualityJourneyScenarioDecision"("portfolioRevisionId", "decision");

CREATE TABLE "QualityJourneyScenarioReviewComment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "portfolioRevisionId" TEXT NOT NULL,
  "scenarioRevisionId" TEXT,
  "comment" TEXT NOT NULL,
  "blocking" BOOLEAN NOT NULL DEFAULT false,
  "disposition" TEXT NOT NULL DEFAULT 'OPEN',
  "disposedAt" DATETIME,
  "disposedBy" TEXT,
  "actor" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyScenarioReviewComment_portfolioRevisionId_fkey" FOREIGN KEY ("portfolioRevisionId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyScenarioReviewComment_scenarioRevisionId_fkey" FOREIGN KEY ("scenarioRevisionId") REFERENCES "QualityJourneyScenarioRevision" ("scenarioRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyScenarioReviewComment_portfolioRevisionId_idempotencyKey_key" ON "QualityJourneyScenarioReviewComment"("portfolioRevisionId", "idempotencyKey");
CREATE INDEX "QualityJourneyScenarioReviewComment_portfolioRevisionId_scenarioRevisionId_idx" ON "QualityJourneyScenarioReviewComment"("portfolioRevisionId", "scenarioRevisionId");
