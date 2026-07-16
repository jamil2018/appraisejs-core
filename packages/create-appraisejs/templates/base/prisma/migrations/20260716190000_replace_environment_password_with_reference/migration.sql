PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

CREATE TABLE "new_Environment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiBaseUrl" TEXT,
    "username" TEXT,
    "passwordEnvironmentVariable" TEXT,
    "credentialState" TEXT NOT NULL DEFAULT 'NONE',
    "legacyCredentialDetectedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetProjectId" TEXT,
    CONSTRAINT "Environment_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "TargetProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Environment" (
    "id", "name", "baseUrl", "apiBaseUrl", "username", "passwordEnvironmentVariable", "credentialState",
    "legacyCredentialDetectedAt", "createdAt", "updatedAt", "targetProjectId"
)
SELECT
    "id", "name", "baseUrl", "apiBaseUrl", "username", NULL,
    CASE WHEN "password" IS NOT NULL AND trim("password") <> '' THEN 'LEGACY_DISABLED' ELSE 'NONE' END,
    CASE WHEN "password" IS NOT NULL AND trim("password") <> '' THEN CURRENT_TIMESTAMP ELSE NULL END,
    "createdAt", "updatedAt", "targetProjectId"
FROM "Environment";

DROP TABLE "Environment";
ALTER TABLE "new_Environment" RENAME TO "Environment";
CREATE UNIQUE INDEX "Environment_targetProjectId_name_key" ON "Environment"("targetProjectId", "name");
COMMIT;

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
