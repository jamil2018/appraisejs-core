ALTER TABLE "QualityJourneyScenarioPortfolioRevision" ADD COLUMN "coverageRationale" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QualityJourneyScenarioPortfolioRevision" ADD COLUMN "graphJson" TEXT NOT NULL DEFAULT '{"edges":[],"sharedSetup":[]}';

CREATE TRIGGER "QualityJourneyScenarioDecision_portfolio_membership_insert"
BEFORE INSERT ON "QualityJourneyScenarioDecision"
FOR EACH ROW WHEN NOT EXISTS (
  SELECT 1 FROM "QualityJourneyScenarioRevision"
  WHERE "portfolioRevisionId" = NEW."portfolioRevisionId" AND "scenarioRevisionId" = NEW."scenarioRevisionId"
)
BEGIN SELECT RAISE(ABORT, 'Scenario decision must reference a scenario in its portfolio'); END;

CREATE TRIGGER "QualityJourneyScenarioReviewComment_portfolio_membership_insert"
BEFORE INSERT ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW WHEN NEW."scenarioRevisionId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "QualityJourneyScenarioRevision"
  WHERE "portfolioRevisionId" = NEW."portfolioRevisionId" AND "scenarioRevisionId" = NEW."scenarioRevisionId"
)
BEGIN SELECT RAISE(ABORT, 'Scenario comment must reference a scenario in its portfolio'); END;

CREATE TRIGGER "QualityJourneyScenarioReviewComment_portfolio_membership_update"
BEFORE UPDATE OF "portfolioRevisionId", "scenarioRevisionId" ON "QualityJourneyScenarioReviewComment"
FOR EACH ROW WHEN NEW."scenarioRevisionId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "QualityJourneyScenarioRevision"
  WHERE "portfolioRevisionId" = NEW."portfolioRevisionId" AND "scenarioRevisionId" = NEW."scenarioRevisionId"
)
BEGIN SELECT RAISE(ABORT, 'Scenario comment must reference a scenario in its portfolio'); END;

CREATE TRIGGER "QualityJourneyScenarioRevision_immutable_update"
BEFORE UPDATE ON "QualityJourneyScenarioRevision"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario revisions are immutable'); END;
CREATE TRIGGER "QualityJourneyScenarioRevision_immutable_delete"
BEFORE DELETE ON "QualityJourneyScenarioRevision"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario revisions are immutable'); END;
CREATE TRIGGER "QualityJourneyScenarioDecision_immutable_update"
BEFORE UPDATE ON "QualityJourneyScenarioDecision"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario decisions are immutable'); END;
CREATE TRIGGER "QualityJourneyScenarioDecision_immutable_delete"
BEFORE DELETE ON "QualityJourneyScenarioDecision"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Scenario decisions are immutable'); END;
