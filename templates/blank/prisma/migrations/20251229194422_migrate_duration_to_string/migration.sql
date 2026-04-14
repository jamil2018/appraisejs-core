-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReportHook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportScenarioId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "errorMessage" TEXT,
    "errorTrace" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportHook_reportScenarioId_fkey" FOREIGN KEY ("reportScenarioId") REFERENCES "ReportScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReportHook" ("createdAt", "duration", "errorMessage", "errorTrace", "hidden", "id", "keyword", "reportScenarioId", "status", "updatedAt") SELECT "createdAt", CAST("duration" AS TEXT), "errorMessage", "errorTrace", "hidden", "id", "keyword", "reportScenarioId", "status", "updatedAt" FROM "ReportHook";
DROP TABLE "ReportHook";
ALTER TABLE "new_ReportHook" RENAME TO "ReportHook";
CREATE TABLE "new_ReportStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportScenarioId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "line" INTEGER,
    "name" TEXT NOT NULL,
    "matchLocation" TEXT,
    "status" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "errorMessage" TEXT,
    "errorTrace" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportStep_reportScenarioId_fkey" FOREIGN KEY ("reportScenarioId") REFERENCES "ReportScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReportStep" ("createdAt", "duration", "errorMessage", "errorTrace", "hidden", "id", "keyword", "line", "matchLocation", "name", "order", "reportScenarioId", "status", "updatedAt") SELECT "createdAt", CAST("duration" AS TEXT), "errorMessage", "errorTrace", "hidden", "id", "keyword", "line", "matchLocation", "name", "order", "reportScenarioId", "status", "updatedAt" FROM "ReportStep";
DROP TABLE "ReportStep";
ALTER TABLE "new_ReportStep" RENAME TO "ReportStep";
CREATE TABLE "new_ReportTestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "testRunTestCaseId" TEXT NOT NULL,
    "reportScenarioId" TEXT,
    "duration" TEXT NOT NULL,
    CONSTRAINT "ReportTestCase_testRunTestCaseId_fkey" FOREIGN KEY ("testRunTestCaseId") REFERENCES "TestRunTestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportTestCase_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportTestCase_reportScenarioId_fkey" FOREIGN KEY ("reportScenarioId") REFERENCES "ReportScenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReportTestCase" ("duration", "id", "reportId", "reportScenarioId", "testCaseId", "testRunTestCaseId") SELECT CAST("duration" AS TEXT), "id", "reportId", "reportScenarioId", "testCaseId", "testRunTestCaseId" FROM "ReportTestCase";
DROP TABLE "ReportTestCase";
ALTER TABLE "new_ReportTestCase" RENAME TO "ReportTestCase";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
