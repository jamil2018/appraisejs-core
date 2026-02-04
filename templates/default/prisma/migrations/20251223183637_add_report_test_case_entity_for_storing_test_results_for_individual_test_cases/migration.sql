-- CreateTable
CREATE TABLE "ReportTestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "testRunTestCaseId" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    CONSTRAINT "ReportTestCase_testRunTestCaseId_fkey" FOREIGN KEY ("testRunTestCaseId") REFERENCES "TestRunTestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReportTestCase_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
