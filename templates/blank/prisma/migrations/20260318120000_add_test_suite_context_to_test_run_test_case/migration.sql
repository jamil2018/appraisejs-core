PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestRunTestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testRunId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "testSuiteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT NOT NULL DEFAULT 'UNTESTED',
    "tracePath" TEXT,
    CONSTRAINT "TestRunTestCase_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestRunTestCase_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestRunTestCase_testSuiteId_fkey" FOREIGN KEY ("testSuiteId") REFERENCES "TestSuite" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestRunTestCase" ("id", "testRunId", "testCaseId", "testSuiteId", "status", "result", "tracePath")
SELECT "id", "testRunId", "testCaseId", NULL, "status", "result", "tracePath" FROM "TestRunTestCase";
DROP TABLE "TestRunTestCase";
ALTER TABLE "new_TestRunTestCase" RENAME TO "TestRunTestCase";
CREATE INDEX "TestRunTestCase_testSuiteId_idx" ON "TestRunTestCase"("testSuiteId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
