DROP INDEX IF EXISTS "TestRun_preparationKey_key";
CREATE UNIQUE INDEX "TestRun_targetProjectId_preparationKey_key" ON "TestRun"("targetProjectId", "preparationKey");
