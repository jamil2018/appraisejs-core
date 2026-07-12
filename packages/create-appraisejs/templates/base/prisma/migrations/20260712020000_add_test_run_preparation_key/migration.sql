DROP INDEX IF EXISTS "TestRun_name_key";
ALTER TABLE "TestRun" ADD COLUMN "preparationKey" TEXT;
CREATE UNIQUE INDEX "TestRun_preparationKey_key" ON "TestRun"("preparationKey");
