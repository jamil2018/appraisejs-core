-- Phase 6 preparation authority is deliberately independent from RuntimeCapsule
-- and TestRun. Managed execution adds those bindings in Phase 7.
CREATE TABLE "QualityJourneyAutomationMaterialization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "scenarioRevisionId" TEXT NOT NULL,
    "scenarioContentHash" TEXT NOT NULL,
    "portfolioRevisionId" TEXT NOT NULL,
    "portfolioContentHash" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "decisionHash" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
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
    CONSTRAINT "QualityJourneyAutomationMaterialization_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QualityJourneyAutomationMaterialization_artifactRecordId_key" ON "QualityJourneyAutomationMaterialization"("artifactRecordId");
CREATE UNIQUE INDEX "QualityJourneyAutomationMaterialization_journeyId_idempotencyKey_key" ON "QualityJourneyAutomationMaterialization"("journeyId", "idempotencyKey");
CREATE UNIQUE INDEX "QualityJourneyAutomationMaterialization_journeyId_scenarioRevisionId_inputHash_status_failureKind_idempotencyKey_key" ON "QualityJourneyAutomationMaterialization"("journeyId", "scenarioRevisionId", "inputHash", "status", "failureKind", "idempotencyKey");
CREATE INDEX "QualityJourneyAutomationMaterialization_workItemId_attemptId_idx" ON "QualityJourneyAutomationMaterialization"("workItemId", "attemptId");
CREATE INDEX "QualityJourneyAutomationMaterialization_targetProjectId_cycleId_idx" ON "QualityJourneyAutomationMaterialization"("targetProjectId", "cycleId");

CREATE TABLE "QualityJourneyPreparedRuntimeCapsule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "materializationId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "capsuleHash" TEXT NOT NULL,
    "manifestJson" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyPreparedRuntimeCapsule_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyPreparedRuntimeCapsule_materializationId_fkey" FOREIGN KEY ("materializationId") REFERENCES "QualityJourneyAutomationMaterialization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QualityJourneyPreparedRuntimeCapsule_materializationId_key" ON "QualityJourneyPreparedRuntimeCapsule"("materializationId");
CREATE UNIQUE INDEX "QualityJourneyPreparedRuntimeCapsule_journeyId_materializationId_key" ON "QualityJourneyPreparedRuntimeCapsule"("journeyId", "materializationId");
CREATE INDEX "QualityJourneyPreparedRuntimeCapsule_targetProjectId_cycleId_idx" ON "QualityJourneyPreparedRuntimeCapsule"("targetProjectId", "cycleId");

CREATE TABLE "QualityJourneyAutomationTargetBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "materializationId" TEXT NOT NULL,
    "semanticHash" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "suiteHash" TEXT NOT NULL,
    "testCaseHash" TEXT NOT NULL,
    "stepHash" TEXT NOT NULL,
    "bindingJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAutomationTargetBinding_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationTargetBinding_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationTargetBinding_materializationId_fkey" FOREIGN KEY ("materializationId") REFERENCES "QualityJourneyAutomationMaterialization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QualityJourneyAutomationTargetBinding_materializationId_key" ON "QualityJourneyAutomationTargetBinding"("materializationId");
CREATE UNIQUE INDEX "QualityJourneyAutomationTargetBinding_targetProjectId_semanticHash_key" ON "QualityJourneyAutomationTargetBinding"("targetProjectId", "semanticHash");
CREATE INDEX "QualityJourneyAutomationTargetBinding_journeyId_targetProjectId_idx" ON "QualityJourneyAutomationTargetBinding"("journeyId", "targetProjectId");

CREATE TRIGGER "QualityJourneyAutomationMaterialization_immutable_update"
BEFORE UPDATE ON "QualityJourneyAutomationMaterialization"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator materializations are immutable'); END;
CREATE TRIGGER "QualityJourneyAutomationMaterialization_immutable_delete"
BEFORE DELETE ON "QualityJourneyAutomationMaterialization"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator materializations are append-only'); END;
CREATE TRIGGER "QualityJourneyPreparedRuntimeCapsule_immutable_update"
BEFORE UPDATE ON "QualityJourneyPreparedRuntimeCapsule"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Prepared runtime capsules are immutable'); END;
CREATE TRIGGER "QualityJourneyPreparedRuntimeCapsule_immutable_delete"
BEFORE DELETE ON "QualityJourneyPreparedRuntimeCapsule"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Prepared runtime capsules are append-only'); END;
CREATE TRIGGER "QualityJourneyAutomationTargetBinding_immutable_update"
BEFORE UPDATE ON "QualityJourneyAutomationTargetBinding"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator target bindings are immutable'); END;
CREATE TRIGGER "QualityJourneyAutomationTargetBinding_immutable_delete"
BEFORE DELETE ON "QualityJourneyAutomationTargetBinding"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator target bindings are append-only'); END;
