CREATE TABLE "RemoteEvaluationScopePartitionManifest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "qualityPlanId" TEXT NOT NULL,
    "qualityPlanRevisionId" TEXT NOT NULL,
    "designHash" TEXT NOT NULL,
    "coverageHash" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "canonicalManifestJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RemoteEvaluationScopePartitionManifest_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RemoteEvaluationScopePartitionManifest_targetProjectId_idempotencyKey_key" ON "RemoteEvaluationScopePartitionManifest"("targetProjectId", "idempotencyKey");
CREATE UNIQUE INDEX "RemoteEvaluationScopePartitionManifest_targetProjectId_manifestHash_key" ON "RemoteEvaluationScopePartitionManifest"("targetProjectId", "manifestHash");
CREATE INDEX "RemoteEvaluationScopePartitionManifest_targetProjectId_qualityPlanRevisionId_idx" ON "RemoteEvaluationScopePartitionManifest"("targetProjectId", "qualityPlanRevisionId");

CREATE TABLE "RemoteEvaluationScopePartition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "manifestId" TEXT NOT NULL,
    "partitionKey" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "remoteEvaluationScopeBindingId" TEXT NOT NULL,
    "validationVersionIdsJson" TEXT NOT NULL,
    "validationBindingsHash" TEXT NOT NULL,
    "childHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RemoteEvaluationScopePartition_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "RemoteEvaluationScopePartitionManifest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RemoteEvaluationScopePartition_remoteEvaluationScopeBindingId_fkey" FOREIGN KEY ("remoteEvaluationScopeBindingId") REFERENCES "RemoteEvaluationScopeBinding" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RemoteEvaluationScopePartition_remoteEvaluationScopeBindingId_key" ON "RemoteEvaluationScopePartition"("remoteEvaluationScopeBindingId");
CREATE UNIQUE INDEX "RemoteEvaluationScopePartition_manifestId_partitionKey_key" ON "RemoteEvaluationScopePartition"("manifestId", "partitionKey");
CREATE INDEX "RemoteEvaluationScopePartition_environmentId_idx" ON "RemoteEvaluationScopePartition"("environmentId");

CREATE TRIGGER "RemoteEvaluationScopePartitionManifest_no_update"
BEFORE UPDATE ON "RemoteEvaluationScopePartitionManifest"
BEGIN
  SELECT RAISE(ABORT, 'RemoteEvaluationScopePartitionManifest is insert-only');
END;

CREATE TRIGGER "RemoteEvaluationScopePartitionManifest_no_delete"
BEFORE DELETE ON "RemoteEvaluationScopePartitionManifest"
BEGIN
  SELECT RAISE(ABORT, 'RemoteEvaluationScopePartitionManifest is insert-only');
END;

CREATE TRIGGER "RemoteEvaluationScopePartition_no_update"
BEFORE UPDATE ON "RemoteEvaluationScopePartition"
BEGIN
  SELECT RAISE(ABORT, 'RemoteEvaluationScopePartition is insert-only');
END;

CREATE TRIGGER "RemoteEvaluationScopePartition_no_delete"
BEFORE DELETE ON "RemoteEvaluationScopePartition"
BEGIN
  SELECT RAISE(ABORT, 'RemoteEvaluationScopePartition is insert-only');
END;
