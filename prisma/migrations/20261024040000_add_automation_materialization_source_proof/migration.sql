-- Historical materializations remain unmarked; this migration never adopts old receipts.
ALTER TABLE "QualityJourneyAutomationMaterialization"
  ADD COLUMN "sourceProofVersion" TEXT
  CHECK (
    "sourceProofVersion" IS NULL OR (
      "sourceProofVersion" = 'M06_MATERIALIZATION_ARTIFACT_V1'
      AND "status" = 'MATERIALIZED'
      AND "suiteId" IS NOT NULL
      AND "testCaseId" IS NOT NULL
      AND "artifactRecordId" IS NOT NULL
    )
  );

CREATE TRIGGER "QualityJourneyAutomationMaterialization_source_proof_immutable"
BEFORE UPDATE ON "QualityJourneyAutomationMaterialization"
FOR EACH ROW
WHEN NEW."sourceProofVersion" IS NOT OLD."sourceProofVersion"
BEGIN
  SELECT RAISE(ABORT, 'Materialization source proof version is immutable');
END;

CREATE TABLE "QualityJourneyAutomationMaterializationSourceProof" (
  "materializationId" TEXT NOT NULL PRIMARY KEY,
  "expectedScopeHash" TEXT NOT NULL,
  "reconstructionVersion" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityJourneyAutomationMaterializationSourceProof_materialization_fkey"
    FOREIGN KEY ("materializationId")
    REFERENCES "QualityJourneyAutomationMaterialization" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "QualityJourneyAutomationMaterializationSourceProof_id_check"
    CHECK (LENGTH("materializationId") BETWEEN 1 AND 128
      AND "materializationId" NOT GLOB '*[^ -~]*'),
  CONSTRAINT "QualityJourneyAutomationMaterializationSourceProof_scope_hash_check"
    CHECK (LENGTH("expectedScopeHash") = 71
      AND SUBSTR("expectedScopeHash", 1, 7) = 'sha256:'
      AND SUBSTR("expectedScopeHash", 8) NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT "QualityJourneyAutomationMaterializationSourceProof_version_check"
    CHECK ("reconstructionVersion" = 'M06_MATERIALIZATION_ARTIFACT_V1')
);

CREATE TRIGGER "QualityJourneyAutomationMaterializationSourceProof_insert_source"
BEFORE INSERT ON "QualityJourneyAutomationMaterializationSourceProof"
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM "QualityJourneyAutomationMaterialization" AS materialization
  WHERE materialization."id" = NEW."materializationId"
    AND materialization."status" = 'MATERIALIZED'
    AND materialization."sourceProofVersion" = 'M06_MATERIALIZATION_ARTIFACT_V1'
    AND materialization."suiteId" IS NOT NULL
    AND materialization."testCaseId" IS NOT NULL
    AND materialization."artifactRecordId" IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'Materialization source proof requires an original marked success');
END;

CREATE TRIGGER "QualityJourneyAutomationMaterializationSourceProof_immutable_update"
BEFORE UPDATE ON "QualityJourneyAutomationMaterializationSourceProof"
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT, 'Materialization source proof is insert-only');
END;

CREATE TRIGGER "QualityJourneyAutomationMaterializationSourceProof_immutable_delete"
BEFORE DELETE ON "QualityJourneyAutomationMaterializationSourceProof"
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT, 'Materialization source proof is retained');
END;
