-- AlterTable
ALTER TABLE "Report" ADD COLUMN "reportPath" TEXT;

-- AlterTable
ALTER TABLE "TestRun" ADD COLUMN "reportPath" TEXT;

-- CreateTable
CREATE TABLE "ReportFeature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "uri" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportFeature_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportFeatureTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportFeatureId" TEXT NOT NULL,
    "tagName" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportFeatureTag_reportFeatureId_fkey" FOREIGN KEY ("reportFeatureId") REFERENCES "ReportFeature" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportFeatureId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "line" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cucumberId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportScenario_reportFeatureId_fkey" FOREIGN KEY ("reportFeatureId") REFERENCES "ReportFeature" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportScenarioTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportScenarioId" TEXT NOT NULL,
    "tagName" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportScenarioTag_reportScenarioId_fkey" FOREIGN KEY ("reportScenarioId") REFERENCES "ReportScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportScenarioId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "line" INTEGER,
    "name" TEXT NOT NULL,
    "matchLocation" TEXT,
    "status" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "errorTrace" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportStep_reportScenarioId_fkey" FOREIGN KEY ("reportScenarioId") REFERENCES "ReportScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportHook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportScenarioId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "errorTrace" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportHook_reportScenarioId_fkey" FOREIGN KEY ("reportScenarioId") REFERENCES "ReportScenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReportTestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "testRunTestCaseId" TEXT NOT NULL,
    "reportScenarioId" TEXT,
    "duration" INTEGER NOT NULL,
    CONSTRAINT "ReportTestCase_testRunTestCaseId_fkey" FOREIGN KEY ("testRunTestCaseId") REFERENCES "TestRunTestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportTestCase_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportTestCase_reportScenarioId_fkey" FOREIGN KEY ("reportScenarioId") REFERENCES "ReportScenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReportTestCase" ("duration", "id", "reportId", "testCaseId", "testRunTestCaseId") SELECT "duration", "id", "reportId", "testCaseId", "testRunTestCaseId" FROM "ReportTestCase";
DROP TABLE "ReportTestCase";
ALTER TABLE "new_ReportTestCase" RENAME TO "ReportTestCase";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
