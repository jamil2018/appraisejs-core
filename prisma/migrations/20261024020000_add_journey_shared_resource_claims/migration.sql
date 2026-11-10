-- SRP1 retained metadata only. Coverage does not enroll a source or grant effects.
CREATE TABLE "QualityJourneySharedResourceCoverage" (
  "targetProjectId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('MODULE', 'LOCATOR_GROUP', 'LOCATOR', 'TEST_SUITE', 'TEST_CASE')),
  "protocolVersion" INTEGER NOT NULL DEFAULT 1 CHECK (typeof("protocolVersion") = 'integer' AND "protocolVersion" = 1),
  "state" TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK ("state" IN ('UNKNOWN', 'COMPLETE')),
  "epoch" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("epoch") = 'integer' AND "epoch" BETWEEN 0 AND 2147483646),
  "writerClosureDigest" TEXT,
  "readerClosureDigest" TEXT,
  "sourceUniverseDigest" TEXT,
  "reconciliationDigest" TEXT,
  "proofKind" TEXT CHECK ("proofKind" IS NULL OR "proofKind" IN ('JOURNEY_FREE_V1', 'RECONCILED_V1')),
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("targetProjectId", "kind", "protocolVersion"),
  CHECK (typeof("targetProjectId") = 'text' AND length("targetProjectId") BETWEEN 1 AND 128 AND length(CAST("targetProjectId" AS BLOB)) = length("targetProjectId")),
  CHECK ("writerClosureDigest" IS NULL OR (typeof("writerClosureDigest") = 'text' AND length("writerClosureDigest") = 64 AND length(CAST("writerClosureDigest" AS BLOB)) = 64 AND "writerClosureDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK ("readerClosureDigest" IS NULL OR (typeof("readerClosureDigest") = 'text' AND length("readerClosureDigest") = 64 AND length(CAST("readerClosureDigest" AS BLOB)) = 64 AND "readerClosureDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK ("sourceUniverseDigest" IS NULL OR (typeof("sourceUniverseDigest") = 'text' AND length("sourceUniverseDigest") = 64 AND length(CAST("sourceUniverseDigest" AS BLOB)) = 64 AND "sourceUniverseDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK ("reconciliationDigest" IS NULL OR (typeof("reconciliationDigest") = 'text' AND length("reconciliationDigest") = 64 AND length(CAST("reconciliationDigest" AS BLOB)) = 64 AND "reconciliationDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK (
    ("state" = 'UNKNOWN' AND "writerClosureDigest" IS NULL AND "readerClosureDigest" IS NULL AND "sourceUniverseDigest" IS NULL AND "reconciliationDigest" IS NULL AND "proofKind" IS NULL AND "completedAt" IS NULL)
    OR ("state" = 'COMPLETE' AND "writerClosureDigest" IS NOT NULL AND "readerClosureDigest" IS NOT NULL AND "sourceUniverseDigest" IS NOT NULL AND "reconciliationDigest" IS NOT NULL AND "proofKind" IS NOT NULL AND "completedAt" IS NOT NULL)
  )
);

-- No live-target/resource FK: retained guards and tombstones survive deletion.
CREATE TABLE "QualityJourneySharedResourceGuard" (
  "targetProjectId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('MODULE', 'LOCATOR_GROUP', 'LOCATOR', 'TEST_SUITE', 'TEST_CASE')),
  "resourceId" TEXT NOT NULL,
  "epoch" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("epoch") = 'integer' AND "epoch" BETWEEN 0 AND 2147483646),
  "coverageState" TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK ("coverageState" IN ('UNKNOWN', 'COMPLETE_V1')),
  "coverageDigest" TEXT,
  "resourceState" TEXT NOT NULL DEFAULT 'LIVE' CHECK ("resourceState" IN ('LIVE', 'DELETED')),
  "deletedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("targetProjectId", "kind", "resourceId"),
  CHECK (typeof("targetProjectId") = 'text' AND length("targetProjectId") BETWEEN 1 AND 128 AND length(CAST("targetProjectId" AS BLOB)) = length("targetProjectId")),
  CHECK (typeof("resourceId") = 'text' AND length("resourceId") BETWEEN 1 AND 128 AND length(CAST("resourceId" AS BLOB)) = length("resourceId")),
  CHECK ("coverageDigest" IS NULL OR (typeof("coverageDigest") = 'text' AND length("coverageDigest") = 64 AND length(CAST("coverageDigest" AS BLOB)) = 64 AND "coverageDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK (("coverageState" = 'UNKNOWN' AND "coverageDigest" IS NULL) OR ("coverageState" = 'COMPLETE_V1' AND "coverageDigest" IS NOT NULL)),
  CHECK (("resourceState" = 'LIVE' AND "deletedAt" IS NULL) OR ("resourceState" = 'DELETED' AND "deletedAt" IS NOT NULL))
);

CREATE TABLE "QualityJourneySharedResourceUse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL CHECK ("sourceKind" IN ('ENSURE', 'RESOURCE_RESOLUTION', 'AUTOMATION_MATERIALIZATION', 'EXECUTION_CYCLE')),
  "sourceOwnerId" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "dependencyDigest" TEXT NOT NULL,
  "claimSetDigest" TEXT NOT NULL,
  "claimSetCount" INTEGER NOT NULL CHECK (typeof("claimSetCount") = 'integer' AND "claimSetCount" BETWEEN 1 AND 4096),
  "coordinatorSessionId" TEXT,
  "generation" INTEGER,
  "state" TEXT NOT NULL DEFAULT 'PREPARING' CHECK ("state" IN ('PREPARING', 'ACTIVE', 'RELEASED')),
  "version" INTEGER NOT NULL DEFAULT 0 CHECK (typeof("version") = 'integer' AND "version" BETWEEN 0 AND 2147483646),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" DATETIME,
  "releaseEvidenceDigest" TEXT,
  "releaseReason" TEXT,
  CONSTRAINT "QualityJourneySharedResourceUse_journey_fkey" FOREIGN KEY ("journeyId", "targetProjectId") REFERENCES "QualityJourney"("id", "targetProjectId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneySharedResourceUse_session_fkey" FOREIGN KEY ("coordinatorSessionId", "journeyId", "targetProjectId", "generation") REFERENCES "QualityJourneyCoordinatorSession"("id", "journeyId", "targetProjectId", "generation") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (typeof("id") = 'text' AND length("id") = 64 AND length(CAST("id" AS BLOB)) = 64 AND "id" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("journeyId") = 'text' AND length("journeyId") BETWEEN 1 AND 128 AND length(CAST("journeyId" AS BLOB)) = length("journeyId")),
  CHECK (typeof("targetProjectId") = 'text' AND length("targetProjectId") BETWEEN 1 AND 128 AND length(CAST("targetProjectId" AS BLOB)) = length("targetProjectId")),
  CHECK (typeof("sourceOwnerId") = 'text' AND length("sourceOwnerId") BETWEEN 1 AND 128 AND length(CAST("sourceOwnerId" AS BLOB)) = length("sourceOwnerId")),
  CHECK (typeof("sourceDigest") = 'text' AND length("sourceDigest") = 64 AND length(CAST("sourceDigest" AS BLOB)) = 64 AND "sourceDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("dependencyDigest") = 'text' AND length("dependencyDigest") = 64 AND length(CAST("dependencyDigest" AS BLOB)) = 64 AND "dependencyDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("claimSetDigest") = 'text' AND length("claimSetDigest") = 64 AND length(CAST("claimSetDigest" AS BLOB)) = 64 AND "claimSetDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK ("releaseEvidenceDigest" IS NULL OR (typeof("releaseEvidenceDigest") = 'text' AND length("releaseEvidenceDigest") = 64 AND length(CAST("releaseEvidenceDigest" AS BLOB)) = 64 AND "releaseEvidenceDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK (("coordinatorSessionId" IS NULL AND "generation" IS NULL)
    OR ("coordinatorSessionId" IS NOT NULL AND typeof("coordinatorSessionId") = 'text' AND length("coordinatorSessionId") BETWEEN 1 AND 128 AND length(CAST("coordinatorSessionId" AS BLOB)) = length("coordinatorSessionId")
      AND "generation" IS NOT NULL AND typeof("generation") = 'integer' AND "generation" BETWEEN 1 AND 2147483647)),
  CHECK (("state" IN ('PREPARING', 'ACTIVE') AND "releasedAt" IS NULL AND "releaseEvidenceDigest" IS NULL AND "releaseReason" IS NULL)
    OR ("state" = 'RELEASED' AND "releasedAt" IS NOT NULL AND "releaseEvidenceDigest" IS NOT NULL AND "releaseReason" IS NOT NULL))
);
CREATE UNIQUE INDEX "QualityJourneySharedResourceUse_source_key" ON "QualityJourneySharedResourceUse"("journeyId", "targetProjectId", "sourceKind", "sourceOwnerId", "sourceDigest");
CREATE UNIQUE INDEX "QualityJourneySharedResourceUse_lineage_key" ON "QualityJourneySharedResourceUse"("id", "journeyId", "targetProjectId");

CREATE TABLE "QualityJourneySharedResourceClaim" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "useId" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('MODULE', 'LOCATOR_GROUP', 'LOCATOR', 'TEST_SUITE', 'TEST_CASE')),
  "resourceId" TEXT NOT NULL,
  "dependencyDigest" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("state" IN ('ACTIVE', 'RELEASED')),
  "claimEpoch" INTEGER NOT NULL CHECK (typeof("claimEpoch") = 'integer' AND "claimEpoch" BETWEEN 0 AND 2147483646),
  "releaseEpoch" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" DATETIME,
  "releaseEvidenceDigest" TEXT,
  "releaseReason" TEXT,
  CONSTRAINT "QualityJourneySharedResourceClaim_use_fkey" FOREIGN KEY ("useId", "journeyId", "targetProjectId") REFERENCES "QualityJourneySharedResourceUse"("id", "journeyId", "targetProjectId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneySharedResourceClaim_guard_fkey" FOREIGN KEY ("targetProjectId", "kind", "resourceId") REFERENCES "QualityJourneySharedResourceGuard"("targetProjectId", "kind", "resourceId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (typeof("id") = 'text' AND length("id") = 64 AND length(CAST("id" AS BLOB)) = 64 AND "id" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("useId") = 'text' AND length("useId") = 64 AND length(CAST("useId" AS BLOB)) = 64 AND "useId" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("journeyId") = 'text' AND length("journeyId") BETWEEN 1 AND 128 AND length(CAST("journeyId" AS BLOB)) = length("journeyId")),
  CHECK (typeof("targetProjectId") = 'text' AND length("targetProjectId") BETWEEN 1 AND 128 AND length(CAST("targetProjectId" AS BLOB)) = length("targetProjectId")),
  CHECK (typeof("resourceId") = 'text' AND length("resourceId") BETWEEN 1 AND 128 AND length(CAST("resourceId" AS BLOB)) = length("resourceId")),
  CHECK (typeof("dependencyDigest") = 'text' AND length("dependencyDigest") = 64 AND length(CAST("dependencyDigest" AS BLOB)) = 64 AND "dependencyDigest" NOT GLOB '*[^0-9a-f]*'),
  CHECK ("releaseEvidenceDigest" IS NULL OR (typeof("releaseEvidenceDigest") = 'text' AND length("releaseEvidenceDigest") = 64 AND length(CAST("releaseEvidenceDigest" AS BLOB)) = 64 AND "releaseEvidenceDigest" NOT GLOB '*[^0-9a-f]*')),
  CHECK (("state" = 'ACTIVE' AND "releaseEpoch" IS NULL AND "releasedAt" IS NULL AND "releaseEvidenceDigest" IS NULL AND "releaseReason" IS NULL)
    OR ("state" = 'RELEASED' AND "releaseEpoch" IS NOT NULL AND typeof("releaseEpoch") = 'integer' AND "releaseEpoch" BETWEEN 0 AND 2147483646 AND "releaseEpoch" > "claimEpoch"
      AND "releasedAt" IS NOT NULL AND "releaseEvidenceDigest" IS NOT NULL AND "releaseReason" IS NOT NULL))
);
CREATE UNIQUE INDEX "QualityJourneySharedResourceClaim_use_resource_key" ON "QualityJourneySharedResourceClaim"("useId", "kind", "resourceId");
CREATE INDEX "QualityJourneySharedResourceClaim_resource_state_idx" ON "QualityJourneySharedResourceClaim"("targetProjectId", "kind", "resourceId", "state");
CREATE INDEX "QualityJourneySharedResourceClaim_use_state_idx" ON "QualityJourneySharedResourceClaim"("useId", "state");

CREATE TABLE "QualityJourneyLocatorEnsureReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "coordinatorSessionId" TEXT,
  "generation" INTEGER,
  "requestHash" TEXT NOT NULL,
  "resultHash" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "locatorGroupId" TEXT NOT NULL,
  "locatorId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyLocatorEnsureReceipt_journey_fkey" FOREIGN KEY ("journeyId", "targetProjectId") REFERENCES "QualityJourney"("id", "targetProjectId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyLocatorEnsureReceipt_session_fkey" FOREIGN KEY ("coordinatorSessionId", "journeyId", "targetProjectId", "generation") REFERENCES "QualityJourneyCoordinatorSession"("id", "journeyId", "targetProjectId", "generation") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK (typeof("id") = 'text' AND length("id") = 64 AND length(CAST("id" AS BLOB)) = 64 AND "id" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("journeyId") = 'text' AND length("journeyId") BETWEEN 1 AND 128 AND length(CAST("journeyId" AS BLOB)) = length("journeyId")),
  CHECK (typeof("targetProjectId") = 'text' AND length("targetProjectId") BETWEEN 1 AND 128 AND length(CAST("targetProjectId" AS BLOB)) = length("targetProjectId")),
  CHECK (typeof("moduleId") = 'text' AND length("moduleId") BETWEEN 1 AND 128 AND length(CAST("moduleId" AS BLOB)) = length("moduleId")),
  CHECK (typeof("locatorGroupId") = 'text' AND length("locatorGroupId") BETWEEN 1 AND 128 AND length(CAST("locatorGroupId" AS BLOB)) = length("locatorGroupId")),
  CHECK (typeof("locatorId") = 'text' AND length("locatorId") BETWEEN 1 AND 128 AND length(CAST("locatorId" AS BLOB)) = length("locatorId")),
  CHECK (typeof("requestHash") = 'text' AND length("requestHash") = 64 AND length(CAST("requestHash" AS BLOB)) = 64 AND "requestHash" NOT GLOB '*[^0-9a-f]*'),
  CHECK (typeof("resultHash") = 'text' AND length("resultHash") = 64 AND length(CAST("resultHash" AS BLOB)) = 64 AND "resultHash" NOT GLOB '*[^0-9a-f]*'),
  CHECK (("coordinatorSessionId" IS NULL AND "generation" IS NULL)
    OR ("coordinatorSessionId" IS NOT NULL AND typeof("coordinatorSessionId") = 'text' AND length("coordinatorSessionId") BETWEEN 1 AND 128 AND length(CAST("coordinatorSessionId" AS BLOB)) = length("coordinatorSessionId")
      AND "generation" IS NOT NULL AND typeof("generation") = 'integer' AND "generation" BETWEEN 1 AND 2147483647))
);

CREATE TRIGGER "QualityJourneySharedResourceCoverage_immutable_transition"
BEFORE UPDATE ON "QualityJourneySharedResourceCoverage"
WHEN NEW."targetProjectId" IS NOT OLD."targetProjectId"
  OR NEW."kind" IS NOT OLD."kind"
  OR NEW."protocolVersion" IS NOT OLD."protocolVersion"
  OR NEW."createdAt" IS NOT OLD."createdAt"
  OR NEW."epoch" <> OLD."epoch" + 1
  OR (NEW."state" IS NOT OLD."state" AND NOT (OLD."state" = 'UNKNOWN' AND NEW."state" = 'COMPLETE'))
  OR (OLD."state" = 'COMPLETE' AND (
    NEW."writerClosureDigest" IS NOT OLD."writerClosureDigest"
    OR NEW."readerClosureDigest" IS NOT OLD."readerClosureDigest"
    OR NEW."sourceUniverseDigest" IS NOT OLD."sourceUniverseDigest"
    OR NEW."reconciliationDigest" IS NOT OLD."reconciliationDigest"
    OR NEW."proofKind" IS NOT OLD."proofKind"
    OR NEW."completedAt" IS NOT OLD."completedAt"
  ))
BEGIN
  SELECT RAISE(ABORT, 'SRP1 coverage identity, proof or epoch refused');
END;

-- Guard has no protocolVersion field. The exact V1 coverage row is required,
-- without inventing a live-resource FK or nullable negative-ownership proof.
CREATE TRIGGER "QualityJourneySharedResourceGuard_coverage_insert"
BEFORE INSERT ON "QualityJourneySharedResourceGuard"
WHEN NOT EXISTS (
  SELECT 1 FROM "QualityJourneySharedResourceCoverage"
  WHERE "targetProjectId" = NEW."targetProjectId" AND "kind" = NEW."kind" AND "protocolVersion" = 1
)
BEGIN
  SELECT RAISE(ABORT, 'SRP1 guard requires domain coverage');
END;

CREATE TRIGGER "QualityJourneySharedResourceGuard_immutable_transition"
BEFORE UPDATE ON "QualityJourneySharedResourceGuard"
WHEN NEW."targetProjectId" IS NOT OLD."targetProjectId"
  OR NEW."kind" IS NOT OLD."kind"
  OR NEW."resourceId" IS NOT OLD."resourceId"
  OR NEW."createdAt" IS NOT OLD."createdAt"
  OR NEW."epoch" <> OLD."epoch" + 1
  OR (NEW."coverageState" IS NOT OLD."coverageState" AND NOT (OLD."coverageState" = 'UNKNOWN' AND NEW."coverageState" = 'COMPLETE_V1'))
  OR (OLD."coverageState" = 'COMPLETE_V1' AND NEW."coverageDigest" IS NOT OLD."coverageDigest")
  OR (NEW."resourceState" IS NOT OLD."resourceState" AND NOT (OLD."resourceState" = 'LIVE' AND NEW."resourceState" = 'DELETED'))
  OR (OLD."resourceState" = 'DELETED' AND NEW."deletedAt" IS NOT OLD."deletedAt")
  OR NOT EXISTS (
    SELECT 1 FROM "QualityJourneySharedResourceCoverage"
    WHERE "targetProjectId" = NEW."targetProjectId" AND "kind" = NEW."kind" AND "protocolVersion" = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'SRP1 guard identity, coverage, tombstone or epoch refused');
END;

CREATE TRIGGER "QualityJourneySharedResourceUse_preparing_insert"
BEFORE INSERT ON "QualityJourneySharedResourceUse"
WHEN NEW."state" <> 'PREPARING' OR NEW."version" <> 0
BEGIN
  SELECT RAISE(ABORT, 'SRP1 use must begin PREPARING');
END;

CREATE TRIGGER "QualityJourneySharedResourceUse_immutable_transition"
BEFORE UPDATE ON "QualityJourneySharedResourceUse"
WHEN NEW."id" IS NOT OLD."id"
  OR NEW."journeyId" IS NOT OLD."journeyId"
  OR NEW."targetProjectId" IS NOT OLD."targetProjectId"
  OR NEW."sourceKind" IS NOT OLD."sourceKind"
  OR NEW."sourceOwnerId" IS NOT OLD."sourceOwnerId"
  OR NEW."sourceDigest" IS NOT OLD."sourceDigest"
  OR NEW."dependencyDigest" IS NOT OLD."dependencyDigest"
  OR NEW."claimSetDigest" IS NOT OLD."claimSetDigest"
  OR NEW."claimSetCount" IS NOT OLD."claimSetCount"
  OR NEW."coordinatorSessionId" IS NOT OLD."coordinatorSessionId"
  OR NEW."generation" IS NOT OLD."generation"
  OR NEW."createdAt" IS NOT OLD."createdAt"
  OR NEW."version" <> OLD."version" + 1
  OR (NEW."state" IS NOT OLD."state" AND NOT (
    (OLD."state" = 'PREPARING' AND NEW."state" = 'ACTIVE')
    OR (OLD."state" = 'ACTIVE' AND NEW."state" = 'RELEASED')
  ))
  OR (OLD."state" = 'RELEASED' AND (
    NEW."releasedAt" IS NOT OLD."releasedAt"
    OR NEW."releaseEvidenceDigest" IS NOT OLD."releaseEvidenceDigest"
    OR NEW."releaseReason" IS NOT OLD."releaseReason"
  ))
BEGIN
  SELECT RAISE(ABORT, 'SRP1 use identity or transition refused');
END;

-- SQLite checks cardinality/states. The transaction service independently
-- computes the exact SHA256 claim-set digest before either transition.
CREATE TRIGGER "QualityJourneySharedResourceUse_complete_activation"
BEFORE UPDATE ON "QualityJourneySharedResourceUse"
WHEN OLD."state" = 'PREPARING' AND NEW."state" = 'ACTIVE' AND (
  (SELECT count(*) FROM "QualityJourneySharedResourceClaim" WHERE "useId" = OLD."id") <> OLD."claimSetCount"
  OR EXISTS (SELECT 1 FROM "QualityJourneySharedResourceClaim" WHERE "useId" = OLD."id" AND "state" <> 'ACTIVE')
)
BEGIN
  SELECT RAISE(ABORT, 'SRP1 activation requires exact active claim count');
END;

CREATE TRIGGER "QualityJourneySharedResourceUse_complete_release"
BEFORE UPDATE ON "QualityJourneySharedResourceUse"
WHEN OLD."state" = 'ACTIVE' AND NEW."state" = 'RELEASED' AND (
  (SELECT count(*) FROM "QualityJourneySharedResourceClaim" WHERE "useId" = OLD."id") <> OLD."claimSetCount"
  OR EXISTS (SELECT 1 FROM "QualityJourneySharedResourceClaim" WHERE "useId" = OLD."id" AND "state" <> 'RELEASED')
)
BEGIN
  SELECT RAISE(ABORT, 'SRP1 release requires exact released claim count');
END;

CREATE TRIGGER "QualityJourneySharedResourceClaim_preparing_insert"
BEFORE INSERT ON "QualityJourneySharedResourceClaim"
WHEN NEW."state" <> 'ACTIVE'
  OR NOT EXISTS (
    SELECT 1 FROM "QualityJourneySharedResourceUse"
    WHERE "id" = NEW."useId" AND "journeyId" = NEW."journeyId" AND "targetProjectId" = NEW."targetProjectId" AND "state" = 'PREPARING'
  )
  OR (SELECT count(*) FROM "QualityJourneySharedResourceClaim" WHERE "useId" = NEW."useId") >= (
    SELECT "claimSetCount" FROM "QualityJourneySharedResourceUse" WHERE "id" = NEW."useId"
  )
BEGIN
  SELECT RAISE(ABORT, 'SRP1 claims require a bounded PREPARING use');
END;

CREATE TRIGGER "QualityJourneySharedResourceClaim_immutable_transition"
BEFORE UPDATE ON "QualityJourneySharedResourceClaim"
WHEN NEW."id" IS NOT OLD."id"
  OR NEW."useId" IS NOT OLD."useId"
  OR NEW."journeyId" IS NOT OLD."journeyId"
  OR NEW."targetProjectId" IS NOT OLD."targetProjectId"
  OR NEW."kind" IS NOT OLD."kind"
  OR NEW."resourceId" IS NOT OLD."resourceId"
  OR NEW."dependencyDigest" IS NOT OLD."dependencyDigest"
  OR NEW."claimEpoch" IS NOT OLD."claimEpoch"
  OR NEW."createdAt" IS NOT OLD."createdAt"
  OR (NEW."state" IS NOT OLD."state" AND NOT (OLD."state" = 'ACTIVE' AND NEW."state" = 'RELEASED'))
  OR (OLD."state" = 'RELEASED' AND (
    NEW."releaseEpoch" IS NOT OLD."releaseEpoch"
    OR NEW."releasedAt" IS NOT OLD."releasedAt"
    OR NEW."releaseEvidenceDigest" IS NOT OLD."releaseEvidenceDigest"
    OR NEW."releaseReason" IS NOT OLD."releaseReason"
  ))
  OR (OLD."state" = 'ACTIVE' AND NEW."state" = 'RELEASED' AND NOT EXISTS (
    SELECT 1 FROM "QualityJourneySharedResourceUse" WHERE "id" = OLD."useId" AND "state" = 'ACTIVE'
  ))
BEGIN
  SELECT RAISE(ABORT, 'SRP1 claim origin or release refused');
END;

CREATE TRIGGER "QualityJourneyLocatorEnsureReceipt_no_update"
BEFORE UPDATE ON "QualityJourneyLocatorEnsureReceipt"
BEGIN
  SELECT RAISE(ABORT, 'SRP1 ensure receipt is immutable');
END;

CREATE TRIGGER "QualityJourneySharedResourceCoverage_no_delete"
BEFORE DELETE ON "QualityJourneySharedResourceCoverage"
BEGIN
  SELECT RAISE(ABORT, 'SRP1 coverage must be retained');
END;

CREATE TRIGGER "QualityJourneySharedResourceGuard_no_delete"
BEFORE DELETE ON "QualityJourneySharedResourceGuard"
BEGIN
  SELECT RAISE(ABORT, 'SRP1 guards and tombstones must be retained');
END;

CREATE TRIGGER "QualityJourneySharedResourceUse_no_delete"
BEFORE DELETE ON "QualityJourneySharedResourceUse"
BEGIN
  SELECT RAISE(ABORT, 'SRP1 source uses must be retained');
END;

CREATE TRIGGER "QualityJourneySharedResourceClaim_no_delete"
BEFORE DELETE ON "QualityJourneySharedResourceClaim"
BEGIN
  SELECT RAISE(ABORT, 'SRP1 resource claims must be retained');
END;

CREATE TRIGGER "QualityJourneyLocatorEnsureReceipt_no_delete"
BEFORE DELETE ON "QualityJourneyLocatorEnsureReceipt"
BEGIN
  SELECT RAISE(ABORT, 'SRP1 ensure receipts must be retained');
END;

-- Initialization uses only canonical rows when this migration is applied.
-- Every existing target receives all five UNKNOWN domains, even if empty.
-- Every existing resource gets an UNKNOWN guard; archived rows still exist.
-- No Journey/Use/Claim/Receipt/provider association or proof is backfilled.
INSERT INTO "QualityJourneySharedResourceCoverage" ("targetProjectId", "kind")
SELECT "target"."id", "domain"."kind"
FROM "TargetProject" AS "target"
CROSS JOIN (
  SELECT 'MODULE' AS "kind" UNION ALL SELECT 'LOCATOR_GROUP' UNION ALL SELECT 'LOCATOR'
  UNION ALL SELECT 'TEST_SUITE' UNION ALL SELECT 'TEST_CASE'
) AS "domain";

INSERT INTO "QualityJourneySharedResourceGuard" ("targetProjectId", "kind", "resourceId")
SELECT "targetProjectId", 'MODULE', "id" FROM "Module"
UNION ALL SELECT "targetProjectId", 'LOCATOR_GROUP', "id" FROM "LocatorGroup"
UNION ALL SELECT "targetProjectId", 'LOCATOR', "id" FROM "Locator"
UNION ALL SELECT "targetProjectId", 'TEST_SUITE', "id" FROM "TestSuite"
UNION ALL SELECT "targetProjectId", 'TEST_CASE', "id" FROM "TestCase";
