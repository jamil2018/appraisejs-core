-- CreateTable
CREATE TABLE "QualityJourneyProviderRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "coordinatorGeneration" INTEGER NOT NULL,
    "principalId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "assignmentGeneration" INTEGER NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "authorizationHash" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "admissionHash" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "scopeHash" TEXT NOT NULL,
    "revisionHash" TEXT NOT NULL,
    "assignmentHash" TEXT NOT NULL,
    "providerNamespace" TEXT NOT NULL,
    "configurationDigest" TEXT NOT NULL,
    "prepareKey" TEXT NOT NULL,
    "prepareRequestHash" TEXT NOT NULL,
    "policyJson" TEXT NOT NULL,
    "turnsReserved" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "threadId" TEXT,
    "earliestIntentAt" DATETIME NOT NULL,
    "unresolvedRetentionAt" DATETIME NOT NULL,
    "terminalReconciledAt" DATETIME,
    "terminalRetentionAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyProviderRun_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyProviderRun_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyProviderRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "QualityJourneyCoordinatorSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyProviderRun_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "QualityJourneyWorkAuthorization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyProviderDispatchIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerRunId" TEXT NOT NULL,
    "turnOrdinal" INTEGER NOT NULL,
    "operationKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "envelopeDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claimOwner" TEXT,
    "claimEpoch" INTEGER NOT NULL DEFAULT 0,
    "claimExpiresAt" DATETIME,
    "sendBoundaryId" TEXT,
    "armedAt" DATETIME,
    "acknowledgementDueAt" DATETIME,
    "turnDueAt" DATETIME,
    "providerNamespace" TEXT NOT NULL,
    "threadId" TEXT,
    "turnId" TEXT,
    "acknowledgedAt" DATETIME,
    "invalidatedAt" DATETIME,
    "reconciledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyProviderDispatchIntent_providerRunId_fkey" FOREIGN KEY ("providerRunId") REFERENCES "QualityJourneyProviderRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyProviderSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerRunId" TEXT,
    "intentId" TEXT,
    "sendBoundaryId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "reservedAt" DATETIME,
    CONSTRAINT "QualityJourneyProviderSlot_providerRunId_fkey" FOREIGN KEY ("providerRunId") REFERENCES "QualityJourneyProviderRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyProviderSlot_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "QualityJourneyProviderDispatchIntent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyProviderObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentId" TEXT NOT NULL,
    "observationKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "sendBoundaryId" TEXT NOT NULL,
    "providerNamespace" TEXT NOT NULL,
    "threadId" TEXT,
    "turnId" TEXT,
    "evidenceDigest" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyProviderObservation_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "QualityJourneyProviderDispatchIntent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityJourneyWakeIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "causeKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "highWaterSequence" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claimOwner" TEXT,
    "claimEpoch" INTEGER NOT NULL DEFAULT 0,
    "claimExpiresAt" DATETIME,
    "processingOutcome" TEXT,
    "acknowledgedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyWakeIntent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyProviderRun_attemptId_key" ON "QualityJourneyProviderRun"("attemptId");

-- CreateIndex
CREATE INDEX "QualityJourneyProviderRun_journeyId_targetProjectId_status_idx" ON "QualityJourneyProviderRun"("journeyId", "targetProjectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyProviderRun_journeyId_targetProjectId_prepareKey_key" ON "QualityJourneyProviderRun"("journeyId", "targetProjectId", "prepareKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyProviderRun_providerNamespace_threadId_key" ON "QualityJourneyProviderRun"("providerNamespace", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyProviderDispatchIntent_sendBoundaryId_key" ON "QualityJourneyProviderDispatchIntent"("sendBoundaryId");

-- CreateIndex
CREATE INDEX "QualityJourneyProviderDispatchIntent_status_claimExpiresAt_idx" ON "QualityJourneyProviderDispatchIntent"("status", "claimExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyProviderDispatchIntent_providerRunId_turnOrdinal_key" ON "QualityJourneyProviderDispatchIntent"("providerRunId", "turnOrdinal");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyProviderDispatchIntent_providerRunId_operationKey_key" ON "QualityJourneyProviderDispatchIntent"("providerRunId", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyProviderDispatchIntent_providerNamespace_threadId_turnId_key" ON "QualityJourneyProviderDispatchIntent"("providerNamespace", "threadId", "turnId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyProviderSlot_providerRunId_key" ON "QualityJourneyProviderSlot"("providerRunId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyProviderSlot_intentId_key" ON "QualityJourneyProviderSlot"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyProviderObservation_intentId_observationKey_key" ON "QualityJourneyProviderObservation"("intentId", "observationKey");

-- CreateIndex
CREATE INDEX "QualityJourneyWakeIntent_status_claimExpiresAt_idx" ON "QualityJourneyWakeIntent"("status", "claimExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityJourneyWakeIntent_journeyId_targetProjectId_causeKey_key" ON "QualityJourneyWakeIntent"("journeyId", "targetProjectId", "causeKey");


-- Preserve original operational identity and durable deadlines.
CREATE TRIGGER "QualityJourneyProviderRun_immutable_identity" BEFORE UPDATE ON "QualityJourneyProviderRun"
WHEN NEW."id" IS NOT OLD."id" OR
  NEW."attemptId" IS NOT OLD."attemptId" OR
  NEW."journeyId" IS NOT OLD."journeyId" OR
  NEW."targetProjectId" IS NOT OLD."targetProjectId" OR
  NEW."workItemId" IS NOT OLD."workItemId" OR
  NEW."role" IS NOT OLD."role" OR
  NEW."sessionId" IS NOT OLD."sessionId" OR
  NEW."coordinatorGeneration" IS NOT OLD."coordinatorGeneration" OR
  NEW."principalId" IS NOT OLD."principalId" OR
  NEW."assignmentId" IS NOT OLD."assignmentId" OR
  NEW."assignmentGeneration" IS NOT OLD."assignmentGeneration" OR
  NEW."authorizationId" IS NOT OLD."authorizationId" OR
  NEW."authorizationHash" IS NOT OLD."authorizationHash" OR
  NEW."admissionId" IS NOT OLD."admissionId" OR
  NEW."admissionHash" IS NOT OLD."admissionHash" OR
  NEW."leaseId" IS NOT OLD."leaseId" OR
  NEW."inputHash" IS NOT OLD."inputHash" OR
  NEW."scopeHash" IS NOT OLD."scopeHash" OR
  NEW."revisionHash" IS NOT OLD."revisionHash" OR
  NEW."assignmentHash" IS NOT OLD."assignmentHash" OR
  NEW."providerNamespace" IS NOT OLD."providerNamespace" OR
  NEW."configurationDigest" IS NOT OLD."configurationDigest" OR
  NEW."prepareKey" IS NOT OLD."prepareKey" OR
  NEW."prepareRequestHash" IS NOT OLD."prepareRequestHash" OR
  NEW."policyJson" IS NOT OLD."policyJson" OR
  NEW."earliestIntentAt" IS NOT OLD."earliestIntentAt" OR
  NEW."unresolvedRetentionAt" IS NOT OLD."unresolvedRetentionAt" OR
  NEW."createdAt" IS NOT OLD."createdAt"
BEGIN SELECT RAISE(ABORT, 'Provider correlation identity is immutable'); END;

-- Preserve original operational identity and durable deadlines.
CREATE TRIGGER "QualityJourneyProviderDispatchIntent_immutable_identity" BEFORE UPDATE ON "QualityJourneyProviderDispatchIntent"
WHEN NEW."id" IS NOT OLD."id" OR
  NEW."providerRunId" IS NOT OLD."providerRunId" OR
  NEW."turnOrdinal" IS NOT OLD."turnOrdinal" OR
  NEW."operationKey" IS NOT OLD."operationKey" OR
  NEW."requestHash" IS NOT OLD."requestHash" OR
  NEW."envelopeDigest" IS NOT OLD."envelopeDigest" OR
  NEW."providerNamespace" IS NOT OLD."providerNamespace" OR
  NEW."createdAt" IS NOT OLD."createdAt"
BEGIN SELECT RAISE(ABORT, 'Provider correlation identity is immutable'); END;

-- Preserve original operational identity and durable deadlines.
CREATE TRIGGER "QualityJourneyWakeIntent_immutable_identity" BEFORE UPDATE ON "QualityJourneyWakeIntent"
WHEN NEW."id" IS NOT OLD."id" OR
  NEW."journeyId" IS NOT OLD."journeyId" OR
  NEW."targetProjectId" IS NOT OLD."targetProjectId" OR
  NEW."causeKey" IS NOT OLD."causeKey" OR
  NEW."reason" IS NOT OLD."reason" OR
  NEW."highWaterSequence" IS NOT OLD."highWaterSequence" OR
  NEW."createdAt" IS NOT OLD."createdAt"
BEGIN SELECT RAISE(ABORT, 'Provider correlation identity is immutable'); END;

CREATE TRIGGER "QualityJourneyProviderRun_no_delete" BEFORE DELETE ON "QualityJourneyProviderRun"
BEGIN SELECT RAISE(ABORT, 'Provider operational history cannot be deleted'); END;

CREATE TRIGGER "QualityJourneyProviderDispatchIntent_no_delete" BEFORE DELETE ON "QualityJourneyProviderDispatchIntent"
BEGIN SELECT RAISE(ABORT, 'Provider operational history cannot be deleted'); END;

CREATE TRIGGER "QualityJourneyProviderObservation_no_delete" BEFORE DELETE ON "QualityJourneyProviderObservation"
BEGIN SELECT RAISE(ABORT, 'Provider operational history cannot be deleted'); END;

CREATE TRIGGER "QualityJourneyWakeIntent_no_delete" BEFORE DELETE ON "QualityJourneyWakeIntent"
BEGIN SELECT RAISE(ABORT, 'Provider operational history cannot be deleted'); END;

CREATE TRIGGER "QualityJourneyProviderObservation_no_update" BEFORE UPDATE ON "QualityJourneyProviderObservation"
BEGIN SELECT RAISE(ABORT, 'Provider observations are append-only'); END;

CREATE TRIGGER "QualityJourneyProviderRun_monotonic_evidence" BEFORE UPDATE ON "QualityJourneyProviderRun"
WHEN NEW."turnsReserved" < OLD."turnsReserved" OR NEW."turnsReserved" > 3
  OR (OLD."threadId" IS NOT NULL AND NEW."threadId" IS NOT OLD."threadId")
  OR (OLD."terminalReconciledAt" IS NOT NULL AND NEW."terminalReconciledAt" IS NOT OLD."terminalReconciledAt")
  OR (OLD."terminalRetentionAt" IS NOT NULL AND NEW."terminalRetentionAt" IS NOT OLD."terminalRetentionAt")
BEGIN SELECT RAISE(ABORT, 'Provider evidence and reservations cannot be reset'); END;

CREATE TRIGGER "QualityJourneyProviderDispatchIntent_monotonic_evidence" BEFORE UPDATE ON "QualityJourneyProviderDispatchIntent"
WHEN NEW."claimEpoch" < OLD."claimEpoch"
  OR (OLD."sendBoundaryId" IS NOT NULL AND (
    NEW."sendBoundaryId" IS NOT OLD."sendBoundaryId" OR NEW."armedAt" IS NOT OLD."armedAt"
    OR NEW."acknowledgementDueAt" IS NOT OLD."acknowledgementDueAt" OR NEW."turnDueAt" IS NOT OLD."turnDueAt"
    OR NEW."claimEpoch" IS NOT OLD."claimEpoch" OR NEW."claimOwner" IS NOT OLD."claimOwner"))
  OR (OLD."threadId" IS NOT NULL AND NEW."threadId" IS NOT OLD."threadId")
  OR (OLD."turnId" IS NOT NULL AND NEW."turnId" IS NOT OLD."turnId")
  OR (OLD."acknowledgedAt" IS NOT NULL AND NEW."acknowledgedAt" IS NOT OLD."acknowledgedAt")
  OR (OLD."reconciledAt" IS NOT NULL AND NEW."reconciledAt" IS NOT OLD."reconciledAt")
BEGIN SELECT RAISE(ABORT, 'Provider send evidence cannot be reset'); END;

CREATE TRIGGER "QualityJourneyProviderSlot_singleton" BEFORE INSERT ON "QualityJourneyProviderSlot"
WHEN NEW."id" <> 'HUB'
BEGIN SELECT RAISE(ABORT, 'Only the singleton hub provider slot is allowed'); END;

CREATE TRIGGER "QualityJourneyProviderSlot_no_delete" BEFORE DELETE ON "QualityJourneyProviderSlot"
BEGIN SELECT RAISE(ABORT, 'Hub provider slot cannot be deleted'); END;

CREATE TRIGGER "QualityJourneyProviderSlot_release_evidence" BEFORE UPDATE ON "QualityJourneyProviderSlot"
WHEN OLD."intentId" IS NOT NULL AND (NEW."intentId" IS NOT OLD."intentId" OR NEW."providerRunId" IS NOT OLD."providerRunId" OR NEW."sendBoundaryId" IS NOT OLD."sendBoundaryId")
 AND NOT EXISTS (SELECT 1 FROM "QualityJourneyProviderDispatchIntent" i
   JOIN "QualityJourneyProviderObservation" o ON o."intentId" = i."id"
   WHERE i."id" = OLD."intentId" AND i."providerRunId" = OLD."providerRunId"
     AND i."sendBoundaryId" = OLD."sendBoundaryId" AND i."reconciledAt" IS NOT NULL
     AND o."sendBoundaryId" = OLD."sendBoundaryId" AND o."kind" IN ('NONSTART', 'TERMINAL'))
BEGIN SELECT RAISE(ABORT, 'Uncertain provider slot requires exact reconciliation evidence'); END;

CREATE TRIGGER "QualityJourneyProviderRun_insert_budget" BEFORE INSERT ON "QualityJourneyProviderRun"
WHEN NEW."turnsReserved" < 0 OR NEW."turnsReserved" > 3
BEGIN SELECT RAISE(ABORT, 'Provider turn reservation exceeds frozen cap'); END;

CREATE TRIGGER "QualityJourneyProviderDispatchIntent_insert_ordinal" BEFORE INSERT ON "QualityJourneyProviderDispatchIntent"
WHEN NEW."turnOrdinal" < 1 OR NEW."turnOrdinal" > 3
BEGIN SELECT RAISE(ABORT, 'Provider turn ordinal exceeds frozen cap'); END;

CREATE TRIGGER "QualityJourneyProviderSlot_immutable_id" BEFORE UPDATE OF "id" ON "QualityJourneyProviderSlot"
WHEN NEW."id" IS NOT OLD."id"
BEGIN SELECT RAISE(ABORT, 'Hub provider slot identity is immutable'); END;
