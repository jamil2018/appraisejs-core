CREATE TABLE "PlanEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planProjectionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanEvent_planProjectionId_fkey" FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PlanPersonalLayout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planProjectionId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "positionsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanPersonalLayout_planProjectionId_fkey" FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PlanEvent_planProjectionId_createdAt_idx" ON "PlanEvent"("planProjectionId", "createdAt");
CREATE UNIQUE INDEX "PlanPersonalLayout_planProjectionId_owner_key" ON "PlanPersonalLayout"("planProjectionId", "owner");
