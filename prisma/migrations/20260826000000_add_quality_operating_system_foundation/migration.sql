-- Pre-release clean cutover for the Quality Operating System. This migration
-- intentionally follows the remote-scope and v3 executable-generation
-- migrations: supported upgrades retain product records while removing the
-- provisional Quality lifecycle that cannot prove analysis/design/consent
-- provenance.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- The pre-QOS append-only rows are deliberately retired by the clean cut.
-- Drop only their delete guards, then recreate them below so fresh rows still
-- have the same database-enforced immutability guarantees.
DROP TRIGGER "QualityValidationGeneration_no_delete";
DROP TRIGGER "QualityValidationPublication_no_delete";
DROP TRIGGER "QualityValidationExtensionReview_no_delete";
DROP TRIGGER "AssessmentRunPublicationCheckpoint_no_delete";
DROP TRIGGER "RemoteEvaluationScopeBinding_no_delete";
DROP TRIGGER "RemoteEvaluationScopeIssuance_no_delete";
DROP TRIGGER "RemoteEvaluationScopePartitionManifest_no_delete";
DROP TRIGGER "RemoteEvaluationScopePartition_no_delete";

-- Preserve target registration, environments, independent TestRuns and their
-- reports. A capsule can survive as product history, but it may no longer
-- claim a removed provisional Quality publication.
UPDATE "RuntimeCapsule" SET "qualityPublicationId" = NULL
WHERE "qualityPublicationId" IS NOT NULL;

DELETE FROM "AssessmentRunBinding";
DELETE FROM "AssessmentRunPublicationCheckpoint";
DELETE FROM "AssessmentExecutionCredentialBinding";
DELETE FROM "AssessmentExecutionAuthorizationGrant";
DELETE FROM "AssessmentExecutionRequest";
DELETE FROM "CredentialAuthorizationUiSession";
DELETE FROM "AssessmentDecision";
DELETE FROM "EvidenceReceipt";
DELETE FROM "AssessmentRun";
DELETE FROM "QualityValidationExtensionReview";
DELETE FROM "QualityValidationPublicationCommandReceipt";
DELETE FROM "QualityValidationPublication";
DELETE FROM "QualityValidationGeneration";
DELETE FROM "ObligationValidationVersion";
DELETE FROM "ValidationVersion";
DELETE FROM "QualityObligationRevision";
DELETE FROM "RequirementQuery";
DELETE FROM "RequirementSnapshot";
DELETE FROM "RequirementDriftReport";
DELETE FROM "RemoteEvaluationScopePartition";
DELETE FROM "RemoteEvaluationScopePartitionManifest";
DELETE FROM "RemoteEvaluationScopeIssuance";
DELETE FROM "RemoteEvaluationScopeBinding";
DELETE FROM "Assessment";
DELETE FROM "EvaluationSubjectRevision";
DELETE FROM "AssessmentPreparation";
DELETE FROM "AgentPreflightReceipt";
DELETE FROM "LifecycleCertificationReceipt";
DELETE FROM "QualityPlanRevision";
DELETE FROM "QualityPlan";

ALTER TABLE "TargetProject" ADD COLUMN "executionConsentMode" TEXT NOT NULL DEFAULT 'ALWAYS_ASK';

ALTER TABLE "QualityPlanRevision" ADD COLUMN "methodologyId" TEXT NOT NULL DEFAULT 'quality-os-core';
ALTER TABLE "QualityPlanRevision" ADD COLUMN "methodologyVersion" TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE "QualityPlanRevision" ADD COLUMN "methodologyHash" TEXT NOT NULL DEFAULT 'sha256:f3919b0318cc469ebf1850096a640dc2f0b4729768f23f1f058dae368f69383c';
ALTER TABLE "QualityPlanRevision" ADD COLUMN "predecessorRevisionId" TEXT;
ALTER TABLE "QualityPlanRevision" ADD COLUMN "queryAnswerIdempotencyKey" TEXT;
ALTER TABLE "QualityPlanRevision" ADD COLUMN "queryAnswerRequestHash" TEXT;
CREATE UNIQUE INDEX "QualityPlanRevision_qualityPlanId_queryAnswerIdempotencyKey_key"
  ON "QualityPlanRevision"("qualityPlanId", "queryAnswerIdempotencyKey");

CREATE TABLE "RequirementAnalysisRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "decision" TEXT NOT NULL DEFAULT 'PENDING',
  "analysisJson" TEXT NOT NULL,
  "provenanceJson" TEXT NOT NULL,
  "critiqueJson" TEXT,
  "analysisHash" TEXT NOT NULL,
  "decisionRationale" TEXT,
  "decidedBy" TEXT,
  "decidedAt" DATETIME,
  "approvedAt" DATETIME,
  "approvedBy" TEXT,
  "approvalHash" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequirementAnalysisRevision_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "targetProjectId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RequirementAnalysisRevision_id_qualityPlanRevisionId_key" ON "RequirementAnalysisRevision"("id", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "RequirementAnalysisRevision_qualityPlanRevisionId_revision_key" ON "RequirementAnalysisRevision"("qualityPlanRevisionId", "revision");
CREATE UNIQUE INDEX "RequirementAnalysisRevision_qualityPlanRevisionId_analysisHash_key" ON "RequirementAnalysisRevision"("qualityPlanRevisionId", "analysisHash");
CREATE INDEX "RequirementAnalysisRevision_targetProjectId_status_idx" ON "RequirementAnalysisRevision"("targetProjectId", "status");
CREATE INDEX "RequirementAnalysisRevision_qualityPlanRevisionId_decision_idx" ON "RequirementAnalysisRevision"("qualityPlanRevisionId", "decision");

CREATE TABLE "ValidationDesignRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "requirementAnalysisRevisionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "decision" TEXT NOT NULL DEFAULT 'PENDING',
  "strategyJson" TEXT NOT NULL,
  "scenarioPortfolioJson" TEXT NOT NULL,
  "critiqueJson" TEXT,
  "provenanceJson" TEXT NOT NULL,
  "designHash" TEXT NOT NULL,
  "decisionRationale" TEXT,
  "decidedBy" TEXT,
  "decidedAt" DATETIME,
  "approvedAt" DATETIME,
  "approvedBy" TEXT,
  "approvalHash" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ValidationDesignRevision_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "targetProjectId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ValidationDesignRevision_requirementAnalysisRevisionId_qualityPlanRevisionId_fkey" FOREIGN KEY ("requirementAnalysisRevisionId", "qualityPlanRevisionId") REFERENCES "RequirementAnalysisRevision" ("id", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ValidationDesignRevision_id_qualityPlanRevisionId_key" ON "ValidationDesignRevision"("id", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "ValidationDesignRevision_qualityPlanRevisionId_revision_key" ON "ValidationDesignRevision"("qualityPlanRevisionId", "revision");
CREATE UNIQUE INDEX "ValidationDesignRevision_qualityPlanRevisionId_designHash_key" ON "ValidationDesignRevision"("qualityPlanRevisionId", "designHash");
CREATE INDEX "ValidationDesignRevision_targetProjectId_status_idx" ON "ValidationDesignRevision"("targetProjectId", "status");
CREATE INDEX "ValidationDesignRevision_requirementAnalysisRevisionId_decision_idx" ON "ValidationDesignRevision"("requirementAnalysisRevisionId", "decision");

-- Both rebuilt tables are empty after the clean cut. Rebuilding rather than
-- adding an untrusted nullable column makes the new lineage relations real
-- SQLite foreign keys while retaining the complete v3 generation shape.
DROP TABLE "QualityObligationRevision";
CREATE TABLE "QualityObligationRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "requirementAnalysisRevisionId" TEXT NOT NULL,
  "requirementSnapshotId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "assertionScopeJson" TEXT NOT NULL,
  "minimumAssurance" TEXT NOT NULL,
  "limitations" TEXT,
  "contentHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityObligationRevision_qualityPlanRevisionId_fkey" FOREIGN KEY ("qualityPlanRevisionId") REFERENCES "QualityPlanRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QualityObligationRevision_requirementAnalysisRevisionId_qualityPlanRevisionId_fkey" FOREIGN KEY ("requirementAnalysisRevisionId", "qualityPlanRevisionId") REFERENCES "RequirementAnalysisRevision" ("id", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityObligationRevision_requirementSnapshotId_qualityPlanRevisionId_fkey" FOREIGN KEY ("requirementSnapshotId", "qualityPlanRevisionId") REFERENCES "RequirementSnapshot" ("id", "qualityPlanRevisionId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityObligationRevision_id_qualityPlanRevisionId_key" ON "QualityObligationRevision"("id", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "QualityObligationRevision_qualityPlanRevisionId_contentHash_key" ON "QualityObligationRevision"("qualityPlanRevisionId", "contentHash");
CREATE INDEX "QualityObligationRevision_requirementSnapshotId_idx" ON "QualityObligationRevision"("requirementSnapshotId");

CREATE TABLE "new_ValidationVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "validationDesignRevisionId" TEXT NOT NULL,
  "validationIdentity" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DESIGNED',
  "reuseOutcome" TEXT,
  "canonicalAstJson" TEXT NOT NULL,
  "canonicalHash" TEXT NOT NULL,
  "realizationJson" TEXT,
  "realizationHash" TEXT,
  "compilationHash" TEXT,
  "scenarioApprovedAt" DATETIME,
  "scenarioApprovedBy" TEXT,
  "scenarioApprovalHash" TEXT,
  "publishedAt" DATETIME,
  "activeGenerationId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ValidationVersion_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "targetProjectId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ValidationVersion_validationDesignRevisionId_qualityPlanRevisionId_fkey" FOREIGN KEY ("validationDesignRevisionId", "qualityPlanRevisionId") REFERENCES "ValidationDesignRevision" ("id", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ValidationVersion_activeGenerationId_id_fkey" FOREIGN KEY ("activeGenerationId", "id") REFERENCES "QualityValidationGeneration" ("id", "validationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE
);
DROP TABLE "ValidationVersion";
ALTER TABLE "new_ValidationVersion" RENAME TO "ValidationVersion";
CREATE UNIQUE INDEX "ValidationVersion_id_targetProjectId_key" ON "ValidationVersion"("id", "targetProjectId");
CREATE UNIQUE INDEX "ValidationVersion_id_qualityPlanRevisionId_key" ON "ValidationVersion"("id", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "ValidationVersion_id_qualityPlanRevisionId_targetProjectId_key" ON "ValidationVersion"("id", "qualityPlanRevisionId", "targetProjectId");
CREATE UNIQUE INDEX "ValidationVersion_activeGenerationId_id_key" ON "ValidationVersion"("activeGenerationId", "id");
CREATE UNIQUE INDEX "ValidationVersion_validationIdentity_version_key" ON "ValidationVersion"("validationIdentity", "version");
CREATE UNIQUE INDEX "ValidationVersion_qualityPlanRevisionId_canonicalHash_key" ON "ValidationVersion"("qualityPlanRevisionId", "canonicalHash");
CREATE INDEX "ValidationVersion_targetProjectId_idx" ON "ValidationVersion"("targetProjectId");
CREATE INDEX "ValidationVersion_qualityPlanRevisionId_status_idx" ON "ValidationVersion"("qualityPlanRevisionId", "status");

ALTER TABLE "Assessment" ADD COLUMN "executionManifestHash" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "executionConsentSnapshotJson" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "executionConsentSnapshotHash" TEXT;

CREATE TABLE "ExecutionConsent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "executionManifestHash" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "scopeJson" TEXT NOT NULL,
  "consentHash" TEXT NOT NULL,
  "grantedBy" TEXT,
  "grantedAt" DATETIME,
  "expiresAt" DATETIME,
  "consumedAt" DATETIME,
  "revokedAt" DATETIME,
  "revokedReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ExecutionConsent_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExecutionConsent_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExecutionConsent_assessmentId_key" ON "ExecutionConsent"("assessmentId");
CREATE UNIQUE INDEX "ExecutionConsent_consentHash_key" ON "ExecutionConsent"("consentHash");
CREATE INDEX "ExecutionConsent_targetProjectId_status_expiresAt_idx" ON "ExecutionConsent"("targetProjectId", "status", "expiresAt");
CREATE INDEX "ExecutionConsent_assessmentId_executionManifestHash_idx" ON "ExecutionConsent"("assessmentId", "executionManifestHash");

CREATE TABLE "AssessmentFinding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "qualityObligationRevisionId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "attribution" TEXT NOT NULL,
  "attributionJson" TEXT NOT NULL,
  "limitationsJson" TEXT,
  "evidenceSetHash" TEXT NOT NULL,
  "findingHash" TEXT NOT NULL,
  "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedBy" TEXT,
  "reviewedAt" DATETIME,
  "reviewRationale" TEXT,
  "reviewHash" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentFinding_assessmentId_targetProjectId_qualityPlanRevisionId_fkey" FOREIGN KEY ("assessmentId", "targetProjectId", "qualityPlanRevisionId") REFERENCES "Assessment" ("id", "targetProjectId", "qualityPlanRevisionId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssessmentFinding_qualityObligationRevisionId_qualityPlanRevisionId_fkey" FOREIGN KEY ("qualityObligationRevisionId", "qualityPlanRevisionId") REFERENCES "QualityObligationRevision" ("id", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssessmentFinding_findingHash_key" ON "AssessmentFinding"("findingHash");
CREATE UNIQUE INDEX "AssessmentFinding_reviewHash_key" ON "AssessmentFinding"("reviewHash");
CREATE UNIQUE INDEX "AssessmentFinding_assessmentId_qualityObligationRevisionId_key" ON "AssessmentFinding"("assessmentId", "qualityObligationRevisionId");
CREATE INDEX "AssessmentFinding_targetProjectId_outcome_idx" ON "AssessmentFinding"("targetProjectId", "outcome");
CREATE INDEX "AssessmentFinding_qualityPlanRevisionId_attribution_idx" ON "AssessmentFinding"("qualityPlanRevisionId", "attribution");

CREATE TABLE "AssessmentFindingEvidenceReceipt" (
  "assessmentFindingId" TEXT NOT NULL,
  "evidenceReceiptId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("assessmentFindingId", "evidenceReceiptId"),
  CONSTRAINT "AssessmentFindingEvidenceReceipt_assessmentFindingId_fkey" FOREIGN KEY ("assessmentFindingId") REFERENCES "AssessmentFinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssessmentFindingEvidenceReceipt_evidenceReceiptId_fkey" FOREIGN KEY ("evidenceReceiptId") REFERENCES "EvidenceReceipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AssessmentFindingEvidenceReceipt_evidenceReceiptId_idx" ON "AssessmentFindingEvidenceReceipt"("evidenceReceiptId");

-- Recreate the delete guards removed solely to perform this authorized clean
-- cut. The existing update and tuple triggers remain attached throughout.
CREATE TRIGGER "QualityValidationGeneration_no_delete" BEFORE DELETE ON "QualityValidationGeneration"
BEGIN SELECT RAISE(ABORT, 'quality validation generations are immutable'); END;
CREATE TRIGGER "QualityValidationPublication_no_delete" BEFORE DELETE ON "QualityValidationPublication"
BEGIN SELECT RAISE(ABORT, 'quality validation publications are immutable'); END;
CREATE TRIGGER "QualityValidationExtensionReview_no_delete" BEFORE DELETE ON "QualityValidationExtensionReview"
BEGIN SELECT RAISE(ABORT, 'quality validation extension reviews are immutable'); END;
CREATE TRIGGER "AssessmentRunPublicationCheckpoint_no_delete" BEFORE DELETE ON "AssessmentRunPublicationCheckpoint"
BEGIN SELECT RAISE(ABORT, 'assessment publication checkpoints are immutable'); END;
CREATE TRIGGER "RemoteEvaluationScopeBinding_no_delete" BEFORE DELETE ON "RemoteEvaluationScopeBinding"
BEGIN SELECT RAISE(ABORT, 'RemoteEvaluationScopeBinding is insert-only'); END;
CREATE TRIGGER "RemoteEvaluationScopeIssuance_no_delete" BEFORE DELETE ON "RemoteEvaluationScopeIssuance"
BEGIN SELECT RAISE(ABORT, 'RemoteEvaluationScopeIssuance is insert-only'); END;
CREATE TRIGGER "RemoteEvaluationScopePartitionManifest_no_delete" BEFORE DELETE ON "RemoteEvaluationScopePartitionManifest"
BEGIN SELECT RAISE(ABORT, 'RemoteEvaluationScopePartitionManifest is insert-only'); END;
CREATE TRIGGER "RemoteEvaluationScopePartition_no_delete" BEFORE DELETE ON "RemoteEvaluationScopePartition"
BEGIN SELECT RAISE(ABORT, 'RemoteEvaluationScopePartition is insert-only'); END;

CREATE TEMP TABLE "_quality_os_fk_guard" ("ok" INTEGER NOT NULL CHECK ("ok" = 0));
INSERT INTO "_quality_os_fk_guard" ("ok")
SELECT 1 WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check);
DROP TABLE "_quality_os_fk_guard";
PRAGMA foreign_keys=ON;
PRAGMA foreign_key_check;
