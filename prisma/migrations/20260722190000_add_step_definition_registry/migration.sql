-- CreateTable
CREATE TABLE "StepDefinition" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "definitionJson" TEXT NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "humanProjectionHash" TEXT,
    "agentContractHash" TEXT,
    "executionHash" TEXT,
    "provenanceJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "deprecatedAt" DATETIME,
    PRIMARY KEY ("id", "version")
);

-- CreateTable
CREATE TABLE "StepDefinitionDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposedStepId" TEXT NOT NULL,
    "proposedVersion" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "draftJson" TEXT NOT NULL,
    "draftHash" TEXT NOT NULL,
    "validationReportJson" TEXT,
    "reviewedDraftHash" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StepHumanProjection" (
    "stepId" TEXT NOT NULL,
    "stepVersion" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "projectionJson" TEXT NOT NULL,
    "projectionHash" TEXT NOT NULL,
    PRIMARY KEY ("stepId", "stepVersion"),
    CONSTRAINT "StepHumanProjection_stepId_stepVersion_fkey" FOREIGN KEY ("stepId", "stepVersion") REFERENCES "StepDefinition" ("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StepExecutionBinding" (
    "stepId" TEXT NOT NULL,
    "stepVersion" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bindingJson" TEXT NOT NULL,
    "bindingHash" TEXT NOT NULL,
    PRIMARY KEY ("stepId", "stepVersion"),
    CONSTRAINT "StepExecutionBinding_stepId_stepVersion_fkey" FOREIGN KEY ("stepId", "stepVersion") REFERENCES "StepDefinition" ("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StepPublicationReceipt" (
    "stepId" TEXT NOT NULL,
    "stepVersion" TEXT NOT NULL,
    "receiptJson" TEXT NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "registryManifestHash" TEXT NOT NULL,
    "conformanceRunId" TEXT NOT NULL,
    "reviewAuthority" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("stepId", "stepVersion"),
    CONSTRAINT "StepPublicationReceipt_stepId_stepVersion_fkey" FOREIGN KEY ("stepId", "stepVersion") REFERENCES "StepDefinition" ("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StepDefinitionDeprecation" (
    "stepId" TEXT NOT NULL,
    "stepVersion" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "replacementStepId" TEXT,
    "replacementVersion" TEXT,
    "deprecatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("stepId", "stepVersion"),
    CONSTRAINT "StepDefinitionDeprecation_stepId_stepVersion_fkey" FOREIGN KEY ("stepId", "stepVersion") REFERENCES "StepDefinition" ("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StepCompatibilityReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "legacyKind" TEXT NOT NULL,
    "legacyValue" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "stepVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StepCompatibilityReference_stepId_stepVersion_fkey" FOREIGN KEY ("stepId", "stepVersion") REFERENCES "StepDefinition" ("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StepDefinition_status_title_idx" ON "StepDefinition"("status", "title");
CREATE INDEX "StepDefinitionDraft_proposedStepId_proposedVersion_idx" ON "StepDefinitionDraft"("proposedStepId", "proposedVersion");
CREATE UNIQUE INDEX "StepHumanProjection_signature_key" ON "StepHumanProjection"("signature");
CREATE INDEX "StepHumanProjection_groupId_idx" ON "StepHumanProjection"("groupId");
CREATE INDEX "StepExecutionBinding_kind_idx" ON "StepExecutionBinding"("kind");
CREATE UNIQUE INDEX "StepPublicationReceipt_receiptHash_key" ON "StepPublicationReceipt"("receiptHash");
CREATE UNIQUE INDEX "StepCompatibilityReference_legacyKind_legacyValue_key" ON "StepCompatibilityReference"("legacyKind", "legacyValue");
CREATE INDEX "StepCompatibilityReference_stepId_stepVersion_idx" ON "StepCompatibilityReference"("stepId", "stepVersion");
