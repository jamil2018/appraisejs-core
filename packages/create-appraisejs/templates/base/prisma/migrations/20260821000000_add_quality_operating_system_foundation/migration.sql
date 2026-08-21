-- Pre-release clean cutover for the Quality Operating System. Preserve target
-- registration and authored assets, but remove all provisional quality,
-- lifecycle and evidence records whose immutable identities predate
-- the analysis/design/consent/attribution model.
PRAGMA foreign_keys=OFF;

DELETE FROM "AssessmentRunBinding";
DELETE FROM "AssessmentExecutionCredentialBinding";
DELETE FROM "AssessmentExecutionAuthorizationGrant";
DELETE FROM "AssessmentExecutionRequest";
DELETE FROM "CredentialAuthorizationUiSession";
DELETE FROM "AssessmentDecision";
DELETE FROM "EvidenceReceipt";
DELETE FROM "AssessmentRun";
DELETE FROM "Assessment";
DELETE FROM "EvaluationSubjectRevision";
-- Independent TestRuns, runtime capsules, and report history are product
-- records, not provisional Quality lifecycle state. AssessmentRunBinding has
-- already been removed above, so they survive the cutover without retaining a
-- stale Quality ownership claim.
DELETE FROM "QualityValidationExtensionReview";
DELETE FROM "QualityValidationPublication";
DELETE FROM "ObligationValidationVersion";
DELETE FROM "ValidationVersion";
DELETE FROM "QualityObligationRevision";
DELETE FROM "RequirementQuery";
DELETE FROM "RequirementSnapshot";
DELETE FROM "RequirementDriftReport";
DELETE FROM "QualityPlanRevision";
DELETE FROM "QualityPlan";
DELETE FROM "AssessmentPreparation";
DELETE FROM "AgentPreflightReceipt";
DELETE FROM "LifecycleCertificationReceipt";

-- Target registrations are authored identity records, not quality lifecycle
-- state. New projects default to explicit execution authorization.
ALTER TABLE "TargetProject" ADD COLUMN "executionConsentMode" TEXT NOT NULL DEFAULT 'ALWAYS_ASK';

ALTER TABLE "QualityPlanRevision" ADD COLUMN "methodologyId" TEXT NOT NULL DEFAULT 'quality-os-core';
ALTER TABLE "QualityPlanRevision" ADD COLUMN "methodologyVersion" TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE "QualityPlanRevision" ADD COLUMN "methodologyHash" TEXT NOT NULL DEFAULT 'sha256:f3919b0318cc469ebf1850096a640dc2f0b4729768f23f1f058dae368f69383c';
ALTER TABLE "QualityPlanRevision" ADD COLUMN "predecessorRevisionId" TEXT;
ALTER TABLE "QualityPlanRevision" ADD COLUMN "queryAnswerIdempotencyKey" TEXT;
ALTER TABLE "QualityPlanRevision" ADD COLUMN "queryAnswerRequestHash" TEXT;
CREATE UNIQUE INDEX "QualityPlanRevision_qualityPlanId_queryAnswerIdempotencyKey_key" ON "QualityPlanRevision"("qualityPlanId", "queryAnswerIdempotencyKey");

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

-- Rebuild dependent quality artifacts after the clean cutover to add exact
-- approved-analysis and approved-design foreign keys.
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

DROP TABLE "ValidationVersion";
CREATE TABLE "ValidationVersion" (
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
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ValidationVersion_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "targetProjectId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ValidationVersion_validationDesignRevisionId_qualityPlanRevisionId_fkey" FOREIGN KEY ("validationDesignRevisionId", "qualityPlanRevisionId") REFERENCES "ValidationDesignRevision" ("id", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ValidationVersion_id_targetProjectId_key" ON "ValidationVersion"("id", "targetProjectId");
CREATE UNIQUE INDEX "ValidationVersion_id_qualityPlanRevisionId_key" ON "ValidationVersion"("id", "qualityPlanRevisionId");
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

PRAGMA foreign_keys=ON;
PRAGMA foreign_key_check;
