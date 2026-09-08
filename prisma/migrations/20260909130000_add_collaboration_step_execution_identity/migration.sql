-- Every external collaboration step records its exact request/fence/intent
-- identity before the effect begins. These fields are additive so legacy
-- rows remain deliberately unrecoverable rather than inferred from logs.
ALTER TABLE "CollaborationOperation" ADD COLUMN "executorEpoch" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CollaborationOperationStep" ADD COLUMN "requestVersion" INTEGER;
ALTER TABLE "CollaborationOperationStep" ADD COLUMN "intentJson" TEXT;
ALTER TABLE "CollaborationOperationStep" ADD COLUMN "intentHash" TEXT;
ALTER TABLE "CollaborationOperationStep" ADD COLUMN "executorEpoch" INTEGER;
ALTER TABLE "CollaborationOperationStep" ADD COLUMN "completedVersion" INTEGER;

CREATE INDEX "CollaborationOperationStep_operationId_requestVersion_idx"
  ON "CollaborationOperationStep"("operationId", "requestVersion");
