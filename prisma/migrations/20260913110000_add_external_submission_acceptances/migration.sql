-- C2.1.2: durable, role-specialized EXTERNAL_V1 submission acceptance
-- receipts.  The receipt is committed atomically with the canonical
-- specialized artifact effect; it is never a generic state-mutation log.
CREATE TABLE "QualityJourneyExternalSubmissionAcceptance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "assignmentGeneration" INTEGER NOT NULL,
    "leaseId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "principalAssurance" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "outcomeJson" TEXT NOT NULL,
    "outcomeHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyExternalSubmissionAcceptance_attemptId_fkey"
      FOREIGN KEY ("attemptId") REFERENCES "QualityJourneyWorkAttempt" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QualityJourneyExternalSubmissionAcceptance_journeyId_targetProjectId_principalId_operation_attemptId_idempotencyKey_key"
ON "QualityJourneyExternalSubmissionAcceptance"("journeyId", "targetProjectId", "principalId", "operation", "attemptId", "idempotencyKey");

CREATE INDEX "QualityJourneyExternalSubmissionAcceptance_assignmentId_assignmentGeneration_createdAt_idx"
ON "QualityJourneyExternalSubmissionAcceptance"("assignmentId", "assignmentGeneration", "createdAt");

CREATE INDEX "QualityJourneyExternalSubmissionAcceptance_workItemId_createdAt_idx"
ON "QualityJourneyExternalSubmissionAcceptance"("workItemId", "createdAt");
