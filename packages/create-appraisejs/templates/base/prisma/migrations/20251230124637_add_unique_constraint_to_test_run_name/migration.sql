-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "updatedAt" DATETIME NOT NULL,
    "environmentId" TEXT NOT NULL,
    "testWorkersCount" INTEGER DEFAULT 1,
    "browserEngine" TEXT NOT NULL DEFAULT 'CHROMIUM',
    "logPath" TEXT,
    "reportPath" TEXT,
    CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestRun" ("browserEngine", "completedAt", "environmentId", "id", "logPath", "name", "reportPath", "result", "runId", "startedAt", "status", "testWorkersCount", "updatedAt") SELECT "browserEngine", "completedAt", "environmentId", "id", "logPath", "name", "reportPath", "result", "runId", "startedAt", "status", "testWorkersCount", "updatedAt" FROM "TestRun";
DROP TABLE "TestRun";
ALTER TABLE "new_TestRun" RENAME TO "TestRun";
CREATE UNIQUE INDEX "TestRun_name_key" ON "TestRun"("name");
CREATE UNIQUE INDEX "TestRun_runId_key" ON "TestRun"("runId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

