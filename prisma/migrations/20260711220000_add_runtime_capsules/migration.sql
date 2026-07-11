-- CreateTable
CREATE TABLE "RuntimeCapsule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "validationHash" TEXT NOT NULL,
    "capsuleHash" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "manifestJson" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "integrityState" TEXT NOT NULL DEFAULT 'staging',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RuntimeCapsule_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RuntimeCapsule_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RuntimeCapsule_testRunId_key" ON "RuntimeCapsule"("testRunId");
CREATE UNIQUE INDEX "RuntimeCapsule_targetProjectId_validationHash_testRunId_key" ON "RuntimeCapsule"("targetProjectId", "validationHash", "testRunId");
CREATE UNIQUE INDEX "RuntimeCapsule_targetProjectId_storagePath_key" ON "RuntimeCapsule"("targetProjectId", "storagePath");
CREATE INDEX "RuntimeCapsule_targetProjectId_validationHash_idx" ON "RuntimeCapsule"("targetProjectId", "validationHash");
CREATE INDEX "RuntimeCapsule_integrityState_idx" ON "RuntimeCapsule"("integrityState");

CREATE TABLE "RuntimeCapsuleBlob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "integrityState" TEXT NOT NULL DEFAULT 'staging',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RuntimeCapsuleBlob_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RuntimeCapsuleBlob_targetProjectId_contentHash_key" ON "RuntimeCapsuleBlob"("targetProjectId", "contentHash");
CREATE UNIQUE INDEX "RuntimeCapsuleBlob_targetProjectId_storagePath_key" ON "RuntimeCapsuleBlob"("targetProjectId", "storagePath");
CREATE INDEX "RuntimeCapsuleBlob_targetProjectId_idx" ON "RuntimeCapsuleBlob"("targetProjectId");
CREATE INDEX "RuntimeCapsuleBlob_integrityState_idx" ON "RuntimeCapsuleBlob"("integrityState");

CREATE TABLE "RuntimeCapsuleBlobReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capsuleId" TEXT NOT NULL,
    "blobId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    CONSTRAINT "RuntimeCapsuleBlobReference_capsuleId_fkey" FOREIGN KEY ("capsuleId") REFERENCES "RuntimeCapsule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RuntimeCapsuleBlobReference_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "RuntimeCapsuleBlob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RuntimeCapsuleBlobReference_capsuleId_filePath_key" ON "RuntimeCapsuleBlobReference"("capsuleId", "filePath");
CREATE UNIQUE INDEX "RuntimeCapsuleBlobReference_capsuleId_blobId_filePath_key" ON "RuntimeCapsuleBlobReference"("capsuleId", "blobId", "filePath");
CREATE INDEX "RuntimeCapsuleBlobReference_blobId_idx" ON "RuntimeCapsuleBlobReference"("blobId");

CREATE TABLE "RuntimeCapsuleLease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "validationHash" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ownerToken" TEXT NOT NULL,
    "leaseExpiresAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RuntimeCapsuleLease_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RuntimeCapsuleLease_targetProjectId_validationHash_runId_key" ON "RuntimeCapsuleLease"("targetProjectId", "validationHash", "runId");
CREATE INDEX "RuntimeCapsuleLease_leaseExpiresAt_idx" ON "RuntimeCapsuleLease"("leaseExpiresAt");

-- AlterTable
ALTER TABLE "ValidationAstPublishOperation" ADD COLUMN "runtimeInputHash" TEXT;
ALTER TABLE "ValidationAstPublishOperation" ADD COLUMN "runtimeInputJson" TEXT;
