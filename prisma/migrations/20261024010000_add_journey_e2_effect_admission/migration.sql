-- Additive E2 structure only. No historical enrollment, authority, or backfill.
ALTER TABLE "QualityJourney" ADD COLUMN "e2AdmissionVersion" INTEGER NOT NULL DEFAULT 0
  CHECK (typeof("e2AdmissionVersion") = 'integer' AND "e2AdmissionVersion" BETWEEN 0 AND 2147483646);
ALTER TABLE "QualityJourney" ADD COLUMN "e2NativeStartsReserved" INTEGER NOT NULL DEFAULT 0
  CHECK (typeof("e2NativeStartsReserved") = 'integer' AND "e2NativeStartsReserved" BETWEEN 0 AND 6);
ALTER TABLE "QualityJourney" ADD COLUMN "e2TurnStartsReserved" INTEGER NOT NULL DEFAULT 0
  CHECK (typeof("e2TurnStartsReserved") = 'integer' AND "e2TurnStartsReserved" BETWEEN 0 AND 5);

ALTER TABLE "QualityJourneyCoordinatorSession" ADD COLUMN "e2EnrollmentKind" TEXT;
ALTER TABLE "QualityJourneyCoordinatorSession" ADD COLUMN "e2EnrollmentDigest" TEXT;
ALTER TABLE "QualityJourneyCoordinatorSession" ADD COLUMN "e2EnrolledAt" DATETIME
  CHECK (
    ("e2EnrollmentKind" IS NULL AND "e2EnrollmentDigest" IS NULL AND "e2EnrolledAt" IS NULL)
    OR ("e2EnrollmentKind" IS NOT NULL AND "e2EnrollmentKind" = 'E2_V1'
      AND "e2EnrollmentDigest" IS NOT NULL AND typeof("e2EnrollmentDigest") = 'text'
      AND length("e2EnrollmentDigest") = 64 AND length(CAST("e2EnrollmentDigest" AS BLOB)) = 64
      AND "e2EnrollmentDigest" NOT GLOB '*[^0-9a-f]*' AND "e2EnrolledAt" IS NOT NULL)
  );

-- Supporting composite keys enforce related identities, rather than independent IDs.
CREATE UNIQUE INDEX "QualityJourney_e2_lineage_key" ON "QualityJourney"("id", "targetProjectId");
CREATE UNIQUE INDEX "QualityJourneyCoordinatorSession_e2_lineage_key" ON "QualityJourneyCoordinatorSession"("id", "journeyId", "targetProjectId", "generation");
-- Actor custody deliberately has no attempt/authorization fields. This additional
-- subset key represents its exact run/session lineage without extending its shape.
CREATE UNIQUE INDEX "QualityJourneyProviderRun_e2_actor_lineage_key" ON "QualityJourneyProviderRun"("id", "journeyId", "targetProjectId", "sessionId", "coordinatorGeneration");
CREATE UNIQUE INDEX "QualityJourneyProviderRun_e2_grant_lineage_key" ON "QualityJourneyProviderRun"("id", "journeyId", "targetProjectId", "sessionId", "coordinatorGeneration", "attemptId", "authorizationId");
CREATE UNIQUE INDEX "QualityJourneyProviderDispatchIntent_e2_lineage_key" ON "QualityJourneyProviderDispatchIntent"("id", "providerRunId");

CREATE TABLE "QualityJourneyE2Retirement" (
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
  "version" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("version") = 'integer' AND "version" BETWEEN 0 AND 2147483646),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyE2Retirement_journey_fkey" FOREIGN KEY ("journeyId", "targetProjectId") REFERENCES "QualityJourney"("id", "targetProjectId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2Retirement_session_fkey" FOREIGN KEY ("coordinatorSessionId", "journeyId", "targetProjectId", "generation") REFERENCES "QualityJourneyCoordinatorSession"("id", "journeyId", "targetProjectId", "generation") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (typeof("id") = 'text' AND length("id") BETWEEN 1 AND 128 AND length(CAST("id" AS BLOB)) = length("id")),
  CHECK (typeof("journeyId") = 'text' AND length("journeyId") BETWEEN 1 AND 128 AND length(CAST("journeyId" AS BLOB)) = length("journeyId")),
  CHECK (typeof("targetProjectId") = 'text' AND length("targetProjectId") BETWEEN 1 AND 128 AND length(CAST("targetProjectId" AS BLOB)) = length("targetProjectId")),
  CHECK (typeof("coordinatorSessionId") = 'text' AND length("coordinatorSessionId") BETWEEN 1 AND 128 AND length(CAST("coordinatorSessionId" AS BLOB)) = length("coordinatorSessionId")),
  CHECK ("requestId" IS NULL OR (typeof("requestId") = 'text' AND length("requestId") BETWEEN 1 AND 128 AND length(CAST("requestId" AS BLOB)) = length("requestId"))),
  CHECK ("effectiveEvidenceDigest" IS NULL OR (typeof("effectiveEvidenceDigest") = 'text' AND length("effectiveEvidenceDigest") = 64 AND length(CAST("effectiveEvidenceDigest" AS BLOB)) = 64 AND "effectiveEvidenceDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK ("requestReason" IS NULL OR "requestReason" IN ('PAUSE', 'REVOKE', 'CANCEL', 'SUPERSEDE', 'LEASE_EXPIRED', 'RUN_RETENTION_EXPIRED', 'INTENT_DEADLINE_EXPIRED', 'ATTEMPT_TERMINAL', 'RUN_TERMINAL', 'TRANSFER_REQUESTED', 'SOURCE_FAILURE')),
  CHECK (
    ("state" = 'ACTIVE' AND "requestId" IS NULL AND "requestedAt" IS NULL AND "requestReason" IS NULL AND "effectiveAt" IS NULL AND "effectiveEvidenceDigest" IS NULL)
    OR ("state" = 'RETIRE_REQUESTED' AND "requestId" IS NOT NULL AND "requestedAt" IS NOT NULL AND "requestReason" IS NOT NULL AND "effectiveAt" IS NULL AND "effectiveEvidenceDigest" IS NULL)
    OR ("state" = 'RETIRE_EFFECTIVE' AND "requestId" IS NOT NULL AND "requestedAt" IS NOT NULL AND "requestReason" IS NOT NULL AND "effectiveAt" IS NOT NULL AND "effectiveEvidenceDigest" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "QualityJourneyE2Retirement_scope_key" ON "QualityJourneyE2Retirement"("journeyId", "targetProjectId", "coordinatorSessionId", "generation");
CREATE UNIQUE INDEX "QualityJourneyE2Retirement_session_generation_key" ON "QualityJourneyE2Retirement"("coordinatorSessionId", "generation");

CREATE TABLE "QualityJourneyE2ActorCustody" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "providerRunId" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "coordinatorSessionId" TEXT NOT NULL,
  "generation" INTEGER NOT NULL CHECK (typeof("generation") = 'integer' AND "generation" BETWEEN 1 AND 2147483647),
  "intentId" TEXT NOT NULL,
  "slotId" TEXT NOT NULL DEFAULT 'HUB' CHECK ("slotId" = 'HUB'),
  "sourceTupleDigest" TEXT NOT NULL,
  "constructorDigest" TEXT NOT NULL,
  "parentIncarnationDigest" TEXT NOT NULL,
  "prospectiveChildNonceDigest" TEXT NOT NULL,
  "privateChannelDigest" TEXT NOT NULL,
  "originalChildIncarnationDigest" TEXT,
  "state" TEXT NOT NULL DEFAULT 'PRESPAWN_COMMITTED' CHECK ("state" IN ('PRESPAWN_COMMITTED', 'SPAWN_UNKNOWN', 'BOUND', 'EFFECT_UNKNOWN', 'TERMINAL_PROVED')),
  "operationsReserved" INTEGER NOT NULL DEFAULT 1 CHECK (typeof("operationsReserved") = 'integer' AND "operationsReserved" BETWEEN 1 AND 32),
  "bytesReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("bytesReserved") = 'integer' AND "bytesReserved" BETWEEN 0 AND 8388608),
  "framesReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("framesReserved") = 'integer' AND "framesReserved" BETWEEN 0 AND 512),
  "setupReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("setupReserved") = 'integer' AND "setupReserved" BETWEEN 0 AND 4),
  "providerRequestsReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("providerRequestsReserved") = 'integer' AND "providerRequestsReserved" BETWEEN 0 AND 5),
  "mcpCallsReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("mcpCallsReserved") = 'integer' AND "mcpCallsReserved" BETWEEN 0 AND 16),
  "recoveryControlsReserved" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("recoveryControlsReserved") = 'integer' AND "recoveryControlsReserved" = 0),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyE2ActorCustody_journey_fkey" FOREIGN KEY ("journeyId", "targetProjectId") REFERENCES "QualityJourney"("id", "targetProjectId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2ActorCustody_session_fkey" FOREIGN KEY ("coordinatorSessionId", "journeyId", "targetProjectId", "generation") REFERENCES "QualityJourneyCoordinatorSession"("id", "journeyId", "targetProjectId", "generation") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2ActorCustody_run_fkey" FOREIGN KEY ("providerRunId", "journeyId", "targetProjectId", "coordinatorSessionId", "generation") REFERENCES "QualityJourneyProviderRun"("id", "journeyId", "targetProjectId", "sessionId", "coordinatorGeneration") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyE2ActorCustody_intent_fkey" FOREIGN KEY ("intentId", "providerRunId") REFERENCES "QualityJourneyProviderDispatchIntent"("id", "providerRunId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (typeof("id") = 'text' AND length("id") BETWEEN 1 AND 128 AND length(CAST("id" AS BLOB)) = length("id")),
  CHECK (typeof("providerRunId") = 'text' AND length("providerRunId") BETWEEN 1 AND 128 AND length(CAST("providerRunId" AS BLOB)) = length("providerRunId")),
  CHECK (typeof("journeyId") = 'text' AND length("journeyId") BETWEEN 1 AND 128 AND length(CAST("journeyId" AS BLOB)) = length("journeyId")),
  CHECK (typeof("targetProjectId") = 'text' AND length("targetProjectId") BETWEEN 1 AND 128 AND length(CAST("targetProjectId" AS BLOB)) = length("targetProjectId")),
  CHECK (typeof("coordinatorSessionId") = 'text' AND length("coordinatorSessionId") BETWEEN 1 AND 128 AND length(CAST("coordinatorSessionId" AS BLOB)) = length("coordinatorSessionId")),
  CHECK (typeof("intentId") = 'text' AND length("intentId") BETWEEN 1 AND 128 AND length(CAST("intentId" AS BLOB)) = length("intentId")),
  CHECK (typeof("sourceTupleDigest") = 'text' AND length("sourceTupleDigest") = 64 AND length(CAST("sourceTupleDigest" AS BLOB)) = 64 AND "sourceTupleDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("constructorDigest") = 'text' AND length("constructorDigest") = 64 AND length(CAST("constructorDigest" AS BLOB)) = 64 AND "constructorDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("parentIncarnationDigest") = 'text' AND length("parentIncarnationDigest") = 64 AND length(CAST("parentIncarnationDigest" AS BLOB)) = 64 AND "parentIncarnationDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("prospectiveChildNonceDigest") = 'text' AND length("prospectiveChildNonceDigest") = 64 AND length(CAST("prospectiveChildNonceDigest" AS BLOB)) = 64 AND "prospectiveChildNonceDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("privateChannelDigest") = 'text' AND length("privateChannelDigest") = 64 AND length(CAST("privateChannelDigest" AS BLOB)) = 64 AND "privateChannelDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK ("originalChildIncarnationDigest" IS NULL OR (typeof("originalChildIncarnationDigest") = 'text' AND length("originalChildIncarnationDigest") = 64 AND length(CAST("originalChildIncarnationDigest" AS BLOB)) = 64 AND "originalChildIncarnationDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK (("state" IN ('PRESPAWN_COMMITTED', 'SPAWN_UNKNOWN') AND "originalChildIncarnationDigest" IS NULL)
    OR ("state" IN ('BOUND', 'EFFECT_UNKNOWN') AND "originalChildIncarnationDigest" IS NOT NULL)
    OR "state" = 'TERMINAL_PROVED')
);
CREATE UNIQUE INDEX "QualityJourneyE2ActorCustody_providerRunId_key" ON "QualityJourneyE2ActorCustody"("providerRunId");
CREATE UNIQUE INDEX "QualityJourneyE2ActorCustody_original_parent_nonce_key" ON "QualityJourneyE2ActorCustody"("parentIncarnationDigest", "prospectiveChildNonceDigest");
CREATE UNIQUE INDEX "QualityJourneyE2ActorCustody_e2_lineage_key" ON "QualityJourneyE2ActorCustody"("id", "providerRunId", "intentId");

CREATE TABLE "QualityJourneyE2Grant" (
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
CREATE UNIQUE INDEX "QualityJourneyE2Grant_handoffId_key" ON "QualityJourneyE2Grant"("handoffId");
CREATE UNIQUE INDEX "QualityJourneyE2Grant_run_operation_key" ON "QualityJourneyE2Grant"("providerRunId", "operationId");
CREATE UNIQUE INDEX "QualityJourneyE2Grant_actor_sequence_key" ON "QualityJourneyE2Grant"("actorCustodyId", "sequence");

-- Enrollment is decided on INSERT only. An all-null historical session cannot
-- become an E2 candidate by UPDATE, and an enrolled candidate cannot be erased.
CREATE TRIGGER "QualityJourneyCoordinatorSession_e2_enrollment_immutable"
BEFORE UPDATE ON "QualityJourneyCoordinatorSession"
WHEN NEW."e2EnrollmentKind" IS NOT OLD."e2EnrollmentKind"
  OR NEW."e2EnrollmentDigest" IS NOT OLD."e2EnrollmentDigest"
  OR NEW."e2EnrolledAt" IS NOT OLD."e2EnrolledAt"
BEGIN
  SELECT RAISE(ABORT, 'E2 enrollment is insert-only');
END;

CREATE TRIGGER "QualityJourney_e2_reservations_monotonic"
BEFORE UPDATE ON "QualityJourney"
WHEN NEW."e2AdmissionVersion" < OLD."e2AdmissionVersion"
  OR NEW."e2NativeStartsReserved" < OLD."e2NativeStartsReserved"
  OR NEW."e2TurnStartsReserved" < OLD."e2TurnStartsReserved"
BEGIN
  SELECT RAISE(ABORT, 'E2 Journey reservations cannot decrease');
END;

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

CREATE TRIGGER "QualityJourneyE2ActorCustody_immutable_transition"
BEFORE UPDATE ON "QualityJourneyE2ActorCustody"
WHEN NEW."id" IS NOT OLD."id"
  OR NEW."providerRunId" IS NOT OLD."providerRunId"
  OR NEW."journeyId" IS NOT OLD."journeyId"
  OR NEW."targetProjectId" IS NOT OLD."targetProjectId"
  OR NEW."coordinatorSessionId" IS NOT OLD."coordinatorSessionId"
  OR NEW."generation" IS NOT OLD."generation"
  OR NEW."intentId" IS NOT OLD."intentId"
  OR NEW."slotId" IS NOT OLD."slotId"
  OR NEW."sourceTupleDigest" IS NOT OLD."sourceTupleDigest"
  OR NEW."constructorDigest" IS NOT OLD."constructorDigest"
  OR NEW."parentIncarnationDigest" IS NOT OLD."parentIncarnationDigest"
  OR NEW."prospectiveChildNonceDigest" IS NOT OLD."prospectiveChildNonceDigest"
  OR NEW."privateChannelDigest" IS NOT OLD."privateChannelDigest"
  OR NEW."createdAt" IS NOT OLD."createdAt"
  OR NEW."operationsReserved" < OLD."operationsReserved"
  OR NEW."bytesReserved" < OLD."bytesReserved"
  OR NEW."framesReserved" < OLD."framesReserved"
  OR NEW."setupReserved" < OLD."setupReserved"
  OR NEW."providerRequestsReserved" < OLD."providerRequestsReserved"
  OR NEW."mcpCallsReserved" < OLD."mcpCallsReserved"
  OR NEW."recoveryControlsReserved" < OLD."recoveryControlsReserved"
  OR (NEW."originalChildIncarnationDigest" IS NOT OLD."originalChildIncarnationDigest" AND NOT (
    OLD."originalChildIncarnationDigest" IS NULL AND NEW."originalChildIncarnationDigest" IS NOT NULL
    AND OLD."state" = 'PRESPAWN_COMMITTED' AND NEW."state" = 'BOUND'
  ))
  OR (NEW."state" IS NOT OLD."state" AND NOT (
    (OLD."state" = 'PRESPAWN_COMMITTED' AND NEW."state" IN ('SPAWN_UNKNOWN', 'BOUND'))
    OR (OLD."state" = 'BOUND' AND NEW."state" IN ('EFFECT_UNKNOWN', 'TERMINAL_PROVED'))
    OR (OLD."state" IN ('SPAWN_UNKNOWN', 'EFFECT_UNKNOWN') AND NEW."state" = 'TERMINAL_PROVED')
  ))
BEGIN
  SELECT RAISE(ABORT, 'E2 actor identity, reservation or transition refused');
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

-- A digest in a terminal row is inert evidence. Exact original nonstart/drain
-- proof, enrolled source authority and parent-operation lineage are checked in
-- the owning Prisma transaction; these at-rest checks do not grant dispatch.

-- Retained receipts and consumed identities cannot be deleted and recreated.
CREATE TRIGGER "QualityJourneyE2Retirement_no_delete"
BEFORE DELETE ON "QualityJourneyE2Retirement"
BEGIN
  SELECT RAISE(ABORT, 'E2 retirement records must be retained');
END;

CREATE TRIGGER "QualityJourneyE2ActorCustody_no_delete"
BEFORE DELETE ON "QualityJourneyE2ActorCustody"
BEGIN
  SELECT RAISE(ABORT, 'E2 actor custody records must be retained');
END;

CREATE TRIGGER "QualityJourneyE2Grant_no_delete"
BEFORE DELETE ON "QualityJourneyE2Grant"
BEGIN
  SELECT RAISE(ABORT, 'E2 grant records must be retained');
END;
