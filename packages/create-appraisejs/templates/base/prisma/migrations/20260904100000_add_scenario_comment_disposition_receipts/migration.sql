ALTER TABLE "QualityJourneyScenarioReviewComment" ADD COLUMN "dispositionIdempotencyKey" TEXT;
ALTER TABLE "QualityJourneyScenarioReviewComment" ADD COLUMN "dispositionRequestHash" TEXT;
CREATE UNIQUE INDEX "QualityJourneyScenarioReviewComment_portfolioRevisionId_dispositionIdempotencyKey_key" ON "QualityJourneyScenarioReviewComment"("portfolioRevisionId", "dispositionIdempotencyKey");

CREATE TABLE "QualityJourneyScenarioDecisionReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "portfolioRevisionId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "resultJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyScenarioDecisionReceipt_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyScenarioDecisionReceipt_portfolioRevisionId_fkey" FOREIGN KEY ("portfolioRevisionId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyScenarioDecisionReceipt_journeyId_idempotencyKey_key" ON "QualityJourneyScenarioDecisionReceipt"("journeyId", "idempotencyKey");
CREATE INDEX "QualityJourneyScenarioDecisionReceipt_portfolioRevisionId_createdAt_idx" ON "QualityJourneyScenarioDecisionReceipt"("portfolioRevisionId", "createdAt");
