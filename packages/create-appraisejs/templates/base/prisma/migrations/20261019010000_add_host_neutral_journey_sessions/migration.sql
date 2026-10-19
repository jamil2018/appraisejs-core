-- CreateTable
CREATE TABLE "QualityJourneyCoordinatorSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "ownerPrincipalId" TEXT NOT NULL,
    "hostKind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "generation" INTEGER,
    "registrationKey" TEXT NOT NULL,
    "registrationRequestHash" TEXT NOT NULL,
    "predecessorSessionId" TEXT,
    "legacyHandoffId" TEXT,
    "transitionRequestId" TEXT,
    "transitionRequestHash" TEXT,
    "transitionRequestJson" TEXT,
    "transitionResultJson" TEXT,
    "provenance" TEXT NOT NULL,
    "activatedAt" DATETIME,
    "fencedAt" DATETIME,
    "fenceReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyCoordinatorSession_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyCoordinatorSession_predecessorSessionId_fkey" FOREIGN KEY ("predecessorSessionId") REFERENCES "QualityJourneyCoordinatorSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyWorkAttemptSessionBinding" (
    "attemptId" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "sessionId" TEXT,
    "coordinatorGeneration" INTEGER,
    "assignmentGeneration" INTEGER NOT NULL,
    "workItemId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "authorizationId" TEXT,
    "leaseId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "assignmentId" TEXT,
    "provenance" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyWorkAttemptSessionBinding_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyWorkAttemptSessionBinding_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QualityJourneyCoordinatorSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Additive DDL preserves authored rows and historical attempt bytes.
ALTER TABLE "QualityJourney" ADD COLUMN "hostingMode" TEXT NOT NULL DEFAULT 'LEGACY_UNRESOLVED';
ALTER TABLE "QualityJourney" ADD COLUMN "hostingProvenance" TEXT NOT NULL DEFAULT 'M03_SQL_V1:CLASSIFICATION_PENDING';
ALTER TABLE "QualityJourney" ADD COLUMN "currentCoordinatorSessionId" TEXT REFERENCES "QualityJourneyCoordinatorSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualityJourney" ADD COLUMN "ownershipVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "QualityJourney_currentCoordinatorSessionId_key" ON "QualityJourney"("currentCoordinatorSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyCoordinatorSession_legacyHandoffId_key" ON "QualityJourneyCoordinatorSession"("legacyHandoffId");

-- CreateIndex
CREATE INDEX "QualityJourneyCoordinatorSession_journeyId_targetProjectId_status_idx" ON "QualityJourneyCoordinatorSession"("journeyId", "targetProjectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyCoordinatorSession_journeyId_targetProjectId_generation_key" ON "QualityJourneyCoordinatorSession"("journeyId", "targetProjectId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyCoordinatorSession_journeyId_targetProjectId_registrationKey_key" ON "QualityJourneyCoordinatorSession"("journeyId", "targetProjectId", "registrationKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyCoordinatorSession_journeyId_targetProjectId_transitionRequestId_key" ON "QualityJourneyCoordinatorSession"("journeyId", "targetProjectId", "transitionRequestId");

-- CreateIndex
CREATE INDEX "QualityJourneyWorkAttemptSessionBinding_journeyId_targetProjectId_sessionId_idx" ON "QualityJourneyWorkAttemptSessionBinding"("journeyId", "targetProjectId", "sessionId");


-- Deterministic classifier v1. No provider, timestamp ordering, or admission-label
-- inference selects an owner. Unknown or conflicting lineage is quarantined.
UPDATE "QualityJourney" SET "hostingMode" = 'LEGACY_UNRESOLVED',
  "hostingProvenance" = 'M03_SQL_V1:UNPROVEN_OR_CONFLICTING_OWNERSHIP';

-- A target-consistent, single unfenced effective takeover is the only durable
-- coordinator authority that can be mapped without inventing a principal.
INSERT INTO "QualityJourneyCoordinatorSession" (
  "id", "journeyId", "targetProjectId", "ownerPrincipalId", "hostKind", "status", "generation",
  "registrationKey", "registrationRequestHash", "legacyHandoffId", "provenance", "activatedAt")
SELECT 'qjs_legacy_' || h."id", j."id", j."targetProjectId", 'legacy-handoff:' || h."id",
  'EXTERNAL_LEGACY', 'ACTIVE', h."generation", 'migration:' || h."id", 'legacy:' || h."id",
  h."id", 'M03_SQL_V1:PROVEN_EFFECTIVE_HANDOFF', h."takeoverAt"
FROM "QualityJourney" j JOIN "QualityJourneyCoordinatorHandoff" h ON h."journeyId" = j."id"
WHERE h."targetProjectId" = j."targetProjectId" AND h."takeoverAt" IS NOT NULL
  AND h."status" = 'CONNECTED' AND h."fencedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyCoordinatorHandoff" other WHERE other."journeyId" = j."id"
    AND other."takeoverAt" IS NOT NULL AND (other."generation" > h."generation" OR
      (other."id" <> h."id" AND other."fencedAt" IS NULL AND other."status" = 'CONNECTED')))
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyCoordinatorHandoff" bad WHERE bad."journeyId" = j."id" AND bad."targetProjectId" <> j."targetProjectId")
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyWorkItem" w WHERE w."journeyId" = j."id" AND w."targetProjectId" <> j."targetProjectId")
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyWorkAuthorization" a WHERE a."journeyId" = j."id" AND a."targetProjectId" <> j."targetProjectId")
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyWorkAttempt" a JOIN "QualityJourneyWorkItem" w ON w."id"=a."workItemId"
    LEFT JOIN "QualityJourneyWorkAuthorization" auth ON auth."id"=a."authorizationId"
    WHERE w."journeyId"=j."id" AND (a."status" NOT IN ('CLAIMED','WORKER_REQUESTED','IN_PROGRESS','COMPLETED','CANCELLED','REFUSED','FAILED','EXPIRED') OR (a."dispatchReservedAt" IS NOT NULL AND a."spawnReceiptId" IS NULL)
      OR a."assignmentId" IS NULL OR a."assignmentHash" IS NULL OR a."ownerTokenHash"='' OR auth."id" IS NULL
      OR a."assignmentGeneration" < 1 OR auth."role"<>w."role"
      OR (a."status" IN ('CLAIMED','WORKER_REQUESTED','IN_PROGRESS') AND
        (w."currentAttempt"<>a."attempt" OR w."status" NOT IN ('WORKER_REQUESTED','IN_PROGRESS')))
      OR a."executionMode" NOT IN ('MANAGED','EXTERNAL_V1')
      OR (a."executionMode"='EXTERNAL_V1' AND (a."externalPrincipalId" IS NULL OR a."externalPrincipalAssurance" IS NOT 'PROJECT_CREDENTIAL_ONLY'
        OR auth."externalPrincipalId" IS NOT a."externalPrincipalId" OR auth."externalPrincipalAssurance" IS NOT a."externalPrincipalAssurance"))
      OR (a."status" NOT IN ('COMPLETED','CANCELLED','REFUSED','FAILED','EXPIRED') AND (auth."revokedAt" IS NOT NULL OR auth."cancelledAt" IS NOT NULL))
      OR auth."workItemId"<>w."id" OR auth."journeyId"<>j."id" OR auth."targetProjectId"<>j."targetProjectId"))
  -- SQL checks receipt structure/scope only; canonical runtime checks its hash.
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyOwnedBrowser" b WHERE b."journeyId"=j."id"
    AND (b."status"<>'STOP_OBSERVED' OR b."targetProjectId"<>j."targetProjectId" OR b."stopReceiptHash" IS NULL
      OR CASE WHEN json_valid(b."stopReceiptJson") THEN
        json_type(b."stopReceiptJson") IS NOT 'object'
        OR json_extract(b."stopReceiptJson", '$.schemaVersion') IS NOT 'appraise.quality-journey-owned-browser-stop/v1'
        OR json_extract(b."stopReceiptJson", '$.status') IS NOT 'STOP_OBSERVED'
        OR json_extract(b."stopReceiptJson", '$.journeyId') IS NOT b."journeyId"
        OR json_extract(b."stopReceiptJson", '$.targetProjectId') IS NOT b."targetProjectId"
        OR json_extract(b."stopReceiptJson", '$.sessionId') IS NOT b."sessionId"
        OR json_extract(b."stopReceiptJson", '$.processInstanceId') IS NOT b."processInstanceId"
        OR json_type(b."stopReceiptJson", '$.generation') IS NOT 'integer'
        OR json_extract(b."stopReceiptJson", '$.generation') IS NOT b."generation"
        OR COALESCE(json_extract(b."stopReceiptJson", '$.observation'), '') NOT IN ('RUNTIME_CLOSE_CONFIRMED','NO_RUNTIME_LAUNCHED')
      ELSE 1 END))
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" e WHERE e."journeyId"=j."id"
    AND (e."targetProjectId"<>j."targetProjectId" OR e."status" NOT IN ('COMPLETED','CANCELLED')))
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" binding
    JOIN "QualityJourneyExecutionCycle" e ON e."id"=binding."executionCycleId"
    JOIN "TestRun" run ON run."id"=binding."testRunId"
    WHERE e."journeyId"=j."id" AND (run."targetProjectId"<>j."targetProjectId" OR run."status" NOT IN ('COMPLETED','CANCELLED')))
  AND (SELECT COUNT(DISTINCT a."externalPrincipalId")
    FROM "QualityJourneyWorkAttempt" a JOIN "QualityJourneyWorkItem" w ON w."id"=a."workItemId"
    WHERE w."journeyId"=j."id" AND a."executionMode"='EXTERNAL_V1'
      AND a."status" NOT IN ('COMPLETED','CANCELLED','REFUSED','FAILED','EXPIRED')) <= 1;

UPDATE "QualityJourney" SET "hostingMode" = 'EXTERNAL_LEGACY',
  "hostingProvenance" = 'M03_SQL_V1:PROVEN_EFFECTIVE_HANDOFF',
  "currentCoordinatorSessionId" = (SELECT s."id" FROM "QualityJourneyCoordinatorSession" s WHERE s."journeyId" = "QualityJourney"."id"),
  "ownershipVersion" = 1
WHERE EXISTS (SELECT 1 FROM "QualityJourneyCoordinatorSession" s WHERE s."journeyId" = "QualityJourney"."id");

-- No-takeover compatibility retains structurally valid independent Factory
-- assignments without asserting a common coordinator from their per-attempt
-- tokens. A live external-only path needs one authenticated principal. Mixed
-- live mechanisms need a unifying handoff; terminal admission history does not.
UPDATE "QualityJourney" SET "hostingMode" = 'EXTERNAL_LEGACY',
  "hostingProvenance" = CASE WHEN NOT EXISTS (
    SELECT 1 FROM "QualityJourneyWorkAttempt" a JOIN "QualityJourneyWorkItem" w ON w."id"=a."workItemId" WHERE w."journeyId"="QualityJourney"."id")
    THEN 'M03_SQL_V1:EMPTY_NO_SESSION' ELSE 'M03_SQL_V1:BOUNDED_NO_SESSION_LINEAGE' END
WHERE "hostingMode" = 'LEGACY_UNRESOLVED'
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyCoordinatorHandoff" h WHERE h."journeyId" = "QualityJourney"."id" AND h."takeoverAt" IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyWorkItem" w WHERE w."journeyId"="QualityJourney"."id" AND w."targetProjectId" <> "QualityJourney"."targetProjectId")
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyWorkAuthorization" a WHERE a."journeyId"="QualityJourney"."id" AND a."targetProjectId" <> "QualityJourney"."targetProjectId")
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyCoordinatorHandoff" h WHERE h."journeyId"="QualityJourney"."id" AND h."targetProjectId" <> "QualityJourney"."targetProjectId")
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyWorkAttempt" a JOIN "QualityJourneyWorkItem" w ON w."id"=a."workItemId"
    WHERE w."journeyId"="QualityJourney"."id" AND (a."executionMode" NOT IN ('MANAGED','EXTERNAL_V1') OR
      (a."executionMode"='EXTERNAL_V1' AND (a."externalPrincipalId" IS NULL OR a."externalPrincipalAssurance" <> 'PROJECT_CREDENTIAL_ONLY'))))
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyWorkAttempt" a JOIN "QualityJourneyWorkItem" w ON w."id"=a."workItemId"
    LEFT JOIN "QualityJourneyWorkAuthorization" auth ON auth."id"=a."authorizationId"
    WHERE w."journeyId"="QualityJourney"."id" AND (a."status" NOT IN ('CLAIMED','WORKER_REQUESTED','IN_PROGRESS','COMPLETED','CANCELLED','REFUSED','FAILED','EXPIRED') OR (a."dispatchReservedAt" IS NOT NULL AND a."spawnReceiptId" IS NULL)
      OR a."assignmentId" IS NULL OR a."assignmentHash" IS NULL OR a."ownerTokenHash"='' OR auth."id" IS NULL
      OR a."assignmentGeneration" < 1 OR auth."role"<>w."role"
      OR (a."status" IN ('CLAIMED','WORKER_REQUESTED','IN_PROGRESS') AND
        (w."currentAttempt"<>a."attempt" OR w."status" NOT IN ('WORKER_REQUESTED','IN_PROGRESS')))
      OR a."executionMode" NOT IN ('MANAGED','EXTERNAL_V1')
      OR (a."executionMode"='EXTERNAL_V1' AND (a."externalPrincipalId" IS NULL OR a."externalPrincipalAssurance" IS NOT 'PROJECT_CREDENTIAL_ONLY'
        OR auth."externalPrincipalId" IS NOT a."externalPrincipalId" OR auth."externalPrincipalAssurance" IS NOT a."externalPrincipalAssurance"))
      OR (a."status" NOT IN ('COMPLETED','CANCELLED','REFUSED','FAILED','EXPIRED') AND (auth."revokedAt" IS NOT NULL OR auth."cancelledAt" IS NOT NULL))
      OR auth."workItemId"<>w."id" OR auth."journeyId"<>"QualityJourney"."id" OR auth."targetProjectId"<>"QualityJourney"."targetProjectId"))
  -- SQL checks receipt structure/scope only; canonical runtime checks its hash.
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyOwnedBrowser" b WHERE b."journeyId"="QualityJourney"."id"
    AND (b."status"<>'STOP_OBSERVED' OR b."targetProjectId"<>"QualityJourney"."targetProjectId" OR b."stopReceiptHash" IS NULL
      OR CASE WHEN json_valid(b."stopReceiptJson") THEN
        json_type(b."stopReceiptJson") IS NOT 'object'
        OR json_extract(b."stopReceiptJson", '$.schemaVersion') IS NOT 'appraise.quality-journey-owned-browser-stop/v1'
        OR json_extract(b."stopReceiptJson", '$.status') IS NOT 'STOP_OBSERVED'
        OR json_extract(b."stopReceiptJson", '$.journeyId') IS NOT b."journeyId"
        OR json_extract(b."stopReceiptJson", '$.targetProjectId') IS NOT b."targetProjectId"
        OR json_extract(b."stopReceiptJson", '$.sessionId') IS NOT b."sessionId"
        OR json_extract(b."stopReceiptJson", '$.processInstanceId') IS NOT b."processInstanceId"
        OR json_type(b."stopReceiptJson", '$.generation') IS NOT 'integer'
        OR json_extract(b."stopReceiptJson", '$.generation') IS NOT b."generation"
        OR COALESCE(json_extract(b."stopReceiptJson", '$.observation'), '') NOT IN ('RUNTIME_CLOSE_CONFIRMED','NO_RUNTIME_LAUNCHED')
      ELSE 1 END))
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionCycle" e WHERE e."journeyId"="QualityJourney"."id"
    AND (e."targetProjectId"<>"QualityJourney"."targetProjectId" OR e."status" NOT IN ('COMPLETED','CANCELLED')))
  AND NOT EXISTS (SELECT 1 FROM "QualityJourneyExecutionTestRun" binding
    JOIN "QualityJourneyExecutionCycle" e ON e."id"=binding."executionCycleId"
    JOIN "TestRun" run ON run."id"=binding."testRunId"
    WHERE e."journeyId"="QualityJourney"."id" AND (run."targetProjectId"<>"QualityJourney"."targetProjectId" OR run."status" NOT IN ('COMPLETED','CANCELLED')))
  AND (SELECT COUNT(DISTINCT a."externalPrincipalId")
    FROM "QualityJourneyWorkAttempt" a JOIN "QualityJourneyWorkItem" w ON w."id"=a."workItemId"
    WHERE w."journeyId"="QualityJourney"."id" AND a."executionMode"='EXTERNAL_V1'
      AND a."status" NOT IN ('COMPLETED','CANCELLED','REFUSED','FAILED','EXPIRED')) <= 1
  AND NOT (
    EXISTS (SELECT 1 FROM "QualityJourneyWorkAttempt" a JOIN "QualityJourneyWorkItem" w ON w."id"=a."workItemId"
      WHERE w."journeyId"="QualityJourney"."id" AND a."executionMode"='MANAGED'
        AND a."status" NOT IN ('COMPLETED','CANCELLED','REFUSED','FAILED','EXPIRED'))
    AND EXISTS (SELECT 1 FROM "QualityJourneyWorkAttempt" a JOIN "QualityJourneyWorkItem" w ON w."id"=a."workItemId"
      WHERE w."journeyId"="QualityJourney"."id" AND a."executionMode"='EXTERNAL_V1'
        AND a."status" NOT IN ('COMPLETED','CANCELLED','REFUSED','FAILED','EXPIRED'))
  );

INSERT INTO "QualityJourneyWorkAttemptSessionBinding" (
  "attemptId", "journeyId", "targetProjectId", "sessionId", "coordinatorGeneration", "assignmentGeneration",
  "workItemId", "role", "authorizationId", "leaseId", "inputHash", "assignmentId", "provenance")
SELECT a."id", j."id", j."targetProjectId", NULL, NULL, a."assignmentGeneration", w."id", w."role",
  a."authorizationId", a."leaseId",
  CASE WHEN json_valid(a."assignmentJson") THEN
    CASE WHEN json_type(a."assignmentJson", '$.inputHash')='text' THEN json_extract(a."assignmentJson", '$.inputHash')
      ELSE 'UNRESOLVED_LEGACY_INPUT_HASH' END
    ELSE 'UNRESOLVED_LEGACY_INPUT_HASH' END,
  a."assignmentId",
  CASE WHEN j."hostingMode"='EXTERNAL_LEGACY' AND j."currentCoordinatorSessionId" IS NULL
    AND CASE WHEN json_valid(a."assignmentJson") THEN json_type(a."assignmentJson", '$.inputHash')='text' ELSE 0 END
    THEN 'M03_SQL_V1:BOUNDED_NO_SESSION_LINEAGE' ELSE 'M03_SQL_V1:UNRESOLVED_LEGACY_ATTEMPT_LINEAGE' END
FROM "QualityJourneyWorkAttempt" a JOIN "QualityJourneyWorkItem" w ON w."id"=a."workItemId"
JOIN "QualityJourney" j ON j."id"=w."journeyId";

-- SQLite relational scope checks supplement the nullable current-pointer FK.
CREATE TRIGGER "QualityJourneySession_scope_insert" BEFORE INSERT ON "QualityJourneyCoordinatorSession"
WHEN NOT EXISTS (SELECT 1 FROM "QualityJourney" j WHERE j."id"=NEW."journeyId" AND j."targetProjectId"=NEW."targetProjectId")
BEGIN SELECT RAISE(ABORT, 'coordinator session target scope mismatch'); END;
CREATE TRIGGER "QualityJourneySession_scope_update" BEFORE UPDATE OF "journeyId", "targetProjectId" ON "QualityJourneyCoordinatorSession"
WHEN NEW."journeyId"<>OLD."journeyId" OR NEW."targetProjectId"<>OLD."targetProjectId"
BEGIN SELECT RAISE(ABORT, 'coordinator session scope is immutable'); END;
CREATE TRIGGER "QualityJourney_current_session_scope_insert" BEFORE INSERT ON "QualityJourney"
WHEN NEW."currentCoordinatorSessionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyCoordinatorSession" s
  WHERE s."id"=NEW."currentCoordinatorSessionId" AND s."journeyId"=NEW."id" AND s."targetProjectId"=NEW."targetProjectId")
BEGIN SELECT RAISE(ABORT, 'current coordinator session target scope mismatch'); END;
CREATE TRIGGER "QualityJourney_current_session_scope" BEFORE UPDATE OF "currentCoordinatorSessionId", "targetProjectId" ON "QualityJourney"
WHEN NEW."currentCoordinatorSessionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyCoordinatorSession" s
  WHERE s."id"=NEW."currentCoordinatorSessionId" AND s."journeyId"=NEW."id" AND s."targetProjectId"=NEW."targetProjectId")
BEGIN SELECT RAISE(ABORT, 'current coordinator session target scope mismatch'); END;
CREATE TRIGGER "QualityJourneyAttemptBinding_scope" BEFORE INSERT ON "QualityJourneyWorkAttemptSessionBinding"
WHEN NOT EXISTS (SELECT 1 FROM "QualityJourneyWorkAttempt" a JOIN "QualityJourneyWorkItem" w ON w."id"=a."workItemId"
  WHERE a."id"=NEW."attemptId" AND w."id"=NEW."workItemId" AND w."journeyId"=NEW."journeyId" AND w."targetProjectId"=NEW."targetProjectId"
  AND a."assignmentGeneration"=NEW."assignmentGeneration" AND a."leaseId"=NEW."leaseId")
  OR (NEW."sessionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "QualityJourneyCoordinatorSession" s
    WHERE s."id"=NEW."sessionId" AND s."journeyId"=NEW."journeyId" AND s."targetProjectId"=NEW."targetProjectId" AND s."generation"=NEW."coordinatorGeneration"))
BEGIN SELECT RAISE(ABORT, 'attempt session binding scope mismatch'); END;
CREATE TRIGGER "QualityJourneyAttemptBinding_immutable" BEFORE UPDATE ON "QualityJourneyWorkAttemptSessionBinding"
BEGIN SELECT RAISE(ABORT, 'attempt session binding is immutable'); END;
