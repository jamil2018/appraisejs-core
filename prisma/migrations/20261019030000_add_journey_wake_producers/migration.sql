-- Durable wake hints are coupled to canonical writes by SQLite, including all
-- specialized services. They grant no ownership, approval or dispatch authority.
-- No historical rows are backfilled and the append-only event log is unchanged.
CREATE TRIGGER "m04_journey_event_wake" AFTER INSERT ON "QualityJourneyEvent"
WHEN EXISTS (SELECT 1 FROM "QualityJourney" WHERE "id" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId" AND "hostingMode" = 'APP_SERVER_LOCAL_V1')
BEGIN
  INSERT INTO "QualityJourneyWakeIntent" ("id", "journeyId", "targetProjectId", "causeKey", "reason", "highWaterSequence", "status", "claimEpoch")
  VALUES ('qjw_event_' || NEW."id", NEW."journeyId", NEW."targetProjectId", 'event:' || NEW."id", 'JOURNEY_EVENT', NEW."sequence", 'PENDING', 0);
END;

CREATE TRIGGER "m04_journey_state_wake" AFTER UPDATE OF "version" ON "QualityJourney"
WHEN NEW."hostingMode" = 'APP_SERVER_LOCAL_V1' AND NEW."version" <> OLD."version"
BEGIN
  INSERT INTO "QualityJourneyWakeIntent" ("id", "journeyId", "targetProjectId", "causeKey", "reason", "status", "claimEpoch")
  VALUES ('qjw_state_' || NEW."id" || ':' || NEW."version", NEW."id", NEW."targetProjectId", 'state:' || NEW."version", 'STATE_CHANGED', 'PENDING', 0);
END;

CREATE TRIGGER "m04_work_created_wake" AFTER INSERT ON "QualityJourneyWorkItem"
WHEN EXISTS (SELECT 1 FROM "QualityJourney" WHERE "id" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId" AND "hostingMode" = 'APP_SERVER_LOCAL_V1')
BEGIN
  INSERT INTO "QualityJourneyWakeIntent" ("id", "journeyId", "targetProjectId", "causeKey", "reason", "status", "claimEpoch")
  VALUES ('qjw_work_' || NEW."id" || ':' || NEW."version", NEW."journeyId", NEW."targetProjectId", 'work:' || NEW."id" || ':' || NEW."version", 'WORK_CHANGED', 'PENDING', 0);
END;

CREATE TRIGGER "m04_work_changed_wake" AFTER UPDATE OF "version" ON "QualityJourneyWorkItem"
WHEN NEW."version" <> OLD."version" AND EXISTS (SELECT 1 FROM "QualityJourney" WHERE "id" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId" AND "hostingMode" = 'APP_SERVER_LOCAL_V1')
BEGIN
  INSERT INTO "QualityJourneyWakeIntent" ("id", "journeyId", "targetProjectId", "causeKey", "reason", "status", "claimEpoch")
  VALUES ('qjw_work_' || NEW."id" || ':' || NEW."version", NEW."journeyId", NEW."targetProjectId", 'work:' || NEW."id" || ':' || NEW."version", 'WORK_CHANGED', 'PENDING', 0);
END;

CREATE TRIGGER "m04_authorization_cancelled_wake" AFTER UPDATE OF "cancelledAt" ON "QualityJourneyWorkAuthorization"
WHEN OLD."cancelledAt" IS NULL AND NEW."cancelledAt" IS NOT NULL AND EXISTS (SELECT 1 FROM "QualityJourney" WHERE "id" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId" AND "hostingMode" = 'APP_SERVER_LOCAL_V1')
BEGIN
  INSERT INTO "QualityJourneyWakeIntent" ("id", "journeyId", "targetProjectId", "causeKey", "reason", "status", "claimEpoch")
  VALUES ('qjw_auth_cancel_' || NEW."id", NEW."journeyId", NEW."targetProjectId", 'authorization:' || NEW."id" || ':cancelled', 'AUTHORIZATION_CHANGED', 'PENDING', 0);
END;

CREATE TRIGGER "m04_authorization_revoked_wake" AFTER UPDATE OF "revokedAt" ON "QualityJourneyWorkAuthorization"
WHEN OLD."revokedAt" IS NULL AND NEW."revokedAt" IS NOT NULL AND EXISTS (SELECT 1 FROM "QualityJourney" WHERE "id" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId" AND "hostingMode" = 'APP_SERVER_LOCAL_V1')
BEGIN
  INSERT INTO "QualityJourneyWakeIntent" ("id", "journeyId", "targetProjectId", "causeKey", "reason", "status", "claimEpoch")
  VALUES ('qjw_auth_revoke_' || NEW."id", NEW."journeyId", NEW."targetProjectId", 'authorization:' || NEW."id" || ':revoked', 'AUTHORIZATION_CHANGED', 'PENDING', 0);
END;

-- Derived operational state only; never clear an armed boundary or its history.
CREATE TRIGGER "m04_invalidate_work_retirement" AFTER UPDATE OF status, inputHash, currentAttempt ON "QualityJourneyWorkItem"
WHEN NEW."status" NOT IN ('IN_PROGRESS', 'WORKER_REQUESTED', 'CLAIMED') OR NEW."inputHash" IS NOT OLD."inputHash" OR NEW."currentAttempt" IS NOT OLD."currentAttempt"
BEGIN
  UPDATE "QualityJourneyProviderDispatchIntent"
    SET "status" = 'INVALIDATED', "invalidatedAt" = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE "providerRunId" IN (SELECT "id" FROM "QualityJourneyProviderRun" WHERE "workItemId" = NEW."id")
      AND "armedAt" IS NULL AND "invalidatedAt" IS NULL AND "reconciledAt" IS NULL;
  UPDATE "QualityJourneyProviderRun" SET "status" = 'INVALIDATED'
    WHERE "workItemId" = NEW."id"
      AND NOT EXISTS (SELECT 1 FROM "QualityJourneyProviderDispatchIntent" i WHERE i."providerRunId" = "QualityJourneyProviderRun"."id" AND i."armedAt" IS NOT NULL)
      AND EXISTS (SELECT 1 FROM "QualityJourneyProviderDispatchIntent" i WHERE i."providerRunId" = "QualityJourneyProviderRun"."id" AND i."invalidatedAt" IS NOT NULL);
END;

-- Derived operational state only; never clear an armed boundary or its history.
CREATE TRIGGER "m04_invalidate_attempt_retirement" AFTER UPDATE OF status ON "QualityJourneyWorkAttempt"
WHEN NEW."status" NOT IN ('IN_PROGRESS', 'WORKER_REQUESTED', 'CLAIMED')
BEGIN
  UPDATE "QualityJourneyProviderDispatchIntent"
    SET "status" = 'INVALIDATED', "invalidatedAt" = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE "providerRunId" IN (SELECT "id" FROM "QualityJourneyProviderRun" WHERE "attemptId" = NEW."id")
      AND "armedAt" IS NULL AND "invalidatedAt" IS NULL AND "reconciledAt" IS NULL;
  UPDATE "QualityJourneyProviderRun" SET "status" = 'INVALIDATED'
    WHERE "attemptId" = NEW."id"
      AND NOT EXISTS (SELECT 1 FROM "QualityJourneyProviderDispatchIntent" i WHERE i."providerRunId" = "QualityJourneyProviderRun"."id" AND i."armedAt" IS NOT NULL)
      AND EXISTS (SELECT 1 FROM "QualityJourneyProviderDispatchIntent" i WHERE i."providerRunId" = "QualityJourneyProviderRun"."id" AND i."invalidatedAt" IS NOT NULL);
END;

-- Derived operational state only; never clear an armed boundary or its history.
CREATE TRIGGER "m04_invalidate_authorization_retirement" AFTER UPDATE OF cancelledAt, revokedAt ON "QualityJourneyWorkAuthorization"
WHEN NEW."cancelledAt" IS NOT NULL OR NEW."revokedAt" IS NOT NULL
BEGIN
  UPDATE "QualityJourneyProviderDispatchIntent"
    SET "status" = 'INVALIDATED', "invalidatedAt" = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE "providerRunId" IN (SELECT "id" FROM "QualityJourneyProviderRun" WHERE "authorizationId" = NEW."id")
      AND "armedAt" IS NULL AND "invalidatedAt" IS NULL AND "reconciledAt" IS NULL;
  UPDATE "QualityJourneyProviderRun" SET "status" = 'INVALIDATED'
    WHERE "authorizationId" = NEW."id"
      AND NOT EXISTS (SELECT 1 FROM "QualityJourneyProviderDispatchIntent" i WHERE i."providerRunId" = "QualityJourneyProviderRun"."id" AND i."armedAt" IS NOT NULL)
      AND EXISTS (SELECT 1 FROM "QualityJourneyProviderDispatchIntent" i WHERE i."providerRunId" = "QualityJourneyProviderRun"."id" AND i."invalidatedAt" IS NOT NULL);
END;

-- Derived operational state only; never clear an armed boundary or its history.
CREATE TRIGGER "m04_invalidate_journey_revision" AFTER UPDATE OF activeRevisionIdsJson, activeCycleId, status ON "QualityJourney"
WHEN NEW."activeRevisionIdsJson" IS NOT OLD."activeRevisionIdsJson" OR NEW."activeCycleId" IS NOT OLD."activeCycleId" OR NEW."status" IN ('PAUSED', 'CLOSED')
BEGIN
  UPDATE "QualityJourneyProviderDispatchIntent"
    SET "status" = 'INVALIDATED', "invalidatedAt" = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE "providerRunId" IN (SELECT "id" FROM "QualityJourneyProviderRun" WHERE "journeyId" = NEW."id")
      AND "armedAt" IS NULL AND "invalidatedAt" IS NULL AND "reconciledAt" IS NULL;
  UPDATE "QualityJourneyProviderRun" SET "status" = 'INVALIDATED'
    WHERE "journeyId" = NEW."id"
      AND NOT EXISTS (SELECT 1 FROM "QualityJourneyProviderDispatchIntent" i WHERE i."providerRunId" = "QualityJourneyProviderRun"."id" AND i."armedAt" IS NOT NULL)
      AND EXISTS (SELECT 1 FROM "QualityJourneyProviderDispatchIntent" i WHERE i."providerRunId" = "QualityJourneyProviderRun"."id" AND i."invalidatedAt" IS NOT NULL);
END;

-- Successor authorizations retire predecessor intent even when the old row is
-- retained unchanged for audit and exact historical receipt disclosure.
CREATE TRIGGER "m04_authorization_superseded" AFTER INSERT ON "QualityJourneyWorkAuthorization"
WHEN NEW."supersedesAuthorizationId" IS NOT NULL
BEGIN
  UPDATE "QualityJourneyProviderDispatchIntent"
    SET "status" = 'INVALIDATED', "invalidatedAt" = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    WHERE "providerRunId" IN (SELECT "id" FROM "QualityJourneyProviderRun" WHERE "authorizationId" = NEW."supersedesAuthorizationId")
      AND "armedAt" IS NULL AND "invalidatedAt" IS NULL AND "reconciledAt" IS NULL;
  UPDATE "QualityJourneyProviderRun" SET "status" = 'INVALIDATED'
    WHERE "authorizationId" = NEW."supersedesAuthorizationId"
      AND NOT EXISTS (SELECT 1 FROM "QualityJourneyProviderDispatchIntent" i WHERE i."providerRunId" = "QualityJourneyProviderRun"."id" AND i."armedAt" IS NOT NULL)
      AND EXISTS (SELECT 1 FROM "QualityJourneyProviderDispatchIntent" i WHERE i."providerRunId" = "QualityJourneyProviderRun"."id" AND i."invalidatedAt" IS NOT NULL);
  INSERT INTO "QualityJourneyWakeIntent" ("id", "journeyId", "targetProjectId", "causeKey", "reason", "status", "claimEpoch")
    SELECT 'qjw_auth_supersedes_' || NEW."id", NEW."journeyId", NEW."targetProjectId", 'authorization:' || NEW."id" || ':supersedes', 'AUTHORIZATION_CHANGED', 'PENDING', 0
    FROM "QualityJourney" WHERE "id" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId" AND "hostingMode" = 'APP_SERVER_LOCAL_V1';
END;
