ALTER TABLE "TestCaseStep" ADD COLUMN "flowNodeId" TEXT;
UPDATE "TestCaseStep" SET "flowNodeId" = "id" WHERE "flowNodeId" IS NULL;
ALTER TABLE "TemplateTestCaseStep" ADD COLUMN "flowNodeId" TEXT;
UPDATE "TemplateTestCaseStep" SET "flowNodeId" = "id" WHERE "flowNodeId" IS NULL;

CREATE TABLE "TestCaseFlowBlock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "testCaseId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  CONSTRAINT "TestCaseFlowBlock_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TestCaseFlowBlockNode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "flowNodeId" TEXT NOT NULL,
  "flowBlockId" TEXT NOT NULL,
  CONSTRAINT "TestCaseFlowBlockNode_flowBlockId_fkey" FOREIGN KEY ("flowBlockId") REFERENCES "TestCaseFlowBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TemplateTestCaseFlowBlock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "templateTestCaseId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  CONSTRAINT "TemplateTestCaseFlowBlock_templateTestCaseId_fkey" FOREIGN KEY ("templateTestCaseId") REFERENCES "TemplateTestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TemplateTestCaseFlowBlockNode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "flowNodeId" TEXT NOT NULL,
  "flowBlockId" TEXT NOT NULL,
  CONSTRAINT "TemplateTestCaseFlowBlockNode_flowBlockId_fkey" FOREIGN KEY ("flowBlockId") REFERENCES "TemplateTestCaseFlowBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
