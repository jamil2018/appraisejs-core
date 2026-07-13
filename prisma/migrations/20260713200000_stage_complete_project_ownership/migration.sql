-- Stage project ownership without destroying existing authored or runtime data.
-- The final constraint migration follows only after every service writes and validates scope.
PRAGMA foreign_keys=OFF;

INSERT OR IGNORE INTO "TargetProject" (
  "id", "canonicalPath", "displayName", "packageName", "packageManager", "packageJson", "fingerprint",
  "createdAt", "updatedAt", "lastDetectedAt"
)
SELECT
  '00000000-0000-4000-8000-000000000001',
  replace("file", '/prisma/dev.db', ''),
  'Legacy AppraiseJS',
  'appraisejs',
  NULL,
  NULL,
  'sha256:0000000000000000000000000000000000000000000000000000000000000001',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM pragma_database_list
WHERE "name" = 'main';

ALTER TABLE "TestSuite" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "TemplateStepGroup" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "StepBlock" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "TestCase" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "TemplateTestCase" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "Locator" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "LocatorGroup" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "Module" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "Environment" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "Tag" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "Report" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "TestCaseMetrics" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "TestSuiteMetrics" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;
ALTER TABLE "DashboardMetrics" ADD COLUMN "targetProjectId" TEXT REFERENCES "TargetProject"("id") ON DELETE RESTRICT;

UPDATE "TestSuite" SET "targetProjectId" = '00000000-0000-4000-8000-000000000001' WHERE "targetProjectId" IS NULL;
UPDATE "TemplateStepGroup" SET "targetProjectId" = '00000000-0000-4000-8000-000000000001' WHERE "targetProjectId" IS NULL;
UPDATE "StepBlock" SET "targetProjectId" = '00000000-0000-4000-8000-000000000001' WHERE "targetProjectId" IS NULL;
UPDATE "TestCase" SET "targetProjectId" = '00000000-0000-4000-8000-000000000001' WHERE "targetProjectId" IS NULL;
UPDATE "TemplateTestCase" SET "targetProjectId" = '00000000-0000-4000-8000-000000000001' WHERE "targetProjectId" IS NULL;
UPDATE "Locator" SET "targetProjectId" = '00000000-0000-4000-8000-000000000001' WHERE "targetProjectId" IS NULL;
UPDATE "LocatorGroup" SET "targetProjectId" = '00000000-0000-4000-8000-000000000001' WHERE "targetProjectId" IS NULL;
UPDATE "Module" SET "targetProjectId" = '00000000-0000-4000-8000-000000000001' WHERE "targetProjectId" IS NULL;
UPDATE "Environment" SET "targetProjectId" = '00000000-0000-4000-8000-000000000001' WHERE "targetProjectId" IS NULL;
UPDATE "Tag" SET "targetProjectId" = '00000000-0000-4000-8000-000000000001' WHERE "targetProjectId" IS NULL;
UPDATE "Report"
SET "targetProjectId" = COALESCE(
  (SELECT "TestRun"."targetProjectId" FROM "TestRun" WHERE "TestRun"."id" = "Report"."testRunId"),
  '00000000-0000-4000-8000-000000000001'
)
WHERE "targetProjectId" IS NULL;
UPDATE "TestCaseMetrics"
SET "targetProjectId" = COALESCE(
  (SELECT "TestCase"."targetProjectId" FROM "TestCase" WHERE "TestCase"."id" = "TestCaseMetrics"."testCaseId"),
  '00000000-0000-4000-8000-000000000001'
)
WHERE "targetProjectId" IS NULL;
UPDATE "TestSuiteMetrics"
SET "targetProjectId" = COALESCE(
  (SELECT "TestSuite"."targetProjectId" FROM "TestSuite" WHERE "TestSuite"."id" = "TestSuiteMetrics"."testSuiteId"),
  '00000000-0000-4000-8000-000000000001'
)
WHERE "targetProjectId" IS NULL;
UPDATE "DashboardMetrics" SET "targetProjectId" = '00000000-0000-4000-8000-000000000001' WHERE "targetProjectId" IS NULL;

CREATE INDEX "TestSuite_targetProjectId_idx" ON "TestSuite"("targetProjectId");
CREATE INDEX "TestCase_targetProjectId_idx" ON "TestCase"("targetProjectId");
CREATE INDEX "Locator_targetProjectId_idx" ON "Locator"("targetProjectId");
CREATE INDEX "Module_targetProjectId_idx" ON "Module"("targetProjectId");
CREATE INDEX "Report_targetProjectId_idx" ON "Report"("targetProjectId");
CREATE UNIQUE INDEX "TemplateStepGroup_targetProjectId_name_key" ON "TemplateStepGroup"("targetProjectId", "name");
CREATE UNIQUE INDEX "StepBlock_targetProjectId_name_key" ON "StepBlock"("targetProjectId", "name");
CREATE UNIQUE INDEX "TemplateTestCase_targetProjectId_name_key" ON "TemplateTestCase"("targetProjectId", "name");
CREATE UNIQUE INDEX "LocatorGroup_targetProjectId_name_key" ON "LocatorGroup"("targetProjectId", "name");
CREATE UNIQUE INDEX "Environment_targetProjectId_name_key" ON "Environment"("targetProjectId", "name");
CREATE UNIQUE INDEX "Tag_targetProjectId_name_type_key" ON "Tag"("targetProjectId", "name", "type");
CREATE UNIQUE INDEX "DashboardMetrics_targetProjectId_key" ON "DashboardMetrics"("targetProjectId");

PRAGMA foreign_keys=ON;
