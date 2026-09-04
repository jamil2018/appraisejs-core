-- A semantic target binding is canonical target evidence, not a receipt-owned
-- row. Preserve prior evidence while allowing several materializations to
-- associate with the same binding.
ALTER TABLE "QualityJourneyAutomationMaterialization" ADD COLUMN "ownerTokenHash" TEXT NOT NULL DEFAULT '';

DROP TRIGGER "QualityJourneyAutomationTargetBinding_immutable_update";
DROP TRIGGER "QualityJourneyAutomationTargetBinding_immutable_delete";
PRAGMA foreign_keys=OFF;
CREATE TEMP TABLE "old_QualityJourneyAutomationTargetBinding_map" AS
SELECT "materializationId", "id" AS "targetBindingId" FROM "QualityJourneyAutomationTargetBinding";
CREATE TABLE "new_QualityJourneyAutomationTargetBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "semanticHash" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "suiteHash" TEXT NOT NULL,
    "testCaseHash" TEXT NOT NULL,
    "stepHash" TEXT NOT NULL,
    "bindingJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAutomationTargetBinding_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationTargetBinding_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_QualityJourneyAutomationTargetBinding" ("id", "journeyId", "targetProjectId", "semanticHash", "suiteId", "testCaseId", "suiteHash", "testCaseHash", "stepHash", "bindingJson", "createdAt")
SELECT "id", "journeyId", "targetProjectId", "semanticHash", "suiteId", "testCaseId", "suiteHash", "testCaseHash", "stepHash", "bindingJson", "createdAt"
FROM "QualityJourneyAutomationTargetBinding";
DROP TABLE "QualityJourneyAutomationTargetBinding";
ALTER TABLE "new_QualityJourneyAutomationTargetBinding" RENAME TO "QualityJourneyAutomationTargetBinding";
CREATE UNIQUE INDEX "QualityJourneyAutomationTargetBinding_targetProjectId_semanticHash_key" ON "QualityJourneyAutomationTargetBinding"("targetProjectId", "semanticHash");
CREATE INDEX "QualityJourneyAutomationTargetBinding_journeyId_targetProjectId_idx" ON "QualityJourneyAutomationTargetBinding"("journeyId", "targetProjectId");
CREATE TRIGGER "QualityJourneyAutomationTargetBinding_immutable_update"
BEFORE UPDATE ON "QualityJourneyAutomationTargetBinding"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator target bindings are immutable'); END;
CREATE TRIGGER "QualityJourneyAutomationTargetBinding_immutable_delete"
BEFORE DELETE ON "QualityJourneyAutomationTargetBinding"
FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator target bindings are append-only'); END;
CREATE TABLE "QualityJourneyAutomationMaterializationBinding" (
    "materializationId" TEXT NOT NULL,
    "targetBindingId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyAutomationMaterializationBinding_materializationId_fkey" FOREIGN KEY ("materializationId") REFERENCES "QualityJourneyAutomationMaterialization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyAutomationMaterializationBinding_targetBindingId_fkey" FOREIGN KEY ("targetBindingId") REFERENCES "QualityJourneyAutomationTargetBinding" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("materializationId", "targetBindingId")
);
CREATE INDEX "QualityJourneyAutomationMaterializationBinding_targetBindingId_idx" ON "QualityJourneyAutomationMaterializationBinding"("targetBindingId");
INSERT INTO "QualityJourneyAutomationMaterializationBinding" ("materializationId", "targetBindingId")
SELECT "materializationId", "targetBindingId" FROM "old_QualityJourneyAutomationTargetBinding_map";
DROP TABLE "old_QualityJourneyAutomationTargetBinding_map";
PRAGMA foreign_keys=ON;
