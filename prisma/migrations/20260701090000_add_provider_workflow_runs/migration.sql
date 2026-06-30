-- CreateTable
CREATE TABLE "ProviderAdapterRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "providerKind" TEXT NOT NULL,
    "adapterVersion" TEXT NOT NULL,
    "capabilitiesJson" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProviderWorkflowRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planProjectionId" TEXT,
    "targetProjectId" TEXT NOT NULL,
    "providerAdapterId" TEXT,
    "providerKind" TEXT NOT NULL,
    "providerProfile" TEXT,
    "adapterVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lifecyclePhase" TEXT NOT NULL,
    "capabilitySnapshotJson" TEXT NOT NULL,
    "launchPrompt" TEXT NOT NULL,
    "approvedScopeJson" TEXT,
    "appraiseInstructions" TEXT NOT NULL,
    "providerSessionId" TEXT,
    "providerThreadId" TEXT,
    "providerProcessId" TEXT,
    "preRunRepoSnapshotJson" TEXT,
    "postRunRepoSnapshotJson" TEXT,
    "changedFilesJson" TEXT,
    "artifactHashesJson" TEXT,
    "failureReason" TEXT,
    "cancelledAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProviderWorkflowRun_planProjectionId_fkey" FOREIGN KEY ("planProjectionId") REFERENCES "PlanProjection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProviderWorkflowRun_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProviderWorkflowRun_providerAdapterId_fkey" FOREIGN KEY ("providerAdapterId") REFERENCES "ProviderAdapterRegistration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProviderRunEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT,
    "stream" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProviderWorkflowRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProviderPermissionDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "riskTier" TEXT NOT NULL,
    "requestedScope" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "reason" TEXT,
    "decidedBy" TEXT NOT NULL,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderPermissionDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProviderWorkflowRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProviderArtifactSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hash" TEXT,
    "metadataJson" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderArtifactSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProviderWorkflowRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAdapterRegistration_key_key" ON "ProviderAdapterRegistration"("key");

-- CreateIndex
CREATE INDEX "ProviderAdapterRegistration_providerKind_enabled_idx" ON "ProviderAdapterRegistration"("providerKind", "enabled");

-- CreateIndex
CREATE INDEX "ProviderWorkflowRun_planProjectionId_idx" ON "ProviderWorkflowRun"("planProjectionId");

-- CreateIndex
CREATE INDEX "ProviderWorkflowRun_targetProjectId_idx" ON "ProviderWorkflowRun"("targetProjectId");

-- CreateIndex
CREATE INDEX "ProviderWorkflowRun_providerKind_status_idx" ON "ProviderWorkflowRun"("providerKind", "status");

-- CreateIndex
CREATE INDEX "ProviderWorkflowRun_createdAt_idx" ON "ProviderWorkflowRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderRunEvent_runId_sequence_key" ON "ProviderRunEvent"("runId", "sequence");

-- CreateIndex
CREATE INDEX "ProviderRunEvent_runId_createdAt_idx" ON "ProviderRunEvent"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPermissionDecision_runId_requestId_key" ON "ProviderPermissionDecision"("runId", "requestId");

-- CreateIndex
CREATE INDEX "ProviderPermissionDecision_runId_decidedAt_idx" ON "ProviderPermissionDecision"("runId", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderArtifactSnapshot_runId_path_kind_key" ON "ProviderArtifactSnapshot"("runId", "path", "kind");

-- CreateIndex
CREATE INDEX "ProviderArtifactSnapshot_runId_capturedAt_idx" ON "ProviderArtifactSnapshot"("runId", "capturedAt");
