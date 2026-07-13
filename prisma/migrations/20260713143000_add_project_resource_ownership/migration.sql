CREATE TABLE "ProjectResourceOwnership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "targetProjectId" TEXT,
    "origin" TEXT NOT NULL,
    "provenanceJson" TEXT NOT NULL DEFAULT '{}',
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectResourceOwnership_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ProjectResourceImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceOwnershipId" TEXT NOT NULL,
    "destinationProjectId" TEXT NOT NULL,
    "sharingMode" TEXT NOT NULL,
    "sourceContentHash" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "propagationPolicy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectResourceImport_sourceOwnershipId_fkey" FOREIGN KEY ("sourceOwnershipId") REFERENCES "ProjectResourceOwnership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectResourceImport_destinationProjectId_fkey" FOREIGN KEY ("destinationProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectResourceOwnership_entityType_entityId_key" ON "ProjectResourceOwnership"("entityType", "entityId");
CREATE INDEX "ProjectResourceOwnership_targetProjectId_entityType_idx" ON "ProjectResourceOwnership"("targetProjectId", "entityType");
CREATE INDEX "ProjectResourceOwnership_scope_entityType_idx" ON "ProjectResourceOwnership"("scope", "entityType");
CREATE UNIQUE INDEX "ProjectResourceImport_sourceOwnershipId_destinationProjectId_sharingMode_key" ON "ProjectResourceImport"("sourceOwnershipId", "destinationProjectId", "sharingMode");
CREATE INDEX "ProjectResourceImport_destinationProjectId_createdAt_idx" ON "ProjectResourceImport"("destinationProjectId", "createdAt");

-- Legacy rows are deliberately classified as system seed data only when they are present in the canonical database.
-- Ambiguous rows in imported databases remain unowned and therefore quarantined by the application read policy.
INSERT INTO "ProjectResourceOwnership" ("id", "entityType", "entityId", "scope", "origin", "contentHash", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'module', "id", 'system', 'legacy_seed', 'legacy:' || "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Module";
INSERT INTO "ProjectResourceOwnership" ("id", "entityType", "entityId", "scope", "origin", "contentHash", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'test-suite', "id", 'system', 'legacy_seed', 'legacy:' || "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "TestSuite";
INSERT INTO "ProjectResourceOwnership" ("id", "entityType", "entityId", "scope", "origin", "contentHash", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'test-case', "id", 'system', 'legacy_seed', 'legacy:' || "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "TestCase";
INSERT INTO "ProjectResourceOwnership" ("id", "entityType", "entityId", "scope", "origin", "contentHash", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'locator-group', "id", 'system', 'legacy_seed', 'legacy:' || "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "LocatorGroup";
INSERT INTO "ProjectResourceOwnership" ("id", "entityType", "entityId", "scope", "origin", "contentHash", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'locator', "id", 'system', 'legacy_seed', 'legacy:' || "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Locator";
INSERT INTO "ProjectResourceOwnership" ("id", "entityType", "entityId", "scope", "origin", "contentHash", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'environment', "id", 'system', 'legacy_seed', 'legacy:' || "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Environment";
INSERT INTO "ProjectResourceOwnership" ("id", "entityType", "entityId", "scope", "origin", "contentHash", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'tag', "id", 'system', 'legacy_seed', 'legacy:' || "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Tag";
INSERT INTO "ProjectResourceOwnership" ("id", "entityType", "entityId", "scope", "origin", "contentHash", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'template-step', "id", 'system', 'legacy_seed', 'legacy:' || "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "TemplateStep";
INSERT INTO "ProjectResourceOwnership" ("id", "entityType", "entityId", "scope", "origin", "contentHash", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'step-block', "id", 'system', 'legacy_seed', 'legacy:' || "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "StepBlock";
