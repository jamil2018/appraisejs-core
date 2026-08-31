ALTER TABLE "QualityJourney" ADD COLUMN "analysisReviewHash" TEXT;
ALTER TABLE "QualityJourneyWorkAuthorization" ADD COLUMN "supersedesAuthorizationId" TEXT REFERENCES "QualityJourneyWorkAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "QualityJourneyWorkAuthorization_workItemId_key";
CREATE UNIQUE INDEX "QualityJourneyWorkAuthorization_supersedesAuthorizationId_key" ON "QualityJourneyWorkAuthorization"("supersedesAuthorizationId");
CREATE INDEX "QualityJourneyWorkAuthorization_workItemId_createdAt_idx" ON "QualityJourneyWorkAuthorization"("workItemId", "createdAt");
DROP TRIGGER "QualityJourneyWorkAuthorization_authority_fields_immutable";
CREATE TRIGGER "QualityJourneyWorkAuthorization_authority_fields_immutable"
BEFORE UPDATE OF "journeyId", "targetProjectId", "workItemId", "supersedesAuthorizationId", "role", "roleContractDigest", "capabilityProfileId", "capabilityProfileHash", "authorizationJson", "authorizationHash", "maxAttempts" ON "QualityJourneyWorkAuthorization"
BEGIN SELECT RAISE(ABORT, 'QualityJourneyWorkAuthorization authority is immutable'); END;

CREATE TABLE "QualityJourneyAnalysisRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "artifactRecordId" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "artifactRevisionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "contentHash" TEXT NOT NULL,
  "predecessorRevisionId" TEXT,
  "submissionIdempotencyKey" TEXT NOT NULL,
  "submissionHash" TEXT NOT NULL,
  "submittedWorkItemId" TEXT NOT NULL,
  "submittedAttemptId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyAnalysisRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisRevision_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisRevision_submittedWorkItemId_fkey" FOREIGN KEY ("submittedWorkItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisRevision_submittedAttemptId_fkey" FOREIGN KEY ("submittedAttemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisRevision_predecessorRevisionId_fkey" FOREIGN KEY ("predecessorRevisionId") REFERENCES "QualityJourneyAnalysisRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyAnalysisRevision_artifactRecordId_key" ON "QualityJourneyAnalysisRevision"("artifactRecordId");
CREATE UNIQUE INDEX "QualityJourneyAnalysisRevision_journeyId_artifactRevisionId_key" ON "QualityJourneyAnalysisRevision"("journeyId", "artifactRevisionId");
CREATE UNIQUE INDEX "QualityJourneyAnalysisRevision_journeyId_revision_key" ON "QualityJourneyAnalysisRevision"("journeyId", "revision");
CREATE UNIQUE INDEX "QualityJourneyAnalysisRevision_predecessorRevisionId_key" ON "QualityJourneyAnalysisRevision"("predecessorRevisionId");
CREATE UNIQUE INDEX "QualityJourneyAnalysisRevision_journeyId_submissionIdempotencyKey_key" ON "QualityJourneyAnalysisRevision"("journeyId", "submissionIdempotencyKey");
CREATE INDEX "QualityJourneyAnalysisRevision_journeyId_createdAt_idx" ON "QualityJourneyAnalysisRevision"("journeyId", "createdAt");
CREATE INDEX "QualityJourneyAnalysisRevision_targetProjectId_cycleId_idx" ON "QualityJourneyAnalysisRevision"("targetProjectId", "cycleId");

CREATE TABLE "QualityJourneyAnalysisQuestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "analysisRevisionId" TEXT NOT NULL,
  "artifactRecordId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyAnalysisQuestion_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisQuestion_analysisRevisionId_fkey" FOREIGN KEY ("analysisRevisionId") REFERENCES "QualityJourneyAnalysisRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisQuestion_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyAnalysisQuestion_artifactRecordId_key" ON "QualityJourneyAnalysisQuestion"("artifactRecordId");
CREATE UNIQUE INDEX "QualityJourneyAnalysisQuestion_analysisRevisionId_questionId_key" ON "QualityJourneyAnalysisQuestion"("analysisRevisionId", "questionId");
CREATE INDEX "QualityJourneyAnalysisQuestion_journeyId_required_idx" ON "QualityJourneyAnalysisQuestion"("journeyId", "required");

CREATE TABLE "QualityJourneyAnalysisAnswer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "questionRecordId" TEXT NOT NULL,
  "artifactRecordId" TEXT NOT NULL,
  "answerId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "correctionOfAnswerId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyAnalysisAnswer_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisAnswer_questionRecordId_fkey" FOREIGN KEY ("questionRecordId") REFERENCES "QualityJourneyAnalysisQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisAnswer_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisAnswer_correctionOfAnswerId_fkey" FOREIGN KEY ("correctionOfAnswerId") REFERENCES "QualityJourneyAnalysisAnswer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyAnalysisAnswer_artifactRecordId_key" ON "QualityJourneyAnalysisAnswer"("artifactRecordId");
CREATE UNIQUE INDEX "QualityJourneyAnalysisAnswer_journeyId_answerId_key" ON "QualityJourneyAnalysisAnswer"("journeyId", "answerId");
CREATE UNIQUE INDEX "QualityJourneyAnalysisAnswer_journeyId_idempotencyKey_key" ON "QualityJourneyAnalysisAnswer"("journeyId", "idempotencyKey");
CREATE INDEX "QualityJourneyAnalysisAnswer_questionRecordId_createdAt_idx" ON "QualityJourneyAnalysisAnswer"("questionRecordId", "createdAt");

CREATE TABLE "QualityJourneyAnalysisPublication" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "analysisRevisionId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "artifactHash" TEXT NOT NULL,
  "reviewHash" TEXT NOT NULL,
  "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyAnalysisPublication_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisPublication_analysisRevisionId_fkey" FOREIGN KEY ("analysisRevisionId") REFERENCES "QualityJourneyAnalysisRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyAnalysisPublication_analysisRevisionId_key" ON "QualityJourneyAnalysisPublication"("analysisRevisionId");
CREATE UNIQUE INDEX "QualityJourneyAnalysisPublication_commandId_key" ON "QualityJourneyAnalysisPublication"("commandId");
CREATE INDEX "QualityJourneyAnalysisPublication_journeyId_publishedAt_idx" ON "QualityJourneyAnalysisPublication"("journeyId", "publishedAt");

CREATE TABLE "QualityJourneyAnalysisDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "journeyId" TEXT NOT NULL,
  "analysisRevisionId" TEXT NOT NULL,
  "artifactRecordId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "reviewHash" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyAnalysisDecision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisDecision_analysisRevisionId_fkey" FOREIGN KEY ("analysisRevisionId") REFERENCES "QualityJourneyAnalysisRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityJourneyAnalysisDecision_artifactRecordId_fkey" FOREIGN KEY ("artifactRecordId") REFERENCES "QualityJourneyArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityJourneyAnalysisDecision_analysisRevisionId_key" ON "QualityJourneyAnalysisDecision"("analysisRevisionId");
CREATE UNIQUE INDEX "QualityJourneyAnalysisDecision_artifactRecordId_key" ON "QualityJourneyAnalysisDecision"("artifactRecordId");
CREATE UNIQUE INDEX "QualityJourneyAnalysisDecision_commandId_key" ON "QualityJourneyAnalysisDecision"("commandId");
CREATE INDEX "QualityJourneyAnalysisDecision_journeyId_createdAt_idx" ON "QualityJourneyAnalysisDecision"("journeyId", "createdAt");

CREATE TRIGGER "QualityJourneyAnalysisRevision_no_update" BEFORE UPDATE ON "QualityJourneyAnalysisRevision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisRevision is immutable'); END;
CREATE TRIGGER "QualityJourneyAnalysisRevision_no_delete" BEFORE DELETE ON "QualityJourneyAnalysisRevision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisRevision is immutable'); END;
CREATE TRIGGER "QualityJourneyAnalysisQuestion_no_update" BEFORE UPDATE ON "QualityJourneyAnalysisQuestion" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisQuestion is immutable'); END;
CREATE TRIGGER "QualityJourneyAnalysisQuestion_no_delete" BEFORE DELETE ON "QualityJourneyAnalysisQuestion" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisQuestion is immutable'); END;
CREATE TRIGGER "QualityJourneyAnalysisAnswer_no_update" BEFORE UPDATE ON "QualityJourneyAnalysisAnswer" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisAnswer is immutable'); END;
CREATE TRIGGER "QualityJourneyAnalysisAnswer_no_delete" BEFORE DELETE ON "QualityJourneyAnalysisAnswer" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisAnswer is immutable'); END;
CREATE TRIGGER "QualityJourneyAnalysisPublication_no_update" BEFORE UPDATE ON "QualityJourneyAnalysisPublication" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisPublication is immutable'); END;
CREATE TRIGGER "QualityJourneyAnalysisPublication_no_delete" BEFORE DELETE ON "QualityJourneyAnalysisPublication" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisPublication is immutable'); END;
CREATE TRIGGER "QualityJourneyAnalysisDecision_no_update" BEFORE UPDATE ON "QualityJourneyAnalysisDecision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisDecision is immutable'); END;
CREATE TRIGGER "QualityJourneyAnalysisDecision_no_delete" BEFORE DELETE ON "QualityJourneyAnalysisDecision" BEGIN SELECT RAISE(ABORT, 'QualityJourneyAnalysisDecision is immutable'); END;
