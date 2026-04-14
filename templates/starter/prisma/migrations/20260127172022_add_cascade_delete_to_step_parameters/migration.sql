-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TemplateTestCaseStepParameter" (
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
INSERT INTO "new_TemplateTestCaseStepParameter" ("defaultLocatorId", "defaultValue", "id", "locatorId", "name", "order", "testCaseStepId", "type") SELECT "defaultLocatorId", "defaultValue", "id", "locatorId", "name", "order", "testCaseStepId", "type" FROM "TemplateTestCaseStepParameter";
DROP TABLE "TemplateTestCaseStepParameter";
ALTER TABLE "new_TemplateTestCaseStepParameter" RENAME TO "TemplateTestCaseStepParameter";
CREATE TABLE "new_TestCaseStepParameter" (
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
INSERT INTO "new_TestCaseStepParameter" ("id", "locatorId", "name", "order", "testCaseStepId", "type", "value") SELECT "id", "locatorId", "name", "order", "testCaseStepId", "type", "value" FROM "TestCaseStepParameter";
DROP TABLE "TestCaseStepParameter";
ALTER TABLE "new_TestCaseStepParameter" RENAME TO "TestCaseStepParameter";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
