CREATE TABLE "QualityJourney" (
  "id" TEXT NOT NULL PRIMARY KEY, "targetProjectId" TEXT NOT NULL, "rootIdempotencyKey" TEXT NOT NULL,
  "rootRequestHash" TEXT NOT NULL, "stage" TEXT NOT NULL DEFAULT 'INTAKE', "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "activeCycleId" TEXT NOT NULL, "activeRevisionIdsJson" TEXT NOT NULL DEFAULT '{}',
  "unresolvedQuestionIdsJson" TEXT NOT NULL DEFAULT '[]', "blockerIdsJson" TEXT NOT NULL DEFAULT '[]',
  "activeWorkItemIdsJson" TEXT NOT NULL DEFAULT '[]', "stateHash" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "QualityJourney_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourney_targetProjectId_rootIdempotencyKey_key" ON "QualityJourney"("targetProjectId", "rootIdempotencyKey");
CREATE INDEX "QualityJourney_targetProjectId_status_idx" ON "QualityJourney"("targetProjectId", "status");
CREATE INDEX "QualityJourney_targetProjectId_stage_idx" ON "QualityJourney"("targetProjectId", "stage");

CREATE TABLE "QualityJourneyRevision" (
  "id" TEXT NOT NULL PRIMARY KEY, "journeyId" TEXT NOT NULL, "revision" INTEGER NOT NULL, "contentJson" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyRevision_journeyId_revision_key" ON "QualityJourneyRevision"("journeyId", "revision");
CREATE INDEX "QualityJourneyRevision_journeyId_createdAt_idx" ON "QualityJourneyRevision"("journeyId", "createdAt");

CREATE TABLE "QualityJourneyCycle" (
  "id" TEXT NOT NULL PRIMARY KEY, "journeyId" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "predecessorCycleId" TEXT,
  "scopeJson" TEXT NOT NULL DEFAULT '{}', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyCycle_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyCycle_journeyId_sequence_key" ON "QualityJourneyCycle"("journeyId", "sequence");

CREATE TABLE "QualityJourneyCommand" (
  "id" TEXT NOT NULL PRIMARY KEY, "journeyId" TEXT NOT NULL, "targetProjectId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL, "requestJson" TEXT NOT NULL, "resultJson" TEXT NOT NULL, "eventId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyCommand_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyCommand_journeyId_idempotencyKey_key" ON "QualityJourneyCommand"("journeyId", "idempotencyKey");
CREATE UNIQUE INDEX "QualityJourneyCommand_journeyId_id_key" ON "QualityJourneyCommand"("journeyId", "id");
CREATE INDEX "QualityJourneyCommand_targetProjectId_createdAt_idx" ON "QualityJourneyCommand"("targetProjectId", "createdAt");

CREATE TABLE "QualityJourneyEvent" (
  "id" TEXT NOT NULL PRIMARY KEY, "journeyId" TEXT NOT NULL, "targetProjectId" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
  "eventType" TEXT NOT NULL, "commandId" TEXT, "predecessorStateHash" TEXT NOT NULL, "successorStateHash" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyEvent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyEvent_journeyId_sequence_key" ON "QualityJourneyEvent"("journeyId", "sequence");
CREATE INDEX "QualityJourneyEvent_targetProjectId_createdAt_idx" ON "QualityJourneyEvent"("targetProjectId", "createdAt");

CREATE TABLE "QualityJourneyWorkItem" (
  "id" TEXT NOT NULL PRIMARY KEY, "journeyId" TEXT NOT NULL, "targetProjectId" TEXT NOT NULL, "cycleId" TEXT NOT NULL,
  "role" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ELIGIBLE', "inputHash" TEXT NOT NULL, "roleContractDigest" TEXT NOT NULL,
  "inputArtifactRefsJson" TEXT NOT NULL DEFAULT '[]', "allowedOutputsJson" TEXT NOT NULL DEFAULT '[]',
  "completionCriteriaJson" TEXT NOT NULL DEFAULT '[]', "currentAttempt" INTEGER NOT NULL DEFAULT 0, "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "QualityJourneyWorkItem_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "QualityJourneyWorkItem_journeyId_status_idx" ON "QualityJourneyWorkItem"("journeyId", "status");
CREATE INDEX "QualityJourneyWorkItem_journeyId_role_cycleId_idx" ON "QualityJourneyWorkItem"("journeyId", "role", "cycleId");
CREATE INDEX "QualityJourneyWorkItem_targetProjectId_status_idx" ON "QualityJourneyWorkItem"("targetProjectId", "status");

CREATE TABLE "QualityJourneyWorkAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY, "workItemId" TEXT NOT NULL, "attempt" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'CLAIMED',
  "leaseId" TEXT NOT NULL, "ownerTokenHash" TEXT NOT NULL, "leaseExpiresAt" DATETIME NOT NULL, "heartbeatSeconds" INTEGER NOT NULL,
  "resultJson" TEXT, "resultHash" TEXT, "failureJson" TEXT, "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" DATETIME,
  CONSTRAINT "QualityJourneyWorkAttempt_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_leaseId_key" ON "QualityJourneyWorkAttempt"("leaseId");
CREATE UNIQUE INDEX "QualityJourneyWorkAttempt_workItemId_attempt_key" ON "QualityJourneyWorkAttempt"("workItemId", "attempt");
CREATE INDEX "QualityJourneyWorkAttempt_leaseExpiresAt_status_idx" ON "QualityJourneyWorkAttempt"("leaseExpiresAt", "status");

CREATE TABLE "QualityJourneyBlocker" (
  "id" TEXT NOT NULL PRIMARY KEY, "journeyId" TEXT NOT NULL, "targetProjectId" TEXT NOT NULL, "reasonCode" TEXT NOT NULL,
  "summary" TEXT NOT NULL, "evidenceJson" TEXT NOT NULL DEFAULT '[]', "responsibleActor" TEXT NOT NULL,
  "affectedNodeIdsJson" TEXT NOT NULL DEFAULT '[]', "requiredResolution" TEXT NOT NULL, "safeResumeCommand" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "resolutionJson" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" DATETIME,
  CONSTRAINT "QualityJourneyBlocker_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "QualityJourneyBlocker_journeyId_status_idx" ON "QualityJourneyBlocker"("journeyId", "status");
CREATE INDEX "QualityJourneyBlocker_targetProjectId_status_idx" ON "QualityJourneyBlocker"("targetProjectId", "status");

CREATE TABLE "QualityJourneyArtifactLink" (
  "id" TEXT NOT NULL PRIMARY KEY, "journeyId" TEXT NOT NULL, "targetProjectId" TEXT NOT NULL, "cycleId" TEXT NOT NULL,
  "relation" TEXT NOT NULL, "sourceJson" TEXT NOT NULL, "targetJson" TEXT NOT NULL, "linkHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyArtifactLink_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyArtifactLink_journeyId_linkHash_key" ON "QualityJourneyArtifactLink"("journeyId", "linkHash");
CREATE INDEX "QualityJourneyArtifactLink_targetProjectId_cycleId_idx" ON "QualityJourneyArtifactLink"("targetProjectId", "cycleId");

CREATE TABLE "QualityJourneyArtifact" (
  "id" TEXT NOT NULL PRIMARY KEY, "identityKey" TEXT NOT NULL, "journeyId" TEXT NOT NULL, "targetProjectId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL, "kind" TEXT NOT NULL, "artifactId" TEXT NOT NULL, "revisionId" TEXT, "contentHash" TEXT NOT NULL,
  "artifactJson" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyArtifact_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyArtifact_journeyId_identityKey_key" ON "QualityJourneyArtifact"("journeyId", "identityKey");
CREATE INDEX "QualityJourneyArtifact_targetProjectId_kind_idx" ON "QualityJourneyArtifact"("targetProjectId", "kind");
CREATE INDEX "QualityJourneyArtifact_journeyId_artifactId_idx" ON "QualityJourneyArtifact"("journeyId", "artifactId");

CREATE TRIGGER "QualityJourneyEvent_no_update" BEFORE UPDATE ON "QualityJourneyEvent" BEGIN SELECT RAISE(ABORT, 'QualityJourneyEvent is append-only'); END;
CREATE TRIGGER "QualityJourneyEvent_no_delete" BEFORE DELETE ON "QualityJourneyEvent" BEGIN SELECT RAISE(ABORT, 'QualityJourneyEvent is append-only'); END;
CREATE TRIGGER "QualityJourneyCommand_no_update" BEFORE UPDATE ON "QualityJourneyCommand" BEGIN SELECT RAISE(ABORT, 'QualityJourneyCommand is immutable'); END;
CREATE TRIGGER "QualityJourneyCommand_no_delete" BEFORE DELETE ON "QualityJourneyCommand" BEGIN SELECT RAISE(ABORT, 'QualityJourneyCommand is immutable'); END;
CREATE TRIGGER "QualityJourneyRevision_no_update" BEFORE UPDATE ON "QualityJourneyRevision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyRevision is immutable'); END;
CREATE TRIGGER "QualityJourneyRevision_no_delete" BEFORE DELETE ON "QualityJourneyRevision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyRevision is immutable'); END;
CREATE TRIGGER "QualityJourneyCycle_no_update" BEFORE UPDATE ON "QualityJourneyCycle" BEGIN SELECT RAISE(ABORT, 'QualityJourneyCycle is immutable'); END;
CREATE TRIGGER "QualityJourneyCycle_no_delete" BEFORE DELETE ON "QualityJourneyCycle" BEGIN SELECT RAISE(ABORT, 'QualityJourneyCycle is immutable'); END;
CREATE TRIGGER "QualityJourneyArtifactLink_no_update" BEFORE UPDATE ON "QualityJourneyArtifactLink" BEGIN SELECT RAISE(ABORT, 'QualityJourneyArtifactLink is immutable'); END;
CREATE TRIGGER "QualityJourneyArtifactLink_no_delete" BEFORE DELETE ON "QualityJourneyArtifactLink" BEGIN SELECT RAISE(ABORT, 'QualityJourneyArtifactLink is immutable'); END;
CREATE TRIGGER "QualityJourneyArtifact_no_update" BEFORE UPDATE ON "QualityJourneyArtifact" BEGIN SELECT RAISE(ABORT, 'QualityJourneyArtifact is immutable'); END;
CREATE TRIGGER "QualityJourneyArtifact_no_delete" BEFORE DELETE ON "QualityJourneyArtifact" BEGIN SELECT RAISE(ABORT, 'QualityJourneyArtifact is immutable'); END;
