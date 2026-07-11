CREATE TABLE "BaselineAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planProjectionId" TEXT NOT NULL,
    "validationId" TEXT NOT NULL,
    "validationRevision" INTEGER NOT NULL,
    "validationHash" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BaselineAttempt_planProjectionId_fkey" FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BaselineAttemptEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BaselineAttemptEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "BaselineAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BaselineAttempt_planProjectionId_createdAt_idx" ON "BaselineAttempt"("planProjectionId", "createdAt");
CREATE INDEX "BaselineAttempt_testRunId_idx" ON "BaselineAttempt"("testRunId");
CREATE UNIQUE INDEX "BaselineAttemptEvent_attemptId_idempotencyKey_key" ON "BaselineAttemptEvent"("attemptId", "idempotencyKey");
CREATE UNIQUE INDEX "BaselineAttemptEvent_attemptId_sequence_key" ON "BaselineAttemptEvent"("attemptId", "sequence");
CREATE INDEX "BaselineAttemptEvent_attemptId_createdAt_idx" ON "BaselineAttemptEvent"("attemptId", "createdAt");
