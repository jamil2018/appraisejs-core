CREATE TABLE "QualityPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityPlan_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "QualityPlanRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "qualityPlanId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "approvedAt" DATETIME,
  "contentHash" TEXT NOT NULL,
  "sourceSpecification" TEXT NOT NULL,
  "requirementGraphJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityPlanRevision_qualityPlanId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanId", "targetProjectId") REFERENCES "QualityPlan" ("id", "targetProjectId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RequirementSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "externalRef" TEXT,
  "text" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequirementSnapshot_qualityPlanRevisionId_fkey" FOREIGN KEY ("qualityPlanRevisionId") REFERENCES "QualityPlanRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RequirementQuery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "answer" TEXT,
  "rationale" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequirementQuery_qualityPlanRevisionId_fkey" FOREIGN KEY ("qualityPlanRevisionId") REFERENCES "QualityPlanRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "QualityObligationRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "requirementSnapshotId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "assertionScopeJson" TEXT NOT NULL,
  "minimumAssurance" TEXT NOT NULL,
  "limitations" TEXT,
  "contentHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityObligationRevision_qualityPlanRevisionId_fkey" FOREIGN KEY ("qualityPlanRevisionId") REFERENCES "QualityPlanRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QualityObligationRevision_requirementSnapshotId_qualityPlanRevisionId_fkey" FOREIGN KEY ("requirementSnapshotId", "qualityPlanRevisionId") REFERENCES "RequirementSnapshot" ("id", "qualityPlanRevisionId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ValidationVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
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
  CONSTRAINT "ValidationVersion_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "targetProjectId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ObligationValidationVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "qualityObligationRevisionId" TEXT NOT NULL,
  "validationVersionId" TEXT NOT NULL,
  "coverageIntentJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ObligationValidationVersion_qualityObligationRevisionId_qualityPlanRevisionId_fkey" FOREIGN KEY ("qualityObligationRevisionId", "qualityPlanRevisionId") REFERENCES "QualityObligationRevision" ("id", "qualityPlanRevisionId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ObligationValidationVersion_validationVersionId_qualityPlanRevisionId_fkey" FOREIGN KEY ("validationVersionId", "qualityPlanRevisionId") REFERENCES "ValidationVersion" ("id", "qualityPlanRevisionId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "EvaluationSubjectRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "subjectDigest" TEXT NOT NULL,
  "subjectKind" TEXT NOT NULL,
  "authority" TEXT NOT NULL,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Assessment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "qualityPlanId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "evaluationSubjectRevisionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "alignment" TEXT NOT NULL DEFAULT 'CURRENT',
  "observedAssurance" TEXT,
  "baselineAssessmentId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Assessment_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Assessment_qualityPlanId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanId", "targetProjectId") REFERENCES "QualityPlan" ("id", "targetProjectId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Assessment_qualityPlanRevisionId_qualityPlanId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "qualityPlanId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "qualityPlanId", "targetProjectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Assessment_evaluationSubjectRevisionId_fkey" FOREIGN KEY ("evaluationSubjectRevisionId") REFERENCES "EvaluationSubjectRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Assessment_baselineAssessmentId_targetProjectId_qualityPlanId_qualityPlanRevisionId_fkey" FOREIGN KEY ("baselineAssessmentId", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId") REFERENCES "Assessment" ("id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "EvidenceReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "assessmentId" TEXT,
  "validationVersionId" TEXT NOT NULL,
  "evaluationSubjectRevisionId" TEXT NOT NULL,
  "resultMatrixCell" TEXT NOT NULL,
  "assuranceLevel" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "runtimeInputHash" TEXT NOT NULL,
  "environmentSnapshotHash" TEXT NOT NULL,
  "browserSnapshotHash" TEXT,
  "dataProvenanceHash" TEXT NOT NULL,
  "outputHash" TEXT NOT NULL,
  "reportHash" TEXT,
  "logHash" TEXT,
  "traceHash" TEXT,
  "receiptHash" TEXT NOT NULL,
  "sealedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceReceipt_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EvidenceReceipt_assessmentId_targetProjectId_qualityPlanRevisionId_fkey" FOREIGN KEY ("assessmentId", "targetProjectId", "qualityPlanRevisionId") REFERENCES "Assessment" ("id", "targetProjectId", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EvidenceReceipt_validationVersionId_qualityPlanRevisionId_fkey" FOREIGN KEY ("validationVersionId", "qualityPlanRevisionId") REFERENCES "ValidationVersion" ("id", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EvidenceReceipt_evaluationSubjectRevisionId_fkey" FOREIGN KEY ("evaluationSubjectRevisionId") REFERENCES "EvaluationSubjectRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AssessmentDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "decidedBy" TEXT NOT NULL,
  "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decisionHash" TEXT NOT NULL,
  CONSTRAINT "AssessmentDecision_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RequirementDriftReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "qualityPlanId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "successorRevisionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "impactTraversalJson" TEXT NOT NULL,
  "proposedDispositionJson" TEXT NOT NULL,
  "approvedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequirementDriftReport_qualityPlanRevisionId_qualityPlanId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "qualityPlanId") REFERENCES "QualityPlanRevision" ("id", "qualityPlanId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RequirementDriftReport_successorRevisionId_qualityPlanId_fkey" FOREIGN KEY ("successorRevisionId", "qualityPlanId") REFERENCES "QualityPlanRevision" ("id", "qualityPlanId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "QualityPlan_targetProjectId_idx" ON "QualityPlan"("targetProjectId");
CREATE UNIQUE INDEX "QualityPlan_id_targetProjectId_key" ON "QualityPlan"("id", "targetProjectId");
CREATE UNIQUE INDEX "QualityPlanRevision_id_targetProjectId_key" ON "QualityPlanRevision"("id", "targetProjectId");
CREATE UNIQUE INDEX "QualityPlanRevision_id_qualityPlanId_key" ON "QualityPlanRevision"("id", "qualityPlanId");
CREATE UNIQUE INDEX "QualityPlanRevision_id_qualityPlanId_targetProjectId_key" ON "QualityPlanRevision"("id", "qualityPlanId", "targetProjectId");
CREATE UNIQUE INDEX "QualityPlanRevision_qualityPlanId_revision_key" ON "QualityPlanRevision"("qualityPlanId", "revision");
CREATE UNIQUE INDEX "QualityPlanRevision_qualityPlanId_contentHash_key" ON "QualityPlanRevision"("qualityPlanId", "contentHash");
CREATE INDEX "QualityPlanRevision_targetProjectId_idx" ON "QualityPlanRevision"("targetProjectId");
CREATE INDEX "QualityPlanRevision_status_idx" ON "QualityPlanRevision"("status");
CREATE UNIQUE INDEX "RequirementSnapshot_id_qualityPlanRevisionId_key" ON "RequirementSnapshot"("id", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "RequirementSnapshot_qualityPlanRevisionId_contentHash_key" ON "RequirementSnapshot"("qualityPlanRevisionId", "contentHash");
CREATE INDEX "RequirementQuery_qualityPlanRevisionId_status_idx" ON "RequirementQuery"("qualityPlanRevisionId", "status");
CREATE UNIQUE INDEX "QualityObligationRevision_id_qualityPlanRevisionId_key" ON "QualityObligationRevision"("id", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "QualityObligationRevision_qualityPlanRevisionId_contentHash_key" ON "QualityObligationRevision"("qualityPlanRevisionId", "contentHash");
CREATE INDEX "QualityObligationRevision_requirementSnapshotId_idx" ON "QualityObligationRevision"("requirementSnapshotId");
CREATE UNIQUE INDEX "ValidationVersion_id_targetProjectId_key" ON "ValidationVersion"("id", "targetProjectId");
CREATE UNIQUE INDEX "ValidationVersion_id_qualityPlanRevisionId_key" ON "ValidationVersion"("id", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "ValidationVersion_validationIdentity_version_key" ON "ValidationVersion"("validationIdentity", "version");
CREATE UNIQUE INDEX "ValidationVersion_qualityPlanRevisionId_canonicalHash_key" ON "ValidationVersion"("qualityPlanRevisionId", "canonicalHash");
CREATE INDEX "ValidationVersion_targetProjectId_idx" ON "ValidationVersion"("targetProjectId");
CREATE INDEX "ValidationVersion_qualityPlanRevisionId_status_idx" ON "ValidationVersion"("qualityPlanRevisionId", "status");
CREATE UNIQUE INDEX "ObligationValidationVersion_qualityObligationRevisionId_validationVersionId_key" ON "ObligationValidationVersion"("qualityObligationRevisionId", "validationVersionId");
CREATE INDEX "ObligationValidationVersion_qualityPlanRevisionId_idx" ON "ObligationValidationVersion"("qualityPlanRevisionId");
CREATE UNIQUE INDEX "EvaluationSubjectRevision_subjectDigest_key" ON "EvaluationSubjectRevision"("subjectDigest");
CREATE UNIQUE INDEX "Assessment_id_targetProjectId_key" ON "Assessment"("id", "targetProjectId");
CREATE UNIQUE INDEX "Assessment_id_targetProjectId_qualityPlanRevisionId_key" ON "Assessment"("id", "targetProjectId", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "Assessment_id_targetProjectId_qualityPlanId_qualityPlanRevisionId_key" ON "Assessment"("id", "targetProjectId", "qualityPlanId", "qualityPlanRevisionId");
CREATE INDEX "Assessment_targetProjectId_status_idx" ON "Assessment"("targetProjectId", "status");
CREATE INDEX "Assessment_qualityPlanId_status_idx" ON "Assessment"("qualityPlanId", "status");
CREATE INDEX "Assessment_qualityPlanRevisionId_alignment_idx" ON "Assessment"("qualityPlanRevisionId", "alignment");
CREATE UNIQUE INDEX "EvidenceReceipt_receiptHash_key" ON "EvidenceReceipt"("receiptHash");
CREATE UNIQUE INDEX "EvidenceReceipt_targetProjectId_validationVersionId_evaluationSubjectRevisionId_resultMatrixCell_runtimeInputHash_key" ON "EvidenceReceipt"("targetProjectId", "validationVersionId", "evaluationSubjectRevisionId", "resultMatrixCell", "runtimeInputHash");
CREATE INDEX "EvidenceReceipt_targetProjectId_sealedAt_idx" ON "EvidenceReceipt"("targetProjectId", "sealedAt");
CREATE INDEX "EvidenceReceipt_assessmentId_idx" ON "EvidenceReceipt"("assessmentId");
CREATE UNIQUE INDEX "AssessmentDecision_decisionHash_key" ON "AssessmentDecision"("decisionHash");
CREATE UNIQUE INDEX "AssessmentDecision_assessmentId_key" ON "AssessmentDecision"("assessmentId");
