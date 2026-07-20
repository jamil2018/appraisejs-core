-- Additive compatibility fields for the unified operation migration.
-- Legacy readers continue using TemplateStep relations until canonical single-write is certified.
ALTER TABLE "TemplateStep" ADD COLUMN "operationId" TEXT;
ALTER TABLE "TemplateStep" ADD COLUMN "operationVersion" TEXT;
ALTER TABLE "TemplateStep" ADD COLUMN "operationDescriptorHash" TEXT;
ALTER TABLE "TemplateStep" ADD COLUMN "humanProjectionId" TEXT;
ALTER TABLE "TemplateStep" ADD COLUMN "operationMigrationState" TEXT;

ALTER TABLE "TestCaseStep" ADD COLUMN "operationInvocationJson" TEXT;
ALTER TABLE "TemplateTestCaseStep" ADD COLUMN "operationInvocationJson" TEXT;
ALTER TABLE "StepBlockStep" ADD COLUMN "operationInvocationJson" TEXT;
ALTER TABLE "StepBlockStep" ADD COLUMN "compositionVersionHash" TEXT;

CREATE INDEX "TemplateStep_operationId_operationVersion_idx" ON "TemplateStep"("operationId", "operationVersion");
