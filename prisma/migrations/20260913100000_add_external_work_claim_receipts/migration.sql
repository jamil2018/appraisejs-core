-- C2.1.1: durable caller-secret authenticated EXTERNAL_V1 claim receipts.
-- This extends the retained Analyzer admission path without reinterpreting
-- managed Factory claims or replacing the graph-owned work-item state machine.
ALTER TABLE "QualityJourneyWorkAttempt" ADD COLUMN "externalAdmissionRequestJson" TEXT;

CREATE TABLE "QualityJourneyExternalWorkClaimReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "principalAssurance" TEXT NOT NULL,
    "assignmentSecretVerifier" TEXT NOT NULL,
    "assignmentGeneration" INTEGER NOT NULL,
    "leaseId" TEXT NOT NULL,
    "leaseRequestSeconds" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestJson" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "receiptJson" TEXT NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityJourneyExternalWorkClaimReceipt_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "QualityJourney" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyExternalWorkClaimReceipt_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "QualityJourneyWorkItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyExternalWorkClaimReceipt_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "QualityJourneyWorkAuthorization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityJourneyExternalWorkClaimReceipt_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QualityJourneyWorkAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QualityJourneyExternalWorkClaimReceipt_attemptId_key"
ON "QualityJourneyExternalWorkClaimReceipt"("attemptId");

CREATE UNIQUE INDEX "QualityJourneyExternalWorkClaimReceipt_journeyId_targetProjectId_principalId_protocol_idempotencyKey_key"
ON "QualityJourneyExternalWorkClaimReceipt"("journeyId", "targetProjectId", "principalId", "protocol", "idempotencyKey");

CREATE INDEX "QualityJourneyExternalWorkClaimReceipt_workItemId_createdAt_idx"
ON "QualityJourneyExternalWorkClaimReceipt"("workItemId", "createdAt");

CREATE INDEX "QualityJourneyExternalWorkClaimReceipt_authorizationId_createdAt_idx"
ON "QualityJourneyExternalWorkClaimReceipt"("authorizationId", "createdAt");
