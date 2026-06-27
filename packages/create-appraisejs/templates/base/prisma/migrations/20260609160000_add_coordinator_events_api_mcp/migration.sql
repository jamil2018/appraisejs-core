PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "AppraiseProjectIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectFingerprint" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" DATETIME
);

CREATE TABLE "PlanCoordinatorLease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planProjectionId" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "leaseExpiresAt" DATETIME NOT NULL,
    "takeoverApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanCoordinatorLease_planProjectionId_fkey" FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "new_PlanEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planProjectionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT,
    "acknowledgedAt" DATETIME,
    "acknowledgedBy" TEXT,
    "supersededAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanEvent_planProjectionId_fkey" FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_PlanEvent" ("id", "planProjectionId", "sequence", "type", "payloadJson", "createdAt")
SELECT
    "id",
    "planProjectionId",
    ROW_NUMBER() OVER (PARTITION BY "planProjectionId" ORDER BY "createdAt", "id"),
    "type",
    "payloadJson",
    "createdAt"
FROM "PlanEvent";

DROP TABLE "PlanEvent";
ALTER TABLE "new_PlanEvent" RENAME TO "PlanEvent";

CREATE UNIQUE INDEX "AppraiseProjectIdentity_projectFingerprint_key" ON "AppraiseProjectIdentity"("projectFingerprint");
CREATE UNIQUE INDEX "PlanCoordinatorLease_planProjectionId_key" ON "PlanCoordinatorLease"("planProjectionId");
CREATE UNIQUE INDEX "PlanCoordinatorLease_connectionId_key" ON "PlanCoordinatorLease"("connectionId");
CREATE INDEX "PlanCoordinatorLease_leaseExpiresAt_idx" ON "PlanCoordinatorLease"("leaseExpiresAt");
CREATE UNIQUE INDEX "PlanEvent_planProjectionId_sequence_key" ON "PlanEvent"("planProjectionId", "sequence");
CREATE INDEX "PlanEvent_planProjectionId_acknowledgedAt_sequence_idx" ON "PlanEvent"("planProjectionId", "acknowledgedAt", "sequence");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
