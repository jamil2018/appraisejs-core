-- CreateTable
CREATE TABLE "TestRunLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testRunId" TEXT NOT NULL,
    "logs" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestRunLog_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("runId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TestRunLog_testRunId_key" ON "TestRunLog"("testRunId");
