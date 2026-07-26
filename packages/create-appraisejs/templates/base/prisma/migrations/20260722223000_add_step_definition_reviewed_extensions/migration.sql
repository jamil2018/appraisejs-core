CREATE TABLE "StepDefinitionDraftArtifact" (
    "draftId" TEXT NOT NULL PRIMARY KEY,
    "contractSource" TEXT NOT NULL,
    "handlerSource" TEXT NOT NULL,
    "examplesJson" TEXT NOT NULL,
    "manifestJson" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "compiledSource" TEXT,
    "compiledHash" TEXT,
    "diagnosticsJson" TEXT,
    "conformanceJson" TEXT,
    "conformanceHash" TEXT,
    "reviewedArtifactHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StepDefinitionDraftArtifact_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "StepDefinitionDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "StepReviewedExtension" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "exportName" TEXT NOT NULL,
    "runtime" TEXT NOT NULL,
    "capabilitiesJson" TEXT NOT NULL,
    "contractSource" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "compiledSource" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "compiledHash" TEXT NOT NULL,
    "conformanceJson" TEXT NOT NULL,
    "conformanceHash" TEXT NOT NULL,
    "artifactHash" TEXT NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id", "version")
);

CREATE UNIQUE INDEX "StepReviewedExtension_artifactHash_key" ON "StepReviewedExtension"("artifactHash");
CREATE INDEX "StepReviewedExtension_sourceHash_compiledHash_idx" ON "StepReviewedExtension"("sourceHash", "compiledHash");
