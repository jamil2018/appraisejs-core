ALTER TABLE "QualityJourneyAutomationTargetBinding" ADD COLUMN "resourceHashJson" TEXT NOT NULL DEFAULT '[]';
CREATE TABLE "new_QualityJourneyAutomationMaterializationBinding" (
  "materializationId" TEXT NOT NULL PRIMARY KEY,
  "bindingId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyAutomationMaterializationBinding_materializationId_fkey" FOREIGN KEY ("materializationId") REFERENCES "QualityJourneyAutomationMaterialization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAutomationMaterializationBinding_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "QualityJourneyAutomationTargetBinding" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_QualityJourneyAutomationMaterializationBinding" ("materializationId", "bindingId", "createdAt")
SELECT "materializationId", "targetBindingId", "createdAt" FROM "QualityJourneyAutomationMaterializationBinding";
DROP TABLE "QualityJourneyAutomationMaterializationBinding";
ALTER TABLE "new_QualityJourneyAutomationMaterializationBinding" RENAME TO "QualityJourneyAutomationMaterializationBinding";
CREATE INDEX "QualityJourneyAutomationMaterializationBinding_bindingId_idx" ON "QualityJourneyAutomationMaterializationBinding"("bindingId");
CREATE TRIGGER "QualityJourneyAutomationMaterializationBinding_immutable_update" BEFORE UPDATE ON "QualityJourneyAutomationMaterializationBinding" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator materialization bindings are immutable'); END;
CREATE TRIGGER "QualityJourneyAutomationMaterializationBinding_immutable_delete" BEFORE DELETE ON "QualityJourneyAutomationMaterializationBinding" FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'Automator materialization bindings are append-only'); END;
CREATE TABLE "QualityJourneyAutomationRequestReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "workItemId" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "ownerTokenHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "resultJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "QualityJourneyAutomationRequestReceipt_journeyId_idempotencyKey_key" ON "QualityJourneyAutomationRequestReceipt"("journeyId", "idempotencyKey");
CREATE INDEX "QualityJourneyAutomationRequestReceipt_attemptId_idx" ON "QualityJourneyAutomationRequestReceipt"("attemptId");
