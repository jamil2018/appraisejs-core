-- Composition authoring existed only on this unreleased migration branch and
-- persisted children without exact executable-reference hashes. Those rows
-- cannot be upgraded faithfully in SQL, so discard them before enabling the
-- exact-reference contract. The user explicitly authorized dropping legacy
-- step artifacts rather than preserving ambiguous execution authority.
DELETE FROM "StepDefinitionDraftArtifact"
WHERE "draftId" IN (
    SELECT "id" FROM "StepDefinitionDraft"
    WHERE "draftJson" LIKE '%"kind":"composition"%'
      AND "draftJson" NOT LIKE '%"definitionHash"%'
);

DELETE FROM "StepDefinitionDraft"
WHERE "draftJson" LIKE '%"kind":"composition"%'
  AND "draftJson" NOT LIKE '%"definitionHash"%';

CREATE TEMP TABLE "_LegacyCompositionDefinition" AS
SELECT "stepId", "stepVersion"
FROM "StepExecutionBinding"
WHERE "kind" = 'composition';

DELETE FROM "StepDefinitionDeprecation"
WHERE ("stepId", "stepVersion") IN (SELECT "stepId", "stepVersion" FROM "_LegacyCompositionDefinition");
DELETE FROM "StepCompatibilityReference"
WHERE ("stepId", "stepVersion") IN (SELECT "stepId", "stepVersion" FROM "_LegacyCompositionDefinition");
DELETE FROM "StepPublicationReceipt"
WHERE ("stepId", "stepVersion") IN (SELECT "stepId", "stepVersion" FROM "_LegacyCompositionDefinition");
DELETE FROM "StepExecutionBinding"
WHERE ("stepId", "stepVersion") IN (SELECT "stepId", "stepVersion" FROM "_LegacyCompositionDefinition");
DELETE FROM "StepHumanProjection"
WHERE ("stepId", "stepVersion") IN (SELECT "stepId", "stepVersion" FROM "_LegacyCompositionDefinition");
DELETE FROM "StepDefinition"
WHERE ("id", "version") IN (SELECT "stepId", "stepVersion" FROM "_LegacyCompositionDefinition");

DROP TABLE "_LegacyCompositionDefinition";

CREATE TABLE "StepBlockMigrationLedger" (
    "sourceStepBlockId" TEXT NOT NULL PRIMARY KEY,
    "initialSourceHash" TEXT NOT NULL,
    "initialSnapshotJson" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "draftSourceHash" TEXT,
    "snapshotJson" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "diagnosticsJson" TEXT NOT NULL,
    "proposedStepId" TEXT,
    "proposedVersion" TEXT,
    "converterVersion" TEXT NOT NULL,
    "draftId" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastAppliedAt" DATETIME,
    CONSTRAINT "StepBlockMigrationLedger_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "StepDefinitionDraft" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StepBlockMigrationLedger_draftId_key" ON "StepBlockMigrationLedger"("draftId");
CREATE INDEX "StepBlockMigrationLedger_classification_status_idx" ON "StepBlockMigrationLedger"("classification", "status");
