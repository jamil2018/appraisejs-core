-- AlterTable
ALTER TABLE "TemplateTestCaseFlowBlock" ADD COLUMN "collaborationPortableId" TEXT;

-- AlterTable
ALTER TABLE "TemplateTestCaseStep" ADD COLUMN "collaborationPortableId" TEXT;

-- AlterTable
ALTER TABLE "TestCaseFlowBlock" ADD COLUMN "collaborationPortableId" TEXT;

-- AlterTable
ALTER TABLE "TestCaseStep" ADD COLUMN "collaborationPortableId" TEXT;

-- CreateTable
CREATE TABLE "CollaborationBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "portableProjectId" TEXT NOT NULL,
    "repositoryRoot" TEXT NOT NULL,
    "remoteName" TEXT NOT NULL DEFAULT 'origin',
    "trackedBranch" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "connectionState" TEXT NOT NULL DEFAULT 'OFFLINE',
    "observedCapabilitiesJson" TEXT NOT NULL DEFAULT '[]',
    "lastObservedAt" DATETIME,
    "lastRemoteCheckAt" DATETIME,
    "nextRemoteCheckAt" DATETIME,
    "remoteBackoffSeconds" INTEGER NOT NULL DEFAULT 300,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollaborationBinding_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationEntityMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bindingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "portableId" TEXT NOT NULL,
    "localEntityId" TEXT,
    "currentHash" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollaborationEntityMap_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CollaborationBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationBaseline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityMapId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "repositoryRevision" TEXT,
    "acknowledgedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationBaseline_entityMapId_fkey" FOREIGN KEY ("entityMapId") REFERENCES "CollaborationEntityMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationEnvironmentMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bindingId" TEXT NOT NULL,
    "portableId" TEXT NOT NULL,
    "localEnvironmentId" TEXT NOT NULL,
    "localScopeVersion" INTEGER NOT NULL,
    "mappingHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollaborationEnvironmentMapping_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CollaborationBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bindingId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "sourceRevision" TEXT,
    "targetRevision" TEXT,
    "sourceSnapshotHash" TEXT,
    "localReadSetHash" TEXT,
    "policyVersion" INTEGER NOT NULL,
    "preparedJson" TEXT,
    "preparedDigest" TEXT,
    "acceptedDigest" TEXT,
    "blockerJson" TEXT,
    "receiptJson" TEXT,
    "receiptHash" TEXT,
    "mutationJournalJson" TEXT NOT NULL DEFAULT '[]',
    "leaseOwner" TEXT,
    "leaseExpiresAt" DATETIME,
    "fencingToken" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "cancelledAt" DATETIME,
    "supersededById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "CollaborationOperation_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CollaborationBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "fencingToken" INTEGER NOT NULL,
    "workerId" TEXT,
    "state" TEXT NOT NULL,
    "leaseExpiresAt" DATETIME,
    "heartbeatAt" DATETIME,
    "resultJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollaborationAttempt_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CollaborationOperation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationPolicyGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bindingId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "scopeJson" TEXT NOT NULL,
    "trustedPrincipalId" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "CollaborationPolicyGrant_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CollaborationBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "recordKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resolutionJson" TEXT,
    "resolutionDigest" TEXT NOT NULL,
    "trustedPrincipalId" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationDecision_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CollaborationOperation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationJournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "boundary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationJournalEntry_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CollaborationOperation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationWorker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bindingId" TEXT NOT NULL,
    "workerIdentity" TEXT NOT NULL,
    "capabilitiesJson" TEXT NOT NULL,
    "connectionState" TEXT NOT NULL DEFAULT 'OFFLINE',
    "sessionNonceHash" TEXT NOT NULL,
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "CollaborationWorker_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CollaborationBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationHandoffTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bindingId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopeJson" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "redeemedAt" DATETIME,
    "redeemedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationHandoffTicket_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CollaborationBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollaborationHandoffTicket_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CollaborationOperation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationReuseAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bindingId" TEXT NOT NULL,
    "portableId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "sourceRevision" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationReuseAsset_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CollaborationBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bindingId" TEXT NOT NULL,
    "operationId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionable" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationNotification_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "CollaborationBinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollaborationNotification_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CollaborationOperation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborationMutationLock" (
    "lockKey" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "fencingToken" INTEGER NOT NULL DEFAULT 1,
    "leaseExpiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- Additive authored-archive and embedded portable identity columns.
ALTER TABLE "Environment" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Environment" ADD COLUMN "collaborationManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Environment" ADD COLUMN "archiveVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Locator" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Locator" ADD COLUMN "collaborationManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Locator" ADD COLUMN "archiveVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LocatorGroup" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "LocatorGroup" ADD COLUMN "collaborationManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LocatorGroup" ADD COLUMN "archiveVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Module" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Module" ADD COLUMN "collaborationManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Module" ADD COLUMN "archiveVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Tag" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Tag" ADD COLUMN "collaborationManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tag" ADD COLUMN "archiveVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TemplateTestCase" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "TemplateTestCase" ADD COLUMN "collaborationManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TemplateTestCase" ADD COLUMN "archiveVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TestCase" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "TestCase" ADD COLUMN "collaborationManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TestCase" ADD COLUMN "archiveVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TestSuite" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "TestSuite" ADD COLUMN "collaborationManaged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TestSuite" ADD COLUMN "archiveVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationBinding_targetProjectId_key" ON "CollaborationBinding"("targetProjectId");

-- CreateIndex
CREATE INDEX "CollaborationBinding_portableProjectId_idx" ON "CollaborationBinding"("portableProjectId");

-- CreateIndex
CREATE INDEX "CollaborationBinding_repositoryRoot_idx" ON "CollaborationBinding"("repositoryRoot");

-- CreateIndex
CREATE INDEX "CollaborationEntityMap_localEntityId_idx" ON "CollaborationEntityMap"("localEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationEntityMap_bindingId_kind_portableId_key" ON "CollaborationEntityMap"("bindingId", "kind", "portableId");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationEntityMap_bindingId_kind_localEntityId_key" ON "CollaborationEntityMap"("bindingId", "kind", "localEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationBaseline_entityMapId_key" ON "CollaborationBaseline"("entityMapId");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationEnvironmentMapping_bindingId_portableId_key" ON "CollaborationEnvironmentMapping"("bindingId", "portableId");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationEnvironmentMapping_bindingId_localEnvironmentId_key" ON "CollaborationEnvironmentMapping"("bindingId", "localEnvironmentId");

-- CreateIndex
CREATE INDEX "CollaborationOperation_bindingId_state_createdAt_idx" ON "CollaborationOperation"("bindingId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "CollaborationOperation_leaseExpiresAt_idx" ON "CollaborationOperation"("leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationOperation_bindingId_idempotencyKey_key" ON "CollaborationOperation"("bindingId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CollaborationAttempt_operationId_fencingToken_idx" ON "CollaborationAttempt"("operationId", "fencingToken");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationAttempt_operationId_attemptNumber_key" ON "CollaborationAttempt"("operationId", "attemptNumber");

-- CreateIndex
CREATE INDEX "CollaborationPolicyGrant_bindingId_permission_revokedAt_idx" ON "CollaborationPolicyGrant"("bindingId", "permission", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationPolicyGrant_bindingId_permission_policyVersion_key" ON "CollaborationPolicyGrant"("bindingId", "permission", "policyVersion");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationDecision_operationId_recordKey_resolutionDigest_key" ON "CollaborationDecision"("operationId", "recordKey", "resolutionDigest");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationJournalEntry_operationId_sequence_key" ON "CollaborationJournalEntry"("operationId", "sequence");

-- CreateIndex
CREATE INDEX "CollaborationWorker_expiresAt_idx" ON "CollaborationWorker"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationWorker_bindingId_workerIdentity_key" ON "CollaborationWorker"("bindingId", "workerIdentity");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationHandoffTicket_tokenHash_key" ON "CollaborationHandoffTicket"("tokenHash");

-- CreateIndex
CREATE INDEX "CollaborationHandoffTicket_bindingId_expiresAt_idx" ON "CollaborationHandoffTicket"("bindingId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationReuseAsset_bindingId_portableId_sourceVersion_key" ON "CollaborationReuseAsset"("bindingId", "portableId", "sourceVersion");

-- CreateIndex
CREATE INDEX "CollaborationNotification_bindingId_readAt_createdAt_idx" ON "CollaborationNotification"("bindingId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollaborationNotification_bindingId_dedupeKey_key" ON "CollaborationNotification"("bindingId", "dedupeKey");
