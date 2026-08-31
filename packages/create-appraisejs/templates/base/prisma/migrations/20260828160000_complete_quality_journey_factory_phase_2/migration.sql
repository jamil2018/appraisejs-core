ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "cancelledBy" TEXT;
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "revokedAt" DATETIME;
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "revokedBy" TEXT;
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "revocationReason" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "cancelledBy" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "dispatchKey" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "dispatchAdapterId" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "dispatchReservedAt" DATETIME;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "dispatchStartedAt" DATETIME;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "replacementProjectionHash" TEXT;
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "predecessorDiagnosticsJson" TEXT;

-- Existing authorizations predate durable attempt limits. Preserve their
-- conservative one-attempt recovery posture; newly issued rows use the schema
-- default of three.
UPDATE "QualityJourneyWorkAuthorization" SET "maxAttempts" = 1;

CREATE INDEX "QualityJourneyWorkAuthorization_revokedAt_idx" ON "QualityJourneyWorkAuthorization"("revokedAt");
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_dispatchKey_key" ON "QualityJourneyWorkAttempt"("dispatchKey");
CREATE INDEX "QualityJourneyWorkAttempt_dispatchReservedAt_idx" ON "QualityJourneyWorkAttempt"("dispatchReservedAt");

DROP TRIGGER "QualityJourneyWorkAuthorization_no_update";
CREATE TRIGGER "QualityJourneyWorkAuthorization_authority_fields_immutable"
BEFORE UPDATE OF "journeyId", "targetProjectId", "workItemId", "role", "roleContractDigest", "capabilityProfileId", "capabilityProfileHash", "authorizationJson", "authorizationHash", "maxAttempts" ON "QualityJourneyWorkAuthorization"
BEGIN SELECT RAISE(ABORT, 'QualityJourneyWorkAuthorization authority is immutable'); END;

DROP TRIGGER "QualityJourneyWorkAttempt_assignment_no_change";
CREATE TRIGGER "QualityJourneyWorkAttempt_assignment_no_change"
BEFORE UPDATE OF "authorizationId", "assignmentId", "assignmentJson", "assignmentHash", "spawnRequestId", "spawnRequestJson", "spawnRequestHash", "dispatchKey", "replacesAttemptId", "replacementProjectionHash", "predecessorDiagnosticsJson" ON "QualityJourneyWorkAttempt"
WHEN OLD."assignmentId" IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'QualityJourneyWorkAttempt assignment lineage is immutable'); END;
