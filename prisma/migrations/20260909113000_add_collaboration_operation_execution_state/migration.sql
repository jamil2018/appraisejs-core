-- Persist the operation-owned Git/database state machine independently from
-- decision uniqueness. Existing nonterminal operations have no safe plan and
-- are deliberately blocked by service startup/execution guards until re-prepared.
CREATE TABLE "CollaborationOperationStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "requiredPermission" TEXT NOT NULL,
    "prerequisiteDigest" TEXT NOT NULL,
    "startedVersion" INTEGER,
    "fencingToken" INTEGER,
    "evidenceJson" TEXT,
    "evidenceHash" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "CollaborationOperationStep_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CollaborationOperation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CollaborationOperationStep_operationId_ordinal_key"
  ON "CollaborationOperationStep"("operationId", "ordinal");
CREATE INDEX "CollaborationOperationStep_operationId_state_ordinal_idx"
  ON "CollaborationOperationStep"("operationId", "state", "ordinal");

CREATE TABLE "CollaborationOperationArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "payloadJson" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationOperationArtifact_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "CollaborationOperation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CollaborationOperationArtifact_operationId_kind_revision_key"
  ON "CollaborationOperationArtifact"("operationId", "kind", "revision");
CREATE INDEX "CollaborationOperationArtifact_operationId_kind_idx"
  ON "CollaborationOperationArtifact"("operationId", "kind");
