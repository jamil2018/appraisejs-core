-- v3 replaces singleton ValidationVersion publication authority with immutable
-- generations. It is intentionally fail-closed: a non-retired, partial,
-- mismatched, active, or unsealed legacy state must be repaired explicitly.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TEMP TABLE "_qvg_guard" ("ok" INTEGER NOT NULL CHECK ("ok" = 0));
INSERT INTO "_qvg_guard" ("ok")
SELECT 1
WHERE EXISTS (
  SELECT 1
  FROM "QualityValidationPublication" p
  LEFT JOIN "ValidationVersion" v
    ON v."id" = p."validationVersionId"
   AND v."qualityPlanRevisionId" = p."qualityPlanRevisionId"
  WHERE v."id" IS NULL
     OR p."preflightDisposition" <> 'RETIRED_UNSUPPORTED'
     OR p."id" = '' OR p."targetProjectId" = '' OR p."qualityPlanRevisionId" = ''
     OR p."validationVersionId" = '' OR p."operationHash" = ''
     OR p."expectedRevisionHash" = '' OR p."validationHash" = '' OR p."validationContent" = ''
     OR p."reviewHash" = '' OR p."reviewContent" = '' OR p."astId" = '' OR p."astHash" = ''
     OR p."contextHash" = '' OR p."previewHash" = '' OR p."receiptHash" = ''
     OR p."projectionHash" = '' OR p."projectionJson" = '' OR p."validationProjectionJson" = ''
     OR p."runtimeInputHash" = '' OR p."runtimeInputJson" = ''
  UNION ALL
  SELECT 1
  FROM "ValidationVersion" v
  WHERE v."status" = 'PUBLISHED'
    AND NOT EXISTS (
      SELECT 1 FROM "QualityValidationPublication" p
      WHERE p."validationVersionId" = v."id" AND p."qualityPlanRevisionId" = v."qualityPlanRevisionId"
    )
  UNION ALL
  SELECT 1
  FROM "QualityValidationPublication" p
  JOIN "RuntimeCapsule" c ON c."qualityPublicationId" = p."id"
  JOIN "TestRun" tr ON tr."id" = c."testRunId"
  LEFT JOIN "AssessmentRunBinding" b ON b."testRunId" = tr."id"
  WHERE tr."status" NOT IN ('COMPLETED', 'CANCELLED')
     OR (b."id" IS NOT NULL AND b."evidenceReceiptId" IS NULL)
);
DROP TABLE "_qvg_guard";

-- Capture all legacy bytes before rebuilding the singleton table. The EXCEPT
-- checks below make preservation a migration invariant rather than a comment.
CREATE TEMP TABLE "_qvg_legacy_publication_snapshot" AS
SELECT
  "id", "targetProjectId", "targetFingerprint", "qualityPlanRevisionId", "validationVersionId", "idempotencyKey",
  "operationHash", "phase", "preflightAlgorithmVersion", "preflightAuthority", "scopeIntentHash",
  "realizationIntentHash", "preflightHash", "preflightDisposition", "expectedRevisionHash", "validationHash",
  "validationContent", "reviewHash", "reviewContent", "astId", "astHash", "contextHash", "previewHash",
  "receiptHash", "projectionHash", "projectionJson", "validationProjectionJson", "runtimeInputHash",
  "runtimeInputJson", "failure", "createdAt", "updatedAt"
FROM "QualityValidationPublication";

CREATE TEMP TABLE "_qvg_legacy_validation_snapshot" AS
SELECT
  "id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "reuseOutcome",
  "canonicalAstJson", "canonicalHash", "realizationJson", "realizationHash", "compilationHash", "scenarioApprovedAt",
  "scenarioApprovedBy", "scenarioApprovalHash", "publishedAt", "createdAt"
FROM "ValidationVersion";

-- Create the child before rebuilding ValidationVersion so SQLite can resolve
-- the physical composite active-selector foreign key in the rebuilt parent.
-- Foreign keys are disabled for this guarded table rebuild; after the rename
-- this reference resolves to the replacement ValidationVersion table.
CREATE TABLE "QualityValidationGeneration" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "generationKey" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "validationVersionId" TEXT NOT NULL,
  "artifactSchemaVersion" TEXT NOT NULL,
  "preflightAlgorithmVersion" TEXT NOT NULL,
  "preflightAuthority" TEXT NOT NULL,
  "scopeIntentHash" TEXT NOT NULL,
  "realizationIntentHash" TEXT NOT NULL,
  "preflightHash" TEXT NOT NULL,
  "canonicalRealizationJson" TEXT NOT NULL,
  "realizationHash" TEXT NOT NULL,
  "compilationHash" TEXT NOT NULL,
  "assuranceLevel" TEXT NOT NULL,
  "disposition" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityValidationGeneration_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityValidationGeneration_validationVersionId_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("validationVersionId", "qualityPlanRevisionId", "targetProjectId") REFERENCES "ValidationVersion" ("id", "qualityPlanRevisionId", "targetProjectId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityValidationGeneration_id_validationVersionId_key" ON "QualityValidationGeneration"("id", "validationVersionId");

-- Rebuild instead of ALTER so the active selector has the same composite
-- relation as the Prisma schema. Existing v1 rows are copied byte-for-byte
-- and deliberately retain a null selector.
CREATE TABLE "new_ValidationVersion" (
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
  "activeGenerationId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ValidationVersion_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityPlanRevision" ("id", "targetProjectId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ValidationVersion_activeGenerationId_id_fkey" FOREIGN KEY ("activeGenerationId", "id") REFERENCES "QualityValidationGeneration" ("id", "validationVersionId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ValidationVersion" (
  "id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "reuseOutcome",
  "canonicalAstJson", "canonicalHash", "realizationJson", "realizationHash", "compilationHash", "scenarioApprovedAt",
  "scenarioApprovedBy", "scenarioApprovalHash", "publishedAt", "activeGenerationId", "createdAt"
)
SELECT
  "id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "reuseOutcome",
  "canonicalAstJson", "canonicalHash", "realizationJson", "realizationHash", "compilationHash", "scenarioApprovedAt",
  "scenarioApprovedBy", "scenarioApprovalHash", "publishedAt", NULL, "createdAt"
FROM "ValidationVersion";
CREATE TEMP TABLE "_qvg_validation_copy_guard" ("ok" INTEGER NOT NULL CHECK ("ok" = 0));
INSERT INTO "_qvg_validation_copy_guard" ("ok")
SELECT 1
WHERE (SELECT COUNT(*) FROM "_qvg_legacy_validation_snapshot") <> (SELECT COUNT(*) FROM "new_ValidationVersion")
   OR EXISTS (
     SELECT * FROM "_qvg_legacy_validation_snapshot"
     EXCEPT
     SELECT
       "id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "reuseOutcome",
       "canonicalAstJson", "canonicalHash", "realizationJson", "realizationHash", "compilationHash", "scenarioApprovedAt",
       "scenarioApprovedBy", "scenarioApprovalHash", "publishedAt", "createdAt"
     FROM "new_ValidationVersion"
   )
   OR EXISTS (
     SELECT
       "id", "targetProjectId", "qualityPlanRevisionId", "validationIdentity", "version", "status", "reuseOutcome",
       "canonicalAstJson", "canonicalHash", "realizationJson", "realizationHash", "compilationHash", "scenarioApprovedAt",
       "scenarioApprovedBy", "scenarioApprovalHash", "publishedAt", "createdAt"
     FROM "new_ValidationVersion"
     EXCEPT SELECT * FROM "_qvg_legacy_validation_snapshot"
   );
DROP TABLE "_qvg_validation_copy_guard";
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

CREATE UNIQUE INDEX "QualityValidationGeneration_generationKey_key" ON "QualityValidationGeneration"("generationKey");
CREATE UNIQUE INDEX "QualityValidationGeneration_id_validationVersionId_qualityPlanRevisionId_targetProjectId_key"
  ON "QualityValidationGeneration"("id", "validationVersionId", "qualityPlanRevisionId", "targetProjectId");
CREATE INDEX "QualityValidationGeneration_targetProjectId_qualityPlanRevisionId_validationVersionId_idx" ON "QualityValidationGeneration"("targetProjectId", "qualityPlanRevisionId", "validationVersionId");
CREATE INDEX "QualityValidationGeneration_validationVersionId_disposition_idx" ON "QualityValidationGeneration"("validationVersionId", "disposition");

-- Reserved deterministic legacy namespace. These rows are historical
-- descriptors only; activeGenerationId deliberately remains null.
INSERT INTO "QualityValidationGeneration" (
  "id", "generationKey", "targetProjectId", "qualityPlanRevisionId", "validationVersionId", "artifactSchemaVersion",
  "preflightAlgorithmVersion", "preflightAuthority", "scopeIntentHash", "realizationIntentHash", "preflightHash",
  "canonicalRealizationJson", "realizationHash", "compilationHash", "assuranceLevel", "disposition", "createdAt"
)
SELECT
  'legacy:v1:generation:' || p."id",
  'legacy:v1:generation:' || p."id",
  p."targetProjectId", p."qualityPlanRevisionId", p."validationVersionId", 'appraise.quality-validation-generation/legacy-v1',
  p."preflightAlgorithmVersion", p."preflightAuthority", p."scopeIntentHash", p."realizationIntentHash", p."preflightHash",
  p."runtimeInputJson", p."runtimeInputHash", COALESCE(v."compilationHash", ''), 'LEGACY_UNSPECIFIED', 'RETIRED_UNSUPPORTED', p."createdAt"
FROM "QualityValidationPublication" p
JOIN "ValidationVersion" v ON v."id" = p."validationVersionId" AND v."qualityPlanRevisionId" = p."qualityPlanRevisionId";

CREATE TABLE "new_QualityValidationPublication" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "generationId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "targetFingerprint" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "validationVersionId" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "operationHash" TEXT NOT NULL,
  "phase" TEXT NOT NULL DEFAULT 'review_ready',
  "preflightAlgorithmVersion" TEXT NOT NULL DEFAULT 'appraise.quality-assessment-preflight/v2',
  "preflightAuthority" TEXT NOT NULL DEFAULT 'appraisejs:quality-validation-publication:v2',
  "scopeIntentHash" TEXT NOT NULL DEFAULT '',
  "realizationIntentHash" TEXT NOT NULL DEFAULT '',
  "preflightHash" TEXT NOT NULL DEFAULT '',
  "preflightDisposition" TEXT NOT NULL DEFAULT 'ACTIVE',
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
  CONSTRAINT "QualityValidationPublication_validationVersionId_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("validationVersionId", "qualityPlanRevisionId", "targetProjectId") REFERENCES "ValidationVersion" ("id", "qualityPlanRevisionId", "targetProjectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityValidationPublication_generationId_validationVersionId_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("generationId", "validationVersionId", "qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityValidationGeneration" ("id", "validationVersionId", "qualityPlanRevisionId", "targetProjectId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_QualityValidationPublication" (
  "id", "generationId", "targetProjectId", "targetFingerprint", "qualityPlanRevisionId", "validationVersionId", "idempotencyKey",
  "operationHash", "phase", "preflightAlgorithmVersion", "preflightAuthority", "scopeIntentHash", "realizationIntentHash",
  "preflightHash", "preflightDisposition", "expectedRevisionHash", "validationHash", "validationContent", "reviewHash",
  "reviewContent", "astId", "astHash", "contextHash", "previewHash", "receiptHash", "projectionHash", "projectionJson",
  "validationProjectionJson", "runtimeInputHash", "runtimeInputJson", "failure", "createdAt", "updatedAt"
)
SELECT
  p."id", 'legacy:v1:generation:' || p."id", p."targetProjectId", p."targetFingerprint", p."qualityPlanRevisionId",
  p."validationVersionId", p."idempotencyKey", p."operationHash", p."phase", p."preflightAlgorithmVersion", p."preflightAuthority",
  p."scopeIntentHash", p."realizationIntentHash", p."preflightHash", p."preflightDisposition", p."expectedRevisionHash",
  p."validationHash", p."validationContent", p."reviewHash", p."reviewContent", p."astId", p."astHash", p."contextHash",
  p."previewHash", p."receiptHash", p."projectionHash", p."projectionJson", p."validationProjectionJson", p."runtimeInputHash",
  p."runtimeInputJson", p."failure", p."createdAt", p."updatedAt"
FROM "QualityValidationPublication" p;

CREATE TEMP TABLE "_qvg_copy_guard" ("ok" INTEGER NOT NULL CHECK ("ok" = 0));
INSERT INTO "_qvg_copy_guard" ("ok")
SELECT 1
WHERE (SELECT COUNT(*) FROM "_qvg_legacy_publication_snapshot") <> (SELECT COUNT(*) FROM "new_QualityValidationPublication")
   OR EXISTS (
     SELECT * FROM "_qvg_legacy_publication_snapshot"
     EXCEPT
     SELECT "id", "targetProjectId", "targetFingerprint", "qualityPlanRevisionId", "validationVersionId", "idempotencyKey",
       "operationHash", "phase", "preflightAlgorithmVersion", "preflightAuthority", "scopeIntentHash", "realizationIntentHash",
       "preflightHash", "preflightDisposition", "expectedRevisionHash", "validationHash", "validationContent", "reviewHash",
       "reviewContent", "astId", "astHash", "contextHash", "previewHash", "receiptHash", "projectionHash", "projectionJson",
       "validationProjectionJson", "runtimeInputHash", "runtimeInputJson", "failure", "createdAt", "updatedAt"
     FROM "new_QualityValidationPublication"
   )
   OR EXISTS (
     SELECT "id", "targetProjectId", "targetFingerprint", "qualityPlanRevisionId", "validationVersionId", "idempotencyKey",
       "operationHash", "phase", "preflightAlgorithmVersion", "preflightAuthority", "scopeIntentHash", "realizationIntentHash",
       "preflightHash", "preflightDisposition", "expectedRevisionHash", "validationHash", "validationContent", "reviewHash",
       "reviewContent", "astId", "astHash", "contextHash", "previewHash", "receiptHash", "projectionHash", "projectionJson",
       "validationProjectionJson", "runtimeInputHash", "runtimeInputJson", "failure", "createdAt", "updatedAt"
     FROM "new_QualityValidationPublication"
     EXCEPT SELECT * FROM "_qvg_legacy_publication_snapshot"
   );
DROP TABLE "_qvg_copy_guard";
DROP TABLE "QualityValidationPublication";
ALTER TABLE "new_QualityValidationPublication" RENAME TO "QualityValidationPublication";
CREATE UNIQUE INDEX "QualityValidationPublication_generationId_key" ON "QualityValidationPublication"("generationId");
CREATE UNIQUE INDEX "QualityValidationPublication_generationId_validationVersionId_qualityPlanRevisionId_targetProjectId_key"
  ON "QualityValidationPublication"("generationId", "validationVersionId", "qualityPlanRevisionId", "targetProjectId");
CREATE UNIQUE INDEX "QualityValidationPublication_id_generationId_validationVersionId_qualityPlanRevisionId_targetProjectId_key"
  ON "QualityValidationPublication"("id", "generationId", "validationVersionId", "qualityPlanRevisionId", "targetProjectId");
CREATE UNIQUE INDEX "QualityValidationPublication_operationHash_key" ON "QualityValidationPublication"("operationHash");
CREATE INDEX "QualityValidationPublication_targetProjectId_phase_idx" ON "QualityValidationPublication"("targetProjectId", "phase");
CREATE INDEX "QualityValidationPublication_preflightAlgorithmVersion_preflightDisposition_idx" ON "QualityValidationPublication"("preflightAlgorithmVersion", "preflightDisposition");
CREATE INDEX "QualityValidationPublication_qualityPlanRevisionId_validationVersionId_idx" ON "QualityValidationPublication"("qualityPlanRevisionId", "validationVersionId");

CREATE TABLE "new_QualityValidationExtensionReview" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "publicationId" TEXT NOT NULL,
  "extensionId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "compiledHash" TEXT NOT NULL,
  "artifactHash" TEXT NOT NULL,
  "artifactJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityValidationExtensionReview_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "QualityValidationPublication" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_QualityValidationExtensionReview" ("id", "publicationId", "extensionId", "version", "sourceHash", "compiledHash", "artifactHash", "artifactJson", "createdAt")
SELECT "id", "publicationId", "extensionId", "version", "sourceHash", "compiledHash", "artifactHash", "artifactJson", "createdAt"
FROM "QualityValidationExtensionReview";
DROP TABLE "QualityValidationExtensionReview";
ALTER TABLE "new_QualityValidationExtensionReview" RENAME TO "QualityValidationExtensionReview";
CREATE UNIQUE INDEX "QualityValidationExtensionReview_publicationId_extensionId_version_key"
  ON "QualityValidationExtensionReview"("publicationId", "extensionId", "version");

CREATE TABLE "QualityValidationPublicationCommandReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetProjectId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "generationKey" TEXT NOT NULL,
  "operationHash" TEXT NOT NULL,
  "publicationId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityValidationPublicationCommandReceipt_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QualityValidationPublicationCommandReceipt_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "QualityValidationPublication" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QualityValidationPublicationCommandReceipt_targetProjectId_idempotencyKey_key" ON "QualityValidationPublicationCommandReceipt"("targetProjectId", "idempotencyKey");
CREATE INDEX "QualityValidationPublicationCommandReceipt_generationKey_operationHash_idx" ON "QualityValidationPublicationCommandReceipt"("generationKey", "operationHash");

-- Artifact bytes are append-only. Command receipts are separately mutable only
-- through their initial insertion; no consumer can rewrite a sealed artifact.
CREATE TRIGGER "QualityValidationGeneration_no_update" BEFORE UPDATE ON "QualityValidationGeneration"
BEGIN SELECT RAISE(ABORT, 'quality validation generations are immutable'); END;
CREATE TRIGGER "QualityValidationGeneration_no_delete" BEFORE DELETE ON "QualityValidationGeneration"
BEGIN SELECT RAISE(ABORT, 'quality validation generations are immutable'); END;
CREATE TRIGGER "QualityValidationPublication_no_update" BEFORE UPDATE ON "QualityValidationPublication"
BEGIN SELECT RAISE(ABORT, 'quality validation publications are immutable'); END;
CREATE TRIGGER "QualityValidationPublication_no_delete" BEFORE DELETE ON "QualityValidationPublication"
BEGIN SELECT RAISE(ABORT, 'quality validation publications are immutable'); END;
CREATE TRIGGER "QualityValidationExtensionReview_no_update" BEFORE UPDATE ON "QualityValidationExtensionReview"
BEGIN SELECT RAISE(ABORT, 'quality validation extension reviews are immutable'); END;
CREATE TRIGGER "QualityValidationExtensionReview_no_delete" BEFORE DELETE ON "QualityValidationExtensionReview"
BEGIN SELECT RAISE(ABORT, 'quality validation extension reviews are immutable'); END;

-- Exact generation/publication selection is durable at every managed-run and
-- evidence boundary. Rebuild both consumers so the composite foreign keys in
-- schema.prisma are physical SQLite constraints, rather than nullable columns
-- guarded only by application code. Legacy tuples stay all-null.
CREATE TEMP TABLE "_qvg_legacy_binding_snapshot" AS
SELECT
  "id", "assessmentRunId", "validationVersionId", "resultMatrixCell", "testRunId", "runtimeInputHash",
  "terminalOutcome", "terminalizedAt", "evidenceReceiptId", "version", "createdAt", "updatedAt"
FROM "AssessmentRunBinding";
CREATE TEMP TABLE "_qvg_legacy_evidence_snapshot" AS
SELECT
  "id", "targetProjectId", "qualityPlanRevisionId", "assessmentId", "validationVersionId",
  "evaluationSubjectRevisionId", "resultMatrixCell", "assuranceLevel", "outcome", "runtimeInputHash",
  "environmentSnapshotHash", "browserSnapshotHash", "dataProvenanceHash", "outputHash", "reportHash",
  "logHash", "traceHash", "receiptHash", "sealedAt"
FROM "EvidenceReceipt";

CREATE TABLE "AssessmentRunPublicationCheckpoint" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentRunId" TEXT NOT NULL,
  "targetProjectId" TEXT NOT NULL,
  "qualityPlanRevisionId" TEXT NOT NULL,
  "validationVersionId" TEXT NOT NULL,
  "generationId" TEXT NOT NULL,
  "publicationId" TEXT NOT NULL,
  "publicationOperationHash" TEXT NOT NULL,
  "runtimeInputHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentRunPublicationCheckpoint_assessmentRunId_targetProjectId_qualityPlanRevisionId_fkey" FOREIGN KEY ("assessmentRunId", "targetProjectId", "qualityPlanRevisionId") REFERENCES "AssessmentRun" ("id", "targetProjectId", "qualityPlanRevisionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRunPublicationCheckpoint_validationVersionId_fkey" FOREIGN KEY ("validationVersionId") REFERENCES "ValidationVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRunPublicationCheckpoint_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "QualityValidationGeneration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRunPublicationCheckpoint_publicationId_generationId_validationVersionId_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("publicationId", "generationId", "validationVersionId", "qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityValidationPublication" ("id", "generationId", "validationVersionId", "qualityPlanRevisionId", "targetProjectId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssessmentRunPublicationCheckpoint_assessmentRunId_validationVersionId_key" ON "AssessmentRunPublicationCheckpoint"("assessmentRunId", "validationVersionId");
CREATE UNIQUE INDEX "AssessmentRunPublicationCheckpoint_assessmentRunId_validationVersionId_generationId_publicationId_key" ON "AssessmentRunPublicationCheckpoint"("assessmentRunId", "validationVersionId", "generationId", "publicationId");
CREATE INDEX "AssessmentRunPublicationCheckpoint_generationId_publicationId_idx" ON "AssessmentRunPublicationCheckpoint"("generationId", "publicationId");

CREATE TABLE "new_AssessmentRunBinding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assessmentRunId" TEXT NOT NULL,
  "targetProjectId" TEXT,
  "qualityPlanRevisionId" TEXT,
  "validationVersionId" TEXT NOT NULL,
  "resultMatrixCell" TEXT NOT NULL,
  "testRunId" TEXT NOT NULL,
  "runtimeInputHash" TEXT NOT NULL,
  "generationId" TEXT,
  "publicationId" TEXT,
  "publicationOperationHash" TEXT,
  "terminalOutcome" TEXT,
  "terminalizedAt" DATETIME,
  "evidenceReceiptId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AssessmentRunBinding_assessmentRunId_fkey" FOREIGN KEY ("assessmentRunId") REFERENCES "AssessmentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRunBinding_validationVersionId_fkey" FOREIGN KEY ("validationVersionId") REFERENCES "ValidationVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRunBinding_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRunBinding_evidenceReceiptId_fkey" FOREIGN KEY ("evidenceReceiptId") REFERENCES "EvidenceReceipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRunBinding_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "QualityValidationGeneration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRunBinding_publicationId_generationId_validationVersionId_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("publicationId", "generationId", "validationVersionId", "qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityValidationPublication" ("id", "generationId", "validationVersionId", "qualityPlanRevisionId", "targetProjectId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentRunBinding_checkpoint_fkey" FOREIGN KEY ("assessmentRunId", "validationVersionId", "generationId", "publicationId") REFERENCES "AssessmentRunPublicationCheckpoint" ("assessmentRunId", "validationVersionId", "generationId", "publicationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentRunBinding" (
  "id", "assessmentRunId", "targetProjectId", "qualityPlanRevisionId", "validationVersionId", "resultMatrixCell", "testRunId", "runtimeInputHash",
  "generationId", "publicationId", "publicationOperationHash", "terminalOutcome", "terminalizedAt", "evidenceReceiptId", "version", "createdAt", "updatedAt"
)
SELECT
  "id", "assessmentRunId", NULL, NULL, "validationVersionId", "resultMatrixCell", "testRunId", "runtimeInputHash",
  NULL, NULL, NULL, "terminalOutcome", "terminalizedAt", "evidenceReceiptId", "version", "createdAt", "updatedAt"
FROM "AssessmentRunBinding";
CREATE TEMP TABLE "_qvg_binding_copy_guard" ("ok" INTEGER NOT NULL CHECK ("ok" = 0));
INSERT INTO "_qvg_binding_copy_guard" ("ok")
SELECT 1
WHERE (SELECT COUNT(*) FROM "_qvg_legacy_binding_snapshot") <> (SELECT COUNT(*) FROM "new_AssessmentRunBinding")
   OR EXISTS (
     SELECT * FROM "_qvg_legacy_binding_snapshot"
     EXCEPT
     SELECT "id", "assessmentRunId", "validationVersionId", "resultMatrixCell", "testRunId", "runtimeInputHash", "terminalOutcome", "terminalizedAt", "evidenceReceiptId", "version", "createdAt", "updatedAt" FROM "new_AssessmentRunBinding"
   )
   OR EXISTS (
     SELECT "id", "assessmentRunId", "validationVersionId", "resultMatrixCell", "testRunId", "runtimeInputHash", "terminalOutcome", "terminalizedAt", "evidenceReceiptId", "version", "createdAt", "updatedAt" FROM "new_AssessmentRunBinding"
     EXCEPT SELECT * FROM "_qvg_legacy_binding_snapshot"
   );
DROP TABLE "_qvg_binding_copy_guard";
DROP TABLE "AssessmentRunBinding";
ALTER TABLE "new_AssessmentRunBinding" RENAME TO "AssessmentRunBinding";
CREATE UNIQUE INDEX "AssessmentRunBinding_assessmentRunId_validationVersionId_resultMatrixCell_key" ON "AssessmentRunBinding"("assessmentRunId", "validationVersionId", "resultMatrixCell");
CREATE UNIQUE INDEX "AssessmentRunBinding_testRunId_key" ON "AssessmentRunBinding"("testRunId");
CREATE INDEX "AssessmentRunBinding_assessmentRunId_terminalizedAt_idx" ON "AssessmentRunBinding"("assessmentRunId", "terminalizedAt");
CREATE INDEX "AssessmentRunBinding_validationVersionId_idx" ON "AssessmentRunBinding"("validationVersionId");

CREATE TABLE "new_EvidenceReceipt" (
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
  "generationId" TEXT,
  "publicationId" TEXT,
  "publicationOperationHash" TEXT,
  "publicationAuthority" TEXT,
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
  CONSTRAINT "EvidenceReceipt_evaluationSubjectRevisionId_fkey" FOREIGN KEY ("evaluationSubjectRevisionId") REFERENCES "EvaluationSubjectRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EvidenceReceipt_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "QualityValidationGeneration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EvidenceReceipt_publicationId_generationId_validationVersionId_qualityPlanRevisionId_targetProjectId_fkey" FOREIGN KEY ("publicationId", "generationId", "validationVersionId", "qualityPlanRevisionId", "targetProjectId") REFERENCES "QualityValidationPublication" ("id", "generationId", "validationVersionId", "qualityPlanRevisionId", "targetProjectId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EvidenceReceipt" (
  "id", "targetProjectId", "qualityPlanRevisionId", "assessmentId", "validationVersionId", "evaluationSubjectRevisionId", "resultMatrixCell", "assuranceLevel", "outcome", "runtimeInputHash",
  "generationId", "publicationId", "publicationOperationHash", "publicationAuthority", "environmentSnapshotHash", "browserSnapshotHash", "dataProvenanceHash", "outputHash", "reportHash", "logHash", "traceHash", "receiptHash", "sealedAt"
)
SELECT
  "id", "targetProjectId", "qualityPlanRevisionId", "assessmentId", "validationVersionId", "evaluationSubjectRevisionId", "resultMatrixCell", "assuranceLevel", "outcome", "runtimeInputHash",
  NULL, NULL, NULL, NULL, "environmentSnapshotHash", "browserSnapshotHash", "dataProvenanceHash", "outputHash", "reportHash", "logHash", "traceHash", "receiptHash", "sealedAt"
FROM "EvidenceReceipt";
CREATE TEMP TABLE "_qvg_evidence_copy_guard" ("ok" INTEGER NOT NULL CHECK ("ok" = 0));
INSERT INTO "_qvg_evidence_copy_guard" ("ok")
SELECT 1
WHERE (SELECT COUNT(*) FROM "_qvg_legacy_evidence_snapshot") <> (SELECT COUNT(*) FROM "new_EvidenceReceipt")
   OR EXISTS (
     SELECT * FROM "_qvg_legacy_evidence_snapshot"
     EXCEPT
     SELECT "id", "targetProjectId", "qualityPlanRevisionId", "assessmentId", "validationVersionId", "evaluationSubjectRevisionId", "resultMatrixCell", "assuranceLevel", "outcome", "runtimeInputHash", "environmentSnapshotHash", "browserSnapshotHash", "dataProvenanceHash", "outputHash", "reportHash", "logHash", "traceHash", "receiptHash", "sealedAt" FROM "new_EvidenceReceipt"
   )
   OR EXISTS (
     SELECT "id", "targetProjectId", "qualityPlanRevisionId", "assessmentId", "validationVersionId", "evaluationSubjectRevisionId", "resultMatrixCell", "assuranceLevel", "outcome", "runtimeInputHash", "environmentSnapshotHash", "browserSnapshotHash", "dataProvenanceHash", "outputHash", "reportHash", "logHash", "traceHash", "receiptHash", "sealedAt" FROM "new_EvidenceReceipt"
     EXCEPT SELECT * FROM "_qvg_legacy_evidence_snapshot"
   );
DROP TABLE "_qvg_evidence_copy_guard";
DROP TABLE "EvidenceReceipt";
ALTER TABLE "new_EvidenceReceipt" RENAME TO "EvidenceReceipt";
CREATE UNIQUE INDEX "EvidenceReceipt_receiptHash_key" ON "EvidenceReceipt"("receiptHash");
CREATE INDEX "EvidenceReceipt_targetProjectId_validationVersionId_evaluationSubjectRevisionId_resultMatrixCell_runtimeInputHash_idx" ON "EvidenceReceipt"("targetProjectId", "validationVersionId", "evaluationSubjectRevisionId", "resultMatrixCell", "runtimeInputHash");
CREATE INDEX "EvidenceReceipt_targetProjectId_sealedAt_idx" ON "EvidenceReceipt"("targetProjectId", "sealedAt");
CREATE INDEX "EvidenceReceipt_assessmentId_idx" ON "EvidenceReceipt"("assessmentId");

CREATE TRIGGER "AssessmentRunBinding_publication_tuple_insert"
BEFORE INSERT ON "AssessmentRunBinding"
WHEN (NEW."generationId" IS NULL) <> (NEW."publicationId" IS NULL)
  OR (NEW."generationId" IS NULL) <> (NEW."publicationOperationHash" IS NULL)
  OR (NEW."generationId" IS NULL) <> (NEW."targetProjectId" IS NULL)
  OR (NEW."generationId" IS NULL) <> (NEW."qualityPlanRevisionId" IS NULL)
  OR (NEW."generationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "QualityValidationGeneration" g
    JOIN "QualityValidationPublication" p ON p."id" = NEW."publicationId" AND p."generationId" = g."id"
    WHERE g."id" = NEW."generationId"
      AND g."validationVersionId" = NEW."validationVersionId"
      AND g."targetProjectId" = NEW."targetProjectId"
      AND g."qualityPlanRevisionId" = NEW."qualityPlanRevisionId"
      AND p."validationVersionId" = NEW."validationVersionId"
      AND p."targetProjectId" = NEW."targetProjectId"
      AND p."qualityPlanRevisionId" = NEW."qualityPlanRevisionId"
      AND p."operationHash" = NEW."publicationOperationHash"
      AND p."runtimeInputHash" = NEW."runtimeInputHash"
  ))
  OR (NEW."generationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "AssessmentRunPublicationCheckpoint" checkpoint
    WHERE checkpoint."assessmentRunId" = NEW."assessmentRunId"
      AND checkpoint."validationVersionId" = NEW."validationVersionId"
      AND checkpoint."generationId" = NEW."generationId"
      AND checkpoint."publicationId" = NEW."publicationId"
      AND checkpoint."targetProjectId" = NEW."targetProjectId"
      AND checkpoint."qualityPlanRevisionId" = NEW."qualityPlanRevisionId"
  ))
BEGIN SELECT RAISE(ABORT, 'assessment binding publication tuple is invalid'); END;
CREATE TRIGGER "AssessmentRunBinding_publication_tuple_update"
BEFORE UPDATE OF "generationId", "publicationId", "publicationOperationHash", "targetProjectId", "qualityPlanRevisionId", "runtimeInputHash" ON "AssessmentRunBinding"
WHEN (NEW."generationId" IS NULL) <> (NEW."publicationId" IS NULL)
  OR (NEW."generationId" IS NULL) <> (NEW."publicationOperationHash" IS NULL)
  OR (NEW."generationId" IS NULL) <> (NEW."targetProjectId" IS NULL)
  OR (NEW."generationId" IS NULL) <> (NEW."qualityPlanRevisionId" IS NULL)
  OR (OLD."generationId" IS NOT NULL AND (
    NEW."generationId" IS NOT OLD."generationId" OR NEW."publicationId" IS NOT OLD."publicationId" OR NEW."publicationOperationHash" IS NOT OLD."publicationOperationHash"
    OR NEW."targetProjectId" IS NOT OLD."targetProjectId" OR NEW."qualityPlanRevisionId" IS NOT OLD."qualityPlanRevisionId" OR NEW."runtimeInputHash" IS NOT OLD."runtimeInputHash"
  ))
  OR (NEW."generationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "QualityValidationGeneration" g
    JOIN "QualityValidationPublication" p ON p."id" = NEW."publicationId" AND p."generationId" = g."id"
    WHERE g."id" = NEW."generationId" AND g."validationVersionId" = NEW."validationVersionId"
      AND g."targetProjectId" = NEW."targetProjectId" AND g."qualityPlanRevisionId" = NEW."qualityPlanRevisionId"
      AND p."validationVersionId" = NEW."validationVersionId" AND p."targetProjectId" = NEW."targetProjectId"
      AND p."qualityPlanRevisionId" = NEW."qualityPlanRevisionId" AND p."operationHash" = NEW."publicationOperationHash"
      AND p."runtimeInputHash" = NEW."runtimeInputHash"
  ))
  OR (NEW."generationId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "AssessmentRunPublicationCheckpoint" checkpoint
    WHERE checkpoint."assessmentRunId" = NEW."assessmentRunId"
      AND checkpoint."validationVersionId" = NEW."validationVersionId"
      AND checkpoint."generationId" = NEW."generationId"
      AND checkpoint."publicationId" = NEW."publicationId"
      AND checkpoint."targetProjectId" = NEW."targetProjectId"
      AND checkpoint."qualityPlanRevisionId" = NEW."qualityPlanRevisionId"
  ))
BEGIN SELECT RAISE(ABORT, 'assessment binding publication tuple is immutable'); END;
CREATE TRIGGER "EvidenceReceipt_publication_tuple_insert"
BEFORE INSERT ON "EvidenceReceipt"
WHEN (NEW."generationId" IS NULL) <> (NEW."publicationId" IS NULL)
  OR (NEW."generationId" IS NULL) <> (NEW."publicationOperationHash" IS NULL)
  OR (NEW."generationId" IS NULL) <> (NEW."publicationAuthority" IS NULL)
  OR (NEW."generationId" IS NOT NULL AND (NEW."publicationAuthority" = '' OR NOT EXISTS (
    SELECT 1 FROM "QualityValidationGeneration" g
    JOIN "QualityValidationPublication" p ON p."id" = NEW."publicationId" AND p."generationId" = g."id"
    WHERE g."id" = NEW."generationId" AND g."validationVersionId" = NEW."validationVersionId"
      AND g."targetProjectId" = NEW."targetProjectId" AND g."qualityPlanRevisionId" = NEW."qualityPlanRevisionId"
      AND p."validationVersionId" = NEW."validationVersionId" AND p."targetProjectId" = NEW."targetProjectId"
      AND p."qualityPlanRevisionId" = NEW."qualityPlanRevisionId" AND p."operationHash" = NEW."publicationOperationHash"
      AND p."runtimeInputHash" = NEW."runtimeInputHash"
      AND p."preflightAuthority" = NEW."publicationAuthority"
  )))
BEGIN SELECT RAISE(ABORT, 'evidence publication tuple is invalid'); END;
CREATE TRIGGER "EvidenceReceipt_publication_tuple_update"
BEFORE UPDATE OF "generationId", "publicationId", "publicationOperationHash", "publicationAuthority", "runtimeInputHash" ON "EvidenceReceipt"
WHEN (NEW."generationId" IS NULL) <> (NEW."publicationId" IS NULL)
  OR (NEW."generationId" IS NULL) <> (NEW."publicationOperationHash" IS NULL)
  OR (NEW."generationId" IS NULL) <> (NEW."publicationAuthority" IS NULL)
  OR (OLD."generationId" IS NOT NULL AND (
    NEW."generationId" IS NOT OLD."generationId" OR NEW."publicationId" IS NOT OLD."publicationId"
    OR NEW."publicationOperationHash" IS NOT OLD."publicationOperationHash" OR NEW."publicationAuthority" IS NOT OLD."publicationAuthority"
    OR NEW."runtimeInputHash" IS NOT OLD."runtimeInputHash"
  ))
  OR (NEW."generationId" IS NOT NULL AND (NEW."publicationAuthority" = '' OR NOT EXISTS (
    SELECT 1 FROM "QualityValidationGeneration" g
    JOIN "QualityValidationPublication" p ON p."id" = NEW."publicationId" AND p."generationId" = g."id"
    WHERE g."id" = NEW."generationId" AND g."validationVersionId" = NEW."validationVersionId"
      AND g."targetProjectId" = NEW."targetProjectId" AND g."qualityPlanRevisionId" = NEW."qualityPlanRevisionId"
      AND p."validationVersionId" = NEW."validationVersionId" AND p."targetProjectId" = NEW."targetProjectId"
      AND p."qualityPlanRevisionId" = NEW."qualityPlanRevisionId" AND p."operationHash" = NEW."publicationOperationHash"
      AND p."runtimeInputHash" = NEW."runtimeInputHash" AND p."preflightAuthority" = NEW."publicationAuthority"
  )))
BEGIN SELECT RAISE(ABORT, 'evidence publication tuple is immutable'); END;
CREATE TRIGGER "AssessmentRunPublicationCheckpoint_tuple_insert"
BEFORE INSERT ON "AssessmentRunPublicationCheckpoint"
WHEN NOT EXISTS (
  SELECT 1 FROM "QualityValidationGeneration" g
  JOIN "QualityValidationPublication" p ON p."id" = NEW."publicationId" AND p."generationId" = g."id"
  WHERE g."id" = NEW."generationId" AND g."validationVersionId" = NEW."validationVersionId"
    AND g."targetProjectId" = NEW."targetProjectId" AND g."qualityPlanRevisionId" = NEW."qualityPlanRevisionId"
    AND p."validationVersionId" = NEW."validationVersionId" AND p."targetProjectId" = NEW."targetProjectId"
    AND p."qualityPlanRevisionId" = NEW."qualityPlanRevisionId" AND p."operationHash" = NEW."publicationOperationHash"
    AND p."runtimeInputHash" = NEW."runtimeInputHash"
)
BEGIN SELECT RAISE(ABORT, 'assessment publication checkpoint tuple is invalid'); END;
CREATE TRIGGER "AssessmentRunPublicationCheckpoint_no_update" BEFORE UPDATE ON "AssessmentRunPublicationCheckpoint"
BEGIN SELECT RAISE(ABORT, 'assessment publication checkpoints are immutable'); END;
CREATE TRIGGER "AssessmentRunPublicationCheckpoint_no_delete" BEFORE DELETE ON "AssessmentRunPublicationCheckpoint"
BEGIN SELECT RAISE(ABORT, 'assessment publication checkpoints are immutable'); END;

CREATE TEMP TABLE "_qvg_fk_guard" ("ok" INTEGER NOT NULL CHECK ("ok" = 0));
INSERT INTO "_qvg_fk_guard" ("ok") SELECT 1 WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check);
DROP TABLE "_qvg_fk_guard";
DROP TABLE "_qvg_legacy_publication_snapshot";
DROP TABLE "_qvg_legacy_validation_snapshot";
DROP TABLE "_qvg_legacy_binding_snapshot";
DROP TABLE "_qvg_legacy_evidence_snapshot";
PRAGMA foreign_keys=ON;
