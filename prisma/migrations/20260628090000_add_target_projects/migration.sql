PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "TargetProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalPath" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "packageName" TEXT,
    "packageManager" TEXT,
    "packageJson" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "new_PlanProjection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL UNIQUE,
    "revision" INTEGER NOT NULL,
    "lifecycle" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "description" TEXT NOT NULL,
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
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT,
    CONSTRAINT "PlanProjection_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_PlanProjection" (
    "id",
    "planId",
    "revision",
    "lifecycle",
    "goal",
    "description",
    "sourceHash",
    "planPath",
    "reviewJson",
    "validationJson",
    "layoutJson",
    "stale",
    "conflicted",
    "deletedAt",
    "lastValidProjectedAt",
    "lastSyncAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "planId",
    "revision",
    "lifecycle",
    "goal",
    "description",
    "sourceHash",
    "planPath",
    "reviewJson",
    "validationJson",
    "layoutJson",
    "stale",
    "conflicted",
    "deletedAt",
    "lastValidProjectedAt",
    "lastSyncAt",
    "createdAt",
    "updatedAt"
FROM "PlanProjection";

DROP TABLE "PlanProjection";
ALTER TABLE "new_PlanProjection" RENAME TO "PlanProjection";

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
    "targetProjectId" TEXT,
    CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanProjection" ("planId") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestRun_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_TestRun" (
    "id",
    "name",
    "runId",
    "startedAt",
    "completedAt",
    "status",
    "result",
    "updatedAt",
    "environmentId",
    "testWorkersCount",
    "browserEngine",
    "logPath",
    "reportPath",
    "planId"
)
SELECT
    "id",
    "name",
    "runId",
    "startedAt",
    "completedAt",
    "status",
    "result",
    "updatedAt",
    "environmentId",
    "testWorkersCount",
    "browserEngine",
    "logPath",
    "reportPath",
    "planId"
FROM "TestRun";

DROP TABLE "TestRun";
ALTER TABLE "new_TestRun" RENAME TO "TestRun";

CREATE UNIQUE INDEX "TargetProject_canonicalPath_key" ON "TargetProject"("canonicalPath");
CREATE UNIQUE INDEX "TargetProject_fingerprint_key" ON "TargetProject"("fingerprint");
CREATE INDEX "TargetProject_displayName_idx" ON "TargetProject"("displayName");
CREATE INDEX "TargetProject_fingerprint_idx" ON "TargetProject"("fingerprint");

CREATE INDEX "PlanProjection_stale_idx" ON "PlanProjection"("stale");
CREATE INDEX "PlanProjection_conflicted_idx" ON "PlanProjection"("conflicted");
CREATE INDEX "PlanProjection_targetProjectId_idx" ON "PlanProjection"("targetProjectId");

CREATE UNIQUE INDEX "TestRun_name_key" ON "TestRun"("name");
CREATE UNIQUE INDEX "TestRun_runId_key" ON "TestRun"("runId");
CREATE INDEX "TestRun_completedAt_idx" ON "TestRun"("completedAt");
CREATE INDEX "TestRun_result_idx" ON "TestRun"("result");
CREATE INDEX "TestRun_targetProjectId_idx" ON "TestRun"("targetProjectId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
