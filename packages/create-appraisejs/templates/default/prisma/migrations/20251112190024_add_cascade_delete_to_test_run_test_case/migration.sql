-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestRunTestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testRunId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT NOT NULL DEFAULT 'UNTESTED',
    CONSTRAINT "TestRunTestCase_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestRunTestCase_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestRunTestCase" ("id", "result", "status", "testCaseId", "testRunId") SELECT "id", "result", "status", "testCaseId", "testRunId" FROM "TestRunTestCase";
DROP TABLE "TestRunTestCase";
ALTER TABLE "new_TestRunTestCase" RENAME TO "TestRunTestCase";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
