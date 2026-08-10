CREATE TABLE "AssessmentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "qualityPlanRevisionId" TEXT NOT NULL,
    "evaluationSubjectRevisionId" TEXT NOT NULL,
    "idempotencyScope" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "stopReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssessmentRun_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRun_assessmentId_targetProjectId_qualityPlanRevisionId_fkey" FOREIGN KEY ("assessmentId", "targetProjectId", "qualityPlanRevisionId") REFERENCES "Assessment" ("id", "targetProjectId", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRun_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "targetProjectId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRun_evaluationSubjectRevisionId_fkey" FOREIGN KEY ("evaluationSubjectRevisionId") REFERENCES "EvaluationSubjectRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssessmentRun_id_targetProjectId_key" ON "AssessmentRun"("id", "targetProjectId");
CREATE UNIQUE INDEX "AssessmentRun_id_targetProjectId_qualityPlanRevisionId_key" ON "AssessmentRun"("id", "targetProjectId", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "AssessmentRun_idempotencyScope_idempotencyKey_key" ON "AssessmentRun"("idempotencyScope", "idempotencyKey");
CREATE INDEX "AssessmentRun_assessmentId_status_idx" ON "AssessmentRun"("assessmentId", "status");
CREATE INDEX "AssessmentRun_targetProjectId_status_idx" ON "AssessmentRun"("targetProjectId", "status");

CREATE TABLE "AssessmentRunBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assessmentRunId" TEXT NOT NULL,
    "validationVersionId" TEXT NOT NULL,
    "resultMatrixCell" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "runtimeInputHash" TEXT NOT NULL,
    "terminalOutcome" TEXT,
    "terminalizedAt" DATETIME,
    "evidenceReceiptId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssessmentRunBinding_assessmentRunId_fkey" FOREIGN KEY ("assessmentRunId") REFERENCES "AssessmentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRunBinding_validationVersionId_fkey" FOREIGN KEY ("validationVersionId") REFERENCES "ValidationVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRunBinding_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentRunBinding_evidenceReceiptId_fkey" FOREIGN KEY ("evidenceReceiptId") REFERENCES "EvidenceReceipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssessmentRunBinding_testRunId_key" ON "AssessmentRunBinding"("testRunId");
CREATE UNIQUE INDEX "AssessmentRunBinding_assessmentRunId_validationVersionId_resultMatrixCell_key" ON "AssessmentRunBinding"("assessmentRunId", "validationVersionId", "resultMatrixCell");
CREATE INDEX "AssessmentRunBinding_assessmentRunId_terminalizedAt_idx" ON "AssessmentRunBinding"("assessmentRunId", "terminalizedAt");
CREATE INDEX "AssessmentRunBinding_validationVersionId_idx" ON "AssessmentRunBinding"("validationVersionId");

CREATE TABLE "QualityValidationPublication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "targetFingerprint" TEXT NOT NULL,
    "qualityPlanRevisionId" TEXT NOT NULL,
    "validationVersionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "operationHash" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'review_ready',
    "expectedRevisionHash" TEXT NOT NULL,
    "validationHash" TEXT NOT NULL,
    "validationContent" TEXT NOT NULL,
    "reviewHash" TEXT NOT NULL,
    "reviewContent" TEXT NOT NULL,
    "astId" TEXT NOT NULL,
    "astHash" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "previewHash" TEXT NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "projectionHash" TEXT NOT NULL,
    "projectionJson" TEXT NOT NULL,
    "validationProjectionJson" TEXT NOT NULL,
    "runtimeInputHash" TEXT NOT NULL,
    "runtimeInputJson" TEXT NOT NULL,
    "failure" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityValidationPublication_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QualityValidationPublication_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "targetProjectId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QualityValidationPublication_validationVersionId_qualityPlanRevisionId_fkey" FOREIGN KEY ("validationVersionId", "qualityPlanRevisionId") REFERENCES "ValidationVersion" ("id", "qualityPlanRevisionId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityValidationPublication_validationVersionId_key" ON "QualityValidationPublication"("validationVersionId");
CREATE UNIQUE INDEX "QualityValidationPublication_operationHash_key" ON "QualityValidationPublication"("operationHash");
CREATE UNIQUE INDEX "QualityValidationPublication_qualityPlanRevisionId_idempotencyKey_key" ON "QualityValidationPublication"("qualityPlanRevisionId", "idempotencyKey");
CREATE UNIQUE INDEX "QualityValidationPublication_validationVersionId_qualityPlanRevisionId_key" ON "QualityValidationPublication"("validationVersionId", "qualityPlanRevisionId");
CREATE INDEX "QualityValidationPublication_targetProjectId_phase_idx" ON "QualityValidationPublication"("targetProjectId", "phase");
CREATE INDEX "QualityValidationPublication_qualityPlanRevisionId_validationVersionId_idx" ON "QualityValidationPublication"("qualityPlanRevisionId", "validationVersionId");

CREATE TABLE "QualityValidationExtensionReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicationId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "compiledHash" TEXT NOT NULL,
    "artifactHash" TEXT NOT NULL,
    "artifactJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityValidationExtensionReview_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "QualityValidationPublication" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityValidationExtensionReview_publicationId_extensionId_version_key" ON "QualityValidationExtensionReview"("publicationId", "extensionId", "version");

-- Clean cutover: legacy plan/publication identity is not retained on the
-- preserved TestRun/runtime storage. SQLite requires table rebuilds to remove
-- those foreign-key columns safely.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_TestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "preparationKey" TEXT,
    "runId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "result" TEXT NOT NULL DEFAULT 'PENDING',
    "evidenceHealth" TEXT NOT NULL DEFAULT 'invalid_missing_report',
    "updatedAt" DATETIME NOT NULL,
    "environmentId" TEXT NOT NULL,
    "testWorkersCount" INTEGER DEFAULT 1,
    "browserEngine" TEXT NOT NULL DEFAULT 'CHROMIUM',
    "logPath" TEXT,
    "reportPath" TEXT,
    "targetProjectId" TEXT,
    CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestRun_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestRun" ("id", "name", "preparationKey", "runId", "startedAt", "completedAt", "status", "result", "evidenceHealth", "updatedAt", "environmentId", "testWorkersCount", "browserEngine", "logPath", "reportPath", "targetProjectId")
SELECT "id", "name", "preparationKey", "runId", "startedAt", "completedAt", "status", "result", "evidenceHealth", "updatedAt", "environmentId", "testWorkersCount", "browserEngine", "logPath", "reportPath", "targetProjectId" FROM "TestRun";
DROP TABLE "TestRun";
ALTER TABLE "new_TestRun" RENAME TO "TestRun";
CREATE UNIQUE INDEX "TestRun_runId_key" ON "TestRun"("runId");
CREATE UNIQUE INDEX "TestRun_targetProjectId_preparationKey_key" ON "TestRun"("targetProjectId", "preparationKey");
CREATE INDEX "TestRun_completedAt_idx" ON "TestRun"("completedAt");
CREATE INDEX "TestRun_result_idx" ON "TestRun"("result");
CREATE INDEX "TestRun_evidenceHealth_idx" ON "TestRun"("evidenceHealth");
CREATE INDEX "TestRun_targetProjectId_idx" ON "TestRun"("targetProjectId");
CREATE INDEX "TestRun_targetProjectId_startedAt_id_idx" ON "TestRun"("targetProjectId", "startedAt", "id");

CREATE TABLE "new_RuntimeCapsule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetProjectId" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "validationHash" TEXT NOT NULL,
    "qualityPublicationId" TEXT,
    "capsuleHash" TEXT NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "manifestJson" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "integrityState" TEXT NOT NULL DEFAULT 'staging',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RuntimeCapsule_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RuntimeCapsule_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RuntimeCapsule_qualityPublicationId_fkey" FOREIGN KEY ("qualityPublicationId") REFERENCES "QualityValidationPublication" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RuntimeCapsule" ("id", "targetProjectId", "testRunId", "validationHash", "capsuleHash", "manifestHash", "manifestJson", "storagePath", "integrityState", "version", "createdAt", "updatedAt")
SELECT "id", "targetProjectId", "testRunId", "validationHash", "capsuleHash", "manifestHash", "manifestJson", "storagePath", "integrityState", "version", "createdAt", "updatedAt" FROM "RuntimeCapsule";
DROP TABLE "RuntimeCapsule";
ALTER TABLE "new_RuntimeCapsule" RENAME TO "RuntimeCapsule";
CREATE UNIQUE INDEX "RuntimeCapsule_testRunId_key" ON "RuntimeCapsule"("testRunId");
CREATE UNIQUE INDEX "RuntimeCapsule_targetProjectId_validationHash_testRunId_key" ON "RuntimeCapsule"("targetProjectId", "validationHash", "testRunId");
CREATE UNIQUE INDEX "RuntimeCapsule_targetProjectId_storagePath_key" ON "RuntimeCapsule"("targetProjectId", "storagePath");
CREATE INDEX "RuntimeCapsule_targetProjectId_validationHash_idx" ON "RuntimeCapsule"("targetProjectId", "validationHash");
CREATE INDEX "RuntimeCapsule_integrityState_idx" ON "RuntimeCapsule"("integrityState");
CREATE INDEX "RuntimeCapsule_qualityPublicationId_idx" ON "RuntimeCapsule"("qualityPublicationId");

-- The Quality-first model deliberately retains no compatibility rows for the
-- retired planning, provider, delegation, publication, or baseline domains.
-- Keep foreign keys disabled while the independent legacy table graph is
-- removed; every surviving reference has been rebuilt above.
DROP TABLE IF EXISTS "BaselineAttemptEvent";
DROP TABLE IF EXISTS "BaselineAttempt";
DROP TABLE IF EXISTS "RepositoryExportReceipt";
DROP TABLE IF EXISTS "RepositoryExportJob";
DROP TABLE IF EXISTS "ProviderArtifactSnapshot";
DROP TABLE IF EXISTS "ProviderPermissionDecision";
DROP TABLE IF EXISTS "ProviderRunEvent";
DROP TABLE IF EXISTS "ProviderWorkflowRun";
DROP TABLE IF EXISTS "ProviderAdapterRegistration";
DROP TABLE IF EXISTS "PlanTaskProjection";
DROP TABLE IF EXISTS "PlanSyncIssue";
DROP TABLE IF EXISTS "PlanRevision";
DROP TABLE IF EXISTS "PlanEvent";
DROP TABLE IF EXISTS "ValidationDecisionReceipt";
DROP TABLE IF EXISTS "ValidationNodePublication";
DROP TABLE IF EXISTS "ValidationExtensionReview";
DROP TABLE IF EXISTS "ValidationAstPublishOperation";
DROP TABLE IF EXISTS "PlanCoordinatorLease";
DROP TABLE IF EXISTS "PlanPersonalLayout";
DROP TABLE IF EXISTS "PlanOperationMetric";
DROP TABLE IF EXISTS "ValidationResourceProposal";
DROP TABLE IF EXISTS "CoordinatorFailureReceipt";
DROP TABLE IF EXISTS "CoordinatorOperationReceipt";
DROP TABLE IF EXISTS "DelegatedCoordinatorConsumption";
DROP TABLE IF EXISTS "DelegatedCoordinatorReceipt";
DROP TABLE IF EXISTS "DelegatedAuthorizationNonce";
DROP TABLE IF EXISTS "DelegatedValidationAstSubmission";
DROP TABLE IF EXISTS "AppraiseProjectIdentity";
DROP TABLE IF EXISTS "PlanProjection";

PRAGMA foreign_keys=ON;
ALTER TABLE "StepDefinitionSearchReceipt" RENAME COLUMN "planId" TO "qualityPlanId";
ALTER TABLE "StepDefinitionTelemetryEvent" RENAME COLUMN "planId" TO "qualityPlanId";
DROP INDEX "EvidenceReceipt_targetProjectId_validationVersionId_evaluationSubjectRevisionId_resultMatrixCell_runtimeInputHash_key";
CREATE INDEX "EvidenceReceipt_targetProjectId_validationVersionId_evaluationSubjectRevisionId_resultMatrixCell_runtimeInputHash_idx" ON "EvidenceReceipt"("targetProjectId", "validationVersionId", "evaluationSubjectRevisionId", "resultMatrixCell", "runtimeInputHash");
