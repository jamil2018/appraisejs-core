CREATE TABLE "RuntimeCapsuleExecutionAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testRunId" TEXT NOT NULL,
    "capsuleId" TEXT NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "preflightResultJson" TEXT NOT NULL,
    "preflightResultHash" TEXT NOT NULL,
    "preflightCheckedAt" DATETIME NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PREPARED',
    "ownerToken" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failure" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RuntimeCapsuleExecutionAttempt_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RuntimeCapsuleExecutionAttempt_capsuleId_fkey" FOREIGN KEY ("capsuleId") REFERENCES "RuntimeCapsule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RuntimeCapsuleExecutionAttempt_testRunId_key" ON "RuntimeCapsuleExecutionAttempt"("testRunId");
CREATE UNIQUE INDEX "RuntimeCapsuleExecutionAttempt_capsuleId_key" ON "RuntimeCapsuleExecutionAttempt"("capsuleId");
CREATE INDEX "RuntimeCapsuleExecutionAttempt_state_updatedAt_idx" ON "RuntimeCapsuleExecutionAttempt"("state", "updatedAt");
