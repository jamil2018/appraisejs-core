-- Additive one-use authorization records for credential-bearing managed runs.
CREATE TABLE "AssessmentExecutionRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "qualityPlanId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "evaluationSubjectRevisionId" TEXT NOT NULL,
  "subjectDigest" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "publicationFingerprint" TEXT NOT NULL,
  "runtimeInputHash" TEXT NOT NULL,
  "bindingsHash" TEXT NOT NULL,
  "activeScopeKey" TEXT,
  "requestHash" TEXT NOT NULL,
  "canonicalRequestJson" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentExecutionRequest_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentExecutionRequest_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentExecutionRequest_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssessmentExecutionRequest_requestHash_key" ON "AssessmentExecutionRequest"("requestHash");
CREATE UNIQUE INDEX "AssessmentExecutionRequest_activeScopeKey_key" ON "AssessmentExecutionRequest"("activeScopeKey");
CREATE INDEX "AssessmentExecutionRequest_targetProjectId_assessmentId_expiresAt_idx" ON "AssessmentExecutionRequest"("targetProjectId", "assessmentId", "expiresAt");
CREATE INDEX "AssessmentExecutionRequest_qualityPlanId_qualityPlanRevisionId_idx" ON "AssessmentExecutionRequest"("qualityPlanId", "qualityPlanRevisionId");

CREATE TABLE "AssessmentExecutionCredentialBinding" (
  "requestId" TEXT NOT NULL,
  "slot" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  PRIMARY KEY ("requestId", "slot"),
  CONSTRAINT "AssessmentExecutionCredentialBinding_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AssessmentExecutionRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CredentialAuthorizationUiSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionTokenHash" TEXT NOT NULL,
  "csrfTokenHash" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CredentialAuthorizationUiSession_sessionTokenHash_key" ON "CredentialAuthorizationUiSession"("sessionTokenHash");
CREATE INDEX "CredentialAuthorizationUiSession_targetProjectId_expiresAt_revokedAt_idx" ON "CredentialAuthorizationUiSession"("targetProjectId", "expiresAt", "revokedAt");

CREATE TABLE "AssessmentExecutionAuthorizationGrant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "issuerKind" TEXT NOT NULL,
  "localUiSessionId" TEXT,
  "hostIssuer" TEXT,
  "hostKeyId" TEXT,
  "hostAssertionJti" TEXT,
  "hostAssertionHash" TEXT,
  "notBefore" DATETIME NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "consumedAt" DATETIME,
  "revokedAt" DATETIME,
  "revokedReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentExecutionAuthorizationGrant_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AssessmentExecutionRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentExecutionAuthorizationGrant_localUiSessionId_fkey" FOREIGN KEY ("localUiSessionId") REFERENCES "CredentialAuthorizationUiSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("notBefore" < "expiresAt"),
  CHECK (NOT ("consumedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)),
  CHECK (("issuerKind" = 'LOCAL_UI_SESSION' AND "localUiSessionId" IS NOT NULL AND "hostIssuer" IS NULL AND "hostKeyId" IS NULL AND "hostAssertionJti" IS NULL AND "hostAssertionHash" IS NULL) OR ("issuerKind" = 'HOST_ASSERTION' AND "localUiSessionId" IS NULL AND "hostIssuer" IS NOT NULL AND "hostKeyId" IS NOT NULL AND "hostAssertionJti" IS NOT NULL AND "hostAssertionHash" IS NOT NULL))
);
CREATE UNIQUE INDEX "AssessmentExecutionAuthorizationGrant_hostIssuer_hostAssertionJti_key" ON "AssessmentExecutionAuthorizationGrant"("hostIssuer", "hostAssertionJti");
CREATE UNIQUE INDEX "AssessmentExecutionAuthorizationGrant_requestId_key" ON "AssessmentExecutionAuthorizationGrant"("requestId");
CREATE INDEX "AssessmentExecutionAuthorizationGrant_requestId_expiresAt_consumedAt_revokedAt_idx" ON "AssessmentExecutionAuthorizationGrant"("requestId", "expiresAt", "consumedAt", "revokedAt");

-- SQLite cannot add foreign-key constraints with ALTER TABLE. Rebuild the
-- parent table in place, retaining every existing column, constraint, index,
-- and value before adding physical authorization foreign keys.
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssessmentRun" (
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
  "executionRequestId" TEXT,
  "executionRequestHash" TEXT,
  "executionAuthorizationGrantId" TEXT,
  CONSTRAINT "AssessmentRun_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRun_assessmentId_targetProjectId_qualityPlanRevisionId_fkey" FOREIGN KEY ("assessmentId", "targetProjectId", "qualityPlanRevisionId") REFERENCES "Assessment" ("id", "targetProjectId", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRun_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "targetProjectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRun_evaluationSubjectRevisionId_fkey" FOREIGN KEY ("evaluationSubjectRevisionId") REFERENCES "EvaluationSubjectRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRun_executionRequestId_fkey" FOREIGN KEY ("executionRequestId") REFERENCES "AssessmentExecutionRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRun_executionAuthorizationGrantId_fkey" FOREIGN KEY ("executionAuthorizationGrantId") REFERENCES "AssessmentExecutionAuthorizationGrant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentRun" ("id", "targetProjectId", "assessmentId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "idempotencyScope", "idempotencyKey", "requestHash", "status", "stopReason", "version", "createdAt", "updatedAt")
SELECT "id", "targetProjectId", "assessmentId", "qualityPlanRevisionId", "evaluationSubjectRevisionId", "idempotencyScope", "idempotencyKey", "requestHash", "status", "stopReason", "version", "createdAt", "updatedAt" FROM "AssessmentRun";
DROP TABLE "AssessmentRun";
ALTER TABLE "new_AssessmentRun" RENAME TO "AssessmentRun";
CREATE UNIQUE INDEX "AssessmentRun_id_targetProjectId_key" ON "AssessmentRun"("id", "targetProjectId");
CREATE UNIQUE INDEX "AssessmentRun_id_targetProjectId_qualityPlanRevisionId_key" ON "AssessmentRun"("id", "targetProjectId", "qualityPlanRevisionId");
CREATE UNIQUE INDEX "AssessmentRun_idempotencyScope_idempotencyKey_key" ON "AssessmentRun"("idempotencyScope", "idempotencyKey");
CREATE INDEX "AssessmentRun_assessmentId_status_idx" ON "AssessmentRun"("assessmentId", "status");
CREATE INDEX "AssessmentRun_targetProjectId_status_idx" ON "AssessmentRun"("targetProjectId", "status");
CREATE UNIQUE INDEX "AssessmentRun_executionRequestId_key" ON "AssessmentRun"("executionRequestId");
CREATE UNIQUE INDEX "AssessmentRun_executionAuthorizationGrantId_key" ON "AssessmentRun"("executionAuthorizationGrantId");
CREATE TRIGGER "AssessmentRun_credential_authorization_shape_insert" BEFORE INSERT ON "AssessmentRun"
WHEN (NEW."executionRequestId" IS NULL AND (NEW."executionRequestHash" IS NOT NULL OR NEW."executionAuthorizationGrantId" IS NOT NULL)) OR (NEW."executionRequestId" IS NOT NULL AND (NEW."executionRequestHash" IS NULL OR NEW."executionAuthorizationGrantId" IS NULL))
BEGIN SELECT RAISE(ABORT, 'AssessmentRun credential authorization fields must be all null or all non-null'); END;
PRAGMA foreign_keys=ON;
PRAGMA foreign_key_check;
CREATE TRIGGER "AssessmentRun_credential_authorization_shape_update" BEFORE UPDATE OF "executionRequestId", "executionRequestHash", "executionAuthorizationGrantId" ON "AssessmentRun"
WHEN (NEW."executionRequestId" IS NULL AND (NEW."executionRequestHash" IS NOT NULL OR NEW."executionAuthorizationGrantId" IS NOT NULL)) OR (NEW."executionRequestId" IS NOT NULL AND (NEW."executionRequestHash" IS NULL OR NEW."executionAuthorizationGrantId" IS NULL))
BEGIN SELECT RAISE(ABORT, 'AssessmentRun credential authorization fields must be all null or all non-null'); END;
