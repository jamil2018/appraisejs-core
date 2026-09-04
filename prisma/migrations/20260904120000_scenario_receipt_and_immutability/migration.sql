ALTER TABLE "QualityJourneyScenarioReviewComment" ADD COLUMN "createResponseJson" TEXT;
ALTER TABLE "QualityJourneyScenarioReviewComment" ADD COLUMN "dispositionResponseJson" TEXT;

-- A submitted portfolio is a durable evidence record. Review fields are the
-- only mutable projection fields; its authority, content and graph stay fixed.
CREATE TRIGGER "QualityJourneyScenarioPortfolioRevision_immutable_update"
BEFORE UPDATE ON "QualityJourneyScenarioPortfolioRevision"
FOR EACH ROW WHEN
  NEW."journeyId" IS NOT OLD."journeyId" OR
  NEW."targetProjectId" IS NOT OLD."targetProjectId" OR
  NEW."cycleId" IS NOT OLD."cycleId" OR
  NEW."discoveryRevisionId" IS NOT OLD."discoveryRevisionId" OR
  NEW."discoveryCompletionHash" IS NOT OLD."discoveryCompletionHash" OR
  NEW."predecessorPortfolioRevisionId" IS NOT OLD."predecessorPortfolioRevisionId" OR
  NEW."artifactRecordId" IS NOT OLD."artifactRecordId" OR
  NEW."artifactId" IS NOT OLD."artifactId" OR
  NEW."artifactRevisionId" IS NOT OLD."artifactRevisionId" OR
  NEW."revision" IS NOT OLD."revision" OR
  NEW."contentHash" IS NOT OLD."contentHash" OR
  NEW."behavioralIntentHash" IS NOT OLD."behavioralIntentHash" OR
  NEW."enrichmentHash" IS NOT OLD."enrichmentHash" OR
  NEW."layoutHash" IS NOT OLD."layoutHash" OR
  NEW."coverageRationale" IS NOT OLD."coverageRationale" OR
  NEW."graphJson" IS NOT OLD."graphJson" OR
  NEW."submissionIdempotencyKey" IS NOT OLD."submissionIdempotencyKey" OR
  NEW."submissionHash" IS NOT OLD."submissionHash" OR
  NEW."submittedWorkItemId" IS NOT OLD."submittedWorkItemId" OR
  NEW."submittedAttemptId" IS NOT OLD."submittedAttemptId" OR
  NEW."createdAt" IS NOT OLD."createdAt"
BEGIN SELECT RAISE(ABORT, 'Scenario portfolio authority and graph are immutable'); END;

-- Comments are append-only review evidence. Disposition and its durable
-- receipt/snapshot may change, but neither the author nor the review scope can.
CREATE TRIGGER "QualityJourneyScenarioReviewComment_immutable_update"
BEFORE UPDATE ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW WHEN
  NEW."portfolioRevisionId" IS NOT OLD."portfolioRevisionId" OR
  NEW."scenarioRevisionId" IS NOT OLD."scenarioRevisionId" OR
  NEW."comment" IS NOT OLD."comment" OR
  NEW."blocking" IS NOT OLD."blocking" OR
  NEW."actor" IS NOT OLD."actor" OR
  NEW."idempotencyKey" IS NOT OLD."idempotencyKey" OR
  NEW."requestHash" IS NOT OLD."requestHash" OR
  NEW."createdAt" IS NOT OLD."createdAt"
BEGIN SELECT RAISE(ABORT, 'Scenario comment evidence is immutable'); END;
CREATE TRIGGER "QualityJourneyScenarioReviewComment_immutable_delete"
BEFORE DELETE ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario comments are append-only'); END;

CREATE TRIGGER "QualityJourneyScenarioReviewComment_initial_disposition"
BEFORE INSERT ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW WHEN
  NEW."disposition" <> 'OPEN' OR
  NEW."disposedAt" IS NOT NULL OR
  NEW."disposedBy" IS NOT NULL OR
  NEW."dispositionIdempotencyKey" IS NOT NULL OR
  NEW."dispositionRequestHash" IS NOT NULL OR
  NEW."dispositionResponseJson" IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Scenario comments must begin OPEN without a disposition receipt'); END;

CREATE TRIGGER "QualityJourneyScenarioPortfolioRevision_review_transition"
BEFORE UPDATE OF "status", "reviewHash", "reviewedAt", "supersededAt", "approvedIntentHash", "approvedCoverageHash", "decisionSetHash"
ON "QualityJourneyScenarioPortfolioRevision"
FOR EACH ROW WHEN NOT (
  (OLD."status" = 'PUBLISHED' AND NEW."status" IN ('PUBLISHED', 'IN_REVIEW')) OR
  (OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('IN_REVIEW', 'APPROVED', 'REVISION_REQUIRED')) OR
  (OLD."status" IN ('APPROVED', 'REVISION_REQUIRED') AND NEW."status" = OLD."status")
) OR
  (NEW."status" <> 'IN_REVIEW' AND NEW."reviewHash" IS NOT OLD."reviewHash") OR
  (OLD."reviewedAt" IS NOT NULL AND NEW."reviewedAt" IS NOT OLD."reviewedAt") OR
  (OLD."reviewedAt" IS NULL AND NEW."reviewedAt" IS NOT NULL AND NOT (OLD."status" = 'PUBLISHED' AND NEW."status" = 'IN_REVIEW')) OR
  (OLD."status" = 'PUBLISHED' AND NEW."status" = 'IN_REVIEW' AND (NEW."reviewedAt" IS NULL OR NEW."reviewHash" IS NULL)) OR
  (OLD."supersededAt" IS NOT NULL AND NEW."supersededAt" IS NOT OLD."supersededAt") OR
  (OLD."supersededAt" IS NULL AND NEW."supersededAt" IS NOT NULL AND NOT (OLD."status" = 'IN_REVIEW' AND NEW."status" = 'REVISION_REQUIRED')) OR
  (OLD."status" = 'IN_REVIEW' AND NEW."status" = 'REVISION_REQUIRED' AND NEW."supersededAt" IS NULL) OR
  (OLD."approvedIntentHash" IS NOT NULL AND NEW."approvedIntentHash" IS NOT OLD."approvedIntentHash") OR
  (OLD."approvedCoverageHash" IS NOT NULL AND NEW."approvedCoverageHash" IS NOT OLD."approvedCoverageHash") OR
  (OLD."decisionSetHash" IS NOT NULL AND NEW."decisionSetHash" IS NOT OLD."decisionSetHash") OR
  ((NEW."approvedIntentHash" IS NOT NULL OR NEW."approvedCoverageHash" IS NOT NULL OR NEW."decisionSetHash" IS NOT NULL) AND NOT (OLD."status" = 'IN_REVIEW' AND NEW."status" = 'APPROVED')) OR
  (OLD."status" = 'IN_REVIEW' AND NEW."status" = 'APPROVED' AND (NEW."approvedIntentHash" IS NULL OR NEW."approvedCoverageHash" IS NULL OR NEW."decisionSetHash" IS NULL))
BEGIN SELECT RAISE(ABORT, 'Scenario portfolio review transition is invalid or immutable'); END;

CREATE TRIGGER "QualityJourneyScenarioReviewComment_disposition_transition"
BEFORE UPDATE OF "disposition", "disposedAt", "disposedBy", "dispositionIdempotencyKey", "dispositionRequestHash", "createResponseJson", "dispositionResponseJson"
ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW WHEN
  NOT ((OLD."disposition" = 'OPEN' AND NEW."disposition" IN ('OPEN', 'DISPOSED')) OR (OLD."disposition" = 'DISPOSED' AND NEW."disposition" = 'DISPOSED')) OR
  (OLD."disposedAt" IS NOT NULL AND NEW."disposedAt" IS NOT OLD."disposedAt") OR
  (OLD."disposedBy" IS NOT NULL AND NEW."disposedBy" IS NOT OLD."disposedBy") OR
  (OLD."dispositionIdempotencyKey" IS NOT NULL AND NEW."dispositionIdempotencyKey" IS NOT OLD."dispositionIdempotencyKey") OR
  (OLD."dispositionRequestHash" IS NOT NULL AND NEW."dispositionRequestHash" IS NOT OLD."dispositionRequestHash") OR
  (OLD."createResponseJson" IS NOT NULL AND NEW."createResponseJson" IS NOT OLD."createResponseJson") OR
  (OLD."dispositionResponseJson" IS NOT NULL AND NEW."dispositionResponseJson" IS NOT OLD."dispositionResponseJson") OR
  (NEW."disposition" = 'OPEN' AND (NEW."disposedAt" IS NOT NULL OR NEW."disposedBy" IS NOT NULL OR NEW."dispositionIdempotencyKey" IS NOT NULL OR NEW."dispositionRequestHash" IS NOT NULL OR NEW."dispositionResponseJson" IS NOT NULL)) OR
  (NEW."disposition" = 'DISPOSED' AND (NEW."disposedAt" IS NULL OR NEW."disposedBy" IS NULL OR NEW."dispositionIdempotencyKey" IS NULL OR NEW."dispositionRequestHash" IS NULL))
BEGIN SELECT RAISE(ABORT, 'Scenario comment disposition is one-time and immutable'); END;

CREATE TRIGGER "QualityJourneyScenarioDecisionReceipt_immutable_update"
BEFORE UPDATE ON "QualityJourneyScenarioDecisionReceipt"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario decision receipts are immutable'); END;
CREATE TRIGGER "QualityJourneyScenarioDecisionReceipt_immutable_delete"
BEFORE DELETE ON "QualityJourneyScenarioDecisionReceipt"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario decision receipts are append-only'); END;
