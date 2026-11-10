-- C3 metadata is inert. No allocation, row or digest enrolls an issuer.
CREATE TABLE "QualityJourneyE2CampaignPolicy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "allocationDigest" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "sourceTupleDigest" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL CHECK ("policyVersion" = 'M06_E2_CAMPAIGN_POLICY_V1'),
  "policyDigest" TEXT NOT NULL,
  "nativeStartWindowMs" INTEGER NOT NULL CHECK (typeof("nativeStartWindowMs") = 'integer' AND "nativeStartWindowMs" BETWEEN 1 AND 2147483646),
  "dnsWindowMs" INTEGER NOT NULL CHECK (typeof("dnsWindowMs") = 'integer' AND "dnsWindowMs" BETWEEN 1 AND 2147483646),
  "tcpWindowMs" INTEGER NOT NULL CHECK (typeof("tcpWindowMs") = 'integer' AND "tcpWindowMs" BETWEEN 1 AND 2147483646),
  "tlsWindowMs" INTEGER NOT NULL CHECK (typeof("tlsWindowMs") = 'integer' AND "tlsWindowMs" BETWEEN 1 AND 2147483646),
  "upgradeWindowMs" INTEGER NOT NULL CHECK (typeof("upgradeWindowMs") = 'integer' AND "upgradeWindowMs" BETWEEN 1 AND 2147483646),
  "providerRequestWindowMs" INTEGER NOT NULL CHECK (typeof("providerRequestWindowMs") = 'integer' AND "providerRequestWindowMs" BETWEEN 1 AND 2147483646),
  "mcpCallWindowMs" INTEGER NOT NULL CHECK (typeof("mcpCallWindowMs") = 'integer' AND "mcpCallWindowMs" BETWEEN 1 AND 2147483646),
  "actorMaxOperations" INTEGER NOT NULL CHECK (typeof("actorMaxOperations") = 'integer' AND "actorMaxOperations" BETWEEN 0 AND 32),
  "actorMaxBytes" INTEGER NOT NULL CHECK (typeof("actorMaxBytes") = 'integer' AND "actorMaxBytes" BETWEEN 0 AND 8388608),
  "actorMaxFrames" INTEGER NOT NULL CHECK (typeof("actorMaxFrames") = 'integer' AND "actorMaxFrames" BETWEEN 0 AND 512),
  "actorMaxSetup" INTEGER NOT NULL CHECK (typeof("actorMaxSetup") = 'integer' AND "actorMaxSetup" BETWEEN 0 AND 4),
  "actorMaxProviderRequests" INTEGER NOT NULL CHECK (typeof("actorMaxProviderRequests") = 'integer' AND "actorMaxProviderRequests" BETWEEN 0 AND 5),
  "actorMaxMcpCalls" INTEGER NOT NULL CHECK (typeof("actorMaxMcpCalls") = 'integer' AND "actorMaxMcpCalls" BETWEEN 0 AND 16),
  "journeyMaxNativeStarts" INTEGER NOT NULL CHECK (typeof("journeyMaxNativeStarts") = 'integer' AND "journeyMaxNativeStarts" BETWEEN 0 AND 6),
  "journeyMaxTurnStarts" INTEGER NOT NULL CHECK (typeof("journeyMaxTurnStarts") = 'integer' AND "journeyMaxTurnStarts" BETWEEN 0 AND 5),
  "maxNativeStarts" INTEGER NOT NULL CHECK (typeof("maxNativeStarts") = 'integer' AND "maxNativeStarts" BETWEEN 0 AND 6),
  "maxProviderRequests" INTEGER NOT NULL CHECK (typeof("maxProviderRequests") = 'integer' AND "maxProviderRequests" BETWEEN 0 AND 5),
  "maxOperations" INTEGER NOT NULL CHECK (typeof("maxOperations") = 'integer' AND "maxOperations" BETWEEN 0 AND 192),
  "maxBytes" INTEGER NOT NULL CHECK (typeof("maxBytes") = 'integer' AND "maxBytes" BETWEEN 0 AND 50331648),
  "maxFrames" INTEGER NOT NULL CHECK (typeof("maxFrames") = 'integer' AND "maxFrames" BETWEEN 0 AND 3072),
  "maxSetup" INTEGER NOT NULL CHECK (typeof("maxSetup") = 'integer' AND "maxSetup" BETWEEN 0 AND 24),
  "maxMcpCalls" INTEGER NOT NULL CHECK (typeof("maxMcpCalls") = 'integer' AND "maxMcpCalls" BETWEEN 0 AND 96),
  "nativeStartsReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("nativeStartsReserved") = 'integer' AND "nativeStartsReserved" BETWEEN 0 AND "maxNativeStarts"),
  "providerRequestsReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("providerRequestsReserved") = 'integer' AND "providerRequestsReserved" BETWEEN 0 AND "maxProviderRequests"),
  "operationsReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("operationsReserved") = 'integer' AND "operationsReserved" BETWEEN 0 AND "maxOperations"),
  "bytesReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("bytesReserved") = 'integer' AND "bytesReserved" BETWEEN 0 AND "maxBytes"),
  "framesReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("framesReserved") = 'integer' AND "framesReserved" BETWEEN 0 AND "maxFrames"),
  "setupReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("setupReserved") = 'integer' AND "setupReserved" BETWEEN 0 AND "maxSetup"),
  "mcpCallsReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("mcpCallsReserved") = 'integer' AND "mcpCallsReserved" BETWEEN 0 AND "maxMcpCalls"),
  "version" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("version") = 'integer' AND "version" BETWEEN 0 AND 2147483646),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyE2CampaignPolicy_journey_fkey" FOREIGN KEY ("journeyId", "targetProjectId") REFERENCES "QualityJourney"("id", "targetProjectId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (typeof("id") = 'text' AND length("id") BETWEEN 1 AND 128 AND length(CAST("id" AS BLOB)) = length("id")),
  CHECK (typeof("journeyId") = 'text' AND length("journeyId") BETWEEN 1 AND 128 AND length(CAST("journeyId" AS BLOB)) = length("journeyId")),
  CHECK (typeof("targetProjectId") = 'text' AND length("targetProjectId") BETWEEN 1 AND 128 AND length(CAST("targetProjectId" AS BLOB)) = length("targetProjectId")),
  CHECK (typeof("allocationDigest") = 'text' AND length("allocationDigest") = 64 AND length(CAST("allocationDigest" AS BLOB)) = 64 AND "allocationDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("sourceTupleDigest") = 'text' AND length("sourceTupleDigest") = 64 AND length(CAST("sourceTupleDigest" AS BLOB)) = 64 AND "sourceTupleDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("policyDigest") = 'text' AND length("policyDigest") = 64 AND length(CAST("policyDigest" AS BLOB)) = 64 AND "policyDigest" NOT GLOB '*[^0-9a-f]*')
);
CREATE UNIQUE INDEX "QualityJourneyE2CampaignPolicy_allocationDigest_key" ON "QualityJourneyE2CampaignPolicy"("allocationDigest");
-- One retained original allocation for a Journey/target, across every successor.
CREATE UNIQUE INDEX "QualityJourneyE2CampaignPolicy_journey_target_key" ON "QualityJourneyE2CampaignPolicy"("journeyId", "targetProjectId");
CREATE UNIQUE INDEX "QualityJourneyE2CampaignPolicy_lineage_key" ON "QualityJourneyE2CampaignPolicy"("id", "journeyId", "targetProjectId");
CREATE UNIQUE INDEX "QualityJourneyE2CampaignPolicy_source_lineage_key" ON "QualityJourneyE2CampaignPolicy"("id", "journeyId", "targetProjectId", "sourceTupleDigest");

CREATE TABLE "QualityJourneyE2OperationPreparation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "coordinatorSessionId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL CHECK (typeof("generation") = 'integer' AND "generation" BETWEEN 1 AND 2147483647),
  "providerRunId" TEXT NOT NULL,
  "intentId" TEXT NOT NULL,
  "campaignPolicyId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('NATIVE_START', 'SETUP', 'PROVIDER_REQUEST', 'MCP_CALL')),
  "setupStage" TEXT,
  "sourceTupleDigest" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "envelopeDigest" TEXT NOT NULL,
  "sourceEventDigest" TEXT NOT NULL,
  "preparedAtEpochMs" BIGINT NOT NULL CHECK (typeof("preparedAtEpochMs") = 'integer' AND "preparedAtEpochMs" BETWEEN 0 AND 8640000000000000),
  "windowDurationMs" INTEGER NOT NULL CHECK (typeof("windowDurationMs") = 'integer' AND "windowDurationMs" BETWEEN 1 AND 2147483646),
  "windowDueAtEpochMs" BIGINT NOT NULL CHECK (typeof("windowDueAtEpochMs") = 'integer' AND "windowDueAtEpochMs" BETWEEN 0 AND 8640000000000000),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyE2OperationPreparation_journey_fkey" FOREIGN KEY ("journeyId", "targetProjectId") REFERENCES "QualityJourney"("id", "targetProjectId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2OperationPreparation_session_fkey" FOREIGN KEY ("coordinatorSessionId", "journeyId", "targetProjectId", "generation") REFERENCES "QualityJourneyCoordinatorSession"("id", "journeyId", "targetProjectId", "generation") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2OperationPreparation_run_fkey" FOREIGN KEY ("providerRunId", "journeyId", "targetProjectId", "coordinatorSessionId", "generation") REFERENCES "QualityJourneyProviderRun"("id", "journeyId", "targetProjectId", "sessionId", "coordinatorGeneration") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2OperationPreparation_intent_fkey" FOREIGN KEY ("intentId", "providerRunId") REFERENCES "QualityJourneyProviderDispatchIntent"("id", "providerRunId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2OperationPreparation_policy_fkey" FOREIGN KEY ("campaignPolicyId", "journeyId", "targetProjectId", "sourceTupleDigest") REFERENCES "QualityJourneyE2CampaignPolicy"("id", "journeyId", "targetProjectId", "sourceTupleDigest") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (typeof("id") = 'text' AND length("id") = 64 AND length(CAST("id" AS BLOB)) = 64 AND "id" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("journeyId") = 'text' AND length("journeyId") BETWEEN 1 AND 128 AND length(CAST("journeyId" AS BLOB)) = length("journeyId")),
  CHECK (typeof("targetProjectId") = 'text' AND length("targetProjectId") BETWEEN 1 AND 128 AND length(CAST("targetProjectId" AS BLOB)) = length("targetProjectId")),
  CHECK (typeof("coordinatorSessionId") = 'text' AND length("coordinatorSessionId") BETWEEN 1 AND 128 AND length(CAST("coordinatorSessionId" AS BLOB)) = length("coordinatorSessionId")),
  CHECK (typeof("providerRunId") = 'text' AND length("providerRunId") BETWEEN 1 AND 128 AND length(CAST("providerRunId" AS BLOB)) = length("providerRunId")),
  CHECK (typeof("intentId") = 'text' AND length("intentId") BETWEEN 1 AND 128 AND length(CAST("intentId" AS BLOB)) = length("intentId")),
  CHECK (typeof("campaignPolicyId") = 'text' AND length("campaignPolicyId") BETWEEN 1 AND 128 AND length(CAST("campaignPolicyId" AS BLOB)) = length("campaignPolicyId")),
  CHECK (typeof("operationId") = 'text' AND length("operationId") BETWEEN 1 AND 128 AND length(CAST("operationId" AS BLOB)) = length("operationId")),
  CHECK (typeof("sourceTupleDigest") = 'text' AND length("sourceTupleDigest") = 64 AND length(CAST("sourceTupleDigest" AS BLOB)) = 64 AND "sourceTupleDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("requestDigest") = 'text' AND length("requestDigest") = 64 AND length(CAST("requestDigest" AS BLOB)) = 64 AND "requestDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("envelopeDigest") = 'text' AND length("envelopeDigest") = 64 AND length(CAST("envelopeDigest" AS BLOB)) = 64 AND "envelopeDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("sourceEventDigest") = 'text' AND length("sourceEventDigest") = 64 AND length(CAST("sourceEventDigest" AS BLOB)) = 64 AND "sourceEventDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (("kind" = 'SETUP' AND "setupStage" IS NOT NULL AND "setupStage" IN ('DNS', 'TCP', 'TLS', 'UPGRADE'))
    OR ("kind" IN ('NATIVE_START', 'PROVIDER_REQUEST', 'MCP_CALL') AND "setupStage" IS NULL)),
  CHECK ("windowDueAtEpochMs" = "preparedAtEpochMs" + "windowDurationMs")
);
CREATE UNIQUE INDEX "QualityJourneyE2OperationPreparation_run_operation_key" ON "QualityJourneyE2OperationPreparation"("providerRunId", "operationId");
CREATE UNIQUE INDEX "QualityJourneyE2OperationPreparation_grant_lineage_key" ON "QualityJourneyE2OperationPreparation"("id", "providerRunId", "operationId");

CREATE TRIGGER "QualityJourneyE2CampaignPolicy_zero_insert"
BEFORE INSERT ON "QualityJourneyE2CampaignPolicy"
WHEN NEW."nativeStartsReserved" <> 0 OR NEW."providerRequestsReserved" <> 0
  OR NEW."operationsReserved" <> 0 OR NEW."bytesReserved" <> 0 OR NEW."framesReserved" <> 0
  OR NEW."setupReserved" <> 0 OR NEW."mcpCallsReserved" <> 0 OR NEW."version" <> 0
BEGIN
  SELECT RAISE(ABORT, 'E2 campaign allocation must begin unspent');
END;

CREATE TRIGGER "QualityJourneyE2CampaignPolicy_immutable_policy_monotonic_budget"
BEFORE UPDATE ON "QualityJourneyE2CampaignPolicy"
WHEN NEW."id" IS NOT OLD."id" OR NEW."allocationDigest" IS NOT OLD."allocationDigest"
  OR NEW."journeyId" IS NOT OLD."journeyId" OR NEW."targetProjectId" IS NOT OLD."targetProjectId"
  OR NEW."sourceTupleDigest" IS NOT OLD."sourceTupleDigest" OR NEW."policyVersion" IS NOT OLD."policyVersion"
  OR NEW."policyDigest" IS NOT OLD."policyDigest" OR NEW."createdAt" IS NOT OLD."createdAt"
  OR NEW."nativeStartWindowMs" IS NOT OLD."nativeStartWindowMs" OR NEW."dnsWindowMs" IS NOT OLD."dnsWindowMs"
  OR NEW."tcpWindowMs" IS NOT OLD."tcpWindowMs" OR NEW."tlsWindowMs" IS NOT OLD."tlsWindowMs"
  OR NEW."upgradeWindowMs" IS NOT OLD."upgradeWindowMs" OR NEW."providerRequestWindowMs" IS NOT OLD."providerRequestWindowMs"
  OR NEW."mcpCallWindowMs" IS NOT OLD."mcpCallWindowMs"
  OR NEW."actorMaxOperations" IS NOT OLD."actorMaxOperations" OR NEW."actorMaxBytes" IS NOT OLD."actorMaxBytes"
  OR NEW."actorMaxFrames" IS NOT OLD."actorMaxFrames" OR NEW."actorMaxSetup" IS NOT OLD."actorMaxSetup"
  OR NEW."actorMaxProviderRequests" IS NOT OLD."actorMaxProviderRequests" OR NEW."actorMaxMcpCalls" IS NOT OLD."actorMaxMcpCalls"
  OR NEW."journeyMaxNativeStarts" IS NOT OLD."journeyMaxNativeStarts" OR NEW."journeyMaxTurnStarts" IS NOT OLD."journeyMaxTurnStarts"
  OR NEW."maxNativeStarts" IS NOT OLD."maxNativeStarts" OR NEW."maxProviderRequests" IS NOT OLD."maxProviderRequests"
  OR NEW."maxOperations" IS NOT OLD."maxOperations" OR NEW."maxBytes" IS NOT OLD."maxBytes"
  OR NEW."maxFrames" IS NOT OLD."maxFrames" OR NEW."maxSetup" IS NOT OLD."maxSetup" OR NEW."maxMcpCalls" IS NOT OLD."maxMcpCalls"
  OR NEW."nativeStartsReserved" < OLD."nativeStartsReserved" OR NEW."providerRequestsReserved" < OLD."providerRequestsReserved"
  OR NEW."operationsReserved" < OLD."operationsReserved" OR NEW."bytesReserved" < OLD."bytesReserved"
  OR NEW."framesReserved" < OLD."framesReserved" OR NEW."setupReserved" < OLD."setupReserved" OR NEW."mcpCallsReserved" < OLD."mcpCallsReserved"
  OR NEW."version" <> OLD."version" + 1
BEGIN
  SELECT RAISE(ABORT, 'E2 campaign policy or nonrefundable budget refused');
END;

CREATE TRIGGER "QualityJourneyE2CampaignPolicy_no_delete"
BEFORE DELETE ON "QualityJourneyE2CampaignPolicy"
BEGIN
  SELECT RAISE(ABORT, 'E2 campaign allocation must be retained');
END;

CREATE TRIGGER "QualityJourneyE2OperationPreparation_policy_window_insert"
BEFORE INSERT ON "QualityJourneyE2OperationPreparation"
WHEN NOT EXISTS (
  SELECT 1 FROM "QualityJourneyE2CampaignPolicy" AS "policy"
  WHERE "policy"."id" = NEW."campaignPolicyId" AND "policy"."journeyId" = NEW."journeyId"
    AND "policy"."targetProjectId" = NEW."targetProjectId" AND "policy"."sourceTupleDigest" = NEW."sourceTupleDigest"
    AND NEW."windowDurationMs" = CASE
      WHEN NEW."kind" = 'NATIVE_START' THEN "policy"."nativeStartWindowMs"
      WHEN NEW."kind" = 'SETUP' AND NEW."setupStage" = 'DNS' THEN "policy"."dnsWindowMs"
      WHEN NEW."kind" = 'SETUP' AND NEW."setupStage" = 'TCP' THEN "policy"."tcpWindowMs"
      WHEN NEW."kind" = 'SETUP' AND NEW."setupStage" = 'TLS' THEN "policy"."tlsWindowMs"
      WHEN NEW."kind" = 'SETUP' AND NEW."setupStage" = 'UPGRADE' THEN "policy"."upgradeWindowMs"
      WHEN NEW."kind" = 'PROVIDER_REQUEST' THEN "policy"."providerRequestWindowMs"
      WHEN NEW."kind" = 'MCP_CALL' THEN "policy"."mcpCallWindowMs"
      ELSE NULL END
)
BEGIN
  SELECT RAISE(ABORT, 'E2 preparation requires exact immutable policy window');
END;

CREATE TRIGGER "QualityJourneyE2OperationPreparation_no_update"
BEFORE UPDATE ON "QualityJourneyE2OperationPreparation"
BEGIN
  SELECT RAISE(ABORT, 'E2 operation preparation is insert-only');
END;

CREATE TRIGGER "QualityJourneyE2OperationPreparation_no_delete"
BEFORE DELETE ON "QualityJourneyE2OperationPreparation"
BEGIN
  SELECT RAISE(ABORT, 'E2 operation preparation must be retained');
END;

-- SQLite cannot ALTER an existing table to add a composite FK. These two
-- bounded rebuilds preserve every original column/check/FK/index/trigger. The
-- canonical schema and earlier migrations have no incoming FK to either table.
-- Foreign keys stay enabled; no PRAGMA weakens them and no row is discarded.
-- New joins remain NULL for all copied rows. INSERT-nonnull triggers are created
-- only after copying, so historical receipts are retained without adoption.
CREATE TABLE "new_QualityJourneyE2Retirement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "coordinatorSessionId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL CHECK (typeof("generation") = 'integer' AND "generation" BETWEEN 1 AND 2147483647),
  "state" TEXT NOT NULL DEFAULT 'ACTIVE',
  "requestId" TEXT,
  "requestedAt" DATETIME,
  "requestReason" TEXT,
  "effectiveAt" DATETIME,
  "effectiveEvidenceDigest" TEXT,
  "campaignPolicyId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("version") = 'integer' AND "version" BETWEEN 0 AND 2147483646),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyE2Retirement_journey_fkey" FOREIGN KEY ("journeyId", "targetProjectId") REFERENCES "QualityJourney"("id", "targetProjectId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2Retirement_session_fkey" FOREIGN KEY ("coordinatorSessionId", "journeyId", "targetProjectId", "generation") REFERENCES "QualityJourneyCoordinatorSession"("id", "journeyId", "targetProjectId", "generation") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2Retirement_campaign_fkey" FOREIGN KEY ("campaignPolicyId", "journeyId", "targetProjectId") REFERENCES "QualityJourneyE2CampaignPolicy"("id", "journeyId", "targetProjectId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (typeof("id") = 'text' AND length("id") BETWEEN 1 AND 128 AND length(CAST("id" AS BLOB)) = length("id")),
  CHECK (typeof("journeyId") = 'text' AND length("journeyId") BETWEEN 1 AND 128 AND length(CAST("journeyId" AS BLOB)) = length("journeyId")),
  CHECK (typeof("targetProjectId") = 'text' AND length("targetProjectId") BETWEEN 1 AND 128 AND length(CAST("targetProjectId" AS BLOB)) = length("targetProjectId")),
  CHECK (typeof("coordinatorSessionId") = 'text' AND length("coordinatorSessionId") BETWEEN 1 AND 128 AND length(CAST("coordinatorSessionId" AS BLOB)) = length("coordinatorSessionId")),
  CHECK ("requestId" IS NULL OR (typeof("requestId") = 'text' AND length("requestId") BETWEEN 1 AND 128 AND length(CAST("requestId" AS BLOB)) = length("requestId"))),
  CHECK ("campaignPolicyId" IS NULL OR (typeof("campaignPolicyId") = 'text' AND length("campaignPolicyId") BETWEEN 1 AND 128 AND length(CAST("campaignPolicyId" AS BLOB)) = length("campaignPolicyId"))),
  CHECK ("effectiveEvidenceDigest" IS NULL OR (typeof("effectiveEvidenceDigest") = 'text' AND length("effectiveEvidenceDigest") = 64 AND length(CAST("effectiveEvidenceDigest" AS BLOB)) = 64 AND "effectiveEvidenceDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK ("requestReason" IS NULL OR "requestReason" IN ('PAUSE', 'REVOKE', 'CANCEL', 'SUPERSEDE', 'LEASE_EXPIRED', 'RUN_RETENTION_EXPIRED', 'INTENT_DEADLINE_EXPIRED', 'ATTEMPT_TERMINAL', 'RUN_TERMINAL', 'TRANSFER_REQUESTED', 'SOURCE_FAILURE')),
  CHECK (
    ("state" = 'ACTIVE' AND "requestId" IS NULL AND "requestedAt" IS NULL AND "requestReason" IS NULL AND "effectiveAt" IS NULL AND "effectiveEvidenceDigest" IS NULL)
    OR ("state" = 'RETIRE_REQUESTED' AND "requestId" IS NOT NULL AND "requestedAt" IS NOT NULL AND "requestReason" IS NOT NULL AND "effectiveAt" IS NULL AND "effectiveEvidenceDigest" IS NULL)
    OR ("state" = 'RETIRE_EFFECTIVE' AND "requestId" IS NOT NULL AND "requestedAt" IS NOT NULL AND "requestReason" IS NOT NULL AND "effectiveAt" IS NOT NULL AND "effectiveEvidenceDigest" IS NOT NULL)
  )
);
INSERT INTO "new_QualityJourneyE2Retirement" (
  "id", "journeyId", "targetProjectId", "coordinatorSessionId", "generation", "state", "requestId", "requestedAt",
  "requestReason", "effectiveAt", "effectiveEvidenceDigest", "campaignPolicyId", "version", "createdAt"
)
SELECT "id", "journeyId", "targetProjectId", "coordinatorSessionId", "generation", "state", "requestId", "requestedAt",
  "requestReason", "effectiveAt", "effectiveEvidenceDigest", NULL, "version", "createdAt"
FROM "QualityJourneyE2Retirement";
DROP TABLE "QualityJourneyE2Retirement";
ALTER TABLE "new_QualityJourneyE2Retirement" RENAME TO "QualityJourneyE2Retirement";
CREATE UNIQUE INDEX "QualityJourneyE2Retirement_scope_key" ON "QualityJourneyE2Retirement"("journeyId", "targetProjectId", "coordinatorSessionId", "generation");
CREATE UNIQUE INDEX "QualityJourneyE2Retirement_session_generation_key" ON "QualityJourneyE2Retirement"("coordinatorSessionId", "generation");

CREATE TABLE "new_QualityJourneyE2Grant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "providerRunId" TEXT NOT NULL,
  "actorCustodyId" TEXT NOT NULL,
  "intentId" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "coordinatorSessionId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL CHECK (typeof("generation") = 'integer' AND "generation" BETWEEN 1 AND 2147483647),
  "attemptId" TEXT NOT NULL,
  "authorizationId" TEXT NOT NULL,
  "leaseId" TEXT NOT NULL,
  "assignmentGeneration" INTEGER NOT NULL CHECK (typeof("assignmentGeneration") = 'integer' AND "assignmentGeneration" BETWEEN 1 AND 2147483647),
  "operationId" TEXT NOT NULL,
  "operationPreparationId" TEXT,
  "sequence" INTEGER NOT NULL CHECK (typeof("sequence") = 'integer' AND "sequence" BETWEEN 0 AND 31),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('NATIVE_START', 'SETUP', 'PROVIDER_REQUEST', 'MCP_CALL')),
  "setupStage" TEXT,
  "rangeId" TEXT NOT NULL CHECK ("rangeId" = "operationId"),
  "parentOperationId" TEXT,
  "sourceTupleDigest" TEXT NOT NULL,
  "envelopeDigest" TEXT NOT NULL,
  "payloadDigest" TEXT,
  "payloadByteLength" INTEGER,
  "payloadReceiveTimeoutMs" INTEGER,
  "requestDigest" TEXT NOT NULL,
  "earliestDueAt" DATETIME NOT NULL,
  "dueAtSourceDigest" TEXT NOT NULL,
  "eligibilitySampleAt" DATETIME NOT NULL,
  "admissionVersion" INTEGER NOT NULL CHECK (typeof("admissionVersion") = 'integer' AND "admissionVersion" BETWEEN 1 AND 2147483646),
  "maxBytes" INTEGER NOT NULL CHECK (typeof("maxBytes") = 'integer' AND "maxBytes" BETWEEN 0 AND 8388608),
  "maxFrames" INTEGER NOT NULL CHECK (typeof("maxFrames") = 'integer' AND "maxFrames" BETWEEN 0 AND 512),
  "maxControlFrames" INTEGER NOT NULL CHECK (typeof("maxControlFrames") = 'integer' AND "maxControlFrames" BETWEEN 0 AND "maxFrames"),
  "maxDescendants" INTEGER NOT NULL CHECK (typeof("maxDescendants") = 'integer' AND "maxDescendants" BETWEEN 0 AND 1),
  "handoffId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'COMMITTED_UNDELIVERED' CHECK ("state" IN ('COMMITTED_UNDELIVERED', 'HANDED_TO_ACTOR', 'EFFECT_UNKNOWN', 'RECONCILED')),
  "handedAt" DATETIME,
  "reconciledAt" DATETIME,
  "reconciliationDigest" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyE2Grant_journey_fkey" FOREIGN KEY ("journeyId", "targetProjectId") REFERENCES "QualityJourney"("id", "targetProjectId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2Grant_session_fkey" FOREIGN KEY ("coordinatorSessionId", "journeyId", "targetProjectId", "generation") REFERENCES "QualityJourneyCoordinatorSession"("id", "journeyId", "targetProjectId", "generation") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2Grant_run_fkey" FOREIGN KEY ("providerRunId", "journeyId", "targetProjectId", "coordinatorSessionId", "generation", "attemptId", "authorizationId") REFERENCES "QualityJourneyProviderRun"("id", "journeyId", "targetProjectId", "sessionId", "coordinatorGeneration", "attemptId", "authorizationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2Grant_intent_fkey" FOREIGN KEY ("intentId", "providerRunId") REFERENCES "QualityJourneyProviderDispatchIntent"("id", "providerRunId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2Grant_actor_fkey" FOREIGN KEY ("actorCustodyId", "providerRunId", "intentId") REFERENCES "QualityJourneyE2ActorCustody"("id", "providerRunId", "intentId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2Grant_attempt_fkey" FOREIGN KEY ("attemptId") REFERENCES "QualityJourneyWorkAttempt"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2Grant_authorization_fkey" FOREIGN KEY ("authorizationId") REFERENCES "QualityJourneyWorkAuthorization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2Grant_preparation_fkey" FOREIGN KEY ("operationPreparationId", "providerRunId", "operationId") REFERENCES "QualityJourneyE2OperationPreparation"("id", "providerRunId", "operationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (typeof("id") = 'text' AND length("id") BETWEEN 1 AND 128 AND length(CAST("id" AS BLOB)) = length("id")),
  CHECK (typeof("providerRunId") = 'text' AND length("providerRunId") BETWEEN 1 AND 128 AND length(CAST("providerRunId" AS BLOB)) = length("providerRunId")),
  CHECK (typeof("actorCustodyId") = 'text' AND length("actorCustodyId") BETWEEN 1 AND 128 AND length(CAST("actorCustodyId" AS BLOB)) = length("actorCustodyId")),
  CHECK (typeof("intentId") = 'text' AND length("intentId") BETWEEN 1 AND 128 AND length(CAST("intentId" AS BLOB)) = length("intentId")),
  CHECK (typeof("journeyId") = 'text' AND length("journeyId") BETWEEN 1 AND 128 AND length(CAST("journeyId" AS BLOB)) = length("journeyId")),
  CHECK (typeof("targetProjectId") = 'text' AND length("targetProjectId") BETWEEN 1 AND 128 AND length(CAST("targetProjectId" AS BLOB)) = length("targetProjectId")),
  CHECK (typeof("coordinatorSessionId") = 'text' AND length("coordinatorSessionId") BETWEEN 1 AND 128 AND length(CAST("coordinatorSessionId" AS BLOB)) = length("coordinatorSessionId")),
  CHECK (typeof("attemptId") = 'text' AND length("attemptId") BETWEEN 1 AND 128 AND length(CAST("attemptId" AS BLOB)) = length("attemptId")),
  CHECK (typeof("authorizationId") = 'text' AND length("authorizationId") BETWEEN 1 AND 128 AND length(CAST("authorizationId" AS BLOB)) = length("authorizationId")),
  CHECK (typeof("leaseId") = 'text' AND length("leaseId") BETWEEN 1 AND 128 AND length(CAST("leaseId" AS BLOB)) = length("leaseId")),
  CHECK (typeof("operationId") = 'text' AND length("operationId") BETWEEN 1 AND 128 AND length(CAST("operationId" AS BLOB)) = length("operationId")),
  CHECK ("operationPreparationId" IS NULL OR (typeof("operationPreparationId") = 'text' AND length("operationPreparationId") = 64 AND length(CAST("operationPreparationId" AS BLOB)) = 64 AND "operationPreparationId" NOT GLOB '*[^0-9a-f]*')),
  CHECK (typeof("rangeId") = 'text' AND length("rangeId") BETWEEN 1 AND 128 AND length(CAST("rangeId" AS BLOB)) = length("rangeId")),
  CHECK (typeof("handoffId") = 'text' AND length("handoffId") BETWEEN 1 AND 128 AND length(CAST("handoffId" AS BLOB)) = length("handoffId")),
  CHECK ("parentOperationId" IS NULL OR (typeof("parentOperationId") = 'text' AND length("parentOperationId") BETWEEN 1 AND 128 AND length(CAST("parentOperationId" AS BLOB)) = length("parentOperationId"))),
  CHECK (typeof("sourceTupleDigest") = 'text' AND length("sourceTupleDigest") = 64 AND length(CAST("sourceTupleDigest" AS BLOB)) = 64 AND "sourceTupleDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("envelopeDigest") = 'text' AND length("envelopeDigest") = 64 AND length(CAST("envelopeDigest" AS BLOB)) = 64 AND "envelopeDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("requestDigest") = 'text' AND length("requestDigest") = 64 AND length(CAST("requestDigest" AS BLOB)) = 64 AND "requestDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("dueAtSourceDigest") = 'text' AND length("dueAtSourceDigest") = 64 AND length(CAST("dueAtSourceDigest" AS BLOB)) = 64 AND "dueAtSourceDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK ("payloadDigest" IS NULL OR (typeof("payloadDigest") = 'text' AND length("payloadDigest") = 64 AND length(CAST("payloadDigest" AS BLOB)) = 64 AND "payloadDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK ("reconciliationDigest" IS NULL OR (typeof("reconciliationDigest") = 'text' AND length("reconciliationDigest") = 64 AND length(CAST("reconciliationDigest" AS BLOB)) = 64 AND "reconciliationDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK (
    ("kind" IN ('NATIVE_START', 'SETUP') AND "payloadDigest" IS NULL AND "payloadByteLength" IS NULL AND "payloadReceiveTimeoutMs" IS NULL)
    OR ("kind" IN ('PROVIDER_REQUEST', 'MCP_CALL') AND "payloadDigest" IS NOT NULL
      AND "payloadByteLength" IS NOT NULL AND typeof("payloadByteLength") = 'integer' AND "payloadByteLength" BETWEEN 0 AND "maxBytes"
      AND "payloadReceiveTimeoutMs" IS NOT NULL AND typeof("payloadReceiveTimeoutMs") = 'integer' AND "payloadReceiveTimeoutMs" = 5000)
  ),
  CHECK (
    ("kind" = 'NATIVE_START' AND "sequence" = 0 AND "setupStage" IS NULL AND "parentOperationId" IS NULL AND "maxBytes" = 0 AND "maxFrames" = 0 AND "maxControlFrames" = 0 AND "maxDescendants" = 1)
    OR ("kind" = 'SETUP' AND "sequence" > 0 AND "setupStage" IS NOT NULL AND "parentOperationId" IS NOT NULL AND "maxDescendants" = 0 AND "maxControlFrames" = 0
      AND (("setupStage" IN ('DNS', 'TCP') AND "maxBytes" = 0 AND "maxFrames" = 0)
        OR ("setupStage" IN ('TLS', 'UPGRADE') AND "maxBytes" <= 65536 AND "maxFrames" <= 8)))
    OR ("kind" = 'PROVIDER_REQUEST' AND "sequence" > 0 AND "setupStage" IS NULL AND "parentOperationId" IS NOT NULL AND "maxBytes" <= 262144 AND "maxFrames" <= 32 AND "maxControlFrames" <= 8 AND "maxDescendants" = 0)
    OR ("kind" = 'MCP_CALL' AND "sequence" > 0 AND "setupStage" IS NULL AND "parentOperationId" IS NOT NULL AND "maxBytes" <= 65536 AND "maxFrames" <= 16 AND "maxControlFrames" = 0 AND "maxDescendants" = 0)
  ),
  CHECK (
    ("state" = 'COMMITTED_UNDELIVERED' AND "handedAt" IS NULL AND "reconciledAt" IS NULL AND "reconciliationDigest" IS NULL)
    OR ("state" = 'HANDED_TO_ACTOR' AND "handedAt" IS NOT NULL AND "reconciledAt" IS NULL AND "reconciliationDigest" IS NULL)
    OR ("state" = 'EFFECT_UNKNOWN' AND "reconciledAt" IS NULL AND "reconciliationDigest" IS NULL)
    OR ("state" = 'RECONCILED' AND "reconciledAt" IS NOT NULL AND "reconciliationDigest" IS NOT NULL)
  )
);
INSERT INTO "new_QualityJourneyE2Grant" (
  "id", "providerRunId", "actorCustodyId", "intentId", "journeyId", "targetProjectId", "coordinatorSessionId", "generation",
  "attemptId", "authorizationId", "leaseId", "assignmentGeneration", "operationId", "operationPreparationId", "sequence", "kind",
  "setupStage", "rangeId", "parentOperationId", "sourceTupleDigest", "envelopeDigest", "payloadDigest", "payloadByteLength", "payloadReceiveTimeoutMs",
  "requestDigest", "earliestDueAt", "dueAtSourceDigest", "eligibilitySampleAt", "admissionVersion", "maxBytes", "maxFrames", "maxControlFrames",
  "maxDescendants", "handoffId", "state", "handedAt", "reconciledAt", "reconciliationDigest", "createdAt"
)
SELECT "id", "providerRunId", "actorCustodyId", "intentId", "journeyId", "targetProjectId", "coordinatorSessionId", "generation",
  "attemptId", "authorizationId", "leaseId", "assignmentGeneration", "operationId", NULL, "sequence", "kind",
  "setupStage", "rangeId", "parentOperationId", "sourceTupleDigest", "envelopeDigest", "payloadDigest", "payloadByteLength", "payloadReceiveTimeoutMs",
  "requestDigest", "earliestDueAt", "dueAtSourceDigest", "eligibilitySampleAt", "admissionVersion", "maxBytes", "maxFrames", "maxControlFrames",
  "maxDescendants", "handoffId", "state", "handedAt", "reconciledAt", "reconciliationDigest", "createdAt"
FROM "QualityJourneyE2Grant";
DROP TABLE "QualityJourneyE2Grant";
ALTER TABLE "new_QualityJourneyE2Grant" RENAME TO "QualityJourneyE2Grant";
CREATE UNIQUE INDEX "QualityJourneyE2Grant_handoffId_key" ON "QualityJourneyE2Grant"("handoffId");
CREATE UNIQUE INDEX "QualityJourneyE2Grant_run_operation_key" ON "QualityJourneyE2Grant"("providerRunId", "operationId");
CREATE UNIQUE INDEX "QualityJourneyE2Grant_actor_sequence_key" ON "QualityJourneyE2Grant"("actorCustodyId", "sequence");

-- Restore the original transition and retention contracts without alteration.
CREATE TRIGGER "QualityJourneyE2Retirement_immutable_transition"
BEFORE UPDATE ON "QualityJourneyE2Retirement"
WHEN NEW."id" IS NOT OLD."id"
  OR NEW."journeyId" IS NOT OLD."journeyId"
  OR NEW."targetProjectId" IS NOT OLD."targetProjectId"
  OR NEW."coordinatorSessionId" IS NOT OLD."coordinatorSessionId"
  OR NEW."generation" IS NOT OLD."generation"
  OR NEW."createdAt" IS NOT OLD."createdAt"
  OR NEW."version" < OLD."version"
  OR (NEW."state" IS NOT OLD."state" AND NOT (
    (OLD."state" = 'ACTIVE' AND NEW."state" = 'RETIRE_REQUESTED')
    OR (OLD."state" = 'RETIRE_REQUESTED' AND NEW."state" = 'RETIRE_EFFECTIVE')
  ))
  OR (NEW."state" IS NOT OLD."state" AND NEW."version" <= OLD."version")
  OR (OLD."state" <> 'ACTIVE' AND (
    NEW."requestId" IS NOT OLD."requestId"
    OR NEW."requestedAt" IS NOT OLD."requestedAt"
    OR NEW."requestReason" IS NOT OLD."requestReason"
  ))
  OR (OLD."state" = 'RETIRE_EFFECTIVE' AND (
    NEW."effectiveAt" IS NOT OLD."effectiveAt"
    OR NEW."effectiveEvidenceDigest" IS NOT OLD."effectiveEvidenceDigest"
  ))
BEGIN
  SELECT RAISE(ABORT, 'E2 retirement identity or transition refused');
END;

CREATE TRIGGER "QualityJourneyE2Grant_immutable_transition"
BEFORE UPDATE ON "QualityJourneyE2Grant"
WHEN NEW."id" IS NOT OLD."id"
  OR NEW."providerRunId" IS NOT OLD."providerRunId"
  OR NEW."actorCustodyId" IS NOT OLD."actorCustodyId"
  OR NEW."intentId" IS NOT OLD."intentId"
  OR NEW."journeyId" IS NOT OLD."journeyId"
  OR NEW."targetProjectId" IS NOT OLD."targetProjectId"
  OR NEW."coordinatorSessionId" IS NOT OLD."coordinatorSessionId"
  OR NEW."generation" IS NOT OLD."generation"
  OR NEW."attemptId" IS NOT OLD."attemptId"
  OR NEW."authorizationId" IS NOT OLD."authorizationId"
  OR NEW."leaseId" IS NOT OLD."leaseId"
  OR NEW."assignmentGeneration" IS NOT OLD."assignmentGeneration"
  OR NEW."operationId" IS NOT OLD."operationId"
  OR NEW."sequence" IS NOT OLD."sequence"
  OR NEW."kind" IS NOT OLD."kind"
  OR NEW."setupStage" IS NOT OLD."setupStage"
  OR NEW."rangeId" IS NOT OLD."rangeId"
  OR NEW."parentOperationId" IS NOT OLD."parentOperationId"
  OR NEW."sourceTupleDigest" IS NOT OLD."sourceTupleDigest"
  OR NEW."envelopeDigest" IS NOT OLD."envelopeDigest"
  OR NEW."payloadDigest" IS NOT OLD."payloadDigest"
  OR NEW."payloadByteLength" IS NOT OLD."payloadByteLength"
  OR NEW."payloadReceiveTimeoutMs" IS NOT OLD."payloadReceiveTimeoutMs"
  OR NEW."requestDigest" IS NOT OLD."requestDigest"
  OR NEW."earliestDueAt" IS NOT OLD."earliestDueAt"
  OR NEW."dueAtSourceDigest" IS NOT OLD."dueAtSourceDigest"
  OR NEW."eligibilitySampleAt" IS NOT OLD."eligibilitySampleAt"
  OR NEW."admissionVersion" IS NOT OLD."admissionVersion"
  OR NEW."maxBytes" IS NOT OLD."maxBytes"
  OR NEW."maxFrames" IS NOT OLD."maxFrames"
  OR NEW."maxControlFrames" IS NOT OLD."maxControlFrames"
  OR NEW."maxDescendants" IS NOT OLD."maxDescendants"
  OR NEW."handoffId" IS NOT OLD."handoffId"
  OR NEW."createdAt" IS NOT OLD."createdAt"
  OR (OLD."handedAt" IS NOT NULL AND NEW."handedAt" IS NOT OLD."handedAt")
  OR (OLD."reconciledAt" IS NOT NULL AND NEW."reconciledAt" IS NOT OLD."reconciledAt")
  OR (OLD."reconciliationDigest" IS NOT NULL AND NEW."reconciliationDigest" IS NOT OLD."reconciliationDigest")
  OR (NEW."state" IS NOT OLD."state" AND NOT (
    (OLD."state" = 'COMMITTED_UNDELIVERED' AND NEW."state" IN ('HANDED_TO_ACTOR', 'EFFECT_UNKNOWN', 'RECONCILED'))
    OR (OLD."state" = 'HANDED_TO_ACTOR' AND NEW."state" IN ('EFFECT_UNKNOWN', 'RECONCILED'))
    OR (OLD."state" = 'EFFECT_UNKNOWN' AND NEW."state" = 'RECONCILED')
  ))
BEGIN
  SELECT RAISE(ABORT, 'E2 grant identity or transition refused');
END;

CREATE TRIGGER "QualityJourneyE2Retirement_no_delete"
BEFORE DELETE ON "QualityJourneyE2Retirement"
BEGIN
  SELECT RAISE(ABORT, 'E2 retirement records must be retained');
END;

CREATE TRIGGER "QualityJourneyE2Grant_no_delete"
BEFORE DELETE ON "QualityJourneyE2Grant"
BEGIN
  SELECT RAISE(ABORT, 'E2 grant records must be retained');
END;

CREATE TRIGGER "QualityJourneyE2Retirement_campaign_required_insert"
BEFORE INSERT ON "QualityJourneyE2Retirement"
WHEN NEW."campaignPolicyId" IS NULL
BEGIN
  SELECT RAISE(ABORT, 'E2 retirement requires its original campaign policy');
END;

CREATE TRIGGER "QualityJourneyE2Retirement_campaign_immutable"
BEFORE UPDATE ON "QualityJourneyE2Retirement"
WHEN NEW."campaignPolicyId" IS NOT OLD."campaignPolicyId"
BEGIN
  SELECT RAISE(ABORT, 'E2 retirement campaign is write-once; historical adoption refused');
END;

CREATE TRIGGER "QualityJourneyE2Grant_preparation_required_insert"
BEFORE INSERT ON "QualityJourneyE2Grant"
WHEN NEW."operationPreparationId" IS NULL
BEGIN
  SELECT RAISE(ABORT, 'E2 grant requires its exact operation preparation');
END;

CREATE TRIGGER "QualityJourneyE2Grant_preparation_immutable"
BEFORE UPDATE ON "QualityJourneyE2Grant"
WHEN NEW."operationPreparationId" IS NOT OLD."operationPreparationId"
BEGIN
  SELECT RAISE(ABORT, 'E2 grant preparation is write-once; historical adoption refused');
END;
