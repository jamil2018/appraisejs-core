PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "PlanProjection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL UNIQUE,
    "revision" INTEGER NOT NULL,
    "lifecycle" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "planPath" TEXT NOT NULL,
    "reviewJson" TEXT,
    "validationJson" TEXT,
    "layoutJson" TEXT,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "conflicted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "lastValidProjectedAt" DATETIME NOT NULL,
    "lastSyncAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "PlanTaskProjection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planProjectionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "acceptanceJson" TEXT NOT NULL,
    "validationIntent" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "PlanTaskProjection_planProjectionId_fkey" FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PlanSyncIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planProjectionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "artifactPath" TEXT,
    "message" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "PlanSyncIssue_planProjectionId_fkey" FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PlanRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planProjectionId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "gitCommit" TEXT,
    "dirtyHashesJson" TEXT,
    "snapshotJson" TEXT,
    "reducedAssurance" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanRevision_planProjectionId_fkey" FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "planId" TEXT,
    CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanProjection" ("planId") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_TestRun" ("browserEngine", "completedAt", "environmentId", "id", "logPath", "name", "reportPath", "result", "runId", "startedAt", "status", "testWorkersCount", "updatedAt")
SELECT "browserEngine", "completedAt", "environmentId", "id", "logPath", "name", "reportPath", "result", "runId", "startedAt", "status", "testWorkersCount", "updatedAt" FROM "TestRun";
DROP TABLE "TestRun";
ALTER TABLE "new_TestRun" RENAME TO "TestRun";

CREATE INDEX "PlanProjection_stale_idx" ON "PlanProjection"("stale");
CREATE INDEX "PlanProjection_conflicted_idx" ON "PlanProjection"("conflicted");
CREATE UNIQUE INDEX "PlanTaskProjection_planProjectionId_taskId_key" ON "PlanTaskProjection"("planProjectionId", "taskId");
CREATE INDEX "PlanTaskProjection_planProjectionId_position_idx" ON "PlanTaskProjection"("planProjectionId", "position");
CREATE INDEX "PlanSyncIssue_planProjectionId_resolvedAt_idx" ON "PlanSyncIssue"("planProjectionId", "resolvedAt");
CREATE UNIQUE INDEX "PlanRevision_planProjectionId_sourceHash_key" ON "PlanRevision"("planProjectionId", "sourceHash");
CREATE UNIQUE INDEX "TestRun_name_key" ON "TestRun"("name");
CREATE UNIQUE INDEX "TestRun_runId_key" ON "TestRun"("runId");
CREATE INDEX "TestRun_completedAt_idx" ON "TestRun"("completedAt");
CREATE INDEX "TestRun_result_idx" ON "TestRun"("result");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
