PRAGMA foreign_keys=OFF;
DROP TRIGGER "QualityJourneyAutomationMaterialization_immutable_update";
DROP TRIGGER "QualityJourneyAutomationMaterialization_immutable_delete";
CREATE TABLE "new_QualityJourneyAutomationMaterialization" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "scenarioRevisionId" TEXT NOT NULL,
  "scenarioContentHash" TEXT NOT NULL,
  "portfolioRevisionId" TEXT NOT NULL,
  "portfolioRecordId" TEXT NOT NULL,
  "portfolioContentHash" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "decisionHash" TEXT NOT NULL,
  "workItemId" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "leaseId" TEXT NOT NULL,
  "ownerTokenHash" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "materializationHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'MATERIALIZED',
  "failureKind" TEXT,
  "failureJson" TEXT,
  "suiteId" TEXT,
  "testCaseId" TEXT,
  "artifactRecordId" TEXT NOT NULL,
  "artifactJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyAutomationMaterialization_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAutomationMaterialization_scenarioRevisionId_fkey" FOREIGN KEY ("scenarioRevisionId") REFERENCES "QualityJourneyScenarioRevision" ("scenarioRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAutomationMaterialization_portfolioRecordId_fkey" FOREIGN KEY ("portfolioRecordId") REFERENCES "QualityJourneyScenarioPortfolioRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAutomationMaterialization_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "QualityJourneyScenarioDecision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAutomationMaterialization_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAutomationMaterialization_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAutomationMaterialization_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_QualityJourneyAutomationMaterialization" ("id", "journeyId", "targetProjectId", "cycleId", "scenarioRevisionId", "scenarioContentHash", "portfolioRevisionId", "portfolioRecordId", "portfolioContentHash", "decisionId", "decisionHash", "workItemId", "attemptId", "leaseId", "ownerTokenHash", "inputHash", "idempotencyKey", "requestHash", "materializationHash", "status", "failureKind", "failureJson", "suiteId", "testCaseId", "artifactRecordId", "artifactJson", "createdAt")
SELECT materialization."id", materialization."journeyId", materialization."targetProjectId", materialization."cycleId", materialization."scenarioRevisionId", materialization."scenarioContentHash", materialization."portfolioRevisionId", scenario."portfolioRevisionId", materialization."portfolioContentHash", materialization."decisionId", materialization."decisionHash", materialization."workItemId", materialization."attemptId", materialization."leaseId", materialization."ownerTokenHash", materialization."inputHash", materialization."idempotencyKey", materialization."requestHash", materialization."materializationHash", materialization."status", materialization."failureKind", materialization."failureJson", materialization."suiteId", materialization."testCaseId", materialization."artifactRecordId", materialization."artifactJson", materialization."createdAt"
FROM "QualityJourneyAutomationMaterialization" AS materialization
JOIN "QualityJourneyScenarioRevision" AS scenario ON scenario."scenarioRevisionId" = materialization."scenarioRevisionId";
DROP TABLE "QualityJourneyAutomationMaterialization";
ALTER TABLE "new_QualityJourneyAutomationMaterialization" RENAME TO "QualityJourneyAutomationMaterialization";
CREATE UNIQUE INDEX "QualityJourneyAutomationMaterialization_artifactRecordId_key" ON "QualityJourneyAutomationMaterialization"("artifactRecordId");
CREATE UNIQUE INDEX "QualityJourneyAutomationMaterialization_journeyId_idempotencyKey_key" ON "QualityJourneyAutomationMaterialization"("journeyId", "idempotencyKey");
CREATE UNIQUE INDEX "QualityJourneyAutomationMaterialization_journeyId_scenarioRevisionId_inputHash_status_failureKind_idempotencyKey_key" ON "QualityJourneyAutomationMaterialization"("journeyId", "scenarioRevisionId", "inputHash", "status", "failureKind", "idempotencyKey");
CREATE INDEX "QualityJourneyAutomationMaterialization_workItemId_attemptId_idx" ON "QualityJourneyAutomationMaterialization"("workItemId", "attemptId");
CREATE INDEX "QualityJourneyAutomationMaterialization_targetProjectId_cycleId_idx" ON "QualityJourneyAutomationMaterialization"("targetProjectId", "cycleId");
CREATE INDEX "QualityJourneyAutomationMaterialization_portfolioRecordId_idx" ON "QualityJourneyAutomationMaterialization"("portfolioRecordId");
CREATE TRIGGER "QualityJourneyAutomationMaterialization_immutable_update" BEFORE UPDATE ON "QualityJourneyAutomationMaterialization" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator materializations are immutable'); END;
CREATE TRIGGER "QualityJourneyAutomationMaterialization_immutable_delete" BEFORE DELETE ON "QualityJourneyAutomationMaterialization" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator materializations are append-only'); END;
PRAGMA foreign_keys=ON;
