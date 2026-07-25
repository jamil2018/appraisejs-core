-- V2 managed validation projections persist an exact Step Invocation instead
-- of selecting or creating a TemplateStep. Existing authored rows retain their
-- required legacy reference and remain readable unchanged.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestCaseStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flowNodeId" TEXT,
    "testCaseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "gherkinStep" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "templateStepId" TEXT,
    "operationInvocationJson" TEXT,
    CONSTRAINT "TestCaseStep_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "TemplateStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestCaseStep_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestCaseStep" ("flowNodeId", "gherkinStep", "icon", "id", "label", "operationInvocationJson", "order", "templateStepId", "testCaseId")
SELECT "flowNodeId", "gherkinStep", "icon", "id", "label", "operationInvocationJson", "order", "templateStepId", "testCaseId" FROM "TestCaseStep";
DROP TABLE "TestCaseStep";
ALTER TABLE "new_TestCaseStep" RENAME TO "TestCaseStep";
PRAGMA foreign_keys=ON;
