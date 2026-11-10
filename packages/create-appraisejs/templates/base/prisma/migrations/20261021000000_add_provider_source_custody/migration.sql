-- Source custody begins here; existing filesystem proofs are never backfilled.
CREATE TABLE "QualityJourneyProviderSourceState" (
  "sourceId" TEXT NOT NULL PRIMARY KEY,
  "sourceIncarnation" TEXT NOT NULL,
  "providerRunId" TEXT NOT NULL,
  "intentId" TEXT NOT NULL,
  "providerNamespace" TEXT NOT NULL,
  "identityJson" TEXT NOT NULL,
  "protocolDigest" TEXT NOT NULL,
  "qualificationDigest" TEXT NOT NULL,
  "epoch" INTEGER NOT NULL DEFAULT 1 CHECK ("epoch" = 1),
  "lifecycle" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("lifecycle" IN ('ACTIVE','SEALED','REVOKED','COMMITTED')),
  "sequence" INTEGER NOT NULL DEFAULT 0 CHECK ("sequence" BETWEEN 0 AND 1024),
  "head" TEXT NOT NULL,
  "byteCount" INTEGER NOT NULL DEFAULT 0 CHECK ("byteCount" BETWEEN 0 AND 1048576),
  "sealedHead" TEXT,
  "sealedEnvelopeDigest" TEXT,
  "commitFenceVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("commitFenceVersion" BETWEEN 0 AND 2147483647),
  "committedObservationId" TEXT,
  "committedRequestHash" TEXT,
  "pendingBatchId" TEXT,
  "pendingBatchStartHead" TEXT,
  "pendingBatchRecordAllowance" INTEGER,
  "pendingBatchByteAllowance" INTEGER,
  "pendingBatchRequestDigest" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("providerRunId") REFERENCES "QualityJourneyProviderRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("intentId") REFERENCES "QualityJourneyProviderDispatchIntent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("committedObservationId") REFERENCES "QualityJourneyProviderObservation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (("sealedHead" IS NULL AND "sealedEnvelopeDigest" IS NULL AND "lifecycle" IN ('ACTIVE','REVOKED')) OR
    ("sealedHead" IS NOT NULL AND "sealedEnvelopeDigest" IS NOT NULL AND "sealedHead" = "head" AND "lifecycle" IN ('SEALED','REVOKED','COMMITTED'))),
  CHECK (("committedObservationId" IS NULL AND "committedRequestHash" IS NULL AND "lifecycle" != 'COMMITTED') OR
    ("committedObservationId" IS NOT NULL AND "committedRequestHash" IS NOT NULL AND "lifecycle" = 'COMMITTED')),
  CHECK (("pendingBatchId" IS NULL AND "pendingBatchStartHead" IS NULL AND "pendingBatchRecordAllowance" IS NULL AND
    "pendingBatchByteAllowance" IS NULL AND "pendingBatchRequestDigest" IS NULL) OR
    ("pendingBatchId" IS NOT NULL AND "pendingBatchStartHead" IS NOT NULL AND "pendingBatchRecordAllowance" IS NOT NULL AND "pendingBatchRecordAllowance" BETWEEN 1 AND 1024 AND
    "pendingBatchByteAllowance" IS NOT NULL AND "pendingBatchByteAllowance" BETWEEN 1 AND 1048576 AND "pendingBatchRequestDigest" IS NOT NULL AND "lifecycle" IN ('ACTIVE','REVOKED')))
);
CREATE UNIQUE INDEX "QualityJourneyProviderSourceState_sourceIncarnation_key" ON "QualityJourneyProviderSourceState"("sourceIncarnation");
CREATE UNIQUE INDEX "QualityJourneyProviderSourceState_intentId_key" ON "QualityJourneyProviderSourceState"("intentId");
CREATE UNIQUE INDEX "QualityJourneyProviderSourceState_providerNamespace_key" ON "QualityJourneyProviderSourceState"("providerNamespace");
CREATE UNIQUE INDEX "QualityJourneyProviderSourceState_committedObservationId_key" ON "QualityJourneyProviderSourceState"("committedObservationId");
CREATE UNIQUE INDEX "QualityJourneyProviderSourceState_pendingBatchId_key" ON "QualityJourneyProviderSourceState"("pendingBatchId");
CREATE TABLE "QualityJourneyProviderSourceLedgerRecord" (
  "sourceId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL CHECK ("sequence" BETWEEN 1 AND 1024),
  "previousHead" TEXT NOT NULL,
  "head" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK (length("kind") BETWEEN 1 AND 64),
  "dataJson" TEXT NOT NULL CHECK (length(CAST("dataJson" AS BLOB)) <= 1048576),
  "byteCount" INTEGER NOT NULL CHECK ("byteCount" BETWEEN 1 AND 1048576),
  PRIMARY KEY ("sourceId", "sequence"),
  FOREIGN KEY ("sourceId") REFERENCES "QualityJourneyProviderSourceState" ("sourceId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TRIGGER "provider_source_immutable_binding" BEFORE UPDATE ON "QualityJourneyProviderSourceState"
WHEN NEW."sourceId" IS NOT OLD."sourceId" OR NEW."sourceIncarnation" IS NOT OLD."sourceIncarnation" OR
  NEW."providerRunId" IS NOT OLD."providerRunId" OR NEW."intentId" IS NOT OLD."intentId" OR
  NEW."providerNamespace" IS NOT OLD."providerNamespace" OR NEW."identityJson" IS NOT OLD."identityJson" OR
  NEW."protocolDigest" IS NOT OLD."protocolDigest" OR NEW."qualificationDigest" IS NOT OLD."qualificationDigest" OR
  NEW."epoch" IS NOT OLD."epoch" OR NEW."createdAt" IS NOT OLD."createdAt"
BEGIN SELECT RAISE(ABORT, 'source_binding_immutable'); END;
CREATE TRIGGER "provider_source_no_delete" BEFORE DELETE ON "QualityJourneyProviderSourceState"
BEGIN SELECT RAISE(ABORT, 'source_state_immutable'); END;
CREATE TRIGGER "provider_source_sealed_range" BEFORE UPDATE ON "QualityJourneyProviderSourceState"
WHEN OLD."lifecycle" != 'ACTIVE' AND (NEW."sequence" IS NOT OLD."sequence" OR NEW."head" IS NOT OLD."head" OR
  NEW."byteCount" IS NOT OLD."byteCount" OR NEW."sealedHead" IS NOT OLD."sealedHead" OR
  NEW."sealedEnvelopeDigest" IS NOT OLD."sealedEnvelopeDigest" OR NEW."pendingBatchId" IS NOT OLD."pendingBatchId" OR
  NEW."pendingBatchStartHead" IS NOT OLD."pendingBatchStartHead" OR NEW."pendingBatchRecordAllowance" IS NOT OLD."pendingBatchRecordAllowance" OR
  NEW."pendingBatchByteAllowance" IS NOT OLD."pendingBatchByteAllowance" OR NEW."pendingBatchRequestDigest" IS NOT OLD."pendingBatchRequestDigest")
BEGIN SELECT RAISE(ABORT, 'source_range_sealed'); END;
CREATE TRIGGER "provider_source_lifecycle" BEFORE UPDATE ON "QualityJourneyProviderSourceState"
WHEN (OLD."lifecycle" = 'REVOKED' AND NEW."lifecycle" != 'REVOKED') OR
  (OLD."lifecycle" = 'COMMITTED' AND (NEW."lifecycle" != 'COMMITTED' OR NEW."committedObservationId" IS NOT OLD."committedObservationId" OR NEW."committedRequestHash" IS NOT OLD."committedRequestHash")) OR
  (OLD."lifecycle" = 'SEALED' AND NEW."lifecycle" NOT IN ('SEALED','REVOKED','COMMITTED')) OR
  (OLD."lifecycle" = 'ACTIVE' AND NEW."lifecycle" = 'COMMITTED')
BEGIN SELECT RAISE(ABORT, 'source_lifecycle'); END;
CREATE TRIGGER "provider_source_ledger_no_update" BEFORE UPDATE ON "QualityJourneyProviderSourceLedgerRecord"
BEGIN SELECT RAISE(ABORT, 'source_ledger_immutable'); END;
CREATE TRIGGER "provider_source_ledger_no_delete" BEFORE DELETE ON "QualityJourneyProviderSourceLedgerRecord"
BEGIN SELECT RAISE(ABORT, 'source_ledger_immutable'); END;
CREATE TRIGGER "provider_source_ledger_admission" BEFORE INSERT ON "QualityJourneyProviderSourceLedgerRecord"
WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyProviderSourceState" s WHERE s."sourceId" = NEW."sourceId" AND
  s."lifecycle" = 'ACTIVE' AND NEW."sequence" = s."sequence" + 1 AND NEW."previousHead" = s."head" AND
  s."byteCount" + NEW."byteCount" <= 1048576)
BEGIN SELECT RAISE(ABORT, 'source_ledger_admission'); END;
