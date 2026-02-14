-- CreateTable
CREATE TABLE "TestCaseMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "isRepeatedlyFailing" BOOLEAN NOT NULL DEFAULT false,
    "isFlaky" BOOLEAN NOT NULL DEFAULT false,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "failureRate" REAL NOT NULL DEFAULT 0,
    "totalRecentRuns" INTEGER NOT NULL DEFAULT 0,
    "failedRecentRuns" INTEGER NOT NULL DEFAULT 0,
    "lastExecutedAt" DATETIME,
    "lastFailedAt" DATETIME,
    "lastPassedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestCaseMetrics_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestSuiteMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testSuiteId" TEXT NOT NULL,
    "lastExecutedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestSuiteMetrics_testSuiteId_fkey" FOREIGN KEY ("testSuiteId") REFERENCES "TestSuite" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DashboardMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "failedRecentRunsCount" INTEGER NOT NULL DEFAULT 0,
    "repeatedlyFailingTestsCount" INTEGER NOT NULL DEFAULT 0,
    "flakyTestsCount" INTEGER NOT NULL DEFAULT 0,
    "suitesNotExecutedRecentlyCount" INTEGER NOT NULL DEFAULT 0,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TestCaseMetrics_testCaseId_key" ON "TestCaseMetrics"("testCaseId");

-- CreateIndex
CREATE INDEX "TestCaseMetrics_isRepeatedlyFailing_idx" ON "TestCaseMetrics"("isRepeatedlyFailing");

-- CreateIndex
CREATE INDEX "TestCaseMetrics_isFlaky_idx" ON "TestCaseMetrics"("isFlaky");

-- CreateIndex
CREATE UNIQUE INDEX "TestSuiteMetrics_testSuiteId_key" ON "TestSuiteMetrics"("testSuiteId");

-- CreateIndex
CREATE INDEX "TestSuiteMetrics_lastExecutedAt_idx" ON "TestSuiteMetrics"("lastExecutedAt");

-- CreateIndex
CREATE INDEX "TestRun_completedAt_idx" ON "TestRun"("completedAt");

-- CreateIndex
CREATE INDEX "TestRun_result_idx" ON "TestRun"("result");
