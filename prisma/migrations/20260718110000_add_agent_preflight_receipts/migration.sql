-- CreateTable
CREATE TABLE "AgentPreflightReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coordinatorId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ready" BOOLEAN NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "expectedCanonicalPath" TEXT,
    "targetProjectId" TEXT,
    "mcpSurfaceVersion" TEXT NOT NULL,
    "mcpServerStartedAt" DATETIME NOT NULL,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPreflightReceipt_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentPreflightReceipt_coordinatorId_snapshotHash_key" ON "AgentPreflightReceipt"("coordinatorId", "snapshotHash");

-- CreateIndex
CREATE INDEX "AgentPreflightReceipt_targetProjectId_observedAt_idx" ON "AgentPreflightReceipt"("targetProjectId", "observedAt");

-- CreateIndex
CREATE INDEX "AgentPreflightReceipt_observedAt_idx" ON "AgentPreflightReceipt"("observedAt");
