-- The unified Step Definition architecture deliberately has no compatibility
-- window.  Development-only TemplateStep rows and authored rows that reference
-- them are discarded rather than translated through a second identity.
PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "StepBlockStep";
DROP TABLE IF EXISTS "TemplateTestCaseStepParameter";
DROP TABLE IF EXISTS "TestCaseStepParameter";
DROP TABLE IF EXISTS "TemplateTestCaseStep";
DROP TABLE IF EXISTS "TestCaseStep";
DROP TABLE IF EXISTS "TemplateStepParameter";
DROP TABLE IF EXISTS "TemplateStep";
DROP TABLE IF EXISTS "TemplateStepGroup";
DROP TABLE IF EXISTS "StepBlockMigrationLedger";

CREATE TABLE "StepBlockStep" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stepBlockId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "invocationJson" TEXT NOT NULL,
  "parameterMap" TEXT NOT NULL DEFAULT '{}',
  "compositionVersionHash" TEXT,
  CONSTRAINT "StepBlockStep_stepBlockId_fkey" FOREIGN KEY ("stepBlockId") REFERENCES "StepBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StepBlockStep_stepBlockId_order_key" ON "StepBlockStep"("stepBlockId", "order");

CREATE TABLE "TestCaseStep" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "flowNodeId" TEXT,
  "testCaseId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "gherkinStep" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "invocationJson" TEXT NOT NULL,
  CONSTRAINT "TestCaseStep_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "TemplateTestCaseStep" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "flowNodeId" TEXT,
  "order" INTEGER NOT NULL,
  "gherkinStep" TEXT NOT NULL,
  "icon" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "templateTestCaseId" TEXT NOT NULL,
  "invocationJson" TEXT NOT NULL,
  CONSTRAINT "TemplateTestCaseStep_templateTestCaseId_fkey" FOREIGN KEY ("templateTestCaseId") REFERENCES "TemplateTestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "TestCaseStepParameter" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "testCaseStepId" TEXT NOT NULL,
  "locatorId" TEXT,
  "type" TEXT NOT NULL,
  CONSTRAINT "TestCaseStepParameter_locatorId_fkey" FOREIGN KEY ("locatorId") REFERENCES "Locator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TestCaseStepParameter_testCaseStepId_fkey" FOREIGN KEY ("testCaseStepId") REFERENCES "TestCaseStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TemplateTestCaseStepParameter" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "defaultValue" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "testCaseStepId" TEXT NOT NULL,
  "locatorId" TEXT,
  "type" TEXT NOT NULL,
  "defaultLocatorId" TEXT,
  CONSTRAINT "TemplateTestCaseStepParameter_defaultLocatorId_fkey" FOREIGN KEY ("defaultLocatorId") REFERENCES "Locator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TemplateTestCaseStepParameter_testCaseStepId_fkey" FOREIGN KEY ("testCaseStepId") REFERENCES "TemplateTestCaseStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

PRAGMA foreign_keys=ON;
